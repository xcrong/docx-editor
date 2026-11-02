import { useCallback } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  acceptChange,
  rejectChange,
  acceptChangeById,
  rejectChangeById,
  acceptAllChanges,
  rejectAllChanges,
  findNextChange,
  findPreviousChange,
} from '@xcrong/docx-editor-core/prosemirror/commands';
import type { PagedEditorRef } from '../PagedEditor';

/** Union all mark sources at the cursor: at a mark boundary `$from.marks()` reports the right side, but a just-typed insertion sits to the left. */
function cursorChangeMarks(view: EditorView) {
  const $from = view.state.selection.$from;
  return [
    ...(view.state.storedMarks ?? []),
    ...($from.nodeAfter?.marks ?? []),
    ...($from.nodeBefore?.marks ?? []),
    ...$from.marks(),
  ];
}

function resolveAtCursor(view: EditorView, action: 'accept' | 'reject') {
  const { from } = view.state.selection;
  for (const mark of cursorChangeMarks(view)) {
    if (
      (mark.type.name === 'insertion' || mark.type.name === 'deletion') &&
      typeof mark.attrs.revisionId === 'number'
    ) {
      const cmd =
        action === 'accept'
          ? acceptChangeById(mark.attrs.revisionId)
          : rejectChangeById(mark.attrs.revisionId);
      cmd(view.state, view.dispatch);
      return;
    }
  }
  const fallback = action === 'accept' ? acceptChange(from, from) : rejectChange(from, from);
  fallback(view.state, view.dispatch);
}

/**
 * Tracked-changes review toolbar actions (7.6/7.7). Accept/Reject act on
 * the change under the active editor's cursor; the buttons disable via
 * SelectionFormatting.inInsertion/inDeletion when there is none.
 */
export function useReviewActions({
  getActiveEditorView,
  pagedEditorRef,
}: {
  getActiveEditorView: () => EditorView | null | undefined;
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
}) {
  const getReviewView = useCallback(() => getActiveEditorView() ?? null, [getActiveEditorView]);

  const handleReviewAcceptChange = useCallback(() => {
    const view = getReviewView();
    if (view) resolveAtCursor(view, 'accept');
  }, [getReviewView]);

  const handleReviewRejectChange = useCallback(() => {
    const view = getReviewView();
    if (view) resolveAtCursor(view, 'reject');
  }, [getReviewView]);

  const handleReviewAcceptAllChanges = useCallback(() => {
    const view = getReviewView();
    if (view) acceptAllChanges()(view.state, view.dispatch);
  }, [getReviewView]);

  const handleReviewRejectAllChanges = useCallback(() => {
    const view = getReviewView();
    if (view) rejectAllChanges()(view.state, view.dispatch);
  }, [getReviewView]);

  const handleReviewNavigateChange = useCallback(
    (direction: 'next' | 'prev') => {
      const view = getReviewView();
      if (!view) return;
      const { from } = view.state.selection;
      const range =
        direction === 'next'
          ? findNextChange(view.state, from)
          : findPreviousChange(view.state, from);
      if (!range) return;
      pagedEditorRef.current?.scrollToPosition(range.from);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to))
      );
      view.focus();
    },
    [getReviewView, pagedEditorRef]
  );

  const handleReviewPreviousChange = useCallback(
    () => handleReviewNavigateChange('prev'),
    [handleReviewNavigateChange]
  );

  const handleReviewNextChange = useCallback(
    () => handleReviewNavigateChange('next'),
    [handleReviewNavigateChange]
  );

  return {
    handleReviewAcceptChange,
    handleReviewRejectChange,
    handleReviewAcceptAllChanges,
    handleReviewRejectAllChanges,
    handleReviewPreviousChange,
    handleReviewNextChange,
  };
}
