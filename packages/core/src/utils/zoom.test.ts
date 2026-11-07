import { describe, expect, test } from 'bun:test';
import {
  clampZoom,
  roundZoom,
  normalizeZoomLevel,
  stepZoom,
  zoomToPercent,
  zoomToFitLevel,
  nextZoomPreset,
  prevZoomPreset,
  nearestZoomPreset,
  formatZoomPercent,
  parseZoomPercent,
  isZoomPresetLevel,
  DEFAULT_ZOOM_STEP,
} from './zoom';

const PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

describe('zoom math (shared React/Vue contract)', () => {
  test('clamp + round compose into normalize', () => {
    expect(clampZoom(5, 0.5, 2)).toBe(2);
    expect(roundZoom(1.235)).toBe(1.24);
    expect(normalizeZoomLevel(1.235, 0.5, 2)).toBe(1.24);
    expect(normalizeZoomLevel(-1, 0.5, 2)).toBe(0.5);
  });

  test('step applies delta then normalizes', () => {
    expect(stepZoom(1, DEFAULT_ZOOM_STEP, 0.5, 2)).toBe(1.1);
    expect(stepZoom(2, DEFAULT_ZOOM_STEP, 0.5, 2)).toBe(2);
    expect(stepZoom(0.5, -DEFAULT_ZOOM_STEP, 0.5, 2)).toBe(0.5);
  });

  test('percent / fit', () => {
    expect(zoomToPercent(1)).toBe(100);
    expect(zoomToFitLevel(800, 400)).toBe(2);
    expect(zoomToFitLevel(800, 0)).toBeNull();
  });

  test('preset walk with epsilon hysteresis', () => {
    expect(nextZoomPreset(PRESETS, 1.0)).toBe(1.25);
    expect(prevZoomPreset(PRESETS, 1.0)).toBe(0.75);
    expect(nextZoomPreset(PRESETS, 2.0)).toBe(2.0);
    expect(prevZoomPreset(PRESETS, 0.5)).toBe(0.5);
    expect(nearestZoomPreset(PRESETS, 1.1)).toBe(1.0);
  });

  test('format / parse / membership round-trip', () => {
    expect(formatZoomPercent(1.5)).toBe('150%');
    expect(parseZoomPercent('150%')).toBe(1.5);
    expect(parseZoomPercent('n/a')).toBeNull();
    expect(isZoomPresetLevel(PRESETS, 1.0)).toBe(true);
    expect(isZoomPresetLevel(PRESETS, 1.1)).toBe(false);
  });
});
