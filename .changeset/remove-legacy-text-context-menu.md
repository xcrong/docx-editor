---
'@xcrong/docx-editor-react': major
---

Remove the legacy `useTextContextMenu` hook and its unused helpers (`getDefaultTextContextMenuItems`, `isTextActionAvailable`, `getTextActionLabel`, `getTextActionShortcut`). The generic `TextContextMenu` component driven by `composeMenuItems` is the supported path and is unchanged.
