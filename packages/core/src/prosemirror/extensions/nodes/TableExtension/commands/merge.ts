/**
 * Suggesting-aware merge / split commands.
 *
 * When suggesting mode is OFF these delegate straight to prosemirror-tables
 * (closed-mode behavior unchanged). When ON:
 *
 * - Horizontal `mergeCells` (single-row rect) does NOT collapse the cells.
 *   The leftmost cell carries `cellMarker: { kind: 'ins' }` and each absorbed
 *   cell carries `cellMarker: { kind: 'del' }` (Word's on-disk convention —
 *   there is no horizontal `cellMerge` OOXML element), sharing one triple.
 * - Vertical `mergeCells` (single-column rect) sets
 *   `cellMarker: { kind: 'merge', vMerge: 'rest' }` on the top cell and
 *   `vMerge: 'cont'` on each cell below, sharing one triple.
 * - `splitCell` runs the library split, then clears `cellMarker` on the
 *   resulting fragments (the split cell's former grid area).
 *
 * All three dispatch a single transaction tagged `SUGGESTION_META` so the
 * suggesting-mode appendTransaction catch-all leaves the touched cell text
 * alone (it would otherwise stamp it as an insertion).
 */

import { type Command, type EditorState, type Transaction } from 'prosemirror-state';
import {
  mergeCells as pmMergeCells,
  splitCell as pmSplitCell,
  selectedRect,
  TableMap,
} from 'prosemirror-tables';
import { getTableContext } from '../context';
import { makeRevisionInfo } from '../../../../plugins/revisionIds';
import { isSuggestionModeActive } from '../../../../plugins/suggestionMode/commands';
import { SUGGESTION_META } from '../../../../plugins/suggestionMode/state';

function isCellNodeName(name: string): boolean {
  return name === 'tableCell' || name === 'tableHeader';
}

/**
 * Doc positions of the distinct cells covering `rect`, in row-major order
 * (which `cellsInRect` already yields). Offsets are relative to
 * `rect.tableStart`.
 */
function rectCellPositions(state: EditorState, rect: ReturnType<typeof selectedRect>): number[] {
  const offsets = rect.map.cellsInRect({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  });
  const positions: number[] = [];
  for (const off of offsets) {
    if (typeof off !== 'number') continue;
    const pos = rect.tableStart + off;
    const node = state.doc.nodeAt(pos);
    if (node && isCellNodeName(node.type.name)) positions.push(pos);
  }
  return positions;
}

export const mergeCells: Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean => {
  if (!isSuggestionModeActive(state)) return pmMergeCells(state, dispatch);

  const context = getTableContext(state);
  if (!context.isInTable || !context.table || context.tablePos === undefined) return false;

  let rect: ReturnType<typeof selectedRect>;
  try {
    rect = selectedRect(state);
  } catch {
    return false;
  }
  const singleRow = rect.bottom - rect.top === 1;
  const singleCol = rect.right - rect.left === 1;
  if ((singleRow && singleCol) || (!singleRow && !singleCol)) {
    // 1x1 (nothing to merge) or a 2-D block (no single-axis convention):
    // fall back to the structural merge so closed-mode behavior holds.
    return pmMergeCells(state, dispatch);
  }

  const positions = rectCellPositions(state, rect);
  if (positions.length < 2) return pmMergeCells(state, dispatch);
  if (!dispatch) return true;

  const info = makeRevisionInfo(state);
  if (!info) return pmMergeCells(state, dispatch);

  const tr = state.tr;
  if (singleRow) {
    // Horizontal: leftmost cell is the merged-result placeholder (`ins`),
    // absorbed cells are tracked deletions. Cells stay visible until accept.
    positions.forEach((pos, index) => {
      const node = tr.doc.nodeAt(pos);
      if (!node || !isCellNodeName(node.type.name)) return;
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        cellMarker: { kind: index === 0 ? 'ins' : 'del', info },
      });
    });
  } else {
    // Vertical: top cell anchors the merge (`rest`), cells below continue
    // it (`cont`). `formatting.vMerge` is untouched — the marker is
    // revision state only and never affects vMerge continuation rendering.
    positions.forEach((pos, index) => {
      const node = tr.doc.nodeAt(pos);
      if (!node || !isCellNodeName(node.type.name)) return;
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        cellMarker: {
          kind: 'merge',
          info,
          vMerge: index === 0 ? 'rest' : 'cont',
        },
      });
    });
  }
  tr.setMeta(SUGGESTION_META, true);
  dispatch(tr.scrollIntoView());
  return true;
};

export const splitCell: Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean => {
  if (!isSuggestionModeActive(state)) return pmSplitCell(state, dispatch);
  if (!dispatch) return pmSplitCell(state, undefined);

  let rect: ReturnType<typeof selectedRect>;
  try {
    rect = selectedRect(state);
  } catch {
    return false;
  }
  let innerTr: Transaction | null = null;
  const ok = pmSplitCell(state, (tr) => {
    innerTr = tr;
  });
  if (!ok || !innerTr) return false;
  const tr: Transaction = innerTr;

  // The library split copies the split cell's attrs (including `cellMarker`)
  // into every fragment — clear the marker across the split cell's former
  // grid area so the split reads as resolved. `rect.tableStart` is the
  // start of the table's *content* (`$pos.start(-1)`), so the table node
  // itself sits one position earlier. Offsets from the NEW table's map are
  // relative to its content start — no per-cell mapping (the grid area is
  // unchanged by the split; only attrs change below).
  const tablePos = tr.mapping.map(rect.tableStart - 1);
  const table = tr.doc.nodeAt(tablePos);
  if (table && table.type.name === 'table') {
    const map = TableMap.get(table);
    const offsets = map.cellsInRect({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
    const contentStart = tablePos + 1;
    for (const off of offsets) {
      if (typeof off !== 'number') continue;
      const pos = contentStart + off;
      const node = tr.doc.nodeAt(pos);
      if (node && isCellNodeName(node.type.name) && node.attrs.cellMarker) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, cellMarker: null });
      }
    }
  }
  tr.setMeta(SUGGESTION_META, true);
  dispatch(tr.scrollIntoView());
  return true;
};
