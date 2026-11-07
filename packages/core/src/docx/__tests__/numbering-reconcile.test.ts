import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import { parseDocx } from '../parser';
import { repackDocx } from '../rezip';
import { reconcileNumberingDefinitions } from '../numberingReconcile';
import type { Document } from '../../types/document';

const WITHOUT_NUMBERING = 'e2e/fixtures/toc-dot-leaders.docx';

async function loadFixture(path: string): Promise<{ doc: Document; buffer: ArrayBuffer }> {
  const buffer = await Bun.file(path).arrayBuffer();
  return { doc: await parseDocx(buffer), buffer };
}

/** Simulate the editor toggling a bullet list on the first paragraph. */
function toggleFirstParagraphToBullet(doc: Document): void {
  const content = doc.package.document.content as unknown as Record<string, unknown>[];
  const idx = content.findIndex((b) => b['type'] === 'paragraph');
  expect(idx).toBeGreaterThanOrEqual(0);
  const para = content[idx] as Record<string, unknown>;
  const formatting = { ...((para['formatting'] as Record<string, unknown>) ?? {}) };
  formatting['numPr'] = { numId: 1, ilvl: 0 };
  content[idx] = { ...para, formatting };
}

describe('numbering reconcile (Word "Show Repairs / Lists 1")', () => {
  test('repack backfills numbering.xml for editor-added lists', async () => {
    const { doc } = await loadFixture(WITHOUT_NUMBERING);
    expect(doc.package.numbering?.nums.length ?? 0).toBe(0);
    toggleFirstParagraphToBullet(doc);

    const out = await repackDocx(doc);
    const zip = await JSZip.loadAsync(out);
    const numberingFile = zip.file('word/numbering.xml');
    expect(numberingFile).not.toBeNull();

    const numberingXml = await numberingFile!.async('text');
    const defined = new Set(
      [...numberingXml.matchAll(/<w:num w:numId="(\d+)">/g)].map((m) => m[1])
    );
    const documentXml = await zip.file('word/document.xml')!.async('text');
    const referenced = new Set(
      [...documentXml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1])
    );
    for (const numId of referenced) {
      expect(defined.has(numId)).toBe(true);
    }
    // Relationship + content type registered for the new part.
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(rels).toContain('Target="numbering.xml"');
    const ct = await zip.file('[Content_Types].xml')!.async('text');
    expect(ct).toContain('PartName="/word/numbering.xml"');
  });

  test('no lists means no numbering.xml is synthesized', async () => {
    const { doc } = await loadFixture(WITHOUT_NUMBERING);
    expect(reconcileNumberingDefinitions(doc)).toBe(false);
    const out = await repackDocx(doc);
    const zip = await JSZip.loadAsync(out);
    expect(zip.file('word/numbering.xml')).toBeNull();
  });

  test('complete numbering is left untouched', async () => {
    const { doc } = await loadFixture('examples/shared/sample.docx');
    const before = JSON.stringify(doc.package.numbering);
    expect(reconcileNumberingDefinitions(doc)).toBe(false);
    expect(JSON.stringify(doc.package.numbering)).toBe(before);
  });

  test('style-sourced numPr needs no backing definition', async () => {
    const { doc } = await loadFixture('examples/shared/sample.docx');
    // Mark every referenced numPr as style-sourced: nothing new to define.
    const content = doc.package.document.content as unknown as Record<string, unknown>[];
    for (const b of content) {
      if (b['type'] !== 'paragraph') continue;
      const formatting = b['formatting'] as Record<string, unknown> | undefined;
      const numPr = formatting?.['numPr'];
      if (numPr) formatting!['numPrFromStyle'] = structuredClone(numPr);
    }
    expect(reconcileNumberingDefinitions(doc)).toBe(false);
  });
});
