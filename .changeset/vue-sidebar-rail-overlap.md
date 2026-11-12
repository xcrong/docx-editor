---
'@xcrong/docx-editor-vue': patch
---

Fix Vue comments sidebar overlapping the document. The rail was anchored to the scrolling viewport (`left: 50%` of the visible width) instead of the content-width wrapper the page centers in, so whenever the layout overflowed the viewport the rail drifted left over the text (React anchors to the content box, which is why only Vue overlapped). The rail and margin markers now live inside the content-width wrapper, use the shared `SIDEBAR_PAGE_GAP`, and sit above the narrow-overlay backdrop. Margin markers also anchor from engine positions, so resolved comments show markers like React.
