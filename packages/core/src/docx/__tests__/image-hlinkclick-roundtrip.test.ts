import { describe, test, expect } from 'bun:test';
import { parseDrawing } from '../imageParser';
import { parseXmlDocument } from '../xmlParser';
import { serializeDrawingContent } from '../serializer/runSerializer/drawing';
import type { RelationshipMap } from '../../types/document';

function relsWith(hlinkRId: string, target: string): RelationshipMap {
  return new Map([
    ['rId1', { id: 'rId1', type: 'image-rel' as never, target: 'media/image1.png' }],
    [hlinkRId, { id: hlinkRId, type: 'hyperlink-rel' as never, target }],
  ]);
}

const DRAWING_XML = (hlink: string) =>
  `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Picture 1">${hlink}</wp:docPr>` +
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;

describe('a:hlinkClick image hyperlink', () => {
  test('parses hlinkClick through sanitizeHref and preserves rId', () => {
    const root = parseXmlDocument(DRAWING_XML('<a:hlinkClick r:id="rId5"/>'));
    const image = parseDrawing(root!, relsWith('rId5', 'https://example.com/x'), undefined);
    expect(image?.hlinkHref).toBe('https://example.com/x');
    expect(image?.hlinkRId).toBe('rId5');
  });

  test('drops javascript: hyperlink targets', () => {
    const root = parseXmlDocument(DRAWING_XML('<a:hlinkClick r:id="rId5"/>'));
    const image = parseDrawing(root!, relsWith('rId5', 'javascript:alert(1)'), undefined);
    expect(image?.hlinkHref).toBeUndefined();
    expect(image?.hlinkRId).toBeUndefined();
  });

  test('serializer round-trips hlinkClick via preserved rId', () => {
    const xml = serializeDrawingContent({
      type: 'drawing',
      image: {
        type: 'image',
        rId: 'rId1',
        size: { width: 914400, height: 914400 },
        wrap: { type: 'inline' },
        hlinkHref: 'https://example.com/x',
        hlinkRId: 'rId5',
      },
    });
    expect(xml).toContain('<a:hlinkClick r:id="rId5"/>');
  });

  test('image without hyperlink emits self-closing docPr', () => {
    const xml = serializeDrawingContent({
      type: 'drawing',
      image: {
        type: 'image',
        rId: 'rId1',
        size: { width: 914400, height: 914400 },
        wrap: { type: 'inline' },
      },
    });
    expect(xml).not.toContain('hlinkClick');
  });
});
