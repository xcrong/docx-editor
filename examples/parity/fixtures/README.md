# Parity fixtures

Shared input corpus for the cross-adapter gates (T28-01, issue #84).

## What lives here

- `snapshot-corpus.json` — the `[fixture, edits]` pairs driving the snapshot-parity
  gate (`bun run test:snapshot-parity`). Add entries here to grow coverage; no new
  test files needed. Regenerate digests with `bun run snapshot:update`.
- `snapshot-digests.json` — committed NORMALIZED content digests (sha256 over
  file contents with timestamps/rsids scrubbed). NEVER byte-compare `.docx`
  output: `createEmpty` writes `new Date()` and JSZip stamps entry dates, so
  identical documents never have identical bytes.

## What does NOT live here

The binary `.docx` corpus stays at the repo-root `e2e/fixtures/` directory: all
three Playwright suites (react-only, vue-only, parity) already read from that
single directory (see `e2e/fixtures/README.md`), and ~80 specs reference it by
relative path. Moving 70+ binaries for §7.3 would churn every suite with zero
parity benefit, so the reconciliation is: `e2e/fixtures/` IS the shared binary
dir; this directory holds the parity-specific JSON corpus that both runners
(the bun snapshot test and the `check:*` scripts) read from.
