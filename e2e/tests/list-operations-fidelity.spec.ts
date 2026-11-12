/**
 * List Operations Fidelity — multi-select editing (TBD).
 *
 * Covers the multi-select paths of ListExtension: indent/outdent and the
 * list toggle must apply to every list paragraph in the selection, not just
 * the anchor paragraph. Builds content in an empty document (gotoEmpty) and
 * asserts ProseMirror paragraph attrs directly via the E2E view hook.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

interface PMDocJSON {
  type: string;
  content?: PMDocJSON[];
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Array<{ type: string; attrs: Record<string, unknown> }>;
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

async function ilvlsOf(page: import('@playwright/test').Page, label: string): Promise<unknown[]> {
  const doc = await getDocJSON(page);
  return paragraphsOf(doc)
    .filter((p) => textOf(p).includes(label))
    .map((p) => (p.attrs?.numPr as { ilvl?: number } | null)?.ilvl ?? null);
}

test.describe('List operations fidelity — multi-select', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  async function makeThreeItemBulletList(): Promise<void> {
    await editor.typeText('Alpha');
    await editor.pressEnter();
    await editor.typeText('Beta');
    await editor.pressEnter();
    await editor.typeText('Gamma');
    await editor.selectAll();
    await editor.toggleBulletList();
  }

  test('multi-select indent changes all items', async ({ page }) => {
    await makeThreeItemBulletList();

    await editor.selectAll();
    await editor.indent();

    // Every selected item moves from ilvl 0 to ilvl 1 in one transaction.
    await expect.poll(() => ilvlsOf(page, 'Alpha'), { timeout: 5000 }).toEqual([1]);
    expect(await ilvlsOf(page, 'Beta')).toEqual([1]);
    expect(await ilvlsOf(page, 'Gamma')).toEqual([1]);

    // All three items keep their markers — indent must not drop numbering.
    const doc = await getDocJSON(page);
    const items = paragraphsOf(doc).filter((p) => /Alpha|Beta|Gamma/.test(textOf(p)));
    expect(items.length).toBe(3);
    for (const item of items) {
      expect(item.attrs?.numPr).toMatchObject({ numId: 1, ilvl: 1 });
    }
  });

  test('multi-select toggle removes all list styling', async ({ page }) => {
    await makeThreeItemBulletList();

    // Sanity: all three are listed before the toggle-off.
    expect(await ilvlsOf(page, 'Alpha')).toEqual([0]);
    expect(await ilvlsOf(page, 'Beta')).toEqual([0]);
    expect(await ilvlsOf(page, 'Gamma')).toEqual([0]);

    await editor.selectAll();
    await editor.toggleBulletList();

    // No item keeps numbering after toggling the whole selection off.
    await expect
      .poll(
        async () => {
          const doc = await getDocJSON(page);
          return paragraphsOf(doc)
            .filter((p) => /Alpha|Beta|Gamma/.test(textOf(p)))
            .map((p) => p.attrs?.numPr ?? null);
        },
        { timeout: 5000 }
      )
      .toEqual([null, null, null]);

    // Text survives, markers are gone from the painted page.
    await expect(page.locator('.layout-page-content')).toContainText('Alpha');
    await expect(page.locator('.layout-page-content')).toContainText('Beta');
    await expect(page.locator('.layout-page-content')).toContainText('Gamma');
    expect(await page.locator('.layout-list-marker').count()).toBe(0);
  });
});
