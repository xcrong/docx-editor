/**
 * Text context menu (task 6.1) + zoom / header-footer verification (task 6.3).
 *
 * Covers the generic `TextContextMenu` (driven by `composeMenuItems`):
 * right-click opens the menu, item clicks execute PM commands, keyboard
 * navigation works, Escape / outside-mousedown closes it, and the fixed
 * overlay flips inside the viewport near edges. Zoom and header-editing
 * cases assert the same wiring through `getPositionFromMouse` /
 * `clickToPositionDom` at non-100% zoom and on the HF surface.
 *
 * Note: `agentSelection()` returns null for doc-spanning selections (see
 * `getSelectionInfo`), so these tests select a single line with
 * Shift+Home and assert select-all execution via text replacement.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

async function docText(page: Page): Promise<string> {
  return page.evaluate(() => window.__DOCX_EDITOR_E2E__?.agentGetDocumentText() ?? '');
}

async function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => window.__DOCX_EDITOR_E2E__?.agentSelection()?.selectedText ?? '');
}

function textMenu(page: Page): Locator {
  return page.locator('.docx-text-context-menu[role="menu"]');
}

async function rightClickFirstParagraph(page: Page, editor: EditorPage): Promise<Locator> {
  await editor.getParagraph(0).click({ button: 'right' });
  const menu = textMenu(page);
  await expect(menu).toBeVisible({ timeout: 5000 });
  return menu;
}

async function typeHello(editor: EditorPage): Promise<void> {
  await editor.focus();
  await editor.typeText('Hello world');
  await expect.poll(() => docText(editor.page)).toContain('Hello world');
}

/** Select the typed line without spanning the whole doc (keeps agentSelection readable). */
async function selectLine(page: Page): Promise<void> {
  await page.keyboard.press('Shift+Home');
  await expect.poll(() => selectedText(page)).toContain('Hello world');
}

/** Step the toolbar zoom stepper; the demo boots at 100%. */
async function stepZoom(page: Page, dir: 'in' | 'out', steps: number): Promise<void> {
  const btn = page.locator(`button[aria-label="Zoom ${dir}"]`);
  for (let i = 0; i < steps; i++) {
    await btn.click();
    await page.waitForTimeout(150);
  }
}

test.describe('Text context menu', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('right-click shows the menu with clipboard and select-all items', async ({ page }) => {
    await typeHello(editor);
    const menu = await rightClickFirstParagraph(page, editor);

    for (const label of ['Cut', 'Copy', /^Paste(?!\s*as)/, 'Delete', 'Select All']) {
      await expect(menu.locator('[role="menuitem"]').filter({ hasText: label })).toHaveCount(1);
    }
    // No selection yet — Cut/Copy/Delete must be disabled.
    await expect(menu.locator('[role="menuitem"]').filter({ hasText: 'Cut' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await page.keyboard.press('Escape');
  });

  test('right-click on a selection keeps it and Delete removes the text', async ({ page }) => {
    await typeHello(editor);
    await selectLine(page);

    const menu = await rightClickFirstParagraph(page, editor);
    // Selection survived the right-click — Delete is enabled.
    await expect(
      menu.locator('[role="menuitem"]').filter({ hasText: 'Delete' })
    ).not.toHaveAttribute('aria-disabled', 'true');
    await menu.locator('[role="menuitem"]').filter({ hasText: 'Delete' }).click();

    await expect.poll(() => docText(page)).not.toContain('Hello');
    await expect(textMenu(page)).toHaveCount(0);
  });

  test('Select All from the menu selects the document text', async ({ page }) => {
    await typeHello(editor);
    // Collapsed caret — left-click first so the menu opens without a selection.
    await editor.getParagraph(0).click();

    const menu = await rightClickFirstParagraph(page, editor);
    await menu.locator('[role="menuitem"]').filter({ hasText: 'Select All' }).click();
    await expect(textMenu(page)).toHaveCount(0);

    // Typing now must replace the whole document — proving Select All ran.
    await editor.typeText('X');
    await expect.poll(() => docText(page)).toBe('X');
  });

  test('keyboard: ArrowDown moves highlight and Enter executes', async ({ page }) => {
    await typeHello(editor);
    await selectLine(page);

    // ArrowDown once from Cut lands on Copy — Enter executes it without
    // changing the document, proving the highlight moved.
    await rightClickFirstParagraph(page, editor);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(textMenu(page)).toHaveCount(0);
    await expect.poll(() => docText(page)).toContain('Hello world');

    // ArrowDown x4 from Cut lands on Delete — Enter removes the text.
    const menu = await rightClickFirstParagraph(page, editor);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await expect(menu.locator('.docx-text-context-menu-item-highlighted')).toContainText('Delete');
    await page.keyboard.press('Enter');
    await expect.poll(() => docText(page)).not.toContain('Hello');
    await expect(textMenu(page)).toHaveCount(0);
  });

  test('Escape closes the menu without acting', async ({ page }) => {
    await typeHello(editor);
    await rightClickFirstParagraph(page, editor);
    await page.keyboard.press('Escape');
    await expect(textMenu(page)).toHaveCount(0);
    await expect.poll(() => docText(page)).toContain('Hello world');
  });

  test('outside mousedown closes the menu', async ({ page }) => {
    await typeHello(editor);
    await rightClickFirstParagraph(page, editor);

    await page.evaluate(() => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
      );
    });
    await expect(textMenu(page)).toHaveCount(0);
  });

  test('menu flips inside the viewport near the bottom-right edge', async ({ page }) => {
    await typeHello(editor);
    const { x, y } = await page.evaluate(() => ({
      x: window.innerWidth - 10,
      y: window.innerHeight - 10,
    }));
    await page.evaluate(
      ({ cx, cy }) => {
        const container = document.querySelector('.paged-editor__pages');
        if (!container) throw new Error('pages container not found');
        container.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            clientX: cx,
            clientY: cy,
          })
        );
      },
      { cx: x, cy: y }
    );

    const menu = textMenu(page);
    await expect(menu).toBeVisible({ timeout: 5000 });
    const box = await menu.boundingBox();
    if (!box) throw new Error('menu has no bounding box');
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press('Escape');
  });
});

test.describe('Context menu zoom and header/footer', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('menu opens at the click point at 150% zoom and Delete works', async ({ page }) => {
    await typeHello(editor);
    await stepZoom(page, 'in', 2);
    // Toolbar clicks blur the editor — re-focus and re-select afterwards.
    await editor.focus();
    await selectLine(page);
    await page.waitForTimeout(500);

    const target = editor.getParagraph(0);
    const point = await target.boundingBox();
    if (!point) throw new Error('paragraph not found');
    const cx = point.x + point.width / 2;
    const cy = point.y + point.height / 2;
    await page.mouse.click(cx, cy, { button: 'right' });

    const menu = textMenu(page);
    await expect(menu).toBeVisible({ timeout: 5000 });
    const box = await menu.boundingBox();
    if (!box) throw new Error('menu has no bounding box');
    // position:fixed uses viewport coords, so the menu must sit at the
    // click even though the painted content is zoom-scaled.
    expect(Math.abs(box.x - cx)).toBeLessThan(60);
    expect(Math.abs(box.y - cy)).toBeLessThan(60);

    await menu.locator('[role="menuitem"]').filter({ hasText: 'Delete' }).click();
    await expect.poll(() => docText(page)).not.toContain('Hello');
  });

  test('menu Delete executes at 50% zoom', async ({ page }) => {
    await typeHello(editor);
    await stepZoom(page, 'out', 2);
    await editor.focus();
    await selectLine(page);

    const menu = await rightClickFirstParagraph(page, editor);
    await menu.locator('[role="menuitem"]').filter({ hasText: 'Delete' }).click();
    await expect.poll(() => docText(page)).not.toContain('Hello');
  });

  test('menu opens in header editing mode', async ({ page }) => {
    await page
      .locator('input[type="file"][accept=".docx"]')
      .setInputFiles('e2e/fixtures/section-inheritance-header-footer.docx');
    await page.waitForSelector('.paged-editor__pages');
    await page.waitForSelector('[data-page-number]');

    await page.locator('.layout-page-header').first().dblclick();
    await expect(page.locator('.hf-inline-editor')).toHaveCount(1);

    const span = page.locator('.layout-page-header span[data-pm-start]').first();
    await span.click({ button: 'right' });
    const menu = textMenu(page);
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Escape in HF mode is owned by the inline editor (exits edit mode),
    // so close the menu with an outside mousedown instead.
    await page.evaluate(() => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
      );
    });
    await expect(textMenu(page)).toHaveCount(0);
  });
});
