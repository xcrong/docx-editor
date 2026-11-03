---
'@xcrong/docx-editor-core': patch
---

Table editing polish (T12): every inter-column border is now draggable (column handles paint above row boxes but below row/edge handles; nested tables intentionally stay handle-free), clamped drags no longer desync the handle so columns drag back to origin, spanning cells stay consistent with the grid on resize, and added rows inherit the reference row's paragraph formatting (alignment, spacing, default run font), header-band membership, and cell type while starting empty, unlisted, and untracked. Fixes #20
