/**
 * Google Docs paste fidelity (T15): transform + parseDOM integration.
 *
 * Covers the paste trust boundary for Google Docs clipboard HTML:
 * - rgb() text colors survive as textColor marks (GDocs sends rgb(), not hex)
 * - highlight colors normalize to hex; td fills stay on the cell (no leak)
 * - vertical-align super/sub become sup/sub marks
 * - ul/ol/li flatten to paragraphs with numPr (incl. aria-level nesting)
 * - heading-like <p> (large bold) converts to h1–h6 styleIds
 * - structural <b id="docs-internal-guid-…"> unwraps without bolding everything
 * - scripts / event handlers / javascript: hrefs are dropped (allowlist)
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { DOMParser as PMDOMParser, type Node as ProseMirrorNode } from 'prosemirror-model';
import { schema } from '../../schema/index';
import { transformPastedHTML } from './PasteStyleInlinerExtension';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function parseTransformed(html: string) {
  const transformed = transformPastedHTML(html);
  const doc = new DOMParser().parseFromString(transformed, 'text/html');
  return { transformed, slice: PMDOMParser.fromSchema(schema).parseSlice(doc.body) };
}

function firstBlockTextMarks(slice: ReturnType<typeof parseTransformed>['slice']) {
  let out = '';
  const marks: string[] = [];
  slice.content.forEach((node) => {
    out += node.textContent;
    node.descendants((n) => {
      if (n.isText)
        for (const m of n.marks) marks.push(`${m.type.name}:${JSON.stringify(m.attrs)}`);
    });
  });
  return { out, marks };
}

describe('paste-google-docs', () => {
  test('rgb() text color becomes a textColor mark', () => {
    const { slice } = parseTransformed(`<p><span style="color: rgb(255, 0, 0)">red</span></p>`);
    const { out, marks } = firstBlockTextMarks(slice);
    expect(out).toContain('red');
    expect(marks.some((m) => m.startsWith('textColor:') && m.includes('FF0000'))).toBe(true);
  });

  test('rgba() with zero alpha is dropped', () => {
    const { slice } = parseTransformed(
      `<p><span style="color: rgba(255, 0, 0, 0)">ghost</span></p>`
    );
    const { marks } = firstBlockTextMarks(slice);
    expect(marks.some((m) => m.startsWith('textColor:'))).toBe(false);
  });

  test('rgb() highlight normalizes to hex', () => {
    const { slice } = parseTransformed(
      `<p><span style="background-color: rgb(255, 255, 0)">h</span></p>`
    );
    const { marks } = firstBlockTextMarks(slice);
    expect(marks.some((m) => m.includes('"FFFF00"'))).toBe(true);
  });

  test('td fill stays on the cell and does not highlight cell text', () => {
    const { slice } = parseTransformed(
      `<table><tr><td style="background-color: rgb(255, 255, 0); padding: 5pt;"><p><span>C</span></p></td></tr></table>`
    );
    let cell: any = null;
    const cellTextMarks: string[] = [];
    slice.content.forEach((node) => {
      node.descendants((n) => {
        if (n.type.name === 'tableCell') cell = n;
        if (n.isText) for (const m of n.marks) cellTextMarks.push(m.type.name);
      });
    });
    expect(cell).toBeTruthy();
    expect(cell.attrs.backgroundColor).toBe('FFFF00');
    expect(cellTextMarks).not.toContain('highlight');
  });

  test('vertical-align super/sub become sup/sub marks', () => {
    const sup = parseTransformed(`<p><span style="vertical-align: super;">x</span></p>`);
    expect(firstBlockTextMarks(sup.slice).marks.some((m) => m.startsWith('superscript'))).toBe(
      true
    );
    const sub = parseTransformed(`<p><span style="vertical-align: sub;">x</span></p>`);
    expect(firstBlockTextMarks(sub.slice).marks.some((m) => m.startsWith('subscript'))).toBe(true);
  });

  test('ul/li flattens to bullet paragraphs with levels', () => {
    const { slice } = parseTransformed(
      `<ul><li aria-level="1"><p role="presentation"><span>one</span></p></li>` +
        `<li aria-level="2"><p role="presentation"><span>nested</span></p></li></ul>`
    );
    const paras: ProseMirrorNode[] = [];
    slice.content.forEach((n) => paras.push(n));
    expect(paras.length).toBe(2);
    expect(paras[0].type.name).toBe('paragraph');
    expect(paras[0].attrs.numPr).toEqual({ numId: 1, ilvl: 0 });
    expect(paras[0].attrs.listIsBullet).toBe(true);
    expect(paras[1].attrs.numPr).toEqual({ numId: 1, ilvl: 1 });
    expect(paras[0].textContent).toContain('one');
    expect(paras[1].textContent).toContain('nested');
  });

  test('ol/li flattens to numbered paragraphs', () => {
    const { slice } = parseTransformed(`<ol><li>first</li><li>second</li></ol>`);
    const paras: ProseMirrorNode[] = [];
    slice.content.forEach((n) => paras.push(n));
    expect(paras.length).toBe(2);
    expect(paras[0].attrs.numPr).toEqual({ numId: 2, ilvl: 0 });
    expect(paras[0].attrs.listNumFmt).toBe('decimal');
  });

  test('heading-like p converts to Heading styleId', () => {
    const { slice } = parseTransformed(
      `<p style="text-align: center;"><span style="font-size: 26pt; font-weight: 700;">Title</span></p>`
    );
    const styleIds: unknown[] = [];
    slice.content.forEach((n) => {
      styleIds.push(n.attrs.styleId);
    });
    expect(styleIds).toEqual(['Heading1']);
  });

  test('11pt bold body text does not become a heading', () => {
    const { slice } = parseTransformed(
      `<p><span style="font-size: 11pt; font-weight: 700;">Bold body</span></p>`
    );
    slice.content.forEach((n) => {
      expect(n.attrs.styleId ?? null).toBeNull();
    });
  });

  test('structural docs-internal-guid wrapper does not bold everything', () => {
    const { slice } = parseTransformed(
      `<b id="docs-internal-guid-abc" style="font-weight:normal;"><p><span>plain</span></p></b>`
    );
    const { marks } = firstBlockTextMarks(slice);
    expect(marks.some((m) => m.startsWith('bold'))).toBe(false);
  });

  test('class-based CSS from <style> blocks is inlined', () => {
    const { slice } = parseTransformed(
      `<style>.c1 { text-align: center; }</style><p class="c1">hi</p>`
    );
    slice.content.forEach((n) => {
      expect(n.attrs.alignment).toBe('center');
    });
  });

  test('scripts do not become document text; javascript: hrefs get no link mark', () => {
    // The DOMPurify allowlist drops these in browsers; in happy-dom the
    // sanitizer self-test fails and parsing must still be safe (PM only
    // extracts known attrs; HyperlinkExtension runs sanitizeHref).
    const { slice } = parseTransformed(
      `<p><a href="javascript:alert(1)">x</a></p><script>alert(1)</script>`
    );
    let text = '';
    const marks: string[] = [];
    slice.content.forEach((node) => {
      text += node.textContent;
      node.descendants((n) => {
        if (n.isText) for (const m of n.marks) marks.push(m.type.name);
      });
    });
    expect(text).not.toContain('alert(1)');
    expect(marks).not.toContain('hyperlink');
    expect(text).toContain('x');
  });

  test('sanitizer keeps paste data attributes', () => {
    const { transformed } = parseTransformed(`<ul><li>item</li></ul>`);
    expect(transformed).toContain('data-paste-list="bullet"');
  });

  test('empty li becomes an empty list paragraph', () => {
    const { slice } = parseTransformed(`<ul><li></li></ul>`);
    const paras: ProseMirrorNode[] = [];
    slice.content.forEach((n) => paras.push(n));
    expect(paras.length).toBe(1);
    expect(paras[0].type.name).toBe('paragraph');
    expect(paras[0].attrs.numPr).toEqual({ numId: 1, ilvl: 0 });
  });

  test('three-deep nesting maps to levels 0-2', () => {
    const { slice } = parseTransformed(
      `<ul><li aria-level="1"><p role="presentation"><span>a</span></p>` +
        `<ul><li aria-level="2"><p role="presentation"><span>b</span></p>` +
        `<ul><li aria-level="3"><p role="presentation"><span>c</span></p></li></ul>` +
        `</li></ul></li></ul>`
    );
    const paras: ProseMirrorNode[] = [];
    slice.content.forEach((n) => paras.push(n));
    expect(paras.map((p) => p.textContent)).toEqual(['a', 'b', 'c']);
    expect(paras.map((p) => p.attrs.numPr?.ilvl)).toEqual([0, 1, 2]);
  });

  test('list-style-type none pastes as plain paragraphs', () => {
    const { slice } = parseTransformed(`<ul><li style="list-style-type: none;">plain</li></ul>`);
    slice.content.forEach((n) => {
      expect(n.attrs.numPr ?? null).toBeNull();
    });
    expect(slice.content.firstChild?.textContent).toContain('plain');
  });

  test('ol type=a maps to lowerLetter numbering', () => {
    const { slice } = parseTransformed(`<ol type="a"><li>first</li></ol>`);
    const paras: ProseMirrorNode[] = [];
    slice.content.forEach((n) => paras.push(n));
    expect(paras[0].attrs.numPr).toEqual({ numId: 2, ilvl: 0 });
    expect(paras[0].attrs.listNumFmt).toBe('lowerLetter');
  });

  test('10pt bold pastes as Heading5', () => {
    const { slice } = parseTransformed(
      `<p><span style="font-size: 10pt; font-weight: 700;">Small head</span></p>`
    );
    const styleIds: unknown[] = [];
    slice.content.forEach((n) => {
      styleIds.push(n.attrs.styleId);
    });
    expect(styleIds).toEqual(['Heading5']);
  });

  test('mixed font sizes do not become a heading', () => {
    const { slice } = parseTransformed(
      `<p><span style="font-size: 26pt; font-weight: 700;">Big</span>` +
        `<span style="font-size: 11pt;"> small</span></p>`
    );
    slice.content.forEach((n) => {
      expect(n.attrs.styleId ?? null).toBeNull();
    });
  });

  test('malformed HTML falls back to the original input', () => {
    const broken = `<p><b>unclosed`;
    expect(transformPastedHTML(broken)).toContain('unclosed');
  });

  test('Google Docs line-height presets snap to Word spacing', () => {
    const cases: Array<[string, number]> = [
      ['1.2', 240],
      ['1.8', 360],
      ['2.4', 480],
    ];
    for (const [lineHeight, expected] of cases) {
      const { slice } = parseTransformed(`<p style="line-height:${lineHeight};">t</p>`);
      const paras: ProseMirrorNode[] = [];
      slice.content.forEach((n) => paras.push(n));
      expect(paras[0].attrs.lineSpacing).toBe(expected);
      expect(paras[0].attrs.lineSpacingRule).toBe('auto');
    }
  });

  test('other line-height values scale proportionally', () => {
    const { slice: sliceMultiplier } = parseTransformed(`<p style="line-height:1.38;">t</p>`);
    const parasM: ProseMirrorNode[] = [];
    sliceMultiplier.content.forEach((n) => parasM.push(n));
    expect(parasM[0].attrs.lineSpacing).toBe(Math.round(240 * 1.38));
    expect(parasM[0].attrs.lineSpacingRule).toBe('auto');

    const { slice: slicePct } = parseTransformed(`<p style="line-height:130%;">t</p>`);
    const parasP: ProseMirrorNode[] = [];
    slicePct.content.forEach((n) => parasP.push(n));
    expect(parasP[0].attrs.lineSpacing).toBe(Math.round(240 * 1.3));

    const { slice: sliceAbs } = parseTransformed(`<p style="line-height:18pt;">t</p>`);
    const parasA: ProseMirrorNode[] = [];
    sliceAbs.content.forEach((n) => parasA.push(n));
    expect(parasA[0].attrs.lineSpacing).toBe(360);
    expect(parasA[0].attrs.lineSpacingRule).toBe('exact');
  });

  test('margin-top/margin-bottom become spaceBefore/spaceAfter', () => {
    const { slice } = parseTransformed(`<p style="margin-top:12pt;margin-bottom:8pt;">spaced</p>`);
    const paras: ProseMirrorNode[] = [];
    slice.content.forEach((n) => paras.push(n));
    expect(paras[0].attrs.spaceBefore).toBe(240);
    expect(paras[0].attrs.spaceAfter).toBe(160);
  });

  test('margin-left converts pt to indentLeft twips', () => {
    const { slice } = parseTransformed(`<p style="margin-left:36pt;">indented</p>`);
    const paras: ProseMirrorNode[] = [];
    slice.content.forEach((n) => paras.push(n));
    expect(paras[0].attrs.indentLeft).toBe(720);
  });

  test('nested indentation levels scale with margin-left', () => {
    const { slice } = parseTransformed(
      `<p style="margin-left:36pt;">level one</p><p style="margin-left:72pt;">level two</p>`
    );
    const paras: ProseMirrorNode[] = [];
    slice.content.forEach((n) => paras.push(n));
    expect(paras.map((p) => p.attrs.indentLeft)).toEqual([720, 1440]);
  });

  test('td vertical-align maps to cell verticalAlign', () => {
    for (const [css, expected] of [
      ['top', 'top'],
      ['middle', 'center'],
      ['bottom', 'bottom'],
    ] as const) {
      const { slice } = parseTransformed(
        `<table><tr><td style="vertical-align:${css};"><p><span>c</span></p></td></tr></table>`
      );
      let cell: any = null;
      slice.content.forEach((node) => {
        node.descendants((n) => {
          if (n.type.name === 'tableCell') cell = n;
        });
      });
      expect(cell?.attrs.verticalAlign).toBe(expected);
    }
  });

  test('td padding becomes cell margins in twips', () => {
    const { slice } = parseTransformed(
      `<table><tr><td style="padding:5pt;"><p><span>c</span></p></td></tr></table>`
    );
    let cell: any = null;
    slice.content.forEach((node) => {
      node.descendants((n) => {
        if (n.type.name === 'tableCell') cell = n;
      });
    });
    expect(cell?.attrs.margins).toMatchObject({ top: 100, right: 100, bottom: 100, left: 100 });
  });

  test('td borders parse width, style, and color', () => {
    const { slice } = parseTransformed(
      `<table><tr><td style="border:1pt solid rgb(0, 0, 0);"><p><span>c</span></p></td></tr></table>`
    );
    let cell: any = null;
    slice.content.forEach((node) => {
      node.descendants((n) => {
        if (n.type.name === 'tableCell') cell = n;
      });
    });
    expect(cell?.attrs.borders?.top).toMatchObject({
      style: 'single',
      size: 8,
      color: { rgb: '000000' },
    });
    expect(cell?.attrs.borders?.bottom).toMatchObject({ style: 'single', size: 8 });
  });

  test('colored and bordered table cells keep fills on the cell', () => {
    const { slice } = parseTransformed(
      `<table><tr><td style="border:1pt solid rgb(0, 0, 0);padding:5pt;` +
        `vertical-align:bottom;background-color:rgb(255, 0, 0);"><p><span>c</span></p></td></tr></table>`
    );
    let cell: any = null;
    const cellTextMarks: string[] = [];
    slice.content.forEach((node) => {
      node.descendants((n) => {
        if (n.type.name === 'tableCell') cell = n;
        if (n.isText && n.text === 'c') for (const m of n.marks) cellTextMarks.push(m.type.name);
      });
    });
    expect(cell?.attrs.backgroundColor).toBe('FF0000');
    expect(cell?.attrs.verticalAlign).toBe('bottom');
    expect(cell?.attrs.margins).toMatchObject({ top: 100, left: 100 });
    expect(cell?.attrs.borders?.top?.style).toBe('single');
    expect(cellTextMarks).not.toContain('highlight');
  });

  test('unknown highlight names are dropped, known names kept', () => {
    const dropped = parseTransformed(`<p><span style="background-color: expression;">x</span></p>`);
    const kept = parseTransformed(`<p><span style="background-color: yellow;">y</span></p>`);
    const marksOf = (slice: ReturnType<typeof parseTransformed>['slice']) => {
      const out: string[] = [];
      slice.content.forEach((node) => {
        node.descendants((n) => {
          if (n.isText) for (const m of n.marks) out.push(`${m.type.name}:${m.attrs.color}`);
        });
      });
      return out;
    };
    expect(marksOf(dropped.slice).some((m) => m.startsWith('highlight:'))).toBe(false);
    expect(marksOf(kept.slice)).toContain('highlight:yellow');
  });
});
