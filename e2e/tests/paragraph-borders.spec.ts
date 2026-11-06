import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Paragraph `w:between` / `w:bar` borders (`openspec/changes/paragraph-border-rendering`).
 *
 * Fixture `fixtures/para-border-between-bar.docx`:
 *   - paras 1-3 share an identical w:pBdr (red box + blue between) → one group
 *   - para 4 has no borders (closes the group)
 *   - para 5 has a green w:bar border
 */
const FIXTURE = 'fixtures/para-border-between-bar.docx';

function fragmentWithText(page: Page, text: string) {
  return page.locator('[data-block-id]').filter({ hasText: text });
}

test.describe('Paragraph between/bar borders', () => {
  test('between renders as the top line of interior group paragraphs only', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector('[data-page-number="1"]');

    // First of the group: red top (its own w:top), no blue line.
    const first = fragmentWithText(page, 'Grouped paragraph one').first();
    const firstBox = first.locator('.layout-paragraph-border');
    await expect(firstBox).toHaveCSS('border-top-width', '4px');
    await expect(firstBox).toHaveCSS('border-top-color', 'rgb(255, 0, 0)');

    // Interior paragraph: the blue w:between renders as its top border.
    const second = fragmentWithText(page, 'Grouped paragraph two').first();
    const secondBox = second.locator('.layout-paragraph-border');
    await expect(secondBox).toHaveCSS('border-top-width', '4px');
    await expect(secondBox).toHaveCSS('border-top-color', 'rgb(0, 0, 255)');

    // Last of the group: between on top, its own red bottom, no trailing line.
    const third = fragmentWithText(page, 'Grouped paragraph three').first();
    const thirdBox = third.locator('.layout-paragraph-border');
    await expect(thirdBox).toHaveCSS('border-top-color', 'rgb(0, 0, 255)');
    await expect(thirdBox).toHaveCSS('border-bottom-width', '4px');
    await expect(thirdBox).toHaveCSS('border-bottom-color', 'rgb(255, 0, 0)');

    // The unbordered paragraph after the group paints no border box.
    const plain = fragmentWithText(page, 'Plain paragraph after the group').first();
    await expect(plain.locator('.layout-paragraph-border')).toHaveCount(0);
  });

  test('bar renders a vertical line on the left edge', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector('[data-page-number="1"]');

    const frag = fragmentWithText(page, 'Paragraph with a bar border').first();
    const bar = frag.locator('.layout-paragraph-bar');
    await expect(bar).toHaveCount(1);
    await expect(bar).toHaveCSS('border-left-width', '4px');
    await expect(bar).toHaveCSS('border-left-color', 'rgb(0, 176, 80)');

    // The bar sits left of the paragraph text, spanning its full height.
    const { barBox, textBox } = await frag.evaluate((el) => {
      const barEl = el.querySelector('.layout-paragraph-bar') as HTMLElement;
      const textEl = el.querySelector('.layout-line') as HTMLElement;
      const b = barEl.getBoundingClientRect();
      const t = textEl.getBoundingClientRect();
      return {
        barBox: { left: b.left, top: b.top, bottom: b.bottom },
        textBox: { left: t.left, top: t.top, bottom: t.bottom },
      };
    });
    expect(barBox.left).toBeLessThan(textBox.left);
    expect(barBox.top).toBeLessThanOrEqual(textBox.top + 1);
    expect(barBox.bottom).toBeGreaterThanOrEqual(textBox.bottom - 1);
  });

  test('bar sits outside a left border instead of overlapping it', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector('[data-page-number="1"]');

    const frag = fragmentWithText(page, 'Paragraph with bar and left borders').first();
    await expect(frag.locator('.layout-paragraph-bar')).toHaveCount(1);
    await expect(frag.locator('.layout-paragraph-border')).toHaveCount(1);

    // The bar's right edge stays left of the border box's left edge.
    const { barRight, boxLeft } = await frag.evaluate((el) => {
      const barEl = el.querySelector('.layout-paragraph-bar') as HTMLElement;
      const boxEl = el.querySelector('.layout-paragraph-border') as HTMLElement;
      return {
        barRight: barEl.getBoundingClientRect().right,
        boxLeft: boxEl.getBoundingClientRect().left,
      };
    });
    expect(barRight).toBeLessThanOrEqual(boxLeft + 0.5);
  });
});
