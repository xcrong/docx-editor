/**
 * Document-end endnote section painting (#89).
 *
 * Pins the DOM contract adapters rely on for cross-navigation:
 * - items carry `data-endnote-id`, the leading number run carries
 *   `data-endnote-backref` (click → scroll back to the body reference);
 * - body reference runs carry `data-endnote-ref` (click → scroll to the item).
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderEndnotesSection } from '../renderPage/endnotes';
import { renderTextRun } from '../renderParagraph/runs';
import { buildEndnoteContentMap } from '../../layout-bridge/footnoteLayout';
import type { FootnoteRenderItem } from '../renderPage/footnotes';
import type { FlowBlock, Measure, TextRun } from '../../layout-engine/types';
import type { Endnote } from '../../types/document';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const BODY_TEXT = '生成说明：尾注体在文档末尾渲染';

function stubMeasure(blocks: FlowBlock[]): Measure[] {
  return blocks.map((b) => {
    if (b.kind !== 'paragraph') {
      return { kind: b.kind, totalHeight: 0 } as unknown as Measure;
    }
    const runs = b.runs;
    const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
    const lastText = lastRun && lastRun.kind === 'text' ? (lastRun.text ?? '') : '';
    return {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: Math.max(0, runs.length - 1),
          toChar: lastText.length,
          width: 120,
          ascent: 9,
          descent: 3,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    } as unknown as Measure;
  });
}

function measuredItem(): { item: FootnoteRenderItem; ids: number[] } {
  const endnotes = [
    {
      type: 'endnote',
      id: 2,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'run', content: [{ type: 'endnoteRefMark' }] },
            { type: 'run', content: [{ type: 'text', text: BODY_TEXT }] },
          ],
        },
      ],
    },
  ] as unknown as Endnote[];
  const contentMap = buildEndnoteContentMap(endnotes, [{ endnoteId: 2 }], 500, {
    measureBlocks: stubMeasure,
  });
  const content = contentMap.get(2)!;
  return { item: { displayNumber: '1', text: BODY_TEXT, content }, ids: [2] };
}

function sectionContext() {
  return { pageNumber: 8, totalPages: 8, section: 'body' as const };
}

describe('renderEndnotesSection', () => {
  test('measured item renders under a data-endnote-id hook with body text', () => {
    const { item, ids } = measuredItem();
    const section = renderEndnotesSection([item], ids, sectionContext(), document, {
      contentWidth: 500,
      pageWidth: 700,
    });
    expect(section.classList.contains('layout-endnotes-section')).toBe(true);
    const hooked = section.querySelector('[data-endnote-id="2"]');
    expect(hooked).not.toBeNull();
    expect(hooked!.textContent ?? '').toContain(BODY_TEXT);
  });

  test('leading number run carries the backref hook', () => {
    const { item, ids } = measuredItem();
    const section = renderEndnotesSection([item], ids, sectionContext(), document, {
      contentWidth: 500,
      pageWidth: 700,
      refPmPos: new Map([[2, 42]]),
    });
    const backref = section.querySelector('[data-endnote-backref="2"]');
    expect(backref).not.toBeNull();
    expect(section.querySelector('[data-endnote-id="2"]')?.getAttribute('data-ref-pmpos')).toBe(
      '42'
    );
  });

  test('plain-text fallback item renders display number + text', () => {
    const item: FootnoteRenderItem = { displayNumber: '1', text: BODY_TEXT };
    const section = renderEndnotesSection([item], [2], sectionContext(), document, {
      contentWidth: 500,
      pageWidth: 700,
    });
    expect(section.querySelector('[data-endnote-id="2"]')!.textContent ?? '').toContain(BODY_TEXT);
    expect(section.querySelector('[data-endnote-backref="2"]')!.textContent).toBe('1');
  });
});

describe('renderTextRun endnote reference hook', () => {
  test('run with endnoteRefId is tagged for navigation without changing text', () => {
    const run = {
      kind: 'text',
      text: '1',
      superscript: true,
      endnoteRefId: 2,
      pmStart: 10,
      pmEnd: 11,
    } as TextRun;
    const el = renderTextRun(run, document);
    expect(el.textContent).toBe('1');
    expect(el.dataset.endnoteRef).toBe('2');
    expect(el.style.cursor).toBe('pointer');
  });

  test('ordinary runs carry no endnote hook', () => {
    const run = { kind: 'text', text: 'x', pmStart: 1, pmEnd: 2 } as TextRun;
    const el = renderTextRun(run, document);
    expect(el.dataset.endnoteRef).toBeUndefined();
  });
});
