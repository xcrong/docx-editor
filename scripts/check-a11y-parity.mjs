#!/usr/bin/env node
// Accessibility parity check (T28-03 §8b.9, issue #86).
//
// Renders the parity demos for both adapters (editor route + agent-panel
// route), captures each page's accessibility tree via Playwright, and diffs
// the violation-relevant sets. Fails when the adapters are asymmetric —
// i.e. a control is exposed to assistive tech in one adapter but missing
// or unnamed in the other.
//
// Three layers:
//
// 1. Unnamed-control scan (real bugs, either adapter): every
//    button/link/menuitem/tab/textbox in the ax tree MUST have a
//    non-empty accessible name. An unnamed control fails with its role,
//    adapter, and route.
// 1b. Failing-visibility assertions: the editor shell, paged canvas,
//    agent panel (agent route), and at least one named toolbar button
//    MUST be visible after load.
// 2. Cross-adapter role-set diff (parity drift): the SET of interactive
//    roles must match between adapters. Toolbar labels legitimately differ
//    in wording ("Zoom out" vs "−"), so exact (role, name) equality is
//    informational only (reported, capped). Reviewed pattern choices live
//    in KNOWN_ROLE_ASYMMETRY with a reason; new role gaps still fail.
//
// Dep-free on purpose: no axe-core dependency. The ax-tree diff covers
// the parity question ("does Vue expose the same semantics as React?");
// a full axe-rules pass remains a future upgrade.
//
// Usage:
//   bun run check:a11y-parity [--report <path.md>]
//
// Exit non-zero on any failure. The weekly cron
// (.github/workflows/a11y-parity.yml) uploads the report artifact and
// posts failures to an issue — informational, never a merge gate.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import {
  ADAPTERS,
  ROOT,
  ensurePerfServers,
} from './perf/lib/editor-perf.mjs';

const ROUTES = [
  { key: 'editor', query: '' },
  { key: 'agent-panel', query: '&agentPanel=1' },
];

// Asymmetries that are intentional and human-reviewed. Each entry MUST
// carry a reason; drive the list to zero over time, never grow it
// silently. Format: { adapter, route, role, name, reason }.
const KNOWN_ASYMMETRY = [
  // Example (inactive): { adapter: 'vue', route: 'editor', role: 'tab',
  //   name: 'React', reason: 'adapter switcher pill labels its own side' },
];

// Interactive roles whose one-sided absence is a reviewed control-pattern
// choice, not missing functionality. Same rule as KNOWN_ASYMMETRY: entries
// need a reason, and new role gaps still fail.
const KNOWN_ROLE_ASYMMETRY = [
  // Vue's font/style/zoom/line-spacing pickers are button+menu (e.g.
  // "Arial", "Title", "100%") where React uses comboboxes. Same functions,
  // all named, reachable in both adapters — verified in the drift sample.
  { role: 'combobox', onlyIn: 'react', reason: 'vue pickers are button+menu' },
];

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
]);

function flattenAxTree(nodes) {
  // CDP Accessibility.getFullAXTree shape: [{ nodeId, role: { value },
  // name: { value }, childIds }]. (`page.accessibility.snapshot()` was
  // removed in Playwright 1.5x; CDP is the stable structured path.)
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const out = [];
  const visit = (nodeId) => {
    const node = byId.get(nodeId);
    if (!node) return;
    const role = node.role?.value;
    if (role && role !== 'none' && node.ignored !== true) {
      out.push({ role, name: (node.name?.value ?? '').trim() });
    }
    for (const childId of node.childIds ?? []) visit(childId);
  };
  const childIds = new Set(nodes.flatMap((node) => node.childIds ?? []));
  for (const node of nodes) {
    if (!childIds.has(node.nodeId)) visit(node.nodeId);
  }
  return out;
}

function keyOf(entry) {
  return `${entry.role}::${entry.name}`;
}

async function snapshotRoute(browser, adapter, route) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(`${adapter.url}${route.query}`, { timeout: 30000 });
    await page.waitForSelector(adapter.readySelector, { timeout: 25000 });
    await page.waitForSelector('.paged-editor__pages', { timeout: 25000 });
    if (route.key === 'agent-panel') {
      await page.waitForSelector('[data-testid="agent-panel"]', { timeout: 25000 });
    }
    // Let webfont swap + post-mount focus settle so the tree is stable.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const session = await page.context().newCDPSession(page);
    const { nodes } = await session.send('Accessibility.getFullAXTree', { depth: 100 });
    return { entries: flattenAxTree(nodes ?? []), failure: null };
  } catch (error) {
    return { entries: [], failure: String(error).split('\n')[0] };
  } finally {
    await page.close();
  }
}
function isKnown(adapter, route, entry) {
  return KNOWN_ASYMMETRY.some(
    (known) =>
      known.adapter === adapter &&
      known.route === route &&
      known.role === entry.role &&
      known.name === entry.name
  );
}

async function main() {
  await ensurePerfServers();
  const browser = await chromium.launch();
  const failures = [];
  const asymmetries = [];
  const routeSummaries = [];
  try {
    for (const route of ROUTES) {
      const perAdapter = new Map();
      for (const adapter of ADAPTERS) {
        const { entries, failure } = await snapshotRoute(browser, adapter, route);
        if (failure) {
          failures.push(`[${adapter.name}/${route.key}] could not capture ax tree: ${failure}`);
          continue;
        }
        perAdapter.set(adapter.name, entries);

        // Layer 1: unnamed interactive controls are bugs in either adapter.
        for (const entry of entries) {
          if (INTERACTIVE_ROLES.has(entry.role) && entry.name === '') {
            failures.push(
              `[${adapter.name}/${route.key}] unnamed ${entry.role} exposed to assistive tech`
            );
          }
        }

        // Layer 1b: failing-visibility assertions on key surfaces. Waits
        // mirror snapshotRoute — asserting before the doc finishes loading
        // would flag a race, not a regression.
        const visibleChecks =
          route.key === 'agent-panel'
            ? ['[data-testid="agent-panel"]', adapter.readySelector]
            : [adapter.readySelector, '.paged-editor__pages'];
        const checkPage = await browser.newPage();
        try {
          await checkPage.goto(`${adapter.url}${route.query}`, { timeout: 30000 });
          for (const selector of visibleChecks) {
            const locator = checkPage.locator(selector).first();
            try {
              await locator.waitFor({ state: 'visible', timeout: 25000 });
            } catch {
              failures.push(`[${adapter.name}/${route.key}] expected visible: ${selector}`);
            }
          }
          // At least one named toolbar button must be visible — proves the
          // toolbar exposes semantics, not just pixels.
          const namedButton = checkPage.getByRole('button', { name: /.+/ }).first();
          try {
            await namedButton.waitFor({ state: 'visible', timeout: 25000 });
          } catch {
            failures.push(`[${adapter.name}/${route.key}] no visible named toolbar button`);
          }
        } finally {
          await checkPage.close();
        }
      }

      // Layer 2: cross-adapter role-set diff. Toolbar labels legitimately
      // differ in WORDING between adapters ("Zoom out" vs "−"), so exact
      // (role, name) equality is informational only (capped below). What
      // fails is a missing interactive ROLE — e.g. Vue exposing no
      // `combobox`/`slider`/`dialog` where React does means a whole
      // control class never reached assistive tech on one side.
      const reactEntries = perAdapter.get('react') ?? [];
      const vueEntries = perAdapter.get('vue') ?? [];
      const rolesOf = (entries) =>
        new Set(
          entries.filter((entry) => INTERACTIVE_ROLES.has(entry.role)).map((entry) => entry.role)
        );
      const reactRoles = rolesOf(reactEntries);
      const vueRoles = rolesOf(vueEntries);
      const roleTolerated = (role, onlyIn) =>
        KNOWN_ROLE_ASYMMETRY.some((known) => known.role === role && known.onlyIn === onlyIn);
      for (const role of reactRoles) {
        if (vueRoles.has(role)) continue;
        const tolerated = roleTolerated(role, 'react');
        (tolerated ? asymmetries : failures).push(
          `[${route.key}] role "${role}" exposed by react but by no vue control` +
            (tolerated ? ' (known: vue pickers are button+menu)' : '')
        );
      }
      for (const role of vueRoles) {
        if (reactRoles.has(role)) continue;
        const tolerated = roleTolerated(role, 'vue');
        (tolerated ? asymmetries : failures).push(
          `[${route.key}] role "${role}" exposed by vue but by no react control` +
            (tolerated ? ' (known)' : '')
        );
      }
      // Informational name-level drift (same functions, different labels).
      const inReact = new Map(reactEntries.map((entry) => [keyOf(entry), entry]));
      const inVue = new Map(vueEntries.map((entry) => [keyOf(entry), entry]));
      let matched = 0;
      const drift = [];
      for (const [key, entry] of inReact) {
        if (!INTERACTIVE_ROLES.has(entry.role) || entry.name === '') continue;
        if (inVue.has(key)) {
          matched += 1;
        } else if (!isKnown('react', route.key, entry)) {
          drift.push(`[react-only/${route.key}] ${key}`);
        } else {
          asymmetries.push(`[react-only/${route.key}] ${key} (known: tolerated)`);
        }
      }
      for (const [key, entry] of inVue) {
        if (!INTERACTIVE_ROLES.has(entry.role) || entry.name === '') continue;
        if (inReact.has(key)) continue;
        if (isKnown('vue', route.key, entry)) {
          asymmetries.push(`[vue-only/${route.key}] ${key} (known: tolerated)`);
        } else {
          drift.push(`[vue-only/${route.key}] ${key}`);
        }
      }
      const driftShown = drift.slice(0, 20);
      routeSummaries.push(
        `${route.key}: ${matched} matched named controls, ` +
          `${drift.length} label-drift entries ` +
          `(react ${reactEntries.length} / vue ${vueEntries.length} ax nodes)`
      );
      if (drift.length > 0) {
        routeSummaries.push(
          `  drift sample: ${driftShown.join(' | ')}${drift.length > 20 ? ' | …' : ''}`
        );
      }
    }
  } finally {
    await browser.close();
  }

  const lines = [
    '# a11y parity report',
    '',
    `- date: ${new Date().toISOString()}`,
    ...routeSummaries.map((summary) => `- ${summary}`),
    '',
    failures.length === 0
      ? 'Result: PASS — no unnamed controls, no asymmetric semantics.'
      : `Result: FAIL — ${failures.length} finding(s):`,
    ...failures.map((failure) => `- ${failure}`),
    ...asymmetries.map((entry) => `- ${entry}`),
  ];
  const report = `${lines.join('\n')}\n`;

  const args = process.argv.slice(2);
  const reportIndex = args.indexOf('--report');
  if (reportIndex !== -1 && args[reportIndex + 1]) {
    const outPath = path.resolve(ROOT, args[reportIndex + 1]);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, report);
    console.log(`Wrote ${path.relative(ROOT, outPath)}`);
  }

  if (failures.length > 0) {
    console.error(report);
    process.exit(1);
  }
  console.log(report);
}

await main();
