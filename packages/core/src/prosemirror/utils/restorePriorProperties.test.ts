import { describe, expect, test } from 'bun:test';
import {
  clearNoOpEntries,
  freezePriorEntry,
  sameRevisionSession,
} from '../plugins/suggestionMode/snapshot';
import { restoreParagraphPriorProperties } from './restorePriorProperties';
import { restoreRunPriorProperties, restoreSectionPriorProperties } from './restorePriorProperties';

// T27-01 (issues #77 + #70): shared snapshot-and-restore infra. These are
// pure-function contracts Phase 2/3 build on — no per-element duplicate.

const SESSION = { revisionId: 7, author: 'Alice', date: '2024-01-02T03:04:05Z' };

describe('sameRevisionSession', () => {
  test('null and undefined dates compare equal', () => {
    const dateless = { revisionId: 7, author: 'Alice', date: null as string | null };
    expect(sameRevisionSession({ id: 7, author: 'Alice' }, dateless)).toBe(true);
    expect(sameRevisionSession({ id: 7, author: 'Alice', date: null }, dateless)).toBe(true);
    expect(sameRevisionSession({ id: 7, author: 'Alice', date: SESSION.date }, SESSION)).toBe(true);
    expect(sameRevisionSession({ id: 7, author: 'Alice' }, SESSION)).toBe(false);
    expect(sameRevisionSession({ id: 8, author: 'Alice', date: SESSION.date }, SESSION)).toBe(
      false
    );
    expect(sameRevisionSession({ id: 7, author: 'Bob', date: SESSION.date }, SESSION)).toBe(false);
  });
});

describe('freezePriorEntry', () => {
  test('first edit appends; second edit in the same session freezes', () => {
    const first = freezePriorEntry(null, SESSION, (s) => ({
      info: { id: s.revisionId, author: s.author, date: s.date ?? undefined },
      prior: 'v1',
    }));
    expect(first).toHaveLength(1);
    // Same session again: array identity is preserved (frozen snapshot).
    const second = freezePriorEntry(first, SESSION, () => ({
      info: { id: 7, author: 'Alice', date: SESSION.date },
      prior: 'v2',
    }));
    expect(second).toBe(first);
    expect(second[0]!.prior).toBe('v1');
  });

  test('a different (id, author, date) session appends', () => {
    const first = freezePriorEntry(null, SESSION, (s) => ({
      info: { id: s.revisionId, author: s.author },
      prior: 'v1',
    }));
    const other = { revisionId: 9, author: 'Bob', date: '2024-05-06T00:00:00Z' };
    const second = freezePriorEntry(first, other, (s) => ({
      info: { id: s.revisionId, author: s.author },
      prior: 'v2',
    }));
    expect(second).toHaveLength(2);
  });
});

describe('clearNoOpEntries', () => {
  test('drops no-op entries; null when empty', () => {
    expect(clearNoOpEntries(null, () => false)).toBeNull();
    expect(clearNoOpEntries([], () => false)).toBeNull();
    const entries = [
      { info: { id: 1, author: 'A' }, prior: 'x' },
      { info: { id: 2, author: 'A' }, prior: 'y' },
    ];
    const kept = clearNoOpEntries(entries, (e) => e.info.id === 1);
    expect(kept).toHaveLength(1);
    expect(kept![0]!.info.id).toBe(2);
    expect(clearNoOpEntries(entries, () => true)).toBeNull();
  });
});

describe('restoreParagraphPriorProperties', () => {
  test('copies own prior fields; leaves the rest untouched', () => {
    const next = restoreParagraphPriorProperties(
      { alignment: 'left', styleId: 'Keep', numPr: { numId: 1, ilvl: 0 } },
      { alignment: 'center' }
    );
    expect(next.alignment).toBe('center');
    expect(next.styleId).toBe('Keep');
  });

  test('numbering introduced by the change is cleared on reject', () => {
    const next = restoreParagraphPriorProperties(
      { numPr: { numId: 1, ilvl: 0 }, listMarker: '1.' },
      {},
      { numPr: { numId: 1, ilvl: 0 } }
    );
    expect(next.numPr).toBeNull();
    expect(next.listMarker).toBeNull();
  });
});

describe('restoreSectionPriorProperties', () => {
  test('prior wins for modeled fields; the change marker is dropped', () => {
    const next = restoreSectionPriorProperties(
      {
        pageWidth: 1,
        sectPrChange: { type: 'sectionPropertyChange', info: { id: 1, author: 'A' } },
      },
      { pageWidth: 2, orientation: 'landscape' }
    );
    expect(next.pageWidth).toBe(2);
    expect(next.orientation).toBe('landscape');
    expect(next.sectPrChange).toBeUndefined();
  });
});

describe('restoreRunPriorProperties', () => {
  test('copies prior run fields back', () => {
    const next = restoreRunPriorProperties({ bold: false, fontSize: 22 }, { bold: true });
    expect(next).toMatchObject({ bold: true, fontSize: 22 });
  });
});
