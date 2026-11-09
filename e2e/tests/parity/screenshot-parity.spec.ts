/**
 * Screenshot parity — cross-adapter render equivalence (§7.4, issue #84).
 *
 * Loads the same DOCX in both adapter demos, screenshots the first rendered
 * page (`[data-page-number="1"]`, emitted by the shared layout-painter) in
 * each, and pixel-diffs the two shots with pixelmatch. Because both shots
 * come from the same machine, browser, and run, any pixel difference is
 * attributable to the adapters — no platform-specific committed baselines
 * needed (macOS vs Linux font rendering would make committed PNGs flaky
 * in CI).
 *
 * Gate: diff ratio must stay at or under MAX_DIFF_RATIO below (coarse v1
 * value; see note there). Per-adapter shots are written to the test output
 * directory (`canvas-react.png` / `canvas-vue.png`) for human review, and
 * CI uploads them on failure.
 */
import { test, expect, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { ADAPTERS, openEditor, type AdapterFixture } from './parity-fixture';

/**
 * Coarse v1 threshold. Measured cross-adapter baseline on the fixture
 * corpus is ~1.4%, all of it known rendering gaps owned by #85 (T28-02):
 * sub-pixel vertical text shift across every line, image-box height
 * differing by a few px, and a ±1px page-height flip between runs. This
 * gate locks the current level — missing runs, dropped images, or layout
 * collapse move the ratio by tens of percent and turn it red. Tighten
 * toward the 0.1% §10.5 target as #85 converges each gap.
 */
const MAX_DIFF_RATIO = 0.02;
/**
 * Shoot the first rendered page, not the canvas container: the demos wrap
 * the shared paged canvas in adapter-specific chrome (different toolbars,
 * widths), but individual pages (`[data-page-number]`, emitted by the
 * shared layout-painter) are the true cross-adapter render contract.
 */
async function shootCanvas(target: Page, adapter: AdapterFixture): Promise<Buffer> {
  await openEditor(target, adapter);
  // Webfont swap shifts line metrics run to run — wait for fonts before
  // shooting. Blur removes the adapter demos' differing autofocus state so
  // a focus caret can't leak into one shot but not the other.
  await target.evaluate(() => document.fonts.ready);
  await target.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  // Let layout settle (paged canvas) so the shot is stable.
  await target.waitForTimeout(800);
  return target
    .locator('[data-page-number="1"]')
    .screenshot({ animations: 'disabled', caret: 'hide' });
}

test('react and vue canvases render equivalently [cross-adapter]', async ({
  page,
  context,
}, testInfo) => {
  const shots = new Map<string, Buffer>();
  for (const adapter of ADAPTERS) {
    const target = adapter.name === 'react' ? page : await context.newPage();
    try {
      shots.set(adapter.name, await shootCanvas(target, adapter));
    } finally {
      if (target !== page) await target.close();
    }
  }
  // Persisted to the test output dir for human review (CI uploads them).
  writeFileSync(testInfo.outputPath('canvas-react.png'), shots.get('react'));
  writeFileSync(testInfo.outputPath('canvas-vue.png'), shots.get('vue'));

  const reactPng = PNG.sync.read(shots.get('react'));
  const vuePng = PNG.sync.read(shots.get('vue'));

  // Compare the overlapping region; any size drift counts as fully
  // different pixels so a growing layout gap still turns the gate red.
  const width = Math.min(reactPng.width, vuePng.width);
  const height = Math.min(reactPng.height, vuePng.height);
  const crop = (
    png: { width: number; height: number; data: Buffer },
    w: number,
    h: number
  ): Buffer => {
    const rowBytes = w * 4;
    const out = Buffer.alloc(rowBytes * h);
    for (let y = 0; y < h; y += 1)
      png.data.copy(out, y * rowBytes, y * png.width * 4, y * png.width * 4 + rowBytes);
    return out;
  };
  const diffPixels = pixelmatch(
    crop(reactPng, width, height),
    crop(vuePng, width, height),
    null,
    width,
    height,
    {
      threshold: 0.1,
    }
  );
  const sizePenalty = Math.abs(reactPng.width * reactPng.height - vuePng.width * vuePng.height);
  const ratio =
    (diffPixels + sizePenalty) /
    Math.max(reactPng.width * reactPng.height, vuePng.width * vuePng.height);

  expect(
    ratio,
    `canvas diff ratio ${(ratio * 100).toFixed(3)}% exceeds ${(MAX_DIFF_RATIO * 100).toFixed(1)}% ` +
      `(react ${reactPng.width}x${reactPng.height}, vue ${vuePng.width}x${vuePng.height}, ${diffPixels} pixel diffs)`
  ).toBeLessThanOrEqual(MAX_DIFF_RATIO);
});
