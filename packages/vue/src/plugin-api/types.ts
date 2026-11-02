/**
 * Vue Plugin Interface for the DOCX Editor
 *
 * Extends the framework-agnostic EditorPluginCore with Vue-specific
 * UI rendering capabilities.
 *
 * Community contributed — contributions welcome!
 */

import type { EditorView } from 'prosemirror-view';
import type { Component, VNode } from 'vue';

// Re-export core types
export type {
  EditorPluginCore,
  PluginPanelProps,
  PanelConfig,
  RenderedDomContext,
  PositionCoordinates,
  SidebarItem,
  SidebarItemContext,
} from '@xcrong/docx-editor-core/plugin-api';

import type {
  EditorPluginCore,
  PluginPanelProps,
  RenderedDomContext,
  SidebarItem,
  SidebarItemContext,
} from '@xcrong/docx-editor-core/plugin-api';

/**
 * Render props passed to each sidebar item (mirrors React's
 * `SidebarItemRenderProps` — same contract, VNode rendering).
 */
export interface SidebarItemRenderProps {
  /** Whether this item is currently expanded/active. */
  isExpanded: boolean;
  /** Toggle expand/collapse for this item. */
  onToggleExpand: () => void;
  /** Ref callback to measure the rendered card height. */
  measureRef: (el: HTMLElement | null) => void;
}

/**
 * A sidebar item with Vue rendering, anchored to a document position.
 * Mirrors React's `ReactSidebarItem`.
 */
export interface VueSidebarItem extends SidebarItem {
  /** Render the card content. */
  render: (props: SidebarItemRenderProps) => VNode | null;
  /** Estimated height in pixels (for pre-layout before measurement). Default: 40. */
  estimatedHeight?: number;
}

/**
 * Vue-specific editor plugin interface.
 *
 * Extends EditorPluginCore with:
 * - Panel: Vue component for rendering in the annotation panel
 * - renderOverlay: Function returning VNode for overlay rendering
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface VueEditorPlugin<TState = any> extends EditorPluginCore<TState> {
  /**
   * Vue component to render in the annotation panel area.
   */
  Panel?: Component<PluginPanelProps<TState>>;

  /**
   * Render an overlay on top of the rendered pages.
   */
  renderOverlay?: (
    context: RenderedDomContext,
    state: TState,
    editorView: EditorView | null
  ) => VNode | null;

  /**
   * Provide sidebar items anchored to document positions.
   * Called whenever plugin state changes.
   * Items from all plugins are merged and laid out together in a unified sidebar.
   * Mirrors React's `getSidebarItems`.
   */
  getSidebarItems?: (state: TState | undefined, context: SidebarItemContext) => VueSidebarItem[];
}

/**
 * Canonical alias — `EditorPlugin` is `VueEditorPlugin` inside the Vue
 * adapter. The package name already encodes the framework; importing
 * `EditorPlugin` from `@xcrong/docx-editor-vue/plugin-api` reads as
 * cleanly as the React import. Mirrors React's `EditorPlugin` alias.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorPlugin<TState = any> = VueEditorPlugin<TState>;
