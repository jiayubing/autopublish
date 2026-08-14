# Ticket 26 Goal 模式主调度 Prompt

将下面 Prompt 原样发送到一个新的主任务。该 Prompt 明确授权创建 Goal、为每个工作包创建一个新的 Codex 任务/worktree、提交和串行集成；不授权 push、真实登录、发布、付费、取消或生产数据迁移。

```text
在 F:\官媒投稿-refactor 启动 Goal 模式，目标是：严格串行完成 Ticket 26（26-A → 26-I）的全部本地实现、定向验证、Primary Audit、blocking finding 修复、bounded re-audit、工作包提交与集成、最终 combined audit 和 clean-HEAD gate；不进入图片 Wave，不执行真实登录、发布、付费、取消或生产数据迁移，不 push。

你是主调度任务，不直接并行实现多个工作包。请使用 `create_goal` 显式创建一个 Goal，不设置 token budget。用户明确授权你：
1. 为每个工作包创建一个新的 Codex 项目任务，并默认使用 Git worktree；
2. 每个工作包完成后创建清晰提交，并由主任务串行集成到当前 integration branch；
3. 更新 Wave Plan 和 handoff；
4. 修复 in-scope 测试失败和 blocking findings；
5. 在同一工作包未闭合时向原工作包任务发送 follow-up，不新建重复任务。

不授权：push、release、真实账号/平台操作、真实付费、真实取消、生产数据库迁移/删除、进入 Ticket 18–21 图片 Wave。

主任务最小必读，仅限：
- 根 AGENTS.md；
- .scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md 的当前状态和阶段 11.5；
- .scratch/article-lifecycle-and-submission/EXECUTION-PROTOCOL.md §§1.2–1.3、§2、§6–8；
- .scratch/article-lifecycle-and-submission/AUDIT-PROTOCOL.md §§3–7、§9；
- .scratch/article-lifecycle-and-submission/issues/26-article-library-and-submission-center-redesign.md；
- .scratch/article-lifecycle-and-submission/handoffs/26-0-dirty-reconciliation-and-contract-freeze.md；
- .scratch/article-lifecycle-and-submission/handoffs/26-thread-dispatch-guide.md。

主任务不要预读全部源码、完整 SPEC、Ticket 01–25、archive 或所有历史 handoff。每个工作包的 worker 只读取其独立合同中的“最小必读”；只有 26-I 读取完整 SPEC 和完整 AUDIT-PROTOCOL。

开始前：
1. 核对仓库根、当前分支、HEAD、git status、暂存区和 worktree；要求 integration branch 干净。
2. 确认当前 HEAD 包含 6a9232b、79dbe36、6fc897f、c10a838 以及 Ticket 26 计划提交。
3. 使用 `list_projects` 找到 F:\官媒投稿-refactor 对应项目并确认 `isGitRepository=true`；每个工作包使用 `create_thread` 创建 project worktree 任务。
4. 每次创建工作包任务时，`startingState` 必须使用 `{type: "branch", branchName: "<主任务当前 integration branch>"}`，不能省略为项目默认分支，也不能使用旧 HEAD。创建后记录返回的 `threadId`/`hostId`；若只返回 worktree setup 的 `clientThreadId`，不得把它传给要求 `threadId` 的工具，须等待 setup 完成并取得真实任务身份。

固定工作包顺序及合同：
- 26-A：.scratch/article-lifecycle-and-submission/issues/26-A-article-library-projection-and-permissions.md
- 26-B：.scratch/article-lifecycle-and-submission/issues/26-B-generation-creates-articles-only.md
- 26-C：.scratch/article-lifecycle-and-submission/issues/26-C-unified-submission-intake-and-paid-staging-retirement.md
- 26-D：.scratch/article-lifecycle-and-submission/issues/26-D-submission-center-regular-queue.md
- 26-E：.scratch/article-lifecycle-and-submission/issues/26-E-confirmed-paid-batch-workbench.md
- 26-F：.scratch/article-lifecycle-and-submission/issues/26-F-typed-attention-center.md
- 26-G：.scratch/article-lifecycle-and-submission/issues/26-G-separate-removal-from-queue-mutation.md
- 26-H：.scratch/article-lifecycle-and-submission/issues/26-H-renderer-information-architecture.md
- 26-I：.scratch/article-lifecycle-and-submission/issues/26-I-integration-audit-and-closure.md

对每个工作包严格执行：
1. 只创建当前最左的一个新任务，不预创建后续任务，不并行。
2. 新任务 Prompt 必须包含：工作包编号、独立合同路径、当前 integration HEAD/branch、允许 commit、禁止 push/真实外部操作、完成后停止且不得进入下一包。
3. Worker 按其合同完成：Implementation → 定向测试 → Primary Audit → 修复 blocking findings → bounded re-audit → commit → handoff。
4. 使用 `wait_threads` 等待；不要因普通 commentary 频繁读取任务。若 worker 需要 in-scope 修复，使用 `send_message_to_thread` 向同一任务发送 follow-up；不要创建 fresh replacement task。
5. Worker 返回后，主任务核对：合同验收、测试真实性、handoff、commit chain、最终 worktree 状态、无越界改动。不要只相信总结。
6. 将该工作包提交按顺序非交互地集成到 integration branch；若冲突涉及业务 owner，不猜测兼容，交回同一 worker 基于新 HEAD 修复。禁止为了保留旧路径增加 wrapper/adapter/alias。
7. 在新的 integration HEAD 重跑该包要求的直接 gate。通过后由主任务更新 Wave Plan，记录 commit/evidence，并提交调度文档更新。
8. 只有 integration branch 干净、上一包状态 COMPLETE、commit 是当前 HEAD 祖先时，才创建下一工作包任务。

上下文卫生：
- Worker 必须完整读取自己的独立合同，但不读取其他包合同。
- 只读合同明确列出的 SPEC 章节、CONTEXT 词汇、直接 owner、直接消费者和直接测试。
- 不读取 archive；不为“了解历史”遍历全部 handoff；只有当前合同或上一 handoff 明确引用且阻塞时才读取。
- 不把测试日志、历史 finding 或 thread 流水账复制进 Wave Plan。

审计与停止：
- P0/P1 阻塞；P2 仅在直接影响当前 acceptance、数据一致性、幂等、不确定结果安全、公开合同或直接回归时阻塞。
- 每个工作包的停止条件以其独立合同为准。普通实现选择、测试失败、in-scope finding、局部重构和 bounded remediation 不得上抛给用户。
- 如果确需真实外部授权或新的产品决策，主任务保留 Goal 活跃状态并报告精确 blocker；不得伪造通过，也不得擅自扩大权限。

26-I 完成后：
1. 在最终 clean integration HEAD 运行合同要求的 combined tests、typecheck/build、architecture/absence/performance/package gates。
2. 完成 combined Primary Audit、blocking remediation 和 bounded closure re-audit。
3. 更新 Ticket 26/Wave 11.5 状态与 final handoff；不要自动进入图片 Wave。
4. 如果目标中规定的全部本地工作完成，标记 Goal complete；若只剩未授权的真实外部验收，按合同记录 external acceptance pending，但不要执行外部操作。
5. 最终交付：最终 HEAD、工作包/commit 链、测试与 audit 结果、未执行外部验收、剩余风险、git status。不要 push。
```
