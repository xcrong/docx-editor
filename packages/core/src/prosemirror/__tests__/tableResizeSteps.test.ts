import { describe, expect, test } from 'bun:test';
import {
  pxDeltaToTwips,
  stepColumnResize,
  stepRowResize,
  stepRightEdgeResize,
  MIN_CELL_WIDTH_TWIPS,
  MIN_ROW_HEIGHT_TWIPS,
} from '../tableResize';

describe('table-resize drag steps (shared React/Vue contract)', () => {
  test('px deltas quantize to twips (0 = no visible movement)', () => {
    expect(pxDeltaToTwips(0.01)).toBe(0);
    expect(pxDeltaToTwips(2)).toBe(30);
    expect(pxDeltaToTwips(-2)).toBe(-30);
  });

  test('column step shifts left/right, rejects below min on either side', () => {
    expect(stepColumnResize({ left: 1000, right: 1000 }, 30)).toEqual({
      left: 1030,
      right: 970,
    });
    // Right side would drop below min → whole step rejected (anchor stays).
    expect(stepColumnResize({ left: 1000, right: 310 }, 30)).toBeNull();
    expect(stepColumnResize({ left: 310, right: 1000 }, -30)).toBeNull();
    // Exactly at min is accepted.
    expect(stepColumnResize({ left: 1000, right: MIN_CELL_WIDTH_TWIPS + 30 }, 30)).toEqual({
      left: 1030,
      right: MIN_CELL_WIDTH_TWIPS,
    });
  });

  test('row step accepts at min, rejects below', () => {
    expect(stepRowResize(500, 30)).toBe(530);
    expect(stepRowResize(MIN_ROW_HEIGHT_TWIPS, 0)).toBe(MIN_ROW_HEIGHT_TWIPS);
    expect(stepRowResize(MIN_ROW_HEIGHT_TWIPS, -30)).toBeNull();
  });

  test('right-edge step grows the last column alone', () => {
    expect(stepRightEdgeResize(1000, 30)).toBe(1030);
    expect(stepRightEdgeResize(MIN_CELL_WIDTH_TWIPS, -30)).toBeNull();
  });
});
