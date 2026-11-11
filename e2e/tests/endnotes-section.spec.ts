/**
 * Document-end endnote section (issue #89).
 *
 * The T25-07 §7 showcase ships one endnote ("生成说明……", `w:id="2"`):
 * the body reference marker paints, but the note body must also render —
 * in a trailing sheet after the last page — and reference/body must
 * scroll to each other. Demo-asserting spec (never `gotoEmpty()`):
 * loads the default sample.docx through both demo apps and drives the
 * painted pages. Adapter loop in one file, mirrors
 * internal-bookmark-navigation.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';

interface Adapter {
  name: 'react' | 'vue';
  baseUrl: string;
  shell: string;
}

const ADAPTERS: Adapter[] = [
  {
    name: 'react',
    baseUrl: process.env.E2E_REACT_URL ?? 'http://localhost:5173',
    shell: '[data-testid="docx-editor"]',
  },
  {
    name: 'vue',
    baseUrl: process.env.E2E_VUE_URL ?? 'http://localhost:5174',
    shell: '.docx-editor-vue',
  },
];

const PAGES = '.paged-editor__pages';
const CONTENT = `${PAGES} .layout-page-content`;
const SECTION = '.layout-endnotes-section';

async function gotoSample(page: Page, adapter: Adapter): Promise<void> {
  await page.goto(`${adapter.baseUrl}/?e2e=1`);
  await page.locator(adapter.shell).waitFor({ timeout: 25000 });
  await page.locator(PAGES).waitFor({ timeout: 25000 });
  await page.waitForSelector('[data-page-number]', { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready.catch(() => undefined));
  await page.waitForSelector(SECTION, { timeout: 25000 });
  await page.waitForTimeout(800);
}

/** Poll until `selector` is inside the viewport (smooth scrolls settle). */
async function waitForInViewport(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      },
      selector,
      { timeout: 8000 }
    );
    return true;
  } catch {
    return false;
  }
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

for (const adapter of ADAPTERS) {
  test.describe(`endnotes section (${adapter.name})`, () => {
    test('renders the T25-07 endnote body after the last page', async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 900 });
      await gotoSample(page, adapter);

      const section = page.locator(SECTION);
      await expect(section).toBeAttached();
      await expect(section).toContainText('生成说明');

      // The sheet trails the pages — it is not a page itself and carries
      // no page chrome.
      expect(await page.locator(`${SECTION}[data-page-number]`).count()).toBe(0);
      const pageCount = await page.locator('[data-page-number]').count();
      expect(pageCount).toBeGreaterThan(0);
    });

    test('reference and body scroll to each other', async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 900 });
      await gotoSample(page, adapter);

      // The §7 marker page starts as a virtualization shell — page down
      // until the marker paints, mirroring real user scrolling.
      const ref = page.locator(`${CONTENT} [data-endnote-ref="2"]`);
      expect(await scrollDownUntil(page, ref)).toBe(true);

      // Reference → body: clicking the in-line marker brings the note item
      // into view.
      await ref.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await ref.first().click();
      expect(await waitForInViewport(page, '[data-endnote-id="2"]')).toBe(true);

      // Body → reference: clicking the item number jumps back to the marker.
      await page.locator('[data-endnote-backref="2"]').first().click();
      expect(await waitForInViewport(page, `${CONTENT} [data-endnote-ref="2"]`)).toBe(true);
    });
  });
}
