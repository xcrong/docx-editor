import { expect, forEachAdapter, openEditor } from '../parity-fixture';

// T28-02 #85: was quarantined as "Vue save throws in CI (null.matchesNode)".
// Two compounding causes, both fixed: (1) the `openEditor` harness race —
// save ran while the fixture swap was still in flight; (2) a real engine
// gap — `DocxEditorEngine.save()` dispatched the post-save tracker cleanup
// onto the captured view even when a completed load destroyed/superseded it
// during `await agent.toBuffer(...)` (`null.matchesNode` inside
// prosemirror-view). The engine now re-validates liveness after the await.
forEachAdapter('smoke: save returns docx bytes', async (adapter, { page }) => {
  await openEditor(page, adapter);
  const byteLength = await page.evaluate(
    () => window.__DOCX_EDITOR_E2E__?.saveByteLength() ?? null
  );
  expect(byteLength).toBeGreaterThan(1000);
});
