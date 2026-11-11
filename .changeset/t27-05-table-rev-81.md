---
'@xcrong/docx-editor-core': minor
---

Table row/cell revisions round-trip and suggesting-aware table commands: `trIns`/`trDel`/`trPrChange`/`tblPrExChange` on rows, `cellMarker` (ins/del/merge with `vMerge`/`vMergeOrig`) and `tcPrChange` on cells, `tblPrChange`/`tblGridChange` on tables. Suggesting mode tracks row/column insert/delete, horizontal/vertical merge, split (clears markers), and table/row/cell property edits (`tblGridChange` for grid edits). Fixes #81.
