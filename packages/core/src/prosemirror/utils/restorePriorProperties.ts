/**
 * Prior-property restore helpers for tracked `*Change` reject paths.
 *
 * Shared Phase 1 foundation — Phase 2 (table/row/cell `*Change` reject) and
 * Phase 3 (`revision_change` reject) build on these instead of adding a
 * second convention per element kind. Paragraph restore is live today (used
 * by `resolveById` in `prosemirror/commands/comments.ts`); section/run
 * restore land their callers in later slices.
 *
 * Only fields whose PM-attr shape matches the model shape are copied
 * verbatim. Fields the editor does not model as attrs (`frame`,
 * `runProperties` via the style cascade, unplumbed flags) are skipped —
 * see the field lists below.
 *
 * @packageDocumentation
 */

import type { ParagraphFormatting, SectionProperties, TextFormatting } from '../../types/document';

/**
 * Fields of `ParagraphFormatting` whose PM-attr shape is congruent with the
 * model shape, so a prior snapshot can be written back verbatim. Adding a
 * new `ParagraphFormatting` field requires verifying its PM attr shape
 * (see `prosemirror/schema/nodes.ts` `ParagraphAttrs`).
 */
const PARAGRAPH_RESTORE_FIELDS: Array<keyof ParagraphFormatting> = [
  'alignment',
  'spaceBefore',
  'spaceAfter',
  'lineSpacing',
  'lineSpacingRule',
  'beforeAutospacing',
  'afterAutospacing',
  'spacingExplicit',
  'indentLeft',
  'indentRight',
  'indentFirstLine',
  'hangingIndent',
  'styleId',
  'borders',
  'shading',
  'tabs',
  'pageBreakBefore',
  'keepNext',
  'keepLines',
  'contextualSpacing',
  'bidi',
  'outlineLevel',
  'numPr',
];

/**
 * Restore fields from a prior `ParagraphFormatting` snapshot onto the
 * paragraph's PM attrs. Only user-visible congruent fields are copied —
 * anything not in `prior` is left untouched.
 *
 * `current` (the post-change snapshot) disambiguates numbering the change
 * introduced: when `current` carried `numPr` and `prior` did not, the
 * numbering was part of the change, so it is cleared (the path a
 * list-creation suggestion takes after a save/reload, where the empty
 * prior `<w:pPr/>` round-trips without a `numPr` key — issue #634).
 */
export function restoreParagraphPriorProperties(
  attrs: Record<string, unknown>,
  prior: ParagraphFormatting,
  current?: ParagraphFormatting
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attrs };
  for (const f of PARAGRAPH_RESTORE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(prior, f)) {
      next[f as string] = prior[f] ?? null;
    }
  }
  if (current?.numPr && !Object.prototype.hasOwnProperty.call(prior, 'numPr')) {
    next.numPr = null;
  }
  // Keep the render-only list attrs consistent with `numPr`: once numbering
  // is gone, the bullet/format/marker hints must go too, or a stale glyph
  // lingers.
  if (next.numPr == null) {
    next.listIsBullet = null;
    next.listNumFmt = null;
    next.listMarker = null;
  }
  return next;
}

/**
 * Fields of `SectionProperties` restorable onto a section-props object.
 * `sectPrChange` itself is excluded — reject replaces the change with its
 * prior, it never copies the marker.
 */
const SECTION_RESTORE_FIELDS: Array<keyof SectionProperties> = [
  'pageWidth',
  'pageHeight',
  'orientation',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'headerDistance',
  'footerDistance',
  'gutter',
  'columnCount',
  'columnSpace',
  'equalWidth',
  'separator',
  'columns',
  'footnoteColumns',
  'sectionStart',
  'verticalAlign',
  'bidi',
  'headerReferences',
  'footerReferences',
  'titlePg',
  'evenAndOddHeaders',
  'lineNumbers',
  'pageBorders',
  'background',
  'footnotePr',
  'endnotePr',
  'docGrid',
  'paperSrcFirst',
  'paperSrcOther',
];

/**
 * Restore a prior `SectionProperties` snapshot (reject of `w:sectPrChange`).
 * Prior wins wholesale for modeled fields; the change marker itself is
 * dropped, never copied.
 */
export function restoreSectionPriorProperties(
  current: SectionProperties,
  prior: SectionProperties
): SectionProperties {
  const next: SectionProperties = { ...current };
  for (const f of SECTION_RESTORE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(prior, f)) {
      (next as Record<string, unknown>)[f as string] = prior[f as keyof SectionProperties];
    }
  }
  delete next.sectPrChange;
  return next;
}

/**
 * Restore a prior run-formatting snapshot (reject of `w:rPrChange` /
 * `revision_change`). Run formatting is flat, so every own-property of
 * the prior is copied back.
 */
export function restoreRunPriorProperties(
  current: TextFormatting,
  prior: TextFormatting
): TextFormatting {
  const next: TextFormatting = { ...current };
  for (const key of Object.keys(prior) as Array<keyof TextFormatting>) {
    (next as Record<string, unknown>)[key as string] = prior[key];
  }
  return next;
}
