# Ticket 25-B — Lifecycle / Read Model / Archive Acceptance Handoff

**状态：** `PACKAGE_COMPLETE`（仅 25-B package evidence closure；不代表 Ticket 25 / Wave 11 `COMPLETE`）
**记录时间：** 2026-08-12（Asia/Shanghai）

## Git、worktree 与调度预检

- Base integration commit：`4f04f200f700ed0280f53d25bbea39cfdff5fb7b`。
- 实际执行 worktree：`C:\Users\violet\.codex\worktrees\b71d\官媒投稿-refactor`；thread：`019ff1df-c565-7e42-b9c8-f2a2a14b23f0`；保持 detached，没有夺取主任务 branch。
- 主任务 worktree：`F:\官媒投稿-refactor`，branch `codex/article-lifecycle-submission`；预检和收口时均指向 `4f04f20` 且 clean。
- 工具 worktree 初始实际为 clean detached `814ad92`，不是合同基线；`4f04f20` 不是其祖先。已先记录差异（`660 files changed, 91908 insertions, 21089 deletions`），随后安全切换到精确 `4f04f20`，未丢弃用户改动。
- `25-A` implementation `dde5dfa045431ab431f12b16907faf94f74560d9`、handoff `a599e6c`、EOF 修复 `2eb834c8` 和主任务集成 `3ce0eb3de4fa495975cf68dda38600c2cd8cadcd` 均为 base 祖先；`25-0`、Ticket 24 和 Maintenance 10.5 gate 已满足。
- 当前 worktree 无 staged change、无 nested Git repository、无 submodule；线程清单只有本 25-B 执行任务，没有重复 25-B thread/worktree。未创建新线程、未使用 spawn/subagent。

## 实现与真实 owner

- implementation commit：`bd3b9b11a8adcf78a00e7ce46b6dd39fd402b492`，parent 为 base `4f04f20`。
- `auto—publish/src/content/internal/article-mutation-admission.js`：修复唯一 regular admission owner 误把已结束的 `failed/cancelled` target fact 当成活动目标；现在只把 queued/claimed/reserving/remote_started/paid_processing/uncertain/unknown/订单活动码视为活动目标。已发布仍由 lifecycle projection 的 immutable guard 阻断，未知/不确定仍冻结。
- `auto—publish/tests/ticket-25-b-lifecycle-acceptance.test.js`：新增 4 个公开行为验收用例，使用合成文章、临时内容库、OperationalStore contract ports 和内存式假投稿结果；不读取生产内部表、不调用私有函数、不引入 acceptance-owned store/state machine。
- `.scratch/article-lifecycle-and-submission/acceptance/25-a-story-matrix.json`：只更新 25-B 行的 evidence refs 和 `observedResult/observedSourceState`；`status` 仍按 25-A 合同保持 `NOT_YET_RUN`，没有伪造 acceptance PASS。`25-C/25-D/25-E`、USER_CONTROLLED 和全部 image rows 保持原状。
- `.scratch/article-lifecycle-and-submission/acceptance/25-a-state-matrix.json`：继续使用唯一 25-A state matrix，只为已由 B 直接回归覆盖的 regular success/failure/uncertain/duplicate/stale 与 deletion cases 添加 package evidence；未覆盖的后续 paid/manual/cancel cases 未提前改写。
- `.scratch/article-lifecycle-and-submission/acceptance/25-a-evidence-manifest.json`：在既有 manifest 中登记新的 B tracked test；没有创建第二份 evidence manifest、第二份 query/scan budget 或新的 generated artifact。

## B 行为与 evidence 结果

新 B test 的 4/4 用例在 implementation sourceState 上通过：

1. 生成成功由 `createAiContentService` 持久化为待投稿；手工文章无 AI 来源仍可投稿；标题/正文缺失被资格合同阻断；编辑只在显式 save 后改变持久内容。
2. 公开 mutation/read-model seam 验证入队冻结、单个/批量移除恢复待投稿、单活动目标和旧目标明确失败后的新目标入队。该用例捕获并回归了本包暴露的 retarget 缺陷。
3. 合成普通平台投稿在 submission-start 冻结 `deliveryMode=text_only`、`images=[]`、`decisionKind=initial`；明确接受形成永久发布事实，archive 展示实际投稿标题/正文；迟到退稿不覆盖首次成功；uncertain 仍冻结；相似正文的不同文章保持独立身份。
4. 公开 management snapshot 产生六个互斥入口及计数，发布后售后订单不撤销 published；未发布文章可回收/恢复/永久删除，终态订单事实仍保留。

图片边界已冻结：没有接入 Ticket 17 图片库，没有生产 UI 图片入口、0–5 配图、换图或降级能力。`25-a-story-matrix.json` 的 10 个 `image_extension` rows 仍精确为 `DEFERRED_IMAGE_EXTENSION`；B 的 text-only rows 只证明空图片清单和 text-only 边界，不把图片能力写成已验收。

## 实际命令与结果

环境：Windows `win32/x64`，Node `v24.16.0`，npm `11.13.0`；依赖安装使用 `npm ci --ignore-scripts --no-audit --no-fund`，未启动外部服务。

| 命令 | 实际结果 |
| --- | --- |
| `node --test --test-concurrency=1 tests/ticket-25-b-lifecycle-acceptance.test.js` | implementation sourceState 最终 `4/4 PASS` |
| `node --test --test-concurrency=1 tests/ticket-25-b-lifecycle-acceptance.test.js tests/article-mutation-coordinator.test.js tests/article-lifecycle-ticket-08.test.js tests/phase-03-six-stage-article-lifecycle.test.js tests/article-management-snapshot.test.js tests/article-lifecycle-ticket-22.test.js tests/phase-03-publication-workflow.test.js tests/phase-08-content-lifecycle.test.js tests/renderer-published-trash-flow.test.js tests/renderer-publication-history.test.js` | `104/104 PASS`，0 failed/skipped/cancelled |
| B 相关候选组合（24 个既有公开/合同测试文件，含 lifecycle/read-model/archive/deletion/absence） | base `4f04f20` 上 `198/198 PASS`；作为候选盘点结果，不替代修复后 104 项直接回归 |
| `npm run test:ticket-25-a -- --output build/evidence/ticket-25-a-contract.json` | `PASSED`；85 stories、95 rows、21 cases、10 deferred image rows、manifest trackedCount 12；generated report 为 ignored 文件，sourceState 为当时 docs dirty 的精确 `bd3b9b1` |
| `npm run lint` | `PASS` |
| `npm run format:check` | `PASS` |
| `npx prettier --check tests/ticket-25-b-lifecycle-acceptance.test.js src/content/internal/article-mutation-admission.js` | `PASS` |
| `npm run test:discover` | `PASS`；251 个 `.test.js/.test.mjs`，包含新的 B test |
| `git diff --check` | `PASS` |

开发中首次运行新验收测试时有 3 个 harness 输入错误，已修正测试接缝；随后暴露了上面记录的真实 retarget owner 缺陷。该 finding 属于 `EXPOSED_PREEXISTING`，已由最小 owner 修复和 104 项直接回归闭合，不执行独立 Primary/combined audit。

未运行：完整 `npm test`、25-G full gate、Renderer/Preload build、production smoke、独立 audit/bounded re-audit、真实登录/发布/付费/订单创建或刷新/取消、生产数据库操作和图片上传。原因分别是 25-B 合同边界、25-G/后续包职责以及 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`；不得把未运行项声称通过。

## sourceState、残余风险与下一包入口

- `observedSourceState` 与上述直接行为结果绑定 implementation commit `bd3b9b11a8adcf78a00e7ce46b6dd39fd402b492`；matrix/manifest/handoff 是后续 docs/evidence commit，不能改变该测试 provenance。
- B 当前未发现未闭合的 blocking product failure。仍缺真实外部验收、图片能力和后续 C/D/E 的队列并行、付费订单、迁移恢复证据；这些不能在 B 预建或假装通过。
- 下一包入口：主任务将本实现与 docs/evidence commit 集成到新的 clean integration HEAD 后，再按串行协议另行调度 `25-C`。本执行任务不进入 25-C/D/E/F/G，不更新 Ticket 25/Wave 11 COMPLETE。
- 禁止的外部操作：真实登录、真实平台发布、真实付费/订单创建、真实订单刷新/取消/申诉、生产数据库修改、图片上传以及 push。
