/**
 * Outline-navigate handler: puts the caret on the heading in the hidden PM
 * (so typing continues from there), then scrolls the VISIBLE pages to it.
 * (The outline visibility toggle lives in `useOutlineVisibility`; the
 * outside-click clearer lives in `useSidebarDeselect`; each split keeps
 * `DocxEditor.vue` under its line cap.)
 */

import type { Ref } from 'vue';
import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';

export interface UseOutlineSidebarOptions {
  editorView: Ref<EditorView | null>;
  /**
   * Scroll the VISIBLE paged viewport to a PM position. The hidden PM
   * (`left: -9999px`) is never what the user sees, so `tr.scrollIntoView()`
   * on it does nothing; the outline must drive the painter viewport instead
   * (mirrors React's `scrollToPosition`; #930).
   */
  scrollToVisiblePosition: (pmPos: number) => void;
}

export function useOutlineSidebar(opts: UseOutlineSidebarOptions) {
  function handleOutlineNavigate(pmPos: number) {
    const view = opts.editorView.value;
    if (!view) return;
    // Put the caret on the heading in the hidden PM (so typing continues from
    // there), then scroll the VISIBLE pages — not the hidden PM — to it.
    const $pos = view.state.doc.resolve(Math.min(pmPos + 1, view.state.doc.content.size));
    const sel = TextSelection.near($pos);
    view.dispatch(view.state.tr.setSelection(sel));
    opts.scrollToVisiblePosition(pmPos);
    view.focus();
  }

  return {
    handleOutlineNavigate,
  };
}
