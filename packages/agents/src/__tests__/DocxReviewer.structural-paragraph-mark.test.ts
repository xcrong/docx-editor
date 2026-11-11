import { describe, test, expect } from 'bun:test';
import type { DocumentBody, Paragraph } from '@xcrong/docx-editor-core/headless';
import { makeRun, makeParagraphFrom, makeReviewer } from './_helpers';

// T27-04 (issue #80): the agents toolkit must not crash on paragraphs that
// carry paragraph-mark revisions (`pPrIns` / `pPrDel`) or paragraph property
// changes (`propertyChanges`), and proposing a run-level change must leave
// those paragraph-level markers untouched (orthogonal concerns).
//
// NOTE — scope split with issue #120: model-level ACCEPT / REJECT semantics
// for paragraph-level revisions (pPrIns join-on-accept, pPrDel join,
// pPrChange/paraRPrChange/sectPrChange prior-restore) belong to #120. This
// file only pins that the *propose* path is total and marker-preserving.

function structuralParagraph(text: string): Paragraph {
  return {
    ...makeParagraphFrom([makeRun(text)]),
    pPrIns: { id: 41, author: 'Jane', date: '2024-01-01T00:00:00Z' },
    propertyChanges: [
      {
        type: 'paragraphPropertyChange',
        info: { id: 42, author: 'Jane', date: '2024-01-01T00:00:00Z' },
        previousFormatting: { alignment: 'left' },
      },
    ],
  };
}

function firstPara(reviewer: ReturnType<typeof makeReviewer>): Paragraph {
  const body = reviewer.toDocument().package.document as DocumentBody;
  const para = body.content[0];
  if (!para || para.type !== 'paragraph') throw new Error('expected a paragraph first');
  return para as Paragraph;
}

describe('propose* on paragraphs with paragraph-mark revisions', () => {
  test('proposeReplacement preserves pPrIns + propertyChanges', () => {
    const reviewer = makeReviewer([structuralParagraph('Price is $50,000.')]);
    reviewer.proposeReplacement({
      paragraphIndex: 0,
      search: '$50,000',
      author: 'AI',
      replaceWith: '$500,000',
    });
    const changes = reviewer.getChanges();
    expect(changes).toHaveLength(2);
    const para = firstPara(reviewer);
    expect(para.pPrIns).toMatchObject({ id: 41, author: 'Jane' });
    expect(para.propertyChanges).toHaveLength(1);
    expect(para.propertyChanges![0]!.info).toMatchObject({ id: 42 });
  });

  test('proposeInsertion / proposeDeletion preserve pPrDel', () => {
    const para: Paragraph = {
      ...makeParagraphFrom([makeRun('All licenses shall cease.')]),
      pPrDel: { id: 43, author: 'John', date: '2024-02-02T00:00:00Z' },
    };
    const reviewer = makeReviewer([para]);
    reviewer.proposeInsertion({
      paragraphIndex: 0,
      author: 'AI',
      insertText: ' Soon.',
      position: 'after',
    });
    reviewer.proposeDeletion({ paragraphIndex: 0, search: 'licenses', author: 'AI' });
    const after = firstPara(reviewer);
    expect(after.pPrDel).toMatchObject({ id: 43, author: 'John' });
    // Both run-level proposals landed alongside the paragraph marker.
    expect(reviewer.getChanges().length).toBeGreaterThanOrEqual(2);
  });

  test('acceptChange on a run-level change inside a pPrIns paragraph keeps the marker', () => {
    const reviewer = makeReviewer([structuralParagraph('Hello world')]);
    reviewer.proposeDeletion({ paragraphIndex: 0, search: 'world', author: 'AI' });
    const deletion = reviewer.getChanges().find((c) => c.type === 'deletion');
    expect(deletion).toBeTruthy();
    reviewer.acceptChange(deletion!.id);
    expect(firstPara(reviewer).pPrIns).toMatchObject({ id: 41, author: 'Jane' });
  });
});
