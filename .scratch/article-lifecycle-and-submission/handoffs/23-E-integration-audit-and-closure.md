# 23-E — Integration audit and closure handoff

## 状态

`COMPLETE`。23-A–D combined Primary Audit、blocking finding remediation、bounded re-audit、Ticket 23 最终专项 gates 与 closure commit 均已闭合。Wave 6–9 与 M03 未回填，未进入 Ticket 24。

## Git / provenance

- Base integration commit: `5aa4dbdaaa4a87bb186c1ec9e50aa59a45cc5a09`
- Branch: `codex/article-lifecycle-submission`
- 启动时工作树与暂存区：clean
- Closure commit：包含本 handoff、最终实现、测试、Ticket 与 Wave Plan 状态的提交；实际 commit identity 以 Git 为准
- 23-A implementation: `591cb5f`
- 23-B final remediation: `1dd6c8c`
- 23-C implementation: `b7f1d9e`
- 23-D implementation: `d26588f`

## 四个 owner 与公开接口

| Owner                                     | 最终公开接缝                                                    | 23-E 收口                                                                                |
| ----------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Migration Contract Owner                  | `importPlanFingerprintV1` / `parseImportPlanV1`                 | 同一 owner 对规范化完整 plan 生成并复核 fingerprint                                      |
| Legacy Migration Planner Owner            | `createLegacyMigrationPlanner` 的 `read/plan/dryRun/planResult` | 保留 remote boundary；flat/current identity 是 conflict 冻结对象                         |
| Workspace Migration Gate Owner            | `runWorkspaceMigrationGate` / blocked repair DTO                | 生产确认可达；planner/backup/facade 前跨进程独占；phase-aware backup repair              |
| OperationalStore Import Transaction Owner | journal ports / `importLifecycleFacts` / readback               | 拒绝已有 submission facts；commit 绑定完整 entries；历史 order 经 public projection 可见 |

持久业务事实 writer 仍只有 1 个：OperationalStore `importLifecycleFacts`。Gate 只写 journal metadata，migration lease 只写进程互斥文件，planner/reader/backup/verifier 不写 lifecycle facts。旧 `migrate-operational-store-v1.js` 保留空库/lease 基础设施责任，遇到业务 legacy facts 固定失败为 `MIGRATION_WORKSPACE_GATE_REQUIRED`，已删除 publication/order/queue 写入能力，不形成第二 writer。

## 六 variant 最终映射

| Variant                    | 导入事实                                                       | 可执行事实        |
| -------------------------- | -------------------------------------------------------------- | ----------------- |
| `publishedEvidence`        | 发布档案、终态目标、可选历史订单投影、永久冻结                 | 无                |
| `trackablePaidOrder`       | 订单 snapshot/history、一个冻结付费目标；status 9 进入人工核对 | 无新批次/远端命令 |
| `pendingReadmission`       | 关闭已证明 pre-remote 的旧目标并恢复待投稿                     | 无                |
| `nonPublishedTerminal`     | 关闭目标、可选不可变 order history、按 eligibility 恢复        | 无                |
| `needsAttentionConflict`   | 封闭 conflict evidence 与需处理冻结                            | 无                |
| `deletionRecoveryConflict` | 封闭 deletion/recovery evidence 与需处理冻结                   | 无                |

## Primary Audit findings 与 remediation

Primary Audit 确认并关闭 9 个唯一 blocking findings：

1. `P1 INTRODUCED_BY_CHANGE`：sidecar 覆盖 `remoteBoundaryCrossed=true`。
2. `P2 INTRODUCED_BY_CHANGE`：identity conflict 冻结 nested 错误文章。
3. `P1 CROSS_TICKET_INTERACTION`：`planFingerprint` 未绑定完整规范计划。
4. `P1 INTRODUCED_BY_CHANGE`：import 未拒绝同文章已有 runnable submission facts。
5. `P2 INTRODUCED_BY_CHANGE`：migrated order history 未进入公开投影。
6. `P1 CROSS_TICKET_INTERACTION`：生产启动无可达 confirmation 入口。
7. `P1 INTRODUCED_BY_CHANGE`：migration 未与其他进程 runtime writer 互斥。
8. `P2 INTRODUCED_BY_CHANGE`：confirmed/post-import backup damage 只返回无效重试。
9. `P2 INTRODUCED_BY_CHANGE`：import_committed/verified restart 未重新绑定 confirmation/backup。

三个 bounded re-audit 均 `PASS`。Fingerprint 修复收紧 Migration Contract Owner 接受行为，依 Audit Protocol 只扩大复核到 contract/planner/store 直接边界，未触发 fresh full review。

一个非阻塞 `P3 INTRODUCED_BY_CHANGE`：`runWorkspaceMigrationGate` cleanup 若与业务错误同时失败，cleanup error 可能覆盖原错误。Future owner=`M06 remaining silent/error cleanup`；不阻塞 23-E。

## 修复文件与拆分判断

写本 handoff 前的改动规模为 23 files、`+664/-125`，其中 14 个 production/script 文件、9 个测试文件。未新建 manager/adapter/compatibility layer。Contract fingerprint 保留在现有 owner；lease 复用 OperationalStore owner/recovery guard；订单历史由现有 public fact reader 投影；Electron main 只收集用户确认，未在 Renderer 建立平行 store。

## 最终验证

在最后 production/test 改动后实际运行：

- Ticket 23 + 直接 OperationalStore/composition/architecture/discovery 组合：`96/96 PASS`。
- `npm run test:migration`：`65/65 PASS`；原 4 个 `PUBLICATION_SUCCESS_WRITER_CLOSED` blocker 已清零。
- `node --test tests/phase-02-runtime-capacity.test.js`：`7/7 PASS`；覆盖 500/5000 batch、10000 publication 与 child-process lease 竞争/强制退出恢复。
- `npm run lint`、`npm run typecheck:main`、`npm run format:check`：PASS。
- `npm run test:discover`：PASS，发现 267 个 test files。
- 三个 bounded re-audit：全部 PASS；23-A–D 直接回归 `36/36 PASS`，23-D 受影响组合 `31/31 PASS`。
- `git diff --check`：PASS（仅 Windows line-ending 提示，无 whitespace error）。

## 未运行 / 非当前责任

- 未运行完整 `npm test`：Ticket 23 合同明确留给最终 clean integration HEAD 的 Wave 6–9/M03 reconciliation。
- 曾运行聚合 `npm run test:capacity`：当时 Phase 2 schema v5 旧断言已在本轮修正；另 4 个 Phase 06 media Renderer capacity 失败是 Ticket 16 后测试 fixture 未注入 `prepareOrderCancellation`，与 Ticket 23 无直接关系，按用户边界未扩大修复。最终 source state 已单独重跑 Ticket 23 Phase 2 capacity 并 7/7 PASS。
- 未执行真实账号、登录、发布、付费、取消、生产数据或网络写操作。
- 未 merge、push；未进入 Ticket 24。

## 下一动作

下一步仅按 Wave Plan 在新的 clean integration HEAD 执行最终 reconciliation：完整 `npm test` 与 Wave 6–9/M03 原定 gates 全部 PASS 后，按 Wave 6 → Wave 7 → Wave 8 → M03 → Wave 9 回填状态。不得自动进入 Ticket 24。
