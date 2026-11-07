---
"@xcrong/docx-editor-core": patch
---

Converge dual-adapter orchestration into `core/editor/DocxEditorEngine` (T23 engine spine, refs #33): the engine owns the layout compute→paint→scroll-restore pass (`run`), the rAF-coalescing scheduler (`scheduleLayout`), and the transaction→repaint loop (`handleTransaction`/`handleHfTransaction`) behind a dependency-injected `EngineHost`. React and Vue become thin wrappers with zero behavior delta — React keeps its post-commit scroll-restore lifecycle, Vue gains scroll-restore, `painter:painted`, and coalesced HF relayout. Also repairs the visual-regression safety net (rebaselined stale snapshots, `gotoEmpty()` for content-building specs, formatting-bar testid).
