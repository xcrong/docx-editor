/**
 * addRowAbove / addRowBelow inherit the reference row's formatting.
 *
 * The new row's cells start empty but carry the reference cell's paragraph
 * formatting (alignment, default run font) and cell properties (borders,
 * shading, vertical alignment) so the table keeps a uniform style.
 */

import { describe, test, expect } from 'bun:test';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { singletonManager } from '../../../../schema';
import { createSuggestionModePlugin } from '../../../../plugins/suggestionMode';
import { makeAddRowAbove, makeAddRowBelow } from './insert';

const schema = singletonManager.getSchema();

const BORDERS = {
  top: { style: 'single', size: 4, color: { rgb: 'FF0000' } },
  bottom: { style: 'single', size: 4, color: { rgb: 'FF0000' } },
  left: { style: 'single', size: 4, color: { rgb: 'FF0000' } },
  right: { style: 'single', size: 4, color: { rgb: 'FF0000' } },
};

function styledCell(text: string) {
  const para = schema.nodes.paragraph.create(
    {
      alignment: 'center',
      spaceBefore: 120,
      spaceAfter: 120,
      defaultTextFormatting: { fontFamily: 'Arial', fontSize: 28 },
    },
    text ? schema.text(text) : undefined
  );
  return schema.nodes.tableCell.create(
    {
      colspan: 1,
      rowspan: 1,
      width: 3000,
      widthType: 'dxa',
      verticalAlign: 'center',
      backgroundColor: '4472C4',
      borders: BORDERS,
    },
    para
  );
}

function makeTable(): PMNode {
  return schema.nodes.table.create({ columnWidths: [3000, 3000] }, [
    schema.nodes.tableRow.create({ height: 400, heightRule: 'atLeast' }, [
      styledCell('a1'),
      styledCell('b1'),
    ]),
    schema.nodes.tableRow.create(null, [
      schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('a2'))),
      schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('b2'))),
    ]),
  ]);
}

/** State with the cursor inside `table.child(rowIdx)`'s first cell text. */
function stateWithCursor(table: PMNode, rowIdx: number): EditorState {
  const doc = schema.nodes.doc.create(null, [table, schema.nodes.paragraph.create()]);
  // Resolve a text position inside the target row's first cell.
  let pos = -1;
  doc.descendants((node, p) => {
    if (pos !== -1) return false;
    if (node.isText && p > 0) {
      // Check the ancestor row by walking up: find table then row index.
      try {
        const $p = doc.resolve(p);
        for (let d = $p.depth; d > 0; d--) {
          const n = $p.node(d);
          if (n.type.name === 'tableRow' && $p.node(d - 1)?.type.name === 'table') {
            if ($p.index(d - 1) === rowIdx) pos = p;
            break;
          }
        }
      } catch {
        // ignore
      }
    }
    return true;
  });
  if (pos === -1) throw new Error('no text pos found');
  const state = EditorState.create({ schema, doc });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

function runCmd(state: EditorState, cmd: Command): EditorState {
  let captured: Transaction | null = null;
  const ok = cmd(state, (tr) => {
    captured = tr;
  });
  expect(ok).toBe(true);
  if (!captured) throw new Error('command did not dispatch');
  return state.apply(captured);
}

function tableOf(state: EditorState): PMNode {
  let found: PMNode | null = null;
  state.doc.descendants((node) => {
    if (!found && node.type.name === 'table') found = node;
    return !found;
  });
  if (!found) throw new Error('no table');
  return found;
}

/** One header row (tableHeader cells) over one body row. */
function makeHeaderTable(): PMNode {
  return schema.nodes.table.create({ columnWidths: [3000] }, [
    schema.nodes.tableRow.create({ isHeader: true }, [
      schema.nodes.tableHeader.create(
        null,
        schema.nodes.paragraph.create(null, schema.text('head'))
      ),
    ]),
    schema.nodes.tableRow.create(null, [
      schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('body'))),
    ]),
  ]);
}

describe('addRowBelow — formatting inheritance', () => {
  test('new row copies alignment, font, shading, borders; cells stay empty', () => {
    const after = runCmd(stateWithCursor(makeTable(), 0), makeAddRowBelow(schema));
    const table = tableOf(after);
    expect(table.childCount).toBe(3);

    const newRow = table.child(1);
    expect(newRow.attrs.height).toBe(400);
    expect(newRow.attrs.heightRule).toBe('atLeast');

    for (let c = 0; c < newRow.childCount; c++) {
      const cell = newRow.child(c);
      // Cell properties inherited.
      expect(cell.attrs.backgroundColor).toBe('4472C4');
      expect(cell.attrs.verticalAlign).toBe('center');
      expect(cell.attrs.borders).toEqual(BORDERS);
      // Paragraph formatting inherited.
      const para = cell.child(0);
      expect(para.type.name).toBe('paragraph');
      expect(para.attrs.alignment).toBe('center');
      expect(para.attrs.defaultTextFormatting).toMatchObject({
        fontFamily: 'Arial',
        fontSize: 28,
      });
      // No content copied.
      expect(cell.textContent).toBe('');
    }
  });

  test('addRowAbove uses the row below as reference', () => {
    const after = runCmd(stateWithCursor(makeTable(), 1), makeAddRowAbove(schema));
    const table = tableOf(after);
    expect(table.childCount).toBe(3);
    // Inserted above row 1 → lands at index 1 and copies row 1 (plain).
    const newRow = table.child(1);
    const para = newRow.child(0).child(0);
    expect(para.attrs.alignment).toBeNull();
    expect(newRow.child(0).textContent).toBe('');
  });

  test('new cell stays unlisted, unidentified and untracked', () => {
    const para = schema.nodes.paragraph.create(
      {
        paraId: 'P1',
        textId: 'T1',
        alignment: 'center',
        numPr: { numId: 3, ilvl: 0 },
        numPrFromStyle: { numId: 3, ilvl: 0 },
        listNumFmt: 'decimal',
        listIsBullet: false,
      },
      schema.text('numbered')
    );
    const table = schema.nodes.table.create({ columnWidths: [3000] }, [
      schema.nodes.tableRow.create(null, [
        schema.nodes.tableCell.create({ width: 3000, widthType: 'dxa' }, para),
      ]),
    ]);
    const after = runCmd(stateWithCursor(table, 0), makeAddRowBelow(schema));
    const newPara = tableOf(after).child(1).child(0).child(0);
    // Formatting inherited, identity/list/tracking left behind.
    expect(newPara.attrs.alignment).toBe('center');
    expect(newPara.attrs.paraId).toBeNull();
    expect(newPara.attrs.textId).toBeNull();
    expect(newPara.attrs.numPr).toBeNull();
    expect(newPara.attrs.numPrFromStyle).toBeNull();
    expect(newPara.attrs.listNumFmt).toBeNull();
  });

  test('multi-paragraph template yields one empty paragraph', () => {
    const cell = schema.nodes.tableCell.create({ width: 3000, widthType: 'dxa' }, [
      schema.nodes.paragraph.create({ alignment: 'right' }, schema.text('first')),
      schema.nodes.paragraph.create({ alignment: 'left' }, schema.text('second')),
    ]);
    const table = schema.nodes.table.create({ columnWidths: [3000] }, [
      schema.nodes.tableRow.create(null, [cell]),
    ]);
    const after = runCmd(stateWithCursor(table, 0), makeAddRowBelow(schema));
    const newCell = tableOf(after).child(1).child(0);
    expect(newCell.childCount).toBe(1);
    expect(newCell.child(0).attrs.alignment).toBe('right');
    expect(newCell.textContent).toBe('');
  });

  test('header band: add-below the last header row yields a body row', () => {
    const table = makeHeaderTable();
    const after = runCmd(stateWithCursor(table, 0), makeAddRowBelow(schema));
    const updated = tableOf(after);
    expect(updated.childCount).toBe(3);
    expect(updated.child(0).attrs.isHeader).toBe(true);
    expect(updated.child(1).attrs.isHeader).toBe(false);
    expect(updated.child(1).child(0).textContent).toBe('');
  });

  test('header band: add-above a header row stays a header row', () => {
    const table = makeHeaderTable();
    const after = runCmd(stateWithCursor(table, 0), makeAddRowAbove(schema));
    const updated = tableOf(after);
    expect(updated.childCount).toBe(3);
    expect(updated.child(0).attrs.isHeader).toBe(true);
    expect(updated.child(1).attrs.isHeader).toBe(true);
  });

  test('header band: add-below a mid-band header row stays a header row', () => {
    const headerCell = (t: string) =>
      schema.nodes.tableHeader.create(null, schema.nodes.paragraph.create(null, schema.text(t)));
    const bodyCell = (t: string) =>
      schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text(t)));
    const table = schema.nodes.table.create({ columnWidths: [3000] }, [
      schema.nodes.tableRow.create({ isHeader: true }, [headerCell('h1')]),
      schema.nodes.tableRow.create({ isHeader: true }, [headerCell('h2')]),
      schema.nodes.tableRow.create(null, [bodyCell('b')]),
    ]);
    const after = runCmd(stateWithCursor(table, 0), makeAddRowBelow(schema));
    const updated = tableOf(after);
    expect(updated.child(1).attrs.isHeader).toBe(true);
  });

  test('tableHeader cell type is preserved in the new row', () => {
    const table = makeHeaderTable();
    const after = runCmd(stateWithCursor(table, 0), makeAddRowAbove(schema));
    expect(tableOf(after).child(0).child(0).type.name).toBe('tableHeader');
  });

  test('suggesting mode: tracked row still inherits formatting', () => {
    const table = makeTable();
    const doc = schema.nodes.doc.create(null, [table, schema.nodes.paragraph.create()]);
    let state = EditorState.create({
      schema,
      doc,
      plugins: [createSuggestionModePlugin(true, 'TestUser')],
    });
    // Cursor inside row 0's first cell text.
    let pos = -1;
    state.doc.descendants((node, p) => {
      if (pos !== -1 || !node.isText) return true;
      try {
        const $p = state.doc.resolve(p);
        for (let d = $p.depth; d > 0; d--) {
          const n = $p.node(d);
          if (n.type.name === 'tableRow' && $p.node(d - 1)?.type.name === 'table') {
            if ($p.index(d - 1) === 0) pos = p;
            break;
          }
        }
      } catch {
        // ignore
      }
      return true;
    });
    if (pos === -1) throw new Error('no text pos found');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));

    const after = runCmd(state, makeAddRowBelow(schema));
    const updated = tableOf(after);
    const newRow = updated.child(1);
    expect(newRow.attrs.trIns).toBeTruthy();
    const newCell = newRow.child(0);
    expect(newCell.attrs.cellMarker?.kind).toBe('ins');
    expect(newCell.child(0).attrs.alignment).toBe('center');
    expect(newCell.child(0).attrs.defaultTextFormatting).toMatchObject({
      fontFamily: 'Arial',
    });
    expect(newCell.textContent).toBe('');
  });
});
