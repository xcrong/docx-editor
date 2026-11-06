/**
 * Single source of truth for the demo `<head>` tags that must stay identical
 * across the React (`examples/vite/index.html`) and Vue (`examples/vue/index.html`)
 * demos. Both files carry a `<!-- DEMO_HEAD -->` placeholder; each example's
 * `vite.config.ts` replaces it at build time via `demoHeadTags()`.
 *
 * Canonical + `og:url` are intentionally NOT hardcoded: this fork has no
 * production deployment domain, so they are emitted only when `VITE_SITE_URL`
 * is set (and omitted otherwise) instead of pointing at the upstream site.
 */

export const DEMO_OG_TITLE = 'DOCX Editor — Open-source DOCX editor for the browser';

export const DEMO_OG_DESCRIPTION =
  'WYSIWYG DOCX editor in the browser. Tables, images, tracked changes, comments. No server required. Apache-2.0.';

/** Build the `<head>` tag block. `siteUrl` is e.g. `https://demo.example.com`. */
export function demoHeadTags(siteUrl?: string): string {
  const tags = [
    `<meta property="og:title" content="${DEMO_OG_TITLE}">`,
    `<meta property="og:description" content="${DEMO_OG_DESCRIPTION}">`,
  ];
  const base = (siteUrl ?? '').trim().replace(/\/+$/, '');
  if (base) {
    tags.unshift(`<link rel="canonical" href="${base}/">`);
    tags.push(`<meta property="og:url" content="${base}/">`);
  }
  return tags.join('\n  ');
}
