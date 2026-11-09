/**
 * Parity test helpers — runs the same spec body against the React (5173)
 * and Vue (5174) demos so we catch divergence in the Agent SDK surface.
 *
 * Each test forks once per adapter; titles get a `[react]` / `[vue]`
 * suffix. Use `openAgentPanel(page, adapter, extraQuery)` to navigate
 * the demo and wait for the panel — covers both adapters' ready logic.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const PARA_ID_FIXTURE = path.resolve('e2e/fixtures/example-with-image.docx');

export interface AdapterFixture {
  /** Stable identifier — appears in the test title. */
  name: 'react' | 'vue';
  /** Demo URL root for this adapter. */
  baseUrl: string;
  /**
   * In React, the agent panel auto-toggles via a toolbar button. In Vue,
   * the demo renders the panel inline (no toolbar toggle yet). When true,
   * the helper clicks "Open assistant" to reveal the panel.
   */
  needsToolbarToggle: boolean;
  /**
   * Selector that signals the editor finished mounting. React uses the
   * `data-testid="docx-editor"` shell; Vue exposes `.docx-editor-vue`.
   */
  readySelector: string;
}

export const ADAPTERS: AdapterFixture[] = [
  {
    name: 'react',
    baseUrl: 'http://localhost:5173',
    needsToolbarToggle: true,
    readySelector: '[data-testid="docx-editor"]',
  },
  {
    name: 'vue',
    baseUrl: 'http://localhost:5174',
    needsToolbarToggle: false,
    readySelector: '.docx-editor-vue',
  },
];

/**
 * Navigate to the demo with `?agentPanel=1` and wait until the panel is
 * on screen. `extraQuery` appends extra params (e.g. `&agentTimeline=…`).
 * Replaces the per-spec gotoOpenPanel/gotoTimeline helpers.
 */
export async function openAgentPanel(
  page: Page,
  adapter: AdapterFixture,
  extraQuery = ''
): Promise<void> {
  await page.goto(`${adapter.baseUrl}/?e2e=1&agentPanel=1${extraQuery}`);
  await page.waitForSelector(adapter.readySelector, { timeout: 25000 });
  if (adapter.needsToolbarToggle) {
    await page.getByRole('button', { name: 'Open assistant' }).click();
  }
  await expect(page.getByTestId('agent-panel')).toBeVisible();
}

/**
 * Marker text unique to `PARA_ID_FIXTURE` (`example-with-image.docx`).
 * Neither adapter's boot `sample.docx` contains it, so it proves the
 * uploaded fixture finished parsing — not just that *some* document
 * rendered. Without this, the poll below goes green on the still-loading
 * default sample doc while the fixture parse is in flight (fonts add
 * 1s+ in CI), and specs evaluate against the wrong document: Vue
 * highlightRange anchors collapse, agentAddComment plants miss, and a
 * mid-swap save can dispatch onto a destroyed view (T28-02 #85).
 */
export const FIXTURE_TEXT_MARKER = 'Beispieltext';

/** Navigate to the editor-only demo and wait for the adapter shell. */
export async function openEditor(
  page: Page,
  adapter: AdapterFixture,
  extraQuery = ''
): Promise<void> {
  await page.goto(`${adapter.baseUrl}/?e2e=1${extraQuery}`);
  await page.waitForSelector(adapter.readySelector, { timeout: 25000 });
  await expect(page.locator(adapter.readySelector)).toBeVisible();
  await expect(page.locator('.paged-editor__pages')).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(PARA_ID_FIXTURE);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pageCount = window.__DOCX_EDITOR_E2E__?.getTotalPages() ?? 0;
          const firstParaId =
            window.__DOCX_EDITOR_E2E__?.getFirstTextblockParaId() ??
            window.__DOCX_EDITOR_E2E__
              ?.agentGetPageContent(1)
              ?.paragraphs.find((paragraph) => paragraph.text.trim().length > 0)?.paraId ??
            null;
          return pageCount > 0 && typeof firstParaId === 'string' && firstParaId.length > 0;
        }),
      { timeout: 25000 }
    )
    .toBe(true);
  // The poll above also passes on the boot sample doc while the fixture
  // upload is still parsing — wait for the fixture's own text so every
  // spec below observes the same document on both adapters.
  await expect
    .poll(
      () =>
        page.evaluate(
          (marker) =>
            window.__DOCX_EDITOR_E2E__?.agentGetDocumentText?.().includes(marker) ?? false,
          FIXTURE_TEXT_MARKER
        ),
      { timeout: 25000 }
    )
    .toBe(true);
}

/**
 * Declare a test once, run it once per adapter. Each generated test gets
 * `[<adapter>]` appended to its title.
 *
 * On failure an explicit screenshot is captured to the test's output
 * directory as `<adapter>-failure.png` (alongside Playwright's own
 * only-on-failure screenshot). The output path embeds the test title —
 * which carries the `[react]` / `[vue]` tag — so a failing artifact is
 * always attributable to its adapter without opening the report.
 *
 * @param opts.fixmeAdapters quarantine these adapters via `test.fixme`
 * (tracked cross-adapter gap — skip shows in reports, suite stays green,
 * owning issue re-enables).
 */
export function forEachAdapter(
  title: string,
  body: (adapter: AdapterFixture, args: { page: Page }) => Promise<void>,
  opts?: { fixmeAdapters?: string[]; fixmeReason?: string }
): void {
  for (const adapter of ADAPTERS) {
    const quarantined = opts?.fixmeAdapters?.includes(adapter.name) ?? false;
    const declareTest = quarantined ? test.fixme : test;
    // First arg must literally destructure for Playwright's fixture
    // detection: `(args) =>` would fail "First argument must use the
    // object destructuring pattern".
    declareTest(`${title} [${adapter.name}]`, async ({ page }, testInfo) => {
      if (quarantined && opts?.fixmeReason)
        testInfo.annotations.push({ type: 'issue', description: opts.fixmeReason });
      try {
        await body(adapter, { page });
      } catch (error) {
        // The page may already be dead (navigation failure, crash) — never
        // let the attribution screenshot mask the original error.
        await page
          .screenshot({ path: testInfo.outputPath(`${adapter.name}-failure.png`) })
          .catch(() => {});
        throw error;
      }
    });
  }
}

export { expect };
