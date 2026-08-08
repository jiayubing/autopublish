# Ticket 23-0 — Upstream V1 Inventory and Contract Decision

## 结论

`PASS`。23-0 `COMPLETE`，23-A 可在新的明确调度下从包含本决策的 clean integration HEAD 启动。

要求的 15 个上游 V1 parser 均从 `src/domain/index.js` 公开导出，且分别与唯一 owner 模块导出的函数对象严格相同；不存在 `BLOCKED_UPSTREAM_V1_CONTRACT_MISSING`。初始 inventory 确认 Ticket 23 原 payload 无法用订单专属 `terminalObservationV1` 唯一、无伪造地表达跨渠道终态，并按 gate 返回 `BLOCKED_CONTRACT_DECISION_REQUIRED`。用户随后作为本次权威产品决策采用最小 owner 对齐方案：`closedTargetV1` 唯一承载跨渠道非发布终态，`orderHistoryV1 | null` 只在存在真实订单身份时承载订单 history，payload 不再强制独立 `terminalObservationV1`。该决策已同步进入 SPEC、Ticket 与 Wave Plan，blocker 已关闭。

本工作包没有修改 production source、schema、测试、DTO 或 writer。

## Source state 与范围

- 仓库：`F:/官媒投稿-refactor`
- 分支：`codex/article-lifecycle-submission`
- inventory base HEAD：`7a0c321311d7908f70949940f45e302a2c2dfcf5`
- 启动时工作树：clean；无 staged change；未发现嵌套 Git repository
- 读取范围：当前 `src/domain` exports/owner、直接 contract tests、Ticket 23、Wave/Execution/Audit Protocol、SPEC、当前 handoffs 与 Git history
- 当前 handoffs 中存在 Ticket 16、22 的独立最终记录；08、09、13、15 没有独立 handoff 文件，因此按真源优先级使用当前源码、合同测试与对应实现 commit evidence，不读取 `archive/`

## Validator identity/version inventory

所有下列 parser 均满足：`typeof require("src/domain")[name] === "function"`，且 public export 与 owner module export 使用同一个函数对象；输入合同固定要求 `version: 1`。

| 上游 | V1 | 唯一 parser / owner module | 当前合同测试 evidence |
| --- | --- | --- | --- |
| 08 | `articleIdentityV1` | `parseArticleIdentityV1` / `regular-publication-contract.js` | `article-lifecycle-ticket-08.test.js` |
| 08 | `targetIdentityV1` | `parseTargetIdentityV1` / `regular-publication-contract.js` | `article-lifecycle-ticket-08.test.js` |
| 09 | `customerSnapshotV1` | `parseCustomerSnapshotV1` / `publication-evidence-contract.js` | `regular-publication-evidence-contract.test.js` |
| 09 | `targetSnapshotV1` | `parseTargetSnapshotV1` / `publication-evidence-contract.js` | `regular-publication-evidence-contract.test.js` |
| 09 | `publicationEvidenceV1` | `parsePublicationEvidenceV1` / `publication-evidence-contract.js` | `regular-publication-evidence-contract.test.js` |
| 13 | `orderIdentityV1` | `parseOrderIdentityV1` / `paid-media-order-contract.js` | `article-lifecycle-ticket-13.test.js` |
| 13 | `orderSnapshotV1` | `parseOrderSnapshotV1` / `paid-media-order-contract.js` | `article-lifecycle-ticket-13.test.js` |
| 13 | `paidTargetV1` | `parsePaidTargetV1` / `paid-media-order-contract.js` | `article-lifecycle-ticket-13.test.js` |
| 15 | `orderObservationV1` | `parseOrderObservationV1` / `order-observation-contract.js` | `order-observation-contract.test.js`、`article-lifecycle-ticket-15.test.js` |
| 15/16 | `terminalObservationV1` | `parseTerminalObservationV1` / `order-observation-contract.js` | `order-observation-contract.test.js`、`article-lifecycle-ticket-16.test.js` |
| 15/16 | `orderHistoryV1` | `parseOrderHistoryV1` / `order-observation-contract.js` | `order-observation-contract.test.js`、Ticket 15/16 tests |
| 22 | `terminalTargetV1` | `parseTerminalTargetV1` / `article-lifecycle-terminal-contract.js` | `article-lifecycle-ticket-22.test.js` |
| 22 | `closedTargetV1` | `parseClosedTargetV1` / `article-lifecycle-terminal-contract.js` | `article-lifecycle-ticket-22.test.js` |
| 22 | `tombstoneIdentityV1` | `parseTombstoneIdentityV1` / `article-lifecycle-terminal-contract.js` | `article-lifecycle-ticket-22.test.js` |
| 22 | `deletionTransactionIdentityV1` | `parseDeletionTransactionIdentityV1` / `article-lifecycle-terminal-contract.js` | `article-lifecycle-ticket-22.test.js` |

实现 provenance：08=`9df3be3`（后续 format `b0c518e`），09=`d60a237`，13=`fbf137f`，15=`b748cf4`，16=`a3469ae`，22=`6aa9b2b`；当前 inventory 以最终 HEAD 的实际对象和测试为准，而不是把历史 commit 当作当前合同。

## 初始冲突矩阵

当前公开合同事实：

- `terminalObservationV1` 是订单 observation/history 的 DTO，强制包含真实 `orderIdentityV1` 和 `orderSnapshotFingerprint`，`terminalKind` 只接受 `REJECTED | CANCELLED | OTHER_NON_PUBLISHED`。
- `orderObservationV1.statusCode` 接受 `0 | 1 | 2 | 4 | 9`；当前 status 4 路径先保存可信 `orderObservationV1(statusCode="4")`，再由 order aggregate 产生 `terminalObservationV1(REJECTED)`。
- `closedTargetV1.closedKind` 接受 `PRE_REMOTE_QUEUE_CLOSED | FAILED | REJECTED | CANCELLED | PAID_STATUS_4`，是当前能直接表达 Ticket 23 四种跨渠道 non-published terminal label 且不强制订单身份的上游合同。
- Ticket 23 初始合同把 `nonPublishedTerminal` 精确 payload 固定为 `{ terminalObservationV1, closedTargetV1, orderHistoryV1, restoreEligibilityV1 }`，并把 terminal kind 写成 `FAILED | REJECTED | CANCELLED | PAID_STATUS_4`；该冲突已由下述权威决策关闭。

| Ticket 23 label | `closedTargetV1` | `terminalObservationV1` | 阻断原因 |
| --- | --- | --- | --- |
| `FAILED` | 可直接表达 | 无对应 terminal kind，且普通平台失败可能没有订单 | 不能伪造 `orderIdentityV1`，也不能偷偷映射为 `OTHER_NON_PUBLISHED` |
| `REJECTED` | 可直接表达 | 仅能表达有真实订单的 rejected terminal | Ticket 没有唯一规定普通平台/订单语义及无订单情况 |
| `CANCELLED` | 可直接表达 | 仅能表达有真实订单的 cancelled terminal | 无订单 legacy target 不能构造该 DTO |
| `PAID_STATUS_4` | 可直接表达 | 不接受该 kind | 可信 status 4 属于 `orderObservationV1`；改成 `REJECTED` 会把迁移映射规则藏在 planner 中 |

因此，任何直接实施都会至少违反一项既定 gate：伪造历史订单身份、复制/扩展上游 V1、丢失 status 4 observation，或在 planner 中建立未授权映射。

## 权威合同决策与 bounded recheck

采用的精确 owner 关系：

1. `nonPublishedTerminal` payload 精确为 `{ closedTargetV1, orderHistoryV1, restoreEligibilityV1 }`。
2. `closedTargetV1.closedKind` 唯一承载 `FAILED | REJECTED | CANCELLED | PAID_STATUS_4`。
3. 只有存在真实订单身份时 `orderHistoryV1` 才能是对应封闭对象；没有真实订单时必须为 `null`。
4. `terminalObservationV1` 保持订单专属上游 V1，不修改其 enum/字段，也不作为该 variant 的独立必填字段；真实订单 terminal 只能作为 `orderHistoryV1` 内部事实出现。
5. planner/store 不得把 `FAILED` 或 `PAID_STATUS_4` 偷偷映射为另一个 `terminalObservationV1.terminalKind`，不得伪造订单身份或复制上游字段列表。

Bounded recheck 只复核原 blocker、最终 payload、直接上游 enum/identity 约束和文档一致性。结果：原 blocker 已关闭，没有修改公开上游 V1、schema、事实 owner 或 production writer；未触发扩大审计条件。

## 实际验证

- public-export identity probe：15/15 parser 存在，15/15 与 owner export 严格同一；PASS。
- `node --test tests/article-lifecycle-ticket-08.test.js tests/regular-publication-evidence-contract.test.js tests/article-lifecycle-ticket-13.test.js tests/order-observation-contract.test.js tests/article-lifecycle-ticket-15.test.js tests/article-lifecycle-ticket-16.test.js tests/article-lifecycle-ticket-22.test.js`：86/86 PASS。
- bounded contract recheck：SPEC、Ticket、Wave Plan 与本 handoff 对 `nonPublishedTerminal` 的 owner/payload/nullability 一致；PASS。
- 未运行完整 `npm test`：23-0 合同只要求 upstream inventory/decision，且 Ticket 23 明确不在本工作包运行完整门禁。

## Git / 下一动作

- Manual Dispatch；本 handoff、SPEC、Wave Plan 与 Ticket 23 由同一文档提交收口；commit identity 以包含本文件的 Git commit 为准，未 merge、未 push。
- 没有 production implementation、schema、DTO、测试或 writer 改动。
- 下一动作仅为新的明确调度下启动 23-A；23-B–E 保持 `PENDING`。
