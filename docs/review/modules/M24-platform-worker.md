# M24 平台任务主进程与 worker 深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M24 负责主进程到 child worker 的任务协议、runId、进度/heartbeat/watchdog、stop/pause、临时 Hepan cookie 生命周期、worker 内队列重验、ledger/batch outcome、归档与终态快照。worker 是可崩溃隔离边界；远端调用开始后必须优先保护“结果未知”，主进程快照不能替代 publication ledger。

十项维度均已覆盖。计划只向 worker 传安全相对任务引用，worker 重解路径/sidecar/文章身份，runId 可拒绝显式旧控制命令，terminal snapshot 不暴露绝对路径。但共享的 mutable active run 字段允许 stop 后重入并错误归属旧消息；watchdog 强杀同步远端调用时无法把已持久化 `submitting` 转成 `uncertain`。

## 已检查目录与关键文件

- 全部模块生产文件：`desktop/services/desktop-task-service.js`、`platform-task-state-store.js`、`platform-workbench-service.js`（820 行完整读取）、`desktop/worker/run-task.js`、`desktop/ipc/platform-ipc.js`。
- 直接调用/组合：`desktop/workspace-runtime.js`、renderer platform bridge/controller/store/PlatformWorkbench、`desktop/services/submission-boundary.js`。
- 被调用方：`src/publication/` 全部、`submission-batch-store.js`、`core/stop-signal.js`、`core/operator-flow.js`、`core/playwright.js`、`core/files.js`，以及 Hepan `spawnSync` 运行边界。
- 相关测试：`desktop-task-service.test.js`、`platform-task-progress.test.js`、`platform-workbench-service.test.js`、`platform-submission-invocation-count.test.js`、`hepan-publish-interval.test.js`、`submission-batch-worker-integration.test.js`、`platform-archive-worker-boundary.test.js`、`platform-ipc-boundary.test.js`、`renderer-platform-task-store.test.js`。无未读 M24 生产文件。

## 关键调用链

1. Renderer submissions + runId → platform IPC 校验 → main 构建/捕获身份 → `startPlatformSubmit` → fork worker（仅 source/filename/target）。
2. worker 重载 adapters/paths → 250ms heartbeat → `submitSelectedPlanSerially` → sidecar/hash/trashed 重验 → reserve/markSubmitting → `remote-started` → adapter → `remote-finished` → ledger/batch → archive。
3. main `onState` → state store 去重计数/持久化 → renderer；worker result/stop/watchdog → `finish`，剩余任务按 stopped=skipped、其他=uncertain 终结快照。
4. stop/pause 在远端前可 abort/kill；远端开始后只发信号，等待所谓 safe point。

## 候选发现

## TEMP-M24-01：远端调用期间 stop 会先清除 busy 标志，允许第二个 run 启动并把旧 worker 消息冒充为新 run

- 分类：并发和生命周期 / 进程协议 / 幂等性
- 所属模块：M24 平台任务主进程与 worker
- 严重程度：高
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/desktop/services/desktop-task-service.js:39-43` 共享状态；`:198,215-218` payload/onState；`:296-309` `stopPlatformSubmit`；`:152-190` start guard/新 run
- 问题描述：当 `platformRemoteCallStarted=true` 时 stop 不触发 abort、不 kill child，却无条件立刻把 `isPlatformRunning=false`。下一次 start 可通过 guard，覆盖 `platformChild` 和 `activePlatformRunId`。旧 child 的 callback 在收到 state 时动态读取共享 `activePlatformRunId`，把旧任务事件强制改写成新 runId；任一旧 finally 又会清空新 run 的共享字段。
- 代码证据：onState 没有捕获 start 时的 local runId；使用 `Object.assign(...,{runId:activePlatformRunId})`。stop 远端进行中仍在 `:307` 清 busy。start 只检查这个布尔值。
- 触发条件：投稿已经发出 `remote-started`，操作员点击 stop，然后在旧远端调用返回前再次启动投稿（同步 Hepan/Playwright 调用尤其现实）。
- 可达路径或调用链：run A remote-started → stop(A) → UI/state 显示 not running → start(B) → run A state/result → 被写入 B snapshot/清理 B 句柄。
- 实际影响：两个 worker 并发调用外部平台，可能重复投稿；进度、计数、stop runId 和终态归属错误；旧 run finally 可让新 run 失去控制和临时凭据所有权。
- 影响范围：同一应用进程中 stop/pause 后快速重启的平台批次；多个目标均可能受影响。
- 现有测试是否覆盖：覆盖 runId store 去重和单 run watchdog/stop；没有“remote-started→stop→start another→old message”测试。
- 验证方法与结果：注入两个 EventEmitter child；run A 发 `remote-started` 后 stop，`getState.isPlatformRunning=false`；成功启动第二 child。随后发送 A 的 `remote-finished`，当前 snapshot 的 runId 是 B、currentTask 却变成 A。退出码 0。
- 修复方向：每个 run 使用不可变 context（runId/child/abort/watchdog/cleanup）和单一 lifecycle；远端未终结前保持 active 或进入 `stopping`，禁止 start；只接受 message 自带且等于 context.runId 的事件；旧 finally 不可写新 context。
- 关联发现：TEMP-M24-02、TEMP-M20-01。

## TEMP-M24-02：watchdog 可在同步远端调用中强杀 worker，ledger 留在 `submitting` 且没有 uncertain/reconcile 恢复路径

- 分类：错误处理 / 远端不确定性 / 生命周期
- 所属模块：M24 平台任务主进程与 worker
- 严重程度：高
- 置信度：高
- 验证状态：部分验证
- 位置：`desktop/services/desktop-task-service.js:198-235` watchdog；`desktop/worker/run-task.js:156-170` heartbeat；`desktop/services/platform-workbench-service.js:708-739` mark/remote/outcome；`src/platforms/hepan/adapter.js:75,105` 240 秒 `spawnSync`
- 问题描述：worker heartbeat 是 event-loop timer。Hepan 远端调用用最长 240 秒的 `spawnSync`，会阻塞 heartbeat；main 默认 watchdog 约 95 秒后无条件 kill child，即使已收到 `remote-started`。ledger 在调用前已写 `submitting`，kill 后 worker 无机会 record `uncertain`。main 只把运行快照的剩余任务计为 uncertain，不更新 ledger。
- 代码证据：watchdog timeout 分支不检查 `platformRemoteCallStarted`；`markSubmitting` 在 adapter 前；publication `reconcile` 只接受当前 `uncertain`，而 `submitting` 阻止新 reservation。
- 触发条件：Hepan/同步 Playwright 命令在远端开始后超过 watchdog，worker hang/crash，或 main 强杀。
- 可达路径或调用链：worker markSubmitting → remote-started → blocking adapter/event loop无 heartbeat → watchdog kill → task snapshot failed/uncertain → ledger submitting forever。
- 实际影响：远端可能已成功但本地无法判断；同目标永久不能重试，也没有 attention/reconcile 动作；人工查看 UI 快照与 ledger 事实相互矛盾。
- 影响范围：被强杀时的当前 publication；连续批次可累积 stranded records。
- 现有测试是否覆盖：现有 watchdog 测试只断言错误码；没有真实 ledger 状态或 sync adapter 超时恢复断言。Hepan interval 测试不覆盖 `spawnSync` 阻塞 heartbeat。
- 验证方法与结果：静态端到端核对已确认 240s sync > 95s watchdog、kill 分支和 ledger 状态机无 recovery；现有 watchdog 测试通过但未覆盖后果。未向真实远端发请求，故标记部分验证。
- 修复方向：远端开始后 watchdog/进程退出必须由持久化 recovery intent 将当前 attempt 转为 `uncertain`；使用异步可取消 child API维持 heartbeat，或让 watchdog 感知远端阶段和 adapter deadline；启动时扫描 stranded submitting 并保守核对。
- 关联发现：TEMP-M22-01、TEMP-M23-02、第一阶段 R6/R7/R16。

## TEMP-M24-03：已知远端 outcome 的 ledger 写失败只记录在 worker 返回 DTO，随后仍可归档并结束任务

- 分类：数据一致性 / 错误处理 / 可观测性
- 所属模块：M24 平台任务主进程与 worker
- 严重程度：高
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/desktop/services/platform-workbench-service.js:727-744`；`:761-791` archive；`desktop/services/desktop-task-service.js:244-258` terminal finish
- 问题描述：`ledger.recordOutcome` 抛错时仅设置 `result.ledgerError`，任务仍按远端 outcome 计数；若 outcome published，还可继续归档队列。返回主进程后没有强制 reconcile/持久化 recovery intent。ledger 通常仍为 `submitting`，而 batch/归档/运行快照可能表示 published。
- 代码证据：catch 明确注释“不制造 retryable failure”但没有写 durable uncertain；archive 判定使用 `result.publicationStatus` 而不是重新读取 ledger。`result.ledgerError` 终态 DTO在 state store 的安全缩减中也不会成为可操作状态。
- 触发条件：远端返回明确结果后 publication 文件被遗锁、磁盘/权限/rename 错误。
- 可达路径或调用链：adapter result → `recordOutcome` throws → result retains published/submitted → batch/archive/worker result → main finish/invalidate → ledger remains submitting。
- 实际影响：远端事实、ledger、batch和队列归档互相矛盾；重复保护会永久挡住目标，但 attention 不显示 submitting，现场难以恢复。
- 影响范围：任何普通平台任务的 outcome ledger 写失败。
- 现有测试是否覆盖：覆盖 remote success + archive failure；没有 remote success + ledger write failure。M13 最小复现对等逻辑得到 `submitted` + `ledgerError`。
- 验证方法与结果：注入 ledger `recordOutcome` 抛 `PUBLICATION_STORAGE_WRITE_FAILED`，通用等价协调逻辑仍返回 `submitted` 且只附 ledgerError；生产 platform-workbench catch 结构相同。代码路径可达，退出码 0。
- 修复方向：将“已知远端 outcome、ledger 未持久化”写入独立 durable recovery journal；在 ledger 成功或 recovery intent 持久化前不得归档/宣告普通完成；attention 必须暴露该状态。
- 关联发现：TEMP-M27-02、第一阶段 R6/R16。

## 测试情况

- 联合定向命令 133/133 通过，包括 task progress、watchdog、Hepan interval、worker/batch integration 和 archive 边界。
- stop 重入最小复现退出码 0并确认两个 child 并存、旧消息污染新 run。
- 未执行真实浏览器、Hepan 或强杀远端请求，避免外部影响。

## 未覆盖区域与待验证

- Windows 下 `child.kill`/SIGKILL、Python 子孙进程和 Playwright daemon 的真实终止语义待现场故障注入。
- 真实远端是否提供幂等键/查询 API影响恢复策略，但不改变本地竞态事实。
- 临时 Hepan Cookie 的 Windows ACL 属 M26；本轮只核对 cleanup 生命周期。

## 模块审查结论

M24 达到深审完成门槛，3 条高风险候选。runId 在单 run 正常路径有效，但共享 active state 使 stop 后重入失守；watchdog 和 ledger write failure 都没有把远端不确定性持久化为可恢复事实，是本波次最高优先级问题之一。
