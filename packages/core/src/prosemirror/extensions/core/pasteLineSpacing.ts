import type { LineSpacingRule } from '../../../types/document';

/**
 * Parse a CSS length value to twips.
 * Supports pt, px, in, cm, mm units. Returns undefined for unparseable values.
 *
 * Conversion factors (1 inch = 1440 twips):
 * - 1pt = 20 twips (1440/72)
 * - 1px = 15 twips (1440/96)
 * - 1cm = 567 twips (1440/2.54, rounded)
 * - 1mm = 56.7 twips (1440/25.4)
 */
export function cssLengthToTwips(value: string): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const num = parseFloat(trimmed);
  if (isNaN(num) || num === 0) return undefined;

  if (trimmed.endsWith('pt')) return Math.round(num * 20);
  if (trimmed.endsWith('px')) return Math.round(num * 15);
  if (trimmed.endsWith('in')) return Math.round(num * 1440);
  if (trimmed.endsWith('mm')) return Math.round(num * (1440 / 25.4));
  if (trimmed.endsWith('cm')) return Math.round(num * (1440 / 2.54));
  // Bare number — treat as pixels (browser computed style default)
  if (/^[\d.]+$/.test(trimmed)) return Math.round(num * 15);
  return undefined;
}

/**
 * Parse CSS line-height to twips.
 * - Unitless multiplier (e.g. "1.5"): 240 twips * multiplier (single=240)
 * - Percentage (e.g. "150%"): 240 twips * (pct/100)
 * - Absolute length (e.g. "18pt"): converted to twips directly with 'exact' rule
 *
 * Google Docs sends its own presets that don't match the 240*multiplier
 * scale: single=1.2, 1.5x=1.8, double=2.4. Snap those exact values to the
 * Word twips (240/360/480) so pasted Docs text matches our spacing commands;
 * anything else scales proportionally.
 *
 * Returns { lineSpacing, lineSpacingRule } or undefined.
 */
function googleDocsLineHeightToTwips(multiplier: number): number | undefined {
  if (multiplier === 1.2) return 240;
  if (multiplier === 1.8) return 360;
  if (multiplier === 2.4) return 480;
  return undefined;
}

export function cssLineHeightToSpacing(
  value: string
): { lineSpacing: number; lineSpacingRule: LineSpacingRule } | undefined {
  if (!value || value === 'normal') return undefined;
  const trimmed = value.trim();

  // Percentage (e.g. "150%")
  if (trimmed.endsWith('%')) {
    const pct = parseFloat(trimmed);
    if (isNaN(pct) || pct === 0) return undefined;
    const snapped = googleDocsLineHeightToTwips(pct / 100);
    return {
      lineSpacing: snapped ?? Math.round(240 * (pct / 100)),
      lineSpacingRule: 'auto',
    };
  }

  // Absolute length (has a unit like pt, px, etc.)
  if (/[a-z]/i.test(trimmed)) {
    const twips = cssLengthToTwips(trimmed);
    if (twips == null) return undefined;
    return { lineSpacing: twips, lineSpacingRule: 'exact' };
  }

  // Unitless multiplier (e.g. "1.5", "2")
  const multiplier = parseFloat(trimmed);
  if (isNaN(multiplier) || multiplier === 0) return undefined;
  const snapped = googleDocsLineHeightToTwips(multiplier);
  return {
    lineSpacing: snapped ?? Math.round(240 * multiplier),
    lineSpacingRule: 'auto',
  };
}
