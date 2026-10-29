/**
 * Comment serializer → parser round-trip.
 *
 * Guard for track-changes-comments §8 (8.2/8.5): what
 * `serializeCommentsWithInfo` + `serializeCommentsExtended/Ids/Extensible`
 * emit must come back through `parseComments` with id, threading
 * (parentId), resolved state (done), UTC date, and content intact.
 *
 * Covers the self-written shape (`commentExtensible` + `durableId`,
 * resolved via `commentsIds.xml`) that Word never emits but our own
 * save path does — the second save must not lose UTC dates.
 */

import { describe, expect, test } from 'bun:test';
import type { Comment } from '../../types/content';
import { parseComments } from '../commentParser';
import {
  serializeCommentsWithInfo,
  serializeCommentsExtended,
  serializeCommentsIds,
  serializeCommentsExtensible,
} from './commentSerializer';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    author: 'Alice',
    initials: 'A',
    date: '2024-06-10T12:34:56Z',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'run', content: [{ type: 'text', text: 'Review this' }] }],
      },
    ],
    ...overrides,
  };
}

function roundTrip(comments: Comment[]): Comment[] {
  const { xml, paraInfos } = serializeCommentsWithInfo(comments);
  const extendedXml = serializeCommentsExtended(paraInfos);
  const idsXml = serializeCommentsIds(paraInfos);
  const extensibleXml = serializeCommentsExtensible(paraInfos, comments);
  return parseComments(xml, null, null, new Map(), new Map(), extensibleXml, extendedXml, idsXml);
}

describe('comment serializer → parser round-trip (§8)', () => {
  test('top-level comment survives with author, date, and text', () => {
    const [back] = roundTrip([makeComment()]);
    expect(back.id).toBe(1);
    expect(back.author).toBe('Alice');
    expect(back.date).toBe('2024-06-10T12:34:56Z');
    expect(JSON.stringify(back.content)).toContain('Review this');
  });

  test('reply threading survives via commentsExtended paraIdParent', () => {
    const back = roundTrip([makeComment({ id: 1 }), makeComment({ id: 2, parentId: 1 })]);
    expect(back).toHaveLength(2);
    expect(back[0].parentId).toBeUndefined();
    expect(back[1].parentId).toBe(1);
  });

  test('resolved state survives via w15:done', () => {
    const back = roundTrip([makeComment({ id: 1, done: true }), makeComment({ id: 2 })]);
    expect(back[0].done).toBe(true);
    expect(back[1].done).toBeUndefined();
  });

  test('UTC date survives a second round-trip (self-written shape)', () => {
    const once = roundTrip([makeComment()]);
    const twice = roundTrip(once);
    expect(twice[0].date).toBe('2024-06-10T12:34:56Z');
  });

  test('local date without timezone is preserved when no UTC part applies', () => {
    const back = roundTrip([makeComment({ date: '2024-06-10T12:34:56' })]);
    // No Z suffix → serializer emits as-is; parser keeps the local date.
    expect(back[0].date).toContain('2024-06-10T12:34:56');
  });
});
