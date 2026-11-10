---
'@xcrong/docx-editor-core': patch
---

Sidebar anchors: the PM+layout anchor computation is now a shared core kernel (`computeCommentAnchorPositions`), fixing Vue comment cards stacking at the top in virtualized long documents. React delegates to the same kernel (no behavior change).
