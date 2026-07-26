# Phase 05 未提交代码审查修复计划

> 本文是 `08-phase-05-content-lifecycle.md`、`08a-phase-05-completion-runbook.md`
> 和 `08b-phase-05-independent-review-remediation.md` 的强制补充。
>
> 2026-07-26 对当前全部 staged、unstaged、untracked 变更进行代码审查后，确认仍有
> 内容删除、队列清理、metadata migration、Renderer 保存和 SQLite schema 演进阻断项。
> 在本文全部反例关闭前，Phase 05 必须保持 `IN_PROGRESS`，Phase 06 必须保持
> `NOT_STARTED`，不得提交 Phase 05 完成里程碑。

## 0. 新线程启动 Prompt

```text
请在 F:/官媒投稿-refactor 原地继续 Phase 05，只修复
docs/refactor/08d-phase-05-code-review-remediation.md 中列出的代码审查阻断项，
不要开始 Phase 06。

开始前必须完整读取：
1. docs/refactor/README.md
2. docs/refactor/00-program-charter.md
3. docs/refactor/01-target-architecture.md
4. docs/refactor/02-codex-execution-protocol.md
5. docs/refactor/08-phase-05-content-lifecycle.md
6. docs/refactor/08a-phase-05-completion-runbook.md
7. docs/refactor/08b-phase-05-independent-review-remediation.md
8. docs/refactor/08d-phase-05-code-review-remediation.md
9. docs/refactor/13-progress-ledger.md
10. docs/refactor/handoffs/phase-05.md

当前分支应为 codex/refactor-program，Phase 05 起始 HEAD 为
9ff69a073eb7869df930b688d15bfd2dabb79fc8。工作区包含大量已授权保留的
Phase 05 WIP；不得 reset、checkout、clean、覆盖或丢弃任何现有修改。

严格测试先行，逐项建立本文要求的失败反例，再做最小而完整的生产修复。
所有数据迁移、删除和恢复测试只能使用临时合成 workspace，不得访问真实内容库，
不得连接真实投稿、付费或生产系统。未经用户单独授权，不得 stage、commit、push
或创建 PR。

完成后运行本文全部专项和全局门禁，更新进度账本与 Phase 05 handoff；只有全部通过
并经过再次独立复核，才可以建议 Phase 05=COMPLETE。
```

## 1. 当前事实

- 工作区：`F:/官媒投稿-refactor`
- 分支：`codex/refactor-program`
- 当前 Phase 05 起始 HEAD：`9ff69a073eb7869df930b688d15bfd2dabb79fc8`
- Phase 04：`PENDING_HUMAN`；继续阻止正式 release，但不阻止本地 Phase 05 修复。
- Phase 05：`IN_PROGRESS`；Phase 06：`NOT_STARTED`。
- 本轮审查没有修改生产代码。
- 审查时专项测试为 `51 pass / 0 fail / 0 skip`，但没有覆盖本文列出的竞态与中断窗口。
- 临时打包目录 `auto—publish/release-alpha-fixed/` 已按用户授权删除；它不是源码，
  不得重新纳入提交。若后续仍需使用同名临时制品目录，应加入本地忽略或在验证后删除。

## 2. 修复原则

1. 所有破坏性操作必须先有持久 intent，再有稳定 operationId、身份/fingerprint 重验、
   可证明的后置条件和可恢复 checkpoint。
2. 正常崩溃窗口不能被误判为外部篡改；外部篡改也不能被正常恢复路径吞掉。
3. `state_applied` 表示领域状态已经提交，恢复只能清理可证明的剩余 staging，不能重复
   执行领域 mutation。
4. migration 的每个持久状态都必须有继续、回滚或明确人工修复路径，不能返回永久 no-op。
5. UI 跨 `await` 更新必须基于最新 state；成功提示和 dirty 状态必须与实际持久化快照一致。
6. SQLite schema 变化必须有明确版本、迁移、验证和重复执行证据。

## 3. 阻断项 A：删除前重新验证文章内容指纹

### 问题

`src/content/article-removal-service.js` 在预览和事务创建时记录
`contentArticleFingerprints`，但首次 `perform(claimed)` 没有启用完整重验。队列动作执行期间
或单篇 move 前若另一进程修改正文、remark、snapshot 等字段，当前实现可能把预览后变化的
文章直接移入垃圾箱。

### 必须新增的失败测试

1. 事务 intent 已持久化、首个 queue action 前文章发生修改，删除必须 fail-closed。
2. queue action 完成后、article move 前文章发生修改，文章不得移动。
3. 多文章删除中，前一篇完成后修改后一篇；只允许已证明完成的 cursor 保留，后一篇进入
   可见 repair。
4. `moveArticleToTrash` 内部再次读取与调用方快照不一致时，不得只校验 status 后继续。

### 实现要求

- 首次破坏性操作前执行持久 transaction fingerprint 重验。
- 每篇 move 紧邻 I/O 前重新读取权威 ContentStore snapshot，并与对应持久 fingerprint 比较。
- 最好把 expected fingerprint/operationId 传入底层幂等 move，使“校验 + move”不会留下新的
  无保护竞态窗口。
- fingerprint 不一致进入结构化 `needs_repair`，不得自动覆盖或重新生成 fingerprint。

## 4. 阻断项 B：终态 checkpoint 必须可自动收尾

### 问题

当前先持久化 `phase=committed`，随后才持久化 `status=committed`。两次写入之间进程退出会留下
`pending_auto_recovery + committed`，而 `validAutomaticState()` 不接受 `committed` phase，
scheduler 会永久跳过该事务。

### 必须新增的失败测试

1. 在持久化 `phase=committed` 后模拟进程退出，重建 service/scheduler 后必须自动收尾。
2. 收尾只能写终态和移除/归档 transaction，不得重复 queue action 或 article move。
3. 终态 transaction 查询、attention 和 Renderer watch 不得永久停留在 pending。

### 实现要求

- 优先在同一次 CAS/persist 中写入最终 phase、status、resolutionCode。
- 若必须分两步，`pending_auto_recovery + committed` 必须是明确合法、只执行收尾的恢复状态。
- 完成记录的保留/删除策略必须支持应用在最后一次 persist 后、Renderer 收到结果前崩溃的情况。

## 5. 阻断项 C：`state_applied` 的部分 staging 清理必须可恢复

### 问题

`desktop/services/operational-content-submission-service.js` 要求 `state_applied` 时两个 staged
文件都存在；但 cleanup 会顺序删除 main 和 sidecar。第一个 unlink 成功、第二个 unlink 前崩溃
会留下“源均不存在 + staged 仅剩一个”，恢复却把它判为 operation conflict。

### 必须新增的失败测试

分别在下列位置强制退出/抛错并重建全部 service：

1. 删除 staged main 后、删除 sidecar 前。
2. 删除 staged sidecar 后、写 `complete` checkpoint 前。
3. 两个 staged 文件均删除、目录仍存在时。
4. 剩余 staged 文件 hash 不匹配、类型不安全或目录出现额外文件时。

前三项必须以相同 operationId 幂等完成且不重复 OperationalStore mutation；第四项必须
fail-closed。

### 实现要求

- `state_applied` 恢复矩阵允许 staged 文件为“两个存在、仅一个存在、都不存在”。
- 已存在的 staged 文件必须与 before manifest 精确匹配；source main/sidecar 必须都不存在；
  item terminal status、operation binding、action 和 fingerprint 必须一致。
- 只删除仍存在且已验证的 staged 文件，然后 checkpoint `complete`。

## 6. 阻断项 D：早期 migration checkpoint 不能永久 no-op

### 问题

`scripts/migrate-content-metadata-v1.js#recover()` 对 `PREPARED` 和 `STAGING_VERIFIED`
只验证并返回 `noOp`。再次 execute 仍进入同一 recover，因此事务无法继续、回滚或清理；部分
staging 则会进入无法通过 `--confirm-repair` 退出的 `NEEDS_REPAIR`。

### 必须新增的失败测试

1. manifest 写入后、staging copy 前中断。
2. staging copy 到第一项、中间项、最后一项时中断。
3. staging 完整验证后、写 `STAGING_VERIFIED` 前后中断。
4. 写 `STAGING_VERIFIED` 后、写 `COMMITTING` 前中断。
5. 上述每个状态重复 `recover`、`execute` 和允许的 rollback，结果必须确定且幂等。

### 实现要求

- 完整且 hash 匹配的 staging 应继续推进 `COMMITTING`，不能永久 no-op。
- workspace 仍为 before 且 staging 不完整时，可以从已验证 snapshot 安全删除并重建 staging；
  不得基于部分 staging 猜测完成状态。
- `NEEDS_REPAIR + --confirm-repair` 必须进入同一证据矩阵，而不是再次落回必然冲突分支。
- 每次目录 rename 前后均要有持久 checkpoint 和恢复测试。

## 7. 阻断项 E：rollback 必须接受可证明的部分 old-root 残留

### 问题

execute 在 `CLEANUP_PENDING` 清理 old-root 时可能只删掉一部分后失败。该状态允许 rollback，
且独立 snapshot 才是可信 before 来源；但 `recoverRollback()` 仍要求 migration old-root 完整
匹配 before inventory，导致合法的部分残留必然进入 recovery conflict。

### 必须新增的失败测试

1. old-root 删除第一项、中间项、最后一项时失败，然后执行 rollback。
2. 部分残留全部属于 before inventory 且 hash 匹配时，rollback 成功并删除残留。
3. 残留包含未知路径、hash 变化、symlink/junction 或非普通文件时 fail-closed。
4. workspace 已恢复、rollback old-root 已删除，但 migration old-root 尚未清理时崩溃；再次
   recover 必须完成清理后才能写 `ROLLED_BACK`。

### 实现要求

- 使用 `residualBefore()` 或等价严格子集证明验证部分残留，而不是要求完整 `matches()`。
- `ROLLED_BACK` 只能在 workspace 等于 snapshot 且所有 staging/old-root 残留已安全清理后写入。
- snapshot/manifest 仍需完整 hash 校验；不能因为 old-root 是残留而放宽其路径和类型检查。

## 8. 阻断项 F：Renderer 保存不能覆盖最新资源选择

### 问题

`media-workbench/src/App.tsx#handleSaveDraft()` 在 `await setDraft()` 后从旧 render 闭包读取
`activeArticle.selectedResources`。保存进行中若用户增删资源，后续 state updater 会用旧列表覆盖
最新选择，而且 session 可能把不一致的状态标记为已保存。

### 必须新增的失败测试

1. 开始保存 A，Promise 未完成时增加资源，保存完成后资源不得丢失。
2. 开始保存 A，Promise 未完成时移除资源，保存完成后资源不得重新出现。
3. 保存 A 时切换到 B，A 的迟到结果不得修改 B。
4. UI 最终资源状态与 backend 持久 draft 必须一致；若需要第二次保存，应保持 dirty 并明确执行。
5. 保存失败后新资源选择仍保留，编辑器保持可重试。

### 实现要求

- 不在跨 `await` 的闭包中决定最终 `selectedResources`。
- 使用 functional updater/ref 或明确的 revision/request identity 获取最新状态。
- 若资源选择允许在保存期间变化，应把新变化视为新的 dirty revision；不能用旧保存结果清空它。
- 测试必须覆盖真实 App 回调与 ArticleEditor/session 组合，不能只直接调用 `mergeExternal()`。

## 9. 阻断项 G：OperationalStore schema 必须版本化

### 问题

`src/infrastructure/operational-store/operational-store.js` 新增
`submission_item_operations` 持久表，但 `SCHEMA_VERSION` 仍为 1。当前
`schema_migrations`、backup/restore verifier 和诊断无法区分包含或缺少该表的数据库。

### 必须新增的失败测试

1. 从真实 schema v1 合成数据库升级到新版本，旧数据逐表/逐关键 hash 保持不变。
2. migration 在开始、建表、验证、记录版本前后失败时可重试或回滚。
3. 重复打开/重复 migration 幂等。
4. future schema 被旧 runtime fail-closed 拒绝。
5. backup/restore verifier 明确检查新版本、新表、索引、外键和 schema_migrations 记录。

### 实现要求

- 增加明确的新 schema version 和顺序 migration，不把 `CREATE TABLE IF NOT EXISTS` 当成版本迁移。
- migration 应在事务中完成，并在结构验证成功后记录版本。
- 更新 `verify()`、`verifyOperationalDatabase()`、备份恢复测试、Phase 05 handoff 和 schema 文档。

## 10. 建议实施顺序

1. 保护当前 WIP并记录新的基线测试结果。
2. 先完成 OperationalStore schema migration，使后续 operation 测试运行在最终 schema 上。
3. 修复 queue `state_applied` 恢复矩阵。
4. 修复 Removal 每篇 fingerprint 重验与终态收尾。
5. 修复 metadata migration 早期状态和 rollback 部分残留。
6. 修复 App/ArticleEditor 保存竞态。
7. 运行专项门禁、全量门禁、静态检查与打包 smoke。
8. 更新 `08-phase-05-content-lifecycle.md`、`13-progress-ledger.md` 和
   `handoffs/phase-05.md`，然后请求独立复核；不要自行提交。

## 11. 专项验证命令

在 `F:/官媒投稿-refactor/auto—publish` 执行，测试文件可按实际新增名称补充：

```powershell
node --test tests/phase-05-p1-blockers.test.js tests/article-removal-service.test.js tests/article-removal-transaction-store.test.js tests/article-removal-recovery-scheduler.test.js
node --test tests/content-metadata-migration.test.js
node --test tests/article-editor-session.test.js tests/phase-05-production-seams.test.js
node --test tests/phase-02-operational-store.test.js tests/phase-03-operational-content-submission.test.js tests/phase-03-content-publication-chain.test.js
```

专项通过后执行完整门禁：

```powershell
npm test
npm run test:auth
npm run lint
npm run typecheck:main
npm run typecheck:renderer
npm run typecheck:bridge
npm run format:check
npm run test:links
npm run test:packaging
npm run build:renderer
npm run pack:smoke
git diff --check
```

每条命令必须记录实际 pass/fail/skip、测试文件数、运行环境和故障注入点；不得沿用旧文档数字。

## 12. 完成标准

- 本文 A-G 的每个反例都先红后绿，并有独立、稳定、可重复的测试。
- 删除期间任何内容变化都不会被静默移动；所有 cursor 只推进一次。
- 每个 Removal 合法持久状态都能自动恢复、显式修复或明确保持可操作的人工 repair。
- queue cleanup 在任一 unlink/checkpoint 中断点都可幂等恢复，篡改仍 fail-closed。
- migration 每个状态均有继续/回滚/repair 路径，execute/rollback 后 inventory 与 hash 可证明。
- SQLite schema 版本、migration、backup 和 restore verifier 一致。
- Renderer 保存期间的资源增删和文章切换不会丢状态或误报已保存。
- 临时打包目录和一次性 migration CLI 不进入 production package 或 Git 提交。
- 全部专项和全局门禁通过，文档中的数量来自本轮真实输出。
- 再次独立代码审查无 P0/P1 阻断项。
- 在用户明确授权提交前，Phase 05 继续保持 `IN_PROGRESS`，Phase 06 保持 `NOT_STARTED`。
