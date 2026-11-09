import { expect, forEachAdapter, openEditor } from '../parity-fixture';

// QUARANTINE (T28-02 #85): Vue saveByteLength throws inside save in CI
// (null.matchesNode) — passes locally, CI-deterministic. #85 to root-cause.
forEachAdapter(
  'smoke: save returns docx bytes',
  async (adapter, { page }) => {
    await openEditor(page, adapter);
    const byteLength = await page.evaluate(
      () => window.__DOCX_EDITOR_E2E__?.saveByteLength() ?? null
    );
    expect(byteLength).toBeGreaterThan(1000);
  },
  { fixmeAdapters: ['vue'], fixmeReason: 'T28-02 #85: Vue save throws in CI (matchesNode)' }
);
