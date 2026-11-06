/**
 * Hyperlink composable — owns the popup data ref and the submit /
 * remove handlers wired into the HyperlinkDialog plus the inline
 * HyperlinkPopup navigate / edit / remove actions.
 */

import { ref, type Ref } from 'vue';
import type { EditorView } from 'prosemirror-view';
import {
  setHyperlinkText,
  removeHyperlinkRange,
} from '@xcrong/docx-editor-core/prosemirror/commands';
import type { HyperlinkPopupData } from '../components/ui/hyperlinkPopupTypes';
export type { HyperlinkPopupData };

type Commands = Record<string, (...args: unknown[]) => unknown>;

export interface UseHyperlinkManagementOptions {
  editorView: Ref<EditorView | null>;
  getCommands: () => Commands;
}

export function useHyperlinkManagement(opts: UseHyperlinkManagementOptions) {
  const hyperlinkPopupData = ref<HyperlinkPopupData | null>(null);

  function handleHyperlinkSubmit(data: {
    url?: string;
    bookmark?: string;
    displayText: string;
    tooltip: string;
  }) {
    const view = opts.editorView.value;
    if (!view) return;
    const cmds = opts.getCommands();
    const { empty } = view.state.selection;
    const href = data.bookmark ? `#${data.bookmark}` : data.url;
    if (!href) return;

    if (empty && data.displayText) {
      const cmd = cmds['insertHyperlink'];
      if (cmd) {
        const command = cmd(data.displayText, href, data.tooltip || undefined) as (
          state: typeof view.state,
          dispatch: typeof view.dispatch,
          view: EditorView
        ) => boolean;
        command(view.state, (tr) => view.dispatch(tr), view);
      }
    } else {
      const cmd = cmds['setHyperlink'];
      if (cmd) {
        const command = cmd(href, data.tooltip || undefined) as (
          state: typeof view.state,
          dispatch: typeof view.dispatch,
          view: EditorView
        ) => boolean;
        command(view.state, (tr) => view.dispatch(tr), view);
      }
    }
    view.focus();
  }

  function handleHyperlinkRemove() {
    const view = opts.editorView.value;
    if (!view) return;
    const cmds = opts.getCommands();
    const cmd = cmds['removeHyperlink'];
    if (cmd) {
      const command = cmd() as (
        state: typeof view.state,
        dispatch: typeof view.dispatch,
        view: EditorView
      ) => boolean;
      command(view.state, (tr) => view.dispatch(tr), view);
    }
    view.focus();
  }

  function handleHyperlinkPopupNavigate(href: string) {
    window.open(href, '_blank', 'noopener,noreferrer');
    hyperlinkPopupData.value = null;
  }

  function handleHyperlinkPopupEdit(displayText: string, href: string) {
    const view = opts.editorView.value;
    if (!view) return;
    if (!setHyperlinkText(view.state, (tr) => view.dispatch(tr), displayText, href)) {
      hyperlinkPopupData.value = null;
      return;
    }
    hyperlinkPopupData.value = null;
    view.focus();
  }

  function handleHyperlinkPopupRemove() {
    const view = opts.editorView.value;
    if (!view) return;
    if (
      !removeHyperlinkRange(view.state, (tr) => view.dispatch(tr), hyperlinkPopupData.value?.href)
    ) {
      hyperlinkPopupData.value = null;
      return;
    }
    hyperlinkPopupData.value = null;
    view.focus();
  }

  return {
    hyperlinkPopupData,
    handleHyperlinkSubmit,
    handleHyperlinkRemove,
    handleHyperlinkPopupNavigate,
    handleHyperlinkPopupEdit,
    handleHyperlinkPopupRemove,
  };
}
