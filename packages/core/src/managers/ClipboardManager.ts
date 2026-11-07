/**
 * ClipboardManager
 *
 * Framework-agnostic class for clipboard operations in the editor.
 * Extracted from the React `useClipboard` hook.
 *
 * Handles:
 * - DOM selection traversal and run extraction
 * - Formatting extraction from computed styles
 * - Clipboard read/write operations
 */

import type { Run, Theme } from '../types/document';
import {
  INTERNAL_CLIPBOARD_TYPE,
  copyRuns,
  handlePasteEvent,
  parseClipboardHtml,
  runsToClipboardContent,
} from '../utils/clipboard';
import type { ClipboardContent, ParsedClipboardContent } from '../utils/clipboard';

// ============================================================================
// TYPES
// ============================================================================

/** Selection data for clipboard operations */
export interface ClipboardSelection {
  text: string;
  runs: Run[];
  startParagraphIndex: number;
  startRunIndex: number;
  startOffset: number;
  endParagraphIndex: number;
  endRunIndex: number;
  endOffset: number;
  isMultiParagraph: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert a CSS color string (rgb/rgba/hex) to a 6-char uppercase hex string.
 *
 * NOTE: This differs from `colorResolver.rgbToHex(r, g, b)` which takes
 * numeric components. This function parses CSS color strings.
 */
export function cssColorToHex(color: string): string | null {
  if (!color || color === 'transparent' || color === 'inherit') return null;

  if (color.startsWith('#')) {
    return color.slice(1).toUpperCase();
  }

  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return (r + g + b).toUpperCase();
  }

  return null;
}

/** Extract formatting from an HTML element's computed styles. */
export function extractFormattingFromElement(element: HTMLElement): Run['formatting'] {
  const style = window.getComputedStyle(element);
  const formatting: Run['formatting'] = {};

  // Bold
  if (style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700) {
    formatting.bold = true;
  }

  // Italic
  if (style.fontStyle === 'italic') {
    formatting.italic = true;
  }

  // Underline
  const textDecoration = style.textDecoration || style.textDecorationLine;
  if (textDecoration && textDecoration.includes('underline')) {
    formatting.underline = { style: 'single' };
  }

  // Strikethrough
  if (textDecoration && textDecoration.includes('line-through')) {
    formatting.strike = true;
  }

  // Font size (convert px to half-points)
  const fontSize = parseFloat(style.fontSize);
  if (!isNaN(fontSize) && fontSize > 0) {
    formatting.fontSize = Math.round((fontSize / 1.333) * 2);
  }

  // Font family
  const fontFamily = style.fontFamily.replace(/["']/g, '').split(',')[0].trim();
  if (fontFamily) {
    formatting.fontFamily = { ascii: fontFamily };
  }

  // Color
  const color = style.color;
  if (color && color !== 'rgb(0, 0, 0)') {
    const hex = cssColorToHex(color);
    if (hex) {
      formatting.color = { rgb: hex };
    }
  }

  // Background color
  const bgColor = style.backgroundColor;
  if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
    const hex = rgbToHex(bgColor);
    if (hex) {
      formatting.shading = { fill: { rgb: hex } };
    }
  }

  return Object.keys(formatting).length > 0 ? formatting : undefined;
}

/** Get selected text from a run element, considering partial selection. */
function getSelectedTextFromRun(runEl: Node, range: Range): string {
  const runRange = document.createRange();
  runRange.selectNodeContents(runEl);

  const startInRun =
    range.compareBoundaryPoints(Range.START_TO_START, runRange) >= 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, runRange) <= 0;
  const endInRun =
    range.compareBoundaryPoints(Range.END_TO_START, runRange) >= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, runRange) <= 0;

  if (startInRun && endInRun) {
    return range.toString();
  } else if (startInRun) {
    const tempRange = document.createRange();
    tempRange.setStart(range.startContainer, range.startOffset);
    tempRange.selectNodeContents(runEl);
    tempRange.setEnd(runRange.endContainer, runRange.endOffset);
    return tempRange.toString();
  } else if (endInRun) {
    const tempRange = document.createRange();
    tempRange.selectNodeContents(runEl);
    tempRange.setEnd(range.endContainer, range.endOffset);
    tempRange.setStart(runRange.startContainer, runRange.startOffset);
    return tempRange.toString();
  } else if (range.intersectsNode(runEl)) {
    return runEl.textContent || '';
  }

  return '';
}

/** Find the paragraph element containing a node. */
function findParagraphElement(node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as HTMLElement;
      if (element.hasAttribute('data-paragraph-index')) {
        return element;
      }
    }
    current = current.parentNode;
  }
  return null;
}

/** Get selected runs from the current DOM selection. */
export function getSelectionRuns(): Run[] {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return [];

  const runs: Run[] = [];
  const range = selection.getRangeAt(0);

  const container = range.commonAncestorContainer;
  const containerElement =
    container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;

  if (!containerElement) return runs;

  const runElements = containerElement.querySelectorAll('.docx-run');

  runElements.forEach((runEl) => {
    if (range.intersectsNode(runEl)) {
      const text = getSelectedTextFromRun(runEl, range);
      if (text) {
        const formatting = extractFormattingFromElement(runEl as HTMLElement);
        runs.push({
          type: 'run',
          formatting,
          content: [{ type: 'text', text }],
        });
      }
    }
  });

  if (runs.length === 0) {
    const selectedText = selection.toString();
    if (selectedText) {
      runs.push({
        type: 'run',
        content: [{ type: 'text', text: selectedText }],
      });
    }
  }

  return runs;
}

/** Create a ClipboardSelection from the current DOM selection. */
export function createSelectionFromDOM(): ClipboardSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;

  const runs = getSelectionRuns();
  if (runs.length === 0) return null;

  const text = selection.toString();
  const range = selection.getRangeAt(0);
  const startPara = findParagraphElement(range.startContainer);
  const endPara = findParagraphElement(range.endContainer);

  const startParagraphIndex = startPara
    ? parseInt(startPara.getAttribute('data-paragraph-index') || '0', 10)
    : 0;
  const endParagraphIndex = endPara
    ? parseInt(endPara.getAttribute('data-paragraph-index') || '0', 10)
    : 0;

  return {
    text,
    runs,
    startParagraphIndex,
    startRunIndex: 0,
    startOffset: range.startOffset,
    endParagraphIndex,
    endRunIndex: 0,
    endOffset: range.endOffset,
    isMultiParagraph: startParagraphIndex !== endParagraphIndex,
  };
}

// Backwards-compatible alias
export const rgbToHex = cssColorToHex;

// ============================================================================
// CLIPBOARD MANAGER
// ============================================================================

/** Options for {@link ClipboardManager}. Mirrors the hook-level options. */
export interface ClipboardManagerOptions {
  /** Whether to clean Word-specific formatting on paste. Default true. */
  cleanWordFormatting?: boolean;
  /** Callback for handling clipboard errors. */
  onError?: (error: Error) => void;
  /** Document theme — used to resolve themed colors in the HTML clipboard payload. */
  theme?: Theme | null;
}

/**
 * ClipboardManager
 *
 * Framework-agnostic owner of clipboard I/O for the editor. Thin framework
 * adapters (React `useClipboard`, Vue `useClipboard`) delegate to this class
 * and only add framework glue (processing flags, callbacks, event wiring).
 *
 * Primitives (`copyRuns`, `runsToClipboardContent`, `handlePasteEvent`,
 * `parseClipboardHtml`) live in `utils/clipboard`; this class orchestrates
 * them (copy/cut/read/event serialize + parse) so adapters stay in lockstep.
 */
export class ClipboardManager {
  private cleanWordFormatting = true;
  private onError?: (error: Error) => void;
  private theme?: Theme | null;

  constructor(options: ClipboardManagerOptions = {}) {
    this.setOptions(options);
  }

  /** Refresh options (call when adapter props change). */
  setOptions(options: ClipboardManagerOptions): void {
    if (options.cleanWordFormatting !== undefined) {
      this.cleanWordFormatting = options.cleanWordFormatting;
    }
    if (options.onError !== undefined) {
      this.onError = options.onError;
    }
    if (options.theme !== undefined) {
      this.theme = options.theme;
    }
  }

  /** Copy a DOM-derived selection to the clipboard. */
  async copy(selection: ClipboardSelection): Promise<boolean> {
    return copyRuns(selection.runs, { onError: this.onError, theme: this.theme });
  }

  /** Cut is copy-then-delete; the manager owns the clipboard half. */
  async cut(selection: ClipboardSelection): Promise<boolean> {
    return copyRuns(selection.runs, { onError: this.onError, theme: this.theme });
  }

  /**
   * Read the clipboard via `navigator.clipboard.read()` and parse it.
   * Returns null when the API is unavailable (callers fall back to events).
   */
  async readClipboard(asPlainText = false): Promise<ParsedClipboardContent | null> {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
      const items = await navigator.clipboard.read();
      let html = '';
      let plainText = '';
      for (const item of items) {
        if (item.types.includes('text/html')) {
          html = await (await item.getType('text/html')).text();
        }
        if (item.types.includes('text/plain')) {
          plainText = await (await item.getType('text/plain')).text();
        }
      }
      if (asPlainText) html = '';
      return parseClipboardHtml(html, plainText, this.cleanWordFormatting);
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /** Serialize a selection for a copy/cut DOM event. */
  serializeForEvent(selection: ClipboardSelection): ClipboardContent {
    return runsToClipboardContent(selection.runs, true, this.theme ?? null);
  }

  /** Write a serialized selection onto a copy/cut DOM event. */
  writeEventData(event: ClipboardEvent, selection: ClipboardSelection): void {
    const content = this.serializeForEvent(selection);
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', content.plainText);
      event.clipboardData.setData('text/html', content.html);
      if (content.internal) {
        event.clipboardData.setData(INTERNAL_CLIPBOARD_TYPE, content.internal);
      }
    }
  }

  /** Parse a paste DOM event. */
  parsePasteEvent(event: ClipboardEvent): ParsedClipboardContent | null {
    return handlePasteEvent(event, { cleanWordFormatting: this.cleanWordFormatting });
  }
}
