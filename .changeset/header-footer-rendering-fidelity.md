---
'@xcrong/docx-editor-core': patch
---

Header/footer fidelity (T13): NUMPAGES/PAGE fields refresh when the page count changes on virtualized documents, anchored header images no longer inflate the header band or overlap body text, positioned inline runs stay in-flow in painter and measurement, and the Vue adapter passes titlePg/distances/pageBorders so first-page headers match React. Fixes #21
