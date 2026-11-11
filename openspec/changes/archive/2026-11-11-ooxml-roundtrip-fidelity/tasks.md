# Tasks: OOXML Roundtrip Fidelity

## Investigation

- [x] Audit highlight serialization — check if `w:highlight` or `w:shd` is used
- [x] Audit theme color roundtrip — check if theme attributes preserved alongside resolved color
- [x] Audit `w:rFonts` parsing — check if all 4 font categories are read
- [x] Audit field serialization in headers/footers
- [x] Audit image parser — check deduplication key (cNvPr ID vs relationship ID)
- [x] Check if settings.xml `w:view` is parsed/preserved

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

- [x] Verify complex fields in headers/footers roundtrip as field structures
- [x] Fix serializer to reconstruct `w:fldChar`/`w:instrText` sequence
- [x] Test with PAGE, NUMPAGES fields in footer

## Image ID fix

- [x] Use relationship ID (r:embed) as unique key, not pic:cNvPr id
- [x] Accept non-standard relationship ID formats
- [x] Test with document containing multiple images with id="0"

## w:view fix

- [x] Parse `w:view` from settings.xml
- [x] Store in document model
- [x] Write back on export
- [x] Test roundtrip preservation

## Testing

- [x] E2E test: custom highlight color roundtrip
- [x] E2E test: theme color roundtrip
- [x] E2E test: East Asian font preservation
- [x] E2E test: footer with field codes roundtrip
- [x] E2E test: multiple images with duplicate IDs
- [x] Run `bun run typecheck`
