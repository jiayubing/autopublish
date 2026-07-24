# M17 生成批次深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M17 将客户、来源和模板选择固化为生成批次与任务，限制 1–4 并发，调度 M15 生成文章，持久化任务状态/错误/文章身份，并提供暂停、继续、停止、失败重试、恢复和运行时快照。它不拥有 AI 网络协议、文章聚合或投稿队列。

十项维度已覆盖：输入上限、来源选择和快照准备、批次 schema/原子写、任务状态机、并发 worker、暂停/停止检查点、单活运行、恢复候选、重试选择、配置 fingerprint、通知 DTO、dispose 和下游 handoff 身份。未发现满足证据门槛的有效候选。

## 已检查目录与关键文件

- 全部生产文件：`src/content/generation-batch-store.js`、`generation-batch-runner.js`、`desktop/services/content-generation-batch-service.js`。
- 边界与接线：`desktop/ipc/content-generation-batch-ipc.js`、preload bridge、`desktop/workspace-runtime.js`、renderer 生成 drawer 的调用点。
- 直接上下游：M14 来源 stores、M15 AI/article generator、M18 article store、M21 generation→submission handoff。
- 契约与测试：`docs/content-generation-operations.md`、`docs/content-workspace-contract.md`；`generation-batch-{store,runner}.test.js`、`content-generation-batch-{service,ipc}.test.js` 和 handoff 集成测试。

## 关键调用链

1. preview/create → 校验客户、模板、材料、研究与并发数 → 保存 batch/tasks/source selection。
2. run/resume/retry → 单活 reservation → runner 领取任务 → M15 generate → M18 save article → task 写入 `articleId`、终态与错误。
3. pause/stop → service 设置命令状态 → runner 在任务边界停止领取；已在执行的请求完成后写终态。
4. 应用重启 → batch store 列出可恢复批次 → runtime snapshot → 用户显式恢复；成功任务不会重复生成。
5. succeeded task + generation identity → M21 preview/commit 投稿交接。

## 候选发现

本模块没有满足本阶段证据标准的有效候选。特别复核了单活竞态、失败重试是否重复成功项、暂停/停止是否错误承诺中断正在执行的外部请求、损坏批次是否隐藏其他批次及任务恢复幂等；现有实现和测试与契约一致。

## 测试情况

- M14–M21 联合定向测试：313 个测试，308 通过、0 失败、5 跳过，退出码 0。
- 定向测试覆盖 1–4 并发、第二个 active run 拒绝、延迟任务状态、暂停/继续/停止、失败重试、损坏批次、恢复候选和 IPC 安全边界。
- 现有测试使用受控 generator，未模拟真实 provider 在进程强杀瞬间的网络/文件交错。

## 未覆盖区域与待验证

- `runtimeSnapshot()` 在没有 active/resumable batch 时回退到 `batches[batches.length - 1]`，而 store 当前按新到旧返回；这可能展示最老终态批次，但契约未明确空闲快照必须携带“最近批次”，且历史列表另有接口，因此只记录为待产品语义确认，不建立 finding。
- 未进行 500 项、4 并发、长文本的持续容量与强杀测试。
- 批次文件采用单进程写模型；本轮未发现另一个生产进程写 generation batch 的路径，若未来引入 worker 写入需重新审查跨进程同步。

## 模块审查结论

M17 达到深审完成门槛，0 条有效候选发现。批次状态、单活调度、恢复和重试已有直接测试；空闲 runtime snapshot 的终态批次选择存在产品语义疑问，但证据不足，保持待验证而不计入发现。
