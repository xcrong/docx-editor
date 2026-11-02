# Tasks: Table Rendering Fidelity

## Investigation

- [x] Audit merged cell span tracking in `renderTable.ts`
- [x] Check table indentation source (w:tblInd vs paragraph indent)
- [x] Identify table height measurement in layout flow
- [x] Check if `w:tblHeader` is parsed and available in PM node attrs
- [x] Create test DOCX with: complex merges, wide table, multi-page table with headers

## Merged cells

- [x] Fix grid column index tracking for cells after first merged group
- [x] Handle `w:vMerge` continue markers correctly for non-first columns
- [x] Test with complex merge patterns (L-shaped merges, multi-column + multi-row)

## Table indentation

- [x] Use only `w:tblInd` for table container left offset
- [x] Remove any inherited paragraph indent on table wrapper

## Table/text overlap

- [x] Ensure table block height includes all rows + padding + borders
- [x] Verify following content starts after table's measured height

## Adaptive margins

- [x] Detect when total column width exceeds content area
- [x] Scale column widths proportionally to fit within content area

## Table pagination

- [x] Detect when table crosses page boundary
- [x] Re-render header rows (`w:tblHeader`) at top of continuation fragment
- [x] Split rows at paragraph boundaries, not mid-line
- [x] Coordinate fragment heights across all cells in a split row

## Testing

- [x] E2E test: complex merged cells (beyond first column)
- [x] E2E test: table indentation matches Word
- [x] E2E test: table followed by text — no overlap
- [x] E2E test: wide table fits within page
- [x] E2E test: multi-page table with repeated headers
- [x] Run `bun run typecheck`
