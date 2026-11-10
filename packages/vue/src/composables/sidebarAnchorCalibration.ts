import type { Ref } from 'vue';
import type { Layout } from '@xcrong/docx-editor-core/layout-engine';
import { getPageTop } from '@xcrong/docx-editor-core/layout-bridge';

/**
 * Convert layout-space anchor Y values to pages-container coords (the
 * space UnifiedSidebar positions cards in: post-zoom, including scroll).
 * Calibrates from a painted page instead of hardcoded chrome constants:
 * offset = pageElScreenTop - pageTopLayout * zoom. Falls back to an empty
 * map (DOM queries in UnifiedSidebar cover the rendered pages) when no
 * page is painted yet.
 */
export function calibrateAnchorsToContainer(
  pagesContainer: Ref<HTMLElement | null>,
  layout: Layout,
  raw: Map<string, number>,
  zoom: number
): Map<string, number> {
  const container = pagesContainer.value;
  if (!container || raw.size === 0) return new Map();
  const pageEl = container.querySelector('[data-page-number]');
  const pageIndex = pageEl ? Number(pageEl.getAttribute('data-page-number')) - 1 : -1;
  if (!pageEl || pageIndex < 0 || !layout.pages[pageIndex]) return new Map();
  const containerRect = container.getBoundingClientRect();
  const elRect = (pageEl as HTMLElement).getBoundingClientRect();
  const refScreen = elRect.top - containerRect.top + container.scrollTop;
  const refLayout = getPageTop(layout, pageIndex);
  const out = new Map<string, number>();
  for (const [key, y] of raw) out.set(key, (y - refLayout) * zoom + refScreen);
  return out;
}
