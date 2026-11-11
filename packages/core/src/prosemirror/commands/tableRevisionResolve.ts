/**
 * Table-revision accept/reject — structural markers and property changes.
 *
 * Split out of `comments.ts` (`resolveById`) to keep that file under the repo
 * `max-lines` cap. All three entry points share one contract: finders run
 * against the ORIGINAL `state`, every mutation applies to the shared `tr`
 * through `tr.mapping` with a live-node re-check, so cell → row → table
 * resolution stays in ONE PM transaction (one undo step).
 *
 * Per-marker semantics (see `tracked-structural-tables/spec.md`):
 * - `trIns` accept → clear; reject → delete the row.
 * - `trDel` accept → delete the row; reject → clear.
 * - `cellMarker ins` accept → clear; reject → delete the cell.
 * - `cellMarker del` accept → delete the cell; reject → clear.
 * - `cellMarker merge` accept → apply the vertical merge (top cell spans the
 *   group, covered cells removed); reject → clear the group.
 * - horizontal merge (`ins` + `del` sharing one id in one row) accept →
 *   collapse into the surviving cell (colspan grows, absorbed content
 *   appended); reject → clear both.
 * - `trPrChange` / `tcPrChange` / `tblPrChange` / `tblPrExChange` accept →
 *   clear the entry; reject → restore `prior` and clear.
 * - `tblGridChange` accept → clear; reject → restore the prior grid.
 *
 * Resolution order is inner-to-outer: cell-level → row-level → table-level
 * (per `tracked-structural-tables/spec.md`).
 *
 * @packageDocumentation
 */

import type { EditorState, Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { Fragment } from 'prosemirror-model';
import {
  clearTablePropertyChangeEntry,
  findTableCellMarkerSites,
  findTableCellPropertyChangeSites,
  findTableGridChangeSites,
  findTablePropertyChangeSites,
  findTableRowExceptionsChangeSites,
  findTableRowPropertyChangeSites,
  findTableRowSites,
} from './structuralSites';
import {
  restoreTableCellPriorProperties,
  restoreTableExceptionsPrior,
  restoreTablePriorProperties,
  restoreTableRowPriorProperties,
} from '../utils/restorePriorProperties';
import type {
  TableCellFormatting,
  TableFormatting,
  TableRowFormatting,
} from '../../types/document';

type Mode = 'accept' | 'reject';

function isCellNodeName(name: string): boolean {
  return name === 'tableCell' || name === 'tableHeader';
}

/**
 * Delete the row at `rowPos`, or the whole table when it is the only row.
 * A table left with zero rows is schema-invalid; when the table is the only
 * child of its parent an empty paragraph replaces it so the parent `+`
 * content constraint holds.
 */
function removeRowOrTable(tr: Transaction, rowPos: number, rowNode: PMNode): void {
  const $row = tr.doc.resolve(rowPos + 1);
  const parentTable = $row.node($row.depth - 1);
  const parentTableStart = $row.before($row.depth - 1);
  if (parentTable?.type.name === 'table' && parentTable.childCount > 1) {
    tr.delete(rowPos, rowPos + rowNode.nodeSize);
    return;
  }
  if (parentTable?.type.name === 'table') {
    const $table = tr.doc.resolve(parentTableStart);
    const isOnlyChild = $table.parent.childCount === 1;
    if (isOnlyChild) {
      const paraType = tr.doc.type.schema.nodes.paragraph;
      tr.replaceWith(parentTableStart, parentTableStart + parentTable.nodeSize, paraType.create());
    } else {
      tr.delete(parentTableStart, parentTableStart + parentTable.nodeSize);
    }
  }
  // Defensive: parent isn't a table (shouldn't happen) — leave the row.
}

/** Grid column index of the cell at `cellPos` inside `rowNode` (colspan walk). */
function cellGridIndex(rowNode: PMNode, rowStart: number, cellPos: number): number | null {
  let p = rowStart + 1;
  let col = 0;
  let found: number | null = null;
  rowNode.forEach((cell) => {
    if (p === cellPos) found = col;
    p += cell.nodeSize;
    col += (cell.attrs.colspan as number) || 1;
  });
  return found;
}

/** Deleted-cell record for the post-pass grid reconciliation. */
interface DeletedCell {
  tableStart: number;
  rowStart: number;
  colIndex: number;
}

/**
 * Delete the cell at `cellPos`. When it is the row's last cell the row goes
 * with it (via {@link removeRowOrTable} — a zero-cell row is schema-invalid).
 * Records the cell's grid column for {@link reconcileDeletedColumns}.
 */
function deleteCellAt(
  tr: Transaction,
  cellPos: number,
  cellNode: PMNode,
  deleted: DeletedCell[]
): void {
  const $cell = tr.doc.resolve(cellPos);
  // `cellPos` sits inside the row's content, so the row is the deepest
  // node (`depth`) and the table one level up (`depth - 1`).
  if ($cell.depth < 1) return;
  const rowNode = $cell.node($cell.depth);
  const rowStart = $cell.before($cell.depth);
  const tableStart = $cell.before($cell.depth - 1);
  if (rowNode?.type.name !== 'tableRow') return;
  const colIndex = cellGridIndex(rowNode, rowStart, cellPos);
  if (rowNode.childCount > 1) {
    if (colIndex != null) deleted.push({ tableStart, rowStart, colIndex });
    tr.delete(cellPos, cellPos + cellNode.nodeSize);
  } else {
    removeRowOrTable(tr, rowStart, rowNode);
  }
}

/**
 * Grid adjust after structural cell deletions. When every row of a
 * rectangular table (uniform cell count, no colspans) lost cells covering
 * the same grid column(s) — the tracked-`deleteColumn` shape — the matching
 * `columnWidths` entries are removed. Anything irregular (spans, ragged
 * rows, partial merges) leaves the grid alone rather than risk corruption.
 */
function reconcileDeletedColumns(tr: Transaction, deleted: DeletedCell[]): void {
  if (deleted.length === 0) return;
  const byTable = new Map<number, DeletedCell[]>();
  for (const d of deleted) {
    const list = byTable.get(d.tableStart) ?? [];
    list.push(d);
    byTable.set(d.tableStart, list);
  }
  for (const [tableStart, cells] of byTable) {
    const mappedTableStart = tr.mapping.map(tableStart);
    const table = tr.doc.nodeAt(mappedTableStart);
    if (!table || table.type.name !== 'table') continue;
    // Rectangular check on the LIVE table (post-deletion).
    let uniform = true;
    let cellCount = -1;
    table.forEach((row) => {
      if (row.type.name !== 'tableRow') return;
      if (cellCount < 0) cellCount = row.childCount;
      else if (row.childCount !== cellCount) uniform = false;
      row.forEach((cell) => {
        if (((cell.attrs.colspan as number) || 1) > 1) uniform = false;
      });
    });
    if (!uniform) continue;
    // Columns deleted in EVERY row of the table.
    const perRow = new Map<number, Set<number>>();
    for (const c of cells) {
      const mappedRow = tr.mapping.map(c.rowStart);
      const set = perRow.get(mappedRow) ?? new Set<number>();
      set.add(c.colIndex);
      perRow.set(mappedRow, set);
    }
    let rowTotal = 0;
    table.forEach((row) => {
      if (row.type.name === 'tableRow') rowTotal += 1;
    });
    if (perRow.size !== rowTotal) continue;
    let common: number[] | null = null;
    for (const set of perRow.values()) {
      const cols = [...set];
      common = common == null ? cols : common.filter((c) => set.has(c));
    }
    if (!common || common.length === 0) continue;
    const widths = table.attrs.columnWidths as number[] | null;
    if (!Array.isArray(widths)) continue;
    const drop = [...common].sort((a, b) => b - a);
    const next = widths.slice();
    for (const c of drop) {
      if (c >= 0 && c < next.length) next.splice(c, 1);
    }
    tr.setNodeMarkup(mappedTableStart, undefined, { ...table.attrs, columnWidths: next });
  }
}

/**
 * Resolve every `cellMarker` carrying `revisionId` — ins/del cells plus
 * vertical-merge groups and horizontal (`ins`+`del`) pairs. Runs BEFORE row
 * resolution (inner-to-outer); row removal below re-checks liveness, so a
 * cell deleted here never double-applies.
 */
export function resolveTableCellMarkers(
  tr: Transaction,
  state: EditorState,
  revisionId: number,
  mode: Mode
): void {
  const sites = findTableCellMarkerSites(state, revisionId);
  if (sites.length === 0) return;
  const deleted: DeletedCell[] = [];

  const mergeSites = sites.filter((s) => s.cellKind === 'merge');
  const plainSites = sites.filter((s) => s.cellKind !== 'merge');

  // Horizontal pairs: `ins` + `del` sharing one id in one row (Word's
  // on-disk horizontal-merge convention). Group plain sites by live row.
  const byRow = new Map<number, typeof plainSites>();
  const lone: typeof plainSites = [];
  for (const s of plainSites) {
    const mappedPos = tr.mapping.map(s.pos);
    const live = tr.doc.nodeAt(mappedPos);
    if (!live || !isCellNodeName(live.type.name)) continue;
    const m = live.attrs.cellMarker as { kind: string; info: { revisionId: number } } | null;
    if (!m || m.info.revisionId !== revisionId) continue;
    const $cell = tr.doc.resolve(mappedPos);
    // `mappedPos` sits inside the row's content: row is the deepest node.
    if ($cell.depth < 1 || $cell.node($cell.depth)?.type.name !== 'tableRow') {
      lone.push(s);
      continue;
    }
    const rowStart = $cell.before($cell.depth);
    const list = byRow.get(rowStart) ?? [];
    list.push(s);
    byRow.set(rowStart, list);
  }

  // Accept a horizontal pair: the leftmost `ins` cell survives with a grown
  // colspan and the absorbed cells' paragraphs appended; the rest are
  // removed. Reject: clear every marker in the row group.
  const handled = new Set<number>();
  const ascending = [...byRow.entries()].sort((a, b) => b[0] - a[0]);
  for (const [, group] of ascending) {
    const liveCells: Array<{ origPos: number; pos: number; node: PMNode; kind: string }> = [];
    for (const s of group) {
      const mappedPos = tr.mapping.map(s.pos);
      const live = tr.doc.nodeAt(mappedPos);
      if (!live || !isCellNodeName(live.type.name)) continue;
      const m = live.attrs.cellMarker as { kind: string; info: { revisionId: number } } | null;
      if (!m || m.info.revisionId !== revisionId) continue;
      liveCells.push({ origPos: s.pos, pos: mappedPos, node: live, kind: m.kind });
    }
    const hasIns = liveCells.some((c) => c.kind === 'ins');
    const hasDel = liveCells.some((c) => c.kind === 'del');
    if (liveCells.length < 2 || !hasIns || !hasDel) {
      lone.push(...group.filter((s) => !handled.has(s.pos)));
      continue;
    }
    for (const s of group) handled.add(s.pos);
    if (mode === 'reject') {
      for (const c of liveCells) {
        tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, cellMarker: null });
      }
      continue;
    }
    // Accept: survivor first (leftmost ins), absorbed cells removed, content
    // concatenated as trailing paragraphs of the survivor.
    liveCells.sort((a, b) => a.pos - b.pos);
    const survivorIdx = liveCells.findIndex((c) => c.kind === 'ins');
    const survivor = liveCells[survivorIdx]!;
    const absorbed = liveCells.filter((_, i) => i !== survivorIdx);
    const absorbedBlocks: PMNode[] = [];
    for (const c of absorbed) {
      c.node.forEach((block) => {
        absorbedBlocks.push(block);
      });
    }
    for (const c of [...absorbed].sort((a, b) => b.pos - a.pos)) {
      deleteCellAt(tr, c.pos, c.node, deleted);
    }
    const liveSurvivorPos = tr.mapping.map(survivor.origPos);
    const liveSurvivor = tr.doc.nodeAt(liveSurvivorPos);
    if (liveSurvivor && isCellNodeName(liveSurvivor.type.name)) {
      const grownColspan =
        ((liveSurvivor.attrs.colspan as number) || 1) +
        absorbed.reduce((sum, c) => sum + ((c.node.attrs.colspan as number) || 1), 0);
      let content = liveSurvivor.content;
      for (const block of absorbedBlocks) content = content.append(Fragment.from(block));
      const merged = liveSurvivor.type.create(
        { ...liveSurvivor.attrs, colspan: grownColspan, cellMarker: null },
        content
      );
      tr.replaceWith(liveSurvivorPos, liveSurvivorPos + liveSurvivor.nodeSize, merged);
    }
  }

  // Lone ins/del cells (column insert/delete, single-cell revisions).
  const sortedLone = [...lone].sort((a, b) => b.pos - a.pos);
  for (const site of sortedLone) {
    if (handled.has(site.pos)) continue;
    const mappedPos = tr.mapping.map(site.pos);
    const live = tr.doc.nodeAt(mappedPos);
    if (!live || !isCellNodeName(live.type.name)) continue;
    const m = live.attrs.cellMarker as {
      kind: 'ins' | 'del' | 'merge';
      info: { revisionId: number };
    } | null;
    if (!m || m.info.revisionId !== revisionId || m.kind === 'merge') continue;
    const removeCell =
      (mode === 'reject' && m.kind === 'ins') || (mode === 'accept' && m.kind === 'del');
    if (removeCell) {
      deleteCellAt(tr, mappedPos, live, deleted);
    } else {
      tr.setNodeMarkup(mappedPos, undefined, { ...live.attrs, cellMarker: null });
    }
  }

  // Vertical merge groups (`merge`/`rest` + `cont` sharing one id).
  if (mergeSites.length > 0) {
    const liveMerge: Array<{ pos: number; node: PMNode; vMerge?: string }> = [];
    for (const s of [...mergeSites].sort((a, b) => a.pos - b.pos)) {
      const mappedPos = tr.mapping.map(s.pos);
      const live = tr.doc.nodeAt(mappedPos);
      if (!live || !isCellNodeName(live.type.name)) continue;
      const m = live.attrs.cellMarker as {
        kind: string;
        info: { revisionId: number };
        vMerge?: string;
      } | null;
      if (!m || m.info.revisionId !== revisionId || m.kind !== 'merge') continue;
      liveMerge.push({ pos: mappedPos, node: live, vMerge: m.vMerge });
    }
    if (liveMerge.length > 0) {
      if (mode === 'reject') {
        for (const c of liveMerge) {
          tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, cellMarker: null });
        }
      } else if (isCleanVerticalRun(tr, liveMerge)) {
        // Accept: the top cell spans the group. Covered cells in rows that
        // keep other cells are removed (the imported-`w:vMerge` PM shape —
        // `fromProseDoc` re-emits `restart`/`continue` on save). A row fully
        // covered by the merge keeps a standalone continuation cell (the
        // importer `rowWouldBeEmpty` pattern): spanning into a standalone
        // row would corrupt the grid, so when ANY covered row is fully
        // covered the whole group resolves marker-only via
        // `_originalFormatting` (no rowspan, no deletions).
        const [top, ...rest] = liveMerge;
        const fullyCovered = rest.some((c) => {
          const $c = tr.doc.resolve(c.pos);
          const rowNode = $c.depth >= 1 ? $c.node($c.depth) : null;
          return !rowNode || rowNode.type.name !== 'tableRow' || rowNode.childCount <= 1;
        });
        if (fullyCovered) {
          const stamp = (pos: number, vMerge: 'restart' | 'continue'): void => {
            const live = tr.doc.nodeAt(pos);
            if (!live || !isCellNodeName(live.type.name)) return;
            const orig = (live.attrs._originalFormatting as Record<string, unknown> | null) ?? {};
            tr.setNodeMarkup(pos, undefined, {
              ...live.attrs,
              cellMarker: null,
              _originalFormatting: { ...orig, vMerge },
            });
          };
          stamp(top!.pos, 'restart');
          for (const c of rest) stamp(c.pos, 'continue');
        } else {
          const topNode = tr.doc.nodeAt(top!.pos);
          if (topNode && isCellNodeName(topNode.type.name)) {
            tr.setNodeMarkup(top!.pos, undefined, {
              ...topNode.attrs,
              rowspan: Math.max((topNode.attrs.rowspan as number) || 1, liveMerge.length),
              cellMarker: null,
            });
          }
          for (const c of [...rest].sort((a, b) => b.pos - a.pos)) {
            const live = tr.doc.nodeAt(c.pos);
            if (live && isCellNodeName(live.type.name)) deleteCellAt(tr, c.pos, live, deleted);
          }
        }
      } else {
        // Not a clean single-column run (foreign shape) — clear only, never
        // corrupt the grid.
        for (const c of liveMerge) {
          const live = tr.doc.nodeAt(c.pos);
          if (live && isCellNodeName(live.type.name)) {
            tr.setNodeMarkup(c.pos, undefined, { ...live.attrs, cellMarker: null });
          }
        }
      }
    }
  }

  reconcileDeletedColumns(tr, deleted);
}

/**
 * A vertical merge group is applicable only when every cell sits in the same
 * table, the same grid column, and consecutive rows. Anything else (a foreign
 * editor's partial shape) falls back to clear-only.
 */
function isCleanVerticalRun(tr: Transaction, cells: Array<{ pos: number; node: PMNode }>): boolean {
  if (cells.length < 2) return cells.length === 1;
  let prevTableStart = -1;
  let prevRowStart = -1;
  let prevRowSize = 0;
  let column: number | null = null;
  for (const c of cells) {
    const $cell = tr.doc.resolve(c.pos);
    // `c.pos` sits inside the row's content: row is the deepest node,
    // table one level up.
    if ($cell.depth < 1) return false;
    if ($cell.node($cell.depth)?.type.name !== 'tableRow') return false;
    if ($cell.node($cell.depth - 1)?.type.name !== 'table') return false;
    const tableStart = $cell.before($cell.depth - 1);
    const rowStart = $cell.before($cell.depth);
    const rowNode = $cell.node($cell.depth)!;
    const colIndex = cellGridIndex(rowNode, rowStart, c.pos);
    if (colIndex == null) return false;
    if (column == null) {
      column = colIndex;
    } else if (colIndex !== column) {
      return false;
    }
    if (prevTableStart < 0) {
      prevTableStart = tableStart;
    } else {
      if (tableStart !== prevTableStart) return false;
      if (rowStart !== prevRowStart + prevRowSize) return false;
    }
    prevRowStart = rowStart;
    prevRowSize = rowNode.nodeSize;
  }
  return true;
}

/**
 * Resolve every `trIns` / `trDel` carrying `revisionId`. Accept `trIns` and
 * reject `trDel` clear the marker (the row stays); reject `trIns` and accept
 * `trDel` delete the row — the whole table when it is the only row (a
 * zero-row table is schema-invalid).
 */
export function resolveTableRows(
  tr: Transaction,
  state: EditorState,
  revisionId: number,
  mode: Mode
): void {
  const sites = findTableRowSites(state, revisionId);
  const sortedRows = [...sites].sort((a, b) => b.pos - a.pos);
  for (const site of sortedRows) {
    const mappedPos = tr.mapping.map(site.pos);
    const live = tr.doc.nodeAt(mappedPos);
    if (!live || live.type.name !== 'tableRow') continue;
    const trIns = live.attrs.trIns as { revisionId: number } | null;
    const trDel = live.attrs.trDel as { revisionId: number } | null;
    const hasIns = trIns?.revisionId === revisionId;
    const hasDel = trDel?.revisionId === revisionId;
    if (!hasIns && !hasDel) continue;

    const removeRow = (mode === 'reject' && hasIns) || (mode === 'accept' && hasDel);
    if (removeRow) {
      removeRowOrTable(tr, mappedPos, live);
    } else {
      const newAttrs = { ...live.attrs };
      if (hasIns) newAttrs.trIns = null;
      if (hasDel) newAttrs.trDel = null;
      tr.setNodeMarkup(mappedPos, undefined, newAttrs);
    }
  }
}

/**
 * Resolve every table property-change entry carrying `revisionId` —
 * cell-level `tcPrChange`, row-level `trPrChange` / `tblPrExChange`,
 * table-level `tblPrChange` / `tblGridChange` (inner-to-outer). Accept clears
 * the matching entry (current formatting wins); reject restores the entry's
 * `prior` snapshot and clears the entry.
 */
export function resolveTablePropertyChanges(
  tr: Transaction,
  state: EditorState,
  revisionId: number,
  mode: Mode
): void {
  // Cell-level.
  const sortedCells = [...findTableCellPropertyChangeSites(state, revisionId)].sort(
    (a, b) => b.pos - a.pos
  );
  for (const site of sortedCells) {
    const mappedPos = tr.mapping.map(site.pos);
    const live = tr.doc.nodeAt(mappedPos);
    if (!live || !isCellNodeName(live.type.name)) continue;
    const liveChanges = live.attrs.tcPrChange as Array<{ info: { id: number } }> | null;
    if (!Array.isArray(liveChanges)) continue;
    const liveIndex = liveChanges.findIndex((e) => e.info.id === revisionId);
    if (liveIndex < 0) continue;
    if (mode === 'reject' && site.prior) {
      const restored = restoreTableCellPriorProperties(
        live.attrs as Record<string, unknown>,
        site.prior as TableCellFormatting
      );
      const nextChanges = liveChanges.slice();
      nextChanges.splice(liveIndex, 1);
      tr.setNodeMarkup(mappedPos, undefined, {
        ...restored,
        tcPrChange: nextChanges.length > 0 ? nextChanges : null,
      });
    } else {
      clearTablePropertyChangeEntry(tr, mappedPos, 'tcPrChange', liveIndex);
    }
  }

  // Row-level: `trPrChange` then per-row `tblPrExChange`.
  const sortedRowProps = [...findTableRowPropertyChangeSites(state, revisionId)].sort(
    (a, b) => b.pos - a.pos
  );
  for (const site of sortedRowProps) {
    const mappedPos = tr.mapping.map(site.pos);
    const live = tr.doc.nodeAt(mappedPos);
    if (!live || live.type.name !== 'tableRow') continue;
    const liveChanges = live.attrs.trPrChange as Array<{ info: { id: number } }> | null;
    if (!Array.isArray(liveChanges)) continue;
    const liveIndex = liveChanges.findIndex((e) => e.info.id === revisionId);
    if (liveIndex < 0) continue;
    if (mode === 'reject' && site.prior) {
      const restored = restoreTableRowPriorProperties(
        live.attrs as Record<string, unknown>,
        site.prior as TableRowFormatting
      );
      const nextChanges = liveChanges.slice();
      nextChanges.splice(liveIndex, 1);
      tr.setNodeMarkup(mappedPos, undefined, {
        ...restored,
        trPrChange: nextChanges.length > 0 ? nextChanges : null,
      });
    } else {
      clearTablePropertyChangeEntry(tr, mappedPos, 'trPrChange', liveIndex);
    }
  }
  const sortedExProps = [...findTableRowExceptionsChangeSites(state, revisionId)].sort(
    (a, b) => b.pos - a.pos
  );
  for (const site of sortedExProps) {
    const mappedPos = tr.mapping.map(site.pos);
    const live = tr.doc.nodeAt(mappedPos);
    if (!live || live.type.name !== 'tableRow') continue;
    const liveChanges = live.attrs.tblPrExChange as Array<{ info: { id: number } }> | null;
    if (!Array.isArray(liveChanges)) continue;
    const liveIndex = liveChanges.findIndex((e) => e.info.id === revisionId);
    if (liveIndex < 0) continue;
    if (mode === 'reject' && site.prior) {
      const restoredEx = restoreTableExceptionsPrior(
        (live.attrs.tblPrEx as TableFormatting | null) ?? null,
        site.prior as TableFormatting
      );
      const nextChanges = liveChanges.slice();
      nextChanges.splice(liveIndex, 1);
      tr.setNodeMarkup(mappedPos, undefined, {
        ...live.attrs,
        tblPrEx: restoredEx,
        tblPrExChange: nextChanges.length > 0 ? nextChanges : null,
      });
    } else {
      clearTablePropertyChangeEntry(tr, mappedPos, 'tblPrExChange', liveIndex);
    }
  }

  // Table-level: `tblPrChange` then the id-only `tblGridChange`.
  const sortedTableProps = [...findTablePropertyChangeSites(state, revisionId)].sort(
    (a, b) => b.pos - a.pos
  );
  for (const site of sortedTableProps) {
    const mappedPos = tr.mapping.map(site.pos);
    const live = tr.doc.nodeAt(mappedPos);
    if (!live || live.type.name !== 'table') continue;
    const liveChanges = live.attrs.tblPrChange as Array<{ info: { id: number } }> | null;
    if (!Array.isArray(liveChanges)) continue;
    const liveIndex = liveChanges.findIndex((e) => e.info.id === revisionId);
    if (liveIndex < 0) continue;
    if (mode === 'reject' && site.prior) {
      const restored = restoreTablePriorProperties(
        live.attrs as Record<string, unknown>,
        site.prior as TableFormatting
      );
      const nextChanges = liveChanges.slice();
      nextChanges.splice(liveIndex, 1);
      tr.setNodeMarkup(mappedPos, undefined, {
        ...restored,
        tblPrChange: nextChanges.length > 0 ? nextChanges : null,
      });
    } else {
      clearTablePropertyChangeEntry(tr, mappedPos, 'tblPrChange', liveIndex);
    }
  }
  const sortedGrid = [...findTableGridChangeSites(state, revisionId)].sort((a, b) => b.pos - a.pos);
  for (const site of sortedGrid) {
    const mappedPos = tr.mapping.map(site.pos);
    const live = tr.doc.nodeAt(mappedPos);
    if (!live || live.type.name !== 'table') continue;
    const grid = live.attrs.tblGridChange as { revisionId: number } | null;
    if (!grid || grid.revisionId !== revisionId) continue;
    if (mode === 'reject') {
      tr.setNodeMarkup(mappedPos, undefined, {
        ...live.attrs,
        columnWidths: site.prior.length > 0 ? [...site.prior] : null,
        tblGridChange: null,
      });
    } else {
      tr.setNodeMarkup(mappedPos, undefined, { ...live.attrs, tblGridChange: null });
    }
  }
}
