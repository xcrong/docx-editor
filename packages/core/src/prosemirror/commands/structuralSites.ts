/**
 * Structural-revision site finders for accept/reject-by-id.
 *
 * Pure document walks shared by `resolveById` in `./comments.ts`: each
 * finder collects every node carrying a given revision id so the resolver
 * can clear/restore all of them in one PM transaction (one undo step).
 * Split out of `comments.ts` to keep that file under the repo `max-lines`
 * cap — no behavior lives here beyond position collection and the small
 * join/clear mutations the resolver applies.
 *
 * @packageDocumentation
 */

import type { Transaction } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';

export interface ParagraphMarkSite {
  /** Position immediately before the paragraph's open tag. */
  pos: number;
  /** The paragraph node carrying the revision attr. */
  // Kept as `any` here to avoid the Node import cycle; callers handle typing.
  node: import('prosemirror-model').Node;
  kind: 'pPrIns' | 'pPrDel';
}

export interface ParagraphPropertyChangeSite {
  pos: number;
  node: import('prosemirror-model').Node;
  /** Index into the paragraph's `pPrChange` array (since multiple authors can stack). */
  entryIndex: number;
  /** The prior `ParagraphFormatting` snapshot from the matching entry. */
  prior: import('../../types/document').ParagraphFormatting | undefined;
  /** The post-change snapshot, when present — used to detect numbering the change added. */
  current: import('../../types/document').ParagraphFormatting | undefined;
}

export interface ParagraphMarkPropertyChangeSite {
  pos: number;
  node: import('prosemirror-model').Node;
  /** Index into the paragraph's `paraRPrChange` array. */
  entryIndex: number;
  /** The prior paragraph-mark rPr snapshot from the matching entry. */
  prior: import('../../types/document').TextFormatting | undefined;
}

export interface SectionPropertyChangeSite {
  pos: number;
  node: import('prosemirror-model').Node;
  /** The prior section-properties snapshot from the matching entry. */
  prior: import('../../types/document').SectionProperties | undefined;
}

export interface TableRowSite {
  pos: number;
  node: import('prosemirror-model').Node;
  kind: 'trIns' | 'trDel';
}

export interface TableCellMarkerSite {
  pos: number;
  node: import('prosemirror-model').Node;
  cellKind: 'ins' | 'del' | 'merge';
}

/**
 * Walk the document and collect every paragraph that carries a
 * `pPrIns` or `pPrDel` attr with the given revision id.
 */
export function findParagraphMarkSites(
  state: EditorState,
  revisionId: number
): ParagraphMarkSite[] {
  const sites: ParagraphMarkSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const ins = node.attrs.pPrIns as { revisionId: number } | null;
    const del = node.attrs.pPrDel as { revisionId: number } | null;
    if (ins && ins.revisionId === revisionId) {
      sites.push({ pos, node, kind: 'pPrIns' });
    }
    if (del && del.revisionId === revisionId) {
      sites.push({ pos, node, kind: 'pPrDel' });
    }
  });
  return sites;
}

/**
 * Walk the document for paragraph nodes whose `pPrChange` array has an
 * entry with `info.id === revisionId`. Returns one site per matching entry
 * with the entry index for later mutation.
 */
export function findParagraphPropertyChangeSites(
  state: EditorState,
  revisionId: number
): ParagraphPropertyChangeSite[] {
  const sites: ParagraphPropertyChangeSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const changes = node.attrs.pPrChange as Array<{
      info: { id: number };
      previousFormatting?: unknown;
      currentFormatting?: unknown;
    }> | null;
    if (!Array.isArray(changes)) return;
    changes.forEach((entry, idx) => {
      // Defensive: skip malformed entries (no info, non-numeric id) so a
      // bad attr cannot crash the resolver.
      if (!entry?.info || typeof entry.info.id !== 'number') return;
      if (entry.info.id === revisionId) {
        sites.push({
          pos,
          node,
          entryIndex: idx,
          prior: entry.previousFormatting as
            | import('../../types/document').ParagraphFormatting
            | undefined,
          current: entry.currentFormatting as
            | import('../../types/document').ParagraphFormatting
            | undefined,
        });
      }
    });
  });
  return sites;
}

/**
 * Walk the document for paragraph nodes whose `paraRPrChange` array has an
 * entry with `info.id === revisionId` (CT_ParaRPrChange — formatting of the
 * paragraph-mark glyph itself, distinct from run `rPrChange`).
 */
export function findParagraphMarkPropertyChangeSites(
  state: EditorState,
  revisionId: number
): ParagraphMarkPropertyChangeSite[] {
  const sites: ParagraphMarkPropertyChangeSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const changes = node.attrs.paraRPrChange as Array<{
      info: { id: number };
      previousFormatting?: unknown;
    }> | null;
    if (!Array.isArray(changes)) return;
    changes.forEach((entry, idx) => {
      if (!entry?.info || typeof entry.info.id !== 'number') return;
      if (entry.info.id === revisionId) {
        sites.push({
          pos,
          node,
          entryIndex: idx,
          prior: entry.previousFormatting as
            | import('../../types/document').TextFormatting
            | undefined,
        });
      }
    });
  });
  return sites;
}

/**
 * Walk the document for paragraph nodes whose pPr-level
 * `_sectionProperties.sectPrChange` carries `info.id === revisionId`.
 * Body-level `sectPrChange` lives on the document's final section
 * properties outside the PM doc and is not addressable here.
 */
export function findSectionPropertyChangeSites(
  state: EditorState,
  revisionId: number
): SectionPropertyChangeSite[] {
  const sites: SectionPropertyChangeSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const sectPrChange = (
      node.attrs._sectionProperties as {
        sectPrChange?: {
          info: { id: number };
          previousSectionProperties?: import('../../types/document').SectionProperties;
        };
      } | null
    )?.sectPrChange;
    if (sectPrChange?.info?.id === revisionId) {
      sites.push({ pos, node, prior: sectPrChange.previousSectionProperties });
    }
  });
  return sites;
}

/** Find every inline `insertion`/`deletion` mark range with the given id. */
export function findInlineMarkSites(
  state: EditorState,
  revisionId: number
): Array<{ from: number; to: number; markName: 'insertion' | 'deletion' }> {
  const sites: Array<{ from: number; to: number; markName: 'insertion' | 'deletion' }> = [];
  const insertionType = state.schema.marks.insertion;
  const deletionType = state.schema.marks.deletion;
  state.doc.descendants((node, pos) => {
    // Text AND inline atoms (image, shape) can carry tracked-change marks, so
    // rejecting an inserted picture removes it just like inserted text.
    if (!node.isInline) return;
    for (const mark of node.marks) {
      if (
        (insertionType && mark.type === insertionType) ||
        (deletionType && mark.type === deletionType)
      ) {
        if (mark.attrs.revisionId === revisionId) {
          const markName: 'insertion' | 'deletion' =
            mark.type === insertionType ? 'insertion' : 'deletion';
          // Coalesce contiguous siblings sharing the same id.
          const last = sites[sites.length - 1];
          if (last && last.markName === markName && last.to === pos) {
            last.to = pos + node.nodeSize;
          } else {
            sites.push({ from: pos, to: pos + node.nodeSize, markName });
          }
        }
      }
    }
  });
  return sites;
}

/**
 * Join paragraph at position `paraStart` (start-of-open-tag) with the
 * following sibling paragraph. The joined paragraph inherits the
 * SECOND paragraph's pPr (matches Word: the surviving mark wins). Both
 * paragraphs must exist; caller checks.
 */
export function joinParagraphWithNext(
  tr: Transaction,
  paraStart: number,
  options: { inheritFromSecond: boolean }
): void {
  const para = tr.doc.nodeAt(paraStart);
  if (!para) return;
  const nextParaStart = paraStart + para.nodeSize;
  const nextPara = tr.doc.nodeAt(nextParaStart);
  if (!nextPara || nextPara.type.name !== 'paragraph') return;
  // Per-OOXML: rejecting a paragraph-mark insertion (or accepting a deletion)
  // collapses the boundary; the resulting paragraph's properties come from
  // the SECOND paragraph (the one whose mark survives the join).
  if (options.inheritFromSecond) {
    // Replace para's attrs with nextPara's attrs first, then join.
    tr.setNodeMarkup(paraStart, undefined, { ...nextPara.attrs, pPrIns: null, pPrDel: null });
  }
  // `tr.join(pos)` joins the block ending immediately before `pos` with
  // the block starting at `pos`. `nextParaStart` is between the two paragraphs.
  tr.join(nextParaStart);
}

/** Clear pPrIns/pPrDel attrs on the paragraph at `paraStart`. */
export function clearParagraphMarkRevision(
  tr: Transaction,
  paraStart: number,
  kind: 'pPrIns' | 'pPrDel'
): void {
  const para = tr.doc.nodeAt(paraStart);
  if (!para) return;
  const newAttrs = { ...para.attrs };
  newAttrs[kind] = null;
  tr.setNodeMarkup(paraStart, undefined, newAttrs);
}

/**
 * Remove a `pPrChange` entry by array index from the paragraph at `paraStart`.
 * If the array becomes empty, the attr is set to `null` so PM treats it as
 * absent on save.
 */
export function clearParagraphPropertyChangeEntry(
  tr: Transaction,
  paraStart: number,
  entryIndex: number
): void {
  const para = tr.doc.nodeAt(paraStart);
  if (!para) return;
  const existing = para.attrs.pPrChange as Array<unknown> | null;
  if (!Array.isArray(existing) || entryIndex < 0 || entryIndex >= existing.length) return;
  const next = existing.slice();
  next.splice(entryIndex, 1);
  tr.setNodeMarkup(paraStart, undefined, {
    ...para.attrs,
    pPrChange: next.length > 0 ? next : null,
  });
}

/**
 * Remove a `paraRPrChange` entry by array index from the paragraph at `paraStart`.
 * If the array becomes empty, the attr is set to `null` so PM treats it as
 * absent on save.
 */
export function clearParagraphMarkPropertyChangeEntry(
  tr: Transaction,
  paraStart: number,
  entryIndex: number
): void {
  const para = tr.doc.nodeAt(paraStart);
  if (!para) return;
  const existing = para.attrs.paraRPrChange as Array<unknown> | null;
  if (!Array.isArray(existing) || entryIndex < 0 || entryIndex >= existing.length) return;
  const next = existing.slice();
  next.splice(entryIndex, 1);
  tr.setNodeMarkup(paraStart, undefined, {
    ...para.attrs,
    paraRPrChange: next.length > 0 ? next : null,
  });
}

/** Clear the pPr-level `sectPrChange` on the paragraph at `paraStart`, keeping the rest of `_sectionProperties`. */
export function clearSectionPropertyChange(tr: Transaction, paraStart: number): void {
  const para = tr.doc.nodeAt(paraStart);
  if (!para) return;
  const sectProps = para.attrs._sectionProperties as Record<string, unknown> | null;
  if (!sectProps || !('sectPrChange' in sectProps)) return;
  const { sectPrChange: _dropped, ...rest } = sectProps;
  void _dropped;
  tr.setNodeMarkup(paraStart, undefined, { ...para.attrs, _sectionProperties: rest });
}

/** Find every table row carrying `trIns` or `trDel` with the given id. */
export function findTableRowSites(state: EditorState, revisionId: number): TableRowSite[] {
  const sites: TableRowSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'tableRow') return;
    const ins = node.attrs.trIns as { revisionId: number } | null;
    const del = node.attrs.trDel as { revisionId: number } | null;
    if (ins && ins.revisionId === revisionId) sites.push({ pos, node, kind: 'trIns' });
    if (del && del.revisionId === revisionId) sites.push({ pos, node, kind: 'trDel' });
  });
  return sites;
}

/** Find every table cell carrying `cellMarker` with the given id. */
export function findTableCellMarkerSites(
  state: EditorState,
  revisionId: number
): TableCellMarkerSite[] {
  const sites: TableCellMarkerSite[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') return;
    const m = node.attrs.cellMarker as {
      kind: 'ins' | 'del' | 'merge';
      info: { revisionId: number };
    } | null;
    if (m?.info?.revisionId === revisionId) {
      sites.push({ pos, node, cellKind: m.kind });
    }
  });
  return sites;
}
