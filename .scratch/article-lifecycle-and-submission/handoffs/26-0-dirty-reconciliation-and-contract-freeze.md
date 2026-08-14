# 26-0 — Dirty reconciliation 与合同冻结

日期：2026-08-15
初始盘点 HEAD：`e8edc3a`
分支：`codex/article-lifecycle-submission`
执行结果：先按 Manual Dispatch 完成盘点，后经用户授权将四组既有修复提交为重构基线；未 push，未执行真实外部操作

## 1. 结论

Ticket 26 的产品词汇、权威 SPEC、架构决策和 umbrella 合同已经冻结。本 Ticket 开始盘点时存在 17 个 modified production/test 文件、1 个 attention handoff 和一个未跟踪打包输出目录；所有源代码与测试改动均已保全、验证，并按 owner 收口为四个独立基线提交，没有 reset、checkout 或覆盖用户工作。

本线程没有实施 Ticket 26 production 重构。四个 production/test 提交均为 Ticket 26 开始前已经存在的真实修复；本 Ticket 新增内容只包含产品/架构/调度文档和生成物忽略规则，也没有运行 Ticket 26 implementation tests。

既有 diff 已按 owner 明确分类并提交，不存在无法辨认的平行业务 writer。后续允许从 26-A 开始，但必须从包含四个基线提交和 Ticket 26 计划提交的 clean integration HEAD 创建；不能从旧 `e8edc3a` 或项目默认分支覆盖这些修复。

## 2. 新增权威合同

- `CONTEXT.md`：新增/修订普通平台队列项、已确认付费批次、需处理事项、投稿中文章、文章库、投稿中心和普通平台入队批次；确认付费预检不冻结、删除不自动撤销队列。
- `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`：取代旧六阶段导航，固定“内容生产 → 文章库 → 投稿中心 → 订单”产品链路。
- `docs/adr/0006-separate-article-lifecycle-from-submission-work.md`：记录文章事实与投稿工作分离的架构决策。
- `issues/26-article-library-and-submission-center-redesign.md`：固定 26-0 → 26-I 串行 owner 与 gate。
- Wave Plan：插入 Wave 11.5 / Ticket 26，图片工作继续等待。

## 3. 既有 dirty diff 分类与提交归属

### A. 普通平台结果后刷新文章管理

文件：

- `desktop/composition/regular-queue-group-composition.js`
- `desktop/composition/workspace-runtime-composition.js`
- `desktop/services/regular-queue-group-orchestrator.js`
- `tests/regular-platform-outcomes.test.js`

意图：普通平台 outcome 提交后触发数据失效，使文章管理及时刷新；失效回调失败只记安全诊断，不覆盖发布结果。

处理：`KEEP / 26-D INPUT`，已进入 `6fc897f`。这是直接正确性修复，继续属于 regular queue orchestrator owner；26-D 重组投稿中心时必须保留该不变量和测试，不得重新建立第二个刷新 writer。

### B. 需处理页面整理

文件：

- `media-workbench/src/components/content/ArticleAttentionPanel.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `tests/renderer-article-attention-actions.test.js`
- `handoffs/thread-7-attention-page-20260814.md`

意图：同一文章的多个 attention item 聚合为一张卡，保留事项身份和动作；增加客户、目标、原因、最近执行、打开文章和安全回收入口；需处理页不再同时渲染普通列表。

处理：`KEEP / 26-F + 26-H INPUT`，已进入 `c10a838`。聚合展示和事项身份分离符合新规格；旧 `retry-publication` 展示将在 26-F 改为回到统一发起投稿入口。删除入口必须在 26-G 改为仅消费新删除权限，不得恢复自动撤销队列。

已有 evidence：handoff 记录 renderer typecheck/build、相关 Playwright/Node tests、ESLint 和 `git diff --check` 通过；未执行全量 `npm test`。

### C. Legacy migration/current runtime artifact 识别与 recovery client identity

文件：

- `desktop/composition/workspace-migration-composition.js`
- `src/content/legacy-migration-planner.js`
- `src/content/legacy-migration-reader.js`
- `src/infrastructure/operational-store/internal/operational-store-recovery-aggregate.js`
- `tests/article-lifecycle-ticket-23-b.test.js`
- `tests/article-lifecycle-ticket-23-d.test.js`

意图：legacy scan 忽略当前 runtime 生成文章/批次，避免 stale detected journal 阻断；recovery projection 补充安全 client identity。

处理：`KEEP / PREEXISTING MIGRATION CORRECTNESS`，已进入 `6a9232b`。不属于 Ticket 26 产品实现，但 26-C 新 paid-staging migration 必须建立在这些修复之上；不得重写或删除。后续 migration 测试需同时覆盖 current runtime artifact 和 paid-staging retirement。

### D. 登录后 workspace runtime 启动与重复注册保护

文件：

- `desktop/ipc/auth-ipc.js`
- `desktop/main.js`
- `tests/auth-ipc-boundary.test.js`
- `tests/desktop-packaging.test.js`

意图：认证状态只在 workspace runtime 准备后广播；重复认证激活不重复注册 workspace bootstrap IPC。

处理：`KEEP / OUTSIDE TICKET 26`，已进入 `79dbe36`。属于 auth/runtime/packaging owner，Ticket 26 不修改这些文件；最终 packaging gate 必须继承其行为。

### E. 未跟踪打包输出

路径：`auto—publish/release-production-smoke-fix/`

内容：Electron unpacked build、二进制、locales、vendor 和 builder debug 等生成物。

处理：`GENERATED / DO NOT COMMIT / DO NOT EDIT`。目录未删除，根 `.gitignore` 已忽略该路径。任何 production source 变更后旧 smoke 输出不能证明新 HEAD。

## 4. 后续必须继承的基线文件

以下文件已含四个基线提交中的真实修复，后续工作包必须基于当前 integration HEAD 做最小 patch：

- `desktop/composition/regular-queue-group-composition.js`
- `desktop/composition/workspace-runtime-composition.js`
- `desktop/services/regular-queue-group-orchestrator.js`
- `media-workbench/src/components/content/ArticleAttentionPanel.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `tests/regular-platform-outcomes.test.js`
- `tests/renderer-article-attention-actions.test.js`

Ticket 26 不得修改 D 类 auth/runtime 文件；C 类 migration 文件只允许 26-C 在其直接 paid-staging migration 边界做最小增量。

## 5. Base state 与下一动作

- 已收口基线提交：
  - `6a9232b`：legacy migration 忽略当前 runtime artifacts；
  - `79dbe36`：认证广播等待 workspace runtime；
  - `6fc897f`：普通平台结果刷新与 client-scoped attention；
  - `c10a838`：需处理页面按文章聚合并保留独立动作。
- Ticket 26 实现线程必须从包含上述提交和 Ticket 26 计划文档的当前 integration HEAD 开始，不从旧 `e8edc3a` 重新实现。
- 下一串行工作包：`26-A — 文章库投影与权限合同`，由新的 Goal 主任务创建独立 project worktree 任务并严格串行调度。
- 26-A 在 production 修改前应先新增公开行为状态矩阵，覆盖五个文章库分类、独立 attention、付费预检不冻结、明确失败可编辑、不确定冻结和删除阻塞。
- 26-A 若需要一次性迁移 Renderer stage union，必须连同直接 read-model consumer 闭合，不能留下两个生命周期 owner 或长期兼容映射。

## 6. 26-0 验证边界

Ticket 26 规划本身只修改文档和调度真源；上列四个开始前既有修复已按独立意图验证并提交。规划要求的验证为：

- Markdown/文本 diff 无 whitespace error；
- 权威词汇与 SPEC 不再把付费处理中或需处理事项定义为文章阶段；
- SPEC、ADR、Ticket 26 和 Wave Plan 的顺序、owner 与状态一致；
- 最终 Git status 证明 production/test 基线已提交、Ticket 26 计划提交后 integration branch clean，生成物目录未纳入版本控制。
