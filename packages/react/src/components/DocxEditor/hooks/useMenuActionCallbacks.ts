import { useCallback } from 'react';
import type { EditorView } from 'prosemirror-view';
import { resolveLinkDialogTarget } from '@xcrong/docx-editor-core/prosemirror/commands';
import type { useHyperlinkDialog } from '../../dialogs/HyperlinkDialog';

/**
 * Menu-action callbacks for the context menu (comment + hyperlink rows).
 *
 * Extracted from `DocxEditor.tsx` to respect its line cap; behavior is
 * unchanged. The comment fan-out stays here (next to the other menu
 * actions) rather than in `useContextMenus`, which only owns menu
 * surfaces, not comment state.
 */
export function useMenuActionCallbacks({
  getActiveEditorView,
  hyperlinkDialog,
  setCommentSelectionRange,
  setAddCommentYPosition,
  setShowCommentsSidebar,
  setIsAddingComment,
  setFloatingCommentBtn,
}: {
  getActiveEditorView: () => EditorView | null | undefined;
  hyperlinkDialog: ReturnType<typeof useHyperlinkDialog>;
  setCommentSelectionRange: (range: { from: number; to: number } | null) => void;
  setAddCommentYPosition: (yPos: number | null) => void;
  setShowCommentsSidebar: (show: boolean) => void;
  setIsAddingComment: (adding: boolean) => void;
  setFloatingCommentBtn: (btn: { top: number; left: number } | null) => void;
}) {
  const onAddComment = useCallback(
    ({ from, to, yPos }: { from: number; to: number; yPos: number | null }) => {
      setCommentSelectionRange({ from, to });
      setAddCommentYPosition(yPos);
      setShowCommentsSidebar(true);
      setIsAddingComment(true);
      setFloatingCommentBtn(null);
    },
    [
      setCommentSelectionRange,
      setAddCommentYPosition,
      setShowCommentsSidebar,
      setIsAddingComment,
      setFloatingCommentBtn,
    ]
  );

  const onInsertLink = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    const target = resolveLinkDialogTarget(view.state);
    if (target.mode === 'edit') {
      hyperlinkDialog.openEdit({
        url: target.href,
        displayText: target.displayText,
        tooltip: target.tooltip,
      });
    } else {
      hyperlinkDialog.openInsert(target.displayText);
    }
  }, [getActiveEditorView, hyperlinkDialog]);

  const onEditLink = useCallback(
    (href: string, displayText: string) => {
      hyperlinkDialog.openEdit({ url: href, displayText });
    },
    [hyperlinkDialog]
  );

  return { onAddComment, onInsertLink, onEditLink };
}
