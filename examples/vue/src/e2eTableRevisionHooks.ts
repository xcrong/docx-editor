/**
 * E2E-only table-revision hooks for the Vue demo (not a public API).
 *
 * Extracted from App.vue so the demo component stays under the eslint
 * `max-lines` cap — mirrors `examples/vite/src/e2eHooks.ts` on the React
 * side. Covers the T27-05/T27-06 table slices: plant/add/delete/merge
 * helpers plus the revision-attr snapshot the specs assert against.
 */

import {
  addColumnRight,
  addRowBelow,
  deleteRow,
  mergeCells,
  setCellFillColor,
} from '@xcrong/docx-editor-core/prosemirror/commands';
// Same deep-import path the React demo uses for cell-drag selection —
// the demo has no direct prosemirror-tables dep.
import { applyCellSelection } from '@xcrong/docx-editor-core/prosemirror/cellDragSelection';
import type { Node as PMNode } from 'prosemirror-model';

/**
 * Build the table-revision slice of `window.__DOCX_EDITOR_E2E__`.
 * `getView` returns the live body EditorView (or null before mount).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTableRevisionE2EHooks(getView: () => any): Record<string, unknown> {
  return {
    plantSimpleTable: () => {
      const view = getView();
      if (!view) return false;
      const { schema } = view.state;
      const cellPara = schema.node('paragraph', {}, [schema.text('A')]);
      const cell = schema.node('tableCell', { colspan: 1, rowspan: 1 }, [cellPara]);
      const row = schema.node('tableRow', {}, [cell]);
      const table = schema.node('table', {}, [row]);
      view.dispatch(view.state.tr.replaceSelectionWith(table));
      return true;
    },
    countTableRows: () => {
      const view = getView();
      if (!view) return 0;
      let count = 0;
      let inFirstTable = false;
      view.state.doc.descendants((node: PMNode) => {
        if (node.type.name === 'table') {
          if (inFirstTable) return false;
          inFirstTable = true;
          return true;
        }
        if (inFirstTable && node.type.name === 'tableRow') count += 1;
        return false;
      });
      return count;
    },
    focusFirstTableCell: () => {
      const view = getView();
      if (!view) return false;
      let target: number | null = null;
      view.state.doc.descendants((node: PMNode, pos: number) => {
        if (target != null) return false;
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          target = pos + 2;
          return false;
        }
        return true;
      });
      if (target == null) return false;
      // Use the constructor on the live selection to avoid a direct
      // `prosemirror-state` dependency in the demo's package.json.
      const SelectionCtor = (view.state.selection as { constructor: unknown }).constructor as {
        near: ($pos: unknown) => unknown;
      };
      const tr = view.state.tr.setSelection(SelectionCtor.near(view.state.doc.resolve(target)));
      view.dispatch(tr);
      view.focus();
      return true;
    },
    plantTableRowInsertion: (revisionId: number) => {
      const view = getView();
      if (!view) return false;
      let rowPos: number | null = null;
      let rowNode: PMNode | null = null;
      view.state.doc.descendants((node: PMNode, pos: number) => {
        if (rowPos != null) return false;
        if (node.type.name === 'tableRow') {
          rowPos = pos;
          rowNode = node;
          return false;
        }
        return true;
      });
      if (rowPos == null || rowNode == null) return false;
      view.dispatch(
        view.state.tr.setNodeMarkup(rowPos, undefined, {
          ...(rowNode as PMNode).attrs,
          trIns: { revisionId, author: 'Jane', date: new Date().toISOString() },
        })
      );
      return true;
    },
    plantTableRowDeletion: (revisionId: number) => {
      const view = getView();
      if (!view) return false;
      let rowPos: number | null = null;
      let rowNode: PMNode | null = null;
      view.state.doc.descendants((node: PMNode, pos: number) => {
        if (rowPos != null) return false;
        if (node.type.name === 'tableRow') {
          rowPos = pos;
          rowNode = node;
          return false;
        }
        return true;
      });
      if (rowPos == null || rowNode == null) return false;
      view.dispatch(
        view.state.tr.setNodeMarkup(rowPos, undefined, {
          ...(rowNode as PMNode).attrs,
          trDel: { revisionId, author: 'Jane', date: new Date().toISOString() },
        })
      );
      return true;
    },
    getFirstTableRowAttrs: () => {
      const view = getView();
      if (!view) return null;
      let out: Record<string, unknown> | null = null;
      view.state.doc.descendants((node: PMNode) => {
        if (out != null) return false;
        if (node.type.name === 'tableRow') {
          out = { ...node.attrs };
          return false;
        }
        return true;
      });
      return out;
    },
    addRowBelow: () => {
      const view = getView();
      if (!view) return false;
      return addRowBelow(view.state, view.dispatch);
    },
    deleteCurrentRow: () => {
      const view = getView();
      if (!view) return false;
      return deleteRow(view.state, view.dispatch);
    },
    addColumnRight: () => {
      const view = getView();
      if (!view) return false;
      return addColumnRight(view.state, view.dispatch);
    },
    setFirstCellFillColor: (color: string) => {
      const view = getView();
      if (!view) return false;
      return setCellFillColor(color)(view.state, view.dispatch);
    },
    // Select the first row's first two cells and dispatch `mergeCells`
    // (suggesting → `ins` + `del` markers, no collapse). Mirrors the React
    // demo hook of the same name.
    mergeFirstRowCells: () => {
      const view = getView();
      if (!view) return false;
      const cellPositions: number[] = [];
      view.state.doc.descendants((node: PMNode, pos: number) => {
        if (cellPositions.length >= 2) return false;
        if (node.type.name === 'tableRow') {
          if (cellPositions.length > 0) return false;
          return true;
        }
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          cellPositions.push(pos);
          return false;
        }
        return true;
      });
      if (cellPositions.length < 2) return false;
      if (!applyCellSelection(view, cellPositions[0]!, cellPositions[1]!)) return false;
      return mergeCells(view.state, view.dispatch);
    },
    // Select the first column's first two cells and dispatch `mergeCells`
    // (suggesting → vertical `merge` markers, no collapse).
    mergeFirstColumnCells: () => {
      const view = getView();
      if (!view) return false;
      const cellPositions: number[] = [];
      let rowCount = 0;
      view.state.doc.descendants((node: PMNode, pos: number) => {
        if (node.type.name === 'tableRow') {
          rowCount += 1;
          if (rowCount > 2) return false;
          return true;
        }
        if (rowCount >= 1 && rowCount <= 2) {
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
            if (cellPositions.length < rowCount) cellPositions.push(pos);
            return false;
          }
        }
        return true;
      });
      if (cellPositions.length < 2) return false;
      if (!applyCellSelection(view, cellPositions[0]!, cellPositions[1]!)) return false;
      return mergeCells(view.state, view.dispatch);
    },
    // Snapshot the first table's revision attrs for assertions — row
    // markers, per-cell markers, row/cell property changes, column counts,
    // table-level changes. Mirrors the React demo hook of the same name.
    getFirstTableSnapshot: () => {
      const view = getView();
      if (!view) return null;
      const rows: Array<Record<string, unknown>> = [];
      const cells: Array<Array<unknown>> = [];
      const cellPropChanges: Array<Array<unknown>> = [];
      let tableAttrs: Record<string, unknown> | null = null;
      let inFirstTable = false;
      view.state.doc.descendants((node: PMNode) => {
        if (node.type.name === 'table') {
          if (inFirstTable) return false;
          inFirstTable = true;
          tableAttrs = { ...(node.attrs as Record<string, unknown>) };
          return true;
        }
        if (!inFirstTable) return false;
        if (node.type.name === 'tableRow') {
          const attrs = node.attrs as Record<string, unknown>;
          rows.push({
            trIns: attrs.trIns ?? null,
            trDel: attrs.trDel ?? null,
            trPrChange: attrs.trPrChange ?? null,
            tblPrExChange: attrs.tblPrExChange ?? null,
          });
          const markers: Array<unknown> = [];
          const propChanges: Array<unknown> = [];
          node.forEach((cell: PMNode) => {
            markers.push((cell.attrs as Record<string, unknown>).cellMarker ?? null);
            propChanges.push((cell.attrs as Record<string, unknown>).tcPrChange ?? null);
          });
          cells.push(markers);
          cellPropChanges.push(propChanges);
          return false;
        }
        return false;
      });
      if (tableAttrs == null) return null;
      const colCount = cells.length > 0 ? cells[0]!.length : 0;
      return {
        rowCount: rows.length,
        colCount,
        rows,
        cells,
        cellPropChanges,
        tblPrChange: (tableAttrs as Record<string, unknown>).tblPrChange ?? null,
        tblGridChange: (tableAttrs as Record<string, unknown>).tblGridChange ?? null,
      };
    },
  };
}
