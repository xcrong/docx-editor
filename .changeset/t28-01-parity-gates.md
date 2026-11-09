---
'@xcrong/docx-editor-react': patch
'@xcrong/docx-editor-vue': patch
---

Dual-adapter Playwright architecture + snapshot/bundle gates (T28-01, refs #84, refs #71). No runtime change. New gates, all red-capable and running in CI: the full `e2e/tests/parity/` suite (parametrized over `/react/` + `/vue/` with per-adapter failure screenshots) on every PR, a cross-adapter first-page pixel-diff, normalized Document round-trip digests (`bun run check:snapshot-parity`), gzip bundle-size parity for both adapter entries (`bun run check:parity-bundle-size`), and a matrix-freshness check for component changes. On-demand smoke usage is documented in CONTRIBUTING and the Vue README.
