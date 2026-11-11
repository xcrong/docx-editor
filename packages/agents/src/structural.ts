/**
 * Paragraph-level (structural) tracked-change support for the agents toolkit.
 *
 * Headless-model counterpart of the PM-side accept/reject in
 * `core/prosemirror/commands/comments.ts` (`resolveById`, issue #79) so
 * `DocxReviewer` accept/reject cover the same revisions (issue #120):
 * `pPrIns` / `pPrDel` (paragraph-mark insertion/deletion), `propertyChanges`
 * (`w:pPrChange`), `paraRPrChange` (`CT_ParaRPrChange`), and `sectPrChange`
 * (`w:sectPrChange`, paragraph-level and body-level placements).
 *
 * Per-marker semantics (mirroring PM `resolveById`):
 * - accept `pPrIns` → clear the marker, structure stays split.
 * - reject `pPrIns` → clear the marker AND join with the following paragraph;
 *   the joined paragraph inherits the SECOND paragraph's pPr (Word: the
 *   surviving mark wins). No following paragraph (last in container, or next
 *   is a table) → just clear the marker.
 * - accept `pPrDel` → join with the following paragraph (second's pPr wins).
 * - reject `pPrDel` → clear the marker, structure stays split.
 * - accept `pPrChange` / `paraRPrChange` / `sectPrChange` → drop the entry,
 *   current values win.
 * - reject `pPrChange` / `paraRPrChange` / `sectPrChange` → restore the
 *   entry's prior snapshot fields, drop the entry. Fields absent from the
 *   prior are left untouched.
 * - Cross-revision dependency (mirroring PM): rejecting a `pPrIns` whose
 *   host paragraph also carries `pPrChange` entries first rejects those
 *   entries (restore prior, clear) — otherwise the join would silently drop
 *   another revision.
 *
 * Model notes vs PM: both sides of a restore are model-shaped here
 * (`ParagraphFormatting`, `TextFormatting`, `SectionProperties`), so reject
 * copies every own-property of the prior verbatim (minus the change marker
 * itself). PM instead copies a congruent-attr subset because the PM attrs are
 * flat while the model is nested — the model copy is the faithful superset.
 * The `numPr`-added numbering clear on `pPrChange` reject IS mirrored
 * (current carries `numPr`, prior does not → drop numbering + list rendering).
 */

import type {
  BlockContent,
  DocumentBody,
  Paragraph,
  ParagraphFormatting,
} from '@xcrong/docx-editor-core/headless';
import type { ReviewChange, StructuralChangeKind } from './types';
import { getParagraphPlainText } from './textSearch';

export type StructuralMode = 'accept' | 'reject';

/** Where a structural change lives — body paragraphs carry neither field. */
export interface StructuralLocation {
  noteId?: number;
  noteType?: 'footnote' | 'endnote';
}

// ============================================================================
// DISCOVERY
// ============================================================================

/**
 * Collect the structural revisions on one paragraph as `ReviewChange`
 * entries (one per marker / per stacked property-change entry).
 */
export function collectStructuralChanges(
  para: Paragraph,
  paragraphIndex: number,
  location: StructuralLocation,
  out: ReviewChange[]
): void {
  const text = getParagraphPlainText(para);
  const push = (
    id: number,
    type: StructuralChangeKind,
    author: string,
    date: string | undefined
  ): void => {
    out.push({
      id,
      type,
      author,
      date: date ?? null,
      text,
      context: text,
      paragraphIndex,
      ...(location.noteId !== undefined ? { noteId: location.noteId } : {}),
      ...(location.noteType !== undefined ? { noteType: location.noteType } : {}),
    });
  };

  if (para.pPrIns) {
    push(para.pPrIns.id, 'paragraphInsertion', para.pPrIns.author, para.pPrIns.date);
  }
  if (para.pPrDel) {
    push(para.pPrDel.id, 'paragraphDeletion', para.pPrDel.author, para.pPrDel.date);
  }
  for (const entry of para.propertyChanges ?? []) {
    if (!entry?.info || typeof entry.info.id !== 'number') continue;
    push(entry.info.id, 'paragraphPropertyChange', entry.info.author, entry.info.date);
  }
  for (const entry of para.paraRPrChange ?? []) {
    if (!entry?.info || typeof entry.info.id !== 'number') continue;
    push(entry.info.id, 'paragraphMarkPropertyChange', entry.info.author, entry.info.date);
  }
  const sectPrChange = para.sectionProperties?.sectPrChange;
  if (sectPrChange?.info && typeof sectPrChange.info.id === 'number') {
    push(
      sectPrChange.info.id,
      'sectionPropertyChange',
      sectPrChange.info.author,
      sectPrChange.info.date
    );
  }
}

/**
 * Collect the body-level `finalSectionProperties.sectPrChange` (the document's
 * final `w:sectPr`, outside any paragraph — the PM doc cannot address it, but
 * the headless model can). Reported with `paragraphIndex: -1` (no anchor, same
 * convention as anchor-less comments); accepted/rejected by id like the rest.
 */
export function collectBodySectionChange(body: DocumentBody, out: ReviewChange[]): void {
  const change = body.finalSectionProperties?.sectPrChange;
  if (!change?.info || typeof change.info.id !== 'number') return;
  out.push({
    id: change.info.id,
    type: 'sectionPropertyChange',
    author: change.info.author,
    date: change.info.date ?? null,
    text: '',
    context: '',
    paragraphIndex: -1,
  });
}

// ============================================================================
// RESOLVE
// ============================================================================

interface MarkSite {
  container: BlockContent[];
  index: number;
  para: Paragraph;
  kind: 'pPrIns' | 'pPrDel';
}

/** Walk every paragraph container (body top level + table cells). */
function walkContainers(
  blocks: BlockContent[],
  fn: (container: BlockContent[], index: number, para: Paragraph) => void
): void {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    if (block.type === 'paragraph') {
      fn(blocks, i, block);
    } else if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          walkContainers(cell.content, fn);
        }
      }
    }
  }
}

/**
 * Join the paragraph at `container[index]` with its following sibling. The
 * result inherits the SECOND paragraph's properties (Word: the surviving mark
 * wins) with concatenated content — the model equivalent of PM
 * `joinParagraphWithNext(tr, pos, { inheritFromSecond: true })`. Block-level
 * bookmark markers straddling the old boundary are preserved on the joined
 * paragraph so the round trip stays lossless.
 */
function joinWithNext(container: BlockContent[], index: number, onlyId: number): void {
  const first = container[index];
  const second = container[index + 1];
  if (!first || first.type !== 'paragraph' || !second || second.type !== 'paragraph') return;
  const merged: Paragraph = {
    ...second,
    content: [...first.content, ...second.content],
    leadingBlockMarkers: [
      ...(first.leadingBlockMarkers ?? []),
      ...(first.trailingBlockMarkers ?? []),
      ...(second.leadingBlockMarkers ?? []),
    ],
    trailingBlockMarkers: second.trailingBlockMarkers,
  };
  // The join resolves the boundary marker for `onlyId`; a surviving marker
  // for any OTHER revision on the second paragraph is preserved.
  if (merged.pPrIns?.id === onlyId) delete merged.pPrIns;
  if (merged.pPrDel?.id === onlyId) delete merged.pPrDel;
  if (merged.leadingBlockMarkers?.length === 0) delete merged.leadingBlockMarkers;
  container.splice(index, 2, merged);
}

/** Restore every own-property of `prior` onto `current` (verbatim model copy). */
function restoreOwn<T extends object>(current: T | undefined, prior: object): T {
  const next: Record<string, unknown> = { ...((current as object) ?? {}) };
  for (const [key, value] of Object.entries(prior)) {
    if (key === 'sectPrChange') continue;
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}

/** Reject every `pPrChange` entry on a join-doomed host (restore prior, clear). */
function rejectHostPropertyChanges(para: Paragraph): number {
  const entries = para.propertyChanges;
  if (!entries || entries.length === 0) return 0;
  const resolved = entries.length;
  let formatting: ParagraphFormatting | undefined = para.formatting;
  for (const entry of entries) {
    if (entry?.previousFormatting != null) {
      formatting = restoreOwn(formatting, entry.previousFormatting);
      if (
        (entry.currentFormatting as ParagraphFormatting | undefined)?.numPr &&
        !Object.prototype.hasOwnProperty.call(entry.previousFormatting, 'numPr')
      ) {
        if (formatting) delete formatting.numPr;
        delete para.listRendering;
      }
    }
  }
  if (formatting) para.formatting = formatting;
  delete para.propertyChanges;
  return resolved;
}

/** Resolve one paragraph's property/section entries carrying `id`. */
function resolveParagraphEntries(para: Paragraph, id: number, mode: StructuralMode): number {
  let count = 0;

  const propChanges = para.propertyChanges;
  if (propChanges) {
    for (let i = propChanges.length - 1; i >= 0; i--) {
      const entry = propChanges[i];
      if (!entry?.info || entry.info.id !== id) continue;
      if (mode === 'reject' && entry.previousFormatting != null) {
        let formatting = restoreOwn(para.formatting, entry.previousFormatting);
        if (
          (entry.currentFormatting as ParagraphFormatting | undefined)?.numPr &&
          !Object.prototype.hasOwnProperty.call(entry.previousFormatting, 'numPr')
        ) {
          formatting = formatting ?? {};
          delete formatting.numPr;
          delete para.listRendering;
        }
        para.formatting = formatting;
      }
      propChanges.splice(i, 1);
      count++;
    }
    if (propChanges.length === 0) delete para.propertyChanges;
  }

  const markChanges = para.paraRPrChange;
  if (markChanges) {
    for (let i = markChanges.length - 1; i >= 0; i--) {
      const entry = markChanges[i];
      if (!entry?.info || entry.info.id !== id) continue;
      if (mode === 'reject' && entry.previousFormatting != null) {
        para.formatting = para.formatting ?? {};
        para.formatting.runProperties = restoreOwn(
          para.formatting.runProperties,
          entry.previousFormatting
        );
      }
      markChanges.splice(i, 1);
      count++;
    }
    if (markChanges.length === 0) delete para.paraRPrChange;
  }

  const sectProps = para.sectionProperties;
  const sectPrChange = sectProps?.sectPrChange;
  if (sectProps && sectPrChange?.info?.id === id) {
    if (mode === 'reject' && sectPrChange.previousSectionProperties != null) {
      const restored = restoreOwn(sectProps, sectPrChange.previousSectionProperties);
      delete restored.sectPrChange;
      para.sectionProperties = restored;
    } else {
      delete sectProps.sectPrChange;
    }
    count++;
  }

  return count;
}

/**
 * Resolve every structural site carrying `id` in `blocks` (a body or note
 * block list). Joins run first in reverse document order (mirroring PM, so
 * earlier indices stay valid), then property/section restores. Returns the
 * number of resolved markers/entries.
 */
export function resolveStructuralById(
  blocks: BlockContent[],
  id: number,
  mode: StructuralMode
): number {
  let count = 0;

  // Phase 1 — paragraph-mark joins/clears, reverse document order.
  const sites: MarkSite[] = [];
  walkContainers(blocks, (container, index, para) => {
    if (para.pPrIns?.id === id) sites.push({ container, index, para, kind: 'pPrIns' });
    if (para.pPrDel?.id === id) sites.push({ container, index, para, kind: 'pPrDel' });
  });
  for (let s = sites.length - 1; s >= 0; s--) {
    const site = sites[s]!;
    // Re-confirm against the live container (an earlier join may have
    // replaced this paragraph).
    const live = site.container[site.index];
    if (live !== site.para || live.type !== 'paragraph') continue;
    const marker = site.kind === 'pPrIns' ? live.pPrIns : live.pPrDel;
    if (!marker || marker.id !== id) continue;

    const shouldJoin =
      (mode === 'reject' && site.kind === 'pPrIns') ||
      (mode === 'accept' && site.kind === 'pPrDel');
    if (shouldJoin) {
      const next = site.container[site.index + 1];
      if (!next || next.type !== 'paragraph') {
        // Last paragraph in its container (or next is a table): no sibling
        // to join with — clear the marker, mirroring PM's edge case.
        if (site.kind === 'pPrIns') delete live.pPrIns;
        else delete live.pPrDel;
        count++;
      } else {
        if (mode === 'reject' && site.kind === 'pPrIns') {
          count += rejectHostPropertyChanges(live);
        }
        if (site.kind === 'pPrIns') delete live.pPrIns;
        else delete live.pPrDel;
        joinWithNext(site.container, site.index, id);
        count++;
      }
    } else {
      if (site.kind === 'pPrIns') delete live.pPrIns;
      else delete live.pPrDel;
      count++;
    }
  }

  // Phase 2 — property/section restores on the live paragraphs.
  walkContainers(blocks, (_container, _index, para) => {
    count += resolveParagraphEntries(para, id, mode);
  });

  return count;
}

/**
 * Resolve EVERY structural marker/entry in `blocks` regardless of id (the
 * `acceptAll` / `rejectAll` path). Same phase split as the by-id resolver.
 */
export function resolveAllStructural(blocks: BlockContent[], mode: StructuralMode): number {
  let count = 0;

  const sites: MarkSite[] = [];
  walkContainers(blocks, (container, index, para) => {
    if (para.pPrIns) sites.push({ container, index, para, kind: 'pPrIns' });
    if (para.pPrDel) sites.push({ container, index, para, kind: 'pPrDel' });
  });
  for (let s = sites.length - 1; s >= 0; s--) {
    const site = sites[s]!;
    const live = site.container[site.index];
    if (live !== site.para || live.type !== 'paragraph') continue;
    const marker = site.kind === 'pPrIns' ? live.pPrIns : live.pPrDel;
    if (!marker) continue;

    const shouldJoin =
      (mode === 'reject' && site.kind === 'pPrIns') ||
      (mode === 'accept' && site.kind === 'pPrDel');
    if (shouldJoin) {
      const next = site.container[site.index + 1];
      if (!next || next.type !== 'paragraph') {
        if (site.kind === 'pPrIns') delete live.pPrIns;
        else delete live.pPrDel;
        count++;
      } else {
        if (mode === 'reject' && site.kind === 'pPrIns') {
          count += rejectHostPropertyChanges(live);
        }
        const resolvedId = marker.id;
        if (site.kind === 'pPrIns') delete live.pPrIns;
        else delete live.pPrDel;
        joinWithNext(site.container, site.index, resolvedId);
        count++;
      }
    } else {
      if (site.kind === 'pPrIns') delete live.pPrIns;
      else delete live.pPrDel;
      count++;
    }
  }

  walkContainers(blocks, (_container, _index, para) => {
    const propChanges = para.propertyChanges;
    if (propChanges) {
      // Reject walks stacked sessions newest-first (entries append, so the
      // last entry is the newest); accept order is irrelevant.
      const order = mode === 'reject' ? [...propChanges.keys()].reverse() : [...propChanges.keys()];
      for (const i of order) {
        const entry = propChanges[i];
        if (!entry?.info || typeof entry.info.id !== 'number') continue;
        if (mode === 'reject' && entry.previousFormatting != null) {
          let formatting = restoreOwn(para.formatting, entry.previousFormatting);
          if (
            (entry.currentFormatting as ParagraphFormatting | undefined)?.numPr &&
            !Object.prototype.hasOwnProperty.call(entry.previousFormatting, 'numPr')
          ) {
            formatting = formatting ?? {};
            delete formatting.numPr;
            delete para.listRendering;
          }
          para.formatting = formatting;
        }
        count++;
      }
      delete para.propertyChanges;
    }
    const markChanges = para.paraRPrChange;
    if (markChanges) {
      const order = mode === 'reject' ? [...markChanges.keys()].reverse() : [...markChanges.keys()];
      for (const i of order) {
        const entry = markChanges[i];
        if (!entry?.info || typeof entry.info.id !== 'number') continue;
        if (mode === 'reject' && entry.previousFormatting != null) {
          para.formatting = para.formatting ?? {};
          para.formatting.runProperties = restoreOwn(
            para.formatting.runProperties,
            entry.previousFormatting
          );
        }
        count++;
      }
      delete para.paraRPrChange;
    }
    const sectProps = para.sectionProperties;
    if (sectProps?.sectPrChange) {
      if (mode === 'reject' && sectProps.sectPrChange.previousSectionProperties != null) {
        const restored = restoreOwn(sectProps, sectProps.sectPrChange.previousSectionProperties);
        delete restored.sectPrChange;
        para.sectionProperties = restored;
      } else {
        delete sectProps.sectPrChange;
      }
      count++;
    }
  });

  return count;
}

// ============================================================================
// BODY-LEVEL SECTION PROPERTIES
// ============================================================================

/** Resolve the body-level `finalSectionProperties.sectPrChange` by id. */
export function resolveBodySectionChangeById(
  body: DocumentBody,
  id: number,
  mode: StructuralMode
): boolean {
  const props = body.finalSectionProperties;
  if (props?.sectPrChange?.info?.id !== id) return false;
  if (mode === 'reject' && props.sectPrChange.previousSectionProperties != null) {
    const restored = restoreOwn(props, props.sectPrChange.previousSectionProperties);
    delete restored.sectPrChange;
    body.finalSectionProperties = restored;
  } else {
    delete props.sectPrChange;
  }
  return true;
}

/** Resolve the body-level `sectPrChange` (the acceptAll/rejectAll path). */
export function resolveAllBodySectionChanges(body: DocumentBody, mode: StructuralMode): number {
  const props = body.finalSectionProperties;
  if (!props?.sectPrChange) return 0;
  if (mode === 'reject' && props.sectPrChange.previousSectionProperties != null) {
    const restored = restoreOwn(props, props.sectPrChange.previousSectionProperties);
    delete restored.sectPrChange;
    body.finalSectionProperties = restored;
  } else {
    delete props.sectPrChange;
  }
  return 1;
}

// ============================================================================
// REVISION-ID SCAN (for `nextRevisionId`)
// ============================================================================

/** Highest structural revision id in a body (paragraphs + body-level). */
export function maxStructuralRevisionId(body: DocumentBody): number {
  let maxId = 0;
  const consider = (id: unknown): void => {
    if (typeof id === 'number' && id > maxId) maxId = id;
  };
  walkContainers(body.content, (_container, _index, para) => {
    consider(para.pPrIns?.id);
    consider(para.pPrDel?.id);
    for (const entry of para.propertyChanges ?? []) consider(entry?.info?.id);
    for (const entry of para.paraRPrChange ?? []) consider(entry?.info?.id);
    consider(para.sectionProperties?.sectPrChange?.info?.id);
  });
  consider(body.finalSectionProperties?.sectPrChange?.info?.id);
  return maxId;
}
