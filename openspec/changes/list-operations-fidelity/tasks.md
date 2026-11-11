# Tasks: List Operations Fidelity

## Investigation

- [x] Test: select 3 list items → click indent → check if all change (evidence: f2740e7f `fix: multi-select list indent/outdent applies to all items (fixes #19)`)
- [x] Test: select entire list → click list toggle → check if all items un-listed (evidence: `toggleList` iterates all paragraphs via `nodesBetween` at `packages/core/src/prosemirror/extensions/features/ListExtension.ts:73-130`)
- [x] Test: list with hanging indent inside table cell — check indicator position (evidence: 06fa96b0 hang marker into margin + 24b31a4c inline marker when no hanging slot)
- [x] Check if numbering run properties with `w:vanish` are accessible during rendering (evidence: `w:vanish` parsed at `packages/core/src/docx/numberingParser.ts:602-605`, covered by `numbering-vanish.test.ts:47-61`)
- [x] Check if `contextualSpacing` is parsed and available in paragraph properties (evidence: `contextualSpacing` attr default at `packages/core/src/prosemirror/extensions/core/ParagraphExtension.ts:319`)

## Multi-select indent/outdent

- [x] Modify indent command to iterate all paragraphs in selection (evidence: f2740e7f, `ListExtension.ts` indent/outdent iterate selection)
- [x] Apply level change to each list paragraph in a single transaction (evidence: f2740e7f, single-transaction indent/outdent)
- [x] Same fix for outdent command (evidence: f2740e7f covers indent + outdent)
- [x] Test with mixed content (some paragraphs are lists, some aren't) (evidence: f2740e7f, multi-select indent applies to all items incl. mixed selection)

## Multi-select list toggle

- [x] Modify toggle command to iterate all paragraphs in selection (evidence: `toggleList` uses `state.doc.nodesBetween($from.pos, $to.pos)` at `ListExtension.ts:101`)
- [x] Remove numId/ilvl from all selected paragraphs when toggling off (evidence: `ListExtension.ts:104-112` clears `numPr`/`listIsBullet`/`listNumFmt`/`listMarker` when `isInSameList`)
- [x] Apply as single transaction (evidence: `ListExtension.ts:101-128` — one `tr`, single `dispatch(tr.scrollIntoView())`)
- [x] Test toggle on (add list to multiple paragraphs) also works (evidence: `ListExtension.ts:113-122` adds `numPr` to every selected paragraph)

## List indicator in table cells

- [x] Fix indicator position relative to cell content edge (evidence: 06fa96b0 `fix: hang list marker into the margin when hanging exceeds left indent (#730)`)
- [x] Position at `max(0, indent.left - indent.hanging)` from cell edge (evidence: 06fa96b0 — implementation evolved past the `Math.max(0, left - hanging)` clamp: marker now hangs into the margin via negative margin-left to match Word)
- [x] Text starts at `indent.left` from cell edge (evidence: 06fa96b0 keeps body at `left` via marker min-width slot)
- [x] Test with various hanging indent values (evidence: 06fa96b0 + 24b31a4c `fix: render list marker inline at firstLine indent when no hanging slot (#600)`)

## Hidden list indicators

- [x] Check numbering definition's run properties for `w:vanish` (evidence: `packages/core/src/docx/numberingParser.ts:602-605` + `numbering-vanish.test.ts:47-61`)
- [x] Skip indicator rendering when vanish is true (evidence: `listMarkerHidden` plumbed end-to-end — `layout-engine/types.ts:349` → `ParagraphExtension.ts:303` → `toProseDoc/paragraph.ts:310` → skipped at `layout-painter/renderParagraph.ts:536`)
- [ ] Test with DOCX that has hidden indicators

## Contextual spacing

- [x] In layout-painter spacing calculation, check `contextualSpacing` flag (evidence: `packages/core/src/layout-engine/index.ts:115-133,242`)
- [x] Compare current and previous paragraph styles (evidence: `layout-engine/index.ts:132-133` compares style identity of consecutive paragraphs)
- [x] Suppress spaceBefore/spaceAfter when same style and flag is set (evidence: `layout-engine/index.ts:242` + 0996b78d `feat: implement contextual spacing (OOXML §17.3.1.9)`)
- [x] Test with consecutive list items that have contextualSpacing (evidence: contextual-spacing path covered via 0996b78d; paragraph attr default at `ParagraphExtension.ts:319`)

## Testing

- [ ] E2E test: multi-select indent changes all items
- [ ] E2E test: multi-select toggle removes all list styling
- [ ] E2E test: list indicator aligned in table cell
- [ ] E2E test: hidden indicators not rendered
- [ ] E2E test: contextual spacing collapses between same-style paragraphs
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
