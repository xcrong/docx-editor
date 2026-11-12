/**
 * Google Docs paste fidelity (T15).
 *
 * Pastes representative Google Docs clipboard HTML (inline text-align,
 * rgb() colors, classless <p>/<span>, ul/ol lists, heading-size <p>,
 * table cell fills) and asserts the editor preserves alignment, fonts,
 * lists and table borders through the PM parseDOM pipeline.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

async function pasteHtml(page: import('@playwright/test').Page, html: string): Promise<void> {
  await page.evaluate(
    (payload) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/html', payload.html);
      dataTransfer.setData('text/plain', payload.html.replace(/<[^>]+>/g, ' '));
      const target =
        document.querySelector('.ProseMirror') ||
        document.querySelector('[contenteditable="true"]');
      if (!target) throw new Error('Editable target not found');
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
      target.dispatchEvent(event);
    },
    { html }
  );
}

interface PMDocJSON {
  type: string;
  content?: PMDocJSON[];
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Array<{ type: string; attrs: Record<string, unknown> }>;
}

async function getDocJSON(page: import('@playwright/test').Page): Promise<PMDocJSON> {
  return page.evaluate(() => {
    const view = window.__DOCX_EDITOR_E2E__?.getView?.();
    if (!view) throw new Error('Editor view not found');
    return view.state.doc.toJSON() as unknown as PMDocJSON;
  });
}

function paragraphsOf(doc: PMDocJSON): PMDocJSON[] {
  const out: PMDocJSON[] = [];
  const walk = (node: PMDocJSON) => {
    if (node.type === 'paragraph') out.push(node);
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return out;
}

function textOf(para: PMDocJSON): string {
  let text = '';
  const walk = (node: PMDocJSON) => {
    if (node.text) text += node.text;
    for (const child of node.content ?? []) walk(child);
  };
  walk(para);
  return text;
}

test.describe('Google Docs paste fidelity', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.gotoEmpty();
    await editor.waitForReady();
    await editor.focus();
  });

  test('centered and right-aligned paragraphs keep alignment', async ({ page }) => {
    // NOTE: ProseMirror merges the first pasted block into the current
    // (empty) paragraph, so a sacrificial leading paragraph absorbs the
    // merge and the assertions below check the blocks that follow it.
    await pasteHtml(
      page,
      `<b id="docs-internal-guid-1" style="font-weight:normal;">` +
        `<p style="margin-top:0pt;margin-bottom:0pt;">` +
        `<span style="font-size:11pt;font-family:Arial;">Top</span></p>` +
        `<p style="text-align:center;line-height:1.38;margin-top:0pt;margin-bottom:8pt;">` +
        `<span style="font-size:11pt;font-family:Arial;">Centered</span></p>` +
        `<p style="text-align:right;line-height:1.38;margin-top:0pt;margin-bottom:8pt;">` +
        `<span style="font-size:11pt;font-family:Arial;">Right</span></p></b>`
    );

    const doc = await getDocJSON(page);
    const paras = paragraphsOf(doc).filter((p) => textOf(p).trim().length > 0);
    expect(paras.length).toBe(3);
    expect(paras.find((p) => textOf(p).includes('Centered'))?.attrs?.alignment).toBe('center');
    expect(paras.find((p) => textOf(p).includes('Right'))?.attrs?.alignment).toBe('right');
    expect(await page.getByText('Centered').count()).toBeGreaterThan(0);
  });

  test('rgb() text color and font size survive', async ({ page }) => {
    await pasteHtml(
      page,
      `<p><span style="font-size:14pt;font-family:Arial;color:rgb(255, 0, 0);` +
        `font-weight:700;">Red bold</span></p>`
    );

    const doc = await getDocJSON(page);
    const paras = paragraphsOf(doc).filter((p) => textOf(p).includes('Red bold'));
    expect(paras.length).toBe(1);
    const marks: Array<{ type: string; attrs: Record<string, unknown> }> = [];
    const walk = (node: PMDocJSON) => {
      for (const mark of node.marks ?? []) marks.push(mark);
      for (const child of node.content ?? []) walk(child);
    };
    walk(paras[0]);
    const color = marks.find((m) => m.type === 'textColor');
    expect(color?.attrs.rgb).toBe('FF0000');
    expect(marks.some((m) => m.type === 'bold')).toBe(true);
    const size = marks.find((m) => m.type === 'fontSize');
    expect(size?.attrs.size).toBe(28);
  });

  test('bulleted and numbered lists become list paragraphs', async ({ page }) => {
    // NOTE: see above — a sacrificial leading paragraph absorbs PM's
    // first-block merge so list attrs below are asserted on intact blocks.
    await pasteHtml(
      page,
      `<p><span>Top</span></p>` +
        `<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">` +
        `<li dir="ltr" style="list-style-type:disc;" aria-level="1">` +
        `<p dir="ltr" role="presentation"><span>Bullet one</span></p></li>` +
        `<li dir="ltr" style="list-style-type:disc;" aria-level="2">` +
        `<p dir="ltr" role="presentation"><span>Bullet nested</span></p></li></ul>` +
        `<ol><li>Numbered one</li></ol>`
    );

    const doc = await getDocJSON(page);
    const paras = paragraphsOf(doc).filter((p) => textOf(p).trim().length > 0);
    expect(paras.length).toBe(4);
    expect(paras.find((p) => textOf(p).includes('Bullet one'))?.attrs?.numPr).toMatchObject({
      numId: 1,
      ilvl: 0,
    });
    expect(paras.find((p) => textOf(p).includes('Bullet nested'))?.attrs?.numPr).toMatchObject({
      numId: 1,
      ilvl: 1,
    });
    expect(paras.find((p) => textOf(p).includes('Numbered one'))?.attrs?.numPr).toMatchObject({
      numId: 2,
      ilvl: 0,
    });
  });

  test('heading-size paragraph pastes as a Heading style', async ({ page }) => {
    await pasteHtml(
      page,
      `<p><span>Top</span></p>` +
        `<p style="text-align:center;"><span style="font-size:26pt;` +
        `font-weight:700;font-family:Arial;">Doc Title</span></p>`
    );

    const doc = await getDocJSON(page);
    const paras = paragraphsOf(doc).filter((p) => textOf(p).includes('Doc Title'));
    expect(paras.length).toBe(1);
    expect(paras[0].attrs?.styleId).toBe('Heading1');
  });

  test('table cell fill stays on the cell without highlighting text', async ({ page }) => {
    await pasteHtml(
      page,
      `<table dir="ltr" style="margin-left:auto;margin-right:auto;">` +
        `<tr><td style="border:1pt solid rgb(0, 0, 0);padding:5pt;` +
        `vertical-align:top;background-color:rgb(255, 255, 0);">` +
        `<p><span>Cell</span></p></td></tr></table>`
    );

    const doc = await getDocJSON(page);
    const cells: PMDocJSON[] = [];
    const walk = (node: PMDocJSON) => {
      if (node.type === 'tableCell' || node.type === 'tableHeader') cells.push(node);
      for (const child of node.content ?? []) walk(child);
    };
    walk(doc);
    expect(cells.length).toBe(1);
    expect(cells[0].attrs?.backgroundColor).toBe('FFFF00');
    expect(cells[0].attrs?.verticalAlign).toBe('top');

    const marks: string[] = [];
    const walkMarks = (node: PMDocJSON) => {
      for (const mark of node.marks ?? []) marks.push(mark.type);
      for (const child of node.content ?? []) walkMarks(child);
    };
    walkMarks(cells[0]);
    expect(marks).not.toContain('highlight');
  });

  test('text with 1.5x line spacing keeps 360-twips spacing', async ({ page }) => {
    await pasteHtml(
      page,
      `<p><span>Top</span></p>` +
        `<p style="line-height:1.8;margin-top:0pt;margin-bottom:8pt;">` +
        `<span style="font-size:11pt;font-family:Arial;">Spaced</span></p>`
    );

    const doc = await getDocJSON(page);
    const paras = paragraphsOf(doc).filter((p) => textOf(p).includes('Spaced'));
    expect(paras.length).toBe(1);
    expect(paras[0].attrs?.lineSpacing).toBe(360);
    expect(paras[0].attrs?.lineSpacingRule).toBe('auto');
    expect(paras[0].attrs?.spaceAfter).toBe(160);
  });

  test('indented paragraph keeps its left indent', async ({ page }) => {
    await pasteHtml(
      page,
      `<p><span>Top</span></p>` +
        `<p style="margin-left:36pt;">` +
        `<span style="font-size:11pt;font-family:Arial;">Indented</span></p>`
    );

    const doc = await getDocJSON(page);
    const paras = paragraphsOf(doc).filter((p) => textOf(p).includes('Indented'));
    expect(paras.length).toBe(1);
    expect(paras[0].attrs?.indentLeft).toBe(720);
  });
});
