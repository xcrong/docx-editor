/**
 * Shared CSS for the Vue template plugin.
 *
 * The `*.vue` ambient module (`src/shims-vue.d.ts`) declares only a default
 * export, so `tsc` can't see named exports from SFC `<script>` blocks (same
 * reason `ui.ts` re-exports list state from core instead of the SFC).
 * Style constants therefore live here in plain TypeScript, imported by both
 * the plugin factory (`index.ts`) and available to consumers. Content is
 * identical to React's `TEMPLATE_CHIP_STYLES` /
 * `TEMPLATE_HIGHLIGHT_OVERLAY_STYLES` so the injected plugin CSS paints
 * the same pixels on both adapters.
 */

/** CSS for template chips in the sidebar — identical to React's chip styles. */
export const TEMPLATE_CHIP_STYLES = `
.template-annotation-chip {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: white;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #6c757d;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  max-width: 200px;
}

.template-annotation-chip:hover,
.template-annotation-chip.hovered {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  border-color: #cbd5e1;
}

.template-annotation-chip.selected {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
}

.template-chip-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.template-chip-dot {
  font-size: 8px;
}

.template-chip-name {
  color: #334155;
  font-weight: 500;
}

.template-chip-nested {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.template-nested-var {
  font-size: 10px;
  color: #64748b;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 6px;
  border-radius: 3px;
}

.template-nested-var:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #1e40af;
}
`;

/** CSS for template highlight overlays — identical to React's overlay styles. */
export const TEMPLATE_HIGHLIGHT_OVERLAY_STYLES = `
.template-highlight-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  overflow: visible;
}

.template-highlight {
  pointer-events: auto;
  transition: background-color 0.1s ease;
}

.template-highlight:hover,
.template-highlight.hovered {
  filter: brightness(0.9);
}

.template-highlight.selected {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.6);
}
`;
