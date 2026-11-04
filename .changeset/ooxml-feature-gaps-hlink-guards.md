---
'@xcrong/docx-editor-core': patch
---

DrawingML image hyperlinks and parse crash guards (T16): complete the `a:hlinkClick` chain so inline/block/floating/footer images render as clickable links and round-trip the relationship on save, and add parse-time guards (zip path traversal, ENTITY rejection, SDT depth and block/row/cell caps, image extent clamp). Fixes #24
