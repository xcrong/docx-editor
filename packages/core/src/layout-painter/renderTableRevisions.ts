/**
 * Tracked-revision cues for painted tables.
 *
 * Kept out of `renderTable.ts` so that file stays under its eslint
 * `max-lines` cap. The helpers mirror the hidden-PM `toDOM` convention in
 * `TableExtension/specs.ts` (first entry's triple → `data-revision-*` +
 * `ep-revision-prop-change`), so the sidebar anchors table `*Change` cards
 * the same way it anchors row/cell ins/del cards.
 *
 * Cross-page correctness falls out of the existing fragment geometry
 * (`layout-engine/tableRowBreak.ts` for the split, `renderTableBorders.ts`
 * for the cut edge): every fragment paints its own window of rows via
 * `renderTableRow`, and these cues read the row/cell objects — never
 * fragment offsets — so a marked row paints on exactly the fragments that
 * own it. No new split logic lives here.
 */

import type { RevisionInfo } from '../types/content/trackedChange';
import type { TableBlock } from '../layout-engine/types';

export interface PropertyChangeTriple {
  info: { id: number; author?: string; date?: string };
}

/**
 * Tracked-change classes + data attrs on a painted row/cell/table. The
 * sidebar reads `data-revision-id` / `data-revision-author` to anchor
 * cards; the CSS in `prosemirror/editor.css` keys on the two classes.
 */
export function applyRevisionAttrs(
  el: HTMLElement,
  scope: 'row' | 'cell' | 'table',
  kind: 'ins' | 'del' | 'merge',
  info: RevisionInfo
): void {
  el.classList.add(`ep-revision-${scope}`, `ep-revision-${kind}`);
  el.dataset.revisionId = String(info.revisionId);
  el.dataset.revisionAuthor = info.author;
  if (info.date) el.dataset.revisionDate = info.date;
}

/**
 * Normalized grid-change triple. `tblGridChange` (`CT_TblGridChange`) is
 * id-only on the wire — author/date are empty strings per
 * `tracked-structural-tables/spec.md` (the painter contract reuses the
 * `data-revision-*` names; no new dataset names).
 */
function tblGridChangeTriple(grid: { revisionId: number; prior: number[] }): PropertyChangeTriple {
  void grid.prior;
  return { info: { id: grid.revisionId, author: '', date: '' } };
}

/**
 * Paint a property-change cue on a row/cell/table element: the neutral
 * change bar plus the first entry's `data-revision-*` triple. No-op when
 * the entry list is empty. Accepts one array or two (row `trPrChange` +
 * `tblPrExChange`) — the first non-empty entry wins, matching the toDOM
 * "first entry anchors" rule.
 */
function applyTablePropChangeAttrs(
  el: HTMLElement,
  primary: PropertyChangeTriple[] | null | undefined,
  secondary?: PropertyChangeTriple[] | null | undefined
): void {
  const list = Array.isArray(primary) && primary.length > 0 ? primary : secondary;
  if (!Array.isArray(list) || list.length === 0) return;
  const first = list[0]!;
  if (!first?.info || typeof first.info.id !== 'number') return;
  el.classList.add('ep-revision-prop-change');
  el.dataset.revisionId = String(first.info.id);
  el.dataset.revisionAuthor = first.info.author ?? '';
  if (first.info.date) el.dataset.revisionDate = first.info.date;
}

interface RevisionCueRow {
  trackedIns?: RevisionInfo;
  trackedDel?: RevisionInfo;
  trPrChange?: PropertyChangeTriple[] | null;
  tblPrExChange?: PropertyChangeTriple[] | null;
}

/**
 * Tracked-row cue. `del` wins when both flags are present (rare: "ins of a
 * row that was later marked deleted" — the deletion is the more recent
 * action). Property-only rows get the neutral bar instead.
 */
export function paintRowRevisionCue(
  rowEl: HTMLElement,
  row: RevisionCueRow,
  suppressRowRevisionVisual?: boolean
): void {
  if (suppressRowRevisionVisual) return;
  if (row.trackedDel) {
    applyRevisionAttrs(rowEl, 'row', 'del', row.trackedDel);
  } else if (row.trackedIns) {
    applyRevisionAttrs(rowEl, 'row', 'ins', row.trackedIns);
  } else {
    applyTablePropChangeAttrs(rowEl, row.trPrChange, row.tblPrExChange);
  }
}

interface RevisionCueCell {
  trackedMarker?: { kind: 'ins' | 'del' | 'merge'; info: RevisionInfo } | null;
  tcPrChange?: PropertyChangeTriple[] | null;
}

/**
 * Tracked-cell cue. When the cell's marker shares the parent row's revision
 * id the row visual already covers it — suppress the per-cell border /
 * background to avoid stacking 2-3 green visuals on the same cell.
 * Property-only cells (`<w:tcPrChange>`) get the neutral bar instead.
 */
export function paintCellRevisionCue(
  cellEl: HTMLElement,
  cell: RevisionCueCell,
  parentRowRevisionId?: number
): void {
  if (cell.trackedMarker && cell.trackedMarker.info.revisionId !== parentRowRevisionId) {
    applyRevisionAttrs(cellEl, 'cell', cell.trackedMarker.kind, cell.trackedMarker.info);
  } else {
    applyTablePropChangeAttrs(cellEl, cell.tcPrChange);
  }
}

/**
 * Whole-table tracked insertion / deletion (every row carries a tracked
 * marker from the SAME `(author, date)` burst — foreign editors mint a fresh
 * revisionId per row, so the tuple is the fingerprint) paints ONE tall bar
 * on the table; otherwise a table/grid property change paints the neutral
 * bar. Returns whether the whole-table bar painted (row painters suppress
 * their per-row bar in that case).
 *
 * `extendOverflowX` lets the `::before` margin bar extend past the table's
 * left edge into the page padding (fragment path, which clips vertically).
 */
export function paintTableRevisionCue(
  tableEl: HTMLElement,
  block: TableBlock,
  extendOverflowX = false
): boolean {
  const firstRow = block.rows[0];
  const sharedTrIns = firstRow?.trackedIns;
  const sharedTrDel = firstRow?.trackedDel;
  const sameBurst = (a: RevisionInfo | undefined, b: RevisionInfo | undefined): boolean =>
    !!a && !!b && (a.author ?? '') === (b.author ?? '') && (a.date ?? null) === (b.date ?? null);
  const wholeTableTracked =
    block.rows.length > 0 &&
    block.rows.every((r) => {
      if (sharedTrIns) return sameBurst(r.trackedIns, sharedTrIns);
      if (sharedTrDel) return sameBurst(r.trackedDel, sharedTrDel);
      return false;
    });
  if (!wholeTableTracked) {
    applyTablePropChangeAttrs(
      tableEl,
      block.tblPrChange as PropertyChangeTriple[] | null,
      block.tblGridChange ? [tblGridChangeTriple(block.tblGridChange)] : null
    );
    return false;
  }
  const tableRev = (sharedTrIns ?? sharedTrDel) as RevisionInfo;
  applyRevisionAttrs(tableEl, 'table', sharedTrIns ? 'ins' : 'del', tableRev);
  if (extendOverflowX) {
    tableEl.style.overflowX = 'visible';
    tableEl.style.overflowY = 'hidden';
  }
  return true;
}
