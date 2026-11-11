/**
 * Human-readable descriptions for run property revisions ("original → revised").
 *
 * Shared by the React (`TrackedChangeCard.tsx`) and Vue
 * (`TrackedChangeCard.vue`) sidebar cards so both adapters render the same
 * `runPropertiesChanged` label. Takes the i18n `t` function from the caller
 * so locale handling stays in the adapter layer (Chinese copy lives in the
 * locale files, not here).
 *
 * @packageDocumentation
 */

import type { TextFormatting } from '../types/document';

/** Minimal `t` shape (both adapters' `useTranslation` satisfy this). */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** Structural deep-equal for prior-vs-current field comparison. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, (b as unknown[])[i]));
  }
  if (typeof a === 'object') {
    const aRec = a as Record<string, unknown>;
    const bRec = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRec), ...Object.keys(bRec)]);
    for (const k of keys) {
      if (!deepEqual(aRec[k], bRec[k])) return false;
    }
    return true;
  }
  return false;
}

function fontName(ff: TextFormatting['fontFamily'], fallback: string): string {
  if (!ff) return fallback;
  return ff.ascii ?? ff.hAnsi ?? ff.eastAsia ?? ff.cs ?? fallback;
}

function halfPointsToPt(value: number | null | undefined, fallback: string): string {
  return value != null ? `${value / 2}pt` : fallback;
}

function colorValue(color: TextFormatting['color'], fallback: string): string {
  if (!color) return fallback;
  if (color.rgb) return `#${color.rgb.toUpperCase()}`;
  return color.themeColor ?? fallback;
}

/** A canonicalized prior snapshot (plain object; absent = was absent). */
export type RunPriorLike = { [key: string]: unknown };

/**
 * Describe a run formatting change as a localized string.
 *
 * Changed fields map to per-property keys (`Bold added`, `Font changed from
 * X to Y` …); several simultaneous changes join with `, `. A change with no
 * mappable field falls back to the generic `revisions.runPropertiesChanged`.
 */
export function describeRunPropertyChange(
  prior: TextFormatting | RunPriorLike | undefined,
  current: TextFormatting | RunPriorLike | undefined,
  t: TranslateFn
): string {
  const before = (prior ?? {}) as Record<string, unknown>;
  const after = (current ?? {}) as Record<string, unknown>;
  // Only fields whose value actually differs are named — with FULL
  // pre-edit snapshots an unchanged field is present on both sides and
  // must not be reported.
  const changed = (key: string): boolean => !deepEqual(before[key] ?? null, after[key] ?? null);
  const unset = t('revisions.runDefaultValue');
  const parts: string[] = [];

  const added = (key: string, on: unknown): void => {
    if (on === true) parts.push(t(`revisions.${key}Added`));
    else parts.push(t(`revisions.${key}Removed`));
  };

  if (changed('bold')) {
    added('runBold', after.bold);
  }
  if (changed('italic')) {
    added('runItalic', after.italic);
  }
  if (changed('underline')) {
    added('runUnderline', after.underline != null);
  }
  if (changed('strike') || changed('doubleStrike')) {
    added('runStrike', after.strike === true || after.doubleStrike === true);
  }
  if (changed('vertAlign')) {
    const v = after.vertAlign as string | null | undefined;
    if (v === 'superscript') parts.push(t('revisions.runSuperscriptApplied'));
    else if (v === 'subscript') parts.push(t('revisions.runSubscriptApplied'));
    else parts.push(t('revisions.runBaselineApplied'));
  }
  if (changed('fontFamily')) {
    parts.push(
      t('revisions.runFontChanged', {
        from: fontName(before.fontFamily as TextFormatting['fontFamily'], unset),
        to: fontName(after.fontFamily as TextFormatting['fontFamily'], unset),
      })
    );
  }
  if (changed('fontSize')) {
    parts.push(
      t('revisions.runFontSizeChanged', {
        from: halfPointsToPt(before.fontSize as number | null | undefined, unset),
        to: halfPointsToPt(after.fontSize as number | null | undefined, unset),
      })
    );
  }
  if (changed('color')) {
    parts.push(
      t('revisions.runColorChanged', {
        from: colorValue(before.color as TextFormatting['color'], unset),
        to: colorValue(after.color as TextFormatting['color'], unset),
      })
    );
  }
  if (changed('highlight')) {
    const name = (v: unknown): string => (typeof v === 'string' && v !== 'none' ? v : unset);
    parts.push(
      t('revisions.runHighlightChanged', {
        from: name(before.highlight),
        to: name(after.highlight),
      })
    );
  }

  if (parts.length === 0) return t('revisions.runPropertiesChanged');
  return parts.join(', ');
}
