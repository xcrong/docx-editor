/**
 * Unit tests for commentParser
 *
 * Tests parsing of comments.xml and cross-referencing with
 * commentsExtensible.xml for UTC timestamps.
 */

import { describe, test, expect } from 'bun:test';
import { parseComments } from './commentParser';

// Minimal comments.xml with two comments
const COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:comment w:id="1" w:author="Alice" w:initials="A" w:date="2024-02-10T15:30:00" w14:paraId="1A2B3C4D">
    <w:p>
      <w:r>
        <w:t>First comment</w:t>
      </w:r>
    </w:p>
  </w:comment>
  <w:comment w:id="2" w:author="Bob" w:initials="B" w:date="2024-03-05T09:15:00" w14:paraId="5E6F7A8B">
    <w:p>
      <w:r>
        <w:t>Second comment</w:t>
      </w:r>
    </w:p>
  </w:comment>
</w:comments>`;

// commentsExtensible.xml with UTC timestamps for the same comments
const COMMENTS_EXTENSIBLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex">
  <w16cex:comment w16cex:paraId="1A2B3C4D" w16cex:dateUtc="2024-02-10T14:30:00Z"/>
  <w16cex:comment w16cex:paraId="5E6F7A8B" w16cex:dateUtc="2024-03-05T08:15:00Z"/>
</w16cex:commentsExtensible>`;

// Only has UTC for one of the two comments
const PARTIAL_EXTENSIBLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex">
  <w16cex:comment w16cex:paraId="1A2B3C4D" w16cex:dateUtc="2024-02-10T14:30:00Z"/>
</w16cex:commentsExtensible>`;

// Comment with no date at all
const COMMENTS_NO_DATE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="1" w:author="Charlie">
    <w:p>
      <w:r>
        <w:t>Dateless comment</w:t>
      </w:r>
    </w:p>
  </w:comment>
</w:comments>`;

const emptyStyles = null;
const emptyTheme = null;
const emptyRels = new Map();
const emptyMedia = new Map();

describe('commentParser', () => {
  describe('basic parsing without commentsExtensible', () => {
    test('returns empty array for null input', () => {
      const result = parseComments(null, emptyStyles, emptyTheme, emptyRels, emptyMedia);
      expect(result).toEqual([]);
    });

    test('parses comments with local dates', () => {
      const comments = parseComments(COMMENTS_XML, emptyStyles, emptyTheme, emptyRels, emptyMedia);

      expect(comments).toHaveLength(2);

      expect(comments[0].id).toBe(1);
      expect(comments[0].author).toBe('Alice');
      expect(comments[0].initials).toBe('A');
      expect(comments[0].date).toBe('2024-02-10T15:30:00');

      expect(comments[1].id).toBe(2);
      expect(comments[1].author).toBe('Bob');
      expect(comments[1].initials).toBe('B');
      expect(comments[1].date).toBe('2024-03-05T09:15:00');
    });

    test('parses comment content as paragraphs', () => {
      const comments = parseComments(COMMENTS_XML, emptyStyles, emptyTheme, emptyRels, emptyMedia);

      expect(comments[0].content).toHaveLength(1);
      // Paragraph should contain content with a text run
      expect(comments[0].content[0].content).toBeDefined();
      expect(comments[0].content[0].content.length).toBeGreaterThan(0);
    });

    test('handles comments with no date', () => {
      const comments = parseComments(
        COMMENTS_NO_DATE_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia
      );

      expect(comments).toHaveLength(1);
      expect(comments[0].author).toBe('Charlie');
      expect(comments[0].date).toBeUndefined();
    });
  });

  describe('UTC timestamp cross-referencing', () => {
    test('prefers UTC dates from commentsExtensible.xml', () => {
      const comments = parseComments(
        COMMENTS_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        COMMENTS_EXTENSIBLE_XML
      );

      expect(comments).toHaveLength(2);

      // UTC timestamps should be used instead of local dates
      expect(comments[0].date).toBe('2024-02-10T14:30:00Z');
      expect(comments[1].date).toBe('2024-03-05T08:15:00Z');
    });

    test('falls back to local date when UTC not available for a comment', () => {
      const comments = parseComments(
        COMMENTS_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        PARTIAL_EXTENSIBLE_XML
      );

      expect(comments).toHaveLength(2);

      // First comment has UTC match
      expect(comments[0].date).toBe('2024-02-10T14:30:00Z');
      // Second comment falls back to local date (no match in extensible)
      expect(comments[1].date).toBe('2024-03-05T09:15:00');
    });

    test('handles null commentsExtensible gracefully', () => {
      const comments = parseComments(
        COMMENTS_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        null
      );

      expect(comments).toHaveLength(2);
      // Should use local dates
      expect(comments[0].date).toBe('2024-02-10T15:30:00');
      expect(comments[1].date).toBe('2024-03-05T09:15:00');
    });

    test('handles empty commentsExtensible.xml', () => {
      const emptyExtensible = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex">
</w16cex:commentsExtensible>`;

      const comments = parseComments(
        COMMENTS_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        emptyExtensible
      );

      expect(comments).toHaveLength(2);
      expect(comments[0].date).toBe('2024-02-10T15:30:00');
    });

    test('paraId matching is case-insensitive', () => {
      // commentsExtensible uses lowercase paraId
      const lowerCaseExtensible = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex">
  <w16cex:comment w16cex:paraId="1a2b3c4d" w16cex:dateUtc="2024-02-10T14:30:00Z"/>
</w16cex:commentsExtensible>`;

      const comments = parseComments(
        COMMENTS_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        lowerCaseExtensible
      );

      // Should still match despite case difference
      expect(comments[0].date).toBe('2024-02-10T14:30:00Z');
    });
  });

  describe('w:done (resolved state) — #216', () => {
    test('parses w:done="1" as done: true', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="1" w:author="Alice" w:done="1">
    <w:p><w:r><w:t>Resolved</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;
      const comments = parseComments(xml, emptyStyles, emptyTheme, emptyRels, emptyMedia);
      expect(comments[0].done).toBe(true);
    });

    test('parses w:done="true" as done: true', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="1" w:author="Alice" w:done="true">
    <w:p><w:r><w:t>Resolved</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;
      const comments = parseComments(xml, emptyStyles, emptyTheme, emptyRels, emptyMedia);
      expect(comments[0].done).toBe(true);
    });

    test('omits done when w:done is absent', () => {
      const comments = parseComments(COMMENTS_XML, emptyStyles, emptyTheme, emptyRels, emptyMedia);
      expect(comments[0].done).toBeUndefined();
    });
  });

  describe('parentId (reply threading) — #217', () => {
    test('parses w:parentId attribute', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="1" w:author="Alice">
    <w:p><w:r><w:t>Parent</w:t></w:r></w:p>
  </w:comment>
  <w:comment w:id="2" w:author="Bob" w:parentId="1">
    <w:p><w:r><w:t>Reply</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;
      const comments = parseComments(xml, emptyStyles, emptyTheme, emptyRels, emptyMedia);
      expect(comments[0].parentId).toBeUndefined();
      expect(comments[1].parentId).toBe(1);
    });

    test('parses w16cid:parentId attribute', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid">
  <w:comment w:id="1" w:author="Alice">
    <w:p><w:r><w:t>Parent</w:t></w:r></w:p>
  </w:comment>
  <w:comment w:id="2" w:author="Bob" w16cid:parentId="1">
    <w:p><w:r><w:t>Reply</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;
      const comments = parseComments(xml, emptyStyles, emptyTheme, emptyRels, emptyMedia);
      expect(comments[1].parentId).toBe(1);
    });
  });

  describe('self-written commentsExtensible shape (durableId + commentsIds)', () => {
    // Our serializer writes <w16cex:commentExtensible w16cex:durableId="...">
    // keyed by durableId (paired with commentsIds.xml). The parser must
    // resolve those entries back to paraId so UTC dates round-trip.
    const DURABLE_COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:comment w:id="1" w:author="Alice" w:date="2024-02-10T15:30:00" w14:paraId="UNUSED">
    <w:p w14:paraId="AAAABBBB">
      <w:r><w:t>First comment</w:t></w:r>
    </w:p>
  </w:comment>
</w:comments>`;

    const DURABLE_EXTENSIBLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex">
  <w16cex:commentExtensible w16cex:durableId="CCCCDDDD" w16cex:dateUtc="2024-02-10T14:30:00Z"/>
</w16cex:commentsExtensible>`;

    const DURABLE_IDS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w16cid:commentsIds xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid">
  <w16cid:commentId w16cid:paraId="AAAABBBB" w16cid:durableId="CCCCDDDD"/>
</w16cid:commentsIds>`;

    test('resolves durableId entries through commentsIds.xml', () => {
      const comments = parseComments(
        DURABLE_COMMENTS_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        DURABLE_EXTENSIBLE_XML,
        null,
        DURABLE_IDS_XML
      );

      expect(comments).toHaveLength(1);
      // UTC date from the durableId entry wins over the local w:date
      expect(comments[0].date).toBe('2024-02-10T14:30:00Z');
    });

    test('skips durableId entries when commentsIds.xml is absent', () => {
      const comments = parseComments(
        DURABLE_COMMENTS_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        DURABLE_EXTENSIBLE_XML
      );

      expect(comments).toHaveLength(1);
      // No paraId to attach the durableId entry to — falls back to local date
      expect(comments[0].date).toBe('2024-02-10T15:30:00');
    });

    test('paraId entries still work when commentsIds.xml is present', () => {
      const comments = parseComments(
        COMMENTS_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        COMMENTS_EXTENSIBLE_XML,
        null,
        DURABLE_IDS_XML
      );

      expect(comments[0].date).toBe('2024-02-10T14:30:00Z');
      expect(comments[1].date).toBe('2024-03-05T08:15:00Z');
    });
  });

  describe('commentsExtended.xml threading (w15:paraIdParent / w15:done)', () => {
    const THREADED_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:comment w:id="1" w:author="Alice" w:date="2024-02-10T15:30:00">
    <w:p w14:paraId="AAAABBBB"><w:r><w:t>Parent</w:t></w:r></w:p>
  </w:comment>
  <w:comment w:id="2" w:author="Bob" w:date="2024-02-11T15:30:00">
    <w:p w14:paraId="CCCCDDDD"><w:r><w:t>Reply</w:t></w:r></w:p>
  </w:comment>
  <w:comment w:id="3" w:author="Carol" w:date="2024-02-12T15:30:00">
    <w:p w14:paraId="EEEEFFFF"><w:r><w:t>Resolved top-level</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;

    const THREADED_EXTENDED_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
  <w15:commentEx w15:paraId="AAAABBBB" w15:done="0"/>
  <w15:commentEx w15:paraId="CCCCDDDD" w15:paraIdParent="AAAABBBB" w15:done="0"/>
  <w15:commentEx w15:paraId="EEEEFFFF" w15:done="1"/>
</w15:commentsEx>`;

    test('resolves reply threading via paraIdParent', () => {
      const comments = parseComments(
        THREADED_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        null,
        THREADED_EXTENDED_XML
      );

      expect(comments).toHaveLength(3);
      expect(comments[0].parentId).toBeUndefined();
      expect(comments[1].parentId).toBe(1);
      expect(comments[2].parentId).toBeUndefined();
    });

    test('resolves done state via w15:done', () => {
      const comments = parseComments(
        THREADED_XML,
        emptyStyles,
        emptyTheme,
        emptyRels,
        emptyMedia,
        null,
        THREADED_EXTENDED_XML
      );

      expect(comments[0].done).toBeUndefined();
      expect(comments[2].done).toBe(true);
    });
  });
});
