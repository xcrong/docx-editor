---
'@xcrong/docx-editor-core': patch
---

Embedded fonts with the same family/weight/style but different bytes now register separately instead of the second document reusing the first document's cached face. Fixes #143.
