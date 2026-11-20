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
import type { ParsedClipboardContent } from '@xcrong/docx-editor-core/utils';
import { PasteSpecialDialog } from './PasteSpecialDialog';

afterEach(() => {
  cleanup();
});

const FRESH_TEXT = 'fresh pasted text for issue 140';

function stubClipboardRead(text: string) {
  const originalClipboard = (navigator as unknown as { clipboard?: unknown }).clipboard;
  const read = async () => [
    {
      types: ['text/plain'],
      getType: async () => new Blob([text], { type: 'text/plain' }),
    },
  ];
  Object.defineProperty(navigator, 'clipboard', {
    value: { read },
    configurable: true,
    writable: true,
  });
  return () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  };
}

describe('PasteSpecialDialog Enter (issue #140)', () => {
  test('Enter right after clipboard load pastes fresh content without arrow keys', async () => {
    const restore = stubClipboardRead(FRESH_TEXT);
    try {
      const pastes: Array<{ content: ParsedClipboardContent; asPlainText: boolean }> = [];
      let closes = 0;

      const view = render(
        <PasteSpecialDialog
          isOpen
          onClose={() => {
            closes += 1;
          }}
          onPaste={(content, asPlainText) => {
            pastes.push({ content, asPlainText });
          }}
        />
      );

      // Wait for the async clipboard preview to load.
      await waitFor(() => expect(view.getByText(new RegExp(FRESH_TEXT))).toBeTruthy());

      // Press Enter directly — no arrow-key navigation first.
      fireEvent.keyDown(document, { key: 'Enter', bubbles: true });

      await waitFor(() => expect(pastes.length).toBe(1));
      expect(pastes[0].content.plainText).toContain(FRESH_TEXT);
      expect(pastes[0].asPlainText).toBe(false);
      expect(closes).toBe(1);
    } finally {
      restore();
    }
  });

  test('Escape still closes without pasting', async () => {
    const restore = stubClipboardRead(FRESH_TEXT);
    try {
      const pastes: Array<{ content: ParsedClipboardContent; asPlainText: boolean }> = [];
      let closes = 0;

      render(
        <PasteSpecialDialog
          isOpen
          onClose={() => {
            closes += 1;
          }}
          onPaste={(content, asPlainText) => {
            pastes.push({ content, asPlainText });
          }}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });

      await waitFor(() => expect(closes).toBe(1));
      expect(pastes.length).toBe(0);
    } finally {
      restore();
    }
  });
});
