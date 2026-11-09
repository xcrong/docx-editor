---
'@xcrong/docx-editor-vue': minor
'@xcrong/docx-editor-core': patch
---

T28-02 (#85): converge Vue parity gaps core-first. The header/footer selection and caret overlay now resolves against the engaged (double-clicked) painted instance instead of guessing by viewport proximity, so editing a footer on a later page highlights that page's copy (previously painted page 1's, off-screen). `DocxEditorEngine.save()` no longer dispatches post-save tracker cleanup onto a view destroyed or superseded by a document load that landed mid-save (previously threw `null.matchesNode` inside prosemirror-view).
