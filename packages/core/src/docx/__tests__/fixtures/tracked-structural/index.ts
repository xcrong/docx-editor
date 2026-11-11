import JSZip from 'jszip';

// T27-04 (issue #80): minimal per-marker DOCX fixtures for Phase 1
// paragraph-mark / property / section revision round-trip tests. Each entry
// is a bare `word/document.xml`; `buildFixtureDocx` wraps it in the minimal
// zip scaffolding the parser needs. Kept as string constants (not binary
// .docx files) so the markers under test stay visible in review.

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function docXml(bodyInner: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="${NS}"><w:body>${bodyInner}</w:body></w:document>`
  );
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** Minimal per-marker fixtures: name → `word/document.xml`. */
export const TRACKED_STRUCTURAL_FIXTURES = {
  /** Tracked paragraph-mark insertion (`w:ins` in `w:pPr/w:rPr`). */
  pPrIns: docXml(
    `<w:p><w:pPr><w:rPr><w:ins w:id="201" w:author="Alice" w:date="2024-01-02T03:04:05Z"/></w:rPr></w:pPr>` +
      `<w:r><w:t>Inserted break</w:t></w:r></w:p>`
  ),
  /** Tracked paragraph-mark deletion (`w:del` in `w:pPr/w:rPr`). */
  pPrDel: docXml(
    `<w:p><w:pPr><w:rPr><w:del w:id="202" w:author="Bob" w:date="2024-02-03T04:05:06Z"/></w:rPr></w:pPr>` +
      `<w:r><w:t>Deleted break</w:t></w:r></w:p>`
  ),
  /** Paragraph property change (`w:pPrChange` with a prior snapshot). */
  pPrChange: docXml(
    `<w:p><w:pPr><w:jc w:val="left"/>` +
      `<w:pPrChange w:id="203" w:author="Cara" w:date="2024-03-04T05:06:07Z"><w:pPr><w:jc w:val="center"/></w:pPr></w:pPrChange>` +
      `</w:pPr><w:r><w:t>Was centered</w:t></w:r></w:p>`
  ),
  /** Paragraph-mark run-property change (`CT_ParaRPrChange`, last in `w:rPr`). */
  paraRPrChange: docXml(
    `<w:p><w:pPr><w:rPr>` +
      `<w:rPrChange w:id="204" w:author="Dan" w:date="2024-04-05T06:07:08Z"><w:rPr><w:b/></w:rPr></w:rPrChange>` +
      `</w:rPr></w:pPr><w:r><w:t>Bold pilcrow before</w:t></w:r></w:p>`
  ),
  /** Section-property changes in BOTH placements (pPr-level + body-level). */
  sectPrChange: docXml(
    `<w:p><w:pPr><w:sectPr><w:pgSz w:w="12240" w:h="15840"/>` +
      `<w:sectPrChange w:id="205" w:author="Erin"><w:sectPr><w:pgSz w:w="16840" w:h="23840"/></w:sectPr></w:sectPrChange>` +
      `</w:sectPr></w:pPr><w:r><w:t>Section one</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Last section</w:t></w:r></w:p>` +
      `<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>` +
      `<w:sectPrChange w:id="206" w:author="Frank"><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:sectPrChange></w:sectPr>`
  ),
} as const;

export type TrackedStructuralFixtureName = keyof typeof TRACKED_STRUCTURAL_FIXTURES;

/** Wrap a `word/document.xml` string in the minimal zip the parser accepts. */
export async function buildFixtureDocx(documentXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', RELS);
  zip.folder('word')!.file('document.xml', documentXml);
  return zip.generateAsync({ type: 'arraybuffer' });
}
