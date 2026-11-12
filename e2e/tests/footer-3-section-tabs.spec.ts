import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/footer-3-section-tabs.docx';

/**
 * The classic Word footer layout: left text, a center tab stop, center text,
 * a right tab stop, right text. Word renders all three sections on one line:
 * left-aligned at the margin, centered on the page, right-aligned at the
 * margin. The footer shares the body's tab-stop path (`block.attrs.tabs` at
 * `renderParagraph.ts:426,450`, laid out in `headerContentWidth`), so this
 * verifies the painter honors center/right stops in the footer context.
 */
test('footer with 3-section tab-stop layout renders left/center/right on a single line', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();

  await editor.loadDocxFile(FIXTURE);
  await page.waitForSelector('.paged-editor__pages');
  await page.waitForSelector('[data-page-number]');
  await page.waitForSelector('.layout-page-footer .layout-line');

  const firstFooter = page.locator('[data-page-number="1"] .layout-page-footer');
  const lineCount = await firstFooter.locator('.layout-line').count();
  expect(lineCount).toBe(1);

  const footerText = await firstFooter.innerText();
  expect(footerText).toContain('Left');
  expect(footerText).toContain('Center');
  expect(footerText).toContain('Right');

  const metrics = await page.evaluate(() => {
    const footer = document.querySelector('[data-page-number="1"] .layout-page-footer');
    if (!footer) return null;
    const rectOf = (label: string) => {
      const span = [...footer.querySelectorAll('.layout-run-text')].find(
        (el) => el.textContent?.trim() === label
      );
      return span?.getBoundingClientRect().toJSON() ?? null;
    };
    return {
      footer: footer.getBoundingClientRect().toJSON(),
      left: rectOf('Left'),
      center: rectOf('Center'),
      right: rectOf('Right'),
    };
  });

  expect(metrics?.left, 'Left span not found').toBeTruthy();
  expect(metrics?.center, 'Center span not found').toBeTruthy();
  expect(metrics?.right, 'Right span not found').toBeTruthy();

  const { footer, left, center, right } = metrics!;
  // Sections are ordered left → center → right with real gaps (spread out,
  // not bunched at the left margin as when tab stops are ignored).
  expect(left.left).toBeLessThan(center.left);
  expect(center.left).toBeLessThan(right.left);
  expect(center.left - left.right).toBeGreaterThan(50);
  expect(right.left - center.right).toBeGreaterThan(50);
  // Left section starts at the left margin, right section ends at the right.
  expect(left.left - footer.left).toBeLessThan(40);
  expect(footer.right - right.right).toBeLessThan(40);
  // Center section is centered on the footer (Word tab-stop semantics).
  const footerMid = (footer.left + footer.right) / 2;
  const centerMid = (center.left + center.right) / 2;
  expect(Math.abs(centerMid - footerMid)).toBeLessThan((footer.right - footer.left) * 0.15);
});
