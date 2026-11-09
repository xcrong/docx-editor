/**
 * View-lifecycle builders for `DocxEditorEngine` (issue #696 Tier 2, step 4).
 *
 * Pure ProseMirror state factories + HF slot enumeration shared by the React
 * and Vue adapters. Lifted verbatim from React's `HiddenProseMirror`
 * (`createInitialState`, `getDocumentId`) and `HiddenHeaderFooterPMs`
 * (`buildInitialState`, `enumerateSlots`) — React is the canonical source,
 * so its behavior is preserved exactly. View *ownership* (the
 * `Map<rId, EditorView>`, mount/teardown sequencing) lives on
 * `DocxEditorEngine`; this module stays framework-free so it remains
 * unit-testable with a synchronous host.
 */

import { EditorState, type Plugin } from 'prosemirror-state';

import { ensureParaIdsInState, schema } from '../prosemirror';
import { createEmptyDoc, headerFooterToProseDoc, toProseDoc } from '../prosemirror/conversion';
import { ExtensionManager, createStarterKit } from '../prosemirror/extensions';
import {
  createDocumentContextPlugin,
  createDocumentStylesPlugin,
  createSuggestionModePlugin,
} from '../prosemirror/plugins';
import type { Document, HeaderFooter, StyleDefinitions, Theme } from '../types/document';

export type HfPartKind = 'header' | 'footer';

export interface HfSlot {
  rId: string;
  kind: HfPartKind;
}

/**
 * Enumerate the HF slots (`rId` + header/footer kind) for a document.
 * Dedupes an `rId` registered under both bags (OOXML keeps them disjoint;
 * defensive anyway).
 */
export function enumerateHfSlots(doc: Document | null): HfSlot[] {
  if (!doc?.package) return [];
  const out: HfSlot[] = [];
  const headers = doc.package.headers;
  if (headers) {
    for (const rId of headers.keys()) out.push({ rId, kind: 'header' });
  }
  const footers = doc.package.footers;
  if (footers) {
    for (const rId of footers.keys()) {
      if (!headers || !headers.has(rId)) out.push({ rId, kind: 'footer' });
    }
  }
  return out;
}

/**
 * Stable document identity from package metadata. Used to distinguish truly
 * external document swaps (file load) from the same document passed back
 * through props after internal edits.
 */
export function getDocumentId(doc: Document | null): string {
  if (!doc) return 'empty';
  const meta = doc.package?.properties;
  return `${meta?.created || ''}-${meta?.modified || ''}-${meta?.title || ''}`;
}

export interface BodyStateOptions {
  document: Document | null;
  styles: StyleDefinitions | null | undefined;
  /** Adapter-owned manager (React prop / Vue singleton); falls back to the shared schema. */
  manager?: ExtensionManager;
  /** Prefix plugins (React external plugins / Vue suggestion plugin) — run before extension keymaps. */
  prefixPlugins?: Plugin[];
}

/**
 * Build the body's initial `EditorState` from a `Document` model.
 * Every paragraph gets a paraId up front so block ids / agent scope work
 * before the first edit.
 */
export function createBodyEditorState(options: BodyStateOptions): EditorState {
  const { document, styles, manager, prefixPlugins = [] } = options;
  const activeSchema = manager?.getSchema() ?? schema;
  const effectiveStyles = styles ?? document?.package?.styles;
  const doc = document ? toProseDoc(document, { styles: effectiveStyles }) : createEmptyDoc();

  // Expose the document's styles to style-aware commands (e.g. the Enter
  // handler's `w:next` switch from heading to body text).
  const styleResolverPlugin = createDocumentStylesPlugin(effectiveStyles);
  // Document context (theme + settings `w:defaultTableStyle`) for the
  // table-insert command's default-table-style adoption.
  const documentContextPlugin = createDocumentContextPlugin({
    theme: document?.package?.theme ?? null,
    defaultTableStyleId: document?.package?.settings?.defaultTableStyle ?? null,
  });

  // Prefix plugins go first so they can intercept before extension keymaps
  // (e.g. suggestion mode must handle Backspace/Delete before deleteSelection).
  const plugins: Plugin[] = [
    ...prefixPlugins,
    ...(manager?.getPlugins() ?? []),
    styleResolverPlugin,
    documentContextPlugin,
  ];

  return ensureParaIdsInState(
    EditorState.create({
      doc,
      schema: activeSchema,
      plugins,
    })
  );
}

/** Fresh per-rId `ExtensionManager` — history / input-rule plugins are per-EditorView. */
export function createHfExtensionManager(): ExtensionManager {
  const mgr = new ExtensionManager(createStarterKit());
  mgr.buildSchema();
  mgr.initializeRuntime();
  return mgr;
}

export interface HfStateOptions {
  hf: HeaderFooter;
  styles: StyleDefinitions | null | undefined;
  theme: Theme | null | undefined;
  defaultTabStopTwips: number | null | undefined;
  defaultTableStyleId: string | null | undefined;
  manager: ExtensionManager;
  suggesting: boolean;
  author: string;
}

/** Build an HF part's initial `EditorState` from its `HeaderFooter` model. */
export function createHfEditorState(options: HfStateOptions): EditorState {
  const {
    hf,
    styles,
    theme,
    defaultTabStopTwips,
    defaultTableStyleId,
    manager,
    suggesting,
    author,
  } = options;
  const pmDoc = headerFooterToProseDoc(hf.content, {
    styles: styles ?? undefined,
    theme: theme ?? null,
    defaultTabStopTwips: defaultTabStopTwips ?? null,
  });
  // Header/footer paragraphs share the document's style table, so they get
  // the same style-aware behavior (e.g. Enter after a heading → body text).
  const styleResolverPlugin = createDocumentStylesPlugin(styles);
  // Document context (theme + settings `w:defaultTableStyle`) so inserting a
  // table in a header/footer adopts the default table style too.
  const documentContextPlugin = createDocumentContextPlugin({
    theme: theme ?? null,
    defaultTableStyleId: defaultTableStyleId ?? null,
  });
  const suggestionPlugin = createSuggestionModePlugin(suggesting, author);
  return EditorState.create({
    doc: pmDoc,
    schema,
    plugins: [
      suggestionPlugin,
      ...manager.getPlugins(),
      styleResolverPlugin,
      documentContextPlugin,
    ],
  });
}
