/**
 * "Click-outside clears the active sidebar card" mouse-down handler.
 * Clicks inside the editor pages, sidebar cards, or comment margin markers
 * are real interactions — anything else collapses the expanded card.
 * Split out of `useOutlineSidebar` so `DocxEditor.vue` stays under its
 * line cap.
 */

import type { Ref } from 'vue';

export interface UseSidebarDeselectOptions {
  activeSidebarItem: Ref<string | null>;
}

export interface UseSidebarDeselectReturn {
  handleEditorScrollMouseDown: (event: MouseEvent) => void;
}

export function useSidebarDeselect(opts: UseSidebarDeselectOptions): UseSidebarDeselectReturn {
  function handleEditorScrollMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest('.paged-editor__pages') ||
      target.closest('.unified-sidebar') ||
      target.closest('.docx-comment-margin-markers')
    ) {
      return;
    }
    opts.activeSidebarItem.value = null;
  }
  return { handleEditorScrollMouseDown };
}
