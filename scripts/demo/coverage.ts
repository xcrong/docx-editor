/**
 * Demo coverage ledger (T25-08, #59).
 *
 * Single source of truth: `docs/site/data/word-features.ts` (`wordFeatures`,
 * 80 entries on the editing/rendering/roundTrip axes). This file NEVER copies
 * that list — it only maps feature id -> demo section (DEMOED) or records a
 * non-demoable reason (NOT_DEMOABLE). The `check:sample-docx` guard imports
 * `checkCoverage` from here, so the ledger turns red the moment it drifts.
 *
 * Rule: every feature with `editing !== 'none'` MUST appear in exactly one of
 * the two tables below, otherwise `assertCoverage()` throws with the missing
 * id + category + suggested `sections/*.ts` file.
 */

import { wordFeatures, type FeatureCategory } from '../../docs/site/data/word-features.ts';

/** Matrix size the ledger was written against. Bump together with the ledger. */
export const EXPECTED_FEATURE_COUNT = 80;

/** Section file basenames (without `.ts`) that DEMOED values may point at. */
export const KNOWN_SECTIONS = [
  '01-text',
  '02-paragraphs',
  '03-tables',
  '04-images',
  '05-structure',
  '06-review',
  '07-layout',
  '08-capability-table',
] as const;

export type SectionId = (typeof KNOWN_SECTIONS)[number];

/**
 * feature id -> section id. The section MUST show visible evidence of the
 * feature (not just mention it): accept-reject/pagination stay here — never
 * in NOT_DEMOABLE — because the tracked-revision blocks (§6) and the
 * multi-page layout itself (§7) are the evidence.
 */
export const DEMOED: Record<string, SectionId> = {
  // §1 文本与字符格式 (sections/01-text.ts)
  'text.basic-formatting': '01-text',
  'text.sub-superscript': '01-text',
  'text.fonts': '01-text',
  'text.embedded-fonts': '01-text',
  'text.color': '01-text',
  'text.highlight': '01-text',
  'text.rtl': '01-text',
  'fields.hyperlinks': '01-text', // brand external hyperlinks live in §1
  // §2 段落与列表 (sections/02-paragraphs.ts)
  'paragraphs.alignment': '02-paragraphs',
  'paragraphs.spacing': '02-paragraphs',
  'paragraphs.indentation': '02-paragraphs',
  'paragraphs.styles': '02-paragraphs',
  'paragraphs.borders': '02-paragraphs',
  'paragraphs.tabs': '02-paragraphs',
  'lists.bullets': '02-paragraphs',
  'lists.numbered': '02-paragraphs',
  'lists.custom-numbering': '02-paragraphs',
  'lists.continuation': '02-paragraphs',
  // §3 表格 (sections/03-tables.ts)
  'tables.editing': '03-tables',
  'tables.rows-columns': '03-tables',
  'tables.borders-shading': '03-tables',
  'tables.merge': '03-tables',
  'tables.page-break': '03-tables',
  'tables.nested': '03-tables',
  'tables.conditional-formatting': '03-tables',
  // §4 图片 (sections/04-images.ts)
  'images.inline': '04-images',
  'images.anchored': '04-images',
  // §5 结构与控件 (sections/05-structure.ts)
  'images.textboxes': '05-structure', // floating w:txbxContent lives in §5
  'structure.content-controls': '05-structure',
  'structure.repeating-sections': '05-structure', // SDT family demo covers the control kind
  'structure.typed-controls': '05-structure',
  'layout.watermarks': '05-structure', // CONFIDENTIAL header watermark lives in §5
  // §6 审阅 (sections/06-review.ts)
  'images.tracked': '06-review', // w:ins-wrapped drawing lives in §6
  'review.tracked-changes': '06-review',
  'review.accept-reject': '06-review', // the §6 revision blocks ARE the accept/reject surface
  'review.comments': '06-review',
  'review.ai-redlining': '06-review', // surfaced as tracked insertions/deletions
  'review.moves': '06-review',
  // §7 版式与域 (sections/07-layout.ts)
  'layout.pagination': '07-layout', // the multi-page document itself is the evidence
  'layout.sections': '07-layout',
  'layout.headers-footers': '07-layout',
  'layout.footnotes': '07-layout',
  'fields.page-numbers': '07-layout', // PAGE / NUMPAGES in the §7 footer
};

/**
 * feature id -> reason. Only for capabilities a static document genuinely
 * cannot express (UI/runtime behaviour). Every reason MUST be ≥ 10 chars;
 * shorter/empty reasons fail the guard the same way a gap does.
 */
export const NOT_DEMOABLE: Record<string, string> = {
  'collab.realtime':
    '实时协同依赖 Yjs 后端与多客户端在线状态，静态文档内容无法演示，需运行协作示例验证',
  'collab.find-replace':
    '查找替换是编辑器工具栏的运行时交互，静态文档只能呈现文本结果，无法演示操作过程',
  'collab.clipboard':
    '富文本剪贴板涉及系统剪贴板与 HTML 互操作，属运行时能力，文档字节无法呈现操作',
  'collab.undo-redo': '撤销重做是编辑器历史栈的运行时行为，静态文档无法表达操作序列，需交互验证',
  'collab.i18n': '九国语言界面是编辑器 UI 的运行时切换能力，演示文档正文语言固定，无法逐一呈现',
  'collab.agent-tools':
    'AI 代理工具包通过 MCP 与传输协议同实时编辑器交互，属运行时集成，文档内容无法承载',
};

/** Where a missing feature of a category should most plausibly be demonstrated. */
export const CATEGORY_SECTION_HINT: Record<FeatureCategory, string> = {
  text: 'sections/01-text.ts',
  paragraphs: 'sections/02-paragraphs.ts',
  lists: 'sections/02-paragraphs.ts',
  tables: 'sections/03-tables.ts',
  images: 'sections/04-images.ts',
  structure: 'sections/05-structure.ts',
  review: 'sections/06-review.ts',
  layout: 'sections/07-layout.ts',
  fields: 'sections/07-layout.ts',
  collaboration: 'NOT_DEMOABLE（UI/运行时能力，文档内容无法表达，需写 ≥10 字理由）',
};

export interface CoverageResult {
  total: number;
  required: number;
  demoedCount: number;
  exemptCount: number;
  failures: string[];
}

/** Pure ledger check. Returns failures (empty = green); never throws. */
export function checkCoverage(): CoverageResult {
  const failures: string[] = [];
  const byId = new Map(wordFeatures.map((f) => [f.id, f]));

  // 0. Matrix size pin: the ledger was written against 80 entries.
  if (wordFeatures.length !== EXPECTED_FEATURE_COUNT) {
    failures.push(
      `矩阵条数漂移：wordFeatures 共 ${wordFeatures.length} 条，台账期望 ${EXPECTED_FEATURE_COUNT} 条。` +
        '先同步 DEMOED / NOT_DEMOABLE，再更新 EXPECTED_FEATURE_COUNT（scripts/demo/coverage.ts）'
    );
  }

  // 1. Ledger keys MUST exist in the matrix (catches typos + stale ids).
  for (const id of Object.keys(DEMOED)) {
    if (!byId.has(id))
      failures.push(`DEMOED 引用了矩阵中不存在的特性：${id}（拼写错误或矩阵已改名）`);
  }
  for (const id of Object.keys(NOT_DEMOABLE)) {
    if (!byId.has(id))
      failures.push(`NOT_DEMOABLE 引用了矩阵中不存在的特性：${id}（拼写错误或矩阵已改名）`);
  }

  // 2. No double registration.
  for (const id of Object.keys(DEMOED)) {
    if (id in NOT_DEMOABLE)
      failures.push(`重复登记：${id} 同时出现在 DEMOED 与 NOT_DEMOABLE，只能留一处`);
  }

  // 3. DEMOED values MUST be known sections.
  const known = new Set<string>(KNOWN_SECTIONS);
  for (const [id, section] of Object.entries(DEMOED)) {
    if (!known.has(section))
      failures.push(
        `DEMOED 指向未知章节：${id} → ${section}（应为 ${KNOWN_SECTIONS.join(' / ')} 之一）`
      );
  }

  // 4. Exemption reasons MUST be ≥ 10 chars.
  for (const [id, reason] of Object.entries(NOT_DEMOABLE)) {
    if (typeof reason !== 'string' || reason.trim().length < 10) {
      failures.push(
        `豁免理由缺失：${id} 的理由不足 10 字（当前 ${JSON.stringify(reason)}）。` +
          '请补写可在文档中验证的说明，或改入 DEMOED'
      );
    }
  }

  // 5. Every editing !== 'none' feature MUST be in exactly one table.
  const missing = wordFeatures.filter(
    (f) => f.editing !== 'none' && !(f.id in DEMOED) && !(f.id in NOT_DEMOABLE)
  );
  if (missing.length > 0) {
    const lines = missing.map(
      (f) => `  ${f.id} (${f.category})      ← 建议加入 ${CATEGORY_SECTION_HINT[f.category]}`
    );
    failures.push(
      "覆盖缺口：以下特性 editing != 'none'，但既未在文档中演示，也未登记豁免理由\n" +
        lines.join('\n') +
        '\n修复：在 scripts/demo/coverage.ts 的 DEMOED 中登记，或在 NOT_DEMOABLE 中写 ≥10 字理由；然后运行 bun run demo:build'
    );
  }

  return {
    total: wordFeatures.length,
    required: wordFeatures.filter((f) => f.editing !== 'none').length,
    demoedCount: Object.keys(DEMOED).length,
    exemptCount: Object.keys(NOT_DEMOABLE).length,
    failures,
  };
}

/** Throwing variant for the guard. Message is written to guide the fix. */
export function assertCoverage(): void {
  const report = checkCoverage();
  if (report.failures.length > 0) {
    throw new Error(
      `台账覆盖度检查失败（${report.failures.length} 项）：\n${report.failures.join('\n')}`
    );
  }
}
