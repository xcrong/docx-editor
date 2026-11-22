import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  beginDocumentFontGeneration,
  loadFontFromBuffer,
  loadFontFromUrl,
  pruneOldDocumentFaces,
  resetDocumentFonts,
  __resetFontLoaderState,
} from './fontLoader';

/**
 * #144 regression: document switches reclaim the previous generation's
 * `@font-face` styles + blob URLs without harming the current document.
 * Same bytes (#143) reuse via touch; URL `fonts`-prop faces are spared by
 * document prunes and cleared only on teardown.
 */

let appendedEls: Array<{ tagName: string; textContent?: string; remove?: () => void }> = [];
let createdUrls: string[] = [];
let revokedUrls: string[] = [];
let urlCounter = 0;
const realCreateObjectURL = URL.createObjectURL.bind(URL);
const realRevokeObjectURL = URL.revokeObjectURL.bind(URL);

const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

function installDom() {
  const head = {
    appendChild(el: { tagName: string; textContent?: string; remove?: () => void }) {
      appendedEls.push(el);
      el.remove = () => {
        const i = appendedEls.indexOf(el);
        if (i >= 0) appendedEls.splice(i, 1);
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement(tag: string) {
      if (tag === 'style') return { tagName: 'style', textContent: '' };
      if (tag === 'canvas') return { getContext: () => null };
      return { tagName: tag };
    },
    head,
    fonts: { load: async () => undefined, check: () => true },
  };
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => {
    urlCounter += 1;
    const url = `blob:mock-${urlCounter}`;
    createdUrls.push(url);
    return url;
  };
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = (url: string) => {
    revokedUrls.push(String(url));
  };
}

beforeEach(() => {
  appendedEls = [];
  createdUrls = [];
  revokedUrls = [];
  urlCounter = 0;
  __resetFontLoaderState();
  installDom();
});

afterEach(() => {
  __resetFontLoaderState();
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
  else delete (globalThis as unknown as { document?: unknown }).document;
});

const styleCount = () => appendedEls.filter((el) => el.tagName === 'style').length;

describe('font reclaim across document generations (#144)', () => {
  test('loading B after A prunes A style and revokes its blob URL', async () => {
    const first = new Uint8Array([0, 1, 2, 3]).buffer as ArrayBuffer;
    expect(await loadFontFromBuffer('EpReclaimA', first)).toBe(true);
    expect(styleCount()).toBe(1);
    expect(createdUrls).toHaveLength(1);

    const gen = beginDocumentFontGeneration();
    const second = new Uint8Array([9, 8, 7, 6]).buffer as ArrayBuffer;
    expect(await loadFontFromBuffer('EpReclaimA', second)).toBe(true);
    pruneOldDocumentFaces(gen);

    expect(styleCount()).toBe(1);
    expect(revokedUrls).toEqual(createdUrls.slice(0, 1));
    expect(createdUrls).toHaveLength(2);
  });

  test('identical bytes across generations reuse without extra style or revoke', async () => {
    const bytes = (arr: number[]) => new Uint8Array(arr).buffer as ArrayBuffer;
    expect(await loadFontFromBuffer('EpReclaimSame', bytes([1, 2, 3]))).toBe(true);
    expect(styleCount()).toBe(1);

    const gen = beginDocumentFontGeneration();
    expect(await loadFontFromBuffer('EpReclaimSame', bytes([1, 2, 3]))).toBe(true);
    pruneOldDocumentFaces(gen);

    expect(styleCount()).toBe(1);
    expect(revokedUrls).toHaveLength(0);
    expect(createdUrls).toHaveLength(1);
  });

  test('current document font stays usable after pruning the previous doc', async () => {
    const first = new Uint8Array([4, 4, 4]).buffer as ArrayBuffer;
    await loadFontFromBuffer('EpReclaimCur', first);
    const gen = beginDocumentFontGeneration();
    const second = new Uint8Array([5, 5, 5]).buffer as ArrayBuffer;
    expect(await loadFontFromBuffer('EpReclaimCur', second)).toBe(true);
    pruneOldDocumentFaces(gen);

    const styles = appendedEls.filter((el) => el.tagName === 'style');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('EpReclaimCur');
  });

  test('URL faces survive document prune but reset clears everything', async () => {
    await loadFontFromUrl('EpReclaimUrl', 'https://fonts.example.com/a.woff2');
    expect(styleCount()).toBe(1);
    const gen = beginDocumentFontGeneration();
    pruneOldDocumentFaces(gen);
    expect(styleCount()).toBe(1);

    resetDocumentFonts();
    expect(styleCount()).toBe(0);
  });

  test('stale generation load resolving after begin does not retag or delete the new generation', async () => {
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const fontsStub = (document as unknown as { fonts: { load: (face: string) => Promise<void> } })
      .fonts;
    const origLoad = fontsStub.load.bind(fontsStub);
    fontsStub.load = (face: string) => {
      if (face.includes('EpStaleOld')) return oldGate.then(() => origLoad(face));
      return origLoad(face);
    };

    const oldPromise = loadFontFromBuffer(
      'EpStaleOld',
      new Uint8Array([1, 1, 1]).buffer as ArrayBuffer
    );
    const gen = beginDocumentFontGeneration();
    expect(
      await loadFontFromBuffer('EpStaleNew', new Uint8Array([2, 2, 2]).buffer as ArrayBuffer)
    ).toBe(true);
    expect(styleCount()).toBe(2);

    releaseOld();
    expect(await oldPromise).toBe(true);
    pruneOldDocumentFaces(gen);

    const styles = appendedEls.filter((el) => el.tagName === 'style');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('EpStaleNew');
    expect(revokedUrls).toHaveLength(1);
    expect(createdUrls).toHaveLength(2);
  });
});
