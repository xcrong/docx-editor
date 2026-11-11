import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import { parseDocx } from '../parser';
import { serializeDocument } from '../serializer/documentSerializer';
import type { Paragraph, Run } from '../../types/document';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { fromProseDoc } from '../../prosemirror/conversion/fromProseDoc';
import { assertOoxmlEquivalent } from './assertOoxmlEquivalent';
import { TRACKED_STRUCTURAL_FIXTURES, buildFixtureDocx } from './fixtures/tracked-structural/index';

// T27-07 (issue #83): run-level property revisions (`w:rPrChange` ↔ inline
// `revision_change` mark) — parse fidelity, last-wins stacking, Phase 1/3
// mutual exclusion, and PM↔model conversion in both directions.

function runsOf(doc: Awaited<ReturnType<typeof parseDocx>>): Run[] {
  const paras = doc.package.document.content.filter((b): b is Paragraph => b.type === 'paragraph');
  const runs: Run[] = [];
  for (const p of paras) {
    for (const c of p.content) {
      if (c.type === 'run') runs.push(c);
      else if (c.type === 'hyperlink') {
        for (const r of c.children) {
          if (r.type === 'run') runs.push(r);
        }
      }
    }
  }
  return runs;
}

function revisionMarks(pmDoc: ReturnType<typeof toProseDoc>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  pmDoc.descendants((node) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name === 'revision_change') {
        out.push({
          text: node.text,
          revisionId: mark.attrs.revisionId,
          author: mark.attrs.author,
          date: mark.attrs.date,
          prior: mark.attrs.prior,
        });
      }
    }
  });
  return out;
}

describe('T27-07: run property revision fixtures', () => {
  test('rPrChange fixture: full prior snapshot (size, color)', async () => {
    const doc = await parseDocx(
      await buildFixtureDocx(TRACKED_STRUCTURAL_FIXTURES.runPropertyChanges)
    );
    const runs = runsOf(doc);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.formatting).toMatchObject({ bold: true, fontSize: 28 });
    expect(runs[0]!.propertyChanges).toHaveLength(1);
    expect(runs[0]!.propertyChanges![0]!.info).toMatchObject({ id: 401, author: 'Grace' });
    expect(runs[0]!.propertyChanges![0]!.previousFormatting).toMatchObject({
      fontSize: 24,
      color: { rgb: '000000' },
    });
    expect(runs[1]!.propertyChanges).toBeUndefined();
    // Round-trip is canonically equivalent (single entry in, single entry out).
    assertOoxmlEquivalent(serializeDocument(doc), TRACKED_STRUCTURAL_FIXTURES.runPropertyChanges);
  });

  test('stacked rPrChange: every session survives in OOXML order', async () => {
    const doc = await parseDocx(
      await buildFixtureDocx(TRACKED_STRUCTURAL_FIXTURES.runPropertyChangesStacked)
    );
    const runs = runsOf(doc);
    expect(runs[0]!.propertyChanges).toHaveLength(2);
    // Conversion keeps the full stack: the LAST entry is the latest session,
    // earlier entries ride `priorStack` oldest-first.
    const pmDoc = toProseDoc(doc);
    const marks = revisionMarks(pmDoc);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ text: 'stacked', revisionId: 403, author: 'Heidi' });
    expect(marks[0]!.prior).toMatchObject({ underline: { style: 'single' } });
    // Unedited paragraphs restore verbatim via `_originalRunBoundaries` —
    // both entries survive with canonical equivalence to the source.
    const once = fromProseDoc(pmDoc);
    const onceRuns = runsOf(once as Awaited<ReturnType<typeof parseDocx>>);
    expect(onceRuns[0]!.propertyChanges).toHaveLength(2);
    expect(onceRuns[0]!.propertyChanges!.map((c) => c.info.id)).toEqual([402, 403]);
    assertOoxmlEquivalent(
      serializeDocument(once),
      TRACKED_STRUCTURAL_FIXTURES.runPropertyChangesStacked
    );
    // An edited paragraph (marks changed, boundaries invalidated) falls back
    // to the mark — the full stack is still emitted, oldest-first.
    const state = EditorState.create({ doc: pmDoc });
    let textPos = -1;
    state.doc.descendants((node, pos) => {
      if (textPos < 0 && node.isText) textPos = pos;
    });
    expect(textPos).toBeGreaterThanOrEqual(0);
    // Adding italic splits the text; every fragment keeps the whole stack.
    const tr = state.tr.addMark(textPos, textPos + 1, state.schema.marks.italic.create());
    const back = fromProseDoc(state.apply(tr).doc);
    const backRuns = runsOf(back as Awaited<ReturnType<typeof parseDocx>>);
    expect(backRuns.length).toBeGreaterThanOrEqual(1);
    for (const run of backRuns) {
      expect(run.propertyChanges!.map((c) => c.info.id)).toEqual([402, 403]);
    }
    const xml = serializeDocument(back);
    expect(xml).toContain('<w:rPrChange w:id="402"');
    expect(xml).toContain('<w:rPrChange w:id="403"');
    // Double round-trip is stable.
    const twice = await parseDocx(await buildFixtureDocx(xml));
    assertOoxmlEquivalent(serializeDocument(twice), xml);
  });

  test('pilcrow rPrChange and run rPrChange do not cross-contaminate', async () => {
    const source = TRACKED_STRUCTURAL_FIXTURES.runPropertyChangesWithPilcrow;
    const doc = await parseDocx(await buildFixtureDocx(source));
    const paras = doc.package.document.content.filter(
      (b): b is Paragraph => b.type === 'paragraph'
    );
    expect(paras).toHaveLength(1);
    // Paragraph-mark path (Phase 1) keeps its own attr …
    expect(paras[0]!.paraRPrChange).toHaveLength(1);
    expect(paras[0]!.paraRPrChange![0]!.info).toMatchObject({ id: 404, author: 'Dan' });
    // … and the run path (Phase 3) keeps its own model field.
    const runs = runsOf(doc);
    expect(runs[0]!.propertyChanges).toHaveLength(1);
    expect(runs[0]!.propertyChanges![0]!.info).toMatchObject({ id: 405, author: 'Grace' });
    // PM side: attr vs inline mark, never mixed.
    const pmDoc = toProseDoc(doc);
    let paraRPrChange: unknown = null;
    pmDoc.descendants((node) => {
      if (node.type.name === 'paragraph') paraRPrChange = node.attrs.paraRPrChange;
    });
    expect(paraRPrChange).toHaveLength(1);
    const marks = revisionMarks(pmDoc);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ revisionId: 405, author: 'Grace' });
    // Serialization writes each change to its own schema position:
    // pilcrow change inside `w:pPr/w:rPr`, run change inside `w:r/w:rPr`.
    const xml = serializeDocument(fromProseDoc(pmDoc));
    const pPrIdx = xml.indexOf('<w:pPr>');
    const firstRPrChange = xml.indexOf('<w:rPrChange w:id="404"');
    const runIdx = xml.indexOf('<w:t>italic</w:t>');
    const secondRPrChange = xml.indexOf('<w:rPrChange w:id="405"');
    expect(firstRPrChange).toBeGreaterThan(pPrIdx);
    expect(firstRPrChange).toBeLessThan(runIdx);
    expect(secondRPrChange).toBeGreaterThan(runIdx - 400);
    // Model-path round-trip (no PM normalization) is canonically equivalent.
    // (The PM path legitimately materializes `w:iCs` alongside `w:i` via
    // `marksToTextFormatting`, so full equivalence is asserted off-PM here.)
    assertOoxmlEquivalent(serializeDocument(doc), source);
  });

  test('w:rPrChange emits as the last child of w:rPr (EG_RPrContent ordering)', async () => {
    const doc = await parseDocx(
      await buildFixtureDocx(TRACKED_STRUCTURAL_FIXTURES.runPropertyChanges)
    );
    const xml = serializeDocument(fromProseDoc(toProseDoc(doc)));
    const changeIdx = xml.indexOf('<w:rPrChange w:id="401"');
    expect(changeIdx).toBeGreaterThan(-1);
    expect(xml).toMatch(/<w:rPrChange w:id="401"[^>]*>.*?<\/w:rPrChange><\/w:rPr>/s);
  });

  test('conversion unit: Document → PM mark → Document preserves array shape', async () => {
    const doc = await parseDocx(
      await buildFixtureDocx(TRACKED_STRUCTURAL_FIXTURES.runPropertyChanges)
    );
    const pmDoc = toProseDoc(doc);
    const back = fromProseDoc(pmDoc);
    const runs = runsOf(back as Awaited<ReturnType<typeof parseDocx>>);
    expect(runs[0]!.propertyChanges).toHaveLength(1);
    const entry = runs[0]!.propertyChanges![0]!;
    expect(entry.info).toMatchObject({ id: 401, author: 'Grace' });
    expect(entry.previousFormatting).toMatchObject({ fontSize: 24 });
    // Current formatting is captured alongside the prior for the sidebar.
    expect(entry.currentFormatting).toMatchObject({ bold: true, fontSize: 28 });
  });
});
