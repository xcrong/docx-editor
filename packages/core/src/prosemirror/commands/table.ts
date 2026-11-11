/**
 * ProseMirror Table Commands — thin re-exports from extension system
 *
 * Table context detection, insert/delete operations, borders, cell styling.
 * All implementations live in extensions/nodes/TableExtension/; this file
 * re-exports for backward compatibility.
 */

import type { EditorState, Transaction } from 'prosemirror-state';
import { singletonManager } from '../schema';
import { withSuggestingSnapshot } from '../plugins/suggestionMode/snapshot';
import { tablePropertySnapshotter } from '../plugins/suggestionMode/tableSnapshot';

// Re-export types and query helpers from TableExtension
export type { TableContextInfo, BorderPreset } from '../extensions/nodes/TableExtension';
export { getTableContext, isInTable } from '../extensions/nodes/TableExtension';

// ============================================================================
// COMMANDS — delegated to singleton extension manager
// ============================================================================

const cmds = singletonManager.getCommands();

// Table creation
export function insertTable(
  rows: number,
  cols: number
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return cmds.insertTable(rows, cols);
}

// Row operations
export function addRowAbove(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.addRowAbove()(state, dispatch);
}
export function addRowBelow(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.addRowBelow()(state, dispatch);
}
export function deleteRow(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.deleteRow()(state, dispatch);
}

// Column operations
export function addColumnLeft(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.addColumnLeft()(state, dispatch);
}
export function addColumnRight(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.addColumnRight()(state, dispatch);
}
export function deleteColumn(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.deleteColumn()(state, dispatch);
}

// Table deletion
export function deleteTable(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.deleteTable()(state, dispatch);
}

// Table selection
export function selectTable(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.selectTable()(state, dispatch);
}
export function selectRow(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.selectRow()(state, dispatch);
}
export function selectColumn(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.selectColumn()(state, dispatch);
}

// Merge/Split — delegated to prosemirror-tables via singleton extension manager
export function mergeCells(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.mergeCells()(state, dispatch);
}
export function splitCell(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  return cmds.splitCell()(state, dispatch);
}

// Dialog-backed split — explicit row/column input
export {
  type SplitCellDialogConfig,
  getSplitCellDialogConfig,
  splitActiveTableCell,
} from './tableSplit';

// Per-cell border editing. Wrapped: border edits mint `tcPrChange` in
// suggesting mode; closed-mode behavior unchanged.
export function setCellBorder(
  side: 'top' | 'bottom' | 'left' | 'right' | 'all',
  spec: { style: string; size?: number; color?: { rgb: string } } | null,
  clearOthers?: boolean
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(
    cmds.setCellBorder(side, spec, clearOthers),
    tablePropertySnapshotter
  );
}

// Borders. All border commands target cells → `tcPrChange` when suggesting.
export function setTableBorders(
  preset: import('../extensions/nodes/TableExtension').BorderPreset,
  borderSpec?: { style: string; size: number; color: { rgb: string } }
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setTableBorders(preset, borderSpec), tablePropertySnapshotter);
}
export function removeTableBorders(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  return withSuggestingSnapshot(cmds.removeTableBorders(), tablePropertySnapshotter)(
    state,
    dispatch
  );
}
export function setAllTableBorders(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  borderSpec?: { style: string; size: number; color: { rgb: string } }
): boolean {
  return withSuggestingSnapshot(cmds.setAllTableBorders(borderSpec), tablePropertySnapshotter)(
    state,
    dispatch
  );
}
export function setOutsideTableBorders(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  borderSpec?: { style: string; size: number; color: { rgb: string } }
): boolean {
  return withSuggestingSnapshot(cmds.setOutsideTableBorders(borderSpec), tablePropertySnapshotter)(
    state,
    dispatch
  );
}
export function setInsideTableBorders(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  borderSpec?: { style: string; size: number; color: { rgb: string } }
): boolean {
  return withSuggestingSnapshot(cmds.setInsideTableBorders(borderSpec), tablePropertySnapshotter)(
    state,
    dispatch
  );
}

// Vertical alignment
export function setCellVerticalAlign(
  align: 'top' | 'center' | 'bottom'
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setCellVerticalAlign(align), tablePropertySnapshotter);
}

// Cell margins
export function setCellMargins(margins: {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setCellMargins(margins), tablePropertySnapshotter);
}

// Text direction
export function setCellTextDirection(
  direction: string | null
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setCellTextDirection(direction), tablePropertySnapshotter);
}

// No-wrap toggle
export function toggleNoWrap(): (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean {
  return withSuggestingSnapshot(cmds.toggleNoWrap(), tablePropertySnapshotter);
}

// Row height
export function setRowHeight(
  height: number | null,
  rule?: 'auto' | 'atLeast' | 'exact'
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setRowHeight(height, rule), tablePropertySnapshotter);
}

// Header row
export function toggleHeaderRow(): (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean {
  return withSuggestingSnapshot(cmds.toggleHeaderRow(), tablePropertySnapshotter);
}

// Column distribution
export function distributeColumns(): (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean {
  return withSuggestingSnapshot(cmds.distributeColumns(), tablePropertySnapshotter);
}
export function autoFitContents(): (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean {
  return withSuggestingSnapshot(cmds.autoFitContents(), tablePropertySnapshotter);
}

// Table properties
export function setTableProperties(props: {
  width?: number | null;
  widthType?: string | null;
  justification?: 'left' | 'center' | 'right' | null;
}): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setTableProperties(props), tablePropertySnapshotter);
}

// Table style gallery
export function applyTableStyle(styleData: {
  styleId: string;
  tableBorders?: Record<string, unknown>;
  conditionals?: Record<string, unknown>;
  look?: Record<string, boolean>;
}): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withSuggestingSnapshot(cmds.applyTableStyle(styleData as any), tablePropertySnapshotter);
}

// Cell styling
export function setCellFillColor(
  color: string | null
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setCellFillColor(color), tablePropertySnapshotter);
}
export function setTableBorderColor(
  color: string
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setTableBorderColor(color), tablePropertySnapshotter);
}
export function setTableBorderWidth(
  size: number
): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
  return withSuggestingSnapshot(cmds.setTableBorderWidth(size), tablePropertySnapshotter);
}
