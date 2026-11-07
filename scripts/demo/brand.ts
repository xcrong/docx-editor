/**
 * Brand derivation for the demo showcase generator (T25-02, #53).
 *
 * Hard rule: no hard-coded brand strings. Every product/repo/docs/npm/demo
 * value is derived from `packages/core/package.json` and
 * `packages/react/package.json` at build time. The generated DOCX must not
 * contain any legacy brand text — `build-sample-docx.ts` asserts that.
 *
 * Only `name`, `version`, `homepage` and `repository.url` are read. The
 * `author` block is deliberately never touched.
 */
import { readFileSync } from 'node:fs';

export interface Brand {
  /** npm scope, e.g. "@xcrong" (from the core package name) */
  scope: string;
  /** repo slug, e.g. "docx-editor" (from repository.url) */
  product: string;
  /** github owner, e.g. "xcrong" */
  owner: string;
  /** canonical repo URL without .git suffix */
  repoUrl: string;
  /** docs landing, derived from repoUrl */
  docsUrl: string;
  /** npm package names */
  coreName: string;
  reactName: string;
  /** versions */
  coreVersion: string;
  reactVersion: string;
  /** npm registry links */
  coreNpm: string;
  reactNpm: string;
  /** demo site, derived as owner Pages from repoUrl */
  demoSite: string;
  /** document title / tagline / core.xml identity */
  title: string;
  tagline: string;
  creator: string;
  appName: string;
}

interface Pkg {
  name: string;
  version: string;
  homepage?: string;
  repository?: { url?: string };
}

export function loadBrand(): Brand {
  const base = new URL('../../', import.meta.url);
  const corePkg = JSON.parse(
    readFileSync(new URL('packages/core/package.json', base), 'utf8')
  ) as Pkg;
  const reactPkg = JSON.parse(
    readFileSync(new URL('packages/react/package.json', base), 'utf8')
  ) as Pkg;

  const coreName = corePkg.name;
  const reactName = reactPkg.name;
  const scope = coreName.split('/')[0];
  const repoUrl = String(corePkg.repository?.url ?? corePkg.homepage ?? '').replace(/\.git$/, '');
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(repoUrl);
  if (!m) throw new Error(`brand: cannot parse owner/repo from ${repoUrl}`);
  const [, owner, product] = m;

  const docsUrl = `${repoUrl}/tree/main/docs`;
  const demoSite = `https://${owner}.github.io/${product}`;
  const title = `${product} showcase`;
  const tagline = `Rendered and edited with ${coreName} v${corePkg.version} and ${reactName} v${reactPkg.version}. Source: ${repoUrl}. Docs: ${docsUrl}.`;

  return {
    scope,
    product,
    owner,
    repoUrl,
    docsUrl,
    coreName,
    reactName,
    coreVersion: corePkg.version,
    reactVersion: reactPkg.version,
    coreNpm: `https://www.npmjs.com/package/${coreName}`,
    reactNpm: `https://www.npmjs.com/package/${reactName}`,
    demoSite,
    title,
    tagline,
    creator: `${scope} ${product}`,
    appName: `${scope} ${product}`,
  };
}
