import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { cleanWordHtml, htmlToRuns, runsToClipboardContent } from '../clipboard';
import type { Run } from '../../types/document';

// htmlToRuns binds DOMPurify to the live window lazily on first call, so a
// window registered before any test runs is sufficient.
beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

describe('cleanWordHtml comment stripping', () => {
  test('removes plain HTML comments', () => {
    expect(cleanWordHtml('a<!-- hidden -->b')).toBe('ab');
  });

  test('removes Word downlevel conditional comments', () => {
    const html = 'x<!--[if gte mso 9]><xml>junk</xml><![endif]-->y';
    expect(cleanWordHtml(html)).toBe('xy');
  });

  test('leaves no stray "<!--" when a comment is unterminated', () => {
    // Incomplete-multi-character-sanitization regression: a lone, unterminated
    // comment opener must not survive the cleanup.
    expect(cleanWordHtml('safe<!--dangling')).not.toContain('<!--');
  });

  test('stays linear on adversarial conditional-comment input (no ReDoS)', () => {
    // Polynomial-ReDoS regression: a long run of conditional-comment openers
    // used to backtrack quadratically. This must finish near-instantly.
    const evil = '<!--[if '.repeat(50_000);
    const start = performance.now();
    cleanWordHtml(evil);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('cleanWordHtml namespace-tag stripping', () => {
  test('removes paired o:/w: namespace blocks and their content', () => {
    expect(cleanWordHtml('a<o:p>junk</o:p>b')).toBe('ab');
    expect(cleanWordHtml('a<w:p>junk</w:p>b')).toBe('ab');
    // First-close-wins (same as the prior lazy regex): the inner close pairs
    // with the opener, leaving the trailing close tag behind.
    expect(cleanWordHtml('a<o:x>1</o:y>2</o:z>b')).toBe('a2</o:z>b');
  });

  test('strips namespace tags case-insensitively (matches the prior /gi regex)', () => {
    expect(cleanWordHtml('a<O:P>junk</O:P>b')).toBe('ab');
    expect(cleanWordHtml('a<W:sdt>junk</w:Sdt>b')).toBe('ab');
  });

  test('removes self-closing o:/w: tags', () => {
    expect(cleanWordHtml('a<o:p/>b')).toBe('ab');
  });

  test('keeps content when a namespace opener has no closing tag', () => {
    // Matches the prior lazy-regex behavior: an unmatched opener is left as-is.
    expect(cleanWordHtml('keep<o:p>this')).toContain('this');
  });

  test('stays linear on many unterminated namespace openers (no ReDoS)', () => {
    // `/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/` backtracked quadratically here.
    const evil = '<o:p>'.repeat(200_000);
    const start = performance.now();
    cleanWordHtml(evil);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('htmlToRuns sanitizes and does not execute markup', () => {
  const runText = (runs: ReturnType<typeof htmlToRuns>): string =>
    runs
      .flatMap((r) => r.content ?? [])
      .map((c) => ('text' in c ? c.text : ''))
      .join('');

  // NOTE on coverage: these tests verify text extraction and the security
  // boundary (no script/handler execution, no global mutation). They do NOT
  // assert that visual formatting (bold/color/font) survives, because under
  // happy-dom DOMPurify strips formatting tags/attributes. In a real browser
  // (and jsdom) DOMPurify's default allowlist keeps `<b>/<i>/<u>/<span>` and
  // the `style` attribute, so consumers calling htmlToRuns get formatting
  // intact; that path is the DOMPurify default, not asserted here.
  test('extracts text from pasted HTML', () => {
    const runs = htmlToRuns('<p>Hello <b>world</b></p>', 'Hello world');
    expect(runText(runs)).toContain('Hello');
    expect(runText(runs)).toContain('world');
  });

  test('does not execute or leak injected handlers/scripts', () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__pwned;
    for (const payload of [
      '<img src=x onerror="globalThis.__pwned=1">hi',
      '<svg onload="globalThis.__pwned=1"></svg>hi',
      '<a href="javascript:globalThis.__pwned=1">hi</a>',
    ]) {
      const runs = htmlToRuns(payload, 'hi');
      // No handler fires (DOMPurify strips them; parsing is inert anyway), and
      // benign text still comes through.
      expect(g.__pwned).toBeUndefined();
      expect(runText(runs)).toContain('hi');
    }
  });
});

describe('runsToClipboardContent neutralizes hostile formatting (issue #139)', () => {
  function textRun(text: string, formatting?: Run['formatting']): Run {
    return { type: 'run', content: [{ type: 'text', text }], formatting };
  }

  function parsedBody(html: string): HTMLElement {
    return new DOMParser().parseFromString(html, 'text/html').body;
  }

  function innerHtmlBody(html: string): HTMLElement {
    // Simulates writeToClipboardFallback: assigning to innerHTML must not
    // create elements or executable attributes either.
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
  }

  /**
   * Split a `style` attribute value into `;`-separated declarations while
   * honoring CSS backslash escapes and double-quoted strings. happy-dom's
   * CSS parser splits naively on `;` (it treats `\"` as a string end), so it
   * cannot validate escape semantics — this helper checks what a
   * spec-compliant CSS parser sees instead.
   */
  function styleDeclarations(styleAttr: string): string[] {
    const decls: string[] = [];
    let current = '';
    let inString = false;
    let escaped = false;
    for (const ch of styleAttr) {
      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        current += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        current += ch;
        continue;
      }
      if (ch === ';' && !inString) {
        if (current.trim()) decls.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) decls.push(current);
    return decls;
  }

  function declarationNames(styleAttr: string): string[] {
    return styleDeclarations(styleAttr).map((d) => d.split(':')[0].trim().toLowerCase());
  }

  test('quoted font name cannot break out of the style attribute', () => {
    // Both quote styles: the style attribute is `'`-quoted, so a leading `'`
    // is the direct breakout attempt and a leading `"` targets the CSS string.
    const payloads = [
      '"><img src=x onerror="globalThis.__pwned=1">',
      "'><img src=x onerror='globalThis.__pwned=1'>",
    ];
    for (const evil of payloads) {
      const { html } = runsToClipboardContent(
        [textRun('hi', { fontFamily: { ascii: evil } })],
        true
      );
      const body = parsedBody(html);
      expect(body.querySelector('img')).toBeNull();
      expect(body.textContent).toContain('hi');
      // Simulates writeToClipboardFallback: assigning to innerHTML must not
      // create elements or executable attributes either.
      const host = document.createElement('div');
      host.innerHTML = html;
      expect(host.querySelector('img')).toBeNull();
      expect(host.querySelector('[onerror]')).toBeNull();
      // No attribute breakout: the span carries only its style attribute.
      expect(host.querySelector('span')?.getAttributeNames()).toEqual(['style']);
    }
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  test('normal font name still renders', () => {
    const { html } = runsToClipboardContent(
      [textRun('hi', { fontFamily: { ascii: 'Times New Roman' } })],
      true
    );
    expect(html).toContain('font-family: "Times New Roman"');
  });

  test('crafted color value is dropped instead of breaking out', () => {
    const { html } = runsToClipboardContent(
      [textRun('hi', { color: { rgb: 'FF0000"><svg onload="x">' } })],
      true
    );
    expect(html).not.toContain('color:');
    expect(parsedBody(html).querySelector('svg')).toBeNull();
  });

  test('normal color still renders', () => {
    const { html } = runsToClipboardContent([textRun('hi', { color: { rgb: 'FF0000' } })], true);
    expect(html).toContain('color: #FF0000');
  });

  test('font name cannot break out of the CSS string', () => {
    // Without `"` backslash-escaping, the payload would terminate the
    // `font-family: "..."` value and inject a `color` declaration. Escaped,
    // it stays one inert string: a spec-compliant parse sees only the
    // `font-family` declaration.
    const { html } = runsToClipboardContent(
      [textRun('hi', { fontFamily: { ascii: '"; color: red; x="' } })],
      true
    );
    expect(html).toContain('\\"');
    for (const body of [parsedBody(html), innerHtmlBody(html)]) {
      expect(body.querySelector('span')?.getAttributeNames()).toEqual(['style']);
      expect(declarationNames(body.querySelector('span')?.getAttribute('style') ?? '')).toEqual([
        'font-family',
      ]);
      expect(body.textContent).toContain('hi');
    }
  });

  test('backslash-quote font name is escaped in a single pass', () => {
    // `a\"b` (backslash + quote): the single `/["\\]/g` pass yields exactly
    // `a\\\"b`; sequential `"`-then-`\` handling would double-escape it.
    const { html } = runsToClipboardContent(
      [textRun('hi', { fontFamily: { ascii: 'a\\"b' } })],
      true
    );
    expect(html).toContain('font-family: "a\\\\\\"b"');
    for (const body of [parsedBody(html), innerHtmlBody(html)]) {
      expect(body.querySelector('span')?.getAttributeNames()).toEqual(['style']);
      expect(body.textContent).toContain('hi');
    }
  });

  test('font name carrying url() cannot inject a background-image', () => {
    const evil = '"); background-image: url(http://evil.example/x.png); x="';
    const { html } = runsToClipboardContent([textRun('hi', { fontFamily: { ascii: evil } })], true);
    for (const body of [parsedBody(html), innerHtmlBody(html)]) {
      expect(body.querySelector('img')).toBeNull();
      expect(body.textContent).toContain('hi');
      // The `url(...)` stays inside the quoted font-family string: a
      // spec-compliant parse sees no `background-image` declaration, i.e.
      // nothing executes.
      expect(declarationNames(body.querySelector('span')?.getAttribute('style') ?? '')).toEqual([
        'font-family',
      ]);
    }
  });

  test('crafted shading fill is dropped instead of breaking out', () => {
    const { html } = runsToClipboardContent(
      [textRun('hi', { shading: { fill: { rgb: '00FF00"><img src=x onerror="y">' } } })],
      true
    );
    expect(html).not.toContain('background-color:');
    for (const body of [parsedBody(html), innerHtmlBody(html)]) {
      expect(body.querySelector('img')).toBeNull();
      expect(body.querySelector('[onerror]')).toBeNull();
      expect(body.textContent).toContain('hi');
    }
  });

  test('non-finite font size is dropped instead of emitting invalid CSS', () => {
    for (const fontSize of [Number.POSITIVE_INFINITY, Number.NaN]) {
      const { html } = runsToClipboardContent([textRun('hi', { fontSize })], true);
      expect(html).not.toContain('font-size:');
      expect(parsedBody(html).textContent).toContain('hi');
    }
  });
});
