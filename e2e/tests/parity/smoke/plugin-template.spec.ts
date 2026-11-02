import { expect, forEachAdapter, openEditor } from '../parity-fixture';

// §6.1 — built-in templatePlugin works via the Vue adapter using only core's
// plugin contract. Both demos mount `templatePlugin.proseMirrorPlugins` as
// `externalPlugins` when `?template=1`; the spec plants docxtemplater syntax
// and asserts the core tag detection fires identically on both adapters.
forEachAdapter('smoke: template plugin detects tags on both adapters', async (adapter, { page }) => {
  await openEditor(page, adapter, '&template=1');

  // The boot sample.docx and the uploaded fixture race on first paint;
  // wait for the fixture's marker text so the plant can't land on the
  // sample doc and get discarded when the fixture load wins.
  await expect
    .poll(() => page.evaluate(() => window.__DOCX_EDITOR_E2E__?.agentGetDocumentText() ?? ''))
    .toContain('Beispieltext');

  const planted = await page.evaluate(() => {
    const hook = window.__DOCX_EDITOR_E2E__;
    const paraId = hook?.getFirstTextblockParaId();
    if (!hook || !paraId) return false;
    return hook.agentProposeChange({
      paraId,
      search: '',
      replaceWith: ' {customerName} lives in {#orders}{total}{/orders}.',
      author: 'Parity Smoke',
    });
  });
  expect(planted).toBe(true);

  // {customerName} + {#orders} + {total} + {/orders} = 4 tags in PM state.
  await expect
    .poll(() => page.evaluate(() => window.__DOCX_EDITOR_E2E__?.getTemplateTagCount?.() ?? null))
    .toBe(4);
});
