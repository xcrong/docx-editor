import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll } from 'bun:test';

// Register happy-dom for this file and unregister after, matching the rest of
// the suite. A load-time register that never unregisters leaks the global
// registration across files and collides with other files' setup.
beforeAll(() => GlobalRegistrator.register());
afterAll(async () => {
  // Let React 19's scheduler drain pending work while window still exists;
  // unregistering synchronously can surface "window is not defined" from a
  // trailing scheduler callback.
  await new Promise((resolve) => setTimeout(resolve, 0));
  GlobalRegistrator.unregister();
});
import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { AutoSaveManager } from '@xcrong/docx-editor-core';
import { createEmptyDocument } from '@xcrong/docx-editor-core/utils';
import { useAutoSave } from './useAutoSave';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function Harness({ onSave, interval }: { onSave?: (timestamp: Date) => void; interval?: number }) {
  const document = useMemo(() => createEmptyDocument({ initialText: 'autosave-142' }), []);
  const { save } = useAutoSave(document, {
    onSave,
    interval,
    // Keep timers out of the test; manual save still works while disabled.
    enabled: false,
    saveOnChange: false,
  });
  return <button onClick={() => void save()}>save</button>;
}

function EnabledHarness({ enabled }: { enabled?: boolean }) {
  const document = useMemo(() => createEmptyDocument({ initialText: 'autosave-enabled' }), []);
  const { isEnabled } = useAutoSave(document, {
    enabled,
    saveOnChange: false,
  });
  return <div data-testid="enabled">{isEnabled ? 'on' : 'off'}</div>;
}

function KeyHarness({ storageKey }: { storageKey: string }) {
  const document = useMemo(() => createEmptyDocument({ initialText: 'autosave-keyed' }), []);
  const { save } = useAutoSave(document, {
    storageKey,
    enabled: false,
    saveOnChange: false,
  });
  return <button onClick={() => void save()}>save</button>;
}

describe('useAutoSave runtime options (issue #142)', () => {
  test('rerender with a new onSave routes the next save to the new callback', async () => {
    const stale: Date[] = [];
    const fresh: Date[] = [];
    const view = render(<Harness onSave={(t) => stale.push(t)} />);

    view.rerender(<Harness onSave={(t) => fresh.push(t)} />);

    fireEvent.click(view.getByText('save'));

    await waitFor(() => expect(fresh.length).toBe(1));
    expect(stale.length).toBe(0);
  });

  test('enabled flip starts/stops the manager', async () => {
    const view = render(<EnabledHarness enabled={false} />);
    await waitFor(() => expect(view.getByTestId('enabled').textContent).toBe('off'));

    view.rerender(<EnabledHarness enabled={true} />);
    await waitFor(() => expect(view.getByTestId('enabled').textContent).toBe('on'));

    view.rerender(<EnabledHarness enabled={false} />);
    await waitFor(() => expect(view.getByTestId('enabled').textContent).toBe('off'));
  });

  test('storageKey change destroys the old manager and saves under the new key', async () => {
    let destroys = 0;
    const origDestroy = AutoSaveManager.prototype.destroy;
    AutoSaveManager.prototype.destroy = function (this: AutoSaveManager) {
      destroys++;
      return origDestroy.apply(this);
    };
    try {
      const view = render(<KeyHarness storageKey="react-key-a" />);
      fireEvent.click(view.getByText('save'));
      await waitFor(() => expect(localStorage.getItem('react-key-a')).not.toBeNull());

      const destroysBefore = destroys;
      view.rerender(<KeyHarness storageKey="react-key-b" />);
      await waitFor(() => expect(destroys).toBeGreaterThan(destroysBefore));

      fireEvent.click(view.getByText('save'));
      await waitFor(() => expect(localStorage.getItem('react-key-b')).not.toBeNull());
      expect(localStorage.getItem('react-key-a')).not.toBeNull();
    } finally {
      AutoSaveManager.prototype.destroy = origDestroy;
    }
  });

  test('interval change propagates via updateOptions', async () => {
    const seen: Array<number | undefined> = [];
    const origUpdate = AutoSaveManager.prototype.updateOptions;
    AutoSaveManager.prototype.updateOptions = function (
      this: AutoSaveManager,
      options: Parameters<AutoSaveManager['updateOptions']>[0]
    ) {
      seen.push(options.interval);
      return origUpdate.call(this, options);
    };
    try {
      const view = render(<Harness interval={60000} />);
      view.rerender(<Harness interval={61000} />);
      await waitFor(() => expect(seen).toContain(61000));
    } finally {
      AutoSaveManager.prototype.updateOptions = origUpdate;
    }
  });
});
