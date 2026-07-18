# 文章异常处理中心、实时队列刷新与文章管理流程优化计划

**日期：** 2026-07-19

**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`

**源代码：** `F:\官媒投稿\auto—publish`

**内容工作区：** `F:\1`

**基线提交：** `6c771e7 fix: recover removal transactions and validate Hepan payloads`

**前置计划：** `docs/superpowers/plans/2026-07-18-removal-recovery-and-hepan-python-payload-regression-plan.md`

**目标：** 修复残留项只能提示“独立人工核对”却无处理入口、主导航徽标不刷新、投稿结束后队列仍显示旧快照的问题；同时把分散在历史文章、投稿队列、发布详情和删除事务中的文章操作收敛成清晰的“下一步操作”流程。

本计划只定义修复、重构、测试和数据恢复步骤。诊断阶段没有删除或改写真实文章、队列、发布账本、批次、回收站和删除事务，也没有发起任何真实投稿。

---

## 1. 结论摘要

| 问题 | 已确认根因 | 当前证据 | 优先级 |
| --- | --- | --- | --- |
| 残留清理只显示“需独立人工核对” | `SUBMISSION_QUEUE_CHANGED` 把“文件被修改”“只缺一个文件”“主文件与 sidecar 都已不存在”混成同一状态；Renderer 只显示数量和一句提示，没有异常项列表、差异说明或处理入口。 | 真实工作区有 1 个 reported residue，账本为 `failed`，主文件和 sidecar 均不存在。 | P0 |
| 删除事务仍需修复 | `evaluateItemAction()` 先要求 `unchanged=true`；即使失败项的两个队列文件都已不存在，也拒绝把它视为已清理并幂等更新批次。 | 真实工作区有 1 个 `needs_repair / SUBMISSION_QUEUE_CHANGED` 事务；其 cleanup 动作对应的主文件和 sidecar 均不存在，batch item 仍为 `failed`。 | P0 |
| 主导航徽标不刷新 | `App.tsx` 仅在首次挂载时调用一次 `getPlatformQueue()` 并保存 `platformArticles`；投稿页内部另有一份私有 queue state，二者没有共享快照或失效事件。 | `setPlatformArticles()` 在 App 中仅出现一次；界面侧栏当前显示“其他平台投稿 2”。 | P0 |
| 投稿完成后成功文章仍显示 | 平台 worker 完成后只广播 `platform-state` 空闲；`handleSubmit()` 只展示结果，不重新扫描队列；`PlatformWorkbench` 也没有在 terminal state 上调用 `loadQueue()`。 | 红色检查确认 `handleSubmit` 的成功/失败收尾均不存在 `await loadQueue()`。 | P0 |
| 文章管理混乱繁琐 | 文章审核、入队、撤销、失败清理、发布核对、删除事务修复和残留清理分散在两个主页面及多个局部提示中；用户必须理解 batch、ledger、transaction 才知道下一步。 | `GeneratedArticlesView` 同时承担文章列表、批次操作、发布记录、回收站和删除事务；残留修复却位于 `PlatformWorkbench`。 | P1 |
| 现有测试误绿 | 测试覆盖 busy/finally、历史 failed attempt 和一般 needs_repair 恢复，但未覆盖 pair 双缺失、跨页面共享队列状态和人工处理闭环。 | 18 项相关测试全部通过，新的统一检查连续两轮均为 `4/4 RED`。 | P0 |

---

## 2. 已完成的复现与证据

### 2.1 打包版与工作文件一致

以下文件或构建产物的 SHA-256 一致：

- `desktop/services/content-submission-service.js`
- `src/content/article-removal-service.js`
- `media-workbench/dist/index.html`
- Renderer 主 bundle `index-viAb48Aa.js`

因此当前问题不是漏打包，而是基线实现本身仍存在状态分类和刷新缺口。

### 2.2 打包版只读界面状态

Windows 可访问性树显示：

```text
其他平台投稿 2
付费媒体投稿 0
投稿订单记录 0
数据已就绪
```

桌面控制权限不允许点击，但只读界面结构、真实磁盘状态、IPC 和 Renderer 代码足以建立无人值守反馈回路。

### 2.3 真实残留与删除事务

只读取安全字段得到：

```text
reported residue：1
reasonCode：SUBMISSION_QUEUE_CHANGED
ledger status：failed
batch item status：failed
主文件存在：false
sidecar 存在：false

needs_repair transaction：1
errorCode：SUBMISSION_QUEUE_CHANGED
queue action：cleanup
动作主文件存在：false
动作 sidecar 存在：false
```

这两项都不是“文件内容已变化”的证据，而是“队列文件对已经完全不存在，但批次/事务还没有收尾”。当前 evaluator 把它们错误归入人工冲突。

### 2.4 当前队列与发布存储

安全计数：

```text
.autopublish/input：2 个 DOCX
.autopublish/published：3 个文章文件
发布账本：published 3，failed 5
```

已成功且受账本跟踪的批次项对应文件已经不在 input。用户看到成功项仍在页面，主要是 Renderer 使用投稿前快照；不能把页面旧列表直接解释为磁盘归档失败。

仍需单独处理的真实归档失败必须以 result 中的 `archiveError` 和重新扫描结果为准，不能只看远端 `published`。

### 2.5 确定性红色反馈

使用真实工作区只读状态和当前源码，连续运行两轮：

```text
RED manual-review-has-actionable-route
  reportedCount=1
  reason=SUBMISSION_QUEUE_CHANGED

RED missing-pair-cleanup-is-idempotent
  reason=SUBMISSION_QUEUE_CHANGED
  fileExists=false
  sidecarExists=false
  itemStatus=failed

RED sidebar-badge-shares-live-queue-state
  initialOnly=true

RED successful-submit-refreshes-queue
  refreshAfterSubmit=false

SUMMARY 4/4 RED
```

两轮结果完全一致，单轮小于 1 秒，不写磁盘、不启动远端、不需要人工点击。

### 2.6 现有测试为什么没有拦截

以下相关测试全部通过：

```text
article-removal-recovery-regression：4/4
platform-workbench-service：4/4
renderer-history-editor-flow：5/5
renderer-residue-cleanup-flow：5/5
```

缺口：

- failed cleanup fixture 都保留完整主文件和 sidecar，没有测试“两者均不存在”。
- residue Renderer 测试只验证错误提示和 busy 结束，没有验证用户是否能进入处理页并完成处理。
- PlatformWorkbench 测试没有驱动“提交成功 -> 后端队列已变化 -> 页面和徽标更新”。
- App 与 PlatformWorkbench 各自持有状态，没有共享状态的测试 seam。
- `desktop-task-service` 的 batch 任务完成会发送 `queue-updated`，平台投稿完成不会发送等价失效事件。

---

## 3. 根因链路

### 3.1 `unchanged` 布尔值丢失了关键状态

当前 evaluator 的核心判断：

```text
pairIsUnchanged(...) -> boolean

false
  -> SUBMISSION_QUEUE_CHANGED
  -> needs_repair / reported residue
```

但 `false` 实际包含至少六种不同情况：

1. 主文件和 sidecar 都存在且完全匹配。
2. 主文件和 sidecar 都不存在。
3. 主文件存在、sidecar 不存在。
4. 主文件不存在、sidecar 存在。
5. 两者都存在，但正文 hash 已变化。
6. 两者都存在，但 sidecar 身份属于其他批次、发布记录或 attempt。

只有 5、6 是明确的冲突；2 在 failed cleanup 场景中是已经完成物理删除、只差元数据收尾的幂等状态。使用一个布尔值导致安全动作和危险动作无法区分。

### 3.2 人工核对不是一个可执行流程

当前 Renderer 只保留：

```text
{ cleanableCount, reportedCount }
```

点击后只显示：

```text
存在冲突，需独立人工核对
```

虽然 IPC 已返回 `reportedItems` 和 `reasonCode`，界面没有展示：

- 哪个文章/批次/平台有问题；
- 是文件缺失、文件修改、结果待确认还是正在投稿；
- 应去“历史文章”“发布详情”还是其他页面；
- 哪些动作是安全的；
- 操作完成后如何返回并继续删除事务。

提示没有 interface，只把实现细节和决策成本转嫁给用户。

### 3.3 队列状态存在两个互不相干的所有者

```text
App
  -> mount 时 getPlatformQueue()
  -> platformArticles 数字
  -> Sidebar badge

PlatformWorkbench
  -> mount 时 getPlatformQueue()
  -> queue 列表
  -> 手动刷新按钮
```

投稿完成只更新 `PlatformWorkbench.isSubmitting`，不会更新两份 queue 快照。即使在投稿页内手动刷新，App 的 badge 仍不会变化。

### 3.4 平台 worker 没有数据失效语义

`desktop-task-service.startBatch()` 在 finally 中发送 `queue-updated`；`startPlatformSubmit()` 的 finally 只执行：

```text
isPlatformRunning = false
emitPlatformState()
```

调用方只能知道任务停了，不知道哪些数据已变化，也无法区分：

- 全部远端成功且本地归档成功；
- 远端成功但归档失败；
- 部分失败，文件仍应留在队列；
- 用户停止，未开始项仍在队列。

### 3.5 文章管理按存储模块组织，而不是按用户下一步组织

用户面对的是一篇文章，但界面要求在不同位置理解：

- 文章审核状态；
- 投稿批次项状态；
- 每个平台的发布记录；
- 发布尝试；
- 队列文件和 sidecar；
- 删除事务；
- 回收站。

这些领域状态应该继续分开保存，但 UI 不应让用户先理解所有内部对象。需要从这些状态派生“当前阶段”和“建议下一步”，并把具体操作集中到一个入口。

---

## 4. 目标设计

### 4.1 用结构化 `pairState` 替代 `unchanged`

在投稿队列动作模块内部增加：

```text
inspectSubmissionPair(item, batch, sidecar)
  -> state
  -> identityMatched
  -> contentMatched
  -> mainExists
  -> sidecarExists
  -> reasonCode
```

稳定状态：

| pairState | 含义 | 默认处理 |
| --- | --- | --- |
| `intact` | 主文件、sidecar、身份、hash 全部匹配 | 允许按账本状态执行 cancel/cleanup |
| `both_absent` | 主文件和 sidecar 均不存在 | 对匹配的 failed cleanup 幂等收尾；对最新 queued 可取消 reservation |
| `main_absent` | 只有 sidecar | 身份匹配时可预检为“清理孤立 sidecar”；否则进入需处理 |
| `sidecar_absent` | 只有主文件 | 不自动删除主文件；进入需处理 |
| `content_changed` | 主文件 hash 已变化 | 不自动删除；进入需处理 |
| `identity_conflict` | sidecar 属于其他 batch/publication/attempt | 不自动修改；进入需处理 |
| `unsafe_path` | 路径越界、链接或非普通文件 | 阻止并报告 |

`unchanged` 可作为兼容派生字段保留一版，但 evaluator、预检和执行必须只依赖 `pairState`。

### 4.2 双缺失是幂等收尾，不是人工冲突

failed cleanup 满足以下条件时，即使 pair 为 `both_absent` 也允许执行：

- batch item 的 client/article/target/publication/attempt 身份一致；
- publication record 当前为 `failed`；
- action attempt 是该记录中的历史 failed attempt；
- 当前不存在 `queued/submitting/submitted/uncertain` 活跃状态；
- batch item 尚未是 `failed-cleaned`。

执行结果：

```text
不再 unlink 文件
batch item -> failed-cleaned
publication ledger 保持 failed，所有 attempts 保留
删除事务继续进入 article move
返回 idempotent=true, physicalFilesAlreadyAbsent=true
```

queued cancellation 的双缺失只在 attempt 为最新 queued 且没有远端开始证据时允许；必须先将账本 attempt 标为 cancelled，再更新 batch。

### 4.3 “需处理中心”拆成 Query 与 Resolver 两个深模块

不能创建一个同时读取所有存储、判断状态并直接写多个 JSON 的万能 `ArticleAttentionService`。在 attention seam 内部拆成两个职责稳定的深模块，对 Renderer 仍呈现很小的 interface：

```text
ArticleAttentionQuery
  list({ clientId? })
  get({ attentionId })

ArticleAttentionResolver
  preview({ attentionId, action })
  resolve({ attentionId, action, expectedRevision, confirmed })
```

建议模块：

- `desktop/services/article-attention-query.js`
- `desktop/services/article-attention-resolver.js`
- `desktop/ipc/article-attention-ipc.js`
- `media-workbench/src/article-attention.ts`

Query 只构建只读模型，不写数据；Resolver 不直接编辑 store 或 JSON，而是把已经校验的动作委托给拥有该状态的领域模块：

```text
ArticleAttentionQuery
  <- residue reader adapter
  <- transaction reader adapter
  <- publication reader adapter
  <- archive issue reader adapter

ArticleAttentionResolver
  -> ContentSubmissionService（队列动作）
  -> ArticleRemovalService（删除事务）
  -> PublicationLedger（通过既有 reconcile interface）
  -> PublishedArchive module（仅本地归档动作）
```

生产环境 adapter 读取真实 store，测试环境 adapter 使用内存 fixture。adapter 是 attention 模块的内部 seam，不得作为 Renderer/IPC 的外部 interface 暴露。

`attentionId` 由 kind + 稳定业务身份生成，不暴露绝对路径。Query 返回安全展示字段：

```text
kind
articleId / titleSnapshot
clientId
platformId / displayName
batchId / publicationId / transactionId
status
reasonCode
pairState
recommendedAction
allowedActions
updatedAt
```

首批 attention kind：

| kind | 用户可见说明 | 主要动作 |
| --- | --- | --- |
| `missing_pair_finalize` | 队列文件已不存在，只差完成记录收尾 | 一键安全完成 |
| `queue_pair_conflict` | 队列文件与原投稿记录不一致 | 查看差异并选择保留或移出 |
| `removal_needs_repair` | 删除事务未完成 | 重新预检并继续 |
| `publication_uncertain` | 远端结果待确认 | 打开发布详情核对 |
| `published_archive_failed` | 远端成功，但本地归档失败 | 仅重试本地归档，禁止再次远端投稿 |
| `failed_submission` | 投稿明确失败 | 查看原因、清理旧队列或重新投稿 |

### 4.4 人工处理必须提供安全动作矩阵

| 当前状态 | 自动动作 | 用户动作 |
| --- | --- | --- |
| failed + both_absent | 自动/一键元数据收尾 | 无需找文件夹 |
| failed + main_absent + sidecar identity matched | 可清理孤立 sidecar | 确认后完成 |
| failed + sidecar_absent | 不删主文件 | “保留为手工队列文件并解除旧关联”或“明确移出队列” |
| failed + content_changed | 不删修改后的文件 | 显示文件名、修改时间、hash 前缀；选择保留新文件或移出 |
| uncertain/submitted | 不清理、不重试 | 打开发布详情，确认已发布/未发布 |
| submitting | 不允许处理 | 显示当前任务并等待 terminal state |
| identity_conflict/unsafe_path | 不修改 | 显示安全错误码并提供导出诊断摘要 |

“保留为手工队列文件”必须移除或重建旧 sidecar，使它不再冒充旧 batch；不得静默改变正文或伪造 attempt。

### 4.5 共享队列快照与失效事件

Renderer 只保留一个队列快照模块。它是只读缓存，不是新的领域状态所有者：

```text
PlatformQueueProvider / usePlatformQueue()
  snapshot { revision, queue, platforms, counts, loading, error }
  refresh(reason)
  subscribe(selector, listener)
```

App、Sidebar 和 PlatformWorkbench 都从同一 snapshot 读取：

```text
Sidebar badge = snapshot.counts.actionable
PlatformWorkbench list = snapshot.queue
```

调用方只可以使用以下外部 interface：

```text
getSnapshot(scope)
refresh(scope)
subscribe(scope, listener)
```

它不得保存文章、修改批次、更新发布账本或推进删除事务。主进程增加统一失效事件：

```text
workspace:data-invalidated
  revision
  scopes: [platformQueue, navigationSummary, articleAttention, orders]
  reasonCode
```

事件不能携带文章正文、完整队列、领域对象或具体页面指令。生产者只声明哪些只读数据已失效；消费者只按 scope 重新读取，不根据 reasonCode 编写业务流程分支。

产生事件的时机：

- 平台投稿 worker terminal；
- 成功归档或归档失败；
- 内容文章加入投稿队列；
- 撤销 queued、清理 failed；
- residue 处理完成；
- 删除事务 committed/superseded/needs_repair 状态变化；
- 付费媒体扫描或订单同步完成。

Renderer 只响应 scope，不根据 reason 编写业务分支。相同 revision 只刷新一次，过期异步响应不得覆盖较新 snapshot。

### 4.6 投稿 terminal 后强制重新扫描

形成双保险：

1. `startPlatformSubmit()` finally 广播 `platformQueue` 失效事件。
2. `PlatformWorkbench.handleSubmit()` 在 resolve/reject 后等待共享 `refresh('submit-terminal')`。

刷新后：

- 从选择集合移除已经不在队列的文件；
- 保留失败、未开始和 uncertain 项；
- 成功且归档完成的文件立即消失；
- 结果弹窗继续保留本次汇总，不因列表刷新丢失；
- 若 `archiveError` 存在，队列项显示“远端已发布，本地归档待处理”，禁止再次提交并进入需处理中心。

### 4.7 统一主导航徽标语义

新增 `NavigationSummary`：

```text
AI 内容生成：需处理文章数（可选红色徽标，只在 >0 时显示）
其他平台投稿：可操作队列文件数
付费媒体投稿：待处理媒体稿件数
投稿订单记录：需要关注的订单数或总订单数（必须固定一种语义）
```

本轮推荐：

- 普通数字徽标表示“当前待处理数量”，为 0 时隐藏而不是显示 `0`。
- 红色徽标只用于“需处理/异常”，不得与普通队列数量混用。
- hover/title 解释统计口径。
- 所有数字来自共享 summary，不在 Sidebar 内自行请求。

### 4.8 将“历史文章”重构为“文章管理”

保留文章、审核、发布记录的独立领域状态，不新增持久化的全局文章状态。新增纯派生模块：

```text
deriveArticleWorkflow(article, publications, batches, transactions, attention)
  -> stage
  -> primaryAction
  -> allowedBulkActions
  -> locks
```

建议阶段：

| 阶段 | 条件摘要 | 默认主要动作 |
| --- | --- | --- |
| 待审核 | article=`generated` | 打开检查 / 审核通过 |
| 待投稿 | article=`saved`，无 active target | 选择平台并加入队列 |
| 投稿中 | queued/submitting/submitted | 查看进度；仅 queued 可撤销 |
| 需处理 | failed、uncertain、queue conflict、needs_repair、archive failure | 打开处理中心对应项 |
| 已完成 | 一个或多个目标 published，且无更高优先级异常 | 查看发布详情 / 复制新版本 |
| 回收站 | tombstone 存在 | 恢复 / 永久删除 |

优先级：`需处理 > 投稿中 > 待审核 > 待投稿 > 已完成`。这只是界面派生规则，不覆盖文章审核状态和每个发布目标的真实状态。

### 4.9 文章管理页面操作流程

将 AI 内容生成的第三个 tab 从“历史文章”改为“文章管理”：

```text
顶部阶段筛选
  全部 | 待审核 | 待投稿 | 投稿中 | 需处理 | 已完成 | 回收站

列表
  标题 + 审核状态 + 各目标发布摘要 + 建议下一步

主动作
  每行只突出一个最合理动作

批量工具栏
  只显示当前选择真正可执行的动作

右侧面板
  原位编辑 / 发布时间线 / 异常处理
```

具体简化：

- 待审核：批量审核；点击标题继续使用原位编辑，不切换生成页。
- 待投稿：选中文章后再显示平台选择和“加入队列”，平时隐藏平台工具栏。
- 投稿中：直接显示目标进度，撤销仅作用于尚未开始的目标。
- 需处理：将 residue、删除事务、uncertain、归档失败收敛在同一列表，不再要求用户跨页找入口。
- 已完成：默认只显示发布详情和复制新版本，避免误改已发布版本。
- 回收站：保持恢复和二次确认永久删除，发布记录继续保留。

### 4.10 “其他平台投稿”回归为执行监控页

该页面只负责：

- 展示手工导入或文章管理产生的队列文件；
- 选择目标平台和执行；
- 展示当前任务、间隔等待、停止和本次结果；
- 显示异常摘要并提供“去文章管理处理”入口。

不再在页头堆叠一个含糊的“检查并清理残留”按钮。若有安全可自动收尾项，可显示：

```text
发现 2 项队列记录待收尾
[一键完成安全收尾] [查看全部问题]
```

存在冲突时只提供“查看全部问题”，不在投稿页直接执行不可逆文件选择。

### 4.11 状态写入所有权必须唯一

| 状态 | 唯一写入者 | 其他模块允许的行为 |
| --- | --- | --- |
| 文章本体与回收站 | `ArticleStore` | 查询、通过既有 interface 请求移动/恢复 |
| 投稿批次与 batch item | `SubmissionBatchStore` | Query 只读；Resolver 委托 ContentSubmissionService |
| 发布记录与 attempts | `PublicationLedger` | Query 只读；核对动作走既有 reconcile interface |
| 删除事务 | `ArticleRemovalService` / transaction store | Query 只读；Resolver 只调用 retry/resolve interface |
| 队列文件归档 | PublishedArchive module | 平台 worker 或 Resolver 调用，不由 UI 直接移动文件 |
| attention item | 无持久化写入者 | 每次从领域事实派生，只缓存 revision |
| 队列 snapshot / 导航 summary | Renderer 只读缓存模块 | refresh/subscribe，不写业务状态 |
| 文章 workflow stage | `deriveArticleWorkflow()` 纯函数 | 不持久化，不反向覆盖领域状态 |
| 页面导航 intent | `App` | 子页面只调用导航 interface，不持有其他页面 state |

任何任务若需要第二个模块直接写同一状态，必须先回到计划评审，不得以“临时同步”为由增加双写。

### 4.12 依赖方向与导航 seam

依赖只能单向：

```text
Renderer views
  -> electron-api DTO
  -> IPC
  -> Query / Resolver interface
  -> 领域模块 interface
  -> 各自 store
```

禁止：

- store 依赖 Renderer 或 attention DTO；
- Query/Resolver 反向调用 React state；
- Sidebar 自行请求或修改队列；
- PlatformWorkbench 直接调用 ArticleManagement 内部函数；
- 领域模块循环引用；
- 为测试暴露生产代码不需要的外部方法。

“其他平台投稿 -> 文章管理需处理项”使用一个稳定导航 interface：

```text
openArticleAttention({ attentionId, clientId? })
```

App 只保存一次性 navigation intent，切换到内容管理后由 ArticleManagement 消费并清除。投稿页不知道文章管理使用 tab、drawer 还是右侧面板。

### 4.13 interface 是主要测试 seam

- pair 分类通过 `inspectSubmissionPair()` 的可观察结果测试，不断言内部 helper 调用。
- Query 通过 `list/get` 测试聚合结果，使用内存 reader adapter，不读取测试私有字段。
- Resolver 通过 `preview/resolve` 测试委托结果，使用记录调用的领域 adapter，不直接断言 JSON 写入顺序。
- 共享数据模块通过 `getSnapshot/refresh/subscribe` 测试 revision、合并刷新和卸载订阅。
- Renderer 测试只驱动用户操作和可见结果，不使用源码正则代替关键交互。
- 新 interface 稳定后，删除被其完全替代的浅层源码断言测试，避免新旧两套测试长期并存。

---

## 5. 分阶段实施任务

### Task 0：固化四个正式红色回归与架构 seam

**Create：**

- `tests/submission-pair-state.test.js`
- `tests/article-attention-query.test.js`
- `tests/article-attention-resolver.test.js`
- `tests/renderer-platform-queue-refresh.test.js`
- `tests/renderer-article-management-flow.test.js`
- `tests/architecture-seams.test.js`

**Modify：**

- `tests/article-removal-recovery-regression.test.js`
- `tests/renderer-residue-cleanup-flow.test.js`
- `tests/platform-workbench-service.test.js`
- `scripts/verify.js`

实施：

- [ ] 构造 failed ledger + 历史 failed attempt + batch item failed + 主文件/sidecar 双缺失。
- [ ] 断言 preview 不再报告 `SUBMISSION_QUEUE_CHANGED`，apply 幂等更新为 `failed-cleaned`。
- [ ] 断言删除事务从 needs_repair 经 retry 到 committed，文章进入回收站。
- [ ] Renderer fixture 中后端提交完成时把 queue 从 2 改为 0；断言页面列表和 Sidebar badge 都变为 0/隐藏。
- [ ] 构造 reported conflict；断言界面存在可点击处理入口，并能打开对应 attention item。
- [ ] 固定状态所有权与依赖方向：Query/共享快照模块不得直接调用 store 写方法，领域模块不得依赖 Renderer。
- [ ] 记录修复前全部 RED 输出，再开始实现。

### Task 1：实现 submission pair 状态分类

**Modify：**

- `desktop/services/content-submission-service.js`
- `src/content/submission-export-service.js`
- `src/content/submission-batch-store.js`
- `tests/submission-pair-state.test.js`

实施：

- [ ] 提取 `inspectSubmissionPair()`，返回稳定 `pairState`。
- [ ] evaluator、preview、apply、batch reconcile 和 residue 全部使用相同结果。
- [ ] fingerprint 加入 pairState 和身份摘要，避免 preview 后状态变化仍执行。
- [ ] 对 `both_absent + failed` 实现只更新 batch 的幂等 cleanup。
- [ ] 对 `both_absent + latest queued` 实现安全 cancellation。
- [ ] 单缺失、内容变化、身份冲突保持阻止，不放宽安全边界。
- [ ] 账本 attempts、标题快照和远端证据不得删除或重写。

### Task 2：让删除事务消费幂等结果

**Modify：**

- `src/content/article-removal-service.js`
- `src/content/article-removal-transaction-store.js`
- `desktop/services/ai-content-service.js`
- `tests/article-removal-recovery-regression.test.js`

实施：

- [ ] retry needs_repair 时重新运行 evaluator，不复用旧 `unchanged` 布尔值。
- [ ] queue action 返回 idempotent 时推进 queue cursor。
- [ ] queue actions 全部完成后继续移动文章，不停留在 needs_repair。
- [ ] transaction 记录安全的 resolution code 和最近更新时间。
- [ ] terminal 后广播 articleAttention 和 platformQueue 失效。
- [ ] 重复 retry 保持幂等，不产生新事务。

### Task 3：固定状态所有权并建立失效事件与共享只读快照

**Create：**

- `media-workbench/src/workspace-data-store.tsx`
- `media-workbench/src/navigation-summary.ts`
- `tests/workspace-data-invalidation.test.js`
- `tests/architecture-seams.test.js`

**Modify：**

- `desktop/services/desktop-task-service.js`
- `desktop/ipc/platform-ipc.js`
- `desktop/preload.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/App.tsx`
- `media-workbench/src/components/Sidebar.tsx`
- `media-workbench/src/components/PlatformWorkbench.tsx`

实施：

- [ ] 把第 4.11 节状态所有权表固化成代码审查和架构测试约束。
- [ ] 定义 `workspace:data-invalidated` 的最小事件 interface：revision、scopes、reasonCode。
- [ ] 事件禁止携带领域对象或页面指令。
- [ ] App 挂载一个共享只读 provider；Sidebar 和投稿页不再各自保存计数。
- [ ] 外部 interface 只暴露 `getSnapshot/refresh/subscribe`。
- [ ] 同 scope 并发刷新合并；旧 revision 响应不得覆盖新数据。
- [ ] 页面进入仍可触发一次轻量 refresh，作为漏事件兜底。
- [ ] 为所有徽标固定统计口径和 0 值隐藏规则。

### Task 4：建立 ArticleAttention Query、Resolver 和 IPC

**Create：**

- `desktop/services/article-attention-query.js`
- `desktop/services/article-attention-resolver.js`
- `desktop/ipc/article-attention-ipc.js`

**Modify：**

- `desktop/ipc/register.js`
- `desktop/preload.js`
- `desktop/main.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `tests/article-attention-query.test.js`
- `tests/article-attention-resolver.test.js`

实施：

- [ ] Query 通过注入的 reader adapters 聚合 residue、needs_repair、uncertain、failed 和 archive failure。
- [ ] Query 不持有 store 写接口，不写 JSON，不推进事务。
- [ ] Resolver 只校验 revision/动作并委托现有领域 interface，不直接写 store。
- [ ] attention DTO 只返回安全显示字段，不返回正文、Cookie 或绝对路径。
- [ ] 提供 preview/resolve 二阶段 interface 和 expectedRevision 乐观并发校验。
- [ ] 为每种 reasonCode 返回中文说明、建议动作和 allowedActions。
- [ ] 所有不可逆文件动作继续要求 action-time 确认。
- [ ] 处理结果只返回 outcome 与 changedScopes，由共享快照模块决定刷新。

### Task 5：投稿结束自动刷新并正确表达归档失败

**Modify：**

- `desktop/services/platform-workbench-service.js`
- `desktop/services/desktop-task-service.js`
- `desktop/ipc/platform-ipc.js`
- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/types.ts`
- `tests/renderer-platform-queue-refresh.test.js`
- `tests/platform-workbench-service.test.js`

实施：

- [ ] worker result 增加 archive summary，不只在单项里附加 `archiveError`。
- [ ] 平台任务 terminal 无论成功、失败、停止都发布 platformQueue 失效事件。
- [ ] terminal state 明确 `completed/failed/stopped` 和 queue revision。
- [ ] handleSubmit 收尾等待共享 queue refresh。
- [ ] 刷新后清理失效选择，不清空仍在队列的失败项。
- [ ] published + archiveError 显示“远端成功，本地归档待处理”，禁止远端重试。
- [ ] 增加只重试本地 archive 的处理动作和冲突检查。

### Task 6：重构文章管理流程

**Create：**

- `media-workbench/src/article-workflow.ts`
- `media-workbench/src/components/content/ArticleAttentionPanel.tsx`
- `media-workbench/src/components/content/ArticleStageTabs.tsx`
- `tests/article-workflow.test.js`
- `tests/renderer-article-management-flow.test.js`

**Modify：**

- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/PublicationHistoryDrawer.tsx`
- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/publication-status.ts`

实施：

- [ ] 将“历史文章”改为“文章管理”。
- [ ] 使用纯函数派生阶段，不修改持久化领域状态。
- [ ] 加入阶段 tabs 和每行唯一主动作。
- [ ] 批量工具栏只显示当前选择可执行动作。
- [ ] 保留原位编辑和未保存保护。
- [ ] 发布详情改为目标时间线，uncertain 可直接核对。
- [ ] 需处理 tab 嵌入 ArticleAttentionPanel。
- [ ] App 提供 `openArticleAttention({ attentionId, clientId? })` 导航 interface。
- [ ] 投稿页异常摘要只调用导航 interface，不依赖文章管理内部 tab/drawer state。
- [ ] 跳转后保留客户、筛选、滚动和返回焦点。

### Task 7：统一运维脚本和文档

**Modify：**

- `scripts/repair-article-removal-regressions.js`
- `docs/content-generation-operations.md`
- `docs/clean-machine-installation.md`
- `CONTEXT.md`
- `scripts/verify.js`

实施：

- [ ] dry-run 脚本调用正式 pair evaluator/attention inspector，不复制一套判断规则。
- [ ] 输出 pairState、recommendedAction 和数量，不输出标题正文或绝对路径。
- [ ] 文档说明“需处理中心”的入口和每个状态的处理方式。
- [ ] 在业务词汇中增加“需处理项”和“文章流程阶段”，明确它们是派生视图，不是新的发布状态。
- [ ] verify 纳入双缺失、共享队列、徽标和 attention 闭环测试。

### Task 8：在完整副本上恢复当前两类异常

实施顺序：

- [ ] 关闭应用，确认没有 platform/batch/generation 任务运行。
- [ ] 完整复制 `.autopublish/submission-records`、`article-removal-transactions`、`article-trash`、`input` 和 `generated` 到时间戳备份。
- [ ] 在工作区副本运行 dry-run，预期识别 1 个双缺失 residue 和 1 个双缺失 needs_repair transaction。
- [ ] 在副本执行“一键安全完成”。
- [ ] 预期 residue 对应 batch item -> `failed-cleaned`。
- [ ] 预期 transaction queue action 幂等完成，文章进入回收站，transaction -> `committed`。
- [ ] 发布账本仍保留 failed 状态和全部 attempts。
- [ ] 再次执行返回 0 项变化，证明幂等。
- [ ] 只有副本验收全部通过，才允许用户在真实界面确认同一动作。
- [ ] 禁止手工删除 transaction JSON、batch JSON 或 publication JSON。

---

## 6. 测试矩阵

### 6.1 pairState

| 场景 | 预期 |
| --- | --- |
| 完整 pair + failed | cleanup 可执行 |
| 双缺失 + failed 历史 attempt | 幂等 cleanup，batch -> failed-cleaned |
| 双缺失 + latest queued | cancel reservation 后 batch -> cancelled |
| 只缺主文件 | 进入 attention，不自动删除 sidecar，除非单独确认 |
| 只缺 sidecar | 保留主文件，提供解除关联/移出队列选择 |
| hash 变化 | 不自动删除，显示 content_changed |
| identity 冲突 | 不自动修改，显示 identity_conflict |
| submitting/submitted/uncertain | 阻止 cleanup |
| symlink/目录/越界 | 阻止并返回安全错误码 |

### 6.2 删除事务与残留

| 场景 | 预期 |
| --- | --- |
| 双缺失 residue | 不再显示“需人工核对”，可安全收尾 |
| 双缺失 needs_repair | retry 后 committed |
| 重复 retry | 同一事务、无重复副作用 |
| 文件在 preview 后变化 | expectedRevision/fingerprint 阻止执行 |
| uncertain | attention 跳转发布详情，不允许 cleanup |

### 6.3 队列与徽标

| 场景 | 列表 | Sidebar badge |
| --- | --- | --- |
| 初始 2 项 | 2 | 2 |
| 1 项成功归档 | 1 | 1 |
| 2 项全部成功归档 | 0 | 隐藏 |
| 1 成功 1 失败 | 1 个失败项 | 1 |
| 远端成功、归档失败 | 保留且禁用重投 | 计入需处理，不计普通可投稿 |
| 用户停止 | 未开始项保留 | 与磁盘一致 |
| 残留安全收尾 | 项消失 | 同步减少 |
| 从文章管理加入队列 | 项出现 | 同步增加 |

### 6.4 文章管理

| 场景 | 默认阶段 | 主要动作 |
| --- | --- | --- |
| generated | 待审核 | 审核/编辑 |
| saved 无队列 | 待投稿 | 加入队列 |
| queued | 投稿中 | 查看进度/撤销未开始 |
| failed | 需处理 | 查看原因/重新投稿 |
| uncertain | 需处理 | 核对远端结果 |
| published | 已完成 | 发布详情/复制新版本 |
| needs_repair | 需处理 | 修复事务 |
| trashed | 回收站 | 恢复/永久删除 |

### 6.5 架构 seam 与低耦合约束

| 验收项 | 预期 |
| --- | --- |
| 状态写入所有权 | 每类持久状态只有一个写入模块 |
| ArticleAttentionQuery | 只持有 reader adapters，不持有 store 写方法 |
| ArticleAttentionResolver | 只委托领域 interface，不直接写 JSON/store |
| WorkspaceDataStore | 只提供 getSnapshot/refresh/subscribe |
| 失效事件 | 只含 revision/scopes/reasonCode，无领域对象和页面指令 |
| Sidebar | 只读 summary selector，不自行请求/修改队列 |
| 页面导航 | 只通过 `openArticleAttention()`，页面之间不共享内部 state |
| workflow stage | 纯函数派生，不持久化 |
| 依赖图 | 无领域模块循环依赖，无 store -> Renderer 反向依赖 |
| 订阅生命周期 | 页面卸载后监听器清理，同 revision 不重复刷新 |
| 测试 seam | 断言 interface 可观察行为，不依赖私有实现顺序 |

---

## 7. 验证命令

### 7.1 专项测试

```powershell
node --test `
  tests/submission-pair-state.test.js `
  tests/article-removal-recovery-regression.test.js `
  tests/article-attention-query.test.js `
  tests/article-attention-resolver.test.js `
  tests/workspace-data-invalidation.test.js `
  tests/architecture-seams.test.js `
  tests/renderer-platform-queue-refresh.test.js `
  tests/article-workflow.test.js `
  tests/renderer-article-management-flow.test.js
```

### 7.2 既有回归

```powershell
node --test `
  tests/platform-workbench-service.test.js `
  tests/submission-batch-worker-integration.test.js `
  tests/renderer-residue-cleanup-flow.test.js `
  tests/renderer-history-editor-flow.test.js `
  tests/renderer-publication-history.test.js `
  tests/article-trash-submission-lifecycle.test.js `
  tests/hepan-publish-contract.test.js `
  tests/hepan-publish-interval.test.js
```

### 7.3 全量与打包

```powershell
npm test
npm run build:renderer
npm run verify
npm run pack:alpha
```

### 7.4 数据副本 dry-run

```powershell
node scripts/repair-article-removal-regressions.js --workspace <副本目录> --dry-run
```

验收后统一红色反馈必须由：

```text
SUMMARY 4/4 RED
```

变为：

```text
GREEN manual-review-has-actionable-route
GREEN missing-pair-cleanup-is-idempotent
GREEN sidebar-badge-shares-live-queue-state
GREEN successful-submit-refreshes-queue
SUMMARY 0/4 RED
```

---

## 8. 提交顺序

建议每步独立提交：

1. `test: reproduce missing-pair and live queue regressions`
2. `fix: classify submission pair states and finalize absent pairs idempotently`
3. `fix: resume removal transactions after idempotent queue cleanup`
4. `refactor: define state ownership and workspace invalidation seams`
5. `feat: add article attention query and resolver contracts`
6. `fix: refresh platform queues after terminal submission states`
7. `feat: organize article management around next actions`
8. `docs: document attention handling and live queue operations`
9. `chore: package and verify article workflow remediation`

不得把真实工作区数据恢复结果提交进仓库。

---

## 9. 最终验收标准

- [ ] 当前双缺失 residue 不再要求用户找文件夹人工核对，可通过正式 interface 幂等收尾。
- [ ] 当前 needs_repair transaction 在副本中可完成，文章进入回收站，账本完整保留。
- [ ] 真正的内容变化和身份冲突仍不会被自动删除。
- [ ] 所有 reported attention item 都有明确位置、中文解释和允许动作。
- [ ] ArticleAttentionQuery 只读，ArticleAttentionResolver 只委托领域 interface，二者均不直接写多个 store。
- [ ] ArticleStore、SubmissionBatchStore、PublicationLedger 和 ArticleRemovalService 保持各自状态的唯一写入所有者。
- [ ] “其他平台投稿”页、Sidebar badge 和磁盘队列使用同一 snapshot。
- [ ] WorkspaceDataStore 只负责快照、刷新和订阅，不承担任何业务写入。
- [ ] 失效事件不携带领域对象或页面命令，页面间跳转只使用稳定 navigation intent。
- [ ] 投稿成功归档后，列表和徽标无需手动刷新即可更新。
- [ ] 失败、停止、uncertain 和归档失败的队列项不会被错误移除。
- [ ] 远端成功但本地归档失败时不会重复远端投稿。
- [ ] 主导航徽标有固定统计口径，0 值隐藏，相关事件后自动刷新。
- [ ] “历史文章”改为按下一步操作组织的“文章管理”。
- [ ] 用户可在“需处理”中完成 residue、删除事务、uncertain 和归档失败处理，不需要理解磁盘目录。
- [ ] 原位编辑、未保存保护、模板分组、发布详情和回收站没有回归。
- [ ] 架构测试确认不存在领域循环依赖、store 反向依赖 Renderer 或未清理的事件订阅。
- [ ] 统一红色反馈转为 `0/4 RED`。
- [ ] 专项、全量、Renderer build、verify 和打包验收全部通过。

---

## 10. 非目标与数据保护

- 不在诊断或测试阶段处理 `F:\1` 的真实 residue、transaction、queue 或 ledger。
- 不因 pair 双缺失删除 publication record 或压缩 attempts。
- 不把 `content_changed`、`identity_conflict` 或 unsafe path 放宽为自动清理。
- 不把 uncertain 直接判为 failed，也不提供绕过核对的重试。
- 不以“刷新列表”为由隐藏仍在磁盘的失败、停止或归档失败项。
- 不把派生的文章流程阶段写回文章本体或替代每个发布目标的状态。
- 不创建能直接写文章、批次、账本和删除事务的万能 Attention 模块。
- 不让 WorkspaceDataStore 演变为全局业务仓库或第二写入者。
- 不让 Sidebar、投稿页和文章管理页互相调用内部函数或共享可变 React state。
- 不在失效事件中传递完整领域对象、正文或页面操作命令。
- 不取消标题快照、发布记录保留和永久删除二次确认。
- 不要求用户手工编辑 `.autopublish` 内的 JSON、sidecar 或 transaction 文件。
- 不在 IPC、日志、attention DTO 或文档示例中输出正文、Cookie、完整 hash、绝对文件路径或远端完整响应。
- 不在本计划中重写平台发布协议、AI 生成提示词或付费媒体业务流程。
