import { test, expect } from '@playwright/test';

/**
 * Vue mirror of the React titlePg per-page header/footer spec.
 *
 * Regression for the Vue adapter passing `titlePage` instead of `titlePg` to
 * `renderPages` (core option is `titlePg`), which left page 1 showing the
 * default header/footer instead of the first-page variants.
 */
test.describe('Vue: titlePg first-page header/footer', () => {
  test('renders first-page header image and footer text on page 1', async ({ page }) => {
    await page.goto('http://localhost:5174/?e2e=1');
    await page.locator('.docx-editor-vue').waitFor();
    await page.locator('.paged-editor__pages').waitFor();

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles('e2e/fixtures/titlePg-header-footer.docx');
    await page.waitForSelector('[data-page-number="1"]');
    await page.waitForTimeout(1500);

    const page1Header = page.locator('[data-page-number="1"] .layout-page-header');
    await expect(page1Header.locator('img')).toHaveCount(1);

    const page1Footer = page.locator('[data-page-number="1"] .layout-page-footer');
    const footerText = await page1Footer.textContent();
    expect(footerText).toContain('Some address');

    const headerText = await page1Header.textContent();
    expect(headerText).not.toContain('Second header onwards');
  });
});
