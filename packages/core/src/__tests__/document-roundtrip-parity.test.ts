/**
 * Snapshot parity — Document round-trip (T28-01 §8b.4, issue #84).
 *
 * Both adapters (`@xcrong/docx-editor-react`, `@xcrong/docx-editor-vue`)
 * save through the same core headless pipeline:
 *
 *   parseDocx -> executeCommands(edits) -> repackDocx / createDocx
 *
 * So a React-run and a Vue-run of the same `[fixture, edits]` pair MUST
 * produce equivalent `Document` snapshots. This test proves it at the unit
 * layer (no browser): for every case in
 * `examples/parity/fixtures/snapshot-corpus.json` it
 *
 * 1. runs the pipeline TWICE from scratch (the two runs stand in for the
 *    React adapter run and the Vue adapter run) and requires byte-identical
 *    NORMALIZED digests — this is the parity assertion, and it catches
 *    run-to-run nondeterminism (`new Date()` in core properties, JSZip
 *    entry dates) escaping the normalization;
 * 2. requires the digest to match the committed value in
 *    `examples/parity/fixtures/snapshot-digests.json` — this is the
 *    regression assertion: any core change that alters round-trip output
 *    turns this gate red until digests are deliberately regenerated.
 *
 * NEVER byte-compare `.docx` output directly. Regenerate digests with:
 *
 *   bun run snapshot:update
 *
 * and commit the result. The update path re-verifies run-twice stability
 * before writing, so a nondeterministic pipeline can never bless itself.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDocx } from '../docx/parser';
import { repackDocx, createDocx } from '../docx/rezip';
import { executeCommands } from '../agent/executor';
import type { AgentCommand } from '../types/agentApi';
import { createEmptyDocument } from '../utils/createDocument';
import { digestDocx } from './snapshot-digest';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');
const FIXTURES_DIR = join(REPO_ROOT, 'examples', 'parity', 'fixtures');
const CORPUS_PATH = join(FIXTURES_DIR, 'snapshot-corpus.json');
const DIGESTS_PATH = join(FIXTURES_DIR, 'snapshot-digests.json');

interface CorpusCase {
  id: string;
  fixture: string | null;
  edits: AgentCommand[];
}

interface Corpus {
  version: number;
  fixtureDir: string;
  cases: CorpusCase[];
}

function loadCorpus(): Corpus {
  return JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus;
}

function loadDigests(): Record<string, string> {
  try {
    const raw = JSON.parse(readFileSync(DIGESTS_PATH, 'utf8')) as {
      digests: Record<string, string>;
    };
    return raw.digests;
  } catch {
    return {};
  }
}

/** One full adapter-equivalent run: load -> edit -> save -> digest. */
async function runPipeline(fixtureDir: string, c: CorpusCase): Promise<string> {
  const buffer =
    c.fixture === null
      ? await createDocx(createEmptyDocument())
      : await Bun.file(join(REPO_ROOT, fixtureDir, c.fixture)).arrayBuffer();
  const doc = await parseDocx(buffer);
  let edited = doc;
  if (c.edits.length > 0) {
    try {
      edited = executeCommands(doc, c.edits);
    } catch (error) {
      throw new Error(
        `case ${c.id}: executeCommands failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const out = c.fixture === null ? await createDocx(edited) : await repackDocx(edited);
  return digestDocx(out);
}

const corpus = loadCorpus();

describe('snapshot parity: Document round-trip', () => {
  for (const c of corpus.cases) {
    test(`case ${c.id}: react-run and vue-run agree, digest matches committed`, async () => {
      // The two runs stand in for the two adapters' save paths.
      const [reactDigest, vueDigest] = await Promise.all([
        runPipeline(corpus.fixtureDir, c),
        runPipeline(corpus.fixtureDir, c),
      ]);
      expect(reactDigest).toBe(vueDigest);

      if (process.env.UPDATE_SNAPSHOTS === '1') {
        const digests = loadDigests();
        digests[c.id] = reactDigest;
        const ordered: Record<string, string> = {};
        for (const key of Object.keys(digests).sort()) ordered[key] = digests[key];
        writeFileSync(
          DIGESTS_PATH,
          `${JSON.stringify({ version: 1, digests: ordered }, null, 2)}\n`
        );
        return;
      }

      const committed = loadDigests()[c.id];
      expect(
        committed,
        `no committed digest for case ${c.id} — run \`bun run snapshot:update\``
      ).toBeDefined();
      expect(reactDigest).toBe(committed);
    });
  }
});
