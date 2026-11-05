---
'@xcrong/docx-editor-core': patch
---

Google Docs paste fidelity (T15): preserve alignment, fonts, lists and table cell styling when pasting from Google Docs. Parse rgb()/rgba() text and highlight colors, keep table cell fills on the cell (no highlight leak into cell text), convert heading-size paragraphs to Heading styles, flatten pasted lists into numbered/bullet paragraphs (with nesting levels), support super/subscript from vertical-align styles, and run pasted HTML through a DOMPurify tag/attribute allowlist. Fixes #23
