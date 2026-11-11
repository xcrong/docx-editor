# Design: OOXML Roundtrip Fidelity

## Highlight serialization

**Rule:** If highlight color is one of the 17 predefined OOXML colors (`yellow`, `green`, `cyan`, `magenta`, `red`, `blue`, `darkBlue`, `darkCyan`, `darkGreen`, `darkMagenta`, `darkRed`, `darkYellow`, `lightGray`, `darkGray`, `black`, `white`, `none`), use `<w:highlight w:val="colorName"/>`. For any other color, use `<w:shd w:val="clear" w:color="auto" w:fill="RRGGBB"/>`.

Check: `src/docx/serializer/` — run properties serialization.

## Theme color preservation

When a run has theme color attributes (`w:themeColor`, `w:themeTint`, `w:themeShade`), these must be preserved through the roundtrip alongside the resolved `w:val` color. The resolved color should be recalculated from theme on import but the theme attributes must be written back on export.

Check: `src/docx/serializer/` and `src/prosemirror/conversion/fromProseDoc.ts`.

## Font family preservation

`w:rFonts` has four attributes: `w:ascii`, `w:hAnsi`, `w:eastAsia`, `w:cs`. All four must be parsed, stored in run properties, and serialized back. Currently may only preserve one.

Check: `src/docx/paragraphParser.ts` (parsing), `src/types/formatting.ts` (storage), serializer (output).

## Field code serialization

Complex fields (`w:fldChar` begin/separate/end with `w:instrText`) must roundtrip as field structures, not as plain text. The serializer must reconstruct the field XML from the stored field data.

Check: `src/docx/serializer/` — how fields in headers/footers are written.

## Duplicate image IDs

Parser should not deduplicate images by `pic:cNvPr` ID. Use the relationship ID (`r:embed`) as the unique key for resolving image data. Accept non-standard relationship ID formats.

Check: `src/docx/` image/drawing parser.

## w:view preservation

Parse `<w:view w:val="..."/>` from `word/settings.xml` on import, store in document model, write back on export.

## Audit (T29 剩余 6 项对账 — 2026-11-11, main@ac0988ca 起已实现)

- `w:highlight` vs `w:shd`：已实现 — 命名色走 `w:highlight`、自定义 hex 走 `w:shd` 回退。证据：`src/docx/serializer/runSerializer.ts:326-338`、`src/docx/__tests__/color-roundtrip.test.ts`、`src/prosemirror/conversion/__tests__/highlight-theme-pm-roundtrip.test.ts`。
- 主题色往返：已实现 — `themeColor/themeTint/themeShade` 解析保留、序列化写回（含 `w:val="auto"` 回退）。证据：`src/docx/runParser.ts:64-91`、`src/docx/serializer/runSerializer.ts:67-95`、`color-roundtrip.test.ts`。
- `w:rFonts` 四类字体：已实现 — ascii/hAnsi/eastAsia/cs（含 `*Theme` 引用）全解析全写回。证据：`src/docx/runParser.ts:264-313`、`src/docx/serializer/runSerializer.ts:166-198`、`src/docx/font-family-roundtrip.test.ts`。
- 页眉页脚域序列化：已实现 — 未编辑 HF 走 `verbatimXml` 字节直通；编辑后经 `serializeComplexField` 重建 `fldChar/instrText`。证据：`src/docx/serializer/headerFooterSerializer.ts:78`、`src/docx/serializer/paragraphSerializer/content.ts:161-205`、`src/docx/__tests__/roundtrip-fields-images-view.test.ts`（§1/§4）。
- 图片去重键：已实现 — 解析以 `r:embed` 为键（`extractBlipRId`），`ensureUniqueDrawingIds` 仅规范 `docPr/cNvPr` 显示 id。证据：`src/docx/imageParser.ts:294-310`、`src/docx/drawingIds.ts`、`roundtrip-fields-images-view.test.ts`（§2/§5/§6，非标准 `img2073076884` + 双 `id="0"`）。
- `w:view` 解析/写回：已实现 — `parseSettings` 存模型，`syncSettingsViewToZip` 字节保留写回（其余 passthrough）。证据：`src/docx/settingsParser.ts:78-87,106-140`、`src/docx/rezip/packaging.ts:479-491`、`roundtrip-fields-images-view.test.ts`（§3）。

## Key files

| File                          | Change                                            |
| ----------------------------- | ------------------------------------------------- |
| `src/docx/serializer/`        | Highlight, theme color, font, field serialization |
| `src/docx/paragraphParser.ts` | Font family parsing (all 4 categories)            |
| `src/docx/drawingParser.ts`   | Image ID handling                                 |
| `src/types/formatting.ts`     | Font family type (4 categories)                   |
| `src/docx/settingsParser.ts`  | w:view parsing                                    |
