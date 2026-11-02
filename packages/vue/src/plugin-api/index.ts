/**
 * @xcrong/docx-editor-vue/plugin-api
 *
 * Generic plugin interface and host component for integrating external
 * plugins with the Vue editor. Pairs with the framework-agnostic plugin
 * types exported from `@xcrong/docx-editor-core/plugin-api`.
 *
 * @example
 * ```ts
 * import { PluginHost, type EditorPlugin } from '@xcrong/docx-editor-vue/plugin-api';
 * ```
 *
 * @packageDocumentation
 * @public
 */

export { default as PluginHost } from './PluginHost.vue';
export { createRenderedDomContext, RenderedDomContextImpl } from './RenderedDomContext';

// Built-in editor plugins (mirrors `@xcrong/docx-editor-react/plugin-api`)
export {
  templatePlugin,
  createPlugin as createTemplatePlugin,
  createTemplatePlugin as createTemplateProseMirrorPlugin,
  templatePluginKey,
  getTemplateTags as getTemplatePluginTags,
  setHoveredElement,
  setSelectedElement,
  TEMPLATE_DECORATION_STYLES,
  type TemplateTag,
  type TagType,
} from '../plugins/template';
export type {
  EditorPlugin,
  EditorPluginCore,
  PanelConfig,
  PluginPanelProps,
  PositionCoordinates,
  RenderedDomContext,
  SidebarItemRenderProps,
  VueEditorPlugin,
  VueSidebarItem,
} from './types';
