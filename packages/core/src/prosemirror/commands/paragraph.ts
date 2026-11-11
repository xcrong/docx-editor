/**
 * Paragraph Formatting Commands — thin re-exports from extension system
 *
 * Alignment, line spacing, indentation, lists, paragraph styles.
 * All implementations live in extensions/; this file re-exports
 * for backward compatibility.
 * @packageDocumentation
 * @public
 */

import type { Command } from 'prosemirror-state';
import { withSuggestingSnapshot } from '../plugins/suggestionMode/snapshot';
import { paragraphPropertySnapshotter } from '../plugins/suggestionMode/paragraphSnapshot';
import type {
  ParagraphAlignment,
  LineSpacingRule,
  TabStopAlignment,
  TabLeader,
} from '../../types/document';
import { singletonManager } from '../schema';

// Re-export types and query helpers from extensions
import type { ResolvedStyleAttrs, GenerateTOCOptions } from '../extensions/core/ParagraphExtension';
export type { ResolvedStyleAttrs, GenerateTOCOptions } from '../extensions/core/ParagraphExtension';
export {
  getParagraphAlignment,
  getStyleId,
  getParagraphTabs,
  getParagraphBidi,
} from '../extensions/core/ParagraphExtension';
export { isInList, getListInfo } from '../extensions/features/ListExtension';

// ============================================================================
// COMMANDS — delegated to singleton extension manager
// ============================================================================

const cmds = singletonManager.getCommands();

// Alignment
export function setAlignment(alignment: ParagraphAlignment): Command {
  return withSuggestingSnapshot(cmds.setAlignment(alignment), paragraphPropertySnapshotter);
}
export const alignLeft: Command = withSuggestingSnapshot(
  cmds.alignLeft(),
  paragraphPropertySnapshotter
);
export const alignCenter: Command = withSuggestingSnapshot(
  cmds.alignCenter(),
  paragraphPropertySnapshotter
);
export const alignRight: Command = withSuggestingSnapshot(
  cmds.alignRight(),
  paragraphPropertySnapshotter
);
export const alignJustify: Command = withSuggestingSnapshot(
  cmds.alignJustify(),
  paragraphPropertySnapshotter
);

// Line spacing
export function setLineSpacing(value: number, rule: LineSpacingRule = 'auto'): Command {
  return withSuggestingSnapshot(cmds.setLineSpacing(value, rule), paragraphPropertySnapshotter);
}
export const singleSpacing: Command = withSuggestingSnapshot(
  cmds.singleSpacing(),
  paragraphPropertySnapshotter
);
export const oneAndHalfSpacing: Command = withSuggestingSnapshot(
  cmds.oneAndHalfSpacing(),
  paragraphPropertySnapshotter
);
export const doubleSpacing: Command = withSuggestingSnapshot(
  cmds.doubleSpacing(),
  paragraphPropertySnapshotter
);

// Indentation
export function increaseIndent(amount: number = 720): Command {
  return withSuggestingSnapshot(cmds.increaseIndent(amount), paragraphPropertySnapshotter);
}
export function decreaseIndent(amount: number = 720): Command {
  return withSuggestingSnapshot(cmds.decreaseIndent(amount), paragraphPropertySnapshotter);
}
export function setIndentLeft(twips: number): Command {
  return withSuggestingSnapshot(cmds.setIndentLeft(twips), paragraphPropertySnapshotter);
}
export function setIndentRight(twips: number): Command {
  return withSuggestingSnapshot(cmds.setIndentRight(twips), paragraphPropertySnapshotter);
}
export function setIndentFirstLine(twips: number, hanging?: boolean): Command {
  return withSuggestingSnapshot(
    cmds.setIndentFirstLine(twips, hanging),
    paragraphPropertySnapshotter
  );
}

// Lists — toggle commands self-track via `appendParagraphPropertyChange`
// (ListExtension); wrapping them again would stack a second same-session
// entry, so they stay unwrapped. Level/remove commands carry no tracking of
// their own and go through the shared snapshotter.
export const toggleBulletList: Command = cmds.toggleBulletList();
export const toggleNumberedList: Command = cmds.toggleNumberedList();
export const increaseListLevel: Command = withSuggestingSnapshot(
  cmds.increaseListLevel(),
  paragraphPropertySnapshotter
);
export const decreaseListLevel: Command = withSuggestingSnapshot(
  cmds.decreaseListLevel(),
  paragraphPropertySnapshotter
);
export const removeList: Command = withSuggestingSnapshot(
  cmds.removeList(),
  paragraphPropertySnapshotter
);

// Spacing
export function setSpaceBefore(twips: number): Command {
  return withSuggestingSnapshot(cmds.setSpaceBefore(twips), paragraphPropertySnapshotter);
}
export function setSpaceAfter(twips: number): Command {
  return withSuggestingSnapshot(cmds.setSpaceAfter(twips), paragraphPropertySnapshotter);
}

// Paragraph styles
export function applyStyle(styleId: string, resolvedAttrs?: ResolvedStyleAttrs): Command {
  return withSuggestingSnapshot(
    cmds.applyStyle(styleId, resolvedAttrs),
    paragraphPropertySnapshotter
  );
}
export const clearStyle: Command = withSuggestingSnapshot(
  cmds.clearStyle(),
  paragraphPropertySnapshotter
);

// Section breaks
export function insertSectionBreak(
  breakType: 'nextPage' | 'continuous' | 'oddPage' | 'evenPage'
): Command {
  return withSuggestingSnapshot(cmds.insertSectionBreak(breakType), paragraphPropertySnapshotter);
}
export const removeSectionBreak: Command = withSuggestingSnapshot(
  cmds.removeSectionBreak(),
  paragraphPropertySnapshotter
);

// Tab stops
export function addTabStop(
  position: number,
  alignment: TabStopAlignment = 'left',
  leader: TabLeader = 'none'
): Command {
  return withSuggestingSnapshot(
    cmds.addTabStop(position, alignment, leader),
    paragraphPropertySnapshotter
  );
}
export function removeTabStop(position: number): Command {
  return withSuggestingSnapshot(cmds.removeTabStop(position), paragraphPropertySnapshotter);
}

// Text direction
export const setRtl: Command = withSuggestingSnapshot(cmds.setRtl(), paragraphPropertySnapshotter);
export const setLtr: Command = withSuggestingSnapshot(cmds.setLtr(), paragraphPropertySnapshotter);

// Table of Contents
export const generateTOC: Command = cmds.generateTOC();

/**
 * Options-aware Table of Contents command. Scope the heading levels, set a
 * custom title (or omit it with `null`/`""`), and toggle hyperlinked entries.
 * Omitting `options` is equivalent to the {@link generateTOC} default.
 *
 * @public
 */
export function generateTableOfContents(options?: GenerateTOCOptions): Command {
  return cmds.generateTOC(options);
}
