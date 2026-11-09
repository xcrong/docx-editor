/**
 * `DocxEditorEngine` session seam (issue #696 Tier 2, step 5.6): `load`
 * race guard, `save` orchestration (selective vs full repack, tracker
 * cleared post-save, null with no agent). happy-dom for the body view
 * mount; real `parseDocx`/`DocumentAgent` for the round trip.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { LayoutSelectionGate } from '../../prosemirror/utils/LayoutSelectionGate';
import { getChangedParagraphIds } from '../../prosemirror/extensions';
import { DocumentAgent } from '../../agent/DocumentAgent';
import { createDocx } from '../../docx/rezip';
import { parseDocx } from '../../docx/parser';
import { createEmptyDocument } from '../../utils/createDocument';
import { singletonManager } from '../../prosemirror/schema';
import type { Document } from '../../types/document';
import { DocxEditorEngine, type EngineHost } from '../DocxEditorEngine';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

async function seedDoc(): Promise<{ bytes: ArrayBuffer; doc: Document }> {
  const bytes = await createDocx(createEmptyDocument());
  return { bytes, doc: await parseDocx(bytes) };
}

interface SaveHost {
  host: EngineHost;
  bodyHost: HTMLElement;
  agent: DocumentAgent;
  toBufferOptions: unknown[];
}

function makeSaveHost(doc: Document, opts?: { agent?: DocumentAgent | null }): SaveHost {
  const agent = opts?.agent === undefined ? DocumentAgent.fromDocument(doc) : opts.agent;
  const toBufferOptions: unknown[] = [];
  if (agent) {
    const inner = agent.toBuffer.bind(agent);
    agent.toBuffer = (async (o?: Parameters<DocumentAgent['toBuffer']>[0]) => {
      toBufferOptions.push(o);
      return inner(o);
    }) as DocumentAgent['toBuffer'];
  }
  const bodyHost = window.document.createElement('div');
  window.document.body.appendChild(bodyHost);
  const host: EngineHost = {
    getDocument: () => doc,
    getStyles: () => null,
    getTheme: () => null,
    getSectionProperties: () => null,
    getFinalSectionProperties: () => null,
    getHeaderFooter: () => ({ header: null, footer: null, firstHeader: null, firstFooter: null }),
    getPageGap: () => 24,
    getResolvedCommentIds: () => undefined,
    getHfPmDoc: () => null,
    measureBlocks: () => [],
    getSyncCoordinator: () => new LayoutSelectionGate(),
    getPagesContainer: () => null,
    getScrollContainer: () => null,
    getBodyExtensionManager: () => singletonManager,
    onLayout: () => {},
    getAgent: () => agent,
    mountView(hostEl, state, dispatch, _kind) {
      return new EditorView(hostEl, {
        state,
        dispatchTransaction(this: EditorView, tr: Transaction) {
          dispatch(tr, this);
        },
      });
    },
    destroyView: (view) => view.destroy(),
    getHfHostEl: () => null,
    scheduleFrame: (cb) => {
      cb();
      return 0;
    },
  };
  return { host, bodyHost, agent: agent as DocumentAgent, toBufferOptions };
}

describe('engine.load', () => {
  test('late parse is dropped when a newer load started', async () => {
    const { bytes } = await seedDoc();
    const { host } = makeSaveHost(await parseDocx(bytes));
    const engine = new DocxEditorEngine(host);
    const first = engine.load(bytes);
    const second = engine.load(bytes);
    expect(await first).toBeNull();
    expect(await second).not.toBeNull();
  });

  test('cancelLoads stales the in-flight load', async () => {
    const { bytes } = await seedDoc();
    const { host } = makeSaveHost(await parseDocx(bytes));
    const engine = new DocxEditorEngine(host);
    const pending = engine.load(bytes);
    engine.cancelLoads();
    expect(await pending).toBeNull();
  });
});

describe('engine.save', () => {
  test('returns null with no agent', async () => {
    const { doc } = await seedDoc();
    const { host } = makeSaveHost(doc, { agent: null });
    const engine = new DocxEditorEngine(host);
    expect(await engine.save()).toBeNull();
  });

  test('full repack requested passes no selective options', async () => {
    const { doc } = await seedDoc();
    const { host, toBufferOptions } = makeSaveHost(doc);
    const engine = new DocxEditorEngine(host);
    const buffer = await engine.save({ selective: false });
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(toBufferOptions).toEqual([undefined]);
  });

  test('writes a buffer and clears the tracker after an edit', async () => {
    const { doc } = await seedDoc();
    const { host, bodyHost, toBufferOptions } = makeSaveHost(doc);
    const engine = new DocxEditorEngine(host);
    const view = engine.mountBodyView(bodyHost, doc);
    view.dispatch(view.state.tr.insertText('hi', 1));
    expect(getChangedParagraphIds(view.state).size).toBeGreaterThan(0);
    const buffer = await engine.save({ selective: true });
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect((buffer as ArrayBuffer).byteLength).toBeGreaterThan(0);
    expect(toBufferOptions.length).toBe(1);
    expect(getChangedParagraphIds(engine.getBodyView()!.state).size).toBe(0);
  });

  test('resolves when the body view is destroyed mid-save (T28-02 #85)', async () => {
    // Vue recreates its body view on every document load; a load that lands
    // inside `await agent.toBuffer(...)` destroys the view save captured.
    // The post-save tracker cleanup must not dispatch onto it (used to throw
    // `null.matchesNode` inside prosemirror-view) — save still resolves.
    const { doc } = await seedDoc();
    const { host, bodyHost, agent } = makeSaveHost(doc);
    const engine = new DocxEditorEngine(host);
    const view = engine.mountBodyView(bodyHost, doc);
    const inner = agent.toBuffer.bind(agent);
    agent.toBuffer = (async (o?: Parameters<DocumentAgent['toBuffer']>[0]) => {
      engine.destroyBodyView();
      return inner(o);
    }) as DocumentAgent['toBuffer'];
    const buffer = await engine.save({ selective: true });
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(view.isDestroyed).toBe(true);
  });

  test('never touches a superseding view mounted mid-save (T28-02 #85)', async () => {
    // Same race, but a newer document's view is already mounted when the
    // buffer resolves: save must leave it alone (its tracker belongs to the
    // new document, and the captured view may be destroyed).
    const { doc, bytes } = await seedDoc();
    const { host, bodyHost, agent } = makeSaveHost(doc);
    const engine = new DocxEditorEngine(host);
    const stale = engine.mountBodyView(bodyHost, doc);
    const inner = agent.toBuffer.bind(agent);
    agent.toBuffer = (async (o?: Parameters<DocumentAgent['toBuffer']>[0]) => {
      engine.destroyBodyView();
      engine.mountBodyView(bodyHost, await parseDocx(bytes));
      return inner(o);
    }) as DocumentAgent['toBuffer'];
    const buffer = await engine.save({ selective: true });
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(stale.isDestroyed).toBe(true);
    expect(engine.getBodyView()).not.toBe(stale);
  });
});
