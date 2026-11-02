/**
 * Review-plugin 9.2: live `createReviewBridge` over the React demo.
 *
 * Load DOCX → call bridge methods (`agentBridge*`, backed by the real
 * `createReviewBridge` in the demo) → verify rendering. Unlike
 * agent-bridge.spec.ts (which drives the ref directly), this spec covers the
 * same paraId delegation path the agent uses (the adapter resolves each
 * paraId to PM positions at call time).
 *
 * Uses the Vite demo's `window.__DOCX_EDITOR_E2E__` opt-in hook (?e2e=1).
 */

import { test, expect } from '@playwright/test';
import type { ContentBlock } from '@xcrong/docx-editor-agents';
import { EditorPage } from '../helpers/editor-page';

type TextBlock = Exclude<ContentBlock, { type: 'table' }>;

async function firstBridgedBlock(page: import('@playwright/test').Page): Promise<TextBlock | null> {
  await page.waitForFunction(() => Boolean(window.__DOCX_EDITOR_E2E__), undefined, {
    timeout: 15000,
  });
  const blocks = await page.evaluate(
    () => window.__DOCX_EDITOR_E2E__?.agentBridgeGetContent() ?? []
  );
  const textBlocks = blocks.filter((b): b is TextBlock => b.type !== 'table');
  return textBlocks.find((b) => b.paraId && b.text.trim().length >= 6) ?? null;
}

test.describe('Review bridge e2e — createReviewBridge over the live editor', () => {
  test.beforeEach(async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    // Fixture carries paraIds so the bridge has stable anchors.
    await editor.loadDocxFile('fixtures/example-with-image.docx');
  });

  test('load DOCX → bridge addComment → sidebar card + mark render', async ({ page }) => {
    const target = await firstBridgedBlock(page);
    // Fail loudly, don't skip: 9.2 is pointless without a paraId-anchored
    // block, so a fixture regression must break the suite, not go silently green.
    expect(target).toBeTruthy();

    const commentId = await page.evaluate(
      ([id]) =>
        window.__DOCX_EDITOR_E2E__?.agentBridgeAddComment({
          paraId: id,
          text: 'Bridge says hi.',
        }) ?? null,
      [target!.paraId!]
    );
    expect(typeof commentId).toBe('number');

    // Sidebar shows the bridge-created comment.
    await expect(page.getByText('Bridge says hi.')).toBeVisible({ timeout: 5000 });

    // The comment mark lands in the visible pages on the requested paraId.
    const hasMark = await page.evaluate(
      (cid) => Boolean(document.querySelector(`.paged-editor__pages [data-comment-id="${cid}"]`)),
      commentId as number
    );
    expect(hasMark).toBe(true);
  });

  test('load DOCX → bridge proposeChange → insertion/deletion render', async ({ page }) => {
    const target = await firstBridgedBlock(page);
    // Fail loudly, don't skip: see above.
    expect(target).toBeTruthy();

    // Pick a 6-char window unique within the paragraph for `search`.
    const handle = await page.evaluate(
      ([id, full]) => {
        for (let i = 0; i + 6 <= full.length; i++) {
          const cand = full.substring(i, i + 6);
          if (full.indexOf(cand) === full.lastIndexOf(cand)) return { paraId: id, search: cand };
        }
        return null;
      },
      [target!.paraId!, target!.text]
    );
    // Fail loudly, don't skip: a 6+ char paragraph all but guarantees a unique
    // window, so a miss here means the helper (not the fixture) is broken.
    expect(handle).toBeTruthy();

    const ok = await page.evaluate(
      ([h]) =>
        window.__DOCX_EDITOR_E2E__?.agentBridgeProposeChange({
          paraId: h!.paraId,
          search: h!.search,
          replaceWith: 'BRIDGE-EDIT',
        }) ?? false,
      [handle]
    );
    expect(ok).toBe(true);

    // Insertion renders green-underline; deletion renders red-strikethrough.
    await expect(
      page.locator('.docx-insertion').filter({ hasText: 'BRIDGE-EDIT' }).first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('.docx-deletion').filter({ hasText: handle!.search }).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
