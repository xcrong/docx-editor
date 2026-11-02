/**
 * Highlight + theme-color PM round-trip (change ooxml-roundtrip-fidelity).
 *
 * Covers the full XML → PM marks → XML path:
 * - predefined highlight names serialize as `<w:highlight w:val="name"/>`
 * - custom highlight colors serialize as `<w:shd w:val="clear" w:fill="RRGGBB"/>`
 * - `w:themeColor`/`w:themeTint`/`w:themeShade` survive the PM round-trip and
 *   are written back alongside the resolved `w:val`
 * - a theme-only color (no `w:val`) still emits a valid `w:color` element
 */
import { describe, test, expect } from 'bun:test';
import { parseRunProperties } from '../../../docx/runParser';
import { serializeTextFormatting } from '../../../docx/serializer/runSerializer';
import { parseXml, type XmlElement } from '../../../docx/xmlParser';
import { textFormattingToMarks } from '../toProseDoc/marks';
import { marksToTextFormatting } from '../fromProseDoc/marks';
import { parseShading } from '../../../docx/tableParser/properties';

function parseRPr(xml: string): XmlElement {
  const doc = parseXml(
    `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xml}</w:rPr>`
  );
  return (doc.elements as XmlElement[])[0];
}

/** Parse rPr XML → PM marks → back to formatting → serialize. */
function pmRoundTrip(innerXml: string) {
  const formatting = parseRunProperties(parseRPr(innerXml), null);
  const marks = textFormattingToMarks(formatting);
  const back = marksToTextFormatting(marks);
  return { formatting, back, serialized: serializeTextFormatting(back) };
}

describe('highlight PM round-trip', () => {
  test('predefined name survives as w:highlight', () => {
    const { back, serialized } = pmRoundTrip('<w:highlight w:val="yellow"/>');
    expect(back.highlight).toBe('yellow');
    expect(serialized).toContain('<w:highlight w:val="yellow"/>');
    expect(serialized).not.toContain('<w:shd');
  });

  test('custom shd fill returns as w:shd, never w:highlight', () => {
    const { back, serialized } = pmRoundTrip(
      '<w:shd w:val="clear" w:color="auto" w:fill="FFEB3B"/>'
    );
    expect(back.highlight as string).toBe('#FFEB3B');
    expect(serialized).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FFEB3B"/>');
    expect(serialized).not.toContain('<w:highlight');
  });

  test('invalid w:highlight output is never emitted for custom colors', () => {
    const { serialized } = pmRoundTrip('<w:shd w:val="clear" w:fill="00B050"/>');
    expect(serialized).not.toMatch(/<w:highlight w:fill=/);
  });
});

describe('theme color PM round-trip', () => {
  test('themeColor + tint survive with resolved w:val', () => {
    const { back, serialized } = pmRoundTrip(
      '<w:color w:val="B4C6E7" w:themeColor="accent1" w:themeTint="66"/>'
    );
    expect(back.color).toEqual({
      rgb: 'B4C6E7',
      themeColor: 'accent1',
      themeTint: '66',
      themeShade: undefined,
    });
    expect(serialized).toContain('w:val="B4C6E7"');
    expect(serialized).toContain('w:themeColor="accent1"');
    expect(serialized).toContain('w:themeTint="66"');
  });

  test('themeColor + shade survive with resolved w:val', () => {
    const { back, serialized } = pmRoundTrip(
      '<w:color w:val="2F5496" w:themeColor="accent1" w:themeShade="BF"/>'
    );
    expect(back.color?.themeColor).toBe('accent1');
    expect(back.color?.themeShade).toBe('BF');
    expect(serialized).toContain('w:val="2F5496"');
    expect(serialized).toContain('w:themeColor="accent1"');
    expect(serialized).toContain('w:themeShade="BF"');
  });

  test('dk1 theme color keeps its resolved value (no dark/light flip)', () => {
    const { back, serialized } = pmRoundTrip('<w:color w:val="000000" w:themeColor="dk1"/>');
    expect(back.color?.rgb).toBe('000000');
    expect(back.color?.themeColor).toBe('dk1');
    expect(serialized).toContain('w:val="000000"');
    expect(serialized).toContain('w:themeColor="dk1"');
  });

  test('transitional dark1 spelling echoes back verbatim (byte fidelity)', () => {
    const { back, serialized } = pmRoundTrip('<w:color w:val="000000" w:themeColor="dark1"/>');
    expect(back.color?.themeColor).toBe('dark1');
    expect(serialized).toContain('w:themeColor="dark1"');
    expect(serialized).not.toContain('dk1');
  });

  test('theme-only color (no w:val) still emits a valid w:color element', () => {
    const { back, serialized } = pmRoundTrip('<w:color w:themeColor="accent1" w:themeTint="99"/>');
    // No nulls leak into the Document model.
    expect(back.color).toEqual({ themeColor: 'accent1', themeTint: '99', themeShade: undefined });
    expect(back.color?.rgb).toBeUndefined();
    // CT_Color requires w:val — the serializer falls back to auto.
    expect(serialized).toContain('<w:color w:val="auto"');
    expect(serialized).toContain('w:themeColor="accent1"');
    expect(serialized).toContain('w:themeTint="99"');
  });

  test('theme color + highlight coexist', () => {
    const { back, serialized } = pmRoundTrip(
      '<w:color w:val="FF0000" w:themeColor="accent2"/><w:highlight w:val="yellow"/>'
    );
    expect(back.color?.themeColor).toBe('accent2');
    expect(back.highlight).toBe('yellow');
    expect(serialized).toContain('w:themeColor="accent2"');
    expect(serialized).toContain('<w:highlight w:val="yellow"/>');
  });
});

describe('table header shading keeps resolved fill alongside themeFill', () => {
  function parseCellShading(): ReturnType<typeof parseShading> {
    const doc = parseXml(
      '<w:shd xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:val="clear" w:color="auto" w:fill="4472C4" w:themeFill="accent1"/>'
    );
    return parseShading((doc.elements as XmlElement[])[0]);
  }

  test('w:fill rgb is not dropped when w:themeFill is present', () => {
    const shading = parseCellShading();
    expect(shading?.fill?.rgb).toBe('4472C4');
    expect(shading?.fill?.themeColor).toBe('accent1');
  });
});
