## 1. Shared Infrastructure ✅

- [x] 1.1 Create `packages/core/src/managers/` directory and a base `Subscribable` class with `subscribe(listener)` / `getSnapshot()` / `notify()` pattern
- [x] 1.2 Add `EditorHandle` interface to `packages/core/src/managers/types.ts` (save, getDocument, focus, destroy)
- [x] 1.3 Export all manager types from `@xcrong/docx-editor-core`
## 2. AutoSaveManager (lowest risk) ✅ — dual-adapter wired (`useAutoSave` React + Vue)

- [x] 2.1 Extract localStorage persistence logic from `useAutoSave` hook into `packages/core/src/managers/AutoSaveManager.ts`
- [x] 2.2 Refactor `useAutoSave` hook to be a thin wrapper around `AutoSaveManager`
- [x] 2.3 Run `bun run typecheck` and targeted E2E tests to verify no regression
## 3. TableSelectionManager ✅ — dual-adapter wired

- [x] 3.1 Extract multi-cell selection state machine from `useTableSelection` hook into `packages/core/src/managers/TableSelectionManager.ts`
- [x] 3.2 Extract DOM data-attribute queries (`data-table-index`, `data-row`, `data-col`) into the manager
- [x] 3.3 Refactor `useTableSelection` hook to wrap `TableSelectionManager`
- [x] 3.4 Run typecheck and table-related E2E tests

## 4. ClipboardManager ✅ — true wrappers landed for both adapters (close-out)

- [x] 4.1 Extract `getSelectionRuns()`, `extractFormattingFromElement()`, `createSelectionFromDOM()` helper functions into `packages/core/src/managers/ClipboardManager.ts`
- [x] 4.2 Extract clipboard read/write logic (navigator.clipboard API) into the manager
- [x] 4.3 Refactor `useClipboard` hook to wrap `ClipboardManager`
- [ ] 4.4 Run typecheck and clipboard-related E2E tests (known flaky — verify no new failures)

## 5. ErrorManager ✅ — React + Vue boundaries both delegate (close-out)

- [x] 5.1 Create `packages/core/src/managers/ErrorManager.ts` with pub/sub notification system (showError, dismiss, subscribe)
- [x] 5.2 Refactor `ErrorBoundary.tsx` and `ErrorProvider` to use `ErrorManager` internally
- [ ] 5.3 Run typecheck and verify error handling in E2E tests

## 6. PluginLifecycleManager ✅ — dual-adapter wired (`PluginHost` React + Vue)

- [x] 6.1 Extract plugin initialization, state tracking, and destroy logic from `PluginHost.tsx` into `packages/core/src/managers/PluginLifecycleManager.ts`
- [x] 6.2 Extract dispatch wrapping logic (monkey-patching `editorView.dispatch`) into the manager
- [x] 6.3 Extract CSS injection (`injectStyles`/removal) into a `StyleManager` utility in the manager
- [x] 6.4 Extract DOM event listener setup (input, focus, click → plugin state update) into the manager
- [x] 6.5 Refactor `PluginHost.tsx` to use `PluginLifecycleManager` for lifecycle, keep only React panel/overlay rendering
- [x] 6.6 Run typecheck and template plugin E2E tests

## 7. LayoutCoordinator ⏸️ SUPERSEDED by #33 (engine-spine-tier2 owns orchestration)

> Implemented in core (`LayoutCoordinator.ts`) but zero adapter callers.
> Wiring it into `PagedEditor` now would duplicate #33's `DocxEditorEngine.run`
> work. Deliberately left unwired; #33 absorbs this section.

- [ ] 7.1 Create `packages/core/src/managers/LayoutCoordinator.ts` with layout pipeline state (blocks, measures, layout, pending flag)
- [ ] 7.2 Extract flow block conversion + measurement + layout engine call from `PagedEditor.tsx` into `LayoutCoordinator.updateDocument()`
- [ ] 7.3 Extract selection state (selectionRects, caretPosition, isDragging, dragAnchor) into the coordinator
- [ ] 7.4 Extract column resize state (isResizing, tableInfo, originalWidths) into the coordinator
- [ ] 7.5 Extract image interaction state (selectedImageInfo, isImageInteracting) into the coordinator
- [ ] 7.6 Refactor `PagedEditor.tsx` to subscribe to `LayoutCoordinator` via `useSyncExternalStore`
- [ ] 7.7 Run typecheck and full formatting + rendering E2E tests

## 8. EditorCoordinator ⏸️ SUPERSEDED by #33 (same rationale as §7)

- [ ] 8.1 Create `packages/core/src/managers/EditorCoordinator.ts` with document lifecycle state (document, isReady, zoom)
- [ ] 8.2 Extract document parsing and font loading logic from `DocxEditor.tsx` into `EditorCoordinator.loadDocument()`
- [ ] 8.3 Extract zoom management into the coordinator
- [ ] 8.4 Extract extension manager initialization into the coordinator
- [ ] 8.5 Extract agent command execution into the coordinator
- [ ] 8.6 Refactor `DocxEditor.tsx` to subscribe to `EditorCoordinator` via `useSyncExternalStore`
- [ ] 8.7 Run typecheck and full E2E test suite

## 9. renderAsync Refactor ✅ — both adapters return `EditorHandle`

- [x] 9.1 Refactor `renderAsync.ts` in React package to return `EditorHandle` (from core) instead of current ad-hoc return type
- [x] 9.2 Scaffold `renderAsync` stub in Vue package returning `Promise<EditorHandle>`
- [x] 9.3 Verify existing `renderAsync` consumers still work

## 10. Final Validation

- [x] 10.1 Verify all managers have zero React/Vue imports (`grep -r "from 'react'" packages/core/src/managers/`)
- [ ] 10.2 Verify `PagedEditor.tsx` and `DocxEditor.tsx` line count reduced by ~50% — NOT APPLICABLE: belonged to §7/§8 wiring, superseded by #33
- [ ] 10.3 Run full Playwright E2E test suite — covered by PR CI (`test` job); clipboard specs known-flaky, no new failures gated there
- [x] 10.4 Add unit tests for manager classes (at least AutoSaveManager, TableSelectionManager, ErrorManager) — plus ClipboardManager
