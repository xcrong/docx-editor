import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  setHyperlink,
  removeHyperlink,
  insertHyperlink,
  setHyperlinkText,
  removeHyperlinkRange,
} from '@xcrong/docx-editor-core/prosemirror/commands';
import { sanitizeHref } from '@xcrong/docx-editor-core/utils';
import type { EditorView } from 'prosemirror-view';
import type { HyperlinkData, useHyperlinkDialog } from '../../dialogs/HyperlinkDialog';
import type { HyperlinkPopupData } from '../../ui/HyperlinkPopup';

/**
 * Owns the dialog-driven hyperlink flow (insert / edit / remove) and the
 * Google-Docs-style floating popup that opens when the cursor lands on
 * an existing link. The dialog handle (`hyperlinkDialog`) is owned by
 * the parent and threaded in — Cmd/Ctrl+K in `useKeyboardShortcuts`
 * also opens it.
 */
export function useHyperlinkActions({
  hyperlinkDialog,
  getActiveEditorView,
  focusActiveEditor,
  navigateToBookmark,
}: {
  hyperlinkDialog: ReturnType<typeof useHyperlinkDialog>;
  getActiveEditorView: () => EditorView | null | undefined;
  focusActiveEditor: () => void;
  /**
   * Internal-bookmark navigation (`#name` hrefs). Returns true when the
   * bookmark resolved and the viewport moved; false/undefined keeps the
   * popup state untouched.
   */
  navigateToBookmark?: (bookmarkName: string) => boolean;
}) {
  const [hyperlinkPopupData, setHyperlinkPopupData] = useState<HyperlinkPopupData | null>(null);

  const handleHyperlinkSubmit = useCallback(
    (data: HyperlinkData) => {
      const view = getActiveEditorView();
      if (!view) return;

      const url = data.url || '';
      const tooltip = data.tooltip;
      const { empty } = view.state.selection;

      if (empty && data.displayText) {
        insertHyperlink(data.displayText, url, tooltip)(view.state, view.dispatch);
      } else if (!empty) {
        setHyperlink(url, tooltip)(view.state, view.dispatch);
      } else if (data.displayText) {
        insertHyperlink(data.displayText, url, tooltip)(view.state, view.dispatch);
      }

      hyperlinkDialog.close();
      focusActiveEditor();
    },
    [hyperlinkDialog, getActiveEditorView, focusActiveEditor]
  );

  const doRemoveHyperlink = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    removeHyperlink(view.state, view.dispatch);
    focusActiveEditor();
  }, [getActiveEditorView, focusActiveEditor]);

  const handleHyperlinkRemove = useCallback(() => {
    doRemoveHyperlink();
    hyperlinkDialog.close();
  }, [hyperlinkDialog, doRemoveHyperlink]);

  const handleHyperlinkClick = useCallback(
    (data: HyperlinkPopupData) => setHyperlinkPopupData(data),
    []
  );

  const handleHyperlinkPopupNavigate = useCallback(
    (href: string) => {
      const raw = href.trim();
      // Internal bookmark anchor (w:anchor, painted as a[href="#name"]) —
      // scroll to the bookmark instead of opening a blank tab. Unknown
      // bookmarks keep the popup open so the user can copy/edit the href.
      if (raw.startsWith('#')) {
        if (navigateToBookmark?.(raw.substring(1))) setHyperlinkPopupData(null);
        return;
      }
      const safe = sanitizeHref(raw);
      if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
    },
    [navigateToBookmark]
  );

  const handleHyperlinkPopupCopy = useCallback((href: string) => {
    navigator.clipboard.writeText(href).catch(() => {
      // Fallback for browsers without async clipboard (older Safari, embedded webviews)
      const textarea = document.createElement('textarea');
      textarea.value = href;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }, []);

  const handleHyperlinkPopupEdit = useCallback(
    (displayText: string, href: string) => {
      const view = getActiveEditorView();
      if (!view) return;

      setHyperlinkText(view.state, view.dispatch, displayText, href);

      setHyperlinkPopupData(null);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  const handleHyperlinkPopupRemove = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;

    if (!removeHyperlinkRange(view.state, view.dispatch, hyperlinkPopupData?.href)) return;

    setHyperlinkPopupData(null);
    focusActiveEditor();
    toast('Link removed');
  }, [getActiveEditorView, focusActiveEditor, hyperlinkPopupData]);

  const handleHyperlinkPopupClose = useCallback(() => {
    setHyperlinkPopupData(null);
  }, []);

  return {
    hyperlinkPopupData,
    setHyperlinkPopupData,
    handleHyperlinkSubmit,
    handleHyperlinkRemove,
    handleHyperlinkClick,
    handleHyperlinkPopupNavigate,
    handleHyperlinkPopupCopy,
    handleHyperlinkPopupEdit,
    handleHyperlinkPopupRemove,
    handleHyperlinkPopupClose,
  };
}
