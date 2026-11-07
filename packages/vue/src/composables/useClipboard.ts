/**
 * Vue port of packages/react/src/hooks/useClipboard.ts. Thin wrapper around
 * the framework-agnostic ClipboardManager in core: all clipboard I/O lives in
 * the manager, this composable only adds Vue glue (refs and callbacks).
 * Same surface as the React hook but without the React-specific useRef wrappers.
 */
import { ref, type Ref } from 'vue';
import {
  ClipboardManager,
  getSelectionRuns,
  createSelectionFromDOM,
} from '@xcrong/docx-editor-core';
import {
  runsToClipboardContent,
  type ParsedClipboardContent,
} from '@xcrong/docx-editor-core/utils';
import type { ClipboardSelection, Theme } from '@xcrong/docx-editor-core';

export { getSelectionRuns, createSelectionFromDOM, runsToClipboardContent };
export type { ClipboardSelection };
export interface UseClipboardOptions {
  onCopy?: (selection: ClipboardSelection) => void;
  onCut?: (selection: ClipboardSelection) => void;
  onPaste?: (content: ParsedClipboardContent, asPlainText: boolean) => void;
  cleanWordFormatting?: boolean;
  editable?: boolean;
  onError?: (error: Error) => void;
  theme?: Theme | null;
}

export interface UseClipboardReturn {
  copy: (selection: ClipboardSelection) => Promise<boolean>;
  cut: (selection: ClipboardSelection) => Promise<boolean>;
  paste: (asPlainText?: boolean) => Promise<ParsedClipboardContent | null>;
  isProcessing: Ref<boolean>;
  lastPastedContent: Ref<ParsedClipboardContent | null>;
}

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

  // ClipboardManager owns all clipboard I/O, mirroring the React hook.
  const manager = new ClipboardManager({ cleanWordFormatting, onError, theme });

  const isProcessing = ref(false);
  const lastPastedContent = ref<ParsedClipboardContent | null>(null);

  async function copy(selection: ClipboardSelection): Promise<boolean> {
    if (isProcessing.value) return false;
    isProcessing.value = true;
    try {
      const ok = await manager.copy(selection);
      if (ok) onCopy?.(selection);
      return ok;
    } finally {
      isProcessing.value = false;
    }
  }

  async function cut(selection: ClipboardSelection): Promise<boolean> {
    if (isProcessing.value || !editable) return false;
    isProcessing.value = true;
    try {
      const ok = await manager.cut(selection);
      if (ok) onCut?.(selection);
      return ok;
    } finally {
      isProcessing.value = false;
    }
  }

  async function paste(asPlainText = false): Promise<ParsedClipboardContent | null> {
    if (isProcessing.value || !editable) return null;
    isProcessing.value = true;
    try {
      const content = await manager.readClipboard(asPlainText);
      if (content) {
        lastPastedContent.value = content;
        onPaste?.(content, asPlainText);
      }
      return content;
    } finally {
      isProcessing.value = false;
    }
  }

  return {
    copy,
    cut,
    paste,
    isProcessing,
    lastPastedContent,
  };
}
