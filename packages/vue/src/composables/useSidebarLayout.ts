/**
 * Sidebar-aware layout styles shared by `DocxEditor.vue` (mirrors React's
 * `useSidebarLayout` hook): page-shift transform, ruler padding, and the
 * min layout width. Overlay mode keeps the page centered (no shift).
 */

import { computed, type ComputedRef, type Ref } from 'vue';
import type { Document } from '@xcrong/docx-editor-core/types/document';
import { SIDEBAR_DOCUMENT_SHIFT } from '@xcrong/docx-editor-core/utils/sidebarConstants';
import { twipsToPixels } from '@xcrong/docx-editor-core/utils/units';

export interface UseSidebarLayoutOptions {
  showSidebar: Ref<boolean>;
  /** Getter (not the ref) — the caller's overlay-mode ref is declared after
   *  this composable runs; capturing the binding directly would TDZ. */
  sidebarOverlayMode: () => boolean;
  showOutline: Ref<boolean>;
  /** Getters (not raw values) so host prop updates propagate. */
  showOutlineButton: () => boolean;
  showRuler: () => boolean;
  zoom: Ref<number>;
  stateTick: Ref<number>;
  getDocument: () => Document | null;
  currentSectionPageWidthTwips: Ref<number | undefined>;
  outlineReservedSpace?: number;
  outlineButtonReservedSpace?: number;
  rulerWidth?: number;
  defaultPageWidth?: number;
}

export interface UseSidebarLayoutReturn {
  minLayoutWidth: ComputedRef<number>;
  pagesContainerStyle: ComputedRef<{
    transform: string | undefined;
    transformOrigin: string;
    transition: string;
  }>;
  rulerRowStyle: ComputedRef<{
    paddingLeft: string;
    paddingRight: string;
    transition: string;
    minWidth: string;
  }>;
  pageWidthPx: ComputedRef<number>;
}

export function useSidebarLayout(opts: UseSidebarLayoutOptions): UseSidebarLayoutReturn {
  const OUTLINE_RESERVED_SPACE = opts.outlineReservedSpace ?? 268;
  const OUTLINE_BUTTON_RESERVED_SPACE = opts.outlineButtonReservedSpace ?? 64;
  const RULER_WIDTH = opts.rulerWidth ?? 20;
  const DEFAULT_PAGE_WIDTH = opts.defaultPageWidth ?? 816;

  // Overlay mode keeps the page centered (no translateX); wide mode shifts.
  // NOTE: a getter (not the ref) — the caller declares `sidebarOverlayMode`
  // AFTER this composable runs, so capturing the binding directly would TDZ.
  // `computed` evaluates lazily (post-setup), so the deferred read is safe.
  const sidebarShifted = computed(() => opts.showSidebar.value && !opts.sidebarOverlayMode());

  const minLayoutWidth = computed(() => {
    void opts.stateTick.value;
    const showOutlineButton = opts.showOutlineButton();
    const showRuler = opts.showRuler();
    const outlineLeftAllowance =
      (opts.showOutline.value
        ? OUTLINE_RESERVED_SPACE
        : showOutlineButton
          ? OUTLINE_BUTTON_RESERVED_SPACE
          : 20) + (showRuler && (opts.showOutline.value || showOutlineButton) ? RULER_WIDTH : 0);
    const doc = opts.getDocument();
    const docBody = doc?.package?.document;
    const sectionPageWidths = [
      docBody?.finalSectionProperties?.pageWidth,
      ...(docBody?.sections?.map((s) => s.properties?.pageWidth) ?? []),
    ].filter((w): w is number => typeof w === 'number' && w > 0);
    const maxPageWidthPx = sectionPageWidths.length
      ? Math.round(Math.max(...sectionPageWidths) / 15)
      : DEFAULT_PAGE_WIDTH;
    return (
      2 * outlineLeftAllowance +
      maxPageWidthPx +
      (sidebarShifted.value ? SIDEBAR_DOCUMENT_SHIFT * 2 : 0)
    );
  });

  // When the comments sidebar opens, shift the pages container (NOT the
  // scrolling viewport) left by SIDEBAR_DOCUMENT_SHIFT. Applied on the
  // inner `__pages` container so the viewport's scrollbar stays at the
  // real right edge instead of moving with the page. Skipped in narrow
  // overlay mode — the sidebar floats over the doc instead.
  const pagesContainerStyle = computed(() => {
    const parts: string[] = [];
    if (sidebarShifted.value) parts.push(`translateX(-${SIDEBAR_DOCUMENT_SHIFT}px)`);
    if (opts.zoom.value !== 1) parts.push(`scale(${opts.zoom.value})`);
    return {
      transform: parts.length > 0 ? parts.join(' ') : undefined,
      transformOrigin: 'top center',
      transition: 'transform 0.2s ease',
    };
  });

  const rulerRowStyle = computed(() => ({
    paddingLeft: '20px',
    paddingRight: 20 + (sidebarShifted.value ? SIDEBAR_DOCUMENT_SHIFT * 2 : 0) + 'px',
    transition: 'padding 0.2s ease',
    minWidth: minLayoutWidth.value + 'px',
  }));

  const pageWidthPx = computed(() => {
    return twipsToPixels(opts.currentSectionPageWidthTwips.value ?? 12240) * opts.zoom.value;
  });

  return { minLayoutWidth, pagesContainerStyle, rulerRowStyle, pageWidthPx };
}
