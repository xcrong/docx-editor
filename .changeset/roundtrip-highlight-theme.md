---
'@xcrong/docx-editor-core': patch
---

Fix highlight + theme-color OOXML round-trip: theme-only run colors now serialize with a valid `w:val` fallback alongside `w:themeColor`/`w:themeTint`/`w:themeShade`, theme-only table cell fills no longer drop the resolved `w:fill`, and textColor marks no longer leak null attrs through the ProseMirror round-trip.
