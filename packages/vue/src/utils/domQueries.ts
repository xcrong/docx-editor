/**
 * DOM-side hit-test and scroll helpers for the Vue editor — find the
 * painted PM span containing a position, scroll a position into view,
 * resolve a click coordinate back to a PM position, and the
 * double-/triple-click word/paragraph selection helpers.
 *
 * Every function takes containers as parameters; nothing closes over a
 * Vue ref. The selection helpers take a `setPmSelection` callback so the
 * caller controls how the resulting range gets dispatched to PM.
 */

import type { EditorView } from 'prosemirror-view';
import {
  findBodyPmSpans,
  findBodyPmAnchor,
  clickToPositionDom,
} from '@eigenpal/docx-editor-core/layout-bridge';
import { findPageIndexContainingPmPos } from '@eigenpal/docx-editor-core/layout-engine';
import type { Layout } from '@eigenpal/docx-editor-core/layout-engine';
import { findWordBoundaries } from '@eigenpal/docx-editor-core/utils';

/**
 * Resolve the painted header/footer instance nearest the viewport center — the
 * one the user is editing. The same HF is painted on every page (shared
 * `r:id`), so the chrome outline must track the active page rather than snap to
 * page one's copy (mirrors core's `getHfDomSnapshot` host pick; #691).
 */
export function nearestHfHostEl(position: 'header' | 'footer'): HTMLElement | null {
  const hosts = window.document.querySelectorAll<HTMLElement>(`.layout-page-${position}`);
  if (hosts.length === 0) return null;
  const vpCenter = window.innerHeight / 2;
  let host = hosts[0];
  let bestDist = Infinity;
  for (const h of Array.from(hosts)) {
    const r = h.getBoundingClientRect();
    const dist = Math.abs((r.top + r.bottom) / 2 - vpCenter);
    if (dist < bestDist) {
      bestDist = dist;
      host = h;
    }
  }
  return host;
}

/**
 * Find the painted span containing `pmPos`. By default scoped to body spans
 * (which carry both pmStart and pmEnd) so HF runs in the separate PM document
 * don't mis-resolve double-/triple-click selection. When `hfSection` is set
 * (the user is editing a header/footer), scope to that section's painted host
 * instead — the HF spans live in `.layout-page-header` / `.layout-page-footer`
 * and carry PM positions from the HF document, so resolving against body spans
 * would compute word/paragraph bounds from the wrong text (#691).
 */
export function findElementAtPosition(
  container: HTMLElement,
  pmPos: number,
  hfSection?: 'header' | 'footer'
): HTMLElement | null {
  const els = hfSection
    ? // The same HF doc is painted on every page; the first host's spans share
      // the HF PM coord space, so one host suffices.
      Array.from(
        container.querySelectorAll<HTMLElement>(
          `.layout-page-${hfSection} span[data-pm-start][data-pm-end]`
        )
      )
    : findBodyPmSpans(container);
  for (const el of els) {
    const start = Number(el.dataset.pmStart);
    const end = Number(el.dataset.pmEnd);
    if (!isNaN(start) && !isNaN(end) && pmPos >= start && pmPos <= end) {
      return el;
    }
  }
  return null;
}

/** px of padding kept above the target when it's scrolled into view. */
const SCROLL_TOP_PADDING = 48;

/**
 * Resolve the painted body element for `pmPos`: an exact, body-scoped
 * `data-pm-start` anchor first (paragraph elements, including headings, carry
 * one), then the run-span `[start,end]` range. A heading's pmPos is the
 * paragraph node position, which only the anchor match catches — the span
 * loop alone would miss it (#930). Returns `null` when the position lives on a
 * page virtualization has left as an empty shell.
 */
function resolvePaintedScrollTarget(
  pagesContainer: HTMLElement,
  pmPos: number
): HTMLElement | null {
  const exact = findBodyPmAnchor(pagesContainer, pmPos);
  if (exact) return exact;
  for (const el of findBodyPmSpans(pagesContainer)) {
    const start = Number(el.dataset.pmStart);
    const end = Number(el.dataset.pmEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && pmPos >= start && pmPos <= end) {
      return el;
    }
  }
  return null;
}

/**
 * Smooth-scroll `viewport` so `el` sits `SCROLL_TOP_PADDING` px below the
 * viewport's top edge. Uses `viewport.scrollTo` (not `el.scrollIntoView`)
 * because the pages sit under a CSS `transform` (zoom) where the native call
 * misbehaves — mirrors React's `scrollElementCenterIntoContainer`.
 */
function scrollElementTopIntoViewport(viewport: HTMLElement, el: HTMLElement): void {
  const viewportRect = viewport.getBoundingClientRect();
  const targetRect = el.getBoundingClientRect();
  viewport.scrollTo({
    top: targetRect.top - viewportRect.top + viewport.scrollTop - SCROLL_TOP_PADDING,
    behavior: 'smooth',
  });
}

/**
 * Smooth-scroll the viewport so the painted element at `pmPos` is visible.
 *
 * When the target heading is on a page that virtualization has left as an
 * empty shell (no painted `[data-pm-start]` content), resolution returns
 * `null` and the call uses `layout` geometry to find the page index, scrolls
 * its always-present shell into view — the IntersectionObserver then populates
 * it — and re-resolves the exact element once paint settles. Without this
 * fallback the scroll was a silent no-op on large (≥ virtualization threshold)
 * documents. Mirrors React's `usePagedScrollApi` geometric fallback (#930).
 */
export function scrollVisiblePositionIntoView(
  pagesContainer: HTMLElement | null,
  viewport: HTMLElement | null,
  pmPos: number,
  layout?: Layout | null
): void {
  if (!pagesContainer || !viewport) return;

  const painted = resolvePaintedScrollTarget(pagesContainer, pmPos);
  if (painted) {
    scrollElementTopIntoViewport(viewport, painted);
    return;
  }

  // Virtualization fallback: scroll the page shell in, then re-resolve the
  // heading once virtualization fills it. `layout` is optional so callers that
  // haven't been wired through still get the original (no-op) behavior rather
  // than a crash — but the outline path always passes it.
  if (!layout) return;
  const pageIndex = findPageIndexContainingPmPos(layout, pmPos);
  if (pageIndex == null) return;
  const shell = pagesContainer.querySelectorAll<HTMLElement>('.layout-page')[pageIndex];
  if (!shell) return;
  scrollElementTopIntoViewport(viewport, shell);

  // The IntersectionObserver fills the shell asynchronously over a few frames
  // once it scrolls near the viewport. Retry the painted resolution a bounded
  // number of times so we land on the heading itself, not just its page. Bails
  // if the container leaves the DOM (navigation/unmount).
  let attempts = 0;
  const tryResolveAfterPaint = (): void => {
    if (!pagesContainer.isConnected || attempts >= 3) return;
    attempts++;
    const target = resolvePaintedScrollTarget(pagesContainer, pmPos);
    if (target) {
      scrollElementTopIntoViewport(viewport, target);
      return;
    }
    requestAnimationFrame(tryResolveAfterPaint);
  };
  requestAnimationFrame(tryResolveAfterPaint);
}

/**
 * Resolve a viewport-space click coordinate to a PM document position,
 * clamped to `doc.content.size`.
 */
export function resolvePos(
  pagesContainer: HTMLElement | null,
  view: EditorView | null,
  clientX: number,
  clientY: number
): number | null {
  if (!pagesContainer || !view) return null;
  const pos = clickToPositionDom(pagesContainer, clientX, clientY, 1);
  if (pos === null || pos < 0) return null;
  return Math.min(pos, view.state.doc.content.size);
}

/**
 * Double-click word selection — expand `pos` to its word bounds and
 * hand the resulting range to `setPmSelection`.
 */
export function selectWord(
  pagesContainer: HTMLElement | null,
  pos: number,
  setPmSelection: (from: number, to: number) => void,
  hfSection?: 'header' | 'footer'
): void {
  if (!pagesContainer) return;
  const el = findElementAtPosition(pagesContainer, pos, hfSection);
  if (!el) return;
  const text = el.textContent || '';
  const pmStart = Number(el.dataset.pmStart) || 0;
  const offset = pos - pmStart;
  const [start, end] = findWordBoundaries(text, offset);
  const from = pmStart + start;
  const to = pmStart + end;
  if (from < to) {
    setPmSelection(from, to);
  }
}

/**
 * Triple-click paragraph selection — expand `pos` to the enclosing
 * `.layout-paragraph` element's PM range.
 */
export function selectParagraph(
  pagesContainer: HTMLElement | null,
  pos: number,
  setPmSelection: (from: number, to: number) => void,
  hfSection?: 'header' | 'footer'
): void {
  if (!pagesContainer) return;
  const el = findElementAtPosition(pagesContainer, pos, hfSection);
  if (!el) return;
  const paragraph = el.closest('.layout-paragraph') as HTMLElement | null;
  if (!paragraph) return;
  const pmStart = Number(paragraph.dataset.pmStart);
  const pmEnd = Number(paragraph.dataset.pmEnd);
  if (!isNaN(pmStart) && !isNaN(pmEnd) && pmStart < pmEnd) {
    setPmSelection(pmStart, pmEnd);
  }
}
