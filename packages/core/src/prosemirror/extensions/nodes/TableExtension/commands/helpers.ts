/**
 * Pure runtime helpers shared by the table commands. None reference
 * `schema` — they operate on transactions, selections, and PMNode shapes.
 *
 * - `buildCellAttrsFromTemplate` clones a template cell's structural attrs
 *   so newly inserted rows/columns inherit width, borders, vertical-align,
 *   etc. from the row/column they were created from.
 * - `buildTableGrid` walks the table once to produce two lookup maps used
 *   by every border command: `cellByPos` (PM position → cell info) and
 *   `cellByRC` (row,col → PM position) for adjacent-cell syncing.
 * - `findAncestorNode` walks up the selection for a row/cell ancestor.
 * - `getTargetCellPositions` returns the cell set to operate on: all cells
 *   in the active CellSelection, or just the cell containing the cursor.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';

export function buildCellAttrsFromTemplate(
  templateCell: PMNode | null,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const baseAttrs = templateCell?.attrs ?? {};
  return {
    colspan: baseAttrs.colspan || 1,
    rowspan: 1,
    colwidth: baseAttrs.colwidth,
    width: baseAttrs.width,
    widthType: baseAttrs.widthType,
    verticalAlign: baseAttrs.verticalAlign,
    backgroundColor: baseAttrs.backgroundColor,
    borders: baseAttrs.borders,
    margins: baseAttrs.margins,
    textDirection: baseAttrs.textDirection,
    noWrap: baseAttrs.noWrap,
    ...overrides,
  };
}

/**
 * Clone the text formatting of a template cell's first paragraph so a newly
 * inserted row matches the reference row's style (alignment, spacing, default
 * run font). Identity and tracking attrs (paraId, list numbering, bookmarks,
 * revisions) are intentionally NOT copied — the new cell starts empty and
 * unlisted.
 *
 * Deliberately excluded by design (not oversights):
 * - `numPr` / `numPrFromStyle` + derived list attrs (`listNumFmt`,
 *   `listIsBullet`, `listMarker*`) — a new empty row must not join the
 *   reference cell's numbering sequence.
 * - `tabs`, paragraph `borders` / `shading`, `pageBreakBefore`,
 *   `outlineLevel` — outside the row-inheritance scope; cell-level
 *   borders/shading already come through `buildCellAttrsFromTemplate`.
 */
export function buildParagraphAttrsFromTemplate(
  templateCell: PMNode | null
): Record<string, unknown> | undefined {
  if (!templateCell) return undefined;
  let firstPara: PMNode | undefined;
  templateCell.forEach((child) => {
    if (firstPara === undefined && child.type.name === 'paragraph') firstPara = child;
  });
  if (firstPara === undefined) return undefined;
  const a = firstPara.attrs;
  const out: Record<string, unknown> = {};
  if (a.alignment != null) out.alignment = a.alignment;
  if (a.spaceBefore != null) out.spaceBefore = a.spaceBefore;
  if (a.spaceAfter != null) out.spaceAfter = a.spaceAfter;
  if (a.lineSpacing != null) out.lineSpacing = a.lineSpacing;
  if (a.lineSpacingRule != null) out.lineSpacingRule = a.lineSpacingRule;
  if (a.spacingExplicit != null) out.spacingExplicit = a.spacingExplicit;
  if (a.indentLeft != null) out.indentLeft = a.indentLeft;
  if (a.indentRight != null) out.indentRight = a.indentRight;
  if (a.indentFirstLine != null) out.indentFirstLine = a.indentFirstLine;
  if (a.hangingIndent) out.hangingIndent = a.hangingIndent;
  if (a.styleId != null) out.styleId = a.styleId;
  if (a.defaultTextFormatting != null) {
    // Deep clone: the formatting holds nested objects (color, shading,
    // underline) that must not be shared with the template cell — PM attrs
    // are treated as immutable and an in-place edit would corrupt the row.
    out.defaultTextFormatting = JSON.parse(JSON.stringify(a.defaultTextFormatting)) as Record<
      string,
      unknown
    >;
  }
  if (a.keepNext != null) out.keepNext = a.keepNext;
  if (a.keepLines != null) out.keepLines = a.keepLines;
  if (a.contextualSpacing != null) out.contextualSpacing = a.contextualSpacing;
  if (a.bidi != null) out.bidi = a.bidi;
  return out;
}

/**
 * Walk up from the selection to find the enclosing node matching `typeName`.
 * Returns the node's `before` position and the node itself, or null.
 */
export function findAncestorNode(
  state: EditorState,
  typeName: string
): { pos: number; node: PMNode } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === typeName) {
      return { pos: $from.before(d), node };
    }
  }
  return null;
}

/**
 * Get cell positions to operate on: all cells from CellSelection, or
 * all cells in the table if a single cursor is inside a cell.
 */
export function getTargetCellPositions(state: EditorState): { pos: number; node: PMNode }[] {
  const sel = state.selection;
  if (sel instanceof CellSelection) {
    const cells: { pos: number; node: PMNode }[] = [];
    sel.forEachCell((node, pos) => {
      cells.push({ pos, node });
    });
    return cells;
  }

  const cell = findAncestorNode(state, 'tableCell') ?? findAncestorNode(state, 'tableHeader');
  return cell ? [cell] : [];
}

/**
 * Build a full grid map of all cells in the table: pos → grid info.
 * Also builds a reverse lookup by (rowIdx, colIdx).
 */
export function buildTableGrid(table: PMNode, tableStart: number) {
  const cellByPos = new Map<
    number,
    { rowIdx: number; colIdx: number; colspan: number; pos: number; node: PMNode }
  >();
  const cellByRC = new Map<string, number>(); // "row,col" → pos
  const totalRows = table.childCount;
  let totalCols = 0;

  table.forEach((row, rowOffset, rowIdx) => {
    if (row.type.name !== 'tableRow') return;
    let colIdx = 0;
    row.forEach((cell, cellOffset) => {
      const pos = tableStart + rowOffset + cellOffset + 2;
      const colspan = (cell.attrs.colspan as number) || 1;
      cellByPos.set(pos, { rowIdx, colIdx, colspan, pos, node: cell });
      cellByRC.set(`${rowIdx},${colIdx}`, pos);
      colIdx += colspan;
    });
    totalCols = Math.max(totalCols, colIdx);
  });

  return { cellByPos, cellByRC, totalRows, totalCols };
}
