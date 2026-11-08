/**
 * `core/editor/viewLifecycle` — state builders + slot enumeration (issue #696
 * Tier 2, step 4.5). Pure functions; no DOM, no framework.
 */

import { describe, expect, test } from 'bun:test';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { Document, Paragraph } from '../../types/document';
import type { HeaderFooter } from '../../types/content';
import {
  createBodyEditorState,
  createHfEditorState,
  createHfExtensionManager,
  enumerateHfSlots,
  getDocumentId,
} from '../viewLifecycle';

function para(text: string, paraId?: string): Paragraph {
  return {
    type: 'paragraph',
    paraId,
    content: [{ type: 'run', content: [{ type: 'text', text }] }],
  };
}

function docOf(...paragraphs: Paragraph[]): Document {
  return {
    package: {
      document: {
        content: [...paragraphs],
      },
    },
  };
}

function hfOf(...paragraphs: Paragraph[]): HeaderFooter {
  return {
    type: 'header',
    hdrFtrType: 'default',
    content: [...paragraphs],
  };
}

describe('enumerateHfSlots', () => {
  test('null document enumerates no slots', () => {
    expect(enumerateHfSlots(null)).toEqual([]);
  });

  test('enumerates headers then footers with kinds', () => {
    const doc = docOf(para('body'));
    doc.package!.headers = new Map([['rH1', hfOf(para('h'))]]);
    doc.package!.footers = new Map([['rF1', hfOf(para('f'))]]);
    expect(enumerateHfSlots(doc)).toEqual([
      { rId: 'rH1', kind: 'header' },
      { rId: 'rF1', kind: 'footer' },
    ]);
  });

  test('dedupes an rId registered under both bags (header wins)', () => {
    const shared = hfOf(para('shared'));
    const doc = docOf(para('body'));
    doc.package!.headers = new Map([['rX', shared]]);
    doc.package!.footers = new Map([['rX', shared]]);
    expect(enumerateHfSlots(doc)).toEqual([{ rId: 'rX', kind: 'header' }]);
  });
});

describe('getDocumentId', () => {
  test('null document has the empty identity', () => {
    expect(getDocumentId(null)).toBe('empty');
  });

  test('same metadata,: different metadata', () => {
    const a = docOf(para('x'));
    const b = docOf(para('x'));
    expect(getDocumentId(a)).toBe(getDocumentId(b));
    b.package!.properties = { created: '2024-01-02' } as never;
    expect(getDocumentId(a)).not.toBe(getDocumentId(b));
  });
});

describe('createBodyEditorState', () => {
  test('builds PM state with paragraph text and allocated paraIds', () => {
    const state = createBodyEditorState({ document: docOf(para('hello')), styles: null });
    expect(state.doc.childCount).toBeGreaterThan(0);
    expect(state.doc.firstChild?.textContent).toContain('hello');
    // ParaIds are allocated up front (docs without w14:paraId ship none).
    const paraId = state.doc.firstChild?.attrs.paraId as string | undefined;
    expect(typeof paraId).toBe('string');
    expect(paraId!.length).toBeGreaterThan(0);
  });

  test('null document yields an empty-doc state', () => {
    const state = createBodyEditorState({ document: null, styles: null });
    expect(state.doc.childCount).toBeGreaterThan(0);
  });

  test('prefix plugins land before extension plugins', () => {
    const key = new PluginKey('probe');
    const probe = new Plugin({ key });
    const state = createBodyEditorState({
      document: docOf(para('x')),
      styles: null,
      prefixPlugins: [probe],
    });
    expect(state.plugins[0]).toBe(probe);
  });
});

describe('createHfEditorState', () => {
  test('builds HF PM state from header content', () => {
    const mgr = createHfExtensionManager();
    try {
      const state = createHfEditorState({
        hf: hfOf(para('header text')),
        styles: null,
        theme: null,
        defaultTabStopTwips: null,
        defaultTableStyleId: null,
        manager: mgr,
        suggesting: false,
        author: 'User',
      });
      expect(state.doc.textContent).toContain('header text');
    } finally {
      mgr.destroy();
    }
  });

  test('per-rId managers are independent instances with equivalent schemas', () => {
    const a = createHfExtensionManager();
    const b = createHfExtensionManager();
    try {
      expect(a).not.toBe(b);
      expect(a.getSchema()).not.toBe(b.getSchema());
      expect(a.getSchema().nodes.paragraph).toBeDefined();
      expect(b.getSchema().nodes.paragraph).toBeDefined();
    } finally {
      a.destroy();
      b.destroy();
    }
  });
});
