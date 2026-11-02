---
'@xcrong/docx-editor-vue': minor
---

Port the built-in template plugin to the Vue adapter using only core's plugin contract: new `templatePlugin` / `createPlugin` in `@xcrong/docx-editor-vue/plugin-api` (same PM state, sidebar items, and overlay semantics as React, rendered via `h()`), `VueSidebarItem` + `getSidebarItems` on the plugin type, and pixel-identical chip/highlight CSS. Adds a `?template=1` parity smoke spec covering tag detection on both adapters.
