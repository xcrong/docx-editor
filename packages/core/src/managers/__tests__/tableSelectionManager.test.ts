import { describe, expect, test } from 'bun:test';

import { TableSelectionManager } from '../TableSelectionManager';

describe('TableSelectionManager cell selection', () => {
  test('starts with no selection', () => {
    const manager = new TableSelectionManager();
    expect(manager.getSelectedCell()).toBeNull();
    expect(manager.isCellSelected(0, 0, 0)).toBe(false);
  });

  test('selectCell + isCellSelected round-trips exact coordinates', () => {
    const manager = new TableSelectionManager();
    manager.selectCell({ tableIndex: 1, rowIndex: 2, columnIndex: 3 });

    expect(manager.getSelectedCell()).toEqual({ tableIndex: 1, rowIndex: 2, columnIndex: 3 });
    expect(manager.isCellSelected(1, 2, 3)).toBe(true);
    expect(manager.isCellSelected(1, 2, 4)).toBe(false);
    expect(manager.isCellSelected(0, 2, 3)).toBe(false);
  });

  test('selecting another cell replaces the previous one', () => {
    const manager = new TableSelectionManager();
    manager.selectCell({ tableIndex: 0, rowIndex: 0, columnIndex: 0 });
    manager.selectCell({ tableIndex: 0, rowIndex: 1, columnIndex: 0 });

    expect(manager.isCellSelected(0, 0, 0)).toBe(false);
    expect(manager.isCellSelected(0, 1, 0)).toBe(true);
  });

  test('clearSelection empties and notifies subscribers', () => {
    const manager = new TableSelectionManager();
    let notifications = 0;
    const unsubscribe = manager.subscribe(() => {
      notifications++;
    });

    manager.selectCell({ tableIndex: 0, rowIndex: 0, columnIndex: 0 });
    manager.clearSelection();

    expect(manager.getSelectedCell()).toBeNull();
    expect(manager.isCellSelected(0, 0, 0)).toBe(false);
    expect(notifications).toBeGreaterThanOrEqual(2);

    unsubscribe();
  });
});
