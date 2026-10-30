/**
 * Comment navigation — sidebar open/close shift, narrow overlay mode,
 * leader lines, and bidirectional card ↔ document navigation.
 *
 * Run when touching:
 *   - packages/react/src/components/UnifiedSidebar.tsx
 *   - packages/react/src/components/sidebar/LeaderLines.tsx
 *   - packages/react/src/components/sidebar/**
 *   - packages/react/src/components/DocxEditor.tsx (sidebar state, overlay mode, navigate)
 *   - packages/react/src/components/DocxEditor/DocxEditorPagedArea.tsx (backdrop, LeaderLines mount)
 */

import { test, expect, Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// ---------------------------------------------------------------------------
// Selectors & helpers (mirrors comments-sidebar.spec.ts)
// ---------------------------------------------------------------------------

const SIDEBAR = '.docx-unified-sidebar';
const COMMENT_CARD = '.docx-comment-card';
const BACKDROP = '.docx-sidebar-backdrop';
const LEADER_SVG = 'svg.docx-leader-lines[data-leader-svg]';
const CLEAN = 'ZZEND';

const TOGGLE = '[data-testid="toolbar-toggle-comments-sidebar"]';

async function openSidebar(page: Page) {
  const toggle = page.locator(TOGGLE);
  const pressed = await toggle.getAttribute('aria-pressed');
  if (pressed !== 'true') {
    await toggle.click();
    await page.waitForTimeout(150);
  }
}

async function closeSidebar(page: Page) {
  const toggle = page.locator(TOGGLE);
  const pressed = await toggle.getAttribute('aria-pressed');
  if (pressed === 'true') {
    await toggle.click();
    await page.waitForTimeout(250);
  }
}

async function startAddComment(editor: EditorPage, searchText: string) {
  const { page } = editor;
  const found = await editor.selectText(searchText);
  expect(found, `selectText should find "${searchText}"`).toBe(true);
  await page.waitForTimeout(200);

  await page.waitForFunction(
    () => {
      const buttons = document.querySelectorAll('[data-testid="docx-editor"] button');
      for (const b of buttons) {
        const s = getComputedStyle(b);
        if (s.position === 'absolute' && s.zIndex === '50') return true;
      }
      return false;
    },
    null,
    { timeout: 3000 }
  );

  const floating = await page.evaluateHandle(() => {
    const buttons = document.querySelectorAll('[data-testid="docx-editor"] button');
    for (const b of buttons) {
      const s = getComputedStyle(b);
      if (s.position === 'absolute' && s.zIndex === '50') return b;
    }
    return null;
  });
  const floatingEl = floating.asElement();
  expect(floatingEl, 'floating add-comment button should mount').not.toBeNull();
  await floatingEl!.click();
  await page.waitForSelector(`${SIDEBAR} textarea`, { state: 'visible', timeout: 3000 });
}

async function submitComment(page: Page, text: string) {
  const textarea = page.locator(`${SIDEBAR} textarea`).last();
  await textarea.fill(text);
  await textarea.press('Enter');
  await page.waitForTimeout(300);
}

async function addCommentOn(editor: EditorPage, searchText: string, body: string) {
  await startAddComment(editor, searchText);
  await submitComment(editor.page, body);
}

function commentCard(page: Page, commentId: number) {
  return page.locator(`${SIDEBAR} ${COMMENT_CARD}[data-comment-id="${commentId}"]`);
}

async function getSidebarCommentIds(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const els = document.querySelectorAll('.docx-unified-sidebar [data-comment-id]');
    const ids = new Set<number>();
    for (const el of els) {
      const raw = (el as HTMLElement).dataset.commentId;
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n)) ids.add(n);
      }
    }
    return [...ids].sort((a, b) => a - b);
  });
}

async function isCommentExpanded(page: Page, commentId: number): Promise<boolean> {
  const card = commentCard(page, commentId);
  if ((await card.count()) === 0) return false;
  const actionBtn = card.locator('button[title="Resolve"], button[title="Reopen"]');
  return (await actionBtn.count()) > 0;
}

async function moveCursorTo(editor: EditorPage, cleanWord: string) {
  const found = await editor.selectText(cleanWord);
  expect(found, `moveCursorTo: word "${cleanWord}" should be in the doc`).toBe(true);
  await editor.page.keyboard.press('ArrowRight');
  await editor.page.waitForTimeout(200);
}

async function setupEmptyDoc(page: Page): Promise<EditorPage> {
  const editor = new EditorPage(page);
  await editor.gotoEmpty();
  await editor.waitForReady();
  await editor.focus();
  return editor;
}

/** Sidebar fades in (opacity 0→1) only after card positions resolve. */
async function waitForSidebarReady(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.docx-unified-sidebar') as HTMLElement | null;
      return el != null && getComputedStyle(el).opacity === '1';
    },
    null,
    { timeout: 8000 }
  );
}

/** X of the first page's left edge — shifts left when the sidebar opens. */
async function pageLeftX(page: Page): Promise<number> {
  const box = await page.locator('.layout-page').first().boundingBox();
  if (!box) throw new Error('page not found');
  return box.x;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Comment navigation — sidebar open/close shift (1.6)', () => {
  test('sidebar opens/closes, document shifts left and re-centers', async ({ page }) => {
    const editor = await setupEmptyDoc(page);
    await editor.typeText(`Alpha bravo charlie delta echo fox ${CLEAN}.`);
    await openSidebar(page);

    const centeredX = await pageLeftX(page);
    await addCommentOn(editor, 'bravo', 'shift test');
    await waitForSidebarReady(page);

    // Shifted left by roughly SIDEBAR_DOCUMENT_SHIFT (176px).
    const shiftedX = await pageLeftX(page);
    expect(centeredX - shiftedX).toBeGreaterThan(100);

    await closeSidebar(page);
    await expect(page.locator(SIDEBAR)).toHaveCount(0);
    const recenteredX = await pageLeftX(page);
    expect(Math.abs(recenteredX - centeredX)).toBeLessThan(5);
  });

  test('narrow container (<1200px): overlay mode with backdrop, no shift', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    const editor = await setupEmptyDoc(page);
    await editor.typeText(`Alpha bravo charlie delta echo fox ${CLEAN}.`);
    await openSidebar(page);
    await addCommentOn(editor, 'bravo', 'overlay test');
    await waitForSidebarReady(page);
    // Backdrop covers the overlapped doc area.
    await expect(page.locator(BACKDROP)).toBeVisible();

    // No left shift in overlay mode — page stays centered.
    const overlayX = await pageLeftX(page);
    await closeSidebar(page);
    const closedX = await pageLeftX(page);
    expect(Math.abs(overlayX - closedX)).toBeLessThan(5);

    // Reopen and click the backdrop to close.
    await openSidebar(page);
    await page.waitForTimeout(300);
    await expect(page.locator(BACKDROP)).toBeVisible();
    await page.locator(BACKDROP).click();
    await page.waitForTimeout(300);
    await expect(page.locator(SIDEBAR)).toHaveCount(0);
  });
});

test.describe('Comment navigation — leader lines (4.5)', () => {
  test('leader lines render and connect anchors to cards', async ({ page }) => {
    const editor = await setupEmptyDoc(page);
    await editor.typeText(
      `Top anchor alpha here. ${'filler '.repeat(60)} Bottom anchor omega here ${CLEAN}.`
    );
    await openSidebar(page);
    await addCommentOn(editor, 'alpha', 'first');
    await addCommentOn(editor, 'omega', 'second');
    const ids = await getSidebarCommentIds(page);
    expect(ids).toHaveLength(2);
    await moveCursorTo(editor, CLEAN);
    await waitForSidebarReady(page);

    const svg = page.locator(LEADER_SVG).first();
    await expect(svg).toBeVisible();
    for (const id of ids) {
      const line = svg.locator(`line[data-leader-for="comment-${id}"]`);
      await expect(line).toHaveCount(1);
      // Endpoints: x1 ≈ anchor right edge, x2 ≈ card left edge.
      const geom = await line.evaluate((el) => {
        const svgEl = el.ownerSVGElement!;
        const anchor = document.querySelector(
          `.layout-page-content [data-comment-id="${el.getAttribute('data-leader-for')!.slice(8)}"]`
        )!;
        const card = document.querySelector(
          `[data-card-id="${el.getAttribute('data-leader-for')}"]`
        )!;
        const a = anchor.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const s = svgEl.getBoundingClientRect();
        return {
          x1: Number(el.getAttribute('x1')),
          x2: Number(el.getAttribute('x2')),
          anchorRight: a.right - s.left,
          cardLeft: c.left - s.left,
        };
      });
      expect(Math.abs(geom.x1 - geom.anchorRight)).toBeLessThan(4);
      expect(Math.abs(geom.x2 - geom.cardLeft)).toBeLessThan(4);
      expect(geom.x1).toBeLessThan(geom.x2);
      // Inactive lines render thin.
      expect(await line.evaluate((el) => getComputedStyle(el).strokeWidth)).toBe('1px');
    }
  });

  test("active comment's leader line is emphasized", async ({ page }) => {
    const editor = await setupEmptyDoc(page);
    await editor.typeText(`Alpha bravo charlie delta echo fox ${CLEAN}.`);
    await openSidebar(page);
    await addCommentOn(editor, 'bravo', 'one');
    await addCommentOn(editor, 'delta', 'two');
    const [firstId, secondId] = await getSidebarCommentIds(page);
    await moveCursorTo(editor, CLEAN);
    await waitForSidebarReady(page);

    // Expand the first card by clicking it (also navigates — no scroll
    // needed, anchor already visible).
    await commentCard(page, firstId).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(400);
    expect(await isCommentExpanded(page, firstId)).toBe(true);

    const svg = page.locator(LEADER_SVG).first();
    const activeLine = svg.locator(`line[data-leader-for="comment-${firstId}"]`);
    const inactiveLine = svg.locator(`line[data-leader-for="comment-${secondId}"]`);
    expect(await activeLine.evaluate((el) => getComputedStyle(el).strokeWidth)).toBe('2px');
    expect(await inactiveLine.evaluate((el) => getComputedStyle(el).strokeWidth)).toBe('1px');
  });

  test('leader lines follow on document scroll', async ({ page }) => {
    const editor = await setupEmptyDoc(page);
    await editor.typeText(`Top anchor alpha here. Bottom anchor omega here ${CLEAN}.`);
    // Pad the document so the anchor sits well below the fold: duplicate
    // the filler paragraph via PM instead of typing it (fast).
    await page.evaluate(() => {
      const ed: any = (window as any).__DOCX_EDITOR_E2E__;
      const view = ed.getView();
      const s = view.state.schema;
      const { first, fillerEnd } = (() => {
        let first = -1;
        let end = -1;
        view.state.doc.descendants((node: any, pos: number) => {
          if (node.isTextblock && node.attrs?.paraId) {
            if (first < 0) first = pos;
            end = pos + node.nodeSize;
          }
        });
        return { first, fillerEnd: end };
      })();
      void first;
      const filler = s.nodes.paragraph.create(null, s.text('filler '.repeat(40)));
      let tr = view.state.tr;
      for (let i = 0; i < 25; i++) tr = tr.insert(fillerEnd, filler);
      view.dispatch(tr);
    });
    await page.waitForTimeout(800);
    await openSidebar(page);
    await addCommentOn(editor, 'omega', 'scroll target');
    const [id] = await getSidebarCommentIds(page);
    await moveCursorTo(editor, CLEAN);
    await waitForSidebarReady(page);

    const svg = page.locator(LEADER_SVG).first();
    const line = svg.locator(`line[data-leader-for="comment-${id}"]`);
    await expect(line).toHaveCount(1);
    const yBefore = await line.evaluate((el) => Number(el.getAttribute('y1')));

    // Scroll the document container; the rAF-updated line must track.
    await page.evaluate(() => {
      document.querySelector('.docx-editor__scroll-container')?.scrollBy(0, 600);
    });
    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector(
          `svg.docx-leader-lines[data-leader-svg] line[data-leader-for="comment-${prev.id}"]`
        );
        return el && Math.abs(Number(el.getAttribute('y1')) - prev.y) > 50;
      },
      { id, y: yBefore },
      { timeout: 3000 }
    );
  });
});

test.describe('Comment navigation — bidirectional (5.5)', () => {
  test('click comment card → scrolls document to the commented text', async ({ page }) => {
    const editor = await setupEmptyDoc(page);
    await editor.typeText(`Start here. Distant target omega at the bottom ${CLEAN}.`);
    // Pad the document via PM so the anchor sits well below the fold.
    await page.evaluate(() => {
      const ed: any = (window as any).__DOCX_EDITOR_E2E__;
      const view = ed.getView();
      const s = view.state.schema;
      let end = -1;
      view.state.doc.descendants((node: any, pos: number) => {
        if (node.isTextblock && node.attrs?.paraId) end = pos + node.nodeSize;
      });
      const filler = s.nodes.paragraph.create(null, s.text('filler '.repeat(40)));
      let tr = view.state.tr;
      for (let i = 0; i < 25; i++) tr = tr.insert(end, filler);
      view.dispatch(tr);
    });

    await openSidebar(page);
    // Anchor 'omega' first (marks track text through later edits), then pad
    // the middle with filler so the anchor sits well below the fold.
    await addCommentOn(editor, 'omega', 'find me');
    const [id] = await getSidebarCommentIds(page);
    await page.evaluate(() => {
      const ed: any = (window as any).__DOCX_EDITOR_E2E__;
      const view = ed.getView();
      const s = view.state.schema;
      // Insert filler right after the FIRST paragraph so the anchored last
      // paragraph is pushed below the fold.
      let firstEnd = -1;
      view.state.doc.descendants((node: any, pos: number) => {
        if (node.isTextblock && node.attrs?.paraId && firstEnd < 0) {
          firstEnd = pos + node.nodeSize;
        }
      });
      const filler = s.nodes.paragraph.create(null, s.text('filler '.repeat(40)));
      let tr = view.state.tr;
      for (let i = 0; i < 30; i++) tr = tr.insert(firstEnd, filler);
      view.dispatch(tr);
    });
    await page.waitForTimeout(800);

    // Park the cursor at the top, then scroll to the BOTTOM so the top
    // anchor is off-screen but the setup stays deterministic.
    // NOTE: `selectText('Start')` scrolls the anchor into view as a side
    // effect — scroll the container AFTER moving the cursor.
    await moveCursorTo(editor, 'Start');
    await page.evaluate(() => {
      const sc = document.querySelector('.docx-editor__scroll-container');
      sc?.scrollTo(0, sc.scrollHeight);
    });
    await page.waitForTimeout(600);

    const anchorVisibleBefore = await page.evaluate((cid) => {
      const el = document.querySelector(
        `.layout-page-content [data-comment-id="${cid}"]`
      ) as HTMLElement | null;
      if (!el) return 'missing';
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight ? 'visible' : 'hidden';
    }, id);
    expect(anchorVisibleBefore).toBe('hidden');

    // Click the (collapsed) card → document scrolls the anchor into view.
    // Assert via scrollTop movement + anchor visibility (smooth scroll).
    const scrollBefore = await page.evaluate(
      () => document.querySelector('.docx-editor__scroll-container')?.scrollTop ?? -1
    );

    // Click the (collapsed) card → document scrolls the anchor into view.
    await commentCard(page, id).click({ position: { x: 10, y: 10 } });
    await page.waitForFunction(
      (cid) => {
        const el = document.querySelector(
          `.layout-page-content [data-comment-id="${cid}"]`
        ) as HTMLElement | null;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      },
      id,
      { timeout: 8000 }
    );
    const scrollAfter = await page.evaluate(
      () => document.querySelector('.docx-editor__scroll-container')?.scrollTop ?? -1
    );
    expect(scrollAfter).toBeLessThan(scrollBefore);
    // Card expands as part of the same click.
    expect(await isCommentExpanded(page, id)).toBe(true);
  });

  test('click highlighted text → sidebar card expands', async ({ page }) => {
    const editor = await setupEmptyDoc(page);
    await editor.typeText(`Alpha bravo charlie delta echo fox ${CLEAN}.`);
    await openSidebar(page);
    await addCommentOn(editor, 'bravo', 'click me');
    const [id] = await getSidebarCommentIds(page);
    await moveCursorTo(editor, CLEAN);
    await page.waitForTimeout(200);
    expect(await isCommentExpanded(page, id)).toBe(false);

    // Click the highlighted anchor in the document → card expands.
    await page.locator(`.layout-page-content [data-comment-id="${id}"]`).first().click();
    await page.waitForTimeout(300);
    expect(await isCommentExpanded(page, id)).toBe(true);
  });
});
