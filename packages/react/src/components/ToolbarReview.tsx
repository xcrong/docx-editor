import { useCallback } from 'react';
import { MaterialSymbol } from './ui/Icons';
import { ToolbarButton, ToolbarGroup } from './Toolbar';
import { useTranslation } from '../i18n';
import type { EditorMode } from './DocxEditor/internals/editing-modes';

/** Review icon size — matches the rail's icon scale. */
const ICON_SIZE = 20;

export interface ReviewCallbacks {
  onAcceptChange?: () => void;
  onRejectChange?: () => void;
  onAcceptAllChanges?: () => void;
  onRejectAllChanges?: () => void;
  onPreviousChange?: () => void;
  onNextChange?: () => void;
}

/**
 * Tracked-changes review group (7.6/7.7). Visible when the host wires any
 * review callback — except in `'viewing'` mode or when the comments sidebar
 * is closed (`commentsSidebarOpen === false`), when the buttons would be
 * dead UI. An explicit `showReviewControls` overrides both rules. Accept /
 * Reject act on the change at the cursor and disable when not inside one.
 */
export function ToolbarReview({
  callbacks,
  showReviewControls,
  editingMode,
  commentsSidebarOpen,
  inTrackedChange,
  disabled = false,
  onRefocusEditor,
}: {
  callbacks: ReviewCallbacks;
  showReviewControls?: boolean;
  /**
   * Current editing mode. `'viewing'` hides the group (read-only); any
   * other mode (or omission, for standalone `<Toolbar>` use) falls back
   * to the callback-sniffing rule. Explicit `showReviewControls` wins.
   */
  editingMode?: EditorMode;
  /**
   * Whether the comments sidebar is open. `false` hides the group (review
   * actions live next to the change cards); omission keeps #112 behavior.
   * Explicit `showReviewControls` wins.
   */
  commentsSidebarOpen?: boolean;
  inTrackedChange: boolean;
  disabled?: boolean;
  onRefocusEditor?: () => void;
}) {
  const { t } = useTranslation();
  const {
    onAcceptChange,
    onRejectChange,
    onAcceptAllChanges,
    onRejectAllChanges,
    onPreviousChange,
    onNextChange,
  } = callbacks;

  const hasCallbacks = !!(
    onAcceptChange ||
    onRejectChange ||
    onAcceptAllChanges ||
    onRejectAllChanges ||
    onPreviousChange ||
    onNextChange
  );
  const hasReviewControls =
    showReviewControls ??
    (hasCallbacks && editingMode !== 'viewing' && commentsSidebarOpen !== false);

  const wrap = useCallback(
    (fn?: () => void) => () => {
      if (!disabled && fn) {
        fn();
        requestAnimationFrame(() => onRefocusEditor?.());
      }
    },
    [disabled, onRefocusEditor]
  );

  if (!hasReviewControls) return null;

  return (
    <ToolbarGroup label={t('toolbar.reviewGroup')}>
      {onPreviousChange && (
        <ToolbarButton
          onClick={wrap(onPreviousChange)}
          disabled={disabled}
          title={t('toolbar.reviewPrevious')}
          ariaLabel={t('toolbar.reviewPrevious')}
          testId="prev-change"
        >
          <MaterialSymbol name="keyboard_arrow_up" size={ICON_SIZE} />
        </ToolbarButton>
      )}
      {onNextChange && (
        <ToolbarButton
          onClick={wrap(onNextChange)}
          disabled={disabled}
          title={t('toolbar.reviewNext')}
          ariaLabel={t('toolbar.reviewNext')}
          testId="next-change"
        >
          <MaterialSymbol name="keyboard_arrow_down" size={ICON_SIZE} />
        </ToolbarButton>
      )}
      {onAcceptChange && (
        <ToolbarButton
          onClick={wrap(onAcceptChange)}
          disabled={disabled || !inTrackedChange}
          title={t('toolbar.reviewAccept')}
          ariaLabel={t('toolbar.reviewAccept')}
          testId="accept-change"
        >
          <MaterialSymbol name="check" size={ICON_SIZE} />
        </ToolbarButton>
      )}
      {onRejectChange && (
        <ToolbarButton
          onClick={wrap(onRejectChange)}
          disabled={disabled || !inTrackedChange}
          title={t('toolbar.reviewReject')}
          ariaLabel={t('toolbar.reviewReject')}
          testId="reject-change"
        >
          <MaterialSymbol name="close" size={ICON_SIZE} />
        </ToolbarButton>
      )}
      {onAcceptAllChanges && (
        <ToolbarButton
          onClick={wrap(onAcceptAllChanges)}
          disabled={disabled}
          title={t('toolbar.reviewAcceptAll')}
          ariaLabel={t('toolbar.reviewAcceptAll')}
          testId="accept-all"
        >
          <MaterialSymbol name="done_all" size={ICON_SIZE} />
        </ToolbarButton>
      )}
      {onRejectAllChanges && (
        <ToolbarButton
          onClick={wrap(onRejectAllChanges)}
          disabled={disabled}
          title={t('toolbar.reviewRejectAll')}
          ariaLabel={t('toolbar.reviewRejectAll')}
          testId="reject-all"
        >
          <MaterialSymbol name="delete_sweep" size={ICON_SIZE} />
        </ToolbarButton>
      )}
    </ToolbarGroup>
  );
}
