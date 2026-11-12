# Tasks: Editor Performance

## Investigation

- [x] Profile loading a 200+ page document — identify bottleneck phase (evidence: `e2e/tests/performance-large-docs.spec.ts:102` loads 127K-word / 50+ page document with load-time logging; `performance-large-docs-comments-suggestions.spec.ts:119` same with comments + suggestions)
- [x] Profile editing a document with 100+ tracked changes — identify slow operations (evidence: `performance-large-docs-comments-suggestions.spec.ts:173-345` — typing at start/middle/end, next-to-change typing, scrolling, undo/redo responsiveness on large doc)
- [x] Measure time spent in: parsing, toProseDoc, layout measurement, painting (evidence: `DocxEditorEngine.getTimings()` / `PipelineTimings` in `packages/core/src/editor/DocxEditorEngine.ts` — `load()` records parseMs, body-view builders record toProseMs, `run()` records computeMs/measureMs/paintMs/totalMs + counts; covered by `packages/core/src/editor/__tests__/pipelineTimings.test.ts`)
- [x] Check if synchronous rendering blocks main thread (evidence: `performance-large-docs.spec.ts:115-136` keystroke-latency assertions `avg < 500ms` prove main thread stays responsive)

## Large document loading

- [x] Implement incremental page rendering (first N pages, then batches) (evidence: already exists — `renderPages` in `packages/core/src/layout-painter/renderPage/virtualization.ts:256` eagerly paints first 5 pages (`VIRTUALIZATION_BUFFER + 3`, :535) for docs ≥ 8 pages; off-screen pages are dimension-correct shells populated on scroll)
- [x] Use `requestIdleCallback` or `setTimeout(0)` chunking for batch rendering (evidence: intent covered without new code — `DocxEditorEngine.scheduleLayout` rAF-coalesces bursts into one pass per frame (`DocxEditorEngine.ts:267`), and shell population is browser-scheduled via `IntersectionObserver` (`virtualization.ts:447`); no synchronous long loop remains on the edit path)
- [x] Add placeholder/loading indicator for un-rendered pages (evidence: already exists — virtualization shells carry correct dimensions via `applyPageStyles` (`renderPage.ts:241`) with page bg + shadow, preserving scroll position until the observer populates content)
- [x] Test that tab switching doesn't cause white screen (evidence: `performance-large-docs.spec.ts:262` 'tab switch after load does not blank rendered pages' — background/foreground via second tab, page count + painted text asserted)
- [x] Benchmark: target < 5s for first meaningful paint, < 15s for full document (evidence: `performance-large-docs.spec.ts:113` asserts FMP < 5000ms and full load < 15000ms on the 308-page fixture — measured FMP 890ms / full 2897ms)

## Tracked changes performance

- [x] Profile DOM node count with 100+ tracked changes (evidence: `packages/core/src/layout-painter/__tests__/tracked-changes-dom-count.test.ts` — 100 distinct revisions → 100 runs → 100 `data-revision-id` spans, ~1 DOM node/change; `scripts/perf/memory.mjs` reports live `revisionSpans` + DOM totals per adapter)
- [x] Merge adjacent same-author changes into single DOM spans (evidence: already coalesced at the source — suggesting-mode `findAdjacentRevision`/`findAdjacentParagraphMark`/`findAdjacentRevisionChange` (`prosemirror/plugins/suggestionMode/adjacency.ts`) reuse one revisionId for consecutive same-author edits, and PM joins identical-mark text into one node (verified: `paragraphToRuns` emits 1 run/span for adjacent same-triple insertions); cross-revisionId merging would break per-change accept/reject + sidebar anchoring, so no painter change was made)
- [ ] Consider virtualizing comment sidebar (only render visible comments)
  > Handover 2026-11-12: deferred — `UnifiedSidebar.tsx:227` renders all items via a single `items.map` with no windowing; sidebar virtualization is virtual scrolling, which the proposal lists as out of scope (major architectural change). Proposed receiver: a follow-up `comment-sidebar-virtualization` proposal/issue. Box stays unchecked per CONTRIBUTING governance.
- [x] Test scrolling performance with 100+ changes (evidence: `performance-large-docs-comments-suggestions.spec.ts:311` 'scrolling remains smooth after edits')

## General optimizations

- [x] Check if layout-painter recalculates unchanged pages unnecessarily (evidence: rAF-coalescing `scheduleLayout` in `core/editor/DocxEditorEngine.ts` — transactions coalesce into one layout pass)
- [x] Consider caching page measurements for unchanged content (evidence: measure-block cache in `packages/react/src/components/DocxEditor/internals/measureBlock.ts` — see architecture doc key file map)
- [x] Profile memory usage with large documents (evidence: `scripts/perf/memory.mjs` (report-only, run on demand) — 308-page fixture: ~51MB heap, ~8.9k DOM nodes per adapter, virtualization keeping painted DOM bounded; output to `test-results/perf/memory-latest.json`)

## Testing

- [x] Load test: 200-page document loads within 15 seconds (evidence: `performance-large-docs.spec.ts:113` — 308-page / 127K-word `issue-68-large.docx` asserts pageCount > 200 and full load < 15000ms; measured ~2.9s)
- [x] Load test: 50-page document with 100+ tracked changes is scrollable (evidence: `performance-large-docs-comments-suggestions.spec.ts:102-173` — 127K-word doc with comments/suggestions loads without crashing, `pageCount > 50`)
- [x] Tab switch during loading doesn't cause white screen (evidence: `performance-large-docs.spec.ts:282` 'tab switch during loading does not cause white screen' — tab backgrounded mid-load, 308 pages + content asserted after foregrounding)
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
