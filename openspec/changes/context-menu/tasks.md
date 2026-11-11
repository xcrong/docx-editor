## 1. Context Resolution Infrastructure

- [x] 1.1 Create `packages/core/src/prosemirror/utils/contextResolver.ts` — implement `resolveContext(state, pos)` that inspects PM doc at a resolved position and returns `ContextInfo` object (`isTextSelected`, `isInTable`, `isOnImage`, `isOnHyperlink`, plus metadata like table row/col count, link href, image node ref) (evidence: 1e7c2b51, `packages/core/src/prosemirror/utils/contextResolver.ts`)
- [x] 1.2 Add unit tests for context resolver covering all scenarios: plain text, inside table, on image, on hyperlink, overlapping contexts (link in table), selected text vs cursor-only (evidence: 1e7c2b51, `packages/core/src/prosemirror/utils/contextResolver.test.ts`)

## 2. Icons

- [x] 2.1 Audit `packages/react/src/components/ui/Icons.tsx` and `iconMap` for which context menu icons already exist vs need to be added. Required icons: `content_cut`, `content_copy`, `content_paste`, `content_paste_off`, `delete`, `add_comment`, `insert_link`, `link_off`, `open_in_new`, `format_clear`, `image`, `alt_text`, `wrap_text`, `table_rows`, `add_row` (or similar row/column insert icons), `delete_row`, `delete_column`, `cell_merge`, `split_scene` (or similar split icon) (evidence: 1e7c2b51, audit recorded in `packages/react/src/components/ui/contextMenuIcons.tsx` header — `insert_link`/`alt_text` don't exist in Material Symbols so `add_link`/`description` substitute; `delete`/`table_rows`/`call_merge`/`call_split` already in `Icons.tsx` iconMap)
- [x] 2.2 For each missing icon, download the SVG path from https://fonts.google.com/icons (Material Symbols, weight 400, grade 0, optical size 24), create an inline React component in `Icons.tsx` using the `SvgIcon` wrapper, and register it in `iconMap` (evidence: 1e7c2b51, `packages/react/src/components/ui/contextMenuIcons.tsx` merged into `Icons.tsx` iconMap via `contextMenuIconMap` spread at `Icons.tsx:966`)

## 3. Context Menu Component

- [x] 3.1 Create `packages/react/src/components/useContextMenu.ts` hook — manages open/close state, click position, resolved context. Handles outside click, scroll, and Escape to close. Handles re-opening on subsequent right-clicks. (evidence: 1e7c2b51, implemented as `packages/react/src/components/DocxEditor/hooks/useContextMenus.ts` — open/close state + click position + click-scoped `ContextInfo`; outside-click/scroll/Escape close in `packages/react/src/components/TextContextMenu.tsx:531-552`)
- [x] 3.2 Create `packages/react/src/components/ContextMenu.tsx` — renders menu items as a `position: fixed` overlay. Supports keyboard navigation (ArrowUp/Down, Enter, Escape). Viewport-aware positioning (flips when near edges). Items rendered from `{ id, label, icon?: string, shortcut?, disabled?, separator?, action }` data. Icons rendered via `<MaterialSymbol name={item.icon} />`. All interactive elements use `onMouseDown` with `preventDefault` + `stopPropagation` to preserve PM focus. (evidence: 1e7c2b51, `packages/react/src/components/ContextMenu.tsx` — keyboard nav :410-419, viewport flip :443-457, `preventDefault` :559)
- [x] 3.3 Style the context menu to match existing dropdown aesthetics (MenuDropdown/TableOptionsDropdown) — white background, subtle shadow, rounded corners, hover states, disabled styling, separator lines, shortcut text right-aligned, icon left-aligned (evidence: 1e7c2b51, `packages/react/src/components/ContextMenu.tsx:471` uses `var(--doc-shadow)` shared chrome tokens)

## 4. Menu Item Providers

- [x] 4.1 Create `packages/react/src/components/contextMenuItems.ts` — implement `getBaseItems(context)` returning clipboard items (Cut, Copy, Paste, Paste without formatting, Delete) with icon names (`content_cut`, `content_copy`, `content_paste`, `content_paste_off`, `delete`), correct disabled states based on selection, and platform-aware shortcut labels (Cmd vs Ctrl) (evidence: 1e7c2b51, `getBaseItems` at `contextMenuItems.ts:23`, shortcuts via i18n `contextMenu.*Shortcut` + `formatKeys`)
- [x] 4.2 Implement `getTextItems(context)` — returns Comment (`add_comment`), Insert link (`insert_link`), Clear formatting (`format_clear`) items. Only included when text is selected. (evidence: 1e7c2b51, `getTextItems` at `contextMenuItems.ts:62`)
- [x] 4.3 Implement `getTableItems(context)` — returns Insert row above/below, Insert column left/right, Delete row/column/table, Merge cells, Split cell items with appropriate icons. Only included when `isInTable`. Merge/split conditionally shown based on multi-cell selection and merged cell state. (evidence: 1e7c2b51, `getTableItems` at `contextMenuItems.ts:75`)
- [x] 4.4 Implement `getImageItems(context)` — returns Image properties (`image`), Wrap options (`wrap_text`), Alt text (`alt_text`) items. Only included when `isOnImage`. (evidence: 1e7c2b51, `getImageItems` at `contextMenuItems.ts:124`)
- [x] 4.5 Implement `getLinkItems(context)` — returns Edit link (`insert_link`), Remove link (`link_off`), Open link (`open_in_new`) items. Only included when `isOnHyperlink`. (evidence: 1e7c2b51, `getLinkItems` at `contextMenuItems.ts:131`)
- [x] 4.6 Implement `composeMenuItems(context)` — combines all providers with separator dividers between groups, filters empty groups (evidence: 1e7c2b51, `composeMenuItems` at `contextMenuItems.ts:149`)

## 5. PagedEditor Integration

- [x] 5.1 Add `onContextMenu` handler to the pages container in `PagedEditor.tsx` — calls `preventDefault`, maps click to PM position via `getPositionFromMouse`, updates selection (move cursor if outside selection, preserve if inside), resolves context, opens menu (evidence: 1e7c2b51, `handlePagesContextMenu` at `PagedEditor.tsx:886,913` + preserve-inside-selection logic in `usePagesPointer.ts:830-845`)
- [x] 5.2 Wire menu item actions to existing editor commands — clipboard via Clipboard API on the hidden PM, table operations via `TableExtension` commands, link operations via Hyperlink commands, comment via comment flow, formatting via `clearFormatting` command (evidence: 1e7c2b51, `useMenuActionCallbacks.ts` + `TableExtension`/`clearFormatting`/`sanitizeHref` imports wired in `useContextMenus.ts:6-29`)
- [ ] 5.3 Delete or replace `TextContextMenu.tsx` and `useTextContextMenu` hook with the new generic implementation

## 6. Testing & Polish

- [ ] 6.1 Add Playwright E2E tests for context menu: right-click shows menu, clicking items executes actions, keyboard navigation works, menu closes on outside click/Escape, menu positioned correctly near viewport edges
- [x] 6.2 Add Playwright tests for table context: right-click in table shows table items, insert/delete row/column operations work from context menu (evidence: `e2e/tests/table-context-menu.spec.ts` — merge/split/insert-row, multi-row delete #762, split-cell)
- [ ] 6.3 Verify context menu works correctly with zoom levels and in header/footer editing mode
- [x] 6.4 Run typecheck + full targeted test suite to confirm no regressions (evidence: `bun run typecheck` green @ b9a30c9c — all 5 packages exit 0)
