/**
 * Color & Styling Primitives
 *
 * Basic types used throughout OOXML for colors, borders, and shading.
 */

/**
 * Theme color slots from theme1.xml.
 *
 * Two spelling families exist on the wire and both are accepted here:
 * - DrawingML-style canonical names (`dk1`, `lt1`, `hlink`, …)
 * - Transitional `w:`-namespace names Word actually writes (`dark1`,
 *   `light1`, `hyperlink`, `followedHyperlink`, `text1`, `background1`, …)
 *
 * Parsers store the spelling found in the file and the serializer echoes it
 * back verbatim (byte fidelity); display resolution canonicalizes via the
 * alias map in `utils/colorResolver.ts`, so never compare these with `===`.
 */
export type ThemeColorSlot =
  | 'dk1'
  | 'lt1'
  | 'dk2'
  | 'lt2'
  | 'accent1'
  | 'accent2'
  | 'accent3'
  | 'accent4'
  | 'accent5'
  | 'accent6'
  | 'hlink'
  | 'folHlink'
  | 'dark1'
  | 'light1'
  | 'dark2'
  | 'light2'
  | 'hyperlink'
  | 'followedHyperlink'
  | 'background1'
  | 'text1'
  | 'background2'
  | 'text2';

/**
 * ECMA-376 color reference — either a direct RGB hex, a theme slot
 * reference (with optional tint/shade), or `auto` for context-dependent
 * defaults (usually black for text on light backgrounds). When both
 * `rgb` and `themeColor` are set, the theme wins on Word import and the
 * `rgb` acts as a fallback for renderers without theme support.
 *
 * See ECMA-376 §17.18.39 (`ST_ThemeColor`).
 */
export interface ColorValue {
  /** RGB hex value without # (e.g., "FF0000") */
  rgb?: string;
  /** Theme color slot reference */
  themeColor?: ThemeColorSlot;
  /** Tint modifier (0-255 as hex string, e.g., "80") - makes color lighter */
  themeTint?: string;
  /** Shade modifier (0-255 as hex string) - makes color darker */
  themeShade?: string;
  /** Auto color - context-dependent (usually black for text) */
  auto?: boolean;
}

/**
 * One side of a border — style, color, width, spacing. Used by paragraph
 * borders, table borders (per-cell or whole-table), and page borders.
 * `size` is in eighths of a point (Word's wire format); `space` is in
 * points.
 *
 * See ECMA-376 §17.18.2 (`ST_Border`).
 */
export interface BorderSpec {
  /** Border style */
  style:
    | 'none'
    | 'single'
    | 'double'
    | 'dotted'
    | 'dashed'
    | 'thick'
    | 'triple'
    | 'thinThickSmallGap'
    | 'thickThinSmallGap'
    | 'thinThickMediumGap'
    | 'thickThinMediumGap'
    | 'thinThickLargeGap'
    | 'thickThinLargeGap'
    | 'wave'
    | 'doubleWave'
    | 'dashSmallGap'
    | 'dashDotStroked'
    | 'threeDEmboss'
    | 'threeDEngrave'
    | 'outset'
    | 'inset'
    | 'nil';
  /** Color of the border */
  color?: ColorValue;
  /** Width in eighths of a point (1/8 pt) */
  size?: number;
  /** Spacing from text in points */
  space?: number;
  /** Shadow effect */
  shadow?: boolean;
  /** Frame effect */
  frame?: boolean;
}

/**
 * Cell/paragraph/run shading — Word's combined "fill + pattern overlay"
 * model. `fill` is the solid background; `color` is the pattern overlay
 * drawn on top; `pattern` selects the pattern type (defaults to
 * `'clear'` = solid `fill`, no pattern).
 *
 * See ECMA-376 §17.4.32 (`CT_Shd`).
 */
export interface ShadingProperties {
  /** Pattern fill color */
  color?: ColorValue;
  /** Background fill color */
  fill?: ColorValue;
  /** Shading pattern type */
  pattern?:
    | 'clear'
    | 'solid'
    | 'horzStripe'
    | 'vertStripe'
    | 'reverseDiagStripe'
    | 'diagStripe'
    | 'horzCross'
    | 'diagCross'
    | 'thinHorzStripe'
    | 'thinVertStripe'
    | 'thinReverseDiagStripe'
    | 'thinDiagStripe'
    | 'thinHorzCross'
    | 'thinDiagCross'
    | 'pct5'
    | 'pct10'
    | 'pct12'
    | 'pct15'
    | 'pct20'
    | 'pct25'
    | 'pct30'
    | 'pct35'
    | 'pct37'
    | 'pct40'
    | 'pct45'
    | 'pct50'
    | 'pct55'
    | 'pct60'
    | 'pct62'
    | 'pct65'
    | 'pct70'
    | 'pct75'
    | 'pct80'
    | 'pct85'
    | 'pct87'
    | 'pct90'
    | 'pct95'
    | 'nil';
}
