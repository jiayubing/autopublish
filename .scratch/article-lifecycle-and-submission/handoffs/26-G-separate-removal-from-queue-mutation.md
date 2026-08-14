# 26-G — 删除链路收敛 handoff

## 范围与基线

- Work package：`26-G — 删除链路收敛`
- 合同：`.scratch/article-lifecycle-and-submission/issues/26-G-separate-removal-from-queue-mutation.md`
- Base integration HEAD：`4626b986ec789000ea64d7bd09044a3149c9ab29`
- Worktree：`C:\Users\violet\.codex\worktrees\a086\官媒投稿-refactor`
- Git 根目录：`C:\Users\violet\.codex\worktrees\a086\官媒投稿-refactor`；实现位于 `auto—publish/`
- 初始状态为给定 HEAD 的 detached worktree；没有 push、release、真实登录、投稿、付费、取消或订单核对。
- 本包只使用合成数据、内存 store、临时文件和假 transport。

## Owner 与实现结果

- 删除预检现在由 `article-submission-removal-coordinator` 读取生命周期事实并只返回安全的 `blockedItems`；不再生成 `queuedToCancel` 或 queue actions。
- 删除事务 owner 只改变文章内容、回收站/墓碑和删除事务事实；不调用 regular remove、paid cancel 或 order cancel。
- 删除事务保留唯一 article lock、CAS、durable file transaction 和 bounded recovery；恢复只恢复文章内容链路，不恢复投稿任务。
- 永久删除不删除订单、发布和最小审计证据；回收站 restore 明确返回 `queueRestored: false`。
- 普通队列、付费活动目标、活动订单、不确定远端结果、已发布事实均在删除前阻断；已明确终态且保留身份的订单不会因删除而被取消。
- `article-removal-cursor` 不再接受非 article operation kind，关闭了旧 queue operation 的新 writer 入口。
- 历史开放的 queue-action 事务只进行一次性安全 migration/recovery：有持久完成证据则清理旧字段并回到 article phase；证据不足则进入 `needs_repair`，不会执行旧取消动作，也不会被 retry 自动越过。
- 迁移会把旧事务 fingerprint 收敛到当前 selection-only fingerprint，避免旧格式事务绕过新的 open-transaction blocker/dedup。

## 状态矩阵与故障语义

| 场景 | 删除结果 | 外部/队列副作用 |
| --- | --- | --- |
| regular queued / claimed / remote-started | blocked | 队列事实保持不变 |
| paid active target / paid processing | blocked | 不取消投稿、不取消订单 |
| active order / missing order identity / unknown order status | blocked | 不写订单、不触发供应商动作 |
| uncertain publication/submission/order | blocked | 保真，不自动重试或假定成功 |
| published / immutable publication fact | blocked | 发布证据保留 |
| failed/cancelled regular 或有身份的 terminal paid order | 可继续（仍受其他事实约束） | 不回收发布/订单证据 |
| restore | 只恢复文章内容状态 | 不恢复投稿任务 |
| durable move 已完成但进程在后置校验前中断 | 按 tombstone/postcondition 对账后完成 | 不重复移动、不触碰队列 |
| article read / content identity / persistence / lease claim fault | repairable 或安全失败 | 不吞错，不自动执行未知远端动作 |
| old queue-action 有完成证据 | `legacyQueueMigration=completed`，继续 article phase | 只清理旧事务事实，不新建旧格式 |
| old queue-action 无可验证完成证据 | `needs_repair` | 不执行旧 queue action，显式人工修复 |

## 变更文件

- `auto—publish/src/content/article-removal-plan.js`
- `auto—publish/src/content/article-removal-state.js`
- `auto—publish/src/content/article-removal-cursor.js`
- `auto—publish/src/content/article-removal-service.js`
- `auto—publish/src/content/article-trash-service.js`
- `auto—publish/desktop/services/article-submission-removal-coordinator.js`
- `auto—publish/desktop/services/operational-content-submission-service.js`
- `auto—publish/desktop/services/content-submission-application.js`
- `auto—publish/desktop/services/submission-result-reconciliation.js`
- `auto—publish/desktop/ipc/contracts/article-removal-contracts.js`
- `auto—publish/media-workbench/src/types/publication.ts`
- `auto—publish/media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `auto—publish/tests/article-removal-service.test.js`
- `auto—publish/tests/phase-05-production-removal.test.js`
- `auto—publish/tests/ticket-26-g-removal-closure.test.js`
- `auto—publish/tests/article-mutation-coordinator.test.js`
- `auto—publish/tests/article-lifecycle-ticket-22.test.js`
- `auto—publish/tests/phase-05-p1-blockers.test.js`
- `auto—publish/tests/phase-06-content-core-typed-ipc.test.js`
- `auto—publish/tests/fixtures/phase-06-production-ipc-contract-fixtures.js`
- `auto—publish/tests/submission-preparation-lifecycle.test.js`
- `auto—publish/tests/renderer-history-editor-flow.test.js`
- `auto—publish/tests/ticket-25-b-lifecycle-acceptance.test.js`

其中 `article-removal-transaction-store.test.js`、`article-removal-recovery-scheduler.test.js` 等未改动测试用于覆盖既有 CAS/恢复边界；上列为本包实际修改或新增的文件。

## Primary Audit

审计范围限定为本包 diff、删除 owner、直接调用方、typed IPC/renderer contract、migration/recovery、直接回归测试和旧 writer absence；未读取平台 adapter、订单供应商传输、生成模块或无关 migration handoff。

发现均为 `INTRODUCED_BY_CHANGE`，已在本包内修复：

1. **P1，数据一致性/阻断**：旧 queue-action 事务 fingerprint 仍含旧 action 片段，可能绕过 selection-only open transaction blocker/dedup。迁移时重算 fingerprint，并增加旧 fingerprint 回归。
2. **P1，生产删除预检**：OperationalStore lifecycle fact 没有 `clientId` 时误走 projection public-item 转换会崩溃。改为安全 fact 投影，并从选中 article ref 推导必要 client identity；增加 typed IPC 回归。
3. **P1，fail-closed**：只有 legacy queue 字段而没有当前 `blockedItems` 的旧 preview 可能被当作无阻断安全删除。缺少当前 preview facts 时改为 `ARTICLE_REMOVAL_PREVIEW_UNAVAILABLE`。
4. **P2，故障恢复正确性**：durable move 已产生但 source 已不存在时，后置校验可能错误进入 `needs_repair`。改为校验匹配 tombstone/postcondition 后视为已完成，并增加回归。
5. **P2，安全阻断**：completed submission 的未知 outcome、以及存在 order identity 但 status 缺失/空值，可能被错误视为可删除。两类均改为稳定 unknown blocker，并增加 order/submission 状态回归。
6. **P2，legacy absence/API 收敛**：旧 cursor 仍可接受 generic queue operation kind。cursor 的 locate/operation-id/begin 现在明确拒绝非 article kind，避免形成旧 writer 入口。

## Bounded re-audit

只复查上述 6 个 finding 的修复、直接调用方、删除状态矩阵、typed IPC 字段、旧 queue writer absence 以及相同定向测试；没有重新开启 fresh full review。结果：**69 passed, 0 failed**；没有发现新的 P0/P1 或当前正确性、一致性、幂等、安全、公开合同阻塞项。

生产源码中没有 `queuedToCancel`、`cancelArticleSubmissionItem`、`reconcileArticleRemovalAction` 或 `afterQueueAction`；`queueCursor`/`queueResults` 仅存在于删除服务的一次性 legacy migration 读取/清理路径，没有长期兼容 writer。

## 实际验证

以下命令在 `auto—publish` 目录运行：

- `npm ci --ignore-scripts`：通过；根项目与 `media-workbench` 依赖已安装。npm audit 报告根项目 5 个、media-workbench 2 个漏洞（未执行越界修复）。
- `node --test --test-concurrency=1 tests/article-removal-service.test.js tests/article-removal-transaction-store.test.js tests/article-removal-recovery-scheduler.test.js tests/ticket-26-g-removal-closure.test.js tests/phase-05-production-removal.test.js tests/article-mutation-coordinator.test.js tests/phase-06-content-core-typed-ipc.test.js tests/submission-preparation-lifecycle.test.js`：**69 passed, 0 failed**。
- `npm run typecheck:main`：通过。
- `npm run typecheck:renderer`：通过（脚本执行 Renderer `tsc --noEmit`）。
- `npm run typecheck:bridge`：通过（脚本执行 strict bridge `tsc --noEmit`）。
- `npm run lint`：通过。
- 变更相关 JS `node --check`：通过。
- `git diff --check`：exit 0；只有 Windows 工作副本的 LF→CRLF warning，没有 whitespace error。
- `npm test` 曾在最后一轮极小审计修补前运行：全量报告 1,863 passed、13 failed、1 skipped。26-G 相关测试均通过；失败属于既有 ASAR/Playwright、能力 TypeChecker reachability、attention fixture 和 phase-08 capability reachability evidence gap，不是本包删除语义回归。最后审计修补后已用上面的 69/69 定向回归、类型、lint、语法和 diff gate 重新验证，未重复运行全量。

## 未运行的重要验收与原因

- 未运行真实登录、投稿、付费、取消、订单核对、供应商写操作或生产数据库迁移/删除：合同明确禁止。
- 未运行发布打包/ASAR/真实安装后验收：ASAR artifact 与 packaged Playwright 是既有 `PROCESS_EVIDENCE_GAP`，不属于 26-G，且不应通过修改生成物越界修复。
- 全量 `npm test` 未在最后审计微调后重跑；原因是先前全量已收敛为既有 evidence gaps，最后变更已由受影响边界的有界定向回归和静态 gate 覆盖。

## 剩余风险

- 真实第三方生命周期、供应商结果和生产包内资源仍需按项目授权与停止条件另行验证；本包没有对这些系统做任何操作。
- 全仓库仍存在与 26-G 无关的 attention/ASAR/能力 reachability evidence gap，不能用本包定向结果替代这些门禁。
- npm audit 报告的依赖漏洞未在本包处理，避免扩大范围。

本 handoff、实现和测试组成 26-G 单一意图提交；提交 hash 以最终 Git 记录为准。
