import { describe, expect, test } from 'bun:test';
import { extractCellFloatingImages } from '../renderTableCellFloating';
import type {
  ImageRun,
  ParagraphBlock,
  ParagraphMeasure,
  TableCell,
  TableCellMeasure,
} from '../../layout-engine/types';

function floatRun(overrides: Partial<ImageRun> = {}): ImageRun {
  return {
    kind: 'image',
    src: 'x.png',
    width: 100,
    height: 60,
    wrapType: 'square',
    displayMode: 'float',
    cssFloat: 'left',
    ...overrides,
  };
}

function cellWithFloats(runs: ImageRun[][], textHeight = 200) {
  const blocks = runs.map(
    (runsInPara) => ({ kind: 'paragraph', runs: runsInPara }) as unknown as ParagraphBlock
  );
  const cell = { blocks } as unknown as TableCell;
  const cellMeasure = {
    blocks: blocks.map(
      () =>
        ({ kind: 'paragraph', totalHeight: textHeight, lines: [] }) as unknown as ParagraphMeasure
    ),
  } as unknown as TableCellMeasure;
  return { cell, cellMeasure };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('extractCellFloatingImages cascade', () => {
  test('identical anchors in one cell stack vertically without overlap', () => {
    const { cell, cellMeasure } = cellWithFloats([[floatRun(), floatRun()]]);
    const floats = extractCellFloatingImages(cell, cellMeasure, 400);
    expect(floats).toHaveLength(2);
    expect(floats[0]?.y).toBe(0);
    // Second float clears the first (height 60 + default dist gaps 0/0 →
    // stacked exactly; distTop/distBottom default to 0).
    expect(floats[1]?.y).toBeGreaterThanOrEqual(60);
    expect(rectsOverlap(floats[0]!, floats[1]!)).toBe(false);
  });

  test('non-overlapping floats keep their anchor positions', () => {
    const { cell, cellMeasure } = cellWithFloats([
      [
        floatRun({
          position: { horizontal: { relativeTo: 'column' }, vertical: { relativeTo: 'paragraph' } },
        }),
      ],
    ]);
    const floats = extractCellFloatingImages(cell, cellMeasure, 400);
    expect(floats).toHaveLength(1);
    expect(floats[0]?.y).toBe(0);
  });

  test('floats in different paragraphs cascade across paragraph offsets', () => {
    const { cell, cellMeasure } = cellWithFloats([[floatRun()], [floatRun()]], 30);
    const floats = extractCellFloatingImages(cell, cellMeasure, 400);
    expect(floats).toHaveLength(2);
    // Second paragraph starts at y=30, inside the first float's [0, 60] box.
    expect(floats[1]?.y).toBeGreaterThanOrEqual(60);
    expect(rectsOverlap(floats[0]!, floats[1]!)).toBe(false);
  });

  test('side-by-side floats without X overlap are not pushed down', () => {
    const { cell, cellMeasure } = cellWithFloats([
      [
        floatRun({
          position: {
            horizontal: { relativeTo: 'column', posOffset: 0 },
            vertical: { relativeTo: 'paragraph' },
          },
        }),
        floatRun({
          position: {
            horizontal: { relativeTo: 'column', posOffset: 1905000 },
            vertical: { relativeTo: 'paragraph' },
          },
        }),
      ],
    ]);
    const floats = extractCellFloatingImages(cell, cellMeasure, 400);
    expect(floats).toHaveLength(2);
    // 200px in EMU ≈ offset far enough right to clear the 100px left float.
    expect(floats[0]?.y).toBe(floats[1]?.y);
  });
});
