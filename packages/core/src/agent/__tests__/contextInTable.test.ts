import { describe, test, expect } from 'bun:test';
import { buildSelectionContext } from '../context';
import type { Document, Paragraph, Table } from '../../types/document';

function para(text: string): Paragraph {
  return {
    type: 'paragraph',
    content: [{ type: 'run', content: [{ type: 'text', text }] }],
  };
}

function tableWith(...cellTexts: string[]): Table {
  return {
    type: 'table',
    rows: [
      {
        type: 'tableRow',
        cells: cellTexts.map((text) => ({
          type: 'tableCell',
          content: [para(text)],
        })),
      },
    ],
  };
}

function docWithBody(content: Document['package']['document']['content']): Document {
  return { package: { document: { content } } };
}

describe('buildSelectionContext inTable', () => {
  test('false for a plain top-level paragraph (no tables)', () => {
    const doc = docWithBody([para('hello world')]);
    const ctx = buildSelectionContext(
      doc,
      { start: { paragraphIndex: 0, offset: 0 }, end: { paragraphIndex: 0, offset: 5 } },
      { includeSuggestions: false }
    );
    expect(ctx.inTable).toBe(false);
    expect(ctx.selectedText).toBe('hello');
  });

  test('true for a selection inside a table cell', () => {
    const doc = docWithBody([para('before'), tableWith('cell one', 'cell two')]);
    // Flattened order: 0 = 'before', 1 = 'cell one', 2 = 'cell two'
    const ctx = buildSelectionContext(
      doc,
      { start: { paragraphIndex: 1, offset: 0 }, end: { paragraphIndex: 1, offset: 4 } },
      { includeSuggestions: false }
    );
    expect(ctx.inTable).toBe(true);
    expect(ctx.selectedText).toBe('cell');
  });

  test('true when a multi-paragraph range touches a table', () => {
    const doc = docWithBody([para('before'), tableWith('cell one')]);
    const ctx = buildSelectionContext(
      doc,
      { start: { paragraphIndex: 0, offset: 0 }, end: { paragraphIndex: 1, offset: 4 } },
      { includeSuggestions: false }
    );
    expect(ctx.inTable).toBe(true);
  });

  test('false when a table exists but the selection is outside it', () => {
    const doc = docWithBody([tableWith('cell one'), para('after')]);
    // Flattened order: 0 = 'cell one', 1 = 'after'
    const ctx = buildSelectionContext(
      doc,
      { start: { paragraphIndex: 1, offset: 0 }, end: { paragraphIndex: 1, offset: 5 } },
      { includeSuggestions: false }
    );
    expect(ctx.inTable).toBe(false);
    expect(ctx.selectedText).toBe('after');
  });

  test('true for nested table cell paragraphs', () => {
    const inner = tableWith('nested');
    const outer: Table = {
      type: 'table',
      rows: [
        {
          type: 'tableRow',
          cells: [{ type: 'tableCell', content: [para('outer cell'), inner] }],
        },
      ],
    };
    const doc = docWithBody([outer]);
    // Flattened order: 0 = 'outer cell', 1 = 'nested'
    const ctx = buildSelectionContext(
      doc,
      { start: { paragraphIndex: 1, offset: 0 }, end: { paragraphIndex: 1, offset: 6 } },
      { includeSuggestions: false }
    );
    expect(ctx.inTable).toBe(true);
    expect(ctx.selectedText).toBe('nested');
  });

  test('does not crash on empty cells and empty tables', () => {
    const emptyCell: Table = {
      type: 'table',
      rows: [{ type: 'tableRow', cells: [{ type: 'tableCell', content: [] }] }],
    };
    const emptyTable: Table = { type: 'table', rows: [] };
    const doc = docWithBody([para('before'), emptyCell, emptyTable, para('after')]);
    // Flattened order: 0 = 'before', 1 = 'after' (no cell paragraphs)
    const ctx = buildSelectionContext(
      doc,
      { start: { paragraphIndex: 1, offset: 0 }, end: { paragraphIndex: 1, offset: 5 } },
      { includeSuggestions: false }
    );
    expect(ctx.inTable).toBe(false);
    expect(ctx.selectedText).toBe('after');
  });
});
