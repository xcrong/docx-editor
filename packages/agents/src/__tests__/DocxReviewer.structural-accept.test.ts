import { describe, test, expect } from 'bun:test';
import type {
  Document,
  DocumentBody,
  Paragraph,
  Footnote,
} from '@xcrong/docx-editor-core/headless';
import { DocxReviewer } from '../DocxReviewer';
import { ChangeNotFoundError } from '../errors';
import { makeRun, makeParagraph, makeParagraphFrom, makeReviewer } from './_helpers';

// T27 follow-up (issue #120): agents-side accept/reject for paragraph-level
// revisions — `pPrIns` / `pPrDel` joins, `pPrChange` / `paraRPrChange` /
// `sectPrChange` prior restore (paragraph-level and body-level placements).
//
// Each scenario mirrors its PM counterpart in
// `core/prosemirror/commands/paragraph-revision-accept.test.ts` (issue #79):
// same per-marker semantics, same cross-revision dependency, same edge cases —
// applied to the headless document model instead of a PM transaction.

function paras(reviewer: DocxReviewer): Paragraph[] {
  const body = reviewer.toDocument().package.document as DocumentBody;
  return body.content.filter((b): b is Paragraph => b.type === 'paragraph');
}

function textOf(para: Paragraph): string {
  return para.content
    .flatMap((it) => (it.type === 'run' ? it.content : []))
    .filter((r) => r.type === 'text')
    .map((r) => (r as { text: string }).text)
    .join('');
}

function marked(text: string, extra: Partial<Paragraph>): Paragraph {
  return { ...makeParagraphFrom([makeRun(text)]), ...extra };
}

describe('structural accept/reject — paragraph-mark revisions', () => {
  test('accept pPrIns clears the marker and keeps the split', () => {
    const reviewer = makeReviewer([
      marked('Hello', { pPrIns: { id: 42, author: 'Jane', date: '2024-01-01T00:00:00Z' } }),
      makeParagraph('world'),
    ]);
    reviewer.acceptChange(42);
    expect(paras(reviewer)).toHaveLength(2);
    expect(paras(reviewer)[0]!.pPrIns).toBeUndefined();
    expect(reviewer.getChanges()).toHaveLength(0);
  });

  test('reject pPrIns joins and inherits the second paragraph formatting', () => {
    const reviewer = makeReviewer([
      marked('Hello', {
        formatting: { alignment: 'left' },
        pPrIns: { id: 42, author: 'Jane', date: '2024-01-01T00:00:00Z' },
      }),
      marked('world', { formatting: { alignment: 'right' } }),
    ]);
    reviewer.rejectChange(42);
    const after = paras(reviewer);
    expect(after).toHaveLength(1);
    expect(textOf(after[0]!)).toBe('Helloworld');
    expect(after[0]!.formatting?.alignment).toBe('right');
    expect(reviewer.getChanges()).toHaveLength(0);
  });

  test('reject pPrIns on the last paragraph clears without joining', () => {
    const reviewer = makeReviewer([
      marked('only', { pPrIns: { id: 88, author: 'Jane', date: '2024-01-01T00:00:00Z' } }),
    ]);
    reviewer.rejectChange(88);
    expect(paras(reviewer)).toHaveLength(1);
    expect(paras(reviewer)[0]!.pPrIns).toBeUndefined();
  });

  test('accept pPrDel joins; reject pPrDel clears and keeps the split', () => {
    const build = () => [
      marked('Hello', { pPrDel: { id: 7, author: 'Jane', date: '2024-01-01T00:00:00Z' } }),
      marked('world', { formatting: { alignment: 'right' } }),
    ];
    const accepted = makeReviewer(build());
    accepted.acceptChange(7);
    expect(paras(accepted)).toHaveLength(1);
    expect(paras(accepted)[0]!.formatting?.alignment).toBe('right');

    const rejected = makeReviewer(build());
    rejected.rejectChange(7);
    expect(paras(rejected)).toHaveLength(2);
    expect(paras(rejected)[0]!.pPrDel).toBeUndefined();
  });

  test('reject pPrIns first rejects the host pPrChange (cross-revision dependency)', () => {
    const reviewer = makeReviewer([
      marked('Hello', {
        formatting: { alignment: 'right' },
        pPrIns: { id: 42, author: 'Jane', date: '2024-01-01T00:00:00Z' },
        propertyChanges: [
          {
            type: 'paragraphPropertyChange',
            info: { id: 100, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            previousFormatting: { alignment: 'left' },
          },
        ],
      }),
      marked('world', { formatting: { alignment: 'right' } }),
    ]);
    reviewer.rejectChange(42);
    // Joined; the host's pPrChange must not survive on the joined paragraph.
    const after = paras(reviewer);
    expect(after).toHaveLength(1);
    expect(after[0]!.propertyChanges).toBeUndefined();
    expect(after[0]!.formatting?.alignment).toBe('right');
    expect(reviewer.getChanges()).toHaveLength(0);
  });

  test('unknown revision id throws ChangeNotFoundError', () => {
    const reviewer = makeReviewer([makeParagraph('text')]);
    expect(() => reviewer.acceptChange(999999)).toThrow(ChangeNotFoundError);
    expect(() => reviewer.rejectChange(999999)).toThrow(ChangeNotFoundError);
  });
});

describe('structural accept/reject — property and section changes', () => {
  test('reject pPrChange restores prior fields, keeps the rest; accept clears', () => {
    const build = () => [
      marked('Hello', {
        formatting: { alignment: 'right', indentLeft: 720, spaceBefore: 120 },
        propertyChanges: [
          {
            type: 'paragraphPropertyChange',
            info: { id: 100, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            previousFormatting: { alignment: 'left', indentLeft: 0 },
          },
        ],
      }),
    ];
    const rejected = makeReviewer(build());
    rejected.rejectChange(100);
    const rPara = paras(rejected)[0]!;
    expect(rPara.propertyChanges).toBeUndefined();
    expect(rPara.formatting?.alignment).toBe('left');
    expect(rPara.formatting?.indentLeft).toBe(0);
    expect(rPara.formatting?.spaceBefore).toBe(120);

    const accepted = makeReviewer(build());
    accepted.acceptChange(100);
    const aPara = paras(accepted)[0]!;
    expect(aPara.propertyChanges).toBeUndefined();
    expect(aPara.formatting?.alignment).toBe('right');
  });

  test('reject pPrChange that added numbering drops numPr', () => {
    const reviewer = makeReviewer([
      marked('Hello', {
        formatting: { numPr: { numId: 3, ilvl: 0 } },
        propertyChanges: [
          {
            type: 'paragraphPropertyChange',
            info: { id: 101, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            previousFormatting: {},
            currentFormatting: { numPr: { numId: 3, ilvl: 0 } },
          },
        ],
      }),
    ]);
    reviewer.rejectChange(101);
    expect(paras(reviewer)[0]!.formatting?.numPr).toBeUndefined();
  });

  test('reject paraRPrChange restores runProperties; accept clears', () => {
    const build = () => [
      marked('Hello', {
        formatting: { runProperties: { bold: true } },
        paraRPrChange: [
          {
            type: 'paragraphMarkPropertyChange',
            info: { id: 60, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            previousFormatting: { bold: false },
          },
        ],
      }),
    ];
    const rejected = makeReviewer(build());
    rejected.rejectChange(60);
    const rPara = paras(rejected)[0]!;
    expect(rPara.paraRPrChange).toBeUndefined();
    expect(rPara.formatting?.runProperties?.bold).toBe(false);

    const accepted = makeReviewer(build());
    accepted.acceptChange(60);
    expect(paras(accepted)[0]!.paraRPrChange).toBeUndefined();
    expect(paras(accepted)[0]!.formatting?.runProperties?.bold).toBe(true);
  });

  test('reject paragraph-level sectPrChange restores prior; accept clears', () => {
    const build = () => [
      marked('Hello', {
        sectionProperties: {
          pageWidth: 12240,
          sectPrChange: {
            type: 'sectionPropertyChange',
            info: { id: 9, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            previousSectionProperties: { pageWidth: 15840 },
          },
        },
      }),
    ];
    const rejected = makeReviewer(build());
    rejected.rejectChange(9);
    const rSect = paras(rejected)[0]!.sectionProperties!;
    expect(rSect.pageWidth).toBe(15840);
    expect(rSect.sectPrChange).toBeUndefined();

    const accepted = makeReviewer(build());
    accepted.acceptChange(9);
    const aSect = paras(accepted)[0]!.sectionProperties!;
    expect(aSect.pageWidth).toBe(12240);
    expect(aSect.sectPrChange).toBeUndefined();
  });

  test('body-level finalSectionProperties sectPrChange accept/reject', () => {
    const build = () => {
      const reviewer = makeReviewer([makeParagraph('only')]);
      const body = reviewer.toDocument().package.document as DocumentBody;
      body.finalSectionProperties = {
        pageWidth: 12240,
        sectPrChange: {
          type: 'sectionPropertyChange',
          info: { id: 11, author: 'Jane', date: '2024-01-01T00:00:00Z' },
          previousSectionProperties: { pageWidth: 15840 },
        },
      };
      return reviewer;
    };
    const changes = build().getChanges();
    expect(changes.some((c) => c.id === 11 && c.type === 'sectionPropertyChange')).toBe(true);

    const rejected = build();
    rejected.rejectChange(11);
    const rProps = (rejected.toDocument().package.document as DocumentBody).finalSectionProperties!;
    expect(rProps.pageWidth).toBe(15840);
    expect(rProps.sectPrChange).toBeUndefined();

    const accepted = build();
    accepted.acceptChange(11);
    const aProps = (accepted.toDocument().package.document as DocumentBody).finalSectionProperties!;
    expect(aProps.pageWidth).toBe(12240);
    expect(aProps.sectPrChange).toBeUndefined();
  });
});

describe('structural discovery and bulk resolve', () => {
  function structuralDoc(): DocxReviewer {
    return makeReviewer([
      marked('one', { pPrIns: { id: 41, author: 'Jane', date: '2024-01-01T00:00:00Z' } }),
      marked('two', { pPrDel: { id: 43, author: 'John', date: '2024-02-02T00:00:00Z' } }),
      marked('three', {
        propertyChanges: [
          {
            type: 'paragraphPropertyChange',
            info: { id: 44, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            previousFormatting: { alignment: 'left' },
          },
        ],
        paraRPrChange: [
          {
            type: 'paragraphMarkPropertyChange',
            info: { id: 45, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            previousFormatting: { bold: false },
          },
        ],
        sectionProperties: {
          pageWidth: 12240,
          sectPrChange: {
            type: 'sectionPropertyChange',
            info: { id: 46, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            previousSectionProperties: { pageWidth: 15840 },
          },
        },
      }),
    ]);
  }

  test('getChanges surfaces all five structural kinds', () => {
    const types = structuralDoc()
      .getChanges()
      .map((c) => c.type)
      .sort();
    expect(types).toEqual([
      'paragraphDeletion',
      'paragraphInsertion',
      'paragraphMarkPropertyChange',
      'paragraphPropertyChange',
      'sectionPropertyChange',
    ]);
  });

  test('ChangeFilter.type narrows to a structural kind', () => {
    const changes = structuralDoc().getChanges({ type: 'paragraphInsertion' });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id: 41, paragraphIndex: 0 });
  });

  test('getChanges count agrees with acceptAll count', () => {
    expect(structuralDoc().getChanges()).toHaveLength(structuralDoc().acceptAll());
  });

  test('acceptAll clears every structural marker', () => {
    const reviewer = structuralDoc();
    reviewer.acceptAll();
    expect(reviewer.getChanges()).toHaveLength(0);
  });

  test('rejectAll clears every structural marker', () => {
    const reviewer = structuralDoc();
    reviewer.rejectAll();
    expect(reviewer.getChanges()).toHaveLength(0);
  });

  test('proposals mint ids above structural ids (no w:id collision)', () => {
    const reviewer = makeReviewer([
      marked('Price is $50.', {
        pPrIns: { id: 100, author: 'Jane', date: '2024-01-01T00:00:00Z' },
      }),
    ]);
    reviewer.proposeDeletion({ paragraphIndex: 0, search: '$50', author: 'AI' });
    const ids = reviewer.getChanges().map((c) => c.id);
    expect(ids).toContain(100);
    expect(ids.filter((id) => id !== 100).every((id) => id > 100)).toBe(true);
  });
});

describe('structural revisions in tables and notes', () => {
  test('accept pPrDel joins within a table cell, not across cells', () => {
    const cell = (text: string, extra?: Partial<Paragraph>) => ({
      content: [marked(text, extra ?? {})],
    });
    const doc = {
      package: {
        document: {
          content: [
            {
              type: 'table',
              rows: [{ cells: [cell('a', { pPrDel: { id: 7, author: 'Jane' } }), cell('b')] }],
            },
          ],
        } as DocumentBody,
      },
    } as Document;
    const reviewer = new DocxReviewer(doc, 'AI');
    // Only one paragraph follows in the same cell — none, so the marker
    // clears without joining (cell boundary is never crossed).
    reviewer.acceptChange(7);
    const table = (reviewer.toDocument().package.document as DocumentBody).content[0];
    if (table.type !== 'table') throw new Error('expected a table first');
    expect(table.rows[0]!.cells[0]!.content).toHaveLength(1);
    expect(table.rows[0]!.cells[1]!.content).toHaveLength(1);
    expect(reviewer.getChanges()).toHaveLength(0);
  });

  test('footnote pPrIns resolves via its ReviewChange', () => {
    const footnote = (id: number, content: Paragraph[]): Footnote => ({
      type: 'footnote',
      id,
      noteType: 'normal',
      content,
    });
    const doc = {
      package: {
        document: { content: [makeParagraph('body')], comments: [] } as DocumentBody,
        footnotes: [
          footnote(2, [
            marked('note one', {
              pPrIns: { id: 50, author: 'Jane', date: '2024-01-01T00:00:00Z' },
            }),
            makeParagraph('note two'),
          ]),
        ],
      },
    } as Document;
    const reviewer = new DocxReviewer(doc, 'AI');
    const change = reviewer
      .getChanges({ includeFootnotes: true })
      .find((c) => c.type === 'paragraphInsertion');
    expect(change).toMatchObject({ noteType: 'footnote', noteId: 2, id: 50 });
    // Reject joins the two note paragraphs.
    reviewer.rejectChange(change!);
    const note = (reviewer.toDocument().package.footnotes ?? [])[0];
    expect(note.content).toHaveLength(1);
    expect(reviewer.getChanges({ includeFootnotes: true })).toHaveLength(0);
  });
});
