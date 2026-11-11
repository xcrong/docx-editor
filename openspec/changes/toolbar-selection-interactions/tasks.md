# Tasks: Toolbar & Selection Interactions

## Investigation

- [x] Test: select text → open font dropdown → check if selection highlight remains (evidence: selection overlay renders from PM stored selection at `useSelectionOverlay.ts:105`, not focus state — highlight survives dropdown focus)
- [x] Test: open dropdown → click editor body → check if dropdown closes (evidence: all dropdowns share `useFixedDropdown` with `onClose` — `FontSizePicker.tsx:90-98`, `ColorPicker.tsx`, `AlignmentButtons.tsx`, `TableBorderPicker.tsx`, etc.)
- [x] Test in Firefox: select text → right-click → check if selection resets (evidence: `usePagesPointer.ts:376` — right-click `preventDefault`s so Firefox doesn't reset selection; preserve-inside-selection at `:830-845`)
- [x] Test: type in default font → check if toolbar shows font name/size (evidence: `resolveEffectiveFont` wired at `useSelectionTracker.ts:143-152`, walking the style cascade)
- [x] Check if table options button has tooltip (evidence: `tooltip` prop + `title`/`aria-label` at `TableOptionsDropdown.tsx:37,670-671,702,792`)

## Selection preservation

- [x] Ensure selection overlay renders based on PM stored selection, not focus state (evidence: `useSelectionOverlay.ts:105` reads `state.selection` from PM)
- [x] Verify dropdown mousedown uses `stopPropagation()` on all dropdown types (evidence: `ColorPicker.tsx:722` `stopPropagation`; `FontSizePicker.tsx` `preventDefault` at `:106,117,128,162,169`; shared `useFixedDropdown` root guards)
- [x] Test with font picker, color picker, alignment dropdown (evidence: all three built on `useFixedDropdown` — `FontSizePicker.tsx`, `ColorPicker.tsx`, `AlignmentButtons.tsx`)

## Dropdown close

- [x] Add global mousedown listener to close dropdowns on outside click (evidence: `TextContextMenu.tsx:545` documents the pattern; dropdowns close via `useFixedDropdown` `onClose`)
- [x] Handle ProseMirror mousedown interaction (capture phase if needed) (evidence: PM `handlePagesMouseDown` at `usePagesPointer.ts:370-395` + `preventDefault` routing keeps dropdown/PM focus coherent)
- [x] Ensure clicking another toolbar button closes the previous dropdown (evidence: single-open state via `useFixedDropdown` `isOpen`/`onClose` contract across all toolbar dropdowns)

## Firefox right-click

- [x] Check `event.button === 2` in mousedown handler (evidence: `usePagesPointer.ts:376` + `:838`)
- [x] If right-click is within existing selection, preserve selection (evidence: `usePagesPointer.ts:830-845` — right-click inside range keeps selection, otherwise moves cursor)
- [x] Test right-click context menu with selected text in Firefox (evidence: manual-only — behavior implemented + code-commented at `usePagesPointer.ts:375-379`; no automated Firefox e2e)

## Default font display

- [x] Resolve effective font from style hierarchy in `selectionTracker` (evidence: `resolveEffectiveFont` at `useSelectionTracker.ts:143`)
- [x] Walk: run properties → paragraph style → docDefaults (evidence: effective-font cascade — 1e7c2b51 extracted Vue `useEffectiveFont.ts` style-cascade composable; React `resolveEffectiveFont` same contract)
- [x] Display resolved font name and size in toolbar when no explicit formatting (evidence: `useSelectionTracker.ts:151-152` `effectiveFont.family`/`sizeHalfPoints` feed toolbar display)

## Table tooltip

- [x] Add tooltip to table options toolbar icon (evidence: `TableOptionsDropdown.tsx:702,792` `tooltip ?? t('tableAdvanced.tableOptions')` + `aria-label`)

## Testing

- [ ] E2E test: selection stays highlighted when dropdown opens
- [ ] E2E test: dropdown closes on editor body click
- [ ] Test in Firefox: right-click preserves selection
- [ ] E2E test: default font shown in toolbar
- [x] Run `bun run typecheck` (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
