/**
 * Reconcile list references with numbering definitions before saving.
 *
 * Root cause of Word's "Show Repairs → Lists 1": the editor hardcodes
 * `numId` 1 (bullet) / 2 (numbered) when toggling lists
 * (`ListExtension.toggleList`). When the source document has no
 * `word/numbering.xml` — or its numbering defines different `numId`s —
 * the saved `document.xml` references `numId`s with no backing `w:num`
 * definition. `ensureNumberingPart` only writes through
 * `package.numbering` (the preserved original, empty in this case), so the
 * dangling reference ships and Word repairs the file on open.
 *
 * `reconcileNumberingDefinitions` scans the exported model for `numPr`
 * references that will actually serialize (mirroring the serializer's
 * style-sourced skip) and synthesizes minimal `w:num` + `w:abstractNum`
 * definitions for the missing ones, using the same level geometry as
 * `collectNumberingFromPM`. Returns true when it added definitions so the
 * caller knows a preserved `numbering.xml` part must be rewritten.
 */

import type {
  AbstractNumbering,
  Document,
  ListLevel,
  NumberFormat,
  NumberingInstance,
} from '../types/document';
import type { BlockContent } from '../types/content/section';
import type { Paragraph } from '../types/content/paragraph';
import type { Table } from '../types/content/table';

/** Word's default list geometry: 0.5" indent per level, 0.25" hanging marker. */
const LEVEL_INDENT_TWIPS = 720;
const HANGING_TWIPS = 360;
const DEFAULT_BULLET = '•';

/** A list reference that will actually serialize into `document.xml`. */
export interface ListReference {
  numId: number;
  ilvl: number;
  isBullet: boolean;
  numFmt?: NumberFormat;
  marker?: string;
}

function collectFromParagraph(para: Paragraph, out: ListReference[]): void {
  const numPr = para.formatting?.numPr;
  if (!numPr || typeof numPr.numId !== 'number' || numPr.numId <= 0) return;
  // Mirror the serializer's style-sourced skip (paragraphSerializer.ts):
  // numPr equal to the style-resolved value is omitted on write, so it
  // needs no backing definition.
  const fromStyle = para.formatting?.numPrFromStyle;
  if (fromStyle != null && JSON.stringify(numPr) === JSON.stringify(fromStyle)) {
    return;
  }
  out.push({
    numId: numPr.numId,
    ilvl: numPr.ilvl ?? 0,
    isBullet: para.listRendering?.isBullet ?? numPr.numId === 1,
    numFmt: para.listRendering?.numFmt,
    marker: para.listRendering?.marker,
  });
}

function collectFromTable(table: Table, out: ListReference[]): void {
  for (const row of table.rows ?? []) {
    for (const cell of row.cells ?? []) collectFromBlocks(cell.content, out);
  }
}

function collectFromBlocks(blocks: BlockContent[] | undefined, out: ListReference[]): void {
  if (!blocks) return;
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        collectFromParagraph(block, out);
        break;
      case 'table':
        collectFromTable(block, out);
        break;
      case 'blockSdt':
        collectFromBlocks(block.content, out);
        break;
    }
  }
}

/**
 * Every `numId` the exported model will reference, from body + headers +
 * footers + footnotes/endnotes (numbering definitions are document-wide).
 */
export function collectReferencedNumIds(doc: Document): ListReference[] {
  const out: ListReference[] = [];
  const pkg = doc.package;
  collectFromBlocks(pkg.document.content, out);
  for (const map of [pkg.headers, pkg.footers] as const) {
    if (!map) continue;
    for (const hf of map.values()) collectFromBlocks(hf.content, out);
  }
  for (const notes of [pkg.footnotes, pkg.endnotes] as const) {
    if (!notes) continue;
    for (const note of notes) collectFromBlocks(note.content, out);
  }
  return out;
}

function makeLevel(ilvl: number, numFmt: NumberFormat, marker: string | undefined): ListLevel {
  const isBullet = numFmt === 'bullet';
  return {
    ilvl,
    start: 1,
    numFmt,
    lvlText: isBullet ? marker?.trim() || DEFAULT_BULLET : `%${ilvl + 1}.`,
    lvlJc: 'left',
    pPr: {
      indentLeft: LEVEL_INDENT_TWIPS * (ilvl + 1),
      indentFirstLine: HANGING_TWIPS,
      hangingIndent: true,
    },
  };
}

/**
 * Synthesize backing definitions for referenced `numId`s missing from
 * `package.numbering`. Returns true when definitions were added.
 */
export function reconcileNumberingDefinitions(doc: Document): boolean {
  const refs = collectReferencedNumIds(doc);
  if (refs.length === 0) return false;

  let numbering = doc.package.numbering;
  if (!numbering) {
    numbering = { abstractNums: [], nums: [] };
    doc.package.numbering = numbering;
  }
  const defined = new Set(numbering.nums.map((n) => n.numId));
  const missing = refs.filter((r) => !defined.has(r.numId));
  if (missing.length === 0) return false;

  let nextAbstract = numbering.abstractNums.reduce((m, a) => Math.max(m, a.abstractNumId), -1) + 1;
  const usedAbstract = new Set(numbering.abstractNums.map((a) => a.abstractNumId));
  const byNum = new Map<number, ListReference[]>();
  for (const ref of missing) {
    const list = byNum.get(ref.numId) ?? [];
    list.push(ref);
    byNum.set(ref.numId, list);
  }

  for (const [numId, group] of byNum) {
    while (usedAbstract.has(nextAbstract)) nextAbstract++;
    const abstractNumId = nextAbstract++;
    usedAbstract.add(abstractNumId);
    const first = group[0];
    const numFmt: NumberFormat = first.numFmt ?? (first.isBullet ? 'bullet' : 'decimal');
    const maxIlvl = group.reduce((m, g) => Math.max(m, g.ilvl), 0);
    const levels: ListLevel[] = [];
    for (let i = 0; i <= Math.min(maxIlvl, 8); i++) {
      levels.push(makeLevel(i, numFmt, i === first.ilvl ? first.marker : undefined));
    }
    const abstractNum: AbstractNumbering = {
      abstractNumId,
      multiLevelType: 'hybridMultilevel',
      levels,
    };
    numbering.abstractNums.push(abstractNum);
    const instance: NumberingInstance = { numId, abstractNumId };
    numbering.nums.push(instance);
    defined.add(numId);
  }
  numbering.abstractNums.sort((a, b) => a.abstractNumId - b.abstractNumId);
  numbering.nums.sort((a, b) => a.numId - b.numId);
  return true;
}
