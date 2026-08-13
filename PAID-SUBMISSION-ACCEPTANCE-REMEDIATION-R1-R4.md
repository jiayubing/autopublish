# Paid Submission Acceptance Remediation Plan — R1 to R4

> **用途**：针对当前 Alpha/实际操作验收暴露出的 4 个 blocking findings 做一次严格 bounded remediation。  
> **当前基线**：以当前真实源码为准；已知当前集成提交为：
>
> ```text
> 6516607f002fd6e780290756feec30bf8f91e7df
> feat: complete paid media staging workflow
> ```
>
> 开始实际执行前必须重新确认：
>
> ```bash
> git rev-parse HEAD
> git status --short
> git log -10 --oneline
> ```
>
> 如果 HEAD 已有合法 descendant，则以真实 HEAD 为准，不回退。
>
> **执行方式**：严格串行，一个 remediation 一个线程，无 subagent、无并行实现。
>
> ```text
> R1 — F-003 Concurrent Pause
> → R2 — F-004 Regular Admission Invalidation
> → R3 — F-005 Generated Article Paid-Staging Eligibility
> → R4 — F-006 Paid Workbench Ownership
> → Combined Bounded Re-audit
> → authorized integration / clean smoke / Alpha
> ```

---

# 0. 本轮 findings

## F-003 — Start pending 时 Pause 被 global busy 禁用

当前 paid batch 已经恢复：

```text
paused → “开始创建订单”
running → “暂停后续订单”
```

但是 Start command 的 promise 会贯穿 batch execution。

当前 Renderer 将：

```text
startCommand.busy
```

合并进全局：

```text
commandBusy
```

导致：

```text
Start 正在执行
→ startCommand.busy = true
→ Pause disabled
```

这违反已有 paid execution acceptance：

> 当前订单请求可以继续收口，但用户必须能够暂停后续订单领取。

---

## F-004 — Regular admission 没有触发 workspace invalidation

实际表现：

1. 文章成功加入普通平台投稿队列；
2. 文章管理页状态仍显示“待投稿”；
3. “其他平台投稿”页面不会自动出现新队列项；
4. 手动刷新后才正确。

根因：

```text
admitRegularQueueItems()
→ OperationalStore mutation
→ 未触发 workspace data invalidation
```

因此：

```text
articleManagement snapshot revision 未变
platformQueue scope 未刷新
```

这是同一个根因，不拆成两个 UI patch。

---

## F-005 — generated 文章被错误要求再次手工保存

实际表现：

```text
刚生成成功的文章
→ 点击“加入付费媒体投稿队列”
→ 提示需要先保存
```

但生成完成后文章已经持久化。

当前业务层错误地把：

```text
article.status === "saved"
```

当成 paid staging 的必要条件。

正确规则应该是：

```text
persisted + complete generated article
→ 可直接加入 paid staging

persisted + complete saved article
→ 可直接加入 paid staging

当前编辑器存在 dirty/未保存修改
→ 仍禁止投稿
```

重点：

```text
generated ≠ unsaved
```

---

## F-006 — Paid staging workbench owner 放错页面

当前产品结构重复：

```text
文章管理
├─ 加入付费媒体投稿队列
└─ PaidSubmissionStagingPanel

付费媒体投稿
└─ 旧 media workbench
```

用户实际期望：

```text
文章管理
→ 只负责把文章送入 paid staging

付费媒体投稿
→ 唯一 paid submission workbench
```

因此 `PaidSubmissionStagingPanel` 应迁移到侧边栏“付费媒体投稿”页面，文章管理只保留入口。

---

# 1. 全局执行规则

## 1.1 严格串行

固定顺序：

```text
R1
→ R2
→ R3
→ R4
→ Combined Bounded Re-audit
```

每个 remediation：

- 一个线程；
- 不启 subagent；
- 不并行；
- 不提前做下一 remediation；
- targeted tests PASS 后写 handoff；
- handoff 后停止该线程。

---

## 1.2 一个 primary business owner

每个 remediation 只允许一个 primary business owner。

允许少量 bounded collaborators：

```text
composition wiring
props/types
test fixtures
direct tests
handoff
```

如果需要第二个独立状态/业务 owner：

```text
REMEDIATION_BLOCKED
SCOPE_ESCALATION_REQUIRED
```

立即停止，不扩 scope。

---

## 1.3 不重开已经通过的后端设计

本轮明确不重做：

- paid staging durable store；
- paid staging typed IPC；
- MediaPoolStore favorite membership guard；
- paid preflight authority；
- OperationalStore staging→batch atomic transition；
- confirmation token/fingerprint；
- paid order orchestrator；
- remote order state machine；
- M05/M06；
- Ticket 25 A→G；
- 媒体资源刷新 remediation。

只有直接 regression 证明本轮改动破坏这些边界时，才允许追 owner evidence。

---

## 1.4 阶段内不做 full audit

R1～R4 只做：

```text
implementation
→ targeted tests
→ direct regressions
→ local self-audit
→ handoff
```

不要每阶段再跑：

```text
Primary Audit
→ remediation
→ bounded re-audit
```

独立审计统一放最后。

---

## 1.5 外部操作

整个自动修复阶段：

```text
supplier writes: none
real order creation: none
real charging: none
real cancellation: none
credentials collected: none
```

---

# R1 — F-003 Concurrent Pause

## 目标

修复：

```text
Start pending
→ user can still Pause next orders
```

保持：

```text
confirm
→ paused batch
→ no automatic Start
```

---

## Primary owner

```text
PaidSubmissionStagingPanel.tsx
```

## Allowed collaborators

```text
renderer-content-client-switch.test.js
PaidSubmissionStagingPanel types/tests
```

原则上不需要修改 `ContentWorkbench`；只有当前 props wiring 确实不足时才允许最小修改。

---

## 根因

当前 UI 将多个 command 合并成：

```text
commandBusy
```

并包含：

```text
startCommand.busy
```

因此 running batch 的 Pause 也被 Start busy 禁用。

---

## 正确行为

### Start

paused batch：

```text
[开始创建订单]
```

点击：

```text
startPaidMediaBatch({ batchId })
```

Start 自己 busy 时：

- 禁止重复 Start；
- 不能影响 Pause capability。

### Pause

running/executing batch：

```text
[暂停后续订单]
```

即使：

```text
startCommand.busy === true
```

也必须允许：

```text
pausePaidMediaBatch({ batchId })
```

前提是：

- authoritative batch snapshot 已是可暂停状态；
- `pauseCommand.busy !== true`；
- batch 不是 `needs_attention` / terminal。

---

## 推荐 busy 划分

不要再用一个全局：

```text
commandBusy
```

控制 execution actions。

可以拆成：

```text
nonExecutionBusy
startBusy
pauseBusy
```

至少保证：

```text
startBusy
≠
pauseDisabled
```

---

## 禁止

不得：

- 修改 orchestrator；
- 修改 IPC/preload；
- 修改 paid preflight；
- 修改 batch state machine；
- 让 confirm 自动 Start；
- 让 Pause 中止当前在途 supplier request。

Pause 的既有语义保持：

```text
当前在途订单继续收口
后续订单不再领取
```

---

## Targeted tests

必须覆盖真实时序：

```text
1. paused batch
2. hold Start promise unresolved
3. click Start
4. start called exactly once
5. startCommand.busy = true
6. refresh authoritative batch snapshot
7. batch.runState = running
8. Pause button enabled
9. click Pause
10. pause called exactly once
11. Start promise 之后才 resolve
```

另外：

- double Start prevented；
- double Pause prevented；
- needs_attention 无 Start；
- terminal 无 Start/Pause；
- client scope 不串客户；
- confirm 仍不 auto-start。

---

## Exit

```text
R1_PASS
```

---

# R2 — F-004 Regular Admission Invalidation

## 目标

普通平台 admission 成功后：

```text
文章管理状态自动刷新
+
其他平台投稿队列自动刷新
```

用户不需要手动 refresh。

---

## Primary owner

```text
regular-queue-application
```

以当前真实源码中 `admitRegularQueueItems()` 的 owner 文件为准。

---

## 根因

当前：

```text
admitRegularQueueItems()
→ OperationalStore 写入成功
```

之后没有触发：

```text
workspace data invalidation
```

导致：

```text
articleManagement snapshot 继续命中旧 revision
platformQueue scope 无事件
```

---

## 正确修复

真正创建新 regular queue item 后：

```text
if admittedCount > 0:
    onDataInvalidated("SUBMISSION_BATCH_CREATED")
```

或当前 workspace invalidation contract 中语义等价的唯一事件。

必须复用现有 invalidation owner。

不要新建第二套 Renderer refresh bus。

---

## 为什么使用 SUBMISSION_BATCH_CREATED

当前该 invalidation 已覆盖：

```text
articleManagement
articleAttention
platformQueue
```

正好满足：

```text
文章状态刷新
+
普通平台队列刷新
```

---

## Idempotent 规则

纯 idempotent replay：

```text
admittedCount === 0
```

不应无意义增加 workspace revision。

只有真实新 admission 才 invalidation。

---

## 禁止

不得用：

```text
setTimeout(refresh)
UI sleep
manual extra reload button
renderer local status patch
```

来掩盖问题。

事实 owner 仍然是 OperationalStore + workspace invalidation。

---

## Targeted tests

至少：

### T1 — 新 admission 发 invalidation

```text
admittedCount > 0
→ exactly one SUBMISSION_BATCH_CREATED invalidation
```

### T2 — idempotent replay

```text
admittedCount = 0
→ no new invalidation
```

### T3 — article management

普通平台 admission 后：

```text
refreshManagement()
```

读到新 revision，不再显示旧：

```text
待投稿
```

应进入当前项目既有的 queue/submission 状态。

### T4 — platformQueue

普通 admission invalidation 后：

```text
platformQueue
```

自动 refresh 并显示新 item。

### T5 — direct regular regression

现有 regular queue：

- FIFO；
- group/account；
- duplicate；
- cross-channel guard；

不回归。

---

## Exit

```text
R2_PASS
```

---

# R3 — F-005 Generated Article Paid-Staging Eligibility

## 目标

允许：

```text
刚生成完成且已持久化的完整文章
→ 直接加入付费媒体投稿队列
```

不再要求用户人为点一次“保存”。

---

## Primary owner

```text
operational-content-submission-service.js
```

以当前实际 `assertSavedPaidStagingArticles()` 所在文件为准。

---

## 当前错误规则

当前 application/service 层强制：

```text
article.status === "saved"
```

否则：

```text
ARTICLE_NOT_SAVED
```

但更底层 staging owner 已允许：

```text
generated
saved
```

因此这是上层多余限制。

---

## 正确 eligibility

Main/application 层允许：

```text
status = generated
或
status = saved
```

但文章仍必须：

- 存在；
- 已持久化；
- title 非空；
- content 非空；
- client/article identity 合法；
- 无 competing active target；
- 其他现有 staging guard 继续成立。

---

## Dirty editor 边界

不要把：

```text
generated
```

等同于：

```text
dirty / unsaved editor
```

Renderer 当前编辑器如果存在未保存修改：

继续禁止进入：

```text
regular admission
paid staging
```

不要为了 staging 自动调用 Save。

不要把 `generated` 自动改成 `saved`。

---

## 错误语义

如果当前错误 code：

```text
ARTICLE_NOT_SAVED
```

只服务这个错误限制，可以最小调整为更准确的 eligibility error。

但优先复用现有安全错误，避免为了文案新增多层 contract。

已知业务失败不得变成：

```text
IPC_INTERNAL
```

---

## Targeted tests

至少：

### T1

```text
generated + persisted + title/content complete
→ add paid staging PASS
```

### T2

```text
saved + complete
→ PASS
```

### T3

```text
missing article
→ fail-closed
```

### T4

```text
empty title/content
→ blocked
```

### T5

Renderer dirty article：

```text
add paid staging blocked
```

### T6

generated article admission：

```text
does not auto-save
does not mutate article.status
```

### T7

regular/paid conflict 保持。

---

## 禁止

不得：

- 自动保存文章；
- 修改 generation persistence owner；
- 修改 Article lifecycle 大状态机；
- 修改 publication lifecycle；
- 新建 dirty-state IPC/store。

---

## Exit

```text
R3_PASS
```

---

# R4 — F-006 Paid Workbench Ownership

## 目标

收口产品职责：

```text
文章管理
→ 只负责把文章加入 paid staging

付费媒体投稿
→ 唯一 paid submission workbench
```

---

## Primary owner

Renderer paid-media workbench / route composition。

以当前 `currentView="workbench"` 对应的现有组件 owner 为准。

---

## 目标结构

### 文章管理页

保留：

```text
[加入普通平台投稿队列]
[加入付费媒体投稿队列]
```

移除完整：

```text
PaidSubmissionStagingPanel
```

加入 staging 成功后只需要明确反馈：

```text
已加入 N 篇文章到付费媒体投稿队列
```

---

### “付费媒体投稿”页面

迁移/承接现有：

```text
PaidSubmissionStagingPanel
```

它成为唯一 paid submission UI owner，负责：

```text
staging list
favorite media selection
batch media assignment
preflight
fee confirmation
paused paid batch
Start/Pause
```

---

## 旧 workbench 的处理原则

当前“付费媒体投稿”页面如果还有旧：

```text
ArticleList
ArticleEditor
ResourceLibrary
selectedResources
```

不要重新设计整个媒体系统。

只做**最小收口**：

- 保留仍有独立价值的公共媒体资源/收藏管理入口；
- 删除/隐藏与新 staging workflow 重复的“文章+媒体直接组装投稿”UX；
- 不建立第二个 paid staging view；
- 不建立第二套媒体选择 state。

---

## 唯一 owner 原则

最终：

```text
PaidSubmissionStagingPanel
```

只能在：

```text
付费媒体投稿
```

页面存在一个正式实例。

文章管理页不得再渲染第二份。

---

## Data wiring

复用已有：

```text
Content article-management feature paidStaging snapshot
existing mediaFeature.pool
existing paid preflight/confirm/start/pause commands
```

不要复制这些状态到新 hook/store。

如果 route/workbench 需要 props：

只做窄 wiring。

---

## Client scope

进入“付费媒体投稿”页面时：

- 只显示当前 client 的 staging；
- 当前 client 的 active paid batches；
- 切 client 清理临时 selection/picker/confirmation；
- 不串其他客户。

---

## Targeted tests

至少：

### T1 — article management

文章管理页：

```text
有“加入付费媒体投稿队列”
无 PaidSubmissionStagingPanel 完整工作台
无媒体 picker
无 fee preflight
无 Start/Pause batch controls
```

### T2 — paid media page

“付费媒体投稿”页面：

```text
显示 staging list
显示 favorite media picker
可单篇/批量指定媒体
可 preflight
可 confirm
显示 paused batch
显示 Start/Pause
```

### T3 — single formal instance

正式 Renderer tree 中：

```text
PaidSubmissionStagingPanel
```

只存在一个业务实例。

### T4 — no duplicate media state

不新建第二：

```text
media pool store
paid staging store
paid execution state owner
```

### T5 — client switch

不同客户不串 staging/batch。

### T6 — route regression

切换：

```text
文章管理
其他平台投稿
付费媒体投稿
公共媒体资源
```

不丢失各自 owner。

---

## 禁止

不得：

- 新建第三个 paid page；
- 重写 media feature；
- 重写 paid preflight；
- 重写 paid execution；
- 增加新的 staging schema；
- 修改 supplier；
- 做视觉大重构。

---

## Exit

完整职责必须变成：

```text
文章管理 = admission entry
付费媒体投稿 = paid workbench
```

然后：

```text
R4_PASS
```

---

# 2. Combined Bounded Re-audit

R1～R4 全部 PASS 后，新开一个独立线程。

## 角色

```text
Independent Combined Bounded Re-audit
```

只读审计。

不得自行改 production code。

---

## 审计范围

只复核 F-003～F-006 以及它们直接失效的边界。

### F-003

- Start pending 时 Pause 可用；
- Start/Pause 各自防双击；
- confirm 不 auto-start；
- needs_attention/terminal 安全；
- client scope。

### F-004

- regular admission 发 workspace invalidation；
- articleManagement 自动刷新；
- platformQueue 自动刷新；
- idempotent replay 不制造多余 revision。

### F-005

- generated persisted article 可直接 paid staging；
- dirty editor 仍禁止；
- 不 auto-save；
- 不改 article.status。

### F-006

- article management 只剩 admission entry；
- PaidSubmissionStagingPanel 只在 paid-media workbench；
- paid-media page 能完成 staging→media→preflight→confirm→Start/Pause；
- 不存在第二 media/staging owner。

---

## Direct regressions

同时复核：

- regular queue direct regression；
- paid staging renderer flow；
- real MediaPoolStore membership；
- paid preflight/confirm；
- OperationalStore atomic staging→batch；
- paid execution Start/Pause；
- media resource refresh regression；
- Unicode ClientId regression。

---

## Blocking

以下任一项继续 blocking：

- Start pending 时 Pause 仍 disabled；
- regular admission 后仍需手动刷新；
- article 状态仍停留旧 read model；
- generated article仍被无理由要求手工 Save；
- dirty editor 被错误允许投稿；
- PaidSubmissionStagingPanel 在多个正式页面重复；
- paid-media 页面无法完成确认后的 Start；
- 新增第二 staging/media/execution owner；
- 回退 favorite/current-price/preflight/atomic-batch 安全边界；
- known business error 变 `IPC_INTERNAL`。

---

## 输出

```text
AUDIT RESULT: PASS
```

或：

```text
AUDIT RESULT: BLOCKED
```

如果 BLOCKED：

只列：

```text
finding
owner
required bounded remediation
re-audit scope
```

不自行修复。

---

# 3. Final Gate

Combined Bounded Re-audit PASS 后再执行。

至少：

```bash
git diff --check
npm run test:discover
npm run build:renderer
npm run build:preload
```

以及本轮所有 direct targeted regression。

如果当前仓库正式 clean gate 还有其他明确要求，则按当前 package/scripts 执行。

不要为了本轮 remediation 追与当前 diff 无关的历史 evidence gap。

---

# 4. Final Closure

最终顺序：

```text
R1 PASS
→ R2 PASS
→ R3 PASS
→ R4 PASS
→ Combined Bounded Re-audit PASS
→ authorized commit/integration
→ new clean HEAD
→ final production smoke
→ unsigned Alpha NSIS
→ another-PC user acceptance
```

旧 smoke 只能作为历史证据，不能代表新 HEAD。

---

# 5. Alpha 再验收清单

## 普通平台

1. 选择文章；
2. 加入普通平台投稿队列；
3. 文章状态立即更新；
4. 切到“其他平台投稿”；
5. 不手动刷新也能看到新队列项。

## Paid staging

1. 刚生成完成文章；
2. 不额外点 Save；
3. 直接“加入付费媒体投稿队列”；
4. 成功。

## 页面职责

文章管理：

```text
只看到 admission entry
```

付费媒体投稿：

```text
看到完整 staging workbench
```

## Paid execution

1. staging 选择收藏媒体；
2. preflight；
3. confirm；
4. paused batch；
5. 点击 Start；
6. 第一笔执行过程中点击 Pause；
7. 当前在途订单收口；
8. 后续订单不再领取。

真实供应商付费订单操作仍需用户明确授权后执行。
