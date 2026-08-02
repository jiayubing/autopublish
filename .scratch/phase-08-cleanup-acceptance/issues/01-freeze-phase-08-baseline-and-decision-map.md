# 01 — 冻结 Phase 8 基线与清理决策图

**What to build:** 从真实 production 入口生成可复核的模块、writer、worker、IPC 与 Renderer 调用图，冻结 Phase 8 的代码/证据基线，并把每个旧路径、反向依赖、过长模块和重复测试分类为“删除、内部拆分、保留并说明、重开前序阶段”。后续 ticket 必须以这份决策图为边界，不能靠猜测扩大重构范围。

**Blocked by:** None — can start immediately

**Status:** COMPLETE

## 必读输入

- `docs/refactor/README.md`、`00-program-charter.md`、`01-target-architecture.md`、`02-codex-execution-protocol.md`。
- `docs/refactor/11-phase-08-cleanup-acceptance.md`、`12-traceability-matrix.md`、`13-progress-ledger.md`。
- `docs/refactor/handoffs/phase-03.md` 至 `phase-07.md`，重点读取旧路径、权威 owner、人工门和下一任务入口。
- `docs/review/05-final-findings.md`、`docs/optimization/03-verification-matrix.md`、`04-risk-and-decisions.md`。
- 当前 production main、composition root、worker dispatch、IPC registry、preload namespace、Renderer root 与 package/build 配置。

## 开始门禁

1. 记录分支、HEAD、完整工作区、staged 与 unstaged 状态；期望基线为 Phase 7 closeout commit `aff1dfd`。
2. 确认 Phase 7 为 `COMPLETE`；Phase 4 人工项及正式 release 继续为 `PENDING_HUMAN` / `BLOCKED_RELEASE`。
3. 运行 Phase 7 固定 required checks 的轻量基线与 test discovery；若结果和交接不一致，记录实际差异并停止后续清理。
4. 不读取真实 workspace、Auth 数据库、账号、Cookie、供应商或付费服务。

## 执行过程

1. 从真实入口向下追踪 composition、application、store、adapter、worker、IPC、preload、feature 和 View；测试 helper 或旧审查路径不能替代 production 可达性。
2. 建立唯一 owner 表，至少覆盖 publication、batch、order、attention、article lifecycle、generation、PlatformRun、Auth、diagnostics 与 release evidence。
3. 枚举 production writer、文件锁、可变 runtime、compatibility adapter、旧 DTO/message、重复 invalidation、共享 busy/native confirm 和原始诊断路径。
4. 对第一方 production 模块做规模与职责审计：可变逻辑以 200–300 行为目标；超过 400 行必须拆分或说明；超过 600 行除生成代码、第三方代码或经证明的纯声明表外不得直接放行。
5. 对每个候选项执行 deletion test：删除后复杂性若散回多个 caller，则保留深 module；若复杂性直接消失，则标记为 shallow wrapper/死路径删除候选。
6. 输出依赖边和 ticket 归属；若需要新增或扩大 Domain/Application 公共 interface，明确标记为“重开前序阶段”，不得分派给 Phase 8 局部实现。
7. 创建或更新 Phase 8 handoff 为 `IN_PROGRESS`，记录基线、决策图、人工门和首个可执行 frontier，但不将任何尚未执行的清理标记完成。

## 模块边界

- 本 ticket 只建立证据、边界与决策，不重写业务实现。
- 行数是维护性警报，不是深度定义；接口负担、隐藏知识、owner 唯一性和测试 locality 优先。
- 任何保留的长模块必须说明为何拆分会增加接口复杂度或破坏内聚性。

## 验收标准

- [ ] production 调用图可从入口追到所有权威 owner 和外部 adapter，并标明唯一 writer/lifecycle owner。
- [ ] 所有 Phase 8 清理清单项都有当前引用证据、处置、负责 ticket 和阻塞边。
- [ ] 第一方 production 长模块均已分类，无“以后再看”的未归属项。
- [ ] `src → desktop`、Domain/Application → implementation、Renderer → Node/infrastructure 等依赖违规有完整清单。
- [ ] 37 条 finding、29 个 OPT 及 Phase 4/7 人工门均能映射到后续验收 ticket。
- [ ] baseline evidence 明确 commit、测试数量、skip、环境限制和 dirty/clean 状态。
- [ ] 未新增产品能力、schema 或公共业务 interface。

## 验证与交接

- 运行 test discovery、架构测试、legacy absence、lint/typecheck 的现有命令；记录准确数量，不用定向检查替代全局基线。
- 运行 `git diff --check`，确认差异只包含本 ticket 的证据与 handoff。
- 在 Phase 8 handoff 写明完成项、未完成项、下一 frontier（02）和任何需要重开前序阶段的发现。
- 不自动提交；只有用户明确授权时才提交本 ticket 文件。

## 停止条件

- Phase 7 closeout commit 或 required check 基线无法复现且原因不明。
- 发现活跃旧 writer、数据冲突或恢复失败，需要先重开 Phase 2/3/5/7。
- 必须读取真实数据或执行真实外部动作才能判定引用/行为。
