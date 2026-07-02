---
'@xcrong/docx-editor-vue': patch
---

Fix outline (and bookmark / find-replace) navigation silently no-op'ing on large documents (≥ the 8-page virtualization threshold). When the target heading sits on a page that virtualization has left as an empty shell, `scrollVisiblePositionIntoView` now uses layout geometry to find the page, scrolls its always-present shell into view so the IntersectionObserver populates it, then re-resolves the exact heading once paint settles — mirroring the React adapter's `usePagedScrollApi` geometric fallback. Previously the helper returned early when no painted element matched, so the scroll never happened. Closes #1032.
