/**
 * Sidebar overlay breakpoint + leader-line endpoint geometry shared by the
 * React and Vue adapters (both adapters call these so the behavior can't
 * drift). See `sidebarConstants.ts`.
 */

import { describe, expect, test } from 'bun:test';
import {
  SIDEBAR_OVERLAY_BREAKPOINT,
  computeLeaderLineEndpoints,
  shouldUseSidebarOverlay,
} from '../sidebarConstants';

describe('shouldUseSidebarOverlay', () => {
  test('wide containers shift the document', () => {
    expect(shouldUseSidebarOverlay(1280)).toBe(false);
    expect(shouldUseSidebarOverlay(SIDEBAR_OVERLAY_BREAKPOINT)).toBe(false);
  });
  test('narrow containers overlay with a backdrop', () => {
    expect(shouldUseSidebarOverlay(1000)).toBe(true);
    expect(shouldUseSidebarOverlay(SIDEBAR_OVERLAY_BREAKPOINT - 1)).toBe(true);
  });
});

describe('computeLeaderLineEndpoints', () => {
  const svg = { left: 10, top: 20, right: 1010, bottom: 820 };
  const anchor = { left: 100, top: 200, right: 180, bottom: 220 };
  const card = { left: 900, top: 190, right: 1240, bottom: 270 };
  test('connects anchor right-edge mid to card left-edge mid in SVG-local coords', () => {
    expect(computeLeaderLineEndpoints(svg, anchor, card)).toEqual({
      x1: 170,
      y1: 190,
      x2: 890,
      y2: 210,
    });
  });
  test('null when either endpoint is missing', () => {
    expect(computeLeaderLineEndpoints(svg, null, card)).toBeNull();
    expect(computeLeaderLineEndpoints(svg, anchor, undefined)).toBeNull();
  });
});
