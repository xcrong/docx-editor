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
