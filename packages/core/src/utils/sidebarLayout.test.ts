import { describe, expect, test } from 'bun:test';
import { computeSidebarLayoutWidths } from './sidebarLayout';

describe('sidebar layout widths (shared React/Vue contract)', () => {
  test('matches the legacy formula: 2×allowance + widest + shift', () => {
    const r = computeSidebarLayoutWidths({
      showOutline: false,
      showOutlineButton: false,
      showRuler: false,
      sidebarShifted: false,
      sectionPageWidthsTwips: [12240],
      finalPageWidthTwips: 12240,
    });
    // allowance 20 → 2*20 + round(12240/15)=816 → 856
    expect(r.outlineLeftAllowance).toBe(20);
    expect(r.minLayoutWidth).toBe(856);
    expect(r.pageWidthPx).toBe(816);
  });

  test('outline + ruler + shift stack, widest section wins', () => {
    const r = computeSidebarLayoutWidths({
      showOutline: true,
      showOutlineButton: false,
      showRuler: true,
      sidebarShifted: true,
      sectionPageWidthsTwips: [12240, 15840],
      finalPageWidthTwips: 15840,
      spaces: { sidebarShift: 176 },
    });
    // allowance 268+20=288 → 2*288 + round(15840/15)=1056 + 2*176 → 1984
    expect(r.outlineLeftAllowance).toBe(288);
    expect(r.minLayoutWidth).toBe(1984);
    expect(r.pageWidthPx).toBe(1056);
  });

  test('missing widths fall back to defaults', () => {
    const r = computeSidebarLayoutWidths({
      showOutline: false,
      showOutlineButton: false,
      showRuler: false,
      sidebarShifted: false,
      sectionPageWidthsTwips: [undefined, -5],
    });
    expect(r.minLayoutWidth).toBe(2 * 20 + 816);
    expect(r.pageWidthPx).toBe(816);
  });
});
