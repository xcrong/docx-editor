# PR description draft — `vue-editor-robust-implementation` → `1.0.0-release`

Handover for tasks 14.1 / 14.6 / 13.9. Human: fill the two `FILL:` slots, paste
into the PR body, open the PR.

---

## Title (FILL: keep short, conventional-commit)

```
feat(vue): harden Vue adapter + agent SDK subpath to parity (refs #439)
```

## Body draft

```markdown
Vue editor hardening to the §13a un-stub gate (editor rows only; agent rows
stay partial behind #368 per Decision 15).

What changed (per-adapter, core untouched unless noted):

- <one line per merged hardening commit — generate with
  `git log --oneline 1.0.0-release..HEAD` at PR time and compress>

Evidence:

- `bun run typecheck` green
- `bun run check:parity && bun run i18n:validate && bun run check:feature-parity` green
- `bun run test:e2e:parity --timeout=30000 --workers=4` — 49/49 (see #100)
- `e2e/tests/parity/screenshot-parity.spec.ts` cross-adapter pixelmatch green
  (relative diff, 3% coarse threshold; committed per-feature PNGs deliberately
  not used — macOS/Linux font rasterization, see spec header; tighten toward
  0.1% as #85 converges)
- `bun run parity:perf` green (artifacts under `test-results/perf/`, ignored;
  set `PERF_WRITE_ARTIFACTS=1` for committed evidence under `notes/perf/`)
- Preview screenshots (React vs Vue, standard fixture set) attached below
- Manual passes: §11.2 browsers (Chromium/Firefox/Safari × desktop/tablet),
  §11.3 keyboard-only — results in tasks.md handover records

Un-stub: drops `[STUB]` from `packages/vue/package.json` per §13.2–13.6
(changeset included). Agent SDK Vue subpath stays partial — no marker to
remove (§13.8 verified clean), deferral decision recorded in §13.9.

Fixes #439 (editor gate only). Follow-ups stay open: #367 (plugin contract),
#368 (agent SDK parity).

FILL: Co-Authored-By trailers — one per #245-derived commit:
`git log --author=Cruiser13 --format='%H %s' 1.0.0-release..HEAD`
then resolve each author's display email (do NOT guess — look up the GitHub
profile / commit header). Append:
`Co-Authored-By: NAME <EMAIL>`
FILL: un-stub changeset MUST credit the community foundation contribution
explicitly (see §14.1).
```

## PR-time checklist (for 14.2–14.4)

1. `bun run lint && bun run typecheck` (lint gates build per §4.3)
2. `bun run test:e2e:parity:smoke` against `bun run dev:parity`
   (both demos :5173/:5174, target <30s wall-clock)
3. Claude `/review` + codex review on the PR diff; paste findings into
   `notes/` only if they touch Vue reactivity/isolation (Decision 22)
4. `/simplify` pass on changed adapter code (core changes need React/Vue
   mirror check per CLAUDE.md parity rule before simplify)
5. Attach: preview-deployment React-vs-Vue screenshots (§11.1 set),
   `PERF_WRITE_ARTIFACTS=1 bun run parity:perf` output, browser/keyboard
   pass results (§11.2/11.3)

## §13.9 decision text (paste into PR or #368 — human picks option A or B)

> **Agent SDK Vue subpath ship decision.** 8 rows `partial`, 6 rows `missing`
> (tracked-change flow, comment threading, tool error UI, multi-step run,
> streaming tokens, byte-equal tool output); no `[BETA]`/`[STUB]` marker ships
> in metadata (§13.8 verified clean).
>
> - **Option A — ship partial in 1.0:** document in the 1.0 changeset that
>   `@xcrong/docx-editor-agents/vue` covers panel/log/composer/chip/timeline
>   shell + `useAgentBridge`, with the 6 behavioral flows deferred to 1.x
>   behind #368. Matrix rows stay `partial`/`missing`.
> - **Option B — defer to 1.1:** flip the 14 agent rows to `omitted-v1` with
>   reason "ships in 1.1, tracked by #368", add a changeset documenting the
>   deferral, keep the rows enumerated (do NOT collapse per matrix lifecycle
>   until stably done).
>
> Recommendation: B — the fixed group versions all packages together, so a
> partial agent surface in a 1.0 would read as a 1.0 commitment. Either way,
> #368 stays the tracking issue.

```

## §14.6 release-train note

When the `1.0.0-release` train ships to `main`, Vue + `agents/vue` ride along
at 1.0.0 with the fixed group — no version action needed in this change.
Pre-publish gate (`bun run parity:prepublish` in `release.yml`) re-verifies
typecheck + static parity + i18n + packed consumer install + smoke E2E; if it
red-blocks the release, re-run locally and fix the first failing layer.
```
