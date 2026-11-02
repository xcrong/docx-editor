---
'@xcrong/docx-editor-core': patch
---

Fix table rendering fidelity in table-rendering-fidelity: use shared grid placement in `renderTableFragment`/`renderTableRow` so cells after the first merged group and non-first-column `w:vMerge` continuations keep Word columns, offset the table container by `w:tblInd` only (flow mode), and clamp painted height to the measured block height (rows + padding + borders) so following text never overlaps. Core fix covers React and Vue. Adds `table-merge-beyond-first-col` / `table-indentation` / `table-text-overlap` fixtures + `tables.spec.ts` fidelity tests.
