/**
 * §3 表格 (T25-02, #53).
 *
 * Covers: header shading + zebra striping / gridSpan horizontal merge /
 * vMerge vertical merge / nested table / long cross-page table with
 * tblHeader repeat.
 */
import type { BlockContent } from '../../../packages/core/src/types/document.ts';
import { h1, h2, para, run, tbl, row, cell } from '../builders.ts';
import { gridBorders } from '../builders.ts';

const HEADER_FILL = '2E74B5';
const ZEBRA_FILL = 'DCE6F2';
const BORDERS = { borders: gridBorders() };

function headerCell(text: string) {
  return cell([para([run(text, { bold: true, color: { rgb: 'FFFFFF' } })])], {
    shading: { pattern: 'clear', fill: { rgb: HEADER_FILL } },
  });
}

function bodyCell(text: string, zebra: boolean) {
  return cell(
    [para(text)],
    zebra ? { shading: { pattern: 'clear', fill: { rgb: ZEBRA_FILL } } } : undefined
  );
}

export function build(): BlockContent[] {
  const nested = tbl(
    [
      row([cell([para('嵌套 A1')]), cell([para('嵌套 B1')])]),
      row([cell([para('嵌套 A2')]), cell([para('嵌套 B2')])]),
    ],
    [1800, 1800],
    { styleId: 'TableGrid', ...BORDERS }
  );

  const feature = tbl(
    [
      row(
        [
          headerCell('功能 Feature'),
          headerCell('状态 Status'),
          headerCell('备注 Note'),
          headerCell('合并 Merge'),
        ],
        { header: true }
      ),
      row([
        cell([para('横向合并 gridSpan = 2 的起始格')], { gridSpan: 2 }),
        cell([para('普通格')]),
        cell([para('纵向合并起始 vMerge restart')], { vMerge: 'restart' }),
      ]),
      row([
        cell([para('被合并格（上行跨列延续）')]),
        cell([para('被合并格延续')]),
        cell([para('普通格 C3')]),
        cell([para('纵向合并延续 vMerge continue')], { vMerge: 'continue' }),
      ]),
      row([
        bodyCell('斑马纹行 zebra', true),
        cell([para('本格内嵌套一张 2×2 子表：'), nested]),
        bodyCell('斑马纹行 zebra', true),
        bodyCell('斑马纹行 zebra', true),
      ]),
    ],
    [2400, 2400, 2400, 2400],
    { styleId: 'TableGrid', justification: 'center', ...BORDERS }
  );

  const longRows = [
    row([headerCell('序号 No.'), headerCell('项目 Item'), headerCell('说明 Desc')], {
      header: true,
    }),
  ];
  for (let i = 1; i <= 14; i += 1) {
    const zebra = i % 2 === 0;
    longRows.push(
      row([
        bodyCell(`R${i}`, zebra),
        bodyCell(`长表第 ${i} 行 long row ${i}`, zebra),
        bodyCell(`跨页重复表头 tblHeader row ${i}`, zebra),
      ])
    );
  }
  const long = tbl(longRows, [1600, 3400, 3400], {
    styleId: 'TableGrid',
    ...BORDERS,
  });

  return [
    h1('§3 表格 Tables'),

    h2('特性表 Feature grid'),
    para('表头底纹 + 斑马纹 + 横向合并 gridSpan + 纵向合并 vMerge + 嵌套表，见下表。'),
    feature,

    h2('跨页长表 Long table'),
    para('表头行设置 tblHeader，跨页时在每页顶部重复；共 14 个数据行。'),
    long,
  ];
}
