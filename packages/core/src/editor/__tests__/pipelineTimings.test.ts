/**
 * `DocxEditorEngine` pipeline phase timings (editor-performance profiling).
 *
 * Covers `PipelineTimings` / `getTimings()`: `run()` records compute /
 * measure / paint + counts in headless (compute-only) mode, and
 * `mountBodyView` records the `toProseDoc` phase. Both adapters share the
 * engine, so these timings are adapter-agnostic by construction.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { singletonManager } from '../../prosemirror/schema';
import { LayoutSelectionGate } from '../../prosemirror/utils/LayoutSelectionGate';
import type { Document, Paragraph, SectionProperties } from '../../types/document';
import type { FlowBlock, Measure } from '../../layout-engine';
import { DocxEditorEngine, type EngineHost } from '../DocxEditorEngine';

const schema = singletonManager.getSchema();

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function paraNode(paraId: string, text: string): PMNode {
  return schema.nodes.paragraph.create({ paraId }, schema.text(text));
}

function stateFor(...paragraphs: PMNode[]): EditorState {
  const doc = schema.nodes.doc.create(null, paragraphs);
  return EditorState.create({ schema, doc });
}

function stubMeasure(block: FlowBlock): Measure {
  if (block.kind === 'paragraph') {
    return {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          toRun: 0,
          fromChar: 0,
          toChar: 0,
          width: 100,
          ascent: 12,
          descent: 4,
          lineHeight: 16,
        },
      ],
      totalHeight: 16,
    };
  }
  return { kind: block.kind } as unknown as Measure;
}

function contentPara(paraId: string, text: string): Paragraph {
  return {
    type: 'paragraph',
    paraId,
    content: [{ type: 'run', content: [{ type: 'text', text }] }],
  };
}

function basicDoc(): Document {
  return {
    package: {
      document: { content: [contentPara('A1', 'hello'), contentPara('A2', 'world')] },
    },
  };
}

/** Headless host: no pages container, so `run` is compute + `onLayout` only. */
function makeHost(doc: Document | null, sp: SectionProperties | null = null): EngineHost {
  const gate = new LayoutSelectionGate();
  return {
    getDocument: () => doc,
    getStyles: () => null,
    getTheme: () => null,
    getSectionProperties: () => sp,
    getFinalSectionProperties: () => null,
    getHeaderFooter: () => ({
      header: null,
      footer: null,
      firstHeader: null,
      firstFooter: null,
    }),
    getPageGap: () => 24,
    getResolvedCommentIds: () => undefined,
    getHfPmDoc: () => null,
    measureBlocks: (blocks) => blocks.map(stubMeasure),
    getSyncCoordinator: () => gate,
    getPagesContainer: () => null,
    getScrollContainer: () => null,
    onLayout: () => {},
    onPainted: () => {},
    onScrollRestore: () => true,
    onError: () => {},
    mountView: () => {
      throw new Error('mountView: headless stub has no DOM');
    },
    destroyView: () => {},
    getHfHostEl: () => null,
    scheduleFrame: (cb) => {
      cb();
      return 0;
    },
  };
}

describe('DocxEditorEngine pipeline timings', () => {
  test('run() records compute/measure phases + counts without paint (headless)', () => {
    const engine = new DocxEditorEngine(makeHost(basicDoc()));
    const state = stateFor(paraNode('A1', 'hello'), paraNode('A2', 'world'));

    const computation = engine.run(state);
    expect(computation).toBeDefined();

    const t = engine.getTimings();
    expect(t.computeMs).toBeDefined();
    expect(t.computeMs!).toBeGreaterThanOrEqual(0);
    expect(t.measureMs).toBeDefined();
    expect(t.measureMs!).toBeGreaterThanOrEqual(0);
    // No pages container: paint skipped, counts still recorded.
    expect(t.paintMs).toBe(0);
    expect(t.totalMs).toBeDefined();
    expect(t.totalMs!).toBeGreaterThanOrEqual(0);
    expect(t.blocks).toBe(2);
    expect(t.pages).toBeGreaterThanOrEqual(1);

    console.log(
      `timings: compute=${t.computeMs?.toFixed(2)}ms ` +
        `measure=${t.measureMs?.toFixed(2)}ms paint=${t.paintMs}ms ` +
        `total=${t.totalMs?.toFixed(2)}ms (${t.blocks} blocks, ${t.pages} pages)`
    );
  });

  test('mountBodyView records the toProseDoc phase', () => {
    const engine = new DocxEditorEngine({
      ...makeHost(null),
      mountView: () => ({}) as unknown as EditorView,
    });

    engine.mountBodyView(document.createElement('div'), null);

    const t = engine.getTimings();
    expect(t.toProseMs).toBeDefined();
    expect(t.toProseMs!).toBeGreaterThanOrEqual(0);
    engine.destroyBodyView();
  });
});
