import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Tab leader fidelity (`openspec/changes/tab-leader-fidelity`).
 *
 * Fixture `fixtures/toc-dot-leaders.docx`: six right-tabbed TOC-style entries
 * with dot / hyphen / underscore / heavy / middleDot leaders, plus a
 * long-title dot entry where the leader gap is short.
 */
const FIXTURE = 'fixtures/toc-dot-leaders.docx';

test.describe('Tab leaders', () => {
  test('leader tabs never overlap the title or page number', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector('[data-page-number="1"]');

    const tabs = page.locator('.layout-run-tab');
    await expect(tabs).toHaveCount(6);

    const overlap = await tabs.evaluateAll((els) =>
      els.map((tab) => {
        const tr = tab.getBoundingClientRect();
        const nr = tab.nextElementSibling?.getBoundingClientRect();
        const pr = tab.previousElementSibling?.getBoundingClientRect();
        return {
          overlapsNext: nr ? tr.right > nr.left + 0.5 : false,
          overlapsPrev: pr ? tr.left < pr.right - 0.5 : false,
        };
      })
    );
    for (const [i, o] of overlap.entries()) {
      expect(o.overlapsNext, `tab ${i} overlaps following text`).toBe(false);
      expect(o.overlapsPrev, `tab ${i} overlaps preceding text`).toBe(false);
    }
  });

  test('leader keeps a gap from the text on both sides', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector('[data-page-number="1"]');

    // The leader fill is clipped inside the tab span with padding, so dots
    // start/end clear of the adjacent glyphs.
    const gaps = await page.locator('.layout-run-tab').evaluateAll((els) =>
      els.map((tab) => {
        const tr = tab.getBoundingClientRect();
        const inner = Array.from(tab.children).find(
          (c) => (c as HTMLElement).style.position === 'absolute'
        ) as HTMLElement | undefined;
        if (!inner) return null;
        const ir = inner.getBoundingClientRect();
        return {
          leftGap: ir.left - tr.left,
          rightGap: tr.right - ir.right,
        };
      })
    );
    expect(gaps.length).toBe(6);
    for (const [i, g] of gaps.entries()) {
      expect(g, `tab ${i} has a clipped leader`).not.toBeNull();
      expect(g!.leftGap, `tab ${i} left gap`).toBeGreaterThanOrEqual(1.5);
      expect(g!.rightGap, `tab ${i} right gap`).toBeGreaterThanOrEqual(1.5);
    }
  });

  test('all leader types render their own glyph', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector('[data-page-number="1"]');

    const leaders = await page.locator('.layout-run-tab').evaluateAll((els) =>
      els.map((tab) => {
        const inner = Array.from(tab.children).find(
          (c) => (c as HTMLElement).style.position === 'absolute'
        ) as HTMLElement | undefined;
        return inner
          ? { char: inner.textContent?.[0] ?? '', bold: inner.style.fontWeight === '700' }
          : null;
      })
    );
    expect(leaders.map((l) => l?.char)).toEqual(['.', '-', '_', '_', '·', '.']);
    // Heavy draws the same rule glyph but thick.
    expect(leaders[3]?.bold).toBe(true);
    expect(leaders[0]?.bold).toBe(false);
  });

  test('long title leaves a short but non-overlapping leader gap', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector('[data-page-number="1"]');

    const tabs = page.locator('.layout-run-tab');
    const lastWidth = await tabs.nth(5).evaluate((el) =>
      el.getBoundingClientRect().width
    );
    // Short gap, but still a real tab that fits before the page number.
    expect(lastWidth).toBeGreaterThan(0);
    expect(lastWidth).toBeLessThan(250);

    const bodyText = (await page.locator('[data-page-number="1"]').textContent()) ?? '';
    expect(bodyText).toContain('48');
  });
});
