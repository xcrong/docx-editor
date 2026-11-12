---
'@xcrong/docx-editor-react': patch
---

Fix the text context menu swallowing a keystroke race: pressing Enter (or arrow keys / Escape) while the menu is open no longer leaks through to the editor, where ProseMirror's keymap would delete the current selection before the menu item ran. Menu keys are now intercepted in the capture phase.
