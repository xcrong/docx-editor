/**
 * Sidebar item ids + card → document navigation wiring for the comments
 * sidebar (specs 4.x/5.1).
 *
 * - `sidebarItemIds`: mirrors the item-id shapes produced by
 *   `useCommentSidebarItems` (`comment-<id>`, `tc-<rev>-<idx>`) for the
 *   leader-lines overlay.
 * - `handleSidebarNavigate`: clicking a card scrolls the visible pages to
 *   the card's anchor WITHOUT moving the PM selection (selection stays
 *   cursor-driven).
 */

import { computed, type ComputedRef, type Ref } from 'vue';
import type { EditorView } from 'prosemirror-view';
import type { Comment } from '@xcrong/docx-editor-core/types/content';
import type { TrackedChangeEntry } from '../components/sidebar/sidebarUtils';
import { findChangeRange, findCommentRange } from '@xcrong/docx-editor-core/prosemirror/queries';

export interface UseSidebarNavigateOptions {
  editorView: Ref<EditorView | null>;
  /**
   * Scroll the VISIBLE paged viewport to a PM position. Deferred closure
   * (invoked on card click, long after setup) so passing an arrow over a
   * later-declared binding is TDZ-safe — same pattern as the outline
   * navigate closure.
   */
  scrollToVisiblePosition: (pmPos: number) => void;
  comments: Ref<Comment[]>;
  trackedChanges: Ref<TrackedChangeEntry[]>;
  isAddingComment: Ref<boolean>;
  addCommentYPosition: Ref<number | null>;
}

export interface UseSidebarNavigateReturn {
  handleSidebarNavigate: (itemId: string) => void;
  sidebarItemIds: ComputedRef<string[]>;
}

export function useSidebarNavigate(opts: UseSidebarNavigateOptions): UseSidebarNavigateReturn {
  function handleSidebarNavigate(itemId: string) {
    const view = opts.editorView.value;
    if (!view) return;
    let range: { from: number; to: number } | null = null;
    if (itemId.startsWith('comment-')) {
      const id = Number(itemId.slice('comment-'.length));
      if (Number.isInteger(id)) range = findCommentRange(view, id);
    } else if (itemId.startsWith('tc-')) {
      const rev = Number(itemId.slice(3).split('-')[0]);
      if (Number.isInteger(rev)) range = findChangeRange(view, rev);
    }
    if (!range) return;
    opts.scrollToVisiblePosition(range.from);
  }

  // Sidebar item ids for the leader-lines overlay (mirrors the item-id
  // shapes produced by useCommentSidebarItems).
  const sidebarItemIds = computed<string[]>(() => {
    const ids: string[] = [];
    if (opts.isAddingComment.value && opts.addCommentYPosition.value != null) {
      ids.push('new-comment-input');
    }
    for (const c of opts.comments.value) {
      if (c.parentId != null) continue;
      if (c.done) continue;
      ids.push(`comment-${c.id}`);
    }
    opts.trackedChanges.value.forEach((change, idx) => {
      ids.push(`tc-${change.revisionId}-${idx}`);
    });
    return ids;
  });

  return { handleSidebarNavigate, sidebarItemIds };
}
