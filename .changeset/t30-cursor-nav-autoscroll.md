---
'@xcrong/docx-editor-core': patch
'@xcrong/docx-editor-react': patch
'@xcrong/docx-editor-vue': patch
---

fix: cursor navigation auto-scroll and cross-page split-paragraph selection (fixes #73)

ArrowUp/Down now steps one painted visual line in Vue too (it previously fell back to document-offset stepping with no painted-line scrolling); drag-selecting to the viewport edge auto-scrolls without corrupting the selection when the pointer slides over a header, footer, or the native scrollbar; and the auto-scroll loop parks when the pointer leaves the edge zone. Fixes #73.
