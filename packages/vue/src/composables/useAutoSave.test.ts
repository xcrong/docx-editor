import { describe, expect, test } from 'bun:test';
import { nextTick, reactive, ref } from 'vue';
import { AutoSaveManager } from '@xcrong/docx-editor-core';
import { createEmptyDocument } from '@xcrong/docx-editor-core/utils';
import { useAutoSave } from './useAutoSave';

function installMemoryStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
    configurable: true,
  });
}

// The composable registers onBeforeUnmount; outside setup() Vue logs a
// warning. Silence just that warning so the test output stays clean.
function setupSilenced<T>(fn: () => T): T {
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('onBeforeUnmount')) return;
    (origWarn as (...a: unknown[]) => void)(...args);
  };
  try {
    return fn();
  } finally {
    console.warn = origWarn;
  }
}

describe('useAutoSave runtime options (issue #142)', () => {
  test('reactive onSave replacement routes the next save to the new callback', async () => {
    installMemoryStorage();
    const stale: Date[] = [];
    const fresh: Date[] = [];
    const options = reactive({
      onSave: (t: Date) => void stale.push(t),
      enabled: false,
      saveOnChange: false,
    });
    const doc = ref(createEmptyDocument({ initialText: 'vue-142' }));
    const { save } = setupSilenced(() => useAutoSave(doc, options));

    options.onSave = (t: Date) => void fresh.push(t);
    await nextTick();

    expect(await save()).toBe(true);
    expect(fresh).toHaveLength(1);
    expect(stale).toHaveLength(0);
  });

  test('enabled flip starts/stops the manager without re-init', async () => {
    installMemoryStorage();
    const options = reactive({ enabled: false, saveOnChange: false });
    const doc = ref(createEmptyDocument({ initialText: 'vue-enabled' }));
    const { isEnabled, disable } = setupSilenced(() => useAutoSave(doc, options));

    expect(isEnabled.value).toBe(false);
    options.enabled = true;
    await nextTick();
    expect(isEnabled.value).toBe(true);
    options.enabled = false;
    await nextTick();
    expect(isEnabled.value).toBe(false);
    disable();
  });

  test('storageKey change destroys the old manager and saves under the new key', async () => {
    installMemoryStorage();
    let destroys = 0;
    const origDestroy = AutoSaveManager.prototype.destroy;
    AutoSaveManager.prototype.destroy = function (this: AutoSaveManager, ...args: []) {
      destroys++;
      return origDestroy.apply(this, args);
    };
    try {
      const options = reactive({
        storageKey: 'vue-key-a',
        enabled: false,
        saveOnChange: false,
      });
      const doc = ref(createEmptyDocument({ initialText: 'vue-keyed' }));
      const { save, getRecoveryData, isEnabled, disable } = setupSilenced(() =>
        useAutoSave(doc, options)
      );

      expect(await save()).toBe(true);
      expect(globalThis.localStorage.getItem('vue-key-a')).not.toBeNull();

      const destroysBefore = destroys;
      options.storageKey = 'vue-key-b';
      await nextTick();
      expect(destroys).toBeGreaterThan(destroysBefore);
      // Enabled flag survives the rebuild.
      expect(isEnabled.value).toBe(false);

      expect(await save()).toBe(true);
      expect(globalThis.localStorage.getItem('vue-key-b')).not.toBeNull();
      expect(getRecoveryData()).not.toBeNull();
      // Old payload is left alone, not migrated or cleared.
      expect(globalThis.localStorage.getItem('vue-key-a')).not.toBeNull();
      disable();
    } finally {
      AutoSaveManager.prototype.destroy = origDestroy;
    }
  });

  test('interval change propagates and restarts the running timer', async () => {
    installMemoryStorage();
    const delays: number[] = [];
    const origSetInterval = globalThis.setInterval;
    const spySetInterval = ((cb: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms !== undefined) delays.push(ms);
      return origSetInterval(cb, ms as number, ...(rest as []));
    }) as typeof setInterval;
    globalThis.setInterval = spySetInterval;
    try {
      const options = reactive({
        interval: 60000,
        enabled: true,
        saveOnChange: false,
      });
      const doc = ref(createEmptyDocument({ initialText: 'vue-interval' }));
      const { isEnabled, disable } = setupSilenced(() => useAutoSave(doc, options));
      expect(isEnabled.value).toBe(true);
      expect(delays).toContain(60000);

      options.interval = 61000;
      await nextTick();
      expect(delays).toContain(61000);
      disable();
    } finally {
      globalThis.setInterval = origSetInterval;
    }
  });
});
