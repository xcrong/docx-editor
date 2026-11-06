import { computed, type ComputedRef } from 'vue';
import { createStyleResolver } from '@xcrong/docx-editor-core/prosemirror/styles';
import type { StyleDefinitions } from '@xcrong/docx-editor-core/types/document';
import type { SelectionContext } from '@xcrong/docx-editor-core/prosemirror/plugins/selectionTracker';

/**
 * Effective font display for the toolbar (Vue twin of React's
 * `getCachedStyleResolver` fallback in `useSelectionTracker`).
 *
 * All mark-driven displays read from core's `extractSelectionContext`,
 * which handles cursor and range selections — including the "$from at a
 * mark boundary" case. When the cursor carries no explicit run mark, the
 * pickers show the font resolved through the style cascade (docDefaults →
 * Normal → paragraph style) instead of a hardcoded default. Resolvers are
 * cached by definitions-object identity so selection changes don't
 * rebuild them.
 */
export function useEffectiveFont(
  ctx: ComputedRef<SelectionContext>,
  getDefs: () => StyleDefinitions | undefined
) {
  const currentFontFamily = computed(() => {
    const ff = ctx.value.textFormatting.fontFamily;
    const direct = ff?.ascii || ff?.hAnsi;
    if (direct) return direct;
    const defs = getDefs();
    if (defs) {
      const f = getResolver(defs).resolveParagraphStyle(
        ctx.value.paragraphFormatting.styleId ?? undefined
      ).runFormatting?.fontFamily;
      if (f?.ascii || f?.hAnsi) return (f.ascii || f.hAnsi) as string;
    }
    return 'Arial';
  });

  const currentFontSize = computed(() => {
    const sz = ctx.value.textFormatting.fontSize;
    if (sz) return sz / 2; // half-points to points
    const defs = getDefs();
    if (defs) {
      const size = getResolver(defs).resolveParagraphStyle(
        ctx.value.paragraphFormatting.styleId ?? undefined
      ).runFormatting?.fontSize;
      if (size) return size / 2;
    }
    return 11;
  });

  return { currentFontFamily, currentFontSize };
}

const resolverCache = new WeakMap<StyleDefinitions, ReturnType<typeof createStyleResolver>>();

function getResolver(defs: StyleDefinitions) {
  let r = resolverCache.get(defs);
  if (!r) {
    r = createStyleResolver(defs);
    resolverCache.set(defs, r);
  }
  return r;
}
