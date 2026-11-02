/**
 * LeaderLines — SVG overlay connecting highlighted anchors to sidebar cards.
 *
 * Each visible sidebar item (`comment-<id>` / `tc-<rev>-<idx>`) gets one
 * line from the right edge of its document anchor span to the left edge of
 * its card. Geometry comes from `computeLeaderLineEndpoints` (core); this
 * component only does DOM reads. Positions refresh on scroll / resize /
 * painter repaints via a coalesced `requestAnimationFrame`, and the active
 * (expanded) item's line renders thicker in the primary color.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { computeLeaderLineEndpoints } from '@xcrong/docx-editor-core/utils/sidebarConstants';

export interface LeaderLineData {
  itemId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}

export interface LeaderLinesProps {
  /** Sidebar item ids to draw lines for (`comment-<id>`, `tc-<rev>-<idx>`). */
  itemIds: string[];
  /** Currently expanded item — its line renders emphasized. */
  activeItemId?: string | null;
  /** Element scoping all queries (editor content root: pages + sidebar). */
  scopeRef: React.RefObject<HTMLElement | null>;
  /** Scroll container whose `scroll` events invalidate line positions. */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

function anchorSelectorForItem(itemId: string): string | null {
  if (itemId.startsWith('comment-')) {
    const id = itemId.slice('comment-'.length);
    if (!/^\d+$/.test(id)) return null;
    // Overlapping comments (9.4) stack: the first id lives in
    // `data-comment-id`, all ids in `data-comment-ids`.
    return `.layout-page-content [data-comment-id="${id}"], .layout-page-content [data-comment-ids~="${id}"]`;
  }
  if (itemId.startsWith('tc-')) {
    // id shape: tc-<revisionId>-<index>
    const rev = itemId.slice(3).split('-')[0];
    if (!rev || !/^\d+$/.test(rev)) return null;
    return [
      `.layout-page-content .docx-insertion[data-revision-id="${rev}"]`,
      `.layout-page-content .docx-deletion[data-revision-id="${rev}"]`,
      `.layout-page-content .ep-revision-table[data-revision-id="${rev}"]`,
      `.layout-page-content .ep-revision-row[data-revision-id="${rev}"]`,
      `.layout-page-content .ep-revision-cell[data-revision-id="${rev}"]`,
      `.layout-page-content .layout-revision-pmark[data-revision-id="${rev}"]`,
    ].join(', ');
  }
  return null;
}

export function LeaderLines({
  itemIds,
  activeItemId,
  scopeRef,
  scrollContainerRef,
}: LeaderLinesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [lines, setLines] = useState<LeaderLineData[]>([]);
  const rafRef = useRef(0);
  const itemIdsRef = useRef(itemIds);
  itemIdsRef.current = itemIds;
  const activeRef = useRef(activeItemId);
  activeRef.current = activeItemId;

  const recompute = useCallback(() => {
    const svg = svgRef.current;
    // `scopeRef` (editor content root) may not exist yet on the first
    // frames — fall back to the document so lines still resolve. The svg
    // origin rect is only needed to convert viewport coords into the SVG's
    // local space; with `position: fixed; inset: 0` they coincide, so when
    // the svg isn't mounted yet (cold start) measure against the viewport.
    const scope = scopeRef.current ?? (svg?.ownerDocument as Document | undefined);
    if (!scope) {
      setLines([]);
      return;
    }
    const toRect = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    const svgLocal = svg
      ? toRect(svg.getBoundingClientRect())
      : { left: 0, top: 0, right: 0, bottom: 0 };
    const next: LeaderLineData[] = [];
    for (const itemId of itemIdsRef.current) {
      const anchorSel = anchorSelectorForItem(itemId);
      if (!anchorSel) continue;
      const anchor = scope.querySelector(anchorSel);
      // Card slot carries `data-card-id` (UnifiedSidebar wrapper).
      const card = scope.querySelector(`[data-card-id="${CSS.escape(itemId)}"]`);
      if (!anchor || !card) continue;
      const endpoints = computeLeaderLineEndpoints(
        svgLocal,
        toRect(anchor.getBoundingClientRect()),
        toRect(card.getBoundingClientRect())
      );
      if (!endpoints) continue;
      next.push({ itemId, ...endpoints, active: activeRef.current === itemId });
    }
    setLines((prev) => {
      if (
        prev.length === next.length &&
        prev.every(
          (p, i) =>
            p.itemId === next[i].itemId &&
            p.x1 === next[i].x1 &&
            p.y1 === next[i].y1 &&
            p.x2 === next[i].x2 &&
            p.y2 === next[i].y2 &&
            p.active === next[i].active
        )
      ) {
        return prev;
      }
      return next;
    });
  }, [scopeRef]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(recompute);
  }, [recompute]);

  // Recompute when items / active item change (post-commit so DOM is fresh).
  useEffect(() => {
    schedule();
  }, [itemIds, activeItemId, schedule]);

  // Also recompute on an interval-free rAF loop for the first seconds after
  // mount: the scope ref (editor content root) may attach after this
  // component's effects run, and the sidebar cards resolve positions
  // asynchronously (opacity 0 → 1). The MutationObserver below covers
  // steady-state; this covers the cold-start race.
  useEffect(() => {
    let frames = 0;
    let raf = 0;
    const tick = () => {
      schedule();
      frames += 1;
      if (frames < 30) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [schedule]);

  useEffect(() => {
    const scroller = (scrollContainerRef?.current as HTMLElement | null) ?? null;
    const onScroll = () => schedule();
    // `scroll` doesn't bubble — listen on the container and on window
    // (capture) for nested scrollers.
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);

    // The painter repaints page DOM without touching our layer — the
    // anchor rects move, so re-measure after every paint.
    const doc = svgRef.current?.ownerDocument ?? document;
    const pagesEl = (scopeRef.current ?? doc).querySelector('.paged-editor__pages');
    pagesEl?.addEventListener('painter:painted', onScroll);

    // Card expand/collapse + collision-avoidance moves change card rects
    // without scrolling — watch the sidebar subtree (rAF-coalesced).
    const sidebarRoot = (scopeRef.current ?? doc).querySelector('.docx-unified-sidebar');
    const observer = sidebarRoot != null ? new MutationObserver(onScroll) : null;
    if (sidebarRoot && observer) {
      observer.observe(sidebarRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }

    schedule();
    return () => {
      cancelAnimationFrame(rafRef.current);
      scroller?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      pagesEl?.removeEventListener('painter:painted', onScroll);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeRef, scrollContainerRef, schedule]);

  if (lines.length === 0) return null;

  // Rendered first inside the sidebar-overlay layer so the absolutely
  // positioned sidebar (z-index 40) paints above the lines; the fixed
  // positioning keeps viewport-coord geometry correct regardless of DOM order.
  // `data-leader-svg` marker lets e2e distinguish this overlay from the
  // document's own inline SVGs (shapes, charts).
  return (
    <svg ref={svgRef} className="docx-leader-lines" data-leader-svg="true" aria-hidden="true">
      {lines.map((l) => (
        <line
          key={l.itemId}
          data-leader-for={l.itemId}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          style={{
            stroke: l.active ? 'var(--doc-primary)' : 'var(--doc-text-subtle)',
            strokeWidth: l.active ? 2 : 1,
            opacity: l.active ? 1 : 0.7,
          }}
        />
      ))}
    </svg>
  );
}
