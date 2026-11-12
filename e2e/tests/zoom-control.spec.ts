/**
 * EditorPage zoom helpers drive the real ZoomControl (Radix Select).
 *
 * Regression cover for the previously broken `setZoom` helper, which targeted
 * a nonexistent `.zoom-control input` (ZoomControl is a − / % / + stepper
 * around a Radix Select, so the helper threw/does nothing repo-wide).
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Read the CSS scale the painter applies for the current zoom.
function readZoomScale(): number {
  const scaled = document.querySelector('.paged-editor__pages')
    ?.parentElement as HTMLElement | null;
  if (!scaled) return -1;
  return new DOMMatrixReadOnly(getComputedStyle(scaled).transform).a || 1;
}

test('setZoom drives the ZoomControl dropdown (150% then 50%)', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();

  await editor.setZoom(1.5);
  await expect(editor.zoomControl).toHaveText('150%');
  expect(await page.evaluate(readZoomScale)).toBeCloseTo(1.5, 1);

  await editor.setZoom(50);
  await expect(editor.zoomControl).toHaveText('50%');
  expect(await page.evaluate(readZoomScale)).toBeCloseTo(0.5, 1);
});

test('zoomIn/zoomOut step through preset levels', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();

  await expect(editor.zoomControl).toHaveText('100%');
  await editor.zoomIn();
  await expect(editor.zoomControl).toHaveText('125%');
  await editor.zoomOut();
  await expect(editor.zoomControl).toHaveText('100%');
});
