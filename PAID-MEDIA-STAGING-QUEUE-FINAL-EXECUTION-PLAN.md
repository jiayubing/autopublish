# Paid Media Staging Queue Remediation Plan — Final Execution Plan

> **状态**：最终执行稿  
> **适用仓库**：当前真实仓库 HEAD，必须包含已完成的媒体资源刷新修复、Phase 1、Phase 2。  
> **执行方式**：严格串行；**一个阶段一个执行线程 / task，无 subagent、无并行实现**。  
> **核心模型**：
>
> ```text
> Paid Staging Queue
>     ↓ 从收藏媒体池选择媒体
>     ↓ authoritative preflight
>     ↓ 用户费用确认
> Confirmed Paid Batch
>     ↓ 用户明确点击“开始”
> Remote Order Execution
> ```
>
> 本计划只解决“文章先进入付费投稿待编排队列，再从收藏媒体中选择媒体，完成费用确认后进入既有 paused paid batch”的闭环。
>
> **不重开 M05/M06，不重做 Ticket 25 全量审计，不重写 paid order state machine，不回退已经完成的媒体资源库刷新修复。**

---

# 0. 当前已完成基线

以下提交对应能力已完成，不得重做：

```text
0734b89  fix: repair website media resource refresh
4f4a721  feat: persist paid media staging queue
9ee4e08  feat: wire paid media staging application ipc
```

实际开始执行前必须重新确认：

```bash
git rev-parse HEAD
git status --short
git log -10 --oneline
```

当前真实 HEAD 必须是 `9ee4e08` 或其合法 descendant，并且祖先链中仍包含媒体资源刷新修复。

## Phase 1 — COMPLETE

已完成：

- `paid_staging_items`；
- OperationalStore 唯一 staging durable fact owner；
- add / remove / list / set-media / has；
- restart persistence；
- duplicate/idempotent；
- active publication conflict；
- staging 不创建 publication target；
- staging 不创建 paid batch；
- staging 不创建 remote order。

## Phase 2 — COMPLETE

已完成：

- application facade；
- typed IPC；
- preload；
- renderer bridge/type；
- `addPaidSubmissionStaging`；
- `removePaidSubmissionStaging`；
- `setPaidSubmissionStagingMedia`；
- `getPaidSubmissionStaging`；
- regular queue 与 paid staging 冲突保护；
- Unicode-safe `ClientId`；
- known staging errors 的安全 IPC 映射。

**后续线程必须复用这些能力，不重新设计 transport。**

---

# 1. 最终执行顺序

```text
Phase 3A — Renderer Staging Feature Owner
Phase 3B — Article Entry & PaidSubmissionStagingPanel
Phase 3C — Favorite Media Assignment
Phase 4A — Atomic Staging → Paid Batch Transition
Phase 4B — Staging-Aware Paid Preflight Guard
Phase 4C — Queue Preflight / Fee Confirm UI
Phase 5  — Integration Execution Gate
Phase 6  — Independent Bounded Audit
```

Phase 6 PASS 后：

```text
authorized integration / commit
→ final clean HEAD
→ final production smoke
→ unsigned Alpha NSIS
→ user external acceptance
```

---

# 2. 全局执行规则

## 2.1 一个阶段一个线程

每个 Phase：

- 只能由一个执行线程/task完成；
- 不启 subagent；
- 不并行修改；
- 不提前做下一 Phase；
- 完成后必须写 handoff；
- 下一线程只基于当前源码 + 当前计划 + 上一 Phase handoff 继续。

---

## 2.2 Primary owner 规则

每个 Phase 必须只有**一个 primary business owner**。

允许少量 bounded collaborators，例如：

- composition wiring；
- typed contract；
- public type；
- prop plumbing；
- test fixture；
- handoff。

如果执行过程中发现需要新增**第二个独立状态 owner / 第二个独立业务责任 owner**，立即停止：

```text
PHASE_X_BLOCKED
SCOPE_ESCALATION_REQUIRED
```

不要继续扩 scope。

---

## 2.3 阶段内验证

Phase 3A～4C 只做：

```text
implementation
→ targeted tests
→ direct regressions
→ local self-audit
→ handoff
```

不要在每个阶段额外做：

```text
Primary Audit
→ remediation
→ bounded re-audit
```

真正独立审计统一在 Phase 6。

---

## 2.4 Broad failure 处理

如果全仓/broad matrix 出现问题，只有同时满足以下三点才属于当前阶段：

1. 由当前 diff 直接引入；
2. 落在当前 Phase primary owner 或明确 collaborator；
3. 不修会违反本阶段 acceptance。

否则记录：

```text
OUT_OF_SCOPE_EXISTING_GAP
```

不得追进历史 TypeChecker evidence、旧 capability matrix 或其他历史 owner。

---

## 2.5 中间 Phase 是 non-release state

Phase 3B～4B 期间，旧文章页付费预检入口会被移除，而新 queue-based preflight 尚未完全恢复。

因此明确：

```text
Phase 3B
Phase 3C
Phase 4A
Phase 4B
```

均属于：

```text
NON_RELEASE_INTERMEDIATE_STATE
```

这些阶段只要求本阶段 targeted gate，不要求保持一个可对用户发布的完整付费投稿 UX。

**不要为了“中间 commit 也可发布”同时保留旧流程和新流程。**

完整付费投稿 UX 在 Phase 4C 恢复。

---

## 2.6 全局禁止

所有阶段禁止：

- 重开 M05/M06；
- 重做 Ticket 25 A→G；
- 回退媒体资源刷新修复；
- 新建第二份媒体资源 store/cache；
- 新建第二套 paid staging state machine；
- 新建第二套 paid order state machine；
- 修改 production signing policy；
- 放宽 Ticket 25 performance budget；
- 真实创建媒体订单；
- 真实扣费；
- 自动 start paid batch；
- 在正式 UI 中手工输入 `mediaResourceId`；
- 把 renderer/media-pool 缓存价格作为费用 authority；
- 创建 `mediaResourceId=null` 的正式 publication target；
- 创建 `paid:pending` 假 publication target；
- 为了阶段通过而放宽 typed IPC / fail-closed contract。

---

# Phase 3A — Renderer Staging Feature Owner

## 目标

把 Phase 2 已经存在的 staging bridge capability 接入现有 Content Workbench feature。

本阶段只建立 Renderer staging state owner，不做新的可见 staging UI，不接媒体池。

## Primary owner

```text
media-workbench/src/features/content/article-management-feature.js
```

## Allowed collaborators

```text
media-workbench/src/features/content/use-content-workbench-feature.ts
media-workbench/src/features/content/content-workbench-feature.js
对应 tests/types
```

## 职责

把已有 bridge：

```text
addPaidSubmissionStaging
removePaidSubmissionStaging
setPaidSubmissionStagingMedia
getPaidSubmissionStaging
```

接入 Content Workbench。

Renderer snapshot 至少暴露：

```text
paidStaging: {
  items
  query
}
```

commands 至少暴露：

```text
addPaidSubmissionStaging
removePaidSubmissionStaging
setPaidSubmissionStagingMedia
```

### Refresh

- initial/workspace/client scope：加载当前客户 staging；
- add/remove/set-media 成功：刷新 staging；
- 沿用当前 query identity / command owner 机制；
- 不新造异步竞争控制。

## 禁止

不得修改：

```text
GeneratedArticlesView 可见 UX
media pool
paid preflight
paid confirm
OperationalStore staging schema
paid admission transaction
```

## Targeted tests

至少：

1. initial/client scope 加载 staging；
2. add 后 snapshot 更新；
3. remove 后更新；
4. set-media 后更新；
5. client switch 不接受 stale result；
6. known IPC error 进入 feature error；
7. 无 supplier/order side effect。

## Local self-audit

确认：

- Renderer staging state 只有一个 owner；
- 没复制 OperationalStore durable fact；
- 没有第二份 durable cache；
- 没提前做 Phase 3B/3C。

## Exit

```text
PHASE_3A_PASS
```

---

# Phase 3B — Article Entry & PaidSubmissionStagingPanel

## 目标

完成：

```text
文章管理
→ 加入付费媒体投稿队列
→ 在当前客户 staging panel 看到文章
→ 可移出
```

本阶段不选择媒体。

## Primary business/UI owner

新增窄组件：

```text
PaidSubmissionStagingPanel.tsx
```

它从本阶段起成为：

```text
paid staging UI owner
```

后续 Phase 3C、4C 都只扩这个组件，不再把全部逻辑堆回 `GeneratedArticlesView.tsx`。

## Allowed collaborators

```text
GeneratedArticlesView.tsx
GeneratedArticlesView.types.ts
ContentWorkbench.tsx
renderer tests
```

## GeneratedArticlesView 职责

只负责：

```text
选中文章
→ [加入付费媒体投稿队列]
→ 调 Phase 3A command
```

删除旧正式入口：

```text
editable 媒体资源 ID
文章管理页付费媒体预检按钮
```

## PaidSubmissionStagingPanel 最小 UI

每行只需要：

```text
文章标题
客户
媒体：未选择 / 已选资源编码
操作：移出
```

此阶段不需要复杂 staging 状态机或媒体信息卡。

## Client scope

只显示当前客户：

```text
item.articleRef.clientId === currentClientId
```

切换客户：

- staging snapshot 跟随 Phase 3A；
- 清理 panel selection；
- 不显示其他客户数据。

## Dirty article

Renderer 继续阻止未保存文章加入 staging。

不要新增 main-process dirty state owner。

## 禁止

不得：

- 打开媒体 picker；
- 读取 media pool；
- set media；
- paid preflight；
- paid confirm；
- paid batch；
- order。

## Targeted tests

至少：

1. 正式入口不存在 editable `付费媒体资源 ID`；
2. saved article 可加入 staging；
3. duplicate add 显示稳定结果；
4. panel 可见 staging item；
5. 可移出；
6. dirty article 被阻止；
7. client switch 不串客户；
8. staging article 仍不能进入 regular queue；
9. staging UI 不调用 preflight/confirm/order。

## Local self-audit

确认：

- `GeneratedArticlesView` 只负责 article → staging entry；
- `PaidSubmissionStagingPanel` 是唯一 staging UI owner；
- 没有 supplier call；
- 没为中间 Phase 保留双付费流程。

## Exit

```text
PHASE_3B_PASS
NON_RELEASE_INTERMEDIATE_STATE
```

---

# Phase 3C — Favorite Media Assignment

## 目标

在 `PaidSubmissionStagingPanel` 中，从**现有收藏媒体池**给 staging article 选择媒体。

本阶段只完成：

```text
favorite media read
→ selectedMediaResourceId
```

不做 preflight。

## Primary business owner

```text
PaidSubmissionStagingPanel
```

## Existing fact owner

收藏媒体事实继续由现有：

```text
useMediaFeature()
→ mediaSnapshot.pool
→ mediaFeature.loadPoolPage()
```

拥有。

## Allowed collaborators

```text
App.tsx
ContentWorkbench.tsx
窄 props/types
renderer tests
```

## Wiring

由 App 向 Content 传一个窄只读 capability，例如：

```text
paidMediaPool: {
  items
  page
  pageSize
  total
  totalPages
  hasPrev
  hasNext
  loading
  error
  loadPage(page)
}
```

不要把整个 mediaFeature 巨型对象传入 Content。

## Picker 最小功能

只展示当前收藏池媒体：

```text
媒体名称
缓存价格
资源编码（只读）
```

支持现有分页。

本阶段**不新增全收藏池搜索 API**。

如果当前页可以零成本做名称过滤，可作为 convenience；否则不做。

## 单篇 / 批量指定

支持：

```text
单篇 → 选择媒体
多篇 → 批量指定同一媒体
清除媒体 → mediaResourceId=null
```

最终只调用 Phase 2/3A 已存在的：

```text
setPaidSubmissionStagingMedia(...)
```

## 重要边界：本阶段不做 authoritative stale-favorite 判断

`mediaSnapshot.pool.items` 是分页集合。

因此：

```text
当前页找不到 selectedMediaResourceId
```

**不能推断该媒体已经取消收藏。**

本阶段：

- 新选择只能来自当前收藏池；
- 已选 ID 当前可解析则显示名称；
- 当前页无法解析时可显示资源编码/“已选媒体”；
- 不得标记 authoritative stale。

真正“当前是否仍在收藏池”由 Phase 4B Main-side guard 判断。

## 缓存价格

picker 显示的 price 只用于辅助展示。

不得：

- 写入 staging；
- 发送给 confirm；
- 作为 authoritative fee input。

## 禁止

不得：

- 修改 media-resource supplier refresh；
- 新建 media cache；
- 直接 supplier query current price；
- preflight；
- confirm；
- paid batch；
- order。

## Targeted tests

至少：

1. picker 只展示收藏媒体；
2. 不存在手工资源 ID input；
3. 单篇选择；
4. 批量选择；
5. 清除媒体；
6. resourceId 由选择产生；
7. price 只展示；
8. 分页未加载的 mediaId 不被错误判 stale；
9. client switch 清理临时 picker selection；
10. 媒体资源刷新 remediation regression 通过。

## Local self-audit

确认：

- media facts 仍由现有 media feature/pool owner；
- staging 只持久化 resourceId；
- 没有第二 media store；
- 没有 preflight/remote write。

## Exit

```text
PHASE_3C_PASS
NON_RELEASE_INTERMEDIATE_STATE
```

---

# Phase 4A — Atomic Staging → Paid Batch Transition

## 目标

在数据库事务 owner 中关闭核心一致性：

> 新 paid batch 只有在 article 仍在 staging、且 staging 选定媒体与 batch target 一致时才能创建；成功创建 batch 时，同事务消费对应 staging rows。

不改 UI/preflight。

## Primary owner

```text
src/infrastructure/operational-store/internal/
operational-store-queue-admission-transaction.js
```

## Allowed collaborators

```text
internal error constants/helper
transition/store tests
```

## 创建新 batch 前检查

对于**新 batch path**：

每个 article 必须存在：

```text
paid_staging_items
(client_id, article_id)
```

并且：

```text
selected_media_resource_id IS NOT NULL
selected_media_resource_id === batch.mediaResourceId
```

内部错误可以使用清晰的 store/application-internal code，例如：

```text
PAID_ADMISSION_STAGING_REQUIRED
PAID_ADMISSION_STAGING_MEDIA_MISMATCH
```

**这些 code 不直接承担 Renderer typed IPC 用户语义。**
公开映射由 Phase 4B owner 完成。

## Idempotent replay 顺序

必须先识别：

```text
existing legal paid batch
```

然后直接走现有 idempotent replay。

不要对已经成功的 existing batch 再要求 staging row，因为第一次成功后 staging 已被消费。

## 原子转换

同一个 transaction：

```text
validate staging
→ create submission/publication/active target/paid batch
→ DELETE matching paid_staging_items
→ assert deletedCount == new batch item count
→ COMMIT
```

如果删除数量异常：

```text
ROLLBACK
```

不得 silent partial consume。

## Failure

任何创建失败：

```text
paid batch 不存在
staging rows 保留
```

## 禁止

不得：

- Renderer；
- media pool；
- preflight response；
- 自动 start；
- remote order；
- order orchestrator。

## Targeted tests

至少：

1. staged + matching media → PASS；
2. not staged → fail；
3. selected media null → fail；
4. media mismatch → fail；
5. success → staging rows 同事务消失；
6. deletedCount 等于 item count；
7. injected transaction failure → batch 不存在/staging 保留；
8. multi-item 任一 invalid → 全 rollback；
9. duplicate/idempotent retry 仍 PASS；
10. batch 默认 paused；
11. 无 supplier/order side effect。

## Local self-audit

重点检查：

- only new-batch path requires staging；
- existing batch idempotency 未破坏；
- staging 删除时机正确；
- 没有第二 writer；
- 没碰 remote execution。

## Exit

```text
PHASE_4A_PASS
NON_RELEASE_INTERMEDIATE_STATE
```

---

# Phase 4B — Staging-Aware Paid Preflight Guard

## 目标

让现有 paid-media preflight/confirm 成为：

```text
staging-aware
favorite-membership-aware
typed-error-safe
```

本阶段不改 Renderer UI。

## Primary business owner

```text
desktop/services/paid-media-preflight-service.js
```

## Allowed collaborators

仅允许 bounded wiring/contracts：

```text
workspace/application composition
MediaPoolStore read capability
submission typed error contract/shared mapping
direct tests
```

这些是 collaborator，不是第二业务 owner。

## Main-side authoritative favorite guard

产品规则是：

> 付费投稿媒体只能来自用户当前收藏媒体池。

因此仅靠 Renderer picker 不够。

Phase 4B 必须通过现有：

```text
MediaPoolStore.contains(mediaResourceId)
```

或等价唯一 owner capability，在 Main/service 侧再次验证：

```text
mediaResourceId 当前仍在收藏池
```

不得新建第二 media pool store。

## Preflight 固定检查顺序

```text
1. validate staging membership
2. validate all staging selectedMediaResourceId == requested mediaResourceId
3. validate favorite/media-pool membership
4. queryCurrentResource(mediaResourceId)
5. existing article/lifecycle/system-code checks
6. build confirmation token/fingerprint
```

原因：不应先做 supplier/current-resource 查询，最后才发现 article 根本不在 staging。

## Confirm 固定检查顺序

在调用 `paidAdmission.admitPaidBatch()` 前：

```text
1. recheck staging membership
2. recheck selected media still matches
3. recheck favorite/media-pool membership
4. existing resource price/availability/fingerprint recheck
5. existing article/system-code/fingerprint recheck
6. paidAdmission.admitPaidBatch()
```

最后 Phase 4A transaction 再做原子 staging guard。

## Typed error responsibility

Phase 4B 是公开错误语义 owner。

必须保证预期业务失败不会落成：

```text
IPC_INTERNAL
```

优先复用现有稳定错误，例如：

```text
NOT_IN_STAGING
INVALID_MEDIA_RESOURCE_ID
PAID_STAGING_CONFLICT
PAID_MEDIA_CONFIRMATION_STALE
```

如果确实无法准确表达“已选媒体变化/不在收藏池”，允许最小增加**一个**稳定 safe error code，而不是新增一组内部错误直接冒到 Renderer。

内部 Phase 4A error 必须在 service/application 边界映射为公开安全语义。

## Query 规则

不得 per-article SQL N+1。

可按 distinct client 获取 staging snapshot，再内存映射 articleRef。

favorite membership 如果 `MediaPoolStore.contains()` 是 O(1)/单 query，可直接使用一次。

## 保留原安全规则

不得削弱：

- `queryCurrentResource()`；
- current price；
- available；
- media remarks；
- resource fingerprint；
- article fingerprint；
- system submission code；
- confirmation TTL/token；
- confirm-time recheck。

## 禁止

不得：

- renderer cached price 作为 authority；
- 修改 paid order orchestrator；
- 修改 Renderer；
- 在 service 自行删除 staging；
- service 自己创建第二个 batch transaction。

staging 删除只由 Phase 4A transaction owner 完成。

## Targeted tests

至少：

1. staged + matching + favorite → preflight PASS；
2. not staged → safe error；
3. no selected media → safe error；
4. selected media mismatch → safe error；
5. media 不在收藏池 → blocked；
6. known failures 经 typed IPC 不变 `IPC_INTERNAL`；
7. preflight 后 staging media 改变 → confirm stale/blocked；
8. preflight 后 staging item 删除 → confirm blocked；
9. preflight 后取消收藏 → confirm blocked；
10. current price change → 原 stale/reconfirm 行为保持；
11. current availability change → blocked；
12. article fingerprint change → stale；
13. confirm success → 进入 Phase 4A atomic consume；
14. 无 remote order creation；
15. 无明显 N+1。

## Local self-audit

确认：

- favorite restriction 有 Main-side enforcement；
- Phase 4B 是公开 error mapping owner；
- Phase 4A 仍是 final atomic owner；
- 没有重复 staging writer；
- confirmation security 未削弱。

## Exit

```text
PHASE_4B_PASS
NON_RELEASE_INTERMEDIATE_STATE
```

---

# Phase 4C — Queue Preflight / Fee Confirm UI

## 目标

在 `PaidSubmissionStagingPanel` 恢复完整付费投稿人工闭环：

```text
选择同媒体 staging articles
→ 费用预检
→ 查看最新报价/风险
→ 确认
→ paused paid batch
```

## Primary owner

```text
PaidSubmissionStagingPanel
```

## Allowed collaborators

```text
GeneratedArticlesView/types（只做最小 props）
ContentWorkbench prop wiring
renderer tests
```

不要重新设计 App/media feature。

## Selection rule

只有所有选中 staging item：

```text
selectedMediaResourceId != null
且全部相同
```

才能费用预检。

混合媒体：

```text
请选择同一媒体的文章进行费用预检
```

不要自动拆多个 batch。

## Preflight input

Renderer 只发送：

```text
articleRefs
mediaResourceId
```

不得发送：

```text
cached price
available
remarks
resource fingerprint
```

## Confirmation UI

展示现有 authoritative preflight model：

```text
媒体名称
媒体备注
最新单价
文章数
预计总费用
系统投稿标识
文章风险
blockers
```

缓存价格与 preflight 最新价格冲突时：

```text
只认 preflight price
```

## Confirm success

```text
confirmPaidMediaBatch
→ refresh paid staging
→ refresh paid batches
→ clear staging selection
→ close confirmation
```

UI 必须观察到：

```text
对应 staging rows 消失
new paid batch visible
batch.status = paused
```

## Confirm failure

- staging 保留；
- 不伪装成功；
- 用户可以重新 preflight；
- known error 使用安全明确提示。

## 禁止

不得自动：

```text
startPaidMediaBatch
```

不得创建真实订单。

“开始”仍是 Remote Order Execution 的人工安全边界。

## Targeted tests

至少：

1. 未选媒体不能 preflight；
2. mixed media blocked；
3. same media multi-article preflight；
4. renderer input 只有 refs + mediaResourceId；
5. authoritative latest price 显示；
6. remarks/risk/system code 显示；
7. confirmation token flow；
8. confirm success → staging 消失；
9. confirm success → paused batch；
10. confirm failure → staging 保留；
11. confirm 不 auto-start；
12. preflight/confirm 不创建真实订单；
13. 当前客户不显示其他客户 active paid batch；
14. old article-page manual paid preflight UX 完全不存在。

## Local self-audit

确认：

- staging panel 是唯一 paid media target selection UI；
- article list 未恢复 media ID input；
- confirmation 使用 server/preflight model；
- batch paused；
- remote execution 仍需用户第二次明确动作。

## Exit

完整产品 UX 恢复：

```text
article
→ paid staging
→ favorite media
→ preflight
→ fee confirmation
→ paused paid batch
```

输出：

```text
PHASE_4C_PASS
```

---

# Phase 5 — Integration Execution Gate

## 角色

这是执行 gate 线程，**不开发新功能**。

如果发现 production implementation failure：

```text
PHASE_5_BLOCKED
```

记录 finding，停止。

不要一边跑 broad gate 一边做大修。

## 必须验证

### Staging

```text
add
list
set media
batch set media
clear
remove
restart
client scope
```

### Cross-channel

```text
paid staging ↔ regular admission conflict
active publication → paid staging blocked
remove staging → regular admission restored
```

### Favorite restriction

```text
UI 只能选择收藏媒体
Main preflight 再验证收藏 membership
取消收藏后不能继续 confirm
```

### Staging → Paid Batch

```text
staging required
selected media required
media match
atomic consume
delete-count assertion
rollback
idempotent retry
paused batch
```

### Preflight

```text
staging-aware
favorite-aware
authoritative price
availability
remarks
risk
system code
confirmation TTL/fingerprint
typed error safety
```

### Renderer

```text
no manual mediaResourceId
PaidSubmissionStagingPanel
favorite picker
single/bulk assignment
same-media preflight
confirm
client scope
```

### Existing fixes

```text
media resource refresh regression
Unicode ClientId regression
```

## Gate commands

按当前 package scripts 为准，至少：

```bash
git diff --check
npm run test:discover
npm run build:renderer
npm run build:preload
```

并运行 Phase 1～4C 所有 direct/invalidated targeted tests。

如果当前 diff 直接触达相关边界，再运行：

```text
typed IPC direct tests
architecture seam direct tests
OperationalStore direct regression
paid-media-preflight direct regression
Ticket 25-D direct paid acceptance regression
```

## Broad matrix

不要求为了本 remediation 追整个历史 production TypeChecker matrix。

只有正式 clean gate 明确要求且环境可用时运行。

历史/out-of-scope evidence gap：

```text
OUT_OF_SCOPE_EXISTING_GAP
```

不扩 scope。

## Handoff

必须包含：

```text
start HEAD
source state
changed files grouped by phase
commands
PASS/FAIL counts
build results
known skips/gaps
externalOperations=none
```

## Exit

```text
PHASE_5_PASS
```

---

# Phase 6 — Independent Bounded Audit

## 角色

**新开独立线程，只读审计。**

不得：

- 自行修改 production code；
- 自行补测试后给自己 PASS；
- 重开 Ticket 25 全量审计。

## 审计范围

只审本 remediation：

1. Phase 1/2 staging owner 是否保持；
2. Renderer 是否只通过 Phase 2 bridge；
3. 是否存在第二 staging/media owner；
4. manual mediaResourceId 是否退出正式 UX；
5. 收藏池是否只负责选择；
6. Main 是否 authoritative enforce favorite membership；
7. cached price 是否没有成为 authority；
8. preflight 是否 staging-aware；
9. confirm 是否 recheck staging/favorite；
10. OperationalStore 是否原子 staging→batch；
11. staging delete count 是否严格；
12. failure 是否保留 staging；
13. idempotent replay 是否保持；
14. confirmed batch 是否 paused；
15. confirm 是否没有 remote order；
16. regular/paid conflict 是否保持；
17. client scope 是否不串客户；
18. Unicode ClientId 是否无安全回归；
19. media refresh remediation 是否保持；
20. typed known errors 是否避免 `IPC_INTERNAL`；
21. tests 是否观察真实 public/application/store boundary；
22. Phase 5 evidence/source state 是否可信。

## Blocking finding

以下任一项 blocking：

- staging 创建正式 publication target；
- preflight/confirm 自动创建远端订单；
- Renderer/media-pool price 成为收费 authority；
- 可手工输入 resourceId 绕过收藏；
- UI 虽只显示收藏媒体但 Main 无 membership guard；
- article 可同时 active regular + paid staging；
- new batch 不要求 staging；
- staging media 与 confirmed target 可不一致；
- batch 创建成功但 staging 未原子消费；
- partial staging delete 未 fail；
- batch 创建失败却 staging 丢失；
- confirm auto-start；
- client scope 串客户；
- 回退 media refresh fix；
- known business error 变 `IPC_INTERNAL`；
- benchmark/test fake 掉真正 owner造成 false-pass。

## Non-blocking

不得扩大本 remediation：

- 收藏媒体全局搜索；
- 高级筛选；
- 排序；
- debounce；
- 视觉 polish；
- 缩略图；
- 标签；
- 快捷筛选；
- 自动媒体推荐。

## 输出

```text
AUDIT RESULT: PASS / BLOCKED

checked invariants
findings
blocking / non-blocking
required remediation
bounded re-audit scope
```

PASS 后不追加第三轮 Ticket 25 全量审计。

---

# 3. Phase 6 Blocking 后

如果 Phase 6 BLOCKED：

只按 finding owner 新开：

```text
Bounded Remediation R1 / R2 ...
```

每个 remediation：

- 一个线程；
- 一个 primary owner；
- direct tests；
- handoff。

完成后：

```text
Bounded Re-audit
```

只复核 blocking finding 和直接失效 gate。

不要回到 Phase 3A 全量重跑。

---

# 4. 最终 Closure

Phase 6 PASS 或 bounded re-audit PASS 后：

```text
authorized commit / integration
→ final clean HEAD
→ final production smoke on new HEAD
→ unsigned Alpha NSIS
→ another-PC user acceptance
```

旧 `ab503bd` clean smoke 仍是历史有效证据，但不能代表新 HEAD。

---

# 5. Alpha 用户验收

## A. Staging

```text
文章管理
→ 选择文章
→ 加入付费媒体投稿队列
→ staging panel 可见
```

## B. Favorite media

```text
staging
→ 从收藏媒体池选择
→ 可批量指定
→ 无需输入任何 resource ID
```

## C. Preflight

```text
同媒体文章
→ 费用预检
→ 最新价格
→ 媒体备注
→ 风险
→ 系统投稿标识
```

## D. Confirm

```text
确认费用
→ staging 对应项消失
→ paused paid batch 出现
```

到此不应产生真实远端订单。

真正：

```text
点击“开始”
```

属于真实付费外部操作，需要用户再次明确授权。

---

# 6. 每阶段 Handoff 固定模板

## Baseline

```text
phase:
start HEAD:
start status:
upstream phase:
thread/subagents: one thread / none
```

## Owner

```text
primary business owner:
bounded collaborators:
```

## Scope

```text
implemented:
explicitly not implemented:
```

## Changed files

逐文件：

```text
file:
owner:
reason:
```

## Invariants

```text
preserved:
new:
```

## Tests

```text
command:
result:
count:
```

## Local self-audit

回答：

```text
Did this phase stay inside its primary business owner?
Did it introduce a second durable/state owner?
Did it introduce remote side effects?
Did it pull future-phase work forward?
Did direct public behavior tests pass?
```

## External side effects

固定：

```text
supplier writes: none
real order creation: none
real charging: none
credentials collected: none
```

## Exit

```text
PHASE_X_PASS
```

或：

```text
PHASE_X_BLOCKED
reason:
```

---

# 7. 强制停止条件

任一阶段出现以下情况，立即停止并 handoff：

1. 需要新增第二个独立状态/业务 owner；
2. 需要新 schema，但当前 Phase 未授权；
3. 需要重写 paid order orchestrator；
4. 需要改变 supplier write behavior；
5. 需要修改 M05/M06/Ticket 25 历史 owner；
6. broad failure 无法证明由当前 diff 引入；
7. 为通过测试必须放宽安全 contract；
8. 需要把缓存价格当 authority；
9. 需要创建第二 staging/media store；
10. 当前 HEAD 不包含已完成 Phase 1/2 或媒体刷新修复。

输出：

```text
PHASE_X_BLOCKED
SCOPE_ESCALATION_REQUIRED
```

等待重新调度。

---

# 8. 最终 Owner Map

| 事实 / 行为 | 唯一 owner |
|---|---|
| paid staging durable fact | OperationalStore paid-staging aggregate |
| staging renderer state | Content article-management feature |
| staging UI | `PaidSubmissionStagingPanel` |
| article → staging entry | `GeneratedArticlesView` |
| favorite media facts | existing media feature / media pool |
| selected media durable value | paid staging owner |
| favorite membership authority | existing `MediaPoolStore` |
| current paid price / availability | existing paid-media preflight resource query |
| staging → confirmed batch atomic conversion | OperationalStore paid admission transaction |
| confirmation token / fingerprint | paid-media-preflight-service |
| confirmed paid batch | existing paid admission / paid batch owner |
| remote order creation | existing paid-media-batch-orchestrator |
| real supplier operation | existing supplier/order port |

任何 Phase 不得创建与本表重复的 owner。

---

# 9. 本次明确不做

以下不属于当前 blocker：

- 收藏媒体全局搜索；
- 高级筛选；
- 媒体排序；
- debounce；
- 新导航页；
- 新 staging 状态机；
- staging 历史日志；
- 自动媒体推荐；
- 自动把混合媒体 selection 拆成多个 batch；
- 自动开始 paid batch；
- 重设计远端订单状态机。

---

# 10. 当前继续点

不要重新执行 Phase 1 / Phase 2。

下一阶段：

```text
Phase 3A — Renderer Staging Feature Owner
```

从当前真实 HEAD（必须为 `9ee4e08` 或其合法 descendant）开始。
