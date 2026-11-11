import type { RefObject } from 'react';
import { findStartPosForParaId } from '@xcrong/docx-editor-core';
import { setSuggestionMode } from '@xcrong/docx-editor-core/prosemirror/plugins';
// Re-exported by core, so the demo needs no direct `prosemirror-state` dep
// (which would break the production build — it isn't in examples/vite deps).
import { TextSelection } from '@xcrong/docx-editor-core/prosemirror';
import {
  acceptChangeById,
  rejectChangeById,
  acceptAllChanges,
  rejectAllChanges,
  addRowBelow,
  deleteRow,
  insertTable,
  insertImageNode,
} from '@xcrong/docx-editor-core/prosemirror/commands';
import type { DocxEditorRef } from '@xcrong/docx-editor-react';
import { templatePluginKey } from '@xcrong/docx-editor-react/plugin-api';
import { createReviewBridge } from '@xcrong/docx-editor-agents/bridge';

// E2E-only hooks (installed under `?e2e=1`), extracted from App.tsx to
// keep the demo component under the max-lines lint cap.
export function installE2EHooks(
  editorRef: RefObject<DocxEditorRef | null>,
  randomAuthor: string
): () => void {
  // Cached live-review bridge (see agentBridge* hooks below).
  let cachedBridgeHandle: DocxEditorRef | null = null;
  let cachedBridge: ReturnType<typeof createReviewBridge> | null = null;
  const getReviewBridge = (author?: string) => {
    const handle = editorRef.current;
    if (!handle) return null;
    if (author && author !== 'E2E') return createReviewBridge(handle, author);
    if (!cachedBridge || cachedBridgeHandle !== handle) {
      cachedBridge = createReviewBridge(handle, 'E2E');
      cachedBridgeHandle = handle;
    }
    return cachedBridge;
  };
  window.__DOCX_EDITOR_E2E__ = {
    // Raw body EditorView — lets specs build precise PM states (e.g. a line
    // with mixed font sizes) without driving the toolbar UI.
    getView: () => editorRef.current?.getEditorRef()?.getView?.() ?? null,
    // Template-plugin parity hook — number of docxtemplater tags detected
    // by the built-in templatePlugin's PM state (mounted via
    // externalPlugins when ?template=1). Mirrors the Vue demo hook.
    getTemplateTagCount: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return null;
      return templatePluginKey.getState(view.state)?.tags.length ?? 0;
    },
    getPmStartForParaId: (paraId: string) => {
      const state = editorRef.current?.getEditorRef()?.getState?.();
      if (!state || !paraId) return null;
      return findStartPosForParaId(state.doc, paraId);
    },
    getSelectionAnchor: () => {
      const state = editorRef.current?.getEditorRef()?.getState?.();
      return state?.selection.anchor ?? null;
    },
    getTextblockEndForParaId: (paraId: string) => {
      const state = editorRef.current?.getEditorRef()?.getState?.();
      if (!state || !paraId) return null;
      const start = findStartPosForParaId(state.doc, paraId);
      if (start == null) return null;
      const node = state.doc.nodeAt(start);
      return node?.isTextblock === true ? start + 1 + node.content.size : null;
    },
    getFirstTextblockParaId: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return null;
      let found: string | null = null;
      // NOTE: returning false from descendants does NOT stop traversal
      // (it only skips the node's children), so guard with found == null
      // to actually keep the FIRST match.
      view.state.doc.descendants((node) => {
        if (found == null && node.isTextblock && node.attrs?.paraId) {
          found = String(node.attrs.paraId);
        }
      });
      return found;
    },
    getLastTextblockParaId: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return null;
      let found: string | null = null;
      view.state.doc.descendants((node) => {
        if (node.isTextblock && node.attrs?.paraId) {
          found = String(node.attrs.paraId);
        }
        return true;
      });
      return found;
    },
    scrollToParaId: (paraId: string) => editorRef.current?.scrollToParaId(paraId) ?? false,
    scrollToPosition: (pmPos: number) => {
      editorRef.current?.scrollToPosition(pmPos);
    },
    getDocSize: () => {
      const state = editorRef.current?.getEditorRef()?.getState?.();
      return state?.doc.content.size ?? null;
    },
    highlightRange: (from: number, to: number) => {
      editorRef.current?.highlightRange(from, to);
    },
    scrollToCommentId: (commentId: number) =>
      editorRef.current?.scrollToCommentId(commentId) ?? false,
    scrollToChangeId: (revisionId: number) =>
      editorRef.current?.scrollToChangeId(revisionId) ?? false,
    scrollToPage: (pageNumber: number) => {
      editorRef.current?.scrollToPage(pageNumber);
    },
    getTotalPages: () => editorRef.current?.getTotalPages() ?? 0,
    getCurrentPage: () => editorRef.current?.getCurrentPage() ?? 0,
    saveByteLength: async () => {
      const buffer = await editorRef.current?.save();
      return buffer?.byteLength ?? null;
    },
    // Content-control (SDT) addressing surface.
    agentGetContentControls: (filter?: {
      tag?: string;
      alias?: string;
      id?: number;
      type?: string;
    }) =>
      editorRef.current
        ?.getContentControls(filter as Parameters<typeof editorRef.current.getContentControls>[0])
        .map((c) => ({ tag: c.tag, alias: c.alias, sdtType: c.sdtType, text: c.text })) ?? [],
    agentSetContentControlContent: (
      filter: { tag?: string; alias?: string; id?: number },
      text: string,
      options?: { force?: boolean }
    ) => editorRef.current?.setContentControlContent(filter, text, options) ?? false,
    agentRemoveContentControl: (
      filter: { tag?: string; alias?: string; id?: number },
      options?: { force?: boolean; keepContent?: boolean }
    ) => editorRef.current?.removeContentControl(filter, options) ?? false,
    agentScrollToContentControl: (filter: { tag?: string; alias?: string; id?: number }) =>
      editorRef.current?.scrollToContentControl(filter) ?? false,
    // Agent-bridge surface — drives the same paths the live agent uses.
    agentAddComment: (opts: { paraId: string; text: string; author?: string; search?: string }) =>
      editorRef.current?.addComment({
        paraId: opts.paraId,
        text: opts.text,
        author: opts.author ?? 'E2E',
        search: opts.search,
      }) ?? null,
    agentProposeChange: (opts: {
      paraId: string;
      search: string;
      replaceWith: string;
      author?: string;
    }) =>
      editorRef.current?.proposeChange({
        paraId: opts.paraId,
        search: opts.search,
        replaceWith: opts.replaceWith,
        author: opts.author ?? 'E2E',
      }) ?? false,
    agentReplyComment: (commentId: number, text: string, author = 'E2E') =>
      editorRef.current?.replyToComment(commentId, text, author) ?? null,
    // Review-plugin bridge surface (review-plugin 9.2) — goes through the
    // real `createReviewBridge` instead of calling the ref directly, so the
    // e2e covers the same paraId delegation path the agent uses (the
    // adapter resolves each paraId to PM positions at call time).
    // The default-author bridge is cached per editor handle: these methods
    // register no listeners, but a fresh closure set per call would leak if
    // the bridge ever gains subscription state. Custom-author calls still
    // get a dedicated bridge.
    agentBridgeGetContent: () => getReviewBridge()?.getContent() ?? [],
    agentBridgeAddComment: (opts: {
      paraId: string;
      text: string;
      author?: string;
      search?: string;
    }) => {
      const bridge = getReviewBridge(opts.author);
      if (!bridge) return null;
      return bridge.addComment({
        paraId: opts.paraId,
        text: opts.text,
        search: opts.search,
      });
    },
    agentBridgeProposeChange: (opts: {
      paraId: string;
      search: string;
      replaceWith: string;
      author?: string;
    }) => {
      const bridge = getReviewBridge(opts.author);
      if (!bridge) return false;
      return bridge.proposeChange({
        paraId: opts.paraId,
        search: opts.search,
        replaceWith: opts.replaceWith,
      });
    },
    agentResolveComment: (commentId: number) => editorRef.current?.resolveComment(commentId),
    agentFind: (query: string) => editorRef.current?.findInDocument(query) ?? [],
    agentSelection: () => editorRef.current?.getSelectionInfo() ?? null,
    agentGetCommentCount: () => editorRef.current?.getComments().length ?? 0,
    // Event subscriptions — count fires so tests can assert listeners are wired.
    agentOnContentChangeCount: 0,
    agentOnSelectionChangeCount: 0,
    agentSubscribeContentChange: () => {
      const hook = window.__DOCX_EDITOR_E2E__;
      if (!hook) return () => undefined;
      const unsub = editorRef.current?.onContentChange(() => {
        hook.agentOnContentChangeCount = (hook.agentOnContentChangeCount ?? 0) + 1;
      });
      return unsub ?? (() => undefined);
    },
    agentSubscribeSelectionChange: () => {
      const hook = window.__DOCX_EDITOR_E2E__;
      if (!hook) return () => undefined;
      const unsub = editorRef.current?.onSelectionChange(() => {
        hook.agentOnSelectionChangeCount = (hook.agentOnSelectionChangeCount ?? 0) + 1;
      });
      return unsub ?? (() => undefined);
    },
    agentApplyFormatting: (opts: {
      paraId: string;
      search?: string;
      marks: Parameters<NonNullable<typeof editorRef.current>['applyFormatting']>[0]['marks'];
    }) => editorRef.current?.applyFormatting(opts) ?? false,
    agentSetParagraphStyle: (opts: { paraId: string; styleId: string }) =>
      editorRef.current?.setParagraphStyle(opts) ?? false,
    agentGetPageContent: (pageNumber: number) =>
      editorRef.current?.getPageContent(pageNumber) ?? null,
    agentGetDocumentText: () => extractDocumentText(editorRef.current?.getDocument()),
    // Raw host-facing Document model — lets specs walk package data (e.g. the
    // style list) that the flattened bridge readers don't expose.
    getDocument: () => editorRef.current?.getDocument() ?? null,
    // Tracked structural revisions (#614). Drive the suggesting-mode plugin
    // and the new id-based accept/reject commands directly against the
    // active PM view, so tests don't depend on React mode-prop wiring.
    setSuggestionMode: (active: boolean, authorOverride?: string) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      setSuggestionMode(active, view.state, view.dispatch, authorOverride ?? randomAuthor);
      return true;
    },
    getParagraphRevisionAt: (index: number) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return null;
      let count = 0;
      let out: { pPrIns: unknown; pPrDel: unknown } | null = null;
      view.state.doc.descendants((node) => {
        if (out != null) return false;
        if (node.type.name !== 'paragraph') return true;
        if (count === index) {
          out = {
            pPrIns: (node.attrs as Record<string, unknown>).pPrIns ?? null,
            pPrDel: (node.attrs as Record<string, unknown>).pPrDel ?? null,
          };
          return false;
        }
        count += 1;
        return true;
      });
      return out;
    },
    acceptChangeById: (revisionId: number) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      return acceptChangeById(revisionId)(view.state, view.dispatch);
    },
    rejectChangeById: (revisionId: number) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      return rejectChangeById(revisionId)(view.state, view.dispatch);
    },
    acceptAllChanges: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      return acceptAllChanges()(view.state, view.dispatch);
    },
    rejectAllChanges: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      return rejectAllChanges()(view.state, view.dispatch);
    },
    // Test-only: read full attrs of the Nth paragraph, including new
    // revision attrs (pPrIns/pPrDel/pPrChange).
    getParagraphAttrs: (index: number) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return null;
      let count = 0;
      let out: Record<string, unknown> | null = null;
      view.state.doc.descendants((node) => {
        if (out != null) return false;
        if (node.type.name !== 'paragraph') return true;
        if (count === index) {
          out = { ...node.attrs };
          return false;
        }
        count += 1;
        return true;
      });
      return out;
    },
    // Test-only: insert a 1x1 table at the cursor (replaces selection),
    // bypassing the toolbar. Used by the trIns spec.
    // Calls the real insertTable command — exercises the suggesting-mode
    // tracking path (trIns + cellMarker:ins) when used after setSuggestionMode.
    insertTable: (rows: number, cols: number) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      return insertTable(rows, cols)(view.state, view.dispatch);
    },
    // Test-only: insert an inline image at the cursor via the same helper the
    // UI uses, so it is wrapped in the `insertion` mark under suggesting mode.
    insertImage: (src: string, width = 80, height = 60) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      const imageNode = view.state.schema.nodes.image.create({
        src,
        alt: 'test image',
        width,
        height,
        wrapType: 'inline',
        displayMode: 'inline',
      });
      return insertImageNode(view.state, view.dispatch, imageNode, view.state.selection.from);
    },
    // Test-only: select the first image (a text selection spanning the atom)
    // so a following Backspace/Delete exercises the suggesting-mode
    // atom-deletion path.
    selectFirstImage: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      let imgPos: number | null = null;
      view.state.doc.descendants((node, pos) => {
        if (imgPos != null) return false;
        if (node.type.name === 'image') {
          imgPos = pos;
          return false;
        }
        return true;
      });
      if (imgPos == null) return false;
      const tr = view.state.tr.setSelection(
        TextSelection.create(view.state.doc, imgPos, imgPos + 1)
      );
      view.dispatch(tr);
      view.focus();
      return true;
    },
    plantSimpleTable: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      const { schema } = view.state;
      const cellPara = schema.node('paragraph', {}, [schema.text('A')]);
      const cell = schema.node('tableCell', { colspan: 1, rowspan: 1 }, [cellPara]);
      const row = schema.node('tableRow', {}, [cell]);
      const table = schema.node('table', {}, [row]);
      view.dispatch(view.state.tr.replaceSelectionWith(table));
      return true;
    },
    // Test-only: count the rows of the first table in the doc.
    countTableRows: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return 0;
      let count = 0;
      let inFirstTable = false;
      view.state.doc.descendants((node) => {
        if (node.type.name === 'table') {
          if (inFirstTable) return false;
          inFirstTable = true;
          return true;
        }
        if (inFirstTable && node.type.name === 'tableRow') count += 1;
        return false;
      });
      return count;
    },
    // Test-only: place the caret inside the first cell of the first
    // table in the doc so suggesting-mode commands like `addRowBelow`
    // have a row index to work with.
    focusFirstTableCell: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      let target: number | null = null;
      view.state.doc.descendants((node, pos) => {
        if (target != null) return false;
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          // `pos + 2` works when the first child is a paragraph (the
          // typical case). If it's a nested table, `TextSelection.near`
          // snaps forward to the next text-allowing position.
          target = pos + 2;
          return false;
        }
        return true;
      });
      if (target == null) return false;
      // Use the constructor on the live selection to avoid a direct
      // `prosemirror-state` dependency in the demo's package.json.
      const SelectionCtor = view.state.selection.constructor as unknown as {
        near: ($pos: unknown) => unknown;
      };
      const tr = view.state.tr.setSelection(
        SelectionCtor.near(view.state.doc.resolve(target)) as typeof view.state.selection
      );
      view.dispatch(tr);
      view.focus();
      return true;
    },
    // Test-only: dispatch the `addRowBelow` table command. Suggesting-mode
    // active → sets `trIns` on the new row + `cellMarker: ins` on each cell.
    addRowBelow: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      return addRowBelow(view.state, view.dispatch);
    },
    // Test-only: dispatch the schema-free `deleteRow` table command.
    // Suggesting-mode active → sets `trDel` on the row + `cellMarker: del`.
    deleteCurrentRow: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      return deleteRow(view.state, view.dispatch);
    },
    // Test-only: plant trIns on the first table row in the document.
    // Returns false if no table exists.
    plantTableRowInsertion: (revisionId: number) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      let rowPos: number | null = null;
      // Evolving-let: takes the descendants callback's node type on assignment.
      let rowNode = null as unknown;
      view.state.doc.descendants((node, pos) => {
        if (rowPos != null) return false;
        if (node.type.name === 'tableRow') {
          rowPos = pos;
          rowNode = node;
          return false;
        }
        return true;
      });
      if (rowPos == null || rowNode == null) return false;
      view.dispatch(
        view.state.tr.setNodeMarkup(rowPos, undefined, {
          ...(rowNode as { attrs: Record<string, unknown> }).attrs,
          trIns: {
            revisionId,
            author: 'Jane',
            date: new Date().toISOString(),
          },
        })
      );
      return true;
    },
    getFirstTableRowAttrs: () => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return null;
      let out: Record<string, unknown> | null = null;
      view.state.doc.descendants((node) => {
        if (out != null) return false;
        if (node.type.name === 'tableRow') {
          out = { ...node.attrs };
          return false;
        }
        return true;
      });
      return out;
    },
    // Test-only: plant a pPrChange entry on the first paragraph for
    // round-trip / reject-restore verification. `current` and `paraAttrs`
    // let a test simulate a post-save/reload state (e.g. a list-creation
    // suggestion whose empty prior `<w:pPr/>` round-tripped without numPr).
    plantParagraphPropertyChange: (
      revisionId: number,
      prior: unknown,
      current?: unknown,
      paraAttrs?: Record<string, unknown>,
      paraIndex?: number
    ) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      let targetPos: number | null = null;
      // Evolving-let: takes the descendants callback's node type on assignment.
      let targetPara = null as unknown;
      let index = 0;
      view.state.doc.descendants((node, pos) => {
        if (targetPos != null) return false;
        if (node.type.name === 'paragraph') {
          if (index === (paraIndex ?? 0)) {
            targetPos = pos;
            targetPara = node;
            return false;
          }
          index += 1;
        }
        return true;
      });
      if (targetPos == null || targetPara == null) return false;
      const tr = view.state.tr.setNodeMarkup(targetPos, undefined, {
        ...(targetPara as { attrs: Record<string, unknown> }).attrs,
        ...(paraAttrs ?? {}),
        pPrChange: [
          {
            type: 'paragraphPropertyChange',
            info: { id: revisionId, author: 'Jane', date: new Date().toISOString() },
            previousFormatting: prior,
            ...(current !== undefined ? { currentFormatting: current } : {}),
          },
        ],
      });
      view.dispatch(tr);
      return true;
    },
    // Test-only: plant a paraRPrChange entry (CT_ParaRPrChange) on the first
    // paragraph for accept/reject verification. `prior` is the previous
    // paragraph-mark run formatting.
    plantParagraphMarkPropertyChange: (revisionId: number, prior: unknown) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      let firstParaPos: number | null = null;
      let firstPara = null as unknown;
      view.state.doc.descendants((node, pos) => {
        if (firstParaPos != null) return false;
        if (node.type.name === 'paragraph') {
          firstParaPos = pos;
          firstPara = node;
          return false;
        }
        return true;
      });
      if (firstParaPos == null || firstPara == null) return false;
      const tr = view.state.tr.setNodeMarkup(firstParaPos, undefined, {
        ...(firstPara as { attrs: Record<string, unknown> }).attrs,
        paraRPrChange: [
          {
            type: 'paragraphMarkPropertyChange',
            info: { id: revisionId, author: 'Jane', date: new Date().toISOString() },
            previousFormatting: prior,
          },
        ],
      });
      view.dispatch(tr);
      return true;
    },
    // Test-only: plant a pPr-level sectPrChange entry on the first paragraph
    // for accept/reject verification. `prior` is the previous section
    // properties snapshot.
    plantSectionPropertyChange: (revisionId: number, prior: unknown) => {
      const view = editorRef.current?.getEditorRef()?.getView?.();
      if (!view) return false;
      let firstParaPos: number | null = null;
      let firstPara = null as unknown;
      view.state.doc.descendants((node, pos) => {
        if (firstParaPos != null) return false;
        if (node.type.name === 'paragraph') {
          firstParaPos = pos;
          firstPara = node;
          return false;
        }
        return true;
      });
      if (firstParaPos == null || firstPara == null) return false;
      const prevSect = ((firstPara as { attrs: Record<string, unknown> }).attrs
        ._sectionProperties ?? {}) as Record<string, unknown>;
      const tr = view.state.tr.setNodeMarkup(firstParaPos, undefined, {
        ...(firstPara as { attrs: Record<string, unknown> }).attrs,
        _sectionProperties: {
          ...prevSect,
          sectPrChange: {
            type: 'sectionPropertyChange',
            info: { id: revisionId, author: 'Jane', date: new Date().toISOString() },
            previousSectionProperties: prior,
          },
        },
      });
      view.dispatch(tr);
      return true;
    },
  };
  return () => {
    delete window.__DOCX_EDITOR_E2E__;
  };
}

function extractDocumentText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const maybeText = (value as { text?: unknown }).text;
  if (typeof maybeText === 'string') return maybeText;
  return Object.values(value)
    .map((child) =>
      Array.isArray(child)
        ? child.map((item) => extractDocumentText(item)).join('')
        : extractDocumentText(child)
    )
    .join('');
}
