# Tasks: OOXML Roundtrip Fidelity

## Investigation

- [ ] Audit highlight serialization — check if `w:highlight` or `w:shd` is used
- [ ] Audit theme color roundtrip — check if theme attributes preserved alongside resolved color
- [ ] Audit `w:rFonts` parsing — check if all 4 font categories are read
- [ ] Audit field serialization in headers/footers
- [ ] Audit image parser — check deduplication key (cNvPr ID vs relationship ID)
- [ ] Check if settings.xml `w:view` is parsed/preserved

## Highlight fix

- [x] Map predefined highlight colors to `w:highlight w:val="name"`
- [x] Route custom colors to `w:shd w:val="clear" w:fill="RRGGBB"`
- [x] Test roundtrip: apply custom highlight → save → reopen in Word

## Theme color fix

- [x] Preserve `w:themeColor`, `w:themeTint`, `w:themeShade` in run properties through PM roundtrip
- [x] Write theme attributes back in serializer alongside resolved `w:val`
- [x] Test with theme-colored text in table headers

## Font family fix

- [x] Parse all 4 `w:rFonts` attributes: ascii, hAnsi, eastAsia, cs
- [x] Store all 4 in run properties type
- [x] Serialize all 4 back on export
- [x] Test with East Asian font document (DengXian, SimSun, etc.)

## Field code fix

- [ ] Verify complex fields in headers/footers roundtrip as field structures
- [ ] Fix serializer to reconstruct `w:fldChar`/`w:instrText` sequence
- [ ] Test with PAGE, NUMPAGES fields in footer

## Image ID fix

- [ ] Use relationship ID (r:embed) as unique key, not pic:cNvPr id
- [ ] Accept non-standard relationship ID formats
- [ ] Test with document containing multiple images with id="0"

## w:view fix

- [ ] Parse `w:view` from settings.xml
- [ ] Store in document model
- [ ] Write back on export
- [ ] Test roundtrip preservation

## Testing

- [x] E2E test: custom highlight color roundtrip
- [x] E2E test: theme color roundtrip
- [x] E2E test: East Asian font preservation
- [ ] E2E test: footer with field codes roundtrip
- [ ] E2E test: multiple images with duplicate IDs
- [x] Run `bun run typecheck`
