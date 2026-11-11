# Tasks: OOXML Feature Gaps

## Image hyperlinks

- [x] Check if `a:hlinkClick` is parsed from DrawingML in `drawingParser.ts` (evidence: parsed at `packages/core/src/docx/imageParser.ts:177-179`, hyperlink rId extracted)
- [x] If not, add parsing of `a:hlinkClick` relationship ID (evidence: `imageParser.ts:177-179` `hlinkRId` + rel resolution at `:542,:652`)
- [x] Resolve relationship ID to URL from .rels (evidence: `image-hlinkclick-roundtrip.test.ts:20` parses hlinkClick through `sanitizeHref` and preserves rId; `:27` drops `javascript:` targets)
- [x] Wrap image in `<a>` tag in layout-painter (evidence: `packages/core/src/layout-painter/__tests__/image-hlink-render.test.ts` + round-trip at `image-hlinkclick-roundtrip.test.ts:34`)
- [ ] Test with DOCX containing clickable image in footer

## TIFF images

- [x] Check if TIFF images currently render or show broken icon (evidence: TIFF extensions mapped at `packages/core/src/docx/imageParser.ts:369-370` (`tiff`/`tif` → `image/tiff`); non-browser-renderable media documented at `parser.ts:67-76`)
- [ ] Add TIFF-to-PNG/JPEG client-side conversion (utif.js or similar)
- [ ] Convert during image data loading, before rendering
- [ ] Test with DOCX containing TIFF image

## SVG images

- [x] Check if `image/svg+xml` MIME type is handled in image rendering (evidence: SVG MIME mapped at `packages/core/src/docx/imageParser.ts:372`)
- [x] If not, add MIME type mapping (evidence: same mapping at `imageParser.ts:372`)
- [ ] Test with DOCX containing SVG image

## Font size decimal

- [x] Find font size input component (likely `FontSizePicker` or similar) (evidence: `packages/react/src/components/ui/FontSizePicker.tsx` + Vue `useToolbarFontSize.ts`, shared contract in `packages/core/src/utils/fontSize.ts`)
- [x] Change validation to allow decimal point (evidence: `FontSizePicker.tsx:150` `parseFloat(inputValue)`)
- [x] Change parsing from `parseInt` to `parseFloat` (evidence: `FontSizePicker.tsx:150`; only remaining `parseInt` at `:100` is placeholder fallback)
- [x] Ensure internal storage uses half-points (OOXML format) (evidence: `FontSizePicker.tsx:49-51` re-exports canonical half-point conversions; `:152` rounds to nearest 0.5)
- [ ] Test: type "10.5" → verify correct font size applied

## Null lvlText guard

- [x] Find list numbering generation code that calls `.replace()` on lvlText (evidence: `packages/core/src/docx/numberingParser.ts:270`)
- [x] Add null check: if lvlText is null, return empty string (evidence: `numberingParser.ts:270` `?? ''`)
- [ ] Test with DOCX containing incomplete numbering definition

## Column separator line

- [x] Check if `w:sep` is parsed from `w:cols` in section properties (evidence: `packages/core/src/docx/sectionParser.ts:240` reads `w:sep`)
- [x] If not, add parsing (evidence: same — `sep` parsed into columns model)
- [x] Render vertical line between columns in layout-painter (evidence: `packages/core/src/layout-painter/renderPage.ts:817-818` renders separator lines when `page.columns.separator`)
- [x] Position at midpoint between columns, full column height (evidence: `renderPage.ts:822-830` — `lineX` at gap midpoint, height = full content height)
- [ ] Test with DOCX using "Line between" columns option

## Testing

- [ ] E2E test: click image with hyperlink → link opens
- [ ] E2E test: TIFF image renders
- [ ] E2E test: font size "10.5" applies correctly
- [ ] E2E test: document with null lvlText loads without crash
- [ ] E2E test: column separator line renders
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
