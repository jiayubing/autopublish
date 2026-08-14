# 26-A — 文章库投影与权限交接

## 状态

- 状态：完成，等待 integration branch 合并。
- 工作包基线：`029eb0743fa894cbf098bd7082d4a2a4f5c7cebc`。
- 本包提交：由最终 Git handoff commit 记录，见主任务交接报告。
- 范围：文章生命周期批量投影、文章管理 snapshot/IPC DTO、文章库筛选与直接行为测试；未修改 schema、writer、平台远端调用或真实账号数据。

## 公开状态矩阵

| 事实组合 | 公开分类 | 编辑 | 投稿 | 回收 | 说明 |
| --- | --- | ---: | ---: | ---: | --- |
| 完整文章、无运行事实 | `pending_submission` / 待投稿 | 是 | 是 | 是 | `submit` 允许 |
| 标题或正文不完整、无运行事实 | `needs_completion` / 待完善 | 是 | 否 | 是 | 稳定 reason code：`ARTICLE_CONTENT_INCOMPLETE` |
| 普通队列、已确认付费批次、活动订单 | `in_submission` / 投稿中 | 否 | 否 | 否 | 同一投影冻结；订单摘要单独输出 |
| 结果不确定、未知状态、订单缺失/未知、多个活动目标、删除修复中 | `in_submission` / 投稿中 | 否 | 否 | 否 | 保留人工核对 reason code，禁止自动重试 |
| 明确失败/退稿/售后且目标已结束 | 按内容完整性为待投稿或待完善 | 按内容 | 按内容 | 是 | 需处理数量不改变文章分类 |
| 首次可信发布成功，含迟到退稿/售后/未知观察 | `published` / 已发布 | 否 | 否 | 否 | 永久只读，发布事实优先 |
| 回收事实、无活动/发布冲突 | `trash` / 回收站 | 否 | 否 | 否 | `restore`、`purge` 由同一 owner 允许 |
| 回收事实仍有活动/发布冲突 | `trash` / 回收站 | 否 | 否 | 否 | attention 保留，`restore`/`purge` fail-closed |

`paid_processing`、`failed` 仅保留为运行事实或摘要状态，不再作为文章库公开分类。`attentionCount`/`attentionCounts` 和 `orderSummary`/`orderSummaries` 是投影的独立字段。

## Contract before / after

Before：文章管理公开六阶段 `pending_submission | queued | paid_processing | failed | published | trash`，并以 `canQueue`/`operations.queue` 承载主要投稿决策；`failed` 同时承担文章分类与需处理入口。

After：唯一 owner `src/content/article-lifecycle-projection.js` 输出五个文章分类，并在同一 workflow DTO 中输出 `edit`、`submit`、`trash`、`restore`、`purge` 决策、reason codes、attention count、order summary 和批量 navigation counts。`ArticleStageTabs` 将需处理作为独立 `attention` 筛选值，不把它加入文章分类枚举。

## 直接 owner 与消费者

- Owner：`auto—publish/src/content/article-lifecycle-projection.js`、`article-lifecycle-facts.js`。
- Snapshot/transport：`desktop/services/article-management-snapshot.js`、`desktop/ipc/contracts/article-management-contracts.js`、`media-workbench/src/bridge/content.ts`、`media-workbench/src/types/publication.ts`。
- Renderer consumers：`media-workbench/src/article-workflow.ts`、`ArticleStageTabs.tsx`、`ContentWorkbench.tsx`、`GeneratedArticlesView.tsx`、`GeneratedArticlesList.tsx` 及其 types/feature empty snapshot。
- Direct regression consumers：regular queue、paid-media preflight、operational-store lifecycle、Ticket 25-B/D acceptance 和 attention renderer fixture 均已同步公开阶段断言；运行事实中的 queue/order/failure statuses 未被删除。

## 短期迁移字段与 26-H 删除点

- `workflow.operations.queue` 与 `workflow.locks.canQueue` 是 `submit`/`canSubmit` 的同一对象/决策派生字段，不是第二 writer 或第二状态机。当前唯一直接生产消费者为：
  - `desktop/services/regular-queue-application.js`；
  - `desktop/services/paid-media-preflight-service.js`；
  - `src/content/internal/article-mutation-admission.js`；
  - `media-workbench/src/components/content/GeneratedArticlesView.tsx` 的旧 DTO fallback；
  - `desktop/ipc/contracts/article-management-contracts.js` 的 transport fallback。
- `operations.retarget` 保留现有结束目标后的 retry/admission 消费者，不改变其事实 owner。
- 26-H 文章库/投稿中心迁移完成后，统一把上述消费者切到 `submit`，删除 `queue`、`canQueue` 及 IPC/renderer fallback；同时按 retry contract 删除不再有真实消费者的 `retarget` seam。26-A 不为这些字段新增兼容层或旁路 writer。

## 实际验证

- `npm ci --ignore-scripts`（`auto—publish`、`auto—publish/media-workbench`）：成功；仅产生 ignored `node_modules`，npm 报告既有 audit warnings。
- `node --test tests/phase-03-six-stage-article-lifecycle.test.js tests/article-management-filter-model.test.js tests/article-management-snapshot.test.js tests/ticket-25-b-lifecycle-acceptance.test.js`：18/18 通过。
- `node --test tests/phase-06-content-core-typed-ipc.test.js tests/phase-07-regular-queue.test.js tests/article-mutation-coordinator.test.js`：46/46 通过。
- `node --test tests/ticket-24-c-runtime-outcome-vocabulary.test.js tests/phase-04-operational-store-lifecycle.test.js tests/ticket-25-d-paid-media-acceptance.test.js`：18/18 通过。
- Renderer：`node --test tests/renderer-article-management-filters.test.js tests/renderer-article-management-flow.test.js tests/renderer-content-client-switch.test.js tests/renderer-history-editor-flow.test.js tests/renderer-article-attention-actions.test.js`：9/9 通过；其中包含 Vite build/preview 和独立需处理筛选交互。
- `npm run typecheck:bridge`、`npm run typecheck:renderer`（根 `auto—publish`）：均通过。
- 关键 owner JS：`node --check src/content/article-lifecycle-projection.js; node --check src/content/article-lifecycle-facts.js; node --check desktop/services/article-management-snapshot.js; node --check desktop/ipc/contracts/article-management-contracts.js`：通过。
- `git diff --check`：通过。

首次在依赖安装前运行定向测试时，环境缺少 `@noble/hashes/sha2.js`；完成既有 lockfile 的 `npm ci --ignore-scripts` 后重跑通过。未运行完整 `npm test`、打包发布 gate、真实登录/投稿/付费/订单同步；这些不属于本包允许的真实副作用，且完整发布 gate 留给 integration wave。

## Primary Audit

审计范围：本工作包 diff、上述 owner/transport/renderer 直接消费者、公开状态矩阵、schema/IPC 投影、并发/不确定结果/回收冲突权限和直接回归测试。

初始 finding：

1. P1（已修复）：带可信订单号和活动供应商状态、但缺失媒体目标字段的残缺订单观察，原实现未进入 `hasActiveOrder`，会错误落到待投稿并允许编辑/投稿。owner 现按订单身份与活动状态冻结为 `in_submission`，并加入状态矩阵回归。
2. P2（已修复）：renderer attention fixture 和少数直接公开阶段回归仍使用旧 `failed`/`paid_processing`/`queued` stage，无法证明新 DTO 合同。已同步为五分类/独立 attention fixture，并重跑相关测试。

其他未发现 P0/P1/P2 blocking finding；未修改 schema/writer、远端副作用或独立生命周期 owner。

## Bounded re-audit

仅复查上述两个 finding 的修复 diff、活动残缺订单状态矩阵、旧公开 stage fixture 搜索、IPC/renderer types、attention tab 交互和直接回归：均通过。新 head 的最终测试与 Git evidence 以提交前最后一次运行结果为准。

## 剩余风险

- 真实第三方订单/发布结果与生产数据未验证；未知/超时结果仍依赖现有 attention/manual-resolution 链路。
- `queue`/`canQueue`/`retarget` 短期迁移字段仍存在，已限制为同一 owner 派生并登记 26-H 删除点。
- 完整 repository test/packaging/release gate 尚未在本包运行。
