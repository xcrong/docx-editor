/**
 * useClipboard Hook
 *
 * Thin React wrapper around the framework-agnostic ClipboardManager from core.
 * All clipboard I/O (copy/cut/read, event serialize + parse) lives in the
 * manager; this hook only adds React glue: the processing flag, the
 * last-pasted ref, and the option callbacks.
 */

import { useCallback, useMemo, useRef } from 'react';
import {
  ClipboardManager,
  getSelectionRuns,
  createSelectionFromDOM,
} from '@xcrong/docx-editor-core';
import type { ParsedClipboardContent } from '@xcrong/docx-editor-core/utils';
import type { ClipboardSelection, Theme } from '@xcrong/docx-editor-core';

// ============================================================================
// RE-EXPORTS (backwards compat)
// ============================================================================

export { getSelectionRuns, createSelectionFromDOM };
export type { ClipboardSelection };

// ============================================================================
// TYPES
// ============================================================================

export interface UseClipboardOptions {
  onCopy?: (selection: ClipboardSelection) => void;
  onCut?: (selection: ClipboardSelection) => void;
  onPaste?: (content: ParsedClipboardContent, asPlainText: boolean) => void;
  cleanWordFormatting?: boolean;
  editable?: boolean;
  onError?: (error: Error) => void;
  /** Document theme — used to resolve themed colors in the HTML clipboard payload. */
  theme?: Theme | null;
}

export interface UseClipboardReturn {
  copy: (selection: ClipboardSelection) => Promise<boolean>;
  cut: (selection: ClipboardSelection) => Promise<boolean>;
  paste: (asPlainText?: boolean) => Promise<ParsedClipboardContent | null>;
  handleCopy: (event: ClipboardEvent) => void;
  handleCut: (event: ClipboardEvent) => void;
  handlePaste: (event: ClipboardEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  isProcessing: boolean;
  lastPastedContent: ParsedClipboardContent | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const {
    onCopy,
    onCut,
    onPaste,
    cleanWordFormatting = true,
    editable = true,
    onError,
    theme,
  } = options;

  // ClipboardManager owns all clipboard I/O. Created once; options are
  // refreshed every render so handlers never see stale callbacks/theme.
  const manager = useMemo(() => new ClipboardManager(), []);
  manager.setOptions({ cleanWordFormatting, onError, theme });

  const isProcessingRef = useRef<boolean>(false);
  const lastPastedContentRef = useRef<ParsedClipboardContent | null>(null);

  const copy = useCallback(
    async (selection: ClipboardSelection): Promise<boolean> => {
      if (isProcessingRef.current) return false;

      isProcessingRef.current = true;
      try {
        const success = await manager.copy(selection);
        if (success) {
          onCopy?.(selection);
        }
        return success;
      } finally {
        isProcessingRef.current = false;
      }
    },
    [manager, onCopy]
  );

  const cut = useCallback(
    async (selection: ClipboardSelection): Promise<boolean> => {
      if (isProcessingRef.current || !editable) return false;

      isProcessingRef.current = true;
      try {
        const success = await manager.cut(selection);
        if (success) {
          onCut?.(selection);
        }
        return success;
      } finally {
        isProcessingRef.current = false;
      }
    },
    [manager, onCut, editable]
  );

  const paste = useCallback(
    async (asPlainText = false): Promise<ParsedClipboardContent | null> => {
      if (isProcessingRef.current || !editable) return null;

      isProcessingRef.current = true;
      try {
        const content = await manager.readClipboard(asPlainText);
        if (content) {
          lastPastedContentRef.current = content;
          onPaste?.(content, asPlainText);
        }
        return content;
      } finally {
        isProcessingRef.current = false;
      }
    },
    [manager, editable, onPaste]
  );

  const handleCopy = useCallback(
    (event: ClipboardEvent) => {
      const selection = createSelectionFromDOM();
      if (!selection) return;

      event.preventDefault();
      manager.writeEventData(event, selection);

      onCopy?.(selection);
    },
    [manager, onCopy]
  );

  const handleCut = useCallback(
    (event: ClipboardEvent) => {
      if (!editable) return;

      const selection = createSelectionFromDOM();
      if (!selection) return;

      event.preventDefault();
      manager.writeEventData(event, selection);

      onCut?.(selection);
    },
    [manager, editable, onCut]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      if (!editable) return;

      event.preventDefault();

      const content = manager.parsePasteEvent(event);
      if (content) {
        lastPastedContentRef.current = content;
        const asPlainText = (event as unknown as KeyboardEvent).shiftKey ?? false;
        onPaste?.(content, asPlainText);
      }
    },
    [manager, editable, onPaste]
  );

  const handleKeyDown = useCallback((_event: KeyboardEvent) => {
    // Let native copy/cut/paste events handle clipboard operations
  }, []);

  return {
    copy,
    cut,
    paste,
    handleCopy,
    handleCut,
    handlePaste,
    handleKeyDown,
    isProcessing: isProcessingRef.current,
    lastPastedContent: lastPastedContentRef.current,
  };
}

export default useClipboard;
