import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ClipboardManager, cssColorToHex } from '../ClipboardManager';
import type { Run } from '../../types/document';

// writeToClipboard/readClipboard bind to the live window lazily, so a window
// registered before any test runs is sufficient.
interface ExecCommandDocument {
  execCommand?: (cmd: string) => boolean;
}
let testDocument: ExecCommandDocument;
beforeAll(() => {
  GlobalRegistrator.register();
  testDocument = document as unknown as ExecCommandDocument;
});
afterAll(() => GlobalRegistrator.unregister());

// Test-only ambient slots absent from lib.dom: capture once, restore after each.
interface TestGlobals {
  ClipboardItem?: unknown;
  navigator: Navigator;
}
const testGlobals = globalThis as unknown as TestGlobals;
const originalNavigator = testGlobals.navigator;
const originalClipboardItem = testGlobals.ClipboardItem;

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
  if (originalClipboardItem === undefined) {
    delete testGlobals.ClipboardItem;
  } else {
    testGlobals.ClipboardItem = originalClipboardItem;
  }
  delete testDocument.execCommand;
});

function stubNavigator(clipboard: unknown) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard },
    configurable: true,
    writable: true,
  });
}

function textRun(text: string): Run {
  return { type: 'run', content: [{ type: 'text', text }] };
}

function selection(text = 'hello') {
  return {
    text,
    runs: [textRun(text)],
    startParagraphIndex: 0,
    startRunIndex: 0,
    startOffset: 0,
    endParagraphIndex: 0,
    endRunIndex: 0,
    endOffset: 0,
    isMultiParagraph: false,
  };
}

function runText(run: Run): string {
  if (run && typeof run === 'object' && 'content' in run && Array.isArray(run.content)) {
    return run.content
      .map((c) => (c && typeof c === 'object' && 'text' in c ? String(c.text ?? '') : ''))
      .join('');
  }
  return '';
}

describe('cssColorToHex', () => {
  test('passes through hex colors uppercased', () => {
    expect(cssColorToHex('#ff0000')).toBe('FF0000');
  });

  test('parses rgb() strings', () => {
    expect(cssColorToHex('rgb(255, 0, 0)')).toBe('FF0000');
  });

  test('rejects transparent/empty/unknown colors', () => {
    expect(cssColorToHex('transparent')).toBeNull();
    expect(cssColorToHex('')).toBeNull();
    expect(cssColorToHex('banana')).toBeNull();
  });
});

describe('ClipboardManager copy/cut', () => {
  test('copy writes runs to the clipboard and reports success', async () => {
    const written: Array<{ data: Record<string, Blob> }> = [];
    testGlobals.ClipboardItem = class {
      data: Record<string, Blob>;
      constructor(data: Record<string, Blob>) {
        this.data = data;
      }
    };
    stubNavigator({
      write: async (items: Array<{ data: Record<string, Blob> }>) => {
        written.push(...items);
      },
    });

    const manager = new ClipboardManager();
    expect(await manager.copy(selection())).toBe(true);
    expect(written).toHaveLength(1);

    const payload = written[0].data;
    // The async write path carries plain + html; the internal JSON rides on
    // copy/cut DOM events (see writeEventData below).
    expect(await payload['text/plain'].text()).toBe('hello');
    expect(await payload['text/html'].text()).toContain('hello');
  });

  test('cut writes runs to the clipboard like copy', async () => {
    let calls = 0;
    testGlobals.ClipboardItem = class {};
    stubNavigator({
      write: async () => {
        calls++;
      },
    });

    const manager = new ClipboardManager();
    expect(await manager.cut(selection('bye'))).toBe(true);
    expect(calls).toBe(1);
  });

  test('copy falls back to execCommand when the async write rejects', async () => {
    testGlobals.ClipboardItem = class {};
    stubNavigator({
      write: async () => {
        throw new Error('denied');
      },
    });
    testDocument.execCommand = () => true;

    const manager = new ClipboardManager();
    expect(await manager.copy(selection())).toBe(true);
  });

  test('copy reports errors and returns false when nothing can write', async () => {
    stubNavigator({});
    testDocument.execCommand = () => {
      throw new Error('denied');
    };
    const errors: Error[] = [];

    const manager = new ClipboardManager({ onError: (e) => errors.push(e) });
    expect(await manager.copy(selection())).toBe(false);
    expect(errors).toHaveLength(1);
  });
});

describe('ClipboardManager readClipboard', () => {
  function readStub(html: string, plainText: string, fail = false) {
    return {
      read: async () => {
        if (fail) throw new Error('denied');
        return [
          {
            types: ['text/html', 'text/plain'],
            getType: async (type: string) =>
              new Blob([type === 'text/html' ? html : plainText], { type }),
          },
        ];
      },
    };
  }

  test('reads and parses html + plain text', async () => {
    stubNavigator(readStub('<p>hello</p>', 'hello'));
    const manager = new ClipboardManager();

    const content = await manager.readClipboard();
    expect(content).not.toBeNull();
    expect(content!.plainText).toBe('hello');
    expect(content!.runs.map(runText).join('')).toContain('hello');
  });

  test('asPlainText drops the html payload', async () => {
    stubNavigator(readStub('<p><b>hi</b></p>', 'hi'));
    const manager = new ClipboardManager();

    const content = await manager.readClipboard(true);
    expect(content).not.toBeNull();
    expect(content!.plainText).toBe('hi');
  });

  test('returns null when the Clipboard API is unavailable', async () => {
    stubNavigator({});
    const manager = new ClipboardManager();
    expect(await manager.readClipboard()).toBeNull();
  });

  test('reports read errors and returns null', async () => {
    stubNavigator(readStub('', '', true));
    const errors: Error[] = [];
    const manager = new ClipboardManager({ onError: (e) => errors.push(e) });

    expect(await manager.readClipboard()).toBeNull();
    expect(errors).toHaveLength(1);
  });

  test('setOptions refreshes the error handler', async () => {
    stubNavigator(readStub('', '', true));
    const first: Error[] = [];
    const second: Error[] = [];
    const manager = new ClipboardManager({ onError: (e) => first.push(e) });
    manager.setOptions({ onError: (e) => second.push(e) });

    expect(await manager.readClipboard()).toBeNull();
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });
});

describe('ClipboardManager DOM events', () => {
  test('writeEventData populates all clipboard MIME types', async () => {
    const store: Record<string, string> = {};
    const event = {
      clipboardData: {
        setData: (key: string, value: string) => {
          store[key] = value;
        },
      },
    } as unknown as ClipboardEvent;

    new ClipboardManager().writeEventData(event, selection());
    expect(store['text/plain']).toBe('hello');
    expect(store['text/html']).toContain('hello');
    expect(JSON.parse(store['application/x-docx-editor'])).toEqual([textRun('hello')]);
  });

  test('parsePasteEvent parses clipboardData', () => {
    const event = {
      clipboardData: {
        getData: (type: string) => (type === 'text/html' ? '<p>hi</p>' : 'hi'),
      },
    } as unknown as ClipboardEvent;

    const content = new ClipboardManager().parsePasteEvent(event);
    expect(content).not.toBeNull();
    expect(content!.plainText).toBe('hi');
  });
});
