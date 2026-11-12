import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import { parseNumbering } from '../numberingParser';
import { parseDocx } from '../parser';
import type { Paragraph } from '../../types/document';

const NUMBERING_WITH_VANISH = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:rPr>
        <w:vanish/>
      </w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%2."/>
      <w:lvlJc w:val="left"/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>`;

const NUMBERING_WITH_VANISH_FALSE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:rPr>
        <w:vanish w:val="false"/>
      </w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>`;

describe('Numbering vanish (hidden list indicators)', () => {
  test('parses w:vanish on level rPr as hidden=true', () => {
    const numbering = parseNumbering(NUMBERING_WITH_VANISH);
    const level0 = numbering.getLevel(1, 0);
    expect(level0).toBeDefined();
    expect(level0!.rPr?.hidden).toBe(true);
  });

  test('level without w:vanish has no hidden flag', () => {
    const numbering = parseNumbering(NUMBERING_WITH_VANISH);
    const level1 = numbering.getLevel(1, 1);
    expect(level1).toBeDefined();
    expect(level1!.rPr?.hidden).toBeUndefined();
  });

  test('w:vanish val="false" parses as hidden=false', () => {
    const numbering = parseNumbering(NUMBERING_WITH_VANISH_FALSE);
    const level0 = numbering.getLevel(1, 0);
    expect(level0).toBeDefined();
    expect(level0!.rPr?.hidden).toBe(false);
  });
});

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';

const HIDDEN_DOCX_CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="${NS_CT}">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
  `</Types>`;

const HIDDEN_DOCX_PACKAGE_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const HIDDEN_DOCX_DOCUMENT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
  `</Relationships>`;

const HIDDEN_DOCX_STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="${NS_W}">` +
  `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `</w:styles>`;

// Same shape as NUMBERING_WITH_VANISH above, plus a visible bullet level so
// the DOCX-level test can contrast hidden vs rendered indicators.
const HIDDEN_DOCX_NUMBERING =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:numbering xmlns:w="${NS_W}">` +
  `<w:abstractNum w:abstractNumId="0">` +
  `<w:lvl w:ilvl="0">` +
  `<w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>` +
  `<w:rPr><w:vanish/></w:rPr>` +
  `</w:lvl></w:abstractNum>` +
  `<w:abstractNum w:abstractNumId="1">` +
  `<w:lvl w:ilvl="0">` +
  `<w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>` +
  `</w:lvl></w:abstractNum>` +
  `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
  `<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>` +
  `</w:numbering>`;

const HIDDEN_DOCX_DOCUMENT =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${NS_W}"><w:body>` +
  `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
  `<w:r><w:t>Hidden one</w:t></w:r></w:p>` +
  `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
  `<w:r><w:t>Hidden two</w:t></w:r></w:p>` +
  `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>` +
  `<w:r><w:t>Visible one</w:t></w:r></w:p>` +
  `</w:body></w:document>`;

async function buildHiddenIndicatorsDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', HIDDEN_DOCX_CONTENT_TYPES);
  zip.file('_rels/.rels', HIDDEN_DOCX_PACKAGE_RELS);
  zip.file('word/document.xml', HIDDEN_DOCX_DOCUMENT);
  zip.file('word/styles.xml', HIDDEN_DOCX_STYLES);
  zip.file('word/numbering.xml', HIDDEN_DOCX_NUMBERING);
  zip.file('word/_rels/document.xml.rels', HIDDEN_DOCX_DOCUMENT_RELS);
  return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
}

function paragraphText(p: Paragraph): string {
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.text) texts.push(n.text);
    for (const child of n.content ?? []) walk(child);
  };
  for (const child of p.content) walk(child);
  return texts.join('');
}

describe('Numbering vanish (hidden list indicators) in a real DOCX', () => {
  test('DOCX list items on a vanish level parse with markerHidden=true', async () => {
    const doc = await parseDocx(await buildHiddenIndicatorsDocx(), { preloadFonts: false });
    const paras = doc.package.document.content.filter(
      (b): b is Paragraph => (b as Paragraph).type === 'paragraph'
    );
    expect(paras.length).toBe(3);

    const hidden = paras.filter((p) => paragraphText(p).startsWith('Hidden'));
    expect(hidden.length).toBe(2);
    for (const p of hidden) {
      expect(p.formatting?.numPr).toMatchObject({ numId: 1, ilvl: 0 });
      expect(p.listRendering?.markerHidden).toBe(true);
    }
  });

  test('DOCX list item on a level without vanish has no markerHidden flag', async () => {
    const doc = await parseDocx(await buildHiddenIndicatorsDocx(), { preloadFonts: false });
    const paras = doc.package.document.content.filter(
      (b): b is Paragraph => (b as Paragraph).type === 'paragraph'
    );
    const visible = paras.find((p) => paragraphText(p) === 'Visible one');
    expect(visible).toBeDefined();
    expect(visible!.formatting?.numPr).toMatchObject({ numId: 2, ilvl: 0 });
    expect(visible!.listRendering?.markerHidden).toBeUndefined();
    expect(visible!.listRendering?.marker).toBe('•');
  });
});
