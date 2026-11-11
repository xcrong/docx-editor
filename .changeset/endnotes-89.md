---
'@xcrong/docx-editor-core': patch
'@xcrong/docx-editor-react': patch
'@xcrong/docx-editor-vue': patch
---

fix: render endnote bodies in a document-end sheet with reference/body cross-navigation (fixes #89)

`word/endnotes.xml` parsed fine but the layout chain never consumed endnotes, so note bodies appeared nowhere. Endnote references are now collected alongside footnote references and the referenced bodies render in a trailing sheet after the last page (mirroring the footnote body pipeline, not a new stack). Clicking a body marker scrolls to its note; clicking a note number jumps back to the reference. Fixes #89.
