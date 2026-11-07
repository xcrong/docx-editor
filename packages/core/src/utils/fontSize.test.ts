import { describe, expect, test } from 'bun:test';
import { nextFontSize, prevFontSize, clampFontSizeInput } from './fontSize';

const PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

describe('font-size stepper math (shared React/Vue contract)', () => {
  test('steps through the ladder', () => {
    expect(nextFontSize(PRESETS, 11)).toBe(12);
    expect(prevFontSize(PRESETS, 12)).toBe(11);
  });

  test('falls back to ±1 past the ends with bounds', () => {
    expect(nextFontSize(PRESETS, 72)).toBe(73);
    expect(nextFontSize(PRESETS, 500, 400)).toBe(400);
    expect(prevFontSize(PRESETS, 8)).toBe(7);
    expect(prevFontSize(PRESETS, 1)).toBe(1);
  });

  test('typed input clamps (Vue box: 1–1638)', () => {
    expect(clampFontSizeInput(2000, 1, 1638)).toBe(1638);
    expect(clampFontSizeInput(0, 1, 1638)).toBe(1);
    expect(clampFontSizeInput(NaN, 1, 1638)).toBe(1);
  });
});
