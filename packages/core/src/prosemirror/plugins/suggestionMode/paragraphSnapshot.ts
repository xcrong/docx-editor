/**
 * Paragraph-property snapshotter for suggesting-mode property commands.
 *
 * Phase 1 (T27-02) slice of the snapshot-and-restore infrastructure whose
 * core (`withSuggestingSnapshot` / `freezePriorEntry` / `clearNoOpEntries`)
 * lives in `./snapshot.ts`. Element-specific command sites (alignment,
 * indent, line spacing, style, section break) wrap their implementation with
 * {@link withSuggestingSnapshot} and supply this snapshotter so the first
 * edit in a revision session freezes the prior paragraph formatting as a
 * `w:pPrChange` entry; a later edit in the same session never overwrites it.
 *
 * Prior shape follows `ListExtension.appendParagraphPropertyChange`
 * (only the fields that actually changed), so reject paths and the
 * serializer see the same minimal entry regardless of which command
 * authored it. `w:sectPr`-carried section breaks (`sectionBreakType`)
 * travel in the same entry under a cast — `ParagraphFormatting` has no
 * such field, and the paragraph serializer ignores unknown prior keys on
 * write, so the marker round-trips in-memory and degrades to a plain
 * (prior-less) marker on save until `sectPrChange` authoring lands.
 *
 * @packageDocumentation
 */

import type { ParagraphFormatting } from '../../../types/document';
import type { ParagraphPropertyChange } from '../../../types/content/trackedChange';
import type { RevisionInfo } from '../../../types/content/trackedChange';
import { clearNoOpEntries, freezePriorEntry, type PropertySnapshotter } from './snapshot';

/**
 * Paragraph attrs that mirror `ParagraphFormatting` 1:1 and are restorable
 * verbatim by `restoreParagraphPriorProperties`. `sectionBreakType` is NOT a
 * `ParagraphFormatting` field — it is captured alongside under a cast (see
 * module docs) so section-break edits are tracked too.
 */
const PARAGRAPH_SNAPSHOT_FIELDS = [
  'alignment',
  'spaceBefore',
  'spaceAfter',
  'lineSpacing',
  'lineSpacingRule',
  'beforeAutospacing',
  'afterAutospacing',
  'spacingExplicit',
  'indentLeft',
  'indentRight',
  'indentFirstLine',
  'hangingIndent',
  'styleId',
  'borders',
  'shading',
  'tabs',
  'pageBreakBefore',
  'keepNext',
  'keepLines',
  'contextualSpacing',
  'bidi',
  'outlineLevel',
  'numPr',
  'sectionBreakType',
] as const;

/** Structural deep-equal for prior-vs-current formatting comparison. */
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
    const aKeys = Object.keys(aRec);
    const bKeys = Object.keys(bRec);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (k) => Object.prototype.hasOwnProperty.call(bRec, k) && deepEqual(aRec[k], bRec[k])
    );
  }
  return false;
}

function readSnapshotFormat(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of PARAGRAPH_SNAPSHOT_FIELDS) {
    out[f] = (attrs[f] as unknown) ?? null;
  }
  return out;
}

/**
 * An entry is a no-op when every field its prior snapshot pins still equals
 * the current value. An entry with an EMPTY prior (a round-tripped bare
 * `<w:pPr/>`, see issue #634) is a no-op only when the paragraph is itself
 * entirely default — otherwise the change it records is still real.
 */
function isEntryNoOp(entry: ParagraphPropertyChange, current: Record<string, unknown>): boolean {
  const prior = (entry.previousFormatting ?? {}) as Record<string, unknown>;
  const keys = Object.keys(prior);
  if (keys.length === 0) {
    return PARAGRAPH_SNAPSHOT_FIELDS.every((f) => current[f] == null);
  }
  return keys.every((k) => deepEqual(prior[k], current[k]));
}

interface CapturedParagraph {
  pos: number;
  prior: Record<string, unknown>;
}

/**
 * Snapshotter for paragraph-property commands: captures the pre-edit
 * formatting of every paragraph in the command's selection range, then
 * merges frozen priors into the command's transaction (one undo step).
 */
export const paragraphPropertySnapshotter: PropertySnapshotter<CapturedParagraph[]> = {
  capturePrior(state) {
    const { $from, $to } = state.selection;
    const captured: CapturedParagraph[] = [];
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (node.type.name === 'paragraph') {
        captured.push({ pos, prior: readSnapshotFormat(node.attrs as Record<string, unknown>) });
      }
    });
    return captured;
  },

  attachSnapshots(captured, _state, tr, session: RevisionInfo) {
    for (const { pos, prior } of captured) {
      const mapped = tr.mapping.map(pos);
      const node = tr.doc.nodeAt(mapped);
      if (!node || node.type.name !== 'paragraph') continue;
      const current = readSnapshotFormat(node.attrs as Record<string, unknown>);

      // Minimal prior: only fields that actually changed, matching the
      // `ListExtension` entry shape. A command that changed nothing mints no
      // entry at all (Word's no-op net change ⇒ no revision).
      const changedPrior: Record<string, unknown> = {};
      for (const f of PARAGRAPH_SNAPSHOT_FIELDS) {
        if (!deepEqual(prior[f], current[f])) changedPrior[f] = prior[f];
      }
      if (Object.keys(changedPrior).length === 0) continue;
      const existing = Array.isArray(node.attrs.pPrChange)
        ? (node.attrs.pPrChange as ParagraphPropertyChange[])
        : null;
      const sessionEntry: ParagraphPropertyChange = {
        type: 'paragraphPropertyChange',
        info: { id: session.revisionId, author: session.author, date: session.date ?? undefined },
        previousFormatting: changedPrior as ParagraphFormatting,
      };
      const frozen = freezePriorEntry(existing, session, () => sessionEntry);
      // `clearNoOpEntries` drops same-session entries whose prior now equals
      // current (no-op net change ⇒ no revision) and reverts stale entries
      // from earlier sessions that the edit undid.
      const cleaned = clearNoOpEntries(frozen, (e) => isEntryNoOp(e, current));
      tr.setNodeMarkup(mapped, undefined, { ...node.attrs, pPrChange: cleaned });
    }
  },
};
