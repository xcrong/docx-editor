<!--
  LeaderLines — SVG overlay connecting highlighted anchors to sidebar cards.
  Vue mirror of packages/react/src/components/sidebar/LeaderLines.tsx:
  one line per sidebar item from the right edge of its document anchor
  span to the left edge of its card slot. Geometry via core's
  `computeLeaderLineEndpoints`; DOM reads + rAF-coalesced refresh here.
-->
<template>
  <svg
    v-if="lines.length > 0"
    class="docx-leader-lines"
    data-leader-svg="true"
    aria-hidden="true"
  >
    <line
      v-for="l in lines"
      :key="l.itemId"
      :data-leader-for="l.itemId"
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
      :style="{
        stroke: l.active ? 'var(--doc-primary)' : 'var(--doc-text-subtle)',
        strokeWidth: l.active ? 2 : 1,
        opacity: l.active ? 1 : 0.7,
      }"
    />
  </svg>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { computeLeaderLineEndpoints } from '@xcrong/docx-editor-core/utils/sidebarConstants';

interface LeaderLineData {
  itemId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}

const props = defineProps<{
  /** Sidebar item ids (`comment-<id>`, `tc-<rev>-<idx>`). */
  itemIds: string[];
  /** Currently expanded item — its line renders emphasized. */
  activeItemId?: string | null;
  /** Painted pages container (anchor spans live under it). */
  pagesContainer: HTMLElement | null;
  /**
   * Sidebar root (card slots live under it). Optional: when absent or
   * detached the live viewport/document is queried instead, so callers
   * don't need to track a stable handle across card mount/unmount.
   */
  sidebarRoot?: HTMLElement | null;
}>();

const lines = ref<LeaderLineData[]>([]);
let rafId = 0;

function anchorSelectorForItem(itemId: string): string | null {
  if (itemId.startsWith('comment-')) {
    const id = itemId.slice('comment-'.length);
    if (!/^\d+$/.test(id)) return null;
    // Overlapping comments (9.4) stack: the first id lives in
    // `data-comment-id`, all ids (space-separated) in `data-comment-ids`.
    return `.layout-page-content [data-comment-id="${id}"], .layout-page-content [data-comment-ids~="${id}"]`;
  }
  if (itemId.startsWith('tc-')) {
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

function recompute() {
  const pages = props.pagesContainer;
  // `sidebarRoot` is a point-in-time handle that can go stale (cards mount
  // after the parent's refresh); fall back to a live document query.
  const sidebar =
    props.sidebarRoot?.isConnected === true
      ? props.sidebarRoot
      : (document.querySelector<HTMLElement>('.unified-sidebar') ?? null);
  // Fixed positioning => viewport coords map 1:1 onto the SVG, origin (0,0).
  if (!pages || !sidebar) {
    lines.value = [];
    return;
  }
  const toRect = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const origin = { left: 0, top: 0, right: 0, bottom: 0 };
  const next: LeaderLineData[] = [];
  for (const itemId of props.itemIds) {
    const anchorSel = anchorSelectorForItem(itemId);
    if (!anchorSel) continue;
    const anchor = pages.querySelector(anchorSel);
    const card = sidebar.querySelector(`[data-card-id="${CSS.escape(itemId)}"]`);
    if (!anchor || !card) continue;
    const endpoints = computeLeaderLineEndpoints(
      origin,
      toRect(anchor.getBoundingClientRect()),
      toRect(card.getBoundingClientRect())
    );
    if (!endpoints) continue;
    next.push({ itemId, ...endpoints, active: props.activeItemId === itemId });
  }
  const prev = lines.value;
  const same =
    prev.length === next.length &&
    prev.every(
      (p, i) =>
        p.itemId === next[i].itemId &&
        p.x1 === next[i].x1 &&
        p.y1 === next[i].y1 &&
        p.x2 === next[i].x2 &&
        p.y2 === next[i].y2 &&
        p.active === next[i].active
    );
  if (!same) lines.value = next;
}

function schedule() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(recompute);
}

watch(
  () => [props.itemIds, props.activeItemId, props.pagesContainer, props.sidebarRoot],
  () => schedule()
);

// The parent's `sidebarRoot` handle can lag behind the actual mount, and
// card positions resolve asynchronously (opacity 0 → 1). A bounded rAF
// loop after mount covers the cold-start race; the watchers + listeners
// below cover steady-state.
onMounted(() => {
  let frames = 0;
  const tick = () => {
    schedule();
    frames += 1;
    if (frames < 30) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

let mutationObserver: MutationObserver | null = null;

function onScroll() {
  schedule();
}

onMounted(() => {
  // Fixed positioning => lines go stale on any scroll; listen on the
  // document (capture) so nested scrollers are covered without needing a
  // viewport handle from the parent.
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onScroll);
  const pages = props.pagesContainer;
  if (pages) {
    pages.addEventListener('painter:painted', onScroll);
  }
  const sidebar = props.sidebarRoot?.isConnected === true
    ? props.sidebarRoot
    : document.querySelector<HTMLElement>('.unified-sidebar');
  if (sidebar) {
    mutationObserver = new MutationObserver(onScroll);
    mutationObserver.observe(sidebar, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }
  schedule();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  document.removeEventListener('scroll', onScroll, { capture: true });
  window.removeEventListener('resize', onScroll);
  props.pagesContainer?.removeEventListener('painter:painted', onScroll);
  mutationObserver?.disconnect();
});
</script>
