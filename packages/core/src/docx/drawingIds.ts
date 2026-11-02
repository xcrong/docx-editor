/**
 * Drawing ID normalization — duplicate `wp:docPr` / `pic:cNvPr` IDs.
 *
 * Template engines sometimes emit every image with `id="0"` (or the same
 * numeric id). The parser keys images by `r:embed` (see `imageParser.ts`),
 * so all pictures still resolve — but the serializer echoes `image.id`
 * verbatim into both `wp:docPr id` and `pic:cNvPr id`, producing duplicate
 * IDs that Word flags as invalid.
 *
 * `ensureUniqueDrawingIds` rewrites duplicate or invalid (`"0"`, empty,
 * non-numeric) drawing/shape IDs in place to unique positive integers
 * before serialization. It is idempotent: already-unique documents are
 * untouched. Non-standard relationship IDs (`r:embed`) are never modified —
 * only the `docPr`/`cNvPr` display IDs are normalized.
 */

import type { Document } from '../types/document';
import type { BlockContent, ParagraphContent } from '../types/content';

interface IdHolder {
  id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asBlocks(value: unknown): BlockContent[] | null {
  return Array.isArray(value) ? (value as BlockContent[]) : null;
}

function asParagraphContents(value: unknown): ParagraphContent[] | null {
  return Array.isArray(value) ? (value as ParagraphContent[]) : null;
}

/**
 * Ensure every image/shape `id` in the document is a unique positive
 * integer string. Mutates the model in place; safe to call repeatedly.
 */
export function ensureUniqueDrawingIds(doc: Document): void {
  const seen = new Set<string>();
  let max = 0;

  const claim = (raw: unknown): string | null => {
    const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
    if (!/^[1-9]\d*$/.test(s) || seen.has(s)) return null;
    // Beyond 2^53 the counter below can no longer produce a distinct
    // successor (`max + 1 === max`), so treat unsafe integers as invalid
    // and remap them instead of risking a duplicate.
    const n = Number(s);
    if (!Number.isSafeInteger(n)) return null;
    seen.add(s);
    if (n > max) max = n;
    return s;
  };

  const assign = (): string => {
    // Guarded against `seen` so a later explicit id can never collide with
    // an earlier auto-assigned one, regardless of document order.
    let s: string;
    do {
      max += 1;
      if (!Number.isSafeInteger(max)) {
        throw new Error('Cannot assign a unique drawing ID: ID space exhausted');
      }
      s = String(max);
    } while (seen.has(s));
    seen.add(s);
    return s;
  };

  const fix = (holder: IdHolder): void => {
    const claimed = claim(holder.id);
    if (claimed !== null) {
      // Normalize (e.g. trim surrounding whitespace) while keeping the value.
      holder.id = claimed;
      return;
    }
    holder.id = assign();
  };

  const visitRunContent = (content: unknown): void => {
    if (!isRecord(content)) return;
    if (content.type === 'drawing' && isRecord(content.image)) {
      fix(content.image as IdHolder);
      return;
    }
    if (content.type === 'shape' && isRecord(content.shape)) {
      const shape = content.shape as IdHolder & Record<string, unknown>;
      fix(shape);
      const textBody = shape.textBody;
      if (isRecord(textBody)) {
        const paragraphs = asBlocks(textBody.content);
        if (paragraphs) visitBlocks(paragraphs);
      }
    }
  };

  const visitParagraphContent = (item: unknown): void => {
    if (!isRecord(item)) return;
    switch (item.type) {
      case 'run':
        for (const c of asParagraphContents(item.content) ?? []) visitRunContent(c);
        break;
      case 'hyperlink':
        // Children are typed as runs/bookmarks, but recurse generically so a
        // drawing nested under any wrapper is still normalized.
        for (const c of asParagraphContents(item.children) ?? []) visitParagraphContent(c);
        break;
      case 'insertion':
      case 'deletion':
      case 'moveFrom':
      case 'moveTo':
        for (const c of asParagraphContents(item.content) ?? []) visitParagraphContent(c);
        break;
      case 'inlineSdt':
        for (const c of asParagraphContents(item.content) ?? []) visitParagraphContent(c);
        break;
      case 'simpleField':
        for (const c of asParagraphContents(item.content) ?? []) visitParagraphContent(c);
        break;
      case 'complexField': {
        for (const key of ['fieldCode', 'fieldResult'] as const) {
          const runs = item[key];
          if (Array.isArray(runs)) {
            for (const r of runs) visitParagraphContent(r);
          }
        }
        break;
      }
      default:
        break;
    }
  };

  const visitBlocks = (blocks: BlockContent[]): void => {
    for (const block of blocks) {
      if (!isRecord(block)) continue;
      if (block.type === 'paragraph') {
        for (const item of asParagraphContents(block.content) ?? []) {
          visitParagraphContent(item);
        }
      } else if (block.type === 'table' && Array.isArray(block.rows)) {
        for (const row of block.rows) {
          if (!isRecord(row) || !Array.isArray(row.cells)) continue;
          for (const cell of row.cells) {
            if (!isRecord(cell)) continue;
            const nested = asBlocks(cell.content);
            if (nested) visitBlocks(nested);
          }
        }
      } else {
        // BlockSdt and future block wrappers carry nested blocks in `content`.
        const nested = asBlocks(block.content);
        if (nested) visitBlocks(nested);
      }
    }
  };

  const pkg = doc.package;
  visitBlocks(pkg.document.content);
  for (const map of [pkg.headers, pkg.footers] as const) {
    if (!map) continue;
    for (const hf of map.values()) visitBlocks(hf.content);
  }
  for (const group of [
    pkg.footnotes,
    pkg.endnotes,
    pkg.footnoteSeparators,
    pkg.endnoteSeparators,
  ] as const) {
    if (!group) continue;
    for (const note of group) visitBlocks(note.content);
  }
}
