/**
 * Comments-sidebar visibility: the toggle (which seeds
 * `extractCommentsAndChanges` so the panel opens with fresh data) and the
 * narrow-container overlay-mode flag. Split out of `useOutlineSidebar` so
 * `DocxEditor.vue` stays under its line cap.
 */

import { getCurrentInstance, type Ref } from 'vue';
import { useSidebarOverlayMode } from './useSidebarOverlayMode';

export interface UseSidebarVisibilityOptions {
  showSidebar: Ref<boolean>;
  extractCommentsAndChanges: () => void;
}

export interface UseSidebarVisibilityReturn {
  sidebarOverlayMode: Ref<boolean>;
  handleToggleSidebar: () => void;
}

export function useSidebarVisibility(
  opts: UseSidebarVisibilityOptions
): UseSidebarVisibilityReturn {
  // Template refs are exposed unwrapped on the component instance (`$refs`),
  // NOT as `.value` on the setup binding, in this build — so `ref="..."`
  // bindings like `pagesViewportRef` must be read via `getCurrentInstance()`
  // refs (with a document query fallback), never via `.value`.
  const vueInstance = getCurrentInstance();
  const resolveViewportEl = (): HTMLElement | null => {
    const fromRefs = vueInstance?.refs?.pagesViewportRef as HTMLElement | undefined;
    if (fromRefs instanceof HTMLElement) return fromRefs;
    return document.querySelector('.docx-editor-vue__pages-viewport');
  };
  const { sidebarOverlayMode } = useSidebarOverlayMode({ resolveViewportEl });

  function handleToggleSidebar() {
    if (!opts.showSidebar.value) {
      opts.extractCommentsAndChanges();
    }
    opts.showSidebar.value = !opts.showSidebar.value;
  }

  return { sidebarOverlayMode, handleToggleSidebar };
}
