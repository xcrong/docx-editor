import { test, expect } from '@playwright/test';

/**
 * T28-02 #85: was quarantined as "header Bold never lands in CI". Root
 * cause was the spec, not the adapter: it pressed `Meta+a`, which is Cmd+A
 * only on macOS — on Linux CI the Meta key selects nothing, so Bold fired
 * on an empty range. The toolbar already targets the active HF view (#749).
 * Uses `ControlOrMeta+a` like the sibling hf-text-selection spec.
 */
test('Vue: toolbar formatting applies to the header while editing it (#749)', async ({ page }) => {
  await page.goto('http://localhost:5174/?e2e=1');
  await page.locator('.docx-editor-vue').waitFor();
  await page.locator('.paged-editor__pages').waitFor();

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles('e2e/fixtures/header-with-table.docx');

  await page.waitForSelector('[data-page-number]');
  await expect(page.locator('.layout-page-header [data-from-row]')).toHaveCount(1, {
    timeout: 15000,
  });

  // Enter HF edit mode and select the header text.
  await page.locator('.layout-page-header').first().dblclick();
  await expect(page.locator('.hf-editor')).toHaveCount(1);
  const headerSpan = page
    .locator('.layout-page-header .layout-table-cell span[data-pm-start]')
    .first();
  await headerSpan.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.waitForTimeout(150);

  // Guard: select-all must have produced a non-empty range before Bold
  // runs — otherwise a routing regression would masquerade as a weight
  // failure (this is what made the old `Meta+a` variant CI-deterministic).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const sel = window.getSelection();
        return sel ? sel.toString().length : 0;
      })
    )
    .toBeGreaterThan(0);

  const headerWeight = () =>
    page.evaluate(() => {
      const el = document.querySelector(
        '.layout-page-header .layout-table-cell span[data-pm-start]'
      ) as Element | null;
      return el ? getComputedStyle(el).fontWeight : null;
    });

  // Sanity: header text is not bold to begin with.
  expect(Number(await headerWeight())).toBeLessThan(600);

  // Click Bold on the main toolbar.
  const boldBtn = page.locator('[aria-label="Bold"]').first();
  await boldBtn.click();
  await page.waitForTimeout(250);

  // Header run is now bold...
  await expect.poll(async () => Number(await headerWeight())).toBeGreaterThanOrEqual(600);

  // ...and the toolbar reflects it — the Bold button is active. Guards that HF
  // transactions refresh toolbar state, not just apply the command (#749).
  await expect(boldBtn).toHaveClass(/active/);

  // ...and the body was not touched.
  const bodyWeight = await page.evaluate(() => {
    const el = document.querySelector('.layout-page-content .layout-run-text') as Element | null;
    return el ? getComputedStyle(el).fontWeight : null;
  });
  expect(Number(bodyWeight)).toBeLessThan(600);
});
