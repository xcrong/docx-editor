import { afterEach, describe, expect, test, vi } from 'bun:test';

import { ErrorManager } from '../ErrorManager';

afterEach(() => {
  vi.useRealTimers();
});

describe('ErrorManager show/subscribe', () => {
  test('showError adds an error notification and notifies subscribers', () => {
    const manager = new ErrorManager();
    const seen: number[] = [];
    const unsubscribe = manager.subscribe(() => {
      seen.push(manager.getSnapshot().notifications.length);
    });

    const id = manager.showError('boom', 'details');
    expect(typeof id).toBe('string');

    const snapshot = manager.getSnapshot();
    expect(snapshot.notifications).toHaveLength(1);
    expect(snapshot.notifications[0]).toMatchObject({
      id,
      message: 'boom',
      severity: 'error',
      details: 'details',
    });
    expect(seen.length).toBeGreaterThan(0);

    unsubscribe();
    manager.destroy();
  });

  test('showWarning/showInfo add matching severities', () => {
    const manager = new ErrorManager();

    manager.showWarning('careful');
    manager.showInfo('heads up');

    const severities = manager.getSnapshot().notifications.map((n) => n.severity);
    expect(severities).toEqual(['warning', 'info']);

    manager.destroy();
  });

  test('unsubscribed listeners stop receiving updates', () => {
    const manager = new ErrorManager();
    let calls = 0;
    const unsubscribe = manager.subscribe(() => {
      calls++;
    });
    unsubscribe();

    manager.showError('ignored');
    expect(calls).toBe(0);

    manager.destroy();
  });

  test('ids are unique across notifications', () => {
    const manager = new ErrorManager();
    const ids = new Set([manager.showError('a'), manager.showError('b')]);
    expect(ids.size).toBe(2);
    manager.destroy();
  });
});

describe('ErrorManager dismiss/clear', () => {
  test('dismiss flags the notification then removes it after the animation delay', () => {
    vi.useFakeTimers();
    const manager = new ErrorManager();
    const id = manager.showError('boom');

    manager.dismiss(id);
    expect(manager.getSnapshot().notifications.find((n) => n.id === id)?.dismissed).toBe(true);

    vi.advanceTimersByTime(350);
    expect(manager.getSnapshot().notifications.find((n) => n.id === id)).toBeUndefined();

    manager.destroy();
  });

  test('dismissing an unknown id leaves existing notifications in place', () => {
    vi.useFakeTimers();
    const manager = new ErrorManager();
    manager.showError('boom');

    manager.dismiss('missing-id');
    vi.advanceTimersByTime(1000);
    // The original notification survives; only its own dismiss removes it.
    expect(manager.getSnapshot().notifications).toHaveLength(1);

    manager.destroy();
  });

  test('clearAll empties notifications and notifies once more', () => {
    const manager = new ErrorManager();
    let calls = 0;
    manager.subscribe(() => {
      calls++;
    });

    manager.showError('a');
    manager.showWarning('b');
    expect(manager.getSnapshot().notifications).toHaveLength(2);

    const before = calls;
    manager.clearAll();
    expect(manager.getSnapshot().notifications).toHaveLength(0);
    expect(calls).toBeGreaterThan(before);

    manager.destroy();
  });
});
