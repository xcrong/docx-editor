/**
 * Section auto-registration (T25-02, #53 — hard requirement).
 *
 * Scans this directory for `*.ts` files (excluding `index.ts`), sorted by
 * file name, and dynamically imports each. Content units (#55–#58) only add
 * new `NN-name.ts` files, so parallel sections never conflict here.
 *
 * Contract per section module:
 * - `export function build(brand: Brand): BlockContent[]`
 * - optionally `export const numbering: NumberingDefinitions` (merged)
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  BlockContent,
  NumberingDefinitions,
} from '../../../packages/core/src/types/document.ts';
import type { Brand } from '../brand.ts';

interface SectionModule {
  build?: (brand: Brand) => BlockContent[];
  numbering?: NumberingDefinitions;
}

export async function collectSections(brand: Brand): Promise<{
  blocks: BlockContent[];
  numbering: NumberingDefinitions | undefined;
}> {
  const dir = import.meta.dir;
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts') && f !== 'index.ts').sort();
  const blocks: BlockContent[] = [];
  const abstractNums: NumberingDefinitions['abstractNums'] = [];
  const nums: NumberingDefinitions['nums'] = [];
  for (const file of files) {
    // Exception: module specifier is runtime-selected (directory scan is the
    // #53 hard requirement — static imports would reintroduce merge conflicts).
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as SectionModule;
    if (typeof mod.build === 'function') blocks.push(...mod.build(brand));
    if (mod.numbering) {
      abstractNums.push(...mod.numbering.abstractNums);
      nums.push(...mod.numbering.nums);
    }
  }
  return {
    blocks,
    numbering: abstractNums.length > 0 || nums.length > 0 ? { abstractNums, nums } : undefined,
  };
}
