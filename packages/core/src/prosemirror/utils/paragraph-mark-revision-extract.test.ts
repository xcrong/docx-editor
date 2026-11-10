import { describe, expect, test } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { extractTrackedChanges } from './extractTrackedChanges';

// T27-01 (issues #77 + #70): sidebar extraction covers the new structural
// attrs — paragraph-mark rPr changes (CT_ParaRPrChange) and pPr-level
// section changes — one entry per (id, author, date) triple.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        pPrIns: { default: null },
        pPrDel: { default: null },
        pPrChange: { default: null },
        paraRPrChange: { default: null },
        _sectionProperties: { default: null },
      },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    insertion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: null } },
      toDOM: () => ['ins', 0],
    },
    deletion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: null } },
      toDOM: () => ['del', 0],
    },
    comment: {
      attrs: { commentId: { default: 0 } },
      toDOM: () => ['span', 0],
    },
  },
});

describe('extractTrackedChanges: paragraph-mark and section revisions', () => {
  test('paraRPrChange yields one paragraphMarkPropertiesChanged entry per triple', () => {
    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create(
        {
          paraRPrChange: [
            { info: { id: 103, author: 'Bob', date: '2024-02-03T04:05:06Z' }, type: 'x' },
            { info: { id: 107, author: 'Bob', date: '2024-02-04T00:00:00Z' }, type: 'y' },
          ],
        },
        [schema.text('Deleted break')]
      ),
    ]);
    const { entries } = extractTrackedChanges(EditorState.create({ doc }));
    const kinds = entries.filter((e) => e.type === 'paragraphMarkPropertiesChanged');
    expect(kinds).toHaveLength(2);
    expect(new Set(kinds.map((e) => e.revisionId))).toEqual(new Set([103, 107]));
    expect(kinds[0]!.author).toBe('Bob');
  });

  test('pPr-level sectPrChange yields a sectionPropertiesChanged entry', () => {
    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create(
        {
          _sectionProperties: {
            pageWidth: 12240,
            sectPrChange: { info: { id: 105, author: 'Dan' }, type: 'sectionPropertyChange' },
          },
        },
        [schema.text('Section one')]
      ),
    ]);
    const { entries } = extractTrackedChanges(EditorState.create({ doc }));
    const kinds = entries.filter((e) => e.type === 'sectionPropertiesChanged');
    expect(kinds).toHaveLength(1);
    expect(kinds[0]!.revisionId).toBe(105);
    expect(kinds[0]!.author).toBe('Dan');
  });
});
