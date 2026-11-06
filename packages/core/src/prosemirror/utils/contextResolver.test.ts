/**
 * Unit tests for resolveContext (right-click context resolution).
 */

import { describe, test, expect } from 'bun:test';
import { Schema, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { resolveContext } from './contextResolver';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    table: { group: 'block', content: 'tableRow+' },
    tableRow: { content: 'tableCell+' },
    tableCell: { content: 'paragraph+' },
    image: { inline: true, group: 'inline', atom: true, attrs: { src: { default: null } } },
    text: { group: 'inline' },
  },
  marks: {
    hyperlink: { attrs: { href: { default: null } } },
  },
});

function stateFor(doc: PMNode, selection: { from: number; to: number } = { from: 1, to: 1 }) {
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, selection.from, selection.to),
  });
}

function para(text: string) {
  return schema.node('paragraph', null, text ? [schema.text(text)] : []);
}

function linkedPara(text: string, href: string) {
  const mark = schema.marks.hyperlink.create({ href });
  return schema.node('paragraph', null, [schema.text(text, [mark])]);
}

function tableDoc() {
  const cell = (text: string) => schema.node('tableCell', null, [para(text)]);
  const row = schema.node('tableRow', null, [cell('a1'), cell('b1')]);
  const tbl = schema.node('table', null, [
    row,
    schema.node('tableRow', null, [cell('a2'), cell('b2')]),
  ]);
  return schema.node('doc', null, [para('before'), tbl, para('after')]);
}

describe('resolveContext', () => {
  test('plain text resolves all-false with cursor-only selection', () => {
    const doc = schema.node('doc', null, [para('hello')]);
    const info = resolveContext(stateFor(doc, { from: 2, to: 2 }), 2);
    expect(info).toEqual({
      isTextSelected: false,
      isInTable: false,
      isOnImage: false,
      isOnHyperlink: false,
      linkHref: null,
      imagePos: null,
      tableRowCount: null,
      tableColumnCount: null,
      tableRowIndex: null,
      tableColumnIndex: null,
    });
  });

  test('non-empty selection sets isTextSelected', () => {
    const doc = schema.node('doc', null, [para('hello')]);
    const info = resolveContext(stateFor(doc, { from: 1, to: 4 }), 2);
    expect(info.isTextSelected).toBe(true);
    expect(info.isInTable).toBe(false);
  });

  test('position inside a table cell reports table metadata', () => {
    const doc = tableDoc();
    // 'before' is 6 chars: doc(0) p(0..7); table starts at 8.
    // Find pos inside first cell: scan for it.
    let cellPos = -1;
    doc.descendants((node, pos) => {
      if (cellPos < 0 && node.type.name === 'tableCell') cellPos = pos;
    });
    expect(cellPos).toBeGreaterThan(0);
    const info = resolveContext(stateFor(doc), cellPos + 1);
    expect(info.isInTable).toBe(true);
    expect(info.tableRowCount).toBe(2);
    expect(info.tableColumnCount).toBe(2);
    expect(info.tableRowIndex).toBe(0);
    expect(info.tableColumnIndex).toBe(0);
  });

  test('position on an image reports isOnImage with its pos', () => {
    const img = schema.node('image', { src: 'x.png' });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('ab'), img, schema.text('cd')]),
    ]);
    // paragraph at 0..? 'ab' occupies 1..3, image at 3..4.
    const info = resolveContext(stateFor(doc), 3);
    expect(info.isOnImage).toBe(true);
    expect(info.imagePos).toBe(3);
  });

  test('position on hyperlinked text reports href', () => {
    const doc = schema.node('doc', null, [linkedPara('click', 'https://example.com')]);
    const info = resolveContext(stateFor(doc), 3);
    expect(info.isOnHyperlink).toBe(true);
    expect(info.linkHref).toBe('https://example.com');
  });

  test('out-of-range pos is clamped and never throws', () => {
    const doc = schema.node('doc', null, [para('hi')]);
    const state = stateFor(doc);
    expect(() => resolveContext(state, -50).isInTable).not.toThrow();
    expect(() => resolveContext(state, 9999).isInTable).not.toThrow();
    expect(resolveContext(state, 9999).isTextSelected).toBe(false);
  });
});
