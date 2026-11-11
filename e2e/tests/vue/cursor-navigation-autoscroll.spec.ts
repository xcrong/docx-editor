/**
 * T30 cursor navigation & auto-scroll (Vue) — same three scenarios as the
 * React suite, driven against the Vue demo (port 5174).
 */
import { test, expect } from '@playwright/test';
import {
  BODY_SPAN,
  SPLIT_HEAD,
  SPLIT_TAIL,
  findSplitPair,
  findVisibleSpanPoint,
  getAnchor,
  getCaretPoint,
  getScrollerRect,
  getScrollTop,
  getSelectedText,
  getTotalPages,
  insertLongParagraph,
  measureLineHeight,
  placeCaretAtFirstSpan,
  scrollIntoViewCenter,
  setScrollTop,
} from '../../helpers/cursor-nav-autoscroll';

// NOTE: the scrolling element is the inner pages viewport
// (`overflow: auto`); the outer `__editor-scroll` is `overflow: hidden`.
const SCROLLER = '.docx-editor-vue__pages-viewport';

test.describe('T30 cursor navigation & auto-scroll (Vue)', () => {
  test('arrow-down steps one visual line and auto-scrolls at the bottom', async ({ page }) => {
    await boot(page);
    expect(await getTotalPages(page)).toBeGreaterThanOrEqual(2);

    await placeCaretAtFirstSpan(page);
    const lineH = await measureLineHeight(page);

    const anchors: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
      anchors.push(await getAnchor(page));
      ys.push((await getCaretPoint(page)).y);
    }
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i]).toBeGreaterThan(anchors[i - 1]);
    }
    for (let i = 1; i < ys.length; i++) {
      const step = ys[i] - ys[i - 1];
      expect(step).toBeGreaterThan(lineH * 0.4);
      expect(step).toBeLessThan(lineH * 2.2);
    }

    const rect = await getScrollerRect(page, SCROLLER);
    const startTop = await getScrollTop(page, SCROLLER);
    let scrolled = false;
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
      const top = await getScrollTop(page, SCROLLER);
      if (top - startTop > lineH * 0.5) {
        expect(top - startTop).toBeLessThan(rect.height);
        scrolled = true;
        break;
      }
    }
    expect(scrolled).toBe(true);
    const caret = await getCaretPoint(page);
    expect(caret.y).toBeGreaterThan(rect.y);
    expect(caret.y).toBeLessThan(rect.y + rect.height);
  });

  test('drag-select near the bottom edge auto-scrolls and stops off-edge', async ({ page }) => {
    await boot(page);
    await setScrollTop(page, SCROLLER, 0);
    await placeCaretAtFirstSpan(page);
    // Let Vue's multi-click window (500ms, same position → word select)
    // expire so the mousedown below starts a drag, not a double-click.
    await page.waitForTimeout(650);

    const spanBox = await page.locator(BODY_SPAN).first().boundingBox();
    if (!spanBox) throw new Error('first body span has no box');
    const rect = await getScrollerRect(page, SCROLLER);

    await page.mouse.move(spanBox.x + spanBox.width / 2, spanBox.y + spanBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height - 8, { steps: 12 });

    const selBefore = (await getSelectedText(page)).length;
    const topBefore = await getScrollTop(page, SCROLLER);
    await page.waitForFunction(
      ({ sel, min }) => (document.querySelector(sel) as HTMLElement).scrollTop > min,
      { sel: SCROLLER, min: topBefore + 40 },
      { timeout: 8000 }
    );
    const scrolledTop = await getScrollTop(page, SCROLLER);
    const grownSel = (await getSelectedText(page)).length;
    expect(scrolledTop).toBeGreaterThan(topBefore + 40);
    expect(grownSel).toBeGreaterThan(selBefore);

    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 8 });
    await page.waitForTimeout(300);
    const settleA = await getScrollTop(page, SCROLLER);
    await page.waitForTimeout(400);
    const settleB = await getScrollTop(page, SCROLLER);
    expect(Math.abs(settleB - settleA)).toBeLessThanOrEqual(2);
    await page.mouse.up();
    expect((await getSelectedText(page)).length).toBeGreaterThan(0);
  });

  test('drag-select across a split paragraph spanning two pages stays continuous', async ({
    page,
  }) => {
    await bootEmpty(page);
    await insertLongParagraph(page, 6000);

    const pair = await findSplitPair(page);
    expect(pair).not.toBeNull();
    if (!pair) return;

    await scrollIntoViewCenter(page, SPLIT_TAIL);
    const downAt = await findVisibleSpanPoint(page, SCROLLER, SPLIT_TAIL, 'last');
    if (!downAt) throw new Error('no visible span in split tail fragment');
    await page.mouse.move(downAt.x, downAt.y);
    await page.mouse.down();
    await page.waitForTimeout(200);
    const anchor = await getAnchor(page);
    // Clicking the span center lands inside the span's PM range.
    expect(anchor).toBeGreaterThanOrEqual(downAt.pmStart);
    expect(anchor).toBeLessThanOrEqual(downAt.pmEnd);
    const rect = await getScrollerRect(page, SCROLLER);

    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height - 8, { steps: 10 });
    let headAt: { x: number; y: number } | null = null;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      headAt = await findVisibleSpanPoint(page, SCROLLER, SPLIT_HEAD, 'first');
      if (headAt) break;
      await page.waitForTimeout(250);
    }
    if (!headAt) throw new Error('continuation fragment never scrolled into view');
    await page.mouse.move(headAt.x, headAt.y, { steps: 10 });
    await page.mouse.up();

    const selected = (await getSelectedText(page)).replace(/\s+/g, '');
    expect(selected).toContain(pair.aTail);
    expect(selected).toContain(pair.bHead);
  });
});

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('http://localhost:5174/?e2e=1');
  await page.locator('.docx-editor-vue').waitFor({ timeout: 15000 });
  await page.locator('.paged-editor__pages').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => (window.__DOCX_EDITOR_E2E__?.getTotalPages() ?? 0) >= 1, {
    timeout: 20000,
  });
  await page.waitForSelector(BODY_SPAN, { timeout: 15000 });
}

async function bootEmpty(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('http://localhost:5174/?e2e=1&empty=1');
  await page.locator('.docx-editor-vue').waitFor({ timeout: 15000 });
  await page.locator('.paged-editor__pages').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator('.paged-editor__pages').click({ position: { x: 100, y: 100 } });
  await page.waitForTimeout(300);
}
