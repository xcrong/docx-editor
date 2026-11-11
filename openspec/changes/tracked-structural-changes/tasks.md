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

- [ ] Per-marker semantics from design table for every table revision
- [ ] Resolution order: cell-level → row-level → table-level
- [ ] Cell-content reconciliation on horizontal merge accept: surviving cell keeps its content; absorbed cells' content is concatenated as additional paragraphs at the end of the surviving cell's content (spec'd in `tracked-structural-tables/spec.md`)
- [ ] `trDel` accept on the only row of a table: remove the table node
- [ ] `cellMarker` mutual exclusion: authoring `ins` on a cell that already has `ins` is a no-op; authoring `del` on a cell that has `ins` from the same `(id, author, date)` clears both (insert-then-delete collapse)

### Painter

- [ ] `packages/core/src/layout-painter/renderTable.ts` — colored border on revised rows/cells, change bar, strikethrough for deletions
- [ ] Dashed boundary for unaccepted vertical `cellMerge`
- [ ] `data-revision-id`, `data-revision-author`, `data-revision-date` on all revision DOM

### Sidebar

- [ ] Item builders for `trIns`, `trDel`, `trPrChange`, `cellMarker` (ins/del/merge), `tcPrChange`, `tblPrChange`, `tblPrExChange`, `tblGridChange`
- [ ] Multi-site grouping: a row insertion with N inserted cells under one `(id, author, date)` is one entry, not N+1
- [ ] i18n keys for table kinds (already stubbed in Phase 1)

### Vue parity

- [x] Painter inherits transparently from core (T27-05: painter untouched — core-only command/snapshot changes flow to Vue via the shared runtime + `commands/table.ts` layer; verified `typecheck` green for `vue`)
- [x] Mirror any new sidebar item builders in Vue (T27-05: N/A — no sidebar builders; sidebar/painter rendering is T27-06)

### Agents package

- [x] Extend or defer (per Phase 1 decision); if extending, handle table revision attrs (T27-05: DEFER per #120, same as Phase 1)

### Tests

- [x] Fixtures per marker type in `packages/core/src/docx/__tests__/fixtures/tracked-structural/` (T27-05: `tableRowInsDel`, `tableCellMarkers`, `tablePropertyChanges`, `tableExAndGridChanges` — self-generated strings, no third-party samples)
- [x] Parser round-trip tests (T27-05: `tracked-structural-tables-roundtrip.test.ts` — 4 fixtures incl. `vMergeOrig` + id-only grid; the Phase-1 double-round-trip test covers the new fixtures automatically)
- [x] Conversion unit tests (T27-05: PM attrs ↔ model for `tblPrEx`/`tblPrExChange`/`tblGridChange`/markers + extractor entries)
- [x] Playwright: add/delete row, add/delete column, horizontal/vertical merge in suggesting mode (T27-05: narrow `tracked-changes-tables-suggesting.spec.ts` — addColumn, merge-H, fill→`tcPrChange`, deleteRow save→reload e2e; addRow pre-covered; merge-V/split/deleteColumn covered at unit level in `suggestingTableCommands.test.ts` + `tableSnapshot.test.ts`)
- [x] Playwright: open fixture with table revisions, save, reopen (T27-05: deleteRow save → ZIP has `<w:del>` → reload keeps the marked row, covered in the narrow spec)
- [ ] Single-row delete-row accept removes table node
- [ ] Accept/reject coverage for each marker
- [x] `comments-sidebar.spec.ts` regression (T27-05: ran green — 18 passed; no sidebar files touched)

### Release

- [x] `bun changeset` — minor bump (T27-05: `.changeset/t27-05-table-rev-81.md` — core minor)

---

## Phase 3 — Run-level property revisions (`revision_change` mark)

### Schema

- [ ] New `revision_change` mark in `TrackedChangeExtensions.ts` with attrs `{ revisionId, author, date, prior: RunFormatting }` — **run only**, NOT for paragraph-mark rPr changes
- [ ] Canonicalize `prior`: sort keys, `Object.freeze`, allow shared references for adjacency

### Parser / Serializer / Conversion

- [ ] Wire run `rPrChange` from existing model field into `revision_change` mark via `toProseDoc/run.ts`
- [ ] `fromProseDoc/run.ts` — inverse
- [ ] Confirm `rPrChange` emission path works end-to-end and respects `<w:rPr>` last-child ordering (already enforced in Phase 1)
- [ ] `findAdjacentRevision` in `suggestionMode.ts` extended to deep-compare `revision_change` attrs for span coalescing

### Suggesting-aware run-property commands

- [ ] `toggleBold` / `toggleItalic` / `toggleUnderline` / `setFont` / `setFontSize` / `setColor` / `setHighlight` / `toggleStrike` / `toggleSubscript` / `toggleSuperscript` — snapshot prior `rPr` of affected runs and apply `revision_change` mark via `withSuggestingSnapshot`
- [ ] Per-(id, author, date) freeze-on-first-edit semantics
- [ ] Clear `revision_change` if all snapshotted fields equal current

### Accept / Reject

- [ ] `revision_change` accept: remove mark
- [ ] `revision_change` reject: restore prior `rPr` to the run, remove mark
- [ ] `pPrChange` / `tcPrChange` / `trPrChange` / `tblPrChange` / `tblPrExChange` / `tblGridChange` / `paraRPrChange` reject: restore prior via `restorePriorProperties` (Phase 1 utility)

### Painter

- [ ] `revision_change` mark renders with class `ep-revision-change` in `editor.css` (subtle wavy underline or background tint; exact CSS value with design)

### Sidebar

- [ ] Sidebar entries name the changed property: "Bold added", "Font changed from Calibri to Times New Roman, 11pt to 12pt"
- [ ] i18n keys already stubbed in Phase 1; Phase 3 fills English values for run-property descriptions

### Vue parity

- [ ] Mirror

### Tests

- [ ] Fixtures for `rPrChange` with prior rPr containing various properties
- [ ] Conversion unit tests
- [ ] Playwright: toggle bold in suggesting mode → `revision_change` mark appears; accept removes; reject restores prior
- [ ] Round-trip with mixed property changes
- [ ] Property-based test: apply N random formatting ops, accept-all should equal applying ops without tracking; reject-all leaves doc unchanged
- [ ] `comments-sidebar.spec.ts` regression

### Release

- [ ] `bun changeset` — minor bump
- [ ] Final `bun run api:extract`

---

## Deferred (out of scope for this change)

- [ ] `<w:moveFrom>` / `<w:moveTo>` / move-range markers — model exists, conversion drops them. Separate change.
- [ ] `<w:numPr><w:ins/>` — list-item-assignment revisions (`<w:numberingChange>` is not in `wml.xsd`). Separate change.
- [ ] `<w:customXml*RangeStart/End>` — parser preserves as opaque only.
- [ ] Collaboration / Yjs integration with `feat/controlled-comments-collab` — non-goal; separate effort.
- [ ] `w:authorId` modeling — non-goal; sidebar dedup by display name only.
- [ ] NodeView virtualization of `pPrDel` boundary for "deferred join feels joined" UX — follow-up issue.
