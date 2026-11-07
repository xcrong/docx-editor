/**
 * §2 段落与列表 (T25-02, #53).
 *
 * Covers: four alignments / indent + hanging / line spacing / paragraph
 * borders + shading / tab stops with dot leaders / Heading 1-3 / ordered
 * and unordered lists across ilvl 0-2. List numbering definitions are
 * exported for `sections/index.ts` to merge into `doc.package.numbering`.
 */
import type {
  BlockContent,
  NumberingDefinitions,
} from '../../../packages/core/src/types/document.ts';
import { para, h1, h2, run, tabRun } from '../builders.ts';

export const numbering: NumberingDefinitions = {
  abstractNums: [
    {
      abstractNumId: 0,
      multiLevelType: 'hybridMultilevel',
      name: 'showcase-bullets',
      levels: [
        {
          ilvl: 0,
          start: 1,
          numFmt: 'bullet',
          lvlText: '•',
          suffix: 'tab',
          pPr: { indentLeft: 720, indentFirstLine: 360, hangingIndent: true },
        },
        {
          ilvl: 1,
          start: 1,
          numFmt: 'bullet',
          lvlText: '○',
          suffix: 'tab',
          pPr: { indentLeft: 1440, indentFirstLine: 360, hangingIndent: true },
        },
        {
          ilvl: 2,
          start: 1,
          numFmt: 'bullet',
          lvlText: '■',
          suffix: 'tab',
          pPr: { indentLeft: 2160, indentFirstLine: 360, hangingIndent: true },
        },
      ],
    },
    {
      abstractNumId: 1,
      multiLevelType: 'hybridMultilevel',
      name: 'showcase-decimal',
      levels: [
        {
          ilvl: 0,
          start: 1,
          numFmt: 'decimal',
          lvlText: '%1.',
          suffix: 'tab',
          pPr: { indentLeft: 720, indentFirstLine: 360, hangingIndent: true },
        },
        {
          ilvl: 1,
          start: 1,
          numFmt: 'decimal',
          lvlText: '%1.%2.',
          suffix: 'tab',
          pPr: { indentLeft: 1440, indentFirstLine: 360, hangingIndent: true },
        },
        {
          ilvl: 2,
          start: 1,
          numFmt: 'decimal',
          lvlText: '%1.%2.%3.',
          suffix: 'tab',
          pPr: { indentLeft: 2160, indentFirstLine: 360, hangingIndent: true },
        },
      ],
    },
  ],
  nums: [
    { numId: 1, abstractNumId: 0 },
    { numId: 2, abstractNumId: 1 },
  ],
};

export function build(): BlockContent[] {
  const borderSide = {
    style: 'single' as const,
    size: 8,
    space: 4,
    color: { rgb: '999999' },
  };
  return [
    h1('§2 段落与列表 Paragraphs & lists'),

    h2('对齐 Alignment'),
    para('左对齐 Left — 默认的段落对齐方式。', { alignment: 'left' }),
    para('居中对齐 Center — 标题与封面常用。', { alignment: 'center' }),
    para('右对齐 Right — 落款与日期常用。', { alignment: 'right' }),
    para('两端对齐 Both — 正文排版常用，段落左右两端都对齐。', { alignment: 'both' }),

    h2('缩进与行距 Indent & spacing'),
    para('首行缩进 First-line indent 360 twips（约 0.25 英寸），段前段后各 120 twips。', {
      indentLeft: 360,
      indentFirstLine: 360,
      spaceBefore: 120,
      spaceAfter: 120,
    }),
    para(
      '悬挂缩进 Hanging indent：左侧缩进 720 twips，悬挂 360 twips，常用于定义列表与参考文献。',
      {
        indentLeft: 720,
        indentFirstLine: 360,
        hangingIndent: true,
      }
    ),
    para(
      '行距 1.5 倍 Line spacing 360 twips, lineRule auto；段后间距 240 twips。连写三行以便观察行距效果：第一行文字内容。第二行文字内容，行距均匀。第三行文字内容，段落收尾。',
      {
        lineSpacing: 360,
        lineSpacingRule: 'auto',
        spaceAfter: 240,
      }
    ),

    h2('边框与底纹 Borders & shading'),
    para(
      '段落边框 + 底纹：四边单线边框（single, size 8），浅灰蓝底纹。本段整体带框，常用于提示块与引用块。',
      {
        borders: {
          top: borderSide,
          left: borderSide,
          bottom: borderSide,
          right: borderSide,
        },
        shading: { pattern: 'clear', fill: { rgb: 'E8EEF7' } },
      }
    ),

    h2('制表位 Tab stops'),
    para([tabRun('目录 Contents'), tabRun('页码 Page'), run('1')], {
      tabs: [
        { position: 1440, alignment: 'left', leader: 'dot' },
        { position: 2880, alignment: 'center', leader: 'dot' },
        { position: 4320, alignment: 'right', leader: 'dot' },
      ],
    }),
    para('上段含三个点前导符制表位（left / center / right，leader dot），可用作简易目录行。'),

    h2('标题样式 Headings'),
    para('一级标题演示 Heading 1 demo', { styleId: 'Heading1' }),
    para('二级标题演示 Heading 2 demo', { styleId: 'Heading2' }),
    para('三级标题演示 Heading 3 demo', { styleId: 'Heading3' }),

    h2('有序列表 Ordered list'),
    para('第一章 顶层有序项 ilvl 0', { numPr: { numId: 2, ilvl: 0 } }),
    para('1.1 第二层有序项 ilvl 1', { numPr: { numId: 2, ilvl: 1 } }),
    para('1.1.1 第三层有序项 ilvl 2', { numPr: { numId: 2, ilvl: 2 } }),
    para('第二章 顶层有序项 ilvl 0（计数继续）', { numPr: { numId: 2, ilvl: 0 } }),

    h2('无序列表 Unordered list'),
    para('顶层无序项 ilvl 0', { numPr: { numId: 1, ilvl: 0 } }),
    para('第二层无序项 ilvl 1', { numPr: { numId: 1, ilvl: 1 } }),
    para('第三层无序项 ilvl 2', { numPr: { numId: 1, ilvl: 2 } }),
    para('回到顶层 ilvl 0', { numPr: { numId: 1, ilvl: 0 } }),
  ];
}
