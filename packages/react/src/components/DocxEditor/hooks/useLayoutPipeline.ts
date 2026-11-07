/**
 * Layout pipeline hook for PagedEditor.
 *
 * Thin React wrapper around `DocxEditorEngine` (issue #696 Tier 2): the
 * engine owns compute + paint + scroll-restore orchestration, this hook
 * supplies the host (React state setters, refs, DOM targets) and keeps
 * the React-owned pieces — useState/refs, the post-commit scroll-restore
 * `useLayoutEffect`, the `painter:painted` listener contract, and the
 * rAF-coalesced scheduler.
 *
 * Timing rule: output hooks fire inside `engine.run`, but scroll-restore
 * is deferred — the engine keeps its pending copy and this hook's
 * post-commit effect consumes it via `consumePendingScrollRestore`, so
 * restoration lands at the same lifecycle point it always has.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EditorState } from 'prosemirror-state';

import type { FlowBlock, Layout, Measure } from '@xcrong/docx-editor-core/layout-engine';
import type { Node as PMNode } from 'prosemirror-model';
import {
  DocxEditorEngine,
  applyScrollRestore,
  createLayoutScheduler,
  resolveLayoutGeometry,
  type EngineHost,
  type LayoutScheduler,
} from '@xcrong/docx-editor-core/editor';
import { findVerticalScrollParentOrRoot } from '@xcrong/docx-editor-core/utils/findVerticalScrollParent';
import type {
  Document,
  HeaderFooter,
  SectionProperties,
  StyleDefinitions,
  Theme,
} from '@xcrong/docx-editor-core/types/document';

import type { HiddenProseMirrorRef } from '../HiddenProseMirror';
import type { LayoutSelectionGate } from '../internals/LayoutSelectionGate';
import { computeAnchorPositions } from '../internals/sidebarAnchorPositions';
import { measureBlocks } from '../internals/measureBlock';
import { createRenderedDomContext } from '../../../plugin-api/RenderedDomContext';
import type { RenderedDomContext } from '../../../plugin-api/types';
import { viewportMinHeightPx } from '../internals/scrollUtils';

export interface UseLayoutPipelineOptions {
  document: Document | null;
  styles?: StyleDefinitions | null;
  theme?: Theme | null;
  sectionProperties?: SectionProperties | null;
  finalSectionProperties?: SectionProperties | null;
  headerContent?: HeaderFooter | null;
  footerContent?: HeaderFooter | null;
  firstPageHeaderContent?: HeaderFooter | null;
  firstPageFooterContent?: HeaderFooter | null;
  /**
   * Resolve the current PM document for an HF instance, when a persistent
   * hidden PM EditorView exists for it. Phase 1 of the HF unification
   * (openspec/changes/unify-hf-editing/) — the painter prefers the PM
   * doc over re-parsing `HeaderFooter.content` so future phases that
   * dispatch edits into the PM are picked up automatically. Returns null
   * for HF instances without a mounted PM (boot, or rId not yet projected).
   */
  getHfPmDoc?: (hf: HeaderFooter) => PMNode | null;
  pageGap: number;
  zoom: number;
  resolvedCommentIds?: Set<number>;
  pagesContainerRef: React.RefObject<HTMLDivElement | null>;
  viewportLayoutRef: React.RefObject<HTMLDivElement | null>;
  hiddenPMRef: React.RefObject<HiddenProseMirrorRef | null>;
  syncCoordinator: LayoutSelectionGate;
  getScrollContainer: () => HTMLDivElement | null;
  onTotalPagesChange?: (totalPages: number) => void;
  onAnchorPositionsChange?: (positions: Map<string, number>) => void;
  onRenderedDomContextReady?: (context: RenderedDomContext) => void;
}

export interface UseLayoutPipelineReturn {
  layout: Layout | null;
  blocks: FlowBlock[];
  measures: Measure[];
  decorationSyncToken: number;
  notifyDecorationLayer: () => void;
  contentWidth: number;
  runLayoutPipeline: (state: EditorState) => void;
  scheduleLayout: (state: EditorState) => void;
}

export function useLayoutPipeline(opts: UseLayoutPipelineOptions): UseLayoutPipelineReturn {
  const {
    document,
    styles,
    theme,
    sectionProperties,
    finalSectionProperties,
    headerContent,
    footerContent,
    firstPageHeaderContent,
    firstPageFooterContent,
    getHfPmDoc,
    pageGap,
    zoom,
    resolvedCommentIds,
    pagesContainerRef,
    viewportLayoutRef,
    hiddenPMRef,
    syncCoordinator,
    getScrollContainer,
    onTotalPagesChange,
    onAnchorPositionsChange,
    onRenderedDomContextReady,
  } = opts;

  const [layout, setLayout] = useState<Layout | null>(null);
  const [blocks, setBlocks] = useState<FlowBlock[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  // Monotonic token bumped on every PM transaction (doc, selection,
  // meta-only). Drives the DecorationLayer's resync so plugins like
  // yCursorPlugin (which update decorations on awareness pings — non-doc
  // transactions) propagate. Only `notifyDecorationLayer` writes to it.
  const [decorationSyncToken, setDecorationSyncToken] = useState(0);
  const notifyDecorationLayer = useCallback(() => setDecorationSyncToken((v) => v + 1), []);

  // Callback refs — parent may hand in a fresh closure every render.
  // Reading through refs keeps the engine host stable; otherwise every
  // parent re-render would rebuild the host.
  const onTotalPagesChangeRef = useRef(onTotalPagesChange);
  const onAnchorPositionsChangeRef = useRef(onAnchorPositionsChange);
  const onRenderedDomContextReadyRef = useRef(onRenderedDomContextReady);
  const getHfPmDocRef = useRef(getHfPmDoc);
  onTotalPagesChangeRef.current = onTotalPagesChange;
  onAnchorPositionsChangeRef.current = onAnchorPositionsChange;
  onRenderedDomContextReadyRef.current = onRenderedDomContextReady;
  getHfPmDocRef.current = getHfPmDoc;

  // Total-pages notifier — fires only when count changes (including N → 0).
  // Deliberately post-commit (not the engine's `onTotalPages` hook) so the
  // callback fires at the same lifecycle point it always has.
  const lastTotalPagesRef = useRef<number>(0);
  useEffect(() => {
    const total = layout?.pages.length ?? 0;
    if (total === lastTotalPagesRef.current) return;
    lastTotalPagesRef.current = total;
    onTotalPagesChangeRef.current?.(total);
  }, [layout]);

  // Page geometry comes from the same core helper the engine uses, so the
  // render-phase `contentWidth` (hidden-editor width) cannot drift from
  // the geometry the engine derives per run.
  const { contentWidth } = useMemo(
    () => resolveLayoutGeometry(sectionProperties, finalSectionProperties),
    [sectionProperties, finalSectionProperties]
  );

  // Latest-input snapshot the stable engine host reads through. Refreshed
  // every render so `engine.run` always sees current props without the
  // host (or `runLayoutPipeline`) changing identity.
  const hostInputsRef = useRef({
    document,
    styles,
    theme,
    sectionProperties,
    finalSectionProperties,
    headerContent,
    footerContent,
    firstPageHeaderContent,
    firstPageFooterContent,
    pageGap,
    zoom,
    resolvedCommentIds,
    syncCoordinator,
    getScrollContainer,
  });
  hostInputsRef.current = {
    document,
    styles,
    theme,
    sectionProperties,
    finalSectionProperties,
    headerContent,
    footerContent,
    firstPageHeaderContent,
    firstPageFooterContent,
    pageGap,
    zoom,
    resolvedCommentIds,
    syncCoordinator,
    getScrollContainer,
  };

  const engineRef = useRef<DocxEditorEngine | null>(null);
  if (!engineRef.current) {
    const host: EngineHost = {
      getDocument: () => hostInputsRef.current.document,
      getStyles: () => hostInputsRef.current.styles,
      getTheme: () => hostInputsRef.current.theme,
      getSectionProperties: () => hostInputsRef.current.sectionProperties,
      getFinalSectionProperties: () => hostInputsRef.current.finalSectionProperties,
      getHeaderFooter: () => ({
        header: hostInputsRef.current.headerContent,
        footer: hostInputsRef.current.footerContent,
        firstHeader: hostInputsRef.current.firstPageHeaderContent,
        firstFooter: hostInputsRef.current.firstPageFooterContent,
      }),
      getPageGap: () => hostInputsRef.current.pageGap,
      getResolvedCommentIds: () => hostInputsRef.current.resolvedCommentIds,
      getHfPmDoc: (hf) => getHfPmDocRef.current?.(hf) ?? null,
      measureBlocks,
      getSyncCoordinator: () => hostInputsRef.current.syncCoordinator,
      getPagesContainer: () => pagesContainerRef.current,
      getScrollContainer: () => hostInputsRef.current.getScrollContainer(),
      onLayout: (newLayout, newBlocks, newMeasures) => {
        setBlocks(newBlocks);
        setMeasures(newMeasures);
        setLayout(newLayout);
      },
      onPaintContainer: (newLayout) => {
        const vp = viewportLayoutRef.current;
        if (vp) {
          const mh = viewportMinHeightPx(newLayout, hostInputsRef.current.pageGap);
          vp.style.minHeight = `${mh}px`;
          const currentZoom = hostInputsRef.current.zoom;
          if (currentZoom !== 1) {
            vp.style.marginBottom = `${mh * (currentZoom - 1)}px`;
          } else {
            vp.style.marginBottom = '';
          }
        }
      },
      // Deferred: the post-commit `useLayoutEffect` below consumes the
      // engine's pending copy (same lifecycle point as before).
      onPainted: () => {
        if (onRenderedDomContextReadyRef.current && pagesContainerRef.current) {
          const domContext = createRenderedDomContext(
            pagesContainerRef.current,
            hostInputsRef.current.zoom
          );
          onRenderedDomContextReadyRef.current(domContext);
        }
      },
      computeAnchorPositions: (newLayout, newBlocks, newMeasures) => {
        const positions = computeAnchorPositions(
          hiddenPMRef.current?.getView() ?? null,
          newLayout,
          newBlocks,
          newMeasures,
          hostInputsRef.current.pageGap
        );

        const pagesEl = pagesContainerRef.current;
        if (pagesEl) {
          const hfContainers = pagesEl.querySelectorAll(
            '.layout-page-header, .layout-page-footer'
          );
          if (hfContainers.length > 0) {
            const pagesElRect = pagesEl.getBoundingClientRect();
            const currentZoom = hostInputsRef.current.zoom || 1;
            for (let i = 0; i < hfContainers.length; i++) {
              const hf = hfContainers[i] as HTMLElement;
              // Query insertions
              const insertions = hf.querySelectorAll('.docx-insertion[data-revision-id]');
              for (let j = 0; j < insertions.length; j++) {
                const el = insertions[j] as HTMLElement;
                const rId = el.getAttribute('data-revision-id');
                if (rId && !positions.has(`revision-${rId}`)) {
                  const rect = el.getBoundingClientRect();
                  const y = (rect.top - pagesElRect.top + pagesEl.scrollTop) / currentZoom;
                  positions.set(`revision-${rId}`, y);
                }
              }
              // Query deletions
              const deletions = hf.querySelectorAll('.docx-deletion[data-revision-id]');
              for (let j = 0; j < deletions.length; j++) {
                const el = deletions[j] as HTMLElement;
                const rId = el.getAttribute('data-revision-id');
                if (rId && !positions.has(`revision-${rId}`)) {
                  const rect = el.getBoundingClientRect();
                  const y = (rect.top - pagesElRect.top + pagesEl.scrollTop) / currentZoom;
                  positions.set(`revision-${rId}`, y);
                }
              }
              // Query comments
              const comments = hf.querySelectorAll('[data-comment-id]');
              for (let j = 0; j < comments.length; j++) {
                const el = comments[j] as HTMLElement;
                const commentId = el.getAttribute('data-comment-id');
                if (commentId && !positions.has(`comment-${commentId}`)) {
                  const rect = el.getBoundingClientRect();
                  const y = (rect.top - pagesElRect.top + pagesEl.scrollTop) / currentZoom;
                  positions.set(`comment-${commentId}`, y);
                }
              }
              // Query structural revisions
              const structural = hf.querySelectorAll(
                '.ep-revision-table[data-revision-id], ' +
                  '.ep-revision-row[data-revision-id], ' +
                  '.ep-revision-cell[data-revision-id], ' +
                  '.layout-revision-pmark[data-revision-id]'
              );
              for (let j = 0; j < structural.length; j++) {
                const el = structural[j] as HTMLElement;
                const rId = el.getAttribute('data-revision-id');
                if (rId && !positions.has(`revision-${rId}`)) {
                  const rect = el.getBoundingClientRect();
                  const y = (rect.top - pagesElRect.top + pagesEl.scrollTop) / currentZoom;
                  positions.set(`revision-${rId}`, y);
                }
              }
            }
          }
        }

        return positions;
      },
      onAnchorPositions: (positions) => {
        onAnchorPositionsChangeRef.current?.(positions);
      },
      onError: (error) => {
        console.error('[PagedEditor] Layout pipeline error:', error);
      },
      scheduleFrame: (cb) => requestAnimationFrame(cb),
    };
    engineRef.current = new DocxEditorEngine(host);
  }

  const runLayoutPipeline = useCallback((state: EditorState) => {
    engineRef.current!.run(state);
  }, []);

  // After `setLayout`, React still commits `totalHeight` / margin on the viewport wrapper.
  // Restoring scroll here (plus one rAF) matches the committed DOM scrollHeight.
  useLayoutEffect(() => {
    const pending = engineRef.current!.consumePendingScrollRestore();
    if (!pending) return;

    const pagesEl = pagesContainerRef.current;
    const scrollParent =
      getScrollContainer() ?? (pagesEl ? findVerticalScrollParentOrRoot(pagesEl) : null);
    if (!pagesEl || !scrollParent?.isConnected) return;

    applyScrollRestore(pending, pagesEl, scrollParent);
    const rafId = requestAnimationFrame(() => {
      // scrollParent may be detached after unmount or another layout commit.
      if (!scrollParent.isConnected) return;
      applyScrollRestore(pending, pagesEl, scrollParent);
    });
    return () => cancelAnimationFrame(rafId);
  }, [layout, getScrollContainer, pagesContainerRef]);

  // =========================================================================
  // Coalesced Layout (rAF throttle)
  // =========================================================================

  /**
   * Multiple rapid transactions (e.g. typing "hello") within the same frame
   * are coalesced so only the final state triggers a full layout pass. The
   * coalescer lives in core (`createLayoutScheduler`) so React and Vue share
   * it; the `runRef` indirection lets the stable scheduler always call the
   * latest `runLayoutPipeline` without recreating itself.
   */
  const runRef = useRef(runLayoutPipeline);
  runRef.current = runLayoutPipeline;
  const schedulerRef = useRef<LayoutScheduler | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = createLayoutScheduler((state) => runRef.current(state));
  }

  const scheduleLayout = useCallback((state: EditorState) => {
    schedulerRef.current!.schedule(state);
  }, []);

  // Clean up pending rAF on unmount
  useEffect(() => {
    const scheduler = schedulerRef.current;
    return () => scheduler?.cancel();
  }, []);

  return {
    layout,
    blocks,
    measures,
    decorationSyncToken,
    notifyDecorationLayer,
    contentWidth,
    runLayoutPipeline,
    scheduleLayout,
  };
}
