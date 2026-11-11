/**
 * Issue #127: Vue Toolbar routed `getCommands()` straight to the extension
 * manager's bare commands, bypassing the `commands/*` wrappers — toolbar
 * property edits in suggesting mode minted no revisions (React calls the
 * wrappers directly). Narrow slice: Bold + Center-align clicked on the real
 * Vue toolbar must author tracked changes.
 */

import { test, expect } from '@playwright/test';

async function boot(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5174/?e2e=1');
  await page.locator('.docx-editor-vue').waitFor();
  await page.waitForSelector('[data-page-number]');
  await page.evaluate(() => {
    const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
      state: { schema: any; doc: any; tr: any };
      dispatch: (tr: any) => void;
    };
    const s = view.state.schema;
    view.dispatch(
      view.state.tr.replaceWith(
        0,
        view.state.doc.content.size,
        s.nodes.paragraph.create(null, s.text('Hello world'))
      )
    );
  });
  await page.locator('.layout-paragraph').first().click();
  await page.locator('.ProseMirror').first().focus();
}

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

/** Select [from, to) in the first paragraph via PM dispatch (deterministic). */
async function selectRange(
  page: import('@playwright/test').Page,
  from: number,
  to: number
): Promise<void> {
  await page.evaluate(
    ({ f, t }) => {
      const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
        state: { doc: any; tr: any; selection: any };
        dispatch: (tr: any) => void;
      };
      let target = -1;
      view.state.doc.descendants((node: any, pos: number) => {
        if (target < 0 && node.type.name === 'paragraph') target = pos;
      });
      const Ctor = view.state.selection.constructor;
      view.dispatch(
        view.state.tr.setSelection(Ctor.create(view.state.doc, target + f, target + t))
      );
    },
    { f: from, t: to }
  );
  await page.locator('.ProseMirror').first().focus();
}

async function getRevisionMarks(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
      state: { doc: any };
    };
    const out: Array<{ text: string; revisionId: number; author: string }> = [];
    view.state.doc.descendants((node: any) => {
      if (!node.isText) return;
      for (const m of node.marks as Array<{ type: { name: string }; attrs: any }>) {
        if (m.type.name === 'revision_change') {
          out.push({
            text: node.text as string,
            revisionId: m.attrs.revisionId,
            author: m.attrs.author,
          });
        }
      }
    });
    return out;
  });
}

async function getFirstParagraphAttrs(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
      state: { doc: any };
    };
    let found: any = null;
    view.state.doc.descendants((node: any) => {
      if (!found && node.type.name === 'paragraph') found = node;
      return !found;
    });
    return found ? { alignment: found.attrs.alignment, pPrChange: found.attrs.pPrChange } : null;
  });
}

test.describe('Vue: toolbar edits in suggesting mode author revisions (#127)', () => {
  test('toolbar Bold authors revision_change', async ({ page }) => {
    await boot(page);
    await selectRange(page, 1, 6);
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);

    await page.locator('[aria-label="Bold"]').first().click();
    await page.waitForTimeout(300);

    const marks = await getRevisionMarks(page);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ text: 'Hello', author: 'Jane' });
    await expect(
      page
        .locator(
          `.layout-page-content .ep-revision-change[data-revision-id="${marks[0]!.revisionId}"]`
        )
        .first()
    ).toBeVisible();
  });

  test('toolbar Center-align attaches pPrChange', async ({ page }) => {
    await boot(page);
    await selectRange(page, 1, 6);
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);

    await page.locator('.align-trigger').first().click();
    await page.locator('.align-strip__btn[title^="Center"]').first().click();
    await page.waitForTimeout(300);

    const attrs = await getFirstParagraphAttrs(page);
    expect(attrs?.alignment).toBe('center');
    expect(Array.isArray(attrs?.pPrChange)).toBe(true);
  });
});
