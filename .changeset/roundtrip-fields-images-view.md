---
'@xcrong/docx-editor-core': patch
---

Fix OOXML roundtrip fidelity for field codes, image IDs, and w:view: footer PAGE/NUMPAGES complex fields keep their fldChar/instrText structure (unedited footers pass through byte-identical; edited footers re-serialize the field structure through parse/PM/repack); duplicate wp:docPr/pic:cNvPr IDs (e.g. template-engine id="0") are normalized to unique positive integers while r:embed relationship IDs (including non-standard formats like img2073076884) are preserved instead of rewritten on save; selective save now bails to full repack when a pasted image's placeholder rId isn't registered yet instead of writing a dangling r:embed; settings.xml w:view is parsed into the document model and written back on export.
