import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import type { Layout } from '@eigenpal/docx-editor-core/layout-engine';

import { scrollVisiblePositionIntoView } from './domQueries';

/**
 * Outline / bookmark / find-replace navigation on a large, virtualized document
 * (#930 follow-up): when the target heading sits on a page that virtualization
 * has left as an empty shell (no painted `[data-pm-start]` content), the scroll
 * helper must still move the viewport — using layout geometry to find the page
 * and scrolling its (always-present) shell. Mirrors the React path in
 * usePagedScrollApi.scrollToPositionImpl.
 */

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

/** A rect mock — happy-dom has no real layout, so getBoundingClientRect is zeros. */
function rectAt(top: number, height = 0): DOMRect {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON() {},
  } as DOMRect;
}

/**
 * Two pages. Page 1 is painted (body span covers pmPos 0..10); page 2 is an
 * EMPTY virtualized shell — no `.layout-page-content`, no spans — exactly the
 * state `renderPages` leaves far-from-viewport pages in.
 */
function buildVirtualizedPages(): HTMLElement {
  document.body.innerHTML = `
    <div class="paged-editor__pages">
      <div class="layout-page" data-page-number="1">
        <div class="layout-page-content">
          <span data-pm-start="0" data-pm-end="10">painted heading</span>
        </div>
      </div>
      <div class="layout-page" data-page-number="2"></div>
    </div>
  `;
  return document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
}

const twoPageLayout = {
  pageSize: { w: 500, h: 700 },
  pages: [
    {
      number: 1,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      size: { w: 500, h: 700 },
      fragments: [
        {
          kind: 'paragraph',
          blockId: '0',
          x: 0,
          y: 0,
          width: 500,
          height: 100,
          pmStart: 0,
          pmEnd: 10,
        },
      ],
    },
    {
      number: 2,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      size: { w: 500, h: 700 },
      fragments: [
        {
          kind: 'paragraph',
          blockId: '1',
          x: 0,
          y: 0,
          width: 500,
          height: 100,
          pmStart: 50,
          pmEnd: 60,
        },
      ],
    },
  ],
} as unknown as Layout;

describe('scrollVisiblePositionIntoView — painted target (unchanged behavior)', () => {
  test('scrolls the viewport to the painted element and ignores layout', () => {
    const pages = buildVirtualizedPages();
    const viewport = document.createElement('div');
    Object.defineProperty(viewport, 'scrollTop', { writable: true, value: 100 });

    // pmPos 5 is covered by the painted span on page 1.
    const paintedSpan = pages.querySelector<HTMLElement>('[data-pm-start="0"]')!;
    viewport.getBoundingClientRect = () => rectAt(0, 600);
    paintedSpan.getBoundingClientRect = () => rectAt(40, 20);
    const scrollTo = mock(() => {});
    viewport.scrollTo = scrollTo as unknown as typeof viewport.scrollTo;

    // No layout passed — the painted path must not need it.
    scrollVisiblePositionIntoView(pages, viewport, 5);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    // top = target.top(40) − viewport.top(0) + scrollTop(100) − 48
    expect(scrollTo).toHaveBeenCalledWith({ top: 92, behavior: 'smooth' });
  });
});

describe('scrollVisiblePositionIntoView — virtualized fallback', () => {
  test('scrolls the viewport to the page shell when the target is not painted', () => {
    const pages = buildVirtualizedPages();
    const viewport = document.createElement('div');
    Object.defineProperty(viewport, 'scrollTop', { writable: true, value: 0 });

    const page2Shell = pages.querySelectorAll<HTMLElement>('.layout-page')[1];
    // Pin geometry so the computed scroll target is deterministic.
    viewport.getBoundingClientRect = () => rectAt(0, 600);
    page2Shell.getBoundingClientRect = () => rectAt(1400, 700);
    const scrollTo = mock(() => {});
    viewport.scrollTo = scrollTo as unknown as typeof viewport.scrollTo;

    // pmPos 55 lives on page 2 (fragment pmStart 50 / pmEnd 60), which is the
    // empty shell — the exact situation that used to no-op.
    scrollVisiblePositionIntoView(pages, viewport, 55, twoPageLayout);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    // top = shell.top(1400) − viewport.top(0) + scrollTop(0) − 48 padding
    expect(scrollTo).toHaveBeenCalledWith({ top: 1352, behavior: 'smooth' });
  });
});
