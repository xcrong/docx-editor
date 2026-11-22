/**
 * Injected `@font-face` tracking + document-generation grouping (#144).
 *
 * Every buffer/URL registration appends a `<style>` to `<head>`; buffer
 * registrations also retain a blob URL. Neither was reclaimed, so reopening
 * documents accumulated style nodes and blob memory. This module records
 * each injected element so document switches can prune the previous
 * generation *after* the new faces register (no flash, per #143 guidance)
 * and editor teardown can clear everything.
 *
 * Same bytes share a key (#143) and survive across generations via touch;
 * different bytes get different keys and only the stale generation is
 * removed + revoked. URL faces (`fonts` prop) are editor-scoped and spared
 * by document prunes; `resetDocumentFonts` clears both scopes on teardown.
 */

export type InjectedFaceScope = 'document' | 'editor';

interface InjectedFaceEntry {
  el: HTMLStyleElement;
  blobUrl: string | null;
  generation: number;
  scope: InjectedFaceScope;
}

const injectedFaces = new Map<string, InjectedFaceEntry>();
let fontGeneration = 0;

/** Current document generation; registrations capture it synchronously. */
export function currentFontGeneration(): number {
  return fontGeneration;
}

/** Start a new document's font scope; returns its generation. */
export function beginDocumentFontGeneration(): number {
  fontGeneration += 1;
  return fontGeneration;
}

/** Record an injected face under its `loadedFaces` key. */
export function trackInjectedFace(
  key: string,
  el: HTMLStyleElement,
  blobUrl: string | null,
  scope: InjectedFaceScope = 'document',
  generation: number = fontGeneration
): void {
  injectedFaces.set(key, { el, blobUrl, generation, scope });
}

/** Refresh a reused face (same-bytes hit, #143) into an active generation. */
export function touchInjectedFace(key: string, generation: number = fontGeneration): void {
  const entry = injectedFaces.get(key);
  if (entry) entry.generation = generation;
}

/** Drop tracking for a failed injection whose element/URL were already removed. */
export function untrackInjectedFace(key: string): void {
  injectedFaces.delete(key);
}

function removeEntry(key: string, entry: InjectedFaceEntry): void {
  try {
    entry.el.remove();
  } catch {
    // Test stubs may lack remove; the map cleanup below still bounds memory.
  }
  if (entry.blobUrl) {
    try {
      URL.revokeObjectURL(entry.blobUrl);
    } catch {
      // Headless or already revoked; key removal still prevents reuse.
    }
  }
  injectedFaces.delete(key);
}

/**
 * Remove document-scoped faces older than `activeGeneration`; returns their
 * keys so the caller can drop them from its face cache. Uses `<` (not `!==`)
 * so a stale load racing a newer one never deletes the newer generation.
 */
export function pruneOldDocumentFaces(activeGeneration: number = fontGeneration): string[] {
  const pruned: string[] = [];
  for (const [key, entry] of injectedFaces) {
    if (entry.scope !== 'document' || entry.generation >= activeGeneration) continue;
    removeEntry(key, entry);
    pruned.push(key);
  }
  return pruned;
}

/** Remove every tracked face (both scopes); returns keys for cache cleanup. */
export function resetAllInjectedFaces(): string[] {
  const keys = [...injectedFaces.keys()];
  for (const [key, entry] of injectedFaces) removeEntry(key, entry);
  return keys;
}

/** Test-only: drop tracking without touching the DOM (stub heads). */
export function __resetFontFaceRegistryForTests(): void {
  injectedFaces.clear();
  fontGeneration = 0;
  fallbackWidthCache.clear();
  probeContext = undefined;
}

// Buffer content hash (#143): same-named subsetted fonts from different
// documents register separately; identical bytes share a key.
export function hashFontBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const CSS_HEX_ESCAPES: Record<string, string> = {
  '<': '\\3c ',
  '>': '\\3e ',
  '\n': '\\a ',
  '\r': '\\d ',
  '\f': '\\c ',
};

/** Escape file-derived family names interpolated into `@font-face` CSS. */
export function cssStringEscape(s: string): string {
  return s.replace(/["\\]/g, '\\$&').replace(/[<>\n\r\f]/g, (c) => CSS_HEX_ESCAPES[c]);
}

/** Guess a font `format()` hint from a consumer-hosted URL. */
export function guessFontFormat(src: string): string {
  const url = src.split('?')[0].split('#')[0].toLowerCase();
  if (url.endsWith('.woff2')) return 'woff2';
  if (url.endsWith('.woff')) return 'woff';
  if (url.endsWith('.otf')) return 'opentype';
  return 'truetype';
}

// System-font probe scratchpad: one shared canvas; fallback widths memoized.
// Reset via __resetFontFaceRegistryForTests (tests swap the global document).
let probeContext: CanvasRenderingContext2D | null | undefined;
const fallbackWidthCache = new Map<string, number>();
const PROBE_TEXT = 'abcdefghijklmnopqrstuvwxyz0123456789';

function getProbeContext(): CanvasRenderingContext2D | null {
  if (probeContext === undefined) {
    probeContext = document.createElement('canvas').getContext('2d');
    if (probeContext) probeContext.textBaseline = 'top';
  }
  return probeContext;
}

/** Check a family via canvas measurement (shared probe canvas, memoized). */
export function canRenderFont(fontFamily: string, fallbackFont = 'sans-serif'): boolean {
  if (typeof document === 'undefined') return false;
  const ctx = getProbeContext();
  if (!ctx) return false;
  const measure = (font: string): number => {
    ctx.font = font;
    return ctx.measureText(PROBE_TEXT).width;
  };
  const differsFrom = (fallback: string): boolean => {
    let w = fallbackWidthCache.get(fallback);
    if (w === undefined) {
      w = measure(`72px ${fallback}`);
      fallbackWidthCache.set(fallback, w);
    }
    return measure(`72px "${fontFamily}", ${fallback}`) !== w;
  };
  return (
    differsFrom(fallbackFont) || differsFrom(fallbackFont === 'sans-serif' ? 'serif' : 'sans-serif')
  );
}
