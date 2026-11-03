---
'@xcrong/docx-editor-core': patch
---

Fix multi-select list indent/outdent: toolbar Indent/Outdent now applies to every list item in the selection in a single transaction (previously only the cursor paragraph changed). Vue toolbar now uses the same list-first fallback as React instead of non-existent indent commands.
