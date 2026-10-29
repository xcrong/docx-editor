import { describe, expect, test } from 'bun:test';
import { parseParagraph } from '../paragraphParser';
import { parseXmlDocument } from '../xmlParser';
import type { Paragraph } from '../../types/document';
import type { XmlElement } from '../xmlParser';
import { serializeParagraph } from './paragraphSerializer';

function reparse(xml: string): Paragraph {
  // Wrap the serialized fragment in a paragraph so parseParagraph accepts it.
  const root = parseXmlDocument(
    `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xml}</w:p>`
  ) as XmlElement | null;
  if (!root) throw new Error('Failed to parse serialized fragment');
  return parseParagraph(root, null, null, null, null, null);
}

function innerXmlOf(paragraph: Paragraph): string {
  const xml = serializeParagraph(paragraph);
  // Strip the outer <w:p ...>...</w:p> wrapper for reparse().
  return xml.replace(/^<w:p[^>]*>/, '').replace(/<\/w:p>$/, '');
}

describe('serializeParagraph tracked-change hardening', () => {
  test('serializes deletion runs using delText and delInstrText', () => {
    const paragraph: Paragraph = {
      type: 'paragraph',
      content: [
        {
          type: 'deletion',
          info: { id: 11, author: 'Reviewer', date: '2026-02-22T10:00:00Z' },
          content: [
            {
              type: 'run',
              content: [
                { type: 'text', text: 'Removed' },
                { type: 'instrText', text: ' MERGEFIELD name ' },
              ],
            },
          ],
        },
      ],
    };

    const xml = serializeParagraph(paragraph);

    expect(xml).toContain('<w:del w:id="11" w:author="Reviewer" w:date="2026-02-22T10:00:00Z">');
    expect(xml).toContain('<w:delText>Removed</w:delText>');
    expect(xml).toContain(
      '<w:delInstrText xml:space="preserve"> MERGEFIELD name </w:delInstrText>'
    );
    expect(xml).not.toContain('<w:t>Removed</w:t>');
    expect(xml).not.toContain('<w:instrText xml:space="preserve"> MERGEFIELD name </w:instrText>');
  });

  test('normalizes invalid tracked-change metadata while serializing', () => {
    const paragraph: Paragraph = {
      type: 'paragraph',
      content: [
        {
          type: 'insertion',
          info: { id: -5, author: '   ', date: '   ' },
          content: [
            {
              type: 'run',
              content: [{ type: 'text', text: 'Added' }],
            },
          ],
        },
      ],
    };

    const xml = serializeParagraph(paragraph);

    expect(xml).toContain('<w:ins w:id="0" w:author="Unknown">');
    expect(xml).not.toContain('w:date=');
  });

  // §8.4: serialize → reparse round-trip for w:ins / w:del.
  test('insertion round-trips through w:ins with id, author, date, and text', () => {
    const paragraph: Paragraph = {
      type: 'paragraph',
      content: [
        { type: 'run', content: [{ type: 'text', text: 'before ' }] },
        {
          type: 'insertion',
          info: { id: 9, author: 'Alice', date: '2024-03-01T10:00:00Z' },
          content: [{ type: 'run', content: [{ type: 'text', text: 'inserted' }] }],
        },
        { type: 'run', content: [{ type: 'text', text: ' after' }] },
      ],
    };

    const back = reparse(innerXmlOf(paragraph));
    const insertion = back.content[1];
    expect(insertion?.type).toBe('insertion');
    if (!insertion || insertion.type !== 'insertion') return;
    expect(insertion.info.id).toBe(9);
    expect(insertion.info.author).toBe('Alice');
    expect(insertion.info.date).toBe('2024-03-01T10:00:00Z');
    expect(JSON.stringify(insertion.content)).toContain('inserted');
  });

  test('deletion round-trips through w:del with delText', () => {
    const paragraph: Paragraph = {
      type: 'paragraph',
      content: [
        {
          type: 'deletion',
          info: { id: 11, author: 'Reviewer', date: '2026-02-22T10:00:00Z' },
          content: [{ type: 'run', content: [{ type: 'text', text: 'Removed' }] }],
        },
      ],
    };

    const back = reparse(innerXmlOf(paragraph));
    const deletion = back.content[0];
    expect(deletion?.type).toBe('deletion');
    if (!deletion || deletion.type !== 'deletion') return;
    expect(deletion.info.id).toBe(11);
    expect(deletion.info.author).toBe('Reviewer');
    expect(deletion.info.date).toBe('2026-02-22T10:00:00Z');
    expect(JSON.stringify(deletion.content)).toContain('Removed');
  });
});
