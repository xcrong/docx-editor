/**
 * Minimal DSL for the demo showcase generator (T25-02, #53).
 *
 * Thin constructors over the Document model (`packages/core/src/types`).
 * No OOXML strings here — serialization is the headless pipeline's job
 * (`createDocx` + `updateMultipleFiles`), keeping this file free of
 * hand-built XML.
 */
import type {
  BlockContent,
  BlockSdt,
  Hyperlink,
  InlineSdt,
  Insertion,
  Deletion,
  Paragraph,
  ParagraphContent,
  Run,
  RunContent,
  SdtProperties,
  Shape,
  Table,
  TableCell,
  TableRow,
  TableCellFormatting,
  TableRowFormatting,
  TableFormatting,
  TextFormatting,
  ParagraphFormatting,
} from '../../packages/core/src/types/document.ts';

/** Text run with optional character formatting. */
export function run(text: string, formatting?: TextFormatting): Run {
  const content: RunContent[] = text === '' ? [] : [{ type: 'text', text }];
  return formatting ? { type: 'run', formatting, content } : { type: 'run', content };
}

/** Tab stop character run, optionally wrapped with surrounding text. */
export function tabRun(before = '', after = ''): Run {
  const content: RunContent[] = [];
  if (before) content.push({ type: 'text', text: before });
  content.push({ type: 'tab' });
  if (after) content.push({ type: 'text', text: after });
  return { type: 'run', content };
}

/** Monospace "code" run for package names / commands. */
export function code(text: string): Run {
  return run(text, {
    fontFamily: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'SimSun' },
    fontSize: 20,
    shading: { pattern: 'clear', fill: { rgb: 'F1F3F5' } },
  });
}

/** Paragraph from runs (or a single string). */
export function para(
  content: string | ParagraphContent[],
  formatting?: ParagraphFormatting
): Paragraph {
  const inner: ParagraphContent[] = typeof content === 'string' ? [run(content)] : content;
  return formatting
    ? { type: 'paragraph', formatting, content: inner }
    : { type: 'paragraph', content: inner };
}

/** Title / Heading 1-3 paragraphs (style-driven, no direct formatting). */
export function title(text: string): Paragraph {
  return para(text, { styleId: 'Title' });
}

export function h1(text: string): Paragraph {
  return para(text, { styleId: 'Heading1' });
}

export function h2(text: string): Paragraph {
  return para(text, { styleId: 'Heading2' });
}

export function h3(text: string): Paragraph {
  return para(text, { styleId: 'Heading3' });
}

/** External hyperlink (rId is assigned by the repacker from href). */
export function link(text: string, href: string, tooltip?: string): Hyperlink {
  const children: Hyperlink['children'] = [
    run(text, {
      color: { rgb: '0563C1' },
      underline: { style: 'single', color: { rgb: '0563C1' } },
    }),
  ];
  return tooltip
    ? { type: 'hyperlink', href, tooltip, children }
    : { type: 'hyperlink', href, children };
}

/** Tracked deletion/insertion preserving the three legacy revision groups. */
export function del(author: string, id: number, date: string, text: string): Deletion {
  return { type: 'deletion', info: { id, author, date }, content: [run(text)] };
}

export function ins(author: string, id: number, date: string, text: string): Insertion {
  return { type: 'insertion', info: { id, author, date }, content: [run(text)] };
}

/** Table cell holding paragraphs and/or nested tables. */
export function cell(content: (Paragraph | Table)[], formatting?: TableCellFormatting): TableCell {
  return formatting ? { type: 'tableCell', formatting, content } : { type: 'tableCell', content };
}

/** Table row. */
export function row(cells: TableCell[], formatting?: TableRowFormatting): TableRow {
  return formatting ? { type: 'tableRow', formatting, cells } : { type: 'tableRow', cells };
}

/** Table with explicit grid widths (twips). */
export function tbl(rows: TableRow[], columnWidths: number[], formatting?: TableFormatting): Table {
  return formatting
    ? { type: 'table', rows, columnWidths, formatting }
    : { type: 'table', rows, columnWidths };
}

/** Whole-table single-rule borders shared by the §3 tables. */
export function gridBorders(): TableFormatting['borders'] {
  const side = { style: 'single' as const, size: 4, space: 0, color: { rgb: '999999' } };
  return { top: side, left: side, bottom: side, right: side, insideH: side, insideV: side };
}

/** Block-level content control (`w:sdt` wrapping block content). */
export function blockSdt(properties: SdtProperties, content: BlockContent[]): BlockSdt {
  return { type: 'blockSdt', properties, content };
}

/** Inline content control (`w:sdt` inside a paragraph). */
export function inlineSdt(properties: SdtProperties, content: InlineSdt['content']): InlineSdt {
  return { type: 'inlineSdt', properties, content };
}

/** Run carrying a DrawingML shape / text box (`w:drawing` with `wps:wsp`). */
export function shapeRun(shape: Shape): Run {
  return { type: 'run', content: [{ type: 'shape', shape }] };
}

/** Re-exported so sections share one BlockContent import surface. */
export type { BlockContent };
