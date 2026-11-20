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
import { ResponsePreview } from './ResponsePreview';

afterEach(() => {
  cleanup();
});

const ORIGINAL = 'original selected text';
const AI_TEXT = 'ai generated text for issue 141';

describe('ResponsePreview Cmd/Ctrl+Enter (issue #141)', () => {
  test('Cmd+Enter uses the latest handleAccept instead of the mount-time closure', async () => {
    const stale: string[] = [];
    const fresh: string[] = [];
    const onReject = () => {};
    const renderPreview = (onAccept: (text: string) => void) => (
      <ResponsePreview
        originalText={ORIGINAL}
        response={{ success: true, newText: AI_TEXT }}
        action="rewrite"
        isLoading={false}
        onAccept={onAccept}
        onReject={onReject}
      />
    );
    const view = render(renderPreview((text) => stale.push(text)));

    // Enter edit mode so the shortcut takes the isEditing branch.
    fireEvent.click(view.getByText('Edit'));

    // happy-dom reports no input-event support, so React 19 drops synthetic
    // text input and editedText cannot be typed here; swapping onAccept
    // changes handleAccept identity the same way typing does, while
    // isEditing/newText/onReject stay identical.
    view.rerender(renderPreview((text) => fresh.push(text)));

    fireEvent.keyDown(document, { key: 'Enter', metaKey: true, bubbles: true });

    await waitFor(() => expect(fresh.length).toBe(1));
    expect(fresh[0]).toBe(AI_TEXT);
    expect(stale.length).toBe(0);
  });

  test('Ctrl+Enter without editing accepts the response text', async () => {
    const accepts: string[] = [];
    render(
      <ResponsePreview
        originalText={ORIGINAL}
        response={{ success: true, newText: AI_TEXT }}
        action="rewrite"
        isLoading={false}
        onAccept={(text) => accepts.push(text)}
        onReject={() => {}}
      />
    );

    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true, bubbles: true });

    await waitFor(() => expect(accepts.length).toBe(1));
    expect(accepts[0]).toBe(AI_TEXT);
  });

  test('Escape still rejects without accepting', async () => {
    const accepts: string[] = [];
    let rejects = 0;
    render(
      <ResponsePreview
        originalText={ORIGINAL}
        response={{ success: true, newText: AI_TEXT }}
        action="rewrite"
        isLoading={false}
        onAccept={(text) => accepts.push(text)}
        onReject={() => {
          rejects += 1;
        }}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape', bubbles: true });

    await waitFor(() => expect(rejects).toBe(1));
    expect(accepts.length).toBe(0);
  });
});
