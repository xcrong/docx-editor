import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// T27-01 (issues #77 + #70): real-DOCX fixture carrying paragraph-mark
// revisions — pPrIns (101), pPrDel (102) + paragraph-mark rPrChange (103),
// pPrChange (104), pPr-level sectPrChange (105), body-level sectPrChange
// (106). Same validated content as the core round-trip unit test
// (paragraph-mark-revision-roundtrip.test.ts), plus a styles part so Word
// opens it cleanly. Regenerate with: bun e2e/fixtures/build-paragraph-mark-revisions-fixture.mjs
const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr>
        <w:rPr>
          <w:ins w:id="101" w:author="Alice" w:date="2024-01-02T03:04:05Z"/>
        </w:rPr>
      </w:pPr>
      <w:r><w:t>Inserted break</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:rPr>
          <w:del w:id="102" w:author="Bob"/>
          <w:rPrChange w:id="103" w:author="Bob" w:date="2024-02-03T04:05:06Z"><w:rPr><w:b/></w:rPr></w:rPrChange>
        </w:rPr>
      </w:pPr>
      <w:r><w:t>Deleted break, bold pilcrow before</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="left"/>
        <w:pPrChange w:id="104" w:author="Cara" w:date="2024-03-04T05:06:07Z"><w:pPr><w:jc w:val="center"/></w:pPr></w:pPrChange>
      </w:pPr>
      <w:r><w:t>Was centered</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:sectPr>
          <w:pgSz w:w="12240" w:h="15840"/>
          <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
          <w:sectPrChange w:id="105" w:author="Dan"><w:sectPr><w:pgSz w:w="16840" w:h="23840"/></w:sectPr></w:sectPrChange>
        </w:sectPr>
      </w:pPr>
      <w:r><w:t>Section one</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Last section</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
      <w:sectPrChange w:id="106" w:author="Erin"><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:sectPrChange>
    </w:sectPr>
  </w:body>
</w:document>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', CONTENT_TYPES);
zip.folder('_rels').file('.rels', RELS);
zip.folder('word').file('document.xml', DOC_XML);
zip.folder('word').file('styles.xml', STYLES);
zip.folder('word').folder('_rels').file('document.xml.rels', DOC_RELS);

const out = join(here, 'paragraph-mark-revisions.docx');
const buf = await zip.generateAsync({ type: 'uint8array' });
writeFileSync(out, buf);
console.log('wrote', out, buf.length, 'bytes');
