---
'@xcrong/docx-editor-core': patch
---

Converge dual-adapter orchestration into `core/editor/DocxEditorEngine` (T23 engine spine, refs #33): the engine owns the layout compute→paint→scroll-restore pass (`run`), the rAF-coalescing scheduler (`scheduleLayout`), and the transaction→repaint loop (`handleTransaction`/`handleHfTransaction`) behind a dependency-injected `EngineHost`. React and Vue become thin wrappers with zero behavior delta — React keeps its post-commit scroll-restore lifecycle, Vue gains scroll-restore, `painter:painted`, and coalesced HF relayout. Also repairs the visual-regression safety net (rebaselined stale snapshots, `gotoEmpty()` for content-building specs, formatting-bar testid).

Step 4 moves the PM view lifecycle into the engine: `mountBodyView` / `updateBodyViewForDocument` / `destroyBodyView` plus the per-rId HF map (`syncHfViews`, `getHfView(s)`, `destroyHfViews`) behind `host.mountView` / `destroyView`, with body state built by `createBodyEditorState` and HF state by `createHfEditorState`. React's `HiddenProseMirror` / `HiddenHeaderFooterPMs` and Vue's `createEditorView` / `syncHfPMs` become thin wrappers with zero behavior delta; Vue's body view gains the scroll-chrome parity it lacked (`overflow-anchor`, `handleScrollToSelection`, focus/blur guards).

Step 5 lifts the load/save session seam: `engine.load` carries the parse race guard (late parses resolve `null`), and `engine.save` performs the selective-via-agent write with reply-marker injection plus post-save tracker clear. Vue wires a `DocumentAgent` into its composable and delegates both paths, gaining the race guard, selective save, and post-save tracker clear; round-trip verified in Word.
