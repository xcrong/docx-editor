/**
 * Toolbar & Selection Interaction Tests
 *
 * Covers openspec change `toolbar-selection-interactions`:
 * 1. Selection highlight persists while a toolbar dropdown is open
 *    (overlay renders from PM stored selection, not focus).
 * 2. Open dropdowns close when the editor body is clicked
 *    (`useFixedDropdown` document-level mousedown close).
 * 3. Right-click inside a selection preserves it (Firefox regression:
 *    `usePagesPointer` preventDefaults button-2 mousedown and keeps the
 *    range when the contextmenu lands inside it). CI runs the chromium
 *    project only — see the Firefox manual step in tasks.md evidence.
 * 4. Toolbar shows the inherited default font/size at a cursor with no
 *    explicit formatting (`resolveEffectiveFont` style cascade).
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Selection preserved while dropdown open', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('selection highlight stays when font dropdown opens', async ({ page }) => {
    await editor.typeText('Hello selection world');
    expect(await editor.selectText('selection')).toBe(true);

    const rects = page.locator('[data-testid^="selection-rect-"]');
    await expect(rects.first()).toBeVisible();

    // Open the font family dropdown without picking a value.
    await page.locator('[aria-label="Select font family"]').click();
    await expect(page.getByRole('option', { name: 'Georgia', exact: true })).toBeVisible();

    // Painted highlight survives the dropdown focus steal, and the PM
    // stored selection is unchanged.
    await expect(rects.first()).toBeVisible();
    const sel = await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.agentSelection() ?? null);
    expect(sel?.selectedText).toBe('selection');

    await page.keyboard.press('Escape');
  });
});

test.describe('Dropdown closes on editor body click', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('font-size dropdown closes when editor body is clicked', async ({ page }) => {
    await editor.typeText('Some body text here');

    await page.locator('[data-testid="font-size-display"]').click();
    const listbox = page.locator('[role="listbox"][aria-label="Font sizes"]');
    await expect(listbox).toBeVisible();

    // Click the painted editor body — outside both trigger and dropdown.
    await editor.getParagraph(0).click();

    await expect(listbox).toBeHidden();
  });
});

test.describe('Right-click preserves selection', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('right-click inside selection keeps the range (chromium; Firefox manual)', async ({
    page,
  }) => {
    await editor.typeText('Right click target text');
    expect(await editor.selectText('click target')).toBe(true);

    const before = await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.agentSelection() ?? null);
    expect(before?.selectedText).toBe('click target');

    // Viewport point inside the painted occurrence of the selection.
    await editor.getParagraph(0).scrollIntoViewIfNeeded();
    const pt = await page.evaluate(() => {
      const root = document.querySelector('.layout-page-content');
      if (!root) return null;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const idx = node.textContent?.indexOf('click target') ?? -1;
        if (idx !== -1) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + 'click target'.length);
          const r = range.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });
    expect(pt).not.toBeNull();

    await page.mouse.click(pt!.x, pt!.y, { button: 'right' });

    // The contextmenu route keeps a range click: PM selection unchanged.
    const after = await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.agentSelection() ?? null);
    expect(after?.selectedText).toBe('click target');

    // Dismiss the context menu if the app opened one.
    await page.keyboard.press('Escape');
  });
});

test.describe('Default font shown in toolbar', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('cursor in unformatted text shows inherited default font and size', async ({ page }) => {
    await editor.typeText('Default text here');
    await editor.pressEnter();
    await editor.typeText('Sized text here');
    await editor.selectText('Sized text here');
    await editor.setFontFamily('Georgia');
    await editor.setFontSize(20);

    // Collapse the cursor inside the unformatted paragraph (hidden PM DOM
    // selection syncs into PM, same pattern as toolbar-state.spec.ts).
    await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.querySelector('.ProseMirror')!,
        NodeFilter.SHOW_TEXT,
        null
      );
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (node.textContent?.includes('Default text')) {
          const range = document.createRange();
          range.setStart(node, 3);
          range.collapse(true);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          (document.querySelector('.ProseMirror') as HTMLElement)?.focus();
          break;
        }
      }
    });

    const familyTrigger = page.locator('[aria-label="Select font family"]').first();
    const sizeDisplay = page.locator('[data-testid="font-size-display"]');
    // Empty-doc docDefaults resolve to Arial 11pt via the style cascade
    // (createDocument docDefaults rPr) — not a blank/stale toolbar.
    await expect.poll(async () => familyTrigger.textContent()).toContain('Arial');
    await expect.poll(async () => sizeDisplay.textContent()).toContain('11');

    // Contrast: cursor in the explicitly-sized run shows its own size,
    // proving the display is position-sensitive, not a static placeholder.
    await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.querySelector('.ProseMirror')!,
        NodeFilter.SHOW_TEXT,
        null
      );
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (node.textContent?.includes('Sized text')) {
          const range = document.createRange();
          range.setStart(node, 3);
          range.collapse(true);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          (document.querySelector('.ProseMirror') as HTMLElement)?.focus();
          break;
        }
      }
    });
    await expect.poll(async () => sizeDisplay.textContent()).toContain('20');
    await expect.poll(async () => familyTrigger.textContent()).toContain('Georgia');
  });
});
