/**
 * Build a minimal DOCX fixture exercising paragraph `w:between` and `w:bar`
 * borders. The body holds:
 *
 *   - paras 1-3: identical w:pBdr (top/left/bottom/right red + between blue),
 *     forming one border group → Word draws the blue `between` line between
 *     para 1|2 and 2|3, and the red box only around the group as a whole.
 *   - para 4: no borders (closes the group).
 *   - para 5: a green `w:bar` border → vertical bar on the left edge.
 *   - para 6: red `w:left` + green `w:bar` → bar sits outside the left border.
 */

import JSZip from 'jszip';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'e2e/fixtures/para-border-between-bar.docx');

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

const GROUP_PBDR = `<w:pBdr>
        <w:top w:val="single" w:sz="24" w:space="1" w:color="FF0000"/>
        <w:left w:val="single" w:sz="24" w:space="1" w:color="FF0000"/>
        <w:bottom w:val="single" w:sz="24" w:space="1" w:color="FF0000"/>
        <w:right w:val="single" w:sz="24" w:space="1" w:color="FF0000"/>
        <w:between w:val="single" w:sz="24" w:space="1" w:color="0000FF"/>
      </w:pBdr>`;

const BAR_PBDR = `<w:pBdr>
        <w:bar w:val="single" w:sz="24" w:space="1" w:color="00B050"/>
      </w:pBdr>`;

const BAR_LEFT_PBDR = `<w:pBdr>
        <w:left w:val="single" w:sz="24" w:space="1" w:color="FF0000"/>
        <w:bar w:val="single" w:sz="24" w:space="1" w:color="00B050"/>
      </w:pBdr>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}>
  <w:body>
    <w:p>
      <w:pPr>${GROUP_PBDR}</w:pPr>
      <w:r><w:t>Grouped paragraph one</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>${GROUP_PBDR}</w:pPr>
      <w:r><w:t>Grouped paragraph two</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>${GROUP_PBDR}</w:pPr>
      <w:r><w:t>Grouped paragraph three</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Plain paragraph after the group</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>${BAR_PBDR}</w:pPr>
      <w:r><w:t>Paragraph with a bar border</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>${BAR_LEFT_PBDR}</w:pPr>
      <w:r><w:t>Paragraph with bar and left borders</w:t></w:r>
    </w:p>
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
