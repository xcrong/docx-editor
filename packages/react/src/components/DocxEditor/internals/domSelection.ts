/**
 * DOM-based selection / caret helpers for PagedEditor.
 *
 * The core DOM walks (`getCaretPositionFromDom` / `getSelectionRectsFromDom`)
 * live in `@xcrong/docx-editor-core/layout-bridge` and are shared with the
 * Vue adapter. These thin React wrappers resolve the selection-overlay rect,
 * call the core walk, then divide by `zoom` so the result lands in the
 * React overlay's own (unscaled-but-CSS-scaled) coordinate space. React's
 * overlay sits OUTSIDE the scroll container, so — unlike Vue — it does not add
 * scrollTop/scrollLeft (intentional divergence, #670).
 *
 * The HF variants (`getHfCaretFromDom` / `computeHfSelectionRectsFromDom`)
 * call the same core walks with `{ scope: 'hf', host }` and return
 * viewport-px x/y (zero overlay rect) with layout-px caret height — the
 * HF overlay converts x/y to host-local once (see `toHfHostLocal` in
 * `DocxEditorPagedArea`), so no zoom division happens here; `zoom` is only
 * forwarded so core can normalize heights (#928).
 *
 * `applyCellSelectionHighlight` is re-exported from core (shared with Vue).
 */

import type { EditorView } from 'prosemirror-view';
import {
  getCaretPositionFromDom,
  getSelectionRectsFromDom,
  resolveHfHostEl,
  type CaretPosition,
  type SelectionRect,
} from '@xcrong/docx-editor-core/layout-bridge';

export { applyCellSelectionHighlight } from '@xcrong/docx-editor-core/layout-bridge';

/** Viewport-relative caret rect for the painted header/footer overlay. */
export interface HfCaretRect {
  top: number;
  left: number;
  height: number;
}

/** Viewport-relative selection rect for the painted header/footer overlay. */
export interface HfSelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Zero rect so the core walk's overlay-relative output lands in viewport coords. */
function viewportRect(): DOMRect {
  return new DOMRect(0, 0, 0, 0);
}

/**
 * Resolve a caret position by measuring the rendered DOM. Delegates the walk
 * to core, then converts overlay-space pixels into the React overlay's scaled
 * coordinate space (divide by zoom). Returns `null` when the overlay isn't
 * mounted or the position falls outside any painted run.
 */
export function getCaretFromDom(
  pagesContainer: HTMLElement,
  pmPos: number,
  currentZoom: number
): CaretPosition | null {
  const overlay = pagesContainer.parentElement?.querySelector('[data-testid="selection-overlay"]');
  if (!overlay) return null;
  const overlayRect = overlay.getBoundingClientRect();
  const caret = getCaretPositionFromDom(pagesContainer, pmPos, overlayRect, currentZoom);
  if (!caret) return null;
  return {
    // x/y are screen-space deltas → divide by zoom. height is already returned
    // in layout px by getCaretPositionFromDom (#928), so it passes through.
    x: caret.x / currentZoom,
    y: caret.y / currentZoom,
    height: caret.height,
    pageIndex: caret.pageIndex,
  };
}

/**
 * Build SelectionRect[] for a range [from, to) via the core DOM walk, then
 * convert overlay-space pixels into the React overlay's scaled coordinate
 * space. Returns `[]` when no painted spans overlap the range (caller falls
 * back to layout-based selectionToRects).
 */
export function computeSelectionRectsFromDom(
  pagesContainer: HTMLElement,
  overlayRect: DOMRect,
  from: number,
  to: number,
  zoom: number
): SelectionRect[] {
  const rects = getSelectionRectsFromDom(pagesContainer, from, to, overlayRect);
  return rects.map((rect) => ({
    x: rect.x / zoom,
    y: rect.y / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
    pageIndex: rect.pageIndex,
  }));
}

/**
 * Caret rect for a persistent HF view's selection head. Resolves the HF
 * host via `resolveHfHostEl` (an engaged `preferredHost` wins outright,
 * else the host nearest the viewport center — same contract as Vue's
 * `applyHfOverlay`), then runs the shared core walk with
 * `{ scope: 'hf', host }`. Returns `null` for a non-empty selection or
 * when no painted HF host exists.
 *
 * Mixed units, matching the core contract: `top`/`left` are viewport px
 * (the core walk gets a zero overlay rect, so nothing is subtracted),
 * while `height` is layout px — `zoom` is forwarded so core can divide
 * the screen-space run height back down (#928). The HF overlay lives
 * inside the zoom-scaled pages container, so layout px is its coordinate
 * space (at zoom=1 identical to the old viewport-px value).
 */
export function getHfCaretFromDom(
  pagesContainer: HTMLElement,
  view: EditorView,
  section: 'header' | 'footer',
  zoom: number,
  doc: globalThis.Document = globalThis.document,
  preferredHost: HTMLElement | null = null
): HfCaretRect | null {
  if (!view.state.selection.empty) return null;
  const host = resolveHfHostEl(section, doc, preferredHost);
  if (!host) return null;
  const caret = getCaretPositionFromDom(
    pagesContainer,
    view.state.selection.head,
    viewportRect(),
    zoom,
    { scope: 'hf', host }
  );
  if (!caret) return null;
  return { top: caret.y, left: caret.x, height: caret.height };
}

/**
 * Selection rects for a non-empty HF selection, projected against the
 * painted HF spans via the shared core walk with `{ scope: 'hf', host }`.
 * Host resolution mirrors `getHfCaretFromDom` (engaged `preferredHost`
 * wins, else viewport-center). Returns `[]` for a collapsed selection or
 * when no painted spans overlap the range.
 *
 * Viewport px throughout (zero overlay rect in, no zoom division) — the
 * caller (`DocxEditorPagedArea`) converts to host-local once via
 * `toHfHostLocal`.
 */
export function computeHfSelectionRectsFromDom(
  pagesContainer: HTMLElement,
  view: EditorView,
  section: 'header' | 'footer',
  doc: globalThis.Document = globalThis.document,
  preferredHost: HTMLElement | null = null
): HfSelectionRect[] {
  if (view.state.selection.empty) return [];
  const host = resolveHfHostEl(section, doc, preferredHost);
  if (!host) return [];
  const { from, to } = view.state.selection;
  return getSelectionRectsFromDom(pagesContainer, from, to, viewportRect(), {
    scope: 'hf',
    host,
  }).map((rect) => ({ top: rect.y, left: rect.x, width: rect.width, height: rect.height }));
}
