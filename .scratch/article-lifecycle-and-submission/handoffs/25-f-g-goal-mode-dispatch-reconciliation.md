# Ticket 25 F→G Goal Mode Dispatch Reconciliation

**记录时间：** 2026-08-12（Asia/Shanghai）

**主任务 Goal：** `019ff2a1-a72f-7930-a3cb-86bc98e58747`

## 启动前事实

- 当前仓库：`F:\官媒投稿-refactor`，分支 `codex/article-lifecycle-submission`。
- 本轮调度前真实 clean integration HEAD：`64e0762600d0f3149287d13d0bf3b9ecd0d94ab5`。
- `git status --porcelain=v2 --branch`、暂存区/未暂存 diff、worktree、submodule 和 nested repository 已核对；当前主工作树 clean，未发现正在执行的 25-F/25-G 任务或对应 worktree。
- `25-0`、`25-A`、`25-B`、`25-C`、`25-D`、`25-E` 的 closure handoff、实际测试结果、sourceState/commit provenance 和主任务集成记录已读取并与当前 Git 历史核对。A～E 已完成 package closure；Ticket 25/Wave 11 仍为 `PARTIAL`。
- Ticket 25 scheduling gate 满足：Ticket 24 与 Maintenance 10.5（M04→M05→M06）已完成；Ticket 18–21 不是前置依赖。

## 本轮 Goal 调度合同

1. 严格串行执行 `25-F → 25-G`。主任务为每个工作包分别通过 `create_thread` 创建一个新的用户可见任务，指定模型 `luna`（实际模型标识 `gpt-5.6-luna`）和最大推理强度 `max`；不使用 `spawn_agent`，不创建额外执行任务。
2. 25-F 只能从上述 clean integration HEAD 开始。主任务等待 25-F 返回 implementation、定向测试、package evidence/handoff 和 commit，再核验祖先关系、clean 状态、直接回归与 sourceState，按用户授权集成到新的 clean HEAD。
3. 只有 25-F package closure 已核验并进入新的 clean integration HEAD 后，主任务才能创建 25-G；不得预建、并行或让 25-G 基于旧 HEAD 分析/实现。
4. 25-G 只执行其合同的 execution gates、package closure 和 Independent Audit Handoff 材料汇总；不执行后置独立审计，也不由执行任务给 Ticket 25/Wave 11 自我 PASS。
5. 本轮停止点是 25-G package closure、Independent Audit Handoff、主任务集成和 Wave Plan/状态更新。停止后不得进入 Independent Combined Audit、finding remediation、bounded re-audit、final clean smoke、真实登录/发布/付费/订单刷新或 Wave 11 `COMPLETE`。
6. 用户已明确授权范围内必要的 commit/merge；禁止 `git push`。所有自动化测试只使用合成数据、隔离副本和 fake transport。

## 当前状态

本 handoff 创建时尚未创建 25-F 执行任务；下一动作是主任务按本合同重做 25-F 调度预检并创建唯一的 25-F 用户可见 `luna/max` 任务。历史 `25-goal-mode-dispatch-reconciliation.md` 记录的是上一轮在 25-E 停止的 Goal，不覆盖本轮 F→G 授权。
