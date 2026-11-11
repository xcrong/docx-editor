/**
 * Table/row/cell property snapshotter for suggesting-mode table commands.
 *
 * Phase 2 slice of the snapshot-and-restore infrastructure whose core
 * (`withSuggestingSnapshot` / `freezePriorEntry` / `clearNoOpEntries`)
 * lives in `./snapshot.ts`. Table property commands (fill, borders,
 * margins, alignment, row height, distribution, …) wrap their implementation
 * with {@link withSuggestingSnapshot} and supply this snapshotter so the
 * first edit in a revision session freezes the prior formatting as a
 * `tblPrChange` / `trPrChange` / `tcPrChange` / `tblGridChange` entry; a
 * later edit in the same session never overwrites it. Word's no-op rule
 * (edit ends where it started ⇒ no revision) clears entries whose
 * snapshotted fields all equal the current values.
 *
 * Priors are stored model-shaped (`TableFormatting`, `TableRowFormatting`,
 * `TableCellFormatting`) because the serializer renders them straight back
 * to OOXML — PM attrs (plain-twips numbers, hex fills) are converted on
 * capture. `tblPrExChange` has no authoring command (row-level exceptions
 * are not directly editable via the toolbar), so this snapshotter does not
 * mint it; it round-trips through parse/serialize only.
 *
 * @packageDocumentation
 */

import type {
  TableFormatting,
  TableRowFormatting,
  TableCellFormatting,
} from '../../../types/document';
import type {
  TablePropertyChange,
  TableCellPropertyChange,
  TableRowPropertyChange,
  RevisionInfo,
} from '../../../types/content/trackedChange';
import { clearNoOpEntries, freezePriorEntry, type PropertySnapshotter } from './snapshot';

/** Structural deep-equal for prior-vs-current comparison. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, (b as unknown[])[i]));
  }
  if (typeof a === 'object') {
    const aRec = a as Record<string, unknown>;
    const bRec = b as Record<string, unknown>;
    const aKeys = Object.keys(aRec);
    const bKeys = Object.keys(bRec);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (k) => Object.prototype.hasOwnProperty.call(bRec, k) && deepEqual(aRec[k], bRec[k])
    );
  }
  return false;
}

const TABLE_SNAPSHOT_FIELDS = [
  'styleId',
  'width',
  'widthType',
  'justification',
  'tableLayout',
  'floating',
  'cellMargins',
  'look',
  'bidi',
] as const;

const ROW_SNAPSHOT_FIELDS = ['height', 'heightRule', 'isHeader'] as const;

const CELL_SNAPSHOT_FIELDS = [
  'width',
  'widthType',
  'verticalAlign',
  'backgroundColor',
  'borders',
  'margins',
  'textDirection',
  'noWrap',
] as const;

type TableSnap = Record<string, unknown>;
type RowSnap = Record<string, unknown>;
type CellSnap = Record<string, unknown>;

interface CapturedTableNode {
  kind: 'table' | 'row' | 'cell';
  pos: number;
  snap: Record<string, unknown>;
}

function readSlice(
  attrs: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = (attrs[f] as unknown) ?? null;
  return out;
}

function toMeasurement(value: unknown, type: unknown): { value: number; type: string } | null {
  if (value == null) return null;
  return {
    value: typeof value === 'number' ? value : 0,
    type: typeof type === 'string' ? type : 'dxa',
  };
}

/**
 * Captured PM-attr slice → changed-fields-only model-shaped prior. Changed
 * scalar fields are recorded even when the prior value is null ("was
 * default") — mirroring the paragraph snapshotter's `{ alignment: null }`
 * convention — so a future reject can restore the absence. The result is
 * `Record`-shaped and cast to the model type at the entry site.
 */
function tablePriorFromSnap(snap: TableSnap, changed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of changed) {
    const v = snap[f];
    switch (f) {
      case 'styleId':
        out.styleId = typeof v === 'string' ? v : null;
        break;
      case 'width':
      case 'widthType':
        if (!('width' in out)) {
          out.width = toMeasurement(snap.width, snap.widthType);
        }
        break;
      case 'justification':
        out.justification = v === 'left' || v === 'center' || v === 'right' ? v : null;
        break;
      case 'tableLayout':
        out.layout = v === 'fixed' || v === 'autofit' ? v : null;
        break;
      case 'floating':
        out.floating = v != null && typeof v === 'object' ? v : null;
        break;
      case 'cellMargins': {
        if (v == null) {
          out.cellMargins = null;
          break;
        }
        if (typeof v === 'object') {
          const m = v as Record<string, number | null | undefined>;
          const margins: Record<string, unknown> = {};
          if (m.top != null) margins.top = { value: m.top, type: 'dxa' };
          if (m.bottom != null) margins.bottom = { value: m.bottom, type: 'dxa' };
          if (m.left != null) margins.left = { value: m.left, type: 'dxa' };
          if (m.right != null) margins.right = { value: m.right, type: 'dxa' };
          out.cellMargins = margins;
        }
        break;
      }
      case 'look':
        out.look = v != null && typeof v === 'object' ? v : null;
        break;
      case 'bidi':
        out.bidi = v === true ? true : null;
        break;
    }
  }
  return out;
}

/** Captured PM-attr slice → changed-fields-only `TableRowFormatting` prior. */
function rowPriorFromSnap(snap: RowSnap, changed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of changed) {
    const v = snap[f];
    switch (f) {
      case 'height':
        out.height = v == null ? null : { value: v, type: 'dxa' };
        break;
      case 'heightRule':
        out.heightRule = v === 'auto' || v === 'atLeast' || v === 'exact' ? v : null;
        break;
      case 'isHeader':
        out.header = v === true ? true : null;
        break;
    }
  }
  return out;
}

/** Captured PM-attr slice → changed-fields-only `TableCellFormatting` prior. */
function cellPriorFromSnap(snap: CellSnap, changed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of changed) {
    const v = snap[f];
    switch (f) {
      case 'width':
      case 'widthType':
        if (!('width' in out)) {
          out.width = toMeasurement(snap.width, snap.widthType);
        }
        break;
      case 'verticalAlign':
        out.verticalAlign = v === 'top' || v === 'center' || v === 'bottom' ? v : null;
        break;
      case 'backgroundColor':
        out.shading = typeof v === 'string' && v.length > 0 ? { fill: { rgb: v } } : null;
        break;
      case 'borders':
        out.borders = v != null && typeof v === 'object' ? v : null;
        break;
      case 'margins': {
        if (v == null) {
          out.margins = null;
          break;
        }
        if (typeof v === 'object') {
          const m = v as Record<string, number | null | undefined>;
          const margins: Record<string, unknown> = {};
          if (m.top != null) margins.top = { value: m.top, type: 'dxa' };
          if (m.bottom != null) margins.bottom = { value: m.bottom, type: 'dxa' };
          if (m.left != null) margins.left = { value: m.left, type: 'dxa' };
          if (m.right != null) margins.right = { value: m.right, type: 'dxa' };
          out.margins = margins;
        }
        break;
      }
      case 'textDirection':
        out.textDirection = typeof v === 'string' && v.length > 0 ? v : null;
        break;
      case 'noWrap':
        out.noWrap = v === true ? true : null;
        break;
    }
  }
  return out;
}

function changedFields(
  prior: Record<string, unknown>,
  current: Record<string, unknown>,
  fields: readonly string[]
): string[] {
  return fields.filter((f) => !deepEqual(prior[f], current[f]));
}

/**
 * Snapshotter for table/row/cell property commands: captures the pre-edit
 * formatting of every table node in the command's selection range, then
 * merges frozen priors into the command's transaction (one undo step).
 * Grid (`columnWidths`) changes additionally mint `tblGridChange`.
 */
export const tablePropertySnapshotter: PropertySnapshotter<CapturedTableNode[]> = {
  capturePrior(state) {
    const { $from, $to } = state.selection;
    const captured: CapturedTableNode[] = [];
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      const attrs = node.attrs as Record<string, unknown>;
      if (node.type.name === 'table') {
        captured.push({
          kind: 'table',
          pos,
          snap: {
            ...readSlice(attrs, TABLE_SNAPSHOT_FIELDS),
            columnWidths: Array.isArray(attrs.columnWidths)
              ? [...(attrs.columnWidths as unknown[])]
              : null,
          },
        });
      } else if (node.type.name === 'tableRow') {
        captured.push({ kind: 'row', pos, snap: readSlice(attrs, ROW_SNAPSHOT_FIELDS) });
      } else if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        captured.push({ kind: 'cell', pos, snap: readSlice(attrs, CELL_SNAPSHOT_FIELDS) });
      }
    });
    return captured;
  },

  attachSnapshots(captured, _state, tr, session: RevisionInfo) {
    for (const { kind, pos, snap } of captured) {
      const mapped = tr.mapping.map(pos);
      const node = tr.doc.nodeAt(mapped);
      if (!node) continue;
      if (kind === 'table' && node.type.name !== 'table') continue;
      if (kind === 'row' && node.type.name !== 'tableRow') continue;
      if (kind === 'cell' && node.type.name !== 'tableCell' && node.type.name !== 'tableHeader')
        continue;
      const attrs = node.attrs as Record<string, unknown>;
      const info = {
        id: session.revisionId,
        author: session.author,
        date: session.date ?? undefined,
      };

      if (kind === 'table') {
        const current = {
          ...readSlice(attrs, TABLE_SNAPSHOT_FIELDS),
          columnWidths: Array.isArray(attrs.columnWidths)
            ? [...(attrs.columnWidths as unknown[])]
            : null,
        };
        const nextAttrs: Record<string, unknown> = { ...attrs };
        let touched = false;
        const changed = changedFields(snap, current, TABLE_SNAPSHOT_FIELDS);
        if (changed.length > 0) {
          const sessionEntry: TablePropertyChange = {
            type: 'tablePropertyChange',
            info,
            previousFormatting: tablePriorFromSnap(snap, changed) as TableFormatting,
          };
          const existing = Array.isArray(attrs.tblPrChange)
            ? (attrs.tblPrChange as TablePropertyChange[])
            : null;
          const frozen = freezePriorEntry(existing, session, () => sessionEntry);
          // Entry is a no-op when every field its prior pins still equals
          // the current value (model-vs-model: PM attrs are converted via
          // the same builder so plain-twips numbers and hex fills compare
          // against `{ value, type }` / `shading` priors).
          const currentModel = tablePriorFromSnap(current, TABLE_SNAPSHOT_FIELDS);
          nextAttrs.tblPrChange = clearNoOpEntries(frozen, (e) =>
            isModelNoOp(e.previousFormatting, currentModel, TABLE_SNAPSHOT_FIELDS)
          );
          touched = true;
        }
        // Grid change: single slot (OOXML allows one). A new edit
        // overwrites the session; cleared when the grid returns to the
        // entry's own prior (no-op net change ⇒ no revision).
        const preGrid = snap.columnWidths;
        const postGrid = current.columnWidths;
        const existingGrid = (attrs.tblGridChange ?? null) as {
          revisionId: number;
          prior: number[];
        } | null;
        let nextGrid = existingGrid;
        if (!deepEqual(preGrid, postGrid)) {
          nextGrid = {
            revisionId: session.revisionId,
            prior: Array.isArray(preGrid) ? [...(preGrid as number[])] : [],
          };
          touched = true;
        }
        if (nextGrid) {
          const priorGrid = nextGrid.prior.length > 0 ? nextGrid.prior : null;
          if (deepEqual(postGrid ?? null, priorGrid)) {
            nextGrid = null;
            touched = true;
          }
        }
        if (touched) {
          nextAttrs.tblGridChange = nextGrid;
          tr.setNodeMarkup(mapped, undefined, nextAttrs);
        }
      } else if (kind === 'row') {
        const current = readSlice(attrs, ROW_SNAPSHOT_FIELDS);
        const changed = changedFields(snap, current, ROW_SNAPSHOT_FIELDS);
        if (changed.length === 0) continue;
        const sessionEntry: TableRowPropertyChange = {
          type: 'tableRowPropertyChange',
          info,
          previousFormatting: rowPriorFromSnap(snap, changed) as TableRowFormatting,
        };
        const existing = Array.isArray(attrs.trPrChange)
          ? (attrs.trPrChange as TableRowPropertyChange[])
          : null;
        const frozen = freezePriorEntry(existing, session, () => sessionEntry);
        const currentModel = rowPriorFromSnap(current, ROW_SNAPSHOT_FIELDS);
        const cleaned = clearNoOpEntries(frozen, (e) =>
          isModelNoOp(e.previousFormatting, currentModel, ROW_SNAPSHOT_FIELDS)
        );
        tr.setNodeMarkup(mapped, undefined, { ...attrs, trPrChange: cleaned });
      } else {
        const current = readSlice(attrs, CELL_SNAPSHOT_FIELDS);
        const changed = changedFields(snap, current, CELL_SNAPSHOT_FIELDS);
        if (changed.length === 0) continue;
        const sessionEntry: TableCellPropertyChange = {
          type: 'tableCellPropertyChange',
          info,
          previousFormatting: cellPriorFromSnap(snap, changed) as TableCellFormatting,
        };
        const existing = Array.isArray(attrs.tcPrChange)
          ? (attrs.tcPrChange as TableCellPropertyChange[])
          : null;
        const frozen = freezePriorEntry(existing, session, () => sessionEntry);
        const currentModel = cellPriorFromSnap(current, CELL_SNAPSHOT_FIELDS);
        const cleaned = clearNoOpEntries(frozen, (e) =>
          isModelNoOp(e.previousFormatting, currentModel, CELL_SNAPSHOT_FIELDS)
        );
        tr.setNodeMarkup(mapped, undefined, { ...attrs, tcPrChange: cleaned });
      }
    }
  },
};

/**
 * Word's no-op rule on model-shaped priors: an entry whose prior pins no
 * fields is a no-op only when the node is entirely default; otherwise it
 * survives iff at least one pinned field still differs. `currentModel` is
 * the current attr slice converted through the same prior builder so both
 * sides share the model shape.
 */
function isModelNoOp(
  previousFormatting: unknown,
  currentModel: object,
  allFields: readonly string[]
): boolean {
  const prior = (previousFormatting ?? {}) as Record<string, unknown>;
  const current = currentModel as Record<string, unknown>;
  const keys = Object.keys(prior);
  if (keys.length === 0) {
    return allFields.every((f) => {
      const v = current[modelKeyFor(f)];
      return v == null;
    });
  }
  return keys.every((k) => deepEqual(prior[k], current[k]));
}

/** PM-attr field name → model prior key it folds into. */
function modelKeyFor(field: string): string {
  switch (field) {
    case 'widthType':
      return 'width';
    case 'tableLayout':
      return 'layout';
    case 'isHeader':
      return 'header';
    case 'backgroundColor':
      return 'shading';
    default:
      return field;
  }
}
