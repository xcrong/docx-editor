/**
 * Tracked Change Mark Extensions — insertion and deletion marks, plus the
 * run-level property-revision mark.
 *
 * Renders insertions with green underline and deletions with red strikethrough,
 * matching the standard MS Word display for tracked changes. `revision_change`
 * carries a run `w:rPrChange` snapshot (Phase 3, issue #83) — run only, never
 * the paragraph-mark `CT_ParaRPrChange` (that rides `paraRPrChange`).
 */

import { createMarkExtension } from '../create';
import type { TextFormatting } from '../../../types/document';

/**
 * Canonical prior snapshot for a `revision_change` mark.
 *
 * Sorted keys keep `getMarkSetKey` stable so adjacent same-revision text
 * coalesces on save; frozen so attach paths can't mutate a shared snapshot;
 * interned so adjacency checks fast-path on reference equality.
 */
const priorIntern = new Map<string, TextFormatting>();

export function canonicalizeRunPrior(prior: TextFormatting | null | undefined): TextFormatting {
  const source = (prior ?? {}) as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = source[key];
  }
  const frozen = Object.freeze(sorted) as TextFormatting;
  const cacheKey = JSON.stringify(sorted);
  const interned = priorIntern.get(cacheKey);
  if (interned) return interned;
  // Bound the intern table — priors are small but a long session could mint
  // many distinct ones; evict oldest when over budget.
  if (priorIntern.size > 500) {
    const oldest = priorIntern.keys().next().value;
    if (oldest !== undefined) priorIntern.delete(oldest);
  }
  priorIntern.set(cacheKey, frozen);
  return frozen;
}

/**
 * Insertion mark — text added in tracked changes
 * Renders with green color and underline.
 */
export const InsertionExtension = createMarkExtension({
  name: 'insertion',
  schemaMarkName: 'insertion',
  markSpec: {
    attrs: {
      revisionId: { default: 0 },
      author: { default: '' },
      date: { default: null },
      // True only when parsed from `<w:moveTo>`. The serializer uses this to
      // emit `<w:moveFrom>`/`<w:moveTo>` faithfully; without it, an
      // insertion + deletion that happen to share a `w:id` (not unique
      // per ECMA-376) would be silently flipped into a move pair on save.
      isMovePair: { default: false },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'span.docx-insertion',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            revisionId: parseInt(el.dataset.revisionId || '0', 10),
            author: el.dataset.author || '',
            date: el.dataset.date || null,
            isMovePair: el.dataset.movePair === 'true',
          };
        },
      },
    ],
    toDOM(mark) {
      return [
        'span',
        {
          class: 'docx-insertion',
          'data-revision-id': String(mark.attrs.revisionId),
          'data-author': mark.attrs.author,
          ...(mark.attrs.date ? { 'data-date': mark.attrs.date } : {}),
          ...(mark.attrs.isMovePair ? { 'data-move-pair': 'true' } : {}),
          style: 'color: #2e7d32;',
        },
        0,
      ];
    },
  },
});

/**
 * Run property-revision mark — a tracked `w:rPrChange` on a run
 * (Phase 3, issue #83). Carries `{ revisionId, author, date, prior }` where
 * `prior` is the canonicalized pre-change `TextFormatting` snapshot.
 *
 * One mark per text node, but a node can accumulate SEVERAL sessions
 * (formatting, then formatting again): earlier sessions ride in
 * `priorStack` (oldest-first, excluding the latest) so every session keeps
 * its own prior and reject-all restores the original newest-first. The
 * serializer writes the whole stack back as stacked `w:rPrChange` entries,
 * so multi-entry runs round-trip losslessly.
 *
 * Run ONLY: never used for paragraph-mark `CT_ParaRPrChange` (that rides the
 * paragraph `paraRPrChange` attr — wiring it here would write to the wrong
 * schema position on save).
 */
export const RevisionChangeExtension = createMarkExtension({
  name: 'revision_change',
  schemaMarkName: 'revision_change',
  markSpec: {
    attrs: {
      revisionId: { default: 0 },
      author: { default: '' },
      date: { default: null },
      prior: { default: null },
      priorStack: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'span.ep-revision-change',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            revisionId: parseInt(el.dataset.revisionId || '0', 10),
            author: el.dataset.author || '',
            date: el.dataset.date || null,
            prior: null,
            priorStack: null,
          };
        },
      },
    ],
    toDOM(mark) {
      return [
        'span',
        {
          class: 'ep-revision-change',
          'data-revision-id': String(mark.attrs.revisionId),
          'data-author': mark.attrs.author,
          ...(mark.attrs.date ? { 'data-date': mark.attrs.date } : {}),
        },
        0,
      ];
    },
  },
});

/**
 * One stacked earlier session on a `revision_change` mark (everything but
 * the latest, oldest-first).
 */
export interface RevisionChangeStackEntry {
  revisionId: number;
  author: string;
  date: string | null;
  prior: TextFormatting | null;
}

/**
 * Deletion mark — text removed in tracked changes
 * Renders with red color and strikethrough.
 */
export const DeletionExtension = createMarkExtension({
  name: 'deletion',
  schemaMarkName: 'deletion',
  markSpec: {
    attrs: {
      revisionId: { default: 0 },
      author: { default: '' },
      date: { default: null },
      // True only when parsed from `<w:moveFrom>`. See InsertionExtension
      // above for the rationale — id coincidence is not a reliable signal.
      isMovePair: { default: false },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'span.docx-deletion',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            revisionId: parseInt(el.dataset.revisionId || '0', 10),
            author: el.dataset.author || '',
            date: el.dataset.date || null,
            isMovePair: el.dataset.movePair === 'true',
          };
        },
      },
    ],
    toDOM(mark) {
      return [
        'span',
        {
          class: 'docx-deletion',
          'data-revision-id': String(mark.attrs.revisionId),
          'data-author': mark.attrs.author,
          ...(mark.attrs.date ? { 'data-date': mark.attrs.date } : {}),
          ...(mark.attrs.isMovePair ? { 'data-move-pair': 'true' } : {}),
          style: 'color: #c62828;',
        },
        0,
      ];
    },
  },
});
