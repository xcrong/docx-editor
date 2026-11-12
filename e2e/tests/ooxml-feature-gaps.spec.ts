import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * ooxml-feature-gaps: file-format gap coverage.
 *
 * Fixtures regenerated with `node scripts/gen-fixture-ooxml-gaps.mjs`
 * (clean-room, no Word needed).
 */
test.describe('OOXML feature gaps', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
  });

  test('footer image with a:hlinkClick renders as a clickable link', async ({ page }) => {
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/footer-hlink-image.docx');
    const link = page
      .locator('.layout-page-footer a[href="https://example.com/footer-logo"]')
      .first();
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    const img = link.locator('img').first();
    await expect(img).toBeVisible();
    const naturalW = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalW).toBeGreaterThan(0);

    // Clicking the linked image must not break the editor (target=_blank opens a popup).
    // NOTE: a DOM click via evaluate — Playwright's mouse click is intercepted
    // by the footer's inline-edit chrome overlay (not the anchor itself).
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 5000 }).catch(() => null),
      link.evaluate((el: HTMLAnchorElement) => el.click()),
    ]);
    if (popup) {
      expect(popup.url()).toContain('example.com/footer-logo');
      await popup.close();
    }
    await expect(page.locator('[data-testid="docx-editor"]')).toBeVisible();
  });

  test('SVG image renders natively', async ({ page }) => {
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/svg-image.docx');
    const img = page.locator('.layout-page-content img[src^="data:image/svg+xml"]').first();
    await expect(img).toBeVisible({ timeout: 15000 });
    const size = await img.evaluate((el: HTMLImageElement) => ({
      w: el.naturalWidth,
      h: el.naturalHeight,
    }));
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
  });

  test('TIFF image degrades gracefully (no crash, image block preserved)', async ({ page }) => {
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/tiff-image.docx');
    // Document text loads — the undecodable TIFF must not break the page.
    await expect(
      page.locator('.layout-page-content').getByText('TIFF below', { exact: false }).first()
    ).toBeVisible({ timeout: 15000 });
    // The image block survives the parse→render pipeline with its TIFF src intact
    // (host apps can upgrade it via the `mediaResolver` hook — browsers have no
    // native TIFF decoder, so no client-side conversion is bundled).
    const img = page.locator('.layout-page-content img[src^="data:image/tiff"]').first();
    await expect(img).toHaveCount(1);
  });

  test('typing "10.5" in the font-size box applies 10.5pt (21 half-points)', async ({ page }) => {
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
    await page.keyboard.type('Half point', { delay: 20 });
    await page.waitForTimeout(200);
    // Select the typed run via the painted paragraph, then drive the size box.
    await editor.getParagraph(0).click({ clickCount: 3 });
    await page.waitForTimeout(200);
    await page.locator('[data-testid="font-size-display"]').first().click();
    const input = page.locator('[data-testid="font-size-input"]').first();
    await expect(input).toBeVisible();
    await input.fill('10.5');
    await input.press('Enter');
    await page.waitForTimeout(800);
    // The box keeps the decimal value (regression: "10.5" became "105").
    await expect(page.locator('[data-testid="font-size-display"]').first()).toHaveText('10.5');
    // PM carries 21 half-points on the fontSize mark.
    const sizes = await page.evaluate(() => {
      const view = (
        window as unknown as {
          __DOCX_EDITOR_E2E__?: { getView: () => { state: { doc: unknown } } | null };
        }
      ).__DOCX_EDITOR_E2E__?.getView() as unknown as {
        state: {
          doc: {
            descendants: (
              cb: (node: {
                marks?: Array<{ type: { name: string }; attrs: { size?: number } }>;
              }) => void
            ) => void;
          };
        };
      } | null;
      const out: number[] = [];
      view?.state.doc.descendants((node) => {
        for (const m of node.marks ?? []) {
          if (m.type.name === 'fontSize' && typeof m.attrs.size === 'number') {
            out.push(m.attrs.size);
          }
        }
      });
      return out;
    });
    expect(sizes).toContain(21);
  });

  test('numbering with missing lvlText loads without crashing', async ({ page }) => {
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/null-lvltext.docx');
    const content = page.locator('.layout-page-content').first();
    await expect(content.getByText('First item with missing lvlText').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(content.getByText('Second item').first()).toBeVisible();
  });

  test('column separator line renders between columns', async ({ page }) => {
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/column-sep.docx');
    const sep = page.locator('[data-column-separator="true"]').first();
    await expect(sep).toBeVisible({ timeout: 15000 });
    const box = await sep.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(50);
    // Separator sits inside the page content area, not in the margins.
    const contentBox = await page
      .locator('[data-page-number="1"] .layout-page-content')
      .first()
      .boundingBox();
    expect(contentBox).not.toBeNull();
    expect(box!.x).toBeGreaterThan(contentBox!.x);
    expect(box!.x).toBeLessThan(contentBox!.x + contentBox!.width);
  });
});
