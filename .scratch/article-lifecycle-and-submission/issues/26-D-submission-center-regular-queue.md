# 26-D — 投稿中心只读模型与普通队列操作

## 目标

把普通平台队列的查看、开始、暂停和移出未开始项集中到投稿中心。文章库只负责发起投稿和导航，不再承担队列执行编排。

## 最小必读

1. 根 `AGENTS.md`。
2. `CONTEXT.md` 中：普通平台、平台账号档案、普通平台队列项、普通平台队列组、投稿中心、结果不确定。
3. SPEC：§3.3、§5、§7 中普通平台项、§9.4、§9.7–9.8、§11 第 6/8–9/13–15 项。
4. Wave Plan 当前动作、umbrella、26-C handoff、本合同；`EXECUTION-PROTOCOL.md` §§2–6、§8；`AUDIT-PROTOCOL.md` §§1–6、§10。
5. 直接 owner：`regular-queue-application.js`、`regular-queue-group-orchestrator.js`、regular queue transition ports、platform read model。
6. 现有 UI：`PlatformWorkbench.tsx`、`RegularQueueGroupsPanel.tsx`、platform feature/context、文章库中的 remove-pending 路径。
7. 既有 dirty 修复及测试：commit `6fc897f`、`regular-platform-outcomes.test.js`、phase-07 regular queue tests、platform queue renderer tests。

不要读取付费订单实现、供应商媒体 adapter、生成模块或历史 Wave handoff。

## 实施边界

- 投稿中心 query 一次组合组状态、当前文章、剩余顺序、文章安全摘要和动作；只读不写。
- start/pause/remove 继续调用 regular queue 唯一 owner。
- 保留 outcome 后数据失效、不同平台并行、同平台会话锁、FIFO 和重启暂停。
- 从文章库移除队列执行、批量撤销和待执行项移除编排；只保留“查看投稿中心”。
- 不重写平台 adapter 或普通结果状态机。

## 验收条件

- 投稿中心能显示平台、账号、状态、暂停原因、当前文章和剩余顺序。
- 单组/全部开始与暂停遵守现有人工暂停和平台独立规则。
- 只有远端未开始的 queued item 可移出；移出原子结束目标并恢复文章，不回收文章。
- claimed/prepared/remote-started/uncertain/published 均不可移出。
- outcome 提交后文章库和投稿中心都从统一 revision 刷新。
- 文章库不再包含 start/pause/remove-pending/cancel-batch 等执行控制。
- 队列 UI 不显示裸 articleId 作为唯一用户信息；使用安全标题/客户摘要，缺失时明确 fallback。

## 最低验证

- regular queue application/orchestrator/outcome tests。
- platform read model/feature/renderer tests。
- article management regression，证明执行动作已移除但导航可达。
- Renderer typecheck/build、响应式测试。
- `git diff --check`。

## 停止条件

- 当前平台会话 owner 无法保证目标账号一致，继续会跨账号发布；
- 需要改变普通平台 accepted/uncertain 产品语义；
- 上游 26-C 未提供稳定文章/目标 identity 或 revision。

普通 UI 搬迁、旧按钮测试失败和 read-model 调整不构成停止理由。

## 完成交接

记录命令归属 before/after、read model shape、移出状态矩阵、保留的 `6fc897f` 不变量和实际测试。完成后停止，不进入 26-E。
