/**
 * HiddenHeaderFooterPMs — persistent off-screen ProseMirror EditorViews for
 * every distinct header/footer part in the loaded document.
 *
 * Phase 1 of the HF editing unification (see
 * `openspec/changes/unify-hf-editing/`). The unification deletes the visible
 * inline overlay's PM and routes HF editing through the body's hidden-PM +
 * visible-painter model. This component is the first step: one hidden
 * `EditorView` per distinct HF `rId` from `Document.package.headers` and
 * `.footers`, mounted off-screen, always alive.
 *
 * Slot keying is by `rId`, NOT by `(hdrFtrType, kind)` — two sections that
 * share a header by referencing the same `rId` (the ECMA-376 §17.10.1
 * sharing-by-reference pattern) share one EditorView. The set is enumerated
 * as `Document.package.headers ∪ Document.package.footers` — every entry in
 * those two `Map<string, HeaderFooter>` maps gets one EditorView.
 *
 * In phase 1 these EditorViews carry no user input; the inline overlay still
 * owns editing. They exist so the painter pipeline can read from
 * `view.state.doc` (via `convertHeaderFooterPmDocToContent`) and stay in
 * lockstep with the future single source of truth. Subsequent phases move
 * click routing, selection drawing, and finally focus into these views.
 */

import { useRef, useEffect, useImperativeHandle, forwardRef, memo, useMemo } from 'react';
import type { EditorView } from 'prosemirror-view';
import { setSuggestionMode } from '@xcrong/docx-editor-core/prosemirror/plugins';
import { enumerateHfSlots, type DocxEditorEngine } from '@xcrong/docx-editor-core/editor';
import type { Document } from '@xcrong/docx-editor-core/types/document';

import 'prosemirror-view/style/prosemirror.css';

export interface HiddenHeaderFooterPMsRef {
  /**
   * Look up the persistent EditorView for a given HF part. Returns `null`
   * before mount or when the rId is not present in the loaded document.
   */
  getView(rId: string): EditorView | null;
  /** Get all active EditorViews mapped by rId. */
  getViews(): Map<string, EditorView>;
}

export interface HiddenHeaderFooterPMsProps {
  /** The loaded document — its `package.headers` / `package.footers` drives slot enumeration. */
  document: Document | null;
  /** The engine that owns the per-rId EditorView lifecycle. */
  engine: DocxEditorEngine;
  /** Shared off-screen host element owning all HF mount nodes. */
  hostRef: React.RefObject<HTMLDivElement | null>;
  /** Suggestion mode active state (synced onto mounted views). */
  isSuggesting?: boolean;
  /** Active author for suggestion mode. */
  author?: string;
}

export const HiddenHeaderFooterPMs = memo(
  forwardRef<HiddenHeaderFooterPMsRef, HiddenHeaderFooterPMsProps>(function HiddenHeaderFooterPMs(
    { document, engine, hostRef, isSuggesting = false, author = 'User' },
    ref
  ) {
    // Latest document for the sync effect below. The effect only re-runs
    // when the slot set changes; the ref keeps HF resolution pointed at
    // the current package without re-running per body transaction.
    const documentRef = useRef(document);
    documentRef.current = document;

    // Sync suggestion mode onto the mounted views (mirrors the body
    // `setSuggestionMode` wiring in DocxEditor).
    useEffect(() => {
      for (const view of engine.getHfViews().values()) {
        setSuggestionMode(isSuggesting, view.state, view.dispatch, author);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSuggesting, author]);

    // Enumerate target slots from the current document. Memoize on identity
    // of the headers/footers Maps so we don't churn the EditorViews when
    // unrelated parts of `document` change.
    const slots = useMemo(
      () => enumerateHfSlots(document),
      // Re-enumerate when the Maps themselves are swapped. Mutations to the
      // existing Map (inline editor save mutates in place today) won't
      // trigger this; the save path dispatches transactions on the
      // persistent PM instead.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [document?.package?.headers, document?.package?.footers]
    );

    // Mount / teardown is engine-owned; the trigger stays adapter-side.
    // Note: `document` intentionally excluded from deps — depending on it
    // directly re-runs on every body PM transaction (each returns a new
    // identity), which destroys IME state and selection.
    useEffect(() => {
      engine.syncHfViews(documentRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slots]);

    // Tear everything down on unmount.
    useEffect(() => {
      return () => engine.destroyHfViews();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getView(rId: string): EditorView | null {
          return engine.getHfView(rId);
        },
        getViews(): Map<string, EditorView> {
          return engine.getHfViews();
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );

    // Off-screen host — positioned the same way `HiddenProseMirror` is, so
    // the EditorViews retain focusability and keyboard routing while being
    // visually absent. NOT `aria-hidden` (the body PM also avoids it) —
    // the editor remains in the accessibility tree, and screen readers /
    // focus management treat it as a real input. `pointer-events: none`
    // blocks mouse but does not block programmatic `view.focus()`.
    return (
      <div
        ref={hostRef}
        style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          opacity: 0,
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />
    );
  })
);

HiddenHeaderFooterPMs.displayName = 'HiddenHeaderFooterPMs';
