import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderImageRun, renderTextRun } from '../renderParagraph/runs';
import type { ImageRun, TextRun } from '../../layout-engine/types';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function inlineRun(hlinkHref?: string): ImageRun {
  return { kind: 'image', src: 'data:image/png;base64,x', width: 100, height: 50, hlinkHref };
}

describe('renderImageRun hyperlink (a:hlinkClick)', () => {
  test('inline image with hlinkHref wraps in an anchor carrying pm markers', () => {
    const run = { ...inlineRun('https://example.com/x'), pmStart: 5, pmEnd: 6 };
    const el = renderImageRun(run, document);
    expect(el.tagName).toBe('A');
    expect((el as HTMLAnchorElement).href).toContain('https://example.com');
    expect((el as HTMLAnchorElement).target).toBe('_blank');
    expect(el.dataset.pmStart).toBe('5');
    expect(el.querySelector('img')).not.toBeNull();
  });

  test('image without hyperlink renders bare img', () => {
    const el = renderImageRun(inlineRun(), document);
    expect(el.tagName).toBe('IMG');
  });

  test('javascript: href is dropped at render', () => {
    const el = renderImageRun(inlineRun('javascript:alert(1)'), document);
    expect(el.tagName).toBe('IMG');
  });

  test('block image links only the inner img, keeping container pm mapping', () => {
    const run: ImageRun = {
      ...inlineRun('https://example.com/x'),
      displayMode: 'block',
      pmStart: 7,
      pmEnd: 8,
    };
    const el = renderImageRun(run, document);
    expect(el.classList.contains('layout-block-image')).toBe(true);
    expect(el.dataset.pmStart).toBe('7');
    const link = el.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.querySelector('img')).not.toBeNull();
  });

  test('inline link keeps pm on the inner element for image hit-testing', () => {
    const run = { ...inlineRun('https://example.com/x'), pmStart: 5, pmEnd: 6 };
    const el = renderImageRun(run, document);
    const inner = el.querySelector('img, span');
    expect(inner).not.toBeNull();
    expect((inner as HTMLElement).dataset.pmStart).toBe('5');
  });
});

describe('renderTextRun hyperlink sanitization', () => {
  test('javascript: text hyperlink renders as plain text', () => {
    const run = {
      kind: 'text',
      text: 'evil',
      hyperlink: { href: 'javascript:alert(1)' },
    } as unknown as TextRun;
    const el = renderTextRun(run, document);
    expect(el.tagName).toBe('SPAN');
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toBe('evil');
  });

  test('https text hyperlink still renders as anchor', () => {
    const run = {
      kind: 'text',
      text: 'ok',
      hyperlink: { href: 'https://example.com/' },
    } as unknown as TextRun;
    const el = renderTextRun(run, document);
    expect(el.querySelector('a')).not.toBeNull();
  });
});
