/**
 * Endnote section pipeline (#89).
 *
 * The viewer parsed `word/endnotes.xml` but never consumed it: the layout
 * chain had no endnote branch, so note bodies never reached any page. These
 * tests pin the new branch — collect refs → build content → render items —
 * on a synthetic document (no binary fixture dependency).
 */
import { describe, expect, test } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import {
  buildEndnoteContentMap,
  buildEndnoteRenderItems,
  collectEndnoteRefs,
  collectFootnoteRefs,
} from '../footnoteLayout';
import type { Measure } from '../../layout-engine/types';
import type { Document, Endnote } from '../../types/document';

const ENDNOTE_BODY_TEXT = '生成说明：本示例文档一键生成';

function endnoteDoc(): Document {
  return {
    package: {
      document: {
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [
                  { type: 'text', text: '详见尾注' },
                  { type: 'endnoteRef', id: 2 },
                ],
              },
            ],
          },
        ],
      },
      endnotes: [
        {
          type: 'endnote',
          id: 2,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'run', content: [{ type: 'endnoteRefMark' }] },
                { type: 'run', content: [{ type: 'text', text: ENDNOTE_BODY_TEXT }] },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as Document;
}

/** Stand-in measurer: 20px per paragraph, 0 for anything else. */
function stubMeasure(blocks: { kind: string }[]): Measure[] {
  return blocks.map((b) =>
    b.kind === 'paragraph'
      ? ({ kind: 'paragraph', totalHeight: 20, lines: [] } as unknown as Measure)
      : ({ kind: b.kind, totalHeight: 0 } as unknown as Measure)
  );
}

describe('endnote section pipeline (#89)', () => {
  test('body endnote refs are collected (footnote refs are not)', () => {
    const pmDoc = toProseDoc(endnoteDoc());
    const blocks = toFlowBlocks(pmDoc);
    const refs = collectEndnoteRefs(blocks);
    expect(refs.length).toBe(1);
    expect(refs[0].endnoteId).toBe(2);
    expect(collectFootnoteRefs(blocks)).toEqual([]);
  });

  test('content map + render items carry the note body in display order', () => {
    const doc = endnoteDoc();
    const pmDoc = toProseDoc(doc);
    const blocks = toFlowBlocks(pmDoc);
    const refs = collectEndnoteRefs(blocks);
    const contentMap = buildEndnoteContentMap(doc.package.endnotes as Endnote[], refs, 500, {
      measureBlocks: stubMeasure,
    });
    expect(contentMap.has(2)).toBe(true);
    const items = buildEndnoteRenderItems(refs, contentMap, doc);
    expect(items.length).toBe(1);
    expect(items[0].displayNumber).toBe('1');
    expect(items[0].text).toContain(ENDNOTE_BODY_TEXT);
  });

  test('separators and dangling references are skipped', () => {
    const doc = endnoteDoc();
    const separators = [
      { type: 'endnote', id: 0, noteType: 'separator', content: [] },
      { type: 'endnote', id: 1, noteType: 'continuationSeparator', content: [] },
    ] as unknown as Endnote[];
    const refs = [{ endnoteId: 999 }];
    const contentMap = buildEndnoteContentMap(
      [...(doc.package.endnotes as Endnote[]), ...separators],
      refs,
      500,
      { measureBlocks: stubMeasure }
    );
    expect(contentMap.size).toBe(0);
    expect(buildEndnoteRenderItems(refs, contentMap, doc)).toEqual([]);
  });

  test('no endnotes part yields no render items', () => {
    const doc = endnoteDoc();
    doc.package.endnotes = undefined;
    expect(buildEndnoteRenderItems([{ endnoteId: 2 }], new Map(), doc)).toEqual([]);
  });
});
