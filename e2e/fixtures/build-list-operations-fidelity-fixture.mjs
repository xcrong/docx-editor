import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// list-operations-fidelity fixture: exercises three rendering paths in one DOCX.
//  - Hidden list indicators: numId=1 levels carry <w:vanish/> in the level rPr,
//    so "Hidden item" paragraphs must parse with listRendering.markerHidden and
//    paint with NO .layout-list-marker.
//  - List indicator in table cells: "Cell bullet" (numId=2, no vanish) sits in
//    a table cell with numbering-level ind left=720/hanging=360, so the marker
//    must paint at max(0, 720-360)=360 twips (24px) from the cell content edge
//    with body text at 720 twips (48px).
//  - Contextual spacing: "Context one/two" (Normal, contextualSpacing, 240tw
//    spacing) must collapse to a ~0 gap, while "Plain one/two" (same spacing,
//    no flag) keep the 240tw (16px) gap.
// Regenerate with: bun e2e/fixtures/build-list-operations-fidelity-fixture.mjs
const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
      </w:pPr>
      <w:r><w:t>Hidden item one</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
      </w:pPr>
      <w:r><w:t>Hidden item two</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr>
              <w:pStyle w:val="Normal"/>
              <w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>
            </w:pPr>
            <w:r><w:t>Cell bullet</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:spacing w:after="240"/>
        <w:contextualSpacing/>
      </w:pPr>
      <w:r><w:t>Context one</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:spacing w:before="240" w:after="240"/>
        <w:contextualSpacing/>
      </w:pPr>
      <w:r><w:t>Context two</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:spacing w:after="240"/>
      </w:pPr>
      <w:r><w:t>Plain one</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:spacing w:before="240"/>
      </w:pPr>
      <w:r><w:t>Plain two</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:vanish/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="\u2022"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', CONTENT_TYPES);
zip.folder('_rels').file('.rels', RELS);
zip.folder('word').file('document.xml', DOC_XML);
zip.folder('word').file('styles.xml', STYLES);
zip.folder('word').file('numbering.xml', NUMBERING_XML);
zip.folder('word').folder('_rels').file('document.xml.rels', DOC_RELS);

const out = join(here, 'list-operations-fidelity.docx');
const buf = await zip.generateAsync({ type: 'uint8array' });
writeFileSync(out, buf);
console.log('wrote', out, buf.length, 'bytes');
