# Tasks: Tracked Changes Edge Cases

## Investigation

- [x] Check if suggesting mode is implemented and how track-change marks interact with comments
- [x] Test: enter suggesting mode → type text → undo → check if comment is removed
- [x] Test: enter suggesting mode → type "AB" → check comment "Added" text
- [x] Trace comment creation/removal lifecycle during undo

## Orphan comment fix

- [x] After undo transaction, detect orphaned comments (no marks reference them)
- [x] Remove orphaned comments from comment store
- [x] Test with single suggestion → undo → comment removed
- [x] Test with multiple suggestions → undo one → only that comment removed
- [x] Test redo after undo → comment restored

## Extra letter fix

- [x] Identify where comment "Added" text is extracted
- [x] Ensure extraction uses committed PM state (`state.doc.textBetween`)
- [x] Not DOM content or pre-transaction state
- [x] Test: type "ABCD" in suggesting mode → comment shows "ABCD" not "ABCDD"

## Testing

- [x] E2E test: undo last suggestion removes comment
- [x] E2E test: undo one of many suggestions removes only that comment
- [x] E2E test: redo restores suggestion and comment
- [x] E2E test: suggesting mode typing shows correct text in comment
- [x] Run `bun run typecheck`

**Note:** the runtime fixes landed with the suggesting-mode history guard (`isHistoryTransaction` skip, issue #633); the sidebar derives entries from committed PM state, so undo removes the card and no orphan is stored. This change adds the missing regression coverage (`e2e/tests/tracked-changes-edge-cases.spec.ts`) and verifies all scenarios above.
