---
'@xcrong/docx-editor-core': patch
---

Fix slow media data URL generation by replacing per-byte string concatenation with chunked base64 encoding. Fixes #146.
