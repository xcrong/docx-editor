import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  findHfEmptyRuns,
  findHfParagraphs,
  findHfPmAnchor,
  findHfPmAnchors,
  findHfPmSpans,
  findHfRanged,
} from '../findBodyPmSpans';
import { getCaretPositionFromDom, getSelectionRectsFromDom } from '../clickToPositionDom';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function buildScopedPage(): { pages: HTMLElement; header: HTMLElement; footer: HTMLElement } {
  document.body.innerHTML = `
    <div class="paged-editor__pages">
      <div class="layout-page" data-page-number="2">
        <div class="layout-page-header">
          <div class="layout-paragraph" data-pm-start="1" data-pm-end="5">
            <div class="layout-line">
              <span class="layout-run" data-pm-start="1" data-pm-end="5" id="hf-span">Hello</span>
            </div>
          </div>
          <div class="layout-paragraph" data-pm-start="5" data-pm-end="5">
            <div class="layout-line">
              <span class="layout-run layout-empty-run" id="hf-empty-run">&nbsp;</span>
            </div>
          </div>
        </div>
        <div class="layout-page-content">
          <div class="layout-paragraph" data-pm-start="1" data-pm-end="5">
            <div class="layout-line">
              <span class="layout-run" data-pm-start="1" data-pm-end="5" id="body-span">Body</span>
            </div>
          </div>
        </div>
        <div class="layout-page-footer">
          <span class="layout-run" data-pm-start="1" data-pm-end="1" id="hf-tab">​</span>
        </div>
      </div>
    </div>
  `;
  const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
  return {
    pages,
    header: pages.querySelector<HTMLElement>('.layout-page-header')!,
    footer: pages.querySelector<HTMLElement>('.layout-page-footer')!,
  };
}

describe('findHf* mirrors', () => {
  test('findHfPmSpans resolves within a host root without the HF prefix', () => {
    const { header } = buildScopedPage();
    expect(findHfPmSpans(header).map((s) => s.id)).toEqual(['hf-span']);
  });

  test('findHfPmSpans resolves within a wider container via the HF prefix', () => {
    const { pages } = buildScopedPage();
    const ids = findHfPmSpans(pages)
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(['hf-span', 'hf-tab']);
  });

  test('HF finders never match body spans with colliding PM positions', () => {
    const { pages, header } = buildScopedPage();
    expect(findHfPmSpans(pages).some((s) => s.id === 'body-span')).toBe(false);
    expect(findHfPmSpans(header).some((s) => s.id === 'body-span')).toBe(false);
    expect(findHfEmptyRuns(header).map((s) => s.id)).toEqual(['hf-empty-run']);
  });

  test('findHfPmAnchors / findHfPmAnchor / findHfRanged / findHfParagraphs stay HF-scoped', () => {
    const { pages, header } = buildScopedPage();
    // Anchors include both the run span and the paragraph elements.
    expect(findHfPmAnchors(header).length).toBeGreaterThan(0);
    expect(findHfPmAnchors(header).some((el) => el.id === 'body-span')).toBe(false);
    expect(findHfPmAnchors(pages).some((el) => el.id === 'body-span')).toBe(false);
    // Exact anchor resolves inside the header, never the body tree. The
    // first match is the paragraph div (document order), which carries
    // no id — assert scope containment instead.
    const anchor = findHfPmAnchor(header, 1);
    expect(anchor?.closest('.layout-page-header')).not.toBeNull();
    expect(anchor?.closest('.layout-page-content')).toBeNull();
    expect(anchor?.dataset.pmStart).toBe('1');
    expect(findHfPmAnchor(header, 99)).toBeNull();
    expect(findHfPmAnchor(header, NaN)).toBeNull();
    // Ranged covers spans and paragraphs.
    expect(findHfRanged(header).length).toBeGreaterThanOrEqual(3);
    // Paragraphs are HF-only.
    const paras = findHfParagraphs(header);
    expect(paras.length).toBe(2);
    expect(findHfParagraphs(pages).length).toBe(2);
  });
});

describe('getSelectionRectsFromDom — scope isolation', () => {
  function buildCollidingSlivers(): { pages: HTMLElement; header: HTMLElement } {
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page" data-page-number="1">
          <div class="layout-page-header">
            <span class="layout-run" data-pm-start="7" data-pm-end="7" id="hf-sliver">​</span>
          </div>
          <div class="layout-page-content">
            <span class="layout-run" data-pm-start="7" data-pm-end="7" id="body-sliver">​</span>
          </div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    return { pages, header: pages.querySelector<HTMLElement>('.layout-page-header')! };
  }

  test('body scope ignores the HF sliver at the same PM range', () => {
    const { pages } = buildCollidingSlivers();
    const rects = getSelectionRectsFromDom(pages, 5, 10, new DOMRect(0, 0, 0, 0));
    expect(rects).toHaveLength(1);
  });

  test("hf scope resolves only the host's sliver", () => {
    const { pages, header } = buildCollidingSlivers();
    const rects = getSelectionRectsFromDom(pages, 5, 10, new DOMRect(0, 0, 0, 0), {
      scope: 'hf',
      host: header,
    });
    expect(rects).toHaveLength(1);
  });

  test('hf scope without a host falls back to the container-wide HF prefix', () => {
    const { pages } = buildCollidingSlivers();
    const rects = getSelectionRectsFromDom(pages, 5, 10, new DOMRect(0, 0, 0, 0), {
      scope: 'hf',
    });
    expect(rects).toHaveLength(1);
  });
});

describe('getCaretPositionFromDom — scope isolation', () => {
  test('body scope returns null when only an HF span covers the position', () => {
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page" data-page-number="1">
          <div class="layout-page-header">
            <span class="layout-run" data-pm-start="1" data-pm-end="9">Header text</span>
          </div>
          <div class="layout-page-content">
            <span class="layout-run" data-pm-start="1" data-pm-end="2">Bo</span>
          </div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    expect(getCaretPositionFromDom(pages, 7, new DOMRect(0, 0, 0, 0))).toBeNull();
  });

  test('hf scope resolves a span the body tree does not cover', () => {
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page" data-page-number="3">
          <div class="layout-page-header">
            <div class="layout-paragraph" data-pm-start="1" data-pm-end="9">
              <div class="layout-line">
                <span class="layout-run" data-pm-start="1" data-pm-end="9">Header text</span>
              </div>
            </div>
          </div>
          <div class="layout-page-content">
            <span class="layout-run" data-pm-start="1" data-pm-end="2">Bo</span>
          </div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    const header = pages.querySelector<HTMLElement>('.layout-page-header')!;
    const caret = getCaretPositionFromDom(pages, 7, new DOMRect(0, 0, 0, 0), 1, {
      scope: 'hf',
      host: header,
    });
    expect(caret).not.toBeNull();
    // data-page-number="3" → 0-based page index 2.
    expect(caret?.pageIndex).toBe(2);
  });

  test('hf scope falls back to the exact anchor when no span covers the position', () => {
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page" data-page-number="1">
          <div class="layout-page-header">
            <div class="layout-line" data-pm-start="4" data-pm-end="4">Line anchor</div>
          </div>
          <div class="layout-page-content"></div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    const header = pages.querySelector<HTMLElement>('.layout-page-header')!;
    const caret = getCaretPositionFromDom(pages, 4, new DOMRect(0, 0, 0, 0), 1, {
      scope: 'hf',
      host: header,
    });
    // Zero-size happy-dom rect: left edge + 1, default height.
    expect(caret).toMatchObject({ x: 1, y: 0, height: 16 });
  });

  test('hf scope falls back to the host top-left when nothing brackets the position', () => {
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page" data-page-number="1">
          <div class="layout-page-header"></div>
          <div class="layout-page-content"></div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    const header = pages.querySelector<HTMLElement>('.layout-page-header')!;
    const caret = getCaretPositionFromDom(pages, 5, new DOMRect(0, 0, 0, 0), 1, {
      scope: 'hf',
      host: header,
    });
    expect(caret).toMatchObject({ x: 2, y: 2, height: 16 });
  });

  test('body scope keeps resolving the body span when an HF span collides', () => {
    const { pages } = buildScopedPage();
    const caret = getCaretPositionFromDom(pages, 3, new DOMRect(0, 0, 0, 0));
    expect(caret).not.toBeNull();
    expect(caret?.pageIndex).toBe(1);
  });
});

describe('getCaretPositionFromDom — hf fallback units + hyperlink runs', () => {
  function mockRect(
    el: Element,
    rect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }
  ): void {
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }) as unknown as DOMRect;
  }

  function buildTrailingPage(): { pages: HTMLElement; header: HTMLElement; para: HTMLElement } {
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page" data-page-number="1">
          <div class="layout-page-header">
            <div class="layout-paragraph" data-pm-start="1" data-pm-end="5">
              <div class="layout-line">
                <span class="layout-run" data-pm-start="1" data-pm-end="5">Hello</span>
              </div>
            </div>
          </div>
          <div class="layout-page-content"></div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    const header = pages.querySelector<HTMLElement>('.layout-page-header')!;
    const para = header.querySelector<HTMLElement>('.layout-paragraph')!;
    return { pages, header, para };
  }

  test('trailing edge past every range snaps to rect.right; height scales to layout px', () => {
    const { pages, header, para } = buildTrailingPage();
    mockRect(para, { left: 10, top: 20, right: 100, bottom: 36, width: 90, height: 16 });
    // pmPos=9: no span or paragraph covers it, no exact anchor brackets it —
    // the trailing-edge fallback snaps to the [1,5] paragraph's right edge.
    const caret = getCaretPositionFromDom(pages, 9, new DOMRect(0, 0, 0, 0), 1, {
      scope: 'hf',
      host: header,
    });
    expect(caret).toMatchObject({ x: 100, y: 20, height: 16 });
    // Same position at zoom=2: X/Y stay viewport px, height halves to layout px.
    const zoomed = getCaretPositionFromDom(pages, 9, new DOMRect(0, 0, 0, 0), 2, {
      scope: 'hf',
      host: header,
    });
    expect(zoomed).toMatchObject({ x: 100, y: 20, height: 8 });
  });

  test('main-path caret height divides by zoom while X/Y stay viewport px', () => {
    const { pages, header } = buildTrailingPage();
    const rangeRect = { left: 40, top: 10, right: 40, bottom: 42, width: 0, height: 32 };
    const orig = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = function () {
      return { ...rangeRect, x: 40, y: 10, toJSON: () => ({}) } as unknown as DOMRect;
    };
    try {
      const at1 = getCaretPositionFromDom(pages, 3, new DOMRect(0, 0, 0, 0), 1, {
        scope: 'hf',
        host: header,
      });
      expect(at1).toMatchObject({ x: 40, y: 10, height: 32 });
      const at2 = getCaretPositionFromDom(pages, 3, new DOMRect(0, 0, 0, 0), 2, {
        scope: 'hf',
        host: header,
      });
      expect(at2).toMatchObject({ x: 40, y: 10, height: 16 });
    } finally {
      Range.prototype.getBoundingClientRect = orig;
    }
  });

  test('caret resolves inside <a>-nested hyperlink text, not the span edge', () => {
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page" data-page-number="1">
          <div class="layout-page-header">
            <div class="layout-paragraph" data-pm-start="1" data-pm-end="6">
              <div class="layout-line">
                <span class="layout-run" data-pm-start="1" data-pm-end="6" id="link-run"><a href="https://example.com">Hello</a></span>
              </div>
            </div>
          </div>
          <div class="layout-page-content"></div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    const header = pages.querySelector<HTMLElement>('.layout-page-header')!;
    const span = header.querySelector<HTMLElement>('#link-run')!;
    mockRect(span, { left: 10, top: 20, right: 60, bottom: 36, width: 50, height: 16 });
    const orig = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = function () {
      return {
        left: 34,
        top: 22,
        right: 34,
        bottom: 38,
        width: 0,
        height: 16,
        x: 34,
        y: 22,
        toJSON: () => ({}),
      } as unknown as DOMRect;
    };
    try {
      // The old firstChild-only lookup saw the `<a>` element (not text) and
      // fell back to the span's left edge (x=10) for every offset; the
      // TreeWalker resolves the boundary inside the link text (x=34).
      const caret = getCaretPositionFromDom(pages, 4, new DOMRect(0, 0, 0, 0), 1, {
        scope: 'hf',
        host: header,
      });
      expect(caret).toMatchObject({ x: 34, y: 22, height: 16 });
    } finally {
      Range.prototype.getBoundingClientRect = orig;
    }
  });

  test('a textless run resolves to its left edge — no ratio interpolation', () => {
    // Documents the intentional removal of the old
    // `computeHfCaretRectFromView` ratio fallback
    // (`left + width * (pmPos - start) / (end - start)`): a collapsed caret
    // must sit on a real character boundary, and a fractional mid-run x has
    // no corresponding PM position. Line-end and empty-run carets are
    // covered by the trailing-edge and empty-paragraph fallbacks instead.
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page" data-page-number="1">
          <div class="layout-page-header">
            <div class="layout-paragraph" data-pm-start="3" data-pm-end="5">
              <div class="layout-line">
                <span class="layout-run" data-pm-start="3" data-pm-end="5" id="empty-run"></span>
              </div>
            </div>
          </div>
          <div class="layout-page-content"></div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    const header = pages.querySelector<HTMLElement>('.layout-page-header')!;
    const span = header.querySelector<HTMLElement>('#empty-run')!;
    mockRect(span, { left: 10, top: 20, right: 50, bottom: 36, width: 40, height: 16 });
    const caret = getCaretPositionFromDom(pages, 4, new DOMRect(0, 0, 0, 0), 1, {
      scope: 'hf',
      host: header,
    });
    // Ratio interpolation would give 10 + 40 * (4-3)/(5-3) = 30.
    expect(caret).toMatchObject({ x: 10, y: 20 });
  });
});
