/**
 * `core/editor/session` — load guard + selective-save decision (issue #696
 * Tier 2, step 5.6). Pure; no DOM, no framework.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import { singletonManager } from '../../prosemirror/schema';
import type { Comment } from '../../types/content';
import { LoadGeneration, decideSelectiveSave } from '../session';

describe('LoadGeneration', () => {
  test('latest load wins; earlier settles are stale', () => {
    const guard = new LoadGeneration();
    const first = guard.begin();
    const second = guard.begin();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  test('invalidate stales every in-flight load', () => {
    const guard = new LoadGeneration();
    const gen = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(gen)).toBe(false);
  });
});

function emptyState(): EditorState {
  return EditorState.create({
    schema: singletonManager.getSchema(),
  });
}

function comment(id: number, parentId?: number): Comment {
  return { id, parentId, content: 'x' } as unknown as Comment;
}

describe('decideSelectiveSave', () => {
  test('full repack requested yields no selective options', () => {
    expect(decideSelectiveSave(emptyState(), [], false)).toBeUndefined();
  });

  test('missing view state yields no selective options', () => {
    expect(decideSelectiveSave(null, [], true)).toBeUndefined();
  });

  test('selective save reads the tracker state', () => {
    const decision = decideSelectiveSave(emptyState(), [], true);
    expect(decision).toBeDefined();
    expect(decision!.selective.changedParaIds instanceof Set).toBe(true);
    expect(typeof decision!.selective.structuralChange).toBe('boolean');
    expect(typeof decision!.selective.hasUntrackedChanges).toBe('boolean');
  });

  test('a comment reply forces structuralChange', () => {
    const decision = decideSelectiveSave(emptyState(), [comment(1, 0)], true);
    expect(decision!.selective.structuralChange).toBe(true);
  });
});
