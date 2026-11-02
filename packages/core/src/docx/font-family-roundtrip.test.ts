/**
 * East Asian font round-trip (change ooxml-roundtrip-fidelity, Font family fix).
 *
 * `w:rFonts` carries four slots — ascii / hAnsi / eastAsia / cs — plus four
 * theme refs. A CJK document (e.g. ascii=Calibri + eastAsia=等线/DengXian, or
 * ascii=Times New Roman + eastAsia=宋体/SimSun) must survive:
 * Document → PM → Document → XML with every slot intact.
 *
 * Covers:
 * - parse all 4 slots (+ themes) in runParser and styleParser/runProperties
 * - PM mark round-trip preserves all 8 attrs without inventing `cs`
 * - serializer emits all 4 back, with the schema spelling `w:cstheme`
 *   (ECMA-376 CT_Fonts uses lowercase; Word ignores `w:csTheme`)
 */
import { describe, test, expect } from 'bun:test';
import { parseRunProperties } from './runParser';
import { parseRunProperties as parseStyleRunProperties } from './styleParser/runProperties';
import { serializeTextFormatting } from './serializer/runSerializer';
import { parseXml, type XmlElement } from './xmlParser';
import { textFormattingToMarks } from '../prosemirror/conversion/toProseDoc/marks';
import { marksToTextFormatting } from '../prosemirror/conversion/fromProseDoc/marks';

function parseRPr(innerXml: string): XmlElement {
  const doc = parseXml(
    `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:rPr>`
  );
  return (doc.elements as XmlElement[])[0];
}

describe('East Asian font round-trip', () => {
  test('parses all 4 w:rFonts slots (DengXian)', () => {
    const rPr = parseRPr(
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="等线" w:cs="Calibri"/>'
    );
    const formatting = parseRunProperties(rPr, null);
    expect(formatting?.fontFamily?.ascii).toBe('Calibri');
    expect(formatting?.fontFamily?.hAnsi).toBe('Calibri');
    expect(formatting?.fontFamily?.eastAsia).toBe('等线');
    expect(formatting?.fontFamily?.cs).toBe('Calibri');
  });

  test('parses all 4 slots (SimSun) via style run properties', () => {
    const rPr = parseRPr(
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/>'
    );
    const formatting = parseStyleRunProperties(rPr, null);
    expect(formatting?.fontFamily?.ascii).toBe('Times New Roman');
    expect(formatting?.fontFamily?.eastAsia).toBe('宋体');
    expect(formatting?.fontFamily?.cs).toBe('Times New Roman');
  });

  test('serializes all 4 slots back verbatim', () => {
    const rPr = parseRPr(
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="等线" w:cs="Calibri"/>'
    );
    const formatting = parseRunProperties(rPr, null);
    const xml = serializeTextFormatting(formatting);
    expect(xml).toContain('w:ascii="Calibri"');
    expect(xml).toContain('w:hAnsi="Calibri"');
    expect(xml).toContain('w:eastAsia="等线"');
    expect(xml).toContain('w:cs="Calibri"');
  });

  test('PM round-trip preserves eastAsia without inventing cs', () => {
    const rPr = parseRPr('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="等线"/>');
    const formatting = parseRunProperties(rPr, null);
    expect(formatting?.fontFamily?.cs).toBeUndefined();

    const marks = textFormattingToMarks(formatting);
    const roundTripped = marksToTextFormatting(marks);
    expect(roundTripped.fontFamily?.ascii).toBe('Calibri');
    expect(roundTripped.fontFamily?.hAnsi).toBe('Calibri');
    expect(roundTripped.fontFamily?.eastAsia).toBe('等线');
    // No explicit cs in source → none after round-trip (no spurious w:cs).
    expect(roundTripped.fontFamily?.cs).toBeUndefined();

    const xml = serializeTextFormatting(roundTripped);
    expect(xml).toContain('w:eastAsia="等线"');
    expect(xml).not.toMatch(/w:cs="/);
  });

  test('PM round-trip preserves an explicit cs slot', () => {
    const rPr = parseRPr(
      '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="宋体" w:cs="David"/>'
    );
    const formatting = parseRunProperties(rPr, null);
    const marks = textFormattingToMarks(formatting);
    const roundTripped = marksToTextFormatting(marks);
    expect(roundTripped.fontFamily?.cs).toBe('David');
    const xml = serializeTextFormatting(roundTripped);
    expect(xml).toContain('w:cs="David"');
    expect(xml).toContain('w:eastAsia="宋体"');
  });

  test('emits schema spelling w:cstheme (not camelCase w:csTheme)', () => {
    const xml = serializeTextFormatting({
      fontFamily: { ascii: 'Calibri', csTheme: 'minorBidi' },
    });
    expect(xml).toContain('w:cstheme="minorBidi"');
    expect(xml).not.toContain('w:csTheme=');
  });

  test('accepts legacy camelCase w:csTheme from older editor saves', () => {
    const rPr = parseRPr('<w:rFonts w:ascii="Calibri" w:csTheme="minorBidi"/>');
    const formatting = parseRunProperties(rPr, null);
    expect(formatting?.fontFamily?.csTheme).toBe('minorBidi');
    const xml = serializeTextFormatting(formatting);
    expect(xml).toContain('w:cstheme="minorBidi"');
    expect(xml).not.toMatch(/w:csTheme=/);
  });

  test('theme refs round-trip alongside explicit names', () => {
    const rPr = parseRPr(
      '<w:rFonts w:ascii="Calibri" w:eastAsia="等线" w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:cstheme="minorBidi"/>'
    );
    const formatting = parseRunProperties(rPr, null);
    expect(formatting?.fontFamily?.asciiTheme).toBe('minorHAnsi');
    expect(formatting?.fontFamily?.eastAsiaTheme).toBe('minorEastAsia');
    expect(formatting?.fontFamily?.csTheme).toBe('minorBidi');
    const marks = textFormattingToMarks(formatting);
    const roundTripped = marksToTextFormatting(marks);
    const xml = serializeTextFormatting(roundTripped);
    expect(xml).toContain('w:asciiTheme="minorHAnsi"');
    expect(xml).toContain('w:eastAsiaTheme="minorEastAsia"');
    expect(xml).toContain('w:cstheme="minorBidi"');
    expect(xml).toContain('w:eastAsia="等线"');
  });
});
