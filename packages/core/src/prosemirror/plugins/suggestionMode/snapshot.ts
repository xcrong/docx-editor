/**
 * Snapshot-and-restore infrastructure for tracked property changes.
 *
 * Shared Phase 1 foundation for T27-02 (suggesting-mode authoring) and the
 * Phase 2/3 accept/reject paths — do NOT duplicate per element kind
 * (paragraph / table / row / cell / run / section). Element-specific slices
 * supply a `PropertySnapshotter`; the freeze/clear/session rules live here
 * exactly once.
 *
 * Lifecycle (mirrors Word):
 *
 * - Snapshot-on-first-edit: the first property edit in a revision session
 *   freezes the prior properties; later edits in the SAME `(id, author,
 *   date)` session never overwrite that snapshot (`freezePriorEntry`).
 * - No-op net change: after every property edit, entries whose snapshotted
 *   fields all equal the current values are cleared — Word shows no
 *   revision when an edit ends where it started (`clearNoOpEntries`).
 *
 * See `openspec/changes/tracked-structural-changes/design.md` ("Snapshot
 * infrastructure" + "Accept / Reject behavior").
 *
 * @packageDocumentation
 */

import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { makeRevisionInfo } from '../revisionIds';
import type { RevisionInfo } from '../../../types/content/trackedChange';
import { SUGGESTION_META } from './state';

/**
 * Minimal shape of a `*Change` array entry (`pPrChange`, `trPrChange`,
 * `tcPrChange`, `tblPrChange`, `paraRPrChange`, …). All of them carry the
 * OOXML `(w:id, w:author, w:date)` triple under `info`.
 */
export interface PropertyChangeEntry {
  info: { id: number; author: string; date?: string };
  [key: string]: unknown;
}

/**
 * Revision-session key: the `(id, author, date)` triple that groups one
 * conceptual change (see design.md "Identity and grouping"). `null` date
 * (PM attr default) and `undefined` date (model default) compare equal.
 */
export function sameRevisionSession(
  info: { id: number; author: string; date?: string | null },
  session: RevisionInfo
): boolean {
  return (
    info.id === session.revisionId &&
    info.author === session.author &&
    (info.date ?? undefined) === (session.date ?? undefined)
  );
}

/**
 * Freeze-on-first-edit: if `existing` already carries an entry for this
 * revision session, the prior snapshot is frozen — return the array
 * unchanged. Otherwise append a fresh entry built by `makeEntry`.
 */
export function freezePriorEntry<E extends PropertyChangeEntry>(
  existing: E[] | null | undefined,
  session: RevisionInfo,
  makeEntry: (session: RevisionInfo) => E
): E[] {
  if (Array.isArray(existing) && existing.some((e) => sameRevisionSession(e.info, session))) {
    return existing;
  }
  return [...(existing ?? []), makeEntry(session)];
}

/**
 * Word's "no-op net change ⇒ no revision" rule: drop every entry whose
 * snapshotted fields all equal the current values. Returns `null` when no
 * entries survive so PM treats the attr as absent on save.
 */
export function clearNoOpEntries<E extends PropertyChangeEntry>(
  existing: E[] | null | undefined,
  isNoOp: (entry: E) => boolean
): E[] | null {
  if (!Array.isArray(existing) || existing.length === 0) return null;
  const surviving = existing.filter((e) => !isNoOp(e));
  return surviving.length > 0 ? surviving : null;
}

/**
 * Element-specific snapshot behavior for {@link withSuggestingSnapshot}.
 * `capturePrior` runs on the PRE-command doc; `attachSnapshots` merges the
 * frozen priors into the POST-command transaction (and clears no-op
 * entries). Positions in `captured` refer to the pre-command doc — map
 * them through the transaction's mapping when the command inserts content.
 */
export interface PropertySnapshotter<Captured> {
  capturePrior: (state: EditorState) => Captured;
  attachSnapshots: (
    captured: Captured,
    state: EditorState,
    tr: Transaction,
    session: RevisionInfo
  ) => void;
}

/**
 * Wrap a property-edit command with snapshot-on-first-edit-per-session
 * tracking. When suggesting mode is OFF the command runs unwrapped. When
 * ON, a fresh revision session is minted, priors are captured before the
 * command runs, and snapshots are attached after — all in the command's
 * single transaction (one undo step). The transaction is tagged with
 * `SUGGESTION_META` so the suggesting-mode catch-all leaves it alone.
 */
export function withSuggestingSnapshot<Captured>(
  commandImpl: Command,
  snapshotter: PropertySnapshotter<Captured>
): Command {
  return (state, dispatch) => {
    if (!dispatch) return commandImpl(state, undefined);
    const session = makeRevisionInfo(state);
    if (!session) return commandImpl(state, dispatch);
    const captured = snapshotter.capturePrior(state);
    let innerTr: Transaction | null = null;
    const ok = commandImpl(state, (tr) => {
      innerTr = tr;
    });
    if (!ok || !innerTr) return false;
    const tr: Transaction = innerTr;
    snapshotter.attachSnapshots(captured, state, tr, session);
    tr.setMeta(SUGGESTION_META, true);
    dispatch(tr);
    return true;
  };
}
