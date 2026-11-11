/**
 * Schema-binding factories for table-insert / row-insert / column-insert
 * commands. Each `make*` factory takes the editor's `schema` and returns a
 * `Command` (or a Command builder) that creates new `paragraph`, `tableCell`,
 * `tableRow`, and `table` nodes via `schema.nodes.*`.
 *
 * Pre-refactor these lived inside `TablePluginExtension.onSchemaReady`'s
 * closure and read `schema` directly. The factory shape is the only path
 * out of that closure that keeps each command pure / testable in isolation.
 */

import type { Node as PMNode, Schema } from 'prosemirror-model';
import { type Command, type EditorState, type Transaction, TextSelection } from 'prosemirror-state';
import { getTableContext } from '../context';
import { buildCellAttrsFromTemplate, buildParagraphAttrsFromTemplate } from './helpers';
import { makeRevisionInfo as makeSuggestionInfo } from '../../../../plugins/revisionIds';
import { SUGGESTION_META } from '../../../../plugins/suggestionMode/state';
import {
  getDocumentStyleResolver,
  getDocumentTheme,
  getDefaultTableStyleId,
} from '../../../../plugins/documentStyles';
import {
  resolvePreferredNewTableStyleId,
  DEFAULT_NEW_TABLE_LOOK,
  type StyleResolver,
} from '../../../../styles';
// Resolve `convertTable` lazily via the registry rather than importing it
// directly: the conversion layer imports the schema singleton, which is built
// from the extensions, so a static import here would close a module cycle that
// breaks the production bundle's init order. See conversion/tableConverterRegistry.
import { getTableConverter } from '../../../../conversion/tableConverterRegistry';
import type { Table, TableRow, TableCell, Theme } from '../../../../../types/document';
import type {
  RevisionInfo,
  TableStructuralChangeInfo,
} from '../../../../../types/content/trackedChange';

/**
 * Build a tracked-row-insertion row + cells. Caller decides where to insert
 * and whether the new row belongs to the header band (`isHeader`) — see the
 * header-band rule documented on `resolveInsertedRowIsHeader`.
 */
function buildSuggestingRow(
  schema: Schema,
  templateRow: PMNode,
  info: import('../../../../../types/content/trackedChange').RevisionInfo,
  isHeader: boolean
): PMNode {
  const cells: PMNode[] = [];
  templateRow.forEach((cell) => {
    // Inherit the reference cell's paragraph formatting (alignment, spacing,
    // default run font) so the new empty cell matches the table's style.
    // Content itself is NOT copied — the cell starts empty.
    const paragraph = schema.nodes.paragraph.create(buildParagraphAttrsFromTemplate(cell));
    const baseAttrs = buildCellAttrsFromTemplate(cell);
    const cellWithMarker = { ...baseAttrs, cellMarker: { kind: 'ins' as const, info } };
    const cellType =
      cell.type.name === 'tableHeader' && schema.nodes.tableHeader
        ? schema.nodes.tableHeader
        : schema.nodes.tableCell;
    cells.push(cellType.create(cellWithMarker, paragraph));
  });
  return schema.nodes.tableRow.create(
    {
      height: templateRow.attrs.height ?? 360,
      heightRule: templateRow.attrs.heightRule ?? 'atLeast',
      isHeader,
      trIns: info,
    },
    cells
  );
}

/**
 * Decide the new row's header status. The header band is the leading run of
 * `isHeader` rows (repeated on every page); blindly copying the reference
 * row's flag would extend it when adding below its last row — Word makes
 * that new row body instead. Adding above always stays inside the reference
 * row's band, so it inherits directly.
 */
function resolveInsertedRowIsHeader(
  table: PMNode,
  rowIndex: number,
  direction: 'above' | 'below'
): boolean {
  const refIsHeader = (table.child(rowIndex).attrs.isHeader as boolean | undefined) ?? false;
  if (!refIsHeader) return false;
  if (direction === 'above') return true;
  const next = rowIndex + 1 < table.childCount ? table.child(rowIndex + 1) : null;
  return (next?.attrs.isHeader as boolean | undefined) ?? false;
}

/**
 * Build a fresh table node with the given dimensions and border color.
 * Default border is thin (4 eighths-of-a-point) black single.
 *
 * If `info` is provided (suggesting mode), every row gets `trIns` and
 * every cell gets `cellMarker: { kind: 'ins', info }` so the new table
 * round-trips as a fully tracked addition — matches Word's convention
 * for "insert table while track-changes is on".
 */
export function makeCreateTable(schema: Schema) {
  return function createTable(
    rows: number,
    cols: number,
    borderColor: string = '000000',
    contentWidthTwips: number = 9360,
    info?: import('../../../../../types/content/trackedChange').RevisionInfo | null
  ): PMNode {
    const tableRows: PMNode[] = [];
    const colWidthTwips = Math.floor(contentWidthTwips / cols);
    const defaultRowHeightTwips = 360; // 0.25in ≈ 24px at 96 DPI
    const defaultRowHeightRule = 'atLeast';

    const defaultBorder = { style: 'single', size: 4, color: { rgb: borderColor } };
    const defaultBorders = {
      top: defaultBorder,
      bottom: defaultBorder,
      left: defaultBorder,
      right: defaultBorder,
    };

    for (let r = 0; r < rows; r++) {
      const cells: PMNode[] = [];
      for (let c = 0; c < cols; c++) {
        const paragraph = schema.nodes.paragraph.create();
        const cellAttrs: Record<string, unknown> = {
          colspan: 1,
          rowspan: 1,
          borders: defaultBorders,
          width: colWidthTwips,
          widthType: 'dxa',
        };
        if (info) {
          cellAttrs.cellMarker = { kind: 'ins' as const, info };
        }
        cells.push(schema.nodes.tableCell.create(cellAttrs, paragraph));
      }
      const rowAttrs: Record<string, unknown> = {
        height: defaultRowHeightTwips,
        heightRule: defaultRowHeightRule,
      };
      if (info) rowAttrs.trIns = info;
      tableRows.push(schema.nodes.tableRow.create(rowAttrs, cells));
    }

    const columnWidths = Array(cols).fill(colWidthTwips);
    return schema.nodes.table.create(
      {
        columnWidths,
        width: contentWidthTwips,
        widthType: 'dxa',
        // Fixed layout so the explicit column widths the editor renders are
        // honored on export — autofit lets Word recompute them (issue #781).
        tableLayout: 'fixed',
      },
      tableRows
    );
  };
}

/**
 * Map a suggesting-mode `RevisionInfo` (PM-attr shape) onto the model's
 * `TableStructuralChangeInfo` so `convertTable` re-bakes it into `trIns` /
 * `cellMarker` attrs — the same round-trip path imported tracked tables take.
 */
function suggestingStructural(
  info: RevisionInfo,
  type: 'tableRowInsertion' | 'tableCellInsertion'
): TableStructuralChangeInfo {
  return {
    type,
    info: { id: info.revisionId, author: info.author, date: info.date ?? undefined },
  };
}

/**
 * Build a new table that adopts `styleId` by constructing the Document-model
 * `Table` and running it through `convertTable` — the single source of truth
 * for the OOXML table-style cascade (borders, default cell margins, and the
 * conditional-format chain: wholeTable → first/last row → first/last col →
 * banding → corners, with theme colors resolved). This guarantees an inserted
 * styled table renders identically to the same styled table on import,
 * instead of duplicating the cascade here.
 *
 * Returns null if the converter hasn't been registered yet (the conversion
 * layer always loads before any edit, via the host's `toProseDoc` call, so in
 * practice this only guards the unexpected case) — the caller then falls back
 * to the plain black-border table.
 */
function createStyledTable(
  rows: number,
  cols: number,
  styleId: string,
  contentWidthTwips: number,
  resolver: StyleResolver,
  theme: Theme | null,
  info?: RevisionInfo | null
): PMNode | null {
  const convertTable = getTableConverter();
  if (!convertTable) return null;
  const colWidthTwips = Math.floor(contentWidthTwips / cols);
  const columnWidths: number[] = Array(cols).fill(colWidthTwips);

  const modelRows: TableRow[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: TableCell[] = [];
    for (let c = 0; c < cols; c++) {
      const cell: TableCell = {
        type: 'tableCell',
        formatting: { width: { value: colWidthTwips, type: 'dxa' } },
        content: [{ type: 'paragraph', content: [] }],
      };
      if (info) cell.structuralChange = suggestingStructural(info, 'tableCellInsertion');
      cells.push(cell);
    }
    const row: TableRow = {
      type: 'tableRow',
      formatting: { height: { value: 360, type: 'dxa' }, heightRule: 'atLeast' },
      cells,
    };
    if (info) row.structuralChange = suggestingStructural(info, 'tableRowInsertion');
    modelRows.push(row);
  }

  const table: Table = {
    type: 'table',
    formatting: {
      width: { value: contentWidthTwips, type: 'dxa' },
      // Fixed layout so the explicit column widths the editor renders are
      // honored on export — autofit lets a reader recompute them (issue #781).
      layout: 'fixed',
      styleId,
      look: { ...DEFAULT_NEW_TABLE_LOOK },
    },
    columnWidths,
    rows: modelRows,
  };

  return convertTable(table, resolver, theme);
}

export function makeInsertTable(schema: Schema) {
  const createTable = makeCreateTable(schema);
  return function insertTable(rows: number, cols: number): Command {
    return (state, dispatch) => {
      const { $from } = state.selection;

      let borderColor = '000000';
      const marks = state.storedMarks || $from.marks();
      for (const mark of marks) {
        if (mark.type.name === 'textColor' && mark.attrs.rgb) {
          borderColor = mark.attrs.rgb;
          break;
        }
      }

      let insertPos = $from.pos;

      // Find the right insertion point: after the current block-level node.
      // When inside a table cell, we insert within the cell (enabling nested tables)
      // rather than after the parent table.
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === 'paragraph' || node.type.name === 'table') {
          insertPos = $from.after(d);
          break;
        }
      }

      if (dispatch) {
        // When inserting inside a table cell, size the new table to fit the cell
        let contentWidthTwips = 9360; // default: full page width
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
            const cellWidth = node.attrs.width as number | undefined;
            if (cellWidth && cellWidth > 0) {
              // Subtract cell padding (~216 twips = 108 left + 108 right)
              contentWidthTwips = Math.max(cellWidth - 216, 360);
            }
            break;
          }
        }
        // In suggesting mode, mint one revision triple and seed every row
        // and cell of the new table with trIns + cellMarker:ins. The new
        // table round-trips as a tracked addition; reject removes the whole
        // table via resolveById, accept clears the markers.
        const suggestingInfo = makeSuggestionInfo(state);

        // Adopt the document's default table style when it declares one
        // (settings `w:defaultTableStyle`, else the type-default table style)
        // so an inserted table matches the document/template. Falls back to a
        // thin black-border grid when no usable default style exists.
        const resolver = getDocumentStyleResolver(state);
        const preferredStyleId = resolvePreferredNewTableStyleId(
          getDefaultTableStyleId(state),
          resolver
        );
        const styledTable =
          preferredStyleId && resolver
            ? createStyledTable(
                rows,
                cols,
                preferredStyleId,
                contentWidthTwips,
                resolver,
                getDocumentTheme(state),
                suggestingInfo
              )
            : null;
        const table =
          styledTable ?? createTable(rows, cols, borderColor, contentWidthTwips, suggestingInfo);
        const emptyParagraph = schema.nodes.paragraph.create();

        const $insert = state.doc.resolve(insertPos);
        const needsLeadingParagraph = $insert.nodeBefore?.type.name === 'table';
        const insertContent = needsLeadingParagraph
          ? [emptyParagraph, table, emptyParagraph]
          : [table, emptyParagraph];

        const tr = state.tr.insert(insertPos, insertContent);

        let tableStartPos = insertPos + 1;
        if (needsLeadingParagraph) {
          tableStartPos += emptyParagraph.nodeSize;
        }

        const firstCellPos = tableStartPos + 1;
        const firstCellContentPos = firstCellPos + 1;
        // `near` lands on the nearest valid inline position regardless of
        // whether the first cell is a `tableCell` or a `tableHeader` (a styled
        // table's first row resolves to header cells when its `tblLook` styles
        // the first row) — avoids a spurious selection-endpoint warning.
        tr.setSelection(TextSelection.near(tr.doc.resolve(firstCellContentPos), 1));
        dispatch(tr.scrollIntoView());
      }

      return true;
    };
  };
}

export function makeAddRowAbove(schema: Schema): Command {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const context = getTableContext(state);
    if (
      !context.isInTable ||
      context.rowIndex === undefined ||
      !context.table ||
      context.tablePos === undefined
    )
      return false;

    if (dispatch) {
      const tr = state.tr;
      const rowNode = context.table.child(context.rowIndex);
      const info = makeSuggestionInfo(state);
      const isHeader = resolveInsertedRowIsHeader(context.table, context.rowIndex, 'above');
      let newRow: PMNode;
      if (info) {
        newRow = buildSuggestingRow(schema, rowNode, info, isHeader);
      } else {
        const cells: PMNode[] = [];
        rowNode.forEach((cell) => {
          // Match the reference cell's paragraph formatting (alignment,
          // spacing, default run font); the new cell itself stays empty.
          const paragraph = schema.nodes.paragraph.create(buildParagraphAttrsFromTemplate(cell));
          const cellAttrs = buildCellAttrsFromTemplate(cell);
          const cellType =
            cell.type.name === 'tableHeader' && schema.nodes.tableHeader
              ? schema.nodes.tableHeader
              : schema.nodes.tableCell;
          cells.push(cellType.create(cellAttrs, paragraph));
        });
        newRow = schema.nodes.tableRow.create(
          {
            height: rowNode.attrs.height ?? 360,
            heightRule: rowNode.attrs.heightRule ?? 'atLeast',
            isHeader,
          },
          cells
        );
      }

      let rowPos = context.tablePos + 1;
      for (let i = 0; i < context.rowIndex; i++) {
        rowPos += context.table.child(i).nodeSize;
      }

      tr.insert(rowPos, newRow);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function makeAddRowBelow(schema: Schema): Command {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const context = getTableContext(state);
    if (
      !context.isInTable ||
      context.rowIndex === undefined ||
      !context.table ||
      context.tablePos === undefined
    )
      return false;

    if (dispatch) {
      const tr = state.tr;
      const rowNode = context.table.child(context.rowIndex);
      const info = makeSuggestionInfo(state);
      const isHeader = resolveInsertedRowIsHeader(context.table, context.rowIndex, 'below');
      let newRow: PMNode;
      if (info) {
        newRow = buildSuggestingRow(schema, rowNode, info, isHeader);
      } else {
        const cells: PMNode[] = [];
        rowNode.forEach((cell) => {
          // Match the reference cell's paragraph formatting (alignment,
          // spacing, default run font); the new cell itself stays empty.
          const paragraph = schema.nodes.paragraph.create(buildParagraphAttrsFromTemplate(cell));
          const cellAttrs = buildCellAttrsFromTemplate(cell);
          const cellType =
            cell.type.name === 'tableHeader' && schema.nodes.tableHeader
              ? schema.nodes.tableHeader
              : schema.nodes.tableCell;
          cells.push(cellType.create(cellAttrs, paragraph));
        });
        newRow = schema.nodes.tableRow.create(
          {
            height: rowNode.attrs.height ?? 360,
            heightRule: rowNode.attrs.heightRule ?? 'atLeast',
            isHeader,
          },
          cells
        );
      }

      let rowPos = context.tablePos + 1;
      for (let i = 0; i <= context.rowIndex; i++) {
        rowPos += context.table.child(i).nodeSize;
      }

      tr.insert(rowPos, newRow);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// Tracked column insertion: in suggesting mode every new cell carries
// `cellMarker: { kind: 'ins' }` under one revision triple (matches the
// "Track column insertion and deletion in suggesting mode" requirement).
// Closed-mode behavior (plain cells, same geometry math) is unchanged.
export function makeAddColumnLeft(schema: Schema): Command {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const context = getTableContext(state);
    if (
      !context.isInTable ||
      context.columnIndex === undefined ||
      !context.table ||
      context.tablePos === undefined
    )
      return false;

    if (dispatch) {
      let tr = state.tr;
      const suggestingInfo = makeSuggestionInfo(state);
      const newColumnCount = (context.columnCount || 1) + 1;
      // Width is stored as 50ths of a percent per ECMA-376 §17.18.111
      // (5000 = 100%) so resolveTableWidthPx can apply it directly.
      const newColWidthPercent = Math.floor(5000 / newColumnCount);
      const rowStarts: number[] = [];
      let rowPos = context.tablePos + 1;

      context.table.forEach((row) => {
        rowStarts.push(rowPos);
        rowPos += row.nodeSize;
      });

      context.table.forEach((row, _offset, rowIndex) => {
        if (row.type.name === 'tableRow') {
          const mappedRowPos = tr.mapping.map(rowStarts[rowIndex]);
          let cellPos = mappedRowPos + 1;
          let colIdx = 0;
          let inserted = false;

          row.forEach((cell) => {
            if (!inserted && colIdx === context.columnIndex) {
              const paragraph = schema.nodes.paragraph.create();
              const cellAttrs: any = buildCellAttrsFromTemplate(cell, {
                colspan: 1,
                rowspan: 1,
              });
              cellAttrs.width = newColWidthPercent;
              cellAttrs.widthType = 'pct';
              if (suggestingInfo) cellAttrs.cellMarker = { kind: 'ins', info: suggestingInfo };
              const newCell = schema.nodes.tableCell.create(cellAttrs, paragraph);
              tr = tr.insert(cellPos, newCell);
              inserted = true;
            }
            cellPos += cell.nodeSize;
            colIdx += cell.attrs.colspan || 1;
          });

          if (!inserted && colIdx <= context.columnIndex!) {
            const paragraph = schema.nodes.paragraph.create();
            const cellAttrs: any = buildCellAttrsFromTemplate(
              row.child(row.childCount - 1) ?? null,
              { colspan: 1, rowspan: 1 }
            );
            cellAttrs.width = newColWidthPercent;
            cellAttrs.widthType = 'pct';
            if (suggestingInfo) cellAttrs.cellMarker = { kind: 'ins', info: suggestingInfo };
            const newCell = schema.nodes.tableCell.create(cellAttrs, paragraph);
            tr = tr.insert(cellPos, newCell);
          }
        }
      });

      const updatedTable = tr.doc.nodeAt(context.tablePos);
      if (updatedTable && updatedTable.type.name === 'table') {
        const firstRow = updatedTable.child(0);
        if (firstRow && firstRow.type.name === 'tableRow') {
          let cellPos = context.tablePos + 2;
          firstRow.forEach((cell) => {
            if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
              tr = tr.setNodeMarkup(cellPos, undefined, {
                ...cell.attrs,
                width: newColWidthPercent,
                widthType: 'pct',
              });
            }
            cellPos += cell.nodeSize;
          });
        }

        // Update table columnWidths so full-width tables resize correctly.
        const colCount = firstRow?.childCount ?? newColumnCount;
        const tableWidthTwips = (updatedTable.attrs.width as number) || 9360;
        const colWidthTwips = Math.floor(tableWidthTwips / Math.max(1, colCount));
        tr = tr.setNodeMarkup(context.tablePos, undefined, {
          ...updatedTable.attrs,
          columnWidths: Array(colCount).fill(colWidthTwips),
        });
      }

      if (suggestingInfo) tr.setMeta(SUGGESTION_META, true);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// Tracked column insertion (right): same `cellMarker: ins` convention as
// `makeAddColumnLeft`. Closed-mode behavior unchanged.
export function makeAddColumnRight(schema: Schema): Command {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const context = getTableContext(state);
    if (
      !context.isInTable ||
      context.columnIndex === undefined ||
      !context.table ||
      context.tablePos === undefined
    )
      return false;

    if (dispatch) {
      let tr = state.tr;
      const suggestingInfo = makeSuggestionInfo(state);
      const newColumnCount = (context.columnCount || 1) + 1;
      // Width is stored as 50ths of a percent per ECMA-376 §17.18.111
      // (5000 = 100%) so resolveTableWidthPx can apply it directly.
      const newColWidthPercent = Math.floor(5000 / newColumnCount);
      const rowStarts: number[] = [];
      let rowPos = context.tablePos + 1;

      context.table.forEach((row) => {
        rowStarts.push(rowPos);
        rowPos += row.nodeSize;
      });

      context.table.forEach((row, _offset, rowIndex) => {
        if (row.type.name === 'tableRow') {
          const mappedRowPos = tr.mapping.map(rowStarts[rowIndex]);
          let cellPos = mappedRowPos + 1;
          let colIdx = 0;
          let inserted = false;

          row.forEach((cell) => {
            cellPos += cell.nodeSize;
            colIdx += cell.attrs.colspan || 1;

            if (!inserted && colIdx > context.columnIndex!) {
              const paragraph = schema.nodes.paragraph.create();
              const cellAttrs: any = buildCellAttrsFromTemplate(cell, {
                colspan: 1,
                rowspan: 1,
              });
              cellAttrs.width = newColWidthPercent;
              cellAttrs.widthType = 'pct';
              if (suggestingInfo) cellAttrs.cellMarker = { kind: 'ins', info: suggestingInfo };
              const newCell = schema.nodes.tableCell.create(cellAttrs, paragraph);
              tr = tr.insert(cellPos, newCell);
              inserted = true;
            }
          });

          if (!inserted) {
            const paragraph = schema.nodes.paragraph.create();
            const cellAttrs: any = buildCellAttrsFromTemplate(
              row.child(row.childCount - 1) ?? null,
              { colspan: 1, rowspan: 1 }
            );
            cellAttrs.width = newColWidthPercent;
            cellAttrs.widthType = 'pct';
            if (suggestingInfo) cellAttrs.cellMarker = { kind: 'ins', info: suggestingInfo };
            const newCell = schema.nodes.tableCell.create(cellAttrs, paragraph);
            tr = tr.insert(cellPos, newCell);
          }
        }
      });

      const updatedTable = tr.doc.nodeAt(context.tablePos);
      if (updatedTable && updatedTable.type.name === 'table') {
        const firstRow = updatedTable.child(0);
        if (firstRow && firstRow.type.name === 'tableRow') {
          let cellPos = context.tablePos + 2;
          firstRow.forEach((cell) => {
            if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
              tr = tr.setNodeMarkup(cellPos, undefined, {
                ...cell.attrs,
                width: newColWidthPercent,
                widthType: 'pct',
              });
            }
            cellPos += cell.nodeSize;
          });
        }

        // Update table columnWidths so full-width tables resize correctly.
        const colCount = firstRow?.childCount ?? newColumnCount;
        const tableWidthTwips = (updatedTable.attrs.width as number) || 9360;
        const colWidthTwips = Math.floor(tableWidthTwips / Math.max(1, colCount));
        tr = tr.setNodeMarkup(context.tablePos, undefined, {
          ...updatedTable.attrs,
          columnWidths: Array(colCount).fill(colWidthTwips),
        });
      }

      if (suggestingInfo) tr.setMeta(SUGGESTION_META, true);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
