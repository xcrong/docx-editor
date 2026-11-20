---
'@xcrong/docx-editor-core': patch
'@xcrong/docx-editor-react': patch
'@xcrong/docx-editor-vue': patch
---

Fixed useAutoSave ignoring runtime option changes; callbacks, interval, maxAge, saveOnChange, and debounceDelay now stay live via AutoSaveManager.updateOptions. Fixes #142.
