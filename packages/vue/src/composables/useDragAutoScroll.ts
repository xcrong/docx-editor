/**
 * Vue port of packages/react/src/paged-editor/useDragAutoScroll.ts.
 *
 * When the user is drag-selecting text and moves the mouse near the
 * top or bottom edge of the scroll container, this composable
 * auto-scrolls the container and continues extending the selection.
 *
 * Same numeric constants (40px edge zone, 12px/frame max speed) as
 * the React hook so the two adapters feel identical under drag.
 */
import { onBeforeUnmount, type Ref } from 'vue';
import { findVerticalScrollParent } from '@xcrong/docx-editor-core/utils/findVerticalScrollParent';
import {
  AUTO_SCROLL_EDGE_ZONE as EDGE_ZONE,
  computeAutoScrollDelta,
} from '@xcrong/docx-editor-core/utils/autoScroll';

export interface DragAutoScrollOptions {
  pagesContainer: Ref<HTMLElement | null>;
  /**
   * Called during auto-scroll to extend the selection at the current mouse position.
   * `delta` is the signed px/frame scroll applied this frame — positive when
   * scrolling down. Call sites use its sign to retry a miss inward when the
   * pointer sits on the native scrollbar (`elementsFromPoint` hits nothing
   * there, so a direct resolve would freeze the head mid-scroll).
   */
  onScrollExtendSelection: (clientX: number, clientY: number, delta: number) => void;
}

export interface UseDragAutoScrollReturn {
  updateMousePosition: (clientX: number, clientY: number) => void;
  stopAutoScroll: () => void;
}

export function useDragAutoScroll({
  pagesContainer,
  onScrollExtendSelection,
}: DragAutoScrollOptions): UseDragAutoScrollReturn {
  let rafId: number | null = null;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let active = false;
  let scrollParent: HTMLElement | null = null;

  function getScrollParent(): HTMLElement | null {
    if (scrollParent) return scrollParent;
    const pages = pagesContainer.value;
    if (!pages) return null;
    scrollParent = findVerticalScrollParent(pages);
    return scrollParent;
  }

  function stopAutoScroll() {
    active = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tick() {
    if (!active) return;
    const container = getScrollParent();
    if (!container) {
      stopAutoScroll();
      return;
    }

    const rect = container.getBoundingClientRect();
    const scrollDelta = computeAutoScrollDelta(rect, lastMouseY);

    // Pointer left the edge zone — park the loop; the next mousemove
    // inside the zone re-arms it via updateMousePosition.
    if (scrollDelta === 0) {
      stopAutoScroll();
      return;
    }

    // At the scroll limit there is nothing to reveal — stop instead of
    // dispatching identical selection extensions at 60fps.
    const maxTop = container.scrollHeight - container.clientHeight;
    if (
      (scrollDelta < 0 && container.scrollTop <= 0) ||
      (scrollDelta > 0 && container.scrollTop >= maxTop - 1)
    ) {
      stopAutoScroll();
      return;
    }

    container.scrollTop += scrollDelta;
    onScrollExtendSelection(lastMouseX, lastMouseY, scrollDelta);
    rafId = requestAnimationFrame(tick);
  }

  function startAutoScroll() {
    if (active) return;
    active = true;
    rafId = requestAnimationFrame(tick);
  }

  /**
   * Call on every mousemove during drag.
   */
  function updateMousePosition(clientX: number, clientY: number) {
    lastMouseX = clientX;
    lastMouseY = clientY;
    if (!active) {
      const container = getScrollParent();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (clientY < rect.top + EDGE_ZONE || clientY > rect.bottom - EDGE_ZONE) {
        startAutoScroll();
      }
    }
  }

  onBeforeUnmount(() => stopAutoScroll());

  return { updateMousePosition, stopAutoScroll };
}
