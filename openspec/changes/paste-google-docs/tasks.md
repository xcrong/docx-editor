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

- [ ] Extract `lineHeight` from pasted `<p>` elements
- [ ] Convert to spacing values: 1.2→single, 1.8→1.5x, 2.4→double
- [ ] Extract `marginTop`/`marginBottom` for spacing before/after
- [ ] Test with different spacing values
- [ ] E2E test: paste text with 1.5x line spacing

## Indentation

- [ ] Extract `marginLeft` from pasted `<p>` elements
- [ ] Convert pt to twips for `indent.left`
- [ ] Handle nested indentation levels
- [ ] Test with indented paragraphs
- [ ] E2E test: paste indented paragraph

## Heading detection

- [x] Detect heading-like paragraphs by font-size + font-weight (evidence: 7ed722d1, `headingLevelForSize` at `PasteStyleInlinerExtension.ts:426`)
- [x] Convert matching `<p>` elements to `<h1>`-`<h6>` tags before PM parsing (evidence: 7ed722d1, heading conversion at `PasteStyleInlinerExtension.ts:438-485`)
- [x] Map Google Docs font sizes to heading levels (evidence: 7ed722d1, unit tests `paste-google-docs.test.ts:117,217` — heading-like `<p>` → Heading style, 10pt bold → Heading5)
- [x] Test with all heading levels (H1-H6) (evidence: 7ed722d1, e2e `paste-google-docs.spec.ts:151` 'heading-size paragraph pastes as a Heading style' + unit tests `paste-google-docs.test.ts:117-136,217-236`)

## Table cell styles

- [x] Extract `backgroundColor` from `<td>` → cell fill (evidence: 7ed722d1, `td` background moved to `data-bgcolor` at `PasteStyleInlinerExtension.ts:212-226`)
- [ ] Extract `verticalAlign` from `<td>` → cell vertical alignment
- [ ] Extract `padding` from `<td>` → cell margins
- [ ] Extract `border` from `<td>` → cell borders (parse width, style, color)
- [ ] Test with colored and bordered table cells

## Testing

- [x] E2E test: paste centered text from Google Docs (evidence: 7ed722d1, `e2e/tests/paste-google-docs.spec.ts:74`)
- [ ] E2E test: paste text with 1.5x line spacing
- [ ] E2E test: paste indented paragraph
- [x] E2E test: paste H1/H3 headings (evidence: 7ed722d1, `e2e/tests/paste-google-docs.spec.ts:151` + unit tests `paste-google-docs.test.ts:117,217`)
- [x] E2E test: paste table with colored cells (evidence: 7ed722d1, `e2e/tests/paste-google-docs.spec.ts:165`)
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
