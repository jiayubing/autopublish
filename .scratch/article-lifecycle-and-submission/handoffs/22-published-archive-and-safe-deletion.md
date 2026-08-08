# Ticket 22 — 已发布档案与安全删除

日期：2026-08-08

Base integration HEAD：`a29a427894db3bf7005b886c967550b76c1ddf5f`

Implementation commit：`6aa9b2b`（`feat: add published archive and safe deletion`）

## Scope 与 owner

- `src/domain/article-lifecycle-terminal-contract.js` 是四个公开 V1 合同的唯一 validator owner，并由 `src/domain/index.js` 导出：
  `parseTerminalTargetV1`、`parseClosedTargetV1`、`parseTombstoneIdentityV1`、`parseDeletionTransactionIdentityV1`。
- publication success 仍只有 Ticket 09 的 `operational-store-publication-success` primitive 写入；Ticket 22 只增加 `listFirstPublicationSuccesses` 只读查询和档案 projection，不增加 writer 或旁路补写。
- `publishedArchiveQueries` 只消费 publication-success primitive；composition 通过 named read capability 注入 Article Management snapshot，IPC/Renderer 只展示 snapshot。
- `articleMutationCoordinator.restoreArticles` / `permanentlyDeleteArticles` 是恢复和永久删除的唯一协调入口，复用既有规范 article-set lock、锁内 lifecycle facts 重读及文件 transaction；`article-trash-service` 不再提供无 coordinator 的 restore/delete fallback。
- `articleRemovalService.transactionDto` 只把 durable deletion/recovery transaction 投影为 `deletionTransactionIdentityV1`，不改变 transaction store 的事实 owner。

## 行为与保留矩阵

| 事实/状态 | 允许操作 | 保留结果 |
| --- | --- | --- |
| 普通平台 `accepted` | 只读查看档案 | 首次成功的实际投稿 evidence、`terminalTargetV1` 和安全远端信息永久保留 |
| 网站媒体可信 status `2` | 只读查看档案及订单历史 | `PAID_PUBLISHED` evidence、订单 snapshot/history、首次发布事实永久保留；售后 observation 不改写档案 |
| `legacy_unavailable` evidence | 只读查看缺失原因 | 标题/正文/图片摘要/时间保持 `null`，UI 展示规范缺失原因，不从当前文章或当前时间补值 |
| 未发布且无活动事实 | 回收、恢复或经确认永久删除 | 永久删除只移除正文；订单、发布/删除最小审计事实不提供删除命令，仍可按已知 article identity 查询 |
| 已发布、活动目标、付费进行中或 uncertain | 禁止恢复/永久删除；已发布同时禁止编辑、入队、改投、复制和回收 | publication success、订单和最小审计事实不被覆盖或回收 |
| 已结束的非发布订单事实（包括终态 status 4） | 可按删除规则删除未发布正文 | supplier order facts 保留，删除操作不触碰 OperationalStore |

删除确认在锁外读取的 tombstone 进入 coordinator 后会做锁内 `expectedTombstone` 比较；确认期间 tombstone 改变会返回 stale confirmation，不删除正文。锁释放或文件 transaction 结果不确定时保持 manual-check/repair 语义，不伪造成功。

## 公开 V1 合同与 Ticket 23 复用入口

四个合同均固定 `version: 1`，递归 exact/closed，返回冻结对象；嵌套 article/target identity 与 identity array 也经过 validator。所有时间为 canonical ISO instant，fingerprint 为 64 位小写 SHA-256，identity array 限制为 dense、去重且最多 10000 项；extra、路径、正文、token、Cookie、callback、内部表名和任意 metadata 均被拒绝。

Ticket 23 只能通过 `require("src/domain")` 消费上述四个公开 parser（或对应已公开导出），不得从 SQLite/internal schema、tombstone 文件布局或 migration payload 重新定义字段。`terminalTargetV1` / `closedTargetV1` 保持独立于 `publicationEvidenceV1`；`tombstoneIdentityV1` / `deletionTransactionIdentityV1` 保持独立于文件 transaction 内部状态。

## 隐私与依赖方向

- 档案只读展示实际投稿 evidence 中的标题、正文、客户安全快照、目标、提交/首次发布时间、结果、order number、HTTPS remote URL 和图片 fingerprint/layout 摘要；不抓取网页，不从当前文章、图片库或浏览器 session 重建历史。
- IPC projection 和 domain validator 拒绝敏感字段；Renderer 不接触 OperationalStore、文件路径、Cookie、token、二进制或供应商 raw payload。
- archive query → publication-success read primitive；snapshot → named archive read capability；mutation coordinator → article store mutation session + lifecycle facts；IPC → snapshot/projection；Renderer → typed bridge/read model。没有新增平行 lock、coordinator、publication writer 或 order-delete capability。

## Primary Audit

Scope：Ticket 22 diff、09 publication-success primitive、档案 query/snapshot/IPC/Renderer、06 article mutation coordinator、删除 transaction、已发布不可变和未发布删除保留边界。

Checked invariants：唯一 publication-success writer；普通 accepted/status 2 first-wins；aftercare 不改写 evidence；legacy evidence 不补值；恢复/永久删除使用同一规范 article-set lock；锁内事实和 tombstone 重新确认；订单与发布 evidence 不删除；四个 V1 合同递归封闭；Renderer 无旁路 store/writer。

Findings（均已 remediation）：

1. `P1 / INTRODUCED_BY_CHANGE`：restore/permanent-delete 的 coordinator 缺失路径可绕过规范 article-set lock。修复为强制 coordinator，并移除无锁 fallback。
2. `P1 / INTRODUCED_BY_CHANGE`：确认后 tombstone 变化原先未在锁内检测。修复为 `expectedTombstone` 锁内比较，并将变化映射为 stale confirmation。
3. `P1 / INTRODUCED_BY_CHANGE`：非规范 purge clock 可能先删除正文、再因 V1 时间校验失败。修复为在删除前 canonicalize purge time，并把 canonical time 传入文件 transaction。
4. `P2 / INTRODUCED_BY_CHANGE`：`deletionTransactionIdentityV1.articleIdentitiesV1` 可接受 sparse array。修复为 dense-array 校验并增加反例测试。
5. `P2 / INTRODUCED_BY_CHANGE`：档案 UI 可能优先显示普通 attempt remote ID，隐藏 evidence 中的 order number。修复为 evidence `orderNumber` 优先、attempt remote ID fallback。

无 deferred P2/P3；未触发 escalation。bounded re-audit 只复查上述 finding、修复 diff、直接调用方、保留/锁竞态不变量及对应回归，结果 `PASS`。

## Tests / gates evidence

Windows；Node `v24.16.0`；npm `11.13.0`。

- `node --test tests/article-lifecycle-ticket-22.test.js tests/phase-05-trash-confirmation.test.js tests/renderer-publication-history.test.js`：15/15 PASS。
- 直接依赖回归（Ticket 14/15/16、article mutation coordinator、regular outcomes、Phase 03/05、Renderer）：`node --test tests/article-lifecycle-ticket-22.test.js tests/article-lifecycle-ticket-16.test.js tests/article-lifecycle-ticket-15.test.js tests/article-lifecycle-ticket-14.test.js tests/article-mutation-coordinator.test.js tests/regular-platform-outcomes.test.js tests/phase-03-supplier-canonical-behavior.test.js tests/phase-05-trash-confirmation.test.js tests/phase-05-production-removal.test.js tests/phase-05-production-seams.test.js tests/phase-05-p1-blockers.test.js tests/renderer-publication-history.test.js tests/article-lifecycle-ticket-14-renderer.test.mjs`：122/122 PASS。
- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js tests/phase-06-content-read-model.test.mjs tests/renderer-content-read-model-seam.test.js`：44/44 PASS；其中 production capability matrix 131/131 PASS。
- `npm run lint`：PASS。
- `npm run typecheck:main`：PASS；`npm run typecheck:bridge`：PASS；`npm run typecheck:renderer`：PASS。
- `npm run build:renderer`：PASS；Vite 仅报告既有 chunk size warning。
- `git diff --check`：PASS（implementation commit 前）。
- `node --test tests/phase-02-migration.test.js`：4 PASS / 4 FAIL。四个失败仍分别落在原有 `PUBLICATION_SUCCESS_WRITER_CLOSED`：migration synthetic import、lifecycle fault、payload write failure、rename failure；数量、测试和根因与 Ticket 22 起点完全相同。未恢复 legacy writer，也未实现 Ticket 23 migration。

按 Ticket 22 审计建议未运行完整 `npm test`；Wave 6 继续 `BLOCKED`，其完整 final reconciliation 不属于本 Ticket closure。

## Closure

Ticket 22：`COMPLETE`。Primary Audit：`PASS after remediation`。Bounded re-audit：`PASS`。Wave 6 保持 `BLOCKED`；M03、Ticket 23 未进入。

Handoff：`.scratch/article-lifecycle-and-submission/handoffs/22-published-archive-and-safe-deletion.md`
