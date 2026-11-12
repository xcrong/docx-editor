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
          // Centered bothSides floats split the line into two segments instead
          // of side margins (layout-line-split); both reserve space for the float.
          if (ml > 10 || mr > 10 || line.classList.contains('layout-line-split')) offset++;
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
    // topAndBottom images render in-flow as block images (not in the floating
    // layer). The no-wrap-margins property itself is covered on the clean
    // single-mode fixture in image-layout-modes.spec.ts; here we assert
    // presence and in-flow placement since this dense fixture stacks many
    // floats whose side margins legitimately appear near block images.
    const block = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll<HTMLElement>('.layout-block-image'));
      let inFloatingLayer = 0;
      let withSize = 0;
      for (const blockImg of blocks) {
        if (blockImg.closest('.layout-floating-images-layer')) inFloatingLayer++;
        const r = blockImg.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) withSize++;
      }
      return { blocks: blocks.length, inFloatingLayer, withSize };
    });
    expect(block.blocks).toBeGreaterThan(0);
    expect(block.inFloatingLayer).toBe(0);
    expect(block.withSize).toBe(block.blocks);
  });

  test('behind-text images paint below text without shrinking lines', async ({ page }) => {
    await loadFixture(page);
    const behind = await page.evaluate(() => {
      const floats = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.layout-page-floating-image[data-wrap-type="behind"]'
        )
      );
      let layersWithoutFrontZ = 0;
      let overlappingOffsetLines = 0;
      let overlappingTotal = 0;
      for (const float of floats) {
        // Each behind float must live in a layer without the front z-index —
        // scoped to its own layer so a front-only first page can't flake it.
        const layer = float.closest('.layout-floating-images-layer') as HTMLElement | null;
        const z = layer ? window.getComputedStyle(layer).zIndex : '';
        if (z === '' || z === 'auto') layersWithoutFrontZ++;
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
      return {
        floats: floats.length,
        overlappingTotal,
        overlappingOffsetLines,
        layersWithoutFrontZ,
      };
    });
    expect(behind.floats).toBeGreaterThan(0);
    // Behind images must not create wrap margins on overlapping lines.
    expect(behind.overlappingOffsetLines).toBe(0);
    // Behind floats paint below text (their own layers carry no front z-index).
    expect(behind.layersWithoutFrontZ).toBe(behind.floats);
  });

  test('in-front images paint above text without shrinking lines', async ({ page }) => {
    await loadFixture(page);
    const front = await page.evaluate(() => {
      const floats = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.layout-page-floating-image[data-wrap-type="inFront"]'
        )
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
        document.querySelectorAll<HTMLElement>(
          '.layout-page-content > .layout-floating-images-layer'
        )
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
        const imgRect =
          (img.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ??
          img.getBoundingClientRect();
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

test.describe('Floating image layout (polygon + grid)', () => {
  const POLYGON_GRID_FIXTURE = 'fixtures/float-wrap-polygon-grid-test.docx';

  async function loadPolygonGridFixture(page: Page) {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await page
      .locator('input[type="file"][accept=".docx"]')
      .setInputFiles(`e2e/${POLYGON_GRID_FIXTURE}`);
    await page.waitForSelector('.paged-editor__pages');
    await page.waitForSelector('[data-page-number]');
    await page.waitForTimeout(2000);
  }

  test('tight triangle polygon narrows the exclusion down the image', async ({ page }) => {
    await loadPolygonGridFixture(page);
    const result = await page.evaluate(() => {
      const floats = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.layout-page-floating-image[data-wrap-type="tight"]'
        )
      );
      const perFloat: { lines: number; minMl: number; maxMl: number; unwrapped: number }[] = [];
      for (const float of floats) {
        const imgRect = float.getBoundingClientRect();
        const pageEl = float.closest('[data-page-number]');
        if (!pageEl) continue;
        let minMl = Infinity;
        let maxMl = -Infinity;
        let lines = 0;
        let unwrapped = 0;
        for (const line of pageEl.querySelectorAll<HTMLElement>('.layout-paragraph .layout-line')) {
          const lineRect = line.getBoundingClientRect();
          if (lineRect.bottom > imgRect.top + 2 && lineRect.top < imgRect.bottom - 2) {
            lines++;
            const ml = parseFloat(line.style.marginLeft) || 0;
            if (ml < 5) unwrapped++;
            if (ml < minMl) minMl = ml;
            if (ml > maxMl) maxMl = ml;
          }
        }
        perFloat.push({ lines, minMl, maxMl, unwrapped });
      }
      return perFloat;
    });
    expect(result.length).toBeGreaterThan(0);
    // The triangle float wraps every overlapping line and its single-side
    // margin varies from full-width (top) to narrow (tip).
    const triangle = result.find((f) => f.lines >= 4 && f.maxMl - f.minMl > 20);
    expect(triangle).toBeDefined();
    expect(triangle!.unwrapped).toBe(0);
  });

  test('multiple images in table grid do not overlap', async ({ page }) => {
    await loadPolygonGridFixture(page);
    const grid = await page.evaluate(() => {
      const imgs = Array.from(
        document.querySelectorAll<HTMLElement>('.layout-cell-floating-image')
      );
      const byCell = new Map<Element, DOMRect[]>();
      let inside = 0;
      for (const img of imgs) {
        const cellContent = img.closest('.layout-table-cell-content');
        if (!cellContent) continue;
        const imgRect =
          (img.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ??
          img.getBoundingClientRect();
        const cellRect = cellContent.getBoundingClientRect();
        if (
          imgRect.left >= cellRect.left - 2 &&
          imgRect.right <= cellRect.right + 2 &&
          imgRect.top >= cellRect.top - 2 &&
          imgRect.bottom <= cellRect.bottom + 2
        ) {
          inside++;
        }
        const list = byCell.get(cellContent) ?? [];
        list.push(imgRect);
        byCell.set(cellContent, list);
      }
      let overlappingPairs = 0;
      let maxInCell = 0;
      for (const rects of byCell.values()) {
        maxInCell = Math.max(maxInCell, rects.length);
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i]!;
            const b = rects[j]!;
            if (
              a.left < b.right - 1 &&
              b.left < a.right - 1 &&
              a.top < b.bottom - 1 &&
              b.top < a.bottom - 1
            ) {
              overlappingPairs++;
            }
          }
        }
      }
      let cellsWithOffset = 0;
      for (const cellEl of document.querySelectorAll('.layout-table-cell-content')) {
        if (!cellEl.querySelector('.layout-cell-floating-images-layer')) continue;
        for (const line of cellEl.querySelectorAll<HTMLElement>('.layout-line')) {
          const ml = parseFloat((line as HTMLElement).style.marginLeft) || 0;
          if (ml > 5) {
            cellsWithOffset++;
            break;
          }
        }
      }
      return { imgs: imgs.length, inside, overlappingPairs, maxInCell, cellsWithOffset };
    });
    // 2x2 grid: twin cell holds 2 floats, the other three hold 1 each.
    expect(grid.imgs).toBe(5);
    expect(grid.maxInCell).toBe(2);
    expect(grid.inside).toBe(grid.imgs);
    expect(grid.overlappingPairs).toBe(0);
    expect(grid.cellsWithOffset).toBeGreaterThan(0);
  });
});
