/**
 * Zoom math shared by the React (`useWheelZoom`) and Vue (`useZoom`)
 * adapters.
 *
 * Only the arithmetic lives here — ranges, presets, and event wiring stay
 * in the adapters (their supported ranges differ: React 0.25–4.0, Vue
 * 0.5–2.0), so unifying values would change behavior.
 */

/** Default per-notch step; both adapters use 0.1. */
export const DEFAULT_ZOOM_STEP = 0.1;
/**
 * Pure clamp — does NOT round. Unlike React's legacy `clampZoom` wrapper
 * (clamp+round, i.e. `normalizeZoomLevel`), so pair with `roundZoom` /
 * `normalizeZoomLevel` when the rounded stored value is wanted.
 */
export function clampZoom(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round a zoom level to 2 decimal places. */
export function roundZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100;
}

/** Apply a raw level through clamp + round (what `setZoom` stores). */
export function normalizeZoomLevel(level: number, min: number, max: number): number {
  return roundZoom(clampZoom(level, min, max));
}

/** Step the zoom by `delta` (positive = in), clamped + rounded. */
export function stepZoom(current: number, delta: number, min: number, max: number): number {
  return normalizeZoomLevel(current + delta, min, max);
}

/** Zoom level (1.0 = 100%) as an integer percent. */
export function zoomToPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

/** Zoom-to-fit ratio for `containerWidth` showing `contentWidth` (null when empty). */
export function zoomToFitLevel(containerWidth: number, contentWidth: number): number | null {
  if (contentWidth <= 0) return null;
  return containerWidth / contentWidth;
}

/** First preset strictly above `current` (last preset when past the end). */
export function nextZoomPreset(presets: readonly number[], current: number): number {
  for (const preset of presets) {
    if (preset > current + 0.01) return preset;
  }
  return presets[presets.length - 1];
}

/** Last preset strictly below `current` (first preset when below the start). */
export function prevZoomPreset(presets: readonly number[], current: number): number {
  for (let i = presets.length - 1; i >= 0; i--) {
    if (presets[i] < current - 0.01) return presets[i];
  }
  return presets[0];
}

/** Nearest preset to `current`. */
export function nearestZoomPreset(presets: readonly number[], current: number): number {
  let nearest = presets[0];
  let minDiff = Math.abs(current - nearest);
  for (const preset of presets) {
    const diff = Math.abs(current - preset);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = preset;
    }
  }
  return nearest;
}

/** Zoom level (1.0 = 100%) as a display string (`"100%"`). */
export function formatZoomPercent(zoom: number): string {
  return `${zoomToPercent(zoom)}%`;
}

/** Parse `"120%"` / `"1.2"` to `1.2`; unparseable → `null`. */
export function parseZoomPercent(s: string): number | null {
  const match = s.match(/(\d+(\.\d+)?)/);
  if (match) {
    const value = parseFloat(match[1]);
    if (!Number.isNaN(value)) return value / 100;
  }
  return null;
}

/** Whether `zoom` matches a preset within `epsilon`. */
export function isZoomPresetLevel(
  presets: readonly number[],
  zoom: number,
  epsilon: number = 0.01
): boolean {
  return presets.some((preset) => Math.abs(preset - zoom) < epsilon);
}
