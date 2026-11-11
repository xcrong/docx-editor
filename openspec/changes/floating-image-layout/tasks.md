# Tasks: Floating Image Layout

## Investigation

- [x] Audit current floating image rendering in `renderImage.ts` (evidence: 81b72415 `fix: floating image layout fidelity for wrapText and unified zones (fixes #22)`)
- [x] Identify how paragraph measurement handles (or ignores) floating images (evidence: 81b72415, `measureBlocksPipeline.ts` +129/-41 — `measureBlocksWithFloats` re-anchors floats and threads them through measurement)
- [x] Review `renderParagraph.ts` TODO about floating image support (evidence: 81b72415, square/tight/topAndBottom exclusion zones implemented in `measureBlocksPipeline.ts`)
- [x] Create test DOCX files with each wrapping mode: square, tight, through, topAndBottom (evidence: 81b72415, `e2e/fixtures/float-wrap-comprehensive-test.docx` — header notes rectangular wrapPolygons for tight/through)
- [x] Test images inside table cells with grid layouts (2-column image grid) (evidence: 81b72415, e2e `floating-image-layout.spec.ts:170` 'table cell floats stay inside the cell and wrap cell text' + `renderTableCellFloating.ts`)

## Implementation — Text wrapping

- [x] Collect floating images that overlap a paragraph's vertical range (evidence: 81b72415, `measureBlocksWithFloats` overlap collection in `measureBlocksPipeline.ts`)
- [x] For `square` wrapping: exclude rectangular bounding box from line width (evidence: 81b72415, e2e `floating-image-layout.spec.ts:57` 'square left/right images create side margins')
- [ ] For `tight`/`through` wrapping: use wrap polygon for exclusion zones
- [x] For `topAndBottom` wrapping: push text above/below image entirely (evidence: 81b72415, e2e `floating-image-layout.spec.ts:75` 'topAndBottom images stand on their own block line')
- [x] Handle images anchored to left, right, and center positions (evidence: 81b72415, e2e `floating-image-layout.spec.ts:57` left/right side margins + `float-text-wrapping.spec.ts` center positioning)

## Implementation — Table images

- [x] Constrain floating image position to cell content area (evidence: 81b72415, `renderTableCellFloating.ts` + `renderTable.ts` +48, e2e `floating-image-layout.spec.ts:170`)
- [ ] Handle multiple images in same cell without overlap

## Implementation — Z-index

- [x] Verify `behindDoc` flag sets correct z-index relative to text (evidence: 809f0eab sandwich behind-doc watermark below body text; e2e `floating-image-layout.spec.ts:100` 'behind-text images paint below text without shrinking lines')
- [x] Verify in-front-of-text images overlay correctly (evidence: e2e `floating-image-layout.spec.ts:138` 'in-front images paint above text without shrinking lines')

## Testing

- [x] E2E test: square wrapping with left-aligned image (evidence: 81b72415, `e2e/tests/floating-image-layout.spec.ts:57`)
- [x] E2E test: square wrapping with right-aligned image (evidence: 81b72415, `e2e/tests/floating-image-layout.spec.ts:57`)
- [x] E2E test: topAndBottom wrapping (evidence: 81b72415, `e2e/tests/floating-image-layout.spec.ts:75`)
- [ ] E2E test: multiple images in table grid
- [x] E2E test: behind-text image with overlapping text (evidence: 81b72415, `e2e/tests/floating-image-layout.spec.ts:100`)
- [x] Visual comparison against Word for each wrapping mode (evidence: 81b72415, Before/After captures committed for main-vs-branch comparison)
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
