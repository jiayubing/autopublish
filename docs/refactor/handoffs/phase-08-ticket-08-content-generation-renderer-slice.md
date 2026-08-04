# Ticket 08: Content 与 Generation Renderer Slice

状态：本地实现与定向回归完成；独立只读审计、修复和专项复审仍是本 ticket 的收口步骤。未提交、未推送。

范围：将 Content sources、Doubao collection、Generation article commands、article management、trash/removal 的 Renderer 查询、命令、失效订阅和生命周期收归分域 feature；View 只消费 snapshot/command seam。未改变 preload namespace、IPC channel、DTO/schema、application/service interface 或真实数据。

## Owner 与 symbol migration

| 责任 | 当前 owner | Renderer caller | bridge/type owner |
|---|---|---|---|
| 客户、模板、问题、research、Doubao queue/login | `features/content/content-sources-feature.js` | `use-content-workbench-feature.ts` → `QuestionCollectionView` / batch controls | `bridge/content.ts`；`types/content.ts` |
| 文章管理 snapshot、publication/history、submission batch commands | `features/content/article-management-feature.js` | `use-content-workbench-feature.ts` → `GeneratedArticlesView` | `bridge/content.ts` / `bridge/publication.ts`；`types/publication.ts` |
| article save/copy 与 generation batch | `features/generation/generation-feature.js`、content management command owner | `use-generation-feature.ts`、`use-content-generation-feature.ts`、history editor | `bridge/generation.ts`；`types/generation.ts` |
| trash、restore、permanent delete、removal transaction watch | `features/content/article-management-feature.js` | `GeneratedArticlesView`、`ArticleTrashPanel` | `bridge/content-removal.ts`；`types/publication.ts` |
| View decomposition | `QuestionBatchControls`, `QuestionResearchList`, `GeneratedArticlesList`, `ArticleTrashPanel` | parent Views only pass props/callbacks | no transport or storage ownership |

## Race and lifecycle matrix

| 场景 | owner guard | 结果 |
|---|---|---|
| workspace sources/query 连续刷新 | `workspaceSources` query identity | 旧客户/模板结果不覆盖新 scope |
| 当前客户切换中的 questions/research | `clientSources` + requested client check | 旧客户结果丢弃；当前 snapshot 清空后再填充 |
| 全客户 research index 与当前客户读取交错 | `researchIndex` + per-client research version | 旧 bulk index 不覆盖较新的当前客户 research |
| queue query 与 queue event 竞态 | `doubaoQueue` identity；event invalidates query | event 保留，旧 query 忽略 |
| queue/login command 在客户切换期间完成 | workspace-scoped queue/login token | background result 不因 UI client scope 变化丢失；workspace 切换仍丢弃 |
| completed queue 重复事件 | status transition + queue refresh key | completion refresh 只执行一次，空队列重复完成也去重 |
| removal event 与 query 同时返回终态 | removal watch token + terminal token dedupe | management refresh 每次 watch 只触发一次 |
| removal query 返回不存在 | removal watch clears missing transaction | 不把回收站操作永久卡在 open transaction |
| client/workspace switch、dispose/remount | feature query identities、command owners、subscription disposer | stale result 不回写；queue/removal subscriptions 释放 |

## Legacy/compatibility remaining

- Content/Generation production Views、`features/content` 和 `ContentWorkbench.tsx` 已迁移到 domain type owners；目标范围扫描无 `types.ts`、直接查询 bridge 或旧 generation/removal bridge caller。
- `bridge/content.ts` 仍保留 generation、removal 兼容 re-export 及旧 content core wrapper，供 Ticket 07/当前跨域 caller 和历史 contract 使用；代码中的兼容段位于该文件末尾，不能在 Ticket 10 前删除。
- `features/platform/platform-feature-context.tsx` 仍通过 `bridge/content-removal.ts` 使用跨域 queued-residue 清理；该 caller 由后续 platform/compatibility 收缩统一处理。
- `media-workbench/src/types.ts` 仍是纯 `export type * from "./types/index"` barrel；Content/Generation 本 ticket 的 production callers 已改用 `types/content.ts`、`types/generation.ts`、`types/publication.ts`，其余应用/平台/设置 callers 留给 Ticket 09。

## Verification recorded before independent audit

- `npm run typecheck:renderer`：通过。
- `npm run typecheck:bridge`：通过。
- Content/Generation/renderer contract、read-model、refresh lifecycle、confirmation、question editor、publication history 与新增 feature race 定向测试：通过。
- 新增 `tests/phase-08-content-renderer-feature-races.test.mjs`：queue/login scope switch、event/query race、completion dedupe、research index freshness、dispose、removal terminal/missing/scope switch 全部通过。
- `npm run build:renderer` 的既有单 chunk 大于 500KB warning 保持为非阻断提示；完整 `npm test`、`npm run lint`、`git diff --check` 和 Electron focus smoke 在本地最终收口阶段执行。

所有自动化 fixture 使用合成/临时数据；未访问真实 workspace、Cookie、账号、外部投稿、付费系统或生产数据。本 ticket 不自动提交。
