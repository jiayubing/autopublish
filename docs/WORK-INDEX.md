# 当前工作索引

本文是导航，不是第二套状态机。每个计划的详细状态、gate、验收和剩余工作仍由该计划自己拥有；本索引只决定 Agent 应该先打开哪个入口。

## 当前执行入口

- [客户分组与选择](../.scratch/client-groups/CLIENT-GROUPS-PLAN.md)：本轮功能入口；单层分组、搜索与批次客户选择，提交 PR 后等待人工合并。

本轮基线包含 PR #36（R5 集成收口）的 master 合并；原验证记录见 [可靠性与批量能力改进计划](../.scratch/reliability-batch-follow-up/RELIABILITY-BATCH-FOLLOW-UP-PLAN.md)，不作为本轮实施入口。

前序参考：[文章生成与发布链路优化计划](../.scratch/generation-publication-optimization/GENERATION-PUBLICATION-OPTIMIZATION-PLAN.md)，不作为本线程实施入口。

## 等待用户明确外部授权

这些条目不能自动执行真实登录、发布、图片上传、付费、取消订单、订单核对或生产迁移：

- 文章生命周期 Wave Plan 中 Ticket 25 / Wave 11 的真实外部验收：[Wave Plan](../.scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md)。
- Ticket 26 的真实登录、发布、付费、取消、订单核对和生产迁移：[Wave Plan](../.scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md)。
- Ticket 19 的独立 HTTP multipart 带图验收：[Ticket 19 合同](../.scratch/article-lifecycle-and-submission/issues/19-lieju-image-publication-adapter.md)。

## 最近已完成的本地计划

以下计划保留为历史 evidence，不是默认执行入口：

- [非阻塞技术债后续处理计划](../.scratch/complexity-follow-up/NONBLOCKING-CLEANUP-PLAN.md)：COMPLETE；格式清理、测试命名、IPC 分析器和包体积调查结论及验证见计划 §7。

- [复杂度收敛与测试瘦身计划](../.scratch/complexity-reduction/COMPLEXITY-REDUCTION-PLAN.md)：COMPLETE；测试入口、代码职责收敛及干净提交构建验收已完成，保留决策与证据见计划最终记录。

- [GEO 批量发文：文章生成与列举网投稿修复计划](../.scratch/article-generation-and-lieju-remediation/ARTICLE-GENERATION-AND-LIEJU-REMEDIATION-PLAN.md) — `COMPLETE`；P0–P5、HTTP-only 列举网投稿决策、最终门禁和 bounded closure evidence 见计划 §10。
- [Ticket 27：投稿结果闭环整改](../.scratch/article-lifecycle-and-submission/issues/27-publication-attention-result-closure-remediation.md) — `COMPLETE`；Combined Audit、remediation、final clean-HEAD gate 与最终边界见 [27-D handoff](../.scratch/article-lifecycle-and-submission/handoffs/27-D-result-closure-integration.md)。
- [内容生产链路整改与优化计划](../.scratch/content-production/CONTENT-PRODUCTION-REMEDIATION-PLAN.md) — `COMPLETE`；Phase 0–6 已完成，最终集成验证与 bounded re-audit evidence 见计划 §16。
- [平台账号档案 P1 收敛](../.scratch/platform-account-profile-p1/PLATFORM-ACCOUNT-PROFILE-P1-PLAN.md)
- [Renderer 冷启动导航修复](../.scratch/archive/renderer-cold-start-navigation-fix/RENDERER-COLD-START-NAVIGATION-FIX-PLAN.md)
- [Renderer UI 解耦与扩展性](../.scratch/archive/ui-decoupling-and-extensibility/UI-DECOUPLING-AND-EXTENSIBILITY-PLAN.md)
- [投稿架构收尾](../.scratch/article-lifecycle-and-submission/archive/POST-WAVE-SUBMISSION-ARCHITECTURE-CLOSEOUT-PLAN.md)
- [平台扩展性与图片边界](../.scratch/article-lifecycle-and-submission/archive/POST-WAVE-PLATFORM-EXTENSIBILITY-AND-IMAGE-BOUNDARY-PLAN.md)

## 维护规则

- 同一主任务最多登记一个持续实施入口；不同任务或并行调查只有在当前执行协议明确允许且 owner/文件范围不重叠时才可进行。
- 计划完成后保留计划和 handoff，但从“当前执行入口”移到“最近已完成”或 archive。
- 不在这里复制产品规则、状态矩阵、测试日志、threadId、commit 链或完整 handoff。
- 如果当前任务没有对应入口，先判断它是小任务还是复杂任务；不要因为目录里存在历史计划就自动读取它们。
