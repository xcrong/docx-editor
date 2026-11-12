# Tasks: Tracked Structural Changes

Three landable phases. Each phase is a separate PR. Phase 1 includes the snapshot-and-restore infrastructure so Phases 2 and 3 are independent.

## Phase 1 — Paragraph-mark, section, and shared infra (issue #614 fix)

### Schema

- [x] Add `pPrIns`, `pPrDel`, `pPrChange[]`, `paraRPrChange[]`, `sectPrChange`, `sectPrChangeBodyLevel` attrs to the paragraph node in `packages/core/src/prosemirror/schema/nodes.ts`. Default `null`. (T27-01: `pPrIns`/`pPrDel`/`pPrChange` pre-existed; added `paraRPrChange[]` PM attr. `sectPrChange` rides inside `_sectionProperties` — placement is structural (`Paragraph.sectionProperties` vs `DocumentBody.finalSectionProperties`), so no `sectPrChangeBodyLevel` flag; rationale in the T27-01 PR description.)
- [x] Confirm `ParagraphAttrs` `@public` status; `bun run api:extract` after edits (T27-01: `api:extract` + `api:check` green)

### Parser

- [x] `paragraphParser/properties.ts` — `parseParagraphMarkRevision(rPrEl)` for `<w:ins/>` / `<w:del/>` inside `<w:pPr><w:rPr>`, expose as `pPrIns` / `pPrDel` (T27-01: pre-existed in `paragraphParser.ts:129-140`; covered by `paragraph-mark-revision-roundtrip.test.ts`)
- [x] `paragraphParser/properties.ts` — `parseParagraphMarkRPrChange(rPrEl)` for `CT_ParaRPrChange` (last child of `<w:pPr><w:rPr>`); NOT the run-rPrChange path (T27-01: implemented as `parseParagraphMarkPropertyChanges` in `paragraphParser/content.ts`, wired in `paragraphParser.ts`)
- [x] Confirm `pPrChange` parses to `Paragraph.propertyChanges[]` (existing — verify wiring through `toProseDoc`) (T27-01: verified; round-trip asserted in `paragraph-mark-revision-roundtrip.test.ts`)
- [x] Locate section parsing site (likely `documentParser.ts` or `paragraphParser/properties.ts` — `sectionParser.ts` does not currently exist; do not create a file unless refactor is wanted) — read `<w:sectPrChange>` at both `pPr/sectPr` and body-level placements (T27-01: `sectionParser.ts:parseSectionProperties` + prior-snapshot guard; both placements covered by round-trip test)

### Snapshot-and-restore infrastructure (shared across phases)

- [x] `packages/core/src/prosemirror/plugins/suggestionMode.ts` — add `withSuggestingSnapshot(commandImpl, snapshotter)` helper that wraps a property-edit command with snapshot-on-first-edit-per-(id,author,date) logic (T27-01: `plugins/suggestionMode/snapshot.ts`; `freezePriorEntry` + `sameRevisionSession`; unit-tested)
- [x] After each property edit, compare snapshotted fields against current values; if all equal, clear the `*Change` attr (Word's "no-op net change ⇒ no revision") (T27-01: `clearNoOpEntries`; unit-tested)
- [x] `packages/core/src/prosemirror/utils/restorePriorProperties.ts` (new) — utility used by reject handlers to write `prior` back into node attrs / run rPr (T27-01: paragraph/run/section restore; `comments.ts` reject path delegates to it; unit-tested)

### Cache key

- [x] `packages/core/src/layout-bridge/measuring/cache.ts` — extend `hashParagraphBlock` to include `pPrIns`/`pPrDel`/`pPrChange`/`paraRPrChange`/`sectPrChange` presence flags and `revision_change` mark presence on runs (T27-01: `pins`/`pdel` pre-existed; added `pchg`/`mchg`/`schg`/`rchg`)
- [x] If `hashTableBlock` (or equivalent) exists, mirror (T27-01: verified absent — no table-block measure cache exists)

### FlowBlock plumbing

- [x] `packages/core/src/layout-engine/toFlowBlocks*.ts` — pass the new revision attrs through into `ParagraphBlock.attrs` so measurement is consistent with the cache key (T27-01: `pPrChange`/`paraRPrChange`/`sectPrChange`/`hasRevisionChange` plumbed in `layout-bridge/toFlowBlocks.ts`; no new `FlowBlock` variant, so the 3 `assertExhaustiveFlowBlock` switches are untouched — full `typecheck` green)

### Conversion

- [x] `toProseDoc/paragraph.ts` — map model `pPrIns`/`pPrDel`/`pPrChange[]`/`paraRPrChange[]`/`sectPrChange` to PM node attrs (T27-01: `paraRPrChange` added; `sectPrChange` rides `_sectionProperties`; round-trip test asserts attr↔model correspondence)
- [x] `fromProseDoc/paragraph.ts` — inverse, preserve array shapes (T27-01: `paraRPrChange` restored as array; covered by round-trip test)
- [x] `packages/core/src/prosemirror/utils/extractTrackedChanges.ts` — walk node attrs in addition to text marks; emit one entry per `(id, author, date)` triple with multi-site sites collected under one entry (T27-01: pre-existing for `pPrIns`/`pPrDel`/`pPrChange`; added `paragraphMarkPropertiesChanged` + `sectionPropertiesChanged` entries; extraction test added)

### Serializer

- [x] `serializer/paragraphSerializer.ts` — emit `<w:pPr><w:rPr><w:ins/>` / `<w:del/>` from `pPrIns` / `pPrDel` in the **first** position inside `<w:rPr>` (per `EG_ParaRPrTrackChanges` ordering) (T27-01: pre-existed; ordering asserted by round-trip test)
- [x] Emit `<w:rPrChange>` (from `paraRPrChange`) as the **last** child of `<w:pPr><w:rPr>` (per `EG_RPrContent` ordering) (T27-01: implemented in `buildParagraphMarkRPr`; ordering asserted by round-trip test)
- [x] Emit `<w:pPrChange>` as the **last** child of `<w:pPr>` (T27-01: pre-existed; asserted by round-trip test)
- [x] Section emission (in `documentSerializer.ts` or `paragraphSerializer.ts`, wherever section emission currently lives) — emit `<w:sectPrChange>` as the last child of `<w:sectPr>` in both pPr-level and body-level placements (T27-01: implemented in `sectionPropertiesSerializer.ts`; both placements asserted by round-trip test)
- [x] `serializer/runSerializer.ts` (or wherever run rPr is emitted) — enforce `<w:rPrChange>` is the last child of `<w:rPr>` (T27-02: `serializeRunProperties` already appends `propertyChanges` after base properties; ordering asserted by the new `runSerializer.test.ts` case)

### Suggesting-mode plugin

- [x] `plugins/suggestionMode.ts` — Enter handler that **calls into** `splitBlockClearBorders` (in `BaseKeymapExtension.ts`), then sets `pPrIns` on the _first_ paragraph of the resulting split (normative) (T27-02: `handleSuggestionEnter` delegates to the now-exported `splitBlockClearBorders` via capture-dispatch so the split + `pPrIns` + tracked deletion stay in one transaction; selection-collapse is an undispatched intermediate because `splitBlock` would `deleteSelection()` untracked)
- [x] Same Enter handler covers selection-covering-content (wrap as `deletion` then split) and empty-paragraph cases (T27-02: deletion marks are applied mapped-through the captured split; verified by coalescing e2e)
- [x] Backspace at paragraph start (collapsed, non-first): set `pPrDel` on previous paragraph; cursor lands at its end; no actual join (T27-02: pre-existed; e2e-covered)
- [x] Delete at paragraph end (collapsed, non-last): set `pPrDel` on current paragraph (T27-02: pre-existed; `handleSuggestionDeleteAtEnd`)
- [x] Backspace at first paragraph start: no-op (T27-02: pre-existed; falls through to the base keymap no-op)
- [x] Selection spanning paragraph boundary + Backspace/Delete: wrap inline + set `pPrDel` on covered paragraph marks; cursor at original `from` (T27-02: `handleSuggestionDelete` selection branch marks fully-covered paragraph ends — end boundary strictly inside the range — and collapses to mapped `from`; unit-tested in `paragraphSnapshot.test.ts`)
- [x] Wrap paragraph-property commands (alignment, indent, line spacing, style) and section-property commands with `withSuggestingSnapshot` (T27-02: new `paragraphPropertySnapshotter` in `plugins/suggestionMode/paragraphSnapshot.ts`; wrapped at the `commands/paragraph.ts` re-export layer — covering both adapters' toolbar/ruler paths — plus split-based `insertSectionBreak*` in `commands/sectionBreak.ts`; list toggles stay self-tracked via `ListExtension`; `sectionBreakType` rides `pPrChange.previousFormatting` under a cast and is ignored by the paragraph serializer on write — full `sectPrChange` authoring lands with the accept/reject slice)

### Accept / Reject

- [x] `commands/comments.ts` — `acceptChangeById(revisionId: number): Command` (T27-03: extended site walk to `paraRPrChange` + pPr-level `sectPrChange`; cross-author id collision logs a diagnostic; `paragraph-revision-accept.test.ts` ×10)
- [x] `rejectChangeById(revisionId: number): Command` (T27-03: same walk; `paraRPrChange` reject restores `defaultTextFormatting`, `sectPrChange` reject restores via `restoreSectionPriorProperties`; body-level `sectPrChange` lives outside the PM doc — not addressable here)
- [x] `acceptChangesInRange(from, to)` (T27-03: new; resolves entries whose `from` lies in range via the per-id path; returns count of distinct triples — non-`Command` signature because `Command` is boolean-typed)
- [x] `rejectChangesInRange(from, to)` (T27-03: new; inverse of the above)
- [x] Extended `acceptAll` / `rejectAll` to walk paragraph node attrs; redefine return value as count of distinct `(id, author, date)` triples (modify behavior — note in `tracked-changes-review/spec.md` MODIFIED Requirements) (T27-03: `collectAllRevisionTriples`; per-id transactions retained for one-undo-per-revision; `window-e2e.d.ts` + 2 e2e assertions updated to counts; MODIFIED spec text already in place)
- [x] Per-marker semantics: `pPrIns`, `pPrDel`, `pPrChange`, `paraRPrChange`, `sectPrChange` (T27-03: last two implemented + unit-tested; `pPrDel` accept still joins per existing e2e pin)
- [x] Edge cases: `pPrIns` reject on last paragraph (clear-only, log, return true); `pPrDel` accept on first paragraph (clear-only, log, return true) (T27-03: no-following-sibling guard + warn log covers the degenerate case; NOTE — "first paragraph" phrasing is a spec bug: accept joins with the FOLLOWING sibling so a first paragraph still has a join target; existing e2e "Accept pPrDel joins the paragraphs" pins join-on-first-paragraph and stays green)
- [x] Cross-revision dependency: `pPrIns` reject on a paragraph with `pPrChange` first rejects the `pPrChange` if the join would remove the host (T27-03: restore-then-join in the same transaction; unit-tested)
- [x] Bypass suggesting-mode keymap inside accept/reject (apply, don't author) (T27-03: pre-existing `SUGGESTION_BYPASS_META` in `resolveById`; unchanged)
- [x] Idempotence: `acceptChangeById` / `rejectChangeById` on unknown or already-resolved id return `false` (T27-03: pre-existing early-return; unit-tested for unknown + double-accept)

### Painter

- [x] `packages/core/src/layout-painter/renderParagraph.ts` (canonical painter; React/Vue inherit) — pilcrow `<span class="ep-revision-pilcrow ep-revision-ins" data-revision-id data-revision-author data-revision-date>¶</span>` for `pPrIns`; class `ep-revision-del` for `pPrDel`; margin change bar for `pPrChange` / `paraRPrChange` / `sectPrChange` (T27-03: `ep-revision-pilcrow` classes added alongside the existing `layout-revision-*` visuals + triple on the glyph; property paragraphs get `ep-revision-prop-change` + first-entry triple; zero new dataset names)
- [x] Section gutter cue for `sectPrChange` (carries `sectPrChangeBodyLevel` to position the cue correctly) (T27-03: shares the `ep-revision-prop-change` margin bar — a distinct gutter cue is N/A because `sectPrChangeBodyLevel` does not exist per the T27-01 decision; e2e asserts the bar + `data-revision-id`)
- [x] All revision DOM carries `data-revision-id`, `data-revision-author`, `data-revision-date` (T27-03: glyph + property-change fragments now carry the triple; run-level `data-change-author/date` contract untouched)

### Selection mapping

- [x] Accept arrow-key navigation crosses `pPrDel` boundaries normally (recommended; NodeView virtualization deferred to follow-up issue) (T27-03: no NodeView — PM selection model untouched; revised fragments carry `data-pm-start/end` via `applyPmPositions`; e2e "Revised paragraph fragment is clickable and lands the caret" proves PM-position反查)

### Sidebar

- [x] Extend `TrackedChangeEntry` type to carry structural revisions with site list (T27-03: pre-existing — `paragraphMarkPropertiesChanged` + `sectionPropertiesChanged` in the union plus `coalescedRevisionIds`; no change needed)
- [x] `useCommentSidebarItems.tsx` — group by `(id, author, date)` triple; multi-site entries collapse to one (T27-03: pre-existing extractor coalescing; property-change paragraphs now anchor via painter `data-revision-id`)
- [x] Click → scroll-to-block via `data-revision-id` (T27-03: pre-existing `anchorKey: revision-*` + `sidebarAnchorPositions` + LeaderLines; extended coverage to property-change paragraphs by painting the id)
- [x] Accept / Reject buttons → `acceptChangeById` / `rejectChangeById` (T27-03: pre-existing by-id channel; added `paragraphMarkPropertiesChanged` + `sectionPropertiesChanged` card branches in React `TrackedChangeCard.tsx` and Vue `TrackedChangeCard.vue`, same quoted-text pattern as `paragraphPropertiesChanged`; e2e accepts via the sidebar card)

### i18n (all 7 locales)

- [x] Add all **15** keys to `packages/i18n/en.json` (with English values for those Phase 1 actually uses; placeholder strings for Phase 2/3 keys so `i18n:validate` is green) (T27-02: added the 4 missing keys — `paragraphMarkPropertiesChanged`, `sectionPropertiesChanged`, `runPropertiesChanged`, `tableGridChanged`; `en.json` now carries all 15 plus pre-existing `tableInserted`/`tableDeleted`)
- [x] `bun run i18n:fix` to mirror null entries into de, he, pl, pt-BR, tr, zh-CN (T27-02: ran; also mirrored into fr/hi/id; `i18n:validate` green)

### Vue parity

- [x] Verify painter changes inherit transparently (changes are in `packages/core/src/layout-painter/`) (T27-03: core-only painter edit; both adapters render via the shared painter)
- [x] Mirror sidebar wiring in `packages/vue/src/` (T27-03: `TrackedChangeCard.vue` gains the same two branches as React)
- [x] Update `scripts/parity/parity.contract.json` with new `DocxEditorRef` methods (paired bucket) (T27-03: no `DocxEditorRef` surface added — range fns are core commands, by-id flows through sidebar callbacks; contract unchanged, `check:parity-contract` green)

### Agents package

- [x] Decide: extend `packages/agents/src/changes.ts` to handle `paragraph.pPrIns`/`pPrDel`/`pPrChange` and section revisions, OR open tracking issue for deferred support (T27-03 decision: DEFER — model-level paragraph-mark join + section-restore semantics are a separate slice; PM-editor path is complete and unit/e2e-covered. Tracking issue: #120.)
- [x] If extending: update agents API snapshot (`bun run api:extract`) (T27-04: N/A — deferred to #120, no agents API change; `DocxReviewer.structural-paragraph-mark.test.ts` pins the propose path crash-free + marker-preserving; `api:check` green)

### Tests

- [x] Fixtures in `packages/core/src/docx/__tests__/fixtures/tracked-structural/`: minimal `<w:pPr><w:rPr><w:ins/>` and `<w:del/>` DOCX, `pPrChange` DOCX, `paraRPrChange` DOCX, `sectPrChange` (pPr-level and body-level) DOCX (T27-04: `fixtures/tracked-structural/index.ts` — 5 string fixtures + `buildFixtureDocx` zip scaffolding)
- [x] Add `assertOoxmlEquivalent(a, b)` helper using canonical XML comparison (T27-04: `packages/core/src/docx/__tests__/assertOoxmlEquivalent.ts` — drops declarations/envelope namespaces, collapses inter-tag whitespace, sorts attributes, normalizes empty-element spellings)
- [x] Parser round-trip tests per fixture (parse → re-serialize → assert semantically equivalent) (T27-04: `tracked-structural-roundtrip.test.ts` — 7 tests incl. double round-trip stability; pre-existing `paragraph-mark-revision-roundtrip.test.ts` covers the attr↔model channel)
- [x] Conversion unit tests in `packages/core/src/__tests__/conversion/` — Document ↔ PM, including array-shaped attrs (T27-04: two-author `pPrChange` stack preserves array shape + order through `toProseDoc`/`fromProseDoc`, appended to `paragraph-mark-revision-roundtrip.test.ts`; single-entry arrays covered since T27-01)
- [x] Playwright: `packages/react/src/__tests__/playwright/tracked-changes-structural.spec.ts` — Enter in suggesting mode produces `pPrIns`; Backspace/Delete produce `pPrDel`; accept clears; reject reverses; last-paragraph and first-paragraph edge cases (T27-02/03: landed as `e2e/tests/tracked-changes-structural.spec.ts` — 30 tests; T27-04 adds `e2e/tests/tracked-changes-structural-closeout.spec.ts` — cross-page split, table-cell save→reload, undo/redo, multi-author — plus `e2e/tests/vue/tracked-changes-structural.spec.ts` Vue parity. NOTE: the path in this item is stale, specs live under `e2e/tests/`)
- [x] Playwright: open fixture with structural revisions, save, reopen — markers preserved (T27-04: closeout spec "table-cell paragraph revision survives save → reload" — asserts `<w:ins>` in `w:pPr/w:rPr` in the saved ZIP, reloads, markers repaint; inline-level save→reload covered by `track-changes-comments-roundtrip.spec.ts` §8.6)
- [x] Required regression: `comments-sidebar.spec.ts` (per CLAUDE.md, sidebar files are touched) (T27-04: ran green — no sidebar files touched by this slice, regression confirmed)
- [x] `bun run typecheck && bun run i18n:validate && bun run check:parity-contract && bun run api:check && bun run format` (T27-04: all green; no i18n keys added so `i18n:fix` unneeded)

### Release

- [x] `bun changeset` — minor bump (additive API) (T27-04: `.changeset/t27-04-closeout-80.md` — core minor; `review.tracked-changes` already `full/full/full` with structural-revision notes so no matrix upgrade; `guides/tracked-changes.mdx` range-command table synced in the same change)

---

## Phase 2 — Table-row and cell revisions

### Schema

- [x] Add `trIns`, `trDel`, `trPrChange[]`, `tblPrExChange[]` (per-row) to `table_row` node (T27-05: `trIns`/`trDel`/`trPrChange` pre-existed on main; added `tblPrEx` + `tblPrExChange[]` to `nodes.ts` + `TableExtension/specs.ts`)
- [x] Add `cellMarker` (`{ kind: 'ins' | 'del' | 'merge', info, vMerge?, vMergeOrig? }` discriminated union, mutually exclusive per schema), `tcPrChange[]` to `table_cell` node (T27-05: pre-existed; extended shared `CellMarker` with `vMerge`/`vMergeOrig`)
- [x] Add `tblPrChange[]`, `tblGridChange` (id-only, no author/date) to `table` node (T27-05: `tblPrChange` pre-existed; added `tblGridChange { revisionId, prior }` to `nodes.ts` + `specs.ts`)

### Parser

- [x] `tableParser.ts` — read `<w:trPr><w:ins/>` / `<w:del/>` (currently not read) (T27-05: pre-existed as `parseTableRowStructuralChange`; verified by `tableRowInsDel` fixture)
- [x] Wire existing parses of `trPrChange`, `cellIns`, `cellDel`, `cellMerge` (vertical only — `vMerge`/`vMergeOrig`, no `val` attribute), `tcPrChange`, `tblPrChange`, `tblGridChange` to model fields (T27-05: all but `tblGridChange` pre-existed; added `parseTableGridChange` id-only + `vMergeOrig` covered by `tableCellMarkers` fixture)
- [x] **Relocate `tblPrExChange` from table-level to row-level** model storage (T27-05: no table-level parse existed — added fresh row-level `parseTableRowExceptionsChanges` on `w:tr/w:tblPrEx` + current `exceptions` via `parseTableProperties`)

### Conversion

- [x] `toProseDoc/table.ts` — map every table revision to attrs (T27-05: added `tblPrEx`/`tblPrExChange`/`tblGridChange`; rest pre-existed)
- [x] `fromProseDoc/table.ts` — inverse (T27-05: same three + fixed the minimal-formatting early return dropping `tblPrChange`/`gridChange`)
- [x] `extractTrackedChanges.ts` extends to walk table attrs (T27-05: added `tableExceptionsChanged` + `tableGridChanged` entries, priority map, `comments.ts` union)

### Cache key

- [x] `hashTableBlock` (or equivalent) — extend to include revision attrs (T27-05: verified absent — no table-block measure cache exists; `measureTable.ts` holds only a local grid lookup `Map`, `cache.ts` hashes paragraphs only. Same N/A treatment as T27-01)

### FlowBlock plumbing

- [x] `toFlowBlocks` — pass table revision attrs through to `TableBlock.attrs` (T27-05: `tblPrChange`/`tblGridChange` on `TableBlock`, `trPrChange`/`tblPrExChange` on `TableRow`, `tcPrChange` on `TableCell` (layout); same-reference passthrough, no new `FlowBlock` variant — the 3 `assertExhaustiveFlowBlock` switches untouched, `typecheck` green)

### Serializer

- [x] `tableSerializer.ts` — emit `<w:trPr><w:ins/>` / `<w:del/>` and all `*Change` markers (T27-05: pre-existed; order verified against `CT_TrPr`: formatting, `ins`/`del`, `trPrChange` last)
- [x] Emit `<w:cellIns/>`, `<w:cellDel/>` from `cellMarker.kind === 'ins' | 'del'` (T27-05: pre-existed; covered by `tableCellMarkers` fixture)
- [x] Emit `<w:cellMerge w:vMerge="rest|cont"/>` from `cellMarker.kind === 'merge'` (**NOT `w:val`**); include `vMergeOrig` if present (T27-05: pre-existed; `w:val` absence asserted in `tracked-structural-tables-roundtrip.test.ts`)
- [x] Emit `<w:tblGridChange w:id="…"/>` **id only** — do not emit `w:author` or `w:date` (schema rejects) (T27-05: added in `tableGrid.ts`; author-absence asserted)
- [x] Move `<w:tblPrExChange>` emission to per-row position (T27-05: added `serializeTableRowExceptions`; per `CT_Row` the `<w:tblPrEx>` wrapper emits BEFORE `<w:trPr>`)

### Suggesting-aware table commands

- [x] `extensions/nodes/TableExtension.ts` — `addRow` sets `trIns` and `cellMarker: ins` on new cells (T27-05: pre-existed in `insert.ts:buildSuggestingRow`; covered by existing `tracked-changes-structural.spec.ts`)
- [x] `deleteRow` sets `trDel` and `cellMarker: del` on the row's cells rather than removing (T27-05: pre-existed in `delete.ts`; added missing `SUGGESTION_META` so the catch-all doesn't stamp cell text as insertion — unit-pinned in `suggestingTableCommands.test.ts`)
- [x] `addColumn` sets `cellMarker: ins` on each new cell (T27-05: added to `makeAddColumnLeft/Right` + `SUGGESTION_META`; unit + e2e)
- [x] `deleteColumn` sets `cellMarker: del` on each affected cell (T27-05: added suggesting branch in `delete.ts`, widths untouched until accept; unit)
- [x] `mergeCells` horizontal: set `cellMarker: ins` on the merging cell and `cellMarker: del` on absorbed cells (matches Word's on-disk convention; no horizontal `cellMerge` element exists) (T27-05: new `merge.ts`; unit + e2e)
- [x] `mergeCells` vertical: set `cellMarker: { kind: 'merge', vMerge: 'rest' }` on the top cell and `cellMarker: { kind: 'merge', vMerge: 'cont' }` on each cell below (T27-05: new `merge.ts`; `formatting.vMerge` untouched per the continuation-rendering constraint; unit)
- [x] `splitCells` clears the relevant `cellMarker` entries (T27-05: `merge.ts:splitCell` clears the split area via the new `TableMap`; dialog path `splitActiveTableCell` clears target-rect fragments when suggesting; unit)
- [x] Wrap table/row/cell property commands with `withSuggestingSnapshot` (T27-05: new `tableSnapshot.ts` — `tblPrChange`/`trPrChange`/`tcPrChange`/`tblGridChange` with freeze-first/clear-no-op semantics; wrapped 17 commands at the `commands/table.ts` re-export layer covering both adapters; unit + `tcPrChange`-in-ZIP e2e)

### Accept / Reject

- [x] Per-marker semantics from design table for every table revision (T27-06: `tableRevisionResolve.ts` — `trIns` accept-clear/reject-delete-row; `trDel` accept-delete-row/reject-clear; `cellMarker ins` accept-clear/reject-delete-cell; `del` accept-delete-cell/reject-clear; `merge` accept-apply (vertical span / horizontal collapse + content concat) / reject-clear-group; `trPrChange`/`tcPrChange`/`tblPrChange`/`tblPrExChange` accept-clear/reject-restore-prior; `tblGridChange` accept-clear/reject-restore-grid; `table-revision-accept.test.ts` ×23)
- [x] Resolution order: cell-level → row-level → table-level (T27-06: `resolveTableCellMarkers` → `resolveTableRows` → `resolveTablePropertyChanges` in one `tr` (one undo); unit + e2e "one undo rolls back a table accept")
- [x] Cell-content reconciliation on horizontal merge accept: surviving cell keeps its content; absorbed cells' content is concatenated as additional paragraphs at the end of the surviving cell's content (spec'd in `tracked-structural-tables/spec.md`) (T27-06: survivor colspan grows, absorbed paragraphs appended via `Fragment`; unit "accept horizontal merge collapses cells and concatenates content" + e2e merge test)
- [x] `trDel` accept on the only row of a table: remove the table node (T27-06: `removeRowOrTable` — single-row table removed, empty-para replacement when only child; unit "accept trDel on the only row" + e2e `plantTableRowDeletion` flow)
- [x] `cellMarker` mutual exclusion: authoring `ins` on a cell that already has `ins` is a no-op; authoring `del` on a cell that has `ins` from the same `(id, author, date)` clears both (insert-then-delete collapse) (T27-06: `nextCellMarker` in `TableExtension/commands/helpers.ts`, wired into `delete.ts` ×2 + `merge.ts` ×2; unit "cellMarker mutual exclusion" ×6)

### Painter

- [x] `packages/core/src/layout-painter/renderTable.ts` — colored border on revised rows/cells, change bar, strikethrough for deletions (T27-06: new `renderTableRevisions.ts` — `paintRowRevisionCue`/`paintCellRevisionCue`/`paintTableRevisionCue` (whole-table burst bar + `*Change` neutral bar); `editor.css` gains merge dashed outline + row-del strikethrough; `renderTable.ts` 1051/1140 lines)
- [x] Dashed boundary for unaccepted vertical `cellMerge` (T27-06: `.ep-revision-cell.ep-revision-merge` outline dashed; e2e vertical-merge test asserts both cells paint `[data-revision-id]`)
- [x] `data-revision-id`, `data-revision-author`, `data-revision-date` on all revision DOM (T27-06: rows/cells/tables incl. `*Change` + id-only `tblGridChange` (empty author/date); zero new dataset names; cross-page fragments reuse `tableRowBreak.ts` geometry — no new split logic; e2e "cross-page split table accept repaints without residue")

### Sidebar

- [x] Item builders for `trIns`, `trDel`, `trPrChange`, `cellMarker` (ins/del/merge), `tcPrChange`, `tblPrChange`, `tblPrExChange`, `tblGridChange` (T27-06: extractor pre-existing (T27-05); cards gain the two missing `tableExceptionsChanged` + `tableGridChanged` branches in React `TrackedChangeCard.tsx` + Vue `TrackedChangeCard.vue`; grid card hides author/date header per spec)
- [x] Multi-site grouping: a row insertion with N inserted cells under one `(id, author, date)` is one entry, not N+1 (T27-06: pre-existing `STRUCTURAL_PRIORITY` coalescing + `coalescedRevisionIds`; e2e multi-author test asserts one card per author)
- [x] i18n keys for table kinds (already stubbed in Phase 1) (T27-06: reused as-is — `rowInserted`/`rowDeleted`/`rowPropertiesChanged`/`cellInserted`/`cellDeleted`/`cellMerged`/`cellPropertiesChanged`/`tablePropertiesChanged`/`tableExceptionsChanged`/`tableGridChanged`/`tableInserted`/`tableDeleted`; `i18n:validate` green, no new keys)

### Vue parity

- [x] Painter inherits transparently from core (T27-05: painter untouched — core-only command/snapshot changes flow to Vue via the shared runtime + `commands/table.ts` layer; verified `typecheck` green for `vue`) (T27-06: painter cue helpers are core-only (`renderTableRevisions.ts`); Vue e2e asserts painted `[data-revision-id]` rows)
- [x] Mirror any new sidebar item builders in Vue (T27-05: N/A — no sidebar builders; sidebar/painter rendering is T27-06) (T27-06: `TrackedChangeCard.vue` gains `tableExceptionsChanged` + `tableGridChanged` branches + grid author-header suppression, mirroring React; Vue demo e2e hooks `addColumnRight`/`mergeFirstRowCells`/`mergeFirstColumnCells`/`getFirstTableSnapshot`/`setFirstCellFillColor`/`plantTableRowDeletion` added; `e2e/tests/vue/tracked-changes-structural.spec.ts` +3 table tests, 6/6 green)

### Agents package

- [x] Extend or defer (per Phase 1 decision); if extending, handle table revision attrs (T27-05: DEFER per #120, same as Phase 1) (T27-06: still DEFER — agents support is tracked in #120, no duplicate work in this slice; `DocxReviewer.structural-paragraph-mark.test.ts` pin from T27-04 stands)

### Tests

- [x] Fixtures per marker type in `packages/core/src/docx/__tests__/fixtures/tracked-structural/` (T27-05: `tableRowInsDel`, `tableCellMarkers`, `tablePropertyChanges`, `tableExAndGridChanges` — self-generated strings, no third-party samples)
- [x] Parser round-trip tests (T27-05: `tracked-structural-tables-roundtrip.test.ts` — 4 fixtures incl. `vMergeOrig` + id-only grid; the Phase-1 double-round-trip test covers the new fixtures automatically)
- [x] Conversion unit tests (T27-05: PM attrs ↔ model for `tblPrEx`/`tblPrExChange`/`tblGridChange`/markers + extractor entries)
- [x] Playwright: add/delete row, add/delete column, horizontal/vertical merge in suggesting mode (T27-05: narrow `tracked-changes-tables-suggesting.spec.ts` — addColumn, merge-H, fill→`tcPrChange`, deleteRow save→reload e2e; addRow pre-covered; merge-V/split/deleteColumn covered at unit level in `suggestingTableCommands.test.ts` + `tableSnapshot.test.ts`)
- [x] Playwright: open fixture with table revisions, save, reopen (T27-05: deleteRow save → ZIP has `<w:del>` → reload keeps the marked row, covered in the narrow spec)
- [x] Single-row delete-row accept removes table node (T27-06: unit + e2e "row deletion … last row removes the table" via `plantTableRowDeletion`)
- [x] Accept/reject coverage for each marker (T27-06: `table-revision-accept.test.ts` — trIns/trDel/cell ins/del/merge-H/merge-V/trPrChange/tcPrChange/tblPrChange/tblPrExChange/tblGridChange accept+reject; e2e `tracked-changes-tables-accept.spec.ts` 11 tests map the issue's 8 items: row-insertion, row-deletion, cell-merge (H accept-collapse/reject + V markers/dashed), cross-page-split-row accept (repaint, no residual marker, cut-border bound), nested-table acceptAll (no crash), single-undo accept rollback (+redo), multi-author cards, save→reload round-trips (trDel/cellIns+cellDel+tcPrChange/vertical-cellMerge))
- [x] `comments-sidebar.spec.ts` regression (T27-05: ran green — 18 passed; no sidebar files touched)

### Release

- [x] `bun changeset` — minor bump (T27-05: `.changeset/t27-05-table-rev-81.md` — core minor)

---

## Phase 3 — Run-level property revisions (`revision_change` mark)

### Schema

- [x] New `revision_change` mark in `TrackedChangeExtensions.ts` with attrs `{ revisionId, author, date, prior: RunFormatting }` — **run only**, NOT for paragraph-mark rPr changes (T27-07: `RevisionChangeExtension` + `priorStack` for stacked sessions; `StarterKit` registered; paragraph-mark path untouched — `paraRPrChange` attr, no-crosstalk test pins it)
- [x] Canonicalize `prior`: sort keys, `Object.freeze`, allow shared references for adjacency (T27-07: `canonicalizeRunPrior` with interning in `TrackedChangeExtensions.ts`; stable `getMarkSetKey` for run coalescing)

### Parser / Serializer / Conversion

- [x] Wire run `rPrChange` from existing model field into `revision_change` mark via `toProseDoc/run.ts` (T27-07: `revisionChangeMark` in `toProseDoc/runs.ts` — full stack: latest + `priorStack` oldest-first, zero data loss; hyperlink runs included)
- [x] `fromProseDoc/run.ts` — inverse (T27-07: `revisionChangeFromMarks` in `fromProseDoc/runs.ts` expands mark → full array; insertion/deletion-wrapper path preserves it; `tracked-structural-run-roundtrip.test.ts` ×5)
- [x] Confirm `rPrChange` emission path works end-to-end and respects `<w:rPr>` last-child ordering (already enforced in Phase 1) (T27-07: pre-existing `serializeRunProperties` appends changes last — ordering assertion added in the run round-trip spec; e2e save→reload pins `<w:rPrChange>` in the ZIP)
- [x] `findAdjacentRevision` in `suggestionMode.ts` extended to deep-compare `revision_change` attrs for span coalescing (T27-07: `findAdjacentRevisionChange` in `adjacency.ts` — same-author + deep-equal canonical prior → adopt triple; snapshotter probes both range edges; unit + e2e pinned)

### Suggesting-aware run-property commands

- [x] `toggleBold` / `toggleItalic` / `toggleUnderline` / `setFont` / `setFontSize` / `setColor` / `setHighlight` / `toggleStrike` / `toggleSubscript` / `toggleSuperscript` — snapshot prior `rPr` of affected runs and apply `revision_change` mark via `withSuggestingSnapshot` (T27-07: all 10 (+`setUnderlineStyle`) wrapped in `commands/formatting.ts`; `runPropertySnapshotter` captures full pre-edit formatting, stores minimal prior; keyboard `Mod-b/i/u` intercepted in the suggesting-mode plugin so shortcuts track too — extensions' raw `toggleMark` keybindings otherwise bypass the wrapper)
- [x] Per-(id, author, date) freeze-on-first-edit semantics (T27-07: same-triple attach keeps the original prior; different triple pushes the survivor onto `priorStack` — every session keeps its own prior, newest-first reject restores the original)
- [x] Clear `revision_change` if all snapshotted fields equal current (T27-07: `minimalPrior` null → same-triple mark removed, Word's no-op rule; `run-revision-accept.test.ts`)

### Accept / Reject

- [x] `revision_change` accept: remove mark (T27-07: per-entry surgery in `resolveById` — `removeRevisionChangeEntry`; earlier sessions survive; `run-revision-accept.test.ts` + e2e)
- [x] `revision_change` reject: restore prior `rPr` to the run, remove mark (T27-07: `restoreRunMarks` mark-reconcile per text node + entry removal, single transaction; reject-all walks ids newest-first via descending sort in `dispatchIdsInOrder`)
- [x] `pPrChange` / `tcPrChange` / `trPrChange` / `tblPrChange` / `tblPrExChange` / `tblGridChange` / `paraRPrChange` reject: restore prior via `restorePriorProperties` (Phase 1 utility) (T27-07: verified pre-existing — no change needed; covered by `paragraph-revision-accept.test.ts` + `table-revision-accept.test.ts`, both green)

### Painter

- [x] `revision_change` mark renders with class `ep-revision-change` in `editor.css` (subtle wavy underline or background tint; exact CSS value with design) (T27-07: wavy `rgba(95,99,104,0.85)` underline + 8% tint, neutral property-change gray; `toFlowBlocks/runs.ts` projects the mark, painter reuses the `data-revision-id`/`data-change-author`/`data-change-date` contract; e2e asserts the painted span)

### Sidebar

- [x] Sidebar entries name the changed property: "Bold added", "Font changed from Calibri to Times New Roman, 11pt to 12pt" (T27-07: `describeRunPropertyChange` in `utils/runPropertyDescriptions.ts`, shared by React `TrackedChangeCard.tsx` + Vue `TrackedChangeCard.vue`; e2e asserts "Bold added" on the card)
- [x] i18n keys already stubbed in Phase 1; Phase 3 fills English values for run-property descriptions (T27-07: 16 keys — bold/italic/underline/strike add/remove, super/sub/baseline, font/size/color/highlight from→to, default value; `en.json` values + `i18n:fix` nulls, `i18n:validate` green)

### Vue parity

- [x] Mirror (T27-07: `TrackedChangeCard.vue` branch + shared describe helper; Vue e2e `tracked-changes-run-revision.spec.ts` — bold → mark → accept/reject; keyboard path fixed for both adapters via the plugin interception. NOTE (pre-existing gap, out of scope): Vue `Toolbar.vue` dispatches raw `mgr.getCommands()`, bypassing the wrapped `commands/*` layer — Vue toolbar property edits don't mint revisions (same for Phase 1/2 paragraph/table commands); propose follow-up to route Vue `execCommand` through the wrapped layer)

### Tests

- [x] Fixtures for `rPrChange` with prior rPr containing various properties (T27-07: `runPropertyChanges` (bold+red+14pt vs plain-12pt-black), `runPropertyChangesStacked` (two entries), `runPropertyChangesWithPilcrow` (Phase 1/3 coexistence))
- [x] Conversion unit tests (T27-07: Document→PM mark (+stack) →Document array-shape preservation, edited-paragraph fallback, all in `tracked-structural-run-roundtrip.test.ts`)
- [x] Playwright: toggle bold in suggesting mode → `revision_change` mark appears; accept removes; reject restores prior (T27-07: `e2e/tests/tracked-changes-run-revision.spec.ts` ×4 + `e2e/tests/vue/tracked-changes-run-revision.spec.ts`)
- [x] Round-trip with mixed property changes (T27-07: fixture + save→reload e2e asserting `<w:rPrChange>` last-child in the ZIP)
- [x] Property-based test: apply N random formatting ops, accept-all should equal applying ops without tracking; reject-all leaves doc unchanged (T27-07: seeded `mulberry32(83)` ×12 ops in `run-revision-accept.test.ts` — required the `priorStack` model + newest-first reject to pass)
- [x] `comments-sidebar.spec.ts` regression (T27-07: spec green in isolation and in the combined structural run (33 passed with closeout + tables-accept); the full-suite parallel run shows timeout-driven flakes in this container — verified identical failures on pristine main, incl. `tracked-changes-structural.spec.ts` pPrDel/replace cases and `formatting`/`toolbar-state` suites, so no regression from this change)

### Release

- [x] `bun changeset` — minor bump (T27-07: `.changeset/t27-07-run-rev-83.md` — core minor)
- [x] Final `bun run api:extract` (T27-07: `TrackedChangeEntry.runPropertiesChanged` + `prior/currentFormatting`, `describeRunPropertyChange`/`TranslateFn`; `api:check` + `check:parity-contract` green; no `DocxEditorRef` surface change)

---

## Deferred (out of scope for this change)

- [ ] `<w:moveFrom>` / `<w:moveTo>` / move-range markers — model exists, conversion drops them. Separate change. (Handover 2026-11-12: CONFIRMED deferred — model types exist (`types/content/trackedChange.ts:95-148`, incl. 4 range-marker types), parser reads all six (`paragraphParser/content.ts:714-786`), and inline wrappers round-trip as del/ins+`isMovePair` (`toProseDoc/paragraph.ts:125-149`, `fromProseDoc/paragraph.ts:680-695`, pinned by `replace-not-move.test.ts`) — but the 4 range markers are unhandled in `toProseDoc/paragraph.ts` (only comment/bookmark ranges, lines 52-75/159-169) so they drop, and pPr-level moveFrom/moveTo is never parsed (`paragraphParser.ts:129-140` reads only ins/del). No receiving issue yet (open-issue list empty 2026-11-12) — 建议新建 T31【保真】move 范围标记 + 段落标记级 move 修订的往返与审阅.)
- [ ] `<w:numPr><w:ins/>` — list-item-assignment revisions (`<w:numberingChange>` is not in `wml.xsd`). Separate change. (Handover 2026-11-12: CONFIRMED deferred — zero `numPr/ins` or `numberingChange` handling anywhere in `packages/core/src` (only unrelated `numberingParser.ts:706`); design Tier-2 table already flags `wml.xsd` absence. No receiving issue yet — 建议新建 T32【保真】numPr 列表指派修订（numberingChange 不在 wml.xsd，需自定义建模）.)
- [ ] `<w:customXml*RangeStart/End>` — parser preserves as opaque only. (Handover 2026-11-12: CONFIRMED deferred — inline `w:customXml` content is skipped (`paragraphParser/content.ts:634-636`), zero `customXmlRange` handling in core; opaque/verbatim replay exists only for notes/HF (`noteSerializer.ts:46-47`, `headerFooterSerializer.ts:78`), not body paragraphs. No receiving issue yet — 建议新建 T33【保真】customXml 范围标记正文往返（超出现有 opaque/verbatim 通道）.)
- [x] Collaboration / Yjs integration with `feat/controlled-comments-collab` — non-goal accepted (design is single-user per proposal Non-goals; no Yjs dependency in the workspace — only `.ProseMirror-yjs-cursor` CSS hooks in `core/src/styles/editor.css:979` and a collab-backend comment in `DocxEditor.tsx:273`; no receiving issue needed, separate effort by definition).
- [x] `w:authorId` modeling — non-goal accepted (zero `authorId` references in `packages/core/src`; sidebar dedup by display name only per proposal Non-goals; two "Jane"s merge — documented known limitation).
- [ ] NodeView virtualization of `pPrDel` boundary for "deferred join feels joined" UX — follow-up issue. (Handover 2026-11-12: CONFIRMED deferred — zero `NodeView` usage in `packages/core/src/prosemirror`; arrow keys cross `pPrDel` as a normal boundary by recommendation (tasks line 79, already `[x]`); no virtualization implemented. No receiving issue yet — 建议新建 T34【体验】pPrDel 边界 NodeView 虚拟化（deferred-join 视觉无缝）. T31–T34 numbers provisional — confirm against tracker; next issue number ≥128.)
