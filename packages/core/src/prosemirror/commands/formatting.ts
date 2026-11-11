/**
 * Text Formatting Commands — thin re-exports from extension system
 *
 * Toggle marks, set marks, clear formatting, hyperlinks.
 * All implementations live in extensions/marks/; this file re-exports
 * for backward compatibility.
 * @packageDocumentation
 * @public
 */

import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { singletonManager, schema } from '../schema';
import type { TextColorAttrs } from '../schema';
import { withSuggestingSnapshot } from '../plugins/suggestionMode/snapshot';
import { runPropertySnapshotter } from '../plugins/suggestionMode/runSnapshot';

// Utility re-exports from markUtils (used by toolbar, conversion, etc.)
export {
  isMarkActive,
  getMarkAttr,
  clearFormatting,
  createSetMarkCommand,
  createRemoveMarkCommand,
} from '../extensions/marks/markUtils';

// Hyperlink query helpers (used by toolbar)
export {
  isHyperlinkActive,
  getHyperlinkAttrs,
  getSelectedText,
  findHyperlinkRangeAt,
} from '../extensions/marks/HyperlinkExtension';
// Local bindings for the recipes below (the block above only re-exports).
import {
  getHyperlinkAttrs as readLinkAttrs,
  getSelectedText as readSelectedText,
  findHyperlinkRangeAt as findLinkRange,
} from '../extensions/marks/HyperlinkExtension';
// ============================================================================
// PARAGRAPH DEFAULT FORMATTING HELPERS
// ============================================================================

/**
 * textFormattingToMarks — wraps markUtils version to use singleton schema
 */
import { textFormattingToMarks as _textFormattingToMarks } from '../extensions/marks/markUtils';
import type { TextFormatting } from '../../types/document';
import type { Mark } from 'prosemirror-model';

export function textFormattingToMarks(formatting: TextFormatting): Mark[] {
  return _textFormattingToMarks(formatting, schema);
}

// ============================================================================
// COMMANDS — delegated to singleton extension manager
// ============================================================================

const cmds = singletonManager.getCommands();

// Toggle marks (simple on/off). Wrapped with the run-property snapshotter so
// suggesting mode mints a `revision_change` mark instead of editing the run's
// `w:rPr` directly (Phase 3, issue #83) — one transaction, one undo step.
export const toggleBold: Command = withSuggestingSnapshot(
  cmds.toggleBold(),
  runPropertySnapshotter
);
export const toggleItalic: Command = withSuggestingSnapshot(
  cmds.toggleItalic(),
  runPropertySnapshotter
);
export const toggleUnderline: Command = withSuggestingSnapshot(
  cmds.toggleUnderline(),
  runPropertySnapshotter
);
export const toggleStrike: Command = withSuggestingSnapshot(
  cmds.toggleStrike(),
  runPropertySnapshotter
);
export const toggleSuperscript: Command = withSuggestingSnapshot(
  cmds.toggleSuperscript(),
  runPropertySnapshotter
);
export const toggleSubscript: Command = withSuggestingSnapshot(
  cmds.toggleSubscript(),
  runPropertySnapshotter
);

// Set marks (with attributes)
export function setTextColor(attrs: TextColorAttrs): Command {
  return withSuggestingSnapshot(cmds.setTextColor(attrs), runPropertySnapshotter);
}
export const clearTextColor: Command = cmds.clearTextColor();

export function setHighlight(color: string): Command {
  return withSuggestingSnapshot(cmds.setHighlight(color), runPropertySnapshotter);
}
export const clearHighlight: Command = cmds.clearHighlight();

export function setFontSize(size: number): Command {
  return withSuggestingSnapshot(cmds.setFontSize(size), runPropertySnapshotter);
}
export const clearFontSize: Command = cmds.clearFontSize();

export function setFontFamily(fontName: string): Command {
  return withSuggestingSnapshot(cmds.setFontFamily(fontName), runPropertySnapshotter);
}
export const clearFontFamily: Command = cmds.clearFontFamily();

export function setUnderlineStyle(style: string, color?: TextColorAttrs): Command {
  return withSuggestingSnapshot(cmds.setUnderlineStyle(style, color), runPropertySnapshotter);
}

// Hyperlink commands
export function setHyperlink(href: string, tooltip?: string): Command {
  return cmds.setHyperlink(href, tooltip);
}
export const removeHyperlink: Command = cmds.removeHyperlink();

export function insertHyperlink(text: string, href: string, tooltip?: string): Command {
  return cmds.insertHyperlink(text, href, tooltip);
}

/** What the link dialog should open as — shared by menu insert/edit flows. */
export type LinkDialogTarget =
  | { mode: 'insert'; displayText: string }
  | { mode: 'edit'; href: string; displayText: string; tooltip?: string };

/**
 * Resolve the link-dialog target from selection state: an existing link
 * under the cursor opens edit (prefilled with its href/text/tooltip),
 * otherwise insert with the selected text as the display default.
 */
export function resolveLinkDialogTarget(state: EditorState): LinkDialogTarget {
  const displayText = readSelectedText(state);
  const existing = readLinkAttrs(state);
  if (existing) {
    return { mode: 'edit', href: existing.href, displayText, tooltip: existing.tooltip };
  }
  return { mode: 'insert', displayText };
}

/**
 * Replace the link range at the cursor with new display text + href,
 * preserving the existing tooltip and the cursor's other marks.
 * The `findHyperlinkRangeAt` + `replaceWith` recipe previously lived
 * identically in both adapters' hyperlink popups.
 */
export function setHyperlinkText(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  displayText: string,
  href: string
): boolean {
  const hit = findLinkRange(state);
  if (!hit) return false;
  const hlType = state.schema.marks.hyperlink;
  const { $from } = state.selection;
  const newMark = hlType.create({ href, tooltip: hit.mark.attrs.tooltip });
  const textNode = state.schema.text(displayText, [
    ...$from.marks().filter((m) => m.type !== hlType),
    newMark,
  ]);
  dispatch(state.tr.replaceWith(hit.start, hit.end, textNode).scrollIntoView());
  return true;
}

/**
 * Remove the link range pinned by `fallbackHref` (e.g. the popup's known
 * href) — unlike the cursor-scoped `removeHyperlink` command, this does not
 * depend on where the caret sits. Previously duplicated in both adapters.
 */
export function removeHyperlinkRange(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  fallbackHref?: string
): boolean {
  const hit = findLinkRange(state, fallbackHref);
  if (!hit) return false;
  const hlType = state.schema.marks.hyperlink;
  dispatch(state.tr.removeMark(hit.start, hit.end, hlType).scrollIntoView());
  return true;
}
