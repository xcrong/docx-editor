/**
 * Tracked structural changes — Phase 1 closeout (issue #80).
 *
 * Covers the T27-04 test slice the earlier slices left open: cross-page
 * split paragraphs, table-cell paragraph revisions through save → reload,
 * undo/redo of a tracked split, and multi-author revision grouping.
 *
 * Lives in its own file (not in tracked-changes-structural.spec.ts) because
 * that suite is at its eslint max-lines ceiling.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function getParaRevision(page: import('@playwright/test').Page, index: number) {
  return page.evaluate((i) => window.__DOCX_EDITOR_E2E__?.getParagraphRevisionAt(i) ?? null, index);
}

async function acceptById(page: import('@playwright/test').Page, id: number) {
  return page.evaluate((rid) => window.__DOCX_EDITOR_E2E__?.acceptChangeById(rid) ?? false, id);
}

/** Insert N plain paragraphs in one transaction (fast multi-page filler). */
async function insertFillerParagraphs(
  page: import('@playwright/test').Page,
  count: number
): Promise<void> {
  await page.evaluate((n) => {
    const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
      state: { schema: any; tr: any };
      dispatch: (tr: any) => void;
    };
    const s = view.state.schema;
    const paras = [];
    for (let i = 0; i < n; i += 1) {
      paras.push(s.nodes.paragraph.create(null, s.text(`filler paragraph ${i} lorem ipsum dolor`)));
    }
    view.dispatch(view.state.tr.insert(0, paras));
  }, count);
}

test.describe('T27-04 tracked structural closeout (issue #80)', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('cross-page split paragraph keeps the pPrIns marker painted; accept clears', async ({
    page,
  }) => {
    await insertFillerParagraphs(page, 80);
    await page.waitForTimeout(300);
    const pages = await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.getTotalPages?.() ?? 0);
    expect(pages, 'filler must span multiple pages').toBeGreaterThanOrEqual(2);

    // Split a middle paragraph in suggesting mode.
    await editor.selectRange(40, 0, 6);
    await page.keyboard.press('ArrowRight');
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.pressEnter();
    await page.waitForTimeout(150);

    const rev = await getParaRevision(page, 40);
    expect(rev?.pPrIns, 'cross-page split must author pPrIns').not.toBeNull();
    expect(rev?.pPrIns?.author).toBe('Jane');
    const revId = rev?.pPrIns?.revisionId as number;

    // The marker paints with the revision triple on some page.
    const pilcrow = page.locator(`.layout-paragraph[data-revision-id="${revId}"]`).first();
    await expect(pilcrow).toBeVisible();

    expect(await acceptById(page, revId)).toBe(true);
    expect((await getParaRevision(page, 40))?.pPrIns).toBeNull();
  });

  test('table-cell paragraph revision survives save → reload without crashing', async ({
    page,
  }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.plantSimpleTable?.());
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.focusFirstTableCell?.());
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.typeText('cell one');
    await editor.pressEnter();
    await editor.typeText('cell two');
    await page.waitForTimeout(200);

    // A tracked split exists inside the table cell.
    expect(await page.locator('.layout-table [data-revision-id]').count()).toBeGreaterThan(0);

    // Save and confirm the paragraph-mark revision reaches the ZIP.
    const downloadPromise = page.waitForEvent('download');
    await page.locator('text=Save').click();
    const downloadPath = await (await downloadPromise).path();
    expect(downloadPath).toBeTruthy();
    const zip = await JSZip.loadAsync(fs.readFileSync(downloadPath!));
    const docXml = await zip.file('word/document.xml')!.async('text');
    expect(docXml).toMatch(/<w:pPr><w:rPr><w:ins w:id="\d+"/);

    // Reload the saved file — markers come back, no crash.
    const tempPath = path.join(__dirname, '..', 'fixtures', '_temp-structural-closeout.docx');
    fs.writeFileSync(tempPath, fs.readFileSync(downloadPath!));
    try {
      await editor.loadDocxFile(tempPath);
      await expect(page.locator('.layout-table [data-revision-id]').first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });

  test('undo then redo restores the tracked split', async ({ page }) => {
    await editor.typeText('abcdef');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.pressEnter();
    await page.waitForTimeout(150);

    const before = await getParaRevision(page, 0);
    expect(before?.pPrIns, 'tracked Enter must author pPrIns').not.toBeNull();

    // Undo removes the split (and the marker with it).
    await editor.undo();
    await page.waitForTimeout(150);
    expect((await getParaRevision(page, 0))?.pPrIns).toBeNull();
    expect(await getParaRevision(page, 1)).toBeNull();

    // Redo restores the split AND the marker.
    await editor.redo();
    await page.waitForTimeout(150);
    const redone = await getParaRevision(page, 0);
    expect(redone?.pPrIns, 'redo must restore pPrIns').not.toBeNull();
    expect(redone?.pPrIns?.author).toBe('Jane');
    expect(await getParaRevision(page, 1)).not.toBeNull();
  });

  test('multi-author edits produce distinct revision ids and sidebar cards', async ({ page }) => {
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.typeText('jane text');
    await editor.pressEnter();
    await expect(async () => {
      expect((await getParaRevision(page, 0))?.pPrIns).not.toBeNull();
    }).toPass({ timeout: 10000 });

    expect(await setSuggestionMode(page, true, 'John')).toBe(true);
    await editor.typeText('john text');
    await page.waitForTimeout(150);

    // The painter stamps `data-revision-author` on paragraph fragments and
    // glyphs but NOT on inline runs (runs carry only `data-revision-id`),
    // so author grouping is asserted against PM state — the sidebar's
    // triple source of truth — not the painted DOM.
    const triples = await page.evaluate(() => {
      const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
        state: { doc: any };
      };
      const seen = new Map<string, { id: number; author: string }>();
      view.state.doc.descendants((node: any) => {
        const ins = node.attrs?.pPrIns as { revisionId: number; author: string } | null;
        if (node.type.name === 'paragraph' && ins) {
          seen.set(`${ins.revisionId}|${ins.author}`, { id: ins.revisionId, author: ins.author });
        }
        if (node.isText) {
          for (const m of node.marks as Array<{ type: { name: string }; attrs: any }>) {
            if (m.type.name === 'insertion') {
              seen.set(`${m.attrs.revisionId}|${m.attrs.author}`, {
                id: m.attrs.revisionId,
                author: m.attrs.author,
              });
            }
          }
        }
      });
      return [...seen.values()];
    });
    const authors = [...new Set(triples.map((t) => t.author))].sort();
    expect(authors).toContain('Jane');
    expect(authors).toContain('John');
    // Distinct numeric ids per author session — one card per triple.
    expect(new Set(triples.map((t) => t.id)).size).toBeGreaterThanOrEqual(2);

    const toggle = page.locator('[aria-label="Toggle comments sidebar"]');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
      await toggle.click();
      await page.waitForTimeout(200);
    }
    // At least two cards — one per author's revision group.
    await expect(page.locator('.docx-tracked-change-card').first()).toBeVisible();
    expect(await page.locator('.docx-tracked-change-card').count()).toBeGreaterThanOrEqual(2);
  });
});
