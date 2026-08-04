# 03 — 深化 OperationalStore 内部结构

**What to build:** OperationalStore 继续以一个稳定业务意图接口拥有 publication、batch、order、migration、backup 和恢复事务，但锁、schema/migration、结构校验、事务 helper、各聚合查询/写入被收敛到内聚内部模块；caller 不接触 SQL、表顺序或 transaction choreography。

**Blocked by:** 02 — 消除 `src → desktop` 反向依赖

**Status:** ready-for-agent

## 必读输入

- Ticket 01 的 owner/长模块决策和 Ticket 02 的最终依赖图。
- OperationalStore 当前 public surface、schema v3 migration、backup/restore/verifier、runtime/migration owner lease。
- Phase 2/3 handoff、publication workflow、media order、attention、content batch 的真实 callers。
- 迁移、fault injection、capacity、backup/restore 和 single-writer tests。

## 开始门禁

1. 确认 Ticket 02 完成，反向依赖门禁为绿色。
2. 冻结现有 exported method、schema version、error code 和 transaction invariants 清单。
3. 先写 facade contract 与结构门禁，证明拆分前后的 caller surface 相同。

## 执行过程

1. 识别锁/owner、schema/migration、verification、transaction、安全序列化及各业务聚合的内部职责。
2. 先抽取无状态或纯校验内部实现，再按一个聚合一批迁移 SQL；每批保持现有 factory/facade 可用且 CI 绿色。
3. 事务边界仍由 store 内部 owner 控制；不得把裸 database handle、statement 或 beforeCommit 顺序暴露给 application caller。
4. 对 publication outcome、batch claim/revision、supplier observation、attention rebuild、backup/restore 分别通过稳定 facade 测试可观察结果。
5. 删除迁移完成后的重复 helper、旧 schema 分支、无 caller method 和只穿透内部表结构的过期测试；历史 migration reader 只有在兼容矩阵仍要求时保留。
6. 运行 deletion test，确认新内部模块删除后复杂性会回到 store 而非消失；合并纯转发 wrapper。

## 模块边界

- Store facade 表达业务意图，不退化为逐表 CRUD。
- Schema/migration 只负责版本演进、验证和 rollback，不解释 UI 或 publisher 状态。
- Query/command 内部模块共享受控 transaction context，但不成为新的 production writer。
- Backup/verifier 只操作隔离目标和安全摘要，不读取真实用户数据。

## 验收标准

- [ ] schema version、public surface、稳定 error code 与 caller 行为无意外变化。
- [ ] runtime writer 和 migration writer 仍互斥，数据库只有一个 production write owner。
- [ ] publication outcome、batch revision、order observation 和恢复 intent 保持原子性。
- [ ] migration、backup、restore、corruption、WAL/concurrent writer 与 SQLITE_FULL 等故障路径通过。
- [ ] facade 隐藏 SQL、表名和 transaction choreography；application/adapter 不直接获得 DB handle。
- [ ] 原巨型实现已按内聚职责拆分，剩余长文件满足 Ticket 01 的书面例外规则。
- [ ] 旧 writer/method/test 的删除均有 production 0 引用证据。

## 必跑验证

- Phase 2/3 OperationalStore、migration、capacity、fault、backup/restore 全套测试。
- publication/media order/content batch/attention caller 回归。
- lint、main typecheck、完整 root suite、packaging smoke 和 `git diff --check`。

## 交接与停止条件

- 记录 facade、内部模块图、transaction owner、schema、删除项和每个故障注入结果。
- 若现有 public surface 本身要求 caller 学习表或调用顺序，停止并重开 Phase 2/3，不在 Phase 8 新造 adapter。
- 若迁移/恢复无法证明数据引用一致，保持 Phase 8 `IN_PROGRESS`。
- 不自动提交。

