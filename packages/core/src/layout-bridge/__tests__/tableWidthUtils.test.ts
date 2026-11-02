import { describe, test, expect } from 'bun:test';
import {
  resolveTableWidthPx,
  normalizeTableColumnWidths,
  resolveTableColumnWidths,
} from '../tableWidthUtils';
import type { TableBlock } from '../../layout-engine/types';

describe('resolveTableWidthPx', () => {
  test('dxa: twips converted to pixels', () => {
    // 1440 twips = 1 inch = 96 px
    expect(resolveTableWidthPx(1440, 'dxa', 600)).toBeCloseTo(96, 1);
  });

  test('pct: 50ths of a percent (5000 = 100%) per ECMA-376 §17.18.111', () => {
    expect(resolveTableWidthPx(2500, 'pct', 600)).toBe(300);
    expect(resolveTableWidthPx(5000, 'pct', 600)).toBe(600);
    // Small spec values must NOT be coerced to plain percent — `1` means 0.02%.
    expect(resolveTableWidthPx(1, 'pct', 5000)).toBeCloseTo(1, 5);
  });

  test('zero / negative / undefined width returns undefined', () => {
    expect(resolveTableWidthPx(0, 'dxa', 600)).toBeUndefined();
    expect(resolveTableWidthPx(-10, 'dxa', 600)).toBeUndefined();
    expect(resolveTableWidthPx(undefined, 'dxa', 600)).toBeUndefined();
  });

  test('unrecognized widthType returns undefined', () => {
    expect(resolveTableWidthPx(1440, 'nil', 600)).toBeUndefined();
  });
});

describe('normalizeTableColumnWidths', () => {
  test('empty array returns evenly-split target width', () => {
    expect(normalizeTableColumnWidths([], 3, 300)).toEqual([100, 100, 100]);
  });

  test('missing trailing columns inherit average of existing positives', () => {
    expect(normalizeTableColumnWidths([100, 200], 4, 1000)).toEqual([100, 200, 150, 150]);
  });

  test('zero/negative widths split the leftover target evenly', () => {
    const out = normalizeTableColumnWidths([100, 0, 100, -5], 4, 400);
    expect(out[0]).toBe(100);
    expect(out[2]).toBe(100);
    expect(out[1]).toBeCloseTo(100, 5);
    expect(out[3]).toBeCloseTo(100, 5);
  });

  test('all zero returns even split of target', () => {
    expect(normalizeTableColumnWidths([0, 0, 0], 3, 300)).toEqual([100, 100, 100]);
  });
});

describe('resolveTableColumnWidths — adaptive margins', () => {
  const twoColBlock = (widths: number[]): TableBlock =>
    ({
      kind: 'table',
      id: 1,
      columnWidths: widths,
      rows: [
        {
          id: 10,
          cells: [
            { id: 11, blocks: [] },
            { id: 12, blocks: [] },
          ],
        },
        {
          id: 20,
          cells: [
            { id: 21, blocks: [] },
            { id: 22, blocks: [] },
          ],
        },
      ],
    }) as unknown as TableBlock;

  test('scales columns proportionally when grid total exceeds content width', () => {
    const out = resolveTableColumnWidths(twoColBlock([400, 400]), 600);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(600, 5);
    // Equal columns stay proportional (50/50).
    expect(out[0]).toBeCloseTo(300, 5);
    expect(out[1]).toBeCloseTo(300, 5);
  });

  test('preserves ratio for unequal columns when scaling down', () => {
    const out = resolveTableColumnWidths(twoColBlock([600, 300]), 600);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(600, 5);
    expect(out[0]! / out[1]!).toBeCloseTo(2, 5);
  });

  test('leaves fitting tables untouched', () => {
    expect(resolveTableColumnWidths(twoColBlock([300, 200]), 600)).toEqual([300, 200]);
  });

  test('floating tables are not adaptively scaled', () => {
    const block = twoColBlock([400, 400]);
    (block as { floating?: object }).floating = { horzAnchor: 'page' };
    expect(resolveTableColumnWidths(block, 600)).toEqual([400, 400]);
  });
});
