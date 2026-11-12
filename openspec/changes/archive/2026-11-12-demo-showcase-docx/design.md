# Demo Showcase DOCX — design

## 路线决策：走 dogfood（`createDocx` 自举）

T25-01 spike 结论：**通过，走 dogfood；不退模板路线。**

spike 脚本（未入库，按 #52 约定放 `/tmp/spike-t25-01.ts`，产物 `/tmp/spike.docx` 3.6 KB）：

```ts
const doc = createEmptyDocument();
doc.package.document.content = [headingPara, bodyPara, table3x2];
const buf = await createDocx(doc);
const out = await updateMultipleFiles(buf, new Map([['word/styles.xml', stylesXml]]));
```

其中 `headingPara.formatting.styleId = 'Heading1'`、body 含 `{ bold: true, color: { rgb: 'FF0000' } }` run、table 带 `TableFormatting.borders`（single/size 4）+ `styleId: 'TableGrid'`；`styles.xml` 自Write（Normal/Title/Heading1-3/Quote/TableGrid/Hyperlink）。

### 证据

- XML 断言全过：`w:val="Heading1"`、` <w:b/>`、`w:val="FF0000"`、`<w:tbl>`、`w:tblBorders`。
- 往返：`parseDocx → createDocx → parseDocx` 结构相等（blocks 签名一致）。
- 渲染（`bun run dev:react` + `loadDocxFile('/tmp/spike.docx')`，见 `spike-visual.png`）：
  1. 标题有 Word Heading 观感（蓝色大字，工具栏识别出 `Heading 1` / 16pt）；
  2. 表格边框完整（3×2 网格线）；
  3. 字体族生效（Arial；`bold red` 粗体红色正确）。

## 确定性策略（摘要比对不比字节）

- `createEmpty.ts` 把 `new Date().toISOString()` 写进 `docProps/core.xml`；
- JSZip entry 时间戳默认取当前时间。
- `check:sample-docx` 必须规范化后比内容摘要：忽略 `core.xml` 时间字段与 zip 元数据。

## `styles.xml` 归属

`createEmpty.ts` 的 `styles.xml` 只有 `docDefaults` + `Normal`。生成器**同时掌管 `word/styles.xml`**（Title/Heading1-3/Quote/TableGrid/Hyperlink 等展示用样式），走 `updateMultipleFiles` 回填。core 的默认样式不动（改动 core 默认会影响所有用户文档）。

## Section 自动注册（防 #53→#55-58 合并冲突）

四个内容单元（#55–#58）可并行的前提：`sections/index.ts` 做**目录自动注册**（读目录而非手写 import 列表），各单元只碰自己的 `sections/NN-name.ts`。这条是 #53 的硬性要求。

## 验收映射

`check:sample-docx` 检查项（过期/引用/零引用部件/品牌/副本/往返/体积 ≤ 400 KB）+ e2e `demo-showcase.spec.ts`（img 数量、`data-change-author`、`data-comment-id`、SDT 控件、表数量、页数 ≥ 2、页眉页脚/脚注区、TOC 点导符）+ `demo-docx.spec.ts` 仍绿。故意构造失败必须红：manifest 改一行不重生成 → 报过期；删 §4 → 台账报 `images.*` 未演示。
