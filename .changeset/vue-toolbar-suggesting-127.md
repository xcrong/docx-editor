---
'@xcrong/docx-editor-vue': patch
---

Route the Vue toolbar through the suggesting-tracked `commands/*` wrappers (fixes #127): `getCommands()` now overlays the extension manager's bare commands with the same wrapped factories React calls directly, so toolbar run/paragraph/table property edits in suggesting mode mint tracked revisions instead of editing properties in place. Closed-mode behavior is unchanged.
