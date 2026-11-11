---
'@xcrong/docx-editor-core': minor
---

Table revision accept/reject: `trIns`/`trDel` rows (single-row-table removal included), `cellMarker` ins/del (delete-cell + grid adjust) and vertical/horizontal merge apply, `trPrChange`/`tcPrChange`/`tblPrChange`/`tblPrExChange`/`tblGridChange` restore, all in one transaction per revision (cell → row → table order). Painted tables show revision bars, deletion strikethrough, and dashed unaccepted-merge boundaries with `data-revision-id` anchors; sidebar cards cover all table kinds. Fixes #82.
