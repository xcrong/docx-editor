# Tasks: Header/Footer Rendering

## Investigation

- [x] Check how header/footer area height is calculated in `renderPage.ts` (evidence: a8706e6b unify-HF-editing phases + `renderPage.ts:883` `headerFlowHeight` measurement)
- [x] Test with DOCX containing oversized header image (evidence: `e2e/tests/header-footer-fidelity.spec.ts:14` 'header inline image is fully visible and does not overlap the body' + 5add0df5 header image clipping fix)
- [x] Test with DOCX using 3-section tab-stop header layout (evidence: `e2e/tests/header-right-tab.spec.ts:14` right-tab single-line header + `:43` logo-line test; HF routed through shared tab-stop path via `block.attrs.tabs` at `renderParagraph.ts:426,450`)
- [x] Compare rendering against Word for both cases (evidence: `e2e/tests/header-footer-fidelity.spec.ts` + `header-overflow-diagnostic.spec.ts:8,60` tall-header no-overlap tests)

## Content clipping

- [x] Measure actual header/footer content height after rendering (evidence: `renderPage.ts:883-884` `headerFlowHeight`/`interactiveHeaderHeight`)
- [x] If content exceeds allocated area, expand area and adjust body offset (evidence: `renderPage.ts:885-899` — `headerOverflows` → `margins.top` expanded, content shown fully instead of clipped)
- [x] Handle anchored images that intentionally extend into margins (evidence: `renderPage.ts:925-931` `hasHeaderFloat` textBox/float check disables clipping; 7758983a header behind-textbox z-order fix)

## Alignment

- [x] Verify tab stop positions in header/footer use correct page width (evidence: HF paragraphs share body tab path — `tabs` via `block.attrs.tabs` at `renderParagraph.ts:426,450`, laid out in `headerContentWidth`)
- [x] Fix center and right tab stop calculations for header/footer paragraphs (evidence: `e2e/tests/header-right-tab.spec.ts:14` right-tab header renders on a single line + `:91` distT/distB line-height test)
- [x] Test with logo + company name + page number layout (evidence: `e2e/tests/header-right-tab.spec.ts:43` logo-line baseline test + `footer-page-number.spec.ts` PAGE field resolution)

## Testing

- [x] E2E test: header with large image — no clipping (evidence: `e2e/tests/header-footer-fidelity.spec.ts:14` + `header-overflow-diagnostic.spec.ts:60`)
- [x] E2E test: footer with 3-section tab-stop layout (evidence: `e2e/tests/footer-3-section-tabs.spec.ts:14` single-line left/center/right + spread assertions; fixture `e2e/fixtures/footer-3-section-tabs.docx` center@4873/right@9746 tab stops)
- [x] E2E test: different header on first page (evidence: `e2e/tests/titlePg-header-footer.spec.ts:7,26,44` — first-page header/footer + default suppression)
- [x] Visual comparison against Word (evidence: `e2e/tests/footer-3-section-tabs.spec.ts:14` asserts Word tab-stop geometry — left at margin, center centered, right at margin; `header-right-tab.spec.ts:14` right-tab single line + `header-footer-fidelity.spec.ts` no-overlap suite)
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
