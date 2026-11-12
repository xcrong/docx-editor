/**
 * Tracked-change DOM-node profile (editor-performance investigation).
 *
 * Quantifies the painter cost of 100+ distinct tracked changes: one PM text
 * node → one flow run → one painted `<span>`, each carrying its own
 * `data-revision-id`. Also pins the coalescing invariant the merge task
 * depends on: adjacent same-triple (author + revisionId + date) insertions
 * are already joined by ProseMirror into a single text node, so the painter
 * emits a single span — only distinct revisionIds multiply DOM nodes, and
 * those must stay separate (per-change accept/reject + sidebar anchoring).
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { singletonManager } from '../../prosemirror/schema';
import { paragraphToRuns } from '../../layout-bridge/toFlowBlocks/runs';
import { renderTextRun } from '../renderParagraph/runs';
import type { TextRun } from '../../layout-engine/types';

const schema = singletonManager.getSchema();

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function insertionMark(revisionId: number, author = 'Perf Author') {
  return schema.marks.insertion.create({ revisionId, author, date: '2026-01-01' });
}

/** Paragraph of `count` single-word insertions, each a distinct revision. */
function manyRevisionsPara(count: number) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push(schema.text(`word${i} `, [insertionMark(1000 + i)]));
  }
  return schema.nodes.paragraph.create({ paraId: 'P-perf' }, children);
}

describe('tracked-change DOM node profile', () => {
  test('100 distinct revisions → 100 runs → 100 revision spans', () => {
    const para = manyRevisionsPara(100);
    expect(para.childCount).toBe(100);

    const runs = paragraphToRuns(para, 0, {});
    expect(runs.length).toBe(100);

    const host = document.createElement('div');
    let spanCount = 0;
    for (const run of runs) {
      const el = renderTextRun(run as TextRun, document);
      expect(el.tagName).toBe('SPAN');
      expect(el.dataset.revisionId).toBeDefined();
      host.appendChild(el);
      spanCount += 1;
    }
    expect(spanCount).toBe(100);

    const totalNodes = host.querySelectorAll('*').length;
    // One element per change, no wrapper overhead per run.
    expect(totalNodes).toBe(100);

    console.log(
      `tracked-change DOM profile: 100 distinct revisions → ` +
        `${runs.length} runs → ${spanCount} spans (${totalNodes} DOM nodes, ` +
        `~1 node/change + shared fragment chrome)`
    );
  });

  test('adjacent same-triple insertions coalesce to one span', () => {
    const mark = insertionMark(7);
    const para = schema.nodes.paragraph.create({ paraId: 'P-merge' }, [
      schema.text('hello ', [mark]),
      schema.text('world', [mark]),
    ]);
    // ProseMirror joins adjacent identical-mark text — the painter never
    // sees two runs here, so no painter-level merge pass is needed.
    expect(para.childCount).toBe(1);

    const runs = paragraphToRuns(para, 0, {});
    expect(runs.length).toBe(1);

    const el = renderTextRun(runs[0] as TextRun, document);
    expect(el.textContent).toBe('hello world');
    expect(el.dataset.revisionId).toBe('7');
  });
});
