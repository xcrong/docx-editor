# Tasks: Cursor Navigation & Auto-Scroll

> 对账基线：main e9771c0e，分支 `fix/t30-nav-autoscroll-73`。
> 复现/回归 e2e：`e2e/tests/cursor-navigation-autoscroll.spec.ts`（React）、
> `e2e/tests/vue/cursor-navigation-autoscroll.spec.ts`（Vue），共享
> `e2e/helpers/cursor-nav-autoscroll.ts`。证据见 design.md"T30 对账记录"。

## Investigation

- [x] Trace arrow-down behavior in `useVisualLineNavigation` — identify where cursor jumps or stops
  - 证据：React 版逐行一致（10×ArrowDown anchor 递增、步长≈1行），无需改动；
    Vue 根本没接线（`useDocxEditor` 未调用 composable）→ 已修复接线。
- [x] Test drag-select near viewport edges — confirm no auto-scroll occurs
  - 证据：与 issue 原文相反——双端 auto-scroll 早已存在（core
    `computeAutoScrollDelta` + 双端 rAF loop）。真 bug 是选区延伸错乱
    （HF 坐标污染、滚动条落空），已修复，e2e 通过。
- [x] Test selection across a split paragraph spanning two pages
  - 证据：机制本就成立（fragment 共享 PM 区间 + rect/命中天然连续）；
    之前失败是场景 2 bug 连带。修复后双端通过，无 painter 改动。
- [x] Identify how `getPositionFromMouse` handles split block DOM elements
  - 证据：`clickToPositionDom` 经 `elementsFromPoint` 直接命中 fragment
    内 span，无需特殊处理；本次只加了 `bodyOnly` 作用域选项。

## Arrow key navigation

- [x] Fix visual line stepping to handle page boundaries
  - React 已实现（`scrollIntoViewIfNeeded` 手算滚动）；Vue 补接线
    （`useDocxEditor.mountView` body 分支 `handleKeyDown`）。
- [x] Fix cursor movement through split paragraphs
  - 已实现：lines 列表按 DOM 顺序含双 fragment，无需改动（e2e 覆盖）。
- [x] Maintain horizontal position (X coordinate) across line movements
  - 已实现：sticky X（core `VisualLineState` + 双端复用）。
- [x] Handle edge case: cursor at last line of page → first line of next page
  - 已实现：按可视行索引步进天然跨页；e2e 断言到底部自动滚动且增量 < 视口高。

## Auto-scroll on keyboard

- [x] After PM selection change, get visual cursor position
  - 已实现（`handleVisualLineKeyDown` 内 `findPositionOnLineAtClientX`）。
- [x] If cursor outside viewport, `scrollIntoView({ block: 'nearest' })`
  - 已实现——用手算滚动代替原生调用（zoom transform 下原生错位），
    滚动量为溢出 + 40px margin（一行量级非整页）。
- [x] Handle both up and down scroll directions
  - 已实现（core/React/Vue 三处同一算法）。
- [x] Smooth scroll behavior
  - 如实记录：未做 smooth 动画——逐行按键场景下逐帧跟随即预期体验，
    不引入额外改动。

## Auto-scroll during drag-select

- [x] Detect mouse position near viewport edges during mousedown+mousemove
  - 已实现（40px `AUTO_SCROLL_EDGE_ZONE`，双端一致）。
- [x] Start scroll timer when within threshold (~30px from edge)
  - 已实现（rAF loop；阈值为 40px，按 core 常量，design 原文 30px 为约数）。
- [x] Scroll speed proportional to distance beyond edge
  - 已实现（core `computeAutoScrollDelta` 线性 ramp，未重写，满足约束）。
- [x] Continue extending selection as new content becomes visible
  - 已修复两处落空：HF/页眉页脚坐标污染（`bodyOnly`）与原生滚动条落空
    （tick 按 `delta` 符号向内重试一个 edge-zone）。
- [x] Clean up timer on mouseup
  - 已实现 + 加强：mouseup 停止外，离开边缘区/滚动到头即停（省 rAF）；
    React 补 unmount 清理。

## Cross-page selection

- [x] Map coordinates from split block fragments to correct PM positions
  - 已实现（`elementsFromPoint` 命中 fragment span；e2e 断言 anchor 落在
    span PM 区间内）。
- [x] Ensure selection highlights continuously through split blocks
  - 已实现（`getSelectionRectsFromDom` 双 fragment 均命中；e2e 断言跨页
    文本连续 `aTail`/`bHead`）。
- [x] Test selection starting on page N, ending on page N+1 through split paragraph
  - e2e 已覆盖（双端各 1 组，6000 字符单段跨页 + 边缘自动滚动衔接）。

## Testing

- [x] E2E test: arrow-down through multi-page document
  - `cursor-navigation-autoscroll.spec` arrow 用例（双端）。
- [x] E2E test: arrow-down scrolls page when cursor reaches bottom
  - 同上（断言滚动发生、增量 < 视口高、caret 留在视口内）。
- [x] E2E test: drag-select triggers auto-scroll near bottom edge
  - drag 用例（双端；落点压滚动条，覆盖落空重试分支）。
- [x] E2E test: selection through split paragraph across pages
  - split 用例（双端）。
- [x] Run `bun run typecheck`
  - 全绿（6 包）。API 快照：core `layout-bridge*.api.md` 2 文件漂移已
    rebuild + `api:extract` 同步；React/Vue 无公开表面变更。
