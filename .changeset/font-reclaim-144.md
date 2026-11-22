---
'@xcrong/docx-editor-core': patch
---

Reclaim injected font faces on document switch and teardown to stop unbounded `<style>` and blob URL growth. Fixes #144
