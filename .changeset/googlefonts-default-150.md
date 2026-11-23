---
'@xcrong/docx-editor-core': minor
---

Disable the automatic Google Fonts lookup by default so opening a document never egresses to `fonts.googleapis.com` without an explicit `setGoogleFontsEnabled(true)` opt-in. Embedded and system fonts still resolve locally. Fixes #150
