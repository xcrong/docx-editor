#!/usr/bin/env node
// Bundle-size parity gate between @xcrong/docx-editor-react and
// @xcrong/docx-editor-vue (T28-01 §8b.6, issue #84).
//
// Gzips each adapter's ESM entry (`import` condition of the package
// `exports` map) and fails when the relative size gap exceeds 25% AND the
// larger side grew compared to the committed baseline
// (`scripts/parity/bundle-size.baseline.json`). The two-sided condition
// keeps the gate green when both adapters grow together (a shared core
// change) or when the gap closes, and turns red only on asymmetric bloat —
// e.g. someone shipping a 200KB dependency in one adapter.
//
// Usage:
//   node scripts/check-parity-bundle-size.mjs            # assert
//   node scripts/check-parity-bundle-size.mjs --update   # re-baseline after
//                                                        # an intentional change
//
// Requires built dists (`bun run build:packages` first — CI runs this gate
// after the build step). Compares against committed bytes, never build
// timestamps, so it is deterministic.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(repoRoot, 'scripts', 'parity', 'bundle-size.baseline.json');

const THRESHOLD = 0.25;

const ENTRIES = {
  react: 'packages/react/dist/index.mjs',
  vue: 'packages/vue/dist/index.js',
};

function gzipBytes(relPath) {
  const abs = path.join(repoRoot, relPath);
  if (!existsSync(abs)) {
    console.error(`missing dist entry: ${relPath} — run \`bun run build:packages\` first.`);
    process.exit(2);
  }
  return gzipSync(readFileSync(abs)).byteLength;
}

function currentSizes() {
  return {
    react: gzipBytes(ENTRIES.react),
    vue: gzipBytes(ENTRIES.vue),
  };
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

function headSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function relDiff(a, b) {
  return Math.abs(a - b) / Math.min(a, b);
}

if (process.argv.includes('--update')) {
  const sizes = currentSizes();
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ version: 1, updatedFor: headSha(), entries: ENTRIES, gzip: sizes }, null, 2)}\n`
  );
  console.log(`baseline updated: react=${sizes.react}B vue=${sizes.vue}B gzip`);
  process.exit(0);
}

const sizes = currentSizes();
const diff = relDiff(sizes.react, sizes.vue);
const larger = sizes.react >= sizes.vue ? 'react' : 'vue';
console.log(
  `gzip: react=${sizes.react}B vue=${sizes.vue}B relDiff=${(diff * 100).toFixed(1)}% (threshold 25%)`
);

if (diff <= THRESHOLD) {
  console.log('bundle-size parity passed.');
  process.exit(0);
}

const baseline = loadBaseline();
if (!baseline) {
  console.error(
    'bundle-size gap exceeds 25% and no baseline exists — run with --update to record one.'
  );
  process.exit(1);
}

const baselineLarger = baseline.gzip?.[larger];
if (baselineLarger === undefined) {
  console.error(`baseline has no entry for ${larger} — re-run with --update.`);
  process.exit(1);
}

if (sizes[larger] > baselineLarger) {
  console.error(
    `bundle-size parity FAILED: ${larger} is the larger side (${sizes[larger]}B > baseline ${baselineLarger}B) and the gap is ${(diff * 100).toFixed(1)}% > 25%.`
  );
  console.error(
    'If the growth is intentional, re-baseline with `bun run parity-bundle-baseline:update` and commit the result.'
  );
  process.exit(1);
}

console.log(
  `gap exceeds 25% but ${larger} shrank vs baseline (${sizes[larger]}B <= ${baselineLarger}B) — passing.`
);
