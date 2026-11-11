/**
 * `DocxEditorEngine` — the shared stateful-orchestration spine for the
 * React and Vue adapters (issue #696 Tier 2).
 *
 * The engine owns the editing hot loop — layout compute + DOM paint +
 * scroll-restore — behind a dependency-injected {@link EngineHost}. The
 * host supplies framework-specific inputs (document, styles, DOM targets)
 * and implements the output hooks it cares about; anything it leaves
 * undefined is skipped. Adapters stay thin wrappers: they construct the
 * engine, forward `run(state)`, and implement hooks at the same lifecycle
 * points they use today.
 *
 * Timing rule (eng-review decision 4a): the engine emits via host hooks
 * but never dictates *when* the adapter acts. React defers scroll-restore
 * to its existing post-commit `useLayoutEffect` (by returning `false`
 * from `onScrollRestore`); Vue applies synchronously. Any timing drift is
 * a bug, not an acceptable delta.
 *
 * Grows per step: step 1 lands `run` (layout pipeline); the scheduler,
 * transaction loop, view lifecycle, and session seam follow.
 */

import type { EditorState, Plugin, Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

import type {
  BlockLookup,
  FootnoteRenderItem,
  RenderPageOptions,
  RenderPagesUpdateKind,
} from '../layout-painter';
import { buildBlockLookup, renderPages } from '../layout-painter';
import type { FloatPageGeometry } from '../layout-bridge';
import { findVerticalScrollParentOrRoot } from '../utils/findVerticalScrollParent';
import type { LayoutSelectionGate } from '../prosemirror/utils/LayoutSelectionGate';
import type {
  Document,
  HeaderFooter,
  SectionProperties,
  StyleDefinitions,
  Theme,
} from '../types/document';
import type { FlowBlock, Layout, Measure } from '../layout-engine';

import { computeLayout, type LayoutComputation } from './computeLayout';
import { resolveLayoutGeometry } from './geometry';
import {
  buildPendingScrollRestore,
  captureScrollAnchor,
  reclampIncrementalSnapshot,
  type PendingScrollRestore,
} from './scrollRestore';
import { createLayoutScheduler, type LayoutScheduler } from './layoutScheduler';
import { stripScrollFlag } from './scrollFlag';
import {
  createBodyEditorState,
  createHfEditorState,
  createHfExtensionManager,
  enumerateHfSlots,
  getDocumentId,
  type HfPartKind,
} from './viewLifecycle';
import type { ExtensionManager } from '../prosemirror/extensions';
import { parseDocx } from '../docx/parser';
import type { DocxInput } from '../utils/docxInput';
import type { DocumentAgent } from '../agent';
import type { Comment } from '../types/content';
import { fromProseDoc } from '../prosemirror/conversion/fromProseDoc';
import { injectReplyRangeMarkers, injectTCReplyRangeMarkers } from '../docx';
import { clearTrackedChanges } from '../prosemirror/extensions';
import { LoadGeneration, decideSelectiveSave } from './session';

export type { LayoutComputation, PendingScrollRestore };
export type { HfPartKind };

/** Resolved header/footer content for the active section (adapter-resolved). */
export interface EngineHeaderFooter {
  header: HeaderFooter | null | undefined;
  footer: HeaderFooter | null | undefined;
  firstHeader: HeaderFooter | null | undefined;
  firstFooter: HeaderFooter | null | undefined;
}

/** Payload for {@link EngineHost.onPainted}. */
export interface EnginePaintedInfo {
  layout: Layout;
  renderKind: RenderPagesUpdateKind;
  state: EditorState;
}

/**
 * Framework seam for {@link DocxEditorEngine}. Only the layout subset is
 * consumed in step 1; the contract grows per step (view factories in step 4,
 * session hooks in step 5) rather than locking a speculative shape up front.
 */
export interface EngineHost {
  // -- inputs ------------------------------------------------------------
  /** The loaded document model, or null before load. */
  getDocument(): Document | null;
  getStyles(): StyleDefinitions | null | undefined;
  getTheme(): Theme | null | undefined;
  /** Initial section's properties (body pages). */
  getSectionProperties(): SectionProperties | null | undefined;
  /** Trailing section's properties (may be null for single-section docs). */
  getFinalSectionProperties(): SectionProperties | null | undefined;
  /** Adapter-resolved HF content for the active section. */
  getHeaderFooter(): EngineHeaderFooter;
  getPageGap(): number;
  getResolvedCommentIds(): Set<number> | undefined;
  /** The persistent hidden PM doc for an HF, or null when unmounted. */
  getHfPmDoc(hf: HeaderFooter): PMNode | null | undefined;
  /** Adapter block measurer (React's is caching). */
  measureBlocks(
    blocks: FlowBlock[],
    contentWidth: number | number[],
    pageGeometry?: FloatPageGeometry
  ): Measure[];
  /** Layout/selection gate both adapters share; undefined in headless use. */
  getSyncCoordinator(): LayoutSelectionGate | undefined;
  /** Visible pages target; null skips paint but still computes + emits. */
  getPagesContainer(): HTMLElement | null;
  /** Outer scroller; null falls back to the nearest scrolling ancestor. */
  getScrollContainer(): HTMLElement | null;

  // -- outputs -----------------------------------------------------------
  /**
   * Fired synchronously after compute (same point both adapters call
   * setState today). `lookup` is the block lookup the engine painted
   * with — reuse it for click routing instead of rebuilding.
   */
  onLayout(layout: Layout, blocks: FlowBlock[], measures: Measure[], lookup: BlockLookup): void;
  /**
   * Adapter DOM chrome applied between `renderPages` and scroll-restore
   * bookkeeping (React sizes its viewport wrapper here; Vue styles its
   * scroll container). Runs before the pending-restore snapshot so the
   * scroll math sees the same DOM both adapters paint today.
   */
  onPaintContainer?(layout: Layout): void;
  /**
   * Fired with the pending scroll-restore right after it is built
   * (the point React stored it in its ref). Return `true` when the
   * adapter applied it synchronously (Vue) so the engine drops its copy;
   * return `false`/undefined to defer application (React's post-commit
   * effect consumes it via `consumePendingScrollRestore`).
   */
  onScrollRestore?(pending: PendingScrollRestore): boolean | void;
  /** Fired after paint (+ `painter:painted` dispatch). */
  onPainted?(info: EnginePaintedInfo): void;
  /** Adapter-supplied anchor computation; its result is emitted via `onAnchorPositions`. */
  computeAnchorPositions?(
    layout: Layout,
    blocks: FlowBlock[],
    measures: Measure[]
  ): Map<string, number> | undefined;
  onAnchorPositions?(positions: Map<string, number>): void;
  /**
   * Reserved: total-page notification. React deliberately keeps its
   * post-commit effect (firing synchronously here would change timing),
   * so both adapters leave this undefined for now.
   */
  onTotalPages?(total: number): void;
  onError?(error: unknown): void;
  // -- transaction loop (step 3) ---------------------------------------
  /**
   * Decoration resync on every PM transaction (doc, selection, meta-only).
   * React bumps its decoration token here; Vue has no equivalent.
   */
  onDecorationsChanged?(): void;
  /**
   * Fired for doc-changing body transactions, after the layout is
   * scheduled. React reads the writeback document off its hidden view;
   * Vue writes its document model back and notifies its host.
   */
  onDocumentChanged?(newState: EditorState): void;
  /**
   * Fired for selection-only body transactions (no relayout). React
   * refreshes its selection overlay; Vue re-applies content-control focus.
   */
  onSelectionTransaction?(newState: EditorState): void;
  /**
   * Fired after every body transaction, once the layout is scheduled and
   * the render requested (React leaves this undefined — its overlay syncs
   * through the separate selection-change path; Vue notifies its selection
   * listener here).
   */
  onSelectionChanged?(newState: EditorState): void;
  /** Current body EditorState, for scheduling a relayout after HF edits. */
  getBodyState?(): EditorState | null;
  /**
   * Persist an HF EditorView's doc back into the document package on
   * doc-changing HF transactions (React keeps its own writeback; Vue
   * implements this hook).
   */
  onHfDocumentChanged?(rId: string, state: EditorState): void;
  /** Fired after every HF transaction (caret overlays, toolbar sync). */
  onHfTransaction?(rId: string, view: EditorView, docChanged: boolean): void;

  // -- view lifecycle (step 4) -----------------------------------------
  /**
   * Framework-specific EditorView construction; the engine owns the
   * lifecycle (when to mount/teardown) and the dispatch routing.
   * `dispatch` carries the constructing view for transactions fired
   * during construction (plugins that dispatch in their `view()` hook).
   * `kind` lets the host apply body-only chrome (editable, key handlers).
   */
  mountView(
    hostEl: HTMLElement,
    state: EditorState,
    dispatch: (tr: Transaction, view?: EditorView) => void,
    kind: 'body' | 'hf'
  ): EditorView;
  destroyView(view: EditorView): void;
  /** Off-screen container owning all HF mount nodes; null skips HF sync. */
  getHfHostEl(): HTMLElement | null;
  /** Body state knobs (React prop manager / Vue singleton; prefix plugins). */
  getBodyExtensionManager?(): ExtensionManager | undefined;
  getBodyPrefixPlugins?(): Plugin[];
  isReadOnly?(): boolean;
  onBodyKeyDown?(view: EditorView, event: KeyboardEvent): boolean;
  /**
   * Fired with every post-apply body state. `tr` is null for external
   * document swaps (no transaction). React gates selection-only inside;
   * Vue stores the state.
   */
  onBodyState?(newState: EditorState, tr: Transaction | null): void;
  onBodyViewReady?(view: EditorView): void;
  onBodyViewDestroy?(): void;
  /** HF knobs (React props; Vue editorMode/author). */
  getSuggestionState?(): { active: boolean; author: string };

  // -- session seam (step 5) -------------------------------------------
  /** The live agent wrapping the loaded document; null before load. */
  getAgent?(): DocumentAgent | null;
  /**
   * Adapter-owned comment list (React state / Vue provider). Falls back
   * to the agent document's model comments when undefined.
   */
  getComments?(): Comment[];

  // -- scheduler seam (consumed by `scheduleLayout` from step 2 on) -----
  scheduleFrame(cb: () => void): number;
  cancelFrame?(handle: number): void;
}

export class DocxEditorEngine {
  private pendingScrollRestore: PendingScrollRestore | null = null;
  private pendingIncrementalScrollSnapshotWrittenAt = 0;
  private layoutScheduler: LayoutScheduler | null = null;
  // -- view lifecycle (step 4): the persistent body view + per-rId HF map.
  private bodyView: EditorView | null = null;
  private bodyDocumentId: string | null = null;
  private bodyViewInitialized = false;
  private hfViews = new Map<
    string,
    { view: EditorView; manager: ExtensionManager; kind: HfPartKind; mountNode: HTMLElement }
  >();

  constructor(private readonly host: EngineHost) {}

  /**
   * Coalesced layout: rapid bursts (keystrokes) collapse to one `run` per
   * frame with the latest state. Owns the core coalescer both adapters
   * used to hold separately; the frame source is the host's
   * `scheduleFrame`/`cancelFrame` so headless hosts stay synchronous.
   */
  scheduleLayout(state: EditorState): void {
    if (!this.layoutScheduler) {
      const host = this.host;
      this.layoutScheduler = createLayoutScheduler(
        (s) => {
          this.run(s);
        },
        (cb) => host.scheduleFrame(cb),
        (handle) => {
          if (host.cancelFrame) host.cancelFrame(handle);
          else cancelAnimationFrame(handle);
        }
      );
    }
    this.layoutScheduler.schedule(state);
  }

  /** Drop a pending coalesced frame (view teardown / document reload). */
  cancelScheduledLayout(): void {
    this.layoutScheduler?.cancel();
  }

  /**
   * Body transaction → repaint loop (step 3, lifted from React's
   * `PagedEditor.handleTransaction`). Decoration-notify on every
   * transaction; doc changes bump the state seq, schedule a coalesced
   * layout, and notify the document listener; selection-only updates
   * refresh the overlay without laying out. Scroll-flag stripping runs
   * in the engine-owned `dispatchBodyTransaction` pre-apply.
   */
  handleTransaction(tr: Transaction, newState: EditorState): void {
    this.host.onDecorationsChanged?.();

    const gate = this.host.getSyncCoordinator();
    if (tr.docChanged) {
      gate?.incrementStateSeq();
      this.scheduleLayout(newState);
      this.host.onDocumentChanged?.(newState);
    }

    gate?.requestRender();
    this.host.onSelectionChanged?.(newState);

    if (!tr.docChanged) {
      this.host.onSelectionTransaction?.(newState);
    }
  }

  /**
   * HF transaction → writeback + body schedule + notify (step 3, shared
   * by React's `HiddenHeaderFooterPMs` and Vue's `syncHfPMs` dispatches).
   * Only doc changes schedule the body pass; selection-only moves just
   * notify. The caller applies the transaction first; the post-apply
   * `view.state` is read here.
   */
  handleHfTransaction(rId: string, view: EditorView, docChanged: boolean): void {
    if (docChanged) {
      this.host.onHfDocumentChanged?.(rId, view.state);
      const bodyState = this.host.getBodyState?.();
      if (bodyState) this.scheduleLayout(bodyState);
    }
    this.host.onHfTransaction?.(rId, view, docChanged);
  }
  /**
   * Build + mount the body view for `document` (step 4, lifted from
   * React's `HiddenProseMirror.createView`). Owns the dispatch: strips
   * the PM scroll flag pre-apply (the paginated layer owns scroll),
   * applies, notifies `onBodyState`, then runs the transaction loop.
   * Stores + returns the view.
   */
  mountBodyView(hostEl: HTMLElement, document: Document | null): EditorView {
    const state = createBodyEditorState({
      document,
      styles: this.host.getStyles(),
      manager: this.host.getBodyExtensionManager?.(),
      prefixPlugins: this.host.getBodyPrefixPlugins?.() ?? [],
    });
    const view = this.host.mountView(
      hostEl,
      state,
      (tr, v) => this.dispatchBodyTransaction(tr, v),
      'body'
    );
    this.bodyView = view;
    this.bodyViewInitialized = true;
    this.bodyDocumentId = getDocumentId(document);
    this.host.onBodyViewReady?.(view);
    return view;
  }

  private dispatchBodyTransaction(tr: Transaction, view?: EditorView): void {
    const target = view ?? this.bodyView;
    if (!target) return;
    stripScrollFlag(tr, target.state.tr);
    const newState = target.state.apply(tr);
    target.updateState(newState);
    this.host.onBodyState?.(newState, tr);
    this.handleTransaction(tr, newState);
  }

  /**
   * External-document swap path (file load; lifted from React's
   * document-change effect). Skips same-identity updates so internal
   * edits passed back through props never reset IME/selection.
   */
  updateBodyViewForDocument(document: Document | null): void {
    if (!this.bodyView) return;
    const id = getDocumentId(document);
    if (this.bodyViewInitialized && id === this.bodyDocumentId) return;
    this.bodyViewInitialized = true;
    this.bodyDocumentId = id;
    const newState = createBodyEditorState({
      document,
      styles: this.host.getStyles(),
      manager: this.host.getBodyExtensionManager?.(),
      prefixPlugins: this.host.getBodyPrefixPlugins?.() ?? [],
    });
    this.bodyView.updateState(newState);
    this.host.onBodyState?.(newState, null);
  }

  /** Tear down the body view (drops any pending coalesced frame too). */
  destroyBodyView(): void {
    this.cancelScheduledLayout();
    if (this.bodyView) {
      this.host.onBodyViewDestroy?.();
      this.host.destroyView(this.bodyView);
      this.bodyView = null;
    }
    this.bodyViewInitialized = false;
    this.bodyDocumentId = null;
  }

  getBodyView(): EditorView | null {
    return this.bodyView;
  }

  /**
   * Diff-mount/teardown the per-rId HF views for `document` (step 4,
   * lifted from React's `HiddenHeaderFooterPMs` slot effect). Each rId
   * gets its own `ExtensionManager`; writeback rides through the
   * existing `onHfDocumentChanged` hook and the body schedule through
   * `handleHfTransaction`. The trigger stays adapter-side.
   */
  syncHfViews(document: Document | null): void {
    const hostEl = this.host.getHfHostEl();
    if (!hostEl) return;
    const slots = enumerateHfSlots(document);
    const want = new Map(slots.map((s) => [s.rId, s]));

    // Tear down any rIds no longer present.
    for (const [rId, mounted] of this.hfViews) {
      if (!want.has(rId)) {
        this.host.destroyView(mounted.view);
        mounted.mountNode.remove();
        mounted.manager.destroy();
        this.hfViews.delete(rId);
      }
    }

    if (!document?.package) return;
    const pkg = document.package;
    // Host getters first (React `styles`/`theme` props may override the
    // package values), package second — same precedence as today.
    const styles = this.host.getStyles() ?? pkg.styles ?? null;
    const theme = this.host.getTheme() ?? pkg.theme ?? null;
    const defaultTabStopTwips = pkg.settings?.defaultTabStop ?? null;
    const defaultTableStyleId = pkg.settings?.defaultTableStyle ?? null;
    const sugg = this.host.getSuggestionState?.() ?? { active: false, author: 'User' };

    // Bring up any rIds we don't yet have.
    for (const slot of slots) {
      if (this.hfViews.has(slot.rId)) continue;
      const hf = pkg.headers?.get(slot.rId) ?? pkg.footers?.get(slot.rId);
      if (!hf) continue;

      const manager = createHfExtensionManager();
      // `document` in this scope is the DOCX model, not the DOM document —
      // create the mount node via the host's owner document.
      const node = hostEl.ownerDocument.createElement('div');
      node.dataset.hfRId = slot.rId;
      node.dataset.hfKind = slot.kind;
      hostEl.appendChild(node);

      const state = createHfEditorState({
        hf,
        styles,
        theme,
        defaultTabStopTwips,
        defaultTableStyleId,
        manager,
        suggesting: sugg.active,
        author: sugg.author,
      });
      const rId = slot.rId;
      const view = this.host.mountView(
        node,
        state,
        (tr, v) => {
          const target = v ?? this.hfViews.get(rId)?.view;
          if (!target) return;
          const newState = target.state.apply(tr);
          target.updateState(newState);
          this.handleHfTransaction(rId, target, tr.docChanged);
        },
        'hf'
      );
      this.hfViews.set(slot.rId, { view, manager, kind: slot.kind, mountNode: node });
    }
  }

  getHfView(rId: string): EditorView | null {
    return this.hfViews.get(rId)?.view ?? null;
  }

  getHfViews(): Map<string, EditorView> {
    const map = new Map<string, EditorView>();
    for (const [rId, mounted] of this.hfViews) map.set(rId, mounted.view);
    return map;
  }

  /** Tear down every HF view + manager (unmount). */
  destroyHfViews(): void {
    for (const mounted of this.hfViews.values()) {
      this.host.destroyView(mounted.view);
      mounted.mountNode.remove();
      mounted.manager.destroy();
    }
    this.hfViews.clear();
  }

  // -- session seam (step 5): load race guard + save orchestration ----
  private loadGeneration = new LoadGeneration();

  /**
   * Parse `buffer` into a `Document` with the load race guard (step 5,
   * lifted from React's `useDocumentLoader`). Returns null when a newer
   * load started while parsing — the caller keeps its current document.
   * Parse errors throw so adapters surface them through their own
   * error path (same as today).
   */
  async load(buffer: DocxInput): Promise<Document | null> {
    const generation = this.loadGeneration.begin();
    const document = await parseDocx(buffer);
    if (!this.loadGeneration.isCurrent(generation)) return null;
    return document;
  }

  /** Force-stale every in-flight load (teardown). */
  cancelLoads(): void {
    this.loadGeneration.invalidate();
  }

  /**
   * Serialize the current document to a DOCX buffer (step 5, lifted from
   * React's `useFileIO.handleSave`). Reads the latest body content off
   * the live view, syncs `comments` back into the agent document,
   * injects reply range markers, then writes via the agent (selective
   * when the tracker state allows it). Clears the change tracker on the
   * live view after a successful save. Returns null with no agent.
   */
  async save(options?: { selective?: boolean; comments?: Comment[] }): Promise<ArrayBuffer | null> {
    const agent = this.host.getAgent?.() ?? null;
    if (!agent) return null;
    const agentDoc = agent.getDocument();
    const view = this.getBodyView();
    const base = this.host.getDocument();
    if (view && base) {
      const pmDoc = fromProseDoc(view.state.doc, base);
      if (pmDoc.package?.document) {
        agentDoc.package.document.content = pmDoc.package.document.content;
      }
    }
    const comments =
      options?.comments ?? this.host.getComments?.() ?? agentDoc.package.document?.comments ?? [];
    if (agentDoc.package.document) agentDoc.package.document.comments = comments;
    const content = agentDoc.package.document?.content;
    if (content) {
      injectReplyRangeMarkers(content, comments);
      injectTCReplyRangeMarkers(content, comments);
    }
    const decision = decideSelectiveSave(
      view?.state ?? null,
      comments,
      options?.selective !== false
    );
    const buffer = await agent.toBuffer(decision ? { selective: decision.selective } : undefined);
    // The await above can span a document load: Vue recreates its body view
    // on every load (`destroyEditorView` + `createEditorView`), so the
    // captured view may be destroyed (or superseded) by the time the buffer
    // resolves. Dispatching the tracker cleanup onto a destroyed view
    // throws `null.matchesNode` inside prosemirror-view (`docView` is nulled
    // by `EditorView.destroy`). Re-validate liveness — and only touch the
    // view save actually read, never a newer document's view.
    const live = this.getBodyView();
    if (live && live === view && !live.isDestroyed) {
      live.dispatch(clearTrackedChanges(live.state));
    }
    return buffer;
  }

  /**
   * Run the full layout pass for `state`: compute → paint → hooks.
   *
   * Pulls every other input via host getters and derives geometry from
   * section properties itself, so geometry is never a per-call input.
   * Returns the computation (primarily for tests; adapters use hooks).
   * A failed pass notifies `host.onError` and returns `undefined` (the
   * adapters keep their previous state) — it never throws, matching the
   * pre-engine `catch` behavior in both adapters.
   */
  run(state: EditorState): LayoutComputation | undefined {
    const host = this.host;
    const pipelineStart = performance.now();

    const syncCoordinator = host.getSyncCoordinator();
    const currentEpoch = syncCoordinator?.getStateSeq() ?? 0;
    syncCoordinator?.onLayoutStart();

    // A second pass before the post-paint apply must not lose the first
    // pass's exact scrollTop — same re-clamp the adapters ran pre-compute.
    {
      const prePagesEl = host.getPagesContainer();
      const preScrollParent = prePagesEl
        ? (host.getScrollContainer() ?? findVerticalScrollParentOrRoot(prePagesEl))
        : null;
      reclampIncrementalSnapshot(
        this.pendingScrollRestore,
        preScrollParent,
        performance.now() - this.pendingIncrementalScrollSnapshotWrittenAt,
        true
      );
    }

    let computation: LayoutComputation | undefined;
    try {
      const document = host.getDocument();
      const sectionProperties = host.getSectionProperties();
      const finalSectionProperties = host.getFinalSectionProperties();
      const {
        pageSize,
        margins,
        columns,
        finalPageSize,
        finalMargins,
        finalColumns,
        contentWidth,
      } = resolveLayoutGeometry(sectionProperties, finalSectionProperties);
      const theme = host.getTheme() ?? null;
      const styles = host.getStyles() ?? null;
      const hf = host.getHeaderFooter();

      computation = computeLayout({
        state,
        document,
        pageSize,
        margins,
        columns,
        finalPageSize,
        finalMargins,
        finalColumns,
        pageGap: host.getPageGap(),
        contentWidth,
        theme,
        styles,
        sectionProperties,
        finalSectionProperties,
        headerContent: hf.header,
        footerContent: hf.footer,
        firstPageHeaderContent: hf.firstHeader,
        firstPageFooterContent: hf.firstFooter,
        measureBlocks: (blocks, widths, geometry) => host.measureBlocks(blocks, widths, geometry),
        getHfPmDoc: (h) => host.getHfPmDoc(h) ?? null,
      });

      const {
        blocks: newBlocks,
        measures: newMeasures,
        layout: newLayout,
        headerContentForRender,
        footerContentForRender,
        firstPageHeaderForRender,
        firstPageFooterForRender,
        hasTitlePg,
        watermark,
        headerDistancePx,
        footerDistancePx,
        pageBorders,
        footnotesByPage,
        endnotesSection,
        endnoteIds,
        endnoteRefPmPos,
      } = computation;
      const lookup = buildBlockLookup(newBlocks, newMeasures);
      host.onLayout(newLayout, newBlocks, newMeasures, lookup);

      // Paint to DOM.
      const pagesEl = host.getPagesContainer();
      if (pagesEl) {
        this.pendingScrollRestore = null;
        this.pendingIncrementalScrollSnapshotWrittenAt = 0;

        const scrollParent = host.getScrollContainer() ?? findVerticalScrollParentOrRoot(pagesEl);
        const anchor = scrollParent?.isConnected
          ? captureScrollAnchor(pagesEl, scrollParent, state.selection.head)
          : null;

        const resolvedCommentIds = host.getResolvedCommentIds();
        const pageOptions: RenderPageOptions & {
          pageGap?: number;
          pageBackground?: string;
          showShadow?: boolean;
          blockLookup?: BlockLookup;
          footnotesByPage?: Map<number, FootnoteRenderItem[]>;
          endnotesSection?: FootnoteRenderItem[];
          endnoteIds?: number[];
          endnoteRefPmPos?: Map<number, number>;
          resolvedCommentIds?: Set<number>;
        } = {
          pageGap: host.getPageGap(),
          showShadow: true,
          pageBackground: 'var(--doc-page-bg, #ffffff)',
          blockLookup: lookup,
          headerContent: headerContentForRender,
          footerContent: footerContentForRender,
          firstPageHeaderContent: firstPageHeaderForRender,
          firstPageFooterContent: firstPageFooterForRender,
          titlePg: hasTitlePg,
          headerDistance: headerDistancePx,
          footerDistance: footerDistancePx,
          pageBorders,
          theme,
          watermark,
          footnotesByPage,
          endnotesSection,
          endnoteIds,
          endnoteRefPmPos,
          resolvedCommentIds,
        };
        const renderPagesKind = renderPages(newLayout.pages, pagesEl, pageOptions);

        host.onPaintContainer?.(newLayout);

        if (scrollParent?.isConnected && anchor) {
          const pending = buildPendingScrollRestore(renderPagesKind, scrollParent, anchor);
          this.pendingScrollRestore = pending;
          if (pending.renderKind === 'incremental' && pending.scrollTopSnapshot != null) {
            this.pendingIncrementalScrollSnapshotWrittenAt = performance.now();
          }
          const consumed = host.onScrollRestore?.(pending) ?? false;
          if (consumed) {
            this.pendingScrollRestore = null;
            this.pendingIncrementalScrollSnapshotWrittenAt = 0;
          }
        }

        // Deterministic "painter is done writing" signal. HF caret +
        // selection-rect resolvers wait on this instead of
        // `requestAnimationFrame` chains. Bubbling CustomEvent so any
        // ancestor can listen via the pages container.
        pagesEl.dispatchEvent(new CustomEvent('painter:painted', { bubbles: true }));

        host.onPainted?.({ layout: newLayout, renderKind: renderPagesKind, state });

        if (host.computeAnchorPositions) {
          const positions = host.computeAnchorPositions(newLayout, newBlocks, newMeasures);
          if (positions) host.onAnchorPositions?.(positions);
        }

        this.applyPendingIncrementalScrollSnapshot(false, pagesEl);

        const totalTime = performance.now() - pipelineStart;
        if (totalTime > 2000) {
          console.warn(
            `[DocxEditorEngine] Layout pipeline took ${Math.round(totalTime)}ms total ` +
              `(${newBlocks.length} blocks, ${newMeasures.length} measures)`
          );
        }
      } else {
        this.pendingScrollRestore = null;
        this.pendingIncrementalScrollSnapshotWrittenAt = 0;
      }
    } catch (error) {
      // A failed pass leaves no usable layout; adapters keep their
      // previous state (same as the pre-engine `catch` behavior).
      host.onError?.(error);
    } finally {
      syncCoordinator?.onLayoutComplete(currentEpoch);
      const pagesEl = host.getPagesContainer();
      if (pagesEl) this.applyPendingIncrementalScrollSnapshot(false, pagesEl);
    }

    return computation;
  }

  /**
   * Take the pending scroll-restore for post-commit application (React's
   * `useLayoutEffect`). Clears the engine copy so a later pass's
   * re-clamp cannot act on a stale snapshot.
   */
  consumePendingScrollRestore(): PendingScrollRestore | null {
    const pending = this.pendingScrollRestore;
    this.pendingScrollRestore = null;
    this.pendingIncrementalScrollSnapshotWrittenAt = 0;
    return pending;
  }

  private applyPendingIncrementalScrollSnapshot(
    onlyIfSnapshotJustWritten: boolean,
    pagesEl: HTMLElement
  ): void {
    const scrollParent = this.host.getScrollContainer() ?? findVerticalScrollParentOrRoot(pagesEl);
    reclampIncrementalSnapshot(
      this.pendingScrollRestore,
      scrollParent,
      performance.now() - this.pendingIncrementalScrollSnapshotWrittenAt,
      onlyIfSnapshotJustWritten
    );
  }
}
