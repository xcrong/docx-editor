/**
 * Shared helpers for the T30 cursor-navigation / auto-scroll / cross-page
 * selection specs (React + Vue run the same flows with different boot URLs
 * and scroller/caret selectors).
 */
import type { Page } from '@playwright/test';

export const BODY_SPAN = '.layout-page-content span[data-pm-start]';
export const BODY_LINE = '.layout-page-content .layout-line';
export const SPLIT_TAIL = '.layout-page-content .layout-paragraph[data-continues-on-next="true"]';
export const SPLIT_HEAD = '.layout-page-content .layout-paragraph[data-continues-from-prev="true"]';
export const CARET_ANY = '[data-testid="caret"], .vue-caret';

export async function placeCaretAtFirstSpan(page: Page): Promise<void> {
  const span = page.locator(BODY_SPAN).first();
  await span.waitFor({ state: 'visible', timeout: 15000 });
  await span.click();
  await page.waitForTimeout(200);
}

export async function getAnchor(page: Page): Promise<number> {
  const anchor = await page.evaluate(
    () => window.__DOCX_EDITOR_E2E__?.getSelectionAnchor() ?? null
  );
  if (anchor === null) throw new Error('no PM selection anchor');
  return anchor;
}

export async function getSelectedText(page: Page): Promise<string> {
  return (await page.evaluate(
    () => window.__DOCX_EDITOR_E2E__?.agentSelection()?.selectedText ?? ''
  )) as string;
}

export async function getTotalPages(page: Page): Promise<number> {
  return (await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.getTotalPages() ?? 0)) as number;
}

export async function getScrollTop(page: Page, scroller: string): Promise<number> {
  return (await page.locator(scroller).evaluate((el) => (el as HTMLElement).scrollTop)) as number;
}

export async function setScrollTop(page: Page, scroller: string, top: number): Promise<void> {
  await page.locator(scroller).evaluate((el, t) => ((el as HTMLElement).scrollTop = t), top);
  await page.waitForTimeout(150);
}

export async function getScrollerRect(
  page: Page,
  scroller: string
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(scroller).boundingBox();
  if (!box) throw new Error(`scroller ${scroller} has no box`);
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

export async function getCaretPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(CARET_ANY).first().boundingBox({ timeout: 5000 });
  if (!box) throw new Error('painted caret not found');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function measureLineHeight(page: Page): Promise<number> {
  const box = await page.locator(BODY_LINE).first().boundingBox({ timeout: 15000 });
  if (!box || box.height <= 0) throw new Error('no painted line box');
  return box.height;
}

/** Insert one long paragraph (via the PM view) so it splits across pages. */
export async function insertLongParagraph(page: Page, chars: number): Promise<void> {
  const text = `${'lorem ipsum dolor sit amet '.repeat(Math.ceil(chars / 27))}`.slice(0, chars);
  await page.evaluate((t) => {
    const view = window.__DOCX_EDITOR_E2E__?.getView?.() as unknown as {
      state: { tr: { insertText: (s: string, p: number) => unknown } };
      dispatch: (tr: unknown) => void;
    } | null;
    if (!view) throw new Error('no PM view');
    view.dispatch(view.state.tr.insertText(t, 1));
  }, text);
  await page.waitForSelector(SPLIT_TAIL, { state: 'visible', timeout: 15000 });
}

export interface SplitPair {
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Whitespace-compacted tail of fragment A / head of fragment B. */
  aTail: string;
  bHead: string;
}

/** Resolve the first split-paragraph fragment pair + client coords. Null when absent. */
export async function findSplitPair(page: Page): Promise<SplitPair | null> {
  return (await page.evaluate(() => {
    const paras = Array.from(
      document.querySelectorAll('.layout-page-content .layout-paragraph')
    ) as HTMLElement[];
    const ai = paras.findIndex((el) => el.dataset.continuesOnNext === 'true');
    if (ai < 0) return null;
    const id = paras[ai].dataset.blockId;
    const b = paras
      .slice(ai + 1)
      .find((el) => el.dataset.blockId === id && el.dataset.continuesFromPrev === 'true');
    if (!b) return null;
    const compact = (s: string) => s.replace(/\s+/g, '');
    const aText = compact(paras[ai].textContent ?? '');
    const bText = compact(b.textContent ?? '');
    if (aText.length < 32 || bText.length < 32) return null;
    const ra = paras[ai].getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return {
      a: { x: ra.x + ra.width / 2, y: ra.y + Math.min(ra.height - 4, 12) },
      b: { x: rb.x + rb.width / 2, y: rb.y + 12 },
      aTail: aText.slice(-24),
      bHead: bText.slice(0, 24),
    };
  })) as SplitPair | null;
}

export async function scrollIntoViewCenter(page: Page, selector: string, index = 0): Promise<void> {
  await page.evaluate(
    ({ sel, i }) => {
      const el = document.querySelectorAll(sel)[i] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'center' });
    },
    { sel: selector, i: index }
  );
  await page.waitForTimeout(300);
}

/**
 * Client coords of a span inside `fragmentSelector` that is actually inside
 * the scroller viewport. `which: 'first' | 'last'` picks the first/last
 * visible span — 'last' for the tail fragment's end, 'first' for the head
 * fragment's start. Returns null when no span of the fragment is visible.
 */
export async function findVisibleSpanPoint(
  page: Page,
  scroller: string,
  fragmentSelector: string,
  which: 'first' | 'last' = 'first'
): Promise<{ x: number; y: number; pmStart: number; pmEnd: number } | null> {
  return (await page.evaluate(
    ({ scrollerSel, fragSel, mode }) => {
      const scrollerEl = document.querySelector(scrollerSel) as HTMLElement | null;
      if (!scrollerEl) return null;
      const s = scrollerEl.getBoundingClientRect();
      const spans = Array.from(
        document.querySelectorAll(`${fragSel} span[data-pm-start][data-pm-end]`)
      ) as HTMLElement[];
      const visible = spans.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > s.top + 20 && r.top < s.bottom - 20 && r.width > 0 && r.height > 0;
      });
      if (visible.length === 0) return null;
      const el = mode === 'last' ? visible[visible.length - 1] : visible[0];
      const r = el.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        pmStart: Number(el.dataset.pmStart),
        pmEnd: Number(el.dataset.pmEnd),
      };
    },
    { scrollerSel: scroller, fragSel: fragmentSelector, mode: which }
  )) as { x: number; y: number; pmStart: number; pmEnd: number } | null;
}

/** True when the element's box intersects the scroller's viewport. */
export async function waitForVisibleInScroller(
  page: Page,
  scroller: string,
  selector: string,
  timeout = 8000
): Promise<void> {
  await page.waitForFunction(
    ({ scrollerSel, sel }) => {
      const scrollerEl = document.querySelector(scrollerSel) as HTMLElement | null;
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!scrollerEl || !el) return false;
      const r = el.getBoundingClientRect();
      const s = scrollerEl.getBoundingClientRect();
      return r.top < s.bottom - 20 && r.bottom > s.top + 20;
    },
    { scrollerSel: scroller, sel: selector },
    { timeout }
  );
}
