/**
 * Tracked-changes model — insertion/deletion/move wrappers, range
 * markers, and per-element property-change wrappers (`w:rPrChange`,
 * `w:pPrChange`, `w:tblPrChange`, `w:trPrChange`, `w:tcPrChange`) plus
 * structural changes (row/cell insert/delete/merge).
 */

import type {
  TextFormatting,
  ParagraphFormatting,
  TableFormatting,
  TableRowFormatting,
  TableCellFormatting,
} from '../formatting';
import type { Run } from './run';
import type { Hyperlink } from './link';
import type { SectionProperties } from './section';

/**
 * Tracked change metadata (w:ins, w:del attributes)
 */
export interface TrackedChangeInfo {
  /** Revision ID */
  id: number;
  /** Author who made the change */
  author: string;
  /** Date of the change */
  date?: string;
}

/**
 * Tracked-change attribute triple as it appears on PM node attrs
 * (`paragraph.pPrIns`, `tableRow.trIns`, etc). Mirrors `TrackedChangeInfo`
 * but with a `null` date (PM attr defaults) and a `revisionId` name that
 * matches OOXML's `w:id` more idiomatically on the editor side.
 *
 * Round-trip pairs with `TrackedChangeInfo` via
 * `{ id, author, date? } ↔ { revisionId, author, date | null }`.
 */
export interface RevisionInfo {
  revisionId: number;
  author: string;
  date: string | null;
}

/**
 * Tracked-cell marker — the OOXML `<w:cellIns>` / `<w:cellDel>` /
 * `<w:cellMerge>` shape attached to a `TableCell` PM node and surfaced
 * to the layout model and painter for visual rendering.
 *
 * `kind` matches the OOXML element name (ins / del / merge). `vMerge` /
 * `vMergeOrig` only apply to `merge` (`CT_CellMergeTrackChange`,
 * `wml.xsd:811` — `ST_AnnotationVMerge`, NOT `w:val`).
 */
export interface CellMarker {
  kind: 'ins' | 'del' | 'merge';
  info: RevisionInfo;
  /** `<w:cellMerge w:vMerge="…">` — only meaningful for `merge`. */
  vMerge?: 'rest' | 'cont';
  /** `<w:cellMerge w:vMergeOrig="…">` — the pre-merge vMerge state. */
  vMergeOrig?: 'rest' | 'cont';
}

/**
 * Generic tracked property-change wrapper metadata (w:*PrChange)
 */
export interface PropertyChangeInfo extends TrackedChangeInfo {
  /** Optional revision session ID */
  rsid?: string;
}

/**
 * Insertion wrapper (w:ins) — runs inserted by tracked changes
 */
export interface Insertion {
  type: 'insertion';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /** Inserted content */
  content: (Run | Hyperlink)[];
}

/**
 * Deletion wrapper (w:del) — runs deleted by tracked changes
 */
export interface Deletion {
  type: 'deletion';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /** Deleted content */
  content: (Run | Hyperlink)[];
}

/**
 * Move-from wrapper (w:moveFrom) â€” content moved away from this position
 */
export interface MoveFrom {
  type: 'moveFrom';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /** Moved content */
  content: (Run | Hyperlink)[];
}

/**
 * Move-to wrapper (w:moveTo) â€” content moved into this position
 */
export interface MoveTo {
  type: 'moveTo';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /** Moved content */
  content: (Run | Hyperlink)[];
}

/**
 * Move-from range start marker (w:moveFromRangeStart) — ECMA-376 §17.13.5.22
 * Pairs with moveFromRangeEnd to delimit the source of a move in the document.
 */
export interface MoveFromRangeStart {
  type: 'moveFromRangeStart';
  id: number;
  name: string;
}

/**
 * Move-from range end marker (w:moveFromRangeEnd)
 */
export interface MoveFromRangeEnd {
  type: 'moveFromRangeEnd';
  id: number;
}

/**
 * Move-to range start marker (w:moveToRangeStart) — ECMA-376 §17.13.5.24
 * Pairs with moveToRangeEnd to delimit the destination of a move.
 */
export interface MoveToRangeStart {
  type: 'moveToRangeStart';
  id: number;
  name: string;
}

/**
 * Move-to range end marker (w:moveToRangeEnd)
 */
export interface MoveToRangeEnd {
  type: 'moveToRangeEnd';
  id: number;
}

/**
 * Run-level tracked wrappers represented in WordprocessingML.
 */
export type TrackedRunChange = Insertion | Deletion | MoveFrom | MoveTo;

/**
 * Run property change (w:rPrChange)
 */
export interface RunPropertyChange {
  type: 'runPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Run properties before the tracked change */
  previousFormatting?: TextFormatting;
  /** Run properties after the tracked change (editor model convenience) */
  currentFormatting?: TextFormatting;
}

/**
 * Paragraph-mark run property change (`w:pPr/w:rPr/w:rPrChange`,
 * `CT_ParaRPrChange`, wml.xsd:938). Tracks formatting of the paragraph-mark
 * glyph itself ("the pilcrow used to be bold") — a SEPARATE element from the
 * regular run `w:rPrChange`, living at the end of `CT_ParaRPr`. It needs its
 * own model entry; wiring it to the inline `revision_change` mark would write
 * to the wrong schema position.
 */
export interface ParagraphMarkPropertyChange {
  type: 'paragraphMarkPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Paragraph-mark run properties before the tracked change */
  previousFormatting?: TextFormatting;
  /** Paragraph-mark run properties after the tracked change (editor model convenience) */
  currentFormatting?: TextFormatting;
}

/**
 * Section property change (`w:sectPrChange`) — full prior `w:sectPr`
 * snapshot, not a diff. Legal as the last child of `w:sectPr` in BOTH
 * placements: paragraph-level (`w:pPr/w:sectPr`) and body-level
 * (`w:body/w:sectPr`). Placement is structural (see `Paragraph` vs
 * `DocumentBody.finalSectionProperties`), so no placement flag is modeled.
 */
export interface SectionPropertyChange {
  type: 'sectionPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Section properties before the tracked change */
  previousSectionProperties?: SectionProperties;
  /** Section properties after the tracked change (editor model convenience) */
  currentSectionProperties?: SectionProperties;
}

/**
 * Paragraph property change (w:pPrChange)
 */
export interface ParagraphPropertyChange {
  type: 'paragraphPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Paragraph properties before the tracked change */
  previousFormatting?: ParagraphFormatting;
  /** Paragraph properties after the tracked change (editor model convenience) */
  currentFormatting?: ParagraphFormatting;
}

/**
 * Table property change (w:tblPrChange)
 */
export interface TablePropertyChange {
  type: 'tablePropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Table properties before the tracked change */
  previousFormatting?: TableFormatting;
  /** Table properties after the tracked change (editor model convenience) */
  currentFormatting?: TableFormatting;
}

/**
 * Table row property change (w:trPrChange)
 */
export interface TableRowPropertyChange {
  type: 'tableRowPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Row properties before the tracked change */
  previousFormatting?: TableRowFormatting;
  /** Row properties after the tracked change (editor model convenience) */
  currentFormatting?: TableRowFormatting;
}

/**
 * Per-row table-property exception change (`w:tblPrExChange`,
 * `CT_TblPrExChange`, wml.xsd:866). Lives on the `table_row` node (NOT the
 * table) because `<w:tblPrEx>` sits inside `<w:tr>` per `CT_Row`. The prior
 * snapshot is a `TableFormatting` because `CT_TblPrExBase` children reuse the
 * same element names the table-property parser already handles.
 */
export interface TableExceptionsPropertyChange {
  type: 'tableExceptionsPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Row-level table exceptions before the tracked change */
  previousFormatting?: TableFormatting;
  /** Row-level table exceptions after the tracked change (editor convenience) */
  currentFormatting?: TableFormatting;
}

/**
 * Table-grid change (`w:tblGridChange`, `CT_TblGridChange`, wml.xsd:893).
 * Extends `CT_Markup`, NOT `CT_TrackChange` — id only, no author/date.
 * The prior snapshot is the grid itself (column widths in twips).
 */
export interface TableGridChange {
  type: 'tableGridChange';
  /** Id-only marker (no author/date on the wire) */
  info: { id: number };
  /** Grid (column widths in twips) before the tracked change */
  previousColumnWidths?: number[];
}

/**
 * Table cell property change (w:tcPrChange)
 */
export interface TableCellPropertyChange {
  type: 'tableCellPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Cell properties before the tracked change */
  previousFormatting?: TableCellFormatting;
  /** Cell properties after the tracked change (editor model convenience) */
  currentFormatting?: TableCellFormatting;
}

/**
 * Table structural tracked change metadata (row/cell insert/delete/merge)
 */
export interface TableStructuralChangeInfo {
  type:
    | 'tableRowInsertion'
    | 'tableRowDeletion'
    | 'tableCellInsertion'
    | 'tableCellDeletion'
    | 'tableCellMerge';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /**
   * `<w:cellMerge w:vMerge="…">` value, only meaningful for `tableCellMerge`.
   * Schema `ST_AnnotationVMerge`: `"rest"` = anchor (start of merged span),
   * `"cont"` = continuation (merged into predecessor). Word's default for a
   * tracked merge is `"cont"` (most edits track "this cell got merged INTO
   * the one above"); we preserve the on-disk value when present.
   */
  vMerge?: 'rest' | 'cont';
  /** `<w:cellMerge w:vMergeOrig="…">` — the pre-merge vMerge state. */
  vMergeOrig?: 'rest' | 'cont';
}
