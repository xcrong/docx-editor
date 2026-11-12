/**
 * Generate ooxml-feature-gaps fixtures (clean-room, no Word needed).
 *
 *  - footer-hlink-image.docx : footer with a clickable PNG (a:hlinkClick → https://example.com/footer-logo)
 *  - svg-image.docx          : body drawing referencing media/image1.svg
 *  - tiff-image.docx         : body drawing referencing media/image1.tif (minimal TIFF header)
 *  - null-lvltext.docx       : numbering with a level missing w:lvlText
 *  - column-sep.docx         : 2-column section with w:sep="1"
 */
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e', 'fixtures');

// --- tiny PNG (reuse pattern from gen-fixture-header-vml-emf.mjs) ---
function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function makePng(w, h, [r, g, b]) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const p = row + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = makePng(96, 80, [0x18, 0x80, 0x60]);

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function drawingXml(docPrInner, embedRId) {
  return (
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="762000"/><wp:docPr id="1" name="Picture 1">${docPrInner}</wp:docPr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="pic"/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${embedRId}"/></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="762000"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
  );
}

const stylesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style></w:styles>`;

const pkgRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

function contentTypes(extraDefaults, extraOverrides) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    (extraDefaults ?? '') +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    (extraOverrides ?? '') +
    `</Types>`
  );
}

async function writeDocx(name, files) {
  const zip = new JSZip();
  for (const [p, content] of Object.entries(files)) zip.file(p, content);
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  writeFileSync(join(DIR, name), out);
  console.log(`wrote e2e/fixtures/${name} (${out.length}b)`);
}

// 1. footer clickable image
await writeDocx('footer-hlink-image.docx', {
  '[Content_Types].xml': contentTypes(
    '',
    `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`
  ),
  '_rels/.rels': pkgRels,
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body><w:p><w:r><w:t>Body above footer with clickable logo.</w:t></w:r></w:p><w:sectPr><w:footerReference w:type="default" r:id="rId5"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
  'word/styles.xml': stylesXml,
  'word/footer1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:r>${drawingXml('<a:hlinkClick r:id="rId2"/>', 'rId1')}</w:r></w:p><w:p><w:r><w:t>Footer caption</w:t></w:r></w:p></w:ftr>`,
  'word/_rels/footer1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/footer-logo" TargetMode="External"/></Relationships>`,
  'word/media/image1.png': png,
});

// 2. SVG image in body
const svgBytes = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="80"><rect width="96" height="80" fill="#185060"/><circle cx="48" cy="40" r="24" fill="#ffd166"/></svg>`,
  'utf8'
);
await writeDocx('svg-image.docx', {
  '[Content_Types].xml': contentTypes('<Default Extension="svg" ContentType="image/svg+xml"/>', ''),
  '_rels/.rels': pkgRels,
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body><w:p><w:r><w:t>SVG below:</w:t></w:r></w:p><w:p><w:r>${drawingXml('', 'rId2')}</w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.svg"/></Relationships>`,
  'word/styles.xml': stylesXml,
  'word/media/image1.svg': svgBytes,
});

// 3. TIFF image in body (minimal little-endian TIFF header; browsers can't decode — graceful degradation path)
const tiffHeader = Buffer.alloc(256);
tiffHeader.write('II*\x00', 0, 'binary'); // byte order + magic
tiffHeader.writeUInt32LE(8, 4); // IFD offset
tiffHeader.writeUInt16LE(1, 8); // 1 entry
tiffHeader.writeUInt16LE(0x0100, 10); // ImageWidth
tiffHeader.writeUInt16LE(3, 12); // type SHORT
tiffHeader.writeUInt32LE(1, 14); // count
tiffHeader.writeUInt32LE(96, 18); // value/offset
tiffHeader.writeUInt32LE(0, 22); // next IFD
await writeDocx('tiff-image.docx', {
  '[Content_Types].xml': contentTypes(
    '<Default Extension="tif" ContentType="image/tiff"/><Default Extension="tiff" ContentType="image/tiff"/>',
    ''
  ),
  '_rels/.rels': pkgRels,
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body><w:p><w:r><w:t>TIFF below (graceful degradation if undecodable):</w:t></w:r></w:p><w:p><w:r>${drawingXml('', 'rId2')}</w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.tif"/></Relationships>`,
  'word/styles.xml': stylesXml,
  'word/media/image1.tif': tiffHeader,
});

// 4. numbering with missing lvlText
const numberingXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS}>` +
  `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>` +
  `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
await writeDocx('null-lvltext.docx', {
  '[Content_Types].xml': contentTypes(
    '',
    `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`
  ),
  '_rels/.rels': pkgRels,
  'word/document.xml':
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>` +
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First item with missing lvlText</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Second item</w:t></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
  'word/styles.xml': stylesXml,
  'word/numbering.xml': numberingXml,
});

// 5. two columns with separator line
await writeDocx('column-sep.docx', {
  '[Content_Types].xml': contentTypes('', ''),
  '_rels/.rels': pkgRels,
  'word/document.xml':
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>` +
    `<w:p><w:r><w:t>Left column text. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Right column text. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi.</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>More content to fill the columns so the separator line has height to span across the page content area.</w:t></w:r></w:p>` +
    `<w:sectPr><w:cols w:num="2" w:space="708" w:sep="1"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  'word/styles.xml': stylesXml,
});
