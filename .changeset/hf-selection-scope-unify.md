---
'@xcrong/docx-editor-core': patch
'@xcrong/docx-editor-react': patch
'@xcrong/docx-editor-vue': patch
---

Unify header/footer caret/selection resolution onto the shared `DomScope`-aware DOM walks (`getCaretPositionFromDom` / `getSelectionRectsFromDom` with `{ scope: 'hf', host }`), replacing the retired per-adapter `computeHfCaretRectFromView` / `computeHfSelectionRectsFromView` pair. Public surface: removes 3 `@public` helpers (`computeHfCaretRectFromView`, `computeHfSelectionRectsFromView`, `invalidateHfDomCache`) and adds 7 scoped finders (`findBodyParagraphs`, `findHfPmSpans`, `findHfEmptyRuns`, `findHfPmAnchors`, `findHfPmAnchor`, `findHfRanged`, `findHfParagraphs`, plus the `DomScope` / `DomScopeOptions` types). Caret heights are normalized to layout px on every HF fallback path (including `hfCaretFallback` at any zoom); hyperlink runs now resolve to the exact character boundary inside `<a>`-nested text. Defaulting to `patch`: the removed helpers were introduced for the unify-hf-editing workstream and never shipped in a stable release line — if the maintainer judges the removals breaking for adapter authors, please escalate this to `major` before merging.
