---
'@xcrong/docx-editor-react': patch
---

Remove the unused `EditableImage` component (`components/edit/EditableImage.tsx`), which was never exported from any package entry and had no internal references. Image rendering and resize now go through the layout painter and `useImageInteractions`. Fixes #149.
