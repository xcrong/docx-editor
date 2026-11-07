/**
 * §6 审阅：修订痕迹、评论线程与被追踪插入的图片 (T25-06, #57).
 *
 * Covers: `review.tracked-changes` (three author-distinct ins/del groups) /
 * `review.comments` (one plain comment + one reply thread; the reply link is
 * `commentsExtended.xml` `w15:commentEx` `w15:paraIdParent`, plus one resolved
 * `w15:done="1"`) / `images.tracked` (`w:ins` wrapping `w:drawing`).
 *
 * Core support was read before writing, not assumed: the body serializer
 * keeps drawing runs verbatim inside `w:ins` (`paragraphSerializer/content.ts`
 * skips the `w:t` → `w:delText` rewrite for drawing runs), the rezip image
 * pass descends into `insertion`/`deletion` wrappers (`rezip/images.ts`), and
 * `ensureUniqueDrawingIds` visits tracked wrappers too — so a tracked-insert
 * picture survives `createDocx` with media + `r:embed` + unique `docPr` ids.
 * Reply range markers are injected with the shared `injectReplyRangeMarkers`
 * helper (same transform the editors run before saving).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BlockContent, Comment, Document } from '../../../packages/core/src/types/document.ts';
import { injectReplyRangeMarkers } from '../../../packages/core/src/docx/injectReplyRangeMarkers.ts';
import type { Brand } from '../brand.ts';
import {
  EMU_PER_INCH,
  commentEnd,
  commentStart,
  del,
  h1,
  h2,
  h3,
  ins,
  insContent,
  inlinePic,
  para,
  reviewComment,
  run,
} from '../builders.ts';

const SARA_DATE = '2026-03-04T09:21:00Z';
const THOMAS_DATE = '2026-03-04T11:07:00Z';
const ANON_DATE = '2026-03-04T23:44:00Z';

const IN = EMU_PER_INCH;

/** Reuse the §4 geometry art so no new binary weight is added. */
function trackedArt(): string {
  const buf = readFileSync(join(import.meta.dir, '..', 'assets', 'fig-inline.png'));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export function build(_brand: Brand): BlockContent[] {
  return [
    h1('§6 审阅修订与评论 Review & tracked changes'),

    para(
      '本节演示审阅三件套：修订痕迹（w:ins / w:del，修订以作者配色呈现，删除线与下划线区分删留）、' +
        '评论（含回复的线程挂在 commentsExtended.xml，侧栏缩进展示）与被追踪插入的图片（w:ins 包裹 w:drawing）。'
    ),

    h2('修订痕迹 Tracked changes'),

    para(
      '下面三组修订作者各不相同，日期为固定常量（可复现构建）：橙色为 sara.k，蓝色为 thomas.v，灰色为匿名协作者。'
    ),

    para([
      run('部署方式：'),
      del('sara.k', 20, SARA_DATE, '需要自备后端服务才能预览'),
      ins('sara.k', 21, SARA_DATE, '直接在浏览器打开即可预览，无需后端'),
      run('。'),
    ]),

    para([
      run('架构约束：'),
      del('thomas.v', 22, THOMAS_DATE, '渲染前必须经过 HTML 中间层'),
      ins('thomas.v', 23, THOMAS_DATE, '渲染直达画布，不经过 HTML 中间层'),
      run('。'),
    ]),

    para([
      run('写作规范：'),
      del('anon-contributor', 24, ANON_DATE, '不要引用未经验证的快捷结论。'),
      ins('anon-contributor', 25, ANON_DATE, '只引用可在解包产物中验证的结论。'),
      run('。'),
    ]),

    h3('被追踪插入的图片 Tracked picture insert'),

    para(
      '下面这张示意图本身就是一次修订：sara.k 以追踪插入的方式加入图片，' +
        'w:ins 直接包裹 w:drawing，图片随段落流动，修订态下可接受、可拒绝、可定位。'
    ),

    para([
      run('产品示意图（sara.k 追踪插入）：'),
      insContent('sara.k', 26, SARA_DATE, [
        run('图 6-1 追踪插入的示意图（斜纹底 + 同心圆，与 §4 同源）：'),
        inlinePic(
          trackedArt(),
          Math.round(1.5 * IN),
          Math.round(1.125 * IN),
          '审阅追踪插入的示意图',
          'fig-review-tracked.png'
        ),
      ]),
      run('插入后图片与图注同属一条修订，接受即留图，拒绝即整段撤回。'),
    ]),

    h2('评论 Comments'),

    para([
      run('修订分组保留三位作者，是为了演示'),
      commentStart(0),
      run('按作者着色'),
      commentEnd(0),
      run('与侧栏聚合：同一作者的修订与评论可以在侧栏按作者筛选，点击评论定位回正文。'),
    ]),

    para([
      run('被追踪插入的图片同样可以'),
      commentStart(2),
      run('被评论'),
      commentEnd(2),
      run('：图片附加的修订说明出现在侧栏；含回复的线程缩进展示，已解决的线程置灰。'),
    ]),
  ];
}
/**
 * Fixed `w14:paraId` per review comment so `bun run demo:build` is
 * byte-deterministic (the serializer reuses valid model paraIds instead of
 * minting random ones; see `commentSerializer`).
 */
const REVIEW_PARA_IDS = ['10000001', '10000002', '10000003'] as const;

const REVIEW_COMMENTS: Comment[] = [
  reviewComment(
    0,
    'sara.k',
    SARA_DATE,
    '这一句演示修订按作者着色：“按作者着色”由我加上评论，侧栏显示作者与时间；点击评论可定位回这段文字，回复会挂成线程。',
    { initials: 'SK', paraId: REVIEW_PARA_IDS[0] }
  ),
  reviewComment(
    1,
    'thomas.v',
    THOMAS_DATE,
    '收到，回复演示线程嵌套：这条回复挂在 sara.k 的评论下，commentsExtended.xml 里用 w15:paraIdParent 指向上级，侧栏里缩进展示。',
    { initials: 'TV', parentId: 0, paraId: REVIEW_PARA_IDS[1] }
  ),
  reviewComment(
    2,
    'anon-contributor',
    ANON_DATE,
    '图片修订已确认：追踪插入的示意图渲染正常，修订标记可接受、可拒绝；本条评论标记为已解决（w15:done="1"），侧栏置灰。',
    { initials: 'AC', done: true, paraId: REVIEW_PARA_IDS[2] }
  ),
];

/**
 * Attach the §6 comment entities (T25-05 `applyStructureExtras` pattern).
 * Wired in `build-sample-docx.ts` beside the §5 extras.
 */
export function applyReviewExtras(doc: Document): Document {
  const body = doc.package.document;
  const comments = [...(body.comments ?? []), ...REVIEW_COMMENTS];
  body.comments = comments;
  injectReplyRangeMarkers(body.content, comments);
  return doc;
}
