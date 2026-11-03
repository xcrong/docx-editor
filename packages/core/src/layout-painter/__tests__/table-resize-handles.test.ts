/**
 * Painter: every inter-column boundary gets a draggable resize handle.
 *
 * Regression guard for "only the last column's border responds to drag":
 * column handles must exist for ALL boundaries (n cols → n-1 handles) and
 * be appended AFTER the row boxes so the absolutely-positioned rows don't
 * capture the mousedown first.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderTableFragment } from '../renderTable';
import type {
  ParagraphMeasure,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const ctx: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body' };
const LINE = 20;

function pm(lines: number): ParagraphMeasure {
  return {
    kind: 'paragraph',
    lines: Array.from({ length: lines }, () => ({
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 0,
      width: 10,
      ascent: 16,
      descent: 4,
      lineHeight: LINE,
    })),
    totalHeight: lines * LINE,
  };
}

function build(cols: number): {
  block: TableBlock;
  measure: TableMeasure;
  fragment: TableFragment;
} {
  const widths = Array(cols).fill(100);
  const block = {
    kind: 'table',
    id: 't',
    columnWidths: widths,
    rows: [
      {
        id: 0,
        cells: Array.from({ length: cols }, (_, i) => ({
          id: i + 1,
          blocks: [{ kind: 'paragraph', id: i + 1, runs: [] }],
        })),
      },
      {
        id: 1,
        cells: Array.from({ length: cols }, (_, i) => ({
          id: 100 + i,
          blocks: [{ kind: 'paragraph', id: 100 + i, runs: [] }],
        })),
      },
    ],
  } as unknown as TableBlock;

  const measure: TableMeasure = {
    kind: 'table',
    columnWidths: widths,
    totalWidth: cols * 100,
    totalHeight: LINE * 2,
    rows: [0, 1].map(() => ({
      height: LINE,
      cells: widths.map((w) => ({ blocks: [pm(1)], width: w, height: LINE })),
    })),
  };

  const fragment: TableFragment = {
    kind: 'table',
    blockId: 't',
    x: 0,
    y: 0,
    width: cols * 100,
    height: LINE * 2,
    fromRow: 0,
    toRow: 2,
  };
  return { block, measure, fragment };
}

describe('renderTableFragment — column resize handles', () => {
  test('4-column table emits 3 handles, one per inter-column boundary', () => {
    const { block, measure, fragment } = build(4);
    const el = renderTableFragment(fragment, block, measure, ctx);
    const handles = [...el.querySelectorAll('.layout-table-resize-handle')] as HTMLElement[];
    expect(handles.length).toBe(3);
    expect(handles.map((h) => h.dataset.columnIndex)).toEqual(['0', '1', '2']);
    // Boundaries at x=100/200/300, minus the 3px grab inset.
    expect(handles.map((h) => parseFloat(h.style.left))).toEqual([97, 197, 297]);
  });

  test('handles sit after row boxes but before row/edge handles', () => {
    const { block, measure, fragment } = build(4);
    const el = renderTableFragment(fragment, block, measure, ctx);
    const children = [...el.children] as HTMLElement[];
    const idxOf = (cls: string): number[] =>
      children
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.classList.contains(cls))
        .map(({ i }) => i);
    const rows = idxOf('layout-table-row');
    const colHandles = idxOf('layout-table-resize-handle');
    const rowHandles = idxOf('layout-table-row-resize-handle');
    const bottomHandles = idxOf('layout-table-edge-handle-bottom');
    const rightHandles = idxOf('layout-table-edge-handle-right');
    expect(colHandles.length).toBe(3);
    // Above the row boxes (lower auto z-index loses to z-10 regardless of
    // order, but late-DOM is the belt and braces)...
    expect(Math.min(...colHandles)).toBeGreaterThan(Math.max(...rows));
    // ...yet before the row/edge handles so those keep their crossings
    // (same z-index → later DOM wins hit-testing).
    for (const later of [...rowHandles, ...bottomHandles, ...rightHandles]) {
      expect(Math.max(...colHandles)).toBeLessThan(later);
    }
  });

  test('2/3/5-column tables emit n-1 handles', () => {
    for (const cols of [2, 3, 5]) {
      const { block, measure, fragment } = build(cols);
      const el = renderTableFragment(fragment, block, measure, ctx);
      expect(el.querySelectorAll('.layout-table-resize-handle').length).toBe(cols - 1);
    }
  });

  test('nested tables emit no handles (top-level tables only)', () => {
    const inner = build(2);
    const outerBlock = {
      kind: 'table',
      id: 'outer',
      columnWidths: [300],
      rows: [{ id: 0, cells: [{ id: 1, blocks: [inner.block] }] }],
    } as unknown as TableBlock;
    const outerMeasure: TableMeasure = {
      kind: 'table',
      columnWidths: [300],
      totalWidth: 300,
      totalHeight: LINE,
      rows: [
        {
          height: LINE,
          cells: [{ blocks: [inner.measure], width: 300, height: LINE }],
        },
      ],
    };
    const outerFragment: TableFragment = {
      kind: 'table',
      blockId: 'outer',
      x: 0,
      y: 0,
      width: 300,
      height: LINE,
      fromRow: 0,
      toRow: 1,
    };
    const el = renderTableFragment(outerFragment, outerBlock, outerMeasure, ctx);
    const nested = el.querySelector('.layout-nested-table') as HTMLElement;
    expect(nested).toBeTruthy();
    // The outer 1-column table has no boundaries; the nested 2-column table
    // intentionally gets no handles (its cells belong to inner PM positions
    // the resize commits don't scope to).
    expect(nested.querySelector('.layout-table-resize-handle')).toBeNull();
  });
});
