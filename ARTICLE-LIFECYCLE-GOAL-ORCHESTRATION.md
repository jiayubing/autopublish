# 文章生命周期重构 Goal Mode 自动编排协议

> 用途：把本文件作为新 Codex 主线程的长期执行合同。主线程使用 Goal mode，按依赖顺序创建和调度独立 ticket 线程，完成 ticket、独立审计、合并、波次审计和最终验收。

## 1. 最终目标

在永久集成工作树 `F:\官媒投稿-refactor` 的分支 `codex/article-lifecycle-submission` 上完成文章生命周期与投稿流程的 25 个 ticket，并满足以下结果：

1. 所有 ticket 均按照各自文档实施、提交、定向审计和复验。
2. 每个波次全部通过集成审计后，才允许进入下一波次。
3. 最终由 ticket 25 完成全流程、性能、架构、类型、测试、构建和打包验收。
4. 最终集成分支工作区干净，所有已接受变更均有明确提交和审计证据。
5. 不自动推送远端、不创建 PR、不发布真实文章、不创建真实付费订单。

本文件中的“Phase 8”指完整的文章生命周期与投稿流程重构阶段；“波次 8”只指其中包含 ticket 18、22 的第八个执行波次。

## 2. 权威输入

主线程开始前必须完整读取：

1. `F:\官媒投稿-refactor\ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`
2. `F:\官媒投稿-refactor\CONTEXT.md`
3. `F:\官媒投稿-refactor\docs` 中现存的有效 ADR
4. `F:\官媒投稿-refactor\.scratch\article-lifecycle-and-submission\issues` 下全部 ticket 的标题、`Blocked by` 和波次关系
5. 当前准备执行或审计的 ticket 全文
6. 本编排协议

冲突时优先级为：用户在主线程中的最新明确指令 > 权威规格与词汇表 > 已接受 ADR > ticket > 本编排协议。不得用旧文档或旧实现推翻已经确认的新业务规则。

## 3. 当前起点（2026-08-06 快照）

启动时必须重新用 Git 验证，不能只相信本快照。

| 项目 | 当前事实 | 主线程动作 |
| --- | --- | --- |
| 集成工作树 | `F:\官媒投稿-refactor` | 必须始终保留给集成、波次测试和最终验收 |
| 集成分支 | `codex/article-lifecycle-submission`，快照提交 `31ce9d8` | 禁止将 ticket 分支签出到该目录 |
| ticket 01 | 已进入集成分支，集成结果含 `2f7011b` | 不重复执行 |
| ticket 11 | 已进入集成分支，来源提交 `b0d9d58` | 不重复执行 |
| ticket 17 | 已进入集成分支，来源提交 `9b8c675` | 不重复执行 |
| ticket 03 | 已通过提交 `31ce9d8` 合并进入集成分支，来源提交 `b927be2` | 不重复执行 |
| 波次 1 | 01、03、11、17 均已合并，但尚未完成完整审计 | 新 Goal 主线程直接对合并后的四个 ticket 做完整集成审计 |

启动时执行并保存结果：

```powershell
git -C "F:\官媒投稿-refactor" status --short --branch
git -C "F:\官媒投稿-refactor" worktree list --porcelain
git -C "F:\官媒投稿-refactor" log --graph --oneline --decorate --all -30
git -C "F:\官媒投稿-refactor" merge-base --is-ancestor `
  "codex/article-lifecycle-03" `
  "codex/article-lifecycle-submission"
```

如状态与快照不同，以 Git 和已完成任务的正式交接记录为准，但必须解释差异。存在来源不明的未提交修改时暂停，禁止覆盖、清理或替用户提交。

## 4. 模型与角色硬约束

### 4.1 Ticket 执行线程

- 每个 ticket 必须创建一个独立的 Codex ticket 线程；ticket 的实施直接发生在该线程中，不再为实施额外创建子代理。
- 所有 ticket 实施、审计发现修复、合并冲突中的业务修复，一律使用精确模型 `gpt-5.6-luna`。
- 推理强度一律为 `max`。
- 主线程创建 ticket 线程时必须显式指定模型和推理强度，不能依赖默认值。
- 必须使用 `$implement` 技能执行 ticket。
- 每个 ticket 线程只负责一个 ticket，使用自己的 Codex worktree 和分支；不得直接修改集成工作树；不得自行合并。
- ticket 线程可以在审计反馈返回后继续修复同一 ticket，保持同一线程、同一模型和同一工作树，不创建第二个实施线程替代它。
- 如果 `gpt-5.6-luna` 或 `max` 在当前 Codex 环境中不可选择、不可调用或启动失败：立即停止该实施任务，标记 `BLOCKED_MODEL_UNAVAILABLE` 并通知用户。禁止降级为 Terra、Sol、其他模型或其他推理强度。

### 4.2 审计代理

- 子代理主要用于审计，不用于实施 ticket。
- 所有 ticket 定向审计、修复复验、波次完整审计和最终独立审计，一律使用精确模型 `gpt-5.6-sol`。
- 推理强度一律为 `medium`（“中”）。
- 主线程在 ticket 线程交接后创建独立审计子代理，并显式指定模型和推理强度。
- 必须使用 `$code-review` 技能，并以权威规格、对应 ticket、集成基线和实际 diff 为依据。
- 审计代理默认只读，不提交业务修改、不代替 ticket 线程修复。
- 审计必须由未实施该变更的独立代理完成；ticket 线程自报通过不构成审计通过。
- 如果 `gpt-5.6-sol` 或 `medium` 不可用：标记 `BLOCKED_AUDIT_MODEL_UNAVAILABLE` 并停止合并。

### 4.3 主线程

主线程只负责：

- 读取依赖与状态；
- 创建或验证工作树和分支；
- 创建、等待、追问和关闭 ticket 线程；
- 创建、等待和终止审计子代理；
- 核验交接材料；
- 执行无业务判断的 Git 合并；
- 在集成工作树运行波次门禁；
- 根据审计结论推进或暂停。

主线程不得亲自实施 ticket，也不得亲自给出替代独立审计的“通过”结论，以免绕过模型约束。

## 5. 并发与工作树规则

1. 主线程固定使用 `F:\官媒投稿-refactor` 和 `codex/article-lifecycle-submission`。
2. 主线程为每个 ticket 创建一个独立 Codex 线程，并选择 `Worktree` 环境；Codex 负责为该线程建立隔离工作树。
3. ticket 线程在自己的工作树中创建或确认 `codex/article-lifecycle-NN` 分支，并在该线程中提交。
4. 每个新 ticket 线程必须从“上一波完整审计通过后的最新集成提交”创建。
5. 一个分支只能在一个工作树中签出。遇到 `already used by worktree` 时，进入已有工作树，不得在集成目录切换到该分支。
6. 波次内只有互不阻塞的 ticket 才能并行。并发数不得超过当前环境实际可创建和运行的 ticket 线程数；审计子代理不应与同一工作树上的 ticket 线程同时写入。
7. 不允许两个写线程同时修改同一个工作树。ticket 线程完成交接后，审计子代理才可读取该工作树或对应分支。
8. 已合并工作树默认保留，不自动删除。清理工作树属于独立操作，只有用户明确要求时才执行。
9. 不复用含未提交修改、分支不匹配或来源不明提交的工作树。

创建新 ticket 线程前的标准检查：

```powershell
git -C "F:\官媒投稿-refactor" status --short --branch
git -C "F:\官媒投稿-refactor" worktree list --porcelain
git -C "F:\官媒投稿-refactor" branch --list "codex/article-lifecycle-NN"
```

仅在集成工作区干净、目标 ticket 尚未有运行线程且依赖已满足时创建 Codex ticket 线程。创建时必须使用：

```text
target: project local worktree
startingState: branch codex/article-lifecycle-submission
model: gpt-5.6-luna
thinking: max
title: Article lifecycle ticket NN
```

线程创建返回 `clientThreadId` 代表工作树仍在准备，不能把它当作已运行的 `threadId`；只有拿到正式 `threadId`/`hostId` 后，主线程才加入等待清单。主线程保存每个 ticket 的 threadId、hostId、分支和工作树路径，直到该 ticket 完成或明确阻塞。

### 5.1 主线程的 Ticket 线程调度循环

1. 通过项目列表确认 `F:\官媒投稿-refactor` 对应的 Git 项目 ID。
2. 对当前波次每个 `READY` ticket 调用任务创建能力：目标选择该项目的 `worktree`，起点选择 `codex/article-lifecycle-submission`，模型选择 Luna，推理强度选择 max。
3. 每个 ticket 线程都是用户可在侧边栏查看的独立任务；主线程记录 threadId、hostId 和等待游标。
4. 使用线程等待能力一次跟踪当前波次的全部运行线程，不通过频繁读取完整对话制造上下文噪音。
5. ticket 线程完成或需要关注时，主线程读取它的最终交接摘要；如果它只报告进度而未满足交接模板，发送后续消息要求继续完成。
6. ticket 线程提出的问题如果可由权威规格、ADR 或 ticket 明确回答，主线程直接把依据发回该线程；如果答案会改变业务范围、权限或外部副作用，暂停并询问用户。
7. 审计 `FAIL` 时，向原 ticket threadId 发送审计发现，并再次显式保持 `gpt-5.6-luna`/`max`；等待修复交接后重新创建审计子代理。
8. ticket 合并并通过所属波次审计前，不自动归档其线程；本协议不授权主线程自动归档或删除任务。

## 6. 状态机

主线程必须为每个 ticket 使用以下状态之一：

```text
BLOCKED → READY → RUNNING → HANDOFF_READY → AUDITING
        → FIX_REQUIRED → REAUDITING
        → ACCEPTED → MERGED
```

另有终止状态：

- `BLOCKED_MODEL_UNAVAILABLE`
- `BLOCKED_AUDIT_MODEL_UNAVAILABLE`
- `BLOCKED_DIRTY_WORKTREE`
- `BLOCKED_TEST_FAILURE`
- `BLOCKED_TEST_TIMEOUT`
- `BLOCKED_MERGE_CONFLICT`
- `BLOCKED_REQUIREMENT_DECISION`
- `BLOCKED_EXTERNAL_ACTION`

只有 `ACCEPTED` 的 ticket 可以合并；只有当前波次所有 ticket 均为 `MERGED` 且波次完整审计为 `PASS`，下一波才可转为 `READY`。

## 7. 单个 ticket 的标准自动流程

### 7.1 创建并分配 Ticket 线程

主线程通过 Codex 的任务创建能力为该 ticket 新建一个 worktree 线程，显式选择 Luna/max，并把以下信息放入线程的初始 prompt：

- ticket 文件绝对路径；
- 权威规格和 `CONTEXT.md` 的绝对路径；
- 该线程自己的 Codex worktree；
- ticket 分支名；
- 创建该分支时的集成基线提交；
- 明确的 non-goals；
- 模块边界要求：深模块、窄而稳定接口、低耦合、明确所有者、可维护、可扩展；新生产模块目标不超过 300 行、硬上限 400 行、禁止新增长度例外；
- 必须使用 `$implement`；
- 禁止合并、推送、真实网络付费或真实发布。

主线程不得再让 ticket 线程创建实施子代理；`$implement` 由 ticket 线程自身直接执行。

### 7.2 实施

ticket 线程必须：

1. 检查自己的工作树和基线，创建或确认 ticket 分支。
2. 完整阅读 ticket 及其直接权威输入。
3. 先建立或固定可观察行为测试，再按 ticket 的执行过程实施。
4. 按第 7.3 节选择测试类别，开发中定期运行单文件或小范围测试和相关 typecheck。
5. 完成后运行定向测试、相关 typecheck/lint、ticket 专项门禁和 Phase 8 架构门禁。
6. 本 ticket 阶段不运行完整 `npm test`；在交接中明确写明 `DEFERRED_TO_WAVE_AUDIT`。
7. 不得因全量测试延后而省略 ticket 的专项验收、故障场景或类型/架构门禁。
8. 提交当前 ticket 的全部合格变更，并输出标准交接记录。

### 7.3 Ticket 测试分层与强制门禁

#### 7.3.1 `npm test` 在什么阶段执行

结论：**ticket 01–24 实施阶段不执行完整 `npm test`；当前波次全部合并后，在集成审计阶段执行一次。**

- 本项目采用用户明确批准的覆盖约定：`本 ticket 阶段仅执行定向测试和相关门禁；完整 npm test 延后到本波次集成审计时执行。不得因未执行完整测试而省略 ticket 的专项验收。`
- 该项目约定覆盖 `$implement` 技能“工作结束运行一次完整测试套件”的默认行为；ticket 线程必须遵循本协议，不得自行恢复为每 ticket 全量测试。
- ticket 01–24 的交接记录必须把 `Full npm test` 标记为 `DEFERRED_TO_WAVE_N_AUDIT`，这不是缺失证据，也不阻止进入定向审计。
- ticket 审计代理只复跑关键定向测试、直接调用方回归和相关门禁，不执行完整 `npm test`。
- 当前波次全部 ticket 审计通过并合并后，主线程在集成分支运行一次 `npm test`，验证真实组合结果。
- 波次审计后的修复只运行受影响的定向测试；全部修复合并后，必须对新的集成 HEAD 重新运行一次 `npm test`。
- ticket 25 是最终验收 ticket，按其明确要求执行完整 `npm test`、构建和生产打包门禁。

#### 7.3.2 每个 ticket 都必须完成的基础测试

ticket 01–24 至少执行以下三类验证：

1. **定向行为测试**：运行本 ticket 新增/修改的测试文件，以及覆盖直接调用方和公开契约的现有测试；开发期优先使用 `node --test tests/<相关文件>.test.js`。
2. **受影响类型与静态检查**：至少运行 `npm run lint`，并按改动范围选择 main、bridge、renderer typecheck。
3. **架构与清理门禁**：触及生产模块、依赖方向、模块尺寸、旧规则或 IPC 时，运行 `npm run test:phase-08:gates` 和 `npm run verify:phase-08`；本轮 25 个 ticket 默认都视为触及这些约束，除非 ticket 25 的独立审计明确证明不适用。

基础命令从 ticket worktree 的 `auto—publish` 目录执行：

```powershell
npm run lint
npm run test:phase-08:gates
npm run verify:phase-08
```

#### 7.3.3 按改动范围选择的测试类别

| 改动范围 | 必须追加的验证 |
| --- | --- |
| `desktop`、主进程、composition、worker、typed IPC | `npm run typecheck:main`；相关 IPC/worker 单文件测试；触及生产 IPC 矩阵时运行 `npm run test:production-ipc-matrix` |
| `media-workbench`、Renderer、bridge、UI 投影 | `npm run typecheck:bridge`、`npm run typecheck:renderer`；相关 UI/bridge 测试；影响构建时运行 `npm run build:renderer` |
| SQLite、schema、store、旧数据迁移 | `npm run test:migration`；追加 dry-run、回滚、幂等重跑、重开、备份恢复、未来版本拒绝和容量测试中与 ticket 对应的部分 |
| 投稿应用服务、生命周期、队列、恢复 | 运行投稿、队列、幂等、并发、暂停/恢复、故障注入和 typed IPC 的相关单文件/集成测试 |
| 网站媒体服务商、订单与付费流程 | 使用假 transport；运行合同、字段映射、串行、价格竞态、unknown/uncertain、刷新和取消相关测试；禁止真实凭据、真实网络和真实付费 |
| 普通平台适配器与浏览器/Python 运行时 | 使用假平台或假运行时；运行合同、安全、上传、降级和会话生命周期测试；禁止真实账号和真实发布 |
| 客户图片库、图片准备与文件系统 | 运行客户隔离、路径穿越、符号链接、损坏文件、格式、数量不足、随机可复现、容量和纯文本回归测试 |
| 删除、档案、回收和恢复 | 运行权限矩阵、事务顺序、故障恢复、幂等、隐私保留和并发竞态测试 |
| 诊断与运行时观测 | `npm run test:diagnostics` |
| 打包边界、preload、运行时资源或发布证据 | `npm run test:packaging`；只有 ticket 明确要求真实构建/烟测时才运行对应 pack/build 命令 |
| 链接能力或链接安全 | `npm run test:links` |
| 认证范围（本轮通常不应触及） | `npm run test:auth`；同时报告为何 article lifecycle ticket 触及认证边界 |
| 性能、容量或批量投影 | `npm run test:capacity` 或 ticket 指定的基准；记录输入规模、耗时和是否存在 N+1 |
| 废止规则清理 | `npm run test:legacy-absence`，并运行 ticket 指定的静态搜索和负向行为测试 |

如果某条 npm script 没有覆盖 ticket 的具体行为，必须用 `node --test` 明确列出相关测试文件，不能用一个宽泛脚本名称替代验收证据。

#### 7.3.4 Ticket 组的最低专项主题

| Ticket | 最低专项测试主题 |
| --- | --- |
| 01–02 | 投稿预检、批次/清理/删除恢复、SQLite、typed IPC、故障注入、打包边界 |
| 03–06 | 六类互斥投影、权限一致性、生命周期迁移、审核/来源旧门槛缺失、并发编辑与回收 |
| 07–10 | 单目标入队、待执行移除、独立队列组、FIFO、并发、暂停/恢复、unknown/uncertain、队列 UI |
| 11–16 | 服务商假传输、字段/错误合同、费用确认、严格串行、订单号门槛、人工核对、刷新、取消和永久历史 |
| 17–21 | 客户图片安全、随机选择、0–5 图片、纯文本、三个普通平台假运行时适配和失败降级 |
| 22–24 | 已发布档案、删除保留矩阵、旧库迁移、备份/回滚、旧业务规则静态及行为缺失 |
| 25 | 85 条 user stories 追踪、全流程假运行时验收、性能、架构、全测试、Renderer build 和生产打包 |

ticket 文件列出的测试要求高于本表时，以 ticket 为准；本表不能用于删减 ticket 的验收项。

#### 7.3.5 审计与波次阶段如何复验

- **Ticket 审计代理**：至少复跑最关键的新增/修改测试、一个直接调用方回归测试和受影响的类型/架构门禁；核对测试执行的提交就是交接提交；不运行完整 `npm test`。
- **Ticket 修复后复验**：复跑发现项对应测试、直接调用方回归和受影响门禁；完整 `npm test` 仍延后到波次审计。
- **波次完整审计**：在所有 ticket 合并后的集成分支运行一次 `npm test`、基础 lint/类型/Phase 8 门禁，以及本波次所有专项门禁。
- **最终验收**：ticket 25 运行完整 `npm test`、全部静态/架构/类型门禁、Renderer build、生产打包/烟测和规格要求的性能证据。

### 7.3.6 长测试和超时处理

- 本节只适用于波次集成审计和 ticket 25 最终验收中的 `npm test`；ticket 01–24 实施阶段不得提前执行全量。
- `npm test` 是串行全量测试，耗时长不是跳过理由。
- 给全量测试配置足够的外层运行时间，并持续等待输出；不要因为普通短命令的默认超时而误判失败。
- 工具外层超时不等于测试失败，必须确认进程是否仍在运行以及最后输出。
- 只有在进程被外层工具终止且没有测试断言失败时，才允许以更长外层等待时间重跑一次。
- 不得通过删除测试、排除测试、放宽断言、提高产品内部测试超时或降低并发安全性换取绿色结果。
- 相同位置连续两次超时或无进展时，标记 `BLOCKED_TEST_TIMEOUT`，保留日志并交回主线程；不得谎报通过。

### 7.4 交接记录最低内容

```text
Ticket:
Worktree:
Branch:
Base commit:
Final commit(s):
Tested final commit / tree identity:
Implemented responsibilities:
Public interfaces / ports:
Files changed and final line counts:
Removed duplicate or legacy ownership:
Selected test categories and reason:
Targeted tests (command + result + duration):
Typechecks / lint (command + result):
Phase 8 gates (command + result):
Full npm test: DEFERRED_TO_WAVE_N_AUDIT (ticket 01–24) / command + result + duration (ticket 25):
Ticket-specific gates (command + result):
Known risks / deferred facts:
Non-goals confirmed untouched:
Working tree status:
```

缺少提交号、测试命令、失败说明、模块行数或工作区状态时，不进入审计。

### 7.5 定向审计

ticket 线程提交交接后，主线程创建一个全新的 Sol/medium 审计子代理，提供：

- ticket 文件；
- 权威规格和词汇表；
- ticket 的 base commit、final commit 和完整 diff；
- 实施交接记录；
- 相关测试输出；
- 明确要求使用 `$code-review`。

审计至少检查：

1. 正确性、回归、安全、并发、幂等和故障恢复。
2. ticket acceptance criteria 是否逐项有证据。
3. 是否越过 non-goals 或提前实现后续 ticket。
4. 模块职责、接口深度、依赖方向、耦合、可替换性和文件长度。
5. 测试是否验证公开行为而非锁定私有布局。
6. 是否引入旧规则、临时双实现、长度例外或隐藏兼容路径。

审计输出必须包含：发现项（含严重级别、文件和行号）、验收映射、实际复验命令、剩余风险，以及唯一结论 `PASS` 或 `FAIL`。

### 7.6 修复和复验

- `FAIL` 时不得合并。
- 主线程把审计发现发送回原 Luna/max ticket 线程，由该线程在原工作树修复并提交；不得另建实施子代理。
- 修复后创建新的 Sol/medium 审计代理进行定向复验。
- 不允许 ticket 线程自审后直接改为 `PASS`。
- 循环直到 `PASS`，或命中停止条件。

### 7.7 合并

审计 `PASS` 后，主线程在集成工作树中：

1. 再次确认集成工作区干净。
2. 确认 ticket 分支是预期分支且包含审计通过的最终提交。
3. 合并 ticket 分支，保留清晰的 ticket 历史。
4. 如发生冲突，不得由主线程凭感觉解决业务冲突；标记 `BLOCKED_MERGE_CONFLICT`，把冲突信息发送回原 Luna/max ticket 线程处理，再由 Sol/medium 复验。
5. 合并后运行最小集成 smoke/contract 测试，确认合并本身未破坏构建。

## 8. 波次完整审计

当前波次全部 ticket 合并后，主线程必须在集成工作树启动新的 Sol/medium 审计代理。波次审计不是四份 ticket 自报结果的汇总，而是针对合并后真实代码的独立集成审计。

波次审计必须：

1. 使用该波次开始前的集成提交与当前集成 HEAD 形成完整 diff。
2. 同时读取本波次全部 ticket、权威规格和已有交接记录。
3. 检查 ticket 之间的接口组合、状态优先级、迁移顺序、错误边界和职责重复。
4. 在集成工作树运行全量 `npm test`，并运行本波次各 ticket 明确要求的专项门禁。
5. 运行相关 lint、typecheck、架构、模块尺寸、legacy absence、typed IPC、Renderer 或打包门禁。
6. 输出波次报告：合并提交清单、发现项、测试证据、模块边界结论、残余风险和 `PASS`/`FAIL`。

波次审计为 `FAIL` 时：

- 从当前集成 HEAD 创建一个独立的 `Wave NN audit fixes` Codex 线程，模型固定 Luna/max，使用独立 worktree 和 `codex/article-lifecycle-wave-NN-fixes` 分支；
- 该修复线程直接处理已确认发现，不再创建实施子代理；
- 修复提交必须经过新的 Sol/medium 复验；
- 复验通过后合并修复分支，并重新运行受影响门禁；
- 未得到波次 `PASS` 前不得启动下一波。

## 9. 波次 1 的特殊启动流程

这是新 Goal 主线程的实际第一项工作。

### A. 核验四个 ticket 已合并

1. 确认集成 HEAD 包含 01、03、11、17 的最终提交。
2. 确认 03 来源提交 `b927be2` 是 `codex/article-lifecycle-submission` 的祖先；快照中的合并提交为 `31ce9d8`。
3. 不重复启动或重新合并四个 ticket。
4. 收集四个 ticket 已有交接记录；缺失记录作为波次审计证据缺口处理，不回滚已合并代码。
5. 直接进入波次 1 完整集成审计。

波次 1 审计报告必须在总体 `PASS`/`FAIL` 之外，分别给出 01、03、11、17 的验收子结论和证据。四个子结论全部为 `PASS`，才视为补齐这四个已合并 ticket 的独立审计记录。

### B. 波次 1 完整集成审计

波次 1 包含 01、03、11、17。审计基线优先使用拆票提交 `814ad92`，审计终点使用合并 03 后的集成 HEAD；如 Git 历史变化，记录经验证的等价基线。

波次 1 审计除通用要求外，必须重点检查：

- 01 的投稿预检、计划、提交、查询边界是否真正独立且旧巨型服务已收缩；
- 03 的六类投影是否唯一、互斥、优先级一致，Renderer 未重复派生；
- 11 的网站媒体供应商契约是否隔离真实网络和真实费用，字段/错误映射是否稳定；
- 17 的客户图片库是否客户隔离、路径安全、随机源可测试且不消耗素材；
- 四个模块组合后是否出现重复所有权、反向依赖或新巨型门面；
- 01/03 的文章与批次事实、11 的服务商契约和 17 的图片端口之间是否保持低耦合。

从 `F:\官媒投稿-refactor\auto—publish` 至少运行：

```powershell
npm test
npm run lint
npm run typecheck:main
npm run typecheck:bridge
npm run typecheck:renderer
npm run test:phase-08:gates
npm run verify:phase-08
npm run test:packaging
npm run build:renderer
```

同时补齐 01、03、11、17 ticket 明确要求的定向测试、容量/性能证据和模块行数证据。只有波次 1 完整审计为 `PASS`，才进入波次 2。

## 10. 波次 1.5：全量测试运行器优化

波次 1 完整审计 `PASS` 后、波次 2 开始前，执行一次独立的测试基础设施优化任务。该任务不占用原 25 个业务 ticket 编号，不得改变文章生命周期、投稿、订单、图片或用户界面行为。

### 10.1 线程和模型

- 主线程创建独立 Codex worktree 线程，标题使用 `Article lifecycle test runner optimization`。
- 分支使用 `codex/article-lifecycle-test-runner-optimization`。
- 执行线程使用精确模型 `gpt-5.6-luna`、推理强度 `max`，直接使用 `$implement`，不创建实施子代理。
- 完成交接后由主线程创建 `gpt-5.6-sol`、`medium` 审计子代理，使用 `$code-review`。
- 审计失败时把发现发送回原优化线程修复，之后创建新的 Sol/medium 子代理复验。

### 10.2 优化目标

1. 保持公开命令 `npm test` 不变。
2. 以波次 1 串行全量测试的测试数量、结果和耗时作为基线证据；如果基线没有文件级耗时，则先补充只读耗时采集。
3. 保证测试发现集合完整；快照时为 245 个 `.test.js`/`.test.mjs` 文件，实施时以 `npm run test:discover` 的实时结果为准。
4. 为测试运行器增加每文件/分组耗时证据，找出主要慢项。
5. 将已证明隔离的纯单元、合同和独立临时目录测试放入有限并行池；Electron、固定端口、共享文件、Renderer harness、打包、容量和其他共享状态测试保留在串行池。
6. 复用现有 desktop core、migration、security/diagnostics、capacity、packaging、Phase 8 gates 和 production IPC matrix 边界，不建立重复测试清单所有者。
7. 并发数必须可配置并有保守默认值；保留明确的强制串行回退入口，便于诊断偶发问题。
8. 不排除测试、不降低断言、不放宽超时、不删除慢测试、不以缓存测试结果冒充实际执行。
9. 测试运行器和配置保持深模块、窄接口和单一职责；不得把测试分类、进程调度、证据汇总和 CLI 解析重新堆积成新的巨型脚本。

### 10.3 验收证据

- 旧串行基线与新运行器收集完全相同的测试文件集合；新增测试必须同时被两种模式发现。
- 新运行器输出可审计的测试文件数、通过/失败/跳过数、总耗时和最慢文件/分组。
- 强制串行回退模式通过一次完整测试。
- 优化模式至少连续三次完整通过，结果与串行基线一致且没有资源竞争、端口冲突、共享文件污染或偶发失败。
- Windows 本地执行可用；现有 CI、测试发现合同和证据生成脚本保持兼容或同步更新。
- 提供优化前后总耗时、并发度、串行池清单、并行池规则和残余风险。
- 如果无法证明稳定提速，不得合并不可靠并发实现；保留串行运行器并向用户报告测量结果和阻碍，不得伪造优化完成。

### 10.4 合并与后续波次

优化线程通过 Sol/medium 审计后合并到 `codex/article-lifecycle-submission`。如果合并后的测试运行器代码树与已审计提交一致，只需在新的集成 HEAD 上再完成一次优化模式 `npm test`；串行等价证据沿用已审计提交的结果，不机械重复。只有合并冲突或合并后又修改测试运行器时，才重跑强制串行等价验证。通过后允许开始波次 2，后续继续使用同一个 `npm test` 命令，由已验证的新运行器负责调度。

## 11. 后续严格波次顺序

| 波次 | Ticket | 启动条件 |
| --- | --- | --- |
| 1 | 01、03、11、17 | 当前阶段；四个 ticket 均已合并，仅执行全波次审计 |
| 1.5 | 测试运行器优化（非业务 ticket） | 波次 1 完整审计 `PASS` |
| 2 | 02、04、05 | 波次 1.5 优化、等价性验证和独立审计 `PASS` |
| 3 | 06 | 波次 2 完整审计 `PASS` |
| 4 | 07、12 | 波次 3 完整审计 `PASS` |
| 5 | 08、13 | 波次 4 完整审计 `PASS` |
| 6 | 09、14、15 | 波次 5 完整审计 `PASS` |
| 7 | 10、16 | 波次 6 完整审计 `PASS` |
| 8 | 18、22 | 波次 7 完整审计 `PASS` |
| 9 | 19、20、21、23 | 波次 8 完整审计 `PASS`；按可用槽位分批并行，不能共享工作树 |
| 10 | 24 | 波次 9 完整审计 `PASS` |
| 11 | 25 | 波次 10 完整审计 `PASS` |

严格波次模式下，即使某个后续 ticket 的直接依赖提前满足，也不跨过尚未通过完整审计的当前波次。

## 12. 业务与安全停止条件

出现以下任何情况必须暂停 Goal 并请求用户决定，不能自行扩大权限或改变业务：

1. 指定的 Luna/max 或 Sol/medium 不可用。
2. 集成工作树或目标 ticket 工作树存在来源不明的未提交修改。
3. Git 无法证明 01、03、11、17 的最终提交均已进入集成分支。
4. 合并冲突涉及业务语义、数据迁移顺序或删除策略。
5. 测试失败说明权威规格与实现存在真实冲突。
6. 需要创建真实付费订单、登录真实平台、发布真实文章或操作真实客户生产数据。
7. 需要推送远端、创建 PR、发布安装包或删除工作树。
8. 网站媒体图片传输需要依赖尚未验证的服务商 API 事实。
9. 发现第三方自媒体能力被纳入范围；当前只集成网站媒体服务商和规格内普通平台。
10. 为通过测试需要恢复已废止审核/来源门槛、放宽安全规则或新增模块长度例外。

普通的代码缺陷、可定位测试失败和明确审计发现不需要询问用户；应发送回对应 Luna/max ticket 线程修复，再由 Sol/medium 审计子代理复验。波次集成缺陷则创建独立 Luna/max 波次修复线程。

## 13. 最终完成条件

主线程只有在以下条件全部满足时，才可以将 Goal 标记为完成：

- 25 个 ticket 均有自己的执行线程、可追踪的实施提交、交接记录和独立审计结论；
- 11 个波次均有完整集成审计 `PASS`；
- 波次 1.5 测试运行器优化具有串行等价性、连续稳定性和耗时对比证据；
- ticket 25 的 85 条 user stories 追踪矩阵完成；
- 全量测试、类型、lint、模块尺寸、依赖方向、legacy absence、安全、typed IPC、Renderer build 和生产打包门禁全部通过；
- 网站媒体图片仍按权威规格标记为未验证/未支持，未伪造实现完成；
- 没有真实外部付费或发布副作用；
- `codex/article-lifecycle-submission` 工作区干净；
- 最终报告列出所有 ticket/波次提交、测试计数与耗时、模块行数、性能证据、残余风险和人工验证清单；
- 未自动 push、未自动创建 PR。

## 14. 新主线程可直接使用的 Goal Prompt

在以 `F:\官媒投稿-refactor` 为项目根目录的新 Codex 线程中输入 `/goal`，然后粘贴以下内容：

```text
目标：严格按照 F:\官媒投稿-refactor\ARTICLE-LIFECYCLE-GOAL-ORCHESTRATION.md，持续完成文章生命周期与投稿流程重构的自动编排，从波次 1 完整集成审计开始；波次 1 通过后先完成波次 1.5 全量测试运行器优化，再依次推进至 ticket 25 最终验收。只有文档中的全部完成条件满足时才能结束目标。

开始前完整读取编排协议、F:\官媒投稿-refactor\ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md、F:\官媒投稿-refactor\CONTEXT.md、有效 ADR 和相关 ticket。先核验 Git、工作树和现有任务状态。01、03、11、17 已合并，不得重复执行；直接从合并后代码的波次 1 完整集成审计开始。

主线程必须为每个 ticket 创建一个独立 Codex worktree 线程，创建时显式选择 gpt-5.6-luna 和 max 推理强度。ticket 线程自身直接使用 $implement 完成实施、测试、提交和交接，不得再创建实施子代理。审计发现应发送回原 ticket 线程修复。

所有 ticket 审计、复验、波次审计和最终审计必须由主线程创建 gpt-5.6-sol、medium 推理强度的独立审计子代理，并使用 $code-review。每次创建线程或审计代理都显式指定模型和推理强度；任一精确模型或强度不可用时立即停止并报告，禁止降级替代。

测试严格执行协议第 7.3 节和用户批准的覆盖约定：ticket 01–24 实施阶段只运行定向测试、直接调用方回归、受影响 typecheck/lint、Phase 8 架构门禁和 ticket 专项门禁，不运行完整 npm test；交接明确记录 DEFERRED_TO_WAVE_AUDIT。审计代理只复跑关键定向测试和相关门禁。当前波次全部 ticket 审计通过并合并后，主线程必须在集成分支运行一次 npm test 和波次专项门禁；波次修复后必须对新的集成 HEAD 重跑。ticket 25 按最终验收要求运行全测试、构建和生产打包。不得因全量测试延后而省略 ticket 专项验收，超时也不得谎报通过。

波次 1 完整审计通过后，严格执行协议第 10 节的波次 1.5 测试运行器优化：创建独立 Luna/max worktree 线程，在不遗漏、排除或放宽测试的前提下采集耗时、建立安全并行池和串行池、保留串行回退，并由 Sol/medium 独立审计。完成串行等价性和连续三次稳定性验证后才能启动波次 2。

主线程只做线程创建与调度、工作树隔离、交接核验、合并和集成门禁，不亲自实施或替代独立审计。通过线程等待能力持续跟踪各 ticket；每个 ticket 定向审计通过后才能合并，当前波次完整审计通过后才能启动下一波。禁止推送远端、创建 PR、真实付费、真实发布、删除工作树或恢复已废止规则。遇到测试超时按协议等待和留证，不得跳过测试或谎报通过。
```

## 15. Codex 能力依据

- Goal mode 适合具有明确结果、约束和完成证据的长期工作；目标运行期间可以暂停、恢复和补充约束。
- Codex 项目可以为不同结果创建独立线程；主线程可以创建并等待这些线程，每个线程保留自己的上下文和 worktree。
- 创建 ticket 线程时可以显式指定 Luna/max；审计子代理可以单独指定 Sol/medium。
- 并行写任务必须使用不同 Git worktree；同一分支不能同时签出到多个工作树。

参考：

- https://learn.chatgpt.com/docs/projects
- https://learn.chatgpt.com/docs/long-running-work
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://learn.chatgpt.com/docs/environments/git-worktrees
