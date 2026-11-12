/**
 * Table Renderer
 *
 * Renders table fragments to DOM. Handles:
 * - Multi-row tables split across pages
 * - Cell content (paragraphs within cells)
 * - Column widths and cell spans
 * - Basic cell styling (borders, backgrounds)
 */

import type {
  TableFragment,
  TableBlock,
  TableMeasure,
  TableCell,
  TableCellMeasure,
  ParagraphBlock,
  ParagraphMeasure,
  ParagraphFragment,
} from '../layout-engine/types';
import type { RenderContext } from './renderPage';
import { renderFloatingImagesLayer } from './floatingImageLayer';
import { floatingImageIsBehindDoc, floatingImageWrapsText } from './floatingImageFlow';
import { renderParagraphFragment } from './renderParagraph';
import { measureParagraph, type FloatingImageZone } from '../layout-bridge/measuring';
import { rectsToFloatingZones } from '../layout-bridge/measuring/floatingZones';
import { resolveCellGrid } from '../layout-bridge/tableWidthUtils';
import { extractCellFloatingImages } from './renderTableCellFloating';
import {
  applyBorder,
  buildRowYPositions,
  isVisibleBorder,
  makeCutBorder,
  makeTableBodyClip,
} from './renderTableBorders';
import {
  paintCellRevisionCue,
  paintRowRevisionCue,
  paintTableRevisionCue,
} from './renderTableRevisions';

/**
 * CSS class names for table elements
 */
export const TABLE_CLASS_NAMES = {
  table: 'layout-table',
  row: 'layout-table-row',
  cell: 'layout-table-cell',
  cellContent: 'layout-table-cell-content',
  resizeHandle: 'layout-table-resize-handle',
  rowResizeHandle: 'layout-table-row-resize-handle',
  tableEdgeHandleBottom: 'layout-table-edge-handle-bottom',
  tableEdgeHandleRight: 'layout-table-edge-handle-right',
};

/**
 * Options for rendering a table fragment
 */
export interface RenderTableFragmentOptions {
  document?: Document;
}

/**
 * Render cell content (paragraphs and nested tables)
 */
function renderCellContent(
  cell: TableCell,
  cellMeasure: TableCellMeasure,
  context: RenderContext,
  doc: Document
): HTMLElement {
  const contentEl = doc.createElement('div');
  contentEl.className = TABLE_CLASS_NAMES.cellContent;
  contentEl.style.position = 'relative';
  // Cell uses border-box sizing, so content width must subtract padding.
  const padLeft = cell.padding?.left ?? 7;
  const padRight = cell.padding?.right ?? 7;
  const contentWidth = Math.max(0, cellMeasure.width - padLeft - padRight);
  contentEl.style.width = `${contentWidth}px`;

  // Extract floating images from cell paragraphs
  const cellFloatingImages = extractCellFloatingImages(cell, cellMeasure, contentWidth);

  // Build floating zones for measurement and render floating layer. Shares
  // rectsToFloatingZones with the page-level path so side/segments/clamp
  // stay identical (largest, centered both-sides split, near-full-width
  // clamp). Tight/through with a rectangular wrapPolygon (the common
  // serializer output) are equivalent to square; a non-rectangular polygon
  // narrows the exclusion per line via the zone contour.
  let floatingZones: FloatingImageZone[] | undefined;
  if (cellFloatingImages.length > 0) {
    floatingZones = rectsToFloatingZones(
      cellFloatingImages.filter(floatingImageWrapsText).map((img) => ({
        side: img.side,
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
        distTop: img.distTop,
        distBottom: img.distBottom,
        distLeft: img.distLeft,
        distRight: img.distRight,
        wrapText: img.wrapText,
        wrapType: img.wrapType,
        wrapPolygon: img.wrapPolygon,
      })),
      contentWidth
    );

    const behindFloatingImages = cellFloatingImages.filter(floatingImageIsBehindDoc);
    if (behindFloatingImages.length > 0) {
      contentEl.appendChild(
        renderFloatingImagesLayer(behindFloatingImages, doc, {
          layerClass: 'layout-cell-floating-images-layer',
          itemClass: 'layout-cell-floating-image',
          sizing: 'fullSize',
          layerMode: 'behind',
        })
      );
    }
  }

  let cumulativeY = 0;
  let previousParagraphAfter = 0;
  for (let i = 0; i < cell.blocks.length; i++) {
    const block = cell.blocks[i];
    const measure = cellMeasure.blocks[i];

    if (block?.kind === 'paragraph' && measure?.kind === 'paragraph') {
      const paragraphBlock = block as ParagraphBlock;
      let paragraphMeasure = measure as ParagraphMeasure;
      const spacing = paragraphBlock.attrs?.spacing;
      // Match body paginator: max-collapse adjacent paragraph spacing.
      const effectiveSpaceBefore = Math.max(previousParagraphAfter, spacing?.before ?? 0);
      cumulativeY += effectiveSpaceBefore;

      // Re-measure with floating zones if floating images exist in this cell
      if (floatingZones && floatingZones.length > 0) {
        paragraphMeasure = measureParagraph(paragraphBlock, contentWidth, {
          floatingZones,
          paragraphYOffset: cumulativeY,
        });
      }

      // Create synthetic fragment for the paragraph
      const syntheticFragment: ParagraphFragment = {
        kind: 'paragraph',
        blockId: paragraphBlock.id,
        x: 0,
        y: 0,
        width: contentWidth,
        height: paragraphMeasure.totalHeight,
        fromLine: 0,
        toLine: paragraphMeasure.lines.length,
        pmStart: paragraphBlock.pmStart,
        pmEnd: paragraphBlock.pmEnd,
      };

      const cellContext = { ...context, insideTableCell: true as const };
      const fragEl = renderParagraphFragment(
        syntheticFragment,
        paragraphBlock,
        paragraphMeasure,
        cellContext,
        { document: doc }
      );

      fragEl.style.position = 'relative';
      if (effectiveSpaceBefore > 0) {
        fragEl.style.marginTop = `${effectiveSpaceBefore}px`;
      }
      contentEl.appendChild(fragEl);
      cumulativeY += paragraphMeasure.totalHeight;
      previousParagraphAfter = spacing?.after ?? 0;
    } else if (block?.kind === 'table' && measure?.kind === 'table') {
      // Nested table - render in normal document flow.
      // Avoid cumulative marginTop offsets here: cell content already flows vertically,
      // and compounding offsets can produce enormous heights on deeply nested tables.
      const tableBlock = block as TableBlock;
      const tableMeasure = measure as TableMeasure;
      const effectiveSpaceBefore = previousParagraphAfter;

      const nestedTableEl = renderNestedTable(tableBlock, tableMeasure, context, doc);
      nestedTableEl.style.position = 'relative';
      if (effectiveSpaceBefore > 0) {
        nestedTableEl.style.marginTop = `${effectiveSpaceBefore}px`;
      }
      contentEl.appendChild(nestedTableEl);
      cumulativeY += effectiveSpaceBefore + ((measure as TableMeasure).totalHeight ?? 0);
      previousParagraphAfter = 0;
    }
  }

  if (previousParagraphAfter > 0) {
    contentEl.style.paddingBottom = `${previousParagraphAfter}px`;
  }

  const frontFloatingImages = cellFloatingImages.filter((img) => !floatingImageIsBehindDoc(img));
  if (frontFloatingImages.length > 0) {
    contentEl.appendChild(
      renderFloatingImagesLayer(frontFloatingImages, doc, {
        layerClass: 'layout-cell-floating-images-layer',
        itemClass: 'layout-cell-floating-image',
        sizing: 'fullSize',
        layerMode: 'front',
      })
    );
  }

  return contentEl;
}

/**
 * Render a nested table (within a cell)
 */
function renderNestedTable(
  block: TableBlock,
  measure: TableMeasure,
  context: RenderContext,
  doc: Document
): HTMLElement {
  const tableEl = doc.createElement('div');
  tableEl.className = `${TABLE_CLASS_NAMES.table} layout-nested-table`;

  // Positioning (relative, not absolute)
  tableEl.style.position = 'relative';
  tableEl.style.width = `${measure.totalWidth}px`;
  tableEl.style.display = 'block';

  // Table container left offset comes SOLELY from `w:tblInd`
  // (`block.indent`, derived in `toFlowBlocks` from
  // `_originalFormatting.indent[type === 'dxa']`). Never inherit paragraph
  // indent, cell padding, or `fragment.x` arithmetic here — those belong
  // inside the table (cell content / `renderParagraphFragment`), not on the
  // wrapper. Justification wins over indent, matching the layout engine
  // precedence (`layout-engine/index.ts`) and Word (`w:jc` beats `w:tblInd`).
  // Intentionally skipped for floating tables: a floating (`w:tblpPr`) table
  // is anchored via its floating placement, not via indent offset.
  if (!block.floating) {
    if (block.justification === 'center') {
      tableEl.style.marginLeft = 'auto';
      tableEl.style.marginRight = 'auto';
    } else if (block.justification === 'right') {
      tableEl.style.marginLeft = 'auto';
    } else if (block.indent) {
      tableEl.style.marginLeft = `${block.indent}px`;
    }
  }

  // Store metadata
  tableEl.dataset.blockId = String(block.id);

  if (block.pmStart !== undefined) {
    tableEl.dataset.pmStart = String(block.pmStart);
  }
  if (block.pmEnd !== undefined) {
    tableEl.dataset.pmEnd = String(block.pmEnd);
  }

  // Whole-table tracked insertion / deletion paints ONE tall bar on the
  // table (see `paintTableRevisionCue`); tell renderTableRow to skip the
  // per-row bar in that case.
  const wholeTableTracked = paintTableRevisionCue(tableEl, block);

  const rowYPositions = buildRowYPositions(measure.rows);

  // RTL nested table (`w:bidiVisual`): mirror column geometry, same as the
  // top-level renderer.
  const bidi = block.bidi === true;
  const tableWidth = measure.columnWidths.reduce((w, cw) => w + (cw ?? 0), 0);

  // Shared grid placement so merged cells after the first group land in
  // their Word columns (same source the measurer uses).
  const nestedGrid = computeCellGrid(block, measure.columnWidths);
  const nestedGridLookup = new Map<string, GridCell>(
    nestedGrid.map((g) => [`${g.rowIndex}-${g.cellIndex}`, g])
  );

  // Track spanning cells across rows
  const spanningCells = new Map<string, SpanningCell>();

  // Render all rows
  for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex++) {
    const row = block.rows[rowIndex];
    const rowMeasure = measure.rows[rowIndex];

    if (!row || !rowMeasure) continue;

    const rowEl = renderTableRow(
      row,
      rowMeasure,
      rowIndex,
      rowYPositions[rowIndex] ?? 0,
      measure.columnWidths,
      block.rows.length,
      context,
      doc,
      spanningCells,
      rowYPositions,
      undefined,
      wholeTableTracked,
      bidi,
      tableWidth,
      nestedGridLookup
    );
    tableEl.appendChild(rowEl);
  }

  // Match the rounded row stack so the outer box and the rows agree to the px.
  tableEl.style.height = `${rowYPositions[block.rows.length] ?? 0}px`;

  return tableEl;
}

/**
 * Render a single table cell
 */
function renderTableCell(
  cell: TableCell,
  cellMeasure: TableCellMeasure,
  x: number,
  rowHeight: number,
  borderFlags: {
    isFirstRow: boolean;
    isLastRow: boolean;
    isFirstCol: boolean;
    isLastCol: boolean;
  },
  context: RenderContext,
  doc: Document,
  /** Row-level tracked revision id (if any). When the cell's tracked
   * marker shares this id, the row visual already covers it — suppress
   * the per-cell border / background to avoid stacking 2-3 green visuals
   * on the same cell. */
  parentRowRevisionId?: number
): HTMLElement {
  const cellEl = doc.createElement('div');
  cellEl.className = TABLE_CLASS_NAMES.cell;

  paintCellRevisionCue(cellEl, cell, parentRowRevisionId);

  // Positioning
  cellEl.style.position = 'absolute';
  cellEl.style.left = `${x}px`;
  cellEl.style.top = '0';
  cellEl.style.width = `${cellMeasure.width}px`;
  cellEl.style.height = `${rowHeight}px`;
  cellEl.style.overflow = 'hidden';
  cellEl.style.boxSizing = 'border-box';
  // Per-cell padding from DOCX margins. Top/bottom default to 0 to match
  // the measurer (`measureTableBlock`, DEFAULT_CELL_PADDING_Y = 0) — the
  // painter must not reserve 2px/cell the layout engine didn't account
  // for, otherwise the painted stack exceeds the reserved block height
  // and overlaps following content.
  const padTop = cell.padding?.top ?? 0;
  const padRight = cell.padding?.right ?? 7;
  const padBottom = cell.padding?.bottom ?? 0;
  const padLeft = cell.padding?.left ?? 7;
  cellEl.style.padding = `${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`;

  // Apply borders - use cell borders if available, otherwise no border
  if (cell.borders) {
    // Collapse shared borders to avoid double-thick lines.
    // Strategy: "bottom wins" for rows, "right wins" for columns.
    // Each cell's bottom border represents the shared edge with the row below.
    // Each cell's right border represents the shared edge with the column to its right.
    // Only the first row draws its top border (table's top edge).
    // Only the first column draws its left border (table's left edge).
    if (borderFlags.isFirstRow) {
      applyBorder(cellEl, 'top', cell.borders.top);
    }
    applyBorder(cellEl, 'right', cell.borders.right);
    applyBorder(cellEl, 'bottom', cell.borders.bottom);
    if (borderFlags.isFirstCol) applyBorder(cellEl, 'left', cell.borders.left);
  }
  // No default border - cells without explicit borders should be borderless

  // Background color
  if (cell.background) {
    cellEl.style.backgroundColor = cell.background;
  }

  // `w:noWrap` (§17.4.30): forbid soft-wrapping inside the cell. We apply
  // it on the cell box so descendants pick it up by inheritance — paragraph
  // lines remain a single visual line that may grow the cell's effective
  // content width past its measured size.
  if (cell.noWrap) {
    cellEl.style.whiteSpace = 'nowrap';
  }

  // Vertical alignment. When the content fills or overflows the cell box
  // (e.g. a vertically-merged cell whose content was distributed to span its
  // rows), Word top-anchors it — vAlign only positions the leftover slack.
  // Forcing top here also keeps the painted lines aligned with the break
  // offsets the paginator computed (which assume top-anchored content).
  const contentFillsBox = (cellMeasure.height ?? 0) >= rowHeight - 0.5;
  if (cell.verticalAlign && !contentFillsBox) {
    cellEl.style.display = 'flex';
    cellEl.style.flexDirection = 'column';
    switch (cell.verticalAlign) {
      case 'top':
        cellEl.style.justifyContent = 'flex-start';
        break;
      case 'center':
        cellEl.style.justifyContent = 'center';
        break;
      case 'bottom':
        cellEl.style.justifyContent = 'flex-end';
        break;
    }
  }

  // Render cell content
  const contentEl = renderCellContent(cell, cellMeasure, context, doc);
  cellEl.appendChild(contentEl);

  // Store PM positions for selection
  if (cell.blocks.length > 0) {
    const firstBlock = cell.blocks[0];
    const lastBlock = cell.blocks[cell.blocks.length - 1];
    if (firstBlock && 'pmStart' in firstBlock && firstBlock.pmStart !== undefined) {
      cellEl.dataset.pmStart = String(firstBlock.pmStart);
    }
    if (lastBlock && 'pmEnd' in lastBlock && lastBlock.pmEnd !== undefined) {
      cellEl.dataset.pmEnd = String(lastBlock.pmEnd);
    }
  }

  return cellEl;
}

/**
 * Track cells that span multiple rows
 */
type SpanningCell = {
  cell: TableCell;
  cellMeasure: TableCellMeasure;
  columnIndex: number;
  startRow: number;
  rowSpan: number;
  colSpan: number;
  x: number;
  totalHeight: number;
};

/** A merged cell resolved for cross-fragment re-emit (grid placement + x). */
type GridCell = {
  rowIndex: number;
  cellIndex: number;
  columnIndex: number;
  x: number;
  colSpan: number;
  rowSpan: number;
  cell: TableCell;
};

/**
 * Resolve each cell's column index (via the shared grid resolver) and add its
 * pixel x offset from this table's column widths.
 */
function computeCellGrid(block: TableBlock, columnWidths: number[]): GridCell[] {
  // RTL table (`w:bidiVisual`): mirror x so logical column 0 lands at the right
  // edge (width unchanged). vmerge re-emit + cut-edge borders inherit GridCell.x.
  const bidi = block.bidi === true;
  const tableWidth = bidi ? columnWidths.reduce((w, cw) => w + (cw ?? 0), 0) : 0;
  return resolveCellGrid(block).map((g) => {
    let x = 0;
    for (let c = 0; c < g.columnIndex; c++) x += columnWidths[c] ?? 0;
    if (bidi) {
      let cellWidth = 0;
      for (let c = 0; c < g.colSpan; c++) cellWidth += columnWidths[g.columnIndex + c] ?? 0;
      x = tableWidth - x - cellWidth;
    }
    return {
      rowIndex: g.rowIndex,
      cellIndex: g.cellIndex,
      columnIndex: g.columnIndex,
      x,
      colSpan: g.colSpan,
      rowSpan: g.rowSpan,
      cell: block.rows[g.rowIndex]!.cells[g.cellIndex]!,
    };
  });
}

/**
 * Render a table row with rowSpan support
 */
function renderTableRow(
  row: TableBlock['rows'][number],
  rowMeasure: TableMeasure['rows'][number],
  rowIndex: number,
  y: number,
  columnWidths: number[],
  totalRows: number,
  context: RenderContext,
  doc: Document,
  spanningCells?: Map<string, SpanningCell>,
  rowYPositions?: number[],
  isFirstRowInFragment?: boolean,
  /** When the parent table already carries a whole-table revision bar,
   * the per-row bar would double-paint. Suppress. */
  suppressRowRevisionVisual?: boolean,
  /** RTL table (`w:bidiVisual`): mirror cell x and swap first/last column. */
  bidi = false,
  /** Sum of `columnWidths`, used to mirror x when `bidi`. */
  tableWidth = 0,
  /** Shared grid placement (`computeCellGrid` / `resolveCellGrid`) keyed
   * `${rowIndex}-${cellIndex}`. When present, the painter uses the grid's
   * `columnIndex` (not its own sequential walk) so it agrees with the
   * measurer (`measureTableBlock`) and the row-break paginator — this is
   * what keeps cells after the first merged group and non-first-column
   * `w:vMerge` continuations in their Word columns. */
  gridLookup?: Map<string, GridCell>
): HTMLElement {
  const rowEl = doc.createElement('div');
  rowEl.className = TABLE_CLASS_NAMES.row;

  // Tracked-row cue (sidebar reads the same data attrs as cells).
  paintRowRevisionCue(rowEl, row, suppressRowRevisionVisual);

  // Use the pixel-rounded row height (diff of rounded row offsets) so the row
  // box edges — and the borders on them — sit on whole pixels. Falls back to
  // the measured height when row offsets aren't supplied (defensive).
  const renderedRowHeight =
    rowYPositions && rowYPositions.length > rowIndex + 1
      ? (rowYPositions[rowIndex + 1] ?? 0) - (rowYPositions[rowIndex] ?? 0)
      : rowMeasure.height;

  // Positioning
  rowEl.style.position = 'absolute';
  rowEl.style.left = '0';
  rowEl.style.top = `${y}px`;
  rowEl.style.width = '100%';
  rowEl.style.height = `${renderedRowHeight}px`;

  // Data attributes
  rowEl.dataset.rowIndex = String(rowIndex);

  // Build set of columns occupied by spanning cells from previous rows.
  // Prefer the shared grid (all merges spanning this row) over the
  // incremental `spanningCells` map so placement agrees with the measurer
  // even for non-rectangular input (orphan `w:vMerge` continuations,
  // L-shaped merges) — the sequential walk alone drifts after the first
  // merged group in those cases.
  const occupiedColumns = new Set<number>();
  if (gridLookup) {
    for (const g of gridLookup.values()) {
      if (g.rowIndex < rowIndex && g.rowIndex + g.rowSpan > rowIndex) {
        for (let c = 0; c < g.colSpan; c++) {
          occupiedColumns.add(g.columnIndex + c);
        }
      }
    }
  } else if (spanningCells) {
    for (const [, spanCell] of spanningCells) {
      // Check if this spanning cell covers the current row
      if (spanCell.startRow < rowIndex && spanCell.startRow + spanCell.rowSpan > rowIndex) {
        for (let c = 0; c < spanCell.colSpan; c++) {
          occupiedColumns.add(spanCell.columnIndex + c);
        }
      }
    }
  }

  // Render cells
  // Track actual column index separately from cell index
  // because cells with colSpan > 1 span multiple columns
  let x = 0;
  let columnIndex = 0;

  // Skip columns occupied by spanning cells
  while (occupiedColumns.has(columnIndex)) {
    x += columnWidths[columnIndex] ?? 0;
    columnIndex++;
  }

  for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex++) {
    const cell = row.cells[cellIndex];
    const cellMeasure = rowMeasure.cells[cellIndex];

    if (!cell || !cellMeasure) continue;

    const colSpan = cell.colSpan ?? 1;
    const rowSpan = cell.rowSpan ?? 1;

    // Prefer the shared grid placement so cells after the first merged
    // group and non-first-column `w:vMerge` continuations land in their
    // Word columns. The sequential `x`/`columnIndex` walk stays as the
    // fallback when a grid entry is missing (defensive).
    const gridEntry = gridLookup?.get(`${rowIndex}-${cellIndex}`);
    let effectiveColumnIndex = columnIndex;
    let effectiveX = x;
    if (gridEntry) {
      effectiveColumnIndex = gridEntry.columnIndex;
      effectiveX = 0;
      for (let c = 0; c < effectiveColumnIndex; c++) effectiveX += columnWidths[c] ?? 0;
    }

    // Calculate cell height - for spanning cells, use total height of spanned rows
    let cellHeight = renderedRowHeight;
    if (rowSpan > 1 && rowYPositions) {
      cellHeight = 0;
      for (let r = rowIndex; r < rowIndex + rowSpan && r < rowYPositions.length - 1; r++) {
        cellHeight += (rowYPositions[r + 1] ?? 0) - (rowYPositions[r] ?? 0);
      }
      // Fallback if rowYPositions doesn't have enough entries
      if (cellHeight === 0) {
        cellHeight = rowMeasure.height * rowSpan;
      }
    }

    // Column-span width, computed up front so an RTL cell can mirror its x.
    // Index by the grid column so a drifted sequential walk can't size the
    // cell from the wrong columns.
    let cellWidth = 0;
    for (let c = 0; c < colSpan && effectiveColumnIndex + c < columnWidths.length; c++) {
      cellWidth += columnWidths[effectiveColumnIndex + c] ?? 0;
    }

    const isFirstRow = rowIndex === 0 || isFirstRowInFragment === true;
    const isLastRow = rowIndex + rowSpan >= totalRows;
    // In an RTL table the visual first/last columns are the logical last/first.
    const isFirstCol = bidi
      ? effectiveColumnIndex + colSpan >= columnWidths.length
      : effectiveColumnIndex === 0;
    const isLastCol = bidi
      ? effectiveColumnIndex === 0
      : effectiveColumnIndex + colSpan >= columnWidths.length;

    const cellEl = renderTableCell(
      cell,
      cellMeasure,
      bidi ? tableWidth - effectiveX - cellWidth : effectiveX,
      cellHeight,
      { isFirstRow, isLastRow, isFirstCol, isLastCol },
      context,
      doc,
      row.trackedIns?.revisionId ?? row.trackedDel?.revisionId
    );
    cellEl.dataset.cellIndex = String(cellIndex);
    cellEl.dataset.columnIndex = String(effectiveColumnIndex);

    // Store rowSpan info for styling
    if (rowSpan > 1) {
      cellEl.dataset.rowSpan = String(rowSpan);
    }

    rowEl.appendChild(cellEl);

    // Track this cell as spanning if it spans multiple rows
    if (rowSpan > 1 && spanningCells) {
      const key = `${rowIndex}-${effectiveColumnIndex}`;
      spanningCells.set(key, {
        cell,
        cellMeasure,
        columnIndex: effectiveColumnIndex,
        startRow: rowIndex,
        rowSpan,
        colSpan,
        x: effectiveX,
        totalHeight: cellHeight,
      });
    }

    // Move x by the width of columns this cell spans (logical left-to-right;
    // the mirror is applied per-cell above, not to this running accumulator).
    // Keep the sequential walk in lockstep with the grid so fallback cells
    // without a grid entry still advance from the right base.
    x = effectiveX + cellWidth;

    // Advance column index by colSpan
    columnIndex = effectiveColumnIndex + colSpan;

    // Skip columns occupied by spanning cells
    while (occupiedColumns.has(columnIndex)) {
      x += columnWidths[columnIndex] ?? 0;
      columnIndex++;
    }
  }

  return rowEl;
}

/**
 * Render a table fragment to DOM
 *
 * @param fragment - The table fragment to render
 * @param block - The full table block
 * @param measure - The full table measure
 * @param context - Rendering context
 * @param options - Rendering options
 * @returns The table DOM element
 */
export function renderTableFragment(
  fragment: TableFragment,
  block: TableBlock,
  measure: TableMeasure,
  context: RenderContext,
  options: RenderTableFragmentOptions = {}
): HTMLElement {
  const doc = options.document ?? document;

  const tableEl = doc.createElement('div');
  tableEl.className = TABLE_CLASS_NAMES.table;

  // Outer positioning: body's per-page layout uses `absolute` (caller sets
  // x/y via applyFragmentStyles); HF / textbox flow blocks vertically and
  // pass `positioning: 'flow'` so the table participates in normal document
  // flow instead. Pre-PR (#379) those callers had to overwrite the inline
  // style after the renderer call.
  tableEl.style.position = context.positioning === 'flow' ? 'relative' : 'absolute';
  tableEl.style.width = `${fragment.width}px`;
  // Table container left offset in flow mode (HF / textbox) comes SOLELY
  // from `w:tblInd` (`block.indent`). The absolute body path intentionally
  // sets no margin — `applyFragmentStyles` already placed `left` from
  // `fragment.x` (column origin + `w:tblInd`), so adding a margin there
  // would double-count the indent. Never read paragraph indent here.
  if (context.positioning === 'flow' && !block.floating) {
    if (block.justification === 'center') {
      tableEl.style.marginLeft = 'auto';
      tableEl.style.marginRight = 'auto';
    } else if (block.justification === 'right') {
      tableEl.style.marginLeft = 'auto';
    } else if (block.indent) {
      tableEl.style.marginLeft = `${block.indent}px`;
    }
  }
  // Height is set below from the rounded row stack (`paintedHeight`) once the
  // window geometry is known — clamped to the engine's `fragment.height` so
  // the paint never runs taller than the reserved block height (which would
  // overlap following content). The engine height already includes all rows
  // + cell padding + borders; the painter only snaps it to whole pixels.
  tableEl.style.overflow = 'hidden';

  // Store metadata
  tableEl.dataset.blockId = String(fragment.blockId);
  tableEl.dataset.fromRow = String(fragment.fromRow);
  tableEl.dataset.toRow = String(fragment.toRow);

  if (fragment.pmStart !== undefined) {
    tableEl.dataset.pmStart = String(fragment.pmStart);
  }
  if (fragment.pmEnd !== undefined) {
    tableEl.dataset.pmEnd = String(fragment.pmEnd);
  }

  // Whole-table tracked insertion / deletion paints ONE tall bar on the
  // table; per-row bars are suppressed in that case. The bar extends into
  // the page margin (see `paintTableRevisionCue`).
  const fragWholeTableTracked = paintTableRevisionCue(tableEl, block, true);

  // RTL table mirror axis (see computeCellGrid), reused by the handles below.
  const bidi = block.bidi === true;
  const tableWidth = measure.columnWidths.reduce((w, cw) => w + (cw ?? 0), 0);

  const rowYPositions = buildRowYPositions(measure.rows);

  // Resolve cell grid placement once (column index + x per cell).
  const grid = computeCellGrid(block, measure.columnWidths);
  // Shared lookup for `renderTableRow` so the painter, the measurer, and
  // the row-break paginator agree on every cell's column (fixes drift
  // after the first merged group and non-first-column `w:vMerge`).
  const gridLookup = new Map<string, GridCell>(
    grid.map((g) => [`${g.rowIndex}-${g.cellIndex}`, g])
  );

  // Render repeated header rows for continuation fragments at the very top of
  // the fragment, in their own coordinate space above the windowed body.
  const headerRowCount = fragment.headerRowCount ?? 0;
  let headerHeight = 0;
  if (headerRowCount > 0 && fragment.continuesFromPrev) {
    const headerSpans = new Map<string, SpanningCell>();
    for (let hdrIdx = 0; hdrIdx < headerRowCount; hdrIdx++) {
      const hdrRow = block.rows[hdrIdx];
      const hdrRowMeasure = measure.rows[hdrIdx];
      if (!hdrRow || !hdrRowMeasure) continue;

      const rowEl = renderTableRow(
        hdrRow,
        hdrRowMeasure,
        hdrIdx,
        headerHeight,
        measure.columnWidths,
        block.rows.length,
        context,
        doc,
        headerSpans,
        rowYPositions,
        hdrIdx === 0, // first header row draws top border
        fragWholeTableTracked,
        bidi,
        tableWidth,
        gridLookup
      );
      rowEl.dataset.repeatedHeader = 'true';
      tableEl.appendChild(rowEl);
      // Accumulate from the rounded row stack (not the unrounded measure)
      // so the header and the windowed body share one pixel grid.
      headerHeight += (rowYPositions[hdrIdx + 1] ?? 0) - (rowYPositions[hdrIdx] ?? 0);
    }
  }

  // This fragment shows a vertical window of the table starting at `winTop`
  // (full-table coordinates). Body rows render translated by `-winTop` and the
  // table's `overflow:hidden` clips anything outside the window — so a row that
  // broke mid-content (topClip) or a tall cell spilling past the page bottom
  // are clipped automatically, and the slice continues on the next fragment.
  const winTop = (rowYPositions[fragment.fromRow] ?? 0) + (fragment.topClip ?? 0);
  const toFragmentY = (fullY: number): number => headerHeight + (fullY - winTop);

  // Visible height of this fragment's window. For a clean bottom (a real row
  // boundary) use the rounded row stack so the last row's bottom border sits
  // exactly on the clip edge (not 1px past it, which overflow:hidden would eat);
  // for a mid-content break, clip at the rounded fragment height. The stack
  // already includes all rows + cell padding + borders; the padding default
  // above is aligned with the measurer so the paint agrees with the reserved
  // block height and following content is not overlapped.
  const visibleHeight =
    fragment.bottomClip !== undefined
      ? Math.round(fragment.height)
      : toFragmentY(rowYPositions[fragment.toRow] ?? 0);
  tableEl.style.height = `${visibleHeight}px`;

  // A repeated header occupies [0, headerHeight]; the windowed body gets its own
  // clip box below it so a row resumed mid-content doesn't paint over the header
  // (see makeTableBodyClip). With no header, the table element is reused as-is.
  const { bodyParent, bodyOriginY } = makeTableBodyClip(
    tableEl,
    headerHeight,
    visibleHeight,
    fragment.width,
    doc
  );
  // Full-table Y within `bodyParent` (== toFragmentY when there's no clip box).
  const toBodyY = (fullY: number): number => toFragmentY(fullY) - bodyOriginY;

  // Track spanning cells across rows within this fragment.
  const spanningCells = new Map<string, SpanningCell>();

  // Re-emit vertically-merged cells whose restart row is on an EARLIER
  // fragment but whose span reaches into this one. This flows the merged
  // content across the break: the cell is positioned at its true (negative)
  // top, and overflow:hidden hides the slice already shown on the prior page.
  // (Column occupancy for body rows comes from the shared `gridLookup`, not
  // from this map — so no occupancy seeding is needed here.)
  const drawsHeaderRows = headerRowCount > 0 && fragment.continuesFromPrev;
  for (const g of grid) {
    if (g.rowSpan <= 1) continue;
    if (g.rowIndex >= fragment.fromRow) continue; // starts in this fragment → its row draws it
    if (g.rowIndex + g.rowSpan <= fragment.fromRow) continue; // ends before this fragment
    // A merged cell whose restart row is a repeated header is already drawn by
    // the header pass above — don't re-emit it (would double-paint).
    if (drawsHeaderRows && g.rowIndex < headerRowCount) continue;
    const cellMeasure = measure.rows[g.rowIndex]?.cells?.[g.cellIndex];
    if (!cellMeasure) continue;

    let spanHeight = 0;
    for (let r = g.rowIndex; r < g.rowIndex + g.rowSpan && r < rowYPositions.length - 1; r++) {
      spanHeight += (rowYPositions[r + 1] ?? 0) - (rowYPositions[r] ?? 0);
    }

    const isLastRow = g.rowIndex + g.rowSpan >= block.rows.length;
    // RTL: visual first/last columns are the logical last/first.
    const isFirstCol = bidi
      ? g.columnIndex + g.colSpan >= measure.columnWidths.length
      : g.columnIndex === 0;
    const isLastCol = bidi
      ? g.columnIndex === 0
      : g.columnIndex + g.colSpan >= measure.columnWidths.length;
    const cellEl = renderTableCell(
      g.cell,
      cellMeasure,
      g.x,
      spanHeight,
      { isFirstRow: false, isLastRow, isFirstCol, isLastCol },
      context,
      doc
    );
    cellEl.style.top = `${toBodyY(rowYPositions[g.rowIndex] ?? 0)}px`;
    cellEl.dataset.columnIndex = String(g.columnIndex);
    // Synthetic continuation slice: not directly selectable (the editable cell
    // lives on the fragment that owns its restart row).
    cellEl.dataset.vmergeContinuation = 'true';
    delete cellEl.dataset.pmStart;
    delete cellEl.dataset.pmEnd;
    bodyParent.appendChild(cellEl);
  }

  // Render content rows from fragment.fromRow to fragment.toRow in window coords.
  for (let rowIndex = fragment.fromRow; rowIndex < fragment.toRow; rowIndex++) {
    const row = block.rows[rowIndex];
    const rowMeasure = measure.rows[rowIndex];

    if (!row || !rowMeasure) continue;

    // A clean continuation boundary draws the row's top border; a row that
    // broke mid-content (topClip) does not (its top is above the window anyway).
    const isFirstRowInFragment =
      headerRowCount > 0 && fragment.continuesFromPrev
        ? false
        : fragment.continuesFromPrev && rowIndex === fragment.fromRow && !fragment.topClip;

    const rowEl = renderTableRow(
      row,
      rowMeasure,
      rowIndex,
      toBodyY(rowYPositions[rowIndex] ?? 0),
      measure.columnWidths,
      block.rows.length,
      context,
      doc,
      spanningCells,
      rowYPositions,
      isFirstRowInFragment,
      fragWholeTableTracked,
      bidi,
      tableWidth,
      gridLookup
    );

    bodyParent.appendChild(rowEl);
  }

  // Close a fragment at a page break with a horizontal border on the cut edge,
  // the way Word does — otherwise the cell's own top/bottom border is off-window
  // (clipped) and the fragment looks open at the break. Emit one rule per column
  // (using the cell active in that column) so per-column border styles, colSpans,
  // merged columns, and borderless columns are all respected.
  //
  // `onlySpanning` limits drawing to cells that actually cross the edge — used at
  // a clean row boundary, where ordinary cells already drew their own border and
  // only a vertically-merged cell spanning into the next/prev fragment is open.
  const drawCutEdge = (
    cutRow: number,
    side: 'top' | 'bottom',
    topY: number,
    onlySpanning: boolean
  ) => {
    for (const g of grid) {
      // Cell must be present in (or span through) the cut row.
      if (g.rowIndex > cutRow || g.rowIndex + g.rowSpan - 1 < cutRow) continue;
      if (onlySpanning) {
        const crosses =
          side === 'bottom' ? g.rowIndex + g.rowSpan - 1 > cutRow : g.rowIndex < cutRow;
        if (!crosses) continue;
      }
      const spec = g.cell.borders?.[side];
      if (!isVisibleBorder(spec)) continue;
      let width = 0;
      for (let c = 0; c < g.colSpan; c++) width += measure.columnWidths[g.columnIndex + c] ?? 0;
      tableEl.appendChild(makeCutBorder(doc, { x: g.x, topY, width, edge: side, border: spec }));
    }
  };
  // Top edge: a row broken mid-content (topClip) closes every column; a clean
  // continuation only needs the merged cells that span in from the prior page.
  if (fragment.topClip) drawCutEdge(fragment.fromRow, 'top', headerHeight, false);
  else if (fragment.continuesFromPrev) drawCutEdge(fragment.fromRow, 'top', headerHeight, true);
  // Bottom edge: same, mirrored. Anchor to the element's actual bottom
  // (`visibleHeight`) so the rule sits exactly on the clip edge.
  if (fragment.bottomClip !== undefined)
    drawCutEdge(fragment.toRow - 1, 'bottom', visibleHeight, false);
  else if (fragment.continuesOnNext) drawCutEdge(fragment.toRow - 1, 'bottom', visibleHeight, true);

  // Column resize handles at each inter-column boundary. Appended after the
  // row/cell boxes (absolutely-positioned siblings with auto z-index that
  // would otherwise capture the mousedown) but BEFORE the row/edge resize
  // handles: all handles share zIndex 10, so DOM order wins hit-testing and
  // the row/edge handles keep their 6px crossing points.
  let handleX = 0;
  for (let col = 0; col < measure.columnWidths.length - 1; col++) {
    handleX += measure.columnWidths[col] ?? 0;
    const handle = doc.createElement('div');
    handle.className = TABLE_CLASS_NAMES.resizeHandle;
    handle.style.position = 'absolute';
    handle.style.left = `${(bidi ? tableWidth - handleX : handleX) - 3}px`;
    handle.style.top = '0';
    handle.style.width = '6px';
    handle.style.height = '100%';
    handle.style.cursor = 'col-resize';
    handle.style.zIndex = '10';
    handle.dataset.columnIndex = String(col);
    handle.dataset.tableBlockId = String(fragment.blockId);
    if (fragment.pmStart !== undefined) {
      handle.dataset.tablePmStart = String(fragment.pmStart);
    }
    tableEl.appendChild(handle);
  }

  // Row resize handles at row boundaries that fall inside the visible window.
  for (let rowIdx = fragment.fromRow; rowIdx < fragment.toRow - 1; rowIdx++) {
    const boundaryY = toFragmentY(rowYPositions[rowIdx + 1] ?? 0);
    if (boundaryY <= headerHeight || boundaryY >= fragment.height) continue;
    const rowHandle = doc.createElement('div');
    rowHandle.className = TABLE_CLASS_NAMES.rowResizeHandle;
    rowHandle.style.position = 'absolute';
    rowHandle.style.left = '0';
    rowHandle.style.top = `${boundaryY - 3}px`;
    rowHandle.style.width = '100%';
    rowHandle.style.height = '6px';
    rowHandle.style.cursor = 'row-resize';
    rowHandle.style.zIndex = '10';
    rowHandle.dataset.rowIndex = String(rowIdx);
    rowHandle.dataset.tableBlockId = String(fragment.blockId);
    if (fragment.pmStart !== undefined) {
      rowHandle.dataset.tablePmStart = String(fragment.pmStart);
    }
    tableEl.appendChild(rowHandle);
  }

  // Bottom edge handle — only on the fragment that ends the table.
  const endsTable = fragment.toRow === block.rows.length && fragment.bottomClip === undefined;
  if (endsTable) {
    const bottomHandle = doc.createElement('div');
    bottomHandle.className = TABLE_CLASS_NAMES.tableEdgeHandleBottom;
    bottomHandle.style.position = 'absolute';
    bottomHandle.style.left = '0';
    bottomHandle.style.top = `${toFragmentY(rowYPositions[fragment.toRow] ?? 0) - 3}px`;
    bottomHandle.style.width = '100%';
    bottomHandle.style.height = '6px';
    bottomHandle.style.cursor = 'row-resize';
    bottomHandle.style.zIndex = '10';
    bottomHandle.dataset.rowIndex = String(block.rows.length - 1);
    bottomHandle.dataset.tableBlockId = String(fragment.blockId);
    bottomHandle.dataset.isEdge = 'bottom';
    if (fragment.pmStart !== undefined) {
      bottomHandle.dataset.tablePmStart = String(fragment.pmStart);
    }
    tableEl.appendChild(bottomHandle);
  }

  // Right edge handle (only on fragments containing the last row)
  if (endsTable) {
    const rightHandle = doc.createElement('div');
    rightHandle.className = TABLE_CLASS_NAMES.tableEdgeHandleRight;
    rightHandle.style.position = 'absolute';
    rightHandle.style.left = `${tableWidth - 3}px`;
    rightHandle.style.top = '0';
    rightHandle.style.width = '6px';
    rightHandle.style.height = '100%';
    rightHandle.style.cursor = 'col-resize';
    rightHandle.style.zIndex = '10';
    rightHandle.dataset.columnIndex = String(measure.columnWidths.length - 1);
    rightHandle.dataset.tableBlockId = String(fragment.blockId);
    rightHandle.dataset.isEdge = 'right';
    if (fragment.pmStart !== undefined) {
      rightHandle.dataset.tablePmStart = String(fragment.pmStart);
    }
    tableEl.appendChild(rightHandle);
  }

  return tableEl;
}
