/**
 * §1 文本与字符格式 (T25-02, #53).
 *
 * Covers: bold / italic / underline / strike / superscript / subscript /
 * highlight / rgb color / theme color / CJK mixed fonts / multi sizes,
 * plus brand hyperlinks and the three preserved tracked-revision groups.
 */
import type { BlockContent } from '../../../packages/core/src/types/document.ts';
import type { Brand } from '../brand.ts';
import { para, h1, h3, run, link, code, del, ins } from '../builders.ts';

const SARA_DATE = '2026-03-04T09:21:00Z';
const THOMAS_DATE = '2026-03-04T11:07:00Z';
const ANON_DATE = '2026-03-04T23:44:00Z';

export function build(brand: Brand): BlockContent[] {
  return [
    h1('§1 文本与字符格式 Text runs'),

    para([
      run(`本节展示字符级格式，由 ${brand.coreName} 渲染。`),
      run('以下 runs 覆盖验收要求的全部字符特征。'),
    ]),
    h3('粗斜与线型 Bold, italic, underline, strike'),
    para([
      run('粗体 Bold', { bold: true }),
      run(' · '),
      run('斜体 Italic', { italic: true }),
      run(' · '),
      run('下划线 Underline', { underline: { style: 'single' } }),
      run(' · '),
      run('双下划线 Double', { underline: { style: 'double' } }),
      run(' · '),
      run('删除线 Strikethrough', { strike: true }),
    ]),

    h3('上下标 Superscript & subscript'),
    para([
      run('质能方程 E = mc'),
      run('2', { vertAlign: 'superscript' }),
      run('；水的化学式 H'),
      run('2', { vertAlign: 'subscript' }),
      run('O；x'),
      run('n', { vertAlign: 'superscript' }),
      run(' + y'),
      run('n', { vertAlign: 'subscript' }),
      run(' 通用上下标。'),
    ]),

    h3('高亮与颜色 Highlight & color'),
    para([
      run('黄色高亮 yellow highlight', { highlight: 'yellow' }),
      run(' · '),
      run('红色文字 red text', { color: { rgb: 'FF0000' } }),
      run(' · '),
      run('主题色 accent1 themed text', { color: { themeColor: 'accent1' } }),
      run(' · '),
      run('青色高亮 cyan on dark', { highlight: 'cyan' }),
    ]),

    h3('中西文混排字体 CJK mixed fonts'),
    para([
      run('中西文混排 Mixed CJK text 混合文本：', {
        fontFamily: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'SimSun' },
      }),
      run('宋体 SimSun 与 Arial 同段共存 coexists in one paragraph.', {
        fontFamily: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'SimSun' },
      }),
    ]),
    para([
      run('主题西文 minorHAnsi + 宋体正文。', {
        fontFamily: { asciiTheme: 'minorHAnsi', eastAsia: 'SimSun' },
      }),
    ]),

    h3('多字号 Multi-size'),
    para([
      run('小 Small 10pt', { fontSize: 20 }),
      run(' · '),
      run('中 Medium 14pt', { fontSize: 28 }),
      run(' · '),
      run('大 Large 20pt', { fontSize: 40, bold: true }),
    ]),

    h3('超链接 Hyperlinks'),
    para([
      run('仓库地址 '),
      link(brand.repoUrl, brand.repoUrl, 'Repository'),
      run('；核心包 '),
      link(brand.coreName, brand.coreNpm, 'npm'),
      run('；文档 '),
      link(brand.docsUrl, brand.docsUrl, 'Docs'),
      run('；演示站 '),
      link(brand.demoSite, brand.demoSite, 'Demo'),
      run('；包名示例 '),
      code(brand.coreName),
    ]),

    h3('修订痕迹（保留） Tracked revisions'),
    para([
      run('部署要求：'),
      del('sara.k', 10, SARA_DATE, 'zero backend required'),
      ins('sara.k', 11, SARA_DATE, 'no backend required'),
      run('。'),
    ]),
    para([
      run('架构说明：'),
      del('thomas.v', 12, THOMAS_DATE, 'docx-js-editor skips the pipeline entirely'),
      ins('thomas.v', 13, THOMAS_DATE, 'This library skips it'),
      run('。'),
    ]),
    para([
      run('硬约束：'),
      del(
        'anon-contributor',
        14,
        ANON_DATE,
        'Do not introduce intermediate HTML serialisation. This is a hard constraint.'
      ),
      ins(
        'anon-contributor',
        15,
        ANON_DATE,
        'Avoid intermediate HTML serialisation where possible.'
      ),
      run('。'),
    ]),
  ];
}
