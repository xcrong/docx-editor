import { computed, type ComputedRef } from 'vue';
import { resolveEffectiveFont } from '@xcrong/docx-editor-core/prosemirror';
import type { StyleDefinitions } from '@xcrong/docx-editor-core/types/document';
import type { SelectionContext } from '@xcrong/docx-editor-core/prosemirror/plugins/selectionTracker';

/**
 * Effective font display for the toolbar (Vue twin of React's
 * `useSelectionTracker` fallback). The fallback math lives in core's
 * `resolveEffectiveFont`; this composable only adapts it to `computed`
 * display values (`Arial`/`11` defaults, half-points → points).
 */
export function useEffectiveFont(
  ctx: ComputedRef<SelectionContext>,
  getDefs: () => StyleDefinitions | undefined
) {
  const currentFontFamily = computed(() => {
    const { family } = resolveEffectiveFont({
      directFamily: ctx.value.textFormatting.fontFamily,
      directSizeHalfPoints: ctx.value.textFormatting.fontSize,
      styleId: ctx.value.paragraphFormatting.styleId,
      styleDefinitions: getDefs(),
    });
    return family ?? 'Arial';
  });

  const currentFontSize = computed(() => {
    const { sizeHalfPoints } = resolveEffectiveFont({
      directFamily: ctx.value.textFormatting.fontFamily,
      directSizeHalfPoints: ctx.value.textFormatting.fontSize,
      styleId: ctx.value.paragraphFormatting.styleId,
      styleDefinitions: getDefs(),
    });
    return sizeHalfPoints ? sizeHalfPoints / 2 : 11;
  });

  return { currentFontFamily, currentFontSize };
}
