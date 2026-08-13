# R2 — F-004 Regular Admission Invalidation Handoff

**状态：** `R2_PASS`

**记录时间：** 2026-08-13（Asia/Shanghai）

## Git、worktree 与执行上下文

- Base integration HEAD：`add4628b2a1fcd26feea7332039527e53e52fedb`，与主线程提供的 integration HEAD 一致。
- 实际 R2 thread：`019ff8eb-74c2-70d0-a82c-b2fb0a012fcc`；source thread：`019ff8d3-3af2-7a50-86fe-4d01204bdff9`。
- 实际 worktree：`C:\Users\violet\.codex\worktrees\aa80\官媒投稿-refactor`；最终保持 detached HEAD，没有夺取主分支、没有创建 subagent、没有并行修改其他 owner。
- 初始工作树用户变更已保留且未 stage：删除的 `M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md` 与未跟踪的 `PAID-SUBMISSION-ACCEPTANCE-REMEDIATION-R1-R4.md`。
- Implementation commit：`d3f5a70b32e2d5266a4dcf0399856c402a98c933` — `fix(r2): invalidate workspace after regular admission`。

## Scope、owner 与实现

本 R2 只处理 `regular-queue-application` 的普通平台 admission invalidation，以及同一 workspace invalidation owner 的窄 composition wiring；未修改 R1 的 `PaidSubmissionStagingPanel`，未进入 R3/R4，也未修改 OperationalStore schema、Article lifecycle owner、IPC/preload contract 或 renderer 状态 owner。

- `auto—publish/desktop/services/regular-queue-application.js`
  - 在 `coordinator.admitRegularQueueItems()` 成功返回后检查 `result.admittedCount > 0`。
  - 真实创建新 queue items 时同步调用一次 `onDataInvalidated("SUBMISSION_BATCH_CREATED")`。
  - `admittedCount === 0` 的 idempotent replay 不通知、不增加 revision。
  - listener failure 按现有 service 约定隔离并安全诊断；mutation 失败发生在通知前，既不伪造成功也不将业务错误转换为 `IPC_INTERNAL`。
- `auto—publish/desktop/composition/workspace-runtime-composition.js`
  - 只把现有 `invalidation.invalidate` 注入 regular application；没有新增 refresh bus 或旁路 writer。
- `auto—publish/tests/phase-07-regular-queue.test.js`
  - 使用真实 ContentStore、OperationalStore、ArticleMutationCoordinator 和公开 workspace/renderer seams 增加 T1/T2/T3/T4；保留并运行原有 T5 regular regressions。

## Acceptance 与 self-audit

- T1：新 admission `admittedCount > 0` 产生 exactly one `SUBMISSION_BATCH_CREATED`。
- T2：纯 idempotent replay `admittedCount === 0` 不产生新的 invalidation。
- T3：文章管理快照在既有 workspace revision 变化后重读，从 `pending_submission` 变为 `queued`，不再停留旧待投稿状态。
- T4：platform feature 收到既有 `platformQueue` scope 后自动刷新 regular queue groups，并显示新 queue item。
- T5：FIFO、平台/账号分组、duplicate/idempotent、cross-channel guard、partial admission、error/uncertain、暂停/重启和直接 IPC/协调器回归通过。

Bounded self-audit 检查了唯一 owner、mutation 成功边界、idempotent/partial/error/uncertain 语义、workspace revision/cache、platformQueue consumer、callback diagnostic boundary 和未引入第二 writer；未发现 P0/P1/P2 blocking finding。R2 不扩大为 R3/R4 或全仓 fresh review。

## 实际命令与真实结果

环境：Windows `win32/x64`，Node `v24.16.0`。派生 worktree 无本地 `node_modules`；测试使用进程级 `NODE_PATH=F:\官媒投稿-refactor\auto—publish\node_modules` 复用主工作树依赖，未执行 npm install、未留下 junction。

| 命令 | 实际结果 |
| --- | --- |
| `$env:NODE_PATH='F:\官媒投稿-refactor\auto—publish\node_modules'; node --test --test-name-pattern='regular admission invalidates exactly once' tests/phase-07-regular-queue.test.js` | 预修复红灯：`FAIL`，实际 invalidation 数组为 `[]`，期望 `SUBMISSION_BATCH_CREATED`。 |
| `$env:NODE_PATH='F:\官媒投稿-refactor\auto—publish\node_modules'; node --test tests/phase-07-regular-queue.test.js` | `13/13 PASS`。 |
| `$env:NODE_PATH='F:\官媒投稿-refactor\auto—publish\node_modules'; node --test tests/ticket-25-c-regular-platform-acceptance.test.js` | `4/4 PASS`。 |
| `$env:NODE_PATH='F:\官媒投稿-refactor\auto—publish\node_modules'; node --test tests/phase-12-paid-media-preflight.test.js` | `21/21 PASS`。 |
| `$env:NODE_PATH='F:\官媒投稿-refactor\auto—publish\node_modules'; node --test tests/workspace-runtime-lifecycle.test.js` | `10/10 PASS`。 |
| `$env:NODE_PATH='F:\官媒投稿-refactor\auto—publish\node_modules'; node --test tests/phase-02-paid-media-staging-application-ipc.test.js` | `4/4 PASS`。 |
| `$env:NODE_PATH='F:\官媒投稿-refactor\auto—publish\node_modules'; node --test tests/article-mutation-coordinator.test.js` | `15/15 PASS`。 |
| `node 'F:\官媒投稿-refactor\auto—publish\node_modules\eslint\bin\eslint.js' --config 'F:\官媒投稿-refactor\auto—publish\eslint.config.mjs' --no-ignore auto—publish/desktop/services/regular-queue-application.js auto—publish/desktop/composition/workspace-runtime-composition.js auto—publish/tests/phase-07-regular-queue.test.js` | `PASS`, 0 errors. |
| `git diff --cached --check`（implementation staged diff） | `PASS`。 |

## 未运行的 gate 与剩余风险

- 未运行完整 `npm test`、full `npm run lint`、renderer typecheck/build、packaging、production smoke、Wave combined bounded re-audit 或最终 clean integration gate；这些不属于本 R2 bounded remediation，且派生 worktree 没有本地依赖。最终 Wave gate 必须由主线程在 integration HEAD 上重新执行。
- 对三个本次触及文件运行 file-wide Prettier `--check` 时均报告未格式化；没有执行 `--write`，避免把既有文件格式差异扩大为 R2 无关变更。该格式证据 gap 不影响本 R2 公开行为 acceptance，但需后续格式 owner 处理。
- 未执行真实登录、真实平台发布、真实付费、生产数据库、公开页面轮询或任何外部副作用操作。

## 主线程集成入口

- 主线程应核验 implementation commit `d3f5a70b32e2d5266a4dcf0399856c402a98c933`、本 handoff、最终测试和 dirty user changes 后再进行授权 integration。
- 本线程不 merge、不 push、不进入 R3/R4、不修改主线程用户变更。

**结论：** `R2_PASS`
