/**
 * Document-end endnote section rendering (#89).
 *
 * Endnotes belong to the document end (`w:endnotePr w:pos="docEnd"`, the
 * default) — not to any page — so unlike footnotes they need no reserved
 * heights, no multi-pass stabilization, and no paginator changes. This
 * paints them as a trailing page-width sheet after the last page: a
 * separator rule plus one item per referenced endnote in first-appearance
 * order, each measured through the shared body pipeline
 * (`footnoteToProseDoc → toFlowBlocks → measureBlocks`) via
 * {@link renderMeasuredFootnoteContent}.
 *
 * Interaction contract (display-only, like the footnote area):
 * - The section root is NOT a `.layout-page` and items are NOT inside
 *   `.layout-page-content`, so `clickToPositionDom` returns null here and
 *   body-scoped span queries (`findBodyPmSpans`) never match note runs
 *   (whose PM positions live in the note's own PM space and would
 *   otherwise corrupt the body caret).
 * - Cross-navigation rides data hooks: body reference runs carry
 *   `data-endnote-ref` (painted in `renderParagraph/runs.ts`), items carry
 *   `data-endnote-id`, and each item's number carries
 *   `data-endnote-backref`. Adapter click handlers scroll between them.
 */

import type { FootnoteRenderItem } from './footnotes';
import { renderMeasuredFootnoteContent } from './footnotes';
import { FOOTNOTE_SEPARATOR_HEIGHT } from '../../layout-bridge/footnoteLayout';
import type { RenderContext } from '../renderPage';

export interface RenderEndnotesSectionOptions {
  /** Note-body measure width (full content width — endnotes have no columns). */
  contentWidth: number;
  /** Sheet width; mirrors the last page so the section reads as one more page. */
  pageWidth: number;
  /** Vertical padding of the sheet in pixels. */
  verticalPadding?: number;
  /**
   * First-reference PM position per endnote id. Painted as `data-ref-pmpos`
   * on each item so backref clicks can `scrollToPositionImpl` straight to
   * the reference — which also works when the reference's page is currently
   * a virtualization shell (no painted span to query). Layout-based scroll
   * repopulates the page; a DOM lookup would silently no-op.
   */
  refPmPos?: Map<number, number>;
}

function renderPlainEndnoteItem(
  fn: FootnoteRenderItem,
  doc: Document,
  endnoteId: string,
  refPmPos?: number
): HTMLElement {
  const itemEl = doc.createElement('div');
  itemEl.className = 'layout-endnote-item';
  itemEl.dataset.endnoteId = endnoteId;
  if (refPmPos != null) itemEl.dataset.refPmpos = String(refPmPos);
  itemEl.style.fontSize = '10px';
  itemEl.style.lineHeight = '1.3';
  itemEl.style.marginBottom = '4px';

  const sup = doc.createElement('sup');
  sup.dataset.endnoteBackref = endnoteId;
  sup.style.cursor = 'pointer';
  sup.style.fontSize = '7px';
  sup.style.marginRight = '2px';
  sup.textContent = fn.displayNumber;
  itemEl.appendChild(sup);

  const textNode = doc.createTextNode(` ${fn.text}`);
  itemEl.appendChild(textNode);

  return itemEl;
}

/**
 * Render the document-end endnote section. `items` are in display order;
 * `endnoteIds` carries the parallel note ids for the `data-endnote-id`
 * hooks (kept separate because {@link FootnoteRenderItem} is shared with
 * the footnote path, which keys items per page instead).
 */
export function renderEndnotesSection(
  items: FootnoteRenderItem[],
  endnoteIds: number[],
  context: RenderContext,
  doc: Document,
  options: RenderEndnotesSectionOptions
): HTMLElement {
  const { contentWidth, pageWidth } = options;
  const verticalPadding = options.verticalPadding ?? 48;
  const horizontalPadding = Math.max(0, (pageWidth - contentWidth) / 2);

  const section = doc.createElement('section');
  section.className = 'layout-endnotes-section';
  section.style.position = 'relative';
  section.style.width = `${pageWidth}px`;
  section.style.padding = `${verticalPadding}px ${horizontalPadding}px`;
  section.style.backgroundColor = 'var(--doc-page-bg, #ffffff)';
  section.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
  section.style.fontFamily = 'Calibri, Carlito, sans-serif';
  section.style.fontSize = `${(11 * 96) / 72}px`;
  section.style.color = 'var(--doc-page-text, #000000)';

  // Separator rule (same 33% style as the footnote area).
  const separator = doc.createElement('div');
  const separatorRuleHeight = 0.5;
  const separatorMargin = (FOOTNOTE_SEPARATOR_HEIGHT - separatorRuleHeight) / 2;
  separator.style.width = '33%';
  separator.style.height = `${separatorRuleHeight}px`;
  separator.style.backgroundColor = 'var(--doc-page-text, #000000)';
  separator.style.marginBottom = `${separatorMargin}px`;
  separator.style.marginTop = `${separatorMargin}px`;
  section.appendChild(separator);

  items.forEach((fn, index) => {
    const numericId = endnoteIds[index];
    const endnoteId = String(numericId ?? fn.displayNumber);
    const refPmPos = numericId != null ? options.refPmPos?.get(numericId) : undefined;
    if (fn.content) {
      const itemEl = doc.createElement('div');
      itemEl.className = 'layout-endnote-item';
      itemEl.dataset.endnoteId = endnoteId;
      if (refPmPos != null) itemEl.dataset.refPmpos = String(refPmPos);
      const contentEl = renderMeasuredFootnoteContent(fn.content, contentWidth, context, doc);
      // Backref hook on the leading number run: the synthetic number run
      // is the first span of the first paragraph — tag it so adapter
      // click handlers can scroll back to the body reference. (Children
      // are absolutely positioned, so the measured fixed height stays.)
      const firstSpan = contentEl.querySelector('span[data-pm-start]') as HTMLElement | null;
      if (firstSpan) {
        firstSpan.dataset.endnoteBackref = endnoteId;
        firstSpan.style.cursor = 'pointer';
      }
      itemEl.appendChild(contentEl);
      section.appendChild(itemEl);
    } else {
      section.appendChild(renderPlainEndnoteItem(fn, doc, endnoteId, refPmPos));
    }
  });

  return section;
}
