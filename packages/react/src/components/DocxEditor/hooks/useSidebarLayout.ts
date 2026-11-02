import { useMemo } from 'react';
import { OUTLINE_BUTTON_RESERVED_SPACE, OUTLINE_RESERVED_SPACE } from '../../DocumentOutline';
import { RULER_WIDTH } from '../../ui/VerticalRuler';
import { SIDEBAR_DOCUMENT_SHIFT } from '../../sidebar/constants';
import { DEFAULT_PAGE_WIDTH } from '../PagedEditor';
import type { Document } from '@xcrong/docx-editor-core/types/document';

/**
 * Sidebar-aware layout widths shared by `DocxEditor`:
 *
 * - `sidebarShifted`: the sidebar is open AND the container is wide enough
 *   to shift the page (not narrow overlay mode).
 * - `minLayoutWidth`: reserves against the WIDEST page in the doc (pages
 *   center via `alignItems:center`, so a landscape section gets a smaller
 *   side margin) plus the shift reserve when shifted.
 * - `pageWidthPx`: the final section's width — positions the sidebar /
 *   comment margin markers against the page most content lives under.
 */
export function useSidebarLayout({
  sidebarOpen,
  sidebarOverlayMode,
  historyDocument,
  showOutline,
  showOutlineButton,
  showRuler,
}: {
  sidebarOpen: boolean;
  sidebarOverlayMode: boolean;
  historyDocument: Document | null | undefined;
  showOutline: boolean;
  showOutlineButton: boolean;
  showRuler: boolean;
}) {
  // Overlay mode keeps the page centered (no translateX); wide mode shifts.
  const sidebarShifted = sidebarOpen && !sidebarOverlayMode;

  const { minLayoutWidth, pageWidthPx } = useMemo(() => {
    // Reserve 2× the left-edge allowance so the centered page clears whatever
    // outline UI is showing, without forcing a shift on wide viewports.
    const outlineLeftAllowance =
      (showOutline
        ? OUTLINE_RESERVED_SPACE
        : showOutlineButton
          ? OUTLINE_BUTTON_RESERVED_SPACE
          : 20) +
      // The outline toggle/panel inset past the vertical ruler when it's shown,
      // so the page must clear that extra width too.
      (showRuler && (showOutline || showOutlineButton) ? RULER_WIDTH : 0);
    // Reserve against the WIDEST page in the doc, not the portrait default.
    // Taking the max across all section widths also covers mixed-orientation docs.
    const docBody = historyDocument?.package?.document;
    const sectionPageWidths = [
      docBody?.finalSectionProperties?.pageWidth,
      ...(docBody?.sections?.map((s) => s.properties?.pageWidth) ?? []),
    ].filter((w): w is number => typeof w === 'number' && w > 0);
    const maxPageWidthPx = sectionPageWidths.length
      ? Math.round(Math.max(...sectionPageWidths) / 15)
      : DEFAULT_PAGE_WIDTH;

    const minLayoutWidth =
      2 * outlineLeftAllowance + maxPageWidthPx + (sidebarShifted ? SIDEBAR_DOCUMENT_SHIFT * 2 : 0);

    // The final section's width — positions the sidebar / comment margin
    // markers against the page most content lives under.
    const sectionPropsPageWidth = docBody?.finalSectionProperties?.pageWidth;
    const pageWidthPx = sectionPropsPageWidth
      ? Math.round(sectionPropsPageWidth / 15)
      : DEFAULT_PAGE_WIDTH;
    return { minLayoutWidth, pageWidthPx };
  }, [historyDocument, showOutline, showOutlineButton, showRuler, sidebarShifted]);

  return { sidebarShifted, minLayoutWidth, pageWidthPx };
}
