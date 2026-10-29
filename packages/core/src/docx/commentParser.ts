/**
 * Comment Parser - Parse comments.xml and commentsExtensible.xml
 *
 * Parses OOXML comments (w:comment) from comments.xml file.
 * Cross-references with commentsExtensible.xml (or commentsExtended.xml)
 * to obtain reliable UTC timestamps via w16cex:dateUtc.
 *
 * Note: Microsoft Word stores w:date as local time WITHOUT timezone offset,
 * which is ambiguous. The reliable UTC timestamp lives in the separate
 * commentsExtensible.xml part (Word 2016+).
 *
 * OOXML Reference:
 * - Comments: w:comments
 * - Comment: w:comment (w:id, w:author, w:date, w:initials)
 * - Comment content: child w:p elements
 */

import type { Comment, Paragraph, Theme, RelationshipMap, MediaFile } from '../types/document';
import type { StyleMap } from './styleParser';
import { parseXml, findChild, getChildElements, getAttribute } from './xmlParser';
import { parseParagraph } from './paragraphParser';

/**
 * Build a lookup from paraId → dateUtc from commentsExtensible.xml
 *
 * Two shapes exist in the wild:
 * - Word 2016+ writes `<w16cex:comment w16cex:paraId="..." w16cex:dateUtc="..."/>`
 *   keyed by the comment paragraph's w14:paraId (see also the module docstring).
 * - Our own serializer (commentSerializer.serializeCommentsExtensible) writes
 *   `<w16cex:commentExtensible w16cex:durableId="..." w16cex:dateUtc="..."/>`
 *   keyed by the w16cid durableId, paired with commentsIds.xml mapping
 *   paraId ↔ durableId. Accept both so self-written files round-trip.
 *
 * When a commentsIds part is supplied, durableId-keyed entries are resolved
 * through its paraId ↔ durableId map; without it those entries are skipped
 * (no paraId to attach them to).
 */
function parseCommentsExtensible(
  xml: string,
  durableIdToParaId?: Map<string, string> | null
): Map<string, string> {
  const dateUtcByParaId = new Map<string, string>();

  const root = parseXml(xml);
  if (!root) return dateUtcByParaId;

  // Find the root element (may be w16cex:commentsExtensible or similar)
  const container = findChild(root, 'w16cex', 'commentsExtensible') ?? root;
  for (const child of getChildElements(container)) {
    const localName = child.name?.replace(/^.*:/, '') ?? '';
    if (localName !== 'comment' && localName !== 'commentExtensible') continue;

    // Try multiple namespace prefixes since they vary between Word versions
    const paraId =
      getAttribute(child, 'w16cex', 'paraId') ??
      getAttribute(child, 'w15', 'paraId') ??
      child.attributes?.['w16cex:paraId'] ??
      child.attributes?.['w15:paraId'];

    // Self-written shape: resolve durableId → paraId via commentsIds.xml.
    const rawDurableId =
      getAttribute(child, 'w16cex', 'durableId') ?? child.attributes?.['w16cex:durableId'];
    const durableParaId =
      rawDurableId && durableIdToParaId
        ? durableIdToParaId.get(String(rawDurableId).toUpperCase())
        : undefined;

    const dateUtc =
      getAttribute(child, 'w16cex', 'dateUtc') ??
      getAttribute(child, 'w15', 'dateUtc') ??
      child.attributes?.['w16cex:dateUtc'] ??
      child.attributes?.['w15:dateUtc'];

    const key = paraId ?? durableParaId;
    if (key && dateUtc) {
      dateUtcByParaId.set(String(key).toUpperCase(), String(dateUtc));
    }
  }

  return dateUtcByParaId;
}

/**
 * Parse commentsIds.xml (w16cid:commentsIds) into a durableId → paraId map.
 *
 * Each entry links a comment paragraph (`w16cid:paraId`, the w14:paraId on the
 * comment's last paragraph) to its stable id (`w16cid:durableId`). Used to
 * resolve `commentExtensible` date entries keyed by durableId.
 */
export function parseCommentsIds(xml: string | null | undefined): Map<string, string> {
  const durableIdToParaId = new Map<string, string>();
  if (!xml) return durableIdToParaId;

  const root = parseXml(xml);
  if (!root) return durableIdToParaId;

  const container = findChild(root, 'w16cid', 'commentsIds') ?? root;
  for (const child of getChildElements(container)) {
    const localName = child.name?.replace(/^.*:/, '') ?? '';
    if (localName !== 'commentId') continue;

    const paraId = getAttribute(child, 'w16cid', 'paraId') ?? child.attributes?.['w16cid:paraId'];
    const durableId =
      getAttribute(child, 'w16cid', 'durableId') ?? child.attributes?.['w16cid:durableId'];
    if (paraId && durableId) {
      durableIdToParaId.set(String(durableId).toUpperCase(), String(paraId).toUpperCase());
    }
  }

  return durableIdToParaId;
}

/**
 * Parse commentsExtended.xml (w15:commentsEx) for reply threading.
 * Returns a map of paraId → paraIdParent.
 */
function parseCommentsExtended(xml: string): {
  parentByParaId: Map<string, string>;
  doneByParaId: Map<string, boolean>;
} {
  const parentByParaId = new Map<string, string>();
  const doneByParaId = new Map<string, boolean>();

  const root = parseXml(xml);
  if (!root) return { parentByParaId, doneByParaId };

  const container = findChild(root, 'w15', 'commentsEx') ?? root;
  for (const child of getChildElements(container)) {
    const localName = child.name?.replace(/^.*:/, '') ?? '';
    if (localName !== 'commentEx') continue;

    const paraId = getAttribute(child, 'w15', 'paraId') ?? child.attributes?.['w15:paraId'];
    const paraIdParent =
      getAttribute(child, 'w15', 'paraIdParent') ?? child.attributes?.['w15:paraIdParent'];
    const done = getAttribute(child, 'w15', 'done') ?? child.attributes?.['w15:done'];

    if (paraId) {
      const pid = String(paraId).toUpperCase();
      if (paraIdParent) {
        parentByParaId.set(pid, String(paraIdParent).toUpperCase());
      }
      if (done === '1') {
        doneByParaId.set(pid, true);
      }
    }
  }

  return { parentByParaId, doneByParaId };
}

/**
 * Parse comments.xml into an array of Comment objects.
 *
 * If commentsExtensibleXml is provided, UTC timestamps are cross-referenced
 * via paraId and preferred over the ambiguous w:date local time.
 *
 * If commentsExtendedXml is provided, reply threading (paraIdParent) and
 * resolved state (done) are cross-referenced via paraId.
 */
export function parseComments(
  commentsXml: string | null,
  styles: StyleMap | null,
  theme: Theme | null,
  rels: RelationshipMap,
  media: Map<string, MediaFile>,
  commentsExtensibleXml?: string | null,
  commentsExtendedXml?: string | null,
  commentsIdsXml?: string | null
): Comment[] {
  if (!commentsXml) return [];

  const root = parseXml(commentsXml);
  if (!root) return [];

  // Build UTC date lookup from commentsExtensible.xml (if available).
  // DurableId-keyed entries (our own serializer shape) resolve through
  // commentsIds.xml; paraId-keyed entries (Word shape) need no map.
  const dateUtcByParaId = commentsExtensibleXml
    ? parseCommentsExtensible(commentsExtensibleXml, parseCommentsIds(commentsIdsXml))
    : new Map<string, string>();

  // Build threading lookup from commentsExtended.xml (if available)
  const extended = commentsExtendedXml ? parseCommentsExtended(commentsExtendedXml) : null;

  const commentsEl = findChild(root, 'w', 'comments') ?? root;
  const children = getChildElements(commentsEl);
  const comments: Comment[] = [];
  // Track each comment's last paragraph paraId for threading resolution
  const lastParaIdByCommentIdx: string[] = [];

  for (const child of children) {
    const localName = child.name?.replace(/^.*:/, '') ?? '';
    if (localName !== 'comment') continue;

    const id = parseInt(getAttribute(child, 'w', 'id') ?? '0', 10);
    const author = getAttribute(child, 'w', 'author') ?? 'Unknown';
    const rawInitials = getAttribute(child, 'w', 'initials');
    const initials = rawInitials != null ? String(rawInitials) : undefined;
    const rawDate = getAttribute(child, 'w', 'date');
    const localDate = rawDate != null ? String(rawDate) : undefined;

    // Parse comment content (paragraphs) and track the last paragraph's paraId.
    // The UTC date (commentsExtensible.xml), done state and threading
    // (commentsExtended.xml) are all keyed by the LAST content paragraph's
    // w14:paraId — not by any attribute on the w:comment element itself.
    const paragraphs: Paragraph[] = [];
    let lastParagraphParaId = '';
    for (const contentChild of getChildElements(child)) {
      const contentName = contentChild.name?.replace(/^.*:/, '') ?? '';
      if (contentName === 'p') {
        const paragraph = parseParagraph(contentChild, styles, theme, null, rels, media);
        paragraphs.push(paragraph);
        // Get w14:paraId from the paragraph element
        const pParaId =
          getAttribute(contentChild, 'w14', 'paraId') ?? contentChild.attributes?.['w14:paraId'];
        if (pParaId) lastParagraphParaId = String(pParaId).toUpperCase();
      }
    }

    // Prefer the UTC date (keyed by last-paragraph paraId) over the
    // ambiguous local w:date. Fall back to a w14:paraId carried directly on
    // the w:comment element — some producers put it there instead of (or in
    // addition to) the content paragraph.
    const elementParaId =
      getAttribute(child, 'w14', 'paraId') ??
      child.attributes?.['w14:paraId'] ??
      getAttribute(child, 'w', 'paraId');
    const dateUtc =
      (lastParagraphParaId ? dateUtcByParaId.get(lastParagraphParaId) : undefined) ??
      (elementParaId ? dateUtcByParaId.get(String(elementParaId).toUpperCase()) : undefined);
    const date = dateUtc ?? localDate;

    // Parse w:done attribute (resolved/done state)
    const rawDone = getAttribute(child, 'w', 'done') ?? child.attributes?.['w:done'];
    let done = rawDone === '1' || rawDone === 'true' ? true : undefined;

    // Parse parent comment ID for replies (w16cid:parentId on w:comment)
    const rawParentId =
      getAttribute(child, 'w16cid', 'parentId') ??
      getAttribute(child, 'w', 'parentId') ??
      child.attributes?.['w16cid:parentId'] ??
      child.attributes?.['w:parentId'];
    const parentId = rawParentId != null ? parseInt(String(rawParentId), 10) : undefined;

    // Cross-reference done state from commentsExtended.xml
    if (done == null && extended && lastParagraphParaId) {
      const extDone = extended.doneByParaId.get(lastParagraphParaId);
      if (extDone) done = true;
    }

    lastParaIdByCommentIdx.push(lastParagraphParaId);

    comments.push({
      id,
      author,
      initials,
      date,
      content: paragraphs,
      ...(done != null ? { done } : {}),
      ...(parentId != null && !isNaN(parentId) ? { parentId } : {}),
    });
  }

  // Resolve reply threading from commentsExtended.xml (w15:paraIdParent)
  // Word stores threading here, not as w16cid:parentId on w:comment
  if (extended && extended.parentByParaId.size > 0) {
    // Build reverse lookup: paraId → comment id
    const commentIdByParaId = new Map<string, number>();
    for (let i = 0; i < comments.length; i++) {
      const pid = lastParaIdByCommentIdx[i];
      if (pid) commentIdByParaId.set(pid, comments[i].id);
    }

    for (let i = 0; i < comments.length; i++) {
      if (comments[i].parentId != null) continue; // already has parentId
      const pid = lastParaIdByCommentIdx[i];
      if (!pid) continue;
      const parentParaId = extended.parentByParaId.get(pid);
      if (!parentParaId) continue;
      const parentCommentId = commentIdByParaId.get(parentParaId);
      if (parentCommentId != null) {
        comments[i] = { ...comments[i], parentId: parentCommentId };
      }
    }
  }

  return comments;
}
