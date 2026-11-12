<!--
  Mirror of packages/react/src/components/CommentMarginMarkers.tsx.
  Small chat-bubble icons at the page right edge — visible when the
  sidebar is closed; clicking opens the sidebar.

  Anchor positions are resolved DOM-side (querySelector on
  [data-comment-id="N"]) rather than via the React layout-engine
  anchorPositions Map, since the Vue adapter doesn't expose that.
  Same visual output, slightly different data path.
-->
<template>
  <div
    v-if="markers.length > 0"
    class="docx-comment-margin-markers"
    :style="containerStyle"
    @mousedown.stop
  >
    <button
      v-for="m in markers"
      :key="m.comment.id"
      class="docx-comment-margin-markers__btn"
      :title="m.isResolved ? 'Resolved comment' : 'Comment'"
      :style="{ top: m.y * zoom + 'px' }"
      @click="$emit('marker-click', m.comment.id)"
    >
      <MaterialSymbol
        :name="m.isResolved ? 'chat_bubble_check' : 'chat_bubble_outline'"
        :size="18"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import type { Comment } from '@xcrong/docx-editor-core/types/content';
import MaterialSymbol from './ui/MaterialSymbol.vue';

const props = defineProps<{
  comments: Comment[];
  pagesContainer: HTMLElement | null;
  zoom: number;
  pageWidthPx: number;
  sidebarOpen: boolean;
  resolvedCommentIds: Set<number>;
  /**
   * Engine-computed anchors in pages-container coords (PM+layout, no DOM
   * dependency). Primary source — the DOM query below only fills keys
   * missing here (e.g. anchors whose engine entry hasn't arrived yet).
   * Required for resolved comments: the painter strips their highlight
   * spans, so DOM lookup can never anchor them (React anchors markers
   * from the same engine map, which is why its markers always showed).
   */
  engineAnchorPositions?: Map<string, number> | null;
}>();

defineEmits<{
  (e: 'marker-click', commentId: number): void;
}>();

interface Marker {
  comment: Comment;
  isResolved: boolean;
  y: number;
}

// Bumped after every painter repaint (and a short settle on mount /
// sidebar-close) so the DOM anchor query below re-runs against fresh
// page DOM. Without this the computed resolves once against a stale (or
// not-yet-painted) tree and markers stay missing until an unrelated
// reactive tick — React avoids this via engine-computed anchorPositions.
const paintTick = ref(0);
function bump() {
  paintTick.value++;
}
let paintEl: HTMLElement | null = null;
function bindPaintListener() {
  paintEl?.removeEventListener('painter:painted', bump);
  paintEl = props.pagesContainer;
  paintEl?.addEventListener('painter:painted', bump);
}

onMounted(() => {
  bindPaintListener();
  // Cold start: the last paint may predate this mount, so no
  // `painter:painted` will arrive — settle over a few frames instead.
  let frames = 0;
  const tick = () => {
    bump();
    if (++frames < 5) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

watch(
  () => props.pagesContainer,
  () => bindPaintListener()
);

// Closing the sidebar repaints (highlight/restyle pass); re-resolve
// once that paint lands (via the listener) plus one next-frame bump
// in case this close issues no paint at all. Engine anchors arrive as
// a fresh Map identity per engine run, so watch it too — this is what
// anchors resolved comments, whose highlight spans the painter strips
// (DOM lookup alone can never find them).
watch(
  () => props.sidebarOpen,
  (open) => {
    if (!open) requestAnimationFrame(() => bump());
  }
);

watch(
  () => props.engineAnchorPositions,
  () => bump()
);

onBeforeUnmount(() => {
  paintEl?.removeEventListener('painter:painted', bump);
});

const markers = computed<Marker[]>(() => {
  // Dependency: re-resolve anchors after every repaint/settle tick.
  void paintTick.value;
  // Hide all markers when the sidebar is open — cards are visible
  // there instead. Matches React's CommentMarginMarkers semantics.
  if (props.sidebarOpen) return [];
  const container = props.pagesContainer;
  if (!container) return [];
  const containerRect = container.getBoundingClientRect();

  // Build a comment-id → element map in one querySelectorAll, then
  // look up by id (avoids N querySelectors per render).
  const els = new Map<string, HTMLElement>();
  for (const el of container.querySelectorAll<HTMLElement>('[data-comment-id]')) {
    const id = el.dataset.commentId;
    if (id && !els.has(id)) els.set(id, el);
  }

  const out: Marker[] = [];
  for (const c of props.comments) {
    if (c.parentId != null) continue;
    // Engine anchors first (PM+layout, always available — including
    // resolved comments whose spans the painter strips), DOM fallback
    // second. Both are post-zoom pages-container coords; `y` is stored
    // unscaled to match the template's `top: y * zoom`.
    const key = `comment-${c.id}`;
    const top =
      props.engineAnchorPositions?.get(key) ?? domAnchorTop(els, containerRect, container, String(c.id));
    if (top == null) continue;
    out.push({
      comment: c,
      isResolved: props.resolvedCommentIds.has(c.id),
      y: top / props.zoom,
    });
  }
  return out;
});

/** Visual (post-zoom) Y of a comment anchor span relative to the pages container. */
function domAnchorTop(
  els: Map<string, HTMLElement>,
  containerRect: DOMRect,
  container: HTMLElement,
  id: string
): number | null {
  const anchor = els.get(id);
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();
  return r.top - containerRect.top + container.scrollTop;
}

// pageWidthPx is post-zoom (scaled), and the marker container now lives
// inside the content-width wrapper next to the scaled `__pages` element —
// so the page right edge in these coords is the SCALED half width.
// (Previously divided zoom back out, which glued markers to the unscaled
// edge and misplaced them at any zoom ≠ 1; mirrors React's
// `(pageWidth * zoom) / 2`.)
const containerStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  top: 0,
  left: `calc(50% + ${props.pageWidthPx / 2 + 6}px)`,
  zIndex: 30,
  pointerEvents: 'none',
}));
</script>

<style scoped>
.docx-comment-margin-markers__btn {
  position: absolute;
  left: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  color: var(--doc-text-muted);
  padding: 0;
  font-family: inherit;
  transition: opacity 0.15s ease;
}
.docx-comment-margin-markers__btn:hover { opacity: 0.7; }
</style>
