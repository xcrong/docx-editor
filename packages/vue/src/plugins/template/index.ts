/**
 * Template Plugin (Vue)
 *
 * Vue port of `packages/react/src/plugins/template/index.ts`.
 * Docxtemplater template support as a plugin for the DOCX Editor.
 *
 * Built exclusively on the framework-agnostic core contract
 * (`@xcrong/docx-editor-core/prosemirror/template/prosemirror-plugin`):
 * no React imports. UI (sidebar chips, highlight overlay) renders via
 * Vue `h()` so `renderOverlay` / `getSidebarItems` return VNodes.
 *
 * @example
 * ```ts
 * import { PluginHost, templatePlugin } from '@xcrong/docx-editor-vue/plugin-api';
 * ```
 */

import { h } from 'vue';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type {
  VueEditorPlugin,
  VueSidebarItem,
  RenderedDomContext,
  SidebarItemContext,
} from '../../plugin-api/types';
import type { TemplateTag } from '@xcrong/docx-editor-core/prosemirror/template/prosemirror-plugin';
import {
  createTemplatePlugin,
  templatePluginKey,
  setHoveredElement,
  setSelectedElement,
  TEMPLATE_DECORATION_STYLES,
} from '@xcrong/docx-editor-core/prosemirror/template/prosemirror-plugin';
import TemplateHighlightOverlay from './components/TemplateHighlightOverlay.vue';
import TemplateChip from './components/TemplateChip.vue';
import {
  TEMPLATE_CHIP_STYLES,
  TEMPLATE_HIGHLIGHT_OVERLAY_STYLES,
} from './styles';

/** Plugin state interface (mirrors the React twin). */
export interface TemplatePluginState {
  tags: TemplateTag[];
  hoveredId?: string;
  selectedId?: string;
}

function selectTag(view: EditorView | null, tags: TemplateTag[], id: string) {
  if (!view) return;
  setSelectedElement(view, id);
  const tag = tags.find((t) => t.id === id);
  if (tag) {
    const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(tag.from)));
    view.dispatch(tr);
    view.focus();
  }
}

/**
 * Create the template plugin instance.
 */
export function createPlugin(
  _options: {
    /** @deprecated — panel is no longer used; template chips render in the unified sidebar */
    defaultCollapsed?: boolean;
    /** @deprecated */
    panelPosition?: 'left' | 'right';
    /** @deprecated */
    panelWidth?: number;
  } = {}
): VueEditorPlugin<TemplatePluginState> {
  const pmPlugin = createTemplatePlugin();

  return {
    id: 'template',
    name: 'Template',

    proseMirrorPlugins: [pmPlugin],

    onStateChange: (view: EditorView): TemplatePluginState | undefined => {
      const pluginState = templatePluginKey.getState(view.state);
      if (!pluginState) return undefined;
      return {
        tags: pluginState.tags,
        hoveredId: pluginState.hoveredId,
        selectedId: pluginState.selectedId,
      };
    },

    initialize: (_view: EditorView | null): TemplatePluginState => {
      return { tags: [] };
    },

    getSidebarItems: (
      state: TemplatePluginState | undefined,
      context: SidebarItemContext
    ): VueSidebarItem[] => {
      if (!state || state.tags.length === 0) return [];

      const visibleTags = state.tags.filter((t) => t.type !== 'sectionEnd' && !t.insideSection);

      return visibleTags.map((tag) => ({
        id: `template-${tag.id}`,
        anchorPos: tag.from,
        priority: 10,
        estimatedHeight: 32,
        render: ({ measureRef }) =>
          h(TemplateChip, {
            tag,
            isHovered: tag.id === state.hoveredId,
            measureRef,
            onHover: (id: string | undefined) => {
              if (context.editorView) setHoveredElement(context.editorView, id);
            },
            onSelect: (id: string) => selectTag(context.editorView, state.tags, id),
          }),
      }));
    },

    renderOverlay: (
      context: RenderedDomContext,
      state: TemplatePluginState | undefined,
      editorView: EditorView | null
    ) => {
      if (!state || state.tags.length === 0) return null;

      return h(TemplateHighlightOverlay, {
        context,
        tags: state.tags,
        hoveredId: state.hoveredId,
        selectedId: state.selectedId,
        onHover: (id: string | undefined) => {
          if (editorView) setHoveredElement(editorView, id);
        },
        onSelect: (id: string) => selectTag(editorView, state.tags, id),
      });
    },

    styles: `
${TEMPLATE_DECORATION_STYLES}
${TEMPLATE_CHIP_STYLES}
${TEMPLATE_HIGHLIGHT_OVERLAY_STYLES}
`,
  };
}

/**
 * Default template plugin instance.
 */
export const templatePlugin = createPlugin();

// Re-export types and utilities (mirrors the React subpath surface)
export type { TemplateTag, TagType } from '@xcrong/docx-editor-core/prosemirror/template/prosemirror-plugin';
export {
  createTemplatePlugin,
  templatePluginKey,
  getTemplateTags,
  setHoveredElement,
  setSelectedElement,
  TEMPLATE_DECORATION_STYLES,
} from '@xcrong/docx-editor-core/prosemirror/template/prosemirror-plugin';
