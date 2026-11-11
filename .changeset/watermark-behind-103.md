---
'@xcrong/docx-editor-core': patch
---

Fix header-anchored behind-doc text boxes (e.g. the demo CONFIDENTIAL watermark) painting above body text at the header band. The HF text-box branch now carries behind → z-index 0 with a page-center vertical anchor (floating-image parity), the body content area paints at z-index 1 so text stays above the watermark exactly like Word, and floating text boxes exempt headers/footers from band clipping. Fixes #103.
