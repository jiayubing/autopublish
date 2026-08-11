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

## 25-F package closure 与主任务集成

- 25-F 用户可见执行任务：`019ff2ae-edfb-74b2-92ed-059838d309be`；模型为 `gpt-5.6-luna`，推理强度为 `max`。任务返回 idle，未创建/预建 25-G。
- 25-F implementation/contract/test：`a91346499458c08fbb403ac64ed901fed94053b4`；matrix/evidence：`944dfcae2a180d0e62f481f6ec1607e4e00f7432`；package handoff：`72ba6e136977f089405e9a1993747e368e0f8615`。
- 主任务已从 `de72d734c47baca3129ddf43ee182eaa49a866f1` fast-forward 集成上述提交到 `72ba6e136977f089405e9a1993747e368e0f8615`；当前主工作树 clean，未 push。
- 主任务在 `72ba6e1` 重新运行并通过：`npm run benchmark:ticket-25-f -- --output build/evidence/ticket-25-f-benchmark.json`（三项 query/scan hard budget PASS，wall-clock observation-only）、`npm run test:ticket-25-a -- --output build/evidence/ticket-25-a-contract.json`（85 stories/95 rows/21 cases/17 tracked artifacts/4 responsibility facts）、25-A/F direct tests `7/7 PASS`、architecture/dependency `15/15 PASS`、capacity `13/13 PASS`、discovery `255`、lint、format、diff check。
- 主任务复核确认 F 只修改 acceptance/evidence runner/contract/test/handoff，不修改文章、队列、订单、迁移 schema、IPC/bridge、Renderer 业务状态 owner；所有生成 evidence 为 synthetic/in-memory/fake transport，敏感字段排除。

## 当前调度状态

25-F 已完成 package closure 并进入新的 clean integration HEAD；下一包为 `25-G`，尚未创建。主任务只有在本状态核验完成后才创建唯一的 25-G `luna/max` 用户可见执行任务；25-G 完成后按本 handoff 顶部合同在 package closure、Independent Audit Handoff、集成和状态更新后停止。
