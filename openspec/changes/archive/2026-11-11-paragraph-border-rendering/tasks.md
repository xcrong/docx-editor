# Tasks: Paragraph Border Rendering

## Investigation

- [x] Verify parser stores `between` and `bar` in paragraph border properties
- [x] Check if border types include `between` and `bar` in `src/types/formatting.ts`
- [x] Check current border rendering in `renderParagraph.ts` — confirm only 4 sides handled
- [x] Create/find test DOCX with `w:pBdr/w:between` and `w:pBdr/w:bar`

## Implementation

- [x] Add `bar` border rendering in `renderParagraph.ts` — vertical line on left edge
- [x] Add `between` border rendering in `renderParagraph.ts`:
  - [x] Detect if next sibling paragraph shares same border group
  - [x] Render horizontal separator at bottom of paragraph (except last in group)
- [x] Handle border style/width/color conversion for both types

## Testing

- [x] Add E2E test with `between` borders between grouped paragraphs
- [x] Add E2E test with `bar` borders on paragraphs
- [x] Visual comparison against Word rendering
- [x] Run `bun run typecheck`
