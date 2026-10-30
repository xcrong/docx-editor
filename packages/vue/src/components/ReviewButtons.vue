<!--
  Review buttons — tracked-changes review group (7.6/7.7) extracted from
  Toolbar.vue to keep it under the max-lines budget. Accept/Reject disable
  when the cursor is not inside an insertion/deletion.
-->
<template>
  <span class="divider" />
  <button
    :title="t('toolbar.reviewPrevious')"
    :aria-label="t('toolbar.reviewPrevious')"
    data-testid="toolbar-prev-change"
    @mousedown.prevent="$emit('review-prev')"
  >
    <MaterialSymbol name="keyboard_arrow_up" />
  </button>
  <button
    :title="t('toolbar.reviewNext')"
    :aria-label="t('toolbar.reviewNext')"
    data-testid="toolbar-next-change"
    @mousedown.prevent="$emit('review-next')"
  >
    <MaterialSymbol name="keyboard_arrow_down" />
  </button>
  <button
    :title="t('toolbar.reviewAccept')"
    :aria-label="t('toolbar.reviewAccept')"
    data-testid="toolbar-accept-change"
    :disabled="!inTrackedChange"
    @mousedown.prevent="$emit('review-accept')"
  >
    <MaterialSymbol name="check" />
  </button>
  <button
    :title="t('toolbar.reviewReject')"
    :aria-label="t('toolbar.reviewReject')"
    data-testid="toolbar-reject-change"
    :disabled="!inTrackedChange"
    @mousedown.prevent="$emit('review-reject')"
  >
    <MaterialSymbol name="close" />
  </button>
  <button
    :title="t('toolbar.reviewAcceptAll')"
    :aria-label="t('toolbar.reviewAcceptAll')"
    data-testid="toolbar-accept-all"
    @mousedown.prevent="$emit('review-accept-all')"
  >
    <MaterialSymbol name="done_all" />
  </button>
  <button
    :title="t('toolbar.reviewRejectAll')"
    :aria-label="t('toolbar.reviewRejectAll')"
    data-testid="toolbar-reject-all"
    @mousedown.prevent="$emit('review-reject-all')"
  >
    <MaterialSymbol name="delete_sweep" />
  </button>
</template>

<script setup lang="ts">
import MaterialSymbol from './ui/MaterialSymbol.vue';
import { useTranslation } from '../i18n';

defineProps<{
  inTrackedChange: boolean;
}>();

defineEmits<{
  (e: 'review-accept'): void;
  (e: 'review-reject'): void;
  (e: 'review-accept-all'): void;
  (e: 'review-reject-all'): void;
  (e: 'review-prev'): void;
  (e: 'review-next'): void;
}>();

const { t } = useTranslation();
</script>
