/**
 * Build a minimal DOCX fixture exercising tab leaders. The body holds six
 * paragraphs, each with a right-aligned tab stop using a different leader
 * (`dot`, `hyphen`, `underscore`, `heavy`, `middleDot`), plus a long-title
 * dot-leader entry where the leader gap is short:
 *
 *   <w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" .../></w:tabs></w:pPr>
 *     <w:r><w:t>Title</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>5</w:t></w:r>
 *   </w:p>
 */

import JSZip from 'jszip';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'e2e/fixtures/toc-dot-leaders.docx');

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const ENTRY = (title, page, leader) => `    <w:p>
      <w:pPr><w:tabs><w:tab w:val="right" w:leader="${leader}" w:pos="9350"/></w:tabs></w:pPr>
      <w:r><w:t xml:space="preserve">${title}</w:t></w:r>
      <w:r><w:tab/></w:r>
      <w:r><w:t>${page}</w:t></w:r>
    </w:p>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}>
  <w:body>
${ENTRY('Introduction', '5', 'dot')}
${ENTRY('Getting started with the editor', '12', 'hyphen')}
${ENTRY('Advanced formatting options', '27', 'underscore')}
${ENTRY('Keyboard shortcuts reference', '33', 'heavy')}
${ENTRY('Frequently asked questions', '41', 'middleDot')}
${ENTRY('A much longer section title that leaves only a short gap for the leader', '48', 'dot')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:num="1" w:sep="0" w:space="720" w:equalWidth="1"/>
    </w:sectPr>
  </w:body>
</w:document>`;

async function main() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', DOCUMENT);

  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  fs.writeFileSync(OUT, out);
  console.log('Wrote', path.relative(ROOT, OUT), '(', out.length, 'bytes)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
