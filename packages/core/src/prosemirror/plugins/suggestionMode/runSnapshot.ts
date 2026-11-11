/**
 * Run-property snapshotter for suggesting-mode formatting commands.
 *
 * Phase 3 (issue #83) slice of the snapshot-and-restore infrastructure whose
 * core (`withSuggestingSnapshot` / `freezePriorEntry` / `clearNoOpEntries`)
 * lives in `./snapshot.ts`. Formatting commands (bold, italic, font, size,
 * color, highlight, strike, super/subscript, underline) wrap their
 * implementation with {@link withSuggestingSnapshot} and supply this
 * snapshotter so the first edit in a revision session freezes the prior run
 * formatting as an inline `revision_change` mark; a later edit in the same
 * session never overwrites it. Word's no-op rule (edit ends where it started
 * ⇒ no revision) clears marks whose snapshotted fields all equal the current
 * values.
 *
 * Priors are FULL pre-edit snapshots (every `TextFormatting` field the run
 * carried, style-resolved via the PM marks) — not minimal diffs. A minimal
 * prior pins `null` for "was absent", and `null` has no OOXML carrier: it
 * serializes as a bare `<w:rPr/>` and parses back as `{}`, so a save/reload
 * would silently convert "remove on reject" into "keep on reject". Full
 * snapshots round-trip losslessly (present values serialize verbatim; a
 * genuinely plain run is `{}` on both sides) and reject restores exactly.
 * Minimal diffs are still computed per attach for the no-op rule and for
 * span-coalescing adoption.
 *
 * @packageDocumentation
 */

import type { Mark } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import type { TextFormatting } from '../../../types/document';
import { marksToTextFormatting } from '../../conversion/fromProseDoc/marks';
import {
  canonicalizeRunPrior,
  type RevisionChangeStackEntry,
} from '../../extensions/marks/TrackedChangeExtensions';
import type { PropertySnapshotter } from './snapshot';
import type { RevisionInfo } from '../../../types/content/trackedChange';
import { findAdjacentRevisionChange } from './adjacency';

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

/**
 * Formatting marks that carry run properties. Tracked-change marks
 * (`insertion` / `deletion` / `revision_change`), comments, hyperlinks, and
 * footnote refs are excluded — they are not `w:rPr`.
 */
function isFormattingMark(mark: Mark): boolean {
  return (
    mark.type.name !== 'insertion' &&
    mark.type.name !== 'deletion' &&
    mark.type.name !== 'revision_change' &&
    mark.type.name !== 'comment' &&
    mark.type.name !== 'hyperlink' &&
    mark.type.name !== 'footnoteRef'
  );
}

function formattingOf(marks: readonly Mark[]): Record<string, unknown> {
  return marksToTextFormatting(marks.filter(isFormattingMark)) as unknown as Record<
    string,
    unknown
  >;
}

/** A text range captured before the formatting command ran. */
export interface CapturedRun {
  from: number;
  to: number;
  prior: Record<string, unknown>;
}

type CapturedRuns =
  | { kind: 'range'; selFrom: number; selTo: number; runs: CapturedRun[] }
  | { kind: 'stored'; prior: Record<string, unknown> };

function readRevisionChange(marks: readonly Mark[]): {
  revisionId: number;
  author: string;
  date: string | null;
  prior: unknown;
  priorStack: RevisionChangeStackEntry[] | null;
} | null {
  const mark = marks.find((m) => m.type.name === 'revision_change');
  if (!mark) return null;
  const stack = mark.attrs.priorStack as RevisionChangeStackEntry[] | null;
  return {
    revisionId: mark.attrs.revisionId as number,
    author: mark.attrs.author as string,
    date: (mark.attrs.date as string | null) ?? null,
    prior: mark.attrs.prior as unknown,
    priorStack: Array.isArray(stack) ? stack : null,
  };
}

/**
 * Snapshotter for run-property commands: captures the pre-edit formatting of
 * every text node in the command's selection range (or the stored marks for
 * a collapsed cursor), then merges frozen priors into the command's
 * transaction (one undo step).
 */
export const runPropertySnapshotter: PropertySnapshotter<CapturedRuns> = {
  capturePrior(state) {
    const { $from, $to } = state.selection;
    if (state.selection.empty) {
      const marks = state.storedMarks || $from.marks();
      return { kind: 'stored', prior: formattingOf(marks) };
    }
    const runs: CapturedRun[] = [];
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (node.isText) {
        runs.push({ from: pos, to: pos + node.nodeSize, prior: formattingOf(node.marks) });
      }
    });
    return { kind: 'range', selFrom: $from.pos, selTo: $to.pos, runs };
  },

  attachSnapshots(captured, state, tr, session: RevisionInfo) {
    if (captured.kind === 'stored') {
      attachStored(captured.prior, state, tr, session);
      return;
    }
    if (captured.runs.length === 0) return;

    const markType = state.schema.marks.revision_change;
    if (!markType) return;

    // The command may split text nodes at the range edges (partial-range
    // addMark), so captured offsets can't be mapped 1:1. Instead walk every
    // text node in the mapped selection range and pair each with the
    // captured run whose mapped span it overlaps.
    const mappedFrom = tr.mapping.map(captured.selFrom);
    const mappedTo = tr.mapping.map(captured.selTo, 1);
    const mappedRuns = captured.runs.map((r) => ({
      from: tr.mapping.map(r.from),
      to: tr.mapping.map(r.to, 1),
      prior: r.prior,
    }));
    const priorFor = (from: number, to: number): Record<string, unknown> | null => {
      const hit = mappedRuns.find((r) => r.from < to && from < r.to);
      // A command that inserts text (shouldn't happen for pure formatting
      // commands, but cheap to guard) leaves a node with no pre-image.
      return hit ? hit.prior : null;
    };

    // Span coalescing: adopt the adjacent same-author triple whose FULL
    // pre-edit state equals this range's leading pre-edit state, so
    // consecutive formatting ops from the same starting point share one
    // sidebar card and one accept/reject (matches Word). The session minted
    // by `withSuggestingSnapshot` is used otherwise.
    let triple: RevisionInfo | null = null;

    tr.doc.nodesBetween(mappedFrom, mappedTo, (node, pos) => {
      if (!node.isText) return true;
      const nodeFrom = pos;
      const nodeTo = pos + node.nodeSize;
      const prior = priorFor(nodeFrom, nodeTo);
      if (!prior) return false;
      const current = formattingOf(node.marks);
      const changed = minimalPrior(prior, current);
      const existing = readRevisionChange(node.marks);
      if (!changed) {
        // No-op net change ⇒ no revision (Word rule). Clear a triple the
        // command just undid; leave foreign triples alone. The triple to
        // compare against is resolved lazily below.
        const t = triple ?? session;
        if (existing && sameTriple(existing, t)) {
          tr.removeMark(nodeFrom, nodeTo, markType);
        }
        return false;
      }
      const useTriple = triple ?? adoptTriple(tr, session, prior, nodeFrom);
      triple = useTriple;
      if (existing && sameTriple(existing, useTriple)) {
        // Freeze-on-first-edit: the same triple never overwrites its prior.
        return false;
      }
      // A different triple starts a new session on this node: the surviving
      // session is pushed onto `priorStack` (oldest-first) so every session
      // keeps its own FULL prior and reject-all restores the original
      // newest-first.
      const pushed: RevisionChangeStackEntry = {
        revisionId: existing?.revisionId ?? useTriple.revisionId,
        author: existing?.author ?? useTriple.author,
        date: existing?.date ?? useTriple.date,
        prior: canonicalizeRunPrior(
          existing?.prior != null && typeof existing.prior === 'object'
            ? (existing.prior as TextFormatting)
            : {}
        ),
      };
      const priorStack = existing != null ? [...(existing.priorStack ?? []), pushed] : null;
      tr.addMark(
        nodeFrom,
        nodeTo,
        markType.create({
          revisionId: useTriple.revisionId,
          author: useTriple.author,
          date: useTriple.date,
          prior: canonicalizeRunPrior(prior as TextFormatting),
          priorStack,
        })
      );
      return false;
    });
  },
};

/**
 * Resolve the triple for a changed node: reuse the attach-wide triple when
 * set, else adopt an adjacent same-author triple whose FULL pre-edit state
 * deep-equals this node's pre-edit state (span coalescing), else the fresh
 * session.
 */
function adoptTriple(
  tr: Transaction,
  session: RevisionInfo,
  fullPrior: Record<string, unknown>,
  nodeFrom: number
): RevisionInfo {
  const adjacent = findAdjacentRevisionChange(tr.doc, nodeFrom, session.author, fullPrior);
  if (adjacent) {
    return { revisionId: adjacent.revisionId, author: adjacent.author, date: adjacent.date };
  }
  return session;
}

/**
 * Minimal prior: only fields that actually changed, with `null` for "was
 * absent". Returns null when nothing changed (Word's no-op net change rule).
 */
function minimalPrior(
  captured: Record<string, unknown>,
  current: Record<string, unknown>
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(captured), ...Object.keys(current)]);
  for (const key of keys) {
    if (key === 'boldCs' || key === 'italicCs') continue; // ride their base mark
    const before = captured[key] ?? null;
    const after = current[key] ?? null;
    if (!deepEqual(before, after)) out[key] = before;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function attachStored(
  capturedPrior: Record<string, unknown>,
  state: EditorState,
  tr: Transaction,
  session: RevisionInfo
): void {
  const currentMarks = tr.storedMarks || tr.selection.$from.marks();
  const current = formattingOf(currentMarks);
  const changed = minimalPrior(capturedPrior, current);
  const markType = state.schema.marks.revision_change;
  if (!markType) return;
  const existing = readRevisionChange(currentMarks);
  if (!changed) {
    if (existing && sameTriple(existing, session)) {
      tr.setStoredMarks(currentMarks.filter((m) => m.type !== markType));
    }
    return;
  }
  if (existing && sameTriple(existing, session)) return; // frozen
  // Adopt an adjacent same-author triple whose full pre-edit state equals
  // this cursor's pre-edit state, so typing right after a formatting op (or
  // two adjacent ops) coalesces into one revision.
  const adopted = findAdjacentRevisionChange(
    tr.doc,
    tr.selection.from,
    session.author,
    capturedPrior
  );
  const triple: RevisionInfo = adopted
    ? { revisionId: adopted.revisionId, author: adopted.author, date: adopted.date }
    : session;
  if (existing && sameTriple(existing, triple)) return; // frozen
  const pushed: RevisionChangeStackEntry = {
    revisionId: existing?.revisionId ?? triple.revisionId,
    author: existing?.author ?? triple.author,
    date: existing?.date ?? triple.date,
    prior: canonicalizeRunPrior(
      existing?.prior != null && typeof existing.prior === 'object'
        ? (existing.prior as TextFormatting)
        : {}
    ),
  };
  tr.setStoredMarks([
    ...currentMarks.filter((m) => m.type !== markType),
    markType.create({
      revisionId: triple.revisionId,
      author: triple.author,
      date: triple.date,
      prior: canonicalizeRunPrior(capturedPrior as TextFormatting),
      priorStack: existing != null ? [...(existing.priorStack ?? []), pushed] : null,
    }),
  ]);
}

/** Same `(id, author, date)` triple — `null` and `undefined` dates compare equal. */
function sameTriple(
  existing: { revisionId: number; author: string; date: string | null },
  triple: RevisionInfo
): boolean {
  return (
    existing.revisionId === triple.revisionId &&
    existing.author === triple.author &&
    (existing.date ?? undefined) === (triple.date ?? undefined)
  );
}

// ---------------------------------------------------------------------------
// Reject: restore a prior snapshot onto a mark set
// ---------------------------------------------------------------------------

/**
 * Restore a prior run-formatting snapshot (reject of `w:rPrChange` /
 * `revision_change`). Priors are COMPLETE pre-edit snapshots (absent = was
 * absent): the editor snapshotter stores full pre-edit states and the OOXML
 * wire format snapshots the full pre-edit `w:rPr` — so every known field is
 * synced: a present value adds/sets the corresponding mark, an absent one
 * removes it. A `null` prior (pasted content with no history) restores
 * nothing — callers drop the mark only.
 *
 * Known edge: on a parsed run whose formatting comes from the paragraph
 * style (not direct `w:rPr`), an absent prior field removes the
 * style-resolved mark too — the style re-resolves on the next load, so this
 * only matters for a reject issued between load and save on a styled run.
 */
export function restoreRunMarks(
  marks: readonly Mark[],
  prior: TextFormatting,
  schema: Schema
): Mark[] {
  let next = marks.filter((m) => m.type.name !== 'revision_change');
  const p = prior as unknown as Record<string, unknown>;
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(p, key);
  const val = (key: string): unknown => p[key];

  const setBool = (markName: string, on: unknown): void => {
    const type = schema.marks[markName];
    if (!type) return;
    next = next.filter((m) => m.type !== type);
    if (on === true) next = [...next, type.create()];
  };

  const dropMark = (markName: string): void => {
    const type = schema.marks[markName];
    if (type) next = next.filter((m) => m.type !== type);
  };

  // Boolean toggles (w:b, w:i, w:caps, …): absent ⇒ remove.
  setBool('bold', val('bold'));
  setBool('italic', val('italic'));
  for (const name of ['allCaps', 'smallCaps', 'emboss', 'imprint', 'textOutline'] as const) {
    setBool(name, val(name));
  }
  setBool('textShadow', val('shadow'));
  setBool('hidden', val('hidden'));
  setBool('rtl', val('rtl'));
  // NOTE: `w:shd` has no PM mark (custom fills surface via `highlight`), and
  // `w:cs` / `w:bCs` / `w:iCs` have no mark types — capture never produces
  // them, so there is nothing to restore here.

  if (has('strike') || has('doubleStrike')) {
    const type = schema.marks.strike;
    if (type) {
      next = next.filter((m) => m.type !== type);
      if (val('doubleStrike') === true) next = [...next, type.create({ double: true })];
      else if (val('strike') === true) next = [...next, type.create({ double: false })];
    }
  } else {
    dropMark('strike');
  }
  if (has('underline')) {
    const type = schema.marks.underline;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const u = val('underline') as { style?: string; color?: unknown } | null;
      if (u && typeof u === 'object') {
        next = [...next, type.create({ style: u.style || 'single', color: u.color ?? null })];
      }
    }
  } else {
    dropMark('underline');
  }
  if (has('vertAlign')) {
    const v = val('vertAlign') as string | null;
    const sup = schema.marks.superscript;
    const sub = schema.marks.subscript;
    if (sup) next = next.filter((m) => m.type !== sup);
    if (sub) next = next.filter((m) => m.type !== sub);
    if (v === 'superscript' && sup) next = [...next, sup.create()];
    else if (v === 'subscript' && sub) next = [...next, sub.create()];
  } else {
    dropMark('superscript');
    dropMark('subscript');
  }
  if (has('color')) {
    const type = schema.marks.textColor;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const c = val('color') as Record<string, unknown> | null;
      if (c && typeof c === 'object') {
        next = [
          ...next,
          type.create({
            rgb: c.rgb ?? null,
            themeColor: c.themeColor ?? null,
            themeTint: c.themeTint ?? null,
            themeShade: c.themeShade ?? null,
          }),
        ];
      }
    }
  } else {
    dropMark('textColor');
  }
  if (has('highlight')) {
    const type = schema.marks.highlight;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const h = val('highlight') as string | null;
      if (typeof h === 'string' && h !== 'none') next = [...next, type.create({ color: h })];
    }
  } else {
    dropMark('highlight');
  }
  if (has('fontSize') || has('fontSizeCs')) {
    const type = schema.marks.fontSize;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const size = (val('fontSize') as number | null) ?? null;
      const sizeCs = (val('fontSizeCs') as number | null) ?? size ?? null;
      if (size != null || sizeCs != null) {
        next = [...next, type.create({ size, sizeCs })];
      }
    }
  } else {
    dropMark('fontSize');
  }
  if (has('fontFamily')) {
    const type = schema.marks.fontFamily;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const f = val('fontFamily') as Record<string, unknown> | null;
      if (f && typeof f === 'object') {
        next = [
          ...next,
          type.create({
            ascii: f.ascii ?? null,
            hAnsi: f.hAnsi ?? null,
            eastAsia: f.eastAsia ?? null,
            cs: f.cs ?? null,
            asciiTheme: f.asciiTheme ?? null,
            hAnsiTheme: f.hAnsiTheme ?? null,
            eastAsiaTheme: f.eastAsiaTheme ?? null,
            csTheme: f.csTheme ?? null,
          }),
        ];
      }
    }
  } else {
    dropMark('fontFamily');
  }
  if (has('spacing') || has('position') || has('scale') || has('kerning')) {
    const type = schema.marks.characterSpacing;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const merged = {
        spacing: (val('spacing') as number | null) ?? null,
        position: (val('position') as number | null) ?? null,
        scale: (val('scale') as number | null) ?? null,
        kerning: (val('kerning') as number | null) ?? null,
      };
      if (
        merged.spacing != null ||
        merged.position != null ||
        merged.scale != null ||
        merged.kerning != null
      ) {
        next = [...next, type.create(merged)];
      }
    }
  } else {
    dropMark('characterSpacing');
  }
  if (has('emphasisMark')) {
    const type = schema.marks.emphasisMark;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const e = val('emphasisMark') as string | null;
      if (typeof e === 'string' && e !== 'none') next = [...next, type.create({ type: e })];
    }
  } else {
    dropMark('emphasisMark');
  }
  if (has('effect')) {
    const type = schema.marks.textEffect;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const e = val('effect') as string | null;
      if (typeof e === 'string' && e !== 'none') next = [...next, type.create({ effect: e })];
    }
  } else {
    dropMark('textEffect');
  }
  if (has('styleId')) {
    const type = schema.marks.runStyle;
    if (type) {
      next = next.filter((m) => m.type !== type);
      const s = val('styleId') as string | null;
      if (typeof s === 'string' && s.length > 0) next = [...next, type.create({ styleId: s })];
    }
  } else {
    dropMark('runStyle');
  }
  return next;
}
