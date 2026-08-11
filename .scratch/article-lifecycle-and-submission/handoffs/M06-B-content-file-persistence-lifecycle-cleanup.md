# M06-B — Content / File Persistence / Lifecycle Cleanup Handoff

## 状态

- `M06-B=COMPLETE`
- 下一 gate：`M06-C=READY`
- `M06/Maintenance 10.5=PARTIAL`
- `Ticket 25=PENDING/blocked by M06`
- 本包没有启动 M06-C、M06-G 或 Ticket 25。

## Provenance 与范围

本包从 integration HEAD `9d87e167caa89b1e056a47b7f66068839be69084` 开始，在独立 worktree `C:\Users\violet\.codex\worktrees\007d\官媒投稿-refactor` 执行；integration branch `codex/article-lifecycle-submission` 未被修改。开始前已确认仓库根、当前 detached HEAD、clean worktree、空暂存区、无嵌套仓库/子模块、基线祖先关系、M06-A `COMPLETE` / M06-B `READY` 及重复 worktree 风险。没有 push、release、真实登录/投稿/付费/取消/上传或生产数据库操作。

本次只处理 authoritative B inventory 中的 content / file persistence / lifecycle owner 及必要的直接调用链；沿用已经建立的 M06-0/B census，不按 catch 数量重新拆包，也没有扩大到 remote/process/platform、auth/security、operator/release/migration 或 combined M06-G audit。执行依据为根 `AGENTS.md`、`CONTEXT.md`、生命周期 spec、Wave Plan、Execution/Audit Protocol、M06 maintenance 合同、M06-0 inventory 与 M06-A handoff。

## 实现闭环

按唯一 owner 修复了以下失败语义：

- 文章文件事务、content 文件事务、文章锁、removal transaction store、article store：保留 fsync/close/rename/rollback/lock release 的主错误；无主错误时 cleanup/release 失败显式失败；无法清理时保留 recovery evidence，不把 incomplete transaction 当成成功。
- 文章删除与 recovery：读取异常不再映射为“文章不存在”，claim/retry/recovery 状态无法持久化时不合成成功/失败状态；listener、scheduler callback 与 queue subscriber 隔离失败并发出安全诊断。
- generation batch、AI test status 与 Doubao collection/generation persistence：batch/client/material/research/state 读取失败向上游传播；持久化失败不再覆盖远端主结果，也不再伪装 test 成功；运行中状态无法读取时进入显式 `GENERATION_BATCH_STATE_UNAVAILABLE`；session/queue cleanup 失败保留可诊断结果。
- article attention query/policy 与 generation handoff：只有 typed `ARTICLE_NOT_FOUND` 才表示不存在；读取不可用时保留 `lookupStatus=unavailable`，不合成 removed/attention 结论；handoff identity lookup failure 映射为稳定错误，不伪装成 identity conflict。
- 所有新增/调整诊断只使用 allowlisted、sanitized metadata；没有 token、Cookie、headers、客户正文、数据库行或绝对敏感路径。

改动的 production owner 文件：

```text
auto—publish/desktop/ai-provider-test-status-store.js
auto—publish/desktop/services/ai-content-service.js
auto—publish/desktop/services/ai-provider-service.js
auto—publish/desktop/services/article-attention-policy.js
auto—publish/desktop/services/article-attention-query.js
auto—publish/desktop/services/content-generation-batch-service.js
auto—publish/desktop/services/doubao-collection-service.js
auto—publish/desktop/services/generation-submission-handoff-service.js
auto—publish/src/content/article-file-transaction.js
auto—publish/src/content/article-lock.js
auto—publish/src/content/article-removal-recovery-scheduler.js
auto—publish/src/content/article-removal-service.js
auto—publish/src/content/article-removal-state.js
auto—publish/src/content/article-removal-transaction-store.js
auto—publish/src/content/article-store.js
auto—publish/src/content/content-file-transaction.js
auto—publish/src/content/doubao-browser-adapter.js
auto—publish/src/content/doubao-collection-queue.js
auto—publish/src/content/generation-batch-file-store.js
auto—publish/src/content/generation-batch-runner.js
auto—publish/src/core/files.js
```

新增/收窄的公开行为与故障注入测试位于：

```text
auto—publish/tests/ai-provider-service.test.js
auto—publish/tests/article-attention-query.test.js
auto—publish/tests/article-removal-service.test.js
auto—publish/tests/content-generation-batch-service.test.js
auto—publish/tests/generation-batch-store.test.js
auto—publish/tests/generation-submission-handoff.test.js
```

没有新增第二 writer、平行状态机、兼容旁路或 test-only production seam。

## AST inventory 对账

AST inventory 使用 `.scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs`，`parseDiagnostics=[]`。before 为本包开始前已建立的当前 HEAD census，after 为最终 production source。

| 指标 | Before | After | 变化 |
| --- | ---: | ---: | ---: |
| 扫描文件 | 505 | 505 | 0 |
| 含 catch/rejection handler 的文件 | 276 | 275 | -1 |
| 全库 handlers | 1,104 | 1,116 | +12 |
| B handlers | 270 | 282 | +12 |
| B 文件数 | 48 | 47 | -1 |
| B `EMPTY` | 34 | 6 | -28 |

最终 B shape 为：`PROPAGATE_OR_RETHROW=140`、`DIAGNOSTIC=74`、`ASSIGNMENT_MAPPING=10`、`RETURN_OR_FALLBACK=26`、`SIDE_EFFECT_OR_MAPPING=26`、`EMPTY=6`。新增的 12 个 handler 全部服务于 B owner 的 primary-error preservation、cleanup/recovery 诊断、listener isolation 或 state-unavailable outcome；增加 catch 数量没有改变事实 owner。

所有保留的非抛错 handler 已按公开语义登记：

- `ASSIGNMENT_MAPPING`、`RETURN_OR_FALLBACK`、`SIDE_EFFECT_OR_MAPPING` 共 62 项：`EXPLICIT_OUTCOME`，返回稳定状态/结构化结果或完成明确的状态映射，不把 IO/持久化失败伪装成事实成功。
- `DIAGNOSTIC` 共 74 项：按调用点为 `LISTENER_ISOLATION`、`BEST_EFFORT_CLEANUP` 或 `OPTIONAL_PROBE_PARSE`，均使用安全诊断或明确的隔离/探测结果。
- `PROPAGATE_OR_RETHROW` 共 140 项：不保留静默 fallback，向公开调用链传播或转换稳定错误。
- 唯一保留的 6 个 `EMPTY` handler 的逐行 disposition：
  - `auto—publish/src/content/doubao-browser-adapter.js:176,180,191`：`BEST_EFFORT_CLEANUP`。这些是可选 diagnostic artifact pruning；删除失败会保留 artifact 供检查，不改变 collection outcome。
  - `auto—publish/src/content/legacy-migration-planner.js:559,570,593`：`OPTIONAL_PROBE_PARSE`。这些是历史输入的可选 parse/evidence-gap 探测；planner 以显式分类继续，不生成 runnable fact，也不改变正式持久事实。

## 测试与 gate 证据

以下命令在最终 source 变更上实际运行并通过：

- M06-B 全部定向集合：`node --test --test-concurrency=1 tests/ai-content-service.test.js tests/ai-provider-service.test.js tests/article-attention-policy.test.js tests/article-attention-query.test.js tests/article-mutation-coordinator.test.js tests/article-removal-recovery-scheduler.test.js tests/article-removal-service.test.js tests/article-removal-transaction-store.test.js tests/article-store.test.js tests/client-material-store.test.js tests/content-generation-batch-service.test.js tests/doubao-browser-adapter.test.js tests/doubao-collection-queue.test.js tests/doubao-collection-service.test.js tests/generation-batch-runner.test.js tests/generation-batch-store.test.js tests/generation-submission-handoff.test.js tests/phase-08-content-lifecycle.test.js tests/question-store.test.js`：`242/242` passed。
- 追加 direct lifecycle/persistence slices：`66/66`、`71/71`、`74/74` passed；包括 article removal、batch state、AI provider status、attention query、article store、phase 08 与 handoff。
- `npm run test:links`：`189/189` passed。
- `npm run test:migration`：`65/65` passed。
- `npm run test:diagnostics`：`30/30` passed。
- `npm run format:check`：通过，仓库声明的格式文件全部匹配。
- 修改文件 `node --check`：通过；修改 source/test 的 `npx eslint`：通过；`git diff --check`：通过。

曾对本次 27 个 source/test 文件单独运行 `npx prettier --check`，结果因这些既有 B 文件不在仓库 `format:check` glob 且本身已有格式差异而未通过；没有执行 `prettier --write`，避免把无关格式化混入本包。该结果作为 process evidence gap 记录，不影响仓库正式 `format:check` gate。

未运行完整 `npm test`，原因是最终 combined clean-HEAD full gate 属于后续 M06-G；未运行任何真实外部账号、投稿、付费、取消、上传或生产数据库操作。

## Audit 结论

Primary Audit 已覆盖 B inventory、唯一 owner 与直接调用链、文件事务/rollback、锁与 recovery、batch/AI state、attention lookup、listener isolation、诊断敏感信息边界及 A 直接回归。未发现 P0/P1，未发现需要扩大至 M06-C/G 或 Ticket 25 的 blocking finding；因此没有虚构额外 remediation，也没有改变冻结 scope。

随后执行 bounded re-audit，仅复核最终 diff 新增的 primary-error preservation、cleanup/release failure、typed not-found/unavailable、state-unavailable 与 status-persistence 路径，以及其直接回归测试。结果通过，未重新开启 fresh full review；M06-A 相关 phase 08/owner 行为未回归。

最终单一实现 commit SHA 在提交后由 `git rev-parse HEAD` 记录于本 handoff 的交接回复；本 handoff 与实现及状态更新同步提交。提交后必须保持 worktree clean，且不得 push 或合并 integration。
