# 当前工作索引

本文是导航，不是第二套状态机。每个计划的详细状态、gate、验收和剩余工作仍由该计划自己拥有；本索引只决定 Agent 应该先打开哪个入口。

## 当前执行入口

- [规模审计修复](../.scratch/scale-audit/REMEDIATION.md)：SA-01 / SA-02 / SA-04 及付费页面分页/摘要读取完成；普通队列、全局执行/启动与其余失效优化待后续批次。

关联功能合同：[客户生成任务化与并发](../.scratch/client-generation-tasks/CLIENT-GENERATION-TASKS-PLAN.md)，只在涉及其行为时读取。

已完成计划和 handoff 通过[历史资料归档索引](../.scratch/ARCHIVE-INDEX.md)定位。

## 等待用户明确外部授权

这些条目不能自动执行真实登录、发布、图片上传、付费、取消订单、订单核对或生产迁移：

- 文章生命周期 Wave Plan 中 Ticket 25 / Wave 11 的真实外部验收：[Wave Plan](../.scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md)。
- Ticket 26 的真实登录、发布、付费、取消、订单核对和生产迁移：[Wave Plan](../.scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md)。
- Ticket 19 的独立 HTTP multipart 带图验收：[Ticket 19 合同](../.scratch/article-lifecycle-and-submission/issues/19-lieju-image-publication-adapter.md)。

## 最近已完成的本地计划

- [规模化架构与性能审计：第一轮](../.scratch/scale-audit/AUDIT.md)：初始7项发现；后续修复状态以当前修复计划为准。

- [文章列表载荷与并发构建优化](../.scratch/read-model-audit/SNAPSHOT-PLAN.md)：完成；同版本请求合并，已发布快照载荷约减半。

- [文章库产品简化](../.scratch/read-model-audit/SIMPLIFICATION-PLAN.md)：2026-09-12 完成；移除文章搜索和已发布正文查看，保留发布详情及内部证据校验。

- [读模型后续性能优化](../.scratch/read-model-audit/FOLLOWUP-PLAN.md)：2026-09-12 完成；[测量与最终验证](../.scratch/read-model-audit/FOLLOWUP-RESULTS.md)。

- [读模型与数据访问修复](../.scratch/read-model-audit/PLAN.md)：2026-09-12 完成；[修复与最终证据](../.scratch/read-model-audit/REMEDIATION.md)。

- [代码库治理](../.scratch/codebase-governance/PLAN.md)：2026-09-10 完成；[项目审查修复与最终证据](../.scratch/codebase-governance/REMEDIATION-2026-09-10.md)。

已完成计划、handoff 和过程证据统一见[历史资料归档索引](../.scratch/ARCHIVE-INDEX.md)，不再在此逐条展开。

## 维护规则

- 同一主任务最多登记一个持续实施入口；不同任务或并行调查只有在当前执行协议明确允许且 owner/文件范围不重叠时才可进行。
- 计划完成后保留计划和 handoff，但从“当前执行入口”移到“最近已完成”或 archive。
- 不在这里复制产品规则、状态矩阵、测试日志、threadId、commit 链或完整 handoff。
- 如果当前任务没有对应入口，先判断它是小任务还是复杂任务；不要因为目录里存在历史计划就自动读取它们。
