/**
 * Tracked-change edge cases in suggesting mode:
 *   1. Undoing the last (or only) suggestion must remove its sidebar card,
 *      not leave an orphaned "Added ..." entry behind.
 *   2. The card's "Added" text must equal what was typed — no duplicated
 *      trailing character.
 *
 * Tests 1-3 pin the orphan-card behavior (undo removes the card, redo
 * restores it); tests 4-5 pin the card text. The undo-history guard itself
 * (the suggesting-mode catch-all skipping history transactions, issue #633)
 * is covered by `tracked-changes-structural.spec.ts:624`.
 * Regression coverage for `openspec/changes/tracked-changes-edge-cases`.
 */

import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

async function setSuggestionMode(
  page: Page,
  active: boolean,
  author?: string
): Promise<boolean> {
  const ok = await page.evaluate(
    ({ a, u }) => window.__DOCX_EDITOR_E2E__?.setSuggestionMode(a, u) ?? false,
    { a: active, u: author }
  );
  await page.locator('.ProseMirror').first().focus();
  return ok;
}

async function openSidebar(page: Page): Promise<void> {
  const toggle = page.locator('[aria-label="Toggle comments sidebar"]');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
    await page.waitForTimeout(150);
  }
}

function cards(page: Page) {
  return page.locator('.docx-tracked-change-card');
}

test.describe('Tracked-change edge cases in suggesting mode', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('undo of the only suggestion removes its sidebar card', async ({ page }) => {
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.typeText('Hello');

    await openSidebar(page);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Added');

    // Bounded loop: keystrokes normally form one history group, but under
    // load the group can split — keep undoing until the card is gone.
    for (let i = 0; i < 10 && (await cards(page).count()) > 0; i++) {
      await editor.undo();
    }

    // No orphaned card, no tracked insertion left in the document.
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator('.docx-insertion')).toHaveCount(0);
  });

  test('undo of the latest of two suggestions removes only that card', async ({ page }) => {
    // Two untracked paragraphs give two non-adjacent caret homes. A distinct
    // author for the second suggestion keeps the two revisions separate
    // (same-author edits coalesce across blocks by design).
    await editor.typeText('first');
    await editor.pressEnter();
    await editor.typeText('second');

    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.typeText('AB'); // suggestion 1, end of "second"
    // Load-bearing pause: separates the two suggestions into distinct history
    // groups (~500 ms newGroupDelay) so one undo removes only the latest.
    await page.waitForTimeout(600);
    expect(await setSuggestionMode(page, true, 'Bob')).toBe(true);
    await editor.focusParagraph(0);
    await page.keyboard.press('End');
    await editor.typeText('CD'); // suggestion 2, end of "first"

    await openSidebar(page);
    await expect(cards(page)).toHaveCount(2);

    // Bounded loop (same grouping caveat as above): undo until only one
    // card remains. Undos remove the newest first, so Jane's card survives.
    for (let i = 0; i < 10 && (await cards(page).count()) > 1; i++) {
      await editor.undo();
    }

    // Only Bob's latest suggestion is gone; Jane's card survives.
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('AB');
    await expect(cards(page).first()).not.toContainText('CD');
  });

  test('redo restores the undone suggestion and its card', async ({ page }) => {
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.typeText('Revert me');

    await openSidebar(page);
    await expect(cards(page)).toHaveCount(1);

    for (let i = 0; i < 10 && (await cards(page).count()) > 0; i++) {
      await editor.undo();
    }
    await expect(cards(page)).toHaveCount(0);

    // Redo step by step until the full text is back (one step normally).
    for (
      let i = 0;
      i < 10 &&
      !(((await page.locator('.ProseMirror').textContent()) ?? '').includes('Revert me'));
      i++
    ) {
      await editor.redo();
    }
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Revert me');
  });

  test('card shows the typed text once (no duplicated trailing character)', async ({ page }) => {
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.typeText('ABCD');

    await openSidebar(page);
    await expect(cards(page)).toHaveCount(1);
    const text = (await cards(page).first().textContent()) ?? '';
    expect(text).toContain('"ABCD"');
    expect(text).not.toContain('"ABCDD"');
  });

  test('card text stays correct for a multi-character run typed slowly', async ({ page }) => {
    expect(await setSuggestionMode(page, true, 'Jane')).toBe(true);
    await editor.typeTextSlowly('WXYZ', 60);


    await openSidebar(page);
    await expect(cards(page)).toHaveCount(1);
    const text = (await cards(page).first().textContent()) ?? '';
    expect(text).toContain('"WXYZ"');
    expect(text.match(/WXYZ/g) ?? []).toHaveLength(1);
  });
});
