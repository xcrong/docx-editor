# Demo Showcase DOCX — proposal

## 问题（证据见 #51）

`examples/*/public/sample.docx` 是 demo 站点与 6 个框架 example 的默认打开文档，但：

1. **内容不能代表产品能力**：解包实测 `w:drawing` 0 个、`w:jc` 0、`w:tab` 0、`w:sdt` 0、高亮/上下标/删除线全缺、`w:gridSpan` 0、单节无分栏；`footnotes.xml` 有部件无引用、`comments.xml` 1 条 0 回复。
2. **不可复现**：现文件是手工拼串 OOXML（`docProps` creator `Un-named`、hyperlink rel id 随机串），生成脚本从未入库；上一版是无脚本的 `python-docx` 产物。更新只能手写二进制覆盖 7 个副本。
3. **7 份副本必然分叉**：`examples/shared` 名义共享，实际各 example 自带 `public/` 副本（本次品牌替换已验证：7 份需逐个同步）。

对照 `docs/site/data/word-features.ts`（80 条，41 条 `editing: full`），editing=full 的图片/内容控件/水印/脚注/多节/分栏/制表位/对齐/RTL 在文档中无对应内容。

## 目标

`sample.docx` 从"手工维护的二进制资产"变成**构建产物**：内容写成声明式 manifest（`scripts/demo/sections/*`），`bun run demo:build` 一次生成并分发 7 处；`scripts/demo/coverage.ts` 对着 `word-features.ts` 建台账（`editing !== 'none'` 必有 showcase block 或在 `NOT_DEMOABLE` 登记）；`bun run check:sample-docx` + e2e 渲染守卫进 CI。

## 范围

- 生成器骨架 + §1–§8 内容（文本/段落/表格/图片/结构控件/审阅/版式/支持情况表），见 tasks.md。
- 品牌零硬编码（scope/repo URL/docs URL/npm 链接/演示域名全部从 `packages/*/package.json` 派生）。
- 分发：`examples/shared/sample.docx` + 6 份 `public/sample.docx`，7 份 md5 一致。

## 非目标

- `e2e/fixtures/demo.docx`（1.3 MB calibre 样张）：第三方保真度基准，只读，不碰。
- 渲染/解析 bug 修复：只让 demo 反映现状，暴露的 bug 另开 issue。
- 内容调性大改：保持"前两页样板间、后两页工程 README"结构。
- 任何 capability 契约变更：**不写 `specs/` delta**。
