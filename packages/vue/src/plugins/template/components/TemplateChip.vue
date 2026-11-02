<!--
  Vue port of packages/react/src/plugins/template/components/TemplateChip.tsx —
  sidebar card for a template tag. Same markup, same class names, same CSS
  (see ../styles.ts — identical to React's chip styles) so the injected
  plugin styles apply identically.
-->
<template>
  <div :ref="setMeasureRef" style="display: flex; align-items: flex-start">
    <!-- Connector line -->
    <div
      :style="{
        width: '20px',
        height: '1px',
        background: isHovered ? '#3b82f6' : '#d0d0d0',
        marginTop: '12px',
        marginRight: '4px',
        flexShrink: 0,
      }"
    />
    <div
      :class="['template-annotation-chip', { hovered: isHovered }]"
      :style="{ borderLeftColor: color }"
      :title="tooltip"
      @mouseenter="onHover(tag.id)"
      @mouseleave="onHover(undefined)"
      @click.stop="onSelect(tag.id)"
      @mousedown.stop
    >
      <span v-if="label" class="template-chip-badge" :style="{ background: color }">
        {{ label }}
      </span>
      <span v-else class="template-chip-dot" :style="{ color }">●</span>
      <span class="template-chip-name">{{ tag.name }}</span>

      <div v-if="isSection && tag.nestedVars && tag.nestedVars.length > 0" class="template-chip-nested">
        <span
          v-for="(v, i) in tag.nestedVars"
          :key="i"
          class="template-nested-var"
          :title="`Access: ${tag.name}.${v}`"
        >
          {{ v.includes('.') ? v.split('.').pop() : v }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  TemplateTag,
  TagType,
} from '@xcrong/docx-editor-core/prosemirror/template/prosemirror-plugin';

const COLORS: Record<TagType, string> = {
  variable: '#f59e0b',
  sectionStart: '#3b82f6',
  sectionEnd: '#3b82f6',
  invertedStart: '#8b5cf6',
  raw: '#ef4444',
};

function getLabel(type: TagType): string {
  switch (type) {
    case 'sectionStart':
      return 'LOOP / IF';
    case 'invertedStart':
      return 'IF NOT';
    case 'raw':
      return 'HTML';
    default:
      return '';
  }
}

const props = defineProps<{
  tag: TemplateTag;
  isHovered: boolean;
  /** Ref callback to measure the rendered card height (from sidebar layout). */
  measureRef?: (el: HTMLElement | null) => void;
  onHover: (id: string | undefined) => void;
  onSelect: (id: string) => void;
}>();

const color = computed(() => COLORS[props.tag.type]);
const label = computed(() => getLabel(props.tag.type));
const isSection = computed(
  () => props.tag.type === 'sectionStart' || props.tag.type === 'invertedStart'
);
const tooltip = computed(() =>
  isSection.value
    ? `${props.tag.rawTag}\nIterates over ${props.tag.name}[]. Access nested properties via ${props.tag.name}.property`
    : props.tag.rawTag
);

function setMeasureRef(el: unknown) {
  props.measureRef?.((el as HTMLElement | null) ?? null);
}
</script>
