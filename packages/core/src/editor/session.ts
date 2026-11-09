/**
 * Session-seam helpers for `DocxEditorEngine` (issue #696 Tier 2, step 5).
 *
 * Pure pieces of the load/save lift: the load-generation race guard and the
 * selective-save decision. Lifted from React's `useDocumentLoader`
 * (`loadGenerationRef`) and `useFileIO` (`handleSave`'s selective-options
 * build). Framework-free so they stay unit-testable; the `DocumentAgent`
 * + reply-marker + tracker-clear orchestration lives on
 * `DocxEditorEngine.save` (which runs post-gate).
 */

import type { EditorState } from 'prosemirror-state';

import type { SelectiveSaveOptions } from '../docx/selectiveSave';
import {
  getChangedParagraphIds,
  hasStructuralChanges,
  hasUntrackedChanges,
} from '../prosemirror/extensions';
import type { Comment } from '../types/content';

/**
 * Monotonic generation counter so a late `parseDocx` result never
 * overwrites a newer load that started while parsing was in flight.
 * The engine owns one; each `load()` captures its generation and drops
 * the result when `isCurrent` is false on settle.
 */
export class LoadGeneration {
  private current = 0;

  /** Capture the generation for a load that is starting now. */
  begin(): number {
    this.current += 1;
    return this.current;
  }

  /** True when no newer load has started since `generation` was captured. */
  isCurrent(generation: number): boolean {
    return this.current === generation;
  }

  /** Force-stale every in-flight load (teardown). */
  invalidate(): void {
    this.current += 1;
  }
}

export interface SelectiveSaveDecision {
  selective: SelectiveSaveOptions;
}

/**
 * Build the selective-save options for `DocumentAgent.toBuffer` from the
 * live body `EditorState` + comment list, or `undefined` when the caller
 * asked for a full repack (or there is no view state to read).
 *
 * A comment reply anywhere forces `structuralChange`: replies need range
 * markers injected into document.xml, which selective save can't handle
 * when the affected paragraphs aren't in `changedParaIds`.
 */
export function decideSelectiveSave(
  editorState: EditorState | null,
  comments: Comment[],
  selective: boolean
): SelectiveSaveDecision | undefined {
  if (!selective || !editorState) return undefined;
  const hasInjectedReplies = comments.some((c) => c.parentId != null);
  return {
    selective: {
      changedParaIds: getChangedParagraphIds(editorState),
      structuralChange: hasStructuralChanges(editorState) || hasInjectedReplies,
      hasUntrackedChanges: hasUntrackedChanges(editorState),
    },
  };
}
