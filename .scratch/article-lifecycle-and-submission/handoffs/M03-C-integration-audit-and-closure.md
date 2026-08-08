# M03-C — Integration audit and closure

日期：2026-08-08

Primary Audit source state：`442835f`（`refactor: split article mutation coordination`）

Format gate bounded remediation source state：`bcd63e9`（`test: close M03 integration audit`）

执行模式：Manual Dispatch。本文记录 M03-A/B 最终组合 diff 的 Primary Audit、finding remediation、bounded re-audit，以及后续明确授权的 16-file format gate bounded remediation。未进入 Ticket 23，也未修改业务语义、公开合同、schema、事实 owner、transaction 或远端副作用边界。

## 1. 结论

- Primary Audit：M03-A/B production 组合没有发现 P0/P1 或需要修复的 production correctness finding；公开 facade、named transition ports、coordinator surface、transaction/capability、锁序和 migration seam 均保持原合同。
- Finding remediation：关闭 3 项 M03-C 直接测试/gate evidence finding，未修改 production 业务 owner。
- Bounded re-audit：`PASS`。只复核已知 findings、修复 diff、依赖方向、公开 surface 与直接组合回归，没有触发 escalation。
- Closure：`PASS`。后续 bounded remediation 只对原 repository format gate 报告的固定 16-file 清单执行 Prettier；`npm run format:check` 与 M03-C final gate 均通过。依 Wave Plan 的 reconciliation 规则，M03 状态仍不提前回填 `COMPLETE`；本次未进入 Ticket 23。

## 2. Primary Audit scope 与不变量

审计范围固定为 `3ebda26..442835f` 的 M03-A/B production 组合 diff、`OperationalStore` facade/transition ports、ArticleMutationCoordinator 直接调用方、M03 架构测试与 Phase 08 gate。

已核对：

- `operational-store.js` frozen public surface 仍为原 62 个 key；未暴露 db、SQL、table 或 transaction primitive。
- ArticleMutationCoordinator frozen surface 仍为原 20 个 key；composition 与应用调用方不能取得 lock、mutation session、事实重读或 side-effect marker。
- regular queue runtime 与 shared admission transaction 仍各只有一个 owner；regular/paid admission 继续在同一 OperationalStore transaction owner 内执行 active-target 排他、幂等和原子写入。
- ArticleMutationCoordinator cluster 仍唯一拥有 canonical article-set lock ordering、锁内 facts 重读、side-effect marking 与 release failure uncertain 映射。
- production 外部模块没有新增 `operational-store/internal` 依赖；internal-to-internal 依赖按目录边界判定，migration importer 仍只能例外依赖 recovery guard。
- Ticket 23 仍只能从 public OperationalStore seam 增加未来唯一 import capability；M03 没有新增 `ImportPlanV1`、`importLifecycleFacts`、migration writer、publication-success writer 或 compatibility path。

直接调用方保持不变：regular queue application、regular queue group orchestrator、paid media preflight、publication workflow、AI content/generation、trash/removal services 与 content/workspace composition 均只消费原 facade/coordinator/named capability。

## 3. Findings 与修复

1. `P2 / EXPOSED_PREEXISTING / blocking`：`phase-08-operational-store-internals.test.js` 用 `operational-store.js <= 160 lines` 证明 facade 深度，违反 M03 acceptance。已删除行数阈值，保留 frozen surface、SQL/table/transaction absence 与关键 aggregate 装配断言。
2. `P2 / PROCESS_EVIDENCE_GAP / blocking`：同一测试及 `scripts/verify-phase-08-gates.js` 用手工 internal 文件 allow-list 判定合法 internal import，遗漏既有 cancellation owner 和 M03-A 新模块。已改为 boundary-based 判定：仅 facade 与 `internal/` 内模块可访问 internal；migration importer 只保留 recovery guard 单点例外；新增行为断言证明 facade/internal/外部三类结果。
3. `P2 / PROCESS_EVIDENCE_GAP / blocking`：`phase-08-cleanup-gates.test.js` 把 reachable capability 数量锁死为旧值 `124`，而当前封闭 fixture 为 `131` 且全部可达。已改为断言 `reachableCount === capabilityCount`，继续验证公开能力完整可达而不绑定历史数量。
4. `P2 / EXPOSED_PREEXISTING + PROCESS_EVIDENCE_GAP / blocking closure`：仓库级 format gate 报告 16 个未被 `3ebda26..bcd63e9` 修改的既有文件。后续明确授权的 bounded remediation 仅机械格式化该固定清单并关闭 finding；清单与 M03 组合/closure diff 的交集为 0。16 个输入中 8 个产生规范化内容 diff，其余 8 个经 Prettier 处理后无有效内容 diff。

已知 1–3 的修复未改变公开合同、schema、事实 owner、transaction 或远端副作用边界，因此 bounded re-audit 没有扩大为 fresh review。

## 4. Before / after 与 owner 数量

显著规模变化只作为记录，不作为 pass/fail：

- queue aggregate：1,896 行 → 35 行 composer + 753 行 regular runtime + 1,179 行 admission transaction；owner 仍为两个。
- article mutation coordinator：1,083 行 → 56 行 composer + 330 行 kernel + 272 行 publication + 609 行 admission + 374 行 removal；cluster owner 仍为一个。
- M03-C remediation：3 个测试/gate文件，37 insertions / 74 deletions；没有 production 业务实现改动。

拆分/不拆分理由沿用 M03-A/B handoff：runtime 与 admission 按独立不变量拆分；mutation kernel 因三组业务共同依赖而封闭；regular/paid admission 和 removal/restore/delete 不再细拆，避免复制准入、session、tombstone revalidation 或形成纯透传层。

## 5. 实际命令与结果

环境：Windows；Node `v24.16.0`；npm `11.13.0`。

1. M03 queue/admission/article mutation/Ticket 16/22 与直接组合矩阵：
   - `node --test` 加 14 个定向测试文件。
   - 175 tests；175 PASS，0 FAIL。
2. M03 architecture test：
   - `node --test tests/phase-08-operational-store-internals.test.js`
   - 6 tests；6 PASS，0 FAIL。
3. Phase 08 gate：
   - `npm run test:phase-08:gates`
   - 5 tests；5 PASS，0 FAIL。
4. 工具链：
   - `npm run lint`：PASS。
   - `npm run typecheck:main`：PASS。
   - `npm run typecheck:bridge`：PASS。
   - `npm run typecheck:renderer`：PASS。
   - M03 production 与 remediation 文件的定向 Prettier check：PASS。
   - `git diff --check`：PASS。
5. inherited migration baseline：
   - `node --test tests/phase-02-migration.test.js`
   - 8 tests；4 PASS，4 FAIL；四个失败仍在原测试位置，以 `PUBLICATION_SUCCESS_WRITER_CLOSED` 提前终止，数量、根因与行为合同未变。
6. required repository format gate：
   - `npm run format:check`
   - FAIL；16 个既有文件不符合 Prettier。M03 涉及文件全部通过定向 check，16 个失败文件均不在 M03-A/B 组合 diff 或本次 remediation 中。

未运行完整 `npm test`：M03 合同要求的定向矩阵和 Phase 08 gate已执行；Wave Plan 明确允许的四个 migration failures 已单独重现，最终全量 gate 仍属于 Ticket 23 清除 blocker 后的 reconciliation。没有执行真实登录、发布、付费、取消或生产数据操作。

## 6. 下一动作与 Git 状态

M03-C 的 Primary Audit、finding remediation、bounded re-audit、format gate bounded remediation 与 final gate 均已闭合，Closure=`PASS`。依 Wave Plan 第 3.1 节，M03/Wave 8 仍等待 Ticket 23 后最终 clean integration HEAD reconciliation，不提前回填 `COMPLETE`。本次按用户边界停止，未执行 Ticket 23 upstream inventory 或 production implementation。

## 7. Format gate bounded remediation evidence

固定输入仅为原 `npm run format:check` 报告的 16 个文件：

- `src/domain/article-lifecycle-terminal-contract.js`
- `src/domain/index.js`
- `src/infrastructure/operational-store/internal/operational-store-fact-reader.js`
- `src/infrastructure/operational-store/internal/operational-store-order-cancellation-aggregate.js`
- `src/infrastructure/operational-store/internal/operational-store-order-observation-aggregate.js`
- `src/infrastructure/operational-store/internal/operational-store-publication-archive-query.js`
- `src/infrastructure/operational-store/internal/operational-store-publication-success.js`
- `src/infrastructure/operational-store/internal/operational-store-transition-ports.js`
- `src/infrastructure/operational-store/internal/order-transition-guard.js`
- `src/infrastructure/operational-store/operational-store.js`
- `media-workbench/src/bridge/content.ts`
- `media-workbench/src/bridge/media.ts`
- `media-workbench/src/types/media.ts`
- `media-workbench/src/types/publication.ts`
- `tests/architecture-seams.test.js`
- `tests/phase-08-feature-development-admission.test.mjs`

环境：Windows；Node `v24.16.0`；npm `11.13.0`。

- 精确 14-file M03 组合矩阵：175/175 PASS。
- `node --test tests/phase-08-operational-store-internals.test.js`：6/6 PASS。
- `npm run test:phase-08:gates`：5/5 PASS。
- `node --test tests/architecture-seams.test.js tests/phase-08-feature-development-admission.test.mjs`：7/7 PASS。
- `npm run lint`、`npm run typecheck:main`、`npm run typecheck:bridge`、`npm run typecheck:renderer`：PASS。
- `npm run format:check`：PASS；全部匹配文件符合 Prettier。
- `node --test tests/phase-02-migration.test.js`：8 tests；4 PASS、4 FAIL；四项 inherited failure 均保持 `PUBLICATION_SUCCESS_WRITER_CLOSED`，数量、位置与根因未变。
- `git diff --check`：PASS。

未运行完整 `npm test`：仍按 Wave Plan 保留到 Ticket 23 清除 inherited migration blocker 后的最终 clean integration HEAD reconciliation。用户随后明确授权提交本 bounded remediation；本文与格式修复由同一提交纳入，实际 commit/sourceState 以 Git 为准。未授权 merge 或 push。
