# 15 — 执行迁移、容量、制品与回滚验收

**What to build:** 通过合成旧 workspace/Auth fixture、隔离 SQLite、容量数据集和 production directory 制品，证明 migration/backup/restore/rollback、分页/索引/limiter 容量以及 packaged runtime 完整性；正式签名、真实恢复和发布仍由人工 gate 控制。

**Blocked by:** 13 — 删除旧测试、依赖与构建残余并固化门禁

**Status:** ready-for-agent

## 必读输入

- Ticket 13 的 package/architecture gates与 Tickets 03/04/11/12 的 schema、migration、backup、resolver、artifact contracts。
- Phase 8 验收矩阵 8.4–8.5、Phase 7 release checklist/evidence schema。
- Content/OperationalStore/Auth migration fixtures、capacity harness、production directory/offline smoke。

## 开始门禁

1. 确认 source cleanup 全绿，当前 commit/worktree 状态被 evidence 明确记录。
2. 所有 migration/restore 输入必须是仓库合成 fixture或系统临时目录；禁止选择真实用户路径。
3. 冻结应用、workspace、OperationalStore 和 Auth schema 版本及兼容/拒绝规则。

## 执行过程

1. 执行旧合成 workspace dry-run → migration → restart → verify → backup → isolated restore；覆盖 corrupt、conflict、unknown account、重复执行、中断、rollback 和旧版本拒绝。
2. 验证 Operations DB 与内容文件引用一致，失败恢复整个快照，不让旧 writer 解释新 schema。
3. 执行容量矩阵：10k publications/multiple attempts、5000 batch items、10k media resources、500/5000 generation tasks、100k Auth limiter identity。
4. 记录 query count、pagination/bounds、payload/heap/time 的安全摘要；禁止为了数字做无证据全仓性能重写。
5. 运行 Windows production `--dir`、Python/Playwright/SQLite/migration CLI/offline Electron smoke；在可用环境运行 Auth Linux/container smoke。
6. 重新生成 artifact/release evidence，验证相对路径、hash、schemas、migration/backup 摘要和人工 blockers；dirty source 不能伪装 clean。
7. 准备但不执行真实 rollback/签名/installer/production recovery 清单。

## 验收标准

- [ ] 空库、当前/旧 schema、损坏、冲突、中断、重复 migration 和完整 rollback fixture 全部有结果。
- [ ] backup destination 被独立重新打开验证；活跃 writer snapshot 保持事务一致。
- [ ] 内容文件与 Operations DB 引用一致，unknown account/remote fact 明确人工处理。
- [ ] 全部容量场景有界，无无界 Map、全量 IPC payload 或 N+1 查询退化。
- [ ] production directory/offline package 验证真实 ASAR/unpacked/runtime/tool paths，无源码 fallback。
- [ ] release evidence 保留签名、TLS、installer、真实 Auth 恢复及 RPO/RTO 为 `PENDING_HUMAN` / `BLOCKED_RELEASE`。

## 必跑验证

- migration、backup/restore/recovery、capacity、packaging contracts、production directory/offline smoke、release evidence/checklist。
- Auth Linux/container在环境可用时运行；不可用必须记录为明确环境门，不伪造通过。
- 完整 root/Auth suites、lint/typecheck/format/build、`git diff --check`。

## 交接与停止条件

- 记录 schema、fixture、capacity 指标、artifact hashes、rollback 准备和所有人工 blockers。
- migration/backup/rollback 无法证明可恢复、存在未解释冲突或需要真实数据时停止并重开所属阶段。
- 不签名、不覆盖真实数据库、不删除备份、不自动提交。

