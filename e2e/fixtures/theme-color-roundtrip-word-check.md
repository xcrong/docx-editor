# Theme color 真机 Round-trip 核验（Word）

Fixture：`e2e/fixtures/theme-color-roundtrip.docx`
（由 `e2e/fixtures/generate-fixtures.ts` 中 `generateThemeColorRoundtripDocx` 生成，可重复执行。）

## 文档内容

- "Theme dark1 text."（`w:color w:val="000000" w:themeColor="dark1"`，解析为黑色）
- "Theme accent1 lighter 40%."（`w:themeColor="accent1" w:themeTint="66"`）
- "Theme accent1 darker 25%."（`w:themeColor="accent1" w:themeShade="BF"`）
- 表格首行：白字（`w:val="FFFFFF" w:themeColor="background1"`）+ 主题填充单元格
  （`w:shd w:fill="4472C4" w:themeFill="accent1"`）；次行为普通文本。

## 核验步骤（Microsoft Word 桌面端）

1. 用 Word 打开 `theme-color-roundtrip.docx`，确认：
   - 首段为黑色，"lighter"段为浅蓝、"darker"段为深蓝，
   - 表头为蓝底白字（Header A / Header B）。
2. 切换 Word 主题（设计 → 主题，换一套配色），确认主题色文字/表头底色跟随主题变化
   —— 说明文件里存的是主题引用而非死色值。
3. 在编辑器中打开 → Save 导出 → 用 Word 打开导出的文件，确认：
   - 颜色与原文件一致（尤其表头仍是蓝底白字，不能变白底/黑字），
   - 再次切换主题，颜色仍跟随主题变化（`w:themeColor`/`w:themeFill` 未丢失）。
4. 用编辑器打开导出的文件（二次往返），确认 `word/document.xml` 中：
   - `w:themeColor="dark1"/"accent1"/"background1"`、`w:themeTint="66"`、
     `w:themeShade="BF"`、`w:themeFill="accent1"` 俱在，
   - 每个主题色旁边都有解析后的 `w:val`/`w:fill`（回退值未丢失）。

## 通过标准

- 主题色往返后仍跟随 Word 主题切换，无"变白/变黑" corruption，
  表头主题文本 + 主题填充在两次往返后保持原样。
