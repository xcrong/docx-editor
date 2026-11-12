/**
 * Fixture for openspec/changes/floating-image-layout remaining tasks:
 *
 * - Section A: tight-wrapped image with a NON-rectangular (triangle) wrap
 *   polygon. Wide at the top, point at the bottom: lines near the top see
 *   the full-width exclusion, lines near the tip see a narrow one.
 * - Section B: 2x2 table grid where cell (0,0) holds TWO identical floating
 *   images (same anchor offsets). Without same-cell de-overlap they paint
 *   exactly on top of each other; the cascade stacks them vertically.
 *
 * Run: bun scripts/create-float-wrap-polygon-grid-fixture.mjs
 */

import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

// --- minimal solid PNGs (copied from create-float-wrap-test.mjs) ---

function createSolidPng(width, height, r, g, b) {
  const rawRows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const offset = 1 + x * 3;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
    }
    rawRows.push(row);
  }
  const rawData = Buffer.concat(rawRows);
  const compressed = deflateSync(rawData);
  const chunks = [];
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(makePngChunk('IHDR', ihdr));
  chunks.push(makePngChunk('IDAT', compressed));
  chunks.push(makePngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function makePngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// --- builders ---

const EMU_PER_PIXEL = 9525;
const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';

let docPrCounter = 1;

const RECT_POLYGON = `
        <wp:wrapPolygon edited="0">
          <wp:start x="0" y="0"/>
          <wp:lineTo x="0" y="21600"/>
          <wp:lineTo x="21600" y="21600"/>
          <wp:lineTo x="21600" y="0"/>
          <wp:lineTo x="0" y="0"/>
        </wp:wrapPolygon>`;

// Wide at the top edge, single point at the bottom center.
const TRIANGLE_POLYGON = `
        <wp:wrapPolygon edited="0">
          <wp:start x="0" y="0"/>
          <wp:lineTo x="21600" y="0"/>
          <wp:lineTo x="10800" y="21600"/>
          <wp:lineTo x="0" y="0"/>
        </wp:wrapPolygon>`;

function buildAnchorImage({
  rId,
  widthPx,
  heightPx,
  posXPx = 0,
  posYPx = 0,
  wrapType = 'wrapSquare',
  wrapText = 'bothSides',
  polygon = null,
  name = 'Image',
}) {
  const cx = widthPx * EMU_PER_PIXEL;
  const cy = heightPx * EMU_PER_PIXEL;
  const id = docPrCounter++;

  const positionH = `<wp:positionH relativeFrom="column"><wp:posOffset>${posXPx * EMU_PER_PIXEL}</wp:posOffset></wp:positionH>`;
  const positionV = `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${posYPx * EMU_PER_PIXEL}</wp:posOffset></wp:positionV>`;

  let wrapEl;
  if (wrapType === 'wrapSquare') {
    wrapEl = `<wp:wrapSquare wrapText="${wrapText}"/>`;
  } else if (wrapType === 'wrapTight' || wrapType === 'wrapThrough') {
    const tag = wrapType === 'wrapTight' ? 'wp:wrapTight' : 'wp:wrapThrough';
    wrapEl = `<${tag} wrapText="${wrapText}">${polygon ?? RECT_POLYGON}</${tag}>`;
  } else {
    wrapEl = `<wp:wrapSquare wrapText="bothSides"/>`;
  }

  return `<w:drawing>
  <wp:anchor distT="45720" distB="45720" distL="114300" distR="114300"
             simplePos="0" relativeHeight="251658240"
             behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
    <wp:simplePos x="0" y="0"/>
    ${positionH}
    ${positionV}
    <wp:extent cx="${cx}" cy="${cy}"/>
    <wp:effectExtent l="0" t="0" r="0" b="0"/>
    ${wrapEl}
    <wp:docPr id="${id}" name="${name}"/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:nvPicPr>
            <pic:cNvPr id="${id}" name="${name}"/>
            <pic:cNvPicPr/>
          </pic:nvPicPr>
          <pic:blipFill>
            <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
            <a:stretch><a:fillRect/></a:stretch>
          </pic:blipFill>
          <pic:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="${cx}" cy="${cy}"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:anchor>
</w:drawing>`;
}

function para(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function heading(text) {
  return `<w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function tableCell(contentXml, widthTwips) {
  return `<w:tc>
  <w:tcPr>
    <w:tcW w:w="${widthTwips}" w:type="dxa"/>
    <w:tcBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>
    </w:tcBorders>
    <w:tcMar>
      <w:top w:w="72" w:type="dxa"/>
      <w:left w:w="144" w:type="dxa"/>
      <w:bottom w:w="72" w:type="dxa"/>
      <w:right w:w="144" w:type="dxa"/>
    </w:tcMar>
  </w:tcPr>
  ${contentXml}
</w:tc>`;
}

function buildDocumentXml() {
  const sections = [];

  sections.push(heading('Section A: Tight Wrap With Triangle Polygon'));
  sections.push(
    para(
      'The image below uses wrapTight with a triangular wrap polygon: full width at the top edge, a single point at the bottom center. Text must hug the triangle — wide exclusion near the top, narrow near the tip.'
    )
  );
  const triangleImg = buildAnchorImage({
    rId: 'rId10',
    widthPx: 150,
    heightPx: 150,
    wrapType: 'wrapTight',
    wrapText: 'right',
    polygon: TRIANGLE_POLYGON,
    name: 'Triangle-Tight',
  });
  sections.push(
    `<w:p><w:r>${triangleImg}</w:r><w:r><w:t xml:space="preserve">${LOREM} ${LOREM}</w:t></w:r></w:p>`
  );

  sections.push(heading('Section B: Table Grid With Two Images In One Cell'));
  sections.push(
    para(
      'Cell (1,1) holds two identical floating images with the same anchor offsets. They must stack vertically instead of painting on top of each other, and stay inside the cell.'
    )
  );

  const cellW = '4680';
  const twinA = buildAnchorImage({
    rId: 'rId11',
    widthPx: 80,
    heightPx: 60,
    wrapType: 'wrapSquare',
    wrapText: 'right',
    name: 'Grid-Twin-A',
  });
  const twinB = buildAnchorImage({
    rId: 'rId11',
    widthPx: 80,
    heightPx: 60,
    wrapType: 'wrapSquare',
    wrapText: 'right',
    name: 'Grid-Twin-B',
  });
  const cellWithTwins = tableCell(
    `<w:p><w:r>${twinA}</w:r><w:r>${twinB}</w:r><w:r><w:t xml:space="preserve">${LOREM}</w:t></w:r></w:p>`,
    cellW
  );
  const singleCell = (rId, name) =>
    tableCell(
      `<w:p><w:r>${buildAnchorImage({
        rId,
        widthPx: 80,
        heightPx: 60,
        wrapType: 'wrapSquare',
        wrapText: 'right',
        name,
      })}</w:r><w:r><w:t xml:space="preserve">${LOREM}</w:t></w:r></w:p>`,
      cellW
    );

  sections.push(`<w:tbl>
    <w:tblPr>
      <w:tblW w:w="9360" w:type="dxa"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="${cellW}"/>
      <w:gridCol w:w="${cellW}"/>
    </w:tblGrid>
    <w:tr>${cellWithTwins}${singleCell('rId12', 'Grid-Single-12')}</w:tr>
    <w:tr>${singleCell('rId13', 'Grid-Single-13')}${singleCell('rId14', 'Grid-Single-14')}</w:tr>
  </w:tbl>`);

  sections.push(`<w:sectPr>
    <w:pgSz w:w="12240" w:h="15840"/>
    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
  </w:sectPr>`);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${sections.join('\n    ')}
  </w:body>
</w:document>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
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
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/red.png"/>
  <Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/green.png"/>
  <Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/blue.png"/>
  <Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/orange.png"/>
  <Relationship Id="rId14" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/purple.png"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`;

async function main() {
  const images = {
    'red.png': createSolidPng(200, 200, 220, 50, 50),
    'green.png': createSolidPng(200, 200, 50, 180, 80),
    'blue.png': createSolidPng(200, 200, 50, 80, 220),
    'orange.png': createSolidPng(200, 200, 240, 150, 30),
    'purple.png': createSolidPng(200, 200, 150, 50, 200),
  };

  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS_XML);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', buildDocumentXml());
  for (const [filename, data] of Object.entries(images)) {
    zip.file(`word/media/${filename}`, data);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outputPath = path.join(__dirname, '..', 'e2e', 'fixtures', 'float-wrap-polygon-grid-test.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Output: ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
