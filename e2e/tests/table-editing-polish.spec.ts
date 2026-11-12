/**
 * Table Editing Polish (openspec change `table-editing-polish`).
 *
 * Column resize and add-row formatting inheritance are implemented in core
 * (unit-covered by `table-resize-handles.test.ts` and
 * `TableExtension/commands/addRow.test.ts`); these specs verify the behavior
 * end-to-end through real UI gestures:
 *
 * - Dragging a middle-column border in a 4-column table adjusts the two
 *   adjacent columns inversely and preserves the total table width.
 * - A resize can be dragged back to (approximately) its original position.
 * - "Insert row below" inherits center alignment, font family, and cell
 *   shading from the reference row while leaving cells empty.
 */

import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

type E2EView = { state: { doc: any }; dispatch: (tr: any) => void };

interface ResizeHandleInfo {
  col: string;
  pmStart: number;
  x: number;
  top: number;
  height: number;
}

async function getResizeHandles(page: Page): Promise<ResizeHandleInfo[]> {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.layout-page-content .layout-table-resize-handle')].map(
      (h) => {
        const el = h as HTMLElement;
        const r = el.getBoundingClientRect();
        return {
          col: el.dataset.columnIndex ?? '',
          pmStart: Number(el.dataset.tablePmStart ?? '0'),
          x: r.x + r.width / 2,
          top: r.y,
          height: r.height,
        };
      }
    );
  });
}

/**
 * Click a table cell, retrying across painter re-renders. Toolbar actions
 * (alignment, font, fill) dispatch PM transactions that rebuild the painted
 * pages — a click raced with that rebuild throws "not attached to the DOM".
 */
async function clickTableCellSettled(
  editor: EditorPage,
  table: number,
  row: number,
  col: number
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await editor.clickTableCell(table, row, col);
      return;
    } catch {
      await editor.page.waitForTimeout(200);
    }
  }
  await editor.clickTableCell(table, row, col);
}

async function getColumnWidths(page: Page, pmStart: number): Promise<number[] | null> {
  return page.evaluate((pmStart: number) => {
    const view = (
      window as unknown as {
        __DOCX_EDITOR_E2E__: { getView: () => E2EView };
      }
    ).__DOCX_EDITOR_E2E__.getView();
    let out: number[] | null = null;
    view.state.doc.nodesBetween(pmStart, pmStart + 1, (n: any) => {
      if (n.type.name === 'table') out = [...(n.attrs.columnWidths as number[])];
    });
    return out;
  }, pmStart);
}

interface RowCellSnapshot {
  alignment: unknown;
  defaultTextFormatting: unknown;
  backgroundColor: unknown;
  text: string;
  rowCount: number;
}

async function getRowCellSnapshot(
  page: Page,
  tableIndex: number,
  rowIdx: number,
  cellIdx: number
): Promise<RowCellSnapshot | null> {
  return page.evaluate(
    ({ tableIndex, rowIdx, cellIdx }: { tableIndex: number; rowIdx: number; cellIdx: number }) => {
      const view = (
        window as unknown as {
          __DOCX_EDITOR_E2E__: { getView: () => E2EView };
        }
      ).__DOCX_EDITOR_E2E__.getView();
      let table: any = null;
      let seen = -1;
      view.state.doc.descendants((n: any) => {
        if (n.type.name === 'table') {
          seen += 1;
          if (seen === tableIndex) table = n;
        }
      });
      if (!table) return null;
      const row = table.child(rowIdx);
      const cell = row.child(cellIdx);
      const para = cell.firstChild;
      return {
        alignment: para?.attrs?.alignment ?? null,
        defaultTextFormatting: para?.attrs?.defaultTextFormatting ?? null,
        backgroundColor: cell.attrs?.backgroundColor ?? null,
        text: cell.textContent as string,
        rowCount: table.childCount as number,
      };
    },
    { tableIndex, rowIdx, cellIdx }
  );
}

async function dragHandle(page: Page, from: { x: number; y: number }, dx: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/**
 * Grab point for a column handle. The row-resize handle overlaps the column
 * handle at the row boundary (the vertical center for equal-height rows), so
 * grabbing the center would start a row resize instead — aim just below the
 * handle's top edge, inside the first row.
 */
function grabPoint(h: ResizeHandleInfo): { x: number; y: number } {
  return { x: h.x, y: h.top + 6 };
}

/**
 * Insert a row below via the right-click context menu. The toolbar "More"
 * menu remounts while Playwright clicks its items (tableContext updates
 * rebuild the dropdown), so the context menu is the stable trigger here.
 */
async function insertRowBelowViaContextMenu(editor: EditorPage): Promise<void> {
  await clickTableCellSettled(editor, 0, 0, 0);
  await editor.rightClickTableCell(0, 0, 0);
  await editor.page
    .locator('[role="menu"] [role="menuitem"]')
    .filter({ hasText: /^Insert row below$/ })
    .click();
  await editor.page.waitForTimeout(300);
}

test.describe('Table Editing Polish — column resize', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.insertTable(2, 4);
    await page.waitForSelector('.layout-page-content .layout-table-resize-handle');
  });

  test('resize middle column in 4-column table adjusts adjacent columns inversely', async ({
    page,
  }) => {
    const handles = await getResizeHandles(page);
    // A 4-column table exposes one handle per inter-column border.
    expect(handles.map((h) => h.col).sort()).toEqual(['0', '1', '2']);

    const middle = handles.find((h) => h.col === '1');
    expect(middle, 'middle border handle (columnIndex 1) exists').toBeTruthy();
    const before = await getColumnWidths(page, middle!.pmStart);
    expect(before, 'columnWidths has 4 entries').not.toBeNull();
    expect(before!.length).toBe(4);

    await dragHandle(page, grabPoint(middle!), 60);

    const after = await getColumnWidths(page, middle!.pmStart);
    expect(after!.length).toBe(4);
    // Dragging right grows the left column and shrinks the right one.
    expect(after![1]).toBeGreaterThan(before![1]);
    expect(after![2]).toBeLessThan(before![2]);
    // Total table width is preserved (inverse redistribution).
    expect(after![1] + after![2]).toBe(before![1] + before![2]);
    // Untouched columns keep their widths.
    expect(after![0]).toBe(before![0]);
    expect(after![3]).toBe(before![3]);
  });

  test('resize can be dragged back to the original position', async ({ page }) => {
    const handles = await getResizeHandles(page);
    const middle = handles.find((h) => h.col === '1');
    expect(middle, 'middle border handle (columnIndex 1) exists').toBeTruthy();
    const before = await getColumnWidths(page, middle!.pmStart);
    expect(before!.length).toBe(4);

    await dragHandle(page, grabPoint(middle!), 60);
    const moved = await getColumnWidths(page, middle!.pmStart);
    expect(JSON.stringify(moved)).not.toBe(JSON.stringify(before));

    // Re-query: the handle moves with the border after re-layout.
    const repositioned = (await getResizeHandles(page)).find((h) => h.col === '1');
    expect(repositioned, 'handle still exists after first drag').toBeTruthy();
    await dragHandle(page, grabPoint(repositioned!), -60);

    const restored = await getColumnWidths(page, middle!.pmStart);
    // Pixel→twip rounding per mousemove step can leave a sub-pixel residue.
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(restored![i] - before![i])).toBeLessThanOrEqual(30);
    }
  });
});

test.describe('Table Editing Polish — add row inherits formatting', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.insertTable(2, 2);
  });

  test('add row inherits center alignment from reference row', async ({ page }) => {
    await clickTableCellSettled(editor, 0, 0, 0);
    await editor.typeText('Ref');
    await editor.alignCenter();

    await insertRowBelowViaContextMenu(editor);

    const ref = await getRowCellSnapshot(page, 0, 0, 0);
    expect(ref?.alignment).toBe('center');

    const added = await getRowCellSnapshot(page, 0, 1, 0);
    expect(added?.rowCount).toBe(3);
    expect(added?.alignment).toBe('center');
    expect(added?.text).toBe('');
  });

  test('add row inherits font family from reference row', async ({ page }) => {
    await clickTableCellSettled(editor, 0, 0, 0);
    // Set the font on the empty paragraph so it lands in the paragraph's
    // default run formatting — the attr add-row copies to the new cell.
    await editor.setFontFamily('Georgia');
    await editor.typeText('Ref');

    await insertRowBelowViaContextMenu(editor);

    const ref = await getRowCellSnapshot(page, 0, 0, 0);
    expect(JSON.stringify(ref?.defaultTextFormatting)).toContain('Georgia');

    const added = await getRowCellSnapshot(page, 0, 1, 0);
    expect(added?.rowCount).toBe(3);
    expect(JSON.stringify(added?.defaultTextFormatting)).toContain('Georgia');
    expect(added?.text).toBe('');
  });

  test('add row inherits cell shading from reference row', async ({ page }) => {
    await clickTableCellSettled(editor, 0, 0, 0);
    await editor.setCellFillColor('#ffff00');

    await insertRowBelowViaContextMenu(editor);

    const ref = await getRowCellSnapshot(page, 0, 0, 0);
    expect(ref?.backgroundColor, 'reference cell has a fill color').toBeTruthy();

    const added = await getRowCellSnapshot(page, 0, 1, 0);
    expect(added?.rowCount).toBe(3);
    expect(added?.backgroundColor).toBe(ref?.backgroundColor);
    expect(added?.text).toBe('');
  });
});
