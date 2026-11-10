#!/usr/bin/env node
// Matrix-update CI check (T28-01 §7.8, issue #84).
//
// Fails when a change touches component/UI surface under
// `packages/{react,vue}/src/components/` or
// `packages/agents/src/{react,vue}/` without also updating the parity
// matrix (`openspec/changes/vue-editor-robust-implementation/` — the spec
// or its notes). Keeps "what's done / partial / missing" honest: no
// silent UI drift without a matrix row update.
//
// Range: `origin/<base>...HEAD` where base is `$GITHUB_BASE_REF` in CI and
// `main` locally. Local manual check against uncommitted work:
// `git diff --name-only` is included when the worktree is dirty.
import { execSync } from 'node:child_process';

const COMPONENT_PREFIXES = [
  'packages/react/src/components/',
  'packages/vue/src/components/',
  'packages/agents/src/react/',
  'packages/agents/src/vue/',
];
const MATRIX_PREFIX = 'openspec/changes/vue-editor-robust-implementation/';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function changedFiles() {
  const base = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : 'origin/main';
  let files = [];
  try {
    files = sh(`git diff --name-only ${base}...HEAD`).split('\n').filter(Boolean);
  } catch {
    console.log(`base ${base} not available (shallow clone?) — comparing HEAD~1.`);
    try {
      files = sh('git diff --name-only HEAD~1...HEAD').split('\n').filter(Boolean);
    } catch {
      console.log('no git range available — skipping matrix check.');
      return [];
    }
  }
  try {
    const dirty = sh('git status --porcelain')
      .split('\n')
      .filter(Boolean)
      .map((line) =>
        line
          .slice(3)
          .trim()
          .replace(/^"(.*)"$/, '$1')
      );
    for (const file of dirty) {
      if (!files.includes(file)) files.push(file);
    }
  } catch {
    // Worktree state unreadable — range diff is enough.
  }
  return files;
}

const files = changedFiles();
const touchedComponents = files.filter((file) =>
  COMPONENT_PREFIXES.some((prefix) => file.startsWith(prefix))
);
if (touchedComponents.length === 0) {
  console.log('parity-matrix check passed (no component surface touched).');
  process.exit(0);
}

const touchedMatrix = files.some((file) => file.startsWith(MATRIX_PREFIX));
if (touchedMatrix) {
  console.log('parity-matrix check passed (matrix updated alongside components).');
  process.exit(0);
}

console.error('parity-matrix check FAILED: component surface changed without a matrix update.');
for (const file of touchedComponents) console.error(`  - ${file}`);
console.error(
  `Update the matrix at ${MATRIX_PREFIX}specs/vue-react-parity/spec.md (or its notes/) in the same PR.`
);
process.exit(1);
