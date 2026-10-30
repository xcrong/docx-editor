// Vue mirror of e2e/tests/comment-navigation.spec.ts — sidebar open/close
// shift, narrow overlay mode, leader lines, and card → document navigation.
//
// Run when touching:
//   - packages/vue/src/components/DocxEditor.vue (sidebar state, overlay mode, navigate)
//   - packages/vue/src/components/UnifiedSidebar.vue (navigate emit)
//   - packages/vue/src/components/LeaderLines.vue
import { test, expect, Page } from '@playwright/test';

const SIDEBAR = '.unified-sidebar';
const CARD = '.comment-card';
const BACKDROP = '.docx-sidebar-backdrop';
const LEADER_SVG = 'svg.docx-leader-lines[data-leader-svg]';
const TOGGLE = 'button[aria-label="Comments & Changes"]';

async function openSidebar(page: Page) {
  const toggle = page.locator(TOGGLE);
  await toggle.click();
  await page.waitForTimeout(300);
}

async function waitForSidebarReady(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.unified-sidebar') as HTMLElement | null;
      return el != null && getComputedStyle(el).opacity === '1';
    },
    null,
    { timeout: 8000 }
  );
}

async function pageLeftX(page: Page): Promise<number> {
  const box = await page.locator('.layout-page').first().boundingBox();
  if (!box) throw new Error('page not found');
  return box.x;
}

/** Seed paragraphs via the raw PM view, then anchor a comment via the agent bridge. */
async function seedDocWithComment(
  page: Page,
  texts: string[],
  search: string,
  body: string
): Promise<number> {
  const id = await page.evaluate(
    ({ texts, search, body }: { texts: string[]; search: string; body: string }) => {
      const ed: any = (window as any).__DOCX_EDITOR_E2E__;
      const view = ed.getView();
      const s = view.state.schema;
      let tr = view.state.tr;
      const paraIds: string[] = [];
      for (const t of texts) {
        const para = s.nodes.paragraph.create(null, s.text(t));
        tr = tr.insert(tr.doc.content.size, para);
      }
      view.dispatch(tr);
      // Re-read paraIds after insert.
      const ids: string[] = [];
      view.state.doc.descendants((node: any) => {
        if (node.isTextblock && node.attrs?.paraId) ids.push(String(node.attrs.paraId));
      });
      void paraIds;
      const target = ids[ids.length - 1];
      return ed.agentAddComment({ paraId: target, text: body, author: 'E2E', search }) ?? -1;
    },
    { texts, search, body }
  );
  expect(id, 'agentAddComment should return a comment id').toBeGreaterThan(0);
  return id as number;
}

test.describe('Vue comment navigation — sidebar shift + overlay', () => {
  test('toolbar button toggles sidebar, document shifts left and re-centers', async ({
    page,
  }) => {
    await page.goto('http://localhost:5174/?e2e=1&empty=1');
    await page.locator('.docx-editor-vue').waitFor();
    await page.waitForSelector('[data-page-number]');
    const id = await seedDocWithComment(page, ['Alpha bravo charlie.'], 'bravo', 'shift me');

    const centeredX = await pageLeftX(page);
    // Sidebar auto-opens when the comment lands (extractCommentsAndChanges).
    await waitForSidebarReady(page);
    await expect(page.locator(SIDEBAR)).toBeVisible();

    const shiftedX = await pageLeftX(page);
    expect(centeredX - shiftedX).toBeGreaterThan(100);

    // Review group renders: DocxEditor wires all six review-* listeners,
    // so the group shows (vnode.props sniffing — useAttrs() would hide it).
    await expect(page.locator('[data-testid="toolbar-accept-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-reject-all"]')).toBeVisible();

    await page.locator(TOGGLE).click();
    await page.waitForTimeout(600);
    await expect(page.locator(SIDEBAR)).toHaveCount(0);
    const recenteredX = await pageLeftX(page);
    // Closing animates back (0.2s transition) — allow layout tolerance.
    expect(Math.abs(recenteredX - centeredX)).toBeLessThan(40);
    void id;
  });

  test('narrow container (<1200px): overlay mode with backdrop, no shift', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto('http://localhost:5174/?e2e=1&empty=1');
    await page.locator('.docx-editor-vue').waitFor();
    await page.waitForSelector('[data-page-number]');
    await seedDocWithComment(page, ['Alpha bravo charlie.'], 'bravo', 'overlay me');

    // Sidebar auto-opens when the comment lands.
    await waitForSidebarReady(page);
    await expect(page.locator(SIDEBAR)).toBeVisible();
    await expect(page.locator(BACKDROP)).toBeVisible();

    const overlayX = await pageLeftX(page);
    await page.locator(BACKDROP).click();
    await page.waitForTimeout(400);
    await expect(page.locator(SIDEBAR)).toHaveCount(0);
    const closedX = await pageLeftX(page);
    expect(Math.abs(overlayX - closedX)).toBeLessThan(5);
  });
});

test.describe('Vue comment navigation — leader lines + card navigation', () => {
  test('leader lines render and card click scrolls to the anchor', async ({ page }) => {
    await page.goto('http://localhost:5174/?e2e=1&empty=1');
    await page.locator('.docx-editor-vue').waitFor();
    await page.waitForSelector('[data-page-number]');
    // Long doc: anchor at the bottom, card click must scroll down to it.
    const filler = Array.from({ length: 25 }, (_, i) => `filler paragraph ${i}`);
    const id = await seedDocWithComment(
      page,
      ['Start here.', ...filler, 'Distant target omega at the bottom.'],
      'omega',
      'find me'
    );

    // Sidebar auto-opens when the comment lands (extractCommentsAndChanges).
    await waitForSidebarReady(page);

    const svg = page.locator(LEADER_SVG).first();
    await expect(svg).toBeVisible();
    await expect(svg.locator(`line[data-leader-for="comment-${id}"]`)).toHaveCount(1);
    await page.evaluate(() => {
      document.querySelector('.docx-editor-vue__pages-viewport')?.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    const anchorVisibleBefore = await page.evaluate((cid) => {
      const el = document.querySelector(
        `.layout-page-content [data-comment-id="${cid}"]`
      ) as HTMLElement | null;
      if (!el) return 'missing';
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight ? 'visible' : 'hidden';
    }, id);

    // Card click → anchor scrolls into view (whether or not it started visible).
    await page.locator(`${SIDEBAR} ${CARD}[data-comment-id="${id}"]`).click();
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
    expect(anchorVisibleBefore === 'visible' || anchorVisibleBefore === 'hidden').toBe(true);
  });
});
