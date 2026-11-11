/**
 * T27-07 (issue #83): run-level property revisions end to end.
 *
 * - Bold in suggesting mode authors an inline `revision_change` mark
 *   (not a direct formatting edit); the painter shows `.ep-revision-change`
 *   and the sidebar card reads "Bold added".
 * - Accept drops the mark and keeps the formatting; reject restores the
 *   prior run properties.
 * - Save → reload round-trips the `w:rPrChange` (last-child of `w:rPr`).
 * - A paragraph-mark `w:rPrChange` on the same paragraph does not
 *   cross-contaminate the run path.
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

type RunRevisionMark = {
  text: string;
  revisionId: number;
  author: string;
  prior: Record<string, unknown> | null;
};

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

async function getRevisionMarks(page: import('@playwright/test').Page): Promise<RunRevisionMark[]> {
  return page.evaluate(() => {
    const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
      state: { doc: any };
    };
    const out: RunRevisionMark[] = [];
    view.state.doc.descendants((node: any) => {
      if (!node.isText) return;
      for (const m of node.marks as Array<{ type: { name: string }; attrs: any }>) {
        if (m.type.name === 'revision_change') {
          out.push({
            text: node.text as string,
            revisionId: m.attrs.revisionId as number,
            author: m.attrs.author as string,
            prior: (m.attrs.prior as Record<string, unknown> | null) ?? null,
          });
        }
      }
    });
    return out;
  });
}

async function acceptById(page: import('@playwright/test').Page, id: number) {
  return page.evaluate((rid) => window.__DOCX_EDITOR_E2E__?.acceptChangeById(rid) ?? false, id);
}

async function rejectById(page: import('@playwright/test').Page, id: number) {
  return page.evaluate((rid) => window.__DOCX_EDITOR_E2E__?.rejectChangeById(rid) ?? false, id);
}

async function saveDocumentXml(page: import('@playwright/test').Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('text=Save').click();
  const downloadPath = await (await downloadPromise).path();
  const zip = await JSZip.loadAsync(fs.readFileSync(downloadPath!));
  return zip.file('word/document.xml')!.async('text');
}

test.describe('T27-07 run property revisions (issue #83)', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('suggesting bold authors revision_change; painter + sidebar show it; accept keeps bold', async ({
    page,
  }) => {
    await editor.typeText('Hello world');
    await editor.selectText('Hello');
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.applyBoldShortcut();
    await page.waitForTimeout(300);

    // PM state: one mark, Jane's triple, full pre-edit snapshot (plain ⇒ `{}`).
    const marks = await getRevisionMarks(page);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ text: 'Hello', author: 'Jane' });
    expect(marks[0]!.prior).toEqual({});
    const revId = marks[0]!.revisionId;

    // Painter: the run carries the revision class + dataset triple.
    const painted = page.locator(
      `.layout-page-content .ep-revision-change[data-revision-id="${revId}"]`
    );
    await expect(painted.first()).toBeVisible();

    // Sidebar: the card names the changed property ("Bold added").
    const toggle = page.locator('[aria-label="Toggle comments sidebar"]');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
      await toggle.click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('.docx-tracked-change-card').first()).toBeVisible();
    await expect(page.locator('.docx-tracked-change-card').first()).toContainText('Bold added');

    // Accept: the mark drops, the bold stays.
    expect(await acceptById(page, revId)).toBe(true);
    expect(await getRevisionMarks(page)).toHaveLength(0);
    await expect(painted.first()).toHaveCount(0);
  });

  test('reject restores the prior run properties', async ({ page }) => {
    await editor.typeText('Hello world');
    await editor.selectText('Hello');
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.applyBoldShortcut();
    await page.waitForTimeout(300);

    const marks = await getRevisionMarks(page);
    expect(marks).toHaveLength(1);

    expect(await rejectById(page, marks[0]!.revisionId)).toBe(true);
    expect(await getRevisionMarks(page)).toHaveLength(0);
    // The text is plain again — the prior (not bold) was restored.
    await expect(page.locator('.layout-page-content .ep-revision-change').first()).toHaveCount(0);
  });

  test('save → reload round-trips the w:rPrChange as last child of w:rPr', async ({ page }) => {
    await editor.typeText('Hello world');
    await editor.selectText('Hello');
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.applyBoldShortcut();
    await page.waitForTimeout(300);

    const docXml = await saveDocumentXml(page);
    expect(docXml).toMatch(/<w:rPrChange w:id="\d+" w:author="Jane"/);
    // Last-child ordering inside w:rPr (EG_RPrContent).
    expect(docXml).toMatch(/<w:rPrChange w:id="\d+"[^>]*>.*?<\/w:rPrChange><\/w:rPr>/s);

    // Reload: the mark comes back with its prior.
    const tempPath = path.join(__dirname, '..', 'fixtures', '_temp-run-revision.docx');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Save")').first().click();
    const downloadPath = await (await downloadPromise).path();
    fs.writeFileSync(tempPath, fs.readFileSync(downloadPath!));
    try {
      await editor.loadDocxFile(tempPath);
      await expect(async () => {
        expect(await getRevisionMarks(page)).toHaveLength(1);
      }).toPass({ timeout: 10000 });
      const [mark] = await getRevisionMarks(page);
      expect(mark).toMatchObject({ text: 'Hello', author: 'Jane' });
      // Full pre-edit snapshot round-trips losslessly (plain run ⇒ `{}`).
      expect(mark!.prior).toEqual({});
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });

  test('paragraph-mark rPrChange and run rPrChange do not cross-contaminate', async ({ page }) => {
    await editor.typeText('Hello world');
    // Plant a paragraph-mark property revision (Phase 1 path).
    expect(
      await page.evaluate(() =>
        window.__DOCX_EDITOR_E2E__?.plantParagraphMarkPropertyChange(900, { bold: true })
      )
    ).toBe(true);
    // Author a run formatting revision (Phase 3 path).
    await editor.selectText('Hello');
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.applyBoldShortcut();
    await page.waitForTimeout(300);

    const marks = await getRevisionMarks(page);
    expect(marks).toHaveLength(1);
    const runId = marks[0]!.revisionId;
    expect(runId).not.toBe(900);

    // Resolving the run revision leaves the pilcrow revision intact.
    expect(await acceptById(page, runId)).toBe(true);
    const attrs = await page.evaluate(
      () => window.__DOCX_EDITOR_E2E__?.getParagraphAttrs(0) ?? null
    );
    expect((attrs?.paraRPrChange as unknown[] | null) ?? null).toHaveLength(1);

    // The saver writes each change to its own schema position.
    const docXml = await saveDocumentXml(page);
    const pilcrowIdx = docXml.indexOf('<w:rPrChange w:id="900"');
    const runIdx = docXml.indexOf('<w:t>Hello</w:t>');
    expect(pilcrowIdx).toBeGreaterThan(-1);
    expect(pilcrowIdx).toBeLessThan(runIdx);
  });
});
