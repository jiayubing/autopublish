# 投稿队列刷新闭环与文章需处理动作修复计划

**日期：** 2026-07-19

**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`

**源代码：** `F:\官媒投稿\auto—publish`

**内容工作区：** `F:\1`

**基线提交：** `6c771e7 fix: recover removal transactions and validate Hepan payloads`

**前置计划：** `docs/superpowers/plans/2026-07-19-article-attention-live-queue-and-management-workflow-plan.md`

**实现状态：** 前置计划已经实现并打包，但仍位于未提交工作树中。开始本轮修复前必须先提交或建立可追溯快照，禁止 reset/checkout 覆盖现有实现。

**目标：** 修复“其他平台投稿”待发布文章持续刷新，以及文章管理“需处理”项目显示后动作不可用的问题；补齐真实 React 生命周期、真实动作能力和 revision 失效测试。

诊断阶段只读取真实工作区的安全状态，没有执行清理、重试、核对、删除或真实投稿。临时浏览器诊断脚本已删除。

---

## 1. 结论摘要

| 问题 | 已确认根因 | 证据 | 优先级 |
| --- | --- | --- | --- |
| 待发布文章持续刷新 | `usePlatformQueue()` 每次 render 返回新的 `refresh` 闭包；PlatformWorkbench 的 `loadQueue` 和 effect 依赖该函数。每次 refresh 更新 snapshot，引发 render 和下一次 refresh。 | 真实 Renderer 生命周期探针在进入投稿页后 1 秒调用 `getQueue` 462 次，正常上限应为 3 次。 | P0 |
| 页面进入还会额外 terminal refresh | `getPlatformState()` 初始返回 `idle`，当前实现把初始 idle 当作 terminal，立即再次 refresh；平台状态订阅也因 refresh 函数变化不断退订/重订。 | `applyPlatformState()` 对 `idle` 执行 `refreshQueue("submit-terminal")`，effect 依赖不稳定的 `refreshQueue`。 | P0 |
| 需处理动作全部不匹配 | Query 为所有 `failed_submission` 固定暴露 `cleanup/retry/inspect`，没有依据 batch、pair、文章状态和 Resolver 能力计算动作。 | 当前 5 项全部无 batchId；cleanup 均得到 `SUBMISSION_QUEUE_ITEM_NOT_FOUND`，retry 均得到 `ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE`。 | P0 |
| “查看差异”没有反应 | ArticleAttentionPanel 对 inspect/open-publication 只调用可选 `onOpenPublication`，GeneratedArticlesView 没有传入该回调。 | 5 项 inspect 均只能返回 inspection_required，界面没有导航处理器。 | P0 |
| 历史失败被误判为当前需处理 | Query 无条件把全部 failed publication 加入 attention；其中已删除文章也被列入当前操作中心。 | 当前 5 条 failed 中 3 条文章仍为 saved，2 条已经 removed。 | P1 |
| revision 不能反映外部变化 | Query 使用自己的 localRevision；主进程工作区失效 revision 没有注入 Query，只有 Resolver 成功后才调用 query.invalidate。 | 投稿、删除事务和队列变化可广播失效事件，但 Query revision 仍可能保持 1。 | P1 |
| 测试误绿 | 新增测试主要是源码正则和纯 store seam，没有挂载真实 PlatformWorkbench，也没有驱动 failed publication 的按钮。 | 8 项专项测试全部通过；运行级探针和真实数据动作探针均为 RED。 | P0 |

---

## 2. 已完成的反馈循环

### 2.1 打包版与当前实现一致

以下内容哈希一致：

- `media-workbench/dist/index.html`
- Renderer 主 bundle
- `desktop/services/article-attention-query.js`
- `desktop/services/article-attention-resolver.js`

因此问题不是漏打包。

### 2.2 队列刷新运行级复现

使用当前真实 Renderer 构建、Playwright 和内存 Electron fixture：

```text
打开应用
进入“其他平台投稿”
统计 1 秒内 platforms.getQueue 调用次数
```

结果：

```text
RED platform-queue-refresh-call-count=462 expected<=3
```

该探针没有访问真实队列，没有发起投稿，5.1 秒完成。它直接驱动 React、WorkspaceDataProvider、App、Sidebar 和 PlatformWorkbench 的真实生命周期。

### 2.3 需处理真实状态复现

使用真实只读 publication ledger 构造 Query，再用无写入 Resolver adapter 验证每个公开动作：

```text
需处理项：5
kind：failed_submission × 5
hasBatch：false × 5
hasAttempt：true × 5

cleanup -> SUBMISSION_QUEUE_ITEM_NOT_FOUND × 5
retry   -> ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE × 5
inspect -> inspection_required_no_navigation_handler × 5
```

文章状态分布：

```text
saved：3
removed：2
```

这说明 Query 的静态 allowedActions 与 Resolver 的实际能力不一致，并且历史记录没有与当前待办区分。

### 2.4 现有测试缺口

当前通过的测试：

```text
article-attention-query：2
article-attention-resolver：2
renderer-article-management-flow：1
renderer-platform-queue-refresh：1
workspace-data-invalidation：2
```

缺口：

- Renderer 队列测试只检查源代码包含 `usePlatformQueue` 和 `refreshQueue("submit-terminal")`。
- 没有计算 1 秒内 loader 调用次数。
- 没有验证 refresh 函数引用稳定。
- Query 测试没有 publication-only failed fixture。
- Resolver 测试只覆盖 missing-pair finalize，没有覆盖 failed_submission。
- 文章管理测试只做源码正则，没有点击任何 attention action。
- 没有验证 inspect/open-publication 能打开可见详情。
- 没有验证 removed failed 是否从当前 attention 排除。

---

## 3. 根因链路

### 3.1 React 刷新闭环

```text
usePlatformQueue render
  -> 返回新的 refresh closure
  -> PlatformWorkbench loadQueue useCallback 变化
  -> mount/依赖 effect 再执行
  -> store.refresh 设置 loading + emit
  -> useSyncExternalStore 触发 render
  -> 返回下一份 refresh closure
  -> 重复
```

`inFlight` 只能合并同一请求进行期间的调用；请求完成后 effect 会再次启动新请求，因此不能终止闭环。

另外：

```text
getPlatformState() -> idle
  -> 被当作 terminal
  -> refreshQueue("submit-terminal")
```

初始 idle 不是一次任务完成事件，不应触发 terminal refresh。

### 3.2 Attention Query 用 kind 静态决定动作

当前：

```text
failed_submission
  -> [cleanup, retry, inspect]
```

但 failed publication 至少有三种不同事实：

1. 有可清理 batch/pair 的失败队列项。
2. 文章仍存在且已审核，可创建新 attempt 重新入队。
3. 文章已删除且没有 residue/transaction，只是需要保留的历史失败记录。

三者不能共享同一 allowedActions。

### 3.3 Resolver 没有与 Query 共用能力策略

- cleanup 需要 batchId、publicationId、attemptId 和可清理 pair。
- retry 当前只实现 removal_needs_repair。
- failed publication 没有 retry 委托路径。
- inspect/open-publication 只返回导航意图，不执行数据动作。

Query 不知道这些约束，Resolver 又在点击后才拒绝，导致界面展示“看起来可用、实际必失败”的按钮。

### 3.4 Attention 视图混入发布历史

failed 是有效的长期发布历史，不等于当前必须处理。文章已删除且没有队列残留、删除事务或 uncertain 结果时，failed record 应留在发布详情/回收站只读历史中，不应继续占用“需处理”模块。

### 3.5 UI 导航 seam 未接通

```text
ArticleAttentionPanel
  -> onOpenPublication?.(item)

GeneratedArticlesView
  -> 未传 onOpenPublication
```

可选回调把 wiring 错误静默变成 no-op。对于界面承诺存在的动作，回调不应是可选的无声失败。

### 3.6 Query revision 与工作区 revision 分裂

主进程已有：

```text
workspace:data-invalidated { revision, scopes, reasonCode }
```

Query 却使用独立 localRevision。内容服务或删除事务改变 attention facts 后，Renderer 会收到失效事件，但 preview/resolve 的 expectedRevision 不一定变化，无法可靠阻止过期动作。

---

## 4. 目标设计

### 4.1 WorkspaceDataStore 必须返回稳定 interface

`usePlatformQueue()` 使用 `useCallback/useMemo` 返回稳定方法：

```text
const refresh = useCallback(
  reason => store.refresh(PLATFORM_QUEUE_SCOPE, reason),
  [store]
)
```

返回对象也可 `useMemo`，但关键是 `refresh` 引用只在 store 变化时改变。

### 4.2 Provider 负责首次加载，页面不重复 mount refresh

推荐唯一规则：

- App/Provider 的首次 `usePlatformQueue()` 负责 initial load。
- PlatformWorkbench mount 不再无条件调用 loadQueue。
- “刷新队列”按钮显式调用 refresh。
- workspace invalidation 由 Provider 调用 refresh。
- 投稿任务真正 terminal 后使用 invalidation revision 刷新。

若保留页面 mount 兜底，只能在 snapshot `revision=0 && !loading` 时执行，且依赖必须稳定。

### 4.3 初始 idle 不能当作 terminal

PlatformWorkbench 保存是否观察过本轮运行：

```text
seenRunning = running / waiting / stopping

只有：
seenRunning=true
且 next phase=completed/failed/stopped/idle
```

才允许 terminal refresh。更推荐只依据主进程显式 terminal event 的 `queueRevision`，不从普通 idle 推断。

### 4.4 Attention 动作由共享 policy 派生

新增纯函数模块：

```text
deriveAttentionPolicy(facts, capabilities)
  -> kind
  -> recommendedAction
  -> allowedActions
  -> exclusionReason
```

Query 和 Resolver 都调用同一 policy。Resolver 在执行前重新读取 facts 并再次派生，禁止单独维护第二套动作判断。

动作矩阵：

| facts | 是否进入 attention | allowedActions |
| --- | --- | --- |
| failed + cleanup binding + pair 可清理 | 是 | `cleanup`, `open-publication` |
| failed + active saved article + target 可重试 | 是 | `retry-publication`, `open-publication` |
| failed + active generated article | 是，但不可直接重试 | `open-article`, `open-publication` |
| failed + removed + 无 residue/transaction | 否 | 只留发布历史 |
| uncertain | 是 | `open-publication`, `reconcile-published`, `reconcile-failed` |
| needs_repair transaction | 是 | `retry-removal`, `inspect` |
| both_absent residue | 是 | `finalize` |
| content/identity conflict | 是 | `inspect`，再按预检提供动作 |
| published archive failed | 是 | `retry-archive`, `open-publication` |

不得展示 Resolver 当前不能执行或不能导航完成的动作。

### 4.5 为失败发布提供正式重试 interface

由 ContentSubmissionService 拥有：

```text
previewRetryFailedPublication({ publicationId })
retryFailedPublication({ publicationId, expectedRevision, confirmed })
```

它负责：

- publication 当前仍为 failed；
- 文章仍存在且 status=saved；
- target 仍支持 contentQueueImport；
- 当前没有 queued/submitting/submitted/uncertain；
- 通过现有 createBatch/reserve/rebind 流程创建新 attempt；
- 返回 batchId、publicationId、新 attemptId 和 changedScopes。

Resolver 只委托该 interface，不自行拼 batch 文件或直接写 ledger。

### 4.6 发布详情和差异详情必须有可见承接页

GeneratedArticlesView 向 ArticleAttentionPanel 传入必需导航 interface：

```text
onOpenPublication(item)
onInspect(item)
```

- active article：打开现有 PublicationHistoryDrawer。
- removed article：打开只读 AttentionDetailDrawer，显示标题快照、平台、状态、reasonCode 和发布时间线。
- queue conflict：详情显示 pairState、文件存在性、修改时间和安全 hash 前缀，不暴露绝对路径或正文。
- 如果当前视图无法提供处理器，按钮不应渲染，而不是点击无反应。

### 4.7 Attention snapshot 只加载一次并响应失效

当前 GeneratedArticlesView 和 ArticleAttentionPanel 分别调用 listArticleAttention。改为一个 `useArticleAttention(clientId)` 只读 snapshot：

```text
snapshot { revision, items, loading, error }
refresh(reason)
subscribe()
```

要求：

- refresh 方法引用稳定；
- articleAttention scope invalidation 后刷新一次；
- parent 用同一 items 派生 workflow stage；
- panel 使用同一 items 展示和执行；
- resolve 成功后依据 changedScopes 刷新；
- 卸载后清理订阅；
- 不复制 platform queue 的不稳定 closure 错误。

### 4.8 Query 使用工作区 authoritative revision

主进程创建一个 revision source：

```text
getWorkspaceDataRevision()
```

注入 ArticleAttentionQuery。所有能改变 attention facts 的动作先完成领域写入，再增加 workspace revision 并广播失效事件。Query 不再维护与工作区脱离的 localRevision；Resolver 使用同一 revision 校验 expectedRevision。

### 4.9 需处理数量与历史数量分开

- attention count：当前存在且能完成下一步的项目。
- publication history count：长期发布记录，不进入需处理徽标。
- removed failed history：只在回收站/发布详情显示。
- 相同 publication 同时被 residue 和 failed publication 捕获时，以更具体的 residue/transaction attention item 为 canonical，避免重复按钮。

---

## 5. 分阶段实施任务

### Task 0：把诊断探针升级为正式红色测试

**Create：**

- `tests/renderer-platform-queue-refresh-lifecycle.test.js`
- `tests/article-attention-policy.test.js`
- `tests/renderer-article-attention-actions.test.js`

**Modify：**

- `tests/renderer-platform-queue-refresh.test.js`
- `tests/article-attention-query.test.js`
- `tests/article-attention-resolver.test.js`
- `tests/workspace-data-invalidation.test.js`
- `scripts/verify.js`

实施：

- [ ] 真实挂载 Renderer，进入投稿页后等待 1 秒，断言 getQueue 总调用数 <=3。
- [ ] 断言静置第二秒调用数不增长。
- [ ] 手动刷新只增加一次调用。
- [ ] terminal invalidation 只增加一次调用。
- [ ] publication-only failed 无 batch 时不得出现 cleanup。
- [ ] active saved failed 必须出现 retry-publication，点击后委托正确领域 interface。
- [ ] removed failed 无其他风险时不得进入 attention。
- [ ] inspect/open-publication 点击后必须出现可见 drawer。
- [ ] 先记录 RED，再进入实现。

### Task 1：稳定 PlatformQueue interface 并删除重复刷新源

**Modify：**

- `media-workbench/src/workspace-data-store.tsx`
- `media-workbench/src/components/PlatformWorkbench.tsx`
- `tests/workspace-data-invalidation.test.js`
- `tests/renderer-platform-queue-refresh-lifecycle.test.js`

实施：

- [ ] 用 useCallback 固定 refresh 引用。
- [ ] Provider 成为 initial load 唯一所有者。
- [ ] 删除或严格守卫 PlatformWorkbench mount loadQueue effect。
- [ ] platform state effect 不因普通 render 重订阅。
- [ ] 初始 idle 不触发 terminal refresh。
- [ ] 使用显式 queueRevision 去重 terminal refresh。
- [ ] 错误、loading 和手动刷新保持现有反馈。

### Task 2：实现共享 Attention Policy

**Create：**

- `desktop/services/article-attention-policy.js`
- `tests/article-attention-policy.test.js`

**Modify：**

- `desktop/services/article-attention-query.js`
- `desktop/services/article-attention-resolver.js`
- `tests/article-attention-query.test.js`
- `tests/article-attention-resolver.test.js`

实施：

- [ ] 从 COPY 中移除静态 allowedActions。
- [ ] Query 聚合标准化 facts 后调用 policy。
- [ ] Resolver 执行前重新读取 facts 并调用同一 policy。
- [ ] 缺少必需身份或领域能力时不暴露对应动作。
- [ ] removed failed history 排除出 attention。
- [ ] residue/transaction 比普通 failed publication 优先并去重。
- [ ] error code 明确区分 action unavailable、stale 和 domain failure。

### Task 3：补齐失败发布重试领域 interface

**Modify：**

- `desktop/services/content-submission-service.js`
- `desktop/ipc/content-submission-ipc.js`
- `desktop/preload.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `desktop/services/article-attention-resolver.js`
- `tests/submission-batch-worker-integration.test.js`
- `tests/article-attention-resolver.test.js`

实施：

- [ ] 增加 previewRetryFailedPublication/retryFailedPublication。
- [ ] 复用 createBatch、reserve 和 attempt rebind，不复制实现。
- [ ] active saved 才允许重试。
- [ ] active/uncertain 状态继续阻止。
- [ ] 二次确认前显示文章、目标和历史失败次数。
- [ ] 成功后失效 platformQueue、articleAttention、navigationSummary。

### Task 4：接通详情导航和运行级交互

**Create：**

- `media-workbench/src/components/content/ArticleAttentionDetailDrawer.tsx`
- `tests/renderer-article-attention-actions.test.js`

**Modify：**

- `media-workbench/src/components/content/ArticleAttentionPanel.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/PublicationHistoryDrawer.tsx`
- `media-workbench/src/components/ContentWorkbench.tsx`

实施：

- [ ] onOpenPublication/onInspect 改为必需 interface 或按 capability 隐藏按钮。
- [ ] active article 打开发布详情。
- [ ] removed/conflict 打开只读详情。
- [ ] selectedAttentionId 自动定位、滚入视图并设置焦点。
- [ ] action 错误就近显示中文说明，不只输出内部 code。
- [ ] 处理完成后保持当前客户和 attention 阶段。

### Task 5：统一 Attention snapshot 和 authoritative revision

**Create：**

- `media-workbench/src/article-attention-store.tsx`
- `tests/article-attention-invalidation.test.js`

**Modify：**

- `desktop/main.js`
- `desktop/ipc/article-attention-ipc.js`
- `desktop/services/article-attention-query.js`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/ArticleAttentionPanel.tsx`
- `media-workbench/src/electron-api.ts`

实施：

- [ ] Query revision 读取主进程工作区 revision source。
- [ ] 所有 attention facts 变更都增加同一 revision。
- [ ] Renderer 单一 store 提供稳定 getSnapshot/refresh/subscribe。
- [ ] 去除 parent/panel 重复 list 请求。
- [ ] invalidation 合并同 revision 请求，拒绝旧响应覆盖。
- [ ] 增加卸载订阅和 StrictMode 双挂载测试。

### Task 6：真实数据副本与打包验收

- [ ] 复制当前 publication、submission-records、article-trash 和 generated 到临时工作区。
- [ ] 副本预期：3 个 active saved failed 可重试，2 个 removed failed 只保留历史。
- [ ] 不在副本执行真实远端投稿；retry 使用 fake adapter 并验证新 attempt/batch。
- [ ] cleanup 只对具有合法 batch/pair 的 fixture 出现。
- [ ] 启动打包版，投稿页静置 10 秒无持续转圈或重复 getQueue。
- [ ] 需处理每个可见按钮都有可见结果或确认流程。
- [ ] 删除临时探针和 debug 日志后再打包。

---

## 6. 测试矩阵

### 6.1 队列生命周期

| 场景 | getQueue 预期 |
| --- | --- |
| App 首次挂载 | 1 次 |
| 进入投稿页 | 0 或至多 1 次兜底 |
| 投稿页静置 2 秒 | 不增长 |
| 手动刷新 | +1 |
| 初始 idle | 不刷新 |
| running -> completed + 新 revision | +1 |
| 同 revision 重复 terminal 事件 | 不增长 |
| 页面卸载后 invalidation | 页面订阅不再调用 |

### 6.2 Attention Policy

| 事实 | 可见动作 |
| --- | --- |
| failed、无 batch、active saved | retry-publication、open-publication |
| failed、有可清理 pair | cleanup、open-publication |
| failed、removed、无风险 | 不进入 attention |
| failed、active generated | open-article、open-publication |
| uncertain | reconcile 两种结果、open-publication |
| both_absent residue | finalize |
| needs_repair | retry-removal、inspect |
| archive failed | retry-archive、open-publication |
| capability adapter 缺失 | 对应按钮不出现 |

### 6.3 用户交互

| 操作 | 预期 |
| --- | --- |
| 点击清理 | 只有合法 batch/pair 项可见并成功 |
| 点击重新投稿 | 预检、确认、创建新 batch/attempt |
| 点击发布详情 | 打开对应文章/发布记录 drawer |
| 点击查看差异 | 打开只读安全详情 |
| 点击 removed 历史 | 不作为需处理项出现 |
| 外部状态变化 | revision 增加，列表刷新一次 |

---

## 7. 验证命令

```powershell
node --test `
  tests/renderer-platform-queue-refresh-lifecycle.test.js `
  tests/workspace-data-invalidation.test.js `
  tests/article-attention-policy.test.js `
  tests/article-attention-query.test.js `
  tests/article-attention-resolver.test.js `
  tests/article-attention-invalidation.test.js `
  tests/renderer-article-attention-actions.test.js `
  tests/submission-batch-worker-integration.test.js
```

```powershell
npm test
npm run build:renderer
npm run verify
npm run pack:alpha
```

原始反馈必须转为：

```text
GREEN platform-queue-refresh-call-count<=3
GREEN platform-queue-idle-second-no-growth
GREEN failed-attention-actions-match-capabilities
GREEN removed-failed-history-excluded
GREEN inspect-and-publication-navigation-visible
```

---

## 8. 提交顺序

1. `test: reproduce platform refresh loop and unusable attention actions`
2. `fix: stabilize platform queue refresh lifecycle`
3. `fix: derive attention actions from current capabilities`
4. `feat: retry active failed publications through submission service`
5. `fix: connect attention details and publication navigation`
6. `fix: share attention snapshots and workspace revisions`
7. `docs: document actionable attention and refresh semantics`
8. `chore: package and verify attention remediation`

---

## 9. 最终验收标准

- [ ] 投稿页静置时不再持续转圈。
- [ ] 进入投稿页后 1 秒 getQueue 调用不超过 3 次，第二秒不增长。
- [ ] 初始 idle 不触发 terminal refresh。
- [ ] 手动刷新和真实 terminal 各只刷新一次。
- [ ] Query 不再为每个 failed publication 固定返回 cleanup/retry/inspect。
- [ ] 当前 3 个 active saved failed 显示可执行的重新投稿/发布详情。
- [ ] 当前 2 个 removed failed 不再占用需处理模块，发布历史仍完整保留。
- [ ] cleanup 只在具有合法 batch/pair 身份时出现。
- [ ] 所有可见动作都能完成、打开详情或给出明确错误，不存在 no-op 按钮。
- [ ] Query 与 workspace invalidation 使用同一 authoritative revision。
- [ ] 文章阶段与 AttentionPanel 使用同一 snapshot，不重复请求。
- [ ] 运行级 Renderer 测试替代关键源码正则断言。
- [ ] 全量测试、verify、Renderer build 和打包验收通过。

---

## 10. 非目标与数据保护

- 不在诊断或自动化测试中重试 `F:\1` 的真实失败投稿。
- 不删除当前 5 条 failed publication 历史或 attempts。
- 不把 removed failed 历史改写为成功；只是不再把它当作当前待办。
- 不因为修复刷新闭环取消正常的手动刷新和 terminal refresh。
- 不用防抖掩盖 effect 闭环；必须先稳定函数引用和事件语义。
- 不让 ArticleAttentionResolver 自行拼写 batch JSON 或直接修改多个 store。
- 不为不可执行动作保留“占位按钮”。
- 不在详情中输出正文、Cookie、绝对路径、完整 hash 或远端完整响应。
- 不修改蓝色河畔 POST、发布间隔和 AI 内容生成协议。
