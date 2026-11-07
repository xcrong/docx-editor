/**
 * §8 支持情况表 (T25-08, #59).
 *
 * The capability table is GENERATED from `docs/site/data/word-features.ts`
 * (`wordFeatures` + `FEATURE_CATEGORY_LABELS`) — never hand-write rows here.
 * Grouped by category (one sub-table per category, so a category break starts
 * a new block), columns 特性 / 编辑 / 渲染 / 往返, statuses rendered with the
 * readable copy in STATUS_LABEL. Header shading + zebra striping mirror §3.
 */
import type { BlockContent } from '../../../packages/core/src/types/document.ts';
import type { Brand } from '../brand.ts';
import {
  FEATURE_CATEGORY_LABELS,
  wordFeatures,
  type FeatureCategory,
  type FeatureStatus,
} from '../../../docs/site/data/word-features.ts';
import { h1, h2, para, run, tbl, row, cell, gridBorders } from '../builders.ts';

/** Readable copy for the six matrix statuses (bilingual — matches doc style). */
export const STATUS_LABEL: Record<FeatureStatus, string> = {
  full: '完全支持 Full',
  partial: '部分支持 Partial',
  'render-only': '仅渲染 Render-only',
  preserved: '保留往返 Preserved',
  planned: '规划中 Planned',
  none: '不支持 None',
};

const HEADER_FILL = '2E74B5';
const ZEBRA_FILL = 'DCE6F2';
/** 特性 wide, three status columns narrow (sums to 9000 twips ≤ portrait text width). */
const COLUMN_WIDTHS = [4800, 1400, 1400, 1400];

function headerCell(text: string) {
  return cell([para([run(text, { bold: true, color: { rgb: 'FFFFFF' } })])], {
    shading: { pattern: 'clear', fill: { rgb: HEADER_FILL } },
  });
}

function nameCell(name: string, id: string, zebra: boolean) {
  return cell(
    [para([run(name), run(` · ${id}`, { color: { rgb: '595959' } })])],
    zebra ? { shading: { pattern: 'clear', fill: { rgb: ZEBRA_FILL } } } : undefined
  );
}

function statusCell(status: FeatureStatus, zebra: boolean) {
  return cell(
    [para(STATUS_LABEL[status])],
    zebra ? { shading: { pattern: 'clear', fill: { rgb: ZEBRA_FILL } } } : undefined
  );
}

const CATEGORY_ORDER = Object.keys(FEATURE_CATEGORY_LABELS) as FeatureCategory[];

export function build(_brand: Brand): BlockContent[] {
  const blocks: BlockContent[] = [
    h1('§8 支持情况表 Capability matrix'),
    para(
      `下表由 docs/site/data/word-features.ts 的 wordFeatures 矩阵（共 ${wordFeatures.length} 条）` +
        '生成，与网站 Word 保真页同源：改矩阵即改此表，无需手工同步。' +
        '状态分三轴——编辑（能否在编辑器中修改）、渲染（是否如 Word 显示）、往返（打开再保存是否无损）。'
    ),
  ];

  for (const category of CATEGORY_ORDER) {
    const features = wordFeatures.filter((f) => f.category === category);
    if (features.length === 0) continue;
    blocks.push(h2(`${FEATURE_CATEGORY_LABELS[category]}（${features.length}）`));
    blocks.push(
      tbl(
        [
          row(
            [
              headerCell('特性 Feature'),
              headerCell('编辑 Edit'),
              headerCell('渲染 Render'),
              headerCell('往返 Round-trip'),
            ],
            { header: true }
          ),
          ...features.map((f, i) => {
            const zebra = i % 2 === 1;
            return row([
              nameCell(f.name, f.id, zebra),
              statusCell(f.editing, zebra),
              statusCell(f.rendering, zebra),
              statusCell(f.roundTrip, zebra),
            ]);
          }),
        ],
        COLUMN_WIDTHS,
        { styleId: 'TableGrid', justification: 'center', borders: gridBorders() }
      )
    );
  }

  return blocks;
}
