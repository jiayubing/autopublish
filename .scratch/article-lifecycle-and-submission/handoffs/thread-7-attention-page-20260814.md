# Thread 7：需处理页面整理

日期：2026-08-14

基线 HEAD：`e8edc3a`

分支：`codex/article-lifecycle-submission`
实现提交：未提交；当前请求未授权 commit/merge

## 范围

本线程只处理文章管理中的“需处理”展示、去重和操作入口。未修改生命周期状态机、Lieju Adapter、客户档案、付费媒体或普通平台结果判定。

## 修改文件

- `media-workbench/src/components/content/ArticleAttentionPanel.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `tests/renderer-article-attention-actions.test.js`

## 修复内容

- 同一客户下同一文章的多个 attention item 合并为一张文章卡；无文章身份的事务项仍按自身 attention ID 独立展示。
- 文章卡统一展示标题、客户、投稿目标/账号、问题类型、原因码、最近执行时间和问题说明。
- 保留合并卡内每个事项对应的详情、重试、核对等操作，不把不同事项错误合并成一个后端状态。
- 明确失败且现有 workflow 允许时，展示“打开文章”和“移入回收站”；回收站入口复用既有删除预检/确认链路，未新增状态写入路径。
- 不确定结果继续通过发布详情进入“确认已发布/确认未发布”，不增加直接重试。
- 需处理阶段继续独占需处理面板，不再同时渲染普通文章列表和批量投稿工具栏。

## 验证

- `npm run typecheck:renderer`：PASS。
- `npm run build:renderer`：PASS；保留既有 chunk size warning。
- `node --test --test-concurrency=1 tests/renderer-article-attention-actions.test.js`：PASS，1/1。
- `node --test --test-concurrency=1 tests/renderer-publication-history.test.js tests/phase-08-renderer-contract-layout.test.js`：PASS，7/7。
- `node --test --test-concurrency=1 tests/renderer-responsive-layout.test.js`：PASS，7/7。
- `node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js`：PASS，1/1。
- `npx eslint media-workbench/src/components/content/ArticleAttentionPanel.tsx media-workbench/src/components/content/GeneratedArticlesView.tsx tests/renderer-article-attention-actions.test.js`：PASS。
- `git diff --check`：PASS；仅有 Windows 行尾转换提示，无 whitespace error。
- `npx prettier --check --end-of-line auto ...`：未通过；这 3 个文件均存在既有/当前格式差异，本线程未进行全文件格式化，以避免扩大范围。

## 未解决问题

- Workstream 6 handoff 仍记录缺少真实账号/登录态，未完成真实列举网成功发布和 `remoteUrl`/`remoteId` evidence；本线程未尝试真实外部操作。
- 未运行全量 `npm test`；本线程使用受影响 renderer 行为、构建、类型和响应式定向门禁。

## Thread 7 验收结论

- 同一文章不再同时出现在需处理卡片和普通文章列表中；同一文章的多个 attention item 也只占一张卡。
- 用户可直接看到客户、投稿目标、账号、原因、最近执行和问题说明。
- 明确失败项具备重新投稿、打开文章、发布详情和在允许时移入回收站的入口。
- 不确定项仍通过发布详情提供人工确认，未展示直接重试。
- 不适用的归档重试等通用操作不会误展示；其他文章阶段的列表和操作回归通过。
