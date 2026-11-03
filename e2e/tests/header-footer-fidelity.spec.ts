import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * T13 header-footer-rendering fidelity: header tall content must not clip into
 * the body, and the footer PAGE field must resolve per page.
 *
 * - header-inline-image-dist.docx: inline logo + right-tab label. The header
 *   band must grow to fit the line (distT/distB included) so the logo is fully
 *   visible and the header does not overlap the body text.
 * - footer-page-number.docx: footer carries a PAGE field; page 1 must show "1".
 */
test.describe('Header/footer fidelity (T13)', () => {
  test('header inline image is fully visible and does not overlap the body', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();

    await editor.loadDocxFile('fixtures/header-inline-image-dist.docx');
    await page.waitForSelector('[data-page-number="1"] .layout-page-header img');

    const metrics = await page.evaluate(() => {
      const pageEl = document.querySelector<HTMLElement>('[data-page-number="1"]');
      const headerEl = pageEl?.querySelector<HTMLElement>('.layout-page-header');
      const contentEl = pageEl?.querySelector<HTMLElement>('.layout-page-content');
      const imgEl = headerEl?.querySelector<HTMLImageElement>('img');
      if (!pageEl || !headerEl || !contentEl || !imgEl) return null;
      const headerRect = headerEl.getBoundingClientRect();
      const contentRect = contentEl.getBoundingClientRect();
      const imgRect = imgEl.getBoundingClientRect();
      return {
        imgBottom: imgRect.bottom,
        headerBottom: headerRect.bottom,
        contentTop: contentRect.top,
        imgHeight: imgRect.height,
      };
    });

    expect(metrics).toBeTruthy();
    // Image is rendered (not zero-size / clipped away).
    expect(metrics!.imgHeight).toBeGreaterThan(10);
    // The image stays inside the header band (tolerance for sub-pixel rounding).
    expect(metrics!.imgBottom).toBeLessThanOrEqual(metrics!.headerBottom + 2);
    // The header band does not overlap the body content.
    expect(metrics!.headerBottom).toBeLessThanOrEqual(metrics!.contentTop + 2);
  });

  test('footer PAGE field resolves on page 1', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();

    await editor.loadDocxFile('fixtures/footer-page-number.docx');
    await page.waitForSelector('[data-page-number="1"] .layout-page-footer');

    const footer = page.locator('[data-page-number="1"] .layout-page-footer');
    await expect(footer).toContainText('Page');
    const text = await footer.textContent();
    expect(text).toMatch(/Page\s*1/);
  });
});
