# 26-C — 统一发起投稿与付费暂存退役：实施与审计交接

## 执行范围

- 基线：`f76bbf116d9c2dbd982a64d1d1862400c0605881`。
- Worktree：`C:\Users\violet\.codex\worktrees\bc9a\官媒投稿-refactor`。
- 当前 worktree 保持 detached HEAD；未切换、push、release 或执行真实登录/投稿/付费/取消/生产数据库迁移。
- 本交接只覆盖 26-C；未进入 26-D 或后续工作包。

## 结果与 owner

统一投稿入口现在由 `OperationalStore` 的 queue admission transaction 直接写入 regular/paid admission 事实。付费选择只存在于 preflight service 的内存 confirmation map 和 renderer 当前交互状态中；运行时不再创建或读取 `paid_staging_items`，也不再暴露 staging aggregate、IPC、preload、bridge、feature 或 UI。旧表仅作为 v6→v7 迁移输入被一次性读取。

OperationalStore schema 升至 v7。v6→v7 迁移在一个事务中按稳定 article ref 排序记录安全的 `submission_migration_notices` 摘要、清理旧 `paid_staging_items`，并保持文章待投稿状态；不创建 order、attempt、remote request 或 publication fact。旧 paid staging domain/service/transition ports、组合装配和相关 UI/测试已删除，没有新增 wrapper、alias 或第二 writer。

## 公开行为与事务状态矩阵

| 状态/动作 | 持久事实 | 公开行为 | 证据 |
| --- | --- | --- | --- |
| regular 预检/选择 | 不写 OperationalStore | 只返回当前文章/目标可提交性 | content/submission 定向套件 |
| paid 预检/选择 | 不写 batch、target 或 staging row | 只保留当前 renderer 选择和 service 内存 confirmation | `ticket-26-c-unified-submission-intake.test.js` |
| paid 确认成功 | 一次 paid admission、一个发布目标/生命周期提交事实 | 返回 batch/result；后续由既有 paid execution owner 处理 | Ticket 26-C focused test、Ticket 25-D acceptance |
| 重复确认或 stale precondition | 不追加 admission；已有事实不被覆盖 | 返回稳定 stale/idempotency 结果 | focused test、既有 admission/acceptance 套件 |
| 价格或文章 fingerprint 在确认前变化 | 不追加 admission | 返回 `PAID_MEDIA_CONFIRMATION_STALE` | Ticket 26-C focused test |
| v6→v7 迁移任一 fault point 失败 | v6 schema、旧 rows、无 notice 保留 | 迁移错误传播，可安全重试 | focused test 的 5 点 fault matrix |
| v6→v7 重试成功 | schema v7、旧表消失、每次迁移一条安全 notice；无订单/发布事实 | 文章仍待投稿，可人工重新选择付费目标 | focused test |
| v6 空旧表迁移 | schema v7、无虚构 notice | 正常完成，不产生提交事实 | focused test |
| regular/paid 同一文章目标并发/冲突 | 由既有 admission lock/唯一事实约束处理 | 不恢复双路线或第二状态机 | phase-04、Ticket 25-C/D 定向套件 |

## Primary Audit

按 26-C owner、公开合同、事务/回滚、并发/幂等、旧能力清零和直接调用方检查完成 Primary Audit。发现及处置如下：

1. `INTRODUCED_BY_CHANGE / blocking`：v7 迁移在 drop 旧表前复用严格结构校验，会因旧表仍存在而拒绝迁移。已修复为在 drop 前使用允许 legacy table 的校验选项；迁移 fault matrix 已覆盖。
2. `INTRODUCED_BY_CHANGE / blocking`：maintenance、verifier 和 schema history 仍停留在 v6。已统一到 v7 history/verify，并由 operational-store internals 套件覆盖。
3. `INTRODUCED_BY_CHANGE / blocking`：首次 renderer 重写后 paid execution 的 start/pause 生产 capability reachability 失效。已恢复既有 `content.commands` 公共路径、补齐静态 consumer 类型可达性并修正 fixture owner 映射；bounded re-audit 已通过 start/pause 检查。
4. `EXPOSED_PREEXISTING / non-blocking`：`attention.listArticleAttention` 的 lifecycle snapshot field consumer 仍无法被 phase-08 TypeChecker 识别。attention owner 不在 26-C diff 内，未为此新增旁路修复；phase-08 gate 当前只剩该既有 finding。
5. `PROCESS_EVIDENCE_GAP / non-blocking`：capability-specific inventory 的 media artifact 检查因 worktree 不含 `release-alpha/win-unpacked/resources/app.asar` 未通过。按本任务禁止打包/发布的边界未生成该 artifact。

## Bounded re-audit

仅针对上述 finding、修复 diff、直接调用方和受影响不变量复审：

- Ticket 26-C、Ticket 13/14、paid media owner、Ticket 25-D 组合：36/36 pass；
- content workbench、typed IPC、OperationalStore internals/schema/lifecycle、Ticket 23-C 组合：64/64 pass；
- renderer generation/history/lieju/submission preparation：17/17 pass；
- phase-08 renderer layout 与 artifact absence：6/6 pass；
- phase-08 capability reachability：start/pause 已恢复；`attention.listArticleAttention` 仍是唯一失败项；
- production IPC fixture matrix：33 pass、2 fail，两个失败均为同一个 attention lifecycle consumer evidence gap；
- `git diff --check`、main typecheck、media strict typecheck、lint、renderer build：通过。

未发现新的本包 blocking finding；Primary Audit 的三个 introduced blocking finding 均已关闭。

## 实际命令与结果

通过：

- `npm ci --ignore-scripts`
- `npm --prefix media-workbench ci --ignore-scripts`
- `node --test --test-concurrency=1 tests/ticket-26-c-unified-submission-intake.test.js`（3/3）
- `node --test --test-concurrency=1 tests/phase-08-operational-store-internals.test.js`（8/8）
- `node --test --test-concurrency=1 tests/phase-02-operational-store.test.js`（17/17）
- `node --test --test-concurrency=1 tests/phase-03-operational-store-v3.test.js`（6/6）
- `node --test --test-concurrency=1 tests/phase-04-operational-store-lifecycle.test.js`（8/8）
- `node --test --test-concurrency=1 tests/article-lifecycle-ticket-23-c.test.js`（8/8）
- `node --test --test-concurrency=1 tests/phase-06-content-operations-typed-ipc.test.js`（9/9）
- `node --test --test-concurrency=1 tests/phase-08-renderer-contract-layout.test.js tests/phase-08-renderer-contract-artifact-absence.test.js`（6/6）
- renderer generation/history/lieju/submission preparation 定向组合（17/17）
- Ticket 26-C/13/14/paid media owner/25-D 定向组合（36/36）
- content workbench/typed IPC/OperationalStore/Ticket 23-C 定向组合（64/64）
- `node --test --test-concurrency=1 tests/test-inventory-contract.test.js`（23/23）
- `npm run test:inventory`（通过；生成的 M05 台账已恢复为基线，未纳入提交）
- `npm run typecheck:main`
- `npm --prefix media-workbench run typecheck:strict`
- `npm run lint -- --no-warn-ignored`
- `npm run build:renderer`（通过；仅有已有大 chunk warning）
- `git diff --check`

未完全通过但已保留 evidence：

- `npm run test:phase-08:gates`：仅因 `attention.listArticleAttention` reachability finding 失败；其余相关 gate 通过。
- `npm run verify:phase-08`：仅同一 attention capability reachability violation，status 为 `FAILED`。
- `node --test --test-concurrency=1 tests/phase-06-production-ipc-fixture-matrix.test.js`：33 pass、2 fail，均为同一 attention lifecycle consumer finding。
- capability-specific inventory：3 pass、1 fail，失败为缺少禁止本任务生成的 ASAR artifact。

## 未运行的重要验收与剩余风险

- 未执行真实账号登录、远端投稿、付费、取消、生产数据库迁移/删除、发布或 push；仅使用合成数据、内存和假 transport。
- 未将现有 attention reachability finding 扩大为 26-C 外的 owner 修复；该 finding 需要 attention 工作包/owner 处理。
- 未为通过 artifact-specific inventory 生成 release ASAR；这会进入打包/发布边界，且不属于本包。
- npm 安装报告 root 5 个、media 2 个 audit warning；未运行 `npm audit fix`，避免扩大范围。
- 本包最终提交 hash 见任务最终报告；本 handoff 与源码、测试在同一个单一意图提交中。
