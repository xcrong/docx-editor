/**
 * Timing-equivalence regression (T23 step 1.8, refs #33).
 *
 * The engine emits layout outputs via host hooks, but React must act on
 * them at the same lifecycle point it always has — scroll-restore
 * post-commit (useLayoutEffect), not synchronously inside `run`. These
 * specs assert the user-visible consequence: scroll position and the
 * selection caret survive a relayout unchanged.
 */

import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const SCROLLER = '.docx-editor__scroll-container';
const BODY_TEXT = Array.from(
  { length: 40 },
  (_, i) =>
    `Timing paragraph ${i + 1} with enough words to wrap across lines ` +
    `so the document spans several pages when paginated.`
).join('\n');

/** Minimal shape of the demo's `window.__DOCX_EDITOR_E2E__` PM-view seam. */
interface E2EEditorView {
  state: {
    tr: { insertText: (text: string, from: number, to: number) => unknown };
    selection: { from: number; to: number };
  };
  dispatch: (tr: unknown) => void;
}

async function bootWithBody(page: Page): Promise<EditorPage> {
  const editor = new EditorPage(page);
  await editor.gotoEmpty();
  await editor.waitForReady();
  await page.waitForSelector('.paged-editor__pages .layout-page', { timeout: 15000 });
  await page.waitForFunction(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await editor.focus();
  // Bulk-insert via the raw PM view (one transaction → one layout) instead
  // of typing thousands of chars through the hot editing loop.
  await page.evaluate((text) => {
    const hooks = (window as unknown as { __DOCX_EDITOR_E2E__: { getView: () => E2EEditorView } })
      .__DOCX_EDITOR_E2E__;
    const view = hooks.getView();
    const { from, to } = view.state.selection;
    view.dispatch(view.state.tr.insertText(text, from, to));
  }, BODY_TEXT);
  await page.waitForTimeout(1000);
  return editor;
}

test.describe('Engine timing equivalence (T23 step 1)', () => {
  test('scroll anchor survives a relayout', async ({ page }) => {
    const editor = await bootWithBody(page);

    // Park the viewport mid-document, away from the end-of-doc cursor.
    const before = await page.locator(SCROLLER).evaluate((el) => {
      const scroller = el as HTMLElement;
      scroller.scrollTop = Math.floor(scroller.scrollHeight * 0.4);
      return scroller.scrollTop;
    });
    expect(before).toBeGreaterThan(100);
    await page.waitForTimeout(200);

    // Single-char edit at the off-viewport cursor triggers a relayout.
    await editor.typeText('!');
    await page.waitForTimeout(1000);

    const after = await page
      .locator(SCROLLER)
      .evaluate((el) => (el as HTMLElement).scrollTop);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });

  test('selection caret survives a relayout', async ({ page }) => {
    const editor = await bootWithBody(page);

    // Park the caret on a near-empty last line so the probe char cannot
    // re-wrap the line (a re-wrap would move the caret legitimately and
    // mask overlay staleness).
    await editor.focus();
    await editor.pressEnter();
    await editor.pressEnter();
    await editor.typeText('ab');
    await page.waitForTimeout(1000);

    // Bring the end-of-doc caret into view.
    await page.locator(SCROLLER).evaluate((el) => {
      const scroller = el as HTMLElement;
      scroller.scrollTop = scroller.scrollHeight;
    });
    await page.waitForTimeout(400);
    const caret = page.locator('[data-testid="caret"]');
    await expect(caret).toBeVisible();
    const beforeBox = await caret.boundingBox();
    expect(beforeBox).not.toBeNull();

    await editor.typeText('?');
    await page.waitForTimeout(1000);

    const afterBox = await caret.boundingBox();
    expect(afterBox).not.toBeNull();
    // Same line (no vertical jump from a stale overlay position) and the
    // caret advanced with the typed char (it tracks the live selection).
    expect(Math.abs(afterBox!.y - beforeBox!.y)).toBeLessThanOrEqual(3);
    expect(afterBox!.x).toBeGreaterThan(beforeBox!.x);
    expect(afterBox!.x - beforeBox!.x).toBeLessThan(30);
  });
});
