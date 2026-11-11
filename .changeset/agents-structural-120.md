---
'@xcrong/docx-editor-agents': minor
---

Cover paragraph-level revisions in the agents toolkit (refs #120): `getChanges` now also reports `pPrIns` / `pPrDel` (`paragraphInsertion` / `paragraphDeletion`), `propertyChanges` (`paragraphPropertyChange`), `paraRPrChange` (`paragraphMarkPropertyChange`), and `sectPrChange` (`sectionPropertyChange`, paragraph-level and body-level placements), filterable via `ChangeFilter.type`. `acceptChange` / `rejectChange` / `acceptAll` / `rejectAll` resolve them with the PM-side semantics: accept `pPrIns` clears the marker (split kept), reject joins with the following paragraph (second paragraph's properties win); accept `pPrDel` joins, reject clears; accept clears property/section entries while reject restores their prior snapshots; rejecting a `pPrIns` first rejects the host's `pPrChange` entries. New proposal ids are minted above structural ids so they never collide.
