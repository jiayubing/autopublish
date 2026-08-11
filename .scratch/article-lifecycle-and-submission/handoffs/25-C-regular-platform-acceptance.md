# Ticket 25-C — Regular Platform Acceptance Handoff

**状态：** `PACKAGE_COMPLETE`（仅 25-C package evidence closure；不代表 Ticket 25 / Wave 11 `COMPLETE`）

**记录时间：** 2026-08-12（Asia/Shanghai）

## Git、worktree 与调度预检

- Base integration commit：`83377eeab020800e3058bdc528b2c8eeed2587fb`，与主任务提供的 integration HEAD 一致。
- 实际 worktree：`C:\Users\violet\.codex\worktrees\7d9d\官媒投稿-refactor`；最终保持 detached HEAD，没有夺取 `codex/article-lifecycle-submission`。
- 执行上下文：当前用户可见 delegated task，source thread reference `019ff1af-f015-7111-8af5-7fcb7003ad3c`；没有创建新线程、没有使用 spawn/subagent。
- 工具 worktree 初始实际为 clean detached `814ad92d6576ccd8c66208b1b813da438e0cb9d1`，不是 `83377ee` 的祖先；两者差异为 `662 files changed, 21089 insertions, 92660 deletions`。已先核对无 staged/untracked/nested repository/submodule，再安全切换到精确 `83377ee`，未丢弃用户改动。
- 25-A implementation `dde5dfa045431ab431f12b16907faf94f74560d9`、25-B implementation `bd3b9b11a8adcf78a00e7ce46b6dd39fd402b492`、25-B integration `750c41d3ea283f902560aa5248d91261e893d0e8` 均在 base 祖先链；25-0、Ticket 24 和 Maintenance 10.5 gate 已由前包 handoff 记录并在当前 base 核验。
- 当前没有重复 25-C task/worktree；预检时暂存区、未跟踪文件、嵌套仓库和 submodule 均为空。

## 实现与真实 owner

- Implementation commit：`e925dbf90ff82f6028956092ce4240ab717d3c52`。
- 本包只新增 `auto—publish/tests/ticket-25-c-regular-platform-acceptance.test.js`，没有修改生产源码、schema、IPC API 或第二状态 owner。
- 测试通过现有公开 `createRegularQueueApplication`、OperationalStore transition ports、`createRegularQueueGroupComposition`、regular outcome service 和 renderer `createPlatformFeature` seam 驱动合成文章、临时内容库与内存 fake transport。fake executor 只映射准备/提交结果，不拥有冻结、重试、人工核对、队列暂停或 publication success。
- 覆盖：单目标 admission、平台/账号组身份、单账号 UI 隐藏但保留 account identity、跨平台并行、同平台多账号锁、FIFO、运行中队尾追加、公开 current/remaining projection、文章级失败继续、group-blocked 影响范围、pause-all、manual pause、start-all、restart 后暂停、明确 accepted、uncertain 冻结与禁止 replay、确认已接受/确认未接受、重复/相反/迟到结果的 first-wins 约束，以及 text-only evidence 复用。
- 未发现需要修复的真实产品缺陷；现有 `regular-queue-application`、`regular-queue-group-orchestrator`、OperationalStore regular queue runtime、regular outcome service 和 platform feature owner 的公开行为均通过本包回归。

## Matrix、evidence 与 sourceState

- Matrix/evidence commit：`8e00b4ba5ac8409bf4f06aea4c87910bbea99768`。
- `.scratch/article-lifecycle-and-submission/acceptance/25-a-story-matrix.json` 保持唯一 owner：95 rows、10 个 `DEFERRED_IMAGE_EXTENSION` rows；只补 25-C 行和 story 25 的模拟 evidence 引用/observedResult/sourceState。C 行 `status` 仍为合同要求的 `NOT_YET_RUN`，story 25 仍为 `USER_CONTROLLED_REQUIRED`。
- story 29 的 `image_extension` portion 未改，仍精确为 `DEFERRED_IMAGE_EXTENSION`；本包只证明追加仍使用 `deliveryMode=text_only`、`images=[]`、`decisionKind=initial`，没有实现图片配置继承或 Ticket 18–21 图片链。story 78/82 也只记录 text-only boundary。
- `.scratch/article-lifecycle-and-submission/acceptance/25-a-state-matrix.json` 仍是唯一 21-case matrix；只为本包直接覆盖的 regular group failure、manual accepted/rejected first-wins、restart paused 和 shared-platform-lock cases 增加 `25-C` evidence，保留 A/B 已有 package evidence 与 D/E/paid/cancel/image cases。
- `.scratch/article-lifecycle-and-submission/acceptance/25-a-evidence-manifest.json` 增加一个 tracked artifact：`auto—publish/tests/ticket-25-c-regular-platform-acceptance.test.js`，tracked artifact count 为 13。没有提交 `build/evidence/`、日志、缓存或 `node_modules`。
- 行为 observed sourceState 绑定 implementation commit `e925dbf…`；在最终 clean docs HEAD `8e00b4b…` 重新运行 C test 与 gates，确认 docs/evidence 更新没有改变公开行为。

## 实际命令与结果

环境：Windows `win32/x64`，Node `v24.16.0`，npm `11.13.0`。依赖安装使用：

`npm ci --ignore-scripts --no-audit --no-fund`（`auto—publish`）

`npm ci --ignore-scripts --no-audit --no-fund`（`auto—publish/media-workbench`）

未启动外部服务。

| 命令 | 实际结果 |
| --- | --- |
| `node --test --test-concurrency=1 tests/ticket-25-c-regular-platform-acceptance.test.js` | `4/4 PASS` |
| `node --test --test-concurrency=1 tests/phase-07-regular-queue.test.js tests/platform-task-progress.test.js tests/platform-account-binding-store.test.js tests/regular-platform-outcomes.test.js tests/regular-platform-outcome-service.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-publication-evidence-contract.test.js tests/phase-08-publication-submission-orchestration.test.js tests/phase-06-platform-typed-ipc.test.js tests/renderer-platform-task-store.test.js` | `78/78 PASS` |
| `node --test --test-concurrency=1 tests/renderer-platform-queue-refresh-lifecycle.test.js tests/phase-08-cleanup-gates.test.js tests/architecture-seams.test.js tests/phase-08-renderer-contract-artifact-absence.test.js tests/ticket-24-e-absence.test.js tests/ticket-24-g-legacy-boundary.test.js` | `16/16 PASS` |
| `npm run test:ticket-25-a -- --output build/evidence/ticket-25-a-contract.json` | `PASSED`；clean sourceState `8e00b4b…`；85 stories、95 rows、21 cases、10 deferred image rows、13 tracked artifacts；external operations `none`、credentials `not-collected`、sensitive values `excluded` |
| `npm run test:discover` | `PASS`；252 个 `.test.js/.test.mjs` 文件 |
| `npm run lint` | `PASS` |
| `npm run format:check` | `PASS` |
| `git diff --check` | `PASS` |

Generated contract evidence 位于 ignored `auto—publish/build/evidence/ticket-25-a-contract.json`，未提交；它只证明 A contract validator 在 `8e00b4b…` clean HEAD 运行成功，不是 Ticket 25/Wave 11 closure。

## 未运行与残余风险

- 未运行完整 `npm test`、25-F benchmark/query-scan performance package、25-G full gate、production packaging smoke、independent combined audit、bounded closure re-audit 或 final clean smoke；这些不属于 25-C。
- 未执行真实登录、真实平台发布、真实付费、订单创建/刷新/取消、生产数据库操作、公开页面轮询或任何 image upload。
- story 25 的合成跨平台并行结果不能替代 `user-control:regular-platform-two-groups-text-only`；真实账号/目标的两组普通平台纯文本验收仍固定为 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`，需用户另行明确授权并遵守停止条件。
- 图片 extension 继续后置；不得以本包的空图片清单或现有 UI 假称图片继承已验收。

## 下一包入口与禁止操作

下一包入口是 `25-D`，必须由主任务在核验 `25-C` implementation/docs commits、clean HEAD 和本 handoff 后另行调度。本执行任务不分析、实现或预建 25-D/E/F/G，不更新 Ticket 25/Wave 11 `COMPLETE`，不 push，也不执行任何真实外部操作。

## Commit 记录

- Implementation：`e925dbf90ff82f6028956092ce4240ab717d3c52` — `test: cover Ticket 25-C regular platform acceptance`
- Matrix/evidence docs：`8e00b4ba5ac8409bf4f06aea4c87910bbea99768` — `docs: record Ticket 25-C acceptance evidence`
- Handoff docs commit：本文件随最终 handoff-only docs commit 写入；其 hash 由最终 Git 状态返回并在主任务集成时核验。
