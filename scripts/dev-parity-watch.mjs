#!/usr/bin/env node
// Pair-edit dev mode (T28-03 §8b.7, issue #86).
//
// Concurrently runs the React (5173) + Vue (5174) demo dev servers and
// re-runs the parity smoke suite on every save under the adapter sources.
// Usage: `bun run dev:parity:watch`, edit a Vue component, watch the smoke
// parity tests re-run. Ctrl-C stops everything.
//
// Boring on purpose: node:child_process + node:fs.watch, no new deps.
// Playwright boots its own webServers, but with the ports already taken it
// reuses these (`reuseExistingServer` outside CI), so there is no double boot.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const WATCH_DIRS = [
  'packages/react/src',
  'packages/vue/src',
  'packages/agents/src',
  'packages/core/src',
  'packages/i18n/src',
  'examples/vite/src',
  'examples/vue/src',
  'examples/shared',
].map((dir) => path.join(ROOT, dir));

const SMOKE_ARGS = ['x', 'playwright', 'test', '--project=parity', 'e2e/tests/parity/smoke', '--reporter=line'];

async function portTaken(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

function waitForUrl(url, timeoutMs = 90000) {
  const started = Date.now();
  const poll = async () => {
    while (Date.now() - started < timeoutMs) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (res.ok || res.status < 500) return;
      } catch {
        // Not up yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${url}`);
  };
  return poll();
}

const children = [];
function spawnServer(name, args) {
  const child = spawn('bun', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  children.push(child);
  return child;
}

let smokeRunning = false;
let rerunRequested = false;
let smokeChild = null;
function runSmoke() {
  if (smokeRunning) {
    rerunRequested = true;
    return;
  }
  smokeRunning = true;
  console.log('\n▶ parity smoke: re-running after change…');
  smokeChild = spawn('bun', SMOKE_ARGS, {
    cwd: ROOT,
    stdio: 'inherit',
    // The watcher owns :5173/:5174. Blank CI so Playwright reuses them
    // (`reuseExistingServer`) instead of booting its own and failing
    // on the taken ports.
    env: { ...process.env, NO_NUXT: '1', CI: '' },
  });
  const child = smokeChild;
  child.on('exit', (code) => {
    smokeRunning = false;
    if (child === smokeChild) smokeChild = null;
    console.log(code === 0 ? '✔ parity smoke green' : `✘ parity smoke failed (exit ${code})`);
    if (rerunRequested) {
      rerunRequested = false;
      runSmoke();
    } else {
      console.log('Watching for changes… (Ctrl-C to stop)');
    }
  });
}

function shutdown() {
  if (smokeChild) smokeChild.kill();
  for (const child of children) child.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Fail fast when something already owns the ports: vite would silently
// hop to 5175+ while the smoke run still targets :5173/:5174, testing
// stale servers. Stop the other dev servers first instead.
for (const url of ['http://localhost:5173', 'http://localhost:5174']) {
  if (await portTaken(url)) {
    console.error(`Port in use: ${url} already answers. Stop the other dev server first.`);
    process.exit(1);
  }
}
spawnServer('react', ['run', 'dev:react']);
spawnServer('vue', ['run', 'dev:vue']);
await Promise.all([waitForUrl('http://localhost:5173'), waitForUrl('http://localhost:5174')]);
console.log('Both demos up (react :5173, vue :5174). Running smoke once, then watching…');
runSmoke();

let debounce = null;
for (const dir of WATCH_DIRS) {
  if (!fs.existsSync(dir)) continue;
  fs.watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (!/\.(ts|tsx|vue|css|json)$/.test(filename)) return;
    if (filename.includes('__tests__')) return;
    clearTimeout(debounce);
    debounce = setTimeout(runSmoke, 1500);
  });
}
