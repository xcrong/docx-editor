/**
 * T27-02 (issue #78): paragraph-property snapshotter + spanning-delete
 * coverage for the suggesting-mode slice.
 *
 * - `paragraphPropertySnapshotter` wrapped via `withSuggestingSnapshot`:
 *   suggesting OFF runs the command unwrapped (no `pPrChange`); ON appends
 *   a minimal prior entry; a no-op edit mints nothing.
 * - `handleSuggestionDelete` over a multi-paragraph selection: inline content
 *   is marked `deletion` AND every fully-covered paragraph mark gets
 *   `pPrDel`; the cursor lands at the original `from`.
 */

import { describe, expect, test } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { createSuggestionModePlugin, suggestionModeKey } from './index';
import { withSuggestingSnapshot } from './snapshot';
import { paragraphPropertySnapshotter } from './paragraphSnapshot';
import { handleSuggestionDelete } from './handlers/delete';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        alignment: { default: null },
        pPrDel: { default: null },
        pPrChange: { default: null },
      },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    insertion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: '' } },
      toDOM: () => ['ins', 0],
    },
    deletion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: '' } },
      toDOM: () => ['del', 0],
    },
  },
});

function setAlignment(alignment: string): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    let tr = state.tr;
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (node.type.name === 'paragraph') {
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, alignment });
      }
    });
    dispatch(tr);
    return true;
  };
}

const trackedSetAlignment = (alignment: string): Command =>
  withSuggestingSnapshot(setAlignment(alignment), paragraphPropertySnapshotter);

function twoParaState(active: boolean): EditorState {
  const plugin = createSuggestionModePlugin(active, 'Jane');
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('aaa')]),
    schema.node('paragraph', null, [schema.text('bbb')]),
  ]);
  return EditorState.create({ doc, plugins: [plugin] });
}

function pPrChangeOf(state: EditorState, index: number): unknown[] | null {
  return (state.doc.child(index).attrs.pPrChange as unknown[] | null) ?? null;
}

describe('paragraphPropertySnapshotter via withSuggestingSnapshot', () => {
  test('suggesting OFF runs the command unwrapped (no pPrChange)', () => {
    let state = twoParaState(false);
    const ok = trackedSetAlignment('center')(state, (tr) => {
      state = state.apply(tr);
    });
    expect(ok).toBe(true);
    expect(state.doc.child(0).attrs.alignment).toBe('center');
    expect(pPrChangeOf(state, 0)).toBeNull();
  });

  test('suggesting ON appends a minimal prior entry', () => {
    let state = twoParaState(true);
    const ok = trackedSetAlignment('center')(state, (tr) => {
      state = state.apply(tr);
    });
    expect(ok).toBe(true);
    expect(state.doc.child(0).attrs.alignment).toBe('center');
    const changes = pPrChangeOf(state, 0);
    expect(changes).toHaveLength(1);
    const entry = changes![0] as {
      type: string;
      info: { author: string };
      previousFormatting: Record<string, unknown>;
    };
    expect(entry.type).toBe('paragraphPropertyChange');
    expect(entry.info.author).toBe('Jane');
    expect(entry.previousFormatting).toEqual({ alignment: null });
  });

  test('suggesting ON but no-op edit mints no revision', () => {
    let state = twoParaState(true);
    // Baseline is already null alignment; setting null is a no-op.
    const setNull: Command = (s, dispatch) => {
      if (!dispatch) return true;
      let tr = s.tr;
      s.doc.nodesBetween(s.selection.from, s.selection.to, (node, pos) => {
        if (node.type.name === 'paragraph') tr = tr.setNodeMarkup(pos, undefined, node.attrs);
      });
      dispatch(tr);
      return true;
    };
    const ok = withSuggestingSnapshot(setNull, paragraphPropertySnapshotter)(state, (tr) => {
      state = state.apply(tr);
    });
    expect(ok).toBe(true);
    expect(pPrChangeOf(state, 0)).toBeNull();
    expect(pPrChangeOf(state, 1)).toBeNull();
  });

  test('second edit stacks a new session without overwriting the frozen prior', () => {
    let state = twoParaState(true);
    const run = (cmd: Command) => {
      const ok = cmd(state, (tr) => {
        state = state.apply(tr);
      });
      expect(ok).toBe(true);
    };
    run(trackedSetAlignment('center'));
    run(trackedSetAlignment('right'));
    const changes = pPrChangeOf(state, 0);
    expect(changes).toHaveLength(2);
    const priors = (changes as Array<{ previousFormatting: Record<string, unknown> }>).map(
      (e) => e.previousFormatting
    );
    expect(priors[0]).toEqual({ alignment: null });
    expect(priors[1]).toEqual({ alignment: 'center' });
  });
});

describe('handleSuggestionDelete spanning a paragraph boundary', () => {
  test('marks inline deletion + pPrDel on the covered mark, cursor at from', () => {
    let state = twoParaState(true);
    // Select from inside "aaa" (offset 1) to inside "bbb" (offset 1 of para 2).
    // Doc layout: para0 at 0..5 ("aaa" text at 1..4), para1 at 5..10.
    const from = 2;
    const to = 7;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));

    let dispatched = false;
    const ok = handleSuggestionDelete(
      state,
      (tr) => {
        dispatched = true;
        state = state.apply(tr);
      },
      'backward'
    );
    expect(ok).toBe(true);
    expect(dispatched).toBe(true);

    // Covered paragraph (para 0, end boundary 5 < to 7) carries pPrDel.
    const pPrDel = state.doc.child(0).attrs.pPrDel as { author: string } | null;
    expect(pPrDel).not.toBeNull();
    expect(pPrDel!.author).toBe('Jane');
    // The paragraph holding `to` keeps its mark.
    expect(state.doc.child(1).attrs.pPrDel).toBeNull();

    // Inline content in range carries deletion marks; text is preserved.
    let deleted = '';
    state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'deletion')) deleted += node.text;
    });
    expect(deleted).toContain('aa');
    expect(deleted).toContain('b');

    // Cursor lands at the original `from`.
    expect(state.selection.from).toBe(from);
  });

  test('single-paragraph selection sets no pPrDel', () => {
    let state = twoParaState(true);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 3)));
    const ok = handleSuggestionDelete(
      state,
      (tr) => {
        state = state.apply(tr);
      },
      'backward'
    );
    expect(ok).toBe(true);
    expect(state.doc.child(0).attrs.pPrDel).toBeNull();
    expect(state.doc.child(1).attrs.pPrDel).toBeNull();
  });

  test('suggesting OFF leaves the doc untouched', () => {
    let state = twoParaState(false);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2, 7)));
    let applied: unknown = null;
    const ok = handleSuggestionDelete(
      state,
      (tr) => {
        applied = tr;
        state = state.apply(tr);
      },
      'backward'
    );
    // Handler declines when suggesting is off; caller falls through.
    expect(ok).toBe(false);
    expect(applied).toBeNull();
    expect(state.doc.child(0).attrs.pPrDel).toBeNull();
  });

  test('plugin state is active in the test harness', () => {
    expect(suggestionModeKey.getState(twoParaState(true))?.active).toBe(true);
  });
});
