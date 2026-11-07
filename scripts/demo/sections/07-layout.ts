/**
 * §7 版式与域 (T25-07, #58).
 *
 * Covers: header (document title + bottom border, merged into the §5
 * watermark header part) / footer (`PAGE` / `NUMPAGES` fields + brand domain
 * from `brand.ts`) / two sections (portrait + `w:orient="landscape"`, each
 * with its own `w:sectPr`) / one section with `w:cols w:num="2"` and explicit
 * `w:col` widths / ≥2 footnotes with meaningful non-empty bodies / ≥1 endnote
 * / TOC field (`TOC \o "1-3" \h`, dot-leader tabs + `PAGEREF`) / ≥3 bookmarks
 * with one targeted by an internal hyperlink.
 *
 * Feature ids: `layout.headers-footers`, `layout.footnotes`,
 * `layout.sections`, `layout.columns`, `fields.page-numbers`, `fields.toc`,
 * `fields.bookmarks`.
 *
 * Pagination safety: the two inline `w:sectPr` paragraphs sit at the END of
 * this section's own content, and section A reuses the exact portrait
 * geometry the document had before (Letter 12240×15840, 1-inch margins), so
 * §§1–6 keep their page breaks. No trailing page break is added — nothing
 * follows this section, so there is nothing to insulate.
 *
 * Document-level wiring (header/footer parts, footnote/endnote parts, final
 * `w:sectPr`) is applied separately — see {@link applyLayoutExtras}. The
 * merge step chains it after `applyStructureExtras` (one line in
 * `build-sample-docx.ts`):
 *
 * ```ts
 * import { applyLayoutExtras } from './sections/07-layout.ts';
 * const fresh = await createDocx(applyLayoutExtras(applyStructureExtras(doc), brand));
 * ```
 */
import type {
  BlockContent,
  BookmarkEnd,
  BookmarkStart,
  ComplexField,
  Document,
  Endnote,
  Footnote,
  HeaderFooter,
  Hyperlink,
  Paragraph,
  Relationship,
  Run,
  SectionProperties,
  SimpleField,
} from '../../../packages/core/src/types/document.ts';
import { RELATIONSHIP_TYPES } from '../../../packages/core/src/docx/relsParser.ts';
import type { Brand } from '../brand.ts';
import { h1, h2, para, run } from '../builders.ts';

/** Default header part (owned by §5's watermark) — §7 prepends the title. */
const HEADER_RID = 'rIdS5WatermarkHeader';
/** §7 footer part (`word/footer1.xml`). Non-numeric to dodge the rezip `rIdN` range. */
const FOOTER_RID = 'rIdS7Footer';

/** Bookmark ids — clear of the SDT id range (21–26) used by §5. */
const BM_TOP = 31;
const BM_LANDSCAPE = 32;
const BM_ENDNOTES = 33;

const TOC_INSTRUCTION = 'TOC \\o "1-3" \\h';

/** Shared portrait geometry (Letter, 1-inch margins — mirrors the template default). */
const PORTRAIT_BASE = {
  pageWidth: 12240,
  pageHeight: 15840,
  marginTop: 1440,
  marginBottom: 1440,
  marginLeft: 1440,
  marginRight: 1440,
  headerDistance: 720,
  footerDistance: 720,
  gutter: 0,
  verticalAlign: 'top' as const,
} satisfies Partial<SectionProperties>;

function headerRefs(): SectionProperties['headerReferences'] {
  return [{ type: 'default', rId: HEADER_RID }];
}

function footerRefs(): SectionProperties['footerReferences'] {
  return [{ type: 'default', rId: FOOTER_RID }];
}

/** Section A: portrait, single column — geometry identical to the pre-§7 final. */
function portraitProps(): SectionProperties {
  return {
    ...PORTRAIT_BASE,
    columnCount: 1,
    columnSpace: 720,
    equalWidth: true,
    sectionStart: 'nextPage',
    headerReferences: headerRefs(),
    footerReferences: footerRefs(),
  };
}

/** Section B: landscape Letter, two explicit columns (6120×2 + 720 = 12960 = 15840−2880). */
function landscapeTwoColProps(): SectionProperties {
  return {
    pageWidth: 15840,
    pageHeight: 12240,
    orientation: 'landscape',
    marginTop: 1440,
    marginBottom: 1440,
    marginLeft: 1440,
    marginRight: 1440,
    headerDistance: 720,
    footerDistance: 720,
    gutter: 0,
    verticalAlign: 'top',
    columnCount: 2,
    columnSpace: 720,
    columns: [{ width: 6120, space: 720 }, { width: 6120 }],
    sectionStart: 'nextPage',
    headerReferences: headerRefs(),
    footerReferences: footerRefs(),
  };
}

function bmStart(id: number, name: string): BookmarkStart {
  return { type: 'bookmarkStart', id, name };
}

function bmEnd(id: number): BookmarkEnd {
  return { type: 'bookmarkEnd', id };
}

/** Internal navigation link (`w:hyperlink w:anchor` — no rels entry needed). */
function anchorLink(text: string, anchor: string): Hyperlink {
  return {
    type: 'hyperlink',
    anchor,
    tooltip: `跳到 ${anchor}`,
    children: [
      run(text, {
        color: { rgb: '0563C1' },
        underline: { style: 'single', color: { rgb: '0563C1' } },
      }),
    ],
  };
}

function tabRun(): Run {
  return { type: 'run', content: [{ type: 'tab' }] };
}

function footnoteRef(id: number): Run {
  return {
    type: 'run',
    formatting: { vertAlign: 'superscript' },
    content: [{ type: 'footnoteRef', id }],
  };
}

function endnoteRef(id: number): Run {
  return {
    type: 'run',
    formatting: { vertAlign: 'superscript' },
    content: [{ type: 'endnoteRef', id }],
  };
}

function tocField(): ComplexField {
  return {
    type: 'complexField',
    instruction: TOC_INSTRUCTION,
    fieldType: 'TOC',
    fieldCode: [{ type: 'run', content: [{ type: 'instrText', text: TOC_INSTRUCTION }] }],
    fieldResult: [run('本目录由 TOC 域生成：条目页码为 PAGEREF 域，更新域即可刷新。')],
  };
}

function pageRef(anchor: string): ComplexField {
  const instruction = `PAGEREF ${anchor} \\h`;
  return {
    type: 'complexField',
    instruction,
    fieldType: 'PAGEREF',
    fieldCode: [{ type: 'run', content: [{ type: 'instrText', text: instruction }] }],
    fieldResult: [run('–')],
  };
}

function pageField(): SimpleField {
  return { type: 'simpleField', instruction: 'PAGE', fieldType: 'PAGE', content: [run('1')] };
}

function numPagesField(): SimpleField {
  return {
    type: 'simpleField',
    instruction: 'NUMPAGES',
    fieldType: 'NUMPAGES',
    content: [run('1')],
  };
}

/** One TOC entry: internal link + dot-leader tab + PAGEREF field. */
function tocEntry(text: string, anchor: string): Paragraph {
  return para([anchorLink(text, anchor), tabRun(), pageRef(anchor)], {
    tabs: [{ position: 9360, alignment: 'right', leader: 'dot' }],
  });
}

/** Visible section-break caption carrying the inline `w:sectPr`. */
function sectBreakPara(caption: string, props: SectionProperties): Paragraph {
  return {
    ...para([run(caption, { italic: true, color: { rgb: '595959' } })], {
      alignment: 'center',
    }),
    sectionProperties: props,
  };
}

/** Header title line (prepended to the §5 watermark header part). */
function headerTitlePara(brand: Brand): Paragraph {
  return para([run(brand.title, { bold: true, fontSize: 26, color: { rgb: '1F4E79' } })], {
    alignment: 'center',
    borders: {
      bottom: { style: 'single', size: 6, space: 1, color: { rgb: '1F4E79' } },
    },
    spaceAfter: 120,
  });
}

function footerPara(brand: Brand): Paragraph {
  return para(
    [run('第 '), pageField(), run(' 页 / 共 '), numPagesField(), run(` 页 · ${brand.demoSite}`)],
    { alignment: 'center' }
  );
}

function footnoteMarkRun(): Run {
  return { type: 'run', content: [{ type: 'footnoteRefMark' }] };
}

function endnoteMarkRun(): Run {
  return { type: 'run', content: [{ type: 'endnoteRefMark' }] };
}

export function build(brand: Brand): BlockContent[] {
  return [
    {
      ...h1('§7 版式与域 Layout & fields'),
      content: [bmStart(BM_TOP, '_Toc7001'), run('§7 版式与域 Layout & fields'), bmEnd(BM_TOP)],
    } as Paragraph,

    para([
      run(
        '本节演示版式与域：统一页眉页脚（标题 + 下边框；页脚含 PAGE / NUMPAGES 域与本站域名）、' +
          '双节（纵向 + 横向）与双栏、脚注 / 尾注、TOC 目录域、书签与内部超链接。' +
          '本节是四个并行单元中最影响全局分页的一个：新增的两处 w:sectPr 只约束本节之后的内容，§§1–6 的版心几何保持不变。' +
          '页眉把标题与 §5 的水印合并为同一个默认部件，'
      ),
      footnoteRef(2),
      run('。'),
    ]),

    h2('目录 Table of contents（TOC 域）'),
    para(
      '下面的目录由 TOC 域生成（指令 TOC \\o "1-3" \\h）：条目用右对齐制表位 + 点状前导符连接页码，' +
        '页码本身是 PAGEREF 域；三个条目分别跳到本节的三个书签（_Toc7001–_Toc7003）。'
    ),
    para([tocField()]),
    tocEntry('§7 版式与域 Layout & fields', '_Toc7001'),
    tocEntry('横向双栏 Landscape + two columns', '_Toc7002'),
    tocEntry('尾注与书签 Endnotes & bookmarks', '_Toc7003'),

    h2('页眉与页脚 Headers & footers'),
    para(
      `页眉（word/header1.xml）：文档标题“${brand.title}”+ 段落下边框，与 §5 的 CONFIDENTIAL ` +
        '水印同属一个默认页眉，每页同时出现。页脚（word/footer1.xml）：第 PAGE 页 / 共 NUMPAGES 页 · ' +
        `本站域名（${brand.demoSite}，取自 brand.ts），页码按页实时计算。`
    ),

    sectBreakPara('—— 以上为第一节（纵向，单栏）：下面的横向双栏从新页开始 ——', portraitProps()),

    {
      ...h2('横向双栏 Landscape + two columns'),
      content: [
        bmStart(BM_LANDSCAPE, '_Toc7002'),
        run('横向双栏 Landscape + two columns'),
        bmEnd(BM_LANDSCAPE),
      ],
    } as Paragraph,
    para([
      run(
        '本节（w:sectPr）：Letter 横向（15840×12240 twips，w:orient="landscape"），' +
          'w:cols w:num="2"，两栏各 6120 twips、栏间距 720 twips，几何见脚注。'
      ),
      footnoteRef(3),
    ]),
    para(
      '分栏是报纸式流排：同一节内的正文先充满左栏再续右栏，栏尾自动平衡，栏间距由 w:cols 的 w:space 与 w:col 共同决定。' +
        '脚注区保持单栏并固定在页底，不与正文栏重叠；过长的脚注自动续到下一页的脚注区。'
    ),
    para(
      '栏数是节属性（w:sectPr 的子元素），不是段落属性：同一节内所有段落共享栏数，' +
        '连续分节（w:type="continuous"）可以在同一页内切换栏数，' +
        '而本节使用 nextPage 分节，横向双栏独占整页，前后都是纵向单栏，页面几何互不干扰。'
    ),
    para(
      'w:cols 的语义：w:num 为总栏数，w:space 为栏间距，w:col 逐栏给出宽度。' +
        'Word 要求各栏宽度与栏间距之和等于版心宽度，本节 6120×2＋720＝12960 恰好等于横向版心（15840−1440×2），' +
        '因此在 Word 与 LibreOffice 中打开时两栏等宽、无溢出；若总和超出，Word 会按比例压缩。'
    ),
    para(
      '横向加双栏的典型用途是宽表、大图与代码清单：本节特意写足文字，先注满左栏再流入右栏，' +
        '以便在文档中直接看到栏尾平衡——左栏写满后，后续文字自动出现在右栏顶部，' +
        '这正是报纸式排版与 Word 栏平衡（column balancing）的直观演示。'
    ),
    para(
      '分栏中的脚注与尾注：脚注区独立于正文栏之外，固定在页底单栏排列（本节的脚注 2 就在横向页底部），' +
        '栏数变化不会把它挤进栏内；尾注则统一收在文档末尾，不受分栏影响。' +
        '若脚注文字过长，超出部分自动续到下一页的脚注区，正文栏照常流排。'
    ),
    para(
      '分栏中的表格与图片：窄表可以嵌入栏内随文流排，超宽表格则适合独占横向版面。' +
        '浮动图片的环绕在栏内依然有效，只是可用宽度变为栏宽（本节约 4.25 英寸），' +
        '设计环绕文案时要按栏宽而非版心宽估算行数，§4 的环绕示例在单栏页，放在栏内会自动收窄。'
    ),
    para(
      '栏分隔线（w:sep）：可在栏间加一条竖线分隔左右栏，本节未启用以保持版面干净。' +
        '启用后竖线居于栏间距中央，高度与栏内容等高，适合双语对照与条款并列的版式。' +
        '分隔线是节属性，随分节切换而出现或消失，不会带到前后的单栏节。'
    ),

    sectBreakPara('—— 以上为第二节（横向，双栏）：下面回到纵向单栏 ——', landscapeTwoColProps()),

    {
      ...h2('尾注与书签 Endnotes & bookmarks'),
      content: [
        bmStart(BM_ENDNOTES, '_Toc7003'),
        run('尾注与书签 Endnotes & bookmarks'),
        bmEnd(BM_ENDNOTES),
      ],
    } as Paragraph,
    para([
      run(
        '尾注（w:endnoteReference）适合收录与正文流无关的补充说明，例如本文档的生成方式，详见尾注。'
      ),
      endnoteRef(2),
    ]),
    para([
      run('内部导航：'),
      anchorLink('← 返回本节开头', '_Toc7001'),
      run('（内部超链接以 w:anchor 引用书签，无需外部关系部件；点击可在 Word 与本编辑器中跳转。）'),
    ]),
    para(
      '本节末尾不再另起分页：两处段落内联 w:sectPr 加文档末尾的 w:sectPr 已完整描述双节，双栏只存在于横向节内。'
    ),
  ];
}

/**
 * Attach the §7 page furniture and notes to the document. Pure — returns a new `Document`.
 *
 * - Prepends the title line (with bottom border) to the §5 watermark header
 *   part, so every section shares one default header (title + watermark).
 * - Adds the footer part (`PAGE` / `NUMPAGES` + brand domain).
 * - Adds two footnotes + one endnote (plus Word-required separator notes).
 * - Sets the final portrait `w:sectPr` and backfills header/footer references
 *   onto any inline `w:sectPr` missing them (the §7 section-break paragraphs).
 *
 */
export function applyLayoutExtras(doc: Document, brand: Brand): Document {
  const relationships = new Map<string, Relationship>(doc.package.relationships ?? []);
  const headerRel = relationships.get(HEADER_RID);
  if (!headerRel) {
    relationships.set(HEADER_RID, {
      id: HEADER_RID,
      type: RELATIONSHIP_TYPES.header,
      target: 'header1.xml',
    });
  }
  if (!relationships.has(FOOTER_RID)) {
    relationships.set(FOOTER_RID, {
      id: FOOTER_RID,
      type: RELATIONSHIP_TYPES.footer,
      target: 'footer1.xml',
    });
  }

  const headers = new Map<string, HeaderFooter>(doc.package.headers ?? []);
  const prevHeader = headers.get(HEADER_RID);
  headers.set(HEADER_RID, {
    type: 'header',
    hdrFtrType: 'default',
    content: [headerTitlePara(brand), ...(prevHeader?.content ?? [])],
  });

  const footers = new Map<string, HeaderFooter>(doc.package.footers ?? []);
  footers.set(FOOTER_RID, {
    type: 'footer',
    hdrFtrType: 'default',
    content: [footerPara(brand)],
  });

  const footnotes: Footnote[] = [
    {
      type: 'footnote',
      id: 2,
      content: [
        para(
          [
            footnoteMarkRun(),
            run(
              '页眉合并说明：本节把文档标题（含下边框）并入 §5 的水印页眉（word/header1.xml），' +
                '因此全部三个分节只需引用同一个默认页眉，水印与标题在每页同时出现，无需 first/even 部件。'
            ),
          ],
          {
            styleId: 'FootnoteText',
          }
        ),
      ],
    },
    {
      type: 'footnote',
      id: 3,
      content: [
        para(
          [
            footnoteMarkRun(),
            run(
              '横向双栏几何：Letter 横向版心宽 12960 twips（15840−1440×2），' +
                '两栏各 6120 twips、栏间距 720 twips（6120×2＋720＝12960），与 w:cols / w:col 声明一致。'
            ),
          ],
          {
            styleId: 'FootnoteText',
          }
        ),
      ],
    },
  ];
  // Word-required separator notes (kept aside like the parser does).
  // ECMA-376 reserves 0/1 for the separator pair; content notes start at 2.
  const footnoteSeparators: Footnote[] = [
    {
      type: 'footnote',
      id: 0,
      noteType: 'separator',
      content: [para([{ type: 'run', content: [{ type: 'separator' }] }])],
    },
    {
      type: 'footnote',
      id: 1,
      noteType: 'continuationSeparator',
      content: [para([{ type: 'run', content: [{ type: 'continuationSeparator' }] }])],
    },
  ];

  const endnotes: Endnote[] = [
    {
      type: 'endnote',
      id: 2,
      content: [
        para([
          endnoteMarkRun(),
          run(
            '生成说明：本示例文档由 scripts/demo/build-sample-docx.ts 一键生成，' +
              '同一份产物分发到 7 个 examples 目录（字节一致，md5 相同）；正文末尾的三个书签（_Toc7001–_Toc7003）' +
              '即目录条目与内部超链接的跳转目标。'
          ),
        ]),
      ],
    },
  ];
  const endnoteSeparators: Endnote[] = [
    {
      type: 'endnote',
      id: 0,
      noteType: 'separator',
      content: [para([{ type: 'run', content: [{ type: 'separator' }] }])],
    },
    {
      type: 'endnote',
      id: 1,
      noteType: 'continuationSeparator',
      content: [para([{ type: 'run', content: [{ type: 'continuationSeparator' }] }])],
    },
  ];
  const body = doc.package.document;
  // Every inline w:sectPr must carry the furniture references, or its pages
  // would lose the header/footer.
  const content = body.content.map((block) =>
    block.type === 'paragraph' && block.sectionProperties
      ? {
          ...block,
          sectionProperties: {
            ...block.sectionProperties,
            headerReferences: block.sectionProperties.headerReferences ?? headerRefs(),
            footerReferences: block.sectionProperties.footerReferences ?? footerRefs(),
          },
        }
      : block
  );
  // Final section: portrait single column (drops any inherited w:type).
  const finalSectionProperties: SectionProperties = {
    ...body.finalSectionProperties,
    ...PORTRAIT_BASE,
    columnCount: 1,
    columnSpace: 720,
    equalWidth: true,
    sectionStart: undefined,
    headerReferences: headerRefs(),
    footerReferences: footerRefs(),
  };

  return {
    ...doc,
    package: {
      ...doc.package,
      relationships,
      headers,
      footers,
      footnotes,
      footnoteSeparators,
      endnotes,
      endnoteSeparators,
      document: { ...body, content, finalSectionProperties },
    },
  };
}
