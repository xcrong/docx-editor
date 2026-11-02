<!--
  Comments-sidebar chrome rendered alongside the sidebar: the narrow-overlay
  backdrop (click closes) + the leader-lines SVG overlay. Split out of
  `DocxEditor.vue` so it stays under its line cap.
-->
<template>
  <button
    v-if="overlayMode && isOpen"
    type="button"
    class="docx-sidebar-backdrop"
    aria-label="Close comments sidebar"
    @mousedown.stop
    @click="$emit('close')"
  />
  <LeaderLines :item-ids="itemIds" :active-item-id="activeItemId" :pages-container="pagesContainer" />
</template>

<script setup lang="ts">
import LeaderLines from './LeaderLines.vue';

defineProps<{
  /** Narrow-container overlay mode: backdrop floats over the doc. */
  overlayMode: boolean;
  /** Sidebar open flag (backdrop only renders when open). */
  isOpen: boolean;
  /** Sidebar item ids for the leader-lines overlay. */
  itemIds: string[];
  /** Currently expanded item — its leader line renders emphasized. */
  activeItemId?: string | null;
  /** Painted pages container (anchor spans live under it). */
  pagesContainer: HTMLElement | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();
</script>
