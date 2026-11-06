# Tracked-Revision Coverage Audit (current state)

Read-only audit for issue #27 (`tracked-structural-changes`, first section). No implementation is
included in this change. Baseline: `fe7f2ed9` (main after #42), branch `feature/tracked-edges`.

Method: every stage was checked in code — DOCX parser → `Document` model → `toProseDoc` → PM
schema → `fromProseDoc` → serializer → suggesting-mode handlers → accept/reject → painter →
review sidebar. A category counts as covered only when it survives a load → edit → save cycle and
is addressable in the review UI.

Legend: **P** parsed to model · **PM** PM attr/mark · **S** serialized · **A** authored in
suggesting mode · **A/R** accept/reject · **Paint/Side** painter + sidebar.

## Coverage matrix

| Category | OOXML element(s) | P | PM | S | A | A/R | Paint/Side | Evidence | Status / notes |
|---|---|---|---|---|---|---|---|---|---|
| Inline insertion / deletion | `w:ins`, `w:del` (runs, images, shapes) | ✅ | ✅ `insertion` / `deletion` marks | ✅ | ✅ | ✅ | ✅ / ✅ | parse `paragraphParser/content.ts:632-660`; model `types/content/trackedChange.ts:70-95`; marks `TrackedChangeExtensions.ts:18-103`; conv `toProseDoc/paragraph.ts:107-124`, `fromProseDoc/paragraph.ts:676-687`; ser `paragraphSerializer/content.ts:357-424`; author `suggestionMode/index.ts:211-231`, `handlers/insert.ts`, `handlers/delete.ts:17-62`; A/R `comments.ts:624-646`; paint `renderParagraph/runs.ts:187-208`; side `extractTrackedChanges.ts:340-380` | Full |
| Paragraph-mark insertion / deletion | `w:pPr/w:rPr/w:ins`, `w:del` | ✅ | ✅ `pPrIns` / `pPrDel` | ✅ (first child of `w:rPr`) | ✅ Enter/Backspace/Delete | ✅ accept: `pPrIns` clears / `pPrDel` joins; reject: `pPrIns` joins / `pPrDel` clears | ✅ pilcrow + margin bar / ✅ | parse `paragraphParser.ts:128-139`; model `types/content/paragraph.ts:83,90`; PM `schema/nodes.ts:207,214`; conv `toProseDoc/paragraph.ts:435-449`, `fromProseDoc/paragraph.ts:90-104`; ser `paragraphSerializer.ts:59-78,324-330`; author `handlers/structural.ts:29-232`; A/R `comments.ts:326-341,649-682` (`shouldJoin` at `659-663`); paint `renderParagraph.ts:152-161,546-556`; side `extractTrackedChanges.ts:82-116` | Full |
| Paragraph-property change | `w:pPrChange` | ✅ | ✅ `pPrChange[]` | ✅ (first entry only) | ⚠️ list toggle only | ✅ reject restores `previousFormatting` | ❌ / ✅ | parse `paragraphParser/content.ts:276-289`; PM `schema/nodes.ts:225`; conv `toProseDoc/paragraph.ts:451-455`, `fromProseDoc/paragraph.ts:106-108`; ser `paragraphSerializer.ts:259-265`; author `ListExtension.ts:45-70,86-120`; A/R `comments.ts:684-710`; side `extractTrackedChanges.ts:117-131` | Partial: alignment/indent/spacing commands do not snapshot; no margin bar |
| Paragraph-mark rPr change | `w:pPr/w:rPr/w:rPrChange` (`CT_ParaRPrChange`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | `paragraphParser/properties.ts:363-366` feeds pPr/rPr to `parseRunProperties`, which never reads `w:rPrChange` | Not implemented; prior snapshot lost |
| Section-property change | `w:sectPrChange` (pPr-level + body-level) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | `sectionParser.ts:159+` reads props only; `serializer/sectionPropertiesSerializer.ts:304-308` emits none | Absent |
| Row insertion / deletion | `w:trPr/w:ins`, `w:trPr/w:del` | ✅ | ✅ `trIns` / `trDel` | ✅ | ✅ add row / delete row / new table | ✅ | ✅ / ✅ | parse `tableParser.ts:254-270`; model `types/content/table.ts:42-45`; PM `specs.ts:136-138`; conv `toProseDoc/tables.ts:375-387`, `fromProseDoc/tables.ts:272-294`; ser `tableSerializer.ts:479-490`; author `TableExtension/commands/insert.ts:55-70,134-143`, `delete.ts:63-90`; A/R `comments.ts:737-810`; paint `renderTable.ts:271-295,556-561`; side `extractTrackedChanges.ts:137-186` | Full for rows |
| Row property change | `w:trPrChange` | ✅ | ✅ `trPrChange[]` | ✅ (first entry only) | ❌ | ❌ | ❌ / ✅ | parse `tableParser.ts:213-228`; PM `specs.ts:138`; conv `toProseDoc/tables.ts:388-391`, `fromProseDoc/tables.ts:292-294`; ser `tableSerializer.ts:486-512`; side `extractTrackedChanges.ts:170-186`; ids collected at `comments.ts:167-168` but no finder in `resolveById` (`comments.ts:596-615`) | Round-trips + card; Accept/Reject is a silent no-op |
| Cell insertion / deletion | `w:tcPr/w:cellIns`, `w:cellDel` | ✅ | ✅ `cellMarker {ins\|del}` | ✅ | ⚠️ row ops only; columns untracked | ⚠️ clear-only | ✅ / ✅ | parse `tableParser.ts:278-292`; model `types/content/trackedChange.ts:51-54`; PM `specs.ts:306,426-435`; conv `toProseDoc/tables.ts:735-738`, `fromProseDoc/tables.ts:528-547`; ser `tableSerializer.ts:602-605`; A/R `comments.ts:713-735`; paint `renderTable.ts:372-374`; side `extractTrackedChanges.ts:192-233` | Partial: accept/reject clears the marker only, does not add/remove the cell |
| Vertical cell merge | `w:tcPr/w:cellMerge` | ✅ | ✅ `cellMarker {kind:'merge'}` | ✅ | ❌ | ⚠️ clear-only | ⚠️ / ✅ | parse `tableParser.ts:294-305`; PM `schema/nodes.ts:429-435`; conv `toProseDoc/tables.ts:739-750`, `fromProseDoc/tables.ts:538-546`; ser `tableSerializer.ts:606-619`; A/R `comments.ts:713-735` | Partial: never authored; no merge/split application; solid cue, no dashed pending boundary |
| Cell property change | `w:tcPrChange` | ✅ | ✅ `tcPrChange[]` | ✅ (first entry only) | ❌ | ❌ | ❌ / ✅ | parse `tableParser.ts:234-249`; PM `specs.ts:307,437`; conv `toProseDoc/tables.ts:753-756`, `fromProseDoc/tables.ts:548-550`; ser `tableSerializer.ts:622-648`; side `extractTrackedChanges.ts:218-233` | Round-trips + card; Accept/Reject no-op |
| Table property change | `w:tblPrChange` | ✅ | ✅ `tblPrChange[]` | ✅ (first entry only) | ❌ | ❌ | ❌ / ✅ | parse `tableParser.ts:192-206`; PM `schema/nodes.ts:357`, `specs.ts:42`; conv `toProseDoc/tables.ts:250-253`, `fromProseDoc/tables.ts:327-329`; ser `tableSerializer.ts:395-399`; side `extractTrackedChanges.ts:236-252` | Round-trips + card; Accept/Reject no-op |
| Table-exception change (per row) | `w:tr/w:tblPrEx/w:tblPrExChange` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | no `tblPrEx` occurrence in `packages/core/src/docx` | Absent |
| Table grid change | `w:tblGrid/w:tblGridChange` (id-only) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | `parseTableGrid` reads only `w:gridCol` (`tableParser.ts:759-767`); serializer re-derives (`serializer/tableGrid.ts:86-87`) | Absent; prior widths lost |
| Run property change | `w:r/w:rPr/w:rPrChange` | ✅ → `Run.propertyChanges` | ❌ | ⚠️ only while text+marks unchanged | ❌ | ❌ | ❌ / ❌ | parse `runParser.ts:404-440,748-751`; `_originalRunBoundaries` side-channel `toProseDoc/paragraph.ts:213-219`, restore gate `fromProseDoc/paragraph.ts:179-260`; ser `runSerializer.ts:414-433` | Partial: no mark/entry/addressability; any edit drops the history |
| Move wrappers | `w:moveFrom`, `w:moveTo` | ✅ | ✅ as ins/del + `isMovePair` | ✅ | ❌ | ⚠️ as ins/del | ✅ / ✅ as ins/del | parse `paragraphParser/content.ts:668-700`; marks `TrackedChangeExtensions.ts:22-26,71-75`; conv `toProseDoc/paragraph.ts:125-150`, `fromProseDoc/paragraph.ts:668-687`; ser `paragraphSerializer/content.ts:425-428` | Round-trips as a pair; no move-specific UX/semantics |
| Move range markers | `w:moveFromRangeStart/End`, `w:moveToRangeStart/End` | ✅ | ❌ | ⚠️ docx-only path | ❌ | ❌ | ❌ / ❌ | parse `paragraphParser/content.ts:721-742`; model `trackedChange.ts:113-145`; ser `paragraphSerializer/content.ts:346-355,429-436`; no branch in `toProseDoc/paragraph.ts:107-155` | Dropped on entering the editor |
| Moved table row | `w:trPr/w:moveFrom`, `moveTo` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | `parseTableRowStructuralChange` reads only ins/del (`tableParser.ts:249-271`); ser `tableSerializer.ts:477-490` | Dropped at parse |
| List-numbering revisions | `w:numPr/w:ins`, `w:del`; `w:numberingChange` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | `paragraphParser/properties.ts:309-327` reads only `numId`/`ilvl` | Dropped at parse (list add approximated via `pPrChange`) |
| Conflict revisions | `w:conflictIns`, `w:conflictDel` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | no symbol in `packages/`; block dispatch `blockContentParser.ts:407-446` | Dropped at parse |
| Custom XML range markers | `w:customXml*RangeStart/End` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | inline skip `paragraphParser/content.ts:587-590`; block path `blockContentParser.ts:400-447` | Dropped at parse, including wrapped content in the body |
| Block-level track-change wrappers | `w:ins/w:del/w:moveFrom/w:moveTo` around `w:p`/`w:tbl` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | `parseBlockContent` dispatches only `w:p`, `w:tbl`, `w:sdt`, bookmarks (`blockContentParser.ts:400-447`) | Wrapper and wrapped block dropped at parse |
| Paragraph-mark move markers | `w:pPr/w:rPr/w:moveFrom`, `w:moveTo` (legal per `EG_ParaRPrTrackChanges`, `wml.xsd:1844-1851`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | pPr parser reads only `w:ins`/`w:del` (`paragraphParser.ts:128-139`); `buildParagraphMarkRPr` emits only those two (`paragraphSerializer.ts:74-77`) | Dropped at parse; a moved pilcrow is lost |
| Structural table authoring (columns, merge/split) | — | — | — | — | ❌ | ⚠️ clear-only | — | TODOs `TableExtension/commands/insert.ts:452-455,552-555`, `delete.ts:94-97`; `commands/index.ts:91-93` delegates merge/split to prosemirror-tables | Suggesting mode performs these as untracked edits |

## Silently dropped categories (drop point)

1. **`w:sectPrChange`** — never read (`sectionParser.ts:159+`), never written
   (`sectionPropertiesSerializer.ts:304-308`). Both placements lost on load.
2. **`CT_ParaRPrChange` (`w:pPr/w:rPr/w:rPrChange`)** — pPr/rPr goes through
   `parseRunProperties` (`paragraphParser/properties.ts:363-366`), which ignores `w:rPrChange`;
   `buildParagraphMarkRPr` never emits it. Prior paragraph-mark formatting lost.
3. **`w:tblPrExChange`** — `parseTable` does not read `w:tblPrEx` at all.
4. **`w:tblGridChange`** — `parseTableGrid` keeps `w:gridCol` only; prior widths lost.
5. **Run `w:rPrChange`** — parsed into `Run.propertyChanges`, carried only through
   `_originalRunBoundaries`; dropped after any text/mark change. No sidebar/accept/reject/paint.
6. **Move range markers** — parsed into the model, but `convertParagraph` has no branch for
   `moveFrom/ToRangeStart|End`; dropped on editor load.
7. **Moved table rows** — `trPr` parser/serializer handle ins/del only.
8. **`w:numPr` revisions** — only `numId`/`ilvl` are read; ins/del children ignored.
9. **`w:conflictIns` / `w:conflictDel`** — no handling anywhere.
10. **`w:customXml` range markers and block-level `w:customXml`** — inline is an explicit skip;
    block path never dispatches it, so wrapped content is dropped too.
11. **Block-level `w:ins`/`w:del` wrappers** — no dispatch branch; an inserted/deleted whole
    paragraph or table in this legal OOXML form disappears, including its content.
12. **Paragraph-mark move markers (`w:pPr/w:rPr/w:moveFrom|w:moveTo`)** — legal per `EG_ParaRPrTrackChanges` (`wml.xsd:1844-1851`), but the pPr parser reads only `w:ins`/`w:del` (`paragraphParser.ts:128-139`) and `buildParagraphMarkRPr` emits only those two (`paragraphSerializer.ts:74-77`). A moved pilcrow is dropped at parse, so the move destination/source boundary is lost while the text itself survives.
13. **`w:trPrChange` / `w:tcPrChange` / `w:tblPrChange` accept/reject** — not a parse drop:
    ids are enumerated (`comments.ts:167-181`) but `resolveById` (`comments.ts:596-615`) has no
    finder for these families, so sidebar Accept/Reject silently no-ops.

## Notes on the recorded non-goals

The proposal defers `w:moveFrom`/`w:moveTo` range markers, `w:numPr` revisions, and
`w:customXml*` (opaque preservation only). The audit confirms those are currently dropped at
parse or on editor load rather than preserved opaquely.
