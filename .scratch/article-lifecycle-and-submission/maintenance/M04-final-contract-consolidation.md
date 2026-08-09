# M04 — Final Contract Consolidation

**Purpose:** 在 Ticket 24 删除 legacy surface 后，按最终业务领域重新收缩大型 IPC/contract owner，避免一个文件同时拥有多个独立领域合同；不恢复任何已删除兼容能力。

**Status:** `COMPLETE`；`M04-A → M04-B → M04-C` 已完成 combined audit、bounded re-audit、最终 clean-HEAD gate 与 closure evidence

**Scheduling gate:** 波次 10 `COMPLETE` 后调度；维护 10.5 第一项。M04 已完成；M05 的调度 gate 已满足，但本次用户截止点明确停止在 M04，不启动 M05/M06。

## Candidate scope

- `desktop/ipc/contracts/submission-contracts.js`；
- `desktop/ipc/contracts/content-core-contracts.js`；
- 与它们直接耦合的 preload/bridge/types registry，仅限完成真实领域边界迁移所必需。

## What to change

1. 以 Ticket 24 后仍存在的公开 capability 为输入，按稳定领域 owner/变化原因划分合同；不按文件长度机械切割。
2. validator/DTO/schema/enum 仍只有一个 owner；bridge/preload 只映射，不复制验证逻辑。
3. 删除因历史兼容遗留的重复 helper、mapper、alias；不得重新导出“备用”接口。
4. 保持 channel registry、输入输出封闭校验、安全错误与 Renderer typed bridge 兼容。

## Hard invariants

- M04 只允许改变 contract ownership、文件组织和 import/export 路径。不得改变 capability/channel/kind/schemaVersion、DTO 字段及封闭校验、projector 输出、错误 code/category/retryability/userMessage、业务状态转换或公开行为。
- 已被现有权威合同或真实消费者依赖的 registry 可观察行为不得改变；不得仅为保持未被依赖的数组顺序制造新合同。
- 不得新增 compatibility re-export、alias、重复 validator/DTO/error owner 或纯转发 contract module。
- 任何非纯组织变化均视为 blocking finding；只有现有权威合同证明该变化是恢复 M04 acceptance 所必需时，才能在对应 owner 的 bounded remediation 中处理并留下证据。

## Work packages

### M04-A — Submission contract consolidation

- 以 `desktop/ipc/contracts/submission-contracts.js` 为来源 owner；允许新增按真实领域边界拆出的 contract modules，并修改其直接 import/consumer、projector 与直接合同测试。
- 不把“只处理来源 owner”解释为只能修改一个文件；但禁止修改与 submission contract 迁移无直接关系的 content-core、Renderer feature 或业务服务。
- 开始时保存 submission capability before manifest；handoff 保存 before/after manifest，而不是只记录当前数量。
- 完成定向测试、Primary Audit、blocking remediation、bounded re-audit、commit 与 handoff 后，主任务验证新的 clean integration HEAD，才允许创建 M04-B 任务。
- **停止条件：**发现其他 owner 问题时只记录带 owner 的 finding，不在本包顺手清理；只有真源冲突或继续会制造竞争 owner/数据风险时返回主任务请求决策。

### M04-B — Content-core contract consolidation

- 以 `desktop/ipc/contracts/content-core-contracts.js` 为来源 owner；允许新增按真实领域边界拆出的 contract modules，并修改其直接 IPC/composition/registry consumer、projector 与直接合同测试。
- 基于 M04-A 完成后的 clean integration HEAD 开始，不重开或重排 submission owner。
- 开始时保存 content-core capability before manifest；handoff 保存 before/after manifest，而不是只记录当前数量。
- 完成定向测试、Primary Audit、blocking remediation、bounded re-audit、commit 与 handoff 后，主任务验证新的 clean integration HEAD，才允许创建 M04-C 任务。
- **停止条件：**发现其他 owner 问题时只记录带 owner 的 finding，不在本包顺手清理；只有真源冲突或继续会制造竞争 owner/数据风险时返回主任务请求决策。

### M04-C — Integration / closure audit

- 对 A+B 最终组合执行一次 combined audit：registry、preload、bridge、Renderer types、legacy absence、before/after capability manifest、直接依赖方向和要求的最终 gate。
- C 默认不是第三个 implementation writer；只允许修复 audit 已确认的 blocking finding，并执行 bounded closure re-audit。
- 若 finding 需要跨多个 owner 的结构性修改，退回对应 A/B owner 的最小闭合范围，不在 C 中扩大为新一轮实现。
- 在所有修复进入最终 clean integration HEAD 后运行 M04 要求的 final gate，记录 commit/sourceState、命令、环境和结果；通过后才将 M04 标记 `COMPLETE`，并停止而不进入 M05。

## Acceptance criteria

- [ ] legacy IPC/bridge surface 仍保持 absence；M04 不重新引入 Ticket 24 删除的任何能力。
- [ ] 每个新 contract module 有单一领域职责和明确消费者，不存在纯转发拆分。
- [ ] DTO/validator 不复制，extra-field/版本/null/union 等封闭合同继续由唯一 owner 验证。
- [ ] IPC registry、preload、bridge、Renderer typecheck 和关键业务 contract test 通过。
- [ ] 公开 capability before/after 清单显示业务语义不变，调用方只因模块路径/导出组织做必要调整。
