/**
 * Pure table-resize readers + commit builders. Builds a 2x2 table from the
 * singleton schema and exercises the column / row / right-edge commits via a
 * mutable view stub (state replaced on each dispatch).
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { singletonManager } from '../schema';
import {
  readColumnWidths,
  readRowHeight,
  readColumnWidthAt,
  commitColumnResize,
  commitRowResize,
  commitRightEdgeResize,
  TWIPS_PER_PIXEL,
  MIN_CELL_WIDTH_TWIPS,
  MIN_ROW_HEIGHT_TWIPS,
} from '../tableResize';

const schema = singletonManager.getSchema();

function cell(text: string, width: number) {
  return schema.nodes.tableCell.create(
    { width, widthType: 'dxa' },
    schema.nodes.paragraph.create(null, schema.text(text))
  );
}

function row(texts: string[], attrs: Record<string, unknown> | null = null) {
  return schema.nodes.tableRow.create(
    attrs,
    texts.map((t, i) => cell(t, 3000 + i))
  );
}

/** doc = [ table(columnWidths:[3000,3000]) ]. The table node sits at pos 0. */
function makeView() {
  const table = schema.nodes.table.create({ columnWidths: [3000, 3000] }, [
    row(['a', 'b']),
    row(['c', 'd'], { height: 400, heightRule: 'atLeast' }),
  ]);
  const doc = schema.nodes.doc.create(null, [table]);
  const view = {
    state: EditorState.create({ schema, doc }),
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view as unknown as EditorView & { state: EditorState };
}

/** The first text run's pmStart inside the table — enough for findTableAt's walk-up. */
const INSIDE_TABLE = 3;

function tableNode(view: EditorView & { state: EditorState }) {
  return view.state.doc.firstChild!;
}

describe('constants', () => {
  test('match OOXML twips conventions', () => {
    expect(TWIPS_PER_PIXEL).toBe(15);
    expect(MIN_CELL_WIDTH_TWIPS).toBe(300);
    expect(MIN_ROW_HEIGHT_TWIPS).toBe(200);
  });
});

describe('readers', () => {
  test('readColumnWidths returns the [left,right] pair', () => {
    const view = makeView();
    expect(readColumnWidths(view, INSIDE_TABLE, 0)).toEqual({ left: 3000, right: 3000 });
  });

  test('readColumnWidths returns null past the last column', () => {
    const view = makeView();
    expect(readColumnWidths(view, INSIDE_TABLE, 5)).toBeNull();
  });

  test('readRowHeight returns explicit height, null when unset', () => {
    const view = makeView();
    expect(readRowHeight(view, INSIDE_TABLE, 1)).toBe(400);
    expect(readRowHeight(view, INSIDE_TABLE, 0)).toBeNull();
  });

  test('readColumnWidthAt returns the single column width', () => {
    const view = makeView();
    expect(readColumnWidthAt(view, INSIDE_TABLE, 1)).toBe(3000);
  });
});

describe('commits', () => {
  test('commitColumnResize updates columnWidths and the two cell widths', () => {
    const view = makeView();
    commitColumnResize(view, { pmStart: INSIDE_TABLE, colIdx: 0, newLeft: 2000, newRight: 4000 });
    expect(tableNode(view).attrs.columnWidths).toEqual([2000, 4000]);
    // Each row's two cells get the new widths.
    const firstRow = tableNode(view).child(0);
    expect(firstRow.child(0).attrs.width).toBe(2000);
    expect(firstRow.child(1).attrs.width).toBe(4000);
  });

  test('commitRowResize sets the target row height + heightRule', () => {
    const view = makeView();
    commitRowResize(view, { pmStart: INSIDE_TABLE, rowIdx: 0, newHeight: 555 });
    expect(tableNode(view).child(0).attrs.height).toBe(555);
    expect(tableNode(view).child(0).attrs.heightRule).toBe('atLeast');
    // Other row untouched.
    expect(tableNode(view).child(1).attrs.height).toBe(400);
  });

  test('commitRightEdgeResize grows only the targeted column', () => {
    const view = makeView();
    commitRightEdgeResize(view, { pmStart: INSIDE_TABLE, colIdx: 1, newWidth: 5000 });
    expect(tableNode(view).attrs.columnWidths).toEqual([3000, 5000]);
    expect(tableNode(view).child(0).child(1).attrs.width).toBe(5000);
    // Column 0 unchanged.
    expect(tableNode(view).child(0).child(0).attrs.width).toBe(3000);
  });

  test('commit on a non-table position is a no-op', () => {
    const view = makeView();
    const before = view.state;
    commitColumnResize(view, { pmStart: 99999, colIdx: 0, newLeft: 1, newRight: 1 });
    expect(view.state).toBe(before);
  });

  test('commitColumnResize keeps a colspan=2 cell consistent with the grid', () => {
    // Row 0 merges columns 0-1 (width 6000); row 1 has three plain cells.
    const spanCell = schema.nodes.tableCell.create(
      { width: 6000, widthType: 'dxa', colspan: 2 },
      schema.nodes.paragraph.create(null, schema.text('span'))
    );
    const plain = (t: string, w: number) =>
      schema.nodes.tableCell.create(
        { width: w, widthType: 'dxa' },
        schema.nodes.paragraph.create(null, schema.text(t))
      );
    const table = schema.nodes.table.create({ columnWidths: [3000, 3000, 3000] }, [
      schema.nodes.tableRow.create(null, [spanCell, plain('c', 3000)]),
      schema.nodes.tableRow.create(null, [plain('a', 3000), plain('b', 3000), plain('d', 3000)]),
    ]);
    const doc = schema.nodes.doc.create(null, [table]);
    const view = {
      state: EditorState.create({ schema, doc }),
      dispatch(tr: Transaction) {
        view.state = view.state.apply(tr);
      },
    } as unknown as EditorView & { state: EditorState };

    // Drag the boundary interior to the span: grid total must be preserved
    // and the spanning cell re-summed, not set to a single side's width.
    commitColumnResize(view, { pmStart: INSIDE_TABLE, colIdx: 0, newLeft: 2000, newRight: 4000 });
    const updated = view.state.doc.firstChild!;
    expect(updated.attrs.columnWidths).toEqual([2000, 4000, 3000]);
    expect(updated.child(0).child(0).attrs.width).toBe(6000);
    expect(updated.child(0).child(0).attrs.colspan).toBe(2);
    expect(updated.child(1).child(0).attrs.width).toBe(2000);
    expect(updated.child(1).child(1).attrs.width).toBe(4000);
  });
});
