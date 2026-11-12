import { describe, test, expect } from 'bun:test';
import { parseNumbering, renderListMarker } from '../numberingParser';
import { parseParagraph } from '../paragraphParser';
import { parseXmlDocument, type XmlElement } from '../xmlParser';

// ooxml-feature-gaps: null lvlText must not crash list numbering.
const NUMBERING_MISSING_LVLTEXT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>`;

describe('null lvlText guard (ooxml-feature-gaps)', () => {
  test('renderListMarker tolerates null/undefined lvlText', () => {
    expect(renderListMarker(null, [1], ['decimal'])).toBe('');
    expect(renderListMarker(undefined, [1], ['decimal'])).toBe('');
    expect(renderListMarker('%1.', [3], ['decimal'])).toBe('3.');
  });

  test('level without w:lvlText parses to empty string and renders', () => {
    const numbering = parseNumbering(NUMBERING_MISSING_LVLTEXT);
    const root = parseXmlDocument(
      `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
        `<w:r><w:t>item</w:t></w:r></w:p>`
    ) as XmlElement | null;
    if (!root) throw new Error('Failed to parse paragraph XML');
    const para = parseParagraph(root, null, null, numbering, null, null);
    expect(para.listRendering?.marker).toBe('');
  });
});
