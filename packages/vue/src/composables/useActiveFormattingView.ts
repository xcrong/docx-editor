/**
 * Active formatting view for toolbar/review targeting: the edited
 * header/footer when HF editing, else the body view (#749).
 */

import { computed, type ComputedRef, type Ref } from 'vue';
import type { EditorView } from 'prosemirror-view';
import type { HeaderFooter } from '@xcrong/docx-editor-core/types/document';
import type { HfEditState } from './usePagesPointer';

export interface UseActiveFormattingViewOptions {
  getHfEdit: () => HfEditState | null;
  getHfPmView: (hf: HeaderFooter) => EditorView | null;
  editorView: Ref<EditorView | null>;
}

export function useActiveFormattingView(
  opts: UseActiveFormattingViewOptions
): ComputedRef<EditorView | null> {
  const activeHfView = computed<EditorView | null>(() => {
    // Deferred read: `hfEdit` is destructured later in DocxEditor's setup.
    const hf = opts.getHfEdit()?.headerFooter;
    return hf ? (opts.getHfPmView(hf) ?? null) : null;
  });
  return computed<EditorView | null>(() => activeHfView.value ?? opts.editorView.value);
}
