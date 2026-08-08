# Ticket 24-A — Remove review and article-version lineage surfaces

状态：`CLOSURE-READY`（仅 24-A；Ticket 24、Wave 10 未完成）

## 基线与边界

- Base integration HEAD：`334a027aaff61496f94dddb2d62c21c0a5be089e`
- Implementation commit：本 handoff 所在的唯一 commit，subject 为 `refactor(content): remove review and article lineage`；最终 OID 以提交后 `git rev-parse HEAD` 的 clean-HEAD evidence 为准。
- 工作分支：`codex/article-lifecycle-submission`
- 本包只处理 Article Content Contract Owner。未进入 24-B/C/D/E/F，未修改单目标 admission、publication outcome、删除事务、M04 或真实外部操作；未 merge/push。

## 实现与公开能力变化

### 删除的 runtime surface

- 删除 `src/content/article-version-service.js` 及其测试；`copyArticleVersion`、复制新版本/新文章的 service owner、测试和 alpha packaging/production-seam 引用一并删除。
- 从 Article Content IPC contract、生成文章 Renderer type 和两个文章 UI 列表/编辑器移除 `sourceArticleId`、lineage `version` 和版本文案。
- Article serializer 在文件边界剥离历史 `reviewedAt`、`sourceArticleId`、lineage `version`；当前 Article model、持久 JSON 和 `generatedArticle` IPC DTO 均不再包含这些字段。
- 现有生成/保存/投稿链保持原 owner；完整生成结果仍直接进入待投稿链，不新增审核 gate。
- production IPC registry 当前 131 个 capability；精确 token probe 对 `review`、`copyArticleVersion`、`article-version` 命中为 `[]`。审核/复制 production capability、preload、bridge 和 Renderer action 均未保留兼容入口。

### 保留的 migration-only / explicit evidence

- `legacy-migration-reader` allowlist 保留 `reviewedAt`、`reviewStatus`、`reviewState` 和 `sourceArticleId`，只供离线 reader/planner 读取旧 evidence。
- 迁移 planner 的 `ImportPlan` 不携带审核/lineage 字段；测试证明 reader 能保留旧 evidence，而正常 Article DTO/Renderer 不可见。
- Article Store、IPC projection 和 absence tests 中保留的旧字段只用于明确的边界剥离/负向 evidence，不是普通运行时 fixture。

## 改动文件

### Production / contract / UI

- `auto—publish/src/content/article-version-service.js`（删除）
- `auto—publish/src/content/article-serialization.js`
- `auto—publish/src/content/legacy-migration-reader.js`
- `auto—publish/desktop/ipc/contracts/content-core-contracts.js`
- `auto—publish/media-workbench/src/types/generation.ts`
- `auto—publish/media-workbench/src/components/content/GeneratedArticlesList.tsx`
- `auto—publish/media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`
- `auto—publish/scripts/verify-alpha-package.js`

### 行为 / 合同 / 调用方测试

- `auto—publish/tests/article-version-service.test.js`（删除）
- `auto—publish/tests/article-store.test.js`
- `auto—publish/tests/article-generator.test.js`
- `auto—publish/tests/ai-content-service.test.js`
- `auto—publish/tests/article-submission-eligibility.test.js`
- `auto—publish/tests/submission-preparation-lifecycle.test.js`
- `auto—publish/tests/phase-03-six-stage-article-lifecycle.test.js`
- `auto—publish/tests/article-lifecycle-ticket-23-b.test.js`
- `auto—publish/tests/phase-05-production-seams.test.js`
- `auto—publish/tests/desktop-packaging.test.js`
- `auto—publish/tests/phase-06-content-core-typed-ipc.test.js`
- `auto—publish/tests/renderer-article-attention-actions.test.js`
- `auto—publish/tests/renderer-content-client-switch.test.js`
- `auto—publish/tests/renderer-content-confirmation-flow.test.js`
- `auto—publish/tests/renderer-history-editor-flow.test.js`
- `auto—publish/tests/renderer-responsive-layout.test.js`

## 实际验证

以下命令均在 `F:\官媒投稿-refactor\auto—publish` 执行，结果为通过：

- Article 创建/生成/保存/投稿 eligibility/lifecycle：`node --test tests/article-store.test.js tests/article-generator.test.js tests/ai-content-service.test.js tests/article-submission-eligibility.test.js tests/phase-03-six-stage-article-lifecycle.test.js tests/submission-preparation-lifecycle.test.js` — 90 passed。
- Content contract、production seams、packaging、migration isolation：`node --test tests/phase-05-production-seams.test.js tests/desktop-packaging.test.js tests/phase-06-content-core-typed-ipc.test.js tests/article-lifecycle-ticket-23-b.test.js` — 64 passed。
- Legacy absence：`node --test tests/phase-06-legacy-path-absence.test.js` — 3 passed。
- Production IPC fixture matrix：`node --test tests/phase-06-production-ipc-fixture-matrix.test.js` — 35 passed；131 capability symbol evidence。
- Renderer history/content/publication seams：`node --test tests/renderer-article-history.test.js tests/renderer-article-management-filters.test.js tests/renderer-content-confirmation-flow.test.js tests/renderer-content-read-model-seam.test.js tests/renderer-publication-history.test.js` — 20 passed。
- Renderer edit/save/read-only：`node --test tests/renderer-history-editor-flow.test.js` — 7 passed。
- Renderer client/layout/attention：`node --test tests/renderer-content-client-switch.test.js` — 1 passed；`node --test tests/renderer-responsive-layout.test.js` — 7 passed；`node --test tests/renderer-article-attention-actions.test.js` — 1 passed。
- Renderer bridge contract：`node --test tests/phase-06-renderer-bridge-api-surface.test.js` — 4 passed。
- 直接内容行为：`node --test tests/renderer-content-generation.test.js tests/renderer-article-management-flow.test.js` — 5 passed；`node --test tests/phase-06-content-feature.test.mjs tests/phase-06-content-read-model.test.mjs` — 7 passed。
- AI/content IPC：`node --test tests/ai-content-ipc.test.js tests/content-generation-batch-ipc.test.js tests/generation-submission-handoff-ipc.test.js` — 13 passed。
- Typecheck：`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main` — 全部通过。
- 格式边界：`git diff --check` — 通过。
- capability probe：`productionIpcRegistry.list().length === 131`，退休审核/复制 token `retired === []`。

Renderer 测试期间仅出现既有 Vite chunk size warning，不影响通过；未执行真实登录、发布、付费、Cloudflare/TLS、图片上传或其他外部写操作。

## Primary Audit / bounded re-audit

### Primary Audit

范围严格限定为本 diff、Article Content 直接调用链、公开 Article DTO/IPC/preload/bridge/Renderer capability、migration reader/planner 隔离及上述直接回归；未做全仓库 fresh review。

- 结果：`PASS`。
- P0/P1/P2：无 blocking finding。
- 核对项：删除 service/export/packaging 引用；generatedArticle exact DTO 与 projection allowlist；serializer persistence/read boundary；migration evidence 与 ImportPlan 隔离；production registry/preload/bridge/UI absence；正常生成、编辑、保存和投影调用链。
- 验证期间发现一次 absence test 正则会把 `preview` 误判为 `review`；已收紧为 token boundary，并重新运行相关 64-test contract/IPC/migration 集合通过。这是测试证据修正，不是残留业务能力。

非阻塞历史债记录：`src/core/articles.js` 文件名“副本”后缀的通用归一化仍按 24-0 标记为 `BLOCKED_SCOPE_DECISION_REQUIRED`，本包没有改变其导入/文件名语义；migration-only 旧 evidence 与明确 absence fixture 继续按合同保留。

### Bounded re-audit

在提交前按 Audit Protocol 只复核 Primary Audit 的已知边界、修复 diff、直接调用方、相关不变量和上述 targeted evidence；不重新开启全仓库 fresh review。结果：`PASS`，无 escalation 条件、无未关闭 blocking finding。

## 未运行 gate 与下一动作

- 未运行完整 `npm test`、全仓库 lint/format/discovery、release/package smoke 或 Wave 10 combined audit；这些不属于本 24-A 定向 closure，且不以本 handoff 冒充通过。
- 本包 commit 后由主任务验证新的 clean integration HEAD、commit 内容和 handoff；验证通过后方可按 Wave Plan 另行调度 24-B。本任务不进入 24-B。

## Closure

24-A：`CLOSURE-READY`。完成条件已绑定到本 handoff 所述实现、定向测试、Primary Audit 和 bounded re-audit；implementation commit 由本文件所在唯一 commit 及提交后的 clean HEAD evidence 确认。
