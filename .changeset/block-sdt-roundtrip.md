---
'@xcrong/docx-editor-core': patch
---

Content controls: an unmodeled block/inline SDT type marker now projects as `unknown` instead of being reported as `richText`, and a block control created in code (no captured `w:sdtPr`) saves with a synthesized, sequence-valid `w:sdtPr`.
