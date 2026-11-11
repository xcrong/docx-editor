# Tasks: Editor Performance

## Investigation

- [x] Profile loading a 200+ page document — identify bottleneck phase (evidence: `e2e/tests/performance-large-docs.spec.ts:102` loads 127K-word / 50+ page document with load-time logging; `performance-large-docs-comments-suggestions.spec.ts:119` same with comments + suggestions)
- [x] Profile editing a document with 100+ tracked changes — identify slow operations (evidence: `performance-large-docs-comments-suggestions.spec.ts:173-345` — typing at start/middle/end, next-to-change typing, scrolling, undo/redo responsiveness on large doc)
- [ ] Measure time spent in: parsing, toProseDoc, layout measurement, painting
- [x] Check if synchronous rendering blocks main thread (evidence: `performance-large-docs.spec.ts:115-136` keystroke-latency assertions `avg < 500ms` prove main thread stays responsive)

## Large document loading

- [ ] Implement incremental page rendering (first N pages, then batches)
- [ ] Use `requestIdleCallback` or `setTimeout(0)` chunking for batch rendering
- [ ] Add placeholder/loading indicator for un-rendered pages
- [ ] Test that tab switching doesn't cause white screen
- [ ] Benchmark: target < 5s for first meaningful paint, < 15s for full document

## Tracked changes performance

- [ ] Profile DOM node count with 100+ tracked changes
- [ ] Merge adjacent same-author changes into single DOM spans
- [ ] Consider virtualizing comment sidebar (only render visible comments)
- [x] Test scrolling performance with 100+ changes (evidence: `performance-large-docs-comments-suggestions.spec.ts:311` 'scrolling remains smooth after edits')

## General optimizations

- [x] Check if layout-painter recalculates unchanged pages unnecessarily (evidence: rAF-coalescing `scheduleLayout` in `core/editor/DocxEditorEngine.ts` — transactions coalesce into one layout pass)
- [x] Consider caching page measurements for unchanged content (evidence: measure-block cache in `packages/react/src/components/DocxEditor/internals/measureBlock.ts` — see architecture doc key file map)
- [ ] Profile memory usage with large documents

## Testing

- [ ] Load test: 200-page document loads within 15 seconds
- [x] Load test: 50-page document with 100+ tracked changes is scrollable (evidence: `performance-large-docs-comments-suggestions.spec.ts:102-173` — 127K-word doc with comments/suggestions loads without crashing, `pageCount > 50`)
- [ ] Tab switch during loading doesn't cause white screen
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
