import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import { parseDocx } from '../parser';
import { serializeDocument } from '../serializer/documentSerializer';
import type { Table } from '../../types/document';
import { assertOoxmlEquivalent } from './assertOoxmlEquivalent';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { fromProseDoc } from '../../prosemirror/conversion/fromProseDoc';
import { schema } from '../../prosemirror/schema';
import { extractTrackedChanges } from '../../prosemirror/utils/extractTrackedChanges';
import {
  TRACKED_STRUCTURAL_FIXTURES,
  buildFixtureDocx,
  type TrackedStructuralFixtureName,
} from './fixtures/tracked-structural/index';

// T27-05 (issue #81): per-fixture round-trip tests for Phase 2 table
// revisions — row ins/del, cell ins/del/merge, property changes,
// per-row tblPrExChange, and id-only tblGridChange. Each minimal fixture
// parses to the expected model fields and re-serializes to XML canonically
// equivalent to the source.

function tablesOf(doc: Awaited<ReturnType<typeof parseDocx>>): Table[] {
  return doc.package.document.content.filter((b): b is Table => b.type === 'table');
}

async function roundTrip(name: TrackedStructuralFixtureName) {
  const source = TRACKED_STRUCTURAL_FIXTURES[name];
  const doc = await parseDocx(await buildFixtureDocx(source));
  const xml = serializeDocument(doc);
  assertOoxmlEquivalent(xml, source);
  return tablesOf(doc);
}

describe('T27-05: table revision fixtures round-trip', () => {
  test('tableRowInsDel fixture: trIns/trDel model fields + canonical XML', async () => {
    const tables = await roundTrip('tableRowInsDel');
    expect(tables).toHaveLength(1);
    const rows = tables[0]!.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.structuralChange).toMatchObject({
      type: 'tableRowInsertion',
      info: { id: 301, author: 'Jane' },
    });
    expect(rows[1]!.structuralChange).toMatchObject({
      type: 'tableRowDeletion',
      info: { id: 302, author: 'Jane' },
    });
  });

  test('tableCellMarkers fixture: ins/del/merge markers + canonical XML', async () => {
    const tables = await roundTrip('tableCellMarkers');
    expect(tables).toHaveLength(1);
    const rows = tables[0]!.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cells[0]!.structuralChange).toMatchObject({
      type: 'tableCellInsertion',
      info: { id: 310, author: 'Jane' },
    });
    expect(rows[0]!.cells[1]!.structuralChange).toMatchObject({
      type: 'tableCellDeletion',
      info: { id: 311, author: 'Jane' },
    });
    expect(rows[1]!.cells[0]!.structuralChange).toMatchObject({
      type: 'tableCellMerge',
      info: { id: 312, author: 'Jane' },
      vMerge: 'rest',
    });
    // vMergeOrig survives the round trip on the continuation cell.
    expect(rows[1]!.cells[1]!.structuralChange).toMatchObject({
      type: 'tableCellMerge',
      info: { id: 312, author: 'Jane' },
      vMerge: 'cont',
      vMergeOrig: 'rest',
    });
  });

  test('tablePropertyChanges fixture: tr/tc/tbl priors + canonical XML', async () => {
    const tables = await roundTrip('tablePropertyChanges');
    expect(tables).toHaveLength(1);
    const table = tables[0]!;
    expect(table.propertyChanges).toHaveLength(1);
    expect(table.propertyChanges![0]!.info).toMatchObject({ id: 320, author: 'Cara' });
    expect(table.propertyChanges![0]!.previousFormatting).toMatchObject({
      justification: 'center',
    });
    const row = table.rows[0]!;
    expect(row.propertyChanges).toHaveLength(1);
    expect(row.propertyChanges![0]!.info).toMatchObject({ id: 321, author: 'Cara' });
    expect(row.propertyChanges![0]!.previousFormatting?.height).toMatchObject({ value: 360 });
    const cell = row.cells[0]!;
    expect(cell.propertyChanges).toHaveLength(1);
    expect(cell.propertyChanges![0]!.info).toMatchObject({ id: 322, author: 'Cara' });
    expect(cell.propertyChanges![0]!.previousFormatting?.shading?.fill).toMatchObject({
      rgb: 'FFFFFF',
    });
  });

  test('tableExAndGridChanges fixture: row-level tblPrExChange + id-only grid', async () => {
    const tables = await roundTrip('tableExAndGridChanges');
    expect(tables).toHaveLength(1);
    const table = tables[0]!;
    // Grid change: id only, prior grid preserved.
    expect(table.gridChange).toMatchObject({ type: 'tableGridChange', info: { id: 330 } });
    expect(table.gridChange!.previousColumnWidths).toEqual([2500, 2500]);
    expect(table.columnWidths).toEqual([3000, 2000]);
    // Row-level exceptions: stored on the row, never on the table.
    const row = table.rows[0]!;
    expect(row.exceptions).toMatchObject({ justification: 'right' });
    expect(row.tblPrExChange).toHaveLength(1);
    expect(row.tblPrExChange![0]!.info).toMatchObject({ id: 331, author: 'Dan' });
    expect(row.tblPrExChange![0]!.previousFormatting).toMatchObject({
      justification: 'center',
    });
    expect((table as unknown as Record<string, unknown>).tblPrExChange).toBeUndefined();
  });

  test('toProseDoc → fromProseDoc preserves tblPrEx / tblGridChange attrs', async () => {
    const source = TRACKED_STRUCTURAL_FIXTURES.tableExAndGridChanges;
    const doc = await parseDocx(await buildFixtureDocx(source));
    const pmDoc = toProseDoc(doc);

    const tableNode = pmDoc.maybeChild(0);
    expect(tableNode?.type.name).toBe('table');
    expect(tableNode?.attrs.tblGridChange).toMatchObject({ revisionId: 330 });
    expect(tableNode?.attrs.tblGridChange.prior).toEqual([2500, 2500]);
    const rowNode = tableNode?.maybeChild(0);
    expect(rowNode?.attrs.tblPrEx).toMatchObject({ justification: 'right' });
    expect(rowNode?.attrs.tblPrExChange).toHaveLength(1);
    expect(rowNode?.attrs.tblPrExChange[0].info).toMatchObject({ id: 331, author: 'Dan' });

    const backToModel = fromProseDoc(pmDoc, doc);
    const tables = backToModel.package.document.content.filter(
      (b): b is Table => b.type === 'table'
    );
    expect(tables).toHaveLength(1);
    expect(tables[0]!.gridChange).toMatchObject({
      type: 'tableGridChange',
      info: { id: 330 },
      previousColumnWidths: [2500, 2500],
    });
    expect(tables[0]!.rows[0]!.exceptions).toMatchObject({ justification: 'right' });
    expect(tables[0]!.rows[0]!.tblPrExChange).toHaveLength(1);

    // PM → model → serialize keeps the wire markers in schema positions:
    // tblPrEx before trPr, tblGridChange as the last child of w:tblGrid.
    const xml = serializeDocument(backToModel);
    expect(xml).toMatch(
      /<w:tblPrEx>.*<w:tblPrExChange w:id="331".*<\/w:tblPrExChange><\/w:tblPrEx>/s
    );
    expect(xml).toContain('<w:tblGridChange w:id="330">');
    expect(xml).not.toMatch(/<w:tblGridChange[^>]*w:author/);
  });

  test('toProseDoc → fromProseDoc preserves row/cell markers incl. vMergeOrig', async () => {
    const source = TRACKED_STRUCTURAL_FIXTURES.tableCellMarkers;
    const doc = await parseDocx(await buildFixtureDocx(source));
    const pmDoc = toProseDoc(doc);

    const tableNode = pmDoc.maybeChild(0);
    const mergeRow = tableNode?.maybeChild(1);
    const topCell = mergeRow?.maybeChild(0);
    const bottomCell = mergeRow?.maybeChild(1);
    expect(topCell?.attrs.cellMarker).toMatchObject({
      kind: 'merge',
      info: { revisionId: 312, author: 'Jane' },
      vMerge: 'rest',
    });
    expect(bottomCell?.attrs.cellMarker).toMatchObject({
      kind: 'merge',
      info: { revisionId: 312, author: 'Jane' },
      vMerge: 'cont',
      vMergeOrig: 'rest',
    });

    const backToModel = fromProseDoc(pmDoc, doc);
    const tables = backToModel.package.document.content.filter(
      (b): b is Table => b.type === 'table'
    );
    expect(tables[0]!.rows[1]!.cells[1]!.structuralChange).toMatchObject({
      type: 'tableCellMerge',
      vMerge: 'cont',
      vMergeOrig: 'rest',
    });
    // Serialized cellMerge carries vMerge/vMergeOrig and never w:val.
    const xml = serializeDocument(backToModel);
    expect(xml).toContain('w:vMerge="rest"');
    expect(xml).toContain('w:vMergeOrig="rest"');
    expect(xml).not.toMatch(/<w:cellMerge[^>]*w:val/);
  });

  test('extractor surfaces tableExceptionsChanged + tableGridChanged entries', async () => {
    const source = TRACKED_STRUCTURAL_FIXTURES.tableExAndGridChanges;
    const doc = await parseDocx(await buildFixtureDocx(source));
    const pmDoc = toProseDoc(doc);
    const state = EditorState.create({ schema, doc: pmDoc });
    const { entries } = extractTrackedChanges(state);
    const byType = new Map(entries.map((e) => [e.type, e]));
    expect(byType.get('tableExceptionsChanged')?.revisionId).toBe(331);
    expect(byType.get('tableExceptionsChanged')?.author).toBe('Dan');
    expect(byType.get('tableGridChanged')?.revisionId).toBe(330);
  });
});
