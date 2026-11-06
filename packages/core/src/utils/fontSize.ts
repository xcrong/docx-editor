/**
 * Font-size stepper math shared by React `FontSizePicker` and Vue
 * `useToolbarFontSize`.
 *
 * Both adapters step through the same preset ladder
 * (`[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]`), falling back
 * to ±1 past the ends. Bounds stay caller-supplied (React clamps the top
 * to 400; Vue leaves increase unbounded), so behavior is unchanged.
 */

/** First preset strictly above `current`, else `current + 1` clamped to `max`. */
export function nextFontSize(
  presets: readonly number[],
  current: number,
  max: number = Infinity
): number {
  for (const size of presets) {
    if (size > current) return size;
  }
  return Math.min(current + 1, max);
}

/** Last preset strictly below `current`, else `current - 1` clamped to `min`. */
export function prevFontSize(presets: readonly number[], current: number, min: number = 1): number {
  for (let i = presets.length - 1; i >= 0; i--) {
    if (presets[i] < current) return presets[i];
  }
  return Math.max(current - 1, min);
}

/** Clamp a typed size-box value into `[min, max]` (Vue: 1–1638). */
export function clampFontSizeInput(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}
