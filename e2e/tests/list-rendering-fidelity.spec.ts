/**
 * List Operations Fidelity — rendering (fixture-driven).
 *
 * Loads `e2e/fixtures/list-operations-fidelity.docx` (regenerate with
 * `bun e2e/fixtures/build-list-operations-fidelity-fixture.mjs`) and asserts
 * the three rendering fixes: list indicator alignment inside table cells,
 * hidden (`w:vanish`) indicators not painting, and contextual-spacing
 * collapsing between same-style paragraphs.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/list-operations-fidelity.docx';

interface PMDocJSON {
  type: string;
  content?: PMDocJSON[];
  attrs?: Record<string, unknown>;
  text?: string;
}

async function getDocJSON(page: import('@playwright/test').Page): Promise<PMDocJSON> {
  return page.evaluate(() => {
    const view = window.__DOCX_EDITOR_E2E__?.getView?.() as
      | { state: { doc: { toJSON: () => unknown } } }
      | undefined;
    if (!view) throw new Error('Editor view not found');
    return view.state.doc.toJSON() as unknown as PMDocJSON;
  });
}

function paragraphsOf(doc: PMDocJSON): PMDocJSON[] {
  const out: PMDocJSON[] = [];
  const walk = (node: PMDocJSON) => {
    if (node.type === 'paragraph') out.push(node);
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return out;
}

function textOf(para: PMDocJSON): string {
  let text = '';
  const walk = (node: PMDocJSON) => {
    if (node.text) text += node.text;
    for (const child of node.content ?? []) walk(child);
  };
  walk(para);
  return text;
}

test.describe('List operations fidelity — rendering', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(FIXTURE);
  });

  test('list indicator aligned in table cell', async ({ page }) => {
    const cell = page.locator('.layout-table-cell-content', { hasText: 'Cell bullet' });
    await expect(cell).toBeVisible();

    const report = await cell.evaluate((el) => {
      const cellBox = el.getBoundingClientRect();
      const markers = Array.from(el.querySelectorAll('.layout-list-marker'));
      const firstLine = el.querySelector('.layout-line');
      const firstChild = firstLine?.firstElementChild;
      const marker = markers[0] as HTMLElement | undefined;
      const markerBox = marker?.getBoundingClientRect();
      // First body run after the marker (skip the marker itself).
      const bodyRun = marker?.nextElementSibling as HTMLElement | null;
      const bodyBox = bodyRun?.getBoundingClientRect();
      return {
        markerCount: markers.length,
        isInline: firstChild?.classList.contains('layout-list-marker') ?? false,
        markerLeftRel: markerBox ? markerBox.left - cellBox.left : null,
        markerRightRel: markerBox ? markerBox.right - cellBox.left : null,
        bodyLeftRel: bodyBox ? bodyBox.left - cellBox.left : null,
      };
    });

    // Exactly one marker, painted inline as the first child of the first line.
    expect(report.markerCount).toBe(1);
    expect(report.isInline).toBe(true);

    // Numbering-level ind is left=720/hanging=360 twips, so the marker sits at
    // max(0, 720-360)=360 twips = 24px from the cell content edge and the body
    // starts one hanging slot later. Tolerance is 3px for sub-pixel layout.
    expect(report.markerLeftRel).not.toBeNull();
    expect(Math.abs((report.markerLeftRel ?? 0) - 24)).toBeLessThan(3);

    // Body text starts at/after the marker end — no overlap.
    expect(report.bodyLeftRel).not.toBeNull();
    expect((report.bodyLeftRel ?? 0) - (report.markerRightRel ?? 0)).toBeGreaterThan(-1);
  });

  test('hidden indicators not rendered', async ({ page }) => {
    const content = page.locator('.layout-page-content');
    await expect(content).toContainText('Hidden item one');
    await expect(content).toContainText('Hidden item two');
    await expect(content).toContainText('Cell bullet');

    // The vanish-level items carry no painted marker; the only marker in the
    // whole document is the visible table-cell bullet.
    const hiddenBlocks = await page
      .locator('.layout-page-content .layout-paragraph')
      .evaluateAll((els) =>
        els
          .filter((el) => /Hidden item/.test(el.textContent ?? ''))
          .map((el) => el.querySelectorAll('.layout-list-marker').length)
      );
    expect(hiddenBlocks.length).toBe(2);
    expect(hiddenBlocks).toEqual([0, 0]);
    expect(await page.locator('.layout-list-marker').count()).toBe(1);

    // The PM paragraphs still carry the hidden flag (painter skips on it).
    const doc = await getDocJSON(page);
    const hiddenParas = paragraphsOf(doc).filter((p) => /Hidden item/.test(textOf(p)));
    expect(hiddenParas.length).toBe(2);
    for (const p of hiddenParas) {
      expect(p.attrs?.listMarkerHidden).toBe(true);
    }
  });

  test('contextual spacing collapses between same-style paragraphs', async ({ page }) => {
    const boxOf = (text: string) =>
      page.locator('.layout-page-content .layout-paragraph', { hasText: text }).boundingBox();

    const readGaps = async () => {
      const one = await boxOf('Context one');
      const two = await boxOf('Context two');
      const plainOne = await boxOf('Plain one');
      const plainTwo = await boxOf('Plain two');
      if (!one || !two || !plainOne || !plainTwo) return null;
      return {
        context: two.y - (one.y + one.height),
        plain: plainTwo.y - (plainOne.y + plainOne.height),
      };
    };
    await expect.poll(readGaps, { timeout: 5000 }).not.toBeNull();

    // 240 twips = 16px when unsuppressed; ~0 when contextualSpacing collapses.
    const gaps = (await readGaps()) as { context: number; plain: number };
    expect(gaps.context).toBeLessThan(3);
    expect(gaps.plain).toBeGreaterThan(10);
    expect(gaps.context).toBeLessThan(gaps.plain);
  });
});
