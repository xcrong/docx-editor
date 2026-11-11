/**
 * Drag Auto-Scroll Hook
 *
 * When the user is drag-selecting text and moves the mouse near the
 * top or bottom edge of the scroll container, this hook auto-scrolls
 * the container and continues extending the selection.
 *
 * The per-frame loop stops itself when the pointer leaves the edge zone
 * (delta back to 0) or the container can't scroll further, so no rAF
 * traffic survives the gesture; any later mousemove re-arms it. Speed
 * math lives in core (`computeAutoScrollDelta`) and is shared with Vue.
 */

import { useCallback, useEffect, useRef } from 'react';
import { findVerticalScrollParent } from '@xcrong/docx-editor-core/utils/findVerticalScrollParent';
import {
  AUTO_SCROLL_EDGE_ZONE as EDGE_ZONE,
  computeAutoScrollDelta,
} from '@xcrong/docx-editor-core/utils/autoScroll';

export interface DragAutoScrollOptions {
  /** Ref to the pages container (used to find the scroll parent). */
  pagesContainerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Called during auto-scroll to extend the selection at the current mouse position.
   * `delta` is the signed px/frame scroll applied this frame — positive when
   * scrolling down. Call sites use its sign to retry a miss inward when the
   * pointer sits on the native scrollbar (`elementsFromPoint` hits nothing
   * there, so a direct resolve would freeze the head mid-scroll).
   */
  onScrollExtendSelection: (clientX: number, clientY: number, delta: number) => void;
}

export function useDragAutoScroll({
  pagesContainerRef,
  onScrollExtendSelection,
}: DragAutoScrollOptions) {
  const rafIdRef = useRef<number | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const activeRef = useRef(false);
  const scrollParentRef = useRef<HTMLElement | null>(null);

  const getScrollParent = useCallback((): HTMLElement | null => {
    if (scrollParentRef.current) return scrollParentRef.current;
    const pages = pagesContainerRef.current;
    if (!pages) return null;
    scrollParentRef.current = findVerticalScrollParent(pages);
    return scrollParentRef.current;
  }, [pagesContainerRef]);

  const stopAutoScroll = useCallback(() => {
    activeRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  // Never leak the rAF loop past unmount (e.g. doc reload mid-drag).
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const tick = useCallback(() => {
    if (!activeRef.current) return;

    const container = getScrollParent();
    if (!container) {
      stopAutoScroll();
      return;
    }

    const rect = container.getBoundingClientRect();
    const { x: mx, y: my } = lastMouseRef.current;

    const scrollDelta = computeAutoScrollDelta(rect, my);

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
    // After scrolling, extend the selection to the (now shifted) mouse position
    onScrollExtendSelection(mx, my, scrollDelta);

    rafIdRef.current = requestAnimationFrame(tick);
  }, [getScrollParent, onScrollExtendSelection, stopAutoScroll]);

  const startAutoScroll = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    rafIdRef.current = requestAnimationFrame(tick);
  }, [tick]);

  /**
   * Call on every mousemove during drag to update the mouse position
   * and start/stop auto-scroll as needed.
   */
  const updateMousePosition = useCallback(
    (clientX: number, clientY: number) => {
      lastMouseRef.current = { x: clientX, y: clientY };
      if (!activeRef.current) {
        const container = getScrollParent();
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (clientY < rect.top + EDGE_ZONE || clientY > rect.bottom - EDGE_ZONE) {
          startAutoScroll();
        }
      }
    },
    [getScrollParent, startAutoScroll]
  );

  return { updateMousePosition, stopAutoScroll };
}
