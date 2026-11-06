---
'@xcrong/docx-editor-core': patch
---

Unify the text context menu across adapters and show effective fonts in the toolbar. Both editors now resolve right-click context (text, table, image, hyperlink) through a shared core `resolveContext` helper with identical menu items, and the font family/size pickers fall back through the style cascade (docDefaults → Normal → paragraph style) when the cursor carries no explicit run marks.
