---
'@xcrong/docx-editor-core': minor
---

Run-level property revisions (`w:rPrChange`) are now fully tracked: formatting in suggesting mode authors an inline `revision_change` mark, shown in the page with a subtle cue and in the sidebar as "Bold added" / "Font changed from X to Y", with per-session accept/reject (reject restores the prior run properties). Round-trips through DOCX, stacked sessions preserved. Fixes #83.
