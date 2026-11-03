---
'@xcrong/docx-editor-core': patch
---

Floating image layout fidelity (T14): carry OOXML wrapText through to the layout engine and unify exclusion zones on the shared helper so square/tight/through wrap on the correct side, centered both-sides splits into two segments, largest keeps a single side, and near-full-width floats clamp instead of collapsing lines; table cells reuse the same helper and clamp floats inside the cell. Fixes #22
