# AutoPublish 架构重构工程

本目录是后续 Codex 任务执行架构重构的唯一入口。工程采用严格串行阶段，不要求单个任务记住整个项目，也不依赖聊天历史。每个执行任务只处理一个阶段，完成后将实际结果写回进度账本和阶段交接记录。

## 1. 已确定的工程方向

- 产品继续定位为单用户 Windows Electron 桌面应用，Auth 保持独立部署。
- Electron、React、Node、Playwright 和平台 Python adapter 保留，不做技术栈重写。
- 用户创作内容继续使用文件；publication、attempt、batch、远端证据、恢复意图、订单关联等运行协调状态迁入内容库内 SQLite。
- 平台账号档案进入普通平台发布目标身份，避免换号后旧队列静默投向新账号。
- 重构期间冻结普通新功能，阶段按顺序单写切换，不维护长期新旧双轨。
- 不要求旧版本继续写入升级后的内容库，但现有用户数据必须经过备份、dry-run迁移和恢复验证。

对应决策：

- `docs/adr/0003-store-operational-state-in-workspace-sqlite.md`
- `docs/adr/0004-rebuild-by-sequential-single-writer-cutover.md`

## 2. 执行顺序

| 顺序 | 阶段 | 文档 | 主要产物 |
|---:|---|---|---|
| 0 | 工程基线与可信门禁 | `03-phase-00-engineering-foundation.md` | 根CI、唯一production seam、全量测试门禁、数据快照工具 |
| 1 | 领域契约与目标module骨架 | `04-phase-01-domain-contracts.md` | 类型化身份、发布证据、依赖规则、组合根骨架 |
| 2 | SQLite运行状态存储 | `05-phase-02-operational-store.md` | schema、事务、迁移、备份、单writer切换 |
| 3 | Publication工作流与恢复 | `06-phase-03-publication-workflow.md` | 深PublicationWorkflow module、recovery、attention派生 |
| 4 | 平台运行期与adapter | `07-phase-04-platform-runtime-adapters.md` | PlatformRun、统一publisher interface、逐平台切换 |
| 5 | 内容身份、交接与删除生命周期 | `08-phase-05-content-lifecycle.md` | 统一客户/文章身份、handoff、trash/removal恢复 |
| 6 | Renderer状态与IPC | `09-phase-06-renderer-ipc.md` | feature modules、typed IPC、请求身份、统一失效消费 |
| 7 | Auth、构建、安全与可观测 | `10-phase-07-auth-build-observability.md` | 灾备、HTTPS、限速容量、制品smoke、结构化诊断 |
| 8 | 旧架构删除与最终验收 | `11-phase-08-cleanup-acceptance.md` | 删除旧seam、全链故障验收、功能开发准入 |

阶段不得跳过、并行或合并执行。一个阶段过大时，可以由同一阶段文档拆成若干连续任务，但必须共享同一个阶段状态，且最后由单独的收口任务执行该阶段完整验收。

全部阶段固定在`F:\官媒投稿-refactor`的`codex/refactor-program`分支串行执行，不为每个阶段创建新分支或新worktree。每次新建Codex任务时必须确认其工作目录是该重构worktree，而不是原工作区。

## 3. 每个 Codex 任务的固定读取顺序

1. 本文件。
2. `00-program-charter.md`。
3. `01-target-architecture.md`。
4. `02-codex-execution-protocol.md`。
5. `13-progress-ledger.md`。
6. 当前阶段文档。
7. 当前阶段文档明确列出的代码、测试、审查和优化资料。

不要重新进行无重点的全仓扫描。发现上下文不足时，先读取当前阶段引用的module报告和文件；不要靠聊天历史猜测。

## 4. 启动某阶段的建议提示词

```text
请严格执行 docs/refactor/README.md 所定义的架构重构工程，并只执行
docs/refactor/XX-phase-YY-....md 这一阶段。

先按文档规定读取总纲、目标架构、执行协议、进度账本和本阶段输入，核验前一阶段完成证据与当前Git基线。不要执行后续阶段，不要恢复或覆盖用户无关改动，不要连接真实外部投稿/扣费系统。

完成本阶段全部代码、测试、迁移/回滚验证、文档和交接记录；未满足完成条件时不要把阶段标记为COMPLETE。不要自行提交，除非我在本任务中明确要求提交。
```

把 `XX-phase-YY-....md` 替换为当前阶段文件名即可。

## 5. 状态与追踪

- `12-traceability-matrix.md`：`F-*`、`OPT-*`、重构阶段和最终验证的对应关系。
- `13-progress-ledger.md`：阶段状态、实际commit、测试证据、偏差和下一任务入口。
- 每个阶段完成时创建 `docs/refactor/handoffs/phase-XX.md`，格式见 `14-handoff-template.md`。

规划文档描述目标，不是实施完成证据。只有代码、测试、迁移/回滚演练和阶段交接记录同时完成，阶段才能关闭。

## 6. 当前入口

当前应从阶段0开始。活跃worktree是`F:\官媒投稿-refactor`，分支是`codex/refactor-program`，规划基线是`dc5265359ca10a866ccd10e56a84314214b7897f`；其父commit及原审查代码基线是`master@e8d817847bab3a9e6020006cab35340f645e527f`。阶段0任务必须在此worktree重新核验HEAD与状态，不得回到原工作区执行。
