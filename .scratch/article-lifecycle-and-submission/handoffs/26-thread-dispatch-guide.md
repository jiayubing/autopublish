# Ticket 26 分线程执行指南

推荐使用一个 Goal 模式主任务串行调度。完整可复制 Prompt 位于 `handoffs/26-goal-mode-master-prompt.md`。

## 调度形态

- 主任务：只持有 Goal、integration branch、Wave Plan、任务创建/等待、commit 集成和最终 closure。
- 工作包任务：26-A 到 26-I 各创建一个新的 Codex project worktree 任务。
- 同一时刻只运行一个工作包；上一包未集成并验证，不创建下一包。
- 同一工作包出现测试失败或 finding 时，follow-up 原任务，不创建 replacement task。
- 每个 worker 完成 implementation、定向测试、Primary Audit、blocking remediation、bounded re-audit、commit 和 handoff 后停止。
- 主任务核对并集成 commit，再更新 Wave Plan。

## 上下文最小化

主任务只读取调度文档，不预读全部源码或完整历史。每个 worker 只读取自己的独立合同：

1. `.scratch/article-lifecycle-and-submission/issues/26-A-article-library-projection-and-permissions.md`
2. `.scratch/article-lifecycle-and-submission/issues/26-B-generation-creates-articles-only.md`
3. `.scratch/article-lifecycle-and-submission/issues/26-C-unified-submission-intake-and-paid-staging-retirement.md`
4. `.scratch/article-lifecycle-and-submission/issues/26-D-submission-center-regular-queue.md`
5. `.scratch/article-lifecycle-and-submission/issues/26-E-confirmed-paid-batch-workbench.md`
6. `.scratch/article-lifecycle-and-submission/issues/26-F-typed-attention-center.md`
7. `.scratch/article-lifecycle-and-submission/issues/26-G-separate-removal-from-queue-mutation.md`
8. `.scratch/article-lifecycle-and-submission/issues/26-H-renderer-information-architecture.md`
9. `.scratch/article-lifecycle-and-submission/issues/26-I-integration-audit-and-closure.md`

每份合同已经列出：相关 CONTEXT 词汇、SPEC 章节、直接 owner、直接消费者、直接测试、验收条件、最低验证、停止条件和交接要求。除 26-I 外，不完整读取 SPEC/Audit Protocol；不读取 archive 或无关历史 handoff。

## Git 与权限

- 新工作包 worktree 必须从主任务“当前 integration branch”创建，不能从项目默认分支或旧 HEAD 开始。
- Worker 被授权 commit，但不 push。
- 主任务被授权串行集成 commit 和提交 Wave Plan 更新，但不 push/release。
- 真实登录、发布、付费、取消和生产数据迁移始终需要另行明确授权。
- 禁止为了集成旧实现增加 compatibility wrapper、alias、双 writer 或第二状态机；新规格否定的旧路径应完整删除。

## 每包进入下一步的 gate

- 独立合同 acceptance 全部满足；
- 定向测试与适用 typecheck/build PASS；
- Primary Audit blocking findings 关闭；
- bounded re-audit PASS；
- handoff 和 commit chain 完整；
- commit 已进入 integration branch；
- integration branch clean，且上一包 commit 是当前 HEAD 祖先；
- Wave Plan 已更新。

任一条件缺失时，主任务继续处理当前包，不创建下一包。
