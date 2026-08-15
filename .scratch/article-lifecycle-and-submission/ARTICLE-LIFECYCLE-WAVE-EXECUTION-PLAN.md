# 文章生命周期重构波次执行计划

> **唯一职责：NOW / NEXT / GATE。** 业务语义看 SPEC；实施方式看 `EXECUTION-PROTOCOL.md`；审计方式看 `AUDIT-PROTOCOL.md`；单项范围看 `issues/` / `maintenance/`；历史 evidence 看 `handoffs/`。旧完整计划已归档到 `archive/`，不得作为实时规则使用。

## 1. 当前状态

快照日期：2026-08-15。每次执行前必须以当前 Git 状态重新验证，本文不能覆盖 Git 事实。

| 项目                       | 状态       | 说明                                                                                                                                                                         |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 1–5                   | `COMPLETE` | 历史 evidence 见 `handoffs/` / Git                                                                                                                                           |
| Maintenance 5.5            | `COMPLETE` | M01、M02 已完成；历史 evidence 见 handoff/Git                                                                                                                                |
| Ticket 09                  | `COMPLETE` | Wave 6 单 Ticket 工作已完成                                                                                                                                                  |
| Ticket 14                  | `COMPLETE` | Wave 6 单 Ticket 工作已完成                                                                                                                                                  |
| Ticket 15                  | `COMPLETE` | Wave 6 单 Ticket 工作已完成                                                                                                                                                  |
| Ticket 10                  | `COMPLETE` | Dependency-Resolution Lane 首项已完成；evidence 见对应 handoff/Git                                                                                                           |
| Ticket 16                  | `COMPLETE` | implementation、Primary Audit、remediation、bounded re-audit、commit/handoff 已完成                                                                                          |
| Ticket 22                  | `COMPLETE` | implementation、Primary Audit、remediation、bounded re-audit、最终 gates、implementation/docs commit 已完成；handoff 见 `handoffs/22-published-archive-and-safe-deletion.md` |
| Wave 6                     | `COMPLETE` | Final Closure、Gate Recovery 与最终 clean-HEAD gate 已闭合；原 4 个 migration blocker 已由 Ticket 23 清零                                                                    |
| Wave 7                     | `COMPLETE` | Ticket 10、16 Closure 与最终 clean-HEAD reconciliation 已闭合                                                                                                               |
| Wave 8                     | `COMPLETE` | Ticket 22 Closure 与最终 clean-HEAD reconciliation 已闭合                                                                                                                   |
| Maintenance M03           | `COMPLETE` | M03-0/A/B/C Closure 与最终 clean-HEAD reconciliation 已闭合                                                                                                                 |
| Wave 9                     | `COMPLETE` | Ticket 23 Closure、migration/专项矩阵与最终 clean-HEAD reconciliation 已闭合                                                                                                |
| Dependency-Resolution Lane | `COMPLETE` | 固定顺序全部完成；final reconciliation evidence 见 `handoffs/final-clean-head-reconciliation-20260808.md`                                                                   |
| Maintenance M05             | `COMPLETE`  | M05-I combined audit/closure、`M05-J → J3 → J4 → J5 → J6 → J7 → J8 → J9` final evidence reconciliation、blocking remediation、bounded re-audit 与 implementation-HEAD M05-specific gates 已闭合；最新 handoff 见 `handoffs/M05-J9-final-authoritative-closure-remediation.md` |
| Maintenance M06             | `COMPLETE`  | M06-H 最终 bounded remediation 已在 `af3d116` 完成 queue `inputDir` 非法类型 fail-closed 修复；bounded re-audit 与最终 clean-HEAD full gate PASS；handoff 见 `handoffs/M06-H-final-queue-failure-closure.md` |
| Ticket 26                  | `PARTIAL`  | 26-0～26-I 本地 closure 已完成；26-I combined Primary Audit、blocking remediation、bounded re-audit、迁移/故障/并发/幂等/性能、Renderer、architecture/absence、package/smoke 与 clean implementation HEAD `510f9130fb0b50baf09f668a0dd4300a380b2947` gate evidence 见 `handoffs/26-I-integration-audit-and-closure.md`；真实登录/发布/付费/取消/订单核对/生产迁移仍未获本次授权，因此保持 `PARTIAL`；最终 closure commit 的 Git object id 以 `git rev-parse HEAD` 为准。 |

**当前动作：Ticket 26=`PARTIAL`，26-I 本地 closure 已闭合；最终 clean implementation/evidence HEAD 为 `510f9130fb0b50baf09f668a0dd4300a380b2947`，closure handoff 与最终 Git object id 见 `handoffs/26-I-integration-audit-and-closure.md`。Wave 12 已按下述本地 closure 调度例外进入 `READY`，下一项只能是 `18-0`；本轮只更新计划，不启动实现。真实登录、发布、付费、取消、订单核对和生产迁移仍未获授权。**

**Wave 11.5 调度例外：** Ticket 26 会直接替换 Ticket 25 尚未完成真实外部验收的旧文章/投稿 UI 链路，因此不要求先在即将被移除的旧链路上完成 final smoke 或真实平台验收。该例外只允许从已经提交并验证的 Ticket 25 本地基线进入 Ticket 26；不会把 Ticket 25 伪记为 `COMPLETE`，也不会把真实外部操作授权带入 Ticket 26。最终新链路的真实外部验收仍须另行明确授权。

**Wave 12 本地 closure 调度例外：** Ticket 26 的 26-I 本地 closure、combined audit、bounded re-audit 和 package/smoke gate 已闭合，足以作为不执行真实外部副作用的 Wave 12 通用图片准备基线。Wave 12 不要求先完成 Ticket 25/26 的真实登录、发布、付费、取消、订单核对或生产迁移验收；该例外不把 Ticket 25/26 伪记为 `COMPLETE`，不继承任何真实外部操作授权，也不豁免 Wave 12 自身 `18-0 → 18-E`、final clean-HEAD gate 或 Wave 13 的独立平台授权。

**M05 final non-blocking finding:** Inventory manifest digest remains sensitive to cross-platform working-tree byte representation / line endings. Core inventory structure is stable: 248 files / 1689 declarations / 76 static guards / 0 rewrite. Defer to future tooling ownership.

当前 integration HEAD、clean/dirty 状态、最新 commit/test evidence 必须从真实 Git 和当前 handoff 获取；不要把旧 hash 从历史计划复制到本表。

旧 HEAD `9637819` 缺少 final-HEAD 完整测试的问题已由本次 reconciliation evidence 取代；不得再用该旧 evidence 覆盖当前状态。

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

| 阶段 | 执行组                                                   | 主要 gate                                                | 当前状态                                                                              |
| ---- | -------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1    | 01/03/11/17                                              | 无                                                       | `COMPLETE`                                                                            |
| 2    | 02/04/05                                                 | 02←01；04←03；05←03                                      | `COMPLETE`                                                                            |
| 3    | 06                                                       | 04、05                                                   | `COMPLETE`                                                                            |
| 4    | 07 → 12                                                  | 07←02、06；12←06、11                                     | `COMPLETE`                                                                            |
| 5    | 08 → 13                                                  | 08←07；13←02、04、12                                     | `COMPLETE`                                                                            |
| 5.5  | M01 → M02                                                | Wave 5 COMPLETE                                          | `COMPLETE`                                                                            |
| 6    | 09 → 14 → 15 → Final Closure                             | 09←08；14←13；15←09、11、13；M5.5 COMPLETE               | `COMPLETE`                                                                            |
| 7    | 10 → 16                                                  | 10←09；16←15；Wave 6 COMPLETE 仅由授权 lane 豁免         | `COMPLETE`                                                                            |
| 8    | 22                                                       | 06、09、16                                               | `COMPLETE`                                                                            |
| 8.5  | M03-0 → M03-A → M03-B → M03-C                            | Wave 8 COMPLETE；当前 lane 仅豁免该调度 gate             | `COMPLETE`                                                                            |
| 9    | 23-0 → 23-A → 23-B → 23-C → 23-D → 23-E                  | 04、05、09、14、16、22；M8.5 COMPLETE 仅由当前 lane 豁免 | `COMPLETE`                                                                            |
| 10   | 24-0 → 24-A → 24-B → 24-C → 24-D → 24-E → 24-F          | 02、10、14、16、23                                       | `COMPLETE`；24-F combined audit、bounded re-audit、最终 gate 与 clean-HEAD evidence 已闭合 |
| 10.5 | M04-A → M04-B → M04-C → M05-0 → A → B → C → D → E1 → E2 → E3 → F → G → H → I → J → J3 → J4 → J5 → J6 → J7 → J8 → J9 → M06-0 → M06-A → M06-B → M06-C → M06-D → M06-E → M06-F → M06-G → M06-H | Wave 10 COMPLETE；M06-H final bounded remediation 与 implementation-HEAD clean evidence 已闭合 | `COMPLETE`；M04/M05/M06-0/M06-A～H 全部 closure、gate 与 evidence 已闭合 |
| 11   | 25-0 → 25-A → 25-B → 25-C → 25-D → 25-E → 25-F → 25-G → Independent Combined Audit → Remediation → Bounded Closure Re-audit → authorized commit/merge → final clean smoke → authorized external acceptance | 24；10.5 COMPLETE（含 M06）；各包严格依赖左侧已验证 sourceState；真实外部操作逐次授权 | `PARTIAL`；25-0、25-A、25-B、25-C、25-D、25-E、25-F、25-G package closure COMPLETE；G implementation 与 Independent Audit Handoff 已由主任务集成到 clean integration HEAD `c9a4ed8`；本次 Goal 在此停止，不进入后续 closure |
| 11.5 | 26-0 → 26-A → 26-B → 26-C → 26-D → 26-E → 26-F → 26-G → 26-H → 26-I | Ticket 25 已提交并验证的本地基线；上述 Wave 11.5 调度例外；新 SPEC/ADR；每包独立合同；共享 owner 严格串行；真实外部操作逐次授权 | `PARTIAL`；26-0～26-I 本地 closure 与 combined audit/ bounded re-audit/最终 package-smoke gate 已闭合，clean implementation/evidence HEAD 为 `510f9130fb0b50baf09f668a0dd4300a380b2947`；真实外部验收未授权，closure evidence 见 `handoffs/26-I-integration-audit-and-closure.md`；Wave 12 仅按上述本地 closure 调度例外独立推进 |
| 12   | 18-0 → 18-A → 18-B → 18-C → 18-D → 18-E                | 08、09、10、17；Ticket 26 的 26-I 本地 closure；上述 Wave 12 调度例外 | `READY`；下一项仅 `18-0`，本轮未启动实现                                               |
| 13   | 平台逐个探索 → 仅 SUPPORTED 的 19-0→A→B→C→D→E→F→G / 20 / 21 → 各平台真实验收 | Wave 12 COMPLETE + 每平台显式授权                        | `PENDING`                                                                             |

Ticket 的 `Status: document-ready` 不等于可调度；可调度性只由本表、对应 `Blocked by`/`Scheduling gate` 和真实 Git 状态共同决定。

### 3.1 Dependency-Resolution Lane（COMPLETE）

本 lane 仅用于解除 Wave 6 final gate 与 Ticket 23 上游 gate 的确认依赖环。授权规则如下：

1. **固定顺序**：`10 → 16 → 22 → M03-0 → M03-A → M03-B → M03-C → 23-0 → 23-A → 23-B → 23-C → 23-D → 23-E`。M03/Ticket 23 工作包不得并行修改共享 owner；不得因为进入 lane 而跳过、缩减或自行重排。
2. **只豁免 Wave COMPLETE 调度 gate**：各 Ticket 的真实 `Blocked by`、串行 HEAD、acceptance criteria、专项测试、Primary Audit、finding remediation、bounded re-audit、commit/handoff 均保持有效。
3. **不得做缩水 migration 前置**：禁止恢复 `commitRemoteOutcome(published)`、新增 23A/temporary compatibility writer、第二个 publication-success primitive、migration-only M03 半成品，或让 migration 依赖 OperationalStore internal schema。
4. **继承失败规则**：Ticket 10/16/22/M03 推进期间，当前 `phase-02-migration.test.js` 的 4 个已确认 legacy migration failures 只要数量、根因和行为合同不变，可作为 inherited blocker 记录；任何新增 failure 必须单独分类并修复。
5. **状态不提前完成（已闭合）**：lane 实施期间 Wave 6 保持 `BLOCKED`，Wave 7/8、M03、Wave 9 均未提前完成；Ticket 23 清除 migration blocker 后，已在最终 clean integration HEAD 重跑完整 gate 并按原顺序回填。
6. **23-0 Upstream V1 Inventory Gate**：写 production implementation 前必须读取真实 exports + contract tests，逐项验证 08/09/13/15/16/22 要求的公开 V1。任一缺失返回 `BLOCKED_UPSTREAM_V1_CONTRACT_MISSING`，不得由 Ticket 23 猜测或复制 schema；23-0 不写 production implementation。
7. **23-0 合同决策（CLOSED）**：`terminalObservationV1` 保持订单专属且不修改；`nonPublishedTerminal` 由 `closedTargetV1` 唯一承载 `FAILED | REJECTED | CANCELLED | PAID_STATUS_4`，只有存在真实订单身份时才允许 `orderHistoryV1` 为对象，否则必须为 `null`。payload 不得强制独立 `terminalObservationV1`，不得伪造订单身份或在 planner 中复制/改写上游 enum。
8. **Ticket 23 必须完整实施**：只有 23-0 合法 PASS 后，才按 umbrella 合同串行完成 23-A closed contracts、23-B deterministic planner、23-C 唯一 import transaction、23-D journal/crash recovery/no-remote composition 与 23-E integration/audit/closure；不能并行共享 owner，也不能只为现有 4 个测试打补丁。
9. **最终 reconciliation（已闭合）**：23-E 关闭 migration blocker 后，migration/专项矩阵、最终 clean HEAD 完整 `npm test` 与各 Wave/Maintenance 原定 gate 均已 PASS，并已依次回填 Wave 6 → Wave 7 → Wave 8 → M03 → Wave 9。

## 4. 未来关键边界

- **Wave 7**：Ticket 10 拆 Renderer 业务巨型组件；Ticket 16 实现取消状态机。不得为了“等 M03”把完整 cancellation 状态机继续塞进已有巨型 aggregate；Ticket 16 可以建立职责清楚的独立 cancellation owner，但不得执行系统性 M03。
- **Wave 8.5 / M03**：按 M03-0 职责图、M03-A queue cluster、M03-B ArticleMutationCoordinator cluster、M03-C 统一审计收口串行治理核心深模块；不得重新拥有 Ticket 10 已完成的 Renderer 业务拆分；必须保持公开门面/transaction/capability 与 Ticket 23 migration seam，且不得提前实现 migration-only writer。
- **Wave 10 / 10.5**：Ticket 24、M04、M05 已闭合。M06-0 inventory/scope 真源为 `handoffs/M06-0-authoritative-residual-silent-failure-inventory.md`，后续严格串行 `A → B → C → D → E → F → G`；按失败语义与 owner 修改，不按 catch 数量平均。G 单独执行 combined audit、blocking remediation、bounded re-audit、inventory/failure-semantics reconciliation 与 final clean-HEAD full gate。M06-G 完成前 10.5 不得标记 COMPLETE，Ticket 25 不得启动。
- **Wave 11**：Ticket 25 的合同顺序仍是 `25-A → B → C → D → E → F → G`，包内只收集定向验证和 combined-audit 所需 evidence，不各自开启 fresh full audit；`25-G` 之后由独立任务执行一次 Ticket 25 / Wave 11 combined audit。当前 combined audit 的 F1–F6 remediation 正在真实 owner 上收敛；修复后只做 finding-bounded re-audit，不重开无边界 full review。最终 clean smoke 与真实外部验收仍需后续授权，缺失时保持 `BLOCKED/USER_EXTERNAL_ACCEPTANCE_REQUIRED`。
- **Wave 12–13**：核心完成后的图片扩展。Wave 12 按 `18-0 → 18-A → 18-B → 18-C → 18-D → 18-E` 严格串行：旧组 `imageCount=0`、新组默认 1、文章 claim 时从客户专用图片目录完全随机选择 0–N 张；图片不足/读取/准备失败一律 best-effort 自动减量直至纯文本，不建立 retry/换图/人工降级 decision 状态机。Wave 12 只新增队列组 `imageCount` 事实、复用 Ticket 17 的 claim-time 安全随机计划，并通过现有 preparation 边界向 adapter 传递一个仅进程内的窄 `imagePlan`；不得新增第二图片库/缓存、独立 capability registry、通用上传框架、纯透传 manager/service、平台分支或新的公开 evidence schema。`18-0` 只冻结实时 owner/file map，`18-E` 只做一次 combined audit、blocking remediation、bounded re-audit 和 final gate，不重审历史 Wave。Wave 13 各平台必须先真实探索并得到 `SUPPORTED|UNSUPPORTED|INCONCLUSIVE`，只有 `SUPPORTED` 才实施对应 adapter；列举网若调度，必须按 `19-0 → 19-A → 19-B → 19-C → 19-D → 19-E → 19-F → 19-G` 从已验证 clean integration HEAD 严格串行，不并行共享 adapter / session owner；真实带图验收另行授权。

## 5. Wave Integration Audit 最低矩阵

详细方法遵守 `AUDIT-PROTOCOL.md`。这里只保留每个未来阶段的最低跨 Ticket 目标：

| 阶段           | 最低组合验证                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 6 closure | 09/15 唯一 publication-success primitive；global published 与 per-order remote history 分离；status 0/1/2/4/9 迟到/重复/重排；14 uncertain guard 不回归 |
| Wave 7         | Ticket 10 typed UI 动作与 16 取消接线；同步/取消并发；发布成功优先级；cancellation-uncertain 两种人工收口                                               |
| Wave 8         | 22 档案/恢复/永久删除与文章锁竞态；纯文本 evidence 仍为 `text_only` 且 UI 不暴露不可用图片入口                                                          |
| M03            | 重组后公开门面、transaction/capability、生命周期行为不变；Ticket 23 migration 不依赖 OperationalStore internal schema                                   |
| Wave 9         | migration journal crash recovery；迁移 root 无远端能力；封闭 payload 不生成 runnable facts                                                              |
| Wave 10/10.5   | 正常运行 legacy absence；contract 最终收敛；业务源码 regex 测试减少；silent-catch residual 有明确语义/owner                                             |
| Wave 11        | 85-story/有限状态矩阵、六类生命周期与删除档案、普通平台/付费/迁移故障链、版本化 query/scan 硬预算、owner/capability evidence、独立 combined audit、bounded closure re-audit、final clean smoke 与用户授权的真实外部验收 |
| Wave 12–13     | 图片配置升级安全、客户专用目录与 claim-time 完全随机、图片失败自动降级不阻断文字、逐平台探索/实现/验收隔离，不重定义核心 submission/outcome 合同                 |

## 6. 状态与更新规则

状态只使用：`PENDING | READY | RUNNING | PARTIAL | BLOCKED | COMPLETE`。

- `READY`：上一阶段 COMPLETE，当前最左执行组 gate 满足。
- `RUNNING`：当前阶段实施、审计、finding 修复或 final closure 中。
- `PARTIAL`：前序串行组已完成，后续组尚未完成。
- `COMPLETE`：所有执行组 Closure + Wave Integration Audit + final clean HEAD gate + evidence 全部完成。

本文只记录**当前状态、下一动作、阶段表和必要 gate**。threadId、worktree、commit 链、测试完整日志、历史 finding 及已完成波次的详细矩阵写入 `handoffs/`；禁止再次把历史流水账堆回本文。

如果本文、合同、Git 或 handoff 不一致：以 Git/当前源码测试为事实基线，停止推进并只修正受影响的实时状态；不得从 archive 复制旧状态覆盖当前事实。
