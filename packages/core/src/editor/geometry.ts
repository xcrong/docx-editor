/**
 * Geometry resolution for the layout pipeline (issue #696 Tier 2, step 1.2).
 *
 * `getPageSize` / `getMargins` / `getColumns` already lived in
 * `layout-bridge/sectionGeometry.ts`; both adapters called them upstream and
 * passed pageSize/margins/columns per call into `computeLayout`. The engine
 * derives geometry itself from `sectionProperties` instead, so this module
 * is the single place that turns section properties into the concrete
 * pixel geometry a layout pass needs. Adapters that need `contentWidth`
 * during render (React sizes its hidden editor with it) call
 * {@link resolveLayoutGeometry} directly — same helper the engine uses, so
 * the values cannot drift.
 */

import { getColumns, getMargins, getPageSize } from '../layout-bridge/sectionGeometry';
import type { ColumnLayout, PageMargins } from '../layout-engine';
import type { SectionProperties } from '../types/document';

export interface PageSizePx {
  w: number;
  h: number;
}

export interface LayoutGeometry {
  pageSize: PageSizePx;
  margins: PageMargins;
  columns: ColumnLayout | undefined;
  finalPageSize: PageSizePx;
  finalMargins: PageMargins;
  finalColumns: ColumnLayout | undefined;
  /** Usable body width of the initial section: `pageSize.w - margins.left - margins.right`. */
  contentWidth: number;
}

/**
 * Derive the full layout geometry from section properties.
 *
 * Mirrors the historical adapter split exactly: the body pages use the
 * initial section's properties, the trailing section falls back to the
 * initial properties when the document has no explicit final properties.
 */
export function resolveLayoutGeometry(
  sectionProperties: SectionProperties | null | undefined,
  finalSectionProperties: SectionProperties | null | undefined
): LayoutGeometry {
  const pageSize = getPageSize(sectionProperties);
  const margins = getMargins(sectionProperties);
  const columns = getColumns(sectionProperties);
  const finalProps = finalSectionProperties ?? sectionProperties;
  const finalPageSize = getPageSize(finalProps);
  const finalMargins = getMargins(finalProps);
  const finalColumns = getColumns(finalProps);
  return {
    pageSize,
    margins,
    columns,
    finalPageSize,
    finalMargins,
    finalColumns,
    contentWidth: pageSize.w - margins.left - margins.right,
  };
}
