# Ticket 25 — Independent Audit Blocking Remediation

**状态：** `BOUNDED_REAUDIT_PASS_PENDING_FINAL_CLEAN_HEAD_AND_USER_EXTERNAL_ACCEPTANCE`（不代表 Ticket 25 / Wave 11 `COMPLETE`）

**记录时间：** 2026-08-12（Asia/Shanghai）

## Scope

本次只处理独立审计确认的 F1–F6 P2 blocking findings，并顺带恢复 F7 的行为验收 provenance。没有执行真实登录、投稿、付费、订单刷新/取消、图片上传、生产数据库操作、clean production smoke、commit、merge 或 push。

## Finding disposition

| Finding | 判断 | 最小根因修复 |
| --- | --- | --- |
| F1 | `P2 / EXPOSED_PREEXISTING`，阻塞成立 | `operational-store-order-observation-aggregate.js` 的批量 list JOIN 已带 `history_json`；`historyFor()` 现在把 JOIN 后的 `NULL` 解释为已加载的空 history，只有非 list 的单行读取才执行 evidence fallback。 |
| F2 | `P2 / INTRODUCED_BY_CHANGE`，阻塞成立 | 25-F benchmark 的 regular/paid operation 改为隔离 SQLite OperationalStore 公共 transition seam；fixture construction 不计入 measured call，计数来自真实 `DatabaseSync.prepare()` SELECT boundary。 |
| F3 | `P2 / EXPOSED_PREEXISTING`，阻塞成立 | `operational-store-regular-queue-runtime.js` 将 group rows 与所有 queued remaining rows 分别批量读取，再按 group 在内存组装；global pause/start 复用同一批量组装路径，不再按 group 查询。 |
| F4 | `P2 / PROCESS_EVIDENCE_GAP`，阻塞成立 | 责任 manifest 从 4 扩为 9 项，并在 contract validator 中强制覆盖 ArticleMutation admission、lifecycle projection、packaged migration CLI 以及本次 queue/order persistence owner。 |
| F5 | `P2 / INTRODUCED_BY_CHANGE`，阻塞成立 | `parseOutputArgument()` 与 production smoke `parseArguments()` 都把 output canonicalize 后限制在 `auto—publish/build/evidence/`；每个重复 `--output` 候选都先校验，越界返回稳定错误码。 |
| F6 | `P2 / PROCESS_EVIDENCE_GAP`，阻塞成立 | 文档先于最终 evidence 更新；最终重新生成 contract、A benchmark、F benchmark 和 dirty smoke JSON，全部保留在 `auto—publish/build/evidence/`，并在 handoff/final response 中绑定命令、sourceState、结果与安全环境摘要。clean smoke 继续明确保留给最终 clean integration HEAD。 |
| F7 | `P3 / PROCESS_EVIDENCE_GAP`，不阻塞 | Story 15/16/27/61/63 恢复各自 `PUBLIC_BEHAVIOR_VERIFIED` 与原行为 sourceState；性能结果只留在 F benchmark，测试锁定两类 provenance 不互相覆盖。 |

## Query/scan contract correction

25-A 的 query/scan 数值、预算上限、warm-up、measured runs 和 wall-clock baseline 未改变。F2 证明旧的 fake capability 计数不是可接受的 persistence boundary，因此 frozen protocol 的 repeat-isolation 文字澄清为：每次 warm-up/measured operation 都创建并销毁新的 disposable SQLite-backed OperationalStore fixture，重置 SELECT counters，fixture construction 不计入 timed public call。该澄清没有提高预算、缩小 fixture 或添加现场耗时阈值。

## Current tracked contracts

- `25-a-query-scan-budget.json`：3 operations；max queries/scans `8/8`, `6/6`, `6/6`；transport `0`；wall-clock `NOT_APPROVED`。
- `25-a-evidence-manifest.json`：17 tracked artifacts、5 generated artifact definitions、9 responsibility facts，统一 disposition `FACTS_FOR_INDEPENDENT_AUDIT`。
- `25-a-story-matrix.json`：85 stories / 95 rows；10 image portions remain `DEFERRED_IMAGE_EXTENSION`；F7 五行保持原行为 provenance。

## Verification already run on this remediation worktree

- `node --test --test-concurrency=1 tests/ticket-25-a-contract.test.js tests/ticket-25-f-performance.test.js` — `8/8 PASS`。
- `node --test --test-concurrency=1 tests/phase-07-regular-queue.test.js tests/ticket-25-c-regular-platform-acceptance.test.js` — `14/14 PASS`。
- `node --test --test-concurrency=1 tests/article-lifecycle-ticket-15.test.js tests/phase-03-media-order-projection.test.js tests/ticket-25-d-paid-media-acceptance.test.js` — `30/30 PASS`。
- Red-capable pre-fix repro：同一真实 benchmark 在原实现得到 `regular=9/9`、`paid=2001/2001`，并返回 `TICKET_25_F_QUERY_SCAN_BUDGET_FAILED`；修复后 regular measured `2/2`、paid `1/1`。
- 当前最终 DIRTY evidence 的精确 `sourceState.diffSha256`、命令、时间和安全环境摘要以四份报告本身为准；四份报告由当前文档/代码 HEAD 之后重新生成，不能沿用旧 25-F/25-G ignored JSON。
- bounded re-audit：F1 empty-history JOIN、F2/F3 SQLite counters、F4 9 项 manifest、F5 双 parser traversal rejection、F6 4 份当前 ignored evidence provenance、F7 五行 story provenance 均已通过；没有触发 escalation。

## Evidence handoff boundary

bounded re-audit 已核验的 ignored files：

```text
auto—publish/build/evidence/ticket-25-a-contract.json
auto—publish/build/evidence/ticket-25-a-benchmark.json
auto—publish/build/evidence/ticket-25-f-benchmark.json
auto—publish/build/evidence/ticket-25-production-smoke-dirty.json
```

每份报告必须包含精确 `commit`、`sourceState`、Node 版本、命令、时间、结果及 `externalOperations=none`、`credentials=not-collected`、`sensitiveValues=excluded`；不得把这些 ignored JSON 缺席时的旧 handoff 文字当作真实性证明。`ticket-25-production-smoke-clean.json` 在最终 clean integration HEAD 前不得生成。

## Bounded re-audit scope / stop

已复核：F1 empty-history JOIN、F2/F3 SQLite query counters 与预算、F4 九项 manifest completeness、F5 两个 parser traversal rejection、F6 四份当前 ignored evidence provenance、F7 五行 story provenance，以及上述直接回归。结论为 `PASS_PENDING_FINAL_CLEAN_HEAD_AND_USER_EXTERNAL_ACCEPTANCE`；不重开 Ticket 25 全库 fresh review。
