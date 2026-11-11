/**
 * Suggesting-aware command overlay for the Vue adapter (issue #127).
 *
 * React's toolbar calls the `commands/*` wrappers directly (e.g.
 * `useFormattingActions` imports `toggleBold` from
 * `@xcrong/docx-editor-core/prosemirror/commands`), and those wrappers
 * route property edits through `withSuggestingSnapshot` so suggesting mode
 * mints revisions instead of editing properties in place.
 *
 * Vue instead resolves toolbar/menu/context-menu actions by name through
 * `getCommands()`, which used to return the extension manager's bare
 * commands — bypassing the wrappers, so Vue toolbar edits in suggesting
 * mode produced no revisions. This module overlays the bare map with the
 * same wrappers React calls; `useDocxEditor.getCommands` spreads it last
 * so every name-based caller (Toolbar, TableToolbar, menus, context
 * menus) gets the tracked variant. Closed-mode behavior is unchanged —
 * the wrappers run the bare command untouched when suggesting is off.
 *
 * Shape note: the manager map holds factories (`name => (...args) =>
 * Command`), while `commands/*` exports a mix of factories
 * (`setTextColor(attrs) => Command`) and ready-made constants
 * (`toggleBold: Command`). Entries below are normalized to factory shape
 * so callers keep doing `cmds[name](...args)(state, dispatch, view)`.
 * The three border commands are Commands with a trailing options arg in
 * core (React calls them as `fn(state, dispatch, spec)`); the adapters
 * here restore the factory shape the bare map has (`(spec?) => Command`).
 *
 * Maintenance rule: when core wraps a new property command that Vue UI
 * can reach by name, add it here — otherwise the bare variant silently
 * wins again. Structural commands (insert/delete/merge/split/select,
 * undo/redo, hyperlinks, image wrap) are intentionally absent: core
 * leaves them unwrapped and both adapters share the bare form.
 */

import type { Command, EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { CommandMap } from '@xcrong/docx-editor-core/prosemirror/extensions/types';
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleSuperscript,
  toggleSubscript,
  setTextColor,
  setHighlight,
  setFontSize,
  setFontFamily,
  setUnderlineStyle,
  setAlignment,
  alignLeft,
  alignCenter,
  alignRight,
  alignJustify,
  setLineSpacing,
  singleSpacing,
  oneAndHalfSpacing,
  doubleSpacing,
  increaseIndent,
  decreaseIndent,
  setIndentLeft,
  setIndentRight,
  setIndentFirstLine,
  addTabStop,
  removeTabStop,
  increaseListLevel,
  decreaseListLevel,
  removeList,
  setSpaceBefore,
  setSpaceAfter,
  applyStyle,
  clearStyle,
  setRtl,
  setLtr,
  setCellBorder,
  setTableBorders,
  removeTableBorders,
  setAllTableBorders,
  setOutsideTableBorders,
  setInsideTableBorders,
  setCellVerticalAlign,
  setCellMargins,
  setCellTextDirection,
  toggleNoWrap,
  setRowHeight,
  toggleHeaderRow,
  distributeColumns,
  autoFitContents,
  setTableProperties,
  applyTableStyle,
  setCellFillColor,
  setTableBorderColor,
  setTableBorderWidth,
} from '@xcrong/docx-editor-core/prosemirror/commands';
import {
  insertSectionBreak,
  removeSectionBreak,
} from '@xcrong/docx-editor-core/prosemirror/commands/paragraph';

type BorderSpec = { style: string; size: number; color: { rgb: string } };

function borderCommand(
  fn: (state: EditorState, dispatch?: (tr: Transaction) => void, spec?: BorderSpec) => boolean,
  spec?: BorderSpec
): Command {
  return (state, dispatch?: (tr: Transaction) => void, _view?: EditorView) =>
    fn(state, dispatch, spec);
}

/**
 * Factory-shaped overlay of every suggesting-tracked property command.
 * Spread last over the manager's bare map (see `useDocxEditor`).
 */
export const suggestingCommandFactories: CommandMap = {
  // Run properties (formatting.ts — runPropertySnapshotter).
  toggleBold: () => toggleBold,
  toggleItalic: () => toggleItalic,
  toggleUnderline: () => toggleUnderline,
  toggleStrike: () => toggleStrike,
  toggleSuperscript: () => toggleSuperscript,
  toggleSubscript: () => toggleSubscript,
  setTextColor,
  setHighlight,
  setFontSize,
  setFontFamily,
  setUnderlineStyle,
  // Paragraph properties (paragraph.ts — paragraphPropertySnapshotter).
  setAlignment,
  alignLeft: () => alignLeft,
  alignCenter: () => alignCenter,
  alignRight: () => alignRight,
  alignJustify: () => alignJustify,
  setLineSpacing,
  singleSpacing: () => singleSpacing,
  oneAndHalfSpacing: () => oneAndHalfSpacing,
  doubleSpacing: () => doubleSpacing,
  increaseIndent,
  decreaseIndent,
  setIndentLeft,
  setIndentRight,
  setIndentFirstLine,
  addTabStop,
  removeTabStop,
  increaseListLevel: () => increaseListLevel,
  decreaseListLevel: () => decreaseListLevel,
  removeList: () => removeList,
  setSpaceBefore,
  setSpaceAfter,
  applyStyle,
  clearStyle: () => clearStyle,
  insertSectionBreak,
  removeSectionBreak: () => removeSectionBreak,
  setRtl: () => setRtl,
  setLtr: () => setLtr,
  // Table/cell properties (table.ts — tablePropertySnapshotter).
  setCellBorder,
  setTableBorders,
  removeTableBorders: () => removeTableBorders,
  setAllTableBorders: (spec?: BorderSpec) => borderCommand(setAllTableBorders, spec),
  setOutsideTableBorders: (spec?: BorderSpec) => borderCommand(setOutsideTableBorders, spec),
  setInsideTableBorders: (spec?: BorderSpec) => borderCommand(setInsideTableBorders, spec),
  setCellVerticalAlign,
  setCellMargins,
  setCellTextDirection,
  toggleNoWrap,
  setRowHeight,
  toggleHeaderRow,
  distributeColumns,
  autoFitContents,
  setTableProperties,
  applyTableStyle,
  setCellFillColor,
  setTableBorderColor,
  setTableBorderWidth,
};
