import { useCallback, useEffect, useState } from 'react';
import { shouldUseSidebarOverlay } from '@xcrong/docx-editor-core/utils/sidebarConstants';
import { findChangeRange, findCommentRange } from '@xcrong/docx-editor-core/prosemirror/queries';
import type { PagedEditorRef } from '../PagedEditor';

/**
 * Comment-sidebar navigation state shared by `DocxEditor`:
 *
 * - Narrow-container overlay mode (`sidebarOverlayMode`): when the scroll
 *   container is narrower than `SIDEBAR_OVERLAY_BREAKPOINT` the sidebar
 *   floats over the document with a backdrop instead of shifting it.
 * - Card → document navigation (`handleSidebarNavigate`): clicking a
 *   sidebar card scrolls the paged view to the card's anchor WITHOUT
 *   moving the PM selection (selection stays cursor-driven; the
 *   collapsed-card click test asserts the cursor doesn't move).
 */
export function useSidebarNavigation({
  pagedEditorRef,
  scrollContainerRef,
}: {
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [sidebarOverlayMode, setSidebarOverlayMode] = useState(false);

  // The scroll container mounts after first paint, so poll for it (rAF)
  // and keep a ResizeObserver afterwards for viewport resizes.
  useEffect(() => {
    let observer: ResizeObserver | null = null;
    let raf = 0;
    let cancelled = false;
    const update = (el: HTMLDivElement) =>
      setSidebarOverlayMode(shouldUseSidebarOverlay(el.clientWidth));
    const attach = () => {
      if (cancelled) return;
      const el = scrollContainerRef.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      update(el);
      observer = new ResizeObserver(() => update(el));
      observer.observe(el);
    };
    raf = requestAnimationFrame(attach);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [scrollContainerRef]);

  const handleSidebarNavigate = useCallback(
    (itemId: string) => {
      // Plugin sidebar items (`template-tag-*`, `plugin-*`) carry no
      // document anchor — only `comment-*` / `tc-*` ids resolve to a PM
      // range via the live marks.
      if (!itemId.startsWith('comment-') && !itemId.startsWith('tc-')) return;
      const view = pagedEditorRef.current?.getView();
      if (!view) return;
      let range: { from: number; to: number } | null = null;
      if (itemId.startsWith('comment-')) {
        const id = Number(itemId.slice('comment-'.length));
        if (Number.isInteger(id)) range = findCommentRange(view, id);
      } else if (itemId.startsWith('tc-')) {
        const rev = Number(itemId.slice(3).split('-')[0]);
        if (Number.isInteger(rev)) range = findChangeRange(view, rev);
      }
      if (!range) return;
      pagedEditorRef.current?.scrollToPosition(range.from);
    },
    [pagedEditorRef]
  );

  return { sidebarOverlayMode, handleSidebarNavigate };
}
