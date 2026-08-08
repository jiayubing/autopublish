# Ticket 23-B — Read-only Evidence and Deterministic Planning

## 当前结论

`COMPLETE`。23-B 的 reader/planner implementation、Primary Audit、blocking finding remediation 与 bounded re-audit 已闭合；23-C 尚未开始。

## Scope 与 owner

本工作包只覆盖 Legacy Migration Planner cluster：

- `src/content/legacy-migration-reader.js`：只读合成 evidence 输入和 legacy workspace 文件 reader。支持 article/generated/saved/review、publication/submission、queue/batch/sidecar、order JSONL、trash/deletion/recovery 证据；不创建目录、不写文件、不打开 OperationalStore。
- `src/content/legacy-migration-planner.js`：集中 legacy classification matrix、article grouping、成功优先级、冲突分类、六种 `ImportPlanV1` entry、deterministic fingerprint 和脱敏 dry-run/count report。
- `tests/article-lifecycle-ticket-23-b.test.js`：公开行为、变体矩阵、冲突、只读、确定性和 report 脱敏测试。

Planner 的 migration contract 边界只有 `domain.parseImportPlanV1`；nested V1 DTO 不建立第二套 migration parser。reader/planner 不依赖 OperationalStore、`internal/` schema、journal、publisher、queue worker、paid executor 或 supplier adapter。

## 映射矩阵

| Legacy evidence | Planner outcome |
| --- | --- |
| review pending/approved、generated、saved | 忽略审核门槛；没有运行事实时只计入 `ignored` |
| pre-remote `QUEUED` / queue sidecar | `pendingReadmission` |
| regular trusted accepted/published evidence | `publishedEvidence` |
| paid order status `0/1/9` 且身份、snapshot、observation 足够 | `trackablePaidOrder` |
| 明确 failed/rejected/cancelled 或 paid status `4` | `nonPublishedTerminal`；媒体订单保留可验证的 `orderHistoryV1` |
| submitting/unproven submitted、missing order id、multiple active targets、content/identity conflict | `needsAttentionConflict` |
| published/order/active target 与 trash/recovery 冲突 | `deletionRecoveryConflict` |

可信发布成功优先于同目标迟到的非发布终态；多活动目标、身份冲突和正文证据冲突不会被静默选赢家。普通 platform `submitted` 没有明确 acceptance evidence 时保持需处理。

## 安全与确定性证据

- source/workspace/plan fingerprint 由规范化 safe evidence 派生；同一 source/workspace 输入即使 collection 顺序改变也生成相同 plan 和 fingerprint。
- reader 只保留迁移所需的封闭字段；未知数据库行、绝对路径、`api_key`/params/供应商原始异常不会进入 evidence/report。plan 可携带明确的历史投稿正文以满足 publication/order evidence，但 dry-run report/diagnostic 不携带正文。
- report 只输出版本、fingerprint、输入/variant 数量、稳定 code、safe article identity、hash evidence refs 和 hash source/order 标识。
- plan 先以 `domain.parseImportPlanV1` 校验单 entry，再做跨 entry order identity 去重保护，最后再次验证完整 envelope；reader/planner 没有任何远端副作用。

## Primary Audit 与 remediation

审计范围固定为 `d5ae087...cb050ce` 的 23-B reader/planner implementation、23-A `parseImportPlanV1` 边界、直接 V1 owner 与公开行为测试。发现并关闭三个阻塞 P2，来源均为 `INTRODUCED_BY_CHANGE`：

1. 可信成功分支先于历史投稿正文冲突返回，可能把同文章的不同 submitted content 静默归为 `publishedEvidence`。Owner：Legacy Migration Planner classification。修复：正文指纹冲突在成功优先级前进入 `CONTENT_CONFLICT`；成功仍只覆盖同目标迟到 terminal observation。
2. 成功目标与另一个处于 uncertain/submitted 的不同活动目标没有取并集比较，可能丢失需处理的远端不确定事实。Owner：Legacy Migration Planner classification。修复：成功目标与活动目标联合唯一性校验，不同目标进入 `MULTIPLE_ACTIVE_TARGETS`。
3. 同一旧记录的嵌套 V1 identity 与扁平 article/target/order identity 未交叉核对，可能静默选择嵌套值。Owner：Legacy Migration Planner grouping。修复：在分组前比较两种证据，不一致进入 `IDENTITY_CONFLICT`。

Bounded re-audit 只检查上述 findings、修复 diff、成功优先级、冲突保真、23-A 最终 validator 与直接回归；三个 finding 均关闭，未修改公开合同、schema、writer、事务或远端副作用边界，未触发 escalation。结论：`PASS`，无 deferred blocking finding。

## 实际验证

在 `F:/官媒投稿-refactor/auto—publish` 执行：

- `node --test tests/article-lifecycle-ticket-23-b.test.js tests/article-lifecycle-ticket-23-a.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-publication-evidence-contract.test.js tests/article-lifecycle-ticket-13.test.js tests/order-observation-contract.test.js tests/article-lifecycle-ticket-22.test.js`：73/73 PASS。
- `npx eslint src/content/legacy-migration-reader.js src/content/legacy-migration-planner.js tests/article-lifecycle-ticket-23-b.test.js`：PASS。
- `npx prettier --check --end-of-line auto src/content/legacy-migration-reader.js src/content/legacy-migration-planner.js tests/article-lifecycle-ticket-23-b.test.js`：PASS。
- `npm run test:discover`：PASS，收集 265 个测试文件并包含 `article-lifecycle-ticket-23-b.test.js`。
- `git diff --check`：PASS。

未运行完整 `npm test` 与 Ticket 23-E final migration gate：按 Ticket 合同均留给 23-E/final reconciliation；本 closure 没有远端操作。

## 下一动作

23-B closure commit 为包含本 handoff 的提交；base implementation commit=`cb050ce`。下一串行工作包仅为 23-C 唯一 import transaction，必须从包含本 closure 的 clean integration HEAD 在新的明确调度下启动；23-D/E 不得提前实施。
