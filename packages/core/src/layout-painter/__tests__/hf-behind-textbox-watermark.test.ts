/**
 * Regression (#103): a `behind` text box anchored in a header (the demo
 * `CONFIDENTIAL · 机密` DrawingML watermark: `wrap: behind`, page-centered)
 * must paint *behind* body text and honor its vertical anchor.
 *
 * Before the fix the HF `textBox` branch pinned the box to the HF flow
 * cursor (`top = cursorY`, so a page-centered watermark landed on the header
 * band) and dropped the `behind` wrap (synthetic fragment carried no
 * `isFloating`/`zIndex`, so `renderTextBoxFragment` fell back to `z-index:
 * auto` — and with the header element appended after the body content, the
 * watermark covered the text it should show through). Mirrors the body
 * pipeline (`layoutTextBox`: `behind → zIndex -1`) and the floating-image
 * path (`resolveHeaderFooterFloatTop`).
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  renderHeaderFooterContent,
  type HeaderFooterContent,
  type HeaderFooterLayoutInfo,
} from '../renderPage/headerFooter';
import type { TextBoxBlock, TextBoxMeasure } from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const ctx: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body', contentWidth: 600 };
const layout: HeaderFooterLayoutInfo = {
  flowTop: 48,
  flowLeft: 72,
  contentWidth: 600,
  pageWidth: 744,
  pageHeight: 1123,
  margins: { top: 102, right: 72, bottom: 72, left: 72 },
};

// Demo watermark geometry: 5486400 x 762000 EMU → 576 x 80 px.
const WM_WIDTH = 576;
const WM_HEIGHT = 80;

function watermarkBlock(wrapType: 'behind' | 'inFront'): TextBoxBlock {
  return {
    kind: 'textBox',
    id: 'wm1',
    width: WM_WIDTH,
    height: WM_HEIGHT,
    content: [],
    displayMode: 'float',
    wrapType,
    position: {
      horizontal: { relativeTo: 'page', align: 'center' },
      vertical: { relativeTo: 'page', align: 'center' },
    },
  };
}

const watermarkMeasure: TextBoxMeasure = {
  kind: 'textBox',
  width: WM_WIDTH,
  height: WM_HEIGHT,
  innerMeasures: [],
};

function render(block: TextBoxBlock): HTMLElement | null {
  const content: HeaderFooterContent = {
    blocks: [block],
    measures: [watermarkMeasure],
    height: WM_HEIGHT,
    flowHeight: 0,
    visualTop: 0,
    visualBottom: WM_HEIGHT,
  };
  const el = renderHeaderFooterContent(content, ctx, { document }, layout);
  return el.querySelector<HTMLElement>('.layout-textbox');
}

describe('HF behind text box watermark (#103)', () => {
  test('behind box paints below content (z-index -1)', () => {
    const box = render(watermarkBlock('behind'))!;
    expect(box.style.zIndex).toBe('-1');
  });

  test('behind box honors the page-center vertical anchor (not the HF cursor)', () => {
    const box = render(watermarkBlock('behind'))!;
    const expectedTop = (layout.pageHeight - WM_HEIGHT) / 2 - layout.flowTop;
    expect(parseFloat(box.style.top)).toBeCloseTo(expectedTop, 5);
    // Sanity: the resolved top is far below the header band, not at cursorY.
    expect(parseFloat(box.style.top)).toBeGreaterThan(100);
  });

  test('inFront box paints above content (z-index 1)', () => {
    const box = render(watermarkBlock('inFront'))!;
    expect(box.style.zIndex).toBe('1');
  });

  test('inline box is untouched: flow cursor top, no stacking override', () => {
    const inline: TextBoxBlock = {
      kind: 'textBox',
      id: 'tb-inline',
      width: 200,
      height: 40,
      content: [],
      displayMode: 'inline',
    };
    const content: HeaderFooterContent = {
      blocks: [inline],
      measures: [{ kind: 'textBox', width: 200, height: 40, innerMeasures: [] }],
      height: 40,
      flowHeight: 40,
      visualTop: 0,
      visualBottom: 40,
    };
    const el = renderHeaderFooterContent(content, ctx, { document }, layout);
    const box = el.querySelector<HTMLElement>('.layout-textbox')!;
    expect(box.style.top).toBe('0px');
    expect(box.style.zIndex).toBe('');
  });
});
