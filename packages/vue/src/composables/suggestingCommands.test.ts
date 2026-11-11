/**
 * Issue #127: Vue `getCommands()` must route through the `commands/*`
 * wrappers, not the extension manager's bare commands — otherwise toolbar
 * property edits in suggesting mode mint no revisions.
 *
 * Narrow对照 suite (mirrors the T27 core specs, but drives the commands
 * through `suggestingCommandFactories` exactly like `Toolbar.execCommand`
 * does): run toggle, paragraph alignment, and one table-property command
 * mint tracked changes in suggesting mode and behave bare-identically
 * with suggesting off.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { singletonManager } from '@xcrong/docx-editor-core/prosemirror/schema';
import { createSuggestionModePlugin } from '@xcrong/docx-editor-core/prosemirror/plugins';
import { suggestingCommandFactories } from './suggestingCommands';

const schema = singletonManager.getSchema();
const bare = singletonManager.getCommands();

function docWithText(text: string): PMNode {
  return schema.nodes.doc.create(null, [schema.node('paragraph', null, [schema.text(text)])]);
}

function cell(text: string): PMNode {
  return schema.nodes.tableCell.create(
    null,
    schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
  );
}

function docWithTable(): PMNode {
  const table = schema.nodes.table.create({ columnWidths: [3000, 3000] }, [
    schema.nodes.tableRow.create(null, [cell('a1'), cell('b1')]),
  ]);
  return schema.nodes.doc.create(null, [table, schema.nodes.paragraph.create()]);
}

function stateFor(doc: PMNode, suggesting: boolean): EditorState {
  return EditorState.create({
    schema,
    doc,
    plugins: suggesting ? [createSuggestionModePlugin(true, 'Jane')] : [],
  });
}

/** Run `cmd` over [from, to) the way Toolbar.execCommand does. */
function runCmd(state: EditorState, cmd: Command, from: number, to: number): EditorState {
  const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  let out: EditorState | null = null;
  const ok = cmd(selected, (tr) => {
    out = selected.apply(tr);
  });
  expect(ok).toBe(true);
  return out!;
}

function revisionMarks(state: EditorState): Array<{ text: string; author: string }> {
  const out: Array<{ text: string; author: string }> = [];
  state.doc.descendants((node) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      if (m.type.name === 'revision_change') {
        out.push({ text: node.text ?? '', author: m.attrs.author as string });
      }
    }
  });
  return out;
}

function firstParagraph(state: EditorState): PMNode | null {
  let found: PMNode | null = null;
  state.doc.descendants((node) => {
    if (!found && node.type.name === 'paragraph') found = node;
    return !found;
  });
  return found;
}

function firstCell(state: EditorState): PMNode | null {
  let found: PMNode | null = null;
  state.doc.descendants((node) => {
    if (!found && node.type.name === 'tableCell') found = node;
    return !found;
  });
  return found;
}

describe('issue #127: Vue command overlay routes to the suggesting wrappers', () => {
  test('overlay covers only real manager names (no typo keys, no missing wrap)', () => {
    for (const name of Object.keys(suggestingCommandFactories)) {
      expect(typeof suggestingCommandFactories[name]).toBe('function');
      expect(bare[name]).toBeDefined();
    }
  });

  test('suggesting bold via overlay mints revision_change; bare mints none', () => {
    const tracked = runCmd(
      stateFor(docWithText('Hello world'), true),
      suggestingCommandFactories.toggleBold!(),
      1,
      6
    );
    expect(revisionMarks(tracked)).toEqual([{ text: 'Hello', author: 'Jane' }]);

    const untracked = runCmd(stateFor(docWithText('Hello world'), true), bare.toggleBold!(), 1, 6);
    expect(revisionMarks(untracked)).toHaveLength(0);
  });

  test('closed-mode bold via overlay matches bare (bold, no revision)', () => {
    const state = runCmd(
      stateFor(docWithText('Hello world'), false),
      suggestingCommandFactories.toggleBold!(),
      1,
      6
    );
    expect(revisionMarks(state)).toHaveLength(0);
    let bold = false;
    state.doc.nodesBetween(1, 6, (node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'bold')) bold = true;
    });
    expect(bold).toBe(true);
  });

  test('suggesting alignCenter via overlay attaches pPrChange; bare does not', () => {
    const tracked = runCmd(
      stateFor(docWithText('Hello world'), true),
      suggestingCommandFactories.alignCenter!(),
      1,
      6
    );
    const trackedPara = firstParagraph(tracked);
    expect(trackedPara?.attrs.alignment).toBe('center');
    expect(Array.isArray(trackedPara?.attrs.pPrChange)).toBe(true);

    const untracked = runCmd(stateFor(docWithText('Hello world'), true), bare.alignCenter!(), 1, 6);
    expect(firstParagraph(untracked)?.attrs.alignment).toBe('center');
    expect(firstParagraph(untracked)?.attrs.pPrChange ?? null).toBeNull();
  });

  test('suggesting setCellFillColor via overlay attaches tcPrChange; bare does not', () => {
    // Cursor inside the first cell's text — the command resolves the cell.
    const tracked = runCmd(
      stateFor(docWithTable(), true),
      suggestingCommandFactories.setCellFillColor!('FF0000'),
      4,
      4
    );
    const trackedCell = firstCell(tracked);
    expect(Array.isArray(trackedCell?.attrs.tcPrChange)).toBe(true);

    const untracked = runCmd(
      stateFor(docWithTable(), true),
      bare.setCellFillColor!('FF0000'),
      4,
      4
    );
    expect((untracked && firstCell(untracked)?.attrs.tcPrChange) ?? null).toBeNull();
  });

  test('border adapters keep the bare factory shape (spec?) => Command', () => {
    const spec = { style: 'single', size: 4, color: { rgb: '000000' } };
    for (const name of [
      'setAllTableBorders',
      'setOutsideTableBorders',
      'setInsideTableBorders',
    ] as const) {
      const cmd = suggestingCommandFactories[name]!(spec);
      expect(typeof cmd).toBe('function');
    }
    expect(typeof suggestingCommandFactories.removeTableBorders!()).toBe('function');
  });
});
