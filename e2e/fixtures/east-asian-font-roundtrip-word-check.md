# Word 真机核验 — 东亚字体 round-trip（ooxml-roundtrip-fidelity / Font family）

夹具：`e2e/fixtures/east-asian-font-roundtrip.docx`
E2E：`e2e/tests/roundtrip-east-asian-font.spec.ts`

## 步骤

1. 用本仓库编辑器打开夹具，点击 Save，得到 round-trip 后文件。
2. 用 Microsoft Word（桌面版，Windows 或 macOS）打开 round-trip 文件。
3. 选中以下三行，查看「开始 → 字体」及「字体 → 高级/东亚文字字体」：
   - 第一行应为 **等线**（西文 Calibri）。
   - 第二行应为 **宋体**（西文 Times New Roman）。
   - 第三行应为 **等线 + 主题色 accent1 深色 25%**。
4. 用 Word 另存一次，再用本仓库重新打开，文字与字体不变。

## 通过标准

- 东亚字体不丢失、不坍缩为 Arial/Calibri。
- `word/document.xml` 中三行均保留 `w:eastAsia` 与 `w:cs`，无 `w:csTheme`（应为小写 `w:cstheme`）。
- 第三行保留 `w:themeColor="accent1"`。

## 失败回退

若 Word 显示字体丢失，抓取 round-trip 文件的 `word/document.xml` 对应 `<w:rFonts>`，
对照本说明定位丢失的槽位（ascii/hAnsi/eastAsia/cs 或 theme ref）。
