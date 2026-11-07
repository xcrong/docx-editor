/**
 * Table-resize commit + width-read helpers shared by the React and Vue
 * adapters. Pure `(view, …) → result` over the PM doc — the gesture state
 * machines (which DOM handle is grabbed, pixel deltas, listener wiring) stay
 * in each adapter.
 *
 * Widths and heights are stored in twips (1/20 of a point) on the PM doc,
 * matching OOXML's `w:tblGrid` and `w:tcW` units.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

/** 1px ≈ 15 twips at 96dpi (20 twips/pt × 72pt/in ÷ 96px/in). */
export const TWIPS_PER_PIXEL = 15;
/** Minimum column width (~0.2"). */
export const MIN_CELL_WIDTH_TWIPS = 300;
/** Minimum row height (~0.14"). */
export const MIN_ROW_HEIGHT_TWIPS = 200;

/** Pixel drag delta → twips (rounded; 0 means "no visible movement yet"). */
export function pxDeltaToTwips(deltaPx: number): number {
  return Math.round(deltaPx * TWIPS_PER_PIXEL);
}

/**
 * One column-drag step: shift `deltaTwips` from the right column to the
 * left, honouring the min width on both sides. Returns the accepted pair,
 * or `null` when clamped — in which case the adapter must NOT advance its
 * anchor or move the visual handle (otherwise the handle desyncs from the
 * model and the user can never drag back).
 */
export function stepColumnResize(
  orig: { left: number; right: number },
  deltaTwips: number,
  minTwips: number = MIN_CELL_WIDTH_TWIPS
): { left: number; right: number } | null {
  const left = orig.left + deltaTwips;
  const right = orig.right - deltaTwips;
  if (left < minTwips || right < minTwips) return null;
  return { left, right };
}

/** One row-drag step: accept iff the new height clears the min. */
export function stepRowResize(
  origHeightTwips: number,
  deltaTwips: number,
  minTwips: number = MIN_ROW_HEIGHT_TWIPS
): number | null {
  const height = origHeightTwips + deltaTwips;
  return height >= minTwips ? height : null;
}

/** One right-edge step: the last column grows alone, min-clamped. */
export function stepRightEdgeResize(
  origWidthTwips: number,
  deltaTwips: number,
  minTwips: number = MIN_CELL_WIDTH_TWIPS
): number | null {
  const width = origWidthTwips + deltaTwips;
  return width >= minTwips ? width : null;
}

interface FoundTable {
  node: PMNode;
  /** PM doc position of the table node (its `before(d)`) */
  tablePos: number;
}

/** Walk up from `pmStart + 1` to find the enclosing table node. */
function findTableAt(view: EditorView, pmStart: number): FoundTable | null {
  try {
    const $pos = view.state.doc.resolve(pmStart + 1);
    for (let d = $pos.depth; d >= 0; d--) {
      const node = $pos.node(d);
      if (node.type.name === 'table') {
        return { node, tablePos: $pos.before(d) };
      }
    }
  } catch {
    // Resolution failed (stale pos after edit).
  }
  return null;
}

/** Read the [left, right] column widths at `colIndex` in the table starting at `pmStart`. */
export function readColumnWidths(
  view: EditorView,
  pmStart: number,
  colIndex: number
): { left: number; right: number } | null {
  const found = findTableAt(view, pmStart);
  if (!found) return null;
  const widths = found.node.attrs.columnWidths as number[] | null;
  if (!widths) return null;
  if (widths[colIndex] === undefined || widths[colIndex + 1] === undefined) return null;
  return { left: widths[colIndex], right: widths[colIndex + 1] };
}

/**
 * Read the row height (in twips) for `rowIndex` in the table starting at
 * `pmStart`. Returns null if the row has no explicit height — the caller
 * can fall back to measuring the rendered DOM cell.
 */
export function readRowHeight(view: EditorView, pmStart: number, rowIndex: number): number | null {
  const found = findTableAt(view, pmStart);
  if (!found) return null;
  let rowHeight: number | null = null;
  let idx = 0;
  found.node.forEach((child) => {
    if (idx === rowIndex) {
      const h = child.attrs.height as number | null;
      if (h) rowHeight = h;
    }
    idx++;
  });
  return rowHeight;
}

/** Read the last-column width (the one being resized from the table's right edge). */
export function readColumnWidthAt(
  view: EditorView,
  pmStart: number,
  colIndex: number
): number | null {
  const found = findTableAt(view, pmStart);
  if (!found) return null;
  const widths = found.node.attrs.columnWidths as number[] | null;
  if (!widths || widths[colIndex] === undefined) return null;
  return widths[colIndex];
}

/**
 * Bake a column-resize into the PM doc: update the table's `columnWidths`
 * attr and every cell at `colIdx` / `colIdx + 1` in every row.
 *
 * Cells spanning the dragged boundary (`colspan > 1`) keep a width equal to
 * the sum of the columns they cover — the inverse resize preserves that
 * total, so their stored width stays correct without an update. Writing a
 * single side's width onto a spanning cell would diverge the grid.
 */
export function commitColumnResize(
  view: EditorView,
  opts: { pmStart: number; colIdx: number; newLeft: number; newRight: number }
): void {
  const { pmStart, colIdx, newLeft, newRight } = opts;
  const found = findTableAt(view, pmStart);
  if (!found) return;
  const { node, tablePos } = found;

  const tr = view.state.tr;
  const widths = [...((node.attrs.columnWidths as number[]) ?? [])];
  widths[colIdx] = newLeft;
  widths[colIdx + 1] = newRight;
  // Switch to fixed layout so Word honors the explicit widths — autofit would
  // recompute columns to fit content and discard the resize (issue #781).
  tr.setNodeMarkup(tablePos, undefined, {
    ...node.attrs,
    columnWidths: widths,
    tableLayout: 'fixed',
  });

  let rowOffset = tablePos + 1;
  node.forEach((row) => {
    let cellOffset = rowOffset + 1;
    let cellColIdx = 0;
    row.forEach((cell) => {
      const colspan = (cell.attrs.colspan as number) || 1;
      const spanEnd = cellColIdx + colspan;
      if (colspan === 1 && (cellColIdx === colIdx || cellColIdx === colIdx + 1)) {
        const newWidth = cellColIdx === colIdx ? newLeft : newRight;
        tr.setNodeMarkup(tr.mapping.map(cellOffset), undefined, {
          ...cell.attrs,
          width: newWidth,
          widthType: 'dxa',
          colwidth: null,
        });
      } else if (colspan > 1 && cellColIdx <= colIdx + 1 && spanEnd > colIdx) {
        // Spanning cell covering the dragged boundary (or starting exactly
        // on its right side): re-sum from the updated grid so the stored
        // width matches the columns it covers.
        let spanWidth = 0;
        for (let c = cellColIdx; c < spanEnd; c++) spanWidth += widths[c] ?? 0;
        if (spanWidth > 0) {
          tr.setNodeMarkup(tr.mapping.map(cellOffset), undefined, {
            ...cell.attrs,
            width: spanWidth,
            widthType: 'dxa',
            colwidth: null,
          });
        }
      }
      cellOffset += cell.nodeSize;
      cellColIdx += colspan;
    });
    rowOffset += row.nodeSize;
  });

  view.dispatch(tr);
}

/** Bake a row-resize into the PM doc: update the target row's `height` + `heightRule`. */
export function commitRowResize(
  view: EditorView,
  opts: { pmStart: number; rowIdx: number; newHeight: number }
): void {
  const { pmStart, rowIdx, newHeight } = opts;
  const found = findTableAt(view, pmStart);
  if (!found) return;
  const { node, tablePos } = found;

  const tr = view.state.tr;
  let rowOffset = tablePos + 1;
  let idx = 0;
  node.forEach((row) => {
    if (idx === rowIdx) {
      tr.setNodeMarkup(tr.mapping.map(rowOffset), undefined, {
        ...row.attrs,
        height: newHeight,
        heightRule: 'atLeast',
      });
    }
    rowOffset += row.nodeSize;
    idx++;
  });

  view.dispatch(tr);
}

/**
 * Bake a right-edge resize into the PM doc: grow only the last column.
 * Updates `columnWidths[colIdx]` and the cell at `colIdx` in every row.
 * Spanning cells covering `colIdx` are re-summed from the updated grid
 * (see `commitColumnResize`) instead of taking the single-column width.
 */
export function commitRightEdgeResize(
  view: EditorView,
  opts: { pmStart: number; colIdx: number; newWidth: number }
): void {
  const { pmStart, colIdx, newWidth } = opts;
  const found = findTableAt(view, pmStart);
  if (!found) return;
  const { node, tablePos } = found;

  const tr = view.state.tr;
  const widths = [...((node.attrs.columnWidths as number[]) ?? [])];
  widths[colIdx] = newWidth;
  // Fixed layout so Word honors the explicit widths (issue #781).
  tr.setNodeMarkup(tablePos, undefined, {
    ...node.attrs,
    columnWidths: widths,
    tableLayout: 'fixed',
  });

  let rowOffset = tablePos + 1;
  node.forEach((row) => {
    let cellOffset = rowOffset + 1;
    let cellColIdx = 0;
    row.forEach((cell) => {
      const colspan = (cell.attrs.colspan as number) || 1;
      const spanEnd = cellColIdx + colspan;
      if (colspan === 1 && cellColIdx === colIdx) {
        tr.setNodeMarkup(tr.mapping.map(cellOffset), undefined, {
          ...cell.attrs,
          width: newWidth,
          widthType: 'dxa',
          colwidth: null,
        });
      } else if (colspan > 1 && cellColIdx <= colIdx && spanEnd > colIdx) {
        let spanWidth = 0;
        for (let c = cellColIdx; c < spanEnd; c++) spanWidth += widths[c] ?? 0;
        if (spanWidth > 0) {
          tr.setNodeMarkup(tr.mapping.map(cellOffset), undefined, {
            ...cell.attrs,
            width: spanWidth,
            widthType: 'dxa',
            colwidth: null,
          });
        }
      }
      cellOffset += cell.nodeSize;
      cellColIdx += colspan;
    });
    rowOffset += row.nodeSize;
  });

  view.dispatch(tr);
}
