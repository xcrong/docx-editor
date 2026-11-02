<!--
  Vue port of packages/react/src/plugins/template/components/
  TemplateHighlightOverlay.tsx — highlight rectangles painted on top of
  the rendered pages for template tags. Same props, same rect math
  (RenderedDomContext.getRectsForRange + container offset), same CSS
  (see ../styles.ts — identical to React's overlay styles).
-->
<template>
  <div v-if="highlights.length > 0" class="template-highlight-overlay">
    <div
      v-for="(rect, index) in highlights"
      :key="`${rect.tagId}-${index}`"
      :class="[
        'template-highlight',
        { hovered: rect.tagId === hoveredId, selected: rect.tagId === selectedId },
      ]"
      :style="{
        position: 'absolute',
        left: rect.x + 'px',
        top: rect.y + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        backgroundColor: highlightColor(rect),
        borderRadius: '2px',
        cursor: 'pointer',
      }"
      @mouseenter="onHover?.(rect.tagId)"
      @mouseleave="onHover?.(undefined)"
      @click="onSelect?.(rect.tagId)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { RenderedDomContext } from '../../../plugin-api/types';
import type { TemplateTag, TagType } from '@xcrong/docx-editor-core/prosemirror/template/prosemirror-plugin';

/** Colors for tag types (matching React's HIGHLIGHT_COLORS). */
const HIGHLIGHT_COLORS: Record<TagType, string> = {
  variable: 'rgba(245, 158, 11, 0.3)',
  sectionStart: 'rgba(59, 130, 246, 0.3)',
  sectionEnd: 'rgba(59, 130, 246, 0.3)',
  invertedStart: 'rgba(139, 92, 246, 0.3)',
  raw: 'rgba(239, 68, 68, 0.3)',
};

const HOVER_COLORS: Record<TagType, string> = {
  variable: 'rgba(245, 158, 11, 0.5)',
  sectionStart: 'rgba(59, 130, 246, 0.5)',
  sectionEnd: 'rgba(59, 130, 246, 0.5)',
  invertedStart: 'rgba(139, 92, 246, 0.5)',
  raw: 'rgba(239, 68, 68, 0.5)',
};

interface HighlightRect {
  tagId: string;
  tagType: TagType;
  x: number;
  y: number;
  width: number;
  height: number;
}

const props = defineProps<{
  context: RenderedDomContext | null;
  tags: TemplateTag[];
  hoveredId?: string;
  selectedId?: string;
  onHover?: (id: string | undefined) => void;
  onSelect?: (id: string) => void;
}>();

/** Bumped by resize/layout changes to recompute rects (mirrors React's layoutVersion). */
const layoutVersion = ref(0);

const highlights = computed<HighlightRect[]>(() => {
  // Depend on layoutVersion so resize/zoom recompute.
  void layoutVersion.value;
  const context = props.context;
  if (!context) return [];
  const containerOffset = context.getContainerOffset();
  const rects: HighlightRect[] = [];
  for (const tag of props.tags) {
    const tagRects = context.getRectsForRange(tag.from, tag.to);
    for (const rect of tagRects) {
      rects.push({
        tagId: tag.id,
        tagType: tag.type,
        x: rect.x + containerOffset.x,
        y: rect.y + containerOffset.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }
  return rects;
});

function highlightColor(rect: HighlightRect): string {
  const active = rect.tagId === props.hoveredId || rect.tagId === props.selectedId;
  return active ? HOVER_COLORS[rect.tagType] : HIGHLIGHT_COLORS[rect.tagType];
}

let observer: ResizeObserver | null = null;

function scheduleRecompute() {
  requestAnimationFrame(() => {
    layoutVersion.value += 1;
  });
}

// Mirror React's [context.pagesContainer] effect dep: re-observe if the
// RenderedDomContext wrapper is ever recreated around a new element.
// (In practice the container is stable; a full editor remount also
// remounts this overlay. The watch keeps the contract exact.)
watch(
  () => props.context?.pagesContainer,
  (container, _previous, onCleanup) => {
    observer?.disconnect();
    observer = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleRecompute);
      observer.observe(container);
    }
    onCleanup(() => {
      observer?.disconnect();
      observer = null;
    });
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('resize', scheduleRecompute);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleRecompute);
  observer?.disconnect();
  observer = null;
});
</script>
