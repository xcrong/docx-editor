---
'@xcrong/docx-editor-core': patch
---

Fix XML part limits before parsing: enforce an independent 20MB XML size cap pre/post inflate with part path in the error, plus parser element-count/depth budgets and bare-DOCTYPE rejection alongside the existing ENTITY guard. Fixes #145
