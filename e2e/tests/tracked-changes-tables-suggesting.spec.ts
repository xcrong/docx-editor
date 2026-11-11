/**
 * T27-05 (issue #81): suggesting-aware table commands, narrow slice.
 *
 * - `addColumnRight` in suggesting mode tags new cells `cellMarker: ins`.
 * - Horizontal `mergeCells` in suggesting mode tags left `ins` / right
 *   `del` without collapsing; closed mode still collapses (regression).
 * - `setCellFillColor` in suggesting mode mints `tcPrChange` and the saver
 *   writes `<w:tcPrChange>`.
 * - `deleteRow` in suggesting mode survives save → reload as a tracked
 *   deletion (the row is still present, not gone).
 * - Closed-mode `addColumnRight` leaves cells unmarked (regression).
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

type TableSnapshot = {
  rowCount: number;
  colCount: number;
  rows: Array<Record<string, unknown>>;
  cells: Array<Array<unknown>>;
  tblPrChange: unknown;
  tblGridChange: unknown;
};

type CellMarker = { kind: string; info: { revisionId: number; author: string } } | null;

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

async function tableSnapshot(page: import('@playwright/test').Page): Promise<TableSnapshot | null> {
  return page.evaluate(() => window.__DOCX_EDITOR_E2E__?.getFirstTableSnapshot?.() ?? null);
}

async function saveDocumentXml(page: import('@playwright/test').Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('text=Save').click();
  const downloadPath = await (await downloadPromise).path();
  const zip = await JSZip.loadAsync(fs.readFileSync(downloadPath!));
  return zip.file('word/document.xml')!.async('text');
}

test.describe('T27-05 suggesting-aware table commands', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('addColumnRight in suggesting mode tags new cells ins under one triple', async ({
    page,
  }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addColumnRight?.())).toBe(true);
    await page.waitForTimeout(100);

    const snap = await tableSnapshot(page);
    expect(snap?.colCount).toBe(2);
    const markers = (snap?.cells[0] ?? []) as CellMarker[];
    expect(markers[1]?.kind).toBe('ins');
    expect(markers[1]?.info.author).toBe('Jane');
    void markers;
  });

  test('mergeCells horizontal in suggesting mode tags ins/del without collapsing', async ({
    page,
  }) => {
    // 1x2 table: plant 1x1, add the second column with suggesting OFF.
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addColumnRight?.())).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.mergeFirstRowCells?.())).toBe(
      true
    );
    await page.waitForTimeout(100);

    const snap = await tableSnapshot(page);
    expect(snap?.colCount).toBe(2);
    const markers = (snap?.cells[0] ?? []) as CellMarker[];
    expect(markers[0]?.kind).toBe('ins');
    expect(markers[1]?.kind).toBe('del');
    expect(markers[0]?.info.revisionId).toBe(markers[1]?.info.revisionId);
  });

  test('closed-mode mergeCells still collapses (regression)', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addColumnRight?.())).toBe(true);
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.mergeFirstRowCells?.())).toBe(
      true
    );
    await page.waitForTimeout(100);

    const snap = await tableSnapshot(page);
    expect(snap?.colCount).toBe(1);
    expect((snap?.cells[0] ?? [])[0]).toBeNull();
  });

  test('closed-mode addColumnRight leaves cells unmarked (regression)', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addColumnRight?.())).toBe(true);
    await page.waitForTimeout(100);

    const snap = await tableSnapshot(page);
    expect(snap?.colCount).toBe(2);
    expect((snap?.cells[0] ?? [])[1]).toBeNull();
  });

  test('setCellFillColor in suggesting mode writes w:tcPrChange on save', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await setSuggestionMode(page, true)).toBe(true);
    expect(
      await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.setFirstCellFillColor?.('FFEB3B'))
    ).toBe(true);
    await page.waitForTimeout(100);

    const docXml = await saveDocumentXml(page);
    expect(docXml).toMatch(/<w:tcPrChange w:id="\d+" w:author="Jane"/);
  });

  test('deleteRow in suggesting mode survives save → reload as a tracked deletion', async ({
    page,
  }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    // Second row added with suggesting OFF so only the deletion is tracked.
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.addRowBelow?.())).toBe(true);
    expect(await setSuggestionMode(page, true)).toBe(true);
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.deleteCurrentRow?.())).toBe(true);
    await page.waitForTimeout(100);

    // The row stays (tracked, not removed).
    let snap = await tableSnapshot(page);
    expect(snap?.rowCount).toBe(2);
    expect(snap?.rows[0]?.trDel).not.toBeNull();

    // The saver writes the row deletion marker.
    const downloadPromise = page.waitForEvent('download');
    await page.locator('text=Save').click();
    const downloadPath = await (await downloadPromise).path();
    const zip = await JSZip.loadAsync(fs.readFileSync(downloadPath!));
    const docXml = await zip.file('word/document.xml')!.async('text');
    expect(docXml).toMatch(/<w:trPr><w:del w:id="\d+" w:author="Jane"/);

    // Reload: the row is STILL there, still marked deleted — not gone.
    const tempPath = path.join(__dirname, '..', 'fixtures', '_temp-t27-05-table-rev.docx');
    fs.writeFileSync(tempPath, fs.readFileSync(downloadPath!));
    try {
      await editor.loadDocxFile(tempPath);
      await page.waitForTimeout(300);
      snap = await tableSnapshot(page);
      expect(snap?.rowCount).toBe(2);
      expect(snap?.rows[0]?.trDel).not.toBeNull();
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });
});
