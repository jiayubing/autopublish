# Ticket 23-A — Closed Migration Contracts

## 结论

`PASS`。23-A `COMPLETE`，23-B 可在新的明确调度下从包含本工作包的 clean integration HEAD 启动；23-C–E 保持 `PENDING`。

本工作包建立了唯一 Migration Contract Owner：`src/domain/migration-import-contract.js` 只公开 `parseImportPlanV1`，递归封闭 `ImportPlanV1` envelope、公共 entry、六种 variant payload 与 Ticket 23 本地 DTO/enum。所有 publication/order/target/deletion 嵌套事实直接调用 23-0 已确认的上游 V1 parser，没有复制其字段 schema、提供 fallback DTO 或修改上游 enum。

没有读取 legacy 文件、写 OperationalStore、增加 schema/journal/composition、构造远端能力或进入 23-B planner。

## Source state 与 Git

- 仓库：`F:/官媒投稿-refactor`
- 分支：`codex/article-lifecycle-submission`
- base integration HEAD：`048cbdf2dedb8b3f2077a63d9f9cdaba09ac0701`
- 启动状态：clean；无 staged change；当前分支没有重复 worktree；既有其他历史 worktree 不在本 owner/HEAD 上运行
- implementation commit：`591cb5f`（`feat: add closed lifecycle migration contracts`）
- 未 merge、未 push；文档 closure commit 以包含本 handoff 的 Git commit 为准

## Public interface 与 owner

- 唯一 public interface：`domain.parseImportPlanV1(input)`。
- Envelope 精确为 `{ version, migrationRunId, workspaceFingerprint, sourceFingerprint, planFingerprint, entries }`。
- Entry 精确为 `{ entryId, variant, articleIdentityV1, legacySourceFingerprint, legacyEvidenceRefs, payload }`；payload 按 discriminant 只能是 `publishedEvidence | trackablePaidOrder | pendingReadmission | nonPublishedTerminal | needsAttentionConflict | deletionRecoveryConflict` 之一。
- 本地 `LegacyEvidenceRefV1`、`LegacyQueueEvidenceV1`、`MigrationConflictEvidenceV1`、`MigrationDeletionEvidenceV1`、`RestoreEligibilityV1` 仅由同一递归入口解释，不对 planner 暴露第二套 parser。
- 递归拒绝任意层级 extra field、缺字段、未知/未来 enum、未来 envelope version、稀疏数组、不安全 identity/fingerprint 和 runnable queue/remote command 等未声明事实。

跨事实边界集中在同一 owner：每 plan 的 entry/article identity 唯一，订单身份跨 entry 唯一；各 variant 的 article/target/attempt/order identity 必须绑定；同文章不能同时表达发布成功与非发布终态；普通平台不能伪造订单 history，网站媒体非发布终态必须携带真实且与 closed kind 相容的 order history；发布证据、订单 observation、删除冲突均必须包含对应封闭证据。

## 上游依赖方向

`migration-import-contract.js` 只向以下稳定 domain owner 单向依赖：

- `regular-publication-contract.js`：article/target identity；
- `publication-evidence-contract.js`：允许 legacy missing-reason 语义的 publication evidence；
- `paid-media-order-contract.js`：order identity/snapshot/paid target；
- `order-observation-contract.js`：observation/history 与 snapshot fingerprint；
- `article-lifecycle-terminal-contract.js`：terminal/closed target、tombstone、deletion transaction identity。

它不依赖 content、desktop、OperationalStore 或其 `internal/`。`src/domain/index.js` 仅公开同一个 parser 函数。

## 六 variant 验证矩阵

| Variant | 正向合同 | 主要反向合同 |
| --- | --- | --- |
| `publishedEvidence` | 可信 publication evidence + 同 article/target terminal target；order history 可选且存在时绑定真实 paid order | target/article 不一致、普通发布伪造订单、payload extra/runnable fact |
| `trackablePaidOrder` | snapshot/observation/paid target 的 article/target/attempt/order 全绑定；status 仅 `0/1/9` | status 2/4、snapshot fingerprint 错误、terminal paid target、订单身份冲突 |
| `pendingReadmission` | `QUEUED` + `remoteBoundaryCrossed=false` + `PRE_REMOTE_QUEUE_CLOSED` | 已越过远端边界、target 不一致、其他 readmission reason |
| `nonPublishedTerminal` | `closedTargetV1` 唯一承载四种 closed kind；平台 history 为 null；媒体使用真实封闭 order history | 独立 `terminalObservationV1`、伪造平台订单、published/pre-remote kind、history 与 closed kind 不相容 |
| `needsAttentionConflict` | 固定 freeze reason 与封闭 state/target/order/content evidence | 未知 kind/state、虚假的多目标/内容冲突、重复 identity/fingerprint |
| `deletionRecoveryConflict` | owner tombstone/deletion DTO 与对应 conflicting fact kind | article 不绑定、缺少对应 fact kind、未知 deletion enum |

## 模块规模与拆分判断

- production owner：579 行；测试：494 行。
- 保持单个深 owner：它只拥有一个 public parser，内部 helper 均服务于同一 exact-schema 与跨 variant 拒绝边界。拆成多个公开 DTO parser 会让 planner/store 可选择性绕过 envelope/cross-entry 校验，形成第二字段解释；当前拆分不会降低调用者理解成本，因此 23-A 不制造浅模块。
- 后续 23-B 只能消费 `parseImportPlanV1`，不得把内部 enum/字段表复制到 planner；23-C store owner仍需调用同一 parser并增加其持久化边界独立校验。

## 实际验证

- `node --test tests/article-lifecycle-ticket-23-a.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-publication-evidence-contract.test.js tests/article-lifecycle-ticket-13.test.js tests/order-observation-contract.test.js tests/article-lifecycle-ticket-22.test.js`：65/65 PASS。
- `npx eslint src/domain/migration-import-contract.js src/domain/index.js tests/article-lifecycle-ticket-23-a.test.js`：PASS。
- `npx prettier --check --end-of-line auto src/domain/migration-import-contract.js src/domain/index.js tests/article-lifecycle-ticket-23-a.test.js`：PASS。
- `npm run test:discover`：PASS，收集 264 个测试并包含 `article-lifecycle-ticket-23-a.test.js`。
- `node --test tests/test-discovery-contract.test.js`：4/5 PASS；唯一失败为该既存合同硬编码 `261`，而 base HEAD 已实际包含 263 个测试，23-A 新增一个后正确发现 264 个。该 policy/baseline 收口属于 23-E discovery gate，23-A 未越界修改 runner/test policy。
- `git diff --check`：PASS。
- 未运行完整 `npm test`、architecture/final migration gate：23-A 合同不要求，Ticket 23 明确由 23-E 对最终组合执行这些 gate；当前已知四个 legacy migration blocker 也不属于 23-A writer-less contract 的关闭范围。

## Audit 与下一动作

Umbrella 合同指定 23-E 对 23-A–D 最终组合 diff 执行一次 Primary Audit；23-A 不单独重复开启 fresh audit。当前没有 blocking in-scope finding。

下一动作只能是在新的明确调度下，从包含 23-A implementation 与本 handoff 的 clean integration HEAD 启动 23-B read-only evidence/deterministic planner。不得自动进入 23-B、23-C writer、23-D journal/composition 或 23-E closure。
