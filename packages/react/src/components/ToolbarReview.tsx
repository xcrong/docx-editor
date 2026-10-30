import { useCallback } from 'react';
import { MaterialSymbol } from './ui/Icons';
import { ToolbarButton, ToolbarGroup } from './Toolbar';
import { useTranslation } from '../i18n';

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
 * review callback. Accept/Reject act on the change at the cursor and
 * disable when the cursor is not inside one.
 */
export function ToolbarReview({
  callbacks,
  showReviewControls,
  inTrackedChange,
  disabled = false,
  onRefocusEditor,
}: {
  callbacks: ReviewCallbacks;
  showReviewControls?: boolean;
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

  const hasReviewControls =
    showReviewControls ??
    !!(
      onAcceptChange ||
      onRejectChange ||
      onAcceptAllChanges ||
      onRejectAllChanges ||
      onPreviousChange ||
      onNextChange
    );

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
