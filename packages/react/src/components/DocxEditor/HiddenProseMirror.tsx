/**
 * HiddenProseMirror Component
 *
 * Off-screen ProseMirror instance that owns all keyboard input and state
 * while the paginated layout engine handles visual output. Responsibilities:
 *
 * - Keyboard input handling
 * - Selection state management
 * - Accessibility (semantic document structure for screen readers)
 * - ProseMirror transaction processing
 *
 * Visibility approach: The editor is moved off-viewport with position:fixed
 * and rendered transparent so it can still receive focus and remain part of
 * the accessibility tree. Content width is kept in sync with the document
 * so that ProseMirror's internal measurements stay valid.
 */

import { useRef, useEffect, useImperativeHandle, forwardRef, memo } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  EditorState,
  Transaction,
  TextSelection,
  NodeSelection,
  type Command,
} from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import { undo, redo } from 'prosemirror-history';
import { fromProseDoc } from '@xcrong/docx-editor-core/prosemirror/conversion';
import type { DocxEditorEngine } from '@xcrong/docx-editor-core/editor';
import type { Document } from '@xcrong/docx-editor-core/types/document';

// Import ProseMirror CSS
import 'prosemirror-view/style/prosemirror.css';
import '@xcrong/docx-editor-core/prosemirror/editor.css';

// ============================================================================
// TYPES
// ============================================================================

export interface HiddenProseMirrorProps {
  /** The document to edit */
  document: Document | null;
  /** Width in pixels (should match document content width) */
  widthPx?: number;
  /** The engine that owns the body EditorView lifecycle. */
  engine: DocxEditorEngine;
}

export interface HiddenProseMirrorRef {
  /** Get the off-screen host element */
  getHostElement(): HTMLElement | null;
  /** Get the ProseMirror EditorState */
  getState(): EditorState | null;
  /** Get the ProseMirror EditorView */
  getView(): EditorView | null;
  /** Get the current Document from PM state */
  getDocument(): Document | null;
  /** Focus the hidden editor */
  focus(): void;
  /** Blur the hidden editor */
  blur(): void;
  /** Check if focused */
  isFocused(): boolean;
  /** Dispatch a transaction */
  dispatch(tr: Transaction): void;
  /** Execute a ProseMirror command */
  executeCommand(command: Command): boolean;
  /** Undo */
  undo(): boolean;
  /** Redo */
  redo(): boolean;
  /** Check if undo is available */
  canUndo(): boolean;
  /** Check if redo is available */
  canRedo(): boolean;
  /** Set selection by PM position */
  setSelection(anchor: number, head?: number): void;
  /** Set node selection at a PM position (for images, etc.) */
  setNodeSelection(pos: number): void;
  /** Set cell selection between two positions inside table cells */
  setCellSelection(anchorCellPos: number, headCellPos: number): void;
  /** Scroll the PM view to selection (no-op since hidden) */
  scrollToSelection(): void;
}

// ============================================================================
// STYLES
// ============================================================================

/**
 * Hidden host styles - visually hidden but focusable
 */
const HIDDEN_HOST_STYLES: CSSProperties = {
  // Position off-screen but in document flow for accessibility
  position: 'fixed',
  left: '-9999px',
  top: '0',
  // Hide visually but keep focusable (NOT visibility:hidden!)
  opacity: 0,
  zIndex: -1,
  // Prevent interaction with visual layer
  pointerEvents: 'none',
  // Prevent text selection in hidden area
  userSelect: 'none',
  // Prevent scroll anchoring issues
  overflowAnchor: 'none',
  // Don't set aria-hidden - editor must remain accessible to screen readers
};

/**
 * Convert PM state to Document
 */
function stateToDocument(state: EditorState, originalDoc: Document | null): Document | null {
  if (!originalDoc) return null;

  // fromProseDoc preserves the base document structure when provided
  return fromProseDoc(state.doc, originalDoc);
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * HiddenProseMirror - Off-screen ProseMirror editor for keyboard input
 */
const HiddenProseMirrorComponent = forwardRef<HiddenProseMirrorRef, HiddenProseMirrorProps>(
  function HiddenProseMirror(props, ref) {
    const {
      document,
      widthPx = 612, // Default Letter width at 72dpi
      engine,
    } = props;

    // Refs
    const hostRef = useRef<HTMLDivElement>(null);
    const documentRef = useRef<Document | null>(document);

    // Keep document ref in sync (read by `getDocument` below)
    documentRef.current = document;

    // ========================================================================
    // EditorView Lifecycle (engine-owned; this component is a thin host)
    // ========================================================================

    // Mount/unmount — the engine builds the state, constructs the view via
    // the host, and fires `onBodyViewReady` (initial layout + autofocus)
    // synchronously inside `mountBodyView`, same point as before.
    useEffect(() => {
      if (!hostRef.current) return;
      engine.mountBodyView(hostRef.current, documentRef.current);
      // Cover the brief window before the engine-applied
      // `attributes.style` path applies (prosemirror#933).
      const pmRoot = engine.getBodyView()?.dom as HTMLElement | undefined;
      if (pmRoot) pmRoot.style.overflowAnchor = 'none';
      return () => engine.destroyBodyView();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only on mount/unmount

    // External document swaps (e.g. loading a new file) rebuild the state.
    // Same-identity updates (internal edits passed back through props) are
    // skipped inside the engine so IME/selection survive.
    useEffect(() => {
      engine.updateBodyViewForDocument(document);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [document]);

    // ========================================================================
    // Imperative Handle
    // ========================================================================

    useImperativeHandle(
      ref,
      () => ({
        getHostElement() {
          return hostRef.current;
        },

        getState() {
          return engine.getBodyView()?.state ?? null;
        },

        getView() {
          return engine.getBodyView() ?? null;
        },

        getDocument() {
          const view = engine.getBodyView();
          if (!view) return null;
          return stateToDocument(view.state, documentRef.current);
        },

        focus() {
          engine.getBodyView()?.focus();
        },

        blur() {
          const view = engine.getBodyView();
          if (view?.hasFocus()) {
            (view.dom as HTMLElement).blur();
          }
        },

        isFocused() {
          return engine.getBodyView()?.hasFocus() ?? false;
        },

        dispatch(tr: Transaction) {
          engine.getBodyView()?.dispatch(tr);
        },

        executeCommand(command: Command) {
          const view = engine.getBodyView();
          if (!view) return false;
          return command(view.state, view.dispatch, view);
        },

        undo() {
          const view = engine.getBodyView();
          if (!view) return false;
          return undo(view.state, view.dispatch);
        },

        redo() {
          const view = engine.getBodyView();
          if (!view) return false;
          return redo(view.state, view.dispatch);
        },

        canUndo() {
          const view = engine.getBodyView();
          if (!view) return false;
          return undo(view.state);
        },

        canRedo() {
          const view = engine.getBodyView();
          if (!view) return false;
          return redo(view.state);
        },

        setSelection(anchor: number, head?: number) {
          const view = engine.getBodyView();
          if (!view) return;
          const { state, dispatch } = view;
          const $anchor = state.doc.resolve(anchor);
          const $head = head !== undefined ? state.doc.resolve(head) : $anchor;
          const selection = TextSelection.between($anchor, $head);
          dispatch(state.tr.setSelection(selection));
        },

        setNodeSelection(pos: number) {
          const view = engine.getBodyView();
          if (!view) return;
          const { state, dispatch } = view;
          try {
            const selection = NodeSelection.create(state.doc, pos);
            dispatch(state.tr.setSelection(selection));
          } catch {
            // Fallback to text selection if NodeSelection fails
            this.setSelection(pos);
          }
        },

        setCellSelection(anchorCellPos: number, headCellPos: number) {
          const view = engine.getBodyView();
          if (!view) return;
          const { state, dispatch } = view;
          try {
            const cellSel = CellSelection.create(state.doc, anchorCellPos, headCellPos);
            dispatch(state.tr.setSelection(cellSel));
          } catch {
            // Fallback to text selection if positions aren't valid for CellSelection
            this.setSelection(anchorCellPos, headCellPos);
          }
        },

        scrollToSelection() {
          // No-op for hidden editor - visual scrolling handled by PagedEditor
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );

    // ========================================================================
    // Render
    // ========================================================================

    const host = (
      <div
        ref={hostRef}
        className="paged-editor__hidden-pm"
        style={{
          ...HIDDEN_HOST_STYLES,
          width: widthPx > 0 ? `${widthPx}px` : undefined,
        }}
        // DO NOT set aria-hidden - this editor provides semantic structure
      />
    );

    // Mount off-DOM from the paginated scroll container. Otherwise ProseMirror's
    // preserve-mode selection updates (storeScrollPos / resetScrollStack) walk
    // ancestors and can clobber the document scroller — e.g. ArrowLeft after
    // scrollToParaId. See prosemirror-view updateStateInner (scroll === "preserve").
    const browserDoc = globalThis.document;
    const portalTarget =
      browserDoc && 'body' in browserDoc && browserDoc.body != null ? browserDoc.body : null;
    return portalTarget ? createPortal(host, portalTarget) : host;
  }
);

export const HiddenProseMirror = memo(HiddenProseMirrorComponent);

export default HiddenProseMirror;
