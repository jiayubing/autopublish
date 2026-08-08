# 文章生命周期重构波次执行计划

> **唯一职责：NOW / NEXT / GATE。** 业务语义看 SPEC；实施方式看 `EXECUTION-PROTOCOL.md`；审计方式看 `AUDIT-PROTOCOL.md`；单项范围看 `issues/` / `maintenance/`；历史 evidence 看 `handoffs/`。旧完整计划已归档到 `archive/`，不得作为实时规则使用。

## 1. 当前状态

快照日期：2026-08-08。每次执行前必须以当前 Git 状态重新验证，本文不能覆盖 Git 事实。

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| Wave 1–5 | `COMPLETE` | 历史 evidence 见 `handoffs/` / Git |
| Maintenance 5.5 | `COMPLETE` | M01、M02 已完成；历史 evidence 见 handoff/Git |
| Ticket 09 | `COMPLETE` | Wave 6 单 Ticket 工作已完成 |
| Ticket 14 | `COMPLETE` | Wave 6 单 Ticket 工作已完成 |
| Ticket 15 | `COMPLETE` | Wave 6 单 Ticket 工作已完成 |
| Ticket 10 | `COMPLETE` | Dependency-Resolution Lane 首项已完成；evidence 见对应 handoff/Git |
| Ticket 16 | `COMPLETE` | implementation、Primary Audit、remediation、bounded re-audit、commit/handoff 已完成 |
| Wave 6 | `BLOCKED` | Final Closure 与 Gate Recovery 已完成；4 个 legacy migration public-contract tests 等待未来受控 import capability 的调度决策 |
| Wave 7 | `RUNNING` | Lane 内 Ticket 10、16 已完成；依授权规则不提前回填 `COMPLETE` |
| Dependency-Resolution Lane | `RUNNING` | Ticket 10、16 `COMPLETE`；下一项 Ticket 22，须从 Ticket 16 clean closure HEAD 在新线程 preflight |

**当前下一动作：从 Ticket 16 clean closure HEAD 在新的执行线程进行 Ticket 22 preflight；本线程在 Ticket 16 closure 后停止。后续仍固定为 Ticket 22 → M03 → Ticket 23。该 lane 只豁免“前序 Wave 必须 `COMPLETE`”这一调度 gate；不得豁免 Ticket `Blocked by`、既有串行顺序、acceptance criteria、Primary Audit 或最终完整 gate。Ticket 23 写 production implementation 前必须通过 upstream V1 inventory；若 `terminalObservationV1` 与 `nonPublishedTerminal` 无法在不伪造历史 identity/evidence 的前提下对齐，则以 `BLOCKED_CONTRACT_DECISION_REQUIRED` 停止。**

当前 integration HEAD、clean/dirty 状态、最新 commit/test evidence 必须从真实 Git 和当前 handoff 获取；不要把旧 hash 从历史计划复制到本表。

当前 HEAD `9637819` 的历史记录曾将 Wave 6 记为完成，但该记录同时明确未在最终 HEAD 重新运行符合要求的完整 `npm test`；在新的合规 evidence 产生前，本实时计划按 final gate 规则保持 Wave 6=`BLOCKED`、Wave 7=`PENDING`。

## 2. Wave 6 Final Closure Gate

Wave 6 在以下全部完成前不得标记 `COMPLETE`：

1. 关闭已确认的 Ticket 09/15 跨 Ticket order observation / global publication-success 一致性问题。
2. 用公开行为状态矩阵验证：全局文章已发布后，具体 paid order 的可信 status 0/1/2/4/9 仍如实进入 order history；全局 publication success 不被迟到 observation 撤销或覆盖；status 2 正确收口对应 anomaly/uncertain 本地事实。
3. 执行一次 bounded closure audit；只检查本 closure finding、修复 diff、09/14/15 跨 Ticket 不变量及直接回归。
4. 所有阻塞 finding 关闭并 re-audit PASS。
5. 所有修复进入新的 integration HEAD。
6. 在新的最终 clean integration HEAD 上重新运行完整 `npm test` 并记录合规 evidence。
7. 修复本文与 handoff 的状态一致性：Wave 6=`COMPLETE`，Wave 7=`READY`。

Wave 6 closure 本身仍不得扩展进入 Ticket 10/16、M03、全库 empty-catch 清理或广域架构重构；后续 10→16→22→M03→23 只能依据第 3.1 节已授权 Dependency-Resolution Lane 独立推进，不视为 Wave 6 closure 范围。

## 3. 阶段顺序

`/` = 同组可并行（仅在 owner/文件范围不重叠且合同允许时）；`→` = 必须从新的 integration HEAD 串行推进。

| 阶段 | 执行组 | 主要 gate | 当前状态 |
| --- | --- | --- | --- |
| 1 | 01/03/11/17 | 无 | `COMPLETE` |
| 2 | 02/04/05 | 02←01；04←03；05←03 | `COMPLETE` |
| 3 | 06 | 04、05 | `COMPLETE` |
| 4 | 07 → 12 | 07←02、06；12←06、11 | `COMPLETE` |
| 5 | 08 → 13 | 08←07；13←02、04、12 | `COMPLETE` |
| 5.5 | M01 → M02 | Wave 5 COMPLETE | `COMPLETE` |
| 6 | 09 → 14 → 15 → Final Closure | 09←08；14←13；15←09、11、13；M5.5 COMPLETE | `BLOCKED` |
| 7 | 10 → 16 | 10←09；16←15；Wave 6 COMPLETE 仅由授权 lane 豁免 | `RUNNING`（10/16 COMPLETE；状态回填等待最终 reconciliation） |
| 8 | 22 | 06、09、16 | `PENDING` |
| 8.5 | M03 | Wave 8 COMPLETE | `PENDING` |
| 9 | 23 | 04、05、09、14、16、22；M8.5 COMPLETE | `PENDING` |
| 10 | 24 | 02、10、14、16、23 | `PENDING` |
| 10.5 | M04 → M05 → M06 | Wave 10 COMPLETE | `PENDING` |
| 11 | 25 | 24；M10.5 COMPLETE | `PENDING` |
| 12 | 18 | 08、09、10、17；Wave 11 COMPLETE | `PENDING` |
| 13 | 平台逐个探索 → 仅 SUPPORTED 的 19→20→21 → 各平台真实验收 | Wave 12 COMPLETE + 每平台显式授权 | `PENDING` |

Ticket 的 `Status: document-ready` 不等于可调度；可调度性只由本表、对应 `Blocked by`/`Scheduling gate` 和真实 Git 状态共同决定。

### 3.1 Dependency-Resolution Lane（AUTHORIZED）

本 lane 仅用于解除 Wave 6 final gate 与 Ticket 23 上游 gate 的确认依赖环。授权规则如下：

1. **固定顺序**：`10 → 16 → 22 → M03 → 23`。不得因为进入 lane 而跳过 10、缩减 16/22/M03，或自行重排。
2. **只豁免 Wave COMPLETE 调度 gate**：各 Ticket 的真实 `Blocked by`、串行 HEAD、acceptance criteria、专项测试、Primary Audit、finding remediation、bounded re-audit、commit/handoff 均保持有效。
3. **不得做缩水 migration 前置**：禁止恢复 `commitRemoteOutcome(published)`、新增 23A/temporary compatibility writer、第二个 publication-success primitive、migration-only M03 半成品，或让 migration 依赖 OperationalStore internal schema。
4. **继承失败规则**：Ticket 10/16/22/M03 推进期间，当前 `phase-02-migration.test.js` 的 4 个已确认 legacy migration failures 只要数量、根因和行为合同不变，可作为 inherited blocker 记录；任何新增 failure 必须单独分类并修复。
5. **状态不提前完成**：Wave 6 继续 `BLOCKED`；Wave 7/8、M03、Wave 9 不因 lane 提前实施而自动 `COMPLETE`。最终状态必须在 Ticket 23 清除 migration blocker 后，于最终 clean integration HEAD 上重新跑完整 gate 再按原顺序回填。
6. **Ticket 23 Upstream V1 Inventory Gate**：写 production implementation 前必须读取真实 exports + contract tests，逐项验证 08/09/13/15/16/22 要求的公开 V1。任一缺失返回 `BLOCKED_UPSTREAM_V1_CONTRACT_MISSING`，不得由 Ticket 23 猜测或复制 schema。
7. **已知合同风险必须先判定**：当前 `terminalObservationV1` 的 `terminalKind` 只接受 `REJECTED | CANCELLED | OTHER_NON_PUBLISHED`，且强制包含 `orderIdentityV1`；Ticket 23 的 `nonPublishedTerminal` 文档却列出 `FAILED | REJECTED | CANCELLED | PAID_STATUS_4`。不得为无订单 legacy terminal 伪造 `orderIdentityV1`，也不得偷偷修改既有 V1。若现有权威合同不能唯一决定合法映射/表达方式，停止 Ticket 23 production implementation，标记 `BLOCKED_CONTRACT_DECISION_REQUIRED` 并报告最小合同决策点。
8. **Ticket 23 必须完整实施**：只有上述 gate 合法通过后，才按 Ticket 23 正文建立 deterministic planner、封闭 `ImportPlanV1`、唯一 `importLifecycleFacts` capability、journal/crash recovery、no-remote composition 和完整 migration acceptance；不能只为现有 4 个测试打补丁。
9. **最终 reconciliation**：Ticket 23 关闭 migration blocker 后，先跑 migration/专项矩阵，再在最终 clean HEAD 运行完整 `npm test` 与各 Wave/Maintenance 原定 gate；全部 PASS 后才依次回填 Wave 6 → Wave 7 → Wave 8 → M03 → Wave 9。

## 4. 未来关键边界

- **Wave 7**：Ticket 10 拆 Renderer 业务巨型组件；Ticket 16 实现取消状态机。不得为了“等 M03”把完整 cancellation 状态机继续塞进已有巨型 aggregate；Ticket 16 可以建立职责清楚的独立 cancellation owner，但不得执行系统性 M03。
- **Wave 8.5 / M03**：在 09/10/14/15/16/22 业务语义与最终 owner 稳定后治理核心深模块；不得重新拥有 Ticket 10 已完成的 Renderer 业务拆分；必须保持公开门面/transaction/capability 与 Ticket 23 migration API 边界。
- **Wave 10 / 10.5**：Ticket 24 先删除 legacy surface；之后 M04 收缩 contract owner，M05 治理测试质量，M06 收口剩余 silent catch。
- **Wave 11**：Ticket 25 负责最终核心验收 evidence；真实平台操作仍需逐次用户授权。
- **Wave 12–13**：核心完成后的图片扩展。旧组默认保持 `imageCount=0`；平台必须先真实探索并得到 `SUPPORTED|UNSUPPORTED|INCONCLUSIVE`，只有 `SUPPORTED` 才实施对应 adapter；真实带图验收另行授权。

## 5. Wave Integration Audit 最低矩阵

详细方法遵守 `AUDIT-PROTOCOL.md`。这里只保留每个未来阶段的最低跨 Ticket 目标：

| 阶段 | 最低组合验证 |
| --- | --- |
| Wave 6 closure | 09/15 唯一 publication-success primitive；global published 与 per-order remote history 分离；status 0/1/2/4/9 迟到/重复/重排；14 uncertain guard 不回归 |
| Wave 7 | Ticket 10 typed UI 动作与 16 取消接线；同步/取消并发；发布成功优先级；cancellation-uncertain 两种人工收口 |
| Wave 8 | 22 档案/恢复/永久删除与文章锁竞态；纯文本 evidence 仍为 `text_only` 且 UI 不暴露不可用图片入口 |
| M03 | 重组后公开门面、transaction/capability、生命周期行为不变；Ticket 23 migration 不依赖 OperationalStore internal schema |
| Wave 9 | migration journal crash recovery；迁移 root 无远端能力；封闭 payload 不生成 runnable facts |
| Wave 10/10.5 | 正常运行 legacy absence；contract 最终收敛；业务源码 regex 测试减少；silent-catch residual 有明确语义/owner |
| Wave 11 | 核心追踪矩阵、最终门禁、版本化性能预算、独立验收审计与用户授权的真实外部验收 |
| Wave 12–13 | 图片配置升级安全、逐平台探索/实现/验收隔离，不重定义核心 submission/outcome 合同 |

## 6. 状态与更新规则

状态只使用：`PENDING | READY | RUNNING | PARTIAL | BLOCKED | COMPLETE`。

- `READY`：上一阶段 COMPLETE，当前最左执行组 gate 满足。
- `RUNNING`：当前阶段实施、审计、finding 修复或 final closure 中。
- `PARTIAL`：前序串行组已完成，后续组尚未完成。
- `COMPLETE`：所有执行组 Closure + Wave Integration Audit + final clean HEAD gate + evidence 全部完成。

本文只记录**当前状态、下一动作、阶段表和必要 gate**。threadId、worktree、commit 链、测试完整日志、历史 finding 及已完成波次的详细矩阵写入 `handoffs/`；禁止再次把历史流水账堆回本文。

如果本文、合同、Git 或 handoff 不一致：以 Git/当前源码测试为事实基线，停止推进并只修正受影响的实时状态；不得从 archive 复制旧状态覆盖当前事实。
