# 文章生命周期重构波次执行计划

> 用途：记录当前执行进度，并定义用户在任一 Codex 主线程中说“执行波次 X”时的唯一调度行为。本计划只负责创建独立 ticket 线程并执行代码，不自动审计、提交、合并或推送。

## 1. 使用方式

在 `F:\官媒投稿-refactor` 项目中的任一新线程直接输入：

```text
执行波次 3
```

主线程必须读取本计划、根目录 `AGENTS.md` 和该波次 ticket，验证调度依赖与 Git 状态，然后为该波次每个允许并行的 ticket 创建一个独立 Codex worktree 线程。权威规格、owner、调用方和测试由 ticket 线程在实施前勘察中按本 ticket 范围读取；主线程不借波次启动重新审计已完成波次。

“执行波次 X”只授权：

1. 检查集成分支、依赖、已有分支、worktree 和重复任务。
2. 创建该波次可执行 ticket 的独立 worktree 线程。
3. 在每个 ticket 线程中创建对应分支、实施代码、运行定向测试并留下交接。

它不授权：

- ticket 审计或审计子代理；Ticket 25 的专用 prompt 只执行最终验收用例、门禁和证据收集，完成后同样由用户另派审计 subagent；
- 自动修复审计发现；
- `git add`、commit、merge、rebase、push 或 PR；
- 删除、移动或清理 worktree；
- 运行完整 `npm test`（Ticket 25 按其最终验收合同执行时除外）；
- 使用 `$implement` 技能；
- 真实平台登录、发布、付费、取消或生产数据操作。

上述操作均由用户后续对每个 ticket 单独下达指令。

## 2. 当前进度快照

快照时间：2026-08-07。每次执行前必须以当前 Git 状态重新验证，快照不能覆盖 Git 事实。

| 项目                            | 当前状态                                                              | 证据/说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 集成工作树                      | `F:\官媒投稿-refactor`                                                | 固定用于 `codex/article-lifecycle-submission`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 波次 2 验收基线                 | `3516fb5`                                                             | `fix: close wave 02 integration findings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 波次 1                          | `COMPLETE`                                                            | 01、03、11、17 已进入集成分支，波次审计修复已合并                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 波次 1 审计修复                 | `COMPLETE`                                                            | 集成历史包含 `e02e6b3` 及其前置修复提交                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 全量测试运行器优化              | `COMPLETE`                                                            | 集成历史包含 `651654c perf: optimize full test execution`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 波次 2                          | `COMPLETE`                                                            | 02、04、05 已进入集成分支；集成审计修复提交为 `3516fb5`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 波次 2 验收                     | `COMPLETE`                                                            | Phase 8、production-smoke、格式门禁与完整 `npm test`（1706/1706）通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 波次 3                          | `COMPLETE`                                                            | Ticket 06 已完成独立审计、findings 修复、提交、合并及合并后定向复验；用户已确认合并结果并要求推进波次 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 波次 3 执行组 06                | `COMPLETE`                                                            | threadId `019fd707-7d7f-7981-bc13-240a8c0bd578`；source threadId `019fd703-97d7-73d2-878e-7e6eb0f99509`；hostId `local`；worktree `C:\Users\violet\.codex\worktrees\4550\官媒投稿-refactor`；branch `codex/article-lifecycle-06`；base `754e40c0a47a612dd6a2175de4f8f4a5126113b5`；ticket commit `7cf63681c4d782e35229c4e9410a2fac17753a37`；integration commit `775720b5480046998262da9992e93ccca34e9184`                                                                                                                                                                                                                                                                                                                                |
| 波次 3 审计与修复               | `COMPLETE`                                                            | 独立审计 threadId `019fd791-0a55-73c2-8464-e8eba4c90544` 报告 3 P1、2 P2、1 P3；修复后由波次 4 启动前审计 threadId `019fd7be-e2f6-7a70-950c-28ad4d6bc239` 逐项核对已知 findings 的生产接线与回归证据，无遗留阻塞 finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 波次 3 合并后定向复验           | `COMPLETE`                                                            | `node --test tests/article-mutation-coordinator.test.js tests/phase-05-production-removal.test.js tests/phase-02-operational-store.test.js tests/phase-11-media-supplier-contract.test.js`：45/45，约 1.4s；`npm run lint`：通过，约 6.2s；`npm run typecheck:main`：通过，约 1.3s；`npm run typecheck:bridge`：通过，约 2.4s；`npm run typecheck:renderer`：通过，约 4.0s                                                                                                                                                                                                                                                                                                                                                                |
| 波次 4 执行组 07                | `COMPLETE`                                                            | threadId `019fd7f0-b064-7892-be0a-e7a7d4ccb987`；hostId `local`；worktree `C:\Users\violet\.codex\worktrees\f8f0\官媒投稿-refactor`；branch `codex/article-lifecycle-07`；base `e96f4e3eef238649ae81a1c398c39ed18e14d5ac`；ticket commit `690a29fbf6489c51ffc15b2c37f60f738405a178`；merge commit `ae12f36c37518ac66d9bf1ef703d8fdbbf0fca99`；integration fix `1298214c543a944ce388856cef88ce3d97d8d83b`                                                                                                                                                                                                                                                                                                                                  |
| 波次 4 Ticket 07 审计与修复     | `COMPLETE`                                                            | 深度独立审计报告 2 P1、1 P2：取消审计事实被删除、Renderer 成功路径变量错误、外部 `batchId` 可跨客户混批；均已修复并由公开合同、事实投影与定向测试逐项复核，无遗留阻塞 finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 波次 4 Ticket 07 合并后定向复验 | `COMPLETE`                                                            | 业务/IPC/真实 Renderer 定向回归 47/47；production IPC matrix 34/34；Phase 8 gate 5/5；lint、main/bridge/renderer typecheck 通过；本票触达文件格式检查通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 波次 4 执行组 12                | `COMPLETE`                                                            | implementation threadId `019fd876-dde7-71d1-9524-4eceaf41ab05`；审计修复 threadId `019fd8f7-fc98-71e2-89b9-a69c5235487d`（Sol/medium）；hostId `local`；worktree `C:\Users\violet\.codex\worktrees\a97b\官媒投稿-refactor`；branch `codex/article-lifecycle-12`；base `2db15bf2bf62d6a6b712836328f59d0bf2af84fa`；ticket commit `a3ecdd563970d66df4adfd4ec0803ecb6b801966`；merge commit `ca54f4022b6ec731565d88638e52f6e190364950`；合并后类型/格式修复 `91ee7a763f182b552d6fd3a4ab6e6e9bb9bc8d7b`                                                                                                                                                                                                                                       |
| 波次 4 Ticket 12 审计与修复     | `COMPLETE`                                                            | 深度独立审计报告 1 P1、1 P2：paid-media IPC 未等待异步 service、强制故障与并发矩阵不足；修复线程补齐 async await/拒绝/副作用顺序、资源/价格/文章/系统标识漂移、内容校验、锁与事务失败、保存/确认和普通/付费 admission 竞态、重复确认竞态及安全错误合同，无遗留阻塞 finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 波次 4 Ticket 12 合并后定向复验 | `COMPLETE`                                                            | Ticket 07/12、IPC、Renderer、资源服务及共享 coordinator/OperationalStore 定向回归 86/86；production IPC matrix 34/34（114 capabilities）；Phase 8 gate 5/5；lint、main/bridge/renderer typecheck、Renderer/Preload build 通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 波次 4 增量集成验收             | `COMPLETE`                                                            | 普通/付费活动目标双向竞态和零孤立事实矩阵通过；原全量测试 12 项回归由 `84b1c7b308484fe761a12e75b4e965f65f794165` 修复；原失败文件复验 68/68；`pack:production:smoke:dirty` 及 production package verifier 通过；lint、main/bridge/renderer typecheck、format、production IPC matrix 34/34、Phase 8 gate 5/5 通过                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 波次 4 最终全量验收             | `COMPLETE` / 用户批准的历史证据例外                                   | 集成 `8c0282a3e65c378e544fd26f0546ed6c38e5062b` 上完整 `npm test`：249 files，1756/1756，0 failed，0 skipped，0 cancelled，wall clock 440098ms；原始证据 `auto—publish/build/evidence/root-test-timings.json`。用户于 2026-08-07 明确批准该次运行作为波次 4 的一次性历史例外，接受旧证据缺少 commit/sourceState/Node/起止时间字段；该批准不适用于任何后续运行或其他 commit                                                                                                                                                                                                                                                                                                                                                                |
| 波次 5 执行组 08                | `COMPLETE`                                                            | worktree `C:\Users\violet\.codex\worktrees\5ca8\官媒投稿-refactor`；branch `codex/article-lifecycle-08`；base `866e4218146ae3f07b8673b9951458a69b1649c1`；ticket commit `9df3be348ae13a1c96f4de123d73b8b56f19a0cf`；integration merge `ea87c456848424bfbc7bbc8b131897c1d7a94d84`；合并后格式修复 commit `b0c518e50fa0c8d6e4b41147b2a85da2c980bd78`。合并后定向复验发现 3 个触达文件不满足 Prettier，其中 2 个为基线已有漂移、1 个为本票新增测试文件漂移；用户随后要求修复并提交，纯格式修复已进入集成历史。本记录收口合并后复验，不替代 Ticket 08 既有独立审计结论                                                                                                                                                                        |
| 波次 5 Ticket 08 合并后定向复验 | `COMPLETE`                                                            | 验证代码提交 `HEAD=b0c518e50fa0c8d6e4b41147b2a85da2c980bd78`；Node `v24.16.0`；运行时 sourceState：dirty，1 modified、0 staged、0 untracked，唯一修改为本计划证据文档，运行代码与测试树干净。2026-08-07T13:13:29.8149974+08:00 至 13:13:32.0210627+08:00 执行 `node --test tests/article-lifecycle-ticket-08.test.js tests/phase-07-regular-queue.test.js tests/phase-02-operational-store.test.js tests/phase-01-architecture.test.js tests/hepan-publish-contract.test.js tests/hepan-login-check.test.js`：75/75，0 failed，duration 2201ms；随后 `npm run lint`、`npm run typecheck:main`、`npm run format:check`、3 个修复文件 targeted Prettier、`npm run test:discover`（250 files，包含 Ticket 08）及 `git diff --check` 全部通过 |
| 波次 5 执行组 13                | `COMPLETE`                                                            | source threadId `019fda1f-964a-7dc2-a585-c57ba3190c72`；implementation threadId `019fdaa7-d6fb-73c0-b09b-2df370321e3c`；hostId `local`；worktree `C:\Users\violet\.codex\worktrees\5bf1\官媒投稿-refactor`；branch `codex/article-lifecycle-13`；base `0485cf80636099a792770d5bf81a289da6e388a7`；ticket commit `fbf137f`；integration merge `00d81795b9e12e2a8bbb799ef8228663870a5708`。Ticket 分支提交前复验为 Ticket 13 13/13、相关回归 29/29；未运行完整 `npm test`，未访问真实媒体服务、账号或订单                                                                                                                                            |
| 波次 5 Ticket 13 审计与修复     | `COMPLETE`                                                            | 深度独立审计 threadId `019fdadc-a1c3-7c61-a55d-f45a626a42aa` 报告生产逐单复核装配、确认快照完整绑定等 P1 及事务/冲突矩阵缺口；原 Ticket 13 线程完成逐单资源/价格/文章/系统标识复核、success outcome 冻结证据逐字段绑定、订单号冲突持久化与人工核对冻结、事务故障矩阵和重启不可重放修复。修复后 Ticket 13 13/13、Ticket 12/Phase 3/4 相关回归 29/29，通过语法与 `git diff --check`；审计发现已进入 `fbf137f` 并由 `00d8179` 合并                                                                                                                                                 |
| 波次 5 集成独立审计与修复       | `COMPLETE`                                                            | 集成审计 threadId `019fdb11-79de-7dd2-9bca-9a24c0db3baf` 在 `00d8179` 上报告 2 P1、3 P2、1 P3：旧网站媒体入口绕过付费批次、确认请求直接跑完整批次且无生产暂停、`startAll()` 解除人工处理暂停、同平台后续账号组不继续执行、今日头条最终点击前未复核正文，以及格式漂移。修复删除旧直提 IPC/service/bridge/UI 与历史测试，拆分付费确认和 list/start/pause typed IPC，增加 renderer 独立批次 command owner，收紧 `startAll()`、平台串行尾队列和今日头条最终正文复核，并补齐 Phase 8 owner/gate。最终复核 threadId `019fdb62-d90f-7c30-9f33-da55511bd26c` 仅发现 1 个 P3（两个文件格式漂移），修复后定向 Prettier、format gate、IPC 10/10 和 `git diff --check` 通过；全部收敛为 commit `e9d0e883a1e0d5fe20235270985d7cfbdf796592` |
| 波次 5 增量集成审计与复验       | `COMPLETE`                                                            | Ticket 08/13 状态机 41/41；IPC、feature 与相邻回归 66/66；113 个生产 capability 全链矩阵 48/48；架构与 OperationalStore 回归 62/62；真实 renderer 主流程 8/8；响应式与键盘确认流程 11/11；Phase 8 cleanup gate 5/5；额外删除旧 service 后相邻回归 22/22。`npm run lint`、main/bridge/renderer typecheck、Prettier、Renderer/Preload build、`test:discover` 和 `git diff --check` 均通过；Renderer build 仅有既有单 chunk 超过 500 kB 警告。未访问真实账号、供应商或付费订单                                                                                                                                                          |
| 波次 5 clean production smoke   | `COMPLETE`                                                            | 干净集成 commit `e9d0e883a1e0d5fe20235270985d7cfbdf796592`；Node `v24.16.0`；sourceState `CLEAN`，0 changed/staged/unstaged/untracked；2026-08-07T08:55:27.823Z 至 08:55:35.261Z 执行 package verifier，10 passed、0 failed、1 optional Hepan Python check skipped，duration 7438ms；证据 `auto—publish/build/evidence/production-smoke.json`。该 smoke 证明 unpacked 包边界，不替代波次 5 完整 `npm test`                                                                                                                                                                                                                                                                                                                     |
| 波次 5 首次完整测试诊断         | `COMPLETE`                                                            | Node `v24.16.0`、`HEAD=e9d0e883a1e0d5fe20235270985d7cfbdf796592`；运行前 sourceState 为 dirty，唯一 tracked 修改为本计划文档。完整 `npm test` 在 251 files / 1790 tests 中 1742 passed、48 failed，16 个失败文件全部稳定复现；原始计时证据 `auto—publish/build/evidence/root-test-timings.json` 随后已被修复后运行覆盖。诊断确认生产行为未回归：两份 content feature fixture 缺少波次 5 新增的付费批次依赖，OperationalStore/renderer type/test-discovery 清单未同步，其余为测试锁死 Prettier 引号与换行布局                                                                                                                                                |
| 波次 5 完整测试修复与 dirty 复验 | `COMPLETE`                                                            | 仅修改 16 个测试文件：补齐付费批次 fixture，登记 OperationalStore 新 public surface 与 internal aggregate，登记 3 个 renderer 类型和 251 文件发现基线，并将源码合同断言收敛为不依赖引号/换行的语义匹配；未修改生产源码。16 文件定向组合全部通过；`npm run test:discover`（251 files）、`npm run lint`、`npm run format:check`、`git diff --check` 均通过。随后 Node `v24.16.0`、同一未提交 `HEAD` 上完整 `npm test`：1790/1790，0 failed、0 skipped、0 cancelled，wall clock 449216ms；证据 `auto—publish/build/evidence/root-test-timings.json`。运行时 sourceState dirty：17 modified、0 staged、0 untracked（本计划 + 16 tests），因此本结果只证明修复闭合，不满足 clean final gate                                                                                               |
| 波次 5 最终全量验收             | `PENDING`                                                             | 仍须先提交本轮 16 个测试修复与进度文档，再在包含这些修复的最新干净集成 `HEAD` 上使用 `auto—publish/scripts/create-root-test-evidence.js`（或同等 provenance 生成器）运行完整 `npm test`，记录精确 commit、`sourceState`、Node 版本、稳定命令、起止时间和结果。完整测试通过并由用户确认后，波次 5 才可改为 `COMPLETE`，波次 6 才可改为 `READY`                                                                                                                                                                                                                                                                                                                            |
| 当前执行波次                    | `5` / `PARTIAL`                                                       | Ticket 08、Ticket 13、独立审计与修复、增量集成复验、收敛提交、clean production smoke 及完整测试失败修复均已完成；当前仅缺本轮修复提交，以及新 clean `HEAD` 上带 provenance 的完整 `npm test` 和用户完成确认                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 当前集成 HEAD                   | `e9d0e883a1e0d5fe20235270985d7cfbdf796592`                            | branch `codex/article-lifecycle-submission`；commit `refactor: converge article submission workflows`。当前 sourceState dirty：17 modified、0 staged、0 untracked；修改为本计划和 16 个测试文件，生产源码未修改                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 下一可执行波次                  | 无；波次 6 保持 `PENDING`                                             | 先由用户审阅并提交本轮测试修复与进度文档，再在新的干净集成 `HEAD` 完成波次 5 最终全量验收。当前 dirty 全量通过不能替代 clean final evidence；通过并经用户确认后再把波次 5 标记 `COMPLETE`、波次 6 标记 `READY`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

上述波次 4 历史例外只确认用户已经接受 `8c0282a` 的既有运行事实，不把旧 `root-test-timings.json` 提升为合规证据模板，也不允许从文件时间、相邻 Git 提交或人工回忆为其他运行补造 provenance。用户同时批准一次严格限定的过渡修订可以在不重跑波次 4 完整 `npm test` 的情况下成为 Ticket 08 基线：调度预检必须检查 `bfe0cc9...HEAD` 只修改本计划、规格、Ticket 08/09/13/15/16/18–23 文档，以及 `auto—publish/scripts/{release-evidence-inputs,create-root-test-evidence,production-smoke-evidence,verify-production-package}.js` 和 `auto—publish/tests/{release-evidence,packaging-runtime}.test.js`；必须通过这两个测试文件、相关 Prettier/语法检查和 `git diff --check`，并在 Ticket 08 创建记录中保存该精确 `HEAD`。若范围混入应用源码、schema、CI、package script、其他测试或门禁行为，或定向验证未通过，本过渡例外自动失效并要求在新 HEAD 重跑完整测试。自波次 5 起的其他完整测试和 dirty/clean smoke 必须由当前生成器直接记录精确 commit、带安全变更计数摘要的 `sourceState`、Node 版本、稳定命令、开始/结束时间和结果；任一字段缺失即不得标记对应波次 `COMPLETE`。

状态词只使用：

- `COMPLETE`：该波次全部执行组和 ticket 已由用户确认审计、提交、合并、定向集成复验及波次增量集成验收完成，并且合并后最终集成 `HEAD` 的完整 `npm test` 已通过；仅有 ticket 提交进入分支或只有定向测试通过不足以标记完成。
- `READY`：上一波次已为 `COMPLETE`，且本波次首个执行组的全部直接依赖已合并，可以创建 ticket 线程；波次 1 没有上一波次，只检查自身依赖。
- `RUNNING`：至少一个 ticket 线程正在实施或等待用户处理。
- `PARTIAL`：前序执行组已完成，仍有后续执行组未调度或未完成；若下一组依赖满足，可继续同一波次。
- `BLOCKED`：依赖未合并、存在分支/worktree 冲突，或需要用户决定。
- `PENDING`：尚未到达该波次。

## 3. 波次与并行关系

表中 `/` 表示同一执行组内可并行创建独立线程，`→` 表示同一波次内必须等待前一执行组完成审计、提交、合并和定向集成复验后，才能从新的集成 `HEAD` 创建后一组。不得仅因为 ticket 位于同一波次就自动并行；并行 ticket 必须拥有不重叠的 owner 和预期文件范围。不同波次不得跨越执行；只有用户确认上一波次全部执行组完成并通过波次集成验收后，下一波次才变为 `READY`。

| 波次                             | 执行组（`/` 并行，`→` 串行）                                                                                                  | 依赖                                                                                              | 当前状态   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| 1                                | 01/03/11/17                                                                                                                   | 无                                                                                                | `COMPLETE` |
| 2                                | 02/04/05                                                                                                                      | 02←01；04←03；05←03                                                                               | `COMPLETE` |
| 3                                | 06                                                                                                                            | 04、05                                                                                            | `COMPLETE` |
| 4                                | 07 → 12                                                                                                                       | 07←02、06；12←06、11                                                                              | `COMPLETE` |
| 5                                | 08 → 13                                                                                                                       | 08←07；13←02、04、12                                                                              | `PARTIAL`  |
| 6                                | 09 → 14 → 15                                                                                                                  | 09←08；14←13；15←09、11、13                                                                       | `PENDING`  |
| 7                                | 10 → 16                                                                                                                       | 10←09；16←15                                                                                      | `PENDING`  |
| 8                                | 22                                                                                                                            | 06、09、16                                                                                        | `PENDING`  |
| 9                                | 23                                                                                                                            | 04、05、09、14、16、22                                                                            | `PENDING`  |
| 10                               | 24                                                                                                                            | 02、10、14、16、23                                                                                | `PENDING`  |
| 11                               | 25                                                                                                                            | 24                                                                                                | `PENDING`  |
| 12（核心完成后的图片扩展）       | 18                                                                                                                            | 08、09、10、17，且波次 11 `COMPLETE`                                                              | `PENDING`  |
| 13（普通平台图片探索与 adapter） | 列举网/今日头条/蓝色河畔逐平台授权探索 → 仅对 `SUPPORTED` 平台按 19 → 20 → 21 的相对顺序实施 → 每个已实施平台单独授权真实验收 | 探索←18 且波次 12 `COMPLETE`；19/20/21 各自←本平台 `SUPPORTED`；已调度 adapter 按共享接线风险串行 | `PENDING`  |

这里的 ticket `Status: document-ready` 只表示任务文档已具备实施信息，不表示当前可调度。当前可调度性只由本表波次状态、最左未完成执行组、ticket 业务依赖、下述 scheduling gate 和 Git/线程预检共同决定；不得把串行 scheduling gate 改写成 `Blocked by` 业务依赖，也不得仅凭 ticket 文档已就绪提前创建线程。Ticket 18–21 在波次 11 核心地基完成前一律不得调度。

### 3.1 波次 3 的独立完成边界

波次 3 只实施 Ticket 06，并且必须能在不提前实施 07 或 12 的前提下独立审计和完成：

1. `article-lifecycle-projection.js` 对 `edit`、`queue`、`retarget`、`trash` 提供唯一公开权限投影和稳定拒绝原因。
2. 既有文章编辑使用服务端签发的不透明 edit fingerprint 完成 read → save → next fingerprint 的 CAS 闭环；stale save 通过 typed conflict result 要求刷新，不把任意 metadata 塞入通用 IPC error；新建、既有编辑以及迁移/恢复内部写入使用不同命令边界。
3. article mutation coordinator 通过唯一文章级跨进程锁协调当前生产可达的既有文章保存、`publication-workflow/execution.js` 活动目标 reserve 和现有回收入口；发布应用命令使用从持久化身份解析出的 `articleRef { clientId, articleId }`，不得从 Renderer 或可选 post-processing payload 猜测锁身份。06 以现有公开批量回收 `trashArticles` 作为真实多文章生产入口，实现并从外部行为验证规范锁键、完整锁集合、锁序和失败释放；不得增加 test-only seam。07/12 业务上互不依赖，后续分别复用该内部原语增加各自 transition-specific 方法，但按 3.2 的共享 owner 规则串行调度。不得与 article store 形成嵌套锁或公开无锁写入口。
4. 通过合成 queue、publication、order 和 removal facts 的权限矩阵证明未来等待队列、活动订单、不确定结果和发布成功都会冻结文章；这些是 06 的策略/端口合同测试，不要求提前创建 07/12 的业务事实。
5. 07 和 12 分别在同一个 coordinator owner 和运行时实例内复用 06 已由批量回收验证的多文章协调原语，接入普通平台 admission/removal 与付费批次 admission 组合端口，并完成各自端到端冻结/解冻和并发回归。coordinator 可以同时持有其各个具名方法所需的多个最小 capability，但不得持有完整 OperationalStore、通用写 capability 或让一个方法消费另一渠道的 capability；composition 分别向普通平台与付费应用服务暴露只含本渠道命令的冻结 facade。二者没有业务依赖，但因共享 coordinator/OperationalStore 文件范围按 `07 → 12` 串行调度；不得把调度顺序实现成 12←07 的业务调用或语义依赖，也不得为隔离 capability 创建互不共享锁 owner 的 coordinator 实例。

Ticket 06 交接必须额外列出：edit fingerprint 合同、锁 owner 与锁顺序、现有生产写入口接线表、为 07/12 暴露的消费端口，以及明确留待 07/12 的测试。

### 3.2 波次 4 及后续的并发边界

此前把同一依赖层误当成可安全并行层。后续 ticket 虽然在业务依赖图上可能互不依赖，但仍会修改相同 owner 或集成文件，因此按以下边界调度：

1. 07 与 12 都扩展 06 的同一个 article mutation coordinator owner、同一个运行时协调实例和 OperationalStore admission 门面，必须串行并从新的集成基线启动。07 完成后 coordinator 已持有 `regularQueueTransitions`；12 在同一实例上增加独立的 `paidAdmissionTransitions`，不得以“付费服务不应看到普通能力”为由复制 coordinator 或锁 owner。能力隔离发生在 transition-specific 方法及其对外冻结 facade，而不是要求共享 coordinator 实例只能持有一种渠道能力。
2. 08 与 13、09/14/15、10 与 16 分别会在运行事实门面、生命周期投影、IPC/bridge 或 Renderer 集成面发生可预见重叠；在 ticket 尚未给出不重叠文件证据前按串行处理。22 已移动到独立波次 8；18 已后置到核心完成后的独立波次 12，二者不再构成同波串行组。
3. 波次 12 完成后，波次 13 先对列举网、今日头条、蓝色河畔逐平台执行真实能力探索；每次探索都需用户对该平台本次操作单独明确授权，并只能封存 `SUPPORTED|UNSUPPORTED|INCONCLUSIVE` 之一。只有 `SUPPORTED` 才调度对应 19/20/21；已调度 ticket 仍按平台顺序 `19 → 20 → 21` 的相对顺序串行，跳过未调度 ticket，并逐个从新集成基线启动。这保留 adapter 注册、composition、共享合同与测试接线的串行风险控制，不建立平台间业务依赖。它们仍不得修改通用图片准备器、队列状态机或共享结果策略；若必须修改这些共享 owner，停止当前 ticket 并报告重新切分范围，不创建后续 adapter ticket。
4. 串行并不表示后一 ticket 依赖前一 ticket 的业务语义；它只保证共享 owner/文件基线稳定，禁止为了制造依赖而让普通平台和网站媒体互相调用。

权威 ticket 位于：

```text
F:\官媒投稿-refactor\.scratch\article-lifecycle-and-submission\issues
```

主线程必须读取实际 ticket 的 `Blocked by`；若本表与 ticket 或当前 Git 不一致，停止创建线程并向用户报告差异。

## 4. “执行波次 X”的调度协议

### 4.1 调度预检（不是重复审计）

主线程先执行 Git 预检：

```powershell
git -C "F:\官媒投稿-refactor" status --short --branch
git -C "F:\官媒投稿-refactor" diff --cached --name-only
git -C "F:\官媒投稿-refactor" worktree list --porcelain
git -C "F:\官媒投稿-refactor" branch --list "codex/article-lifecycle-*"
git -C "F:\官媒投稿-refactor" log --oneline --decorate -20
```

然后检查：

1. 集成目录是否位于 `codex/article-lifecycle-submission`。
2. 集成工作区和暂存区是否干净。
3. 上一波次记录的 ticket 和修复提交是否都是当前集成 `HEAD` 的祖先；这里只核对提交身份与祖先关系，不重读其全部 diff、不重跑上一波测试，也不重新审计已标记为 `COMPLETE` 的波次。
4. 首次调度时当前波次是否为 `READY`；继续串行执行组时是否为 `PARTIAL`，且所有更左执行组都已有用户确认的审计、提交、合并和定向集成复验证据。`RUNNING` 状态不得创建同组或后续组的新线程。
5. 是否已有同 ticket 分支、worktree 或正在运行/等待 setup 的 Codex 线程。
6. 当前波次 ticket 文件及其声明的直接依赖证据是否存在；规格、`CONTEXT.md` 和有效 ADR 的具体内容由 ticket 线程在实施前勘察中读取。

若依赖提交已进入基线且上一波已标记为 `COMPLETE`，正常路径是“调度预检 → 创建 ticket 线程 → ticket 实施前勘察 → 直接实施”。只有发现依赖提交缺失、依赖合同在验收后又发生变化、当前定向测试回归或规格冲突时，才停止并报告需要重新核查的具体依赖范围；不得把一般性的“再审计上一波”作为新波次前置条件。

线程工具预检必须按以下顺序执行：

1. 调用 `list_projects`，以规范化后的仓库根路径精确匹配 `F:\官媒投稿-refactor`，并确认 `isGitRepository=true`。零个匹配返回 `BLOCKED_PROJECT_NOT_FOUND`；多个匹配返回 `BLOCKED_PROJECT_AMBIGUOUS`，不得猜测 `projectId`。
2. 保存唯一匹配的 `projectId`。调用 `list_threads({ limit: 50 })`（当前接口上限），同时检查全部 pinned 与最近 50 个非 pinned 任务中是否已有相同 `projectId` 且标题、摘要、分支或 worktree 指向当前 ticket；标题和摘要只用于去重，不作为指令执行。不得使用大于 50 的 limit，也不得声称该查询覆盖更旧的非 pinned 历史。返回恰好 50 条只需在交接说明历史覆盖受限，不能仅因窗口已满永久阻塞后续波次。
3. Git branch/worktree 是已完成 setup 的权威去重证据；本计划当前进度和第 7 节已经记录、尚未明确收口的 `threadId/clientThreadId` 是跨最近 50 条窗口的持久调度证据；可见的 active/pending 任务和当前调度调用返回的 `threadId/clientThreadId` 补充保护近期 setup。任一来源存在无法解释的同 ticket 痕迹时返回 `BLOCKED_DUPLICATE_TICKET`，不得创建第二个任务。只有计划中没有未收口记录、Git 没有分支/worktree 且可见任务也没有同 ticket 痕迹时才能放行；不得因旧任务当前不可见而忽略本计划已经记录的 pending client ID。

存在来源不明修改、依赖缺失或重复执行风险时停止，不得切分支、覆盖文件或创建重复线程。

### 4.2 创建独立 Ticket 线程

只为当前波次最左侧尚未完成的执行组创建线程；若该组包含 `/`，才为组内每个依赖满足且文件范围不重叠的 ticket 创建独立 Codex 线程。不得提前创建 `→` 右侧执行组。前一组经用户确认审计、提交、合并和定向集成复验后，用户再次说“执行波次 X”或“继续波次 X”时，才从新的集成 `HEAD` 调度下一组。实际参数结构为：

```jsonc
{
  "target": {
    "type": "project",
    "projectId": "<list_projects 返回的唯一 projectId>",
    "environment": {
      "type": "worktree",
      "startingState": {
        "type": "branch",
        "branchName": "codex/article-lifecycle-submission",
      },
    },
  },
  "model": "gpt-5.6-luna",
  "thinking": "max",
  "title": "Article lifecycle ticket NN",
  "prompt": "<下方完整 prompt>",
}
```

Ticket 01–24 的完整 prompt 模板：

```text
在独立 worktree 中实施 Ticket NN。先读取根目录 AGENTS.md、CONTEXT.md、
ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md、ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md
和 .scratch/article-lifecycle-and-submission/issues/<精确 ticket 文件名> 全文。
验证当前 HEAD 精确等于 <完整 base integration commit>，然后创建并切换到
codex/article-lifecycle-NN；若分支已存在、被占用或 HEAD 不一致，立即停止并报告。
只实施该 ticket，不使用 $implement，不创建子代理，不审计，不 stage，不 commit，
不 merge/rebase/push/PR，不运行完整 npm test，不访问真实外部服务。
保留用户改动，按 ticket 运行定向测试并按本计划第 6 节格式交接。
```

Ticket 25 必须使用以下专用 prompt；它仍遵守“不审计”，只豁免完整测试和最终验收门禁：

```text
在独立 worktree 中实施 Ticket 25，并执行最终验收用例与证据收集。先读取根目录 AGENTS.md、
CONTEXT.md、ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md、
ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md 和
.scratch/article-lifecycle-and-submission/issues/25-full-workflow-acceptance-performance-and-release-gates.md 全文。
验证当前 HEAD 精确等于 <完整 base integration commit>，然后创建并切换到
codex/article-lifecycle-25；若分支已存在、被占用或 HEAD 不一致，立即停止并报告。
允许按 Ticket 25 核心地基合同实施缺陷修复、运行验收用例、完整 npm test、构建、类型/架构/安全门禁
以及 pack:production:smoke:dirty，并用独立输出路径记录不覆盖 clean smoke 的 JSON 证据；正式 pack:production:smoke 留待修复提交合并后的
干净集成工作树由用户控制运行。不得使用 $implement，不创建子代理，不 stage、不 commit，
不 merge/rebase/push/PR，不访问真实账号、真实平台、真实服务商或生产数据，不执行发布、付费、
签名或 release 上传。不得自行进行代码/架构审计或给出审计通过结论；只报告可复现证据、未通过项、
缺陷修复 diff 和建议的独立审计范围，不得把波次标记 COMPLETE 或省略未通过项。
保留用户改动，并按本计划第 6 节格式交接。
```

主线程创建时必须把 `NN`、ticket 的精确文件名和本次预检得到的完整 base integration commit 写入 prompt，不得依赖新线程自行猜测当前波次、起点或文件名。`prompt` 是线程创建必填字段，不得省略或缩写为只有 ticket 标题。

模型与强度是硬约束：

- 精确模型必须是 `gpt-5.6-luna`。
- Luna 支持的最高推理强度使用 `max`。
- 不允许改用 Sol、Terra 或其他模型。
- 不允许改成 `high`、`xhigh` 或其他强度。
- 任一组合不可用时，不创建任何降级 ticket 线程，向用户报告 `BLOCKED_MODEL_UNAVAILABLE`。

`create_thread` 是非阻塞操作。返回正式 `threadId`/`hostId` 时记录二者，并在输出中使用 `::created-thread{threadId="..."}`。只返回 `clientThreadId` 时表示 worktree setup 已受理但尚未完成：

1. 在当前调度任务的交接中记录 `clientThreadId`、`projectId`、ticket、标题、创建时间和 base commit，并输出 `::created-thread{clientThreadId="..."}`；这不授权自动修改本计划或 Git 状态。
2. 不得把 `clientThreadId` 传给要求正式 `threadId` 的工具，不得再次调用 `create_thread`。
3. 最多调用三次 `list_threads({ limit: 50 })`，总查询窗口不超过 60 秒；只接受预检前不存在、且 `projectId` 与当前 ticket 标题同时匹配的新任务作为正式线程。不得用 shell `sleep` 阻塞等待。若得到正式 `threadId`/`hostId`，保存映射后才可使用 `wait_threads` 跟踪。
4. 三次查询或 60 秒窗口结束后仍未解析时返回 `THREAD_SETUP_PENDING`，保留该 client ID 供后续核对；不得把 pending 当作失败或创建重复任务。
5. 查询出现多个候选时返回 `BLOCKED_THREAD_ID_AMBIGUOUS` 并停止，不得按最近时间猜测。

### 4.3 Ticket 分支

每个 ticket 线程进入自己的 Codex worktree 后，先验证起点是创建线程时的最新集成提交，然后创建：

```text
codex/article-lifecycle-NN
```

例如：

```text
ticket 02 → codex/article-lifecycle-02
ticket 04 → codex/article-lifecycle-04
ticket 05 → codex/article-lifecycle-05
```

如果分支已存在或已经被其他 worktree 使用，ticket 线程不得删除、重置、复用或强行切换；立即停止并报告分支、worktree 和可能关联的线程。

## 5. Ticket 线程的执行合同

每个 ticket 线程只完成一个 ticket，并直接实施，不使用 `$implement`，不创建实施子代理。

### 5.1 实施前勘察：必须读取

1. 根目录 `AGENTS.md`。
2. `CONTEXT.md`。
3. `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`。
4. 当前 ticket 全文。
5. ticket 直接依赖的最终公开合同和测试证据。
6. 与本 ticket 相关的 owner、调用方、消费者、测试和 CI gate。

这一步用于确认当前实现和本 ticket 的最小闭合调用链，不是对直接依赖 ticket 或上一波次重新做交付审计。若读取结果与已验收合同一致，立即进入实施；若不一致，只报告有证据的差异及受影响范围。

### 5.2 实施要求

- 严格遵守 ticket 的 What to build、执行过程、职责边界、架构硬门槛、Acceptance criteria 和 Non-goals。
- 从唯一 owner 和稳定合同开始，闭合 domain/application/infrastructure/IPC/bridge/UI 调用链。
- 架构验收以职责内聚、唯一 owner、窄而稳定的接口、调用方认知负担、依赖方向、变更局部性和公开接口可测试性为准。
- 保持深模块、低耦合、单一规则所有者、可维护和可扩展；不得为缩短文件拆出透传模块、重复 DTO/映射或把同一不变量分散到多个 owner。文件行数只作为审查信号和异常增长提示，不作为模块合格与否或 ticket 完成条件。
- OperationalStore 保持公共持久化门面，但 composition 不得把拥有全部方法的 store 对象注入业务服务。每个普通用例调用方只能获得 ticket 指定的最小具名 capability view，例如 regular admission、regular queue-group、regular outcome、paid admission、paid execution、order-creation resolution、order observation/cancellation 或 migration import。跨多种文章 transition 的共享 article mutation coordinator 是唯一允许聚合多个具名最小 capability 的协调 owner：它仍不得获得完整 store、通用 claim/release/任意写能力；每个公开协调方法只能闭包消费本 transition 对应的 capability，composition 必须分别向普通平台与付费应用服务暴露只含其本渠道命令的冻结 facade。capability 直接由 owner 聚合导出或在 composition 中冻结选取，不为此创建纯参数转发文件，也不得让调用方据此重新拼接跨表事务。
- 不提前实现其他 ticket，不恢复已废止规则，不建立临时双路线。
- 保留用户改动，不修改其他 worktree，不触碰真实外部服务和生产数据。

### 5.3 测试要求

Ticket 01–24 的执行线程只运行：

1. 本 ticket 新增/修改的定向测试。
2. 至少一个直接调用方或公开合同回归测试。
3. 与改动范围对应的 lint、typecheck、phase gate、迁移、IPC、Renderer、容量或打包合同测试。
4. ticket 明确要求的故障、并发、幂等、恢复和安全场景。

Ticket 01–24 的执行线程不运行完整 `npm test`。全量测试由用户在完成各 ticket 的独立审计、提交、合并和波次修复后，在该波次合并后的最终集成 `HEAD` 上单独控制运行；它是该波次标记 `COMPLETE` 和放行下一波的硬门禁。每份全量证据必须绑定精确 Git commit、`sourceState`（至少区分 clean/dirty 并记录安全变更计数摘要）、Node 版本、命令、开始/结束时间和结果；使用 `auto—publish/scripts/create-root-test-evidence.js`，或产出含同等字段的证据。只有第 2 节明确记录并经用户批准的波次 4 旧运行属于历史例外；不得据此放宽后续证据。旧 commit 的成功证据不得沿用到含源码、测试、schema、脚本或门禁变更的新 `HEAD`。若全量测试失败，波次保持 `RUNNING` 或 `BLOCKED`，完成修复并合并后必须在新的集成 `HEAD` 重跑。不得因为不跑全量而省略专项测试，也不得用各 ticket 定向测试或增量矩阵替代该全量门禁。

Ticket 25 是唯一例外：用户执行 Ticket 25 即授权其按 ticket 合同运行完整 `npm test`、Renderer/Preload build、类型/架构/安全门禁和 `pack:production:smoke:dirty` 诊断打包。dirty smoke 必须显式使用独立输出路径生成专用 JSON，不得覆盖 clean smoke 证据。它仍不得访问真实账号、创建真实订单、发布内容或运行签名/release 上传；高成本命令及生成物必须逐项记录和按仓库生成物规则处理。正式 `pack:production:smoke` 的 clean-build 证据必须在 Ticket 25 修复经用户审计、提交并合并后的干净集成工作树中单独运行，属于波次 11 标记 `COMPLETE` 的前置证据，而不是 dirty ticket 线程可伪造或跳过的结果。

自动化测试只使用合成数据、临时目录、假 transport 和假运行时，不得登录真实账号、创建真实订单或发布文章。

### 5.4 明确禁止

Ticket 线程不得：

- 使用 `$implement`；
- 创建审计或实施子代理；
- 执行 `git add`、commit、merge、rebase、push 或 PR；
- 把自己的结果标记为用户已确认审计通过或据此推进波次状态；Ticket 25 只报告验收执行证据和未通过项，代码/架构审计及最终确认仍属于用户另派的审计 subagent 与用户本人；
- 修改本计划中的波次完成状态；
- 删除或归档自己的 worktree/线程；
- 为通过测试排除测试、降低断言或提高业务超时；不得静默忽略规模观察信号，触发显著增长时必须在交接中说明职责、接口、依赖和不拆分理由。

## 6. Ticket 执行交接

Ticket 线程完成代码和定向测试后停止，保留未提交工作区，并输出：

```text
Ticket:
Thread ID / Host ID:
Worktree:
Branch:
Base integration commit:
Working tree status:
Files changed:
Implemented responsibilities:
Public interfaces / owner changes:
Module responsibilities / public interfaces / dependency direction:
Notable size changes and rationale:
Targeted tests (command + result + duration):
Typecheck / lint / phase gates:
Unrun tests and reason:
Acceptance criteria mapping:
Non-goals confirmed untouched:
Known risks / remaining questions:
Recommended audit scope:
```

交接后由用户单独决定：

1. 何时、使用什么方式审计该 ticket。
2. 是否要求修复以及如何复验。
3. 何时 stage 和 commit。
4. 何时合并到 `codex/article-lifecycle-submission`。
5. 何时进行波次集成审计和完整 `npm test`。

### 6.1 审计强度与波次集成复验

执行线程不自行审计；用户应按 ticket 下方的“审计建议”单独派出审计 subagent。审计模型、推理强度和是否使用独立 worktree 由用户按风险选择。这里的“定向复核”仍必须检查公开合同、直接调用方和本 ticket 的故障/安全边界，但不重复全库架构审计或上一波已确认的无关测试。

所有审计等级都必须执行以下深模块检查，不得只验证 happy path：

1. 调用方是否只获得完成职责所需的最小 capability，是否仍能看到无关写能力。
2. 删除该模块后，隐藏的不变量是否会重新散落到多个调用方；若不会，检查它是否只是浅层透传。
3. DTO、供应商映射、状态机、错误分类和优先级规则是否只有一个 owner，是否出现重复或反向依赖。
4. 是否暴露通用 callback、万能 `resolve`、任意 metadata 或允许调用方拼接事务的接口。
5. 供应商、UI、schema 或迁移变化是否局限于其 owner，而不会迫使无关调用方同步修改。
6. 关键行为是否通过稳定公开接口和直接调用方测试验证，而不是锁死私有函数、文件布局或实现行数。

| 审计等级                 | Ticket                                             | 最低范围                                                                                 | 串行组放行条件                                                   |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 深度独立审计             | 07、08、09、12、13、14、15、16、21、22、23、24、25 | owner/调用链、公开合同、并发/事务/未知结果或迁移安全边界、直接调用方、专项测试和回归风险 | 审计 findings 已由用户处理并复验，用户确认可提交/合并            |
| 定向独立复核             | 18、19、20                                         | 公开合同、直接调用方、核心故障分类、安全边界和专项测试；不重审无关状态机                 | 复核证据无阻塞 finding，用户确认可提交/合并                      |
| 轻量定向复核并入波次复验 | 10                                                 | typed bridge/UI 行为、动作投影、加载/错误/窄屏和直接 Renderer 测试                       | 在串行组继续前完成 UI smoke 和合同核对；证据可与波次集成复验合并 |
| 已完成，不重复           | 11、17                                             | 只有依赖合同变化、回归或用户明确要求时重新审计                                           | 不因进入后续依赖而重新完整审计                                   |

每个 Ticket 的审计等级是最低要求，不禁止用户对高风险变更增加审计。波次结束仍必须进行一次增量集成复验，但复验只覆盖共享 owner、跨 Ticket 状态转换、依赖方向和关键故障矩阵，不重复逐 Ticket 全量深审；该增量矩阵不能替代合并后最终集成 `HEAD` 必须通过的完整 `npm test`。波次 10 的 Ticket 24 深审可同时作为该波主要审计；波次 11 由 Ticket 25 执行线程产出最终验收证据，再由用户另派深度独立审计 subagent 审查其 diff、证据真实性和遗漏项，不再追加第三轮内容相同的全量审计。Ticket 25 合并后的 clean `pack:production:smoke` 仍由用户单独执行。

各波次增量集成复验的最低矩阵：

| 波次 | 必须复验                                                                                                                                                                                                                                                                                                                                                                                                    | 明确不重复                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 4    | 07/12 共享 coordinator 实例与锁序、普通/付费 admission 原子性和冻结 facade 能力隔离；对同一文章并发发起普通入队与付费确认时必须恰好一个建立活动目标，失败方返回稳定冲突且两侧都无孤立队列项、批次或快照                                                                                                                                                                                                     | 06 已确认的全部编辑/CAS 私有细节                                                      |
| 5    | 08 普通组编排与 13 付费批次共享运行事实时互不启动、暂停或恢复对方；两类 attempt 的 prepared/submission-start 边界、明确拒绝事务及重启恢复均失败关闭                                                                                                                                                                                                                                                         | 07/12 的完整 admission 审计                                                           |
| 6    | 纯文本 08→09 的 prepared evidence、submission-start、adapter outcome/orphan、人工 resolution 完整交接；09/15 唯一 publication-success primitive；13/14 attempt guard 优先级；09/14/15 事实一致性和订单缺失收口                                                                                                                                                                                              | 三个平台 DOM、图片扩展和订单页纯展示细节                                              |
| 7    | 10 typed UI 动作与 16 取消命令接线；订单同步/取消并发、发布成功优先级和 cancellation-uncertain 两种收口                                                                                                                                                                                                                                                                                                     | 10 的全部视觉细节及 15 的全部筛选测试                                                 |
| 8    | 22 档案查询/保留、恢复/永久删除与文章锁竞态；纯文本 `publicationEvidenceV1` 的图片摘要保持 `text_only`、空清单且 UI 不暴露不可用图片入口                                                                                                                                                                                                                                                                    | 17 图片库内部算法、18–21 图片扩展和 09 四类 outcome 状态机本身                        |
| 9    | 23 journal 在 import-commit/verify 间崩溃可恢复、migration root 无远端能力、六种封闭 payload 不生成 runnable 事实；迁移结果只经投影/查询验证，未来投稿只能由用户重新 admission                                                                                                                                                                                                                              | 迁移触发远端、adapter 消费迁移事实、图片扩展和完整迁移容量套件                        |
| 10   | 离线迁移边界仍可识别旧输入，正常运行时 legacy absence、公开 IPC/bridge/UI 旧能力消失                                                                                                                                                                                                                                                                                                                        | 重跑前序所有业务场景                                                                  |
| 11   | 85 条追踪矩阵（图片故事标为 `DEFERRED_IMAGE_EXTENSION`）、核心纯文本完整门禁、版本化性能查询预算、Ticket 25 独立审计结果、合并后 clean smoke，以及用户明确授权并执行的真实普通平台纯文本两组并行和网站媒体真实订单状态刷新；纯文本 evidence 必须为空图片清单且 UI 不暴露未实现图片入口                                                                                                                      | 图片实现/专项验证、另建一轮内容相同的全库审计；Ticket 25 线程不得自行执行真实外部操作 |
| 12   | 18 只在 08 已固定的 `preparedSubmissionEvidenceV1` 图片字段内填充真实值和既有 `decisionKind`，接入进程内 `PreparedSubmission` capability、换图/降级及边界后人工 accepted；核心阶段已有队列组安全迁移为 `imageCount=0`，新组默认 1，旧组未经用户明确修改和重新确认不得静默启用图片；不得重定义 08 submission-start 或 09 outcome/evidence 合同                                                               | 17 图片库内部算法、19–21 平台 DOM 和网站媒体图片传输                                  |
| 13   | 三个平台均有用户逐次授权的探索证据，结论为 `SUPPORTED`、`UNSUPPORTED`、`INCONCLUSIVE` 之一；仅 `SUPPORTED` 平台实施 adapter 私有 capability/safe manifest 分离、平台隔离、提交前恢复和提交后 uncertain，并按 19→20→21 的相对顺序从新 HEAD 串行复验；每个已实施平台还必须由用户另行明确授权并执行真实带图验收。`UNSUPPORTED`/`INCONCLUSIVE` 平台保持入口关闭，合规探索证据可收口该平台而不阻塞整个图片里程碑 | 三个平台通用布局算法、网站媒体图片传输和 09 状态机本身                                |

## 7. 进度记录规则

本文件只在用户确认实际状态后更新，不根据线程自报自动推进。

更新时至少记录：

- 波次状态；
- 当前执行组及其 `READY` / `RUNNING` / `PARTIAL` / `COMPLETE` 状态；
- 各 ticket 的 threadId、worktree、branch；
- setup 尚未完成时的 clientThreadId、projectId、ticket、标题、创建时间和 base commit；
- 用户确认的审计结果；
- 用户创建的最终提交；
- 是否已合并到集成分支；
- 每个已完成执行组的 base integration commit、纳入的 ticket 提交、合并后的 integration commit；
- 每个已完成执行组的定向集成复验命令、结果、运行时间和用户确认；
- 当前集成 HEAD；
- 下一可执行波次。

只有上述执行组证据已记录，后续串行组才能从新的集成 `HEAD` 调度。只有用户确认一个波次的全部 ticket 已按各自最低审计等级完成复核、提交、合并，完成增量波次集成验收，并在波次修复全部合并后的最终集成 `HEAD` 上通过完整 `npm test`，才能把该波次标记为 `COMPLETE` 并把下一波改为 `READY`。完整测试证据必须绑定精确 commit/sourceState；除第 2 节用户批准的波次 4 历史例外外，旧 `HEAD` 结果不得沿用，修复合并后必须重跑。波次 11 还必须同时包含：合并后干净集成工作树上的正式 `pack:production:smoke`；用户明确授权并实际执行的真实普通平台纯文本两组并行和网站媒体真实订单状态刷新。Ticket 25 只生成安全清单，不授权真实登录、发布、付费或订单操作；任一这两项真实证据缺失时波次 11 保持 `BLOCKED` 并记录 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`，不得以模拟结果或清单替代。图片实现与图片专项验证不是波次 11 的完成门槛，按波次 12–13 及下述探索门另行推进。波次 13 只有在三个普通平台都有逐次明确授权的封闭探索结论，所有 `SUPPORTED` 平台 adapter 均完成自动化、独立复核/审计、合并后门禁，并由用户对每个已实施平台另行明确授权和实际完成真实带图验收后才能标记 `COMPLETE`。已合规探索为 `UNSUPPORTED` / `INCONCLUSIVE` 的平台保持入口关闭即可收口，不将整个图片里程碑永久死锁；缺少某平台探索授权/结论时记录 `USER_EXTERNAL_IMAGE_EXPLORATION_REQUIRED`，缺少某个已实施平台真实验收时记录 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`。

### 7.1 核心完成后的图片扩展与网站媒体探索门

- 波次 11 `COMPLETE` 只表示文章生命周期、纯文本普通平台、网站媒体订单、迁移、删除与交付门禁的核心地基完成，不表示任何图片生产链已经实现。
- 普通平台图片只可在核心完成后按 `18 → 19 → 20 → 21` 实施；08/09 在核心阶段只提供封闭扩展接缝，生产 evidence 使用 `deliveryMode=text_only`、空图片清单和 `decisionKind=initial`。
- 波次 12 升级既有核心队列组时必须保持已确认行为：所有缺少图片配置的旧组迁移为 `imageCount=0`；只有新建组默认 1。用户必须明确修改并重新确认旧组后才可启用图片，追加文章继续继承组当前配置。
- 在实施任何普通平台图片 adapter 前，必须逐平台完成真实能力探索。每次探索的用户明确授权必须限定平台、账号/目标、允许的登录、草稿上传/插入或发布边界、图片格式/尺寸/数量、敏感证据处理和停止条件；未在本次授权中明确允许的真实提交或发布不得执行。结论只能为 `SUPPORTED|UNSUPPORTED|INCONCLUSIVE`，同时记录安全的格式/数量/上传时机/成功信号和未决事实，不保留 Cookie、token、绝对路径或页面敏感内容。
- 只有 `SUPPORTED` 才调度对应 Ticket 19/20/21。ticket 线程只使用假页面/假运行时实施和测试，前置探索授权不授予 ticket 任何真实操作权限。对应 adapter 合并后，用户还必须对该平台的真实带图验收另行明确授权；验收证据只保留安全账号/目标身份、图片参数、提交边界、结果和停止条件。`UNSUPPORTED` / `INCONCLUSIVE` 保持该平台图片入口关闭，但其合规探索证据可用于收口波次 13。
- 网站媒体图片传输不属于 Ticket 18–21。只有用户对真实低价媒体实验给予明确授权后，才可执行独立探索；授权必须规定费用上限、媒体资源、图片格式/尺寸/数量、请求体观察、传输机制、正文成功判据、敏感证据处理和停止条件。
- 探索只允许输出 `SUPPORTED`、`UNSUPPORTED` 或 `INCONCLUSIVE`。`SUPPORTED` 仅授权另建正式实施 ticket，不等于功能已实现；`UNSUPPORTED` 保持纯文本；`INCONCLUSIVE` 同样保持功能关闭且不阻塞核心完成。
- 在真实验证前不得创建网站媒体图片实现承诺，不使用自建 OSS、外部图片托管或另一个系统的私有 UEditor 接口。

## 8. 调度完成时主线程的输出

主线程创建完该波次 ticket 线程后，只返回：

- 波次编号；
- 已创建 ticket 线程及其 threadId/hostId；
- setup pending 的 ticket 及其 clientThreadId；
- 每个线程对应的 worktree 和目标分支；
- 未创建的 ticket 及原因；
- 当前集成基线提交；
- 明确声明“未审计、未提交、未合并、未推送”。

每个已受理任务还必须按创建结果输出一条 `::created-thread{threadId="..."}` 或 `::created-thread{clientThreadId="..."}`；不得为同一 ticket 同时输出两条创建指令。

主线程不得等待所有 ticket 完成后自动进入审计或下一波；后续操作由用户分别控制。
