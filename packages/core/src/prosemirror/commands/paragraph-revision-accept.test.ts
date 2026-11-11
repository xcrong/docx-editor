import { describe, expect, test } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import {
  acceptAllChanges,
  acceptChangeById,
  acceptChangesInRange,
  rejectAllChanges,
  rejectChangeById,
  rejectChangesInRange,
} from './comments';

// T27-03 (issue #79): accept/reject for paragraph-level revisions —
// `pPrIns` / `pPrDel` joins, `pPrChange` / `paraRPrChange` / `sectPrChange`
// restore, edge cases, range scoping, and triple-count returns.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        alignment: { default: null },
        styleId: { default: null },
        pPrIns: { default: null },
        pPrDel: { default: null },
        pPrChange: { default: null },
        paraRPrChange: { default: null },
        defaultTextFormatting: { default: null },
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
  },
});

function para(
  text: string,
  attrs: Record<string, unknown> = {},
  marks: Array<{ type: 'insertion' | 'deletion'; revisionId: number }> = []
) {
  const nodes = marks.length
    ? marks.map((m) =>
        schema.text(text, [
          schema.marks[m.type].create({ revisionId: m.revisionId, author: 'Jane', date: null }),
        ])
      )
    : [schema.text(text)];
  return schema.nodes.paragraph.create(attrs, nodes);
}

function runCmd<T>(
  state: EditorState,
  cmd: (state: EditorState, dispatch?: (tr: Transaction) => void) => T
): { result: T; state: EditorState } {
  let next = state;
  const result = cmd(next, (tr) => {
    next = next.apply(tr);
  });
  return { result, state: next };
}

const p = (text: string, attrs: Record<string, unknown> = {}) => para(text, attrs);

describe('T27-03 paragraph accept/reject', () => {
  test('accept pPrIns clears the marker and keeps the split', () => {
    const doc = schema.nodes.doc.create({}, [
      p('Hello', { pPrIns: { revisionId: 42, author: 'Jane', date: null } }),
      p('world'),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), acceptChangeById(42));
    expect(result).toBe(true);
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.firstChild!.attrs.pPrIns).toBeNull();
    // Idempotence: already-resolved id is a no-op.
    expect(runCmd(state, acceptChangeById(42)).result).toBe(false);
  });

  test('reject pPrIns joins and inherits the second paragraph pPr', () => {
    const doc = schema.nodes.doc.create({}, [
      p('Hello', {
        alignment: 'left',
        pPrIns: { revisionId: 42, author: 'Jane', date: null },
      }),
      p('world', { alignment: 'right' }),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), rejectChangeById(42));
    expect(result).toBe(true);
    expect(state.doc.childCount).toBe(1);
    expect(state.doc.firstChild!.textContent).toBe('Helloworld');
    expect(state.doc.firstChild!.attrs.alignment).toBe('right');
  });

  test('reject pPrIns on the last paragraph clears without joining', () => {
    const doc = schema.nodes.doc.create({}, [
      p('only', { pPrIns: { revisionId: 88, author: 'Jane', date: null } }),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), rejectChangeById(88));
    expect(result).toBe(true);
    expect(state.doc.childCount).toBe(1);
    expect(state.doc.firstChild!.attrs.pPrIns).toBeNull();
  });

  test('accept pPrDel joins; reject pPrDel clears and keeps the split', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        p('Hello', { pPrDel: { revisionId: 7, author: 'Jane', date: null } }),
        p('world', { alignment: 'right' }),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(7));
    expect(accepted.result).toBe(true);
    expect(accepted.state.doc.childCount).toBe(1);
    expect(accepted.state.doc.firstChild!.attrs.alignment).toBe('right');

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(7));
    expect(rejected.result).toBe(true);
    expect(rejected.state.doc.childCount).toBe(2);
    expect(rejected.state.doc.firstChild!.attrs.pPrDel).toBeNull();
  });

  test('unknown revision id is a no-op', () => {
    const doc = schema.nodes.doc.create({}, [p('Hello')]);
    expect(runCmd(EditorState.create({ doc }), acceptChangeById(999999)).result).toBe(false);
    expect(runCmd(EditorState.create({ doc }), rejectChangeById(999999)).result).toBe(false);
  });

  test('reject pPrIns first rejects the host pPrChange (cross-revision dependency)', () => {
    const doc = schema.nodes.doc.create({}, [
      p('Hello', {
        pPrIns: { revisionId: 42, author: 'Jane', date: null },
        pPrChange: [
          {
            type: 'paragraphPropertyChange',
            info: { id: 100, author: 'Jane' },
            previousFormatting: { alignment: 'left' },
          },
        ],
      }),
      p('world', { alignment: 'right' }),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), rejectChangeById(42));
    expect(result).toBe(true);
    // Joined; the host's pPrChange must not survive on the joined paragraph.
    expect(state.doc.childCount).toBe(1);
    expect(state.doc.firstChild!.attrs.pPrChange).toBeNull();
  });

  test('reject paraRPrChange restores defaultTextFormatting; accept clears', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        p('Hello', {
          defaultTextFormatting: { bold: true },
          paraRPrChange: [
            {
              type: 'paragraphMarkPropertyChange',
              info: { id: 60, author: 'Jane' },
              previousFormatting: { bold: false },
            },
          ],
        }),
      ]);
    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(60));
    expect(rejected.result).toBe(true);
    const attrs = rejected.state.doc.firstChild!.attrs;
    expect(attrs.paraRPrChange).toBeNull();
    expect((attrs.defaultTextFormatting as { bold: boolean }).bold).toBe(false);

    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(60));
    expect(accepted.result).toBe(true);
    expect(accepted.state.doc.firstChild!.attrs.paraRPrChange).toBeNull();
    expect(
      (accepted.state.doc.firstChild!.attrs.defaultTextFormatting as { bold: boolean }).bold
    ).toBe(true);
  });

  test('reject sectPrChange restores prior section props; accept clears', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        p('Hello', {
          _sectionProperties: {
            pageWidth: 12240,
            sectPrChange: {
              type: 'sectionPropertyChange',
              info: { id: 9, author: 'Jane' },
              previousSectionProperties: { pageWidth: 15840 },
            },
          },
        }),
      ]);
    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(9));
    expect(rejected.result).toBe(true);
    const sect = rejected.state.doc.firstChild!.attrs._sectionProperties as Record<string, unknown>;
    expect(sect.pageWidth).toBe(15840);
    expect(sect.sectPrChange).toBeUndefined();

    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(9));
    expect(accepted.result).toBe(true);
    const sectA = accepted.state.doc.firstChild!.attrs._sectionProperties as Record<
      string,
      unknown
    >;
    expect(sectA.pageWidth).toBe(12240);
    expect(sectA.sectPrChange).toBeUndefined();
  });

  test('acceptChangesInRange resolves only in-range revisions and returns the triple count', () => {
    const doc = schema.nodes.doc.create({}, [
      p('aaa', { pPrIns: { revisionId: 1, author: 'Jane', date: '2024-01-01T00:00:00Z' } }),
      p('bbb', { pPrIns: { revisionId: 2, author: 'Jane', date: '2024-01-02T00:00:00Z' } }),
      p('ccc', { pPrIns: { revisionId: 3, author: 'Jane', date: '2024-01-03T00:00:00Z' } }),
    ]);
    const state = EditorState.create({ doc });
    // Paragraph 1 spans the middle; scope the range to its `from`.
    let middleFrom = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'bbb') middleFrom = pos;
    });
    expect(middleFrom).toBeGreaterThan(-1);
    const { result, state: next } = runCmd(state, acceptChangesInRange(middleFrom, middleFrom));
    expect(result).toBe(1);
    const remaining: number[] = [];
    next.doc.descendants((node) => {
      const ins = node.attrs.pPrIns as { revisionId: number } | null;
      if (node.type.name === 'paragraph' && ins) remaining.push(ins.revisionId);
    });
    expect(remaining.sort()).toEqual([1, 3]);
    // A range strictly inside the paragraph text (no entry starts there)
    // resolves nothing.
    expect(runCmd(next, rejectChangesInRange(middleFrom + 1, middleFrom + 1)).result).toBe(0);
  });

  test('acceptAllChanges returns distinct triple count (multi-site burst counts once)', () => {
    const doc = schema.nodes.doc.create({}, [
      p('aaa', { pPrIns: { revisionId: 1, author: 'Jane', date: '2024-01-01T00:00:00Z' } }),
      para('bbb', {}, [
        { type: 'insertion', revisionId: 2 },
        { type: 'insertion', revisionId: 2 },
      ]),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), acceptAllChanges());
    // Two triples: (1, Jane, …) and (2, Jane, …) — the two insertion sites
    // sharing id 2 count once.
    expect(result).toBe(2);
    expect(runCmd(state, acceptAllChanges()).result).toBe(0);
    expect(runCmd(EditorState.create({ doc }), rejectAllChanges()).result).toBe(2);
  });

  test('multi-author: same numeric id from two authors resolves as two triples', () => {
    // T27-04 (issue #80): `w:id` is not author-scoped, so Jane and John may
    // legally mint id 5. acceptAllChanges must count (5, Jane) and
    // (5, John) as DISTINCT triples; the by-id resolver clears both in one
    // transaction with a cross-author diagnostic.
    const doc = schema.nodes.doc.create({}, [
      p('aaa', { pPrIns: { revisionId: 5, author: 'Jane', date: null } }),
      p('bbb', { pPrIns: { revisionId: 5, author: 'John', date: null } }),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), acceptAllChanges());
    expect(result).toBe(2);
    expect(state.doc.firstChild!.attrs.pPrIns).toBeNull();
    expect(state.doc.lastChild!.attrs.pPrIns).toBeNull();
  });

  test('multi-author: by-id accept clears both authors sites and warns', () => {
    const doc = schema.nodes.doc.create({}, [
      p('aaa', { pPrIns: { revisionId: 5, author: 'Jane', date: null } }),
      p('bbb', { pPrDel: { revisionId: 5, author: 'John', date: null } }),
    ]);
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const { result, state } = runCmd(EditorState.create({ doc }), acceptChangeById(5));
      expect(result).toBe(true);
      // Jane's pPrIns accept clears (split kept). John's pPrDel accept joins
      // with the FOLLOWING sibling — none here (last paragraph), so it
      // clears without joining. Both markers gone, paragraphs intact.
      expect(state.doc.childCount).toBe(2);
      expect(state.doc.firstChild!.attrs.pPrIns).toBeNull();
      expect(state.doc.lastChild!.attrs.pPrDel).toBeNull();
    } finally {
      console.warn = origWarn;
    }
    expect(warnings.some((w) => w.includes('revisionId 5') && w.includes('2'))).toBe(true);
  });
});
