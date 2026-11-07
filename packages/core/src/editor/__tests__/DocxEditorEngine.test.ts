/**
 * `DocxEditorEngine.run` — layout pipeline orchestration (issue #696 Tier 2,
 * step 1.7). Synchronous host stubs (null pages container → compute-only,
 * no DOM), asserting run produces the expected Layout for fixture docs
 * with/without footnotes and with/without columns.
 */

import { describe, expect, test } from 'bun:test';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import { singletonManager } from '../../prosemirror/schema';
import { LayoutSelectionGate } from '../../prosemirror/utils/LayoutSelectionGate';
import type {
  Document,
  Paragraph,
  SectionProperties,
} from '../../types/document';
import type { FlowBlock, Measure } from '../../layout-engine';
import type { BlockLookup } from '../../layout-painter';
import { DocxEditorEngine, type EngineHost } from '../DocxEditorEngine';

const schema = singletonManager.getSchema();

function paraNode(paraId: string, text: string, marks: unknown[] = []) {
  return schema.nodes.paragraph.create({ paraId }, schema.text(text, marks as never[]));
}

function footnoteMark(id: number) {
  return schema.marks.footnoteRef.create({ id: String(id), noteType: 'footnote' });
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
  if (block.kind === 'table') {
    return { kind: 'table', width: 100, height: 20, rows: [] } as unknown as Measure;
  }
  return { kind: block.kind } as unknown as Measure;
}

function contentPara(paraId: string | undefined, text: string): Paragraph {
  return {
    type: 'paragraph',
    paraId,
    content: [{ type: 'run', content: [{ type: 'text', text }] }],
  };
}

interface Captured {
  layouts: unknown[];
  blockCounts: number[];
  lookups: BlockLookup[];
  painted: number;
  scrollRestores: number;
  errors: unknown[];
  measuredWidths: Array<number | number[]>;
}

/** Headless host: no pages container, so `run` is compute + `onLayout` only. */
function makeHost(doc: Document | null, sp: SectionProperties | null = null): {
  host: EngineHost;
  captured: Captured;
} {
  const captured: Captured = {
    layouts: [],
    blockCounts: [],
    lookups: [],
    painted: 0,
    scrollRestores: 0,
    errors: [],
    measuredWidths: [],
  };
  const gate = new LayoutSelectionGate();
  const host: EngineHost = {
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
    measureBlocks: (blocks, widths) => {
      captured.measuredWidths.push(widths);
      return blocks.map(stubMeasure);
    },
    getSyncCoordinator: () => gate,
    getPagesContainer: () => null,
    getScrollContainer: () => null,
    onLayout: (layout, blocks, _measures, lookup) => {
      captured.layouts.push(layout);
      captured.blockCounts.push(blocks.length);
      captured.lookups.push(lookup);
    },
    onPainted: () => {
      captured.painted += 1;
    },
    onScrollRestore: () => {
      captured.scrollRestores += 1;
      return true;
    },
    onError: (error) => {
      captured.errors.push(error);
    },
    scheduleFrame: (cb) => {
      cb();
      return 0;
    },
  };
  return { host, captured };
}

function basicDoc(): Document {
  return {
    package: {
      document: { content: [contentPara('A1', 'hello'), contentPara('A2', 'world')] },
    },
  };
}

describe('DocxEditorEngine.run', () => {
  test('basic doc: computes layout and emits blocks/measures/lookup', () => {
    const { host, captured } = makeHost(basicDoc());
    const engine = new DocxEditorEngine(host);
    const state = stateFor(paraNode('A1', 'hello'), paraNode('A2', 'world'));

    const computation = engine.run(state);

    expect(computation).toBeDefined();
    expect(computation!.layout.pages.length).toBeGreaterThanOrEqual(1);
    expect(computation!.blocks.length).toBe(2);
    expect(computation!.measures.length).toBe(2);
    expect(captured.layouts.length).toBe(1);
    expect(captured.blockCounts).toEqual([2]);
    expect(captured.lookups.length).toBe(1);
    expect(captured.lookups[0].size).toBe(2);
    // No pages container: paint + scroll hooks stay silent.
    expect(captured.painted).toBe(0);
    expect(captured.scrollRestores).toBe(0);
    expect(captured.errors).toEqual([]);
  });

  test('column geometry: per-block widths derive from section properties', () => {
    const single = makeHost(basicDoc(), null);
    const columns = makeHost(basicDoc(), {
      columnCount: 2,
      columnSpace: 720,
    } as SectionProperties);
    const state = stateFor(paraNode('A1', 'hello'), paraNode('A2', 'world'));

    const singleComp = new DocxEditorEngine(single.host).run(state);
    const columnsComp = new DocxEditorEngine(columns.host).run(state);

    expect(singleComp).toBeDefined();
    expect(columnsComp).toBeDefined();
    // Multi-column sections measure per-block widths; the single-column
    // path measures at the full content width.
    expect(single.captured.measuredWidths.length).toBeGreaterThan(0);
    expect(columns.captured.measuredWidths.length).toBeGreaterThan(0);
    const singleWidth = single.captured.measuredWidths[0];
    const columnsWidth = columns.captured.measuredWidths[0];
    expect(Array.isArray(singleWidth)).toBe(true);
    expect(Array.isArray(columnsWidth)).toBe(true);
    expect((columnsWidth as number[])[0]).toBeLessThan((singleWidth as number[])[0]);
  });

  test('footnotes: doc with footnote refs produces footnote render items', () => {
    const notePara = contentPara('N1', 'note text');
    const doc: Document = {
      package: {
        document: { content: [contentPara('A1', 'body')] },
        footnotes: [{ type: 'footnote', id: 7, content: [notePara] }],
      },
    };
    const { host, captured } = makeHost(doc);
    const engine = new DocxEditorEngine(host);
    const state = stateFor(paraNode('A1', 'body ', [footnoteMark(7)]));

    const computation = engine.run(state);

    expect(computation).toBeDefined();
    expect(captured.errors).toEqual([]);
    expect(computation!.footnotesByPage?.size ?? 0).toBeGreaterThanOrEqual(1);
  });

  test('no footnotes package: footnote render items stay undefined', () => {
    const { host } = makeHost(basicDoc());
    const engine = new DocxEditorEngine(host);
    const state = stateFor(paraNode('A1', 'body ', [footnoteMark(7)]));

    const computation = engine.run(state);

    expect(computation).toBeDefined();
    expect(computation!.footnotesByPage).toBeUndefined();
  });

  test('measure failure: notifies onError and returns undefined (never throws)', () => {
    const { host, captured } = makeHost(basicDoc());
    const failing: EngineHost = {
      ...host,
      measureBlocks: () => {
        throw new Error('boom');
      },
    };
    const engine = new DocxEditorEngine(failing);
    const state = stateFor(paraNode('A1', 'hello'));

    let threw = false;
    let result;
    try {
      result = engine.run(state);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeUndefined();
    expect(captured.errors.length).toBe(1);
  });
});
