---
'@xcrong/docx-editor-core': minor
---

Phase 1 closeout for tracked structural changes (paragraph-mark revisions, fixes #80): per-marker OOXML fixtures with a canonical-XML equivalence helper and full parse → serialize round-trip coverage (`pPrIns`, `pPrDel`, `pPrChange`, `paraRPrChange`, pPr-level and body-level `sectPrChange`), multi-author conversion and accept/reject grouping tests, measure-cache invalidation tests for every revision flag, and Playwright coverage for cross-page splits, table-cell paragraph revisions through save → reload, undo/redo of tracked splits, and Vue adapter parity (produce/accept/reject paragraph-mark revisions). The guides/tracked-changes page now documents `acceptChangesInRange` / `rejectChangesInRange` and the distinct-triple count returns. Model-level agents accept/reject of paragraph-level revisions stays deferred to #120; the agents propose path is pinned crash-free and marker-preserving.
