# M04 — Final Contract Consolidation

**Purpose:** 在 Ticket 24 删除 legacy surface 后，按最终业务领域重新收缩大型 IPC/contract owner，避免一个文件同时拥有多个独立领域合同；不恢复任何已删除兼容能力。

**Status:** `PENDING`；实时可调度性只由波次执行计划与 Git 预检决定

**Scheduling gate:** 波次 10 `COMPLETE` 后调度；维护 10.5 第一项。M04 完成、审计/合并和定向复验后才允许 M05。

## Candidate scope

- `desktop/ipc/contracts/submission-contracts.js`；
- `desktop/ipc/contracts/content-core-contracts.js`；
- 与它们直接耦合的 preload/bridge/types registry，仅限完成真实领域边界迁移所必需。

## What to change

1. 以 Ticket 24 后仍存在的公开 capability 为输入，按稳定领域 owner/变化原因划分合同；不按文件长度机械切割。
2. validator/DTO/schema/enum 仍只有一个 owner；bridge/preload 只映射，不复制验证逻辑。
3. 删除因历史兼容遗留的重复 helper、mapper、alias；不得重新导出“备用”接口。
4. 保持 channel registry、输入输出封闭校验、安全错误与 Renderer typed bridge 兼容。

## Acceptance criteria

- [ ] legacy IPC/bridge surface 仍保持 absence；M04 不重新引入 Ticket 24 删除的任何能力。
- [ ] 每个新 contract module 有单一领域职责和明确消费者，不存在纯转发拆分。
- [ ] DTO/validator 不复制，extra-field/版本/null/union 等封闭合同继续由唯一 owner 验证。
- [ ] IPC registry、preload、bridge、Renderer typecheck 和关键业务 contract test 通过。
- [ ] 公开 capability before/after 清单显示业务语义不变，调用方只因模块路径/导出组织做必要调整。
