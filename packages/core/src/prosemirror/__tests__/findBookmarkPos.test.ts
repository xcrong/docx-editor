/**
 * `findBookmarkPos` — the shared lookup behind internal-hyperlink
 * (`w:anchor` → `w:bookmarkStart`) click navigation in both adapters
 * (issue #88). Covers: first match in doc order, blank/unknown names,
 * and nodes without a `bookmarks` attr.
 */
import { describe, test, expect } from 'bun:test';
import type { Document, Paragraph } from '../../types/document';
import { toProseDoc } from '../conversion/toProseDoc';
import { findBookmarkPos } from '../paraText';

function wrapDoc(content: Paragraph[]): Document {
  return { package: { document: { content } } };
}

function para(text: string, bookmark?: string): Paragraph {
  return {
    type: 'paragraph',
    content: [
      ...(bookmark ? [{ type: 'bookmarkStart' as const, id: 7, name: bookmark }] : []),
      { type: 'run', content: [{ type: 'text', text }] },
      ...(bookmark ? [{ type: 'bookmarkEnd' as const, id: 7 }] : []),
    ],
  };
}

describe('findBookmarkPos', () => {
  test('returns the paragraph position of the named bookmark', () => {
    const pmDoc = toProseDoc(wrapDoc([para('First'), para('Target', '_Toc7001'), para('Last')]));
    const pos = findBookmarkPos(pmDoc, '_Toc7001');
    expect(pos).not.toBeNull();
    const node = pmDoc.nodeAt(pos!);
    expect(node?.type.name).toBe('paragraph');
    expect(node?.textContent).toContain('Target');
  });

  test('first match wins in document order', () => {
    const pmDoc = toProseDoc(
      wrapDoc([para('One', 'dup'), para('Two', 'dup'), para('Three', 'other')])
    );
    const pos = findBookmarkPos(pmDoc, 'dup');
    expect(pos).not.toBeNull();
    expect(pmDoc.nodeAt(pos!)?.textContent).toContain('One');
  });

  test('unknown or blank names return null (callers keep current state)', () => {
    const pmDoc = toProseDoc(wrapDoc([para('Only', 'here')]));
    expect(findBookmarkPos(pmDoc, 'missing')).toBeNull();
    expect(findBookmarkPos(pmDoc, '')).toBeNull();
  });
});
