---
"@xcrong/docx-editor-core": patch
---

Share framework-agnostic kernels between the React and Vue adapters so both stay in lockstep: header/footer tracked-changes merge (`mergeTrackedChangesWithHf`) and revision view lookup (`findViewOwningRevision`), the sidebar-anchor contract (`parseSidebarItemId`/`findSidebarAnchorRange`), hyperlink dialog target/text/range decisions (`resolveLinkDialogTarget`/`setHyperlinkText`/`removeHyperlinkRange`), effective-font cascade (`resolveEffectiveFont`) and shared style resolver (`getSharedStyleResolver`), table-resize step math (`stepColumnResize`/`stepRowResize`/`stepRightEdgeResize`/`pxDeltaToTwips`), and the zoom, font-size, and sidebar-layout step/layout helpers (`utils/zoom`, `utils/fontSize`, `utils/sidebarLayout`). Drops the write-only `hfRid` entry stamp, which had no readers.
