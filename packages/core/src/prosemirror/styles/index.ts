/**
 * Style utilities for ProseMirror editor
 * @packageDocumentation
 * @public
 */

export {
  StyleResolver,
  createStyleResolver,
  getSharedStyleResolver,
  resolveEffectiveFont,
} from './styleResolver';
export type { ResolvedParagraphStyle, EffectiveFontRequest, EffectiveFont } from './styleResolver';
export { resolvePreferredNewTableStyleId, DEFAULT_NEW_TABLE_LOOK } from './newTableStyle';
