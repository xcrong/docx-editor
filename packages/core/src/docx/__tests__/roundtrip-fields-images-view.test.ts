import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import { parseDocx } from '../parser';
import { repackDocx } from '../rezip';
import { attemptSelectiveSave } from '../selectiveSave';
import { parseSettings, updateSettingsViewXml } from '../settingsParser';
import { ensureUniqueDrawingIds } from '../drawingIds';
import { serializeDocument } from '../serializer/documentSerializer';
import { serializeHeaderFooter } from '../serializer/headerFooterSerializer';
import { headerFooterToProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { proseDocToBlocks } from '../../prosemirror/conversion/fromProseDoc';
import type { Document, Paragraph, Image } from '../../types/document';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const WP_NS = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const PIC_NS = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);
const OTHER_PNG = Uint8Array.from([...TINY_PNG.slice(0, 40), 0x01, ...TINY_PNG.slice(41)]);

function fieldParagraph(label: string, instruction: string, result: string): string {
  return (
    `<w:p><w:r><w:t xml:space="preserve">${label} </w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>${result}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
  );
}

function imageParagraph(docPrId: string, rId: string): string {
  return (
    `<w:p><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="914400" cy="914400"/>` +
    `<wp:docPr id="${docPrId}" name="Picture ${rId}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Picture ${rId}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r></w:p>`
  );
}

const FOOTER_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:ftr ${W_NS} ${WP_NS} ${A_NS} ${PIC_NS} ${R_NS}>` +
  fieldParagraph('Page', 'PAGE', '1') +
  fieldParagraph('of', 'NUMPAGES', '3') +
  `</w:ftr>`;

const SETTINGS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:settings ${W_NS}>` +
  `<w:defaultTabStop w:val="720"/>` +
  `<w:view w:val="web"/>` +
  `</w:settings>`;

function documentXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${W_NS} ${WP_NS} ${A_NS} ${PIC_NS} ${R_NS}>` +
    `<w:body>` +
    imageParagraph('0', 'img2073076884') +
    imageParagraph('0', 'rIdCustom7') +
    `<w:p><w:r><w:t>Hello</w:t></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:footerReference w:type="default" r:id="rIdFooter1"/></w:sectPr>` +
    `</w:body></w:document>`
  );
}

function documentRelsXml(): string {
  const img = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  const footer = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
  const settings = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="img2073076884" Type="${img}" Target="media/image1.png"/>` +
    `<Relationship Id="rIdCustom7" Type="${img}" Target="media/image2.png"/>` +
    `<Relationship Id="rIdFooter1" Type="${footer}" Target="footer1.xml"/>` +
    `<Relationship Id="rIdSettings" Type="${settings}" Target="settings.xml"/>` +
    `</Relationships>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Default Extension="png" ContentType="image/png"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
  `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
  `</Types>`;

const PKG_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

async function buildFixtureDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', PKG_RELS);
  const word = zip.folder('word')!;
  word.file('document.xml', documentXml());
  word.file('footer1.xml', FOOTER_XML);
  word.file('settings.xml', SETTINGS_XML);
  word.folder('media')!.file('image1.png', TINY_PNG);
  word.folder('media')!.file('image2.png', OTHER_PNG);
  word.folder('_rels')!.file('document.xml.rels', documentRelsXml());
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function readZipText(buf: ArrayBuffer, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(path);
  expect(file).not.toBeNull();
  return file!.async('text');
}

function collectImages(doc: Parameters<typeof serializeDocument>[0]): Image[] {
  const images: Image[] = [];
  const visitContents = (contents: Paragraph['content']): void => {
    for (const item of contents) {
      if (item.type === 'run') {
        for (const c of item.content) {
          if (c.type === 'drawing') images.push(c.image);
        }
      } else if (item.type === 'hyperlink') {
        for (const c of item.children) {
          if (c.type === 'run') {
            for (const rc of c.content) {
              if (rc.type === 'drawing') images.push(rc.image);
            }
          } else {
            visitContents([c as Paragraph['content'][number]]);
          }
        }
      } else if (
        item.type === 'insertion' ||
        item.type === 'deletion' ||
        item.type === 'moveFrom' ||
        item.type === 'moveTo'
      ) {
        visitContents(item.content as Paragraph['content']);
      }
    }
  };
  for (const block of doc.package.document.content) {
    if (block.type === 'paragraph') visitContents(block.content);
    else if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          for (const b of cell.content) {
            if (b.type === 'paragraph') visitContents(b.content);
          }
        }
      }
    }
  }
  return images;
}

// ---------------------------------------------------------------------------
// 1. Footer PAGE/NUMPAGES complex fields survive the round trip
// ---------------------------------------------------------------------------

describe('e2e: footer with field codes roundtrip', () => {
  test('footer PAGE/NUMPAGES parse as complex fields, not text', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    const footer = doc.package.footers?.get('rIdFooter1');
    expect(footer).toBeDefined();
    const fields = footer!.content.flatMap((b) =>
      b.type === 'paragraph' ? b.content.filter((c) => c.type === 'complexField') : []
    );
    expect(fields.map((f) => (f.type === 'complexField' ? f.fieldType : ''))).toEqual([
      'PAGE',
      'NUMPAGES',
    ]);
  });

  test('repack keeps w:fldChar/w:instrText structure in the footer part', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    const repacked = await repackDocx(doc, { updateModifiedDate: false });
    const footerXml = await readZipText(repacked, 'word/footer1.xml');
    expect(footerXml).toContain('<w:fldChar w:fldCharType="begin"/>');
    expect(footerXml).toContain('<w:fldChar w:fldCharType="separate"/>');
    expect(footerXml).toContain('<w:fldChar w:fldCharType="end"/>');
    expect(footerXml).toContain('PAGE');
    expect(footerXml).toContain('NUMPAGES');

    // Re-parsing the repacked file still yields field structures.
    const reparsed = await parseDocx(repacked);
    const footer = reparsed.package.footers?.values().next().value;
    expect(footer).toBeDefined();
    const types: string[] = [];
    for (const b of footer!.content) {
      if (b.type !== 'paragraph') continue;
      for (const c of b.content) {
        if (c.type === 'complexField') types.push(c.fieldType);
      }
    }
    expect(types).toEqual(['PAGE', 'NUMPAGES']);
  });

  test('edited-footer PM path (proseDocToBlocks + serialize) keeps fields', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    const footer = doc.package.footers?.get('rIdFooter1');
    expect(footer).toBeDefined();
    if (!footer) throw new Error('fixture footer missing');

    // Simulate what the adapters do on footer edit: PM round trip, then clear
    // verbatimXml so the model (not the original bytes) is serialized.
    const pmDoc = headerFooterToProseDoc(footer.content);
    const blocks = proseDocToBlocks(pmDoc);
    const edited = { ...footer, content: blocks, verbatimXml: undefined };
    const xml = serializeHeaderFooter(edited);

    expect(xml).toContain('<w:fldChar w:fldCharType="begin"/>');
    expect(xml).toContain('<w:fldChar w:fldCharType="separate"/>');
    expect(xml).toContain('<w:fldChar w:fldCharType="end"/>');
    expect(xml).toContain('PAGE');
    expect(xml).toContain('NUMPAGES');
  });
});

// ---------------------------------------------------------------------------
// 2. Multiple images sharing pic:cNvPr/wp:docPr id="0" + non-standard rIds
// ---------------------------------------------------------------------------

describe('e2e: multiple images with duplicate IDs', () => {
  test('both images resolve via r:embed (no cNvPr dedup drop)', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    const images = collectImages(doc);
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.rId).sort()).toEqual(['img2073076884', 'rIdCustom7']);
    // Both media targets resolve — each image keeps its own bytes.
    expect(images[0].src).toMatch(/^data:image\/png;base64,/);
    expect(images[1].src).toMatch(/^data:image\/png;base64,/);
    expect(images[0].src).not.toBe(images[1].src);
  });

  test('serializer emits unique positive docPr/cNvPr ids, r:embed untouched', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    ensureUniqueDrawingIds(doc);
    const images = collectImages(doc);
    const ids = images.map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^[1-9]\d*$/);
    }
    // Non-standard relationship IDs are model data, never rewritten.
    expect(images.map((i) => i.rId).sort()).toEqual(['img2073076884', 'rIdCustom7']);

    const xml = serializeDocument(doc);
    expect(xml).toContain('r:embed="img2073076884"');
    expect(xml).toContain('r:embed="rIdCustom7"');
    const docPrIds = [...xml.matchAll(/<wp:docPr id="(\d+)"[^>]*>/g)].map((m) => m[1]);
    const cNvPrIds = [...xml.matchAll(/<pic:cNvPr id="(\d+)"[^>]*>/g)].map((m) => m[1]);
    expect(docPrIds).toHaveLength(2);
    expect(new Set(docPrIds).size).toBe(2);
    expect(cNvPrIds).toHaveLength(2);
    expect(new Set(cNvPrIds).size).toBe(2);
    expect(docPrIds).not.toContain('0');

    // Full repack keeps both images and both relationships.
    const repacked = await repackDocx(await parseDocx(await buildFixtureDocx()), {
      updateModifiedDate: false,
    });
    const outDoc = await readZipText(repacked, 'word/document.xml');
    expect(outDoc).toContain('r:embed="img2073076884"');
    expect(outDoc).toContain('r:embed="rIdCustom7"');
    const outZip = await JSZip.loadAsync(repacked);
    expect(outZip.file('word/media/image1.png')).not.toBeNull();
    expect(outZip.file('word/media/image2.png')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. settings.xml w:view preservation
// ---------------------------------------------------------------------------

describe('e2e: w:view roundtrip preservation', () => {
  test('parseSettings reads w:view', () => {
    expect(parseSettings(SETTINGS_XML).view).toBe('web');
    expect(parseSettings(null).view).toBeUndefined();
  });

  test('updateSettingsViewXml replaces and inserts without touching the rest', () => {
    const replaced = updateSettingsViewXml(SETTINGS_XML, 'print');
    expect(replaced).toContain('<w:view w:val="print"/>');
    expect(replaced).toContain('<w:defaultTabStop w:val="720"/>');
    expect(replaced).not.toContain('w:val="web"');

    const noView = SETTINGS_XML.replace(/<w:view[^>]*\/>/, '');
    expect(noView).not.toContain('<w:view');
    const inserted = updateSettingsViewXml(noView, 'outline');
    expect(inserted).toContain('<w:view w:val="outline"/>');
    expect(inserted).toContain('<w:defaultTabStop w:val="720"/>');

    // Empty view / missing root: passthrough.
    expect(updateSettingsViewXml(SETTINGS_XML, '  ')).toBe(SETTINGS_XML);
    expect(updateSettingsViewXml('<foo/>', 'web')).toBe('<foo/>');
  });

  test('parse -> repack keeps w:view, and model edits write back', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    expect(doc.package.settings?.view).toBe('web');

    const repacked = await repackDocx(doc, { updateModifiedDate: false });
    const settingsXml = await readZipText(repacked, 'word/settings.xml');
    expect(settingsXml).toContain('<w:view w:val="web"/>');
    expect((await parseDocx(repacked)).package.settings?.view).toBe('web');

    // A programmatic view change is written back (not just passed through).
    const doc2 = await parseDocx(await buildFixtureDocx());
    doc2.package.settings = { ...doc2.package.settings!, view: 'print' };
    const repacked2 = await repackDocx(doc2, { updateModifiedDate: false });
    expect(await readZipText(repacked2, 'word/settings.xml')).toContain('<w:view w:val="print"/>');
  });
});

// ---------------------------------------------------------------------------
// 4. Edited-footer full repack (exercises the serializer, not the passthrough)
// ---------------------------------------------------------------------------

describe('e2e: edited footer survives full repack via the serializer', () => {
  test('clearing verbatimXml routes the footer through serializeHeaderFooter', async () => {
    const doc = await parseDocx(await buildFixtureDocx());
    for (const footer of doc.package.footers!.values()) {
      footer.verbatimXml = undefined;
    }
    const repacked = await repackDocx(doc, { updateModifiedDate: false });
    const footerXml = await readZipText(repacked, 'word/footer1.xml');
    expect(footerXml).toContain('<w:fldChar w:fldCharType="begin"/>');
    expect(footerXml).toContain('<w:fldChar w:fldCharType="separate"/>');
    expect(footerXml).toContain('<w:fldChar w:fldCharType="end"/>');
    expect(footerXml).toContain('PAGE');
    expect(footerXml).toContain('NUMPAGES');
  });
});

// ---------------------------------------------------------------------------
// 5. Selective save never writes a dangling r:embed
// ---------------------------------------------------------------------------

const W14_NS = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
const PASTE_RID = 'rId_img_12345_paste';

async function buildPasteFixture(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`
  );
  zip
    .folder('_rels')!
    .file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`
    );
  const word = zip.folder('word')!;
  word.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document ${W_NS} ${W14_NS}><w:body>` +
      `<w:p w14:paraId="1B2C3D4E"><w:r><w:t>hi</w:t></w:r></w:p>` +
      `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>` +
      `</w:body></w:document>`
  );
  word
    .folder('_rels')!
    .file(
      'document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
    );
  return zip.generateAsync({ type: 'arraybuffer' });
}

function pasteImage(doc: Document): string {
  const para = doc.package.document.content[0] as Paragraph;
  para.content.push({
    type: 'run',
    content: [
      {
        type: 'drawing',
        image: {
          type: 'image',
          rId: PASTE_RID,
          src: `data:image/png;base64,${Buffer.from(TINY_PNG).toString('base64')}`,
          size: { width: 914400, height: 914400 },
          wrap: { type: 'inline' },
        },
      },
    ],
  });
  return (para as Paragraph).paraId!;
}

describe('e2e: selective save with a pasted image', () => {
  test('selective bails so the placeholder rId never dangles', async () => {
    const buf = await buildPasteFixture();
    const doc = await parseDocx(buf);
    const pid = pasteImage(doc);
    const out = await attemptSelectiveSave(doc, buf, {
      changedParaIds: new Set([pid]),
      structuralChange: false,
      hasUntrackedChanges: false,
    });
    expect(out).toBeNull();
  });

  test('full repack registers the pasted image with a rel + media file', async () => {
    const doc = await parseDocx(await buildPasteFixture());
    pasteImage(doc);
    const repacked = await repackDocx(doc, { updateModifiedDate: false });
    const outZip = await JSZip.loadAsync(repacked);
    const docXml = await outZip.file('word/document.xml')!.async('text');
    const m = docXml.match(/r:embed="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toBe(PASTE_RID);
    const rels = await outZip.file('word/_rels/document.xml.rels')!.async('text');
    expect(rels).toContain(`Id="${m![1]}"`);
    const media = Object.keys(outZip.files).filter(
      (p) => p.startsWith('word/media/') && !outZip.files[p].dir
    );
    expect(media).toHaveLength(1);
  });

  test('selective still patches text-only edits', async () => {
    const buf = await buildPasteFixture();
    const doc = await parseDocx(buf);
    const para = doc.package.document.content[0] as Paragraph;
    const run = para.content.find((c) => c.type === 'run') as {
      type: 'run';
      content: { type: 'text'; text: string }[];
    };
    run.content[0] = { type: 'text', text: 'hello' };
    const out = await attemptSelectiveSave(doc, buf, {
      changedParaIds: new Set([para.paraId!]),
      structuralChange: false,
      hasUntrackedChanges: false,
    });
    expect(out).not.toBeNull();
    expect(await readZipText(out!, 'word/document.xml')).toContain('hello');
  });
});

// ---------------------------------------------------------------------------
// 6. Drawing ID + view edge cases
// ---------------------------------------------------------------------------

describe('drawing ID edge cases', () => {
  function docWithIds(ids: (string | undefined)[]): Document {
    return {
      package: {
        document: {
          content: ids.map(
            (id): Paragraph => ({
              type: 'paragraph',
              content: [
                {
                  type: 'run',
                  content: [
                    {
                      type: 'drawing',
                      image: {
                        type: 'image',
                        rId: 'rId1',
                        size: { width: 1, height: 1 },
                        wrap: { type: 'inline' },
                        ...(id === undefined ? {} : { id }),
                      },
                    },
                  ],
                },
              ],
            })
          ),
        },
      },
    } as Document;
  }

  test('huge (>= 2^53) ids are remapped, never duplicated', () => {
    const doc = docWithIds(['9007199254740992', '0', '9007199254740992']);
    ensureUniqueDrawingIds(doc);
    const ids = collectImages(doc).map((i) => i.id!);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[1-9]\d*$/);
  });

  test('whitespace-padded ids are normalized in place', () => {
    const doc = docWithIds([' 3 ']);
    ensureUniqueDrawingIds(doc);
    expect(collectImages(doc)[0].id).toBe('3');
  });

  test('auto ids never collide with later explicit ids regardless of order', () => {
    const doc = docWithIds([undefined, '1']);
    ensureUniqueDrawingIds(doc);
    const ids = collectImages(doc).map((i) => i.id!);
    expect(new Set(ids).size).toBe(2);
  });

  test('drawings under hyperlink wrappers are normalized too', () => {
    const doc = docWithIds(['0']);
    const para = doc.package.document.content[0] as Paragraph;
    const drawing = (para.content[0] as { content: unknown[] }).content[0];
    para.content = [
      {
        type: 'hyperlink',
        // Not producible by the parser (children are typed as runs), but
        // tolerated defensively so programmatically built models stay valid.
        children: [{ type: 'insertion', content: [{ type: 'run', content: [drawing] }] }],
      } as unknown as Paragraph['content'][number],
    ];
    ensureUniqueDrawingIds(doc);
    const ids = collectImages(doc).map((i) => i.id!);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^[1-9]\d*$/);
  });
});

describe('w:view edge cases', () => {
  test('self-closing settings root stays well-formed', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + `<w:settings ${W_NS}/>`;
    const out = updateSettingsViewXml(xml, 'web');
    expect(out).toContain('<w:view w:val="web"/>');
    expect(out).toContain('</w:settings>');
    expect(out).not.toContain('/><w:view');
  });

  test('uppercase self-closing root keeps matching close-tag case', () => {
    const xml = `<W:SETTINGS ${W_NS}/>`;
    const out = updateSettingsViewXml(xml, 'web');
    expect(out).toContain('</W:SETTINGS>');
    expect(out).not.toContain('</w:settings>');
  });

  test('uppercase / foreign-prefix / duplicate views collapse to one', () => {
    const xml =
      `<w:settings ${W_NS}>` +
      `<W:VIEW w:val="none"/>` +
      `<w:view w:val="web"/><w:view w:val="print"/>` +
      `</w:settings>`;
    const out = updateSettingsViewXml(xml, 'outline');
    expect(out.match(/view\b[^>]*w:val="outline"/g)).toHaveLength(1);
    expect(out).not.toContain('w:val="none"');
    expect(out).not.toContain('w:val="web"');
  });

  test('view with quoted > in attributes does not break the match', () => {
    const xml = `<w:settings ${W_NS}><w:view w:val="a>b"/></w:settings>`;
    const out = updateSettingsViewXml(xml, 'web');
    expect(out).toContain('<w:view w:val="web"/>');
    expect(out.match(/<w:view/g)).toHaveLength(1);
  });
});
