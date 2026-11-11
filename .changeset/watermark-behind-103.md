---
'@xcrong/docx-editor-core': patch
---

Fix header-anchored behind-doc text boxes (e.g. the demo CONFIDENTIAL watermark) painting above body text at the header band. The HF text-box branch now carries behind → z-index -1 and resolves the vertical anchor (page-center) like floating images. Fixes #103.
