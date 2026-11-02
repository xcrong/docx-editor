/**
 * Outline panel visibility: the toggle, which lazily collects headings from
 * the PM doc on open. Split out of `useOutlineSidebar` (which keeps the
 * navigate handler) so `DocxEditor.vue` stays under its line cap.
 */

import type { Ref } from 'vue';
import type { EditorView } from 'prosemirror-view';
import { collectHeadings } from '@xcrong/docx-editor-core/utils/headingCollector';
import type { HeadingInfo } from '@xcrong/docx-editor-core/utils/headingCollector';

export interface UseOutlineVisibilityOptions {
  editorView: Ref<EditorView | null>;
  showOutline: Ref<boolean>;
  outlineHeadings: Ref<HeadingInfo[]>;
}

export interface UseOutlineVisibilityReturn {
  handleToggleOutline: () => void;
}

export function useOutlineVisibility(
  opts: UseOutlineVisibilityOptions
): UseOutlineVisibilityReturn {
  function handleToggleOutline() {
    if (!opts.showOutline.value) {
      // Opening: collect headings
      const view = opts.editorView.value;
      if (view) {
        opts.outlineHeadings.value = collectHeadings(view.state.doc);
      }
    }
    opts.showOutline.value = !opts.showOutline.value;
  }
  return { handleToggleOutline };
}
