/**
 * Internal bookmark navigation (issue #88).
 *
 * Documents with `w:hyperlink w:anchor` pointing at `w:bookmarkStart`
 * (Word jumps; e.g. the T25-07 §7 showcase's "← 返回本节开头" link):
 * clicking the painted link must scroll the viewport to the bookmark
 * instead of opening a blank tab via `window.open('#...')`.
 *
 * Demo-asserting spec (never `gotoEmpty()`): loads the default sample.docx
 * through the real demo apps (React :5173 + Vue :5174, `?e2e=1`) and drives
 * the painted pages. Adapter loop in one file, mirrors demo-showcase.spec.ts.
 *
 * Covers:
 * - backlink click jumps the viewport from §7's end back to §7's start,
 *   in both adapters (Vue regressed: a spurious selection-triggered
 *   relayout replaced the anchor between mousedown/mouseup, swallowing
 *   the click event entirely);
 * - external links still surface the HyperlinkPopup (no behavior change).
 */
import { test, expect, type Page } from '@playwright/test';

interface Adapter {
  name: 'react' | 'vue';
  baseUrl: string;
  shell: string;
  popup: string;
}

const ADAPTERS: Adapter[] = [
  {
    name: 'react',
    baseUrl: 'http://localhost:5173',
    shell: '[data-testid="docx-editor"]',
    popup: '.ep-hyperlink-popup',
  },
  {
    name: 'vue',
    baseUrl: 'http://localhost:5174',
    shell: '.docx-editor-vue',
    popup: '.docx-hyperlink-popup',
  },
];

const PAGES = '.paged-editor__pages';
const CONTENT = `${PAGES} .layout-page-content`;

async function gotoSample(page: Page, adapter: Adapter): Promise<void> {
  await page.goto(`${adapter.baseUrl}/?e2e=1`);
  await page.locator(adapter.shell).waitFor({ timeout: 25000 });
  await page.locator(PAGES).waitFor({ timeout: 25000 });
  await page.waitForSelector('[data-page-number]', { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready.catch(() => undefined));
  await page.waitForTimeout(800);
}

/** Scroll offset of whatever ancestor actually scrolls the painted pages. */
function scrollerTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const pages = document.querySelector('.paged-editor__pages');
    let el: HTMLElement | null = pages ? (pages.parentElement as HTMLElement | null) : null;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 20) return el.scrollTop;
      el = el.parentElement as HTMLElement | null;
    }
    return window.scrollY;
  });
}

/** Incrementally scroll down until the locator matches (virtualized paint). */
async function scrollDownUntil(
  page: Page,
  locator: ReturnType<Page['locator']>,
  maxSteps = 60
): Promise<boolean> {
  for (let i = 0; i < maxSteps; i++) {
    if ((await locator.count()) > 0) return true;
    await page.evaluate(() => {
      const pages = document.querySelector('.paged-editor__pages');
      let el: HTMLElement | null = pages ? (pages.parentElement as HTMLElement | null) : null;
      while (el) {
        if (el.scrollHeight > el.clientHeight + 20) {
          el.scrollTop += el.clientHeight;
          return;
        }
        el = el.parentElement as HTMLElement | null;
      }
    });
    await page.waitForTimeout(350);
  }
  return (await locator.count()) > 0;
}

test.describe('internal bookmark navigation (#88)', () => {
  for (const adapter of ADAPTERS) {
    test(`backlink click jumps to section start [${adapter.name}]`, async ({ page }) => {
      await gotoSample(page, adapter);
      const link = page.locator(`${CONTENT} a[href="#_Toc7001"]`, {
        hasText: '返回本节开头',
      });
      expect(await scrollDownUntil(page, link)).toBe(true);
      await link.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      const before = await scrollerTop(page);

      // The navigate action must not open a new tab (the old window.open
      // behavior for internal hrefs).
      const popupPagePromise = page
        .context()
        .waitForEvent('page', { timeout: 4000 })
        .catch(() => null);
      await link.first().click();
      await page.waitForTimeout(1500);
      const after = await scrollerTop(page);
      const popupPage = await popupPagePromise;
      if (popupPage) await popupPage.close().catch(() => undefined);

      expect(popupPage, 'internal link must not open a new tab').toBeNull();
      // The §7 backlink sits at the document end; §7's start is near the
      // top — a successful jump moves the viewport up by well over a page.
      expect(after, `viewport jumps to bookmark (before=${before})`).toBeLessThan(before - 1000);
      // §7's heading is visible after the jump.
      const heading = page
        .locator(`${CONTENT}`)
        .getByText('§7 版式与域 Layout & fields', { exact: false })
        .first();
      const box = await heading.boundingBox();
      expect(box, '§7 heading visible after jump').not.toBeNull();
      const viewportHeight = page.viewportSize()?.height ?? 720;
      expect(box!.y).toBeGreaterThanOrEqual(-50);
      expect(box!.y).toBeLessThanOrEqual(viewportHeight);
    });

    test(`external link still opens the popup [${adapter.name}]`, async ({ page }) => {
      await gotoSample(page, adapter);
      const link = page.locator(`${CONTENT} a[href^="https://"]`).first();
      await link.scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await link.click();
      await expect(page.locator(adapter.popup).first()).toBeVisible({ timeout: 8000 });
      await page.keyboard.press('Escape');
    });
  }
});
