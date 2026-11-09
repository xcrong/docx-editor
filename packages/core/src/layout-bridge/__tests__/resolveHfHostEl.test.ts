/**
 * Unit tests for `resolveHfHostEl` (T28-02 #85).
 *
 * The same header/footer doc is painted once per page, so the caret /
 * selection overlay must render on the instance the user is actually
 * editing — not merely the host nearest the viewport center. The engaged
 * host (the dblclick target that opened HF edit mode) wins outright when
 * the caller threads it through; otherwise the legacy center heuristic
 * applies.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { resolveHfHostEl } from '../headerFooterLayout';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function buildHosts(): { footers: Array<HTMLElement | null> } {
  document.body.innerHTML = `
    <div class="paged-editor__pages">
      <div class="layout-page" data-page-number="1">
        <div class="layout-page-footer" id="footer-1">
          <span data-pm-start="1" data-pm-end="5">Page 1 footer</span>
        </div>
      </div>
      <div class="layout-page" data-page-number="2">
        <div class="layout-page-footer" id="footer-2">
          <span data-pm-start="1" data-pm-end="5">Page 2 footer</span>
        </div>
      </div>
    </div>
  `;
  return {
    footers: [
      document.querySelector<HTMLElement>('#footer-1'),
      document.querySelector<HTMLElement>('#footer-2'),
    ],
  };
}

describe('resolveHfHostEl', () => {
  test('prefers the engaged host over the viewport-center heuristic', () => {
    const { footers } = buildHosts();
    // happy-dom reports zero rects, so the heuristic ties and picks the
    // first host — the preferred second host must still win.
    expect(resolveHfHostEl('footer', document, footers[1])).toBe(footers[1]);
  });

  test('accepts a descendant of the engaged host', () => {
    const { footers } = buildHosts();
    const inner = footers[1]!.querySelector('span')!;
    expect(resolveHfHostEl('footer', document, inner)).toBe(footers[1]);
  });

  test('falls back to the heuristic when nothing is preferred', () => {
    const { footers } = buildHosts();
    expect(resolveHfHostEl('footer', document)).toBe(footers[0]);
    expect(resolveHfHostEl('footer', document, null)).toBe(footers[0]);
  });

  test('ignores a disconnected preferred host', () => {
    const { footers } = buildHosts();
    const detached = document.createElement('div');
    detached.className = 'layout-page-footer';
    expect(resolveHfHostEl('footer', document, detached)).toBe(footers[0]);
  });

  test('ignores a preferred host from the other section', () => {
    const { footers } = buildHosts();
    const header = document.createElement('div');
    header.className = 'layout-page-header';
    document.body.appendChild(header);
    try {
      expect(resolveHfHostEl('footer', document, header)).toBe(footers[0]);
    } finally {
      header.remove();
    }
  });

  test('returns null when the section is not painted', () => {
    buildHosts();
    expect(resolveHfHostEl('header', document)).toBeNull();
  });
});
