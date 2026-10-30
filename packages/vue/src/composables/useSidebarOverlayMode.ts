/**
 * Narrow-container sidebar overlay mode (spec 1.5).
 *
 * When the pages viewport is narrower than `SIDEBAR_OVERLAY_BREAKPOINT`
 * the sidebar floats over the document with a backdrop instead of shifting
 * it.
 */

import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { shouldUseSidebarOverlay } from '@xcrong/docx-editor-core/utils/sidebarConstants';

export interface UseSidebarOverlayModeOptions {
  /** Resolve the scrolling pages-viewport element (template-ref unwrapping
   *  differs per build — resolved via the component instance `$refs`). */
  resolveViewportEl: () => HTMLElement | null;
}

export interface UseSidebarOverlayModeReturn {
  sidebarOverlayMode: Ref<boolean>;
}

export function useSidebarOverlayMode(
  opts: UseSidebarOverlayModeOptions
): UseSidebarOverlayModeReturn {
  const sidebarOverlayMode = ref(false);
  let overlayObserver: ResizeObserver | null = null;

  onMounted(() => {
    const viewport = opts.resolveViewportEl();
    if (!viewport) return;
    const update = () => {
      sidebarOverlayMode.value = shouldUseSidebarOverlay(viewport.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    overlayObserver = observer;
  });

  onBeforeUnmount(() => {
    overlayObserver?.disconnect();
    overlayObserver = null;
  });

  return { sidebarOverlayMode };
}
