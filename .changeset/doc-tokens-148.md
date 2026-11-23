---
'@xcrong/docx-editor-core': patch
'@xcrong/docx-editor-react': patch
'@xcrong/docx-editor-vue': patch
---

Replace hardcoded chrome colors with `--doc-*` tokens: the title-bar doc icon now uses stable `--doc-doc-icon-*` tokens, sidebar avatar/submit text uses `--doc-on-primary`, and the loading overlay scrim uses `--doc-overlay` (the unused `overlayOpacity` prop is kept for API compat). Fixes #148.
