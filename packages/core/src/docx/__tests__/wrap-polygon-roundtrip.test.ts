import { describe, test, expect } from 'bun:test';
import { parseDrawing } from '../imageParser';
import { serializeRun } from '../serializer/runSerializer';
import { parseXml, type XmlElement } from '../xmlParser';
import type { Image, Run } from '../../types/document';

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

function parseDrawingFromXml(innerXml: string): Image | null {
  const doc = parseXml(`<w:drawing ${NS}>${innerXml}</w:drawing>`);
  const drawing = (doc.elements as XmlElement[])[0];
  return parseDrawing(drawing, undefined, undefined);
}

function serializeImage(image: Image): string {
  const run: Run = { type: 'run', content: [{ type: 'drawing', image }] };
  return serializeRun(run);
}

/** Parse the `<w:drawing>` payload out of a serialized `<w:r>...</w:r>` blob. */
function reparseSerializedImage(xml: string): Image | null {
  const wrapped = `<root ${NS}>${xml}</root>`;
  const doc = parseXml(wrapped);
  const root = (doc.elements as XmlElement[])[0];
  const wr = (root.elements as XmlElement[])[0]; // <w:r>
  const drawing = (wr.elements as XmlElement[])[0]; // <w:drawing>
  return parseDrawing(drawing, undefined, undefined);
}

const TIGHT_ANCHOR = (polygon: string) => `
  <wp:anchor distT="0" distB="0" distL="114300" distR="114300">
    <wp:simplePos x="0" y="0"/>
    <wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>
    <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
    <wp:extent cx="1000000" cy="1000000"/>
    <wp:wrapTight wrapText="right">${polygon}</wp:wrapTight>
    <wp:docPr id="1" name="Picture 1"/>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic>
          <pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill>
            <a:blip r:embed="rId1"/>
            <a:stretch><a:fillRect/></a:stretch>
          </pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="1000000"/></a:xfrm></pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:anchor>`;

describe('wp:wrapPolygon round-trip', () => {
  test('parse a triangular tight contour into normalized points', () => {
    const img = parseDrawingFromXml(
      TIGHT_ANCHOR(`
        <wp:wrapPolygon edited="0">
          <wp:start x="0" y="0"/>
          <wp:lineTo x="21600" y="0"/>
          <wp:lineTo x="10800" y="21600"/>
        </wp:wrapPolygon>`)
    );
    expect(img?.wrap.type).toBe('tight');
    expect(img?.wrap.wrapPolygon).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ]);
  });

  test('rectangular polygon parses as full-bleed normalized corners', () => {
    const img = parseDrawingFromXml(
      TIGHT_ANCHOR(`
        <wp:wrapPolygon edited="0">
          <wp:start x="0" y="0"/>
          <wp:lineTo x="0" y="21600"/>
          <wp:lineTo x="21600" y="21600"/>
          <wp:lineTo x="21600" y="0"/>
          <wp:lineTo x="0" y="0"/>
        </wp:wrapPolygon>`)
    );
    expect(img?.wrap.wrapPolygon).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  test('serialize + reparse preserves a non-rectangular contour', () => {
    const img = parseDrawingFromXml(
      TIGHT_ANCHOR(`
        <wp:wrapPolygon edited="0">
          <wp:start x="0" y="0"/>
          <wp:lineTo x="21600" y="0"/>
          <wp:lineTo x="10800" y="21600"/>
        </wp:wrapPolygon>`)
    );
    expect(img).not.toBeNull();
    const xml = serializeImage(img!);
    expect(xml).toContain('<wp:wrapTight');
    expect(xml).toContain('<wp:wrapPolygon');
    const reparsed = reparseSerializedImage(xml);
    expect(reparsed?.wrap.wrapPolygon).toEqual(img?.wrap.wrapPolygon);
  });

  test('serialize without a stored polygon emits the rectangular fallback', () => {
    const img = parseDrawingFromXml(TIGHT_ANCHOR(''));
    expect(img?.wrap.wrapPolygon).toBeUndefined();
    const xml = serializeImage(img!);
    expect(xml).toContain('<wp:wrapPolygon');
    expect(xml).toContain('<wp:lineTo x="0" y="21600"/>');
  });

  test('clamp out-of-range vertices and drop non-finite ones', () => {
    const img = parseDrawingFromXml(
      TIGHT_ANCHOR(`
        <wp:wrapPolygon edited="0">
          <wp:start x="-500" y="0"/>
          <wp:lineTo x="30000" y="10800"/>
          <wp:lineTo x="10800" y="21600"/>
          <wp:lineTo y="10800"/>
        </wp:wrapPolygon>`)
    );
    // The vertex missing x is dropped; the rest clamp into [0, 1].
    expect(img?.wrap.wrapPolygon).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
    ]);
  });
});
