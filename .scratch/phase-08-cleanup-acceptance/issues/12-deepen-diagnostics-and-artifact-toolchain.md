# 12 — 深化诊断、制品与证据工具链

**What to build:** 运行故障、production artifact 和 release evidence 继续产生同一安全、可验证结果，但 diagnostic schema/sink/rotation、runtime resolver/artifact verifier、smoke runner/evidence collector/writer 各自保持单一职责；任何失败都能归属到一个明确模块和 required check。

**Blocked by:** 02 — 消除 `src → desktop` 反向依赖

**Status:** ready-for-agent

## 必读输入

- Phase 7 diagnostics、packaging、CI/release handoff与固定 required check 名称。
- 当前 diagnostic schema/sinks/runtime service、packaged runtime resolver、artifact verifier、offline smoke、manifest writer/validator。
- 安全日志、path boundary、package/ASAR、release evidence 和 CI workflow contract tests。

## 开始门禁

1. 冻结 diagnostic record schema、safe metadata、artifact manifest、release evidence schema 和 required check 名称。
2. 运行 diagnostics、packaging contracts 与现有 production directory smoke 基线。
3. 为每个 facade 建立 parity test，确保拆分不改变安全输出或 fail-closed 行为。

## 执行过程

1. 将 diagnostic validation/factory、in-memory sink、file sink/rotation、IPC projection 和 startup cleanup 分离；业务 producer 只提交安全结构化记录。
2. 将 runtime path resolution、regular-file/canonical boundary、manifest verification、tool smoke 和 Electron launch orchestration 分离。
3. 将 evidence input collection、hash/version normalization、manifest serialization 和 checklist validation 分离；validator 不批准 release。
4. 按 diagnostics、artifact verification、offline smoke、release evidence 四批迁移真实 callers，并逐批运行安全/故障测试。
5. 删除重复 helper、全能 verify 分支、源码 fallback、raw error passthrough、无 owner script 和仅为旧 manifest 存在的 compatibility path。
6. 保持每项 CI failure 对应稳定 required check，不把业务判断重新写进 workflow YAML。

## 模块边界

- Diagnostic schema/sink 不改变业务状态；IPC projection 不读取 raw Error。
- Resolver 只解析；verifier 只验证；runner 只编排；manifest writer 只汇总已完成证据。
- Checklist validator 只判 schema/gate 完整性，不伪造人工批准。
- 所有路径、日志和 manifest 均使用安全相对标识，不泄露用户绝对路径或秘密。

## 验收标准

- [ ] diagnostic schema、容量/轮换、脱敏和 IPC 安全字段保持稳定。
- [ ] packaged runtime 缺失、ASAR 路径、symlink/junction、越界或不可执行时继续 fail-closed，无源码 fallback。
- [ ] offline smoke 与 evidence manifest 可定位到独立检查，required check 名称不变。
- [ ] evidence/checklist 保留 `PENDING_HUMAN` / `BLOCKED_RELEASE`，validator 不自动批准 release。
- [ ] 原过长 runtime diagnostics/artifact verifier/evidence scripts 已按职责拆分，无“全能 utils”。
- [ ] source、package、artifact 和日志均通过敏感信息扫描。

## 必跑验证

- diagnostics、runtime diagnostics IPC、packaging contracts、production directory/offline smoke、release evidence/checklist、CI workflow tests。
- lint、main typecheck、完整 root suite、Renderer/preload build（若 packaging 需要）、`git diff --check`。

## 交接与停止条件

- 记录模块图、固定 schemas/checks、删除 helper、artifact/evidence hashes 和人工 blockers。
- 若必须放宽 ASAR/path/TLS/secret/dirty-source 门才能通过，停止；不得改变安全默认。
- 不签名、不连接生产网络、不自动提交。

