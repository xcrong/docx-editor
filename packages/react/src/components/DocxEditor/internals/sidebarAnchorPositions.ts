/**
 * Sidebar anchor positions — thin adapter wrapper.
 *
 * The kernel lives in `@xcrong/docx-editor-core/layout-bridge/anchorPositions`
 * (`computeCommentAnchorPositions`) so React and Vue share one PM+layout
 * implementation; this file only supplies React's scroll-container offset.
 */

import type { EditorView } from 'prosemirror-view';
import { computeCommentAnchorPositions } from '@xcrong/docx-editor-core/layout-bridge/anchorPositions';
import type { FlowBlock, Layout, Measure } from '@xcrong/docx-editor-core/layout-engine';
import { VIEWPORT_PADDING_TOP } from './styles';

/**
 * Compute anchor Y positions for comments/tracked-changes sidebar.
 * Returns a Map of "comment-{id}" / "revision-{revisionId}" → scroll-container Y.
 */
export function computeAnchorPositions(
  pmView: EditorView | null,
  layout: Layout,
  blocks: FlowBlock[],
  measures: Measure[],
  renderedPageGap: number
): Map<string, number> {
  return computeCommentAnchorPositions(
    pmView,
    layout,
    blocks,
    measures,
    VIEWPORT_PADDING_TOP + renderedPageGap
  );
}
