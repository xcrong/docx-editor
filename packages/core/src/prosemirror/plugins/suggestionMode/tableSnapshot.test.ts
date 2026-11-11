/**
 * T27-05 (issue #81): table/row/cell property snapshotter coverage.
 *
 * - `tablePropertySnapshotter` wrapped via `withSuggestingSnapshot`:
 *   suggesting OFF runs the command unwrapped (no `*Change`); ON appends a
 *   minimal prior entry (nulls included, paragraph convention); a no-op
 *   edit mints nothing; reverting to the snapshotted value clears the entry.
 * - Grid (`columnWidths`) edits mint `tblGridChange` with the frozen prior.
 */

import { describe, expect, test } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { createSuggestionModePlugin } from './index';
import { withSuggestingSnapshot } from './snapshot';
import { tablePropertySnapshotter } from './tableSnapshot';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    table: {
      group: 'block',
      content: 'tableRow+',
      attrs: {
        width: { default: null },
        widthType: { default: null },
        justification: { default: null },
        columnWidths: { default: null },
        tableLayout: { default: null },
        floating: { default: null },
        cellMargins: { default: null },
        look: { default: null },
        bidi: { default: null },
        styleId: { default: null },
        tblPrChange: { default: null },
        tblGridChange: { default: null },
      },
      toDOM: () => ['table', ['tbody', 0]],
    },
    tableRow: {
      content: 'tableCell+',
      attrs: {
        height: { default: null },
        heightRule: { default: null },
        isHeader: { default: null },
        trPrChange: { default: null },
      },
      toDOM: () => ['tr', 0],
    },
    tableCell: {
      content: 'paragraph+',
      attrs: {
        width: { default: null },
        widthType: { default: null },
        verticalAlign: { default: null },
        backgroundColor: { default: null },
        borders: { default: null },
        margins: { default: null },
        textDirection: { default: null },
        noWrap: { default: null },
        tcPrChange: { default: null },
      },
      toDOM: () => ['td', 0],
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

function setCellFill(color: string | null): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    let tr = state.tr;
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (node.type.name === 'tableCell') {
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, backgroundColor: color });
      }
    });
    dispatch(tr);
    return true;
  };
}

const trackedSetCellFill = (color: string | null): Command =>
  withSuggestingSnapshot(setCellFill(color), tablePropertySnapshotter);

function setWidths(columnWidths: number[]): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    let tr = state.tr;
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (node.type.name === 'table') {
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, columnWidths });
      }
    });
    dispatch(tr);
    return true;
  };
}

const trackedSetWidths = (columnWidths: number[]): Command =>
  withSuggestingSnapshot(setWidths(columnWidths), tablePropertySnapshotter);

function tableState(active: boolean): EditorState {
  const plugin = createSuggestionModePlugin(active, 'Jane');
  const doc = schema.node('doc', null, [
    schema.node('table', { columnWidths: [3000, 3000] }, [
      schema.node('tableRow', null, [
        schema.node('tableCell', null, schema.node('paragraph', null, schema.text('a1'))),
        schema.node('tableCell', null, schema.node('paragraph', null, schema.text('b1'))),
      ]),
    ]),
  ]);
  let state = EditorState.create({ doc, plugins: [plugin] });
  // Cursor inside the first cell's text ('a1' at 4..6).
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)));
  return state;
}

function cellOf(state: EditorState) {
  return state.doc.child(0).child(0).child(0);
}

describe('tablePropertySnapshotter via withSuggestingSnapshot', () => {
  test('suggesting OFF runs unwrapped (no tcPrChange)', () => {
    let state = tableState(false);
    const ok = trackedSetCellFill('FFEB3B')(state, (tr) => {
      state = state.apply(tr);
    });
    expect(ok).toBe(true);
    expect(cellOf(state).attrs.backgroundColor).toBe('FFEB3B');
    expect(cellOf(state).attrs.tcPrChange).toBeNull();
  });

  test('suggesting ON mints tcPrChange with null prior', () => {
    let state = tableState(true);
    const ok = trackedSetCellFill('FFEB3B')(state, (tr) => {
      state = state.apply(tr);
    });
    expect(ok).toBe(true);
    const changes = cellOf(state).attrs.tcPrChange as unknown[];
    expect(changes).toHaveLength(1);
    const entry = changes[0] as {
      type: string;
      info: { author: string };
      previousFormatting: Record<string, unknown>;
    };
    expect(entry.type).toBe('tableCellPropertyChange');
    expect(entry.info.author).toBe('Jane');
    // Was unshaded: the prior pins shading null (paragraph `{align:null}` convention).
    expect(entry.previousFormatting).toEqual({ shading: null });
  });

  test('suggesting ON but no-op edit mints no revision', () => {
    let state = tableState(true);
    // Baseline backgroundColor is already null; setting null changes nothing.
    const ok = trackedSetCellFill(null)(state, (tr) => {
      state = state.apply(tr);
    });
    expect(ok).toBe(true);
    expect(cellOf(state).attrs.tcPrChange).toBeNull();
    expect(state.doc.child(0).attrs.tblGridChange).toBeNull();
  });

  test('reverting in a new session drops the stale entry, keeps the revert', () => {
    let state = tableState(true);
    const run = (cmd: Command) => {
      const ok = cmd(state, (tr) => {
        state = state.apply(tr);
      });
      expect(ok).toBe(true);
    };
    run(trackedSetCellFill('FFEB3B'));
    expect((cellOf(state).attrs.tcPrChange as unknown[]).length).toBe(1);
    run(trackedSetCellFill(null));
    // The first entry's prior (unshaded) now equals current → dropped as
    // stale; the revert itself survives as a tracked change back.
    const changes = cellOf(state).attrs.tcPrChange as Array<{
      previousFormatting: Record<string, unknown>;
    }>;
    expect(changes).toHaveLength(1);
    expect(changes[0]!.previousFormatting).toEqual({ shading: { fill: { rgb: 'FFEB3B' } } });
  });

  test('grid edit mints tblGridChange with the frozen prior grid', () => {
    let state = tableState(true);
    const ok = trackedSetWidths([2000, 4000])(state, (tr) => {
      state = state.apply(tr);
    });
    expect(ok).toBe(true);
    const grid = state.doc.child(0).attrs.tblGridChange as {
      revisionId: number;
      prior: number[];
    } | null;
    expect(grid).toMatchObject({ prior: [3000, 3000] });
    expect(typeof grid?.revisionId).toBe('number');
  });

  test('second grid edit overwrites the slot with its own pre-edit prior', () => {
    let state = tableState(true);
    const run = (cmd: Command) => {
      const ok = cmd(state, (tr) => {
        state = state.apply(tr);
      });
      expect(ok).toBe(true);
    };
    run(trackedSetWidths([2000, 4000]));
    const first = state.doc.child(0).attrs.tblGridChange as {
      revisionId: number;
      prior: number[];
    };
    expect(first.prior).toEqual([3000, 3000]);
    run(trackedSetWidths([1000, 5000]));
    const second = state.doc.child(0).attrs.tblGridChange as {
      revisionId: number;
      prior: number[];
    };
    // Single slot (OOXML allows one): the newest session wins, chaining on
    // its own pre-edit grid so reject restores step by step.
    expect(second.prior).toEqual([2000, 4000]);
    expect(second.revisionId).not.toBe(first.revisionId);
  });
});
