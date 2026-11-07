/**
 * Sidebar-aware page-width math shared by React `useSidebarLayout` and Vue
 * `useSidebarLayout`.
 *
 * Both adapters computed byte-identical values (same outline/ruler/page
 * constants, same twips→px rounding); the only difference was the constant
 * source (React component modules vs Vue inline defaults). Geometry
 * constants stay adapter-owned; this kernel takes them as input with
 * defaults matching both sides. Style strings (`translateX(...)`,
 * `paddingLeft`) stay in the adapters — only numbers cross this boundary.
 */

import { SIDEBAR_DOCUMENT_SHIFT } from './sidebarConstants';

export interface SidebarWidthSpaces {
  /** Outline panel reserve (both adapters: 268). */
  outlinePanel: number;
  /** Collapsed outline toggle reserve (both adapters: 64). */
  outlineButton: number;
  /** Fallback gutter when no outline UI (both adapters: 20). */
  outlineFallback: number;
  /** Vertical ruler width (both adapters: 20). */
  rulerWidth: number;
  /** Page width when the doc reports none (both adapters: 816). */
  defaultPageWidth: number;
  /** Document shift when the sidebar is open (core `SIDEBAR_DOCUMENT_SHIFT`). */
  sidebarShift: number;
}

export interface SidebarWidthInput {
  showOutline: boolean;
  showOutlineButton: boolean;
  showRuler: boolean;
  sidebarShifted: boolean;
  /** All section page widths in twips (final first); missing/non-positive ignored. */
  sectionPageWidthsTwips: readonly (number | undefined)[];
  /** Final section width in twips (drives comment-margin anchoring). */
  finalPageWidthTwips?: number;
  spaces?: Partial<SidebarWidthSpaces>;
}

export interface SidebarWidths {
  outlineLeftAllowance: number;
  minLayoutWidth: number;
  pageWidthPx: number;
}

export function computeSidebarLayoutWidths(input: SidebarWidthInput): SidebarWidths {
  const spaces: SidebarWidthSpaces = {
    outlinePanel: 268,
    outlineButton: 64,
    outlineFallback: 20,
    rulerWidth: 20,
    defaultPageWidth: 816,
    sidebarShift: SIDEBAR_DOCUMENT_SHIFT,
    ...input.spaces,
  };
  const outlineLeftAllowance =
    (input.showOutline
      ? spaces.outlinePanel
      : input.showOutlineButton
        ? spaces.outlineButton
        : spaces.outlineFallback) +
    (input.showRuler && (input.showOutline || input.showOutlineButton) ? spaces.rulerWidth : 0);
  // Reserve against the WIDEST page (landscape sections center too).
  // NOTE: `Math.round(w / 15)` — twips→CSS px — kept verbatim, not routed
  // through `twipsToPixels`, whose float path can round .5 boundaries
  // differently.
  const widths = input.sectionPageWidthsTwips.filter(
    (w): w is number => typeof w === 'number' && w > 0
  );
  const maxPageWidthPx = widths.length
    ? Math.round(Math.max(...widths) / 15)
    : spaces.defaultPageWidth;
  return {
    outlineLeftAllowance,
    minLayoutWidth:
      2 * outlineLeftAllowance +
      maxPageWidthPx +
      (input.sidebarShifted ? spaces.sidebarShift * 2 : 0),
    pageWidthPx:
      input.finalPageWidthTwips && input.finalPageWidthTwips > 0
        ? Math.round(input.finalPageWidthTwips / 15)
        : spaces.defaultPageWidth,
  };
}
