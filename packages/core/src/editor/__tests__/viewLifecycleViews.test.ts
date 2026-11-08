/**
 * `DocxEditorEngine` view lifecycle (issue #696 Tier 2, step 4.5).
 * happy-dom: mounts real ProseMirror views through a stub host and asserts
 * `syncHfViews` mounts deduped views, tears down removed rIds + managers,
 * and writes back on docChanged; plus body mount/update/destroy semantics.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { LayoutSelectionGate } from '../../prosemirror/utils/LayoutSelectionGate';
import type { Document, Paragraph } from '../../types/document';
import type { HeaderFooter } from '../../types/content';
import { DocxEditorEngine, type EngineHost } from '../DocxEditorEngine';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function para(text: string): Paragraph {
  return {
    type: 'paragraph',
    content: [{ type: 'run', content: [{ type: 'text', text }] }],
  };
}

function hf(content: Paragraph[]): HeaderFooter {
  return { type: 'header', hdrFtrType: 'default', content: [...content] };
}

function docWithHf(
  headers: Array<[string, HeaderFooter]>,
  footers: Array<[string, HeaderFooter]> = []
): Document {
  return {
    package: {
      document: { content: [para('body')] },
      headers: new Map(headers),
      footers: new Map(footers),
    },
  };
}

interface Captured {
  hfWritebacks: Array<{ rId: string; text: string }>;
  hfTransactions: Array<{ rId: string; docChanged: boolean }>;
  destroyed: number;
}

function makeHost(captured: Captured): { host: EngineHost; hfHost: HTMLElement } {
  const hfHost = window.document.createElement('div');
  window.document.body.appendChild(hfHost);
  const host: EngineHost = {
    getDocument: () => null,
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
    onLayout: () => {},
    mountView(hostEl, state, dispatch, _kind) {
      // Mirror the adapter pattern: bind the constructing view so
      // construction-time dispatches still route.
      return new EditorView(hostEl, {
        state,
        dispatchTransaction(this: EditorView, tr: Transaction) {
          dispatch(tr, this);
        },
      });
    },
    destroyView: (view) => {
      captured.destroyed += 1;
      view.destroy();
    },
    getHfHostEl: () => hfHost,
    onHfDocumentChanged: (rId, state: EditorState) => {
      captured.hfWritebacks.push({ rId, text: state.doc.textContent ?? '' });
    },
    onHfTransaction: (rId, _view, docChanged) => {
      captured.hfTransactions.push({ rId, docChanged });
    },
    scheduleFrame: (cb) => {
      cb();
      return 0;
    },
  };
  return { host, hfHost };
}

function freshEngine(): { engine: DocxEditorEngine; captured: Captured; hfHost: HTMLElement } {
  const captured: Captured = { hfWritebacks: [], hfTransactions: [], destroyed: 0 };
  const { host, hfHost } = makeHost(captured);
  return { engine: new DocxEditorEngine(host), captured, hfHost };
}

describe('engine HF view lifecycle', () => {
  test('syncHfViews mounts one deduped view per rId', () => {
    const { engine, hfHost } = freshEngine();
    try {
      const shared = hf([para('shared')]);
      const doc = docWithHf(
        [
          ['rH', hf([para('header')])],
          ['rX', shared],
        ],
        [
          ['rF', hf([para('footer')])],
          ['rX', shared],
        ]
      );
      engine.syncHfViews(doc);
      const views = engine.getHfViews();
      expect(views.size).toBe(3);
      expect(engine.getHfView('rH')?.state.doc.textContent).toContain('header');
      expect(engine.getHfView('rF')?.state.doc.textContent).toContain('footer');
      // rX registered under both bags mounts once.
      expect(engine.getHfView('rX')?.state.doc.textContent).toContain('shared');
      expect(hfHost.childElementCount).toBe(3);
    } finally {
      engine.destroyHfViews();
      hfHost.remove();
    }
  });

  test('removing an rId tears down its view, node, and manager', () => {
    const { engine, captured, hfHost } = freshEngine();
    try {
      const doc = docWithHf([
        ['rA', hf([para('a')])],
        ['rB', hf([para('b')])],
      ]);
      engine.syncHfViews(doc);
      expect(engine.getHfViews().size).toBe(2);
      const destroyedBefore = captured.destroyed;

      doc.package.headers!.delete('rB');
      engine.syncHfViews(doc);
      expect(engine.getHfView('rB')).toBeNull();
      expect(engine.getHfViews().size).toBe(1);
      expect(captured.destroyed).toBe(destroyedBefore + 1);
      expect(hfHost.childElementCount).toBe(1);
    } finally {
      engine.destroyHfViews();
      hfHost.remove();
    }
  });

  test('docChanged HF dispatch writes back and notifies', () => {
    const { engine, captured, hfHost } = freshEngine();
    try {
      engine.syncHfViews(docWithHf([['rH', hf([para('hi')])]]));
      const view = engine.getHfView('rH');
      expect(view).not.toBeNull();
      view!.dispatch(view!.state.tr.insertText('!', 1));
      expect(captured.hfWritebacks.length).toBe(1);
      expect(captured.hfWritebacks[0].rId).toBe('rH');
      expect(captured.hfWritebacks[0].text).toContain('hi');
      expect(captured.hfWritebacks[0].text).toContain('!');
      expect(captured.hfTransactions).toEqual([{ rId: 'rH', docChanged: true }]);
    } finally {
      engine.destroyHfViews();
      hfHost.remove();
    }
  });

  test('selection-only HF dispatch notifies without writeback', () => {
    const { engine, captured, hfHost } = freshEngine();
    try {
      engine.syncHfViews(docWithHf([['rH', hf([para('hi')])]]));
      const view = engine.getHfView('rH');
      view!.dispatch(view!.state.tr.setSelection(view!.state.selection));
      expect(captured.hfWritebacks.length).toBe(0);
      expect(captured.hfTransactions).toEqual([{ rId: 'rH', docChanged: false }]);
    } finally {
      engine.destroyHfViews();
      hfHost.remove();
    }
  });

  test('null HF host skips sync without throwing', () => {
    const captured: Captured = { hfWritebacks: [], hfTransactions: [], destroyed: 0 };
    const { host } = makeHost(captured);
    const engine = new DocxEditorEngine({ ...host, getHfHostEl: () => null });
    engine.syncHfViews(docWithHf([['rH', hf([para('hi')])]]));
    expect(engine.getHfViews().size).toBe(0);
  });
});

describe('engine body view lifecycle', () => {
  function bodyDoc(title: string): Document {
    return {
      package: {
        properties: { title } as never,
        document: { content: [para('body text')] },
      },
    };
  }

  test('mount builds state with text; same-identity update is a no-op', () => {
    const { engine, hfHost } = freshEngine();
    try {
      const host = window.document.createElement('div');
      window.document.body.appendChild(host);
      const doc = bodyDoc('v1');
      const view = engine.mountBodyView(host, doc);
      expect(view.state.doc.textContent).toContain('body text');
      expect(engine.getBodyView()).toBe(view);

      const before = view.state;
      engine.updateBodyViewForDocument(doc);
      expect(view.state).toBe(before);

      engine.updateBodyViewForDocument(bodyDoc('v2'));
      expect(view.state).not.toBe(before);
      expect(view.state.doc.textContent).toContain('body text');

      engine.destroyBodyView();
      expect(engine.getBodyView()).toBeNull();
      host.remove();
    } finally {
      hfHost.remove();
    }
  });

  test('body dispatch strips scroll flag and runs the transaction loop', () => {
    const { engine, hfHost } = freshEngine();
    try {
      const host = window.document.createElement('div');
      window.document.body.appendChild(host);
      const states: string[] = [];
      const { host: base } = makeHost({ hfWritebacks: [], hfTransactions: [], destroyed: 0 });
      const engine2 = new DocxEditorEngine({
        ...base,
        onBodyState: (s) => states.push(s.doc.textContent ?? ''),
      });
      const view = engine2.mountBodyView(host, bodyDoc('t'));
      const tr = view.state.tr.insertText('more', 1);
      tr.setMeta('scrollIntoView', true);
      view.dispatch(tr);
      expect(view.state.doc.textContent).toContain('more');
      expect(states.length).toBe(1);
      engine2.destroyBodyView();
      host.remove();
      void engine;
    } finally {
      hfHost.remove();
    }
  });
});
