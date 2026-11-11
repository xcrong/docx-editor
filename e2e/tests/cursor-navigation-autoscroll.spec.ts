/**
 * T30 cursor navigation & auto-scroll (React).
 *
 * Covers the three scenarios from openspec/changes/cursor-navigation-autoscroll:
 * 1. ArrowUp/Down steps one visual line at a time and auto-scrolls one line
 *    at the viewport bottom (no page jump).
 * 2. Drag-select near the viewport edge auto-scrolls with selection
 *    extension; leaving the edge stops the scroll.
 * 3. Drag-select across a split paragraph (`data-continues-on-next` /
 *    `data-continues-from-prev`) spanning two pages stays continuous.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
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
} from '../helpers/cursor-nav-autoscroll';

const SCROLLER = '.docx-editor__scroll-container';

test.describe('T30 cursor navigation & auto-scroll (React)', () => {
  test('arrow-down steps one visual line and auto-scrolls at the bottom', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await page.waitForSelector(BODY_SPAN, { timeout: 15000 });
    expect(await getTotalPages(page)).toBeGreaterThanOrEqual(2);

    await placeCaretAtFirstSpan(page);
    const lineH = await measureLineHeight(page);

    // One visual line per press: anchors strictly increase and the caret Y
    // advances by roughly one line height (no skips, no stuck presses).
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

    // Keep going: the scroller must follow the caret by line-sized amounts,
    // never a full page jump, and the caret must stay inside the viewport.
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
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await page.waitForSelector(BODY_SPAN, { timeout: 15000 });
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

    // Leaving the edge zone stops the scroll; the selection stays extended.
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
    const editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
    await insertLongParagraph(page, 6000);

    const pair = await findSplitPair(page);
    expect(pair).not.toBeNull();
    if (!pair) return;

    // Put the caret inside fragment A first so post-layout scroll effects
    // settle before the drag starts.
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

    // Drag to the bottom edge; auto-scroll carries page 2 into view.
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height - 8, { steps: 10 });
    // Land on the first visible span of the continuation fragment so the
    // selection head passes through the fragment's start.
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
