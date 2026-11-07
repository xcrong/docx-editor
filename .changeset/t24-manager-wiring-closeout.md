---
'@xcrong/docx-editor-core': patch
---

Wire the remaining framework-agnostic managers into both adapters: React/Vue `useClipboard` delegate to `ClipboardManager`, Vue `ErrorBoundary` delegates to `ErrorManager`. No behavior change. Closes #32.
