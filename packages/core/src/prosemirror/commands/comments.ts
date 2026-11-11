/**
 * Comment and Track Changes Commands
 *
 * PM commands for adding/removing comments and accepting/rejecting tracked changes.
 */

import type { Command, Transaction } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { SUGGESTION_BYPASS_META } from '../plugins/suggestionMode';
import { extractTrackedChanges } from '../utils/extractTrackedChanges';
import {
  restoreParagraphPriorProperties,
  restoreRunPriorProperties,
  restoreSectionPriorProperties,
} from '../utils/restorePriorProperties';

/**
 * Add a comment mark to the current selection.
 */
export function addCommentMark(commentId: number): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) return false;

    const commentType = state.schema.marks.comment;
    if (!commentType) return false;

    if (dispatch) {
      const tr = state.tr.addMark(from, to, commentType.create({ commentId }));
      dispatch(tr);
    }
    return true;
  };
}

/**
 * Remove a comment mark by ID from the entire document.
 */
export function removeCommentMark(commentId: number): Command {
  return (state, dispatch) => {
    const commentType = state.schema.marks.comment;
    if (!commentType) return false;

    if (dispatch) {
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type === commentType && mark.attrs.commentId === commentId) {
              tr.removeMark(pos, pos + node.nodeSize, mark);
            }
          }
        }
      });
      if (tr.steps.length > 0) {
        dispatch(tr);
      }
    }
    return true;
  };
}

/**
 * Resolve a tracked change: accept or reject.
 * - Accept: keep insertions (remove mark), delete deletions (remove text)
 * - Reject: keep deletions (remove mark), delete insertions (remove text)
 */
function resolveChange(from: number, to: number, mode: 'accept' | 'reject'): Command {
  return (state, dispatch) => {
    const insertionType = state.schema.marks.insertion;
    const deletionType = state.schema.marks.deletion;
    if (!insertionType && !deletionType) return false;

    // "keep" mark type: remove the mark but keep the text
    // "remove" mark type: remove both the mark and the text
    const keepType = mode === 'accept' ? insertionType : deletionType;
    const removeType = mode === 'accept' ? deletionType : insertionType;

    if (dispatch) {
      const tr = state.tr;
      const deleteRanges: Array<{ from: number; to: number }> = [];

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isInline) return;
        const nodeEnd = pos + node.nodeSize;
        const rangeFrom = Math.max(from, pos);
        const rangeTo = Math.min(to, nodeEnd);

        if (removeType && node.marks.some((m) => m.type === removeType)) {
          deleteRanges.push({ from: rangeFrom, to: rangeTo });
        }

        if (keepType && node.marks.some((m) => m.type === keepType)) {
          tr.removeMark(rangeFrom, rangeTo, keepType);
        }
      });

      for (const range of deleteRanges.reverse()) {
        tr.delete(range.from, range.to);
      }

      if (tr.steps.length > 0) {
        dispatch(tr);
      }
    }
    return true;
  };
}

/**
 * Accept a tracked change at the given range.
 * - Insertion: remove mark, keep text
 * - Deletion: remove mark AND text
 *
 * Use {@link acceptChangeById} when accepting a coalesced revision —
 * a single editing session can scatter sites across multiple paragraphs
 * and only the by-id resolver walks every site.
 *
 * @example
 * ```ts
 * import { acceptChange } from '@xcrong/docx-editor-core/prosemirror/commands';
 * acceptChange(from, to)(view.state, view.dispatch);
 * ```
 */
export function acceptChange(from: number, to: number): Command {
  return resolveChange(from, to, 'accept');
}

/**
 * Reject a tracked change at the given range.
 * - Insertion: remove mark AND text
 * - Deletion: remove mark, keep text
 *
 * Use {@link rejectChangeById} when rejecting a coalesced revision.
 */
export function rejectChange(from: number, to: number): Command {
  return resolveChange(from, to, 'reject');
}

/**
 * Every distinct revision triple `(id, author, date)` in the document, in
 * document order. Triples — not bare ids — are the grouping key: OOXML
 * `w:id` is not author-scoped, so two authors may legally mint the same
 * numeric id (see `tracked-changes-review/spec.md` "Cross-author id
 * collisions remain separate").
 */
interface RevisionTriple {
  id: number;
  author: string;
  date: string | null | undefined;
}

function tripleKey(t: RevisionTriple): string {
  return `${t.id}|${t.author}|${t.date ?? ''}`;
}

function collectAllRevisionTriples(state: EditorState): RevisionTriple[] {
  const seen = new Set<string>();
  const triples: RevisionTriple[] = [];
  const add = (id: unknown, author: unknown, date: unknown): void => {
    if (typeof id !== 'number') return;
    const t: RevisionTriple = {
      id,
      author: typeof author === 'string' ? author : '',
      date: typeof date === 'string' ? date : ((date ?? undefined) as string | null | undefined),
    };
    const key = tripleKey(t);
    if (seen.has(key)) return;
    seen.add(key);
    triples.push(t);
  };
  const insertionType = state.schema.marks.insertion;
  const deletionType = state.schema.marks.deletion;
  state.doc.descendants((node) => {
    // Paragraph-mark and paragraph-property revisions.
    if (node.type.name === 'paragraph') {
      const ins = node.attrs.pPrIns as {
        revisionId: number;
        author: string;
        date: string | null;
      } | null;
      if (ins) add(ins.revisionId, ins.author, ins.date);
      const del = node.attrs.pPrDel as {
        revisionId: number;
        author: string;
        date: string | null;
      } | null;
      if (del) add(del.revisionId, del.author, del.date);
      const pPrChange = node.attrs.pPrChange as Array<{
        info: { id: number; author: string; date?: string };
      }> | null;
      if (Array.isArray(pPrChange))
        for (const e of pPrChange) add(e?.info?.id, e?.info?.author, e?.info?.date);
      const paraRPrChange = node.attrs.paraRPrChange as Array<{
        info: { id: number; author: string; date?: string };
      }> | null;
      if (Array.isArray(paraRPrChange))
        for (const e of paraRPrChange) add(e?.info?.id, e?.info?.author, e?.info?.date);
      const sectPrChange = (
        node.attrs._sectionProperties as {
          sectPrChange?: { info: { id: number; author: string; date?: string } };
        } | null
      )?.sectPrChange;
      if (sectPrChange) add(sectPrChange.info.id, sectPrChange.info.author, sectPrChange.info.date);
    }
    // Table row revisions.
    if (node.type.name === 'tableRow') {
      const trIns = node.attrs.trIns as {
        revisionId: number;
        author: string;
        date: string | null;
      } | null;
      if (trIns) add(trIns.revisionId, trIns.author, trIns.date);
      const trDel = node.attrs.trDel as {
        revisionId: number;
        author: string;
        date: string | null;
      } | null;
      if (trDel) add(trDel.revisionId, trDel.author, trDel.date);
      const trPrChange = node.attrs.trPrChange as Array<{
        info: { id: number; author: string; date?: string };
      }> | null;
      if (Array.isArray(trPrChange))
        for (const e of trPrChange) add(e?.info?.id, e?.info?.author, e?.info?.date);
      // Table row exceptions (`tblPrExChange`, per-row) — never on the table.
      const tblPrExChange = node.attrs.tblPrExChange as Array<{
        info: { id: number; author: string; date?: string };
      }> | null;
      if (Array.isArray(tblPrExChange))
        for (const e of tblPrExChange) add(e?.info?.id, e?.info?.author, e?.info?.date);
    }
    // Table grid change (`tblGridChange`, id only — no author/date).
    if (node.type.name === 'table') {
      const tblGridChange = node.attrs.tblGridChange as { revisionId: number } | null;
      if (tblGridChange && typeof tblGridChange.revisionId === 'number') {
        add(tblGridChange.revisionId, '', undefined);
      }
    }
    // Table cell revisions.
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      const m = node.attrs.cellMarker as {
        info: { revisionId: number; author: string; date: string | null };
      } | null;
      if (m?.info) add(m.info.revisionId, m.info.author, m.info.date);
      const tcPrChange = node.attrs.tcPrChange as Array<{
        info: { id: number; author: string; date?: string };
      }> | null;
      if (Array.isArray(tcPrChange))
        for (const e of tcPrChange) add(e?.info?.id, e?.info?.author, e?.info?.date);
    }
    // Table-level revisions.
    if (node.type.name === 'table') {
      const tblPrChange = node.attrs.tblPrChange as Array<{
        info: { id: number; author: string; date?: string };
      }> | null;
      if (Array.isArray(tblPrChange))
        for (const e of tblPrChange) add(e?.info?.id, e?.info?.author, e?.info?.date);
    }
    // Inline insertion/deletion marks (text and inline atoms like images).
    if (node.isInline) {
      for (const mark of node.marks) {
        if (
          (insertionType && mark.type === insertionType) ||
          (deletionType && mark.type === deletionType)
        ) {
          add(mark.attrs.revisionId, mark.attrs.author, mark.attrs.date);
        }
      }
    }
  });
  return triples;
}

/**
 * Walk the document and collect every distinct `revisionId` carried by
 * any tracked-change site: inline insertion/deletion marks, paragraph-
 * mark `pPrIns`/`pPrDel`, paragraph `pPrChange` / `paraRPrChange` /
 * `sectPrChange` entries, table row `trIns`/`trDel`, row `trPrChange` /
 * `tblPrExChange`, cell `cellMarker`/`tcPrChange`, table `tblPrChange` /
 * `tblGridChange`. The ids are
 * returned in document order; bare-id is sufficient for the resolver
 * since it walks every matching site for each id.
 */
function collectAllRevisionIds(state: EditorState): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const t of collectAllRevisionTriples(state)) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      ids.push(t.id);
    }
  }
  return ids;
}

/**
 * Accept every tracked change in the document — inline marks plus
 * structural revisions (paragraph-mark, paragraph/section property
 * changes, row, cell, table revisions).
 *
 * Dispatches one transaction per distinct `revisionId` so each revision
 * remains individually undoable. The acceptance order follows document
 * order; later transactions read fresh state and skip ids whose sites
 * were already removed.
 *
 * Returns the count of distinct `(id, author, date)` triples resolved
 * (per `tracked-changes-review/spec.md` MODIFIED requirement) — a row
 * insertion (`trIns` + per-cell markers under one triple) counts as one,
 * not N sites.
 *
 * @example
 * ```ts
 * import { acceptAllChanges } from '@xcrong/docx-editor-core/prosemirror/commands';
 * const resolved = acceptAllChanges()(view.state, view.dispatch);
 * ```
 */
export function acceptAllChanges(): (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => number {
  return (state, dispatch) => {
    const triples = collectAllRevisionTriples(state);
    if (triples.length === 0) return 0;
    if (!dispatch) return triples.length;
    dispatchIdsInOrder(state, dispatch, collectAllRevisionIds(state), 'accept');
    return triples.length;
  };
}

/**
 * Reject all tracked changes in the document — inverse of `acceptAllChanges`.
 * Returns the count of distinct `(id, author, date)` triples resolved.
 */
export function rejectAllChanges(): (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => number {
  return (state, dispatch) => {
    const triples = collectAllRevisionTriples(state);
    if (triples.length === 0) return 0;
    if (!dispatch) return triples.length;
    dispatchIdsInOrder(state, dispatch, collectAllRevisionIds(state), 'reject');
    return triples.length;
  };
}

/**
 * Dispatch each by-id resolution sequentially against the LATEST state
 * after the previous resolution applied. Each call produces its own
 * transaction (one undo step per revision id), matching Word's UX where
 * each accept is individually undoable.
 */
function dispatchIdsInOrder(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  ids: number[],
  mode: 'accept' | 'reject'
): void {
  let lastState: EditorState = state;
  const capturingDispatch = (tr: Transaction) => {
    dispatch(tr);
    lastState = lastState.apply(tr);
  };
  for (const id of ids) {
    resolveById(id, mode)(lastState, capturingDispatch);
  }
}

/**
 * Resolve every tracked revision whose primary site lies within
 * `[from, to]` (PM document positions) — inline marks plus structural
 * revisions (paragraph-mark, property changes, row/cell/table). Dispatches
 * one transaction per distinct `revisionId` (same granularity as
 * {@link acceptAllChanges}); later transactions read fresh state.
 *
 * Returns the count of distinct `(id, author, date)` triples resolved.
 * An entry counts when its `from` position falls inside the range; the
 * sidebar's coalesced ids (`coalescedRevisionIds`, `insertionRevisionId`)
 * resolve with their card.
 */
function resolveInRange(
  from: number,
  to: number,
  mode: 'accept' | 'reject'
): (state: EditorState, dispatch?: (tr: Transaction) => void) => number {
  return (state, dispatch) => {
    const { entries } = extractTrackedChanges(state);
    const ids: number[] = [];
    const seenIds = new Set<number>();
    const pushId = (id: unknown): void => {
      if (typeof id === 'number' && !seenIds.has(id)) {
        seenIds.add(id);
        ids.push(id);
      }
    };
    for (const e of entries) {
      if (e.from < from || e.from > to) continue;
      pushId(e.revisionId);
      if (e.type === 'replacement' && e.insertionRevisionId != null) {
        pushId(e.insertionRevisionId);
      }
      for (const id of e.coalescedRevisionIds ?? []) pushId(id);
    }
    if (ids.length === 0) return 0;
    // Count triples (not sites): restrict the document triple list to the
    // resolved ids so a coalesced burst counts once per (author, date).
    const idSet = new Set(ids);
    const tripleCount = collectAllRevisionTriples(state).filter((t) => idSet.has(t.id)).length;
    if (!dispatch) return tripleCount;
    dispatchIdsInOrder(state, dispatch, ids, mode);
    return tripleCount;
  };
}

/**
 * Accept every tracked revision whose primary site lies within
 * `[from, to]`. See {@link resolveInRange} for range semantics.
 * Returns the count of distinct `(id, author, date)` triples resolved.
 */
export function acceptChangesInRange(
  from: number,
  to: number
): (state: EditorState, dispatch?: (tr: Transaction) => void) => number {
  return resolveInRange(from, to, 'accept');
}

/**
 * Reject every tracked revision whose primary site lies within
 * `[from, to]`. Inverse of {@link acceptChangesInRange}.
 * Returns the count of distinct `(id, author, date)` triples resolved.
 */
export function rejectChangesInRange(
  from: number,
  to: number
): (state: EditorState, dispatch?: (tr: Transaction) => void) => number {
  return resolveInRange(from, to, 'reject');
}

interface ChangeRange {
  from: number;
  to: number;
  /** Entry type from `extractTrackedChanges` (insertion/deletion/replacement/structural…). */
  type: string;
}

/**
 * Find the next tracked-change range after `startPos`. Wraps to the
 * document start when no later change is found. Useful for "next change"
 * / "previous change" toolbar buttons.
 *
 * Walks {@link extractTrackedChanges} entries (document order), so inline
 * AND structural revisions (pPrIns / pPrDel / row / cell / table) are all
 * navigable — matching what Accept All resolves.
 */
export function findNextChange(state: EditorState, startPos: number): ChangeRange | null {
  const { entries } = extractTrackedChanges(state);
  for (const e of entries) {
    if (e.to > startPos) {
      return { from: Math.max(e.from, startPos), to: e.to, type: e.type };
    }
  }

  // Wrap around (only once)
  if (startPos > 0 && entries.length > 0) {
    const first = entries[0];
    return { from: first.from, to: first.to, type: first.type };
  }

  return null;
}

// ============================================================================
// REVISION-ID-ADDRESSABLE COMMANDS (structural revisions on node attrs)
// ============================================================================

import {
  clearParagraphMarkPropertyChangeEntry,
  clearParagraphMarkRevision,
  clearParagraphPropertyChangeEntry,
  clearSectionPropertyChange,
  findInlineMarkSites,
  findParagraphMarkPropertyChangeSites,
  findParagraphMarkSites,
  findParagraphPropertyChangeSites,
  findSectionPropertyChangeSites,
  findTableCellMarkerSites,
  findTableCellPropertyChangeSites,
  findTableGridChangeSites,
  findTablePropertyChangeSites,
  findTableRowExceptionsChangeSites,
  findTableRowPropertyChangeSites,
  findTableRowSites,
  joinParagraphWithNext,
} from './structuralSites';
import {
  resolveTableCellMarkers,
  resolveTablePropertyChanges,
  resolveTableRows,
} from './tableRevisionResolve';

/**
 * Resolve every site sharing a revision id in one PM transaction. Bypass
 * the suggesting-mode keymap (we're applying, not authoring).
 *
 * Per-marker semantics (see openspec/changes/tracked-structural-changes):
 *   accept pPrIns → clear marker, keep split.
 *   reject pPrIns → join with following paragraph; result inherits second's pPr.
 *   accept pPrDel → join with following paragraph; result inherits second's pPr.
 *   reject pPrDel → clear marker, keep split.
 *   accept insertion mark → keep text, drop mark.
 *   reject insertion mark → remove text and mark.
 *   accept deletion mark → remove text and mark.
 *   reject deletion mark → keep text, drop mark.
 *   accept pPrChange / paraRPrChange / sectPrChange → clear entry, current wins.
 *   reject pPrChange / paraRPrChange / sectPrChange → restore prior, clear entry.
 *   accept trIns → clear marker, keep row.
 *   reject trIns → delete the row (whole table when it is the only row).
 *   accept trDel → delete the row; reject trDel → clear marker.
 *   accept cellMarker ins → clear; reject ins → delete the cell (grid adjusts).
 *   accept cellMarker del → delete the cell (grid adjusts); reject del → clear.
 *   accept merge → apply the vertical merge / collapse the horizontal pair.
 *   reject merge → clear the group.
 *   accept trPrChange / tcPrChange / tblPrChange / tblPrExChange / tblGridChange
 *     → clear the entry; reject → restore `prior`, clear the entry.
 * Resolution runs inner-to-outer (cell → row → table) in one transaction.
 */

function resolveById(revisionId: number, mode: 'accept' | 'reject'): Command {
  return (state, dispatch) => {
    const paragraphMarkSites = findParagraphMarkSites(state, revisionId);
    const inlineSites = findInlineMarkSites(state, revisionId);
    const propChangeSites = findParagraphPropertyChangeSites(state, revisionId);
    const markPropChangeSites = findParagraphMarkPropertyChangeSites(state, revisionId);
    const sectPropChangeSites = findSectionPropertyChangeSites(state, revisionId);
    const tableRowSites = findTableRowSites(state, revisionId);
    const tableCellSites = findTableCellMarkerSites(state, revisionId);
    const tableCellPropSites = findTableCellPropertyChangeSites(state, revisionId);
    const tableRowPropSites = findTableRowPropertyChangeSites(state, revisionId);
    const tableRowExPropSites = findTableRowExceptionsChangeSites(state, revisionId);
    const tablePropSites = findTablePropertyChangeSites(state, revisionId);
    const tableGridSites = findTableGridChangeSites(state, revisionId);
    if (
      paragraphMarkSites.length === 0 &&
      inlineSites.length === 0 &&
      propChangeSites.length === 0 &&
      markPropChangeSites.length === 0 &&
      sectPropChangeSites.length === 0 &&
      tableRowSites.length === 0 &&
      tableCellSites.length === 0 &&
      tableCellPropSites.length === 0 &&
      tableRowPropSites.length === 0 &&
      tableRowExPropSites.length === 0 &&
      tablePropSites.length === 0 &&
      tableGridSites.length === 0
    ) {
      return false;
    }

    if (!dispatch) return true;

    // Cross-author id collision (legal per ECMA-376 — `w:id` is not
    // author-scoped): the by-id resolver clears every site sharing the
    // numeric id. Log so the sidebar's triple-grouped card can explain why
    // a sibling author's card cleared with it.
    const collidingAuthors = new Set<string>();
    for (const t of collectAllRevisionTriples(state)) {
      if (t.id === revisionId) collidingAuthors.add(`${t.author}|${t.date ?? ''}`);
    }
    if (collidingAuthors.size > 1) {
      console.warn(
        `[tracked-changes] revisionId ${revisionId} is shared by ${collidingAuthors.size} ` +
          `(author, date) triples; resolving all of them in one transaction.`
      );
    }

    const tr = state.tr;
    tr.setMeta(SUGGESTION_BYPASS_META, true);

    // Process inline marks FIRST (positions still valid in original doc), in
    // reverse order so deletions don't shift earlier positions.
    const insertionType = state.schema.marks.insertion;
    const deletionType = state.schema.marks.deletion;
    const sortedInline = [...inlineSites].sort((a, b) => b.from - a.from);
    for (const site of sortedInline) {
      const isInsertion = site.markName === 'insertion';
      const removeText = (mode === 'accept' && !isInsertion) || (mode === 'reject' && isInsertion);
      if (removeText) {
        tr.delete(site.from, site.to);
      } else {
        const markType = isInsertion ? insertionType : deletionType;
        if (markType) tr.removeMark(site.from, site.to, markType);
      }
    }

    // Then process paragraph-mark revisions. Process in reverse position order
    // so earlier-positioned joins don't shift later sites. Track resolved
    // positions through tr.mapping.
    const sortedPara = [...paragraphMarkSites].sort((a, b) => b.pos - a.pos);
    for (const site of sortedPara) {
      const mappedPos = tr.mapping.map(site.pos);
      const liveNode = tr.doc.nodeAt(mappedPos);
      if (!liveNode || liveNode.type.name !== 'paragraph') continue;
      // Re-confirm the revision is still on the live node (inline-mark
      // deletions above may have removed text but won't have removed the
      // paragraph attrs).
      const stillHasIns =
        site.kind === 'pPrIns' &&
        (liveNode.attrs.pPrIns as { revisionId: number } | null)?.revisionId === revisionId;
      const stillHasDel =
        site.kind === 'pPrDel' &&
        (liveNode.attrs.pPrDel as { revisionId: number } | null)?.revisionId === revisionId;
      if (!stillHasIns && !stillHasDel) continue;

      const shouldJoin =
        (mode === 'reject' && site.kind === 'pPrIns') ||
        (mode === 'accept' && site.kind === 'pPrDel');

      if (shouldJoin) {
        // No following paragraph → just clear the marker (last-paragraph /
        // single-paragraph edge case: there is no next sibling to join with).
        // NOTE (T27-03): the tasks text phrases the `pPrDel`-accept edge as
        // "first paragraph", but accept joins with the FOLLOWING sibling, so
        // a first paragraph still has a join target; the degenerate case is
        // a paragraph with no following sibling. The existing e2e
        // ("Accept pPrDel joins the paragraphs") pins join-on-first-paragraph.
        const liveParaEnd = mappedPos + liveNode.nodeSize;
        const after = tr.doc.nodeAt(liveParaEnd);
        if (!after || after.type.name !== 'paragraph') {
          console.warn(
            `[tracked-changes] ${mode === 'reject' ? 'reject' : 'accept'} ${site.kind} ` +
              `revisionId ${revisionId}: no following paragraph to join with; cleared the marker.`
          );
          clearParagraphMarkRevision(tr, mappedPos, site.kind);
        } else {
          // Cross-revision dependency (tracked-structural-paragraphs
          // spec): rejecting a `pPrIns` joins the host paragraph away, so
          // first reject its `pPrChange` entries (restore prior) — otherwise
          // the join would silently drop another revision.
          if (mode === 'reject' && site.kind === 'pPrIns') {
            const hostChanges = liveNode.attrs.pPrChange as Array<{
              info: { id: number };
              previousFormatting?: unknown;
              currentFormatting?: unknown;
            }> | null;
            if (Array.isArray(hostChanges) && hostChanges.length > 0) {
              let restoredAttrs: Record<string, unknown> = { ...liveNode.attrs };
              for (const entry of hostChanges) {
                restoredAttrs = restoreParagraphPriorProperties(
                  restoredAttrs,
                  (entry.previousFormatting ??
                    {}) as import('../../types/document').ParagraphFormatting,
                  entry.currentFormatting as
                    | import('../../types/document').ParagraphFormatting
                    | undefined
                );
              }
              restoredAttrs.pPrChange = null;
              tr.setNodeMarkup(mappedPos, undefined, restoredAttrs);
            }
          }
          // Clear our marker first, then perform the join inheriting the
          // second paragraph's pPr.
          clearParagraphMarkRevision(tr, mappedPos, site.kind);
          joinParagraphWithNext(tr, mappedPos, { inheritFromSecond: true });
        }
      } else {
        clearParagraphMarkRevision(tr, mappedPos, site.kind);
      }
    }

    // Finally, paragraph-property changes. Accept clears the matching entry
    // (current props win). Reject restores the entry's `prior` fields onto
    // the paragraph's attrs and clears the entry.
    const sortedPropChanges = [...propChangeSites].sort((a, b) => b.pos - a.pos);
    for (const site of sortedPropChanges) {
      const mappedPos = tr.mapping.map(site.pos);
      const liveNode = tr.doc.nodeAt(mappedPos);
      if (!liveNode || liveNode.type.name !== 'paragraph') continue;
      const liveChanges = liveNode.attrs.pPrChange as Array<{ info: { id: number } }> | null;
      if (!Array.isArray(liveChanges)) continue;
      const liveIndex = liveChanges.findIndex((e) => e.info.id === revisionId);
      if (liveIndex < 0) continue;

      if (mode === 'reject' && site.prior) {
        // Restore prior fields BEFORE clearing the entry so we don't lose
        // the snapshot in the intermediate state. `current` lets the restore
        // detect (and clear) numbering the change introduced.
        const restored = restoreParagraphPriorProperties(liveNode.attrs, site.prior, site.current);
        const nextChanges = liveChanges.slice();
        nextChanges.splice(liveIndex, 1);
        tr.setNodeMarkup(mappedPos, undefined, {
          ...restored,
          pPrChange: nextChanges.length > 0 ? nextChanges : null,
        });
      } else {
        clearParagraphPropertyChangeEntry(tr, mappedPos, liveIndex);
      }
    }

    // Paragraph-mark run-property changes (`CT_ParaRPrChange`). Accept clears
    // the matching entry (current pilcrow formatting wins). Reject restores
    // the entry's `prior` onto the paragraph's default run formatting
    // (`pPr/rPr`) and clears the entry.
    const sortedMarkPropChanges = [...markPropChangeSites].sort((a, b) => b.pos - a.pos);
    for (const site of sortedMarkPropChanges) {
      const mappedPos = tr.mapping.map(site.pos);
      const liveNode = tr.doc.nodeAt(mappedPos);
      if (!liveNode || liveNode.type.name !== 'paragraph') continue;
      const liveChanges = liveNode.attrs.paraRPrChange as Array<{ info: { id: number } }> | null;
      if (!Array.isArray(liveChanges)) continue;
      const liveIndex = liveChanges.findIndex((e) => e.info.id === revisionId);
      if (liveIndex < 0) continue;

      if (mode === 'reject' && site.prior) {
        const current = (liveNode.attrs.defaultTextFormatting ??
          {}) as import('../../types/document').TextFormatting;
        const restored = restoreRunPriorProperties(current, site.prior);
        const nextChanges = liveChanges.slice();
        nextChanges.splice(liveIndex, 1);
        tr.setNodeMarkup(mappedPos, undefined, {
          ...liveNode.attrs,
          defaultTextFormatting: restored,
          paraRPrChange: nextChanges.length > 0 ? nextChanges : null,
        });
      } else {
        clearParagraphMarkPropertyChangeEntry(tr, mappedPos, liveIndex);
      }
    }

    // Section-property changes (pPr-level `w:sectPrChange`). Accept clears
    // the marker (current section geometry wins). Reject restores the
    // entry's prior section properties and clears the marker. Body-level
    // `sectPrChange` lives outside the PM doc and is not addressable here.
    const sortedSectChanges = [...sectPropChangeSites].sort((a, b) => b.pos - a.pos);
    for (const site of sortedSectChanges) {
      const mappedPos = tr.mapping.map(site.pos);
      const liveNode = tr.doc.nodeAt(mappedPos);
      if (!liveNode || liveNode.type.name !== 'paragraph') continue;
      const liveSectProps = liveNode.attrs._sectionProperties as Record<string, unknown> | null;
      const liveChange = (liveSectProps as { sectPrChange?: { info: { id: number } } } | null)
        ?.sectPrChange;
      if (!liveChange || liveChange.info.id !== revisionId) continue;

      if (mode === 'reject' && site.prior) {
        const restored = restoreSectionPriorProperties(
          liveSectProps as unknown as import('../../types/document').SectionProperties,
          site.prior
        );
        tr.setNodeMarkup(mappedPos, undefined, {
          ...liveNode.attrs,
          _sectionProperties: restored,
        });
      } else {
        clearSectionPropertyChange(tr, mappedPos);
      }
    }

    // Table revisions (inner-to-outer: cells → rows → table-level).
    // See `tableRevisionResolve.ts` for the per-marker semantics.
    resolveTableCellMarkers(tr, state, revisionId, mode);
    resolveTableRows(tr, state, revisionId, mode);
    resolveTablePropertyChanges(tr, state, revisionId, mode);

    if (tr.steps.length === 0) return false;
    dispatch(tr);
    return true;
  };
}

/**
 * Accept every site of a tracked revision in one PM transaction. Walks
 * the doc for all sites carrying `revisionId` — inline insertion/
 * deletion marks, paragraph-mark `pPrIns` / `pPrDel`, paragraph
 * property changes (`pPrChange`), paragraph-mark property changes
 * (`paraRPrChange`), pPr-level section property changes (`sectPrChange`),
 * table row / cell / table revisions — and applies the accept semantics
 * each requires.
 *
 * This is the right command for any coalesced revision (Enter chains,
 * replace pairs, multi-paragraph runs) because one editing session can
 * scatter sites across the doc; the range-based {@link acceptChange}
 * only clears sites within its `(from, to)`.
 *
 * Rejecting a `pPrIns` whose host paragraph also carries `pPrChange`
 * entries first rejects those entries (the join would destroy the host).
 * A `pPrIns` reject / `pPrDel` accept with no following paragraph clears
 * the marker (last-paragraph edge case) and logs a diagnostic.
 *
 * Returns `false` (no-op) if the id is not present.
 *
 * @example
 * ```ts
 * import { acceptChangeById } from '@xcrong/docx-editor-core/prosemirror/commands';
 * acceptChangeById(revisionId)(view.state, view.dispatch);
 * ```
 */
export function acceptChangeById(revisionId: number): Command {
  return resolveById(revisionId, 'accept');
}

/**
 * Reject every site of a tracked revision in one PM transaction.
 * Inverse of {@link acceptChangeById} — inserts are removed, deletions
 * keep their text, paragraph-mark insertions join paragraphs back,
 * paragraph-mark deletions stay split, paragraph / paragraph-mark /
 * pPr-level section property changes restore prior values, and tracked
 * row insertions are removed.
 */
export function rejectChangeById(revisionId: number): Command {
  return resolveById(revisionId, 'reject');
}

/**
 * Find the previous tracked-change range before `startPos`. Wraps to the
 * document end when no earlier change is found. Counterpart to
 * {@link findNextChange} — covers inline and structural revisions alike.
 */
export function findPreviousChange(state: EditorState, startPos: number): ChangeRange | null {
  const { entries } = extractTrackedChanges(state);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.from < startPos) {
      return { from: e.from, to: e.to, type: e.type };
    }
  }

  // Wrap around (only once — guard prevents infinite recursion)
  if (startPos < state.doc.content.size && entries.length > 0) {
    const last = entries[entries.length - 1];
    return { from: last.from, to: last.to, type: last.type };
  }

  return null;
}
