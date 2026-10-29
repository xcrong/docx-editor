---
'@xcrong/docx-editor-core': patch
---

Fix comment + tracked-change DOCX round-trip serialization (§8): parse self-written `commentsExtensible.xml` (durableId via `commentsIds.xml`) so UTC dates survive re-save, thread cross-paragraph comment ranges through `toProseDoc`, render comment id 0 highlights, and add round-trip unit + e2e coverage.
