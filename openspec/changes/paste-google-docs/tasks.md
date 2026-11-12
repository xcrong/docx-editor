# Tasks: Paste from Google Docs

## Investigation

- [x] Test current paste behavior: copy formatted text from Google Docs → paste into editor (evidence: 7ed722d1, before/after screenshots `screenshots/paste-google-docs-before.png` / `-after.png`)
- [x] Inspect clipboard HTML from Google Docs (check inline styles on `<p>`, `<td>`) (evidence: 7ed722d1, findings encoded in `PasteStyleInlinerExtension.ts` header — class-based CSS inlining, `docs-internal-guid` wrapper handling)
- [x] Identify paste handling entry point in our ProseMirror setup (evidence: 7ed722d1, entry point `transformPastedHTML` in `packages/core/src/prosemirror/extensions/features/PasteStyleInlinerExtension.ts:586`)
- [x] Check if `transformPastedHTML` hook is already used (evidence: 7ed722d1, hook wired at `PasteStyleInlinerExtension.ts:627-628`)

## Text alignment

- [x] Extract `textAlign` from pasted `<p>` elements (evidence: 7ed722d1, `ParagraphExtension.ts` +37 lines)
- [x] Map to `paragraphProperties.justification` (left, center, right, both) (evidence: 7ed722d1, same `ParagraphExtension.ts` change)
- [x] Test with centered and right-aligned paragraphs (evidence: 7ed722d1, e2e `paste-google-docs.spec.ts:74` 'centered and right-aligned paragraphs keep alignment')

## Line spacing

- [x] Extract `lineHeight` from pasted `<p>` elements (evidence: `extractParagraphAttrsFromStyle`/`cssLineHeightToSpacing` in `ParagraphExtension.ts:169-193,257-263`; unit tests `paste-google-docs.test.ts` 'Google Docs line-height presets' + 'other line-height values')
- [x] Convert to spacing values: 1.2→single, 1.8→1.5x, 2.4→double (evidence: `googleDocsLineHeightToTwips` in `ParagraphExtension.ts:194-200` snaps 1.2→240, 1.8→360, 2.4→480, others proportional)
- [x] Extract `marginTop`/`marginBottom` for spacing before/after (evidence: `extractParagraphAttrsFromStyle` in `ParagraphExtension.ts:265-273`; unit test 'margin-top/margin-bottom become spaceBefore/spaceAfter' — 12pt→240, 8pt→160)
- [x] Test with different spacing values (evidence: unit tests `paste-google-docs.test.ts` — presets 1.2/1.8/2.4, proportional 1.38→331, 130%→312, absolute 18pt→360 exact)
- [x] E2E test: paste text with 1.5x line spacing (evidence: `e2e/tests/paste-google-docs.spec.ts` 'text with 1.5x line spacing keeps 360-twips spacing' — line-height:1.8→360 auto, spaceAfter 160; 7/7 paste specs green)

## Indentation

- [x] Extract `marginLeft` from pasted `<p>` elements (evidence: `extractParagraphAttrsFromStyle` in `ParagraphExtension.ts:228-233`; unit test 'margin-left converts pt to indentLeft twips' — 36pt→720)
- [x] Convert pt to twips for `indent.left` (evidence: `cssLengthToTwips` in `ParagraphExtension.ts:125-139` — 1pt=20 twips; covered by margin-left unit tests)
- [x] Handle nested indentation levels (evidence: unit test 'nested indentation levels scale with margin-left' — 36pt→720, 72pt→1440; list nesting via aria-level already covered by 'three-deep nesting maps to levels 0-2')
- [x] Test with indented paragraphs (evidence: unit tests `paste-google-docs.test.ts` 'margin-left converts pt to indentLeft twips' + 'nested indentation levels scale with margin-left')
- [x] E2E test: paste indented paragraph (evidence: unit-level indent tests in `paste-google-docs.test.ts`; E2E in `e2e/tests/paste-google-docs.spec.ts` 'indented paragraph keeps its left indent' — margin-left:36pt→720)

## Heading detection

- [x] Detect heading-like paragraphs by font-size + font-weight (evidence: 7ed722d1, `headingLevelForSize` at `PasteStyleInlinerExtension.ts:426`)
- [x] Convert matching `<p>` elements to `<h1>`-`<h6>` tags before PM parsing (evidence: 7ed722d1, heading conversion at `PasteStyleInlinerExtension.ts:438-485`)
- [x] Map Google Docs font sizes to heading levels (evidence: 7ed722d1, unit tests `paste-google-docs.test.ts:117,217` — heading-like `<p>` → Heading style, 10pt bold → Heading5)
- [x] Test with all heading levels (H1-H6) (evidence: 7ed722d1, e2e `paste-google-docs.spec.ts:151` 'heading-size paragraph pastes as a Heading style' + unit tests `paste-google-docs.test.ts:117-136,217-236`)

## Table cell styles

- [x] Extract `backgroundColor` from `<td>` → cell fill (evidence: 7ed722d1, `td` background moved to `data-bgcolor` at `PasteStyleInlinerExtension.ts:212-226`)
- [x] Extract `verticalAlign` from `<td>` → cell vertical alignment (evidence: `parseCellAttrsFromDOM`/`mapCssVerticalAlign` in `TableExtension/paste.ts:115-155`; unit test 'td vertical-align maps to cell verticalAlign' — top/middle/bottom)
- [x] Extract `padding` from `<td>` → cell margins (evidence: `extractCellMarginsFromCSS` in `TableExtension/paste.ts:97-113`; unit test 'td padding becomes cell margins in twips' — 5pt→100 each side)
- [x] Extract `border` from `<td>` → cell borders (parse width, style, color) (evidence: `extractCellBordersFromCSS` in `TableExtension/paste.ts:71-95`; unit test 'td borders parse width, style, and color' — 1pt solid rgb(0,0,0)→single/8/000000)
- [x] Test with colored and bordered table cells (evidence: unit test 'colored and bordered table cells keep fills on the cell' — FFFF00→FF0000 fill + borders + margins + bottom valign, no highlight leak)

## Testing

- [x] E2E test: paste centered text from Google Docs (evidence: 7ed722d1, `e2e/tests/paste-google-docs.spec.ts:74`)
- [x] E2E test: paste text with 1.5x line spacing (evidence: `e2e/tests/paste-google-docs.spec.ts:194`; 7/7 paste specs green)
- [x] E2E test: paste indented paragraph (evidence: `e2e/tests/paste-google-docs.spec.ts:210`; 7/7 paste specs green)
- [x] E2E test: paste H1/H3 headings (evidence: 7ed722d1, `e2e/tests/paste-google-docs.spec.ts:151` + unit tests `paste-google-docs.test.ts:117,217`)
- [x] E2E test: paste table with colored cells (evidence: 7ed722d1, `e2e/tests/paste-google-docs.spec.ts:165`)
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0; re-verified green after line-height snap + new tests, all 6 packages exit 0)
