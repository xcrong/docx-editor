---
'@xcrong/docx-editor-core': patch
---

Lists: saving a document after adding a bullet/numbered list to a file without matching numbering definitions no longer produces a Word "Show Repairs" dialog — missing `w:num` definitions are backfilled on save.
