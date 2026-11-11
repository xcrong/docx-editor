/**
 * Regression: hashParagraphBlock used to ignore defaultFontSize/defaultFontFamily
 * on empty paragraphs. Two empty paragraphs with different default fonts hashed
 * to the same key, so the layout cache served a stale measurement and the caret
 * rendered at the previously cached size until typing forced a re-key.
 */

import { describe, test, expect } from 'bun:test';
import type { ParagraphBlock } from '../../layout-engine/types';
import { hashParagraphBlock } from './cache';

function emptyParagraph(attrs: Partial<ParagraphBlock['attrs']> = {}): ParagraphBlock {
  return {
    kind: 'paragraph',
    id: 'b1',
    runs: [],
    attrs: attrs as ParagraphBlock['attrs'],
    pmStart: 0,
    pmEnd: 2,
  };
}

describe('hashParagraphBlock', () => {
  test('empty paragraphs with different defaultFontSize produce different hashes', () => {
    const small = hashParagraphBlock(emptyParagraph({ defaultFontSize: 11 }));
    const large = hashParagraphBlock(emptyParagraph({ defaultFontSize: 48 }));
    expect(small).not.toBe(large);
  });

  test('empty paragraphs with different defaultFontFamily produce different hashes', () => {
    const inter = hashParagraphBlock(emptyParagraph({ defaultFontFamily: 'Inter' }));
    const georgia = hashParagraphBlock(emptyParagraph({ defaultFontFamily: 'Georgia' }));
    expect(inter).not.toBe(georgia);
  });

  test('two empty paragraphs with the same defaults still hash identically (cache stays useful)', () => {
    const a = hashParagraphBlock(
      emptyParagraph({ defaultFontSize: 11, defaultFontFamily: 'Inter' })
    );
    const b = hashParagraphBlock(
      emptyParagraph({ defaultFontSize: 11, defaultFontFamily: 'Inter' })
    );
    expect(a).toBe(b);
  });

  test('empty paragraph with no defaults differs from one with defaults', () => {
    const noDefaults = hashParagraphBlock(emptyParagraph({}));
    const withSize = hashParagraphBlock(emptyParagraph({ defaultFontSize: 48 }));
    expect(noDefaults).not.toBe(withSize);
  });
});

describe('hashParagraphBlock revision invalidation (T27-04)', () => {
  // Paragraph-mark / property revision state paints pilcrow glyphs and margin
  // change bars. Same text + runs with different revision state must NOT
  // share a measurement cache entry, or the second-painted paragraph
  // inherits the first's revision visuals (stale cache).
  test('pPrIns / pPrDel presence changes the hash; clearing restores it', () => {
    const clean = hashParagraphBlock(emptyParagraph({}));
    const ins = hashParagraphBlock(
      emptyParagraph({ pPrIns: { revisionId: 42, author: 'Jane', date: null } })
    );
    const del = hashParagraphBlock(
      emptyParagraph({ pPrDel: { revisionId: 43, author: 'Jane', date: null } })
    );
    expect(ins).not.toBe(clean);
    expect(del).not.toBe(clean);
    expect(ins).not.toBe(del);
    // Accept clears the marker → the paragraph re-keys to the clean entry.
    expect(hashParagraphBlock(emptyParagraph({}))).toBe(clean);
  });

  test('different revision ids hash differently (no cross-revision reuse)', () => {
    const a = hashParagraphBlock(
      emptyParagraph({ pPrIns: { revisionId: 1, author: 'Jane', date: null } })
    );
    const b = hashParagraphBlock(
      emptyParagraph({ pPrIns: { revisionId: 2, author: 'Jane', date: null } })
    );
    expect(a).not.toBe(b);
  });

  test('property-change histories (pPrChange / paraRPrChange / sectPrChange) change the hash', () => {
    const clean = hashParagraphBlock(emptyParagraph({}));
    const prop = hashParagraphBlock(emptyParagraph({ pPrChange: [] }));
    const markProp = hashParagraphBlock(emptyParagraph({ paraRPrChange: [] }));
    const sect = hashParagraphBlock(
      emptyParagraph({
        sectPrChange: {
          type: 'sectionPropertyChange',
          info: { id: 9, author: 'Jane' },
        },
      })
    );
    // Presence flags are set for non-null histories; each differs from clean.
    expect(prop).not.toBe(clean);
    expect(markProp).not.toBe(clean);
    expect(sect).not.toBe(clean);
    expect(prop).not.toBe(markProp);
  });

  test('run revision_change presence (hasRevisionChange) changes the hash', () => {
    const clean = hashParagraphBlock(emptyParagraph({}));
    expect(hashParagraphBlock(emptyParagraph({ hasRevisionChange: true }))).not.toBe(clean);
  });
});
