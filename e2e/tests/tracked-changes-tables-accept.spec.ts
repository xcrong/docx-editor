/**
 * T27-06 (issue #82): accept/reject for TABLE revisions, end to end.
 *
 * Covers the issue's 8 test items: row insertion, row deletion,
 * cell merge, cross-page split rows, nested tables, undo/redo,
 * multi-author, and save → reload round-trip.
 *
 * Lives in its own file: tracked-changes-structural.spec.ts is at its
 * eslint max-lines ceiling.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Snapshot = {
  rowCount: number;
  colCount: number;
  rows: Array<Record<string, unknown>>;
  cells: Array<Array<unknown>>;
  cellPropChanges: Array<Array<unknown>>;
  tblPrChange: unknown;
  tblGridChange: unknown;
} | null;

async function setSuggestionMode(
  page: import('@playwright/test').Page,
  active: boolean,
  author = 'Jane'
) {
  const ok = await page.evaluate(
    ({ a, u }) => window.__DOCX_EDITOR_E2E__?.setSuggestionMode(a, u) ?? false,
    { a: active, u: author }
  );
  await page.locator('.ProseMirror').first().focus();
  return ok;
}

async function tableSnapshot(page: import('@playwright/test').Page): Promise<Snapshot> {
  return page.evaluate(() => window.__DOCX_EDITOR_E2E__?.getFirstTableSnapshot?.() ?? null);
}

async function acceptById(page: import('@playwright/test').Page, id: number) {
  return page.evaluate((rid) => window.__DOCX_EDITOR_E2E__?.acceptChangeById(rid) ?? false, id);
}

async function rejectById(page: import('@playwright/test').Page, id: number) {
  return page.evaluate((rid) => window.__DOCX_EDITOR_E2E__?.rejectChangeById(rid) ?? false, id);
}

/** Focus the first cell of the Nth row (0-based) of the first table. */
async function focusNthRowFirstCell(
  page: import('@playwright/test').Page,
  rowIndex: number
): Promise<boolean> {
  return page.evaluate((n) => {
    const view = (window.__DOCX_EDITOR_E2E__ as unknown as { getView: () => any })?.getView?.();
    if (!view) return false;
    let seen = -1;
    let target: number | null = null;
    view.state.doc.descendants((node: any, pos: number) => {
      if (target != null) return false;
      if (node.type.name === 'tableRow') {
        seen += 1;
        if (seen === n) {
          target = pos + 2;
          return false;
        }
        return false;
      }
      return true;
    });
    if (target == null) return false;
    const SelectionCtor = view.state.selection.constructor as unknown as {
      near: ($pos: unknown) => unknown;
    };
    const tr = view.state.tr.setSelection(
      SelectionCtor.near(view.state.doc.resolve(target)) as typeof view.state.selection
    );
    view.dispatch(tr);
    view.focus();
    return true;
  }, rowIndex);
}

function revId(marker: unknown): number {
  return (marker as { revisionId: number }).revisionId;
}

/** Save once via the toolbar; returns the downloaded file path + document.xml. */
async function saveDocxFile(
  page: import('@playwright/test').Page
): Promise<{ filePath: string; xml: string }> {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('text=Save').click();
  const downloadPath = await (await downloadPromise).path();
  const zip = await JSZip.loadAsync(fs.readFileSync(downloadPath!));
  const xml = await zip.file('word/document.xml')!.async('text');
  return { filePath: downloadPath!, xml };
}

test.describe('T27-06 table accept/reject (issue #82)', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('row insertion: accept keeps the row, reject removes it', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    await page.waitForTimeout(150);

    let snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(2);
    expect(snap?.rows[1]?.trIns).not.toBeNull();
    const id = revId(snap?.rows[1]?.trIns);

    // The inserted row paints with its revision id.
    await expect(page.locator(`.layout-table-row[data-revision-id="${id}"]`).first()).toBeVisible();

    expect(await acceptById(page, id)).toBe(true);
    snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(2);
    expect(snap?.rows[1]?.trIns).toBeNull();
    expect(await page.locator(`.layout-table-row[data-revision-id="${id}"]`).count()).toBe(0);

    // Reject path: a fresh tracked insertion rolls back into removal.
    // Re-focus the last row so the new row lands at a known index.
    snap = await tableSnapshot(page);
    await focusNthRowFirstCell(page, (snap?.rowCount ?? 1) - 1);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    await page.waitForTimeout(150);
    snap = await tableSnapshot(page);
    const markedRow = (snap?.rows ?? []).find((r) => r.trIns != null);
    const id2 = revId(markedRow?.trIns);
    expect(await rejectById(page, id2)).toBe(true);
    expect((await tableSnapshot(page))?.rowCount).toBe(2);
  });

  test('row deletion: accept removes the row, reject keeps it; last row removes the table', async ({
    page,
  }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.());
    await focusNthRowFirstCell(page, 0);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.deleteCurrentRow?.())).toBe(true);
    await page.waitForTimeout(150);

    let snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(2);
    expect(snap?.rows[0]?.trDel).not.toBeNull();
    const firstId = revId(snap?.rows[0]?.trDel);

    // Reject keeps the row and clears the marker.
    expect(await rejectById(page, firstId)).toBe(true);
    snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(2);
    expect(snap?.rows[0]?.trDel).toBeNull();

    // Accept removes the row.
    await focusNthRowFirstCell(page, 0);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.deleteCurrentRow?.())).toBe(true);
    await page.waitForTimeout(150);
    snap = await tableSnapshot(page);
    const acceptId = revId(snap?.rows[0]?.trDel);
    expect(await acceptById(page, acceptId)).toBe(true);
    expect((await tableSnapshot(page))?.rowCount).toBe(1);

    // Deleting the only remaining row removes the whole table node
    // (stamped directly — `deleteCurrentRow` refuses single-row tables).
    expect(
      await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantTableRowDeletion?.(901) ?? false)
    ).toBe(true);
    await page.waitForTimeout(150);
    snap = await tableSnapshot(page);
    const lastId = revId(snap?.rows[0]?.trDel);
    expect(lastId).toBe(901);
    expect(await acceptById(page, lastId)).toBe(true);
    await page.waitForTimeout(200);
    expect(await tableSnapshot(page)).toBeNull();
  });

  test('horizontal cell merge: accept collapses, reject keeps both cells', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addColumnRight?.())).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.mergeFirstRowCells?.())).toBe(
      true
    );
    await page.waitForTimeout(150);

    let snap = await tableSnapshot(page);
    expect(snap?.colCount).toBe(2);
    const markers = (snap?.cells[0] ?? []) as Array<{
      kind: string;
      info: { revisionId: number };
    } | null>;
    expect(markers[0]?.kind).toBe('ins');
    expect(markers[1]?.kind).toBe('del');
    const id = markers[0]!.info.revisionId;

    expect(await acceptById(page, id)).toBe(true);
    snap = await tableSnapshot(page);
    expect(snap?.colCount).toBe(1);
    expect((snap?.cells[0] ?? [])[0]).toBeNull();

    // Reject path on a fresh merge keeps both cells and clears markers.
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addColumnRight?.())).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.mergeFirstRowCells?.())).toBe(
      true
    );
    await page.waitForTimeout(150);
    snap = await tableSnapshot(page);
    const markers2 = (snap?.cells[0] ?? []) as Array<{
      kind: string;
      info: { revisionId: number };
    } | null>;
    const id2 = markers2[0]!.info.revisionId;
    expect(await rejectById(page, id2)).toBe(true);
    snap = await tableSnapshot(page);
    expect(snap?.colCount).toBe(2);
    expect((snap?.cells[0] ?? [])[0]).toBeNull();
    expect((snap?.cells[0] ?? [])[1]).toBeNull();
  });

  test('vertical cell merge: markers paint dashed; accept spans, reject clears', async ({
    page,
  }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.mergeFirstColumnCells?.())).toBe(
      true
    );
    await page.waitForTimeout(150);

    let snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(2);
    const top = (snap?.cells[0] ?? [])[0] as { kind: string; info: { revisionId: number } } | null;
    const bottom = (snap?.cells[1] ?? [])[0] as {
      kind: string;
      info: { revisionId: number };
    } | null;
    expect(top?.kind).toBe('merge');
    expect(bottom?.kind).toBe('merge');
    const id = top!.info.revisionId;
    // Both cells paint with the revision id (dashed merge boundary via CSS).
    expect(await page.locator(`.layout-table-cell[data-revision-id="${id}"]`).count()).toBe(2);

    expect(await rejectById(page, id)).toBe(true);
    snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(2);
    expect((snap?.cells[0] ?? [])[0]).toBeNull();
    expect((snap?.cells[1] ?? [])[0]).toBeNull();
  });

  test('cross-page split table: accept of a deletion repaints without residue', async ({
    page,
  }) => {
    // Filler pushes the table across a page break.
    await page.evaluate((n) => {
      const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
        state: { schema: any; tr: any };
        dispatch: (tr: any) => void;
      };
      const s = view.state.schema;
      const paras = [];
      for (let i = 0; i < n; i += 1) {
        paras.push(
          s.nodes.paragraph.create(null, s.text(`filler paragraph ${i} lorem ipsum dolor`))
        );
      }
      view.dispatch(view.state.tr.insert(0, paras));
    }, 40);
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    for (let i = 0; i < 25; i += 1) {
      expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    }
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.getTotalPages?.() ?? 0)
    ).toBeGreaterThanOrEqual(2);

    // Mark a middle row (likely on a split fragment) as deleted.
    expect(await focusNthRowFirstCell(page, 12)).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.deleteCurrentRow?.())).toBe(true);
    await page.waitForTimeout(200);
    const snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(26);
    const id = revId(snap?.rows[12]?.trDel);
    // The marked row paints on exactly the fragments that own it.
    expect(
      await page.locator(`.layout-table-row[data-revision-id="${id}"]`).count()
    ).toBeGreaterThan(0);

    const cutBordersBefore = await page.locator('.layout-table-cut-border').count();
    expect(await acceptById(page, id)).toBe(true);
    await page.waitForTimeout(300);
    expect((await tableSnapshot(page))?.rowCount).toBe(25);
    // No residual marker paint and no extra cut borders after re-layout.
    expect(await page.locator(`.layout-table-row[data-revision-id="${id}"]`).count()).toBe(0);
    expect(await page.locator('.layout-table-cut-border').count()).toBeLessThanOrEqual(
      cutBordersBefore + 1
    );
    await expect(page.locator('.layout-table').first()).toBeVisible();
  });

  test('nested table with tracked revisions resolves without crashing', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    // A 2x2 table nested inside the outer cell.
    expect(
      await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.insertTable?.(2, 2) ?? false)
    ).toBe(true);
    await page.waitForTimeout(200);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(
      await page.evaluate(
        () => window.__DOCX_EDITOR_E2E__?.setFirstCellFillColor?.('FFEB3B') ?? false
      )
    ).toBe(true);
    await page.waitForTimeout(150);

    // acceptAll walks nested markers; the doc stays valid and painted.
    const resolved = await page.evaluate(
      () => window.__DOCX_EDITOR_E2E__?.acceptAllChanges?.() ?? 0
    );
    expect(resolved).toBeGreaterThan(0);
    await page.waitForTimeout(200);
    expect((await tableSnapshot(page))?.rowCount).toBeGreaterThan(0);
    await expect(page.locator('.layout-table').first()).toBeVisible();
  });

  test('one undo rolls back a table accept', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.deleteCurrentRow?.())).toBe(true);
    await page.waitForTimeout(150);
    const snap = await tableSnapshot(page);
    const id = revId(snap?.rows[0]?.trDel);
    // Let the accept land in its own history group (prosemirror-history
    // merges sub-500ms transactions) so one undo pops exactly the accept.
    await page.waitForTimeout(650);
    expect(await acceptById(page, id)).toBe(true);
    expect((await tableSnapshot(page))?.rowCount).toBe(1);

    // A single undo restores the marked row (accept was one transaction).
    await editor.undo();
    await page.waitForTimeout(200);
    const afterUndo = await tableSnapshot(page);
    expect(afterUndo?.rowCount).toBe(2);
    expect((afterUndo?.rows[0] as Record<string, unknown> | null)?.trDel).not.toBeNull();

    await editor.redo();
    await page.waitForTimeout(200);
    expect((await tableSnapshot(page))?.rowCount).toBe(1);
  });

  test('multi-author table revisions produce one card per author', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);

    expect(await focusNthRowFirstCell(page, 0)).toBe(true);
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.deleteCurrentRow?.())).toBe(true);
    await page.waitForTimeout(150);

    expect(await focusNthRowFirstCell(page, 1)).toBe(true);
    expect(await setSuggestionMode(page, true, 'John')).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    await page.waitForTimeout(150);

    const snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(3);
    const authors = new Set(
      (snap?.rows ?? [])
        .map((r) => ((r.trDel ?? r.trIns) as { author?: string } | null)?.author)
        .filter(Boolean)
    );
    expect(authors.has('Jane')).toBe(true);
    expect(authors.has('John')).toBe(true);

    const toggle = page.locator('[aria-label="Toggle comments sidebar"]');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
      await toggle.click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('.docx-tracked-change-card').first()).toBeVisible();
    expect(await page.locator('.docx-tracked-change-card').count()).toBeGreaterThanOrEqual(2);
  });

  test('round-trip: row deletion markers survive save and reload', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    expect(await focusNthRowFirstCell(page, 0)).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.deleteCurrentRow?.())).toBe(true);
    await page.waitForTimeout(150);

    const { filePath, xml: docXml } = await saveDocxFile(page);
    expect(docXml).toMatch(/<w:trPr>[\s\S]{0,300}?<w:del w:id="\d+"/);

    const tempPath = path.join(__dirname, '..', 'fixtures', '_temp-t27-06-rowdel.docx');
    fs.writeFileSync(tempPath, fs.readFileSync(filePath));
    try {
      await editor.loadDocxFile(tempPath);
      await page.waitForTimeout(300);
      const snap = await tableSnapshot(page);
      expect(snap?.rowCount).toBe(2);
      expect(snap?.rows[0]?.trDel).not.toBeNull();
      await expect(page.locator('.layout-table [data-revision-id]').first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });

  test('round-trip: merge + property markers survive save and reload', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addColumnRight?.())).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.mergeFirstRowCells?.())).toBe(
      true
    );
    expect(
      await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.setFirstCellFillColor?.('FFEB3B'))
    ).toBe(true);
    await page.waitForTimeout(150);

    const { filePath, xml: docXml } = await saveDocxFile(page);
    expect(docXml).toMatch(/<w:cellIns w:id="\d+"/);
    expect(docXml).toMatch(/<w:cellDel w:id="\d+"/);
    expect(docXml).toMatch(/<w:tcPrChange w:id="\d+"/);

    const tempPath = path.join(__dirname, '..', 'fixtures', '_temp-t27-06-merge.docx');
    fs.writeFileSync(tempPath, fs.readFileSync(filePath));
    try {
      await editor.loadDocxFile(tempPath);
      await page.waitForTimeout(300);
      const snap = await tableSnapshot(page);
      const markers = (snap?.cells[0] ?? []) as Array<{ kind: string } | null>;
      expect(markers[0]?.kind).toBe('ins');
      expect(markers[1]?.kind).toBe('del');
      // The fill landed on the absorbed (`del`) cell.
      expect((snap?.cellPropChanges[0] ?? [])[1]).not.toBeNull();
      await expect(page.locator('.layout-table [data-revision-id]').first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });

  test('round-trip: vertical merge markers survive save and reload', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.mergeFirstColumnCells?.())).toBe(
      true
    );
    await page.waitForTimeout(150);

    const { filePath, xml: docXml } = await saveDocxFile(page);
    expect(docXml).toMatch(/<w:cellMerge[^>]*w:vMerge="rest"/);
    expect(docXml).toMatch(/<w:cellMerge[^>]*w:vMerge="cont"/);

    const tempPath = path.join(__dirname, '..', 'fixtures', '_temp-t27-06-vmerge.docx');
    fs.writeFileSync(tempPath, fs.readFileSync(filePath));
    try {
      await editor.loadDocxFile(tempPath);
      await page.waitForTimeout(300);
      const snap = await tableSnapshot(page);
      expect((snap?.cells[0] ?? [])[0]).toMatchObject({ kind: 'merge' });
      expect((snap?.cells[1] ?? [])[0]).toMatchObject({ kind: 'merge' });
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });
});
