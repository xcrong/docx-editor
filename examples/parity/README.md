# Parity demo

Single deployment that serves the React and Vue adapter examples on the same domain. A switcher pill in each editor's toolbar flips between adapters with a normal page navigation. No iframes, no chrome wrapper — each adapter owns the full viewport.

## Why this exists

The 1.0.0 unification renames packages and ships React and Vue adapters from a shared `@xcrong/docx-editor-core`. The community-trust signal is "the same DOCX renders identically in both adapters when installed from npm." This deployment proves it by serving both adapters from real `node_modules` resolution paths, not source aliases.

The build trick: dev mode aliases `@xcrong/*` to `packages/*/src` for HMR. Parity mode sets `USE_PUBLISHED_PACKAGES=true` so vite resolves through `node_modules` → workspace `dist/` — the exact bytes a consumer downloads from npm.

## Routes

| Path      | Source               | Adapter                             |
| --------- | -------------------- | ----------------------------------- |
| `/`       | (vercel.json)        | 307 redirects to `/react/`          |
| `/react/` | `examples/vite/dist` | React (`@xcrong/docx-editor-react`) |
| `/vue/`   | `examples/vue/dist`  | Vue (`@xcrong/docx-editor-vue`)     |

The switcher pill in each editor's toolbar (`examples/shared/AdapterSwitcher.tsx` for React, inline HTML in Vue's `App.vue`) is just two anchor tags pointing at `/react/` and `/vue/`. Click is a normal navigation.

## Build

```bash
bun run build
```

Sequence:

1. Build all five workspace packages (`bun run build:packages`) so each has a `dist/`.
2. Build the React example with `USE_PUBLISHED_PACKAGES=true VITE_BASE_PATH=/react/` — vite skips workspace source aliases and resolves package names normally.
3. Build the Vue example with `USE_PUBLISHED_PACKAGES=true VITE_BASE_PATH=/vue/`.
4. Merge into `examples/parity/dist/{react,vue}/` and copy this folder's `index.html` to the root.

## Local preview

```bash
bun run preview
```

## Deploying to Vercel

Root `vercel.json` declares `bun run build` as the build, `examples/parity/dist` as the output, and the right SPA rewrites for `/react/*` and `/vue/*`. So any Vercel project pointed at this repo gets the parity preview by default — no dashboard overrides needed.

To stand up a preview for the `1.0.0-release` branch on a custom URL:

- In your Vercel project Settings → Domains, add a domain (e.g. `next.docx-editor.dev` or `1-0-0-release.docx-editor.dev`) and set its Git Branch to `1.0.0-release`. Every push to that branch redeploys.

The existing `docx-editor.xcrong.me` deployment off `main` will pick up the parity build on its next deploy after this change merges. `/` redirects to `/react/`, the React adapter takes the full viewport, and a switcher pill in the toolbar flips to `/vue/`. A yellow banner on each editor route notes that this is a preview build of a community fork and links the fork repository.

## Parity gates (T28-01, issue #84)

The same `/react/` + `/vue/` routes are exercised by three gates, all
running on every PR (`.github/workflows/parity.yml`):

| Gate               | Command                                                           | What turns it red                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-adapter E2E  | `bun run test:e2e:parity`                                         | Any `e2e/tests/parity/` spec failing on either adapter; per-adapter failure screenshots (`<adapter>-failure.png`) upload as CI artifacts             |
| Render equivalence | `e2e/tests/parity/screenshot-parity.spec.ts` (in the suite above) | First-page pixel diff over 2% between adapters (coarse v1 threshold; known gaps tracked for #85)                                                     |
| Snapshot parity    | `bun run check:snapshot-parity`                                   | Round-trip digest drift vs `fixtures/snapshot-digests.json`; regen with `bun run snapshot:update`                                                    |
| Bundle-size parity | `bun run check:parity-bundle-size`                                | Gzip gap over 25% with the larger side grown vs `scripts/parity/bundle-size.baseline.json`; re-baseline with `bun run parity-bundle-baseline:update` |
| Matrix freshness   | `bun run check:parity-matrix`                                     | Component surface changed without a matrix update under `openspec/changes/vue-editor-robust-implementation/`                                         |

Shared inputs live in `examples/parity/fixtures/` (`snapshot-corpus.json`
corpus + committed digests; see its README). The binary `.docx` corpus
stays in the repo-root `e2e/fixtures/` directory shared by all suites.

## Pair-edit dev mode (T28-03, issue #86)

`bun run dev:parity:watch`, edit a Vue component, see the smoke parity
tests re-run on save. The watcher boots the React (`:5173`) and Vue
(`:5174`) demos once, runs `e2e/tests/parity/smoke/` immediately, then
watches `packages/*/src` + the demo sources and re-runs smoke (debounced
1.5s, serialised — a save mid-run queues one more run). Playwright reuses
the already-running demos instead of booting its own.

No new dependencies: the watcher is `scripts/dev-parity-watch.mjs`
(node `child_process` + `fs.watch`). Plain two-server dev without the
test loop is `bun run dev:parity`.
