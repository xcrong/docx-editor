# Highlight 真机 Round-trip 核验（Word）

Fixture：`e2e/fixtures/highlight-roundtrip.docx`
（由 `e2e/fixtures/generate-fixtures.ts` 中 `generateHighlightRoundtripDocx` 生成，可重复执行。）

## 文档内容

- 第一段："Named highlight yellow "（预设高亮 `w:highlight w:val="yellow"`）
  - "Custom highlight pale yellow"（自定义高亮 `w:shd w:val="clear" w:fill="FFEB3B"`）
- 第二段："Named highlight green "（`w:highlight w:val="green"`）+ "plain tail."（无格式）

## 核验步骤（Microsoft Word 桌面端）

1. 用 Word 打开 `highlight-roundtrip.docx`，确认：
   - "Named highlight yellow" 底色为黄色，"Custom highlight pale yellow" 底色为浅黄，
     "Named highlight green" 底色为绿色。
2. 在编辑器中打开同一文件 → Save 导出 → 用 Word 打开导出的文件，确认三处底色与原文件一致，
   且 Word 不报"发现不可读取的内容"修复提示。
3. 用编辑器打开导出的文件（二次往返），确认 `word/document.xml` 中：
   - 仍为 `<w:highlight w:val="yellow"/>` / `<w:highlight w:val="green"/>`，
   - 自定义色仍为 `<w:shd w:val="clear" w:color="auto" w:fill="FFEB3B"/>`，
   - 不出现 `<w:highlight w:fill="..."/>`（非法形状，Word 会静默丢弃）。
4. 反向用例：在 Word 中新建文档，分别用标准黄色和自定义浅黄高亮两段文字，
   在编辑器中打开 → 导出 → 回 Word 打开，确认两处高亮都在。

## 通过标准

- 预设色往返保持 `w:highlight`，自定义色往返保持 `w:shd`，Word 全程无修复提示，
  三次打开视觉一致。
