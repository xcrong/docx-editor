---
'@xcrong/docx-editor-vue': patch
---

Fix Vue sidebar comment cards stacking at the rail top with no anchor. The first layout read a still-null editor view so engine anchors came back empty, and the sidebar didn't re-resolve once anchors arrived. Fixes #109.
