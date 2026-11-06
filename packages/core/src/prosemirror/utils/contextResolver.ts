/**
 * Context resolution for the right-click context menu.
 *
 * `resolveContext` inspects the ProseMirror document at a resolved position
 * and reports what was right-clicked: plain text, selected text, a table
 * cell, an image node, a hyperlink, or a combination (e.g. a link inside a
 * table). Menu item providers compose on this single signal.
 */

import type { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';

export interface ContextInfo {
  /** Whether the current selection is non-empty. */
  isTextSelected: boolean;
  /** Whether the position is inside a table cell. */
  isInTable: boolean;
  /** Whether the position is on an image node. */
  isOnImage: boolean;
  /** Whether the position carries a hyperlink mark. */
  isOnHyperlink: boolean;
  /** The link target when `isOnHyperlink`, else `null`. */
  linkHref: string | null;
  /** Document position of the image node when `isOnImage`, else `null`. */
  imagePos: number | null;
  /** Row/column counts and the cell's indexes; `null` outside tables. */
  tableRowCount: number | null;
  tableColumnCount: number | null;
  tableRowIndex: number | null;
  tableColumnIndex: number | null;
}

const EMPTY: ContextInfo = {
  isTextSelected: false,
  isInTable: false,
  isOnImage: false,
  isOnHyperlink: false,
  linkHref: null,
  imagePos: null,
  tableRowCount: null,
  tableColumnCount: null,
  tableRowIndex: null,
  tableColumnIndex: null,
};

function isCell(node: PMNode): boolean {
  return node.type.name === 'tableCell' || node.type.name === 'tableHeader';
}

/** Nearest ancestor (including self) with the given node type name. */
function findAncestor(
  $pos: { node(depth: number): PMNode; depth: number },
  fromDepth: number,
  name: string
): PMNode | null {
  for (let depth = fromDepth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === name) return node;
  }
  return null;
}

/**
 * Resolve the editing context at a document position.
 * `pos` is clamped into the document; out-of-range input never throws.
 */
export function resolveContext(state: EditorState, pos: number): ContextInfo {
  const { doc, selection, schema } = state;
  const info: ContextInfo = { ...EMPTY, isTextSelected: !selection.empty };

  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);

  // Table: nearest cell ancestor, then its row and table.
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (!isCell(node)) continue;
    info.isInTable = true;
    const parentRow = findAncestor($pos, depth, 'tableRow');
    const table = findAncestor($pos, depth, 'table');
    if (table) {
      info.tableRowCount = table.childCount;
      let columns = 0;
      table.forEach((child, _offset, index) => {
        if (child.type.name !== 'tableRow') return;
        let cells = 0;
        child.forEach((cell) => {
          if (isCell(cell)) cells++;
        });
        columns = Math.max(columns, cells);
        if (parentRow && child === parentRow) info.tableRowIndex = index;
      });
      info.tableColumnCount = columns;
    }
    if (parentRow) {
      let found: number | null = null;
      parentRow.forEach((cell, _offset, index) => {
        if (cell === node) found = index;
      });
      info.tableColumnIndex = found;
    }
    break;
  }

  // Image: the node after the position, or the node ending at it.
  const after = $pos.nodeAfter;
  const before = $pos.nodeBefore;
  if (after && after.type.name === 'image') {
    info.isOnImage = true;
    info.imagePos = clamped;
  } else if (before && before.type.name === 'image') {
    info.isOnImage = true;
    info.imagePos = clamped - before.nodeSize;
  }

  // Hyperlink: marks at the position or on the adjacent text nodes.
  const hlType = schema.marks.hyperlink;
  if (hlType) {
    let link = $pos.marks().find((m) => m.type === hlType);
    if (!link && after?.isText) link = after.marks.find((m) => m.type === hlType);
    if (!link && before?.isText) link = before.marks.find((m) => m.type === hlType);
    if (link) {
      info.isOnHyperlink = true;
      const href = (link.attrs as { href?: unknown }).href;
      info.linkHref = typeof href === 'string' ? href : null;
    }
  }

  return info;
}
