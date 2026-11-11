# Design: Cursor Navigation & Auto-Scroll

## Architecture context

Our editor has a hidden ProseMirror instance (off-screen, receives keyboard input) and visible pages (layout-painter DOM). The `useVisualLineNavigation` hook handles arrow key mapping between PM positions and visual line positions on the painted pages.

## Arrow key navigation

The `useVisualLineNavigation` hook maps PM document positions to visual coordinates on painted pages. Issues arise when:

- Visual line breaks don't correspond to PM document structure
- Split paragraphs across pages create discontinuities in visual position mapping
- The cursor position in the hidden PM doesn't always map to a visible position

**Fix:** Improve `getPositionFromMouse()` and visual line mapping to handle:

1. Lines at page boundaries
2. Split paragraphs that span pages
3. Consistent vertical stepping (same X position, next visual line Y)

## Auto-scroll on keyboard navigation

After each cursor movement, check if the new cursor position is visible in the viewport. If not, scroll to make it visible.

```
1. After PM selection change → get visual position of cursor
2. Check if position is within viewport bounds
3. If below viewport → scrollIntoView with block: 'nearest'
4. If above viewport → scrollIntoView with block: 'nearest'
```

## Auto-scroll during drag-select

During mousedown+mousemove (drag selection):

1. Track mouse Y relative to viewport edges
2. If mouse is within ~30px of top/bottom edge, start auto-scroll timer
3. Scroll at speed proportional to distance beyond edge
4. Continue extending selection as scroll reveals new content
5. Stop auto-scroll on mouseup

## Cross-page split block selection

When a paragraph is split across pages, it renders as two separate DOM elements. The `getPositionFromMouse` function needs to map coordinates from either fragment back to the correct PM position, treating both as part of the same paragraph.

## Key files

| File                                          | Change                                    |
| --------------------------------------------- | ----------------------------------------- |
| `src/paged-editor/PagedEditor.tsx`            | Drag-select auto-scroll, scroll-into-view |
| `src/paged-editor/useVisualLineNavigation.ts` | Arrow key line mapping                    |
| `src/paged-editor/getPositionFromMouse.ts`    | Position mapping for split blocks         |

## T30 对账记录 (issue #73, main e9771c0e)

2026-11-11 在 `fix/t30-nav-autoscroll-73` 上逐场景复现（React+Vue 双端 e2e：
`e2e/tests/cursor-navigation-autoscroll.spec.ts`、
`e2e/tests/vue/cursor-navigation-autoscroll.spec.ts`，共享
`e2e/helpers/cursor-nav-autoscroll.ts`），结论如下。已实现的不留空、
只修真正坏的。

### 场景 1 — 方向键逐行导航（期望：一次一行、到底部自动滚一行）

- **现状**：React 早已实现。`useVisualLineNavigation`（sticky X +
  `scrollIntoViewIfNeeded` 手算滚动，一行量级）+ `handlePMKeyDown`
  接在 body EditorView 上；core 有同算法
  `prosemirror/utils/visualLineNavigation.ts`。10 次 ArrowDown：
  anchor 严格递增、caret Y 步长 ≈ 1 行、到底部 scroller 跟随且增量 <
  视口高。**无需改动**。
- **坏的（Vue）**：`useVisualLineNavigation` composable 存在但
  `useDocxEditor.ts` 从未调用、body view 没装 `handleKeyDown`——Vue
  回退到 PM 文档偏移步进。**已修**：`mountView` body 分支加
  `handleKeyDown: (view, event) => visualLineNav.handlePMKeyDown(...)`。
- **坏的（core，与 React 不一致）**：core 版 span 查询未限定 body
  作用域（HF 文档位置与 body 数字重叠时会误命中页眉/页脚），React
  本地版用 `findBodyPmSpans`。**已修**：core 改用
  `findBodyPmSpans`/`findBodyEmptyRuns`；React hook 删除 ~280 行重复
  实现，改为 core 的薄封装（与 Vue 同构）。

### 场景 2 — 拖选边缘自动滚动（期望：变速滚动、选点延伸、离开停止）

- **现状**：已实现。`computeAutoScrollDelta`（core，40px 边缘区、
  12px/frame 封顶）+ 双端 `useDragAutoScroll` rAF loop + tick 内
  `onScrollExtendSelection` 延伸选区；React e2e 通过。**主体无需改动**。
- **坏的（双端，实测）**：
  1. 指针滑过页眉/页脚时 `clickToPositionDom` 返回 HF 文档坐标并作用
     到 body PM，选区收缩错乱（React 复现：滚动发生但选区 509→17）。
     **已修**：core 新增 `ClickToPositionDomOptions.bodyOnly`（header/
     footer 命中过滤 + fallback 限定 `.layout-page-content`），正常
     模式双端传入 `bodyOnly: true`，HF 编辑模式保持原行为。
  2. 落点压在原生滚动条上时 `elementsFromPoint` 返回空，tick 空转、
     选区冻结（Vue 复现：scrollTop 10→750 但选区停在 581）。
     **已修**：双端 tick 回调新增 `delta` 参数，落空时向内容区内
     重试一个 edge-zone（`Math.sign(delta)` 方向）。
  3. loop 离开边缘区/到头后仍空转到 mouseup；React 卸载无清理。
     **已修**：delta 为 0 或到滚动极限即停（下次 mousemove 重 arm）；
     React 补 `useEffect` unmount `stopAutoScroll`（Vue 已有）。

### 场景 3 — 跨页拆分段选择（期望：`data-continues-*` 连续选中）

- **现状**：painter 按 fragment 渲染但 PM 区间不变；
  `getSelectionRectsFromDom` 遍历重叠 span、双 fragment 均命中；
  `clickToPositionDom` 走 `elementsFromPoint` 天然跨 fragment。
  **机制本就成立**，之前失败纯属上述场景 2 的两个 bug（页脚污染 +
  滚动条落空）连带。修复后双端 e2e 通过（含 aTail/bHead 文本断言）。
  **无 painter/DOM 契约改动**。

### 未改动（刻意）

- HF EditorView 不装 visual-line 导航（与 React 现状一致，保持 parity）。
- 位移计算仍只用 core `computeAutoScrollDelta`，适配器无重写（满足约束）。
- `ClickToPositionDomOptions` 为可选新增参数，后兼容；API 快照已
  `rebuild + api:extract`（`layout-bridge*.api.md` 2 文件）。
- docs/site `word-features.ts` 矩阵无 caret/拖选条目，不涉及表面变更。
