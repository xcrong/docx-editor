---
'@xcrong/docx-editor-core': patch
---

OOXML round-trip fidelity audit (T29): confirm footer PAGE/NUMPAGES complex fields, duplicate `id="0"` images keyed by `r:embed`, and settings `w:view` all survive parse → serialize → repack, locked in by E2E coverage.
