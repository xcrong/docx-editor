/**
 * §4 图片 (T25-04, #55).
 *
 * Covers: `wp:inline` small figure + caption / `wp:anchor` + `wrapSquare`
 * right float with wrapping text / `wp:anchor` + `wrapTopAndBottom` full-bleed
 * banner. Artwork is self-generated geometry in `../assets/fig-*.png`
 * (no third-party bytes); the rezip pass writes each data URL to
 * `word/media/` and binds `r:embed` on save.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BlockContent } from '../../../packages/core/src/types/document.ts';
import type { Brand } from '../brand.ts';
import { h1, h3, para, run, inlinePic, anchoredPic, EMU_PER_INCH } from '../builders.ts';

/** Load a demo asset as a PNG data URL (rezip registers it as media on save). */
function asset(name: string): string {
  const buf = readFileSync(join(import.meta.dir, '..', 'assets', name));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const IN = EMU_PER_INCH;

export function build(brand: Brand): BlockContent[] {
  const inlineSrc = asset('fig-inline.png');
  const squareSrc = asset('fig-square.png');
  const bannerSrc = asset('fig-banner.png');

  return [
    h1('§4 图片 Images'),

    para([
      run(`本节展示三种图片版式，由 ${brand.coreName} 渲染：行内小图、`),
      run('右浮环绕', { bold: true }),
      run('与通栏上下型。插图均为自生成几何图，无外部版权。'),
    ]),

    h3('行内小图 Inline + 图注'),
    para([
      run('行内图随文字流动：'),
      inlinePic(
        inlineSrc,
        Math.round(1.5 * IN),
        Math.round(1.125 * IN),
        '行内几何示意图',
        'fig-inline.png'
      ),
      run('前后文字与图片基线对齐，段落高度随图撑开。'),
    ]),
    para(
      [
        run('图 4-1 行内几何示意（斜纹底 + 同心圆）', {
          fontSize: 18,
          italic: true,
          color: { rgb: '666666' },
        }),
      ],
      {
        alignment: 'center',
      }
    ),

    h3('右浮环绕 Wrap square'),
    para([
      anchoredPic(
        squareSrc,
        2 * IN,
        Math.round(1.5 * IN),
        {
          type: 'square',
          wrapText: 'bothSides',
          distT: 114300,
          distB: 114300,
          distL: 114300,
          distR: 114300,
        },
        {
          horizontal: { relativeTo: 'margin', alignment: 'right' },
          vertical: { relativeTo: 'paragraph', alignment: 'top' },
        },
        '右侧环绕几何图',
        'fig-square.png'
      ),
      run('右侧浮动图采用 wrapSquare 环绕，正文从左侧与下方自然绕排。'),
      run(
        '环绕间距 dist 为 0.125 英寸，避免文字贴边。' +
          '本段文字足够长，可以完整包住图片左侧与底部，演示 bothSides 双侧绕排效果：' +
          '文字先填满图片左侧空白，再从图片下方续排，段落整体保持对齐。' +
          '网格底纹上的橙色矩块与深蓝圆点随文字滚动保持相对位置。'
      ),
    ]),

    h3('通栏上下型 Wrap topAndBottom'),
    para([run('下方通栏横幅采用 wrapTopAndBottom：独占整行，文字只出现在上方与下方。')]),
    para([
      anchoredPic(
        bannerSrc,
        6 * IN,
        2 * IN,
        { type: 'topAndBottom' },
        {
          horizontal: { relativeTo: 'column', alignment: 'center' },
          vertical: { relativeTo: 'paragraph', alignment: 'top' },
        },
        '通栏几何横幅',
        'fig-banner.png'
      ),
    ]),
    para([
      run('横幅宽度 6 英寸，小于正文栏宽，不会溢出页边。'),
      run('其后的正文从横幅下方另起一段续排，上下间距分明。'),
    ]),
  ];
}
