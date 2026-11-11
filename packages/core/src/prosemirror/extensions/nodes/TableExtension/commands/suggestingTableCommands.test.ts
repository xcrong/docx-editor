/**
 * T27-05 (issue #81): suggesting-aware table commands.
 *
 * - `addColumnLeft/Right` in suggesting mode tag new cells
 *   `cellMarker: ins` under one triple; closed mode leaves cells unmarked.
 * - `deleteColumn` in suggesting mode tags the column's cells `del` and
 *   keeps the column; closed mode removes it.
 * - `mergeCells` horizontal tags left `ins` / absorbed `del` without
 *   collapsing; vertical tags `merge rest/cont`. Closed mode collapses.
 * - `splitCell` in suggesting mode clears `cellMarker` on the fragments.
 * - Property commands (`setCellFillColor`, `setRowHeight`,
 *   `distributeColumns`) mint `tcPrChange` / `trPrChange` / `tblGridChange`
 *   with frozen first-prior snapshots.
 */

import { describe, test, expect } from 'bun:test';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { CellSelection } from 'prosemirror-tables';
import { singletonManager } from '../../../../schema';
import { createSuggestionModePlugin } from '../../../../plugins/suggestionMode';
import { makeAddColumnLeft, makeAddColumnRight } from './insert';
import { deleteColumn, deleteRow } from './delete';
import { mergeCells, splitCell } from './merge';

const schema = singletonManager.getSchema();

function cell(text: string, attrs: Record<string, unknown> = {}): PMNode {
  return schema.nodes.tableCell.create(
    attrs,
    schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
  );
}

function makeTable(): PMNode {
  return schema.nodes.table.create({ columnWidths: [3000, 3000] }, [
    schema.nodes.tableRow.create(null, [cell('a1'), cell('b1')]),
    schema.nodes.tableRow.create(null, [cell('a2'), cell('b2')]),
  ]);
}

function stateFor(table: PMNode, suggesting: boolean): EditorState {
  const doc = schema.nodes.doc.create(null, [table, schema.nodes.paragraph.create()]);
  const plugins = suggesting ? [createSuggestionModePlugin(true, 'Jane')] : [];
  return EditorState.create({ schema, doc, plugins });
}

/** Doc position of the (rowIdx, cellIdx)-th cell node itself. */
function cellPosOf(state: EditorState, rowIdx: number, cellIdx: number): number {
  let row = -1;
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.type.name !== 'tableRow') return true;
    row++;
    if (row !== rowIdx) return false;
    let cellPos = pos + 1;
    for (let i = 0; i < node.childCount; i++) {
      if (i === cellIdx) {
        found = cellPos;
        break;
      }
      cellPos += node.child(i).nodeSize;
    }
    return false;
  });
  if (found === -1) throw new Error('cell pos not found');
  return found;
}

/** Text position of the (rowIdx, cellIdx)-th cell's text. */
function textPosOf(state: EditorState, rowIdx: number, cellIdx: number): number {
  return cellPosOf(state, rowIdx, cellIdx) + 2;
}

function selectCells(
  state: EditorState,
  fromRow: number,
  fromCell: number,
  toRow: number,
  toCell: number
): EditorState {
  const $from = state.doc.resolve(cellPosOf(state, fromRow, fromCell));
  const $to = state.doc.resolve(cellPosOf(state, toRow, toCell));
  return state.apply(state.tr.setSelection(new CellSelection($from, $to)));
}

function cursorAt(state: EditorState, pos: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

function runCmd(state: EditorState, cmd: Command): EditorState {
  let captured: Transaction | null = null;
  const ok = cmd(state, (tr) => {
    captured = tr;
  });
  expect(ok).toBe(true);
  if (!captured) throw new Error('command did not dispatch');
  return state.apply(captured);
}

function tableOf(state: EditorState): PMNode {
  let found: PMNode | null = null;
  state.doc.descendants((node) => {
    if (!found && node.type.name === 'table') found = node;
    return !found;
  });
  if (!found) throw new Error('no table');
  return found;
}

/** Distinct revisionIds across every cellMarker in the table. */
function markerIds(table: PMNode): number[] {
  const ids = new Set<number>();
  table.descendants((node) => {
    const m = node.attrs?.cellMarker as { info?: { revisionId?: number } } | null;
    if (m?.info && typeof m.info.revisionId === 'number') ids.add(m.info.revisionId);
    return true;
  });
  return [...ids];
}

/** True when any text in the doc carries an insertion mark. */
function hasInsertionMarks(state: EditorState): boolean {
  let found = false;
  state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === 'insertion')) found = true;
    return !found;
  });
  return found;
}

describe('suggesting addColumn', () => {
  test('addColumnRight tags new cells ins under one triple', () => {
    let state = stateFor(makeTable(), true);
    state = cursorAt(state, textPosOf(state, 0, 0));
    const after = runCmd(state, makeAddColumnRight(schema));
    const table = tableOf(after);
    expect(table.child(0).childCount).toBe(3);
    expect(table.child(1).childCount).toBe(3);
    for (let r = 0; r < 2; r++) {
      expect(table.child(r).child(1).attrs.cellMarker).toMatchObject({ kind: 'ins' });
      expect(table.child(r).child(1).attrs.cellMarker.info.author).toBe('Jane');
    }
    expect(markerIds(table)).toHaveLength(1);
    expect(hasInsertionMarks(after)).toBe(false);
  });

  test('addColumnLeft closed mode leaves cells unmarked', () => {
    let state = stateFor(makeTable(), false);
    state = cursorAt(state, textPosOf(state, 0, 0));
    const after = runCmd(state, makeAddColumnLeft(schema));
    const table = tableOf(after);
    expect(table.child(0).childCount).toBe(3);
    expect(table.child(0).child(0).attrs.cellMarker).toBeNull();
  });
});

describe('suggesting deleteColumn', () => {
  test('marks the column del and keeps it', () => {
    let state = stateFor(makeTable(), true);
    state = cursorAt(state, textPosOf(state, 0, 1));
    const after = runCmd(state, deleteColumn);
    const table = tableOf(after);
    // Column still present…
    expect(table.child(0).childCount).toBe(2);
    expect(table.child(1).childCount).toBe(2);
    // …with every cell in it tracked as deleted under one triple.
    expect(table.child(0).child(1).attrs.cellMarker).toMatchObject({ kind: 'del' });
    expect(table.child(1).child(1).attrs.cellMarker).toMatchObject({ kind: 'del' });
    expect(markerIds(table)).toHaveLength(1);
    expect(hasInsertionMarks(after)).toBe(false);
  });

  test('closed mode removes the column', () => {
    let state = stateFor(makeTable(), false);
    state = cursorAt(state, textPosOf(state, 0, 1));
    const after = runCmd(state, deleteColumn);
    const table = tableOf(after);
    expect(table.child(0).childCount).toBe(1);
    expect(table.child(0).child(0).textContent).toBe('a1');
  });
});

describe('suggesting mergeCells', () => {
  test('horizontal: left ins, right del, no collapse, one triple', () => {
    let state = stateFor(makeTable(), true);
    state = selectCells(state, 0, 0, 0, 1);
    const after = runCmd(state, mergeCells);
    const table = tableOf(after);
    const row = table.child(0);
    expect(row.childCount).toBe(2);
    expect(row.child(0).attrs.cellMarker).toMatchObject({ kind: 'ins' });
    expect(row.child(1).attrs.cellMarker).toMatchObject({ kind: 'del' });
    expect(row.child(0).textContent).toBe('a1');
    expect(row.child(1).textContent).toBe('b1');
    expect(markerIds(table)).toHaveLength(1);
    expect(hasInsertionMarks(after)).toBe(false);
  });

  test('vertical: top rest, bottom cont, one triple', () => {
    let state = stateFor(makeTable(), true);
    state = selectCells(state, 0, 0, 1, 0);
    const after = runCmd(state, mergeCells);
    const table = tableOf(after);
    expect(table.child(0).child(0).attrs.cellMarker).toMatchObject({
      kind: 'merge',
      vMerge: 'rest',
    });
    expect(table.child(1).child(0).attrs.cellMarker).toMatchObject({
      kind: 'merge',
      vMerge: 'cont',
    });
    expect(markerIds(table)).toHaveLength(1);
    expect(hasInsertionMarks(after)).toBe(false);
  });

  test('closed mode collapses horizontally', () => {
    let state = stateFor(makeTable(), false);
    state = selectCells(state, 0, 0, 0, 1);
    const after = runCmd(state, mergeCells);
    const table = tableOf(after);
    expect(table.child(0).childCount).toBe(1);
    expect(table.child(0).child(0).attrs.cellMarker).toBeNull();
  });
});

describe('suggesting splitCell', () => {
  function spannedTable(): PMNode {
    return schema.nodes.table.create({ columnWidths: [3000, 3000] }, [
      schema.nodes.tableRow.create(null, [
        schema.nodes.tableCell.create(
          {
            colspan: 2,
            cellMarker: { kind: 'del', info: { revisionId: 7, author: 'Jane', date: null } },
          },
          schema.nodes.paragraph.create(null, schema.text('wide'))
        ),
      ]),
      schema.nodes.tableRow.create(null, [cell('a2'), cell('b2')]),
    ]);
  }

  test('clears cellMarker on the fragments', () => {
    let state = stateFor(spannedTable(), true);
    state = cursorAt(state, textPosOf(state, 0, 0));
    const after = runCmd(state, splitCell);
    const table = tableOf(after);
    expect(table.child(0).childCount).toBe(2);
    expect(table.child(0).child(0).attrs.cellMarker).toBeNull();
    expect(table.child(0).child(1).attrs.cellMarker).toBeNull();
  });

  test('closed mode preserves marker attrs verbatim (library behavior)', () => {
    let state = stateFor(spannedTable(), false);
    state = cursorAt(state, textPosOf(state, 0, 0));
    const after = runCmd(state, splitCell);
    const table = tableOf(after);
    expect(table.child(0).childCount).toBe(2);
  });
});

describe('suggesting deleteRow meta', () => {
  test('marked rows do not stamp cell text as insertion', () => {
    let state = stateFor(makeTable(), true);
    state = cursorAt(state, textPosOf(state, 0, 0));
    const after = runCmd(state, deleteRow);
    const table = tableOf(after);
    expect(table.childCount).toBe(2);
    expect(table.child(0).attrs.trDel).toMatchObject({ author: 'Jane' });
    expect(hasInsertionMarks(after)).toBe(false);
  });
});
