/**
 * Demo showcase builder entry (T25-02, #53).
 *
 * Run: `bun run demo:build`
 * Dogfood route: createEmptyDocument → createDocx → updateMultipleFiles
 * (styles.xml + deterministic core.xml/app.xml). Writes the same buffer to
 * all 7 distribution targets, then prints paths, bytes and feature counts.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import JSZip from 'jszip';
import {
  createEmptyDocument,
  createDocx,
  updateMultipleFiles,
} from '../../packages/core/src/headless.ts';
import { loadBrand } from './brand.ts';
import { collectSections } from './sections/index.ts';
import { applyStructureExtras } from './sections/05-structure.ts';
import { applyLayoutExtras } from './sections/07-layout.ts';
import { title, para } from './builders.ts';

const DEMO_DIR = import.meta.dir;
const REPO_ROOT = resolve(DEMO_DIR, '..', '..');

/** Fixed package timestamp so builds are content-deterministic. */
const FIXED_DATE = '2025-01-01T00:00:00Z';

/** Distribution targets — the same buffer is written to all 7 (md5-identical). */
export const TARGETS = [
  'examples/shared/sample.docx',
  'examples/vite/public/sample.docx',
  'examples/vue/public/sample.docx',
  'examples/nextjs/public/sample.docx',
  'examples/remix/public/sample.docx',
  'examples/astro/public/sample.docx',
  'examples/nuxt/public/sample.docx',
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function coreXml(creator: string, titleText: string, description: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(titleText)}</dc:title>` +
    `<dc:creator>${esc(creator)}</dc:creator>` +
    `<dc:description>${esc(description)}</dc:description>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_DATE}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_DATE}</dcterms:modified>` +
    `</cp:coreProperties>`
  );
}

function appXml(appName: string, version: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
    `<Application>${esc(appName)}</Application>` +
    `<AppVersion>${esc(version)}</AppVersion>` +
    `</Properties>`
  );
}

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

function distinct(hay: string, re: RegExp): string[] {
  const out = new Set<string>();
  for (const m of hay.matchAll(re)) out.add(m[1]);
  return [...out].sort();
}

/**
 * Rebuild the showcase buffer in memory. Exported for the T25-03 guard
 * (`check-sample-docx.mjs`), which compares its content digest against the
 * committed product to detect staleness without touching the filesystem.
 */
export async function buildSampleDocxBuffer(): Promise<Buffer> {
  const brand = loadBrand();
  const { blocks, numbering } = await collectSections(brand);

  const doc = createEmptyDocument();
  doc.package.document.content = [
    title(brand.title),
    para(`演示文档 demo document · ${brand.tagline}`),
    ...blocks,
  ];
  if (numbering) doc.package.numbering = numbering;

  const fresh = await createDocx(applyLayoutExtras(applyStructureExtras(doc), brand));
  const stylesXml = readFileSync(resolve(DEMO_DIR, 'styles.xml'), 'utf8');
  const finalBuf = await updateMultipleFiles(
    fresh,
    new Map<string, string>([
      ['word/styles.xml', stylesXml],
      ['docProps/core.xml', coreXml(brand.creator, brand.title, brand.tagline)],
      ['docProps/app.xml', appXml(brand.appName, brand.coreVersion)],
    ])
  );

  return Buffer.from(finalBuf);
}

async function main(): Promise<void> {
  const bytes = await buildSampleDocxBuffer();
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  const read = async (p: string): Promise<string> =>
    names.includes(p) ? zip.file(p)!.async('text') : '';
  const documentXml = await read('word/document.xml');
  const stylesPart = await read('word/styles.xml');
  const core = await read('docProps/core.xml');
  const app = await read('docProps/app.xml');

  const legacy = [documentXml, stylesPart, core, app].filter((x) => /eigenpal/i.test(x));
  if (legacy.length > 0) throw new Error('brand leak: legacy brand text found in generated parts');

  const jc = distinct(documentXml, /w:jc w:val="([^"]+)"/g);
  const ilvl = distinct(documentXml, /w:ilvl w:val="([^"]+)"/g);
  const pStyle = distinct(documentXml, /w:pStyle w:val="([^"]+)"/g);
  const authors = distinct(documentXml, /w:author="([^"]+)"/g);
  const features = {
    'w:jc': jc.join(','),
    'w:tab': count(documentXml, 'w:tab'),
    gridSpan: count(documentXml, 'w:gridSpan'),
    vMerge: count(documentXml, 'w:vMerge'),
    'w:tbl': count(documentXml, 'w:tbl'),
    'w:ilvl': ilvl.join(','),
    'w:pStyle': pStyle.join(','),
    'w:highlight': count(documentXml, 'w:highlight'),
    'w:vertAlign': count(documentXml, 'w:vertAlign'),
    'w:strike': count(documentXml, 'w:strike'),
    'w:ins': count(documentXml, '<w:ins '),
    'w:del': count(documentXml, '<w:del '),
    authors: authors.join(','),
  };
  const needFourJc = ['left', 'center', 'right', 'both'].every((v) => jc.includes(v));
  const checks: Array<[string, boolean]> = [
    ['jc 4 values', needFourJc],
    ['w:tab>=3', features['w:tab'] >= 3],
    ['gridSpan>=1', features.gridSpan >= 1],
    ['vMerge>=1', features.vMerge >= 1],
    ['w:tbl>=5', features['w:tbl'] >= 5],
    ['ilvl 0/1/2', ['0', '1', '2'].every((v) => ilvl.includes(v))],
    ['pStyle H1/2/3', ['Heading1', 'Heading2', 'Heading3'].every((v) => pStyle.includes(v))],
    ['highlight>=1', features['w:highlight'] >= 1],
    ['vertAlign>=2', features['w:vertAlign'] >= 2],
    ['strike>=1', features['w:strike'] >= 1],
    [
      'revisions 3 authors',
      ['sara.k', 'thomas.v', 'anon-contributor'].every((a) => authors.includes(a)),
    ],
    ['<=400KB', bytes.byteLength <= 400 * 1024],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length > 0)
    throw new Error(`acceptance failed: ${failed.join('; ')} | ${JSON.stringify(features)}`);

  for (const rel of TARGETS) {
    const abs = resolve(REPO_ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    console.log(`${rel} ${bytes.byteLength}B`);
  }
  const { numbering } = await collectSections(loadBrand());
  console.log(JSON.stringify({ bytes: bytes.byteLength, features, numbering: Boolean(numbering) }));
}
if (import.meta.main) await main();
