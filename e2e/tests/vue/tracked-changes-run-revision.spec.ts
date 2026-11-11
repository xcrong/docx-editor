/**
 * Vue parity for T27-07 (issue #83): run-level property revisions.
 *
 * Bold in suggesting mode authors an inline `revision_change` mark through
 * the shared core command; accept drops it, reject restores the prior.
 * Narrow slice — the full matrix (save/reload, crosstalk, sidebar copy)
 * lives in the React spec; this proves the Vue adapter renders and
 * resolves through the same core paths.
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

test.describe('Vue: run property revisions (issue #83)', () => {
  test('suggesting bold authors revision_change; accept keeps bold, reject restores plain', async ({
    page,
  }) => {
    await boot(page);
    await selectRange(page, 1, 6);
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await page.keyboard.press('ControlOrMeta+b');
    await page.waitForTimeout(300);

    const marks = await getRevisionMarks(page);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ text: 'Hello', author: 'Jane' });
    const revId = marks[0]!.revisionId;

    // Painter shows the revision cue with the dataset triple.
    await expect(
      page.locator(`.layout-page-content .ep-revision-change[data-revision-id="${revId}"]`).first()
    ).toBeVisible();

    // Accept drops the mark; the bold stays painted bold.
    expect(
      await page.evaluate(
        (rid) => window.__DOCX_EDITOR_E2E__?.acceptChangeById(rid) ?? false,
        revId
      )
    ).toBe(true);
    expect(await getRevisionMarks(page)).toHaveLength(0);

    // A second bold session rejects back to plain.
    await selectRange(page, 1, 6);
    await page.keyboard.press('ControlOrMeta+b');
    await page.waitForTimeout(300);
    const marks2 = await getRevisionMarks(page);
    expect(marks2).toHaveLength(1);
    expect(
      await page.evaluate(
        (rid) => window.__DOCX_EDITOR_E2E__?.rejectChangeById(rid) ?? false,
        marks2[0]!.revisionId
      )
    ).toBe(true);
    expect(await getRevisionMarks(page)).toHaveLength(0);
    await expect(page.locator('.layout-page-content .ep-revision-change').first()).toHaveCount(0);
  });
});
