---
'@xcrong/docx-editor-core': patch
---

Add comment navigation Schroeder 1.5/4.x/5.x: narrow-container sidebar overlay mode with backdrop, leader-line SVG overlay connecting anchors to cards (rAF scroll tracking, active emphasis), and scroll-only card-to-document navigation. Add tracked-changes review toolbar (Accept/Reject/Accept All/Reject All/Previous/Next, cursor-aware disabled state). Fix overlapping comments stacking (comment mark excludes:"", opacity by overlap count, leader-line multi-id selector), review parity (Vue opt-in display, range selection enables buttons, structural revisions navigable, HF-active view), and fontsblocked config relative import. Fixes #T2
