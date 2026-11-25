/**
 * Scoped DOM lookups for `data-pm-start` / `data-pm-end` markers.
 *
 * Headers and footers are parsed via a separate ProseMirror document
 * (see `convertHeaderFooterToContent`), so HF runs end up with PM
 * positions that overlap body PM positions. Any container-level
 * `querySelector(...)` that doesn't restrict to `.layout-page-content`
 * will match both trees and produce wrong results: phantom selection
 * rectangles in headers, scroll-restore latching onto an HF span,
 * caret resolution returning an HF position, etc.
 *
 * These helpers centralize the scope so call sites can't forget the
 * prefix: `findBody*` for the body tree, `findHf*` mirrors for the
 * painted header/footer hosts. The `DomScope`-aware caret/selection
 * walks in `clickToPositionDom` switch between the two.
 */

export type DomScope = 'body' | 'hf';

const BODY_SCOPE = '.layout-page-content';
const HF_HOSTS = ['.layout-page-header', '.layout-page-footer'] as const;
const HF_SCOPE = HF_HOSTS.join(', ');

/** Prefix a selector with each painted HF host class. */
function hfScoped(selector: string): string {
  return HF_HOSTS.map((host) => `${host} ${selector}`).join(', ');
}

/** True when `root` is itself a painted header/footer host element. */
function isHfHost(root: ParentNode): boolean {
  const el = root as HTMLElement;
  return typeof el.matches === 'function' && el.matches(HF_SCOPE);
}

/**
 * All body-tree run spans carrying both `data-pm-start` and `data-pm-end`.
 *
 * This is the workhorse for caret resolution and selection-rect painting.
 */
export function findBodyPmSpans(container: ParentNode): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(`${BODY_SCOPE} span[data-pm-start][data-pm-end]`)
  );
}

/**
 * All body-tree empty-paragraph runs. Used as a caret fallback when a
 * paragraph has no painted text spans.
 */
export function findBodyEmptyRuns(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`${BODY_SCOPE} .layout-empty-run`));
}

/**
 * All body-tree elements carrying a `data-pm-start` attribute.
 *
 * Includes paragraph elements as well as run spans, which is what scroll-
 * anchor recovery needs. Distinct from {@link findBodyPmSpans}, which
 * filters down to run spans only.
 */
export function findBodyPmAnchors(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`${BODY_SCOPE} [data-pm-start]`));
}

/**
 * First body-tree element whose `data-pm-start` exactly matches `pmStart`.
 *
 * Used for scroll anchors and image `NodeSelection` resolution where the
 * caller already knows the exact PM position it wants to find. Returns
 * `null` for non-finite inputs so callers don't need to guard.
 */
export function findBodyPmAnchor(container: ParentNode, pmStart: number): HTMLElement | null {
  if (!Number.isFinite(pmStart)) return null;
  return container.querySelector<HTMLElement>(`${BODY_SCOPE} [data-pm-start="${pmStart}"]`);
}

/**
 * All paragraph elements in the body tree. The caret walk's empty-
 * paragraph fallback is scoped through this so an HF paragraph (a
 * separate PM document whose positions overlap the body's) can never
 * win the lookup.
 */
export function findBodyParagraphs(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`${BODY_SCOPE} .layout-paragraph`));
}

// ----------------------------------------------------------------------------
// HF mirrors — same shapes scoped to the painted header/footer hosts.
// `root` is either a resolved `.layout-page-header` / `.layout-page-footer`
// host (queried directly) or a wider container such as `.paged-editor__pages`
// (queried with the HF prefix).
// ----------------------------------------------------------------------------

/**
 * All HF run spans carrying both `data-pm-start` and `data-pm-end`.
 *
 * Mirror of {@link findBodyPmSpans} for the painted header/footer.
 */
export function findHfPmSpans(root: ParentNode): HTMLElement[] {
  if (isHfHost(root)) {
    return Array.from(root.querySelectorAll<HTMLElement>('span[data-pm-start][data-pm-end]'));
  }
  return Array.from(
    root.querySelectorAll<HTMLElement>(hfScoped('span[data-pm-start][data-pm-end]'))
  );
}

/**
 * All HF empty-paragraph runs. Mirror of {@link findBodyEmptyRuns}.
 */
export function findHfEmptyRuns(root: ParentNode): HTMLElement[] {
  if (isHfHost(root)) {
    return Array.from(root.querySelectorAll<HTMLElement>('.layout-empty-run'));
  }
  return Array.from(root.querySelectorAll<HTMLElement>(hfScoped('.layout-empty-run')));
}

/**
 * All HF elements carrying a `data-pm-start` attribute.
 *
 * Mirror of {@link findBodyPmAnchors}.
 */
export function findHfPmAnchors(root: ParentNode): HTMLElement[] {
  if (isHfHost(root)) {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-pm-start]'));
  }
  return Array.from(root.querySelectorAll<HTMLElement>(hfScoped('[data-pm-start]')));
}

/**
 * First HF element whose `data-pm-start` exactly matches `pmStart`.
 *
 * Mirror of {@link findBodyPmAnchor}.
 */
export function findHfPmAnchor(root: ParentNode, pmStart: number): HTMLElement | null {
  if (!Number.isFinite(pmStart)) return null;
  if (isHfHost(root)) {
    return root.querySelector<HTMLElement>(`[data-pm-start="${pmStart}"]`);
  }
  return root.querySelector<HTMLElement>(hfScoped(`[data-pm-start="${pmStart}"]`));
}

/**
 * All HF elements carrying both `data-pm-start` and `data-pm-end`
 * (run spans AND paragraph anchors). Used by the caret walk's bracketing
 * fallbacks so an empty paragraph or a line-end position still resolves.
 */
export function findHfRanged(root: ParentNode): HTMLElement[] {
  if (isHfHost(root)) {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-pm-start][data-pm-end]'));
  }
  return Array.from(root.querySelectorAll<HTMLElement>(hfScoped('[data-pm-start][data-pm-end]')));
}

/**
 * All paragraph elements in the painted header/footer.
 * Mirror of {@link findBodyParagraphs}.
 */
export function findHfParagraphs(root: ParentNode): HTMLElement[] {
  if (isHfHost(root)) {
    return Array.from(root.querySelectorAll<HTMLElement>('.layout-paragraph'));
  }
  return Array.from(root.querySelectorAll<HTMLElement>(hfScoped('.layout-paragraph')));
}
