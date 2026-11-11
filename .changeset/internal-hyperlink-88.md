---
'@xcrong/docx-editor-core': patch
'@xcrong/docx-editor-react': patch
'@xcrong/docx-editor-vue': patch
---

Internal hyperlinks (`w:hyperlink w:anchor`) now navigate to their bookmark in both adapters: clicking a `#bookmark` link scrolls the viewport to the bookmarked paragraph, and the HyperlinkPopup "go" action plus the context-menu "open link" item do the same instead of opening a blank tab. Unknown bookmarks are a silent no-op; external links are unchanged. Also fixes Vue clicks on painted links being swallowed by a selection-triggered relayout, which broke external-link popups there too. Fixes #88.
