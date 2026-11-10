import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { parseDocx } from '../parser';
import { repackDocx } from '../rezip';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { fromProseDoc } from '../../prosemirror/conversion/fromProseDoc';
import { serializeDocument } from '../serializer/documentSerializer';
import type { Paragraph } from '../../types/document';

// T27-01 (issues #77 + #70): paragraph-mark revision round-trip channel.
// A DOCX carrying `w:pPrIns`-style paragraph-mark revisions (`w:ins` /
// `w:del` in `w:pPr/w:rPr`), a paragraph-mark rPr change
// (`CT_ParaRPrChange`), a `w:pPrChange`, and `w:sectPrChange` in BOTH
// placements must survive parse → model → toProseDoc → fromProseDoc →
// serialize with attr↔XML correspondence. Real DOCX fixture (zipped
// document.xml), no string-only model tests.

const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
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
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

async function buildFixtureDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', RELS);
  zip.folder('word')!.file('document.xml', DOC_XML);
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function readDocumentXml(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml')!.async('text');
}

describe('T27-01: paragraph-mark revision round trip', () => {
  test('parser surfaces pPrIns / pPrDel / paraRPrChange / pPrChange / sectPrChange', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    const paras = doc.package.document.content.filter(
      (b): b is Paragraph => b.type === 'paragraph'
    );
    expect(paras).toHaveLength(5);

    // Paragraph 1: inserted pilcrow.
    expect(paras[0]!.pPrIns).toMatchObject({ id: 101, author: 'Alice' });
    // Paragraph 2: deleted pilcrow (dateless) + paragraph-mark rPr change.
    expect(paras[1]!.pPrDel).toMatchObject({ id: 102, author: 'Bob' });
    expect(paras[1]!.paraRPrChange).toHaveLength(1);
    expect(paras[1]!.paraRPrChange![0]!.info).toMatchObject({ id: 103, author: 'Bob' });
    expect(paras[1]!.paraRPrChange![0]!.previousFormatting).toMatchObject({ bold: true });
    // Paragraph 3: property change with prior snapshot.
    expect(paras[2]!.propertyChanges).toHaveLength(1);
    expect(paras[2]!.propertyChanges![0]!.info).toMatchObject({ id: 104, author: 'Cara' });
    expect(paras[2]!.propertyChanges![0]!.previousFormatting).toMatchObject({
      alignment: 'center',
    });
    // Paragraph 4: pPr-level sectPr with change; prior snapshot kept.
    expect(paras[3]!.sectionProperties?.pageWidth).toBe(12240);
    expect(paras[3]!.sectionProperties?.sectPrChange?.info).toMatchObject({
      id: 105,
      author: 'Dan',
    });
    expect(paras[3]!.sectionProperties?.sectPrChange?.previousSectionProperties?.pageWidth).toBe(
      16840
    );
    // Body-level final sectPr with change.
    expect(doc.package.document.finalSectionProperties?.orientation).toBe('landscape');
    expect(doc.package.document.finalSectionProperties?.sectPrChange?.info).toMatchObject({
      id: 106,
      author: 'Erin',
    });
  });

  test('toProseDoc → fromProseDoc preserves the revision attrs', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    const pmDoc = toProseDoc(doc);

    const p1 = pmDoc.maybeChild(0);
    expect(p1?.attrs.pPrIns).toMatchObject({ revisionId: 101, author: 'Alice' });
    const p2 = pmDoc.maybeChild(1);
    expect(p2?.attrs.pPrDel).toMatchObject({ revisionId: 102, author: 'Bob' });
    expect(p2?.attrs.paraRPrChange).toHaveLength(1);
    expect(p2?.attrs.paraRPrChange[0].info).toMatchObject({ id: 103, author: 'Bob' });
    const p3 = pmDoc.maybeChild(2);
    expect(p3?.attrs.pPrChange).toHaveLength(1);
    const p4 = pmDoc.maybeChild(3);
    expect(p4?.attrs._sectionProperties?.sectPrChange?.info).toMatchObject({
      id: 105,
      author: 'Dan',
    });

    const backToModel = fromProseDoc(pmDoc, doc);
    const paras = backToModel.package.document.content.filter(
      (b): b is Paragraph => b.type === 'paragraph'
    );
    expect(paras[0]!.pPrIns).toMatchObject({ id: 101, author: 'Alice' });
    expect(paras[1]!.pPrDel).toMatchObject({ id: 102, author: 'Bob' });
    expect(paras[1]!.paraRPrChange).toHaveLength(1);
    expect(paras[1]!.paraRPrChange![0]!.previousFormatting).toMatchObject({ bold: true });
    expect(paras[2]!.propertyChanges).toHaveLength(1);
    expect(paras[3]!.sectionProperties?.sectPrChange?.info).toMatchObject({
      id: 105,
      author: 'Dan',
    });
    // Body-level final section properties ride the base document through.
    expect(backToModel.package.document.finalSectionProperties?.sectPrChange?.info).toMatchObject({
      id: 106,
      author: 'Erin',
    });
  });

  test('serializer re-emits every marker in schema-mandated positions', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    const backToModel = fromProseDoc(toProseDoc(doc), doc);
    const xml = serializeDocument(backToModel);

    // pPrIns survives.
    expect(xml).toContain('<w:ins w:id="101" w:author="Alice"');
    // pPrDel comes before rPrChange inside the paragraph-mark rPr.
    const delIdx = xml.indexOf('<w:del w:id="102"');
    const markChangeIdx = xml.indexOf('<w:rPrChange w:id="103"');
    expect(delIdx).toBeGreaterThan(-1);
    expect(markChangeIdx).toBeGreaterThan(delIdx);
    expect(xml).toContain('<w:rPr><w:b/></w:rPr></w:rPrChange>');
    // pPrChange is the last child of w:pPr.
    expect(xml).toMatch(/<w:pPrChange w:id="104"[^>]*>.*?<\/w:pPrChange><\/w:pPr>/s);
    // sectPrChange closes both sectPr placements.
    const sectPrChanges = xml.match(/<w:sectPrChange w:id="10[56]"/g) ?? [];
    expect(sectPrChanges).toHaveLength(2);
    expect(xml).toMatch(/<w:sectPrChange w:id="105".*?<\/w:sectPrChange><\/w:sectPr>/s);
    expect(xml).toMatch(/<w:sectPrChange w:id="106".*?<\/w:sectPrChange><\/w:sectPr>/s);
  });

  test('headless repackDocx keeps the markers (no editor involved)', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    const repacked = await repackDocx(doc);
    const xml = await readDocumentXml(repacked);
    for (const id of [101, 102, 103, 104, 105, 106]) {
      expect(xml).toContain(`w:id="${id}"`);
    }
  });
});
