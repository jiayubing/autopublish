# 26-D — 投稿中心只读模型与普通队列操作：实施与审计交接

## 执行范围

- 基线：`53a15ca1cbb8f6c53c5be43f9801ab1be507904f`。
- Worktree：`C:\Users\violet\.codex\worktrees\2a8e\官媒投稿-refactor\auto—publish`。
- 当前 worktree 保持 detached HEAD；未切换、push、release 或执行真实登录/投稿/付费/取消/生产数据库迁移。
- 本交接只覆盖 26-D；未进入 26-E 及后续工作包。

## 结果与 owner

`regular-queue-application.js` 现在是投稿中心普通队列 query/read model owner。它从现有 `regularQueueGroupTransitions.listRegularQueueGroupSnapshots` 读取组状态、当前项和 FIFO 剩余项，补充安全的文章标题/客户摘要，并显式白名单投影公开字段；内部 claim、publication snapshot 和其他运行时字段不进入公开模型。文章或客户摘要不可读、为空或不安全时返回明确的 `标题不可用` / `客户信息不可用` fallback，并通过安全 diagnostic 保留读失败证据。

OperationalStore regular queue runtime 只补充现有 item payload 中的 `clientId` 投影，未改变 claim、outcome、uncertain 或重试状态机。IPC query 绑定到 regular queue application；start/pause/remove 仍调用既有 regular queue application/coordinator/orchestrator owner。平台 feature 以统一 revision/query identity 刷新投稿中心，普通队列移出成功或冲突后重新读取 read model。

文章库移除了 start/pause/remove-pending/cancel-batch 的执行命令和按钮，只保留普通平台投稿 admission 与“查看投稿中心”导航。投稿中心负责按平台/账号显示队列、动作和安全摘要；只有 `remaining` 中尚未开始的 queued item 显示移除按钮，当前 in-flight item 不提供移除动作。

## 公开行为与状态矩阵

| 状态/动作 | 持久事实与公开行为 | 证据 |
| --- | --- | --- |
| 启动暂停组 | `pauseIntent != none` 且有工作时 `canStart=true`、`canPause=false`；start 继续走既有 group owner | phase-07、renderer slice |
| 运行组 | `pauseIntent=none` 时 `canStart=false`、`canPause=true`；不同平台仍可并行，同平台仍由既有会话锁串行 | phase-07、regular outcome |
| 当前项 | 只读展示当前文章安全摘要、phase/claimUntil；UI 不允许移除 | phase-07 read model、renderer slice |
| 剩余 FIFO 项 | 按 transition port 的 position 展示安全摘要；仅 queued remaining item 可发起移除 | phase-07 read model/removal matrix |
| queued 移除 | 由 coordinator 原子结束目标并恢复文章可编辑，不回收文章；重复请求保持幂等 | phase-07 |
| claimed/prepared/remote-started/uncertain/published 或 active order | 不可移除；远端结果不确定不自动重试 | phase-07、regular outcome |
| 空组或无可执行项 | `canStart=false`、`canPause=false`，保留稳定 reason code | phase-07、renderer slice |

## Primary Audit

按 26-D owner、公开合同、状态矩阵、失败路径、幂等/并发、直接调用方和文章库执行控制清零完成 Primary Audit。

1. `INTRODUCED_BY_CHANGE / blocking`：初版 read model 直接展开 transition snapshot，可能把未来内部字段带入 IPC。已修复为组和 item 的显式白名单投影，并补充 no-claim/no-publication-snapshot 断言。
2. `INTRODUCED_BY_CHANGE / blocking`：摘要文本的安全边界和异常 item identity 失败路径不够明确。已统一拒绝控制符及路径分隔符，使用明确 fallback；malformed identity 稳定失败为 `REGULAR_QUEUE_ARTICLE_IDENTITY_UNAVAILABLE`。
3. `EXPOSED_PREEXISTING / non-blocking`：`attention.listArticleAttention` 的 lifecycle snapshot consumer 仍无法被 phase-06 TypeChecker evidence 识别。attention owner 不在 26-D 范围内，未新增旁路修复。
4. `PROCESS_EVIDENCE_GAP / non-blocking`：capability-specific inventory 仍因 worktree 缺少 `release-alpha/win-unpacked/resources/app.asar` 而无法证明 ASAR artifact absence。按本包禁止打包/发布，未生成该 artifact。

`content.cancelSubmissionBatch` 的 preload/bridge/IPC 合同及静态历史 fixture 仍保留，但当前文章 management feature 和文章库 UI 已不再暴露或调用该执行命令；其完整 capability retirement 不在 26-D 范围内，记录给后续 owner，未伪造为已清零。

## Bounded re-audit

针对上述修复、直接调用方及受影响不变量复审：

- `tests/phase-07-regular-queue.test.js`：14/14 pass；
- `tests/regular-platform-outcomes.test.js`：26/26 pass；
- platform/media/settings renderer slice：9/9 pass；article-management/profile regression：2/2 pass；
- typed IPC/content submission IPC：15/15 pass；renderer contract layout：3/3 pass；responsive layout：7/7 pass；
- main typecheck、media lint、media strict typecheck、renderer build、JS syntax check、`git diff --check`：通过；
- 修复后再次运行 phase-07、renderer slice、article-management regression、main typecheck、syntax 和 diff check：全部通过。

未发现新的本包 blocking finding；Primary Audit 中两个 introduced blocking finding 已关闭。phase-06 production fixture matrix 仍为 33 pass、2 fail，两个失败均为同一个既有 attention evidence gap；capability-specific inventory 仍为 3 pass、1 fail，失败为禁止本包生成的 ASAR artifact evidence gap。

## 实际命令与结果

通过：

- `npm ci --ignore-scripts`；`npm --prefix media-workbench ci --ignore-scripts`（仅安装忽略目录依赖，未运行 audit fix）；
- `node --test tests/phase-07-regular-queue.test.js`（14/14）；
- `node --test tests/regular-platform-outcomes.test.js`（26/26）；
- `node --test tests/phase-08-platform-media-settings-workspace-renderer-slice.test.mjs`（9/9）；
- `node --test tests/renderer-content-submission-batch-actions.test.js tests/renderer-lieju-publication-profile.test.js`（2/2）；
- `node --test tests/phase-06-submission-typed-ipc.test.js tests/content-submission-ipc.test.js`（15/15）；
- `node --test tests/phase-08-renderer-contract-layout.test.js`（3/3）；
- `node --test tests/renderer-responsive-layout.test.js`（7/7）；
- `npm run typecheck:main`；`npm --prefix media-workbench run lint`；`npm --prefix media-workbench run typecheck:strict`；
- `npm run build:renderer`（通过；仅有已有大 chunk warning）；
- `node --check desktop/services/regular-queue-application.js`；`git diff --check`；
- `node scripts/verify-legacy-absence.js`；`node --test tests/architecture-seams.test.js`。

保留 evidence 但未全绿：

- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js`：33 pass、2 fail，均为 `attention.listArticleAttention` lifecycle reachability；
- `node --test tests/phase-06-capability-specific-inventory.test.js`：3 pass、1 fail，失败为缺少当前 ASAR artifact。

## 未运行的重要验收与剩余风险

- 未运行完整项目 test suite、完整 phase-08 gate 聚合或打包产物验收；本包只运行直接风险套件和 renderer build/响应式验收。
- 未执行真实账号登录、远端投稿、付费、取消、生产数据库迁移/删除、发布或 push；只使用合成数据、内存和假 transport。
- 未修复 attention reachability evidence gap，也未生成 release ASAR；二者分别属于 attention owner 与打包/发布流程。
- 依赖安装报告 root 5 个、media 2 个 audit warning；未运行 `npm audit fix`，避免扩大范围。

最终 commit hash 由本任务最终报告给出；本 handoff 与源码、测试保持同一单一意图提交。
