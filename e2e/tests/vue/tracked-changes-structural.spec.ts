/**
 * Vue parity for tracked paragraph-mark revisions (issue #80, T27-04).
 *
 * The split/join keymaps and accept/reject commands live in
 * `@xcrong/docx-editor-core` and both adapters mount the same suggestion-mode
 * plugin — this spec proves the Vue-mounted editor produces `pPrIns` on
 * Enter, `pPrDel` on Backspace, and resolves both by id, through the real
 * keyboard + painted-DOM pipeline (not dispatch shortcuts).
 */

import { test, expect } from '@playwright/test';

async function boot(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5174/?e2e=1');
  await page.locator('.docx-editor-vue').waitFor();
  await page.waitForSelector('[data-page-number]');
  // Seed a single empty paragraph so caret placement is deterministic.
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
  // Click the painted paragraph so the caret lands via the real
  // click→PM-position pipeline, then focus the hidden PM for typing.
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

async function getParaRevision(page: import('@playwright/test').Page, index: number) {
  return page.evaluate((i) => window.__DOCX_EDITOR_E2E__?.getParagraphRevisionAt(i) ?? null, index);
}

/**
 * Place the caret programmatically (PM dispatch, same pattern as the
 * issue-761 Vue spec). Keyboard arrows race the Vue composable's
 * selection/scroll restore and get swallowed; caret placement is not what
 * these tests exercise — the Enter/Backspace keymaps are, via real presses
 * below.
 */
async function setCaret(
  page: import('@playwright/test').Page,
  paragraphIndex: number,
  offset = 0
): Promise<void> {
  await page.evaluate(
    ({ idx, off }) => {
      const view = window.__DOCX_EDITOR_E2E__?.getView() as unknown as {
        state: { doc: any; tr: any; selection: any };
        dispatch: (tr: any) => void;
      };
      let count = -1;
      let target = -1;
      view.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'paragraph') {
          count += 1;
          if (count === idx) target = pos + 1 + off;
        }
      });
      if (target < 0) throw new Error(`paragraph ${idx} not found`);
      const Ctor = view.state.selection.constructor;
      view.dispatch(view.state.tr.setSelection(Ctor.create(view.state.doc, target)));
    },
    { idx: paragraphIndex, off: offset }
  );
  await page.locator('.ProseMirror').first().focus();
}

test.describe('Vue: tracked paragraph-mark revisions (issue #80)', () => {
  test('Enter in suggesting mode sets pPrIns; accept clears it', async ({ page }) => {
    await boot(page);
    // Caret to the middle of "Hello world".
    await setCaret(page, 0, 5);
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(async () => {
      expect((await getParaRevision(page, 0))?.pPrIns).not.toBeNull();
    }).toPass({ timeout: 10000 });
    expect((await getParaRevision(page, 0))?.pPrIns?.author).toBe('Jane');

    const revId = (await getParaRevision(page, 0))?.pPrIns?.revisionId as number;
    expect(
      await page.evaluate(
        (rid) => window.__DOCX_EDITOR_E2E__?.acceptChangeById(rid) ?? false,
        revId
      )
    ).toBe(true);
    expect((await getParaRevision(page, 0))?.pPrIns).toBeNull();
  });

  test('Backspace at paragraph start sets pPrDel; reject keeps the split', async ({ page }) => {
    await boot(page);
    // Split into two paragraphs first (unsuggesting), then Backspace tracked.
    await setCaret(page, 0, 11);
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');
    await setCaret(page, 1, 0);
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await page.keyboard.press('Backspace');
    await expect(async () => {
      expect((await getParaRevision(page, 0))?.pPrDel).not.toBeNull();
    }).toPass({ timeout: 10000 });

    const revId = (await getParaRevision(page, 0))?.pPrDel?.revisionId as number;
    expect(
      await page.evaluate(
        (rid) => window.__DOCX_EDITOR_E2E__?.rejectChangeById(rid) ?? false,
        revId
      )
    ).toBe(true);
    // Reject keeps the split, clears the marker.
    expect((await getParaRevision(page, 0))?.pPrDel).toBeNull();
    expect(await getParaRevision(page, 1)).not.toBeNull();
  });

  test('Reject pPrIns joins the paragraphs back together', async ({ page }) => {
    await boot(page);
    await setCaret(page, 0, 5);
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(async () => {
      expect((await getParaRevision(page, 0))?.pPrIns).not.toBeNull();
    }).toPass({ timeout: 10000 });

    const revId = (await getParaRevision(page, 0))?.pPrIns?.revisionId as number;
    expect(
      await page.evaluate(
        (rid) => window.__DOCX_EDITOR_E2E__?.rejectChangeById(rid) ?? false,
        revId
      )
    ).toBe(true);
    expect((await getParaRevision(page, 0))?.pPrIns).toBeNull();
    expect(await getParaRevision(page, 1)).toBeNull();
  });
});
