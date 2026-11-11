import { describe, expect, test } from 'bun:test';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { schema } from '../schema';
import { createSuggestionModePlugin } from '../plugins/suggestionMode';
import { extractTrackedChanges } from '../utils/extractTrackedChanges';
import { describeRunPropertyChange } from '../../utils/runPropertyDescriptions';
import { acceptAllChanges, acceptChangeById, rejectAllChanges, rejectChangeById } from './comments';
import {
  setFontFamily,
  setFontSize,
  setHighlight,
  setTextColor,
  toggleBold,
  toggleItalic,
} from './formatting';

// T27-07 (issue #83): suggesting-mode run formatting → `revision_change`
// mark, accept/reject by id, and the no-crosstalk rule vs paragraph-mark
// revisions. Uses the real singleton schema so every formatting mark and
// the `revision_change` mark behave as in the editor.

function docWithText(text: string) {
  return schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
}

function suggestingState(text = 'Hello world'): EditorState {
  return EditorState.create({
    schema,
    doc: docWithText(text),
    plugins: [createSuggestionModePlugin(true, 'Jane')],
  });
}

function applyCmd(state: EditorState, cmd: Command, from: number, to: number): EditorState {
  const tr = state.tr.setSelection(TextSelection.create(state.doc, from, to));
  const selected = state.apply(tr);
  let out: EditorState | null = null;
  const ok = cmd(selected, (next) => {
    out = selected.apply(next);
  });
  expect(ok).toBe(true);
  return out!;
}

function revisionMarks(state: EditorState): Array<{
  text: string;
  revisionId: number;
  author: string;
  prior: unknown;
  stack: Array<{ revisionId: number; prior: unknown }>;
}> {
  const out: Array<{
    text: string;
    revisionId: number;
    author: string;
    prior: unknown;
    stack: Array<{ revisionId: number; prior: unknown }>;
  }> = [];
  state.doc.descendants((node) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name === 'revision_change') {
        const stack =
          (mark.attrs.priorStack as Array<{
            revisionId: number;
            prior: unknown;
          }> | null) ?? [];
        out.push({
          text: node.text ?? '',
          revisionId: mark.attrs.revisionId as number,
          author: mark.attrs.author as string,
          prior: mark.attrs.prior,
          stack: stack.map((s) => ({ revisionId: s.revisionId, prior: s.prior })),
        });
      }
    }
  });
  return out;
}

function isBold(state: EditorState, from: number, to: number): boolean {
  let bold = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && node.marks.some((m) => m.type.name === 'bold')) bold = true;
  });
  return bold;
}

/** Text span of the first paragraph's content (PM positions). */
function span(state: EditorState): { from: number; to: number } {
  const from = 1;
  let to = 1;
  state.doc.descendants((node, pos) => {
    if (node.isText) {
      to = pos + node.nodeSize;
    }
    void from;
  });
  return { from: 1, to };
}

describe('T27-07: suggesting-mode run formatting', () => {
  test('toggleBold in suggesting mode mints a revision_change mark, keeps formatting', () => {
    const state = suggestingState();
    const { from, to } = span(state);
    const next = applyCmd(state, toggleBold, from, from + 5);
    const marks = revisionMarks(next);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ text: 'Hello', author: 'Jane' });
    expect(typeof marks[0]!.revisionId).toBe('number');
    // The prior is the FULL pre-edit snapshot — plain text ⇒ `{}` …
    expect(marks[0]!.prior).toEqual({});
    // … while the text itself is bold.
    expect(isBold(next, from, from + 5)).toBe(true);
    expect(isBold(next, from + 5, to)).toBe(false);
  });

  test('bold on then off keeps the "removed bold" revision (paragraph-path parity)', () => {
    const state = suggestingState();
    const { from } = span(state);
    const bolded = applyCmd(state, toggleBold, from, from + 5);
    expect(revisionMarks(bolded)).toHaveLength(1);
    const plain = applyCmd(bolded, toggleBold, from, from + 5);
    // A new session undid the first: the surviving revision records the
    // removal (FULL prior pins bold:true), mirroring `pPrChange` semantics.
    const marks = revisionMarks(plain);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.prior).toMatchObject({ bold: true });
    expect(marks[0]!.stack).toHaveLength(1);
    expect(marks[0]!.stack[0]!.prior).toEqual({});
    expect(isBold(plain, from, from + 5)).toBe(false);
    // Rejecting it restores bold.
    let out: EditorState | null = null;
    expect(rejectChangeById(marks[0]!.revisionId)(plain, (tr) => (out = plain.apply(tr)))).toBe(
      true
    );
    expect(isBold(out!, from, from + 5)).toBe(true);
  });

  test('closed mode toggleBold mints no mark (regression)', () => {
    const plain = EditorState.create({ schema, doc: docWithText('Hello world') });
    const next = applyCmd(plain, toggleBold, 1, 6);
    expect(revisionMarks(next)).toHaveLength(0);
    expect(isBold(next, 1, 6)).toBe(true);
  });

  test('setFontSize / setTextColor / setFontFamily snapshot their fields', () => {
    const state = suggestingState();
    const sized = applyCmd(state, setFontSize(28), 1, 6);
    const sizeMarks = revisionMarks(sized);
    expect(sizeMarks).toHaveLength(1);
    // Full pre-edit snapshot — the text was plain.
    expect(sizeMarks[0]!.prior).toEqual({});
    expect(sizeMarks[0]!.stack).toHaveLength(0);
    const colored = applyCmd(sized, setTextColor({ rgb: 'FF0000' }), 1, 6);
    // A new session pushes the surviving session onto `priorStack`.
    const colorMarks = revisionMarks(colored);
    expect(colorMarks).toHaveLength(1);
    expect(colorMarks[0]!.prior).toMatchObject({ fontSize: 28 });
    expect(colorMarks[0]!.stack).toHaveLength(1);
    expect(colorMarks[0]!.stack[0]!.prior).toEqual({});
    expect(colorMarks[0]!.stack[0]!.revisionId).not.toBe(colorMarks[0]!.revisionId);
    const fonted = applyCmd(colored, setFontFamily('Arial'), 1, 6);
    const fontMarks = revisionMarks(fonted);
    expect(fontMarks[0]!.prior).toMatchObject({ fontSize: 28, color: { rgb: 'FF0000' } });
    expect(fontMarks[0]!.stack).toHaveLength(2);
  });

  test('accept removes the mark and keeps the formatting', () => {
    const state = suggestingState();
    const next = applyCmd(state, toggleBold, 1, 6);
    const id = revisionMarks(next)[0]!.revisionId;
    let out: EditorState | null = null;
    expect(acceptChangeById(id)(next, (tr) => (out = next.apply(tr)))).toBe(true);
    expect(revisionMarks(out!)).toHaveLength(0);
    expect(isBold(out!, 1, 6)).toBe(true);
  });

  test('reject removes the mark and restores the prior formatting', () => {
    const state = suggestingState();
    const next = applyCmd(state, toggleBold, 1, 6);
    const id = revisionMarks(next)[0]!.revisionId;
    let out: EditorState | null = null;
    expect(rejectChangeById(id)(next, (tr) => (out = next.apply(tr)))).toBe(true);
    expect(revisionMarks(out!)).toHaveLength(0);
    expect(isBold(out!, 1, 6)).toBe(false);
  });

  test('reject restores multi-field priors newest-first (size + color)', () => {
    let state = suggestingState('plain');
    state = applyCmd(state, setFontSize(28), 1, 6);
    state = applyCmd(state, setTextColor({ rgb: 'FF0000' }), 1, 6);
    // Two sessions share one mark: latest (color) + stacked (size).
    const marks = revisionMarks(state);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.stack).toHaveLength(1);
    // Rejecting the latest restores its FULL prior (size stays, color goes);
    // the earlier session stays.
    let out: EditorState | null = null;
    expect(rejectChangeById(marks[0]!.revisionId)(state, (tr) => (out = state.apply(tr)))).toBe(
      true
    );
    const mid = revisionMarks(out!);
    expect(mid).toHaveLength(1);
    expect(mid[0]!.stack).toHaveLength(0);
    // Rejecting the remaining session restores the original: no size, no color.
    let clean: EditorState | null = null;
    expect(rejectChangeById(mid[0]!.revisionId)(out!, (tr) => (clean = out!.apply(tr)))).toBe(true);
    expect(revisionMarks(clean!)).toHaveLength(0);
    const { entries } = extractTrackedChanges(clean!);
    expect(entries.filter((e) => e.type === 'runPropertiesChanged')).toHaveLength(0);
    // No fontSize / textColor marks survive.
    let leftover = false;
    clean!.doc.descendants((node) => {
      if (
        node.isText &&
        node.marks.some((m) => m.type.name === 'fontSize' || m.type.name === 'textColor')
      ) {
        leftover = true;
      }
    });
    expect(leftover).toBe(false);
  });

  test('extractor emits runPropertiesChanged with prior + current; sidebar describes it', () => {
    const state = suggestingState();
    const next = applyCmd(state, toggleBold, 1, 6);
    const { entries } = extractTrackedChanges(next);
    const runs = entries.filter((e) => e.type === 'runPropertiesChanged');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ text: 'Hello', author: 'Jane' });
    const t = (key: string): string => key;
    expect(describeRunPropertyChange(runs[0]!.priorFormatting, runs[0]!.currentFormatting, t)).toBe(
      'revisions.runBoldAdded'
    );
    const en = (key: string, params?: Record<string, string | number>): string =>
      `${key}(${JSON.stringify(params)})`;
    expect(
      describeRunPropertyChange(
        { fontFamily: { ascii: 'Calibri' } },
        { fontFamily: { ascii: 'Times New Roman' }, fontSize: 24 },
        en
      )
    ).toContain('revisions.runFontChanged');
  });

  test('sidebar description: added / removed / from→to', () => {
    const t = (key: string, params?: Record<string, string | number>): string => {
      const table: Record<string, string> = {
        'revisions.runBoldAdded': 'Bold added',
        'revisions.runBoldRemoved': 'Bold removed',
        'revisions.runItalicAdded': 'Italic added',
        'revisions.runFontChanged': `Font changed from ${params?.from} to ${params?.to}`,
        'revisions.runFontSizeChanged': `Font size changed from ${params?.from} to ${params?.to}`,
        'revisions.runColorChanged': `Color changed from ${params?.from} to ${params?.to}`,
        'revisions.runHighlightChanged': `Highlight changed from ${params?.from} to ${params?.to}`,
        'revisions.runDefaultValue': 'Default',
      };
      return table[key] ?? key;
    };
    expect(describeRunPropertyChange({ bold: null }, { bold: true }, t)).toBe('Bold added');
    expect(describeRunPropertyChange({ bold: true }, {}, t)).toBe('Bold removed');
    expect(describeRunPropertyChange({ italic: null }, { italic: true }, t)).toBe('Italic added');
    expect(
      describeRunPropertyChange(
        { fontFamily: { ascii: 'Calibri' }, fontSize: 22 },
        { fontFamily: { ascii: 'Times New Roman' }, fontSize: 24 },
        t
      )
    ).toBe('Font changed from Calibri to Times New Roman, Font size changed from 11pt to 12pt');
    expect(describeRunPropertyChange({ color: null }, { color: { rgb: 'ff0000' } }, t)).toBe(
      'Color changed from Default to #FF0000'
    );
    // Full snapshots: unchanged fields present on both sides are NOT named.
    expect(
      describeRunPropertyChange(
        { bold: true, italic: true },
        { bold: true, italic: true, highlight: 'yellow' },
        t
      )
    ).toBe('Highlight changed from Default to yellow');
    expect(describeRunPropertyChange({ bold: true }, { bold: true }, t)).toBe(
      'revisions.runPropertiesChanged'
    );
  });

  test('stacked entries describe only their own session', () => {
    let state = suggestingState('plain');
    state = applyCmd(state, setFontSize(28), 1, 6);
    state = applyCmd(state, setTextColor({ rgb: 'FF0000' }), 1, 6);
    const { entries } = extractTrackedChanges(state);
    const runs = entries.filter((e) => e.type === 'runPropertiesChanged');
    expect(runs).toHaveLength(2);
    const t = (key: string, params?: Record<string, string | number>): string => {
      if (key === 'revisions.runDefaultValue') return 'Default';
      if (key === 'revisions.runFontSizeChanged') return `size ${params?.from}→${params?.to}`;
      if (key === 'revisions.runColorChanged') return `color ${params?.from}→${params?.to}`;
      return key;
    };
    // Newest-first: [color session, size session]; each names its own diff.
    expect(describeRunPropertyChange(runs[0]!.priorFormatting, runs[0]!.currentFormatting, t)).toBe(
      'color Default→#FF0000'
    );
    expect(describeRunPropertyChange(runs[1]!.priorFormatting, runs[1]!.currentFormatting, t)).toBe(
      'size Default→14pt'
    );
  });

  test('run revision does not touch paragraph-mark revisions (mutual exclusion)', () => {
    const withPilcrow = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          paraRPrChange: [
            {
              type: 'paragraphMarkPropertyChange',
              info: { id: 900, author: 'Dan' },
              previousFormatting: { bold: true },
            },
          ],
        },
        [schema.text('Hello')]
      ),
    ]);
    const plugin = createSuggestionModePlugin(true, 'Jane');
    const state = EditorState.create({ schema, doc: withPilcrow, plugins: [plugin] });
    const next = applyCmd(state, toggleItalic, 1, 6);
    const { entries } = extractTrackedChanges(next);
    const types = entries.map((e) => e.type).sort();
    expect(types).toEqual(['paragraphMarkPropertiesChanged', 'runPropertiesChanged']);
    const runEntry = entries.find((e) => e.type === 'runPropertiesChanged')!;
    // Rejecting the run change restores italic only; the pilcrow entry survives.
    let out: EditorState | null = null;
    expect(rejectChangeById(runEntry.revisionId)(next, (tr) => (out = next.apply(tr)))).toBe(true);
    const after = extractTrackedChanges(out!);
    expect(after.entries.map((e) => e.type)).toEqual(['paragraphMarkPropertiesChanged']);
    // And vice versa: rejecting the pilcrow change leaves the run mark alone.
    let out2: EditorState | null = null;
    expect(rejectChangeById(900)(next, (tr) => (out2 = next.apply(tr)))).toBe(true);
    const after2 = extractTrackedChanges(out2!);
    expect(after2.entries.map((e) => e.type)).toEqual(['runPropertiesChanged']);
  });
});

describe('T27-07: property-based formatting round-trip', () => {
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COLORS = ['FF0000', '0000FF', '00AA00'];

  test('accept-all equals untracked; reject-all restores the original', () => {
    const rand = mulberry32(83);
    const ops: Array<{ op: number; from: number; to: number; arg?: number | string }> = [];
    for (let i = 0; i < 12; i++) {
      const op = Math.floor(rand() * 5);
      const from = 1 + Math.floor(rand() * 11);
      const to = from + Math.floor(rand() * (12 - from));
      const arg =
        op === 2
          ? 20 + Math.floor(rand() * 4) * 2
          : op === 3
            ? COLORS[i % COLORS.length]
            : undefined;
      ops.push({ op, from, to: Math.max(to, from + (rand() < 0.3 ? 0 : 1)), arg });
    }

    const runOps = (suggesting: boolean): EditorState => {
      const plugins = suggesting ? [createSuggestionModePlugin(true, 'Jane')] : [];
      let state = EditorState.create({ schema, doc: docWithText('Hello world'), plugins });
      for (const { op, from, to, arg } of ops) {
        const at = to === from ? from : from;
        void at;
        const tr = state.tr.setSelection(TextSelection.create(state.doc, from, to));
        state = state.apply(tr);
        let next: EditorState | null = null;
        const cmd =
          op === 0
            ? toggleBold
            : op === 1
              ? toggleItalic
              : op === 2
                ? setFontSize(arg as number)
                : op === 3
                  ? setTextColor({ rgb: arg as string })
                  : setHighlight('yellow');
        expect(cmd(state, (t) => (next = state.apply(t)))).toBe(true);
        state = next!;
      }
      return state;
    };

    const original = docWithText('Hello world').toJSON();
    const tracked = runOps(true);
    const direct = runOps(false);

    // Accept-all: every mark drops, formatting equals the untracked run.
    // (Chain the dispatches — one transaction per revision id.)
    let accepted = tracked;
    const acceptedCount = acceptAllChanges()(tracked, (tr) => {
      accepted = accepted.apply(tr);
    });
    expect(acceptedCount).toBeGreaterThan(0);
    expect(JSON.stringify(accepted!.doc.toJSON())).toBe(JSON.stringify(direct.doc.toJSON()));

    // Reject-all: the document returns to its original shape.
    const tracked2 = runOps(true);
    let rejected = tracked2;
    const rejectedCount = rejectAllChanges()(tracked2, (tr) => {
      rejected = rejected.apply(tr);
    });
    expect(rejectedCount).toBeGreaterThan(0);
    expect(JSON.stringify(rejected!.doc.toJSON())).toBe(JSON.stringify(original));
  });
});
