#!/usr/bin/env node
import path from 'node:path';
import {
  ADAPTERS,
  ensurePerfServers,
  openAdapter,
  ROOT,
  withBrowser,
  writePerfResult,
} from './lib/editor-perf.mjs';

// 308-page / 127K-word fixture shared with the large-doc e2e specs.
const LARGE_DOC_PATH = path.join(ROOT, 'e2e/fixtures/issue-68-large.docx');

const results = {};

await ensurePerfServers();

await withBrowser(async (page) => {
  for (const adapter of ADAPTERS) {
    await openAdapter(page, adapter);
    const baseline = await page.evaluate(() => ({
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      domNodes: document.querySelectorAll('*').length,
    }));
    await page.locator('input[type="file"]').first().setInputFiles(LARGE_DOC_PATH);
    await page.waitForSelector('[data-page-number]', { timeout: 90000 });
    // Let virtualization shells + deferred paint settle.
    await page.waitForTimeout(2000);
    const loaded = await page.evaluate(() => ({
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      domNodes: document.querySelectorAll('*').length,
      pages: document.querySelectorAll('[data-page-number]').length,
      revisionSpans: document.querySelectorAll('[data-revision-id]').length,
    }));
    results[adapter.name] = {
      baselineDomNodes: baseline.domNodes,
      baselineHeapBytes: baseline.heapBytes,
      loadedHeapBytes: loaded.heapBytes,
      heapDeltaBytes:
        baseline.heapBytes != null && loaded.heapBytes != null
          ? loaded.heapBytes - baseline.heapBytes
          : null,
      loadedDomNodes: loaded.domNodes,
      pages: loaded.pages,
      revisionSpans: loaded.revisionSpans,
    };
    console.log(
      `${adapter.name}: heap=${Math.round((loaded.heapBytes ?? 0) / 1048576)}MB ` +
        `(+${Math.round(((loaded.heapBytes ?? 0) - (baseline.heapBytes ?? 0)) / 1048576)}MB) ` +
        `dom=${loaded.domNodes} pages=${loaded.pages} revisionSpans=${loaded.revisionSpans}`
    );
  }
});

writePerfResult('memory', { unit: 'bytes/nodes', results });

// Report-only profiling (no budget gate yet): heap varies with the
// machine and fixture, so this records the profile for trend tracking
// rather than failing the gate. DOM growth is the actionable signal —
// page virtualization keeps painted shells bounded while the PM model
// (not DOM) holds the full 308 pages.
