/**
 * Text Color Mark Extension
 */

import { createMarkExtension } from '../create';
import { setMark, removeMark } from './markUtils';
import { textToStyle } from '../../../utils/formatToStyle';
import type { TextColorAttrs } from '../../schema/marks';
import type { ExtensionContext, ExtensionRuntime } from '../types';

/**
 * Parse a CSS color value (hex, rgb(), rgba()) to a 6-char uppercase hex string.
 * Returns null for transparent/inherit/unparseable values. rgba() with zero
 * alpha is treated as transparent. Used at the paste trust boundary so colors
 * pasted from Google Docs (which sends `rgb(...)`) survive as textColor marks.
 */
function parseCssColorToRgbHex(colorValue: string): string | null {
  if (!colorValue) return null;
  const trimmed = colorValue.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'transparent' || lower === 'inherit' || lower === 'initial') return null;

  const hexMatch = trimmed.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return hex
        .split('')
        .map((c) => c + c)
        .join('')
        .toUpperCase();
    }
    return hex.toUpperCase();
  }

  const rgbMatch = trimmed.match(
    /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (rgbMatch) {
    const alpha = rgbMatch[4] === undefined ? 1 : parseFloat(rgbMatch[4]);
    if (isNaN(alpha) || alpha <= 0) return null;
    const clamp = (v: string) => Math.max(0, Math.min(255, parseInt(v, 10)));
    const toHex = (v: string) => clamp(v).toString(16).padStart(2, '0').toUpperCase();
    return `${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  return null;
}

export const TextColorExtension = createMarkExtension({
  name: 'textColor',
  schemaMarkName: 'textColor',
  markSpec: {
    attrs: {
      rgb: { default: null },
      themeColor: { default: null },
      themeTint: { default: null },
      themeShade: { default: null },
    },
    parseDOM: [
      {
        style: 'color',
        getAttrs: (value) => {
          const hex = parseCssColorToRgbHex(value as string);
          if (hex) {
            return { rgb: hex };
          }
          return false;
        },
      },
    ],
    toDOM(mark) {
      const attrs = mark.attrs as TextColorAttrs;
      const style = textToStyle({ color: attrs });
      const cssString = style.color ? `color: ${style.color}` : '';
      return ['span', { style: cssString }, 0];
    },
  },
  onSchemaReady(ctx: ExtensionContext): ExtensionRuntime {
    return {
      commands: {
        setTextColor: (attrs: TextColorAttrs) => {
          if (!attrs.rgb && !attrs.themeColor) {
            return removeMark(ctx.schema.marks.textColor);
          }
          return setMark(ctx.schema.marks.textColor, attrs as Record<string, unknown>);
        },
        clearTextColor: () => removeMark(ctx.schema.marks.textColor),
      },
    };
  },
});
