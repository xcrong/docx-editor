/**
 * `core/editor/` — shared stateful-orchestration spine for the React/Vue
 * adapters (issue #696 Tier 2). The pure layout COMPUTE pass + the
 * rAF-coalescing layout scheduler + the scroll-restore sequence + the
 * `DocxEditorEngine` layout runner; the transaction loop, view lifecycle,
 * and session seam land here as the tier proceeds.
 */

export { computeLayout } from './computeLayout';
export type { ComputeLayoutInputs, LayoutComputation, MeasureBlocksFn } from './computeLayout';
export { createLayoutScheduler, createRafFrameScheduler } from './layoutScheduler';
export type { FrameScheduler, LayoutScheduler } from './layoutScheduler';
export { stripScrollFlag } from './scrollFlag';
export { resolveLayoutGeometry } from './geometry';
export type { LayoutGeometry, PageSizePx } from './geometry';
export {
  applyScrollRestore,
  buildPendingScrollRestore,
  captureScrollAnchor,
  findPaintedPmStartAtOrBefore,
  reclampIncrementalSnapshot,
} from './scrollRestore';
export type { PendingScrollRestore, ScrollAnchor } from './scrollRestore';
export { DocxEditorEngine } from './DocxEditorEngine';
export type { EngineHeaderFooter, EngineHost, EnginePaintedInfo } from './DocxEditorEngine';
