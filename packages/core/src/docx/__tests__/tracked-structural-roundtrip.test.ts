import { describe, expect, test } from 'bun:test';
import { parseDocx } from '../parser';
import { serializeDocument } from '../serializer/documentSerializer';
import type { Paragraph } from '../../types/document';
import { assertOoxmlEquivalent } from './assertOoxmlEquivalent';
import {
  TRACKED_STRUCTURAL_FIXTURES,
  buildFixtureDocx,
  type TrackedStructuralFixtureName,
} from './fixtures/tracked-structural/index';

// T27-04 (issue #80): per-fixture round-trip tests for Phase 1 structural
// revisions. Each minimal fixture parses to the expected model fields and
// re-serializes to XML canonically equivalent to the source —
// `assertOoxmlEquivalent` normalizes whitespace, attribute order, envelope
// namespaces, and empty-element spellings so the comparison pins revision
// semantics, not formatting.

function parasOf(doc: Awaited<ReturnType<typeof parseDocx>>): Paragraph[] {
  return doc.package.document.content.filter((b): b is Paragraph => b.type === 'paragraph');
}

async function roundTrip(name: TrackedStructuralFixtureName) {
  const source = TRACKED_STRUCTURAL_FIXTURES[name];
  const doc = await parseDocx(await buildFixtureDocx(source));
  const xml = serializeDocument(doc);
  assertOoxmlEquivalent(xml, source);
  return parasOf(doc);
}

describe('T27-04: tracked structural fixtures round-trip', () => {
  test('pPrIns fixture: model field + canonical XML', async () => {
    const paras = await roundTrip('pPrIns');
    expect(paras).toHaveLength(1);
    expect(paras[0]!.pPrIns).toMatchObject({ id: 201, author: 'Alice' });
    expect(paras[0]!.pPrDel).toBeUndefined();
  });

  test('pPrDel fixture: model field + canonical XML', async () => {
    const paras = await roundTrip('pPrDel');
    expect(paras).toHaveLength(1);
    expect(paras[0]!.pPrDel).toMatchObject({ id: 202, author: 'Bob' });
    expect(paras[0]!.pPrIns).toBeUndefined();
  });

  test('pPrChange fixture: prior snapshot + canonical XML', async () => {
    const paras = await roundTrip('pPrChange');
    expect(paras).toHaveLength(1);
    expect(paras[0]!.propertyChanges).toHaveLength(1);
    expect(paras[0]!.propertyChanges![0]!.info).toMatchObject({ id: 203, author: 'Cara' });
    expect(paras[0]!.propertyChanges![0]!.previousFormatting).toMatchObject({
      alignment: 'center',
    });
  });

  test('paraRPrChange fixture: prior run formatting + canonical XML', async () => {
    const paras = await roundTrip('paraRPrChange');
    expect(paras).toHaveLength(1);
    expect(paras[0]!.paraRPrChange).toHaveLength(1);
    expect(paras[0]!.paraRPrChange![0]!.info).toMatchObject({ id: 204, author: 'Dan' });
    expect(paras[0]!.paraRPrChange![0]!.previousFormatting).toMatchObject({ bold: true });
  });

  test('sectPrChange fixture: both placements + canonical XML', async () => {
    const paras = await roundTrip('sectPrChange');
    expect(paras).toHaveLength(2);
    expect(paras[0]!.sectionProperties?.sectPrChange?.info).toMatchObject({
      id: 205,
      author: 'Erin',
    });
    expect(paras[0]!.sectionProperties?.sectPrChange?.previousSectionProperties).toMatchObject({
      pageWidth: 16840,
    });
  });

  test('sectPrChange fixture: body-level final placement survives', async () => {
    const source = TRACKED_STRUCTURAL_FIXTURES.sectPrChange;
    const doc = await parseDocx(await buildFixtureDocx(source));
    expect(doc.package.document.finalSectionProperties?.orientation).toBe('landscape');
    expect(doc.package.document.finalSectionProperties?.sectPrChange?.info).toMatchObject({
      id: 206,
      author: 'Frank',
    });
  });

  test('double round-trip is stable (parse → serialize → parse)', async () => {
    for (const name of Object.keys(TRACKED_STRUCTURAL_FIXTURES) as TrackedStructuralFixtureName[]) {
      const source = TRACKED_STRUCTURAL_FIXTURES[name];
      const once = await parseDocx(await buildFixtureDocx(source));
      const twice = await parseDocx(await buildFixtureDocx(serializeDocument(once)));
      // Revision ids must survive two full passes with no drift.
      assertOoxmlEquivalent(serializeDocument(twice), source);
    }
  });
});
