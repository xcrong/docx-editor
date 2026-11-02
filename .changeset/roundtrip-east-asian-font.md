---
'@xcrong/docx-editor-core': patch
---

Fix East Asian font round-trip: preserve all four `w:rFonts` slots (ascii/hAnsi/eastAsia/cs) plus theme refs through the ProseMirror round-trip, emit the schema spelling `w:cstheme`, and stop inventing `w:cs` from `ascii`. DengXian/SimSun documents no longer collapse to Arial on save.
