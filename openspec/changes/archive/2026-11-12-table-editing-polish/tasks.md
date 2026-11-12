# Tasks: Table Editing Polish

## Investigation

- [x] Test column resize on a 4-column table — which borders respond to drag? (evidence: 8ad9fdda `fix: table column resize on all borders + row format inheritance (fixes #20)`; unit test `layout-painter/__tests__/table-resize-handles.test.ts:97` — 4-column table emits 3 handles)
- [x] Trace resize handle creation in `TableResizeExtension` (evidence: 8ad9fdda, handle creation covered by `table-resize-handles.test.ts:107-140` incl. 2/3/5-column and nested-table cases)
- [x] Test add-row-below — check if new row inherits alignment, font, size (evidence: 8ad9fdda, unit test `TableExtension/commands/addRow.test.ts:128` — new row copies alignment, font, shading, borders)
- [x] Trace add-row command in `TableExtension` (evidence: 8ad9fdda, `TableExtension/commands/insert.ts` +72 / `helpers.ts` +53)

## Column resize

- [x] Ensure resize handles are created for all inter-column borders (evidence: 8ad9fdda, `table-resize-handles.test.ts:97` 4-col→3 handles + `:132` 2/3/5-col→n-1 handles)
- [x] Fix drag delta to adjust left column width and right column width inversely (evidence: 8ad9fdda, `packages/core/src/prosemirror/tableResize.ts` +38 + `useTableResizeState.ts` / Vue `useTableResize.ts` +47 each)
- [x] Maintain total table width during resize (evidence: 8ad9fdda, inverse-width logic in `tableResize.ts` + `renderTable.ts` +46)
- [x] Allow resizing back to original position (evidence: 8ad9fdda, inverse delta is symmetric — no clamped ratchet; e2e resize-back coverage missing, see Testing)
- [x] Test with 2, 3, 4, and 5+ column tables (evidence: 8ad9fdda, `table-resize-handles.test.ts:97,132` — 2/3/4/5-column unit coverage)

## Row formatting inheritance

- [x] When adding row below, use row above as reference (evidence: 8ad9fdda, `addRow.test.ts:128` + header-band tests `:211-245`)
- [x] When adding row above, use row below as reference (evidence: 8ad9fdda, `addRow.test.ts:156` 'addRowAbove uses the row below as reference')
- [x] Copy paragraph properties (alignment, spacing) to new cells (evidence: 8ad9fdda, `addRow.test.ts:128` copies alignment)
- [x] Copy default run properties (font family, font size) to new cells (evidence: 8ad9fdda, `addRow.test.ts:128` copies font)
- [x] Copy cell properties (borders, shading, vertical align) to new cells (evidence: 8ad9fdda, `addRow.test.ts:128` copies shading + borders; suggesting-mode inheritance at `:251`)
- [x] Don't copy text content — cells should be empty (evidence: 8ad9fdda, `addRow.test.ts:128` 'cells stay empty' + `:196` multi-paragraph template yields one empty paragraph)

## Testing

- [x] E2E test: resize middle column in 4-column table (evidence: `e2e/tests/table-editing-polish.spec.ts:175` — drags border col 1 in a 2×4 table; widths[1] grows, widths[2] shrinks, pair sum + untouched columns preserved)
- [x] E2E test: resize and resize back to original position (evidence: `table-editing-polish.spec.ts:202` — +60px then −60px drags restore all 4 widths within 30 twips)
- [x] E2E test: add row inherits center alignment from reference row (evidence: `table-editing-polish.spec.ts:238` — toolbar alignCenter on row 0, insert row below via context menu, new row para alignment `center`, cell empty)
- [x] E2E test: add row inherits font family from reference row (evidence: `table-editing-polish.spec.ts:254` — Georgia set on empty para → `defaultTextFormatting` contains Georgia in the new row, cell empty)
- [x] E2E test: add row inherits cell shading from reference row (evidence: `table-editing-polish.spec.ts:272` — `#ffff00` fill on row 0, new row `backgroundColor` equals reference, cell empty; also fixed stale `setCellFillColor` helper in `e2e/helpers/editor-page.ts` to drive the real "Cell Fill Color" ColorPicker)
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
