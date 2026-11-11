---
'@xcrong/docx-editor-core': major
---

Paragraph-level tracked-change review (T27-03, fixes #79): `acceptChangeById` / `rejectChangeById` now resolve paragraph-mark property changes (`paraRPrChange`, restoring the pilcrow formatting on reject) and pPr-level section changes (`sectPrChange`, restoring prior section properties on reject) in the same single transaction, with cross-revision ordering (rejecting a `pPrIns` first rejects the host's `pPrChange`) and edge-case diagnostics. New `acceptChangesInRange` / `rejectChangesInRange` resolve every revision in a PM range. BREAKING: `acceptAllChanges` / `rejectAllChanges` now return the count of distinct `(id, author, date)` triples instead of a boolean (truthiness is preserved: 0 when empty, >=1 when applied — only the static type changes). The painter marks revised pilcrows with `ep-revision-pilcrow` plus the revision triple and paints a margin change bar for property-change paragraphs; no new dataset names were added.
