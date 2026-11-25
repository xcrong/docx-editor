/**
 * DOM-based Click-to-Position Mapping
 *
 * Uses the browser's actual rendered DOM to find ProseMirror positions.
 * This is more accurate than geometry-based calculation because it uses
 * the browser's own text rendering with document.elementsFromPoint().
 *
 * DOM elements are tagged with data-pm-start and data-pm-end attributes,
 * enabling binary search to find exact character positions.
 * @packageDocumentation
 * @public
 */

import {
  findBodyEmptyRuns,
  findBodyParagraphs,
  findBodyPmSpans,
  findHfEmptyRuns,
  findHfParagraphs,
  findHfPmAnchor,
  findHfPmSpans,
  findHfRanged,
  type DomScope,
} from './findBodyPmSpans';

export type { DomScope } from './findBodyPmSpans';

/**
 * Scope selector for the DOM-based caret/selection walks.
 *
 * The body and the header/footer live in separate ProseMirror documents
 * whose numeric positions overlap, so every walk must commit to one
 * tree. `'body'` (default) scopes to `.layout-page-content`;
 * `'hf'` scopes to the painted header/footer `host` (a resolved
 * `.layout-page-header` / `.layout-page-footer` element, or — when
 * omitted — any HF host under `container`).
 *
 * @public
 */
export interface DomScopeOptions {
  scope?: DomScope;
  host?: HTMLElement | null;
}

/**
 * Options for {@link clickToPositionDom}.
 *
 * @public
 */
export interface ClickToPositionDomOptions {
  /**
   * Ignore hits inside `.layout-page-header` / `.layout-page-footer`.
   * Body drags in normal (non-HF-edit) mode must resolve against the body
   * PM document only: HF runs live in a separate PM document whose numeric
   * positions overlap the body's, so an HF hit applied to the body view
   * corrupts the selection (T30: drag auto-scroll extension collapsing when
   * the edge-zone point slides over a footer). Defaults to false to keep
   * HF-editing call sites on the current behavior.
   */
  bodyOnly?: boolean;
}

/** True when `el` lives inside a painted header or footer instance. */
function isInHeaderFooter(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  return !!htmlEl.closest?.('.layout-page-header, .layout-page-footer');
}

/**
 * Find ProseMirror position from a click using DOM-based detection.
 *
 * @param container - The pages container element
 * @param clientX - Client X coordinate from mouse event
 * @param clientY - Client Y coordinate from mouse event
 * @param zoom - Current zoom level (default 1)
 * @param options - Hit-scope options (see {@link ClickToPositionDomOptions})
 * @returns ProseMirror position, or null if not found
 */
export function clickToPositionDom(
  container: HTMLElement,
  clientX: number,
  clientY: number,
  zoom: number = 1,
  options?: ClickToPositionDomOptions
): number | null {
  const bodyOnly = options?.bodyOnly === true;
  // Get all elements at the click point
  const elements = document.elementsFromPoint(clientX, clientY);
  // Body-only drags skip header/footer chrome: those spans carry HF-document
  // positions that are meaningless (and harmful) on the body PM view.
  const inScope = bodyOnly ? elements.filter((el) => !isInHeaderFooter(el)) : elements;

  // Find the page element
  const pageEl = elements.find((el) => el.classList.contains('layout-page')) as HTMLElement | null;
  if (!pageEl) return null;

  // Find span with PM position data
  const spanEl = inScope.find(
    (el) =>
      el.tagName === 'SPAN' &&
      (el as HTMLElement).dataset.pmStart !== undefined &&
      (el as HTMLElement).dataset.pmEnd !== undefined
  ) as HTMLElement | null;

  if (spanEl) {
    return findPositionInSpan(spanEl, clientX, clientY);
  }

  // Check for empty paragraphs (including inside table cells)
  const emptyRun = inScope.find((el) =>
    el.classList.contains('layout-empty-run')
  ) as HTMLElement | null;
  if (emptyRun) {
    const paragraph = emptyRun.closest('.layout-paragraph') as HTMLElement | null;
    if (paragraph && paragraph.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
  }

  // Check for paragraph elements directly (handles clicks in whitespace
  // to the right of text, or table cells where the narrow empty-run span
  // isn't hit but the parent paragraph div is)
  const paragraphEl = inScope.find(
    (el) =>
      el.classList.contains('layout-paragraph') && (el as HTMLElement).dataset.pmStart !== undefined
  ) as HTMLElement | null;
  if (paragraphEl && paragraphEl.dataset.pmStart) {
    // Try to find the nearest span within this paragraph so clicks to the
    // right of text land at the end of the line, not the paragraph start.
    const nearestPos = findNearestSpanInElement(paragraphEl, clientX, clientY);
    if (nearestPos !== null) {
      return nearestPos;
    }
    return Number(paragraphEl.dataset.pmStart);
  }

  // Check if click is within a table cell. When clicking in empty space below
  // text in a cell, restrict the search to spans within that cell to avoid
  // the cursor jumping to a different cell (fixes #54).
  const cellEl = inScope.find((el) =>
    el.classList.contains('layout-table-cell')
  ) as HTMLElement | null;
  if (cellEl) {
    return findNearestSpanInElement(cellEl, clientX, clientY);
  }

  // Fallback: Find nearest text span on the page
  return findNearestSpan(container, pageEl, clientX, clientY, zoom, bodyOnly);
}

/**
 * Find exact position within a text span using binary search on character boundaries.
 */
function findPositionInSpan(spanEl: HTMLElement, clientX: number, _clientY: number): number | null {
  const pmStart = Number(spanEl.dataset.pmStart);
  const pmEnd = Number(spanEl.dataset.pmEnd);

  // Special handling for tab spans - they have a visual width but only contain NBSP
  // Clicking anywhere on a tab should position cursor at start or end based on click position
  if (spanEl.classList.contains('layout-run-tab')) {
    const rect = spanEl.getBoundingClientRect();
    const midpoint = (rect.left + rect.right) / 2;
    // Click in left half -> start of tab, right half -> end of tab
    return clientX < midpoint ? pmStart : pmEnd;
  }

  const textNode = spanEl.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    // No text content - return start position
    return pmStart;
  }

  const text = textNode as Text;
  const textLength = text.length;

  if (textLength === 0) {
    return pmStart;
  }

  const ownerDoc = spanEl.ownerDocument;
  if (!ownerDoc) return pmStart;

  // Binary search for the character boundary
  let left = 0;
  let right = textLength;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const range = ownerDoc.createRange();
    range.setStart(text, mid);
    range.setEnd(text, mid);

    const rect = range.getBoundingClientRect();
    const charX = rect.left;

    if (clientX < charX) {
      right = mid;
    } else {
      left = mid + 1;
    }
  }

  // Refine: check if we're closer to left-1 or left
  if (left > 0 && left <= textLength) {
    const range = ownerDoc.createRange();

    // Get position of character at left-1
    range.setStart(text, left - 1);
    range.setEnd(text, left - 1);
    const leftRect = range.getBoundingClientRect();

    // Get position of character at left
    range.setStart(text, Math.min(left, textLength));
    range.setEnd(text, Math.min(left, textLength));
    const rightRect = range.getBoundingClientRect();

    // Use the closer boundary
    const distLeft = Math.abs(clientX - leftRect.left);
    const distRight = Math.abs(clientX - rightRect.left);

    if (distLeft < distRight) {
      return pmStart + (left - 1);
    }
  }

  return pmStart + Math.min(left, pmEnd - pmStart);
}

/**
 * Find the nearest text span within a specific element (e.g. a table cell).
 * Used when a click lands in empty space within a cell to keep the cursor
 * inside that cell rather than jumping to a different one.
 */
function findNearestSpanInElement(
  element: HTMLElement,
  clientX: number,
  clientY: number
): number | null {
  // Check for empty paragraphs within this element
  const emptyRun = element.querySelector('.layout-empty-run') as HTMLElement | null;
  if (emptyRun) {
    const paragraph = emptyRun.closest('.layout-paragraph') as HTMLElement | null;
    if (paragraph && paragraph.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
  }

  // Find the closest line within this element
  const lines = element.querySelectorAll('.layout-line');
  let closestLine: HTMLElement | null = null;
  let closestLineDistance = Infinity;

  for (const line of Array.from(lines)) {
    const lineEl = line as HTMLElement;
    const rect = lineEl.getBoundingClientRect();
    const centerY = (rect.top + rect.bottom) / 2;
    const distance = Math.abs(clientY - centerY);

    if (distance < closestLineDistance) {
      closestLineDistance = distance;
      closestLine = lineEl;
    }
  }

  if (!closestLine) {
    // No lines - try paragraph directly
    const paragraph = element.querySelector(
      '.layout-paragraph[data-pm-start]'
    ) as HTMLElement | null;
    if (paragraph?.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
    // Last resort: use the cell's own PM position
    if (element.dataset.pmStart) {
      return Number(element.dataset.pmStart);
    }
    return null;
  }

  // Find closest span in that line
  const lineSpans = closestLine.querySelectorAll('span[data-pm-start][data-pm-end]');
  if (lineSpans.length === 0) {
    const paragraph = closestLine.closest('.layout-paragraph') as HTMLElement | null;
    if (paragraph?.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
    return null;
  }

  let closestSpan: HTMLElement | null = null;
  let closestSpanDistance = Infinity;

  for (const span of Array.from(lineSpans)) {
    const spanEl = span as HTMLElement;
    const rect = spanEl.getBoundingClientRect();

    if (clientX >= rect.left && clientX <= rect.right) {
      return findPositionInSpan(spanEl, clientX, clientY);
    }

    const distance = clientX < rect.left ? rect.left - clientX : clientX - rect.right;
    if (distance < closestSpanDistance) {
      closestSpanDistance = distance;
      closestSpan = spanEl;
    }
  }

  if (!closestSpan) return null;

  const rect = closestSpan.getBoundingClientRect();
  if (clientX < rect.left) {
    return Number(closestSpan.dataset.pmStart);
  } else {
    return Number(closestSpan.dataset.pmEnd);
  }
}

/**
 * Find the nearest text span when click is not directly on text.
 * This handles clicks in margins, between lines, etc.
 */
function findNearestSpan(
  _container: HTMLElement,
  pageEl: HTMLElement,
  clientX: number,
  clientY: number,
  _zoom: number,
  bodyOnly = false
): number | null {
  // Body-only drags resolve inside the content subtree so header/footer
  // spans on the same page can never win the nearest-line lookup.
  const scopeRoot = bodyOnly
    ? ((pageEl.querySelector('.layout-page-content') as HTMLElement | null) ?? pageEl)
    : pageEl;
  // Get all text spans on this page
  const spans = scopeRoot.querySelectorAll('span[data-pm-start][data-pm-end]');
  if (spans.length === 0) {
    // No text spans - return position based on paragraph
    const paragraphs = scopeRoot.querySelectorAll('.layout-paragraph');
    if (paragraphs.length > 0) {
      const firstP = paragraphs[0] as HTMLElement;
      return Number(firstP.dataset.pmStart) || 0;
    }
    return null;
  }

  // Find the closest line to the click Y
  const lines = scopeRoot.querySelectorAll('.layout-line');
  let closestLine: HTMLElement | null = null;
  let closestLineDistance = Infinity;

  for (const line of Array.from(lines)) {
    const lineEl = line as HTMLElement;
    const rect = lineEl.getBoundingClientRect();
    const centerY = (rect.top + rect.bottom) / 2;
    const distance = Math.abs(clientY - centerY);

    if (distance < closestLineDistance) {
      closestLineDistance = distance;
      closestLine = lineEl;
    }
  }

  if (!closestLine) return null;

  // Get spans in this line
  const lineSpans = closestLine.querySelectorAll('span[data-pm-start][data-pm-end]');
  if (lineSpans.length === 0) {
    // Empty line - find PM position from paragraph
    const paragraph = closestLine.closest('.layout-paragraph') as HTMLElement | null;
    if (paragraph?.dataset.pmStart) {
      return Number(paragraph.dataset.pmStart);
    }
    return null;
  }

  // Find closest span in the line
  let closestSpan: HTMLElement | null = null;
  let closestSpanDistance = Infinity;

  for (const span of Array.from(lineSpans)) {
    const spanEl = span as HTMLElement;
    const rect = spanEl.getBoundingClientRect();

    // Check if click is within span bounds
    if (clientX >= rect.left && clientX <= rect.right) {
      return findPositionInSpan(spanEl, clientX, clientY);
    }

    // Calculate distance to span
    const distance = clientX < rect.left ? rect.left - clientX : clientX - rect.right;

    if (distance < closestSpanDistance) {
      closestSpanDistance = distance;
      closestSpan = spanEl;
    }
  }

  if (!closestSpan) return null;

  const rect = closestSpan.getBoundingClientRect();

  // If click is to the left, return start; if right, return end
  if (clientX < rect.left) {
    return Number(closestSpan.dataset.pmStart);
  } else {
    return Number(closestSpan.dataset.pmEnd);
  }
}

/**
 * Get selection rectangles for a PM range using DOM-based detection.
 *
 * @param container - The pages container element
 * @param from - Start PM position
 * @param to - End PM position
 * @param overlayRect - Bounding rect of the selection overlay
 * @returns Array of selection rectangles in overlay coordinates
 */
export interface DomSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

/** A rect whose height drops below this after clipping is treated as fully hidden. */
const MIN_VISIBLE_RECT = 0.5;

/**
 * Vertically clip a client rect to the enclosing page-fragment table's visible
 * box. A table that breaks across a page sits in a `.layout-table` with
 * `overflow:hidden` and `height = visibleHeight`; getClientRects() still reports
 * the geometry of lines that are visually clipped (off the page / in the
 * inter-page gap), so selection highlights must be clipped to the same box.
 *
 * Uses `.layout-table:not(.layout-nested-table)` because only the page-fragment
 * table carries the window clip — the inner nested table has no overflow:hidden.
 * Clips vertically only (the gap bug is vertical; horizontal clipping could trim
 * change bars on tracked-change tables that set overflow-x: visible).
 *
 * Returns null when the rect is fully outside the window.
 */
export function clipRectToTableWindow(
  spanEl: Element,
  rect: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  }
): { left: number; top: number; right: number; bottom: number } | null {
  const clipEl = spanEl.closest('.layout-table:not(.layout-nested-table)');
  if (!clipEl) return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  const clip = clipEl.getBoundingClientRect();
  const top = Math.max(rect.top, clip.top);
  const bottom = Math.min(rect.bottom, clip.bottom);
  if (bottom - top <= MIN_VISIBLE_RECT) return null;
  return { left: rect.left, top, right: rect.right, bottom };
}

const BLANK_LINE_SELECTION_WIDTH_PX = 4;

function blankLineSliverRect(markerEl: HTMLElement, overlayRect: DOMRect): DomSelectionRect | null {
  const lineEl = markerEl.closest('.layout-line') as HTMLElement | null;
  const lineBox = (lineEl ?? markerEl).getBoundingClientRect();
  const left = markerEl.getBoundingClientRect().left;
  const clipped = clipRectToTableWindow(markerEl, {
    left,
    top: lineBox.top,
    right: left + BLANK_LINE_SELECTION_WIDTH_PX,
    bottom: lineBox.bottom,
  });
  if (!clipped) return null;
  const pageEl = markerEl.closest('.layout-page') as HTMLElement | null;
  return {
    x: clipped.left - overlayRect.left,
    y: clipped.top - overlayRect.top,
    width: clipped.right - clipped.left,
    height: clipped.bottom - clipped.top,
    pageIndex: pageEl ? Number(pageEl.dataset.pageNumber || 1) - 1 : 0,
  };
}

function emptyParagraphRangeFor(emptyRun: HTMLElement): { pmStart: number; pmEnd: number } | null {
  const paragraph = emptyRun.closest('.layout-paragraph') as HTMLElement | null;
  if (!paragraph) return null;
  const pmStart = Number(paragraph.dataset.pmStart);
  const pmEnd = Number(paragraph.dataset.pmEnd);
  if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) return null;
  return { pmStart, pmEnd };
}

export function getSelectionRectsFromDom(
  container: HTMLElement,
  from: number,
  to: number,
  overlayRect: DOMRect,
  options?: DomScopeOptions
): DomSelectionRect[] {
  const rects: DomSelectionRect[] = [];
  const scope = options?.scope ?? 'body';
  const scopeRoot: ParentNode = scope === 'hf' ? (options?.host ?? container) : container;
  // Shared host-level snapshot with the caret walk (see the cache note
  // above); container-wide HF roots skip the cache and query directly.
  const hfSnapshot = scope === 'hf' ? getHfScopeSnapshot(scopeRoot) : null;

  // Body spans are scoped via `findBodyPmSpans` so HF spans (whose PM
  // positions live in a separate document) don't bleed selection rects
  // into headers when body PM positions happen to overlap. Same fix as
  // #406 / #408 on the React-side selection-resolution path. The HF
  // scope mirrors it via `findHfPmSpans` so a header/footer selection
  // never picks up body spans with colliding positions.
  const spans =
    scope === 'hf' ? (hfSnapshot?.spans ?? findHfPmSpans(scopeRoot)) : findBodyPmSpans(container);

  for (const span of Array.from(spans)) {
    const spanEl = span as HTMLElement;
    const pmStart = Number(spanEl.dataset.pmStart);
    const pmEnd = Number(spanEl.dataset.pmEnd);

    // Check if span overlaps with selection
    if (pmEnd <= from || pmStart >= to) continue;

    // Clip each rect to the enclosing split-table's visible window so selecting
    // across a page-broken table doesn't scatter boxes into the inter-page gap
    // (getClientRects reports geometry for lines hidden by the table's
    // overflow:hidden).
    const pageEl = spanEl.closest('.layout-page') as HTMLElement | null;
    const pageIndex = pageEl ? Number(pageEl.dataset.pageNumber || 1) - 1 : 0;
    const pushClipped = (rect: { left: number; top: number; right: number; bottom: number }) => {
      const clipped = clipRectToTableWindow(spanEl, rect);
      if (!clipped) return;
      rects.push({
        x: clipped.left - overlayRect.left,
        y: clipped.top - overlayRect.top,
        width: clipped.right - clipped.left,
        height: clipped.bottom - clipped.top,
        pageIndex,
      });
    };

    if (pmStart === pmEnd) {
      const sliver = blankLineSliverRect(spanEl, overlayRect);
      if (sliver) rects.push(sliver);
      continue;
    }

    // Tab runs render as fixed-width spans with no text node — use their box.
    if (spanEl.classList.contains('layout-run-tab')) {
      pushClipped(spanEl.getBoundingClientRect());
      continue;
    }

    // Text node may be a direct child, or nested inside an <a> for hyperlinks.
    let textNode: Text | null = null;
    if (spanEl.firstChild?.nodeType === Node.TEXT_NODE) {
      textNode = spanEl.firstChild as Text;
    } else if (
      spanEl.firstChild?.nodeType === Node.ELEMENT_NODE &&
      (spanEl.firstChild as HTMLElement).tagName === 'A' &&
      spanEl.firstChild.firstChild?.nodeType === Node.TEXT_NODE
    ) {
      textNode = spanEl.firstChild.firstChild as Text;
    }
    if (!textNode) continue;
    const ownerDoc = spanEl.ownerDocument;
    if (!ownerDoc) continue;

    // Calculate character range within this span
    const startChar = Math.max(0, from - pmStart);
    const endChar = Math.min(textNode.length, to - pmStart);

    if (startChar >= endChar) continue;

    // Create range for the selected text
    const range = ownerDoc.createRange();
    range.setStart(textNode, startChar);
    range.setEnd(textNode, endChar);

    // Get all client rects (handles line wraps)
    for (const clientRect of Array.from(range.getClientRects())) {
      pushClipped(clientRect);
    }
  }

  for (const emptyRun of scope === 'hf'
    ? (hfSnapshot?.emptyRuns ?? findHfEmptyRuns(scopeRoot))
    : findBodyEmptyRuns(container)) {
    const range = emptyParagraphRangeFor(emptyRun);
    if (!range || range.pmEnd <= from || range.pmStart >= to) continue;
    const sliver = blankLineSliverRect(emptyRun, overlayRect);
    if (sliver) rects.push(sliver);
  }

  return rects;
}

/**
 * Get caret position from DOM for a PM position.
 *
 * @param container - The pages container element
 * @param pmPos - ProseMirror position
 * @param overlayRect - Bounding rect of the selection overlay
 * @returns Caret position in overlay coordinates, or null
 */
export interface DomCaretPosition {
  x: number;
  y: number;
  height: number;
  pageIndex: number;
}

/**
 * A table fragment clips its content with `overflow:hidden` + a fixed height,
 * translating rows for the visible page window. When a row breaks mid-content
 * across pages, the painter renders the SAME cell content in both fragments
 * with identical `data-pm-start`/`data-pm-end` — only one copy is on-window.
 * An element whose box lies outside its `.layout-table` fragment's box is the
 * off-page duplicate and must not win the caret lookup (issue #763).
 */
function isClippedOutOfTableFragment(el: HTMLElement, rect: DOMRect): boolean {
  // `:not(.layout-nested-table)` because only the page-fragment table carries
  // the `overflow:hidden` + window translate; a nested table has no clip, so
  // its box would never indicate the off-page duplicate (matches
  // `clipRectToTableWindow`).
  const tableEl = el.closest('.layout-table:not(.layout-nested-table)') as HTMLElement | null;
  if (!tableEl) return false;
  const t = tableEl.getBoundingClientRect();
  const mid = (rect.top + rect.bottom) / 2;
  return mid < t.top - 0.5 || mid > t.bottom + 0.5;
}

/** Page index (0-based) of the `.layout-page` containing `el`. */
function pageIndexOf(el: HTMLElement): number {
  const pageEl = el.closest('.layout-page') as HTMLElement | null;
  return pageEl ? Number(pageEl.dataset.pageNumber || 1) - 1 : 0;
}

/**
 * Collapsed range at a PM offset into a run span, walking every text
 * node under the span (including hyperlink `<a>`-nested text) so the
 * caret lands on the exact character boundary. Returns null when the
 * span holds no text or the range cannot be built.
 *
 * NOTE — not a pure refactor: the previous body path only consulted
 * `span.firstChild`, so a hyperlink run (whose first child is the `<a>`
 * element, not a text node) always fell back to the span's left edge for
 * every offset. The TreeWalker below is a behavior fix for those runs
 * (body and `scope: 'hf'` alike): the caret now resolves to the exact
 * character boundary inside `<a>`-nested text.
 */
function collapseRangeAtPmOffset(spanEl: HTMLElement, pmOffset: number): Range | null {
  const ownerDoc = spanEl.ownerDocument;
  if (!ownerDoc) return null;
  const walker = ownerDoc.createTreeWalker(spanEl, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, pmOffset);
  let textNode = walker.nextNode() as Text | null;
  let last: Text | null = null;
  while (textNode) {
    last = textNode;
    if (remaining <= textNode.data.length) {
      try {
        const range = ownerDoc.createRange();
        range.setStart(textNode, remaining);
        range.setEnd(textNode, remaining);
        return range;
      } catch {
        return null;
      }
    }
    remaining -= textNode.data.length;
    textNode = walker.nextNode() as Text | null;
  }
  // Offset past every text node (degenerate span): clamp to the end of
  // the last one, mirroring the old first-child clamping.
  if (last) {
    try {
      const range = ownerDoc.createRange();
      range.setStart(last, last.data.length);
      range.setEnd(last, last.data.length);
      return range;
    } catch {
      return null;
    }
  }
  return null;
}

/** Build the caret position from a matched span (tab / text / empty run). */
function caretFromSpan(
  spanEl: HTMLElement,
  pmPos: number,
  pmStart: number,
  overlayRect: DOMRect,
  zoom: number
): DomCaretPosition {
  const pageIndex = pageIndexOf(spanEl);
  const lineEl = spanEl.closest('.layout-line');
  const lineHeight = lineEl ? (lineEl as HTMLElement).offsetHeight : 16;

  const isTab = spanEl.classList.contains('layout-run-tab');
  if (!isTab) {
    const range = collapseRangeAtPmOffset(spanEl, pmPos - pmStart);
    if (range) {
      const rangeRect = range.getBoundingClientRect();

      // Caret height tracks the run AT the cursor, not the line box: on a line
      // with mixed font sizes the line box is as tall as the largest run, but
      // the caret should match the font where the insertion point sits, like
      // Word (#748). The collapsed range's rect already reports the per-run
      // font box (and its top is baseline-aligned), so use it; fall back to the
      // line height if the browser returns a zero-height rect.
      //
      // `rangeRect` comes from getBoundingClientRect, so its height is in screen
      // space (scaled by `zoom`); divide it back to layout px so the returned
      // height matches the offsetHeight-based fallbacks. Consumers paint the caret
      // inside the zoom-scaled container and so expect layout px (#928).
      return {
        x: rangeRect.left - overlayRect.left,
        y: rangeRect.top - overlayRect.top,
        height: rangeRect.height ? rangeRect.height / zoom : lineHeight,
        pageIndex,
      };
    }
  }

  // Tab or no text node — caret at the span's left edge.
  //
  // Intentional divergence from the retired `computeHfCaretRectFromView`,
  // which interpolated `left + width * (pmPos - start) / (end - start)` when
  // its TreeWalker found no text: a collapsed caret must sit on a real
  // character boundary, and a fractional mid-run x has no corresponding PM
  // position (clicks there resolve to a neighboring boundary anyway).
  // Line-end and empty-run positions are covered by the trailing-edge /
  // empty-paragraph fallbacks instead, so the interpolation only ever
  // produced visually-between-characters carets.
  const spanRect = spanEl.getBoundingClientRect();
  return {
    x: spanRect.left - overlayRect.left,
    y: spanRect.top - overlayRect.top,
    height: lineHeight,
    pageIndex,
  };
}

// ----------------------------------------------------------------------------
// HF scope snapshot cache (host-level, elements only).
//
// `getCaretPositionFromDom` / `getSelectionRectsFromDom` with
// `{ scope: 'hf' }` need the engaged host's spans, ranged elements,
// paragraphs, and empty runs — up to four subtree walks per call — while
// the HF overlay recomputes on every transaction plus `painter:painted`
// plus resize. Cache the ELEMENT lists per section+host and re-measure
// rects fresh on every call (rects are never cached: scroll/zoom/resize
// move them, while the element set is paint-stable).
//
// Keyed by section AND host identity (like the retired `hfDomCache` in
// `headerFooterLayout.ts`): the same HF doc is painted on every page, so a
// section-only key would keep resolving against the wrong page's instance
// after scrolling. A paint replaces the spans inside a reused host shell
// (incremental `renderPages` preserves header/footer shells and only
// repopulates the content area), so identity alone cannot detect
// staleness — `DocxEditorEngine` drops the cache after every `renderPages`
// pass, just before dispatching `painter:painted`. Between paints the HF
// DOM is static, so the snapshot is always fresh.
//
// `invalidateHfScopeCache` is a module-level export for the engine only —
// it is intentionally NOT re-exported from the layout-bridge index, so it
// stays out of the public API.
// ----------------------------------------------------------------------------

type HfScopeSnapshot = {
  host: HTMLElement;
  spans: HTMLElement[];
  ranged: HTMLElement[];
  paragraphs: HTMLElement[];
  emptyRuns: HTMLElement[];
};

const hfScopeCache: Record<'header' | 'footer', HfScopeSnapshot | null> = {
  header: null,
  footer: null,
};

function sectionOfHfHost(host: HTMLElement): 'header' | 'footer' | null {
  if (host.matches('.layout-page-header')) return 'header';
  if (host.matches('.layout-page-footer')) return 'footer';
  return null;
}

/**
 * Element snapshot for an HF `scopeRoot`. A resolved host hits the
 * section+host cache; a wider container root (the rare no-host fallback)
 * queries directly without caching.
 */
function getHfScopeSnapshot(scopeRoot: ParentNode): HfScopeSnapshot | null {
  if (!(scopeRoot instanceof HTMLElement)) return null;
  const section = sectionOfHfHost(scopeRoot);
  if (!section) return null;
  const cached = hfScopeCache[section];
  if (cached && cached.host === scopeRoot && cached.host.isConnected) return cached;
  const snapshot: HfScopeSnapshot = {
    host: scopeRoot,
    spans: findHfPmSpans(scopeRoot),
    ranged: findHfRanged(scopeRoot),
    paragraphs: findHfParagraphs(scopeRoot),
    emptyRuns: findHfEmptyRuns(scopeRoot),
  };
  hfScopeCache[section] = snapshot;
  return snapshot;
}

/**
 * Drop cached HF scope snapshots. Called by `DocxEditorEngine` after every
 * `renderPages` pass (before `painter:painted`); see the cache note above.
 */
export function invalidateHfScopeCache(): void {
  hfScopeCache.header = null;
  hfScopeCache.footer = null;
}

export function getCaretPositionFromDom(
  container: HTMLElement,
  pmPos: number,
  overlayRect: DOMRect,
  zoom: number = 1,
  options?: DomScopeOptions
): DomCaretPosition | null {
  const scope = options?.scope ?? 'body';
  const scopeRoot: ParentNode = scope === 'hf' ? (options?.host ?? container) : container;
  // Host-level element snapshot so the span / paragraph / fallback walks
  // below share one subtree query per paint (see the cache note above).
  // Null for body scope and for container-wide HF roots (no single host).
  const hfSnapshot = scope === 'hf' ? getHfScopeSnapshot(scopeRoot) : null;
  // Body-scoped span lookup so HF spans don't mis-resolve the caret
  // when a body PM position happens to fall within an HF range. The HF
  // scope mirrors it: only the resolved host's spans participate, so a
  // body span with a colliding PM position can never win.
  const spans =
    scope === 'hf' ? (hfSnapshot?.spans ?? findHfPmSpans(scopeRoot)) : findBodyPmSpans(container);

  // A position that lands inside a table cell which breaks across pages can
  // match the SAME run painted in two fragments. Prefer the on-window copy;
  // remember the first match as a fallback if every copy is clipped out.
  let fallback: HTMLElement | null = null;
  let fallbackStart = 0;

  for (const span of Array.from(spans)) {
    const spanEl = span as HTMLElement;
    const pmStart = Number(spanEl.dataset.pmStart);
    const pmEnd = Number(spanEl.dataset.pmEnd);

    // Tab spans use an exclusive end to avoid boundary conflicts: a tab at
    // [5,6) means position 6 belongs to the next run, not the tab.
    const isTab = spanEl.classList.contains('layout-run-tab');
    const matches = isTab ? pmPos >= pmStart && pmPos < pmEnd : pmPos >= pmStart && pmPos <= pmEnd;
    if (!matches) continue;

    const spanRect = spanEl.getBoundingClientRect();
    if (isClippedOutOfTableFragment(spanEl, spanRect)) {
      if (!fallback) {
        fallback = spanEl;
        fallbackStart = pmStart;
      }
      continue;
    }
    return caretFromSpan(spanEl, pmPos, pmStart, overlayRect, zoom);
  }

  if (fallback) {
    return caretFromSpan(fallback, pmPos, fallbackStart, overlayRect, zoom);
  }

  // Check empty paragraphs (prefer an on-window copy here too). Scoped to
  // the active tree so an HF paragraph (a separate PM document whose
  // positions overlap the body's) can never win a body lookup or vice
  // versa.
  const paragraphs =
    scope === 'hf'
      ? (hfSnapshot?.paragraphs ?? findHfParagraphs(scopeRoot))
      : findBodyParagraphs(container);
  let pFallback: { el: HTMLElement; targetEl: HTMLElement } | null = null;
  for (const p of Array.from(paragraphs)) {
    const pEl = p as HTMLElement;
    const pStart = Number(pEl.dataset.pmStart);
    const pEnd = Number(pEl.dataset.pmEnd);

    if (pmPos >= pStart && pmPos <= pEnd) {
      const emptyRun = pEl.querySelector('.layout-empty-run');
      const targetEl = (emptyRun as HTMLElement) || pEl;
      const rect = targetEl.getBoundingClientRect();
      if (isClippedOutOfTableFragment(pEl, rect)) {
        if (!pFallback) pFallback = { el: pEl, targetEl };
        continue;
      }
      return caretFromParagraph(pEl, targetEl, overlayRect);
    }
  }
  if (pFallback) {
    return caretFromParagraph(pFallback.el, pFallback.targetEl, overlayRect);
  }

  // HF-only final fallbacks so the caret stays visible while editing a
  // header/footer: exact paragraph/line anchor, smallest bracketing
  // range, trailing edge past every painted range, host top-left.
  // Ported from the retired `computeHfCaretRectFromView` in
  // `headerFooterLayout.ts` (unify-hf-editing follow-up).
  if (scope === 'hf') {
    return hfCaretFallback(scopeRoot, pmPos, overlayRect, zoom, hfSnapshot);
  }

  return null;
}

/**
 * HF caret fallbacks for positions no painted span or paragraph covers.
 *
 * The header/footer editor must always show a caret while active — unlike
 * the body walk, which returns null off-content. Coordinates are
 * overlay-relative like the rest of this module; pass a zero rect to get
 * viewport coords (what the old `computeHfCaretRectFromView` returned).
 *
 * Heights are normalized to layout px (screen-space `getBoundingClientRect`
 * values divided by `zoom`), matching the `caretFromSpan` main path, so
 * every fallback below shares one unit with it: callers inside the
 * zoom-scaled pages container (React) use the value directly, while
 * `position: fixed` overlays (Vue) multiply by `zoom` back to viewport px.
 * The host-top-left constant (`16`) is already layout px and passes through
 * unscaled. X/Y stay viewport px (the caller passes a zero `overlayRect`).
 */
function hfCaretFallback(
  scopeRoot: ParentNode,
  pmPos: number,
  overlayRect: DOMRect,
  zoom: number = 1,
  snapshot?: HfScopeSnapshot | null
): DomCaretPosition | null {
  const scale = zoom || 1;
  // Exact paragraph/line anchor at `pmPos` (when the painter emits one).
  const anchor = findHfPmAnchor(scopeRoot, pmPos);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    return {
      x: rect.left - overlayRect.left + 1,
      y: rect.top - overlayRect.top,
      height: rect.height ? rect.height / scale : 16,
      pageIndex: pageIndexOf(anchor),
    };
  }

  // Walk every painted element carrying `[data-pm-start][data-pm-end]` and
  // find the smallest range bracketing `pmPos`. Left edge for a position
  // at the range start (empty paragraph), right edge at the range end.
  const ranged = snapshot?.ranged ?? findHfRanged(scopeRoot);
  let bestEl: HTMLElement | null = null;
  let bestSpan = Infinity;
  for (const el of ranged) {
    const start = Number(el.dataset.pmStart);
    const end = Number(el.dataset.pmEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (pmPos < start || pmPos > end) continue;
    const span = end - start;
    if (span < bestSpan) {
      bestSpan = span;
      bestEl = el;
    }
  }
  if (bestEl) {
    const rect = bestEl.getBoundingClientRect();
    const end = Number(bestEl.dataset.pmEnd);
    const atEnd = pmPos >= end;
    return {
      x: (atEnd ? rect.right : rect.left + 1) - overlayRect.left,
      y: rect.top - overlayRect.top,
      height: rect.height ? rect.height / scale : 16,
      pageIndex: pageIndexOf(bestEl),
    };
  }

  // Cursor past every painted element's range (typically `doc.content.size`
  // at the end of the last paragraph): snap to the trailing edge of the
  // painted element with the largest `pmStart` still `<= pmPos`.
  let trailingEl: HTMLElement | null = null;
  let trailingStart = -Infinity;
  for (const el of ranged) {
    const start = Number(el.dataset.pmStart);
    if (!Number.isFinite(start)) continue;
    if (start > pmPos) continue;
    if (start > trailingStart) {
      trailingStart = start;
      trailingEl = el;
    }
  }
  if (trailingEl) {
    const rect = trailingEl.getBoundingClientRect();
    return {
      x: rect.right - overlayRect.left,
      y: rect.top - overlayRect.top,
      height: rect.height ? rect.height / scale : 16,
      pageIndex: pageIndexOf(trailingEl),
    };
  }

  // Last resort: anchor at the host's top-left so the caret is at least
  // visible while in HF edit mode. Better than disappearing.
  const hostEl = scopeRoot as HTMLElement;
  if (typeof hostEl.getBoundingClientRect === 'function') {
    const hostRect = hostEl.getBoundingClientRect();
    return {
      x: hostRect.left - overlayRect.left + 2,
      y: hostRect.top - overlayRect.top + 2,
      height: 16,
      pageIndex: pageIndexOf(hostEl),
    };
  }

  return null;
}

/** Caret position for an empty paragraph / its empty-run placeholder. */
function caretFromParagraph(
  pEl: HTMLElement,
  targetEl: HTMLElement,
  overlayRect: DOMRect
): DomCaretPosition {
  const rect = targetEl.getBoundingClientRect();
  const pageEl = pEl.closest('.layout-page') as HTMLElement | null;
  const pageIndex = pageEl ? Number(pageEl.dataset.pageNumber || 1) - 1 : 0;
  const lineEl = targetEl.closest('.layout-line') || targetEl;
  const lineHeight = (lineEl as HTMLElement).offsetHeight || 16;

  return {
    x: rect.left - overlayRect.left,
    y: rect.top - overlayRect.top,
    height: lineHeight,
    pageIndex,
  };
}
