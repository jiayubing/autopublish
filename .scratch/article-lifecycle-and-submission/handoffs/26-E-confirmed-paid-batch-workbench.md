# 26-E — 已确认付费批次工作台：实施与审计交接

## 执行范围

- 基线：`40113cb9485787304cd3a0e800f2cf3f33f76d13`（integration HEAD）。
- Worktree：`C:\Users\violet\.codex\worktrees\f4d3\官媒投稿-refactor`。
- 当前 worktree 保持 detached HEAD；未切换、push、release，未执行真实登录/投稿/付费/取消、生产数据库迁移或删除。
- 本交接只覆盖 26-E；未读取或进入普通平台 adapter、订单详情完整实现、图片流程、旧 staging 代码及后续工作包。

## Owner 与实现结果

`operational-store-paid-execution-aggregate.js` 继续作为已确认付费批次 execution owner，并新增 `cancelRemainingPaidSubmissionBatchItems` 原子 transition。`paidBatchSnapshot` 现在公开确认快照、媒体摘要、报价/预计费用、文章总数、已创建订单数、剩余未开始数、当前项、暂停原因和动作资格；IPC projector 只白名单公开字段，不暴露 claim、正文、Cookie、token、fingerprint 或其他内部 payload。

取消命令在同一个 OperationalStore transaction 中逐项判定并结束所有安全的 queued 项：必须仍是 queued、无 claim、publication/attempt 仍 queued、recovery intent 已 resolved、phase 为 `paid-admitted`、active target 精确匹配且没有 remote evidence/order。只要在途、已有订单、不确定或事实冲突，就跳过或安全失败，不做远端取消、不自动重试、不解冻不确定结果。active target 释放只调用其既有 owner；owner 缺失时 fail closed。

取消后安全文章释放回可投稿状态；再次提交会复用该 publication identity 的历史事实并创建新 attempt，仍由新的 preflight/confirmation 重新确认费用。已有订单和在途项保持原状态。重复取消只返回 `idempotentCount`，不再次推进批次 revision。

Renderer 工作台现在只展示 confirmed paid batch read model，保留刷新、继续、暂停和“取消全部剩余未开始项”，没有追加、单项移除、文章选择、媒体选择、费用预检或绕过确认入口。启动、暂停、取消均由 content paid execution feature 的具名 command owner 负责，并经 IPC/preload/bridge 合同闭合。

## 状态矩阵与并发边界

| 状态/动作 | 持久事实与公开行为 |
| --- | --- |
| confirmed/queued | 文章集合、确认报价和目标冻结；read model 显示完整计数；可继续执行或暂停。 |
| claimed / remote_started | 视为在途；取消命令跳过；暂停只阻止下一次 claim，不中断当前 supplier request。 |
| completed / failed / 已有订单 | 取消命令跳过；订单历史和最小审计事实保留。 |
| uncertain / blocked | 批次进入人工处理状态；取消不解冻、不重试，暂停原因保留安全 code。 |
| queued 且无远端事实 | 原子标记 cancelled、写 resolution、结束 attempt、由 active-target owner release；article management 回到 `pending_submission`。 |
| 重复取消 | 不产生第二次取消事实；返回 idempotent count，公开快照不变。 |
| 取消与 start/claim 竞争 | SQLite transaction 与 `status='queued' AND claim_token IS NULL` 条件保证先完成的真实事实优先；claim/在途胜出时保留该项，取消胜出时后续 claim 失败。 |
| transaction fault | fault injection 在每项取消后触发时，整个 batch rollback，items、targets、intent、attempt 和 batch 状态保持原样。 |
| restart | 复用既有 startup pause transition；重启后不自动下单，必须显式继续。 |

## Primary Audit

按 owner、公开合同、状态矩阵、幂等/并发、失败路径、直接调用方和 renderer 控制完成 Primary Audit。发现并修复的本包 finding：

1. `INTRODUCED_BY_CHANGE / blocking`：暂停原因读取了 SQL row 的 `item_status` 之外的错误字段，uncertain/blocked 可能只显示泛化原因。改为兼容 read-model item/status 字段，并补 uncertain pause regression。
2. `INTRODUCED_BY_CHANGE / blocking`：取消 transition 曾在 active-target service 缺失时直接删除表行，形成旁路 writer。移除 fallback，缺少 owner 时 fail closed。
3. `INTRODUCED_BY_CHANGE / blocking`：read model 直接 join `remote_orders` 可能在同一 attempt 存在多个 remote id 时复制 item。改为按 attempt 聚合单一 order id。
4. `INTRODUCED_BY_CHANGE / blocking`：重复取消曾无语义递增 `submission_batches.revision`。仅在本次实际取消至少一项时更新 batch revision。
5. `PROCESS_EVIDENCE_GAP / non-blocking`：paid execution 的 production caller/prop wiring evidence 仍指向旧文章视图。同步修正为 `PaidMediaWorkbench` 与实际 refresh binding；新增取消能力的 125-capability fixture 已闭合。
6. `EXPOSED_PREEXISTING / non-blocking`：`attention.listArticleAttention` 的 lifecycle snapshot consumer 仍无法通过 phase-06 TypeChecker reachability；属于既有 attention owner，未越界修复。
7. `PROCESS_EVIDENCE_GAP / non-blocking`：既有 ASAR artifact absence evidence 需要打包产物；本包禁止 release/打包，未生成或伪造该 evidence。

## Bounded re-audit

针对上述修复、直接调用方和受影响不变量复审：

- paid acceptance + Ticket 13：23/23 pass，覆盖费用确认快照、串行执行、重启暂停、不确定不重试、预检变化、取消剩余、在途保护、重复调用、fault rollback、重新预检和远端结果回归；
- content IPC、typed IPC、OperationalStore public surface：32/32 pass；
- content feature/read-model/renderer race/regression：40/40 pass；
- media-workbench lint、strict typecheck、production build：全部通过；build 仅保留既有大 chunk warning；
- changed JavaScript `node --check` 与 `git diff --check`：通过；
- phase-06 production IPC fixture matrix：33 pass、2 fail；两个失败均为同一个既有 `attention.listArticleAttention` reachability gap，26-E 新增及调整的 paid capabilities 均通过。

未发现新的本包 blocking finding；Primary Audit 的四个 introduced blocking finding 已关闭。

## 实际命令与结果

通过：

- `node --test --test-concurrency=1 tests/ticket-25-d-paid-media-acceptance.test.js tests/article-lifecycle-ticket-13.test.js`（23/23）；
- `node --test --test-concurrency=1 tests/content-submission-ipc.test.js tests/phase-06-submission-typed-ipc.test.js tests/phase-06-content-operations-typed-ipc.test.js tests/phase-08-operational-store-internals.test.js`（32/32）；
- `node --test --test-concurrency=1 tests/article-lifecycle-ticket-14-renderer.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/content-workbench-regression.test.js tests/phase-06-content-read-model.test.mjs tests/phase-08-content-renderer-feature-races.test.mjs tests/renderer-content-generation.test.js tests/renderer-template-discovery-empty-client.test.js`（40/40）；
- `npm run lint`（media-workbench）；`npm run typecheck:strict`（media-workbench）；`npm run build`（media-workbench）；
- changed JS `node --check`；`git diff --check`。

保留 evidence 但未全绿：

- `node --test --test-concurrency=1 tests/phase-06-production-ipc-fixture-matrix.test.js`（33 pass、2 fail）：既有 attention reachability gap；
- ASAR capability-specific inventory 未在本包运行，也未生成 ASAR；既有 handoff 已记录该打包 evidence gap。

## 未运行的重要验收与剩余风险

- 未运行完整项目 test suite、真实账号登录、远端投稿/付费/取消、生产数据库迁移/删除、发布、push 或 release；所有本包行为测试使用合成数据、临时 workspace、内存/假 transport。
- 未运行真实 UI 浏览器/响应式截图验收；已完成 renderer lint、strict typecheck、production build 与 feature/regression tests。
- attention reachability 与 ASAR evidence gap 保留给对应 owner；不影响本包 paid batch owner、取消事务和 IPC/renderer direct regression。
- 依赖安装期间仅使用 `npm ci --ignore-scripts`；未运行 `npm audit fix`，避免扩大范围。

最终 commit hash 由本任务最终报告给出；本 handoff、源码和测试保持同一单一意图提交。
