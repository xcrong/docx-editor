/**
 * Floating image layout — square / tight / through / topAndBottom / behind.
 *
 * Directed coverage for openspec/changes/floating-image-layout using the
 * shared comprehensive fixture (rectangular wrapPolygons for tight/through,
 * so they are equivalent to square). Verifies:
 *  - square left/right wrapping creates side margins
 *  - tight/through wrap like square (rectangular polygon fallback)
 *  - topAndBottom stands on its own block line without side margins
 *  - behind-text images paint below text and don't shrink line widths
 *  - table cells constrain floats and wrap text around them
 */
import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/float-wrap-comprehensive-test.docx';

async function loadFixture(page: Page) {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await page.locator('input[type="file"][accept=".docx"]').setInputFiles(`e2e/${FIXTURE}`);
  await page.waitForSelector('.paged-editor__pages');
  await page.waitForSelector('[data-page-number]');
  await page.waitForTimeout(2000);
}

async function wrapStats(page: Page, wrapType: string) {
  return page.evaluate((wt) => {
    const floats = Array.from(
      document.querySelectorAll<HTMLElement>(`.layout-page-floating-image[data-wrap-type="${wt}"]`)
    );
    let overlapping = 0;
    let offset = 0;
    for (const float of floats) {
      const imgRect = float.getBoundingClientRect();
      const pageEl = float.closest('[data-page-number]');
      if (!pageEl) continue;
      const lines = pageEl.querySelectorAll<HTMLElement>('.layout-paragraph .layout-line');
      for (const line of lines) {
        const lineRect = line.getBoundingClientRect();
        if (lineRect.bottom > imgRect.top + 2 && lineRect.top < imgRect.bottom - 2) {
          overlapping++;
          const ml = parseFloat(line.style.marginLeft) || 0;
          const mr = parseFloat(line.style.marginRight) || 0;
          if (ml > 10 || mr > 10) offset++;
        }
      }
    }
    return { floats: floats.length, overlapping, offset };
  }, wrapType);
}

test.describe('Floating image layout (T14)', () => {
  test('square left/right images create side margins', async ({ page }) => {
    await loadFixture(page);
    const square = await wrapStats(page, 'square');
    expect(square.floats).toBeGreaterThan(0);
    expect(square.overlapping).toBeGreaterThan(0);
    expect(square.offset).toBeGreaterThan(0);
  });

  test('tight/through with rectangular polygons wrap like square', async ({ page }) => {
    await loadFixture(page);
    const tight = await wrapStats(page, 'tight');
    const through = await wrapStats(page, 'through');
    expect(tight.floats).toBeGreaterThan(0);
    expect(through.floats).toBeGreaterThan(0);
    expect(tight.offset).toBeGreaterThan(0);
    expect(through.offset).toBeGreaterThan(0);
  });

  test('topAndBottom images stand on their own block line', async ({ page }) => {
    await loadFixture(page);
    const block = await page.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll<HTMLElement>('.layout-block-image')
      );
      let overlappingTextLines = 0;
      for (const blockImg of blocks) {
        const blockRect = blockImg.getBoundingClientRect();
        const pageEl = blockImg.closest('[data-page-number]');
        if (!pageEl) continue;
        const lines = pageEl.querySelectorAll<HTMLElement>('.layout-paragraph .layout-line');
        for (const line of lines) {
          const lineRect = line.getBoundingClientRect();
          if (lineRect.bottom > blockRect.top + 2 && lineRect.top < blockRect.bottom - 2) {
            if ((line.textContent ?? '').trim().length > 0) overlappingTextLines++;
          }
        }
      }
      return { blocks: blocks.length, overlappingTextLines };
    });
    expect(block.blocks).toBeGreaterThan(0);
    expect(block.overlappingTextLines).toBe(0);
  });

  test('behind-text images paint below text without shrinking lines', async ({ page }) => {
    await loadFixture(page);
    const behind = await page.evaluate(() => {
      const floats = Array.from(
        document.querySelectorAll<HTMLElement>('.layout-page-floating-image[data-wrap-type="behind"]')
      );
      const behindLayers = document.querySelectorAll<HTMLElement>(
        '.layout-page-content > .layout-floating-images-layer'
      );
      let firstLayerZ = '';
      if (behindLayers.length > 0) {
        firstLayerZ = window.getComputedStyle(behindLayers[0]).zIndex;
      }
      let overlappingOffsetLines = 0;
      let overlappingTotal = 0;
      for (const float of floats) {
        const imgRect = float.getBoundingClientRect();
        const pageEl = float.closest('[data-page-number]');
        if (!pageEl) continue;
        const lines = pageEl.querySelectorAll<HTMLElement>('.layout-paragraph .layout-line');
        for (const line of lines) {
          const lineRect = line.getBoundingClientRect();
          if (lineRect.bottom > imgRect.top + 2 && lineRect.top < imgRect.bottom - 2) {
            overlappingTotal++;
            const ml = parseFloat(line.style.marginLeft) || 0;
            const mr = parseFloat(line.style.marginRight) || 0;
            if (ml > 10 || mr > 10) overlappingOffsetLines++;
          }
        }
      }
      return { floats: floats.length, overlappingTotal, overlappingOffsetLines, firstLayerZ };
    });
    expect(behind.floats).toBeGreaterThan(0);
    // Behind images must not create wrap margins on overlapping lines.
    expect(behind.overlappingOffsetLines).toBe(0);
    // Behind layer paints below text (no front z-index).
    expect(behind.firstLayerZ === '' || behind.firstLayerZ === 'auto').toBe(true);
  });

  test('in-front images paint above text without shrinking lines', async ({ page }) => {
    await loadFixture(page);
    const front = await page.evaluate(() => {
      const floats = Array.from(
        document.querySelectorAll<HTMLElement>('.layout-page-floating-image[data-wrap-type="inFront"]')
      );
      let withOffset = 0;
      for (const float of floats) {
        const imgRect = float.getBoundingClientRect();
        const pageEl = float.closest('[data-page-number]');
        if (!pageEl) continue;
        const lines = pageEl.querySelectorAll<HTMLElement>('.layout-paragraph .layout-line');
        for (const line of lines) {
          const lineRect = line.getBoundingClientRect();
          if (lineRect.bottom > imgRect.top + 2 && lineRect.top < imgRect.bottom - 2) {
            const ml = parseFloat((line as HTMLElement).style.marginLeft) || 0;
            const mr = parseFloat((line as HTMLElement).style.marginRight) || 0;
            if (ml > 10 || mr > 10) withOffset++;
          }
        }
      }
      const frontLayers = Array.from(
        document.querySelectorAll<HTMLElement>('.layout-page-content > .layout-floating-images-layer')
      );
      const zIndexes = frontLayers.map((l) => window.getComputedStyle(l).zIndex);
      return { floats: floats.length, withOffset, zIndexes };
    });
    expect(front.floats).toBeGreaterThan(0);
    expect(front.withOffset).toBe(0);
    expect(front.zIndexes).toContain('10');
  });

  test('table cell floats stay inside the cell and wrap cell text', async ({ page }) => {
    await loadFixture(page);
    const cell = await page.evaluate(() => {
      const layers = document.querySelectorAll<HTMLElement>('.layout-cell-floating-images-layer');
      const imgs = document.querySelectorAll<HTMLElement>('.layout-cell-floating-image');
      let inside = 0;
      for (const img of imgs) {
        const cellContent = img.closest('.layout-table-cell-content') as HTMLElement | null;
        if (!cellContent) continue;
        const imgRect = (img.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ?? img.getBoundingClientRect();
        const cellRect = cellContent.getBoundingClientRect();
        if (
          imgRect.left >= cellRect.left - 2 &&
          imgRect.right <= cellRect.right + 2 &&
          imgRect.top >= cellRect.top - 2
        ) {
          inside++;
        }
      }
      let cellsWithOffset = 0;
      for (const cellEl of document.querySelectorAll('.layout-table-cell-content')) {
        if (!cellEl.querySelector('.layout-cell-floating-images-layer')) continue;
        for (const line of cellEl.querySelectorAll<HTMLElement>('.layout-line')) {
          const ml = parseFloat(line.style.marginLeft) || 0;
          if (ml > 5) {
            cellsWithOffset++;
            break;
          }
        }
      }
      return { layers: layers.length, imgs: imgs.length, inside, cellsWithOffset };
    });
    expect(cell.layers).toBeGreaterThan(0);
    expect(cell.imgs).toBeGreaterThan(0);
    expect(cell.inside).toBe(cell.imgs);
    expect(cell.cellsWithOffset).toBeGreaterThan(0);
  });
});
