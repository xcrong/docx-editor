import { beforeEach, describe, expect, test } from 'bun:test';

import { AutoSaveManager } from '../AutoSaveManager';
import { createEmptyDocument } from '../../utils/createDocument';

interface MemoryStorage {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
}

function installMemoryStorage() {
  const store = new Map<string, string>();
  const fake: MemoryStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });
  return { store, fake };
}

beforeEach(() => {
  installMemoryStorage();
});

describe('AutoSaveManager save/clear', () => {
  test('save persists the document and reports saved status', async () => {
    const saved: Date[] = [];
    const manager = new AutoSaveManager({ onSave: (t) => saved.push(t) });
    manager.onDocumentChanged(createEmptyDocument({ initialText: 'hello' }));

    expect(await manager.save()).toBe(true);
    expect(manager.getSnapshot().status).toBe('saved');
    expect(saved).toHaveLength(1);
    manager.destroy();
  });

  test('save with no document returns false without touching storage', async () => {
    const { store } = installMemoryStorage();
    const manager = new AutoSaveManager();
    expect(await manager.save()).toBe(false);
    expect(store.size).toBe(0);
    manager.destroy();
  });

  test('unchanged document skips the write but still reports saved', async () => {
    const { fake } = installMemoryStorage();
    const manager = new AutoSaveManager();
    manager.onDocumentChanged(createEmptyDocument({ initialText: 'same' }));
    expect(await manager.save()).toBe(true);

    let writes = 0;
    const rawSetItem = fake.setItem.bind(fake);
    fake.setItem = (k: string, v: string) => {
      writes++;
      rawSetItem(k, v);
    };
    expect(await manager.save()).toBe(true);
    expect(writes).toBe(0);
    manager.destroy();
  });

  test('clear removes the persisted payload', async () => {
    const { store } = installMemoryStorage();
    const manager = new AutoSaveManager();
    manager.onDocumentChanged(createEmptyDocument({ initialText: 'bye' }));
    expect(await manager.save()).toBe(true);
    expect(store.size).toBeGreaterThan(0);

    manager.clear();
    expect(store.size).toBe(0);
    manager.destroy();
  });

  test('subscribe fires on status transitions', async () => {
    const manager = new AutoSaveManager({ debounceDelay: 0, saveOnChange: false });
    const statuses: string[] = [];
    const unsubscribe = manager.subscribe(() => {
      statuses.push(manager.getSnapshot().status);
    });

    manager.onDocumentChanged(createEmptyDocument({ initialText: 'x' }));
    await manager.save();
    expect(statuses).toContain('saving');
    expect(statuses[statuses.length - 1]).toBe('saved');

    unsubscribe();
    manager.destroy();
  });
});

describe('AutoSaveManager updateOptions (issue #142)', () => {
  test('replacing onSave routes the next save to the new callback', async () => {
    const stale: Date[] = [];
    const latest: Date[] = [];
    const manager = new AutoSaveManager({ onSave: (t) => stale.push(t) });
    manager.onDocumentChanged(createEmptyDocument({ initialText: 'swap' }));

    // Swap to a fresh callback after init; the next save must use it.
    manager.updateOptions({ onSave: (t) => latest.push(t) });

    expect(await manager.save()).toBe(true);
    expect(latest).toHaveLength(1);
    expect(stale).toHaveLength(0);
    manager.destroy();
  });

  test('partial update without callback keys preserves handlers; explicit undefined clears', async () => {
    const saved: Date[] = [];
    const manager = new AutoSaveManager({ onSave: (t) => saved.push(t) });
    manager.updateOptions({ interval: 9999 });
    manager.onDocumentChanged(createEmptyDocument({ initialText: 'keep' }));
    expect(await manager.save()).toBe(true);
    expect(saved).toHaveLength(1);

    manager.updateOptions({ onSave: undefined });
    manager.onDocumentChanged(createEmptyDocument({ initialText: 'cleared' }));
    expect(await manager.save()).toBe(true);
    expect(saved).toHaveLength(1);
    manager.destroy();
  });

  test('maxAge update applies to the next recovery check', async () => {
    const manager = new AutoSaveManager();
    manager.onDocumentChanged(createEmptyDocument({ initialText: 'recover me' }));
    expect(await manager.save()).toBe(true);
    expect(manager.getRecoveryData()).not.toBeNull();

    manager.updateOptions({ maxAge: -1 });
    expect(manager.getRecoveryData()).toBeNull();
    manager.destroy();
  });

  test('disabling saveOnChange cancels a pending debounce', async () => {
    const saved: Date[] = [];
    const manager = new AutoSaveManager({
      saveOnChange: true,
      debounceDelay: 20,
      onSave: (t) => saved.push(t),
    });
    manager.onDocumentChanged(createEmptyDocument({ initialText: 'debounced' }));
    manager.updateOptions({ saveOnChange: false });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(saved).toHaveLength(0);
    manager.destroy();
  });

  test('interval update restarts a running timer and stays stopped when disabled', () => {
    const manager = new AutoSaveManager({ interval: 1000 });
    manager.enable();
    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    let sets = 0;
    let clears = 0;
    globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
      sets++;
      return origSetInterval(...args);
    }) as typeof setInterval;
    globalThis.clearInterval = ((id?: unknown) => {
      clears++;
      return origClearInterval(id as Parameters<typeof clearInterval>[0]);
    }) as typeof clearInterval;
    try {
      manager.updateOptions({ interval: 2000 });
      expect(clears).toBeGreaterThan(0);
      expect(sets).toBeGreaterThan(0);
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
    manager.disable();

    manager.updateOptions({ interval: 3000 });
    const timer = (manager as unknown as { intervalTimer: unknown }).intervalTimer;
    expect(timer).toBeNull();
    manager.destroy();
  });
});
