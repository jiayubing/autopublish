# Article Lifecycle Execution Protocol

> 本文件只回答 **HOW TO BUILD / HOW TO ADVANCE**。业务语义看 SPEC，当前顺序和状态看 Wave Plan，审计方法看 Audit Protocol，单项范围看对应 issue/maintenance 合同。

## 1. 两种执行模式

### 1.1 Manual Dispatch

适用：用户只说“执行 Ticket X / 执行维护 Mxx / 执行波次 X”，但没有明确授权持续跑完整阶段。

允许：

- 调度预检；
- 创建当前 gate 允许的分支/worktree/执行线程；
- 当前执行项的实现与定向测试；
- 留下 handoff。

除非用户在当前请求明确授权，否则不自动：审计、finding 修复、commit、merge、删除 worktree、push、进入下一串行执行组、跑最终整套门禁。

### 1.2 Continuous Wave Goal

适用：用户明确要求“持续执行到 Wave X COMPLETE / Maintenance X COMPLETE”，或明确授权 Goal Mode 完整推进。

在授权范围内可以自动按以下固定链路串行推进：

`实施 → 定向测试 → Primary Audit → 修复阻塞 finding → Bounded Re-audit → commit/merge → 下一执行组 → Wave Integration Audit → 修复 → Bounded Closure Re-audit → final clean HEAD gate → COMPLETE`

规则：

- 每个 Ticket/Maintenance 仍必须保留独立合同、审计结果、commit/handoff/provenance；不得合成一个不可追踪的大提交。
- 串行 gate 不得跳过；前一项未 `COMPLETE` 不得改后一项业务范围。
- 仅在用户当前 Goal 明确授权 commit/merge 时自动执行这些 Git 变更；否则到相应 gate 停止。
- Goal 只到用户指定阶段；例如“完成 Wave 7”不得自动进入 Wave 8。

## 2. 调度预检

每个新执行项开始前只做与当前任务成比例的预检：

1. 确认仓库根、当前分支、integration HEAD、`git status --short`、暂存区和嵌套仓库。
2. 读取当前 Wave Plan、对应 issue/maintenance 合同、直接依赖的最终公开合同和相关 handoff。
3. 验证 `Blocked by` / `Scheduling gate`、依赖提交祖先关系和上一串行项状态。
4. 检查重复 branch/worktree/thread，避免同一 owner 被并行修改。
5. 确认最大回归风险、定向测试和停止条件。

不得为了启动新项重审所有已 `COMPLETE` 历史 Wave，也不得重跑历史完整门禁，除非发现依赖合同后来变化或现有测试已经证明回归。

## 3. 实施前最小阅读集合

执行线程至少读取：

- 根 `AGENTS.md`；
- `CONTEXT.md` 中相关词汇；
- SPEC 中相关行为；
- 当前 issue/maintenance 合同；
- 直接 owner、调用方、消费者；
- 相关行为测试与 CI/script gate。

只在需要时读取历史 handoff。`archive/` 默认不读。

## 4. 实施边界

- 先修改唯一 owner，再接 service/IPC/bridge/UI。
- 不为方便测试建立 test-only 生产 seam。
- 不通过 compatibility shim 或第二 owner 回避现有架构问题。
- 不提前实现后续 Ticket/Maintenance。
- 发现 `EXPOSED_PREEXISTING` 非阻塞债务时登记未来 owner，不自动扩 scope。

## 5. 测试阶梯

执行项内部按风险逐级扩展：

1. 单 owner / contract / projection 行为测试；
2. 直接调用链 integration test；
3. transaction / failure / concurrency / idempotency / restart 测试（适用时）；
4. typecheck/lint/build/专项 gate（适用时）；
5. 只有阶段合同要求时才跑完整 `npm test`。

每次修复只先重跑受影响定向测试。最终 Wave/Maintenance gate 必须在**所有修复合并后的最终 clean integration HEAD** 上运行要求的完整测试，旧 HEAD 结果不能替代。

## 6. Commit / Merge / Provenance

每个已完成执行项记录：

- base integration commit；
- branch/worktree/thread（若使用）；
- implementation commit；
- audit result 与 finding resolution；
- merge/integration commit；
- 定向测试命令与结果；
- 必要的环境信息。

历史明细写入 `handoffs/`，Wave Plan 只保留当前阶段需要的状态和链接/文件名，不复制完整 threadId、命令日志和旧 finding 清单。

## 7. 阶段推进规则

状态只使用：

- `PENDING`：尚未到达；
- `READY`：前序 gate 完成，可开始最左执行组；
- `RUNNING`：当前阶段正在实施/审计/closure；
- `PARTIAL`：前序串行组完成，后续组尚未完成；
- `BLOCKED`：存在无法自行消解的依赖/环境/产品决策问题；
- `COMPLETE`：阶段所有执行组、审计、最终 integration gate 和 evidence 全部完成。

任何生产源码/测试/gate 在“最终完整测试”之后再次变化，原 final gate evidence 立即失效，必须在新的 final clean HEAD 重跑。

## 8. Continuous Goal 的允许停止条件

Goal Mode 只在以下情况停下询问：

- 权威 SPEC 与 Ticket/Maintenance 存在实质冲突；
- 需要新的产品决策；
- 需要未经授权的真实凭据、生产环境、付费或发布；
- 继续会破坏已确认业务语义且无法在当前 scope 安全解决；
- 工具/环境硬阻塞且无法自行恢复。

普通测试失败、审计 finding、局部重构选择、P0/P1 修复和 bounded re-audit 不属于需要询问的 blocker。
