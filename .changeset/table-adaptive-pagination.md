---
'@xcrong/docx-editor-core': patch
---

Fix table adaptive margins in table-rendering-fidelity: scale table column widths proportionally to fit the content area when the grid total overflows (Word auto-fit, design option 1), so wide tables no longer overflow horizontally. Floating (`w:tblpPr`) tables are exempt. Core fix covers React and Vue. Adds `table-wide-adaptive` / `table-multipage-header` fixtures + `tables.spec.ts` tests for proportional fit and repeated `w:tblHeader` rows on continuation pages.
