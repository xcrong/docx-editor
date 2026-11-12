# Demo Showcase DOCX — tasks（对齐 #51 的 T25-01…T25-10）

## T25-01 spike + 建 change（本单元 ✅，见 #52）

- [x] spike：`createEmptyDocument → createDocx → updateMultipleFiles(styles.xml)` 观感三项通过 + 往返结构相等
- [x] 建 `openspec/changes/demo-showcase-docx/{proposal,design,tasks}.md`（不写 `specs/` delta）
- [x] 截图证据入库：`spike-visual.png`

## T25-02 生成器骨架（#53，前置：本单元）

- [x] `scripts/demo/{build-sample-docx.ts,brand.ts,builders.ts,styles.xml,assets/}` + `demo:build`
- [x] §1 文本 §2 段落 §3 表格；`sections/index.ts` 目录自动注册（硬性）
- [x] 一次写 `examples/shared/sample.docx` + 6 份 `public/sample.docx`，7 份 md5 一致

## T25-03 守卫（#54，前置 #53；可与 #55–#58 并行）

- [x] `bun run check:sample-docx`（过期/引用/零引用部件/品牌/副本/往返/体积）+ 挂 CI
- [x] 故意构造失败验证红灯

## T25-04…07 内容单元（#55–#58，前置 #53；互相并行，各只碰自己 section 文件）

- [x] §4 图片（#55）：inline / wrapSquare / wrapTopAndBottom
- [x] §5 结构（#56）：块级 SDT / 复选框/下拉/日期 / 文本框 / 水印
- [x] §6 审阅（#57）：3 组修订 + 2 评论含 1 回复 + 追踪插入图片
- [x] §7 版式（#58）：页眉页脚页码 / 双节横向 / 分栏 / 脚注尾注 / TOC 书签

## T25-08 台账（#59，前置 #55–#58，最后一个内容单元）

- [x] `scripts/demo/coverage.ts`（`DEMOED` / `NOT_DEMOABLE`），只读 `word-features.ts`
- [x] §8 支持情况表从矩阵生成

## T25-09 渲染守卫（#60，前置 #55–#58；可与 #59 并行）

- [x] `e2e/tests/demo-showcase.spec.ts`（见 design.md 验收映射）

## T25-10 品牌收尾（#61，独立可插队）

- [x] `createEmpty.ts:114` + core.xml creator 改本 fork 品牌（1 行级）

## 验证记录（2026-11-12，16/16 收尾）

- `bun run demo:build`：7 份 `31709B`，jc 4 值 / tab 19 / gridSpan / vMerge / tbl 129 / ilvl 0-2 / H1-3 / highlight / vertAlign / strike / 3 作者修订 / ≤400KB 全过。
- `bun run check:sample-docx`：8/8（digest `abf9068d`；43 演示 + 6 豁免 = 49 可编辑，矩阵 80）。
- 副本：7 份 md5 一致（`2b9c7ccf…`）；`check:sample-docx` 挂 CI（`ci.yml:61`）。
- 红灯：§1 改一字 → staleness FAIL（`abf9068d ≠ 2a77d55b`）；删 `DEMOED images.inline` → coverage FAIL 指缺口；均已复原。
- `demo-showcase.spec.ts`：chromium 下 react/vue 各 1 通过（2 passed，2 skipped 为 #60 已知 fixme：inline dropdown 触发器）；修 1 处 spec（comment 收集改读 `data-comment-ids` 复数属性，`runs.ts:182` 契约）。
- `demo-docx.spec.ts`：45 passed。core `typecheck` 通过。`createEmpty` 品牌见 `6318fd06`。
