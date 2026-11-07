---
'@xcrong/docx-editor-core': patch
---

Register footnotes/endnotes content types and document relationships when note parts are created from scratch (e.g. `createDocx()` on a notes-free template), so Word and strict consumers resolve `word/footnotes.xml` / `word/endnotes.xml` through relationships instead of part-name fallback.
