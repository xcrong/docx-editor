#!/usr/bin/env bun
/**
 * Demo showcase guard (T25-03, #54). Run: `bun run check:sample-docx`
 *
 * Eight checks over the 7 committed `sample.docx` copies (see TARGETS in
 * `build-sample-docx.ts`):
 *
 * 1. staleness — rebuild in memory, compare content digests (`digest.ts`).
 * 2. reference integrity — every `r:id`/`r:embed` resolves in the matching
 *    `.rels`; `[Content_Types].xml` Overrides match parts one-to-one.
 * 3. zero-reference parts — `footnotes`/`comments` entries with no body
 *    reference are dead weight and break the showcase contract.
 * 4. brand — no `eigenpal` (case-insensitive) in any text part.
 * 5. copies — all 7 distribution targets byte-identical (md5).
 * 6. dogfood round-trip — parse → create → parse → create → parse is stable.
 * 7. size — every copy stays within the 400 KB homepage budget.
 * 8. coverage — every `editing !== 'none'` matrix feature is DEMOED or
 *    NOT_DEMOABLE in `coverage.ts` (T25-08, #59).
 *
 * Prints one line per check (`ok` / `FAIL`) plus a summary. Exit 0 when all
 * pass, 1 otherwise. Each failure message says how to reproduce/fix.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { digestDocx, shortDigest } from './digest.ts';
import { TARGETS, buildSampleDocxBuffer } from './build-sample-docx.ts';
import { checkCoverage } from './coverage.ts';
import { parseDocx, createDocx } from '../../packages/core/src/headless.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SIZE_BUDGET = 400 * 1024;
const STALE_MSG = 'sample.docx 已过期，请运行 bun run demo:build';

/** @type {Array<{ name: string; ok: boolean; detail: string }>} */
const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`ok - ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`FAIL - ${name}: ${detail}`);
}

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

/** `.rels` file backing an OOXML part, or null for non-part entries. */
function relsFor(part) {
  if (part === '[Content_Types].xml' || part.endsWith('.rels') || part.endsWith('/')) return null;
  const slash = part.lastIndexOf('/');
  if (slash === -1) return null;
  return `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`;
}

function relIds(relsXml) {
  const ids = new Set();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*?\bId="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

function refsIn(partXml) {
  const refs = [];
  for (const m of partXml.matchAll(/\br:(?:id|embed)="([^"]+)"/g)) refs.push(m[1]);
  return refs;
}
/** Deterministic serialization: object keys sorted, Maps pre-sorted by caller. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeDoc(doc) {
  const plain = JSON.parse(
    JSON.stringify(doc, (_key, value) => {
      if (value instanceof Map) {
        return {
          __map: [...value.entries()].sort(([a], [b]) => (String(a) < String(b) ? -1 : 1)),
        };
      }
      if (value instanceof ArrayBuffer) return { __bytes: Array.from(new Uint8Array(value)) };
      if (ArrayBuffer.isView(value)) return { __bytes: Array.from(value) };
      return value;
    }),
  );
  delete plain.originalBuffer;
  delete plain.warnings;
  delete plain.templateVariables;
  if (plain.package?.properties) {
    delete plain.package.properties.created;
    delete plain.package.properties.modified;
  }
  return stable(plain);
}

async function main() {
  console.log('check:sample-docx — 8 checks over the committed sample.docx copies');

  const abs = TARGETS.map((rel) => path.join(REPO_ROOT, rel));
  const missing = TARGETS.filter((_, i) => !existsSync(abs[i]));
  const bufs = new Map();
  for (let i = 0; i < TARGETS.length; i++) {
    if (!existsSync(abs[i])) continue;
    bufs.set(TARGETS[i], readFileSync(abs[i]));
  }
  const shared = bufs.get(TARGETS[0]);

  // 1. Staleness: in-memory rebuild vs committed product (content digest).
  let fresh = null;
  try {
    fresh = await buildSampleDocxBuffer();
  } catch (err) {
    fail('staleness', `${STALE_MSG}（重建失败：${err.message}）`);
  }
  if (fresh) {
    if (!shared) {
      fail('staleness', `${STALE_MSG}（${TARGETS[0]} 缺失，先运行 bun run demo:build）`);
    } else {
      const freshDigest = await digestDocx(fresh);
      let diskDigest = null;
      try {
        diskDigest = await digestDocx(shared);
      } catch (err) {
        fail('staleness', `${STALE_MSG}（仓库产物无法解包，可能已损坏：${err.message}）`);
      }
      if (diskDigest) {
        if (freshDigest !== diskDigest) {
          fail(
            'staleness',
            `${STALE_MSG}（仓库 ${shortDigest(diskDigest)} ≠ 重建 ${shortDigest(freshDigest)}）`,
          );
        } else {
          pass('staleness', `digest ${shortDigest(diskDigest)}`);
        }
      }
    }
  }

  // 2. Reference integrity + Content_Types one-to-one mapping.
  try {
    if (!shared) throw new Error(`${TARGETS[0]} 缺失，无法解包`);
    const zip = await JSZip.loadAsync(shared);
    const problems = [];
    const relsCache = new Map();
    const textOf = async (name) => zip.file(name)?.async('text') ?? '';
    for (const name of Object.keys(zip.files)) {
      if (name.endsWith('/') || name.endsWith('.rels')) continue;
      if (name === '[Content_Types].xml') continue;
      const partRefs = refsIn(await textOf(name));
      // Parts without r:id/r:embed need no .rels (styles, numbering,
      // core/app properties). Only referenced parts must resolve.
      if (partRefs.length === 0) continue;
      const relsName = relsFor(name);
      if (!relsName) continue;
      if (!relsCache.has(relsName)) {
        relsCache.set(relsName, zip.file(relsName) ? relIds(await textOf(relsName)) : null);
      }
      const ids = relsCache.get(relsName);
      if (!ids) {
        problems.push(`${name} 缺少 ${relsName}`);
        continue;
      }
      for (const ref of partRefs) {
        if (!ids.has(ref)) problems.push(`${name} 引用 ${ref} 在 ${relsName} 中无定义`);
      }
    }
    const overrides = new Set();
    const ct = await textOf('[Content_Types].xml');
    for (const m of ct.matchAll(/<Override\b[^>]*?\bPartName="([^"]+)"/g)) {
      overrides.add(m[1].replace(/^\//, ''));
    }
    // ECMA-376: a <Default Extension="…"> covers every part with that
    // extension (Word itself emits these for png/jpeg). A part is typed
    // iff it has an Override OR its extension has a Default.
    const defaults = new Set();
    for (const m of ct.matchAll(/<Default\b[^>]*?\bExtension="([^"]+)"/g)) {
      defaults.add(m[1].toLowerCase());
    }
    const extOf = (p) => (p.includes('.') ? p.split('.').pop().toLowerCase() : '');
    const contentParts = Object.keys(zip.files).filter(
      (n) => !n.endsWith('/') && n !== '[Content_Types].xml' && !n.endsWith('.rels'),
    );
    for (const p of contentParts) {
      if (!overrides.has(p) && !defaults.has(extOf(p)))
        problems.push(`[Content_Types].xml 缺少 Override/Default：/${p}`);
    }
    for (const o of overrides) {
      if (!contentParts.includes(o)) problems.push(`[Content_Types].xml 悬空 Override：/${o}`);
    }
    if (problems.length > 0) fail('references', problems.join('；'));
    else pass('references', `${contentParts.length} 部件，rels 与类型声明一致`);
  } catch (err) {
    fail('references', `解包失败：${err.message}`);
  }

  // 3. Zero-reference parts: footnotes/comments entries nobody points at.
  try {
    if (!shared) throw new Error(`${TARGETS[0]} 缺失，无法解包`);
    const zip = await JSZip.loadAsync(shared);
    const isNotePart = (n) => /footnotes|endnotes|comments/i.test(n);
    const bodyXml = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((n) => n.startsWith('word/') && n.endsWith('.xml') && !isNotePart(n))
          .map((n) => zip.file(n).async('text')),
      )
    ).join('\n');
    const problems = [];
    const checkNotes = async (kind, entryRe, refRes) => {
      const parts = Object.keys(zip.files).filter(
        (n) => n.startsWith('word/') && n.endsWith('.xml') && n.toLowerCase().includes(kind),
      );
      let entries = 0;
      for (const p of parts) entries += (await zip.file(p).async('text')).match(entryRe)?.length ?? 0;
      const refs = refRes.reduce((n, re) => n + (bodyXml.match(re)?.length ?? 0), 0);
      if (entries > 0 && refs === 0) {
        problems.push(`${kind} 有 ${entries} 个条目但正文 0 引用（零引用部件）`);
      }
    };
    await checkNotes('footnote', /<w:footnote\s/g, [/w:footnoteReference/g]);
    await checkNotes('endnote', /<w:endnote\s/g, [/w:endnoteReference/g]);
    await checkNotes('comment', /<w:comment\s/g, [/w:commentRangeStart/g, /w:commentReference/g]);
    if (problems.length > 0) fail('zero-refs', problems.join('；'));
    else pass('zero-refs', '无零引用部件');
  } catch (err) {
    fail('zero-refs', `解包失败：${err.message}`);
  }

  // 4. Brand: legacy `eigenpal` must not appear in any text part.
  try {
    if (!shared) throw new Error(`${TARGETS[0]} 缺失，无法解包`);
    const zip = await JSZip.loadAsync(shared);
    const hits = [];
    for (const name of Object.keys(zip.files)) {
      if (name.endsWith('/')) continue;
      const text = Buffer.from(await zip.file(name).async('uint8array')).toString('utf8');
      if (/eigenpal/i.test(text)) hits.push(name);
    }
    if (hits.length > 0) fail('brand', `legacy 品牌命中：${hits.join('、')}`);
    else pass('brand', '无 eigenpal 命中');
  } catch (err) {
    fail('brand', `解包失败：${err.message}`);
  }

  // 5. Copies: all 7 targets byte-identical.
  if (missing.length > 0) {
    fail('copies', `缺失副本：${missing.join('、')}`);
  } else {
    const byMd5 = new Map();
    for (const [rel, buf] of bufs) {
      const sum = md5(buf);
      if (!byMd5.has(sum)) byMd5.set(sum, []);
      byMd5.get(sum).push(rel);
    }
    if (byMd5.size !== 1) {
      const detail = [...byMd5.entries()]
        .map(([sum, rels]) => `${sum.slice(0, 12)}: ${rels.join(', ')}`)
        .join('；');
      fail('copies', `7 份副本不一致（${detail}），运行 bun run demo:build 重新分发`);
    } else {
      pass('copies', `7 份一致 md5 ${[...byMd5.keys()][0].slice(0, 12)}`);
    }
  }

  // 6. Dogfood round-trip: parse → create → parse → create → parse is stable.
  // The first parse carries parser-injected section defaults the serializer
  // normalizes away, so stability is asserted on the two reparse models
  // (d2 vs d3) plus the repack content digests — both must be fixpoints.
  try {
    if (!shared) throw new Error(`${TARGETS[0]} 缺失，无法往返`);
    const d1 = await parseDocx(shared);
    const buf2 = Buffer.from(await createDocx(d1));
    const d2 = await parseDocx(buf2);
    const buf3 = Buffer.from(await createDocx(d2));
    const d3 = await parseDocx(buf3);
    const [digest2, digest3] = await Promise.all([digestDocx(buf2), digestDocx(buf3)]);
    const s2 = normalizeDoc(d2);
    const s3 = normalizeDoc(d3);
    if (s2 !== s3 || digest2 !== digest3) {
      let at = 0;
      while (at < Math.min(s2.length, s3.length) && s2[at] === s3[at]) at++;
      fail(
        'round-trip',
        `往返结构不一致（模型差分位置 ${at}，摘要 ${shortDigest(digest2)} vs ${shortDigest(digest3)}）`,
      );
    } else {
      pass('round-trip', `parse→create→parse 稳定（${shortDigest(digest2)}，模型 ${s2.length} 字符）`);
    }
  } catch (err) {
    fail('round-trip', `往返失败：${err.message}`);
  }

  // 7. Size budget.
  if (bufs.size === 0) {
    fail('size', '无可用副本');
  } else {
    const over = [...bufs.entries()]
      .map(([rel, buf]) => ({ rel, bytes: buf.byteLength }))
      .filter(({ bytes }) => bytes > SIZE_BUDGET);
    const biggest = Math.max(...[...bufs.values()].map((b) => b.byteLength));
    if (over.length > 0) {
      fail(
        'size',
        `超体积预算 400KB：${over.map(({ rel, bytes }) => `${rel} ${bytes}B`).join('、')}`,
      );
    } else {
      pass('size', `最大 ${biggest}B ≤ 400KB`);
    }
  }

  // 8. Coverage ledger (T25-08, #59): every editing !== 'none' feature
  // DEMOED or NOT_DEMOABLE in coverage.ts. Failure text guides the fix.
  try {
    const report = checkCoverage();
    if (report.failures.length > 0) {
      fail('coverage', report.failures.join('\n'));
    } else {
      pass(
        'coverage',
        `${report.demoedCount} 处演示 + ${report.exemptCount} 项豁免，覆盖全部 ${report.required} 个可编辑特性（矩阵共 ${report.total} 条）`,
      );
    }
  } catch (err) {
    fail('coverage', `台账检查异常：${err.message}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    failed.length === 0
      ? `check:sample-docx: ${results.length}/${results.length} passed`
      : `check:sample-docx: ${failed.length} failed — ${failed.map((r) => r.name).join(', ')}`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
