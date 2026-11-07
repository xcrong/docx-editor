import { useMemo } from 'react';
import { OUTLINE_BUTTON_RESERVED_SPACE, OUTLINE_RESERVED_SPACE } from '../../DocumentOutline';
import { RULER_WIDTH } from '../../ui/VerticalRuler';
import { SIDEBAR_DOCUMENT_SHIFT } from '../../sidebar/constants';
import { DEFAULT_PAGE_WIDTH } from '../PagedEditor';
import { computeSidebarLayoutWidths } from '@xcrong/docx-editor-core/utils/sidebarLayout';
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
    const docBody = historyDocument?.package?.document;
    // Width math lives in core; geometry constants stay owned by the
    // components that render them, passed explicitly so a constant change
    // can't silently diverge from the kernel defaults.
    return computeSidebarLayoutWidths({
      showOutline,
      showOutlineButton,
      showRuler,
      sidebarShifted,
      sectionPageWidthsTwips: [
        docBody?.finalSectionProperties?.pageWidth,
        ...(docBody?.sections?.map((s) => s.properties?.pageWidth) ?? []),
      ],
      finalPageWidthTwips: docBody?.finalSectionProperties?.pageWidth,
      spaces: {
        outlinePanel: OUTLINE_RESERVED_SPACE,
        outlineButton: OUTLINE_BUTTON_RESERVED_SPACE,
        outlineFallback: 20,
        rulerWidth: RULER_WIDTH,
        defaultPageWidth: DEFAULT_PAGE_WIDTH,
        sidebarShift: SIDEBAR_DOCUMENT_SHIFT,
      },
    });
  }, [historyDocument, showOutline, showOutlineButton, showRuler, sidebarShifted]);

  return { sidebarShifted, minLayoutWidth, pageWidthPx };
}
