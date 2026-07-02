---
'@xcrong/docx-editor-core': patch
'@xcrong/docx-editor-react': patch
'@xcrong/docx-editor-vue': patch
'@xcrong/docx-editor-agents': patch
'@xcrong/docx-editor-i18n': patch
'@xcrong/nuxt-docx-editor': patch
---

Maintenance release. No public API changes.

- Switch npm publishing from an `NPM_TOKEN` secret to **npm Trusted Publishing (OIDC)** — no long-lived token, packages are signed with provenance from GitHub Actions.
- Add a `NOTICE` file crediting the upstream project (EigenPal Inc.) and documenting the fork; README links to it from a new License & Attribution section.
