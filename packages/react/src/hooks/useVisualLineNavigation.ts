/**
 * Visual Line Navigation Hook
 *
 * Thin React wrapper around the framework-agnostic algorithm in
 * `@xcrong/docx-editor-core/prosemirror/utils/visualLineNavigation`
 * (sticky-X ArrowUp/ArrowDown across painted visual lines + scroll the
 * target line into view). The Vue adapter wraps the same core module, so
 * both adapters share one line-stepping implementation.
 */

import { useCallback, useRef } from 'react';
import type { EditorView } from 'prosemirror-view';
import {
  createVisualLineState,
  findLineElementAtPosition as coreFindLineElementAtPosition,
  findPositionOnLineAtClientX as coreFindPositionOnLineAtClientX,
  getCaretClientX as coreGetCaretClientX,
  handleVisualLineKeyDown,
} from '@xcrong/docx-editor-core/prosemirror/utils/visualLineNavigation';

export interface VisualLineNavigationOptions {
  pagesContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useVisualLineNavigation({ pagesContainerRef }: VisualLineNavigationOptions) {
  const stateRef = useRef(createVisualLineState());

  const getCaretClientX = useCallback(
    (pmPos: number): number | null => {
      const container = pagesContainerRef.current;
      return container ? coreGetCaretClientX(container, pmPos) : null;
    },
    [pagesContainerRef]
  );

  const findLineElementAtPosition = useCallback(
    (pmPos: number): HTMLElement | null => {
      const container = pagesContainerRef.current;
      return container ? coreFindLineElementAtPosition(container, pmPos) : null;
    },
    [pagesContainerRef]
  );

  const findPositionOnLineAtClientX = useCallback(
    (lineEl: HTMLElement, clientX: number): number | null => {
      return coreFindPositionOnLineAtClientX(lineEl, clientX);
    },
    []
  );

  /**
   * Handle key events on the ProseMirror EditorView BEFORE PM processes them.
   * Implements visual-line-aware ArrowUp/ArrowDown with sticky X.
   */
  const handlePMKeyDown = useCallback(
    (view: EditorView, event: KeyboardEvent): boolean => {
      return handleVisualLineKeyDown(stateRef.current, view, event, pagesContainerRef.current);
    },
    [pagesContainerRef]
  );

  return {
    stickyXRef: {
      get current(): number | null {
        return stateRef.current.stickyX;
      },
      set current(value: number | null) {
        stateRef.current.stickyX = value;
      },
    },
    lastVisualLineIndexRef: {
      get current(): number {
        return stateRef.current.lastVisualLineIndex;
      },
      set current(value: number) {
        stateRef.current.lastVisualLineIndex = value;
      },
    },
    getCaretClientX,
    findLineElementAtPosition,
    findPositionOnLineAtClientX,
    handlePMKeyDown,
  };
}
