# Demo Showcase DOCX — tasks（对齐 #51 的 T25-01…T25-10）

## T25-01 spike + 建 change（本单元 ✅，见 #52）

- [x] spike：`createEmptyDocument → createDocx → updateMultipleFiles(styles.xml)` 观感三项通过 + 往返结构相等
- [x] 建 `openspec/changes/demo-showcase-docx/{proposal,design,tasks}.md`（不写 `specs/` delta）
- [x] 截图证据入库：`spike-visual.png`

## T25-02 生成器骨架（#53，前置：本单元）

- [ ] `scripts/demo/{build-sample-docx.ts,brand.ts,builders.ts,styles.xml,assets/}` + `demo:build`
- [ ] §1 文本 §2 段落 §3 表格；`sections/index.ts` 目录自动注册（硬性）
- [ ] 一次写 `examples/shared/sample.docx` + 6 份 `public/sample.docx`，7 份 md5 一致

## T25-03 守卫（#54，前置 #53；可与 #55–#58 并行）

- [ ] `bun run check:sample-docx`（过期/引用/零引用部件/品牌/副本/往返/体积）+ 挂 CI
- [ ] 故意构造失败验证红灯

## T25-04…07 内容单元（#55–#58，前置 #53；互相并行，各只碰自己 section 文件）

- [ ] §4 图片（#55）：inline / wrapSquare / wrapTopAndBottom
- [ ] §5 结构（#56）：块级 SDT / 复选框/下拉/日期 / 文本框 / 水印
- [ ] §6 审阅（#57）：3 组修订 + 2 评论含 1 回复 + 追踪插入图片
- [ ] §7 版式（#58）：页眉页脚页码 / 双节横向 / 分栏 / 脚注尾注 / TOC 书签

## T25-08 台账（#59，前置 #55–#58，最后一个内容单元）

- [ ] `scripts/demo/coverage.ts`（`DEMOED` / `NOT_DEMOABLE`），只读 `word-features.ts`
- [ ] §8 支持情况表从矩阵生成

## T25-09 渲染守卫（#60，前置 #55–#58；可与 #59 并行）

- [ ] `e2e/tests/demo-showcase.spec.ts`（见 design.md 验收映射）

## T25-10 品牌收尾（#61，独立可插队）

- [ ] `createEmpty.ts:114` + core.xml creator 改本 fork 品牌（1 行级）
