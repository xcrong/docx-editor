/**
 * Highlight/Background Color Mark Extension
 */

import { createMarkExtension } from '../create';
import { setMark, removeMark } from './markUtils';
import type { ExtensionContext, ExtensionRuntime } from '../types';
import { resolveHighlightToCss } from '../../../utils/colorResolver';

/**
 * Normalize a CSS background-color value to the highlight attr format.
 * Hex / rgb() / rgba() become 6-char uppercase hex (no '#'), matching the
 * OOXML highlight shape that toDOM resolves via resolveHighlightToCss.
 * Named colors pass through so OOXML names ('yellow', 'cyan', ...) keep
 * resolving; transparent/inherit are rejected.
 * Table-cell fills are NOT text highlights — PasteStyleInlinerExtension moves
 * td/th backgrounds to data-bgcolor (read by the cell spec) and strips the
 * style before parseDOM, so this rule only sees genuine run backgrounds.
 */
function normalizeHighlightColor(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (!lower || lower === 'transparent' || lower === 'inherit' || lower === 'initial') return null;

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

  // Named OOXML highlight color (e.g. 'yellow', 'cyan', 'red') — pass
  // through so resolveHighlightToCss maps it to Word's highlight color.
  // Unknown words are dropped (fail-closed): emitting them would produce an
  // invalid `#name` CSS color via ensureHexPrefix.
  if (/^[a-zA-Z]+$/.test(trimmed)) {
    const known = [
      'black',
      'blue',
      'cyan',
      'darkBlue',
      'darkCyan',
      'darkGray',
      'darkGreen',
      'darkMagenta',
      'darkRed',
      'darkYellow',
      'green',
      'lightGray',
      'magenta',
      'red',
      'white',
      'yellow',
      'none',
    ];
    if (known.includes(trimmed)) return trimmed;
    if (known.includes(trimmed.toLowerCase())) return trimmed.toLowerCase();
  }
  return null;
}

export const HighlightExtension = createMarkExtension({
  name: 'highlight',
  schemaMarkName: 'highlight',
  markSpec: {
    attrs: {
      color: { default: 'yellow' },
    },
    parseDOM: [
      {
        tag: 'mark',
      },
      {
        style: 'background-color',
        getAttrs: (value) => {
          const color = normalizeHighlightColor(value as string);
          if (color) {
            return { color };
          }
          return false;
        },
      },
    ],
    toDOM(mark) {
      const color = mark.attrs.color as string;
      // Resolve OOXML named highlight color (e.g., 'yellow' → '#FFFF00')
      const cssColor = resolveHighlightToCss(color);
      return ['mark', { style: `background-color: ${cssColor}` }, 0];
    },
  },
  onSchemaReady(ctx: ExtensionContext): ExtensionRuntime {
    return {
      commands: {
        setHighlight: (color: string) => {
          if (!color || color === 'none') {
            return removeMark(ctx.schema.marks.highlight);
          }
          return setMark(ctx.schema.marks.highlight, { color });
        },
        clearHighlight: () => removeMark(ctx.schema.marks.highlight),
      },
    };
  },
});
