/**
 * Paste Style Inliner Extension
 *
 * When pasting from apps like Google Docs that use class-based CSS
 * (e.g. `<style>.c5 { margin-top: 12pt }</style>`) instead of inline styles,
 * ProseMirror's parseDOM can't read the styles because elements aren't attached
 * to the live document during parsing.
 *
 * This extension provides a `transformPastedHTML` hook that:
 * 1. Parses the pasted HTML string (inert DOMParser document, never live DOM)
 * 2. Extracts all `<style>` rules and inlines them onto matching elements
 * 3. Unwraps Google Docs structural wrappers (`<b id="docs-internal-guid-…">`)
 * 4. Moves td/th fills to `data-bgcolor` so cell color doesn't leak into
 *    text highlight marks (the cell spec reads the dataset)
 * 5. Flattens `<ul>/<ol>/<li>` list structure into `<p data-paste-list …>`
 *    paragraphs (lists are paragraph attrs in our schema, not nodes)
 * 6. Converts heading-like `<p>` (large bold text) into `<h1>`–`<h6>` so the
 *    paragraph spec assigns Heading styleIds
 * 7. Runs the result through a DOMPurify tag/attribute allowlist so only
 *    formatting PM understands survives (scripts, handlers, javascript: URLs
 *    and tracking ids are dropped)
 * 8. Returns the modified HTML so parseDOM can read inline styles
 */

import createDOMPurify from 'dompurify';
import { Plugin } from 'prosemirror-state';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';
import { Priority } from '../types';

// dompurify binds to the live window lazily (see utils/clipboard.ts) so this
// module also works when a DOM is installed after import (test environments).
let domPurify: ReturnType<typeof createDOMPurify> | undefined;
function getDomPurify(): ReturnType<typeof createDOMPurify> {
  return (domPurify ??= createDOMPurify(window));
}

/**
 * Parse a CSS rule's style declarations into a Record<property, value>.
 */
function parseStyleDeclarations(cssText: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Split on semicolons, handling edge cases
  const declarations = cssText.split(';');
  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;
    const prop = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (prop && value) {
      result[prop] = value;
    }
  }
  return result;
}

/**
 * Merge style declarations onto an element's existing inline style.
 * Existing inline styles take precedence (they were explicitly set by the app).
 */
function mergeStylesOntoElement(element: HTMLElement, declarations: Record<string, string>): void {
  const existingStyle = element.getAttribute('style') || '';
  const existingDeclarations = parseStyleDeclarations(existingStyle);

  // Only add properties that aren't already inline
  for (const [prop, value] of Object.entries(declarations)) {
    if (!(prop in existingDeclarations)) {
      element.style.setProperty(prop, value);
    }
  }
}

/**
 * Extract CSS rules from `<style>` elements and inline them onto matching elements.
 *
 * Uses the browser's CSSStyleSheet API to properly parse CSS rules,
 * handling complex selectors, specificity, etc.
 */
function inlineStylesFromStyleBlocks(doc: Document): void {
  const styleElements = doc.querySelectorAll('style');
  if (styleElements.length === 0) return;

  // Collect all CSS rules from all <style> blocks
  const rulesWithSelectors: Array<{
    selector: string;
    declarations: Record<string, string>;
  }> = [];

  for (const styleEl of styleElements) {
    const cssText = styleEl.textContent || '';
    if (!cssText.trim()) continue;

    // Use a temporary style sheet to parse CSS properly
    // This handles complex selectors, media queries, etc.
    try {
      const tempStyle = doc.createElement('style');
      tempStyle.textContent = cssText;
      doc.head.appendChild(tempStyle);

      const sheet = tempStyle.sheet;
      if (sheet) {
        for (let i = 0; i < sheet.cssRules.length; i++) {
          const rule = sheet.cssRules[i];
          if (rule instanceof CSSStyleRule) {
            const declarations: Record<string, string> = {};
            const style = rule.style;
            for (let j = 0; j < style.length; j++) {
              const prop = style[j];
              declarations[prop] = style.getPropertyValue(prop);
            }
            if (Object.keys(declarations).length > 0) {
              rulesWithSelectors.push({
                selector: rule.selectorText,
                declarations,
              });
            }
          }
        }
      }

      doc.head.removeChild(tempStyle);
    } catch {
      // If CSSStyleSheet parsing fails, fall back to regex-based parsing
      const ruleRegex = /([^{]+)\{([^}]+)\}/g;
      let match;
      while ((match = ruleRegex.exec(cssText)) !== null) {
        const selector = match[1].trim();
        const declarations = parseStyleDeclarations(match[2]);
        if (Object.keys(declarations).length > 0) {
          rulesWithSelectors.push({ selector, declarations });
        }
      }
    }
  }

  if (rulesWithSelectors.length === 0) return;

  // Apply each rule to matching elements in the document
  for (const { selector, declarations } of rulesWithSelectors) {
    try {
      const matchingElements = doc.body.querySelectorAll(selector);
      for (const el of matchingElements) {
        mergeStylesOntoElement(el as HTMLElement, declarations);
      }
    } catch {
      // Invalid selector — skip silently
    }
  }
}

/**
 * Google Docs wraps ALL clipboard content in a structural <b> tag:
 *   <b id="docs-internal-guid-XXXXX" style="font-weight:normal;">...content...</b>
 *
 * This is NOT a bold formatting tag — it is a container for Google Docs' internal
 * tracking GUID. The actual bold status is on <span> elements via font-weight CSS.
 *
 * This function detects such wrappers and replaces them with their child nodes,
 * preventing ProseMirror's BoldExtension parseDOM from applying bold to all content.
 */
function unwrapGoogleDocsStructuralB(doc: Document): void {
  const structuralBs = doc.body.querySelectorAll('b[id^="docs-internal-guid-"]');
  for (const b of structuralBs) {
    const parent = b.parentNode;
    if (!parent) continue;
    while (b.firstChild) {
      parent.insertBefore(b.firstChild, b);
    }
    parent.removeChild(b);
  }
}

// ============================================================================
// TABLE-CELL BACKGROUNDS — keep cell fills out of text highlight marks
// ============================================================================

/** Parse CSS hex / rgb() / rgba() to RRGGBB (uppercase, no '#'). */
function parseCssColorToHex(cssColor: string): string | undefined {
  if (!cssColor) return undefined;
  const trimmed = cssColor.trim();
  const lower = trimmed.toLowerCase();
  if (!lower || lower === 'transparent' || lower === 'inherit' || lower === 'initial')
    return undefined;
  const hexMatch = trimmed.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return hex
        .split('')
        .map((c) => c + c)
        .join('')
        .toUpperCase();
    }
    return hex.toUpperCase();
  }
  const rgbMatch = trimmed.match(
    /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (rgbMatch) {
    const alpha = rgbMatch[4] === undefined ? 1 : parseFloat(rgbMatch[4]);
    if (isNaN(alpha) || alpha <= 0) return undefined;
    const clamp = (v: string) => Math.max(0, Math.min(255, parseInt(v, 10)));
    const toHex = (v: string) => clamp(v).toString(16).padStart(2, '0').toUpperCase();
    return `${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  return undefined;
}

/**
 * Move td/th `background-color` to `data-bgcolor` and strip the style.
 * The cell spec already reads `dataset.bgcolor` first, so the fill survives —
 * but ProseMirror's HighlightExtension would otherwise also match the same
 * inline style on the cell and mark all cell text as highlighted.
 */
function moveCellBackgroundsToDataAttrs(doc: Document): void {
  for (const cell of Array.from(doc.body.querySelectorAll('td, th'))) {
    const el = cell as HTMLElement;
    const bg = el.style.backgroundColor;
    if (bg) {
      const hex = parseCssColorToHex(bg);
      if (hex && !el.hasAttribute('data-bgcolor')) {
        el.setAttribute('data-bgcolor', hex);
      }
      el.style.removeProperty('background-color');
      if (!el.getAttribute('style')) el.removeAttribute('style');
    }
  }
}

// ============================================================================
// LISTS — flatten ul/ol/li into paragraphs (lists are paragraph attrs)
// ============================================================================

type PasteListKind =
  | 'bullet'
  | 'decimal'
  | 'lowerRoman'
  | 'upperRoman'
  | 'lowerLetter'
  | 'upperLetter';

/**
 * Determine the list kind for an <li>: explicit list-style-type wins
 * (disc/circle/square → bullet, decimal/roman/alpha variants → numbered),
 * otherwise the parent list tag decides (ul → bullet, ol → decimal).
 * Returns null for `list-style-type: none` (paste as plain paragraphs).
 */
function pasteListKindFor(li: HTMLLIElement, parentList: HTMLElement | null): PasteListKind | null {
  const typeAttr = li.getAttribute('type') || parentList?.getAttribute('type') || undefined;
  if (typeAttr) {
    // <ol type="a|A|i|I|1"> — case-sensitive.
    if (typeAttr === 'a') return 'lowerLetter';
    if (typeAttr === 'A') return 'upperLetter';
    if (typeAttr === 'i') return 'lowerRoman';
    if (typeAttr === 'I') return 'upperRoman';
    if (typeAttr === '1') return 'decimal';
  }

  const raw = (li.style.listStyleType || parentList?.style.listStyleType || '')
    .trim()
    .toLowerCase();
  if (raw === 'none') return null;
  if (raw) {
    if (['disc', 'circle', 'square', 'disclosure-open', 'disclosure-closed'].includes(raw))
      return 'bullet';
    if (raw.startsWith('decimal')) return 'decimal';
    if (raw.includes('lower-roman')) return 'lowerRoman';
    if (raw.includes('upper-roman')) return 'upperRoman';
    if (raw.includes('lower-alpha') || raw.includes('lower-latin') || raw.includes('lower-greek'))
      return 'lowerLetter';
    if (raw.includes('upper-alpha') || raw.includes('upper-latin')) return 'upperLetter';
  }

  if (parentList) return parentList.tagName === 'OL' ? 'decimal' : 'bullet';
  return 'bullet';
}

/**
 * Nesting level for an <li>: Google Docs sets aria-level (1-based);
 * otherwise count ancestor ul/ol (direct item of the outermost list = 0).
 * Clamped to 0–8 (schema ilvl range).
 */
function pasteListLevelFor(li: HTMLLIElement, doc: Document): number {
  const aria = li.getAttribute('aria-level');
  if (aria) {
    const n = parseInt(aria, 10);
    if (!isNaN(n)) return Math.max(0, Math.min(8, n - 1));
  }
  let depth = 0;
  let el: HTMLElement | null = li.parentElement;
  while (el && el !== doc.body) {
    if (el.tagName === 'UL' || el.tagName === 'OL') depth++;
    el = el.parentElement;
  }
  return Math.max(0, Math.min(8, depth - 1));
}

/**
 * Replace one leaf <li> (no <li> descendants) with <p data-paste-list …>
 * paragraphs. Google Docs nests a single <p role="presentation"> per item —
 * that element is reused (keeps its spacing styles); loose inline content is
 * gathered into a new <p>. Already-flattened sublist children are spliced
 * through untouched (they carry their deeper level).
 */
function convertListItem(li: HTMLLIElement, doc: Document): void {
  const rawParent = li.parentElement;
  const parentList = (
    rawParent && (rawParent.tagName === 'UL' || rawParent.tagName === 'OL')
      ? rawParent
      : li.closest('ul, ol')
  ) as HTMLElement | null;
  const kind = pasteListKindFor(li, parentList);

  if (!kind) {
    // list-style-type: none — plain paragraphs, no list attrs.
    const children = Array.from(li.childNodes);
    if (children.length === 0) {
      li.replaceWith(doc.createElement('p'));
    } else {
      li.replaceWith(...children);
    }
    return;
  }

  const level = pasteListLevelFor(li, doc);
  const newNodes: Node[] = [];
  let bucket: HTMLElement | null = null;
  const newBucket = (): HTMLElement => {
    const p = doc.createElement('p');
    p.setAttribute('data-paste-list', kind);
    p.setAttribute('data-paste-level', String(level));
    return p;
  };
  const flush = (): void => {
    if (bucket) {
      if (bucket.childNodes.length > 0) newNodes.push(bucket);
      bucket = null;
    }
  };

  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === 1) {
      const el = child as HTMLElement;
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        // Nested sublist already flattened (leaf-first) — splice its <p>s.
        flush();
        for (const grand of Array.from(el.childNodes)) newNodes.push(grand);
        el.remove();
        continue;
      }
      if (/^(P|H1|H2|H3|H4|H5|H6)$/.test(el.tagName)) {
        flush();
        el.setAttribute('data-paste-list', kind);
        el.setAttribute('data-paste-level', String(level));
        el.removeAttribute('role');
        el.removeAttribute('aria-level');
        newNodes.push(el);
        continue;
      }
    }
    if (!bucket) bucket = newBucket();
    bucket.appendChild(child);
  }
  flush();

  if (newNodes.length === 0) newNodes.push(newBucket());
  li.replaceWith(...newNodes);
}

/**
 * Flatten every pasted list. Leaf items first so nested sublists resolve to
 * <p>s (with deeper levels) before their parent item splices them through;
 * remaining <ul>/<ol> wrappers are then unwrapped.
 */
function flattenPastedLists(doc: Document): void {
  // Guarded loop: each pass removes at least one <li>, so this terminates on
  // well-formed input; the cap bounds hostile deeply-nested markup
  // (leftover <li>s degrade to plain paragraphs via the unwrap below).
  for (let guard = 0; guard < 1000; guard++) {
    const leafLi = Array.from(doc.body.querySelectorAll('li')).filter(
      (li) => !li.querySelector('li')
    );
    if (leafLi.length === 0) break;
    for (const li of leafLi) convertListItem(li as HTMLLIElement, doc);
  }
  for (const list of Array.from(doc.body.querySelectorAll('ul, ol'))) {
    const parent = list.parentNode;
    if (!parent) continue;
    while (list.firstChild) parent.insertBefore(list.firstChild, list);
    parent.removeChild(list);
  }
}

// ============================================================================
// HEADINGS — Google Docs sends headings as <p> with large bold text
// ============================================================================

/** Inline font-size to points (pt stays, px converts at 96dpi). */
function cssFontSizeToPt(el: HTMLElement): number | null {
  const raw = el.style.fontSize;
  if (!raw) return null;
  const match = raw.trim().match(/^([\d.]+)\s*(pt|px)$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (isNaN(value)) return null;
  return match[2].toLowerCase() === 'px' ? value * 0.75 : value;
}

function isBoldElement(el: HTMLElement): boolean {
  const fw = (el.style.fontWeight || '').trim().toLowerCase();
  if (fw === 'bold' || fw === 'bolder') return true;
  const num = parseInt(fw, 10);
  if (!isNaN(num) && num >= 600) return true;
  if (el.tagName === 'B' || el.tagName === 'STRONG') return true;
  return false;
}

/**
 * Map a uniform font size (+ bold) to a heading level. Body text in Google
 * Docs is 11pt, so 11pt bold stays a normal paragraph; clearly larger bold
 * text becomes H1–H4, and the small exact sizes map to H5/H6. Very large
 * text (≥20pt, e.g. the 26pt Title style) converts regardless of weight.
 */
function headingLevelForSize(pt: number, bold: boolean): 1 | 2 | 3 | 4 | 5 | 6 | null {
  if (pt >= 20) return 1;
  if (!bold) return null;
  if (pt >= 15.5) return 2;
  if (pt >= 13) return 3;
  if (pt >= 11.8) return 4;
  if (pt >= 9.5 && pt <= 10.5) return 5;
  if (pt >= 7.5 && pt <= 8.5) return 6;
  return null;
}

/**
 * Convert heading-like <p> elements to <h1>–<h6> before PM parsing so the
 * paragraph spec assigns Heading styleIds + outline levels. Skips list items
 * (flattened above) and table cells — headings don't live there — and mixed
 * paragraphs where text carriers disagree on size.
 */
function convertHeadingLikeParagraphs(doc: Document): void {
  for (const p of Array.from(doc.body.querySelectorAll('p'))) {
    const el = p as HTMLElement;
    if (el.hasAttribute('data-paste-list')) continue;
    if (el.closest('td, th, li, ul, ol')) continue;

    const sizes: number[] = [];
    let bold = true;
    let hasText = false;
    let unknown = false;

    const carriers: HTMLElement[] = [el];
    for (const span of Array.from(el.querySelectorAll('span'))) carriers.push(span as HTMLElement);

    for (const carrier of carriers) {
      // Only carriers holding direct text matter (skip wrappers around spans).
      const directText = Array.from(carrier.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0
      );
      if (!directText) continue;
      hasText = true;
      const size = cssFontSizeToPt(carrier);
      if (size == null) {
        // Unstyled carrier inherits body size — only conclusive when it is the
        // paragraph itself with no sized spans; otherwise the paragraph mixes
        // explicit and inherited sizes and is not a clean heading.
        if (carrier !== el) {
          unknown = true;
          break;
        }
        continue;
      }
      sizes.push(size);
      const carrierBold = isBoldElement(carrier) || !!carrier.closest('b, strong');
      if (!carrierBold) bold = false;
    }

    if (!hasText || unknown || sizes.length === 0) continue;
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    if (max - min > 1) continue;

    const level = headingLevelForSize(max, bold);
    if (!level) continue;

    const h = doc.createElement(`h${level}`);
    for (const attr of Array.from(el.attributes)) h.setAttribute(attr.name, attr.value);
    while (el.firstChild) h.appendChild(el.firstChild);
    el.replaceWith(h);
  }
}

// ============================================================================
// WHITELIST — DOMPurify tag/attribute allowlist for pasted HTML
// ============================================================================

const PASTE_ALLOWED_TAGS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'sup',
  'sub',
  'a',
  'br',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'mark',
  'code',
  'pre',
  'blockquote',
  'hr',
  'div',
];

const PASTE_ALLOWED_ATTR = [
  'style',
  'href',
  'title',
  'colspan',
  'rowspan',
  'dir',
  'align',
  'start',
  'type',
];

// Whether the DOMPurify allowlist pass is effective in this environment.
// happy-dom (unit tests) breaks DOMPurify — it strips block tags like <p>
// while keeping <script> — so probe once: real browsers pass and get the
// whitelist, broken environments fall back to the inert-parsed HTML (scripts
// still can't run: the doc is detached, PM only extracts known attrs, and
// hrefs go through sanitizeHref). E2E (real Chromium) covers the sanitized path.
let sanitizeWorks: boolean | undefined;

function sanitizePastedHtml(dirty: string): string {
  try {
    const purify = getDomPurify();
    if (sanitizeWorks === undefined) {
      const probe = purify.sanitize('<p>x</p>', {
        ALLOWED_TAGS: PASTE_ALLOWED_TAGS,
        ALLOWED_ATTR: PASTE_ALLOWED_ATTR,
        ALLOW_DATA_ATTR: true,
        ALLOW_ARIA_ATTR: false,
      }) as unknown as string;
      sanitizeWorks = typeof probe === 'string' && probe.includes('<p>');
    }
    if (!sanitizeWorks) return dirty;
    return purify.sanitize(dirty, {
      ALLOWED_TAGS: PASTE_ALLOWED_TAGS,
      ALLOWED_ATTR: PASTE_ALLOWED_ATTR,
      ALLOW_DATA_ATTR: true,
      ALLOW_ARIA_ATTR: false,
    }) as unknown as string;
  } catch {
    return dirty;
  }
}

/**
 * Transform pasted HTML by inlining class-based CSS, unwrapping Google Docs
 * wrappers, flattening lists, detecting headings, and allowlist-sanitizing.
 * Exported for unit tests; the PM plugin below is the production entry point.
 */
export function transformPastedHTML(html: string): string {
  const lower = html.toLowerCase();
  const needsWork =
    lower.includes('<style') ||
    lower.includes('docs-internal-guid-') ||
    lower.includes('<ul') ||
    lower.includes('<ol') ||
    lower.includes('<li') ||
    lower.includes('<td') ||
    lower.includes('<th') ||
    lower.includes('<table') ||
    lower.includes('<p') ||
    lower.includes('<h');
  if (!needsWork) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    inlineStylesFromStyleBlocks(doc);
    for (const el of Array.from(doc.querySelectorAll('style'))) el.remove();

    unwrapGoogleDocsStructuralB(doc);
    moveCellBackgroundsToDataAttrs(doc);
    flattenPastedLists(doc);
    convertHeadingLikeParagraphs(doc);

    const dirty = doc.body.innerHTML;
    return sanitizePastedHtml(dirty);
  } catch {
    return html;
  }
}

export const PasteStyleInlinerExtension = createExtension({
  name: 'pasteStyleInliner',
  // Run before other paste handlers so styles are inlined before parseDOM
  priority: Priority.High,
  onSchemaReady(): ExtensionRuntime {
    const plugin = new Plugin({
      props: {
        transformPastedHTML(html: string): string {
          return transformPastedHTML(html);
        },
      },
    });

    return { plugins: [plugin] };
  },
});
