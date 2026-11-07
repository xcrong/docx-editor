/**
 * useZoom — Vue composable for document zoom control.
 *
 * Provides zoom state, keyboard/wheel handlers, presets, and an
 * `installShortcuts()` helper that wires global Ctrl+= / Ctrl+- /
 * Ctrl+0 keyboard shortcuts (matches React's useWheelZoom contract).
 */

import { ref, computed, onMounted, onBeforeUnmount, type Ref, type ComputedRef } from 'vue';
import {
  clampZoom,
  normalizeZoomLevel,
  stepZoom,
  zoomToPercent,
  DEFAULT_ZOOM_STEP,
} from '@xcrong/docx-editor-core/utils/zoom';

// Range + presets match React (Toolbar.tsx minZoom=0.5/maxZoom=2 +
// ZoomControl DEFAULT_ZOOM_LEVELS) so both adapters offer the same zoom levels.
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = DEFAULT_ZOOM_STEP;
const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export interface UseZoomReturn {
  zoom: Ref<number>;
  zoomPercent: ComputedRef<number>;
  isMinZoom: ComputedRef<boolean>;
  isMaxZoom: ComputedRef<boolean>;
  setZoom: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  handleWheel: (e: WheelEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  installShortcuts: () => void;
  ZOOM_PRESETS: number[];
}

export function useZoom(initialZoom = 1.0): UseZoomReturn {
  const zoom = ref(clampZoom(initialZoom, MIN_ZOOM, MAX_ZOOM));

  const zoomPercent = computed(() => zoomToPercent(zoom.value));
  const isMinZoom = computed(() => zoom.value <= MIN_ZOOM);
  const isMaxZoom = computed(() => zoom.value >= MAX_ZOOM);

  function setZoom(level: number) {
    zoom.value = normalizeZoomLevel(level, MIN_ZOOM, MAX_ZOOM);
  }

  function zoomIn() {
    zoom.value = stepZoom(zoom.value, ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
  }

  function zoomOut() {
    zoom.value = stepZoom(zoom.value, -ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
  }

  function resetZoom() {
    setZoom(1.0);
  }

  function handleWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Only Mod+= / Mod+- / Mod+0 — never with Shift or Alt held. Without
    // this guard the handler also fires on Cmd+Shift+= (which on US
    // keyboards produces e.key === '+') and swallows every Mod+Shift+key
    // shortcut PM ships (bold-toggle on Mod-Shift-B, etc.).
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.shiftKey || e.altKey) return;
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      zoomIn();
    } else if (e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      resetZoom();
    }
  }

  /**
   * Auto-install the global keyboard shortcuts. Mirrors React's
   * useWheelZoom default behaviour. The wheel listener is *not*
   * auto-installed — host components attach `handleWheel` to the
   * specific scroll container (avoids hijacking unrelated trackpad
   * gestures elsewhere on the page).
   */
  function installShortcuts() {
    onMounted(() => document.addEventListener('keydown', handleKeyDown));
    onBeforeUnmount(() => document.removeEventListener('keydown', handleKeyDown));
  }

  return {
    zoom,
    zoomPercent,
    isMinZoom,
    isMaxZoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    handleWheel,
    handleKeyDown,
    installShortcuts,
    ZOOM_PRESETS,
  };
}
