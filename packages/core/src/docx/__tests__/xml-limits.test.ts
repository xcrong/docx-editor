import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import { unzipDocx } from '../unzip';
import {
  parseXml,
  parseXmlDocument,
  assertXmlPartBudget,
  MAX_XML_PART_BYTES,
  MAX_XML_ELEMENTS,
  MAX_XML_DEPTH,
} from '../xmlParser';

describe('XML part limits (issue #145)', () => {
  test('assertXmlPartBudget rejects oversized parts with path and limit', () => {
    expect(() => assertXmlPartBudget('word/document.xml', MAX_XML_PART_BYTES + 1)).toThrow(
      /word\/document\.xml.*XML size limit|XML size limit.*word\/document\.xml/s
    );
    try {
      assertXmlPartBudget('word/document.xml', MAX_XML_PART_BYTES + 1);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('word/document.xml');
      expect(msg).toContain(String(MAX_XML_PART_BYTES));
    }
    expect(() => assertXmlPartBudget('word/document.xml', MAX_XML_PART_BYTES)).not.toThrow();
    // Non-XML media keep the generic (larger) budget — no XML-cap throw here.
    expect(() => assertXmlPartBudget('word/document.xml', 1024)).not.toThrow();
  });

  test('parseXml rejects oversized input before tree expansion', () => {
    const big = 'x'.repeat(MAX_XML_PART_BYTES + 1);
    expect(() => parseXml(big, 'word/document.xml')).toThrow(/XML size limit/);
    try {
      parseXml(big, 'word/document.xml');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('word/document.xml');
      expect(msg).toContain(String(MAX_XML_PART_BYTES));
    }
    expect(parseXmlDocument(big, 'word/document.xml')).toBeNull();
  });

  test('parseXml rejects element-count bombs', () => {
    const paras = Array.from({ length: MAX_XML_ELEMENTS + 10 }, () => '<w:p/>').join('');
    const xml =
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${paras}</w:body></w:document>`;
    expect(() => parseXml(xml, 'word/document.xml')).toThrow(/element limit/);
    try {
      parseXml(xml, 'word/document.xml');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('word/document.xml');
      expect(msg).toContain(String(MAX_XML_ELEMENTS));
    }
  });

  test('parseXml rejects depth bombs', () => {
    let xml = '<w:p/>';
    for (let i = 0; i < MAX_XML_DEPTH + 5; i++) xml = `<w:sdt>${xml}</w:sdt>`;
    const doc =
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${xml}</w:body></w:document>`;
    expect(() => parseXml(doc, 'word/document.xml')).toThrow(/depth limit/);
    try {
      parseXml(doc, 'word/document.xml');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('word/document.xml');
      expect(msg).toContain(String(MAX_XML_DEPTH));
    }
  });

  test('parseXml still rejects ENTITY and bare DOCTYPE (XXE/billion-laughs)', () => {
    expect(() => parseXml('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY lol "x">]><x/>')).toThrow(
      /ENTITY/
    );
    expect(() => parseXml('<?xml version="1.0"?><!DOCTYPE x SYSTEM "http://evil/x"> <x/>')).toThrow(
      /DOCTYPE/
    );
    // Normal small documents still parse.
    const ok = parseXml(
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>hi</w:t></w:r></w:p></w:body></w:document>',
      'word/document.xml'
    );
    expect(ok.elements?.length).toBeGreaterThan(0);
  });

  test('unzipDocx rejects an oversized XML part with path and limit', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'
    );
    // Pad a styles part just past the XML cap; content is plain text so the
    // post-inflate size check fires even if the declared size is absent.
    zip.file('word/styles.xml', 'x'.repeat(MAX_XML_PART_BYTES + 1));
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(unzipDocx(buffer)).rejects.toThrow(/word\/styles\.xml/);
    try {
      await unzipDocx(buffer);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('word/styles.xml');
      expect(msg).toContain(String(MAX_XML_PART_BYTES));
    }
  });

  test('unzipDocx exempts media from the XML cap (generic budget applies)', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'
    );
    // Just over the 20MB XML cap but well under the 150MB generic entry cap:
    // media must pass (zeros compress well so the fixture stays small on disk).
    const mediaBytes = new Uint8Array(MAX_XML_PART_BYTES + 1024);
    zip.file('word/media/image1.png', mediaBytes);
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const content = await unzipDocx(buffer);
    const media = content.media.get('word/media/image1.png');
    expect(media).toBeDefined();
    expect(media!.byteLength).toBeGreaterThan(MAX_XML_PART_BYTES);
  });

  test('unzipDocx still accepts a small well-formed archive', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>hi</w:t></w:r></w:p></w:body></w:document>'
    );
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const content = await unzipDocx(buffer);
    expect(content.documentXml).toContain('w:document');
  });
});
