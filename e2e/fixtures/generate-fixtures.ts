/**
 * Generate DOCX Test Fixtures
 *
 * This script generates sample DOCX files for testing.
 * Run with: bun run e2e/fixtures/generate-fixtures.ts
 */

import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.dirname(new URL(import.meta.url).pathname);

/**
 * Minimal DOCX structure components
 */
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:after="200" w:line="276" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>
</w:styles>`;

/**
 * Create a minimal DOCX file
 */
async function createDocx(documentXml: string, filename: string): Promise<void> {
  const zip = new JSZip();

  // Add required DOCX structure
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS_XML);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', documentXml);

  // Generate the DOCX file
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(FIXTURES_DIR, filename);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

/**
 * Generate empty.docx
 */
async function generateEmptyDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t></w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'empty.docx');
}

/**
 * Generate styled-content.docx
 */
async function generateStyledContentDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Normal text. </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t>Bold text. </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:i/>
        </w:rPr>
        <w:t>Italic text. </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:u w:val="single"/>
        </w:rPr>
        <w:t>Underlined text.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:i/>
        </w:rPr>
        <w:t>Bold and italic text. </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:strike/>
        </w:rPr>
        <w:t>Strikethrough text.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr>
          <w:sz w:val="36"/>
        </w:rPr>
        <w:t>Large text (18pt). </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:sz w:val="16"/>
        </w:rPr>
        <w:t>Small text (8pt).</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:t>Centered paragraph.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:t>Right-aligned paragraph.</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'styled-content.docx');
}

/**
 * Generate with-tables.docx
 */
async function generateWithTablesDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Document with tables:</w:t>
      </w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>A1</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>B1</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>C1</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>A2</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>B2</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>C2</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>A3</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>B3</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>C3</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:r>
        <w:t>End of document.</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'with-tables.docx');
}

/**
 * Generate complex-styles.docx
 */
async function generateComplexStylesDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
      </w:pPr>
      <w:r>
        <w:t>Heading 1</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>This is a paragraph under heading 1. It contains normal text.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading2"/>
      </w:pPr>
      <w:r>
        <w:t>Heading 2</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Another paragraph with </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
        </w:rPr>
        <w:t>Times New Roman font</w:t>
      </w:r>
      <w:r>
        <w:t> and </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        </w:rPr>
        <w:t>Arial font</w:t>
      </w:r>
      <w:r>
        <w:t>.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr>
          <w:color w:val="FF0000"/>
        </w:rPr>
        <w:t>Red text. </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:color w:val="0000FF"/>
        </w:rPr>
        <w:t>Blue text. </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:color w:val="00FF00"/>
        </w:rPr>
        <w:t>Green text.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr>
          <w:highlight w:val="yellow"/>
        </w:rPr>
        <w:t>Highlighted text</w:t>
      </w:r>
      <w:r>
        <w:t> and normal text.</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'complex-styles.docx');
}

/**
 * Generate header-with-table-and-paragraphs.docx
 *
 * Stress fixture for HF height calc — paragraphs above AND below a header
 * table so the header is taller than the default `availableHeaderSpace`.
 * Body content must be pushed down so the header doesn't overlap it.
 */
async function generateHeaderWithTableAndParagraphsDocx(): Promise<void> {
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>HEADER PARA 1</w:t></w:r></w:p>
  <w:p><w:r><w:t>HEADER PARA 2</w:t></w:r></w:p>
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="9000" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:color="000000"/>
        <w:left w:val="single" w:sz="4" w:color="000000"/>
        <w:bottom w:val="single" w:sz="4" w:color="000000"/>
        <w:right w:val="single" w:sz="4" w:color="000000"/>
        <w:insideH w:val="single" w:sz="4" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="6000"/></w:tblGrid>
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R1C1</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R1C2</w:t></w:r></w:p></w:tc>
    </w:tr>
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R2C1</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R2C2</w:t></w:r></w:p></w:tc>
    </w:tr>
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R3C1</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R3C2</w:t></w:r></w:p></w:tc>
    </w:tr>
  </w:tbl>
  <w:p><w:r><w:t>HEADER PARA 3</w:t></w:r></w:p>
  <w:p><w:r><w:t>HEADER PARA 4</w:t></w:r></w:p>
</w:hdr>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>BODY TITLE TEXT THAT MUST NOT BE OVERLAPPED BY HEADER</w:t></w:r></w:p>
    <w:p><w:r><w:t>Body second paragraph.</w:t></w:r></w:p>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', documentRels);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', documentXml);
  zip.file('word/header1.xml', headerXml);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(FIXTURES_DIR, 'header-with-table-and-paragraphs.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

/**
 * Generate header-with-table.docx
 *
 * A DOCX with a 2-column table in the header (canonical "logo left, text right"
 * layout reported in #356). Body has a single short paragraph so the page
 * renders quickly.
 */
async function generateHeaderWithTableDocx(): Promise<void> {
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="9000" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:color="000000"/>
        <w:left w:val="single" w:sz="4" w:color="000000"/>
        <w:bottom w:val="single" w:sz="4" w:color="000000"/>
        <w:right w:val="single" w:sz="4" w:color="000000"/>
        <w:insideH w:val="single" w:sz="4" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="3000"/>
      <w:gridCol w:w="6000"/>
    </w:tblGrid>
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
        <w:p><w:r><w:t>HEADER LOGO</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>
        <w:p><w:r><w:t>HEADER TEXT</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
  </w:tbl>
  <w:p/>
</w:hdr>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r>
        <w:t>BODY TEXT</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', documentRels);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', documentXml);
  zip.file('word/header1.xml', headerXml);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(FIXTURES_DIR, 'header-with-table.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

/**
 * A document with endnotes, including separator notes and a tracked insertion
 * inside an endnote body. Exercises the note-body serializer round-trip and the
 * getChanges({ includeEndnotes }) path.
 */
async function generateEndnotesTrackedChangesDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">First claim</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:endnoteReference w:id="1"/></w:r>
      <w:r><w:t xml:space="preserve"> and second claim</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:endnoteReference w:id="2"/></w:r>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:endnotePr><w:numFmt w:val="lowerRoman"/></w:endnotePr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const endnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote>
  <w:endnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote>
  <w:endnote w:id="1"><w:p><w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r><w:r><w:t xml:space="preserve"> First endnote, clean.</w:t></w:r></w:p></w:endnote>
  <w:endnote w:id="2"><w:p><w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r><w:r><w:t xml:space="preserve"> Second endnote with a </w:t></w:r><w:ins w:id="100" w:author="Reviewer" w:date="2024-01-01T00:00:00Z"><w:r><w:t>tracked insertion</w:t></w:r></w:ins><w:r><w:t>.</w:t></w:r></w:p></w:endnote>
</w:endnotes>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="EndnoteText"><w:name w:val="endnote text"/></w:style>
  <w:style w:type="character" w:styleId="EndnoteReference"><w:name w:val="endnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>
</Types>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', documentRels);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/endnotes.xml', endnotesXml);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(FIXTURES_DIR, 'endnotes-tracked-changes.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

/**
 * A document with two comments: a top-level comment and a reply, plus a
 * resolved comment. Exercises the §8 save path: comments.xml +
 * commentsExtended (threading/done) + commentsIds + commentsExtensible
 * (UTC dates), with commentRangeStart/End + commentReference in the body.
 * Used by track-changes-comments-roundtrip.spec.ts (8.5).
 */
async function generateCommentsRoundtripDocx(): Promise<void> {
  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const NS_W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${NS_W}" xmlns:w14="${NS_W14}"><w:body>` +
    `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t xml:space="preserve">Commented text here</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r></w:p>` +
    `<w:p><w:r><w:t>Plain paragraph between comments.</w:t></w:r></w:p>` +
    `<w:p><w:commentRangeStart w:id="2"/><w:r><w:t xml:space="preserve">Resolved comment text</w:t></w:r><w:commentRangeEnd w:id="2"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="2"/></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr>` +
    `</w:body></w:document>`;

  // Comment 0: top-level with an explicit paraId on the w:comment element
  // (Word shape). Comment 1: reply to comment 0 — shares the parent's range
  // in document.xml, threading lives in commentsExtended.xml. Comment 2:
  // resolved top-level (w15:done="1").
  const commentsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:comments xmlns:w="${NS_W}" xmlns:w14="${NS_W14}">` +
    `<w:comment w:id="0" w:author="Alice" w:initials="A" w:date="2024-02-10T15:30:00" w14:paraId="AAAABBBB">` +
    `<w:p w14:paraId="AAAABBBB"><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r><w:r><w:t>Top-level review note</w:t></w:r></w:p>` +
    `</w:comment>` +
    `<w:comment w:id="1" w:author="Bob" w:initials="B" w:date="2024-02-11T09:00:00">` +
    `<w:p w14:paraId="CCCCDDDD"><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r><w:r><w:t>Reply to Alice</w:t></w:r></w:p>` +
    `</w:comment>` +
    `<w:comment w:id="2" w:author="Carol" w:initials="C" w:date="2024-02-12T10:00:00">` +
    `<w:p w14:paraId="EEEEFFFF"><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r><w:r><w:t>Already addressed</w:t></w:r></w:p>` +
    `</w:comment>` +
    `</w:comments>`;

  const NS_W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
  const commentsExtendedXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w15:commentsEx xmlns:w15="${NS_W15}">` +
    `<w15:commentEx w15:paraId="AAAABBBB" w15:done="0"/>` +
    `<w15:commentEx w15:paraId="CCCCDDDD" w15:paraIdParent="AAAABBBB" w15:done="0"/>` +
    `<w15:commentEx w15:paraId="EEEEFFFF" w15:done="1"/>` +
    `</w15:commentsEx>`;

  const NS_W16CEX = 'http://schemas.microsoft.com/office/word/2018/wordml/cex';
  const commentsExtensibleXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w16cex:commentsExtensible xmlns:w16cex="${NS_W16CEX}">` +
    `<w16cex:comment w16cex:paraId="AAAABBBB" w16cex:dateUtc="2024-02-10T14:30:00Z"/>` +
    `<w16cex:comment w16cex:paraId="CCCCDDDD" w16cex:dateUtc="2024-02-11T08:00:00Z"/>` +
    `<w16cex:comment w16cex:paraId="EEEEFFFF" w16cex:dateUtc="2024-02-12T09:00:00Z"/>` +
    `</w16cex:commentsExtensible>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>` +
    `<Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>` +
    `<Override PartName="/word/commentsExtensible.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml"/>` +
    `</Types>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>` +
    `<Relationship Id="rId4" Type="http://schemas.microsoft.com/office/word/2018/wordml/cex/commentsExtensible" Target="commentsExtensible.xml"/>` +
    `</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', documentRels);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', documentXml);
  zip.file('word/comments.xml', commentsXml);
  zip.file('word/commentsExtended.xml', commentsExtendedXml);
  zip.file('word/commentsExtensible.xml', commentsExtensibleXml);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(FIXTURES_DIR, 'comments-roundtrip.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

/**
 * A document with a tracked insertion and a tracked deletion in the body.
 * Used by track-changes-comments-roundtrip.spec.ts (8.6): load → save →
 * reload → w:ins/w:del preserved with author/date.
 */
async function generateTrackedChangesRoundtripDocx(): Promise<void> {
  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${NS_W}"><w:body>` +
    `<w:p><w:r><w:t xml:space="preserve">Original lead-in </w:t></w:r>` +
    `<w:ins w:id="10" w:author="Alice" w:date="2024-04-01T10:00:00Z"><w:r><w:t>inserted phrase</w:t></w:r></w:ins>` +
    `<w:r><w:t xml:space="preserve"> middle </w:t></w:r>` +
    `<w:del w:id="11" w:author="Bob" w:date="2024-04-02T11:00:00Z"><w:r><w:delText>deleted phrase</w:delText></w:r></w:del>` +
    `<w:r><w:t> tail.</w:t></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr>` +
    `</w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `</Types>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', documentRels);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', documentXml);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(FIXTURES_DIR, 'tracked-changes-roundtrip.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

/**
 * Highlight round-trip fixture (change ooxml-roundtrip-fidelity, Highlight fix).
 *
 * - run 1: predefined highlight `<w:highlight w:val="yellow"/>`
 * - run 2: custom highlight `<w:shd w:val="clear" w:fill="FFEB3B"/>`
 *   (`w:highlight` only accepts the §17.18.40 named palette, so custom
 *   colors must use run shading)
 * Used by e2e/tests/roundtrip-highlight-theme.spec.ts.
 */
export async function generateHighlightRoundtripDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:highlight w:val="yellow"/></w:rPr>
        <w:t xml:space="preserve">Named highlight yellow </w:t>
      </w:r>
      <w:r>
        <w:rPr><w:shd w:val="clear" w:color="auto" w:fill="FFEB3B"/></w:rPr>
        <w:t>Custom highlight pale yellow</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:highlight w:val="green"/></w:rPr>
        <w:t xml:space="preserve">Named highlight green </w:t>
      </w:r>
      <w:r>
        <w:t>plain tail.</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'highlight-roundtrip.docx');
}

/**
 * Theme-color round-trip fixture (change ooxml-roundtrip-fidelity, Theme color fix).
 *
 * Body runs carry `w:themeColor` + tint/shade alongside the resolved `w:val`;
 * the table header uses theme-colored text (`background1` = white) on a
 * theme-filled cell (`accent1`) — the combination that used to corrupt on
 * round-trip. Used by e2e/tests/roundtrip-highlight-theme.spec.ts.
 */
export async function generateThemeColorRoundtripDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:color w:val="000000" w:themeColor="dark1"/></w:rPr>
        <w:t>Theme dark1 text.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:color w:val="B4C6E7" w:themeColor="accent1" w:themeTint="66"/></w:rPr>
        <w:t>Theme accent1 lighter 40%.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:color w:val="2F5496" w:themeColor="accent1" w:themeShade="BF"/></w:rPr>
        <w:t>Theme accent1 darker 25%.</w:t>
      </w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="4500" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="4472C4" w:themeFill="accent1"/>
          </w:tcPr>
          <w:p><w:r><w:rPr><w:color w:val="FFFFFF" w:themeColor="background1"/></w:rPr><w:t>Header A</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="4500" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="4472C4" w:themeFill="accent1"/>
          </w:tcPr>
          <w:p><w:r><w:rPr><w:color w:val="FFFFFF" w:themeColor="background1"/></w:rPr><w:t>Header B</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>Body A</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>Body B</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'theme-color-roundtrip.docx');
}

/**
 * East-Asian font round-trip fixture (change ooxml-roundtrip-fidelity, Font family fix).
 *
 * Body runs carry all four `w:rFonts` slots with CJK fonts (等线/DengXian,
 * 宋体/SimSun). Used by e2e/tests/roundtrip-east-asian-font.spec.ts.
 *
 * Word真机核验见 e2e/fixtures/east-asian-font-roundtrip-word-check.md.
 */
export async function generateEastAsianFontRoundtripDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="等线" w:cs="Calibri"/></w:rPr>
        <w:t>等线东亚字体行 DengXian CJK text.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/></w:rPr>
        <w:t>宋体正文 SimSun body text.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="等线"/><w:color w:val="2F5496" w:themeColor="accent1" w:themeShade="BF"/></w:rPr>
        <w:t>等线主题色混合行 DengXian with theme color.</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'east-asian-font-roundtrip.docx');
}

/**
 * Table rendering fidelity fixtures (change table-rendering-fidelity).
 *
 * 1. table-merge-beyond-first-col.docx — horizontal merge after the first
 *    column (B1:C1 via gridSpan) plus a vertical merge in a non-first
 *    column (B2:B3 via vMerge restart/continue). Exercises grid placement
 *    for cells after the first merged group.
 * 2. table-indentation.docx — 2x2 table with `w:tblInd` (720 dxa). The table
 *    container must offset by exactly `w:tblInd`, no paragraph indent.
 * 3. table-text-overlap.docx — 3-row bordered table followed by a marker
 *    paragraph. The table must reserve its full height (rows + padding +
 *    borders) so the marker never overlaps.
 */
export async function generateTableMergeBeyondFirstColDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>MERGE FIDELITY HEADER</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="2250"/><w:gridCol w:w="2250"/><w:gridCol w:w="2250"/><w:gridCol w:w="2250"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>B1C1-MERGED</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>D1</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>A2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>B2-SPAN</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>C2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>D2</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>A3</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>C3</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>D3</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'table-merge-beyond-first-col.docx');
}

export async function generateTableIndentationDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>BEFORE INDENTED TABLE</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblInd w:w="720" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>IND-A1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>IND-B1</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>IND-A2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>IND-B2</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>AFTER INDENTED TABLE</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'table-indentation.docx');
}

export async function generateTableTextOverlapDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>BEFORE OVERLAP TABLE</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:r><w:t>OVERLAP R1C1 with padding and thick borders</w:t></w:r></w:p><w:p><w:r><w:t>Second line R1C1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:r><w:t>OVERLAP R1C2 with padding and thick borders</w:t></w:r></w:p><w:p><w:r><w:t>Second line R1C2</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>OVERLAP R2C1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>OVERLAP R2C2</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>OVERLAP R3C1 final row content</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>OVERLAP R3C2 final row content</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>AFTER TABLE MARKER MUST NOT OVERLAP</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'table-text-overlap.docx');
}

/**
 * Table rendering fidelity fixtures (change table-rendering-fidelity, T10).
 *
 * 4. table-wide-adaptive.docx — 4 columns at 4000 dxa each (16000 dxa total,
 *    ~1067px) against a ~624px content area with `w:tblLayout autofit`. Word
 *    scales columns proportionally to fit; the painter must do the same
 *    (no horizontal overflow).
 * 5. table-multipage-header.docx — 1 `w:tblHeader` header row + 45 body rows
 *    (incl. a gridSpan merge, a vMerge span, and one tall multi-paragraph
 *    cell that forces a mid-row break). The table spans 2+ pages; the header
 *    row must repeat on every continuation fragment and row splits must land
 *    on paragraph boundaries with coordinated fragment heights.
 */
export async function generateTableWideAdaptiveDocx(): Promise<void> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>WIDE ADAPTIVE TABLE</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblLayout w:type="autofit"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>WIDE-A1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>WIDE-B1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>WIDE-C1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>WIDE-D1</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>WIDE-A2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>WIDE-B2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>WIDE-C2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>WIDE-D2</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>AFTER WIDE TABLE MARKER</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'table-wide-adaptive.docx');
}

export async function generateTableMultipageHeaderDocx(): Promise<void> {
  const borders = `<w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>`;

  const headerRow = `<w:tr>
        <w:trPr><w:tblHeader/></w:trPr>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/></w:tcPr><w:p><w:r><w:t>HDR-REPEAT-A</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/></w:tcPr><w:p><w:r><w:t>HDR-REPEAT-B</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/></w:tcPr><w:p><w:r><w:t>HDR-REPEAT-C</w:t></w:r></w:p></w:tc>
      </w:tr>`;

  let bodyRows = '';
  for (let n = 1; n <= 45; n++) {
    if (n === 10) {
      // Horizontal merge: B+C merged via gridSpan (complex-merge coverage).
      bodyRows += `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R10C1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>R10BC-MERGED</w:t></w:r></w:p></w:tc>
      </w:tr>`;
      continue;
    }
    if (n === 20) {
      bodyRows += `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>R20-SPAN-START</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R20C2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R20C3</w:t></w:r></w:p></w:tc>
      </w:tr>`;
      continue;
    }
    if (n === 21) {
      bodyRows += `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R21C2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R21C3</w:t></w:r></w:p></w:tc>
      </w:tr>`;
      continue;
    }
    if (n === 30) {
      // Tall multi-paragraph cell: forces a mid-row break at a paragraph
      // boundary (not mid-line) with coordinated fragment heights.
      let paras = '';
      for (let p = 1; p <= 10; p++) {
        paras += `<w:p><w:r><w:t>TALL R30C1 para ${p} of 10 with enough text to wrap across lines in the cell.</w:t></w:r></w:p>`;
      }
      bodyRows += `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${paras}</w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R30C2 short</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R30C3 short</w:t></w:r></w:p></w:tc>
      </w:tr>`;
      continue;
    }
    bodyRows += `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R${n}C1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R${n}C2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>R${n}C3</w:t></w:r></w:p></w:tc>
      </w:tr>`;
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>MULTIPAGE HEADER TABLE</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        ${borders}
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>
      ${headerRow}
      ${bodyRows}
    </w:tbl>
    <w:p><w:r><w:t>AFTER MULTIPAGE TABLE MARKER</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  await createDocx(documentXml, 'table-multipage-header.docx');
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('Generating DOCX test fixtures...\n');

  await generateEmptyDocx();
  await generateStyledContentDocx();
  await generateWithTablesDocx();
  await generateComplexStylesDocx();
  await generateHeaderWithTableDocx();
  await generateHeaderWithTableAndParagraphsDocx();
  await generateEndnotesTrackedChangesDocx();
  await generateCommentsRoundtripDocx();
  await generateTrackedChangesRoundtripDocx();
  await generateHighlightRoundtripDocx();
  await generateThemeColorRoundtripDocx();
  await generateEastAsianFontRoundtripDocx();
  await generateTableMergeBeyondFirstColDocx();
  await generateTableIndentationDocx();
  await generateTableTextOverlapDocx();
  await generateTableWideAdaptiveDocx();
  await generateTableMultipageHeaderDocx();

  console.log('\nAll fixtures generated successfully!');
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error generating fixtures:', error);
    process.exit(1);
  });
}
