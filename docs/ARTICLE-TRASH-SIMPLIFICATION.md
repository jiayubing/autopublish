# 文章删除事务简化

## 范围与基线

本任务基于 `37412cf3`，继承文章 JSON 唯一真源及 lifecycle projection 权限收敛。
分支 `codex/simplify-article-trash`。不修改 Renderer 页面、投稿、订单及生成语义。

## 调查与决定

旧调用链：trash service → removal service → claim/store → mutation session
→ transition port 回调 → cursor/state → ArticleStore → 文件日志。
旧 removal service 1,378 行；阶段、重试、租约与文件恢复重复。
未发现 Electron 单实例锁；文章文件锁仍是跨进程写入边界，不能删除。

保留短期预览确认及锁内 lifecycle 复核。保留一份批量意图，让已确认批次在
进程退出后仍能完成剩余文章。意图不记录 cursor/phase/activeOperation；
文件日志独占单篇文章 rollback/reconcile；批次只检查 JSON、墓碑操作身份及内容指纹。
所有意图写入、完成移除都在既有文章锁内进行。移除后释放锁，避免旧意图重放已恢复文章。
transition-port 回调与旧的单篇 fallback 路径一起移除；
唯一执行 writer 是 internal/article-mutation-removal，service 只负责确认、结果与查询。

持久意图只有 needs_repair（未完成）；committed 是返回值与本进程有限缓存，
不持久化。启动仅尝试恢复一次，失败保留意图供显式重试；没有后台 timer、
backoff、重试计数、lease、revision CAS、duplicate canonicalization 或队列迁移。

旧 removal-*.json 保留原文件，不执行、不迁移、不推断远端结果。
新意图使用 trash-*.json；旧中断文件由 ArticleStore 的原有日志恢复。
旧批次未开始的文章保持正文位置，需用户重新确认；不恢复历史队列操作。

## 验证矩阵与进度

- [x] 读取入口、确认前两阶段基线与真实调用链
- [x] 最小事务实现及启动 wiring
- [x] 正常/批量/重复请求、生命周期阻塞
- [x] 文件操作前失败、部分效果、子进程中断及重启
- [x] 跨实例竞争、恢复、永久删除、内容变化
- [x] 定向回归、integration、lint/typecheck
- [x] Primary review → 必要修复 → bounded re-review
- [x] 提交后最终验证与证据

最终命令、结果、发现及剩余风险在完成时写回本文件。

## 审计闭环

范围：删除 service、批量意图存储、mutation 删除用例、composition 启动、
直接 IPC/事件消费者及相关回归；不重审前两阶段 owner。

已检查不变量：权限始终从 projection 派生；整批锁定后才写意图；单篇恢复
仅归 ArticleStore；墓碑操作身份和内容指纹防止误认其他请求；完成记录移除
先于解锁；并发进程不能推进重叠批次；旧队列记录零执行。

实施/主审发现并关闭：

- P2 INTRODUCED_BY_CHANGE：canonical lock 顺序与请求顺序不一致时，
  预览指纹必须按文章身份映射，不能按数组位置拼接。逆序批量回归通过。
- P2 INTRODUCED_BY_CHANGE：回收站文章恢复后，旧的重复 trash 预览不能
  把它再次移动。检查墓碑操作身份与本次请求身份，直接回归通过。
- P2 PROCESS_EVIDENCE_GAP：rollback 故障注入起初未命中实际 article-trash
  路径；增加命中断言并修正注入，实际 rollback failure 后恢复通过。

Bounded re-review 仅检查上述修复、锁内执行、直接调用方和故障矩阵：PASS；
无未关闭 blocking finding。未启动第二轮无边界审计。

## 规模

选定源码口径：removal service/store/plan/cursor/state/scheduler、trash service、
internal article-mutation-removal。合计 2,599 → 1,123 行（约 -57%），
8 → 5 个文件。service 单独 1,378 → 256 行。
持久意图只含 version/id/createdAt/status/selections/articles；
每篇仅记录 contentFingerprint/operationId，没有正文副本或进度字段。

## 已运行验证

- 定向 owner/调用链：45/45 通过。
- 新故障与真实 workspace 启动回归：25/25 通过。
- npm test：59 文件、585 测试通过（新增最后两项测试前的一轮）。
- npm run test:integration：223 文件、1,166 测试通过（提交前一轮）。
- npm run lint、npm run typecheck:main、git diff --check：通过。

未运行 release/打包及真实发布、付费、生产迁移：不在本次本地删除链路范围。
崩溃验证覆盖进程异常退出，不声称验证了断电/磁盘硬件损坏。
旧 removal-*.json 不删除且不自动继续；如需处理历史批次，应按当前文件事实重新预览。
用户原有 pelican-bicycle.html 删除和 work/ 未跟踪内容始终保留，不提交。

## 最终提交后验证：COMPLETE

实现提交：`5a6d6b33576c9a0727ba4b1216125bef1d642852`。
环境：Windows / Node `v24.16.0`，命令工作目录 `auto—publish/`。
本节是之后的纯文档 evidence 提交，不修改生产源码、测试或 gate。
验证时本任务源码/测试与上述提交一致；仓库不是全局 clean，
只有用户原有的根目录删除与未跟踪 work/，没有把它们伪称为 clean 或加入提交。

| 实际命令 | 最终结果 |
| --- | --- |
| `npm test` | PASS，59 文件，587/587，0 skipped/todo，43.346 秒 |
| `npm run test:integration` | PASS，223 文件，1,166/1,166，0 skipped/todo，220.769 秒 |
| `npm run lint` | PASS |
| `npm run typecheck:main` | PASS |
| `git diff --check` | PASS |

新增最终定向命令（实现提交前）：
`node --test tests/article-removal-service.test.js tests/workspace-runtime-lifecycle.test.js`
为 25/25 PASS；全部已被提交后的 core 组覆盖。
较早定向检查另覆盖 `phase-08-content-lifecycle.test.js` 的文件恢复、
restore/purge 中断及目录 junction 边界；这些也被最终 integration 组覆盖。

原生测试输出保留于未提交生成物
`auto—publish/build/test-results/core-timings.json` 与
`auto—publish/build/test-results/integration-timings.json`；
二者均报告 CLOSED / allFilesReported / noSkippedTodo。

实际最终调用链：
`trash service / removal service（确认与查询） → article-mutation-removal
（既有文章锁、lifecycle projection 复核、单份批量意图）
→ ArticleStore（JSON/墓碑及文件恢复日志）`。

本阶段结束；未 push、未创建 PR、未 merge。不继续其他架构优化。
