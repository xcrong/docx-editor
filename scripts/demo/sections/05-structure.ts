/**
 * §5 结构与控件 (T25-05, #56).
 *
 * Covers: block-level SDT (alias+tag container) / inline rich-text SDT /
 * checkbox controls (one checked, one unchecked, `w14:checkbox`) / drop-down
 * list (`w:dropDownList` + 3 `w:listItem`) / date control (`w:date` +
 * `w:dateFormat` + `w:fullDate`) / floating text box (`w:txbxContent`,
 * anchored + `wrapSquare`) / text watermark (DrawingML shape with
 * `behindDoc="1"` in the default header, `CONFIDENTIAL`).
 *
 * Feature ids: `structure.content-controls`, `structure.typed-controls`,
 * `images.textboxes`, `layout.watermarks`.
 *
 * Header wiring: `build()` returns body blocks (auto-registered via
 * `sections/index.ts`). Headers are document-level, so the watermark header
 * part is applied separately — see {@link applyStructureExtras}. The merge
 * step calls it on the assembled `Document` before `createDocx` (one line in
 * `build-sample-docx.ts`):
 *
 * ```ts
 * import { applyStructureExtras } from './sections/05-structure.ts';
 * const doc = applyStructureExtras(baseDoc);
 * ```
 */
import type {
  BlockContent,
  Document,
  HeaderFooter,
  InlineSdt,
  Relationship,
  SdtProperties,
  Shape,
} from '../../../packages/core/src/types/document.ts';
import { RELATIONSHIP_TYPES } from '../../../packages/core/src/docx/relsParser.ts';
import type { Brand } from '../brand.ts';
import { h1, h2, para, run, blockSdt, inlineSdt, shapeRun } from '../builders.ts';

const SDT_IDS = {
  blockContainer: 21,
  inlineRich: 22,
  checkDone: 23,
  checkPending: 24,
  status: 25,
  effective: 26,
} as const;

const EFFECTIVE_FULL_DATE = '2026-11-07T00:00:00Z';
const EFFECTIVE_FORMAT = 'MMMM d, yyyy';
const EFFECTIVE_TEXT = 'November 7, 2026';

/** Raw `w:sdtPr` for the drop-down so `w:lastValue` carries the selection. */
function dropDownRaw(props: SdtProperties): string {
  const items = (props.listItems ?? [])
    .map((i) => `<w:listItem w:displayText="${i.displayText}" w:value="${i.value}"/>`)
    .join('');
  return (
    `<w:sdtPr><w:alias w:val="${props.alias}"/><w:tag w:val="${props.tag}"/>` +
    `<w:id w:val="${props.id}"/><w:dropDownList w:lastValue="2">${items}</w:dropDownList></w:sdtPr>`
  );
}

/** Raw `w:sdtPr` for the date control so `w:fullDate` carries the value. */
function dateRaw(props: SdtProperties): string {
  return (
    `<w:sdtPr><w:alias w:val="${props.alias}"/><w:tag w:val="${props.tag}"/>` +
    `<w:id w:val="${props.id}"/><w:date w:fullDate="${EFFECTIVE_FULL_DATE}">` +
    `<w:dateFormat w:val="${props.dateFormat}"/></w:date></w:sdtPr>`
  );
}

function checkbox(tag: string, alias: string, id: number, checked: boolean): InlineSdt {
  return inlineSdt({ sdtType: 'checkbox', tag, alias, id, checked }, [run(checked ? '☒' : '☐')]);
}

/** Floating body text box: anchored, `wrapSquare`, light fill + outline. */
function bodyTextBoxShape(): Shape {
  return {
    type: 'shape',
    shapeType: 'rect',
    name: 'S5 TextBox note',
    size: { width: 2743200, height: 1314450 },
    position: {
      horizontal: { relativeTo: 'column', alignment: 'right' },
      vertical: { relativeTo: 'paragraph', alignment: 'top' },
    },
    wrap: {
      type: 'square',
      wrapText: 'bothSides',
      distT: 114300,
      distB: 114300,
      distL: 114300,
      distR: 114300,
    },
    fill: { type: 'solid', color: { rgb: 'FFF2CC' } },
    outline: { width: 19050, color: { rgb: 'BF9000' }, style: 'solid' },
    textBody: {
      anchor: 'middle',
      anchorCenter: true,
      content: [
        para([run('文本框 Text box', { bold: true })], { alignment: 'center' }),
        para([run('锚定定位 + 环绕（wrapSquare），正文环绕四周。')], {
          alignment: 'center',
        }),
      ],
    },
  };
}

/** Header watermark shape: centered on the page, behind the body text. */
function watermarkShape(): Shape {
  return {
    type: 'shape',
    shapeType: 'rect',
    name: 'S5 Watermark CONFIDENTIAL',
    size: { width: 5486400, height: 762000 },
    position: {
      horizontal: { relativeTo: 'page', alignment: 'center' },
      vertical: { relativeTo: 'page', alignment: 'center' },
    },
    wrap: { type: 'behind' },
    fill: { type: 'none' },
    textBody: {
      anchor: 'middle',
      anchorCenter: true,
      content: [
        para([run('CONFIDENTIAL · 机密', { bold: true, fontSize: 72, color: { rgb: 'D9D9D9' } })], {
          alignment: 'center',
        }),
      ],
    },
  };
}

export function build(_brand: Brand): BlockContent[] {
  const statusProps: SdtProperties = {
    sdtType: 'dropDownList',
    alias: '状态选择 Status',
    tag: 's5-status',
    id: SDT_IDS.status,
    listItems: [
      { displayText: '草稿 Draft', value: '1' },
      { displayText: '评审中 In Review', value: '2' },
      { displayText: '已发布 Final', value: '3' },
    ],
  };
  const dateProps: SdtProperties = {
    sdtType: 'date',
    alias: '生效日期 Effective date',
    tag: 's5-effective',
    id: SDT_IDS.effective,
    dateFormat: EFFECTIVE_FORMAT,
  };

  return [
    h1('§5 结构与控件 Structure & controls'),

    para('本节演示结构化文档标签（SDT/内容控件）、类型化控件、浮动文本框与页眉文字水印。'),

    h2('块级内容控件 Block content control'),
    blockSdt(
      {
        sdtType: 'richText',
        alias: '块容器 Block container',
        tag: 's5-block-container',
        id: SDT_IDS.blockContainer,
      },
      [
        para(
          '块级 SDT（w:sdt）把多段正文包成一个整体容器：容器内的段落可整体选中、复制与模板填充。'
        ),
        para('这是容器内的第二段：块级控件可跨段落承载标题、正文乃至表格，是模板化文档的锚点。'),
      ]
    ),

    h2('行内内容控件 Inline content control'),
    para([
      run('本句中间嵌入一个行内富文本控件：'),
      inlineSdt(
        {
          sdtType: 'richText',
          alias: '行内容控件 Inline rich text',
          tag: 's5-inline-rich',
          id: SDT_IDS.inlineRich,
        },
        [run('行内受控区 editable span')]
      ),
      run('，控件前后仍是普通文本，编辑互不干扰。'),
    ]),

    h2('复选框 Checkbox controls'),
    para([
      run('待办：'),
      checkbox('s5-check-done', '已确认 Confirmed', SDT_IDS.checkDone, true),
      run(' 已签署确认函　'),
      checkbox('s5-check-pending', '待会签 Pending', SDT_IDS.checkPending, false),
      run(' 待法定代表人会签（w14:checkbox，点击切换勾选态）。'),
    ]),

    h2('下拉列表 Drop-down list'),
    para([
      run('文档状态：'),
      inlineSdt({ ...statusProps, rawPropertiesXml: dropDownRaw(statusProps) }, [
        run('评审中 In Review'),
      ]),
      run('（w:dropDownList，含 3 个 w:listItem，当前选中“评审中”）。'),
    ]),

    h2('日期控件 Date picker'),
    para([
      run('生效日期：'),
      inlineSdt({ ...dateProps, rawPropertiesXml: dateRaw(dateProps) }, [run(EFFECTIVE_TEXT)]),
      run(`（w:date，格式 ${EFFECTIVE_FORMAT}，fullDate ${EFFECTIVE_FULL_DATE}）。`),
    ]),

    h2('浮动文本框 Floating text box'),
    para(
      '下面的文本框采用锚定定位 + 环绕（wrapSquare）：它悬浮于段落右侧，正文环绕四周而不被压住。'
    ),
    para([
      run(
        '文本框（w:txbxContent）常用于提示框与旁注。本段携带一个右侧浮动文本框：框内两行文字居中，浅黄底色 + 深黄边框；' +
          '本段文字应当环绕文本框左右与下方，文本框位置固定、不随正文流动而错位。后续文字继续环绕，直到段落写满整块版心后另起一段。'
      ),
      shapeRun(bodyTextBoxShape()),
    ]),
    para('文本框段之后：确认文本框没有遮挡正文，且正文没有压住文本框。'),

    h2('文字水印 Text watermark'),
    para(
      '本节附带页眉文字水印 CONFIDENTIAL（DrawingML 形状，behindDoc，居中压在正文之下，见 word/header1.xml）。'
    ),
  ];
}

/**
 * Attach the §5 watermark header part (DrawingML `CONFIDENTIAL` shape with
 * `behindDoc="1"`) to the document. Pure — returns a new `Document`.
 *
 * The rId avoids the numeric `rIdN` range the rezip pipeline allocates for
 * images/hyperlinks; `ensureHeaderFooterParts` registers the content type
 * and document-rels entry at save time.
 */
export function applyStructureExtras(doc: Document): Document {
  const rId = 'rIdS5WatermarkHeader';
  const header: HeaderFooter = {
    type: 'header',
    hdrFtrType: 'default',
    content: [para([shapeRun(watermarkShape())])],
  };
  const relationships = new Map<string, Relationship>(doc.package.relationships ?? []);
  if (!relationships.has(rId)) {
    relationships.set(rId, {
      id: rId,
      type: RELATIONSHIP_TYPES.header,
      target: 'header1.xml',
    });
  }
  const headers = new Map<string, HeaderFooter>(doc.package.headers ?? []);
  headers.set(rId, header);

  const body = doc.package.document;
  const refs = (body.finalSectionProperties?.headerReferences ?? []).filter(
    (r) => r.type !== 'default'
  );
  const finalSectionProperties = {
    ...body.finalSectionProperties,
    headerReferences: [...refs, { type: 'default' as const, rId }],
  };
  return {
    ...doc,
    package: {
      ...doc.package,
      relationships,
      headers,
      document: { ...body, finalSectionProperties },
    },
  };
}
