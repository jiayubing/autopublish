# Phase 05 独立复核缺陷修复 Runbook

> 本文是 `08-phase-05-content-lifecycle.md` 和 `08a-phase-05-completion-runbook.md` 的强制补充。
>
> 2026-07-26 独立复核否决了此前的 `Phase 05=COMPLETE / Phase 06=READY` 结论。新 Codex 任务必须关闭本文全部反例并重新执行完整门禁；在此之前，Phase 05 必须为 `IN_PROGRESS`，Phase 06 必须为 `NOT_STARTED`。

## 0. 可直接复制到新 Codex 任务的启动 Prompt

```text
请在 F:/官媒投稿-refactor 原地继续修复 Phase 05 的独立复核缺陷，一次性完成代码、测试、迁移安全、门禁、账本与交接收口。不要开始 Phase 06。

开始前必须完整读取：
1. docs/refactor/00-program-charter.md
2. docs/refactor/01-target-architecture.md
3. docs/refactor/02-codex-execution-protocol.md
4. docs/refactor/08-phase-05-content-lifecycle.md
5. docs/refactor/08a-phase-05-completion-runbook.md
6. docs/refactor/08b-phase-05-independent-review-remediation.md
7. docs/refactor/13-progress-ledger.md
8. docs/refactor/handoffs/phase-05.md

以 08b-phase-05-independent-review-remediation.md 为本次强制修复清单。当前分支应为 codex/refactor-program，Phase 05 起始 HEAD 为 9ff69a073eb7869df930b688d15bfd2dabb79fc8；工作区包含大量已授权保留的 unstaged/untracked Phase 05 WIP。不得 reset、checkout、clean、覆盖、丢弃或遗漏任何既有 WIP，也不得只根据 git diff 判断 untracked 文件。

先记录分支、HEAD、status、staged/unstaged/untracked、diff 和基线，并立即把文档事实恢复为 Phase 05=IN_PROGRESS、Phase 06=NOT_STARTED，记录“2026-07-26 独立复核发现阻断缺陷”。然后测试先行，逐项关闭：
1. Removal takeover 遗留 activeOperation 导致显式 retry 永久 needs_repair；
2. metadata execute 中途失败留下半迁移且无法自动恢复；
3. rollback 不解析/验证 manifest/hash，允许篡改 backup 被恢复；
4. ArticleEditor 在 A 保存期间切换 B 后永久 isSaving，并处理按钮保存失败的未处理 Promise；
5. clients/ 缺失时 migration scan 提前返回、漏审 generated/；
6. 修正文档测试计数，使其来自本次真实命令输出而不是硬编码旧数字。

必须先写能稳定复现每个反例的失败测试，再做最小但完整的生产修复。Removal 不得靠清空 activeOperation 或重复执行不具备幂等证据的破坏性操作来“修复”；migration 不得靠正常路径绿测声称原子性，必须覆盖逐写入故障、manifest/backup 篡改、恢复故障、重复 execute 和扫描根缺失；ArticleEditor 测试必须覆盖组件真正使用的状态机，不能只测试未被组件使用的旁路 controller。

完成实现后，先运行本文专项门禁，再运行 08a 的全部 Phase 05 定向门禁、npm test、lint、renderer/bridge/main typecheck、format、links、packaging、renderer build、pack smoke 和 git diff --check。逐条记录准确 pass/fail/skip 数量和故障注入观察值。

只有本文和 08/08a 的全部完成条件都满足，才可把 Phase 05 恢复为 COMPLETE、Phase 06 恢复为 READY。任一反例、测试、静态检查、构建或制品门禁未通过，都必须保持 Phase 05=IN_PROGRESS、Phase 06=NOT_STARTED，并在 handoff 中写出首个失败 symbol、命令和证据。

未经用户单独授权，不得 stage、commit、push、创建 PR；不得连接真实投稿/付费/生产系统，不得读取、选择、复制、迁移或修改真实内容库。只允许使用临时合成 workspace 和脱敏 fixture。最终向用户报告结果并等待独立复核与 commit 授权。
```

## 1. 当前事实与授权边界

### 1.1 当前工作区事实

- 工作区：`F:/官媒投稿-refactor`
- 分支：`codex/refactor-program`
- Phase 05 起始 HEAD：`9ff69a073eb7869df930b688d15bfd2dabb79fc8`
- Phase 05 WIP 尚未 staged、尚未提交，并包含 untracked 文件。
- Phase 04 的外部人工验收仍为 `PENDING_HUMAN`；它不阻止本地 Phase 05 修复，但继续阻止正式 release。
- 以前的绿测是基线线索，不是本次完成证据。
- 本轮最终复跑：P1 组合为 `14/14`，08b 六文件专项为 `45/45`，08a 原主定向为 `112/112`，Phase 05 扩展定向为 `136/136`；`npm test` 收集 `189` 个测试文件并为 `1001 pass / 0 fail / 0 skip`。这些数字来自本次命令最终 summary，不沿用旧的 `105/105`、`38/38`、`994/994`。

### 1.2 允许修改范围

- `src/content/article-removal-service.js`、其 transaction store、scheduler、ContentStore/ArticleStore 契约及对应测试。
- `scripts/migrate-content-metadata-v1.js`、migration fixture/测试和必要的 production fail-closed guard。
- `media-workbench/src/components/ArticleEditor.tsx`、组件实际消费的 session/reducer 及对应测试。
- Phase 05 账本、交接、阶段文档和必要的 ADR/CONTEXT。
- 为验证上述修复所需的最小 composition/IPC/diagnostics 调整。

### 1.3 禁止事项

- 不得 reset、checkout、clean、覆盖或删除用户/前序任务 WIP。
- 不得把不确定的破坏性 operation 当作成功，也不得仅删除 `activeOperation` 后继续。
- 不得降低 claim token、revision CAS、lease、fence、stale-lock、内容 fingerprint 或 tombstone 安全边界。
- 不得为了通过测试关闭或跳过 migration hash、symlink、边界、冲突检查。
- 不得引入只为兼容旧路径的长期 wrapper；生产调用仍必须保持唯一 ContentStore/ArticleStore seam。
- 不得进入 Phase 06，不得连接真实外部系统或真实内容库。
- 未经用户单独授权不得 stage、commit、push 或创建 PR。

## 2. 开始前的强制步骤

### 2.1 保护现有 WIP

先执行并把结果写入 `docs/refactor/handoffs/phase-05.md`：

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --name-only
git diff --cached --name-only
git diff --stat
```

要求：

1. 单独记录 modified、staged 和 untracked；不得遗漏 `git diff` 看不到的 untracked 文件。
2. 若分支或 HEAD 与上述事实不同，先查明原因，不得擅自切换或恢复。
3. 不允许用任何清理命令获得“干净基线”。

### 2.2 先纠正文档状态

在开始生产修复前更新：

- `docs/refactor/13-progress-ledger.md`：Phase 05=`IN_PROGRESS`，Phase 06=`NOT_STARTED`。
- `docs/refactor/handoffs/phase-05.md`：状态改为 `IN_PROGRESS`，列出本文六项缺陷和独立复核日期。
- `docs/refactor/08-phase-05-content-lifecycle.md`：不得保留当前 `COMPLETE/READY` 完成声明；改为指向本文并说明重新验收中。

状态调整只是纠正事实，不代表代码修复完成。

### 2.3 复跑当前基线

至少先运行：

```powershell
cd F:/官媒投稿-refactor/auto—publish
node --test tests/article-removal-service.test.js tests/article-removal-transaction-store.test.js tests/article-removal-recovery-scheduler.test.js tests/article-attention-query.test.js tests/content-metadata-migration.test.js tests/article-editor-session.test.js
git diff --check
```

记录实际测试数量。现有测试可能全部为绿，这是预期现象；本文要求新增反例测试。

## 3. 阻断项 A：Removal activeOperation 必须可证据化 reconciliation

### 3.1 已复现问题

`article-removal-service.js#performSteps()` 在事务带有 `activeOperation` 时立即转入：

```text
status=needs_repair
errorCode=ARTICLE_REMOVAL_OPERATION_IN_FLIGHT
resolutionCode=REMOVAL_OPERATION_REQUIRES_RECONCILIATION
```

显式 `retryArticleRemovalTransaction()` 再次进入同一分支，没有任何 reconciliation 或清除路径。独立探针已观察到：

- `moves=1`
- 文章已经位于 trash
- 事务保留 article `activeOperation`
- 每次显式 retry 都仍为 `needs_repair`

这不是“安全地等待人工处理”，而是没有任何人工或程序入口能够完成事务。

### 3.2 先写失败测试

至少新增以下测试；必须先看到旧实现失败：

1. runner A 在 `moveArticleToTrash()` 已完成、完成 checkpoint 前失去 lease；runner B takeover 后事务进入可见 repair 状态。
2. 用户显式 retry 时，如果 `isArticleTrashed(clientId, articleId)` 证明目标后置条件成立，应清除对应 article operation、推进 `articleCursor`，最终 `committed`，且总 move 次数仍为 1。
3. 如果 source 仍存在且 trash 不存在，只能使用相同稳定 `operationId` 执行被 store 明确定义为幂等的 move；总效果只能有一个 trash article/tombstone。
4. source 与 trash 同时存在、同时不存在但不能证明既有结果、operationId/cursor/kind 不匹配时 fail-closed 为 `needs_repair`，不得猜测 cursor。
5. queue operation 在破坏性调用完成、checkpoint 前失去 lease后的 takeover/retry。
6. queue 后置条件能证明已经完成时推进一次；仍未完成时，只能通过具备稳定 operationId/幂等契约的 API 重试；无法证明时保持可操作的 `needs_repair`，并输出明确 resolutionCode。
7. 旧 runner 在 takeover 后任何 checkpoint 都继续被 claim token + revision CAS fence 拒绝。
8. reconciliation 自身的读取、查询、persist、CAS 失败遵循 retry/backoff/maxAttempts；身份或状态冲突进入 `needs_repair`，不执行新破坏性 I/O。
9. scheduler 仍只自动领取合法 `pending_auto_recovery/pending_recovery`；`needs_repair` 只能通过显式 retry/resolve 入口处理。

### 3.3 实现约束

建立一个明确的 operation reconciliation seam，按 `activeOperation.kind + cursor + operationId` 处理，不得在 `performSteps()` 顶部无条件重新 repair。

article operation 的安全决策至少包含：

```text
目标已在 trash 且 identity/tombstone/operationId 可验证
  -> 视为该 operation 已完成，清 operation，推进 cursor，CAS checkpoint

源仍存在、trash 不存在，且 moveArticleToTrash 对相同 operationId 有持久幂等保证
  -> 以相同 operationId 重试，再验证后置条件

状态矛盾、身份变化、结果不可证明
  -> needs_repair，不清 operation，不猜 cursor，不搬移
```

queue operation 必须二选一或组合：

- 提供只读的 action-specific 后置条件查询，由当前 OperationalStore/Submission service 证明 cancel/cleanup 已完成；或
- 让 destructive command 接受并持久识别稳定 operationId，证明重试幂等。

仅凭“当前 preview 中不再出现”是否足以证明完成，必须逐 action 论证并测试；不能把 queue action 从数组删除来绕过不确定性。

完成 reconciliation 后必须保持：

- claim owner/token/lease 与 revision CAS；
- 每次破坏性 I/O 前 fence；
- checkpoint 续租；
- dispose 阻断在途恢复继续 I/O；
- diagnostics 有界、结构化且不泄露敏感内容；
- attention 区分自动恢复和人工 repair。

## 4. 阻断项 B：metadata migration 必须具备真正的事务与可校验 rollback

### 4.1 已复现问题

当前 execute：

1. 复制 workspace 到 backup；
2. 逐个直接改写 workspace 文件；
3. 所有写入完成后才生成 manifest。

在第二个文件写入故障时，已观察到第一个文件为 v1、第二个仍为旧 schema、manifest 不存在；rollback 随后因 `CONTENT_METADATA_MANIFEST_MISSING` 拒绝执行。

当前 rollback 只检查 manifest 路径存在，从不解析或验证 manifest/hash。篡改 backup 中的 `client.json` 后，rollback 仍返回成功并把篡改内容恢复到 workspace。

### 4.2 先写完整故障测试矩阵

对 `tests/content-metadata-migration.test.js` 增加真实文件系统 fixture 与精确故障注入，至少覆盖：

#### 扫描与 dry-run

1. 空 workspace。
2. `clients/` 存在、`generated/` 不存在。
3. `clients/` 不存在、`generated/` 存在：必须扫描 articles，不得提前返回。
4. 两个 root 都存在；ClientId、ArticleId、GenerationTaskId 的 0/1/many、损坏 JSON、非法时间全部准确报告。
5. root 是普通文件、symlink、junction、越界路径时 fail-closed。
6. dry-run 重复执行结果稳定且 workspace byte-for-byte 不变。

#### execute 原子性与中断

7. backup copy 中途失败：workspace 不变，无“成功” manifest。
8. manifest/journal 准备失败：workspace 不变。
9. 第一个、任意中间、最后一个 metadata 写入/rename/fsync 失败：函数返回失败后 workspace 与执行前逐文件 hash 一致。
10. 写入完成但最终 checkpoint/manifest 完成失败：不得留下 production 可接受的半迁移状态。
11. 自动恢复自身失败时保留可诊断 recovery marker 和完整 backup，不得误报 execute 成功；production 必须 fail-closed，直到显式恢复。
12. process interruption 可用持久 transaction marker/journal 或等价设计恢复；下一次 execute/rollback 能识别状态，不能当成全新迁移覆盖证据。
13. 重复 execute 幂等：第二次为明确 no-op 或安全识别已完成事务，workspace hash 不变。具体 backup 复用策略必须写入交接。

#### manifest 与 rollback

14. manifest JSON 损坏、版本错误、workspace identity 不匹配、重复/越界 path、缺 entry、额外 entry、hash 格式错误时拒绝 rollback。
15. backup 任意文件被修改、删除或额外注入时，rollback 在触碰 workspace 前拒绝。
16. 当前 workspace 是否要求匹配 manifest 的 after hash必须作出明确策略；若用于回滚已发生的新用户写入，默认应拒绝覆盖并进入人工处理。
17. rollback restore 到 staging 后逐 hash 验证，再切换为 workspace；恢复复制/验证/切换任一步失败时，原 workspace 必须保持可恢复。
18. rollback 成功后，整个内容库相对执行前 snapshot 的文件清单与逐文件 hash 一致，不能只比较一个 `client.json`。
19. rollback 重复调用的语义明确、可测试，不误删 workspace 或 backup。

### 4.3 推荐的安全结构

实现可采用等价设计，但必须满足以下可观察不变量：

```text
scan + plan
  -> 建立独立 snapshot（不要把 manifest 混入将被恢复的 snapshot 根）
  -> 生成完整文件 inventory/hash 和 migration plan
  -> 原子写入 PREPARED manifest/journal
  -> 在 staging 中生成并验证完整目标结果，或为所有写入准备可恢复事务
  -> COMMITTING（持久 marker，production fail-closed）
  -> 安全切换/逐文件提交
  -> 验证整个目标 inventory/hash
  -> COMMITTED
```

关键要求：

- manifest 必须在第一次 workspace mutation 前持久存在并可校验。
- manifest 至少包含 schema/version、canonical workspace identity、transaction id、创建时间、状态、完整 snapshot inventory，以及每个文件的相对路径、size 和 SHA-256。
- 所有 manifest path 必须 canonicalize 并验证位于 snapshot/workspace 内；拒绝绝对路径、`..`、重复路径、symlink/junction 和类型变化。
- backup 建议使用 `backupRoot/snapshot/`，manifest/journal 位于 snapshot 外，避免 rollback 把 manifest 当成用户内容复制回来。
- execute catch 不得吞掉恢复失败；需要保留原始错误、恢复结果和安全诊断。
- “atomicWrite 单文件原子”不等于“多文件 migration 原子”。必须用故障测试证明整个 workspace 的事务行为。
- 若依赖应用关闭执行，CLI 必须验证/记录该前置条件；对遗留 migration marker，production reader/writer 必须 fail-closed 或由启动恢复先处理。

### 4.4 rollback 校验顺序

rollback 在任何破坏性动作前至少完成：

1. manifest 为普通文件，严格解析且 schema/version/state 合法。
2. manifest 绑定当前 canonical workspace 与本次 transaction。
3. snapshot 文件清单、类型、size、hash 全部匹配；不存在未声明文件或越界/symlink。
4. 当前 workspace 与 manifest.after 的冲突策略通过；不得静默覆盖迁移后新内容。
5. 先复制到独立 restore staging 并验证 staging hash。
6. 通过可恢复切换替换 workspace；失败时保留原 workspace 和 backup。
7. 成功后再次验证最终 workspace 与 snapshot hash 一致，再报告 rollback 成功。

## 5. 阻断项 C：ArticleEditor 的真实组件生命周期

### 5.1 已复现问题

路径：

```text
A 保存开始 -> isSaving=true
保存未完成时 activeArticle 切换到 B
effect 只增加 session，不重置 isSaving
A promise 完成时因 session 不匹配，不执行 setIsSaving(false)
B 的保存按钮永久 disabled，handleClose 也因 isSaving 直接返回
```

`App.tsx` 未给 `ArticleEditor` 设置按文章变化的 `key`，因此切换不会 remount。现有 `article-editor-session.js` 测试不能作为证据，因为组件并未真正使用该 controller 管理 `isSaving/saveError/saveSuccess`。

### 5.2 先写行为测试

测试必须覆盖组件真实消费的状态机；可使用轻量 reducer/controller + 组件接线测试，或已有 Renderer 测试设施，不要求为了一个组件引入庞大测试框架。至少覆盖：

1. 打开 A、修改、开始 deferred save，观察 A saving/按钮 disabled。
2. save 未完成时打开 B，B 立即不是 saving，按钮可用，draft/snapshot/error/success 均属于 B。
3. A 随后 resolve，不能修改 B 的 snapshot、success、error 或 saving。
4. A 随后 reject，不能污染 B，也不能产生未处理 Promise rejection。
5. B 自己保存成功后只更新 B baseline；失败时保留 dirty 状态、显示错误、允许重试。
6. 保存中关闭/切换的语义明确；旧 promise 不能关闭新文章。
7. unmount/dispose 后旧 promise 不能 setState。
8. 保存按钮事件处理不得把 rejected Promise 泄漏给 React event handler；`handleClose` 仍能根据明确 success/failure 决定是否关闭。

### 5.3 实现约束

- 选择一个权威 session/state machine，并让 `ArticleEditor.tsx` 真正使用；若不用 `article-editor-session.js`，删除这个旁路抽象及其误导性测试。
- article/session 切换必须建立新 generation，并重置属于旧 session 的 `isSaving/saveError/saveSuccess`。
- 每个异步完成回调都按 generation/session token fence。
- 保存入口返回明确结果，例如 `{ saved, stale, error }` 或 boolean；UI click handler 显式消费 rejection，不能 `throw` 给无人 await 的 `onClick`。
- 不得只在 `App.tsx` 加 `key` 后宣称完成，除非同时证明未完成保存、dirty draft、错误状态和 unmount promise 的全部语义。

## 6. 阻断项 D：migration 不得因 clients root 缺失漏审 generated

这是 migration 修复中的独立完成条件：

- `clients/` 与 `generated/` 必须分别探测和扫描，任一缺失不能导致另一个被跳过。
- root 缺失、空目录、普通文件、symlink/junction 必须有明确且测试化的语义。
- `generated/` 存在但 `clients/` 缺失时，ArticleId/GenerationTaskId/createdAt/corrupt metadata 仍进入报告。
- 如果这种 workspace 结构本身不合法，应在完成扫描后给出 versioned repair item 并阻止 execute，而不是返回看似成功的空报告。

## 7. 测试证据与文档计数

### 7.1 专项修复门禁

实际文件名可因新增组件 harness 调整，但至少执行：

```powershell
cd F:/官媒投稿-refactor/auto—publish
node --test tests/article-removal-service.test.js tests/article-removal-transaction-store.test.js tests/article-removal-recovery-scheduler.test.js tests/article-attention-query.test.js tests/content-metadata-migration.test.js tests/article-editor-session.test.js
```

另外必须有明确命令覆盖新增的 ArticleEditor 真实组件/权威 reducer 测试。若上述命令未包含该测试，应单独记录命令。

不得只报 pass 数；交接必须逐项列出：

- article operation 已完成/未完成/矛盾状态；
- queue operation 已完成/可幂等重试/不可证明；
- stale runner fence；
- execute 每个故障注入点及最终 workspace hash；
- manifest/backup 篡改类型及拒绝发生在 workspace mutation 前；
- rollback staging/切换故障；
- A→B deferred save resolve/reject。

### 7.2 Phase 05 原 runbook 与完整工程门禁

关闭专项缺陷后，完整执行 `08a-phase-05-completion-runbook.md` 第 7 节及项目 canonical 门禁，至少包括：

```powershell
npm test
npm run lint
npm run typecheck:renderer
npm run typecheck:bridge
npm run typecheck:main
npm run format:check
npm run test:links
npm run test:packaging
npm run build:renderer
npm run pack:smoke
git diff --check
```

继续执行 08a 规定的 Phase 05 主定向、静态零引用、唯一 production seam、packaging allow/exclude 和 500/5000 容量门禁。全量 `npm test` 不能替代专项故障门禁。

### 7.3 计数规则

- 从本次命令最终 TAP/CLI 输出抄录实际 pass/fail/skip，不沿用 `105/105`、`38/38` 等旧数字。
- 文档中命令、文件列表和计数必须一一对应；同一测试被两组命令重复执行时不能伪装成“新增独立测试数”。
- 环境变量控制的 skip 必须写出文件、变量、原因和是否影响 Phase 05。
- 超时、截断或没有最终 summary 的命令不得记为通过。

## 8. 完成条件

只有以下条件全部为真，才允许重新声明 Phase 05 完成：

- [ ] 遗留 article `activeOperation` 可通过证据化 reconciliation 最终 committed，不重复 move。
- [ ] 遗留 queue `activeOperation` 对每种 action 有后置条件证明或稳定幂等 operationId；无法证明时保持可操作 repair，不猜结果。
- [ ] takeover 后旧 runner 继续被 token/revision/lease fence。
- [ ] migration 任一 execute 故障后不会留下 production 可接受的半迁移 workspace。
- [ ] manifest 在首次 mutation 前持久化，严格绑定 workspace/transaction 和完整 snapshot inventory/hash。
- [ ] backup/manifest 被修改、删除、注入、越界或损坏时，rollback 在触碰 workspace 前拒绝。
- [ ] rollback 自身失败保留原 workspace 与 backup；成功后整个 workspace 逐 hash 等于执行前 snapshot。
- [ ] 重复 dry-run/execute/rollback 语义明确且有测试。
- [ ] `clients/` 缺失不会跳过 `generated/`。
- [ ] ArticleEditor A→B deferred save 的 resolve/reject 都不会锁死或污染 B。
- [ ] 保存按钮失败没有未处理 Promise，dirty/error/retry/close 语义有测试。
- [ ] 组件测试覆盖实际使用的权威 state machine，不存在仅测试旁路 controller 的假证据。
- [ ] 08a 原有所有 ContentStore、identity、trash、handoff、容量、排序、packaging 和静态零引用门禁继续通过。
- [ ] canonical 全量门禁全部获得完整最终结果。
- [ ] 账本、阶段文档、handoff 的命令、数字、skip、故障证据与实际输出一致。
- [ ] 未访问真实内容库、真实投稿/付费/生产系统。
- [ ] 未 stage、commit、push 或创建 PR。

## 9. 状态与交接协议

### 9.1 任一条件未完成

必须保持：

```text
Phase 05 = IN_PROGRESS
Phase 06 = NOT_STARTED
commit = 未授权、未创建
```

在 `docs/refactor/handoffs/phase-05.md` 记录：

- 首个失败 production symbol；
- 失败测试命令和可观察结果；
- 已通过但不能替代该门禁的测试；
- 下一任务的最小安全入口。

### 9.2 全部条件完成

才允许更新：

```text
Phase 05 = COMPLETE
Phase 06 = READY
完成 commit = 待用户单独授权
```

交接必须独立替代聊天，至少补齐：

- operation reconciliation 状态表和每种 queue action 的幂等/查询证据；
- migration transaction/manifest schema、状态机、故障恢复与 rollback 校验顺序；
- ArticleEditor 权威状态机及真实组件接线；
- 全部命令、准确计数、skip、故障注入与静态检查；
- modified/untracked 文件清单；
- 未连接真实系统、未迁移真实库、未提交的声明。

完成后停止，不得顺带实施 Phase 06；向用户报告并等待独立复核及 commit 授权。

## 10. 2026-07-26 三个 P1 最终验收记录

### 10.1 根因与可靠协议

- Production queue action：故障根因是 destructive queue pair removal 先于 OperationalStore 状态提交。`operational-content-submission-service.js` 现在先由 OperationalStore 建立 durable operation 记录，绑定 `operationId`、batch/item/action、expected status/fingerprint 和 before main/sidecar manifest；主文件与 sidecar 通过 operation staging 和 `prepared → main_staged → sidecar_staged → staged` checkpoint 进入 staging，随后才执行同 operationId 的 OperationalStore 状态变更，最后清理 staging 并写 `complete`。重试只接受同一 operationId 且逐项证明 hash、拓扑、状态和归属；外部修改、partial/unknown topology、fingerprint 或 operation conflict 继续 fail-closed。
- `activeOperation=retryable`：故障根因是 reconcile 后将 retryable 当作 needs_repair，导致显式 retry 不会重进 queue action。`reconcileActiveOperation()` 现在保留 retryable；`performSteps()` 在下一次显式 retry 前重新验证 blockedItems、content fingerprint、remaining queue action identity/fingerprint 和 active operation kind/cursor/operationId，并由 claim token、revision CAS、lease/fence 保护，再复用原 operationId。completed 只推进 cursor；operationId 冲突、归属不明、真实状态冲突或无法证明的后置条件进入 needs_repair。
- ArticleEditor：故障根因是相同 ArticleId 的新 props 被视为新会话或直接覆盖 draft，丢失本地未保存字段。`ArticleEditor.tsx` 现在以稳定 Article identity 选择 `mergeExternal()`；同 identity 合并外部资源和仍等于 baseline 的字段，保留本地 title/remark/dirty/error/save 状态；不同 identity 才 open/reset。session generation fence 继续保护跨文章 save、timer、dispose 和 unmount。

### 10.2 本次测试与门禁

```text
node --test tests/phase-05-p1-blockers.test.js tests/article-editor-session.test.js
  14 pass / 0 fail / 0 skip
node --test tests/article-removal-service.test.js tests/article-removal-transaction-store.test.js tests/article-removal-recovery-scheduler.test.js tests/article-attention-query.test.js tests/content-metadata-migration.test.js tests/article-editor-session.test.js
  45 pass / 0 fail / 0 skip
08a 原主定向：112 pass / 0 fail / 0 skip
Phase 05 扩展定向：136 pass / 0 fail / 0 skip
npm test：189 files；1001 pass / 0 fail / 0 skip
npm run test:links：176/176
npm run test:packaging：33/33
npm run build:renderer：通过，Vite 2140 modules
npm run pack:smoke：通过，非签名 alpha win-unpacked + resources verifier
npm run lint、typecheck renderer/bridge/main、format:check、git diff --check：通过
```

故障注入覆盖 OperationalStore 写失败、main-only checkpoint interruption、外部 queue mutation、partial/all-absent pair、same-operation retry、operationId mismatch、blocked/remaining fingerprint conflict、ArticleEditor same-identity merge、A→B late resolve/reject 和 dispose fence。所有 fixture 均为临时合成 workspace；无真实系统调用。

### 10.3 残余风险与状态

- 静态 composition/zero-reference 检查确认 workspace runtime 仅由 `desktop/composition/content-lifecycle-composition.js` 组装 ArticleStore/ContentStore；IPC 不创建 store，不暴露物理 store API；一次性 `src/content/legacy-migration.js` 是明确 allowlist 例外；metadata migrator 不进入安装资源。
- 用户授权副本 `F:\workspace-migration-copy` 的 migration dry-run/execute/rollback 已完成并记录在第 13 节；Phase 04 四项人工平台验收仍为 `PENDING_HUMAN`。未连接真实投稿、付费或生产系统，原始内容库未被操作。
- 因独立复核尚未确认且用户未授权提交，Phase 05 仍为 `IN_PROGRESS`，Phase 06 仍为 `NOT_STARTED`；未 stage、commit、push 或创建 PR。

## 11. 恢复安全复核整改（待下一轮独立复核）

本轮关闭三个新的 P1 恢复反例：state-applied queue cleanup EIO 不再被误判为 completed；oldRoot 部分清理失败不再删除已验证的新 workspace 或回滚残缺 oldRoot；COMMITTING migration 具备基于持久磁盘证据的 `recover()` / `--recover` 入口。专项结果：queue/migration/lease/editor 六文件 47/47，P1+editor 16/16，扩展 Phase 05 138/138，完整 `npm test` 1005/1005，均为临时合成 workspace。详见 Phase 05 handoff 的决策表与逐条命令；本节不改变 `IN_PROGRESS/NOT_STARTED` 状态。

## 12. rollback 与路径边界补充整改（当前任务）

- rollback 切换新增持久 `ROLLBACK_COMMITTING` 状态；第二次 rename 中断后，`recover()` 根据 snapshot、restore staging、rollback oldRoot 及 before/after inventory 继续恢复，只有 workspace 完整且无残留时才写 `ROLLED_BACK`。`COMMITTED`/`ROLLED_BACK` no-op 先验证完整 inventory 和残留路径。
- migration 所有 evidence root 的 `lstat` 根检查统一拒绝 symlink/junction/非目录；staging 根 symlink 在任何 rename 前进入 `NEEDS_REPAIR`，不把链接安装为 workspace。
- `NEEDS_REPAIR` 恢复默认 fail-closed，必须显式 `--confirm-repair`/`repairConfirmed: true` 才能重试；已安装 workspace 若残留 staging 根不得写成 `COMMITTED`；所有 evidence path 使用 `lstat` 存在性检查，连 dangling symlink 也拒绝。新增 migration 专项 4 项，当前迁移/Removal/Editor 六文件为 51/51，P1+Editor 为 18/18，Phase 05 扩展定向为 142/142；`npm test` 收集 189 个测试文件，1009 pass、0 fail、0 skip。lint、三项 typecheck、format、links 176/176、packaging 33/33、renderer build（2140 modules）、pack smoke、git diff-check 均通过。
- 本节仍不改变 Phase 05=`IN_PROGRESS`、Phase 06=`NOT_STARTED`；未访问真实内容库或外部系统，未 stage、commit、push 或创建 PR。

## 13. 用户授权副本 migration 验收

2026-07-26，用户明确授权对 `F:\workspace-migration-copy` 副本执行 migration 验收；未连接投稿、付费或生产系统，未操作原始内容库。初次 dry-run 发现 13 个客户缺少 `client.json`；12 个客户从生成文章中的一致 `clientId` 补齐，`头一锅` 使用新 UUID `1b9a780e-52c6-4db7-a4a5-a820b7125e65`。修复前副本备份为 `F:\workspace-migration-copy.pre-client-repair-backup`。

副本执行结果：13 clients、52 articles、65 个 metadataVersion 写入；execute 后 manifest=`COMMITTED` 且再次 dry-run 为 `writes=0、repairItems=0`；rollback 后 manifest=`ROLLED_BACK`；backup snapshot 与 workspace 均 814 文件，逐文件 SHA-256 差异为 `0`。证据目录为 `F:\workspace-migration-copy.phase05-evidence`，migration backup 为 `F:\workspace-migration-copy.phase05-backup`。副本当前保持 rollback 后状态；Phase 05 仍=`IN_PROGRESS`，等待独立复核，Phase 06 仍=`NOT_STARTED`。
