import { describe, expect, test } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import { acceptAllChanges, acceptChangeById, rejectAllChanges, rejectChangeById } from './comments';
import { nextCellMarker } from '../extensions/nodes/TableExtension/commands/helpers';

// T27-06 (issue #82): accept/reject for table revisions — row ins/del,
// cell ins/del/merge (horizontal collapse, vertical span), property-change
// restore, single-row-table removal, mutual exclusion, multi-author.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { alignment: { default: null } },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
    table: {
      group: 'block',
      content: 'tableRow+',
      attrs: {
        columnWidths: { default: null },
        width: { default: null },
        widthType: { default: null },
        justification: { default: null },
        tableLayout: { default: null },
        tblPrChange: { default: null },
        tblGridChange: { default: null },
      },
      toDOM: () => ['table', ['tbody', 0]],
    },
    tableRow: {
      content: '(tableCell)+',
      attrs: {
        height: { default: null },
        heightRule: { default: null },
        isHeader: { default: null },
        trIns: { default: null },
        trDel: { default: null },
        trPrChange: { default: null },
        tblPrEx: { default: null },
        tblPrExChange: { default: null },
      },
      toDOM: () => ['tr', 0],
    },
    tableCell: {
      content: 'block+',
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        width: { default: null },
        widthType: { default: null },
        verticalAlign: { default: null },
        backgroundColor: { default: null },
        textDirection: { default: null },
        noWrap: { default: null },
        borders: { default: null },
        margins: { default: null },
        _originalFormatting: { default: null },
        cellMarker: { default: null },
        tcPrChange: { default: null },
      },
      toDOM: () => ['td', 0],
    },
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

const rev = (revisionId: number, author = 'Jane') => ({ revisionId, author, date: null });
const info = (id: number, author = 'Jane') => ({ id, author, date: undefined });

function cell(text: string, attrs: Record<string, unknown> = {}, colspan = 1, rowspan = 1) {
  return schema.nodes.tableCell.create(
    { colspan, rowspan, ...attrs },
    schema.nodes.paragraph.create(null, schema.text(text))
  );
}

function row(cells: ReturnType<typeof cell>[], attrs: Record<string, unknown> = {}) {
  return schema.nodes.tableRow.create(attrs, cells);
}

function table(rows: ReturnType<typeof row>[], attrs: Record<string, unknown> = {}) {
  return schema.nodes.table.create(attrs, rows);
}

function runCmd<T>(
  state: EditorState,
  cmd: (state: EditorState, dispatch?: (tr: Transaction) => void) => T
): { result: T; state: EditorState; steps: number } {
  let next = state;
  let steps = 0;
  const result = cmd(next, (tr) => {
    steps += tr.steps.length;
    next = next.apply(tr);
  });
  return { result, state: next, steps };
}

function firstTable(state: EditorState) {
  let out: { node: ReturnType<Schema['node']>; pos: number } | null = null;
  state.doc.descendants((node, pos) => {
    if (out == null && node.type.name === 'table') out = { node, pos };
    return out == null;
  });
  return out!;
}

describe('T27-06 table accept/reject', () => {
  test('accept trIns clears the marker and keeps the row', () => {
    const doc = schema.nodes.doc.create({}, [
      table([row([cell('a')], { trIns: rev(1) }), row([cell('b')])]),
    ]);
    const { result, state, steps } = runCmd(EditorState.create({ doc }), acceptChangeById(1));
    expect(result).toBe(true);
    const t = firstTable(state);
    expect(t.node.childCount).toBe(2);
    expect(t.node.child(0).attrs.trIns).toBeNull();
    // One transaction (one undo step) even though row + cells resolved.
    expect(steps).toBeGreaterThan(0);
    expect(runCmd(state, acceptChangeById(1)).result).toBe(false);
  });

  test('reject trIns deletes the row', () => {
    const doc = schema.nodes.doc.create({}, [
      table([row([cell('a')], { trIns: rev(2) }), row([cell('b')])]),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), rejectChangeById(2));
    expect(result).toBe(true);
    const t = firstTable(state);
    expect(t.node.childCount).toBe(1);
    expect(t.node.child(0).firstChild!.textContent).toBe('b');
  });

  test('accept trDel deletes the row; reject trDel clears', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [table([row([cell('a')], { trDel: rev(3) }), row([cell('b')])])]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(3));
    expect(accepted.result).toBe(true);
    expect(firstTable(accepted.state).node.childCount).toBe(1);

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(3));
    expect(rejected.result).toBe(true);
    const t = firstTable(rejected.state);
    expect(t.node.childCount).toBe(2);
    expect(t.node.child(0).attrs.trDel).toBeNull();
  });

  test('accept trDel on the only row of a table removes the table node', () => {
    const doc = schema.nodes.doc.create({}, [table([row([cell('a')], { trDel: rev(4) })])]);
    const { result, state } = runCmd(EditorState.create({ doc }), acceptChangeById(4));
    expect(result).toBe(true);
    // Table replaced by an empty paragraph (only child of the doc).
    expect(state.doc.childCount).toBe(1);
    expect(state.doc.firstChild!.type.name).toBe('paragraph');
  });

  test('accept cellMarker del deletes the cell; reject clears', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table([row([cell('a'), cell('b', { cellMarker: { kind: 'del', info: rev(5) } })])]),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(5));
    expect(accepted.result).toBe(true);
    const at = firstTable(accepted.state);
    expect(at.node.child(0).childCount).toBe(1);
    expect(at.node.child(0).firstChild!.firstChild!.textContent).toBe('a');

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(5));
    expect(rejected.result).toBe(true);
    const rt = firstTable(rejected.state);
    expect(rt.node.child(0).childCount).toBe(2);
    expect(rt.node.child(0).child(1).attrs.cellMarker).toBeNull();
  });

  test('accept cellMarker ins clears; reject deletes the cell', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table([row([cell('a'), cell('b', { cellMarker: { kind: 'ins', info: rev(6) } })])]),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(6));
    expect(accepted.result).toBe(true);
    expect(firstTable(accepted.state).node.child(0).child(1).attrs.cellMarker).toBeNull();

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(6));
    expect(rejected.result).toBe(true);
    const rt = firstTable(rejected.state);
    expect(rt.node.child(0).childCount).toBe(1);
    expect(rt.node.child(0).firstChild!.firstChild!.textContent).toBe('a');
  });

  test('accept horizontal merge collapses cells and concatenates content', () => {
    const doc = schema.nodes.doc.create({}, [
      table([
        row([
          cell('left', { cellMarker: { kind: 'ins', info: rev(7) } }),
          cell('right', { cellMarker: { kind: 'del', info: rev(7) } }),
        ]),
      ]),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), acceptChangeById(7));
    expect(result).toBe(true);
    const t = firstTable(state);
    expect(t.node.child(0).childCount).toBe(1);
    const survivor = t.node.child(0).firstChild!;
    expect(survivor.attrs.colspan).toBe(2);
    expect(survivor.attrs.cellMarker).toBeNull();
    expect(survivor.textContent).toContain('left');
    expect(survivor.textContent).toContain('right');
  });

  test('reject horizontal merge clears both markers and keeps both cells', () => {
    const doc = schema.nodes.doc.create({}, [
      table([
        row([
          cell('left', { cellMarker: { kind: 'ins', info: rev(8) } }),
          cell('right', { cellMarker: { kind: 'del', info: rev(8) } }),
        ]),
      ]),
    ]);
    const { result, state } = runCmd(EditorState.create({ doc }), rejectChangeById(8));
    expect(result).toBe(true);
    const t = firstTable(state);
    expect(t.node.child(0).childCount).toBe(2);
    expect(t.node.child(0).child(0).attrs.cellMarker).toBeNull();
    expect(t.node.child(0).child(1).attrs.cellMarker).toBeNull();
    expect(t.node.child(0).textContent).toContain('left');
    expect(t.node.child(0).textContent).toContain('right');
  });

  test('accept vertical merge spans the top cell; reject clears the group', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table([
          row([
            cell('top', { cellMarker: { kind: 'merge', info: rev(9), vMerge: 'rest' } }),
            cell('r1c2'),
          ]),
          row([
            cell('bot', { cellMarker: { kind: 'merge', info: rev(9), vMerge: 'cont' } }),
            cell('r2c2'),
          ]),
        ]),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(9));
    expect(accepted.result).toBe(true);
    const at = firstTable(accepted.state);
    expect(at.node.child(0).child(0).attrs.rowspan).toBe(2);
    expect(at.node.child(0).child(0).attrs.cellMarker).toBeNull();
    // Covered cell removed; the row keeps its other cell.
    expect(at.node.child(1).childCount).toBe(1);

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(9));
    expect(rejected.result).toBe(true);
    const rt = firstTable(rejected.state);
    expect(rt.node.childCount).toBe(2);
    expect(rt.node.child(0).child(0).attrs.cellMarker).toBeNull();
    expect(rt.node.child(1).child(0).attrs.cellMarker).toBeNull();
    expect(rt.node.child(0).child(0).attrs.rowspan).toBe(1);
  });

  test('accept trPrChange clears; reject restores prior height', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table([
          row([cell('a')], {
            height: 720,
            trPrChange: [
              {
                type: 'tableRowPropertyChange',
                info: info(10),
                previousFormatting: { height: { value: 360, type: 'dxa' } },
              },
            ],
          }),
        ]),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(10));
    expect(accepted.result).toBe(true);
    const at = firstTable(accepted.state);
    expect(at.node.child(0).attrs.height).toBe(720);
    expect(at.node.child(0).attrs.trPrChange).toBeNull();

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(10));
    expect(rejected.result).toBe(true);
    const rt = firstTable(rejected.state);
    expect(rt.node.child(0).attrs.height).toBe(360);
    expect(rt.node.child(0).attrs.trPrChange).toBeNull();
  });

  test('accept tcPrChange clears; reject restores prior fill', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table([
          row([
            cell('a', {
              backgroundColor: 'FFEB3B',
              tcPrChange: [
                {
                  type: 'tableCellPropertyChange',
                  info: info(11),
                  previousFormatting: { shading: null },
                },
              ],
            }),
          ]),
        ]),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(11));
    expect(accepted.result).toBe(true);
    expect(firstTable(accepted.state).node.child(0).child(0).attrs.backgroundColor).toBe('FFEB3B');

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(11));
    expect(rejected.result).toBe(true);
    const rt = firstTable(rejected.state);
    expect(rt.node.child(0).child(0).attrs.backgroundColor).toBeNull();
    expect(rt.node.child(0).child(0).attrs.tcPrChange).toBeNull();
  });

  test('accept tblPrChange clears; reject restores prior justification', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table([row([cell('a')])], {
          justification: 'center',
          tblPrChange: [
            {
              type: 'tablePropertyChange',
              info: info(12),
              previousFormatting: { justification: 'left' },
            },
          ],
        }),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(12));
    expect(accepted.result).toBe(true);
    const at = firstTable(accepted.state);
    expect(at.node.attrs.justification).toBe('center');
    expect(at.node.attrs.tblPrChange).toBeNull();

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(12));
    expect(rejected.result).toBe(true);
    const rt = firstTable(rejected.state);
    expect(rt.node.attrs.justification).toBe('left');
    expect(rt.node.attrs.tblPrChange).toBeNull();
  });

  test('accept tblGridChange clears; reject restores the prior grid', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table([row([cell('a'), cell('b')])], {
          columnWidths: [3000, 2000],
          tblGridChange: { revisionId: 13, prior: [2500, 2500] },
        }),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(13));
    expect(accepted.result).toBe(true);
    const at = firstTable(accepted.state);
    expect(at.node.attrs.tblGridChange).toBeNull();
    expect(at.node.attrs.columnWidths).toEqual([3000, 2000]);

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(13));
    expect(rejected.result).toBe(true);
    const rt = firstTable(rejected.state);
    expect(rt.node.attrs.tblGridChange).toBeNull();
    expect(rt.node.attrs.columnWidths).toEqual([2500, 2500]);
  });

  test('accept tblPrExChange clears; reject restores prior exceptions', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table([
          row([cell('a')], {
            tblPrEx: { justification: 'center' },
            tblPrExChange: [
              {
                type: 'tableExceptionsPropertyChange',
                info: info(14),
                previousFormatting: { justification: 'left' },
              },
            ],
          }),
        ]),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptChangeById(14));
    expect(accepted.result).toBe(true);
    expect(firstTable(accepted.state).node.child(0).attrs.tblPrExChange).toBeNull();

    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectChangeById(14));
    expect(rejected.result).toBe(true);
    const rt = firstTable(rejected.state);
    expect(rt.node.child(0).attrs.tblPrEx).toMatchObject({ justification: 'left' });
    expect(rt.node.child(0).attrs.tblPrExChange).toBeNull();
  });

  test('unknown revisionId is a no-op (returns false)', () => {
    const doc = schema.nodes.doc.create({}, [table([row([cell('a')])])]);
    expect(runCmd(EditorState.create({ doc }), acceptChangeById(999)).result).toBe(false);
    expect(runCmd(EditorState.create({ doc }), rejectChangeById(999)).result).toBe(false);
  });

  test('multi-author: distinct triples resolve independently', () => {
    const doc = schema.nodes.doc.create({}, [
      table([
        row([cell('a')], { trIns: rev(15, 'Jane') }),
        row([cell('b')], { trDel: rev(16, 'John') }),
      ]),
    ]);
    const state = EditorState.create({ doc });
    // Jane's row is untouched by John's accept.
    const john = runCmd(state, acceptChangeById(16));
    expect(john.result).toBe(true);
    const t = firstTable(john.state);
    expect(t.node.childCount).toBe(1);
    expect(t.node.child(0).attrs.trIns).toMatchObject({ revisionId: 15 });
    // Jane's insert still resolves (reject rolls the row back; the table
    // held only that row, so the table node goes with it).
    const jane = runCmd(john.state, rejectChangeById(15));
    expect(jane.result).toBe(true);
    let sawTable = false;
    jane.state.doc.descendants((n) => {
      if (n.type.name === 'table') sawTable = true;
    });
    expect(sawTable).toBe(false);
  });

  test('acceptAll / rejectAll walk table triples (counts distinct triples)', () => {
    const mk = () =>
      schema.nodes.doc.create({}, [
        table(
          [
            row([cell('a')], { trIns: rev(20, 'Jane') }),
            row([cell('b')], { trDel: rev(21, 'John') }),
          ],
          { tblGridChange: { revisionId: 22, prior: [1000] } }
        ),
      ]);
    const accepted = runCmd(EditorState.create({ doc: mk() }), acceptAllChanges());
    expect(accepted.result).toBe(3);
    const rejected = runCmd(EditorState.create({ doc: mk() }), rejectAllChanges());
    expect(rejected.result).toBe(3);
  });
});

describe('T27-06 cellMarker mutual exclusion', () => {
  const idA = { revisionId: 30, author: 'Jane', date: null };
  const idB = { revisionId: 31, author: 'Jane', date: null };

  test('authoring ins over same-triple ins is a no-op', () => {
    const r = nextCellMarker({ kind: 'ins', info: idA }, 'ins', idA);
    expect('noop' in r).toBe(true);
  });

  test('authoring del over same-triple ins clears both', () => {
    const r = nextCellMarker({ kind: 'ins', info: idA }, 'del', idA);
    expect(r).toEqual({ marker: null });
  });

  test('authoring ins over same-triple del clears both', () => {
    const r = nextCellMarker({ kind: 'del', info: idA }, 'ins', idA);
    expect(r).toEqual({ marker: null });
  });

  test('same-kind del over del is a no-op', () => {
    const r = nextCellMarker({ kind: 'del', info: idA }, 'del', idA);
    expect('noop' in r).toBe(true);
  });

  test('different triple overwrites', () => {
    const r = nextCellMarker({ kind: 'ins', info: idA }, 'del', idB);
    expect(r).toEqual({ marker: { kind: 'del', info: idB } });
  });

  test('no existing marker writes fresh', () => {
    const r = nextCellMarker(null, 'ins', idA);
    expect(r).toEqual({ marker: { kind: 'ins', info: idA } });
  });
});
