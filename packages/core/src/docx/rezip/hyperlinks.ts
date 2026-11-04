/**
 * Hyperlink relationship registration.
 *
 * On save, scan every part (body, headers, footers, footnotes, endnotes) for
 * external hyperlinks and ensure each emitted rId resolves to a matching
 * relationship in the owning part's rels file:
 *   - newly created links (href, no rId) get a fresh relationship,
 *   - links whose href changed are rebound to a matching or new relationship,
 *   - links whose rId no longer resolves and have no href are dropped.
 *
 * Internal-target relationships (TargetMode != "External") are preserved while
 * the link's href still matches them, so they are never silently rewritten into
 * external URLs; an edited href rebinds to an external relationship.
 */

import type JSZip from 'jszip';
import type { BlockContent, Hyperlink, Image, ParagraphContent } from '../../types/content';
import { RELATIONSHIP_TYPES } from '../relsParser';
import { escapeXml } from '../serializer/xmlUtils';
import { sanitizeHref } from '../../utils/sanitizeHref';
import { findMaxRId, readRelsOrStub, type Part } from './parts';

/**
 * Collect all external hyperlinks (href and/or rId, but not bookmark anchors)
 * from block content. Anchor links resolve in-document and need no relationship.
 */
function collectExternalHyperlinks(blocks: BlockContent[]): Hyperlink[] {
  const hyperlinks: Hyperlink[] = [];

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      for (const item of block.content) {
        if (item.type === 'hyperlink' && (item.href || item.rId) && !item.anchor) {
          hyperlinks.push(item);
        }
      }
    } else if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          hyperlinks.push(...collectExternalHyperlinks(cell.content));
        }
      }
    } else if (block.type === 'blockSdt') {
      hyperlinks.push(...collectExternalHyperlinks(block.content));
    }
  }

  return hyperlinks;
}

/**
 * Collect images carrying an `a:hlinkClick` hyperlink (href and/or rId) from
 * block content, including drawings nested in text-hyperlink children and
 * tracked-change wrappers. Mirrors the traversal of collectExternalHyperlinks
 * so image links get the same rel registration as text links.
 */
function collectImageHyperlinks(blocks: BlockContent[]): Image[] {
  const images: Image[] = [];

  const collectFromRun = (run: { content?: unknown }): void => {
    const contents = (run as { content?: unknown }).content;
    const list = Array.isArray(contents) ? contents : [contents];
    for (const c of list) {
      if ((c as { type?: string }).type === 'drawing') {
        const image = (c as { image: Image }).image;
        if (image.hlinkHref || image.hlinkRId) images.push(image);
      } else if ((c as { type?: string }).type === 'shape') {
        // Drawings nested in shape/textbox text bodies (text links share this
        // gap for Hyperlink blocks — pre-existing; images are covered here so
        // their hrefs are never silently dropped on save).
        const textBody = (
          c as { shape?: { textBody?: { content?: { content?: ParagraphContent[] }[] } } }
        ).shape?.textBody;
        for (const para of textBody?.content ?? []) {
          if (para?.content) collectFromItems(para.content);
        }
      }
    }
  };

  const collectFromItems = (items: ParagraphContent[]): void => {
    for (const item of items) {
      if (item.type === 'run') {
        collectFromRun(item);
      } else if (item.type === 'hyperlink') {
        for (const child of item.children) {
          if (child.type === 'run') collectFromRun(child);
        }
      } else if (item.type === 'insertion' || item.type === 'deletion') {
        for (const child of item.content) {
          if (child.type === 'run') collectFromRun(child);
          else if (child.type === 'hyperlink') {
            for (const grandchild of child.children) {
              if (grandchild.type === 'run') collectFromRun(grandchild);
            }
          }
        }
      } else if (item.type === 'inlineSdt') {
        for (const child of item.content) {
          if (child.type === 'run') collectFromRun(child as never);
          else if (child.type === 'hyperlink') {
            for (const grandchild of child.children) {
              if (grandchild.type === 'run') collectFromRun(grandchild);
            }
          }
        }
      }
    }
  };

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      collectFromItems(block.content);
    } else if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          images.push(...collectImageHyperlinks(cell.content));
        }
      }
    } else if (block.type === 'blockSdt') {
      images.push(...collectImageHyperlinks(block.content));
    }
  }

  return images;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The `<Relationship .../>` element whose `Id` equals `rId`, if present. */
function relationshipElementForId(relsXml: string, rId: string): string | undefined {
  const match = relsXml.match(
    new RegExp(`<Relationship\\b(?=[^>]*\\bId="${escapeRegExp(rId)}")[^>]*/?>`)
  );
  return match?.[0];
}

/** True if the relationship is an external hyperlink (vs. an internal target). */
function relationshipIsExternalHyperlink(relationshipXml: string | undefined): boolean {
  return (
    !!relationshipXml &&
    relationshipXml.includes(`Type="${RELATIONSHIP_TYPES.hyperlink}"`) &&
    relationshipXml.includes('TargetMode="External"')
  );
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * True if the relationship's Target resolves to `href`. Compares the decoded
 * Target to the decoded href so a producer's escaping choice (e.g. a raw `'`
 * that escapeXml would render as `&apos;`) does not cause a spurious mismatch.
 */
function relationshipTargetMatches(relationshipXml: string | undefined, href: string): boolean {
  const target = relationshipXml?.match(/\bTarget="([^"]*)"/)?.[1];
  return target != null && decodeXmlEntities(target) === href;
}

/** True if the relationship is an external hyperlink that targets `href`. */
function relationshipTargetsHref(relationshipXml: string | undefined, href: string): boolean {
  return (
    relationshipIsExternalHyperlink(relationshipXml) &&
    relationshipTargetMatches(relationshipXml, href)
  );
}

/** Find an existing external hyperlink relationship that already targets `href`. */
function findExistingHyperlinkRelationshipId(relsXml: string, href: string): string | undefined {
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    if (relationshipTargetsHref(match[0], href)) {
      return match[0].match(/\bId="([^"]+)"/)?.[1];
    }
  }
  return undefined;
}

/**
 * Process external hyperlinks across all parts (body, headers, footers,
 * footnotes, endnotes): assign/rebind rIds and add relationship entries to the
 * owning part's rels file. Mutates each hyperlink's rId in-place.
 */
export async function processNewHyperlinks(
  parts: Part[],
  zip: JSZip,
  compressionLevel: number
): Promise<void> {
  for (const { relsPath, blocks } of parts) {
    const hyperlinks = collectExternalHyperlinks(blocks);
    const images = collectImageHyperlinks(blocks);
    if (hyperlinks.length === 0 && images.length === 0) continue;

    const relsXml = await readRelsOrStub(zip, relsPath);
    let maxId = findMaxRId(relsXml);
    const relEntries: string[] = [];

    for (const hyperlink of hyperlinks) {
      const href = hyperlink.href;
      const currentRelationship = hyperlink.rId
        ? relationshipElementForId(relsXml, hyperlink.rId)
        : undefined;

      // No href: keep a resolving rId as-is, drop a stale one.
      if (!href) {
        if (!currentRelationship) {
          hyperlink.rId = undefined;
        }
        continue;
      }

      // Already bound to a relationship that targets this href — nothing to do.
      if (relationshipTargetsHref(currentRelationship, href)) {
        continue;
      }

      // An existing internal-target relationship (not External) is preserved as
      // long as the href still matches it — never silently rewrite an internal
      // link into an external URL. If the href was edited away from the internal
      // target, fall through and rebind to an external relationship.
      if (
        currentRelationship &&
        !relationshipIsExternalHyperlink(currentRelationship) &&
        relationshipTargetMatches(currentRelationship, href)
      ) {
        continue;
      }

      const existingRId = findExistingHyperlinkRelationshipId(relsXml, href);
      if (existingRId) {
        hyperlink.rId = existingRId;
        continue;
      }

      maxId++;
      const newRId = `rId${maxId}`;

      relEntries.push(
        `<Relationship Id="${newRId}" Type="${RELATIONSHIP_TYPES.hyperlink}" Target="${escapeXml(href)}" TargetMode="External"/>`
      );

      hyperlink.rId = newRId;
    }

    // Image hyperlinks (`a:hlinkClick`): same rel registration as text links.
    // Hrefs are re-sanitized so a bypassed model value can't persist a
    // javascript: target into the rels file.
    for (const image of images) {
      const href = sanitizeHref(image.hlinkHref);
      if (!href) {
        image.hlinkHref = undefined;
        // Keep a resolving rId (original rel still targets the old URL);
        // drop a stale one.
        if (image.hlinkRId && !relationshipElementForId(relsXml, image.hlinkRId)) {
          image.hlinkRId = undefined;
        }
        continue;
      }
      image.hlinkHref = href;
      const currentRelationship = image.hlinkRId
        ? relationshipElementForId(relsXml, image.hlinkRId)
        : undefined;
      if (relationshipTargetsHref(currentRelationship, href)) continue;
      // Preserve a matching internal-target relationship (never silently
      // rewrite an internal link into an external URL), mirroring text links.
      if (
        currentRelationship &&
        !relationshipIsExternalHyperlink(currentRelationship) &&
        relationshipTargetMatches(currentRelationship, href)
      ) {
        continue;
      }
      const existingRId = findExistingHyperlinkRelationshipId(relsXml, href);
      if (existingRId) {
        image.hlinkRId = existingRId;
        continue;
      }
      maxId++;
      const newRId = `rId${maxId}`;
      relEntries.push(
        `<Relationship Id="${newRId}" Type="${RELATIONSHIP_TYPES.hyperlink}" Target="${escapeXml(href)}" TargetMode="External"/>`
      );
      image.hlinkRId = newRId;
    }

    if (relEntries.length === 0) continue;

    const updatedRelsXml = relsXml.replace(
      '</Relationships>',
      relEntries.join('') + '</Relationships>'
    );
    zip.file(relsPath, updatedRelsXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }
}
