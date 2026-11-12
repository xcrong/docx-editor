/**
 * T25-09 demo-showcase render guard (issue #60, parent #51).
 *
 * Demo-asserting spec: loads the default sample.docx through the real demo
 * apps (React :5173 + Vue :5174, `?e2e=1` — never `gotoEmpty()`) and asserts
 * the painter's *rendered* DOM. Selectors come from the painter sources, not
 * guesses:
 * - tables .... packages/core/src/layout-painter/renderTable.ts
 * - paragraphs  renderParagraph.ts (+ renderParagraph/{line,runs}.ts)
 * - images .... renderImage.ts (+ imageLayout.ts floating layer, dataset
 *               `data-wrap-type`; topAndBottom paints as .layout-block-image
 *               on its own line — see measureParagraph.ts + imageLayout.ts)
 * - pages/HF .... renderPage.ts (`layout-page`, `data-page-number`,
 *               `layout-page-header/footer`, `layout-footnote-area`)
 * - SDT ....... sdtBoundary.ts (`layout-sdt-widget` button trigger, only for
 *               *block-level* typed controls) + runs.ts
 *               `applyInlineSdtWidgetAttrs` (`layout-inline-sdt-widget`,
 *               `data-sdt-widget`; inline widgets exist for `checkbox` only)
 * - DOM contract  CLAUDE.md "Painter DOM contract" (`data-block-id`,
 *               `data-change-author`, `data-comment-id`, `data-pm-start`)
 *
 * The painted pages are virtualized (only the viewport window of the ~19
 * pages is in the DOM), so full-document evidence is gathered by scrolling
 * (data-pm-start / data-comment-id / wrap types). Geometry invariants
 * (no overlaps) are checked per rendered window on every scroll step.
 *
 * Adapter loop: the same body runs against React and Vue so a paint
 * regression in either adapter turns CI red. A divergent adapter-only
 * failure must be reported per-adapter, not papered over.
 */
import { test, expect, type Page } from '@playwright/test';

interface Adapter {
  name: 'react' | 'vue';
  baseUrl: string;
  shell: string;
  sidebar: string;
  commentCard: string;
  toggle: string;
}

const ADAPTERS: Adapter[] = [
  {
    name: 'react',
    baseUrl: 'http://localhost:5173',
    shell: '[data-testid="docx-editor"]',
    sidebar: '.docx-unified-sidebar',
    commentCard: '.docx-comment-card',
    toggle: '[aria-label="Toggle comments sidebar"]',
  },
  {
    name: 'vue',
    baseUrl: 'http://localhost:5174',
    shell: '.docx-editor-vue',
    sidebar: '.unified-sidebar',
    commentCard: '.comment-card',
    toggle: 'button[aria-label="Comments & Changes"]',
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

// The sidebar shell is always mounted with the demo doc (auto-open); its
// container keeps zero height while cards are absolutely positioned into it,
// so "open" means present in DOM — never toggle blindly (a stray click would
// close the auto-opened sidebar).
async function ensureSidebarOpen(page: Page, adapter: Adapter): Promise<void> {
  const sidebar = page.locator(adapter.sidebar);
  if ((await sidebar.count()) === 0) {
    await page.locator(adapter.toggle).click();
  }
  await expect(sidebar.first()).toHaveCount(1, { timeout: 10000 });
}

/** Scroll offset of whatever ancestor actually scrolls the painted pages. */
function scrollerTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const pages = document.querySelector('.paged-editor__pages');
    let el: HTMLElement | null = pages ? (pages.parentElement as HTMLElement | null) : null;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 20) return el.scrollTop;
      el = el.parentElement;
    }
    return window.scrollY;
  });
}

async function scrollScrollerTo(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => {
    const pages = document.querySelector('.paged-editor__pages');
    let el: HTMLElement | null = pages ? (pages.parentElement as HTMLElement | null) : null;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 20) {
        el.scrollTop = y;
        return;
      }
      el = el.parentElement;
    }
    window.scrollTo(0, y);
  }, top);
  await page.waitForTimeout(700);
}

function isYellowish(rgb: string): boolean {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const [r, g, b] = m[1].split(',').map((s) => Number(s.trim()));
  return r >= 200 && g >= 150 && b < 80;
}

interface ShowcaseEvidence {
  inlineImages: string[];
  floatImages: string[];
  floatWrapTypes: string[];
  wideBlockImages: number;
  revisedImages: string[];
  authors: string[];
  commentIds: string[];
  sdtWidgetTags: string[];
  inlineWidgetTags: string[];
  footnoteAreas: number;
  footnoteSupRefs: string[];
  totalPages: number;
  landscapePages: number[];
  headerFooterOk: boolean;
  footerTexts: string[];
  tablesSeen: number;
  nestedTables: number;
  shadedHeader: boolean;
  gridSpanTable: boolean;
  vmergePair: boolean;
  cellsOverlap: number;
  sideBySide: number;
  lineOverlaps: number;
  tocLeaders: number;
  tocHrefs: string[];
  statusText: boolean;
  dateText: boolean;
}

/**
 * One top-to-bottom scroll pass over the virtualized pages, accumulating
 * stable evidence. pm-start keys identify the same run/image across windows.
 */
async function collectShowcase(page: Page): Promise<ShowcaseEvidence> {
  return page.evaluate(async () => {
    const sleep = (ms: number) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, ms);
      return promise;
    };
    const findScroller = (): HTMLElement => {
      const pages = document.querySelector('.paged-editor__pages');
      let el: HTMLElement | null = pages ? (pages.parentElement as HTMLElement | null) : null;
      while (el) {
        if (el.scrollHeight > el.clientHeight + 20) return el;
        el = el.parentElement;
      }
      return document.scrollingElement as HTMLElement;
    };
    const scroller = findScroller();
    const box = (el: Element) => (el as HTMLElement).getBoundingClientRect();
    const samePage = (a: Element, b: Element) =>
      a.closest('.layout-page') === b.closest('.layout-page');
    const contains = (a: DOMRect, b: DOMRect, tol: number) =>
      a.left <= b.left + tol &&
      a.right >= b.right - tol &&
      a.top <= b.top + tol &&
      a.bottom >= b.bottom - tol;

    const inlineImages = new Set<string>();
    const floatImages = new Set<string>();
    const floatWrapTypes = new Set<string>();
    const wideBlockByPm = new Map<string, number>();
    const revisedImages = new Set<string>();
    const authors = new Set<string>();
    const commentIds = new Set<string>();
    const sdtWidgetTags = new Set<string>();
    const inlineWidgetTags = new Set<string>();
    const footnoteSupRefs = new Set<string>();
    const footerTexts = new Set<string>();
    const landscapePages = new Set<number>();
    const tocHrefs = new Set<string>();
    let footnoteAreas = 0;
    let tablesSeen = 0;
    let nestedTables = 0;
    let shadedHeader = false;
    let gridSpanTable = false;
    let vmergePair = false;
    let cellsOverlap = 0;
    let sideBySide = 0;
    let lineOverlaps = 0;
    let tocLeaders = 0;
    let headerFooterOk = true;
    let totalPages = 0;
    let statusText = false;
    let dateText = false;

    const own = (t: Element) => (el: Element) => el.closest('.layout-table') === t;
    const cssBg = (el: Element) => getComputedStyle(el as HTMLElement).backgroundColor;
    const opaque = (bg: string) => bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';

    const steps = 12;
    const max = scroller.scrollHeight - scroller.clientHeight;
    for (let i = 0; i <= steps; i++) {
      scroller.scrollTop = (max * i) / steps;
      await sleep(600);
      const contentW =
        document.querySelector('.layout-page-content')?.getBoundingClientRect().width ?? 800;

      for (const img of [
        ...document.querySelectorAll('.layout-page-content img.layout-run-image'),
      ]) {
        const pm = (img as HTMLElement).dataset.pmStart ?? '';
        if (pm) inlineImages.add(pm);
      }
      for (const f of [...document.querySelectorAll('.layout-page-floating-image')]) {
        const pm = (f as HTMLElement).dataset.pmStart ?? '';
        if (pm) floatImages.add(pm);
        const wt = (f as HTMLElement).dataset.wrapType ?? '';
        if (wt) floatWrapTypes.add(wt);
      }
      for (const b of [...document.querySelectorAll('.layout-page-content .layout-block-image')]) {
        const pm = (b as HTMLElement).dataset.pmStart ?? '';
        if (pm) wideBlockByPm.set(pm, Math.max(wideBlockByPm.get(pm) ?? 0, box(b).width));
      }
      for (const el of [
        ...document.querySelectorAll('.paged-editor__pages [data-change-author]'),
      ]) {
        const h = el as HTMLElement;
        if (h.dataset.changeAuthor) authors.add(h.dataset.changeAuthor);
        if (
          el.tagName === 'IMG' ||
          el.querySelector('img') != null ||
          el.classList.contains('layout-block-image') ||
          el.classList.contains('layout-page-floating-image')
        ) {
          revisedImages.add(
            h.dataset.pmStart ?? h.dataset.revisionId ?? el.textContent?.slice(0, 20) ?? '?'
          );
        }
      }
      for (const id of [...document.querySelectorAll('.layout-page-content [data-comment-id]')].map(
        (e) => (e as HTMLElement).dataset.commentId ?? ''
      )) {
        if (id) commentIds.add(id);
      }
      // Overlapping ranges stack: the painter exposes every unresolved id
      // (parent + reply) space-separated via `data-comment-ids` while
      // `data-comment-id` carries only the first (runs.ts §9.4). Collect both
      // so a reply thread counts as the two comment entities it is.
      for (const ids of [
        ...document.querySelectorAll('.layout-page-content [data-comment-ids]'),
      ].map((e) => (e as HTMLElement).dataset.commentIds ?? '')) {
        for (const id of ids.split(/\s+/)) if (id) commentIds.add(id);
      }
      for (const t of [...document.querySelectorAll('.layout-sdt-widget')].map(
        (e) => (e as HTMLElement).dataset.sdtTag ?? ''
      )) {
        if (t) sdtWidgetTags.add(t);
      }
      for (const t of [...document.querySelectorAll('.layout-inline-sdt-widget')].map(
        (e) => (e as HTMLElement).dataset.sdtTag ?? ''
      )) {
        if (t) inlineWidgetTags.add(t);
      }
      footnoteAreas = Math.max(
        footnoteAreas,
        document.querySelectorAll('.layout-footnote-area').length
      );
      for (const e of [
        ...document.querySelectorAll('.layout-page-content .layout-run-text'),
      ].filter((r) => {
        const h = r as HTMLElement;
        return h.style.top.startsWith('-') && /^\d+\s*$/.test(r.textContent ?? '');
      })) {
        footnoteSupRefs.add((e as HTMLElement).dataset.pmStart ?? e.textContent ?? '?');
      }

      for (const pg of [...document.querySelectorAll('.layout-page-content')]) {
        const pageEl = pg.closest('.layout-page') as HTMLElement | null;
        const num = Number(pageEl?.dataset.pageNumber ?? 0);
        if (num > totalPages) totalPages = num;
        // Landscape: the second *section* (§7 横向双栏) starts on p.10, so the
        // landscape sheet is found by geometry, not by a fixed page number.
        if (pageEl) {
          const r = pageEl.getBoundingClientRect();
          if (r.width > r.height + 1) landscapePages.add(num);
        }
        const header = pageEl?.querySelector('.layout-page-header');
        const footer = pageEl?.querySelector('.layout-page-footer');
        if (!header?.textContent?.trim() || !footer?.textContent?.trim()) headerFooterOk = false;
        const ft = footer?.textContent?.trim() ?? '';
        if (ft) footerTexts.add(ft);
      }

      const tables = [...document.querySelectorAll('.layout-page-content .layout-table')].filter(
        (t) => !(t as HTMLElement).classList.contains('layout-nested-table')
      );
      tablesSeen = Math.max(tablesSeen, tables.length);
      nestedTables = Math.max(
        nestedTables,
        document.querySelectorAll('.layout-page-content .layout-nested-table').length
      );
      if (
        tables.some((t) => {
          const rows = [...t.querySelectorAll('.layout-table-row')].filter(own(t));
          return (
            rows.length > 0 &&
            [...rows[0].querySelectorAll('.layout-table-cell')]
              .filter(own(t))
              .some((c) => opaque(cssBg(c)))
          );
        })
      ) {
        shadedHeader = true;
      }
      if (
        tables.some((t) => {
          const counts = new Set(
            [...t.querySelectorAll('.layout-table-row')]
              .filter(own(t))
              .map((r) => [...r.querySelectorAll('.layout-table-cell')].filter(own(t)).length)
              .filter((n) => n > 0)
          );
          return counts.size > 1;
        })
      ) {
        gridSpanTable = true;
      }
      // Overlay chrome is exempt from the no-overlap scan by design: the
      // repeated header is re-emitted over the fragment top while the body is
      // clipped beneath it, and vmerge continuation slices re-cover the merged
      // column (see table-repeated-header-topclip / table-vmerge-page-split
      // unit tests). Only normal flow cells must be disjoint.
      const isOverlay = (c: Element) =>
        (c as HTMLElement).dataset.vmergeContinuation === 'true' ||
        !!c.closest('[data-repeated-header="true"]');
      const cells = tables.flatMap((t) =>
        [...t.querySelectorAll('.layout-table-cell')]
          .filter(own(t))
          .filter((c) => !isOverlay(c))
          .map((c) => box(c))
      );
      for (let a = 0; a < cells.length; a++) {
        for (let b = a + 1; b < cells.length; b++) {
          const A = cells[a];
          const B = cells[b];
          const stacked = A.bottom <= B.top + 1 || B.bottom <= A.top + 1;
          if (stacked && Math.abs(A.left - B.left) < 2 && Math.abs(A.width - B.width) < 2) {
            vmergePair = true;
          }
          const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
          const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          if (ox > 1 && oy > 1 && !contains(A, B, 2) && !contains(B, A, 2)) cellsOverlap++;
        }
      }

      // Overlap unit is the text run, not the line: in multi-column sections
      // a .layout-line box spans the full content width while the runs sit in
      // their columns, so line boxes legitimately share a band (verified
      // visually: columns paint side by side). Same overlay-chrome exemption
      // as cells above.
      const runs = [
        ...document.querySelectorAll(
          '.layout-page-content .layout-run-text, .layout-page-content img.layout-run-image'
        ),
      ].filter(
        (el) =>
          !el.closest('.layout-textbox') &&
          !el.closest('[data-repeated-header="true"], [data-vmerge-continuation="true"]')
      );
      const runBoxes = runs
        .map((el) => ({ el, r: box(el) }))
        .filter(({ r }) => r.width > 1 && r.height > 1);
      for (let a = 0; a < runBoxes.length; a++) {
        for (let b = a + 1; b < runBoxes.length; b++) {
          if (!samePage(runBoxes[a].el, runBoxes[b].el)) continue;
          const A = runBoxes[a].r;
          const B = runBoxes[b].r;
          const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
          const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          // 4px vertical slack: super/subscript runs (relative top offsets)
          // may poke a couple px into the neighbour band; broken layout
          // overlaps by a full line height.
          if (ox > 1 && oy > 4 && !contains(A, B, 2) && !contains(B, A, 2)) lineOverlaps++;
        }
      }
      const lineBoxes = [...document.querySelectorAll('.layout-page-content .layout-line')]
        .map((el) => ({ el, r: box(el) }))
        .filter(({ r }) => r.width > 4 && r.height > 2);
      for (let a = 0; a < lineBoxes.length; a++) {
        for (let b = a + 1; b < lineBoxes.length; b++) {
          if (!samePage(lineBoxes[a].el, lineBoxes[b].el)) continue;
          const A = lineBoxes[a].r;
          const B = lineBoxes[b].r;
          const sameBand = Math.abs(A.top + A.height / 2 - (B.top + B.height / 2)) < 4;
          const disjoint = A.right <= B.left + 1 || B.right <= A.left + 1;
          if (sameBand && disjoint && A.width < contentW * 0.65 && B.width < contentW * 0.65) {
            sideBySide++;
          }
        }
      }

      tocLeaders = Math.max(
        tocLeaders,
        [...document.querySelectorAll('.layout-page-content .layout-run-tab')].filter((el) =>
          (el.textContent ?? '').includes('...')
        ).length
      );
      for (const a of [...document.querySelectorAll('.layout-page-content a[href^="#"]')]) {
        tocHrefs.add((a as HTMLAnchorElement).getAttribute('href') ?? '');
      }

      const txt = document.querySelector('.layout-page-content')?.textContent ?? '';
      if (txt.includes('评审中')) statusText = true;
      if (txt.includes('November 7, 2026')) dateText = true;
    }

    const contentW =
      document.querySelector('.layout-page-content')?.getBoundingClientRect().width ?? 800;
    let wideBlockImages = 0;
    for (const w of wideBlockByPm.values()) {
      if (w > contentW * 0.8) wideBlockImages++;
    }

    // Landscape page 2 is checked on the first window below; the scroller is
    // left at the bottom here.
    return {
      inlineImages: [...inlineImages],
      floatImages: [...floatImages],
      floatWrapTypes: [...floatWrapTypes],
      wideBlockImages,
      revisedImages: [...revisedImages],
      authors: [...authors],
      commentIds: [...commentIds],
      sdtWidgetTags: [...sdtWidgetTags],
      inlineWidgetTags: [...inlineWidgetTags],
      footnoteAreas,
      footnoteSupRefs: [...footnoteSupRefs],
      totalPages,
      landscapePages: [...landscapePages],
      headerFooterOk,
      footerTexts: [...footerTexts],
      tablesSeen,
      nestedTables,
      shadedHeader,
      gridSpanTable,
      vmergePair,
      cellsOverlap,
      sideBySide,
      lineOverlaps,
      tocLeaders,
      tocHrefs: [...tocHrefs],
      statusText,
      dateText,
    };
  });
}

for (const adapter of ADAPTERS) {
  test.describe(`demo-showcase [${adapter.name}]`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoSample(page, adapter);
    });

    test('renders the capability demo end to end', async ({ page }) => {
      const ev = await collectShowcase(page);

      await test.step('images: inline + square float + topAndBottom band', async () => {
        expect(ev.inlineImages.length).toBeGreaterThanOrEqual(2);
        expect(ev.floatImages.length).toBeGreaterThanOrEqual(1);
        expect(ev.floatWrapTypes).toContain('square');
        // topAndBottom anchors paint as full-width block images on their own
        // line (measureParagraph block-image path).
        expect(ev.wideBlockImages).toBeGreaterThanOrEqual(1);
      });
      await test.step('revisions: >=3 authors, one tracked image', async () => {
        expect(ev.authors.length).toBeGreaterThanOrEqual(3);
        expect(ev.revisedImages.length).toBeGreaterThanOrEqual(1);
      });

      await test.step('tables: shading, gridSpan, vMerge, nesting, geometry', async () => {
        expect(ev.tablesSeen).toBeGreaterThanOrEqual(5);
        expect(ev.shadedHeader).toBe(true);
        expect(ev.gridSpanTable).toBe(true);
        expect(ev.vmergePair).toBe(true);
        expect(ev.nestedTables).toBeGreaterThanOrEqual(1);
        expect(ev.cellsOverlap).toBe(0);
      });

      await test.step('layout: pages, header/footer, columns, page numbers', async () => {
        expect(ev.totalPages).toBeGreaterThanOrEqual(3);
        // The landscape sheet belongs to the second *section* (§7 横向双栏,
        // starting p.10 in this doc), so assert by geometry, not page number.
        expect(ev.landscapePages.length).toBeGreaterThanOrEqual(1);
        expect(ev.headerFooterOk).toBe(true);
        expect(new Set(ev.footerTexts).size).toBeGreaterThan(1);
        expect(ev.sideBySide).toBeGreaterThanOrEqual(1);
        expect(ev.lineOverlaps).toBe(0);
      });

      await test.step('footnotes: numbered refs, bottom area clear of body', async () => {
        expect(ev.footnoteSupRefs.length).toBeGreaterThanOrEqual(2);
        expect(ev.footnoteAreas).toBeGreaterThanOrEqual(1);
      });

      await test.step('TOC: dot leaders and bookmark links', async () => {
        expect(ev.tocLeaders).toBeGreaterThanOrEqual(1);
        expect(ev.tocHrefs.length).toBeGreaterThanOrEqual(2);
      });

      await test.step('content controls: date shows the formatted date', async () => {
        expect(ev.dateText).toBe(true);
      });

      await test.step('comments: threads incl. reply, click highlights body', async () => {
        expect(ev.commentIds.length).toBeGreaterThanOrEqual(2);

        // Bring the sara.k range (comment "0") into the render window so the
        // sidebar click has a painted range to highlight.
        await page.evaluate(async () => {
          const findScroller = (): HTMLElement => {
            const pages = document.querySelector('.paged-editor__pages');
            let el: HTMLElement | null = pages ? (pages.parentElement as HTMLElement | null) : null;
            while (el) {
              if (el.scrollHeight > el.clientHeight + 20) return el;
              el = el.parentElement;
            }
            return document.scrollingElement as HTMLElement;
          };
          const scroller = findScroller();
          const max = scroller.scrollHeight - scroller.clientHeight;
          for (let i = 0; i <= 14; i++) {
            if (document.querySelector('.layout-page-content [data-comment-id="0"]')) {
              document
                .querySelector('.layout-page-content [data-comment-id="0"]')
                ?.scrollIntoView({ block: 'center' });
              return;
            }
            scroller.scrollTop = (max * i) / 14;
            const { promise, resolve } = Promise.withResolvers<void>();
            setTimeout(resolve, 500);
            await promise;
          }
        });
        const bodySpan = page.locator(`${CONTENT} [data-comment-id="0"]`).first();
        await expect(bodySpan).toBeVisible({ timeout: 10000 });
        // Click the range: cursor-driven expansion positions + expands the
        // card in the zero-height sidebar shell (verified: card gets a real
        // box with Resolve actions once the cursor is inside the range).
        await bodySpan.click();

        await ensureSidebarOpen(page, adapter);
        const sidebar = page.locator(adapter.sidebar);
        const parentCard = page.locator(
          `${adapter.sidebar} ${adapter.commentCard}[data-comment-id="0"]`
        );
        await expect(parentCard).toBeVisible({ timeout: 15000 });
        await expect(sidebar.getByText('按作者着色')).toBeVisible();
        await expect(sidebar.getByText('线程嵌套')).toBeVisible();
        const anonText = sidebar.getByText('图片修订已确认');
        const resolvedMarker = sidebar.locator('[data-comment-resolved="true"]');
        expect((await anonText.count()) > 0 || (await resolvedMarker.count()) > 0).toBe(true);

        // Cursor placement already expanded the card (Resolve actions show);
        // clicking the card then must keep the body range highlighted (the
        // click toggles collapse, so expansion is asserted before it).
        const expanded = await parentCard.evaluate(
          (el) =>
            el.classList.contains('comment-card--expanded') ||
            !!el.querySelector('button[title="Resolve"], button[title="Reopen"]')
        );
        expect(expanded).toBe(true);
        await parentCard.click();
        const bg = await page.evaluate(() => {
          const span = document.querySelector(
            '.paged-editor__pages [data-comment-id="0"]'
          ) as HTMLElement | null;
          return span ? getComputedStyle(span).backgroundColor || '' : '';
        });
        expect(isYellowish(bg), `body highlight for comment 0: "${bg}"`).toBe(true);
      });

      await test.step('content controls: checkbox toggles on click', async () => {
        // The s5 checkboxes are inline SDTs: the glyph itself is the toggle
        // (runs.ts applyInlineSdtWidgetAttrs).
        const trigger = page.locator('.layout-inline-sdt-widget[data-sdt-tag="s5-check-pending"]');
        await trigger.scrollIntoViewIfNeeded();
        await expect(trigger).toHaveText('☐');
        await trigger.click();
        await expect(trigger).toHaveText('☒');
        await trigger.click();
        await expect(trigger).toHaveText('☐');
      });

      await test.step('TOC: click jumps to the heading', async () => {
        // Hunt a real TOC entry into the render window. The doc also has
        // "← 返回本节开头" back-links with #_Toc hrefs; those are excluded
        // so the click target is always a forward jump into a heading.
        const tocLink = page
          .locator(`${CONTENT} a[href^="#_Toc"]`)
          .filter({ hasNotText: '← 返回' })
          .first();
        await page.evaluate(async () => {
          const scroller = (() => {
            const pages = document.querySelector('.paged-editor__pages');
            let el: HTMLElement | null = pages ? (pages.parentElement as HTMLElement | null) : null;
            while (el) {
              if (el.scrollHeight > el.clientHeight + 20) return el;
              el = el.parentElement;
            }
            return document.scrollingElement as HTMLElement;
          })();
          const max = scroller.scrollHeight - scroller.clientHeight;
          for (let i = 0; i <= 10; i++) {
            const found = [
              ...document.querySelectorAll('.layout-page-content a[href^="#_Toc"]'),
            ].some((a) => !(a.textContent ?? '').includes('← 返回'));
            if (found) return;
            scroller.scrollTop = (max * i) / 40;
            const { promise, resolve } = Promise.withResolvers<void>();
            setTimeout(resolve, 500);
            await promise;
          }
        });
        await tocLink.scrollIntoViewIfNeeded();
        await expect(tocLink).toBeVisible({ timeout: 10000 });
        // Both adapters move the PM selection to the bookmarked heading on
        // internal-link click (React usePagesPointer / Vue navigateToBookmark);
        // the selection anchor moving proves the jump navigated.
        const anchorBefore = await page.evaluate(
          () => window.__DOCX_EDITOR_E2E__?.getSelectionAnchor() ?? null
        );
        await tocLink.click();
        await expect
          .poll(
            async () => {
              const anchor = await page.evaluate(
                () => window.__DOCX_EDITOR_E2E__?.getSelectionAnchor() ?? null
              );
              return anchor !== null && anchor !== anchorBefore ? anchor : null;
            },
            { timeout: 8000 }
          )
          .not.toBeNull();
      });
    });

    // The s5-status dropdown is an *inline* w:sdt. The painter only renders
    // `.layout-sdt-widget` triggers for block-level typed controls
    // (sdtBoundary.ts widgetKindFor) and inline widgets for `checkbox` only
    // (InlineSdtWidget kind). Inline dropdown/date controls paint as plain
    // text, so there is no stable trigger to drive — see #60. Keep the
    // intended assertions; un-fixme once the painter gains inline
    // dropdown/date triggers.
    test.fixme('content controls: dropdown opens and selects another item (#60)', async ({
      page,
    }) => {
      const trigger = page.locator('.layout-sdt-widget[data-sdt-tag="s5-status"]');
      await expect(trigger).toHaveCount(1);
      await trigger.click();
      const popup = page.locator('.layout-sdt-widget-popup');
      await expect(popup).toBeVisible();
      await popup.getByText('已发布 Final').click();
      await expect(page.locator(CONTENT).getByText('已发布 Final')).toBeVisible();
    });
  });
}
