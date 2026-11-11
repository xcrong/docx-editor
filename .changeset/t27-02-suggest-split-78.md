---
'@xcrong/docx-editor-core': patch
'@xcrong/docx-editor-i18n': patch
---

Suggesting-mode structural revisions (T27-02, fixes #78): the Enter handler now delegates the split to the shared `splitBlockClearBorders` (one undo step, no style-inheritance drift); Backspace/Delete over a multi-paragraph selection marks inline deletions plus `pPrDel` on fully-covered paragraph marks; paragraph-property commands (alignment, indent, line spacing, style, spacing, tabs, bidi, section breaks) snapshot priors into `pPrChange` via `withSuggestingSnapshot` while suggesting is off behavior is unchanged. Enforces `w:rPrChange` as the last child of `w:rPr`. Adds the four missing `revisions.*` i18n keys (`paragraphMarkPropertiesChanged`, `sectionPropertiesChanged`, `runPropertiesChanged`, `tableGridChanged`).
