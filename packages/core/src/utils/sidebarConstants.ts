/** Sidebar geometry constants — shared by both adapters so the
 *  page-shift and card-gap math stays consistent.
 * @packageDocumentation
 * @public */

export const SIDEBAR_WIDTH = 340;
export const SIDEBAR_PAGE_GAP = 12;
export const SIDEBAR_DOCUMENT_SHIFT = (SIDEBAR_PAGE_GAP + SIDEBAR_WIDTH) / 2;
export const MIN_CARD_GAP = 8;
/**
 * Container-width breakpoint (CSS px) below which the comments sidebar
 * switches from shifting the document to overlaying its right portion
 * with a semi-transparent backdrop. Matches the `document-layout-shift`
 * spec ("less than 1200px").
 * @public
 */
export const SIDEBAR_OVERLAY_BREAKPOINT = 1200;

/**
 * Whether the sidebar should overlay the document instead of shifting it,
 * given the editor container's content width in CSS px. Both adapters call
 * this from their resize observers so the breakpoint can't drift.
 * @public
 */
export function shouldUseSidebarOverlay(containerWidthPx: number): boolean {
  return containerWidthPx < SIDEBAR_OVERLAY_BREAKPOINT;
}

/** Viewport-space rect used for leader-line endpoint math. */
export interface LeaderLineRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A leader line segment in SVG-local px coordinates. */
export interface LeaderLineEndpoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Leader-line segment from the right edge of a highlighted anchor span to
 * the left edge of its sidebar card, expressed in the overlay SVG's local
 * coordinates. Returns `null` when either rect is missing (anchor or card
 * not painted yet) so the caller skips that line.
 *
 * Pure geometry — both adapters share it; DOM reads stay in the adapters.
 * @public
 */
export function computeLeaderLineEndpoints(
  svgRect: LeaderLineRect,
  anchorRect: LeaderLineRect | null | undefined,
  cardRect: LeaderLineRect | null | undefined
): LeaderLineEndpoints | null {
  if (!anchorRect || !cardRect) return null;
  return {
    x1: anchorRect.right - svgRect.left,
    y1: (anchorRect.top + anchorRect.bottom) / 2 - svgRect.top,
    x2: cardRect.left - svgRect.left,
    y2: (cardRect.top + cardRect.bottom) / 2 - svgRect.top,
  };
}
