# Tasks: Tab Leader Rendering

## Investigation

- [x] Find tab leader rendering code in layout-painter
- [x] Create/find test DOCX with TOC using dotted tab leaders
- [x] Compare current rendering against Word — identify overlap areas
- [x] Check how tab span width is calculated

## Implementation

- [x] Ensure leader element is clipped to tab span boundaries
- [x] Add left/right padding to prevent text overlap
- [x] Verify all leader types render correctly: dot, hyphen, underscore, heavy, middleDot
- [x] Test with varying text widths (short title vs long title)

## Testing

- [x] E2E test: TOC with dotted leaders — no overlap with titles or page numbers
- [x] E2E test: TOC with dashed leaders
- [x] E2E test: long section title with short leader space
- [x] Visual comparison against Word
- [x] Run `bun run typecheck`
