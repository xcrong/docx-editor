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

import type {
  ParagraphFormatting,
  SectionProperties,
  TableCellFormatting,
  TableFormatting,
  TableRowFormatting,
  TextFormatting,
} from '../../types/document';

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
  // T27-02 legacy, in-slice (T27-03): the suggesting-mode snapshotter
  // captures `sectionBreakType` under a cast alongside `ParagraphFormatting`
  // fields so section-break edits are tracked as `pPrChange`. Reject must
  // restore it too. NOTE: this is in-memory only — `CT_PPrBase` (the schema
  // of a `w:pPrChange` prior snapshot) forbids `w:sectPr`, so the prior
  // cannot carry the break on disk; the paragraph serializer drops unknown
  // prior keys on write (full `sectPrChange` authoring rides
  // `_sectionProperties`, handled by the sectPrChange reject path).
  const priorWithBreak = prior as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(priorWithBreak, 'sectionBreakType')) {
    next.sectionBreakType = priorWithBreak.sectionBreakType ?? null;
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

/**
 * Table prior snapshots are MODEL-shaped (`TableFormatting` — `{ value, type }`
 * measurements, `layout`, `shading.fill.rgb`) while the `table` PM attrs are
 * FLAT (plain-twips numbers, hex fills). The inverse of `tablePriorFromSnap`
 * in `plugins/suggestionMode/tableSnapshot.ts`. Only fields with a PM attr
 * land on the node — `cellSpacing`, `indent`, `borders`, `shading`, `overlap`
 * live in `_originalFormatting`, not attrs (same convention as the paragraph
 * restore skipping `frame`). Prior entries pin changed fields only, so copy
 * own-properties.
 */
export function restoreTablePriorProperties(
  attrs: Record<string, unknown>,
  prior: TableFormatting
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attrs };
  const p = prior as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(p, 'styleId')) next.styleId = p.styleId ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'width')) {
    const w = p.width as { value?: unknown; type?: unknown } | null;
    next.width = typeof w?.value === 'number' ? w.value : null;
    next.widthType = typeof w?.type === 'string' ? w.type : null;
  }
  if (Object.prototype.hasOwnProperty.call(p, 'justification'))
    next.justification = p.justification ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'layout')) next.tableLayout = p.layout ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'floating')) next.floating = p.floating ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'cellMargins')) {
    const m = p.cellMargins as Record<string, { value?: unknown } | null> | null;
    if (m == null) {
      next.cellMargins = null;
    } else {
      const out: Record<string, unknown> = {};
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        const v = m[side]?.value;
        if (typeof v === 'number') out[side] = v;
      }
      next.cellMargins = out;
    }
  }
  if (Object.prototype.hasOwnProperty.call(p, 'look')) next.look = p.look ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'bidi')) next.bidi = p.bidi ?? null;
  return next;
}

/**
 * Restore a prior `TableRowFormatting` snapshot onto a `tableRow`'s PM attrs
 * (reject of `w:trPrChange`). `height.value` folds back to the flat twips
 * `height`; `header` folds back to `isHeader`. `cantSplit`, `justification`,
 * `hidden`, `conditionalFormat` have no PM attr — skipped per the file's
 * congruent-shape convention.
 */
export function restoreTableRowPriorProperties(
  attrs: Record<string, unknown>,
  prior: TableRowFormatting
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attrs };
  const p = prior as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(p, 'height')) {
    const h = p.height as { value?: unknown } | null;
    next.height = typeof h?.value === 'number' ? h.value : null;
  }
  if (Object.prototype.hasOwnProperty.call(p, 'heightRule')) next.heightRule = p.heightRule ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'header')) next.isHeader = p.header ?? null;
  return next;
}

/**
 * Restore a prior `TableCellFormatting` snapshot onto a `tableCell`'s PM
 * attrs (reject of `w:tcPrChange`). `width` and `margins` fold back to flat
 * twips; `shading.fill.rgb` folds back to the hex `backgroundColor`.
 * `gridSpan`, `vMerge`, `fitText`, `hideMark`, `conditionalFormat` have no
 * PM attr — skipped per the file's congruent-shape convention.
 */
export function restoreTableCellPriorProperties(
  attrs: Record<string, unknown>,
  prior: TableCellFormatting
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attrs };
  const p = prior as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(p, 'width')) {
    const w = p.width as { value?: unknown; type?: unknown } | null;
    next.width = typeof w?.value === 'number' ? w.value : null;
    next.widthType = typeof w?.type === 'string' ? w.type : null;
  }
  if (Object.prototype.hasOwnProperty.call(p, 'verticalAlign'))
    next.verticalAlign = p.verticalAlign ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'shading')) {
    const s = p.shading as { fill?: { rgb?: unknown } } | null;
    const rgb = s?.fill?.rgb;
    next.backgroundColor = typeof rgb === 'string' && rgb.length > 0 ? rgb : null;
  }
  if (Object.prototype.hasOwnProperty.call(p, 'borders')) next.borders = p.borders ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'margins')) {
    const m = p.margins as Record<string, { value?: unknown } | null> | null;
    if (m == null) {
      next.margins = null;
    } else {
      const out: Record<string, unknown> = {};
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        const v = m[side]?.value;
        if (typeof v === 'number') out[side] = v;
      }
      next.margins = out;
    }
  }
  if (Object.prototype.hasOwnProperty.call(p, 'textDirection'))
    next.textDirection = p.textDirection ?? null;
  if (Object.prototype.hasOwnProperty.call(p, 'noWrap')) next.noWrap = p.noWrap ?? null;
  return next;
}

/**
 * Restore a prior `TableFormatting` snapshot onto a row's `tblPrEx` attr
 * (reject of `w:tblPrExChange`). Both sides are model-shaped, so own-property
 * copy is verbatim. A `null` prior field restores absence; when the merged
 * exceptions object ends up empty it stays `{}` (the serializer drops an
 * empty `<w:tblPrEx>` on write).
 */
export function restoreTableExceptionsPrior(
  current: TableFormatting | null | undefined,
  prior: TableFormatting
): TableFormatting {
  const next: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
  const p = prior as unknown as Record<string, unknown>;
  for (const key of Object.keys(p)) {
    next[key] = p[key];
  }
  return next as unknown as TableFormatting;
}
