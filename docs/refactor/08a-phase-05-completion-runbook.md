# Phase 05 一次性收口执行 Runbook

> 本文是 `08-phase-05-content-lifecycle.md` 的强制执行补充，供新的 Codex 任务在不依赖旧聊天的情况下完成 Phase 05。
>
> 当前状态必须保持 `IN_PROGRESS`，直到本文和原阶段文档的全部完成条件均有代码、测试、静态引用检查和迁移证据。本文不是完成声明。
>
> 如果需要由不熟悉项目的用户执行真实内容库副本验收，请按 [`08c-phase-05-human-acceptance.md`](08c-phase-05-human-acceptance.md) 操作；不得直接对唯一真实内容库执行。

## 0. 可直接复制到新 Codex 任务的启动 Prompt

```text
请继续执行 F:/官媒投稿-refactor 的 Phase 05，并一次性完成本阶段剩余代码、测试、迁移工具、门禁、账本与交接收口。

你必须先完整读取：
1. docs/refactor/00-program-charter.md
2. docs/refactor/01-target-architecture.md
3. docs/refactor/02-codex-execution-protocol.md
4. docs/refactor/08-phase-05-content-lifecycle.md
5. docs/refactor/08a-phase-05-completion-runbook.md
6. docs/refactor/13-progress-ledger.md
7. docs/refactor/handoffs/phase-05.md

把 08a-phase-05-completion-runbook.md 作为本次执行清单，按顺序持续实施，不能只修第一个失败点后停止，不能把绿的定向测试误当成阶段完成。当前未提交工作区是已经授权保留的 Phase 05 WIP；不得 reset、checkout、clean、覆盖或遗漏 untracked 文件。未经明确授权不得提交、推送、连接真实投稿/付费/生产系统、读取或迁移真实内容库。

先记录分支、HEAD、status、staged/unstaged/untracked 和基线，然后测试先行完成：删除恢复剩余并发安全项、ArticleEditor 生命周期、唯一 ContentIdentity/ContentStore production seam、ArticleId/GenerationTaskId 0/1/many 与全部 caller 切换、metadata migration dry-run/execute/rollback、trash/removal 完整故障门禁、500/5000 production handoff 容量、createdAt 时区安全排序。完成后运行 runbook 的全部最终门禁和静态零引用检查。

只有所有完成条件均满足时，才把 Phase 05 写为 COMPLETE、Phase 06 写为 READY；否则必须保持 IN_PROGRESS，并在 phase-05 交接中给出首个未完成 production symbol 和失败证据。不要提交，等待用户单独授权固化 commit。
```

## 1. 权威范围与固定事实

### 1.1 权威顺序

发生冲突时按以下顺序处理：

1. 当前用户指令和安全边界。
2. `02-codex-execution-protocol.md`。
3. `08-phase-05-content-lifecycle.md` 与本文；本文细化收口步骤，不改变原阶段领域目标。
4. `01-target-architecture.md`、CONTEXT、ADR。
5. 当前代码、测试、账本和交接中的可验证事实。

旧聊天和旧审查结论只作线索，不是接口真相。

### 1.2 当前已知工作区

- 工作区：`F:/官媒投稿-refactor`
- 分支：`codex/refactor-program`
- Phase 05 起始 commit：`9ff69a073eb7869df930b688d15bfd2dabb79fc8`
- 当前存在未提交和 untracked 的 Phase 05 WIP，必须原地继续，不能清理后重做。
- 已有用户证据：全量测试曾为 948/948；删除恢复/diagnostics 定向命令曾为 41/41；执行者必须复验，旧结果不替代最终门禁。
- Phase 04 的外部人工验收不阻止 Phase 05 本地实现，但仍阻止正式 release。
- 当前不得开始 Phase 06 Renderer/IPC 结构重构。

### 1.3 授权边界

允许：

- 修改原 Phase 05 允许范围内的 ContentIdentity、ContentStore、编辑会话、GenerationHandoff、Trash/Removal、一次性 metadata migration、组合根和对应 IPC/DTO/测试/文档。
- 使用临时合成 workspace、fake clock、fake process、故障注入和本地脱敏 fixture。
- 为保证唯一 production seam 调整 `desktop/workspace-runtime.js`、content composition 和 IPC 注入。

禁止：

- 连接真实投稿平台、付费 API、生产账号、真实浏览器 profile 或真实远端系统。
- Codex 自行选择、读取、复制、迁移或覆盖真实用户内容库。
- 修改 PublicationWorkflow 状态机或平台 adapter 来绕过 Phase 05 问题。
- 把正文迁入 Operations SQLite。
- 通过标题、目录名、文件名或列表第一项猜测 identity。
- 为了兼容旧 caller 再叠一层长期 wrapper；阶段结束必须删除旧 production 路径。
- 未经用户另行授权执行 commit、push 或 PR。

## 2. 开始前必须执行

在任何实现前记录：

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --name-only
git diff --cached --name-only
git diff --stat
```

执行者必须：

1. 将当前所有 WIP 文件列入保护清单，包括 untracked 文件；`git diff` 不显示 untracked，不能遗漏。
2. 确认账本 Phase 05=`IN_PROGRESS`、Phase 06=`NOT_STARTED`。
3. 读取本文件列出的 production symbols 及直接 caller/callee。
4. 建立计划，任何时刻最多一个 `in_progress`。
5. 先运行当前 Phase 05 定向基线；如果基线失败，先区分 WIP 缺陷与环境问题，再继续同阶段修复，不得恢复用户修改。

当前定向基线至少包含：

```powershell
node --test tests/question-store.test.js tests/article-store.test.js tests/content-store.test.js tests/generation-submission-handoff.test.js tests/generation-submission-handoff-ipc.test.js tests/phase-05-trash-confirmation.test.js tests/article-removal-service.test.js tests/article-removal-transaction-store.test.js tests/article-removal-recovery-scheduler.test.js tests/article-attention-query.test.js tests/ai-content-ipc.test.js tests/runtime-diagnostics.test.js tests/runtime-diagnostics-ipc.test.js
```

## 3. 目标架构决定

### 3.1 采用的 seam

本阶段选择：**一个 workspace 级 content composition、一个底层 ArticleStore 实例、一个 ContentIdentity/ContentStore production implementation，以及由它支持的少量内聚用例服务**。

- `article-store.js` 保留为文件持久化 implementation，隐藏路径、journal、备份、tombstone 和原子替换细节。
- `ContentIdentity` 负责逻辑 ClientId、ArticleId、GenerationTaskId 的解析及 0/1/many 闭集结果。
- `ContentStore` 负责文章聚合读取/保存、稳定列表、批量 identity 解析、规范化 snapshot/fingerprint 和 trash 所需的内容操作。
- ArticleReview、ArticleVersion、GenerationHandoff、Trash/Removal 可以保持独立用例模块，但必须共享上述 production implementation，不能各自 `createArticleStore()` 或自己扫描目录。
- `workspace-runtime` 或唯一 content composition 是生命周期 owner；IPC 只接收已组装 service，不能自行 new store。

不采用以下方案：

- 只增加一个 `content-store.js` wrapper、保留所有旧 caller：这不会收敛知识与耦合。
- 把所有用例塞进一个巨型 ContentStore：这会混淆 identity、编辑、handoff 和恢复语义。
- 把 index object 暴露给 caller 让 caller 决定何时扫描：容量策略应由 ContentStore 隐藏；优先提供批量解析接口，例如 `resolveIdentities({ articleIds, generationTaskIds })`，或语义等价的小接口。

### 3.2 目标生产调用图

```text
WorkspaceRuntime
  -> ContentLifecycleComposition（唯一 workspace owner）
       -> ArticleStore（唯一文件 implementation）
       -> ContentIdentity
       -> ContentStore
       -> ArticleReview / ArticleVersion
       -> GenerationBatch / GenerationHandoff
       -> Trash / Removal / RecoveryScheduler
  -> IPC（只接收上述已组装 application services）
  -> Renderer（只消费安全 DTO，不学习路径/journal/index）
```

阶段结束时，删除一个 content module 后不应让路径、唯一性、fingerprint 或排序规则重新散落到 desktop/IPC/Renderer caller。

## 4. 实施顺序

必须按 4.1～4.8 顺序推进。每个工作块均遵循：失败测试 → 最小接口 → production caller → 删除旧路径 → 定向回归 → 文档证据。

### 4.1 先彻底收口 Removal recovery

#### A. 当前仍必须修复的四个缺陷

1. **租约在当前破坏性 I/O 中到期仍可重复执行。**
   - 当前 `article-removal-service.js` 只在调用前 CAS/续租。
   - 必须增加“runner A 已进入 `moveArticleToTrash`，租约到期，runner B 接管”的回归；最终只能有一个可观察 destructive effect。
   - 不能把“旧 runner 在下一 checkpoint 被拒绝”当作充分修复。
   - 每个 queue/article action 必须有稳定 operation id，例如由 transactionId + phase + cursor 派生；底层操作必须幂等或接受可验证 fence token。若选择其他协议，必须用跨 runner 测试证明同样不变量。

2. **`needs_repair` 显式 retry 永远无法继续。**
   - 当前成功 `revalidate()` 后 phase 仍为 `needs_repair`，恢复分支不可达。
   - 转入人工修复前持久化 `resumePhase`/安全 cursor；显式 retry 重验成功后恢复该 checkpoint。
   - blocked 已解除、人工修正 queue identity、repairable conflict 已解决、达到 maxAttempts 后人工修复四类都要有“可继续”测试。

3. **content fingerprint 只覆盖部分字段。**
   - 不得继续在 Removal 内手写 `{title, content, status, generation IDs}` 作为完整身份。
   - fingerprint 必须来自 ContentStore 的规范化完整文章 snapshot/version；至少覆盖所有可持久化业务字段，包括 `remark`、`ignoreImages`、source、research/material/template snapshots、review/provenance 和正文标题。
   - 只允许排除明确记录为非语义或运行时派生的字段；排除清单写入测试/CONTEXT。
   - 修改任一持久业务字段后，自动恢复和显式 retry 均必须 fail-closed，不搬移文章。

4. **陈旧 `.lock` 回收存在 ABA/TOCTOU。**
   - 不能基于一次旧读取直接 `unlink(lockPath)`。
   - 回收协议必须保证删除/隔离的是同一个 owner token；两个 stale-lock 回收者竞争时最多一个进入临界区，不能删除对方刚创建的新锁。
   - 活 PID、PID 检查不确定/权限拒绝、锁记录损坏但未过 TTL 均 fail-closed；仅明确 dead owner 且 TTL 到期可回收。

#### B. Removal transaction 必须满足的不变量

| 场景 | 持久状态 | 自动 scheduler | 显式 retry |
|---|---|---|---|
| 可安全自动恢复 | `pending_auto_recovery` + `intent/queue-actions/articles` | 到期后可领取 | 可领取 |
| 旧兼容 pending | `pending_recovery` + 合法 phase | 到期后可领取并规范化 | 可领取 |
| 身份/状态冲突 | `needs_repair` + `resumePhase` | 禁止领取 | 重验成功后恢复 |
| 重试耗尽 | `needs_repair` + `resumePhase` | 禁止领取 | 人工确认后重验 |
| 已提交 | `committed` | 禁止领取 | 幂等查询，不重复操作 |
| 非法 status/phase | fail-closed 并派生 attention | 禁止领取 | 不执行破坏性动作 |

同时满足：

- 每次破坏性操作前重验 publication block/uncertain、完整 content fingerprint、未完成 queue fingerprint、claim/fence。
- queue/read/move/persist 失败统一进入合法 checkpoint；不得出现 `pending_auto_recovery + committed`。
- 成功恢复必须清除旧 `errorCode/nextAttemptAt`，DTO 不得返回 `committed + EIO` 等矛盾组合。
- 新事务首次破坏性动作前已持久化 intent、fingerprint、operation id 和 claim。
- crash 位于“副作用已发生、结果 checkpoint 未写入”时，重跑必须幂等。
- `dispose()` 后不得开始新的 transaction/action；若 implementation 有异步 yield，恢复每个 I/O 前检查 lifecycle signal。
- scheduler rejection 进入有界、脱敏 `runtimeEvents`，真实 WorkspaceRuntime → diagnostics service → IPC 链路有集成测试。
- Attention 稳定区分 `removal_auto_recovery` 与 `removal_needs_repair`。

必须新增或强化的测试：

- takeover during queue action、takeover during article move，两者都断言一个 effect。
- claim token/revision/lease 失效、旧 runner checkpoint、两个进程/两个 store 实例。
- stale lock dead owner、live owner、unknown owner、两个回收者 ABA。
- crash/fault 在每个 action 前、effect 后 checkpoint 前、terminal persist、journal remove。
- needs_repair 修复后 retry 成功，以及修复仍不充分时继续 fail-closed。
- 修改 `remark`、`ignoreImages`、source/snapshot、正文、标题、状态后的 fingerprint 重验。
- fake clock 的 backoff、maxAttempts、非法时间、dispose、scheduler bounded diagnostics。

### 4.2 修复 ArticleEditor 草稿生命周期

目标文件至少包括：

- `media-workbench/src/components/ArticleEditor.tsx`
- 必要时抽取的可测试 editor-session/controller module
- Renderer harness 的行为测试

必须实现：

1. 打开已有文章时初始化完整可编辑字段，尤其 `remark`、`ignoreImages`，不能清零。
2. 保存初始规范化 snapshot；dirty 由 snapshot 与当前 draft 比较，不由“组件曾打开”推断。
3. open → close 零编辑：零 IPC、零写盘。
4. dirty close：遵守现有产品确认语义；不得无条件保存或静默丢弃。
5. 显式保存失败：编辑器保持打开、dirty 保持 true、draft 不清空，显示安全错误并允许重试。
6. 保存成功：仅当前 session/article 可以更新 snapshot 和关闭状态。
7. A 保存尚未完成时切换到 B：A 的迟到 resolve/reject 不得覆盖 B、关闭 B、清除 B dirty 或写 B ArticleId。
8. client switch/unmount 结束旧 session；旧 promise 结果只可被丢弃，不能产生新的保存。

测试不能只用 source regex。至少增加真实 Renderer harness 或等价行为测试，记录 `saveArticle` 调用参数和次数，覆盖：

- 初始化字段保真。
- open-close 零写。
- 保存失败保持打开。
- A→B resolve/reject 交错。
- client switch 与 unmount。

不要在本步骤重构 Renderer 页面布局；那属于 Phase 06。

### 4.3 建立唯一 ContentIdentity/ContentStore production seam

#### A. 接口不变量

- ClientId、ArticleId、GenerationTaskId 都是逻辑 identity，不是路径。
- ClientId resolver 对 0/1/many、重复 metadata、损坏 metadata、symlink、越界给出稳定闭集结果或稳定错误。
- ArticleId 和 GenerationTaskId 查询必须返回 `{kind:"none"}`、`{kind:"one", ...}`、`{kind:"many", matches:[...]}` 等闭集结果；many 永远不能选择第一项。
- 批量 handoff 使用一次批量解析/索引，不得每个 task 全库扫描；index 策略隐藏在 ContentStore 内。
- ContentStore snapshot/fingerprint 是 Removal、Trash token、Handoff preview/commit 的同一权威实现，不能各写一套字段列表。
- 默认文章历史按实际 epoch 的 `createdAt` 倒序；相同 instant 使用稳定 ArticleId tie-breaker。合法不同时区 offset 必须按真实时间排序，不用字符串 `localeCompare` 代表时间。
- invalid legacy timestamp 进入 migration repair report/fail-closed，不在列表中猜测顺序。

#### B. 唯一实例和 caller 切换

必须逐一核对并切换以下当前 production 入口，不能只改 handoff：

- `desktop/workspace-runtime.js`
- `desktop/services/ai-content-service.js`
- `desktop/services/content-generation-batch-service.js`
- `desktop/services/operational-content-submission-service.js`
- `desktop/services/platform-workbench-service.js`
- `desktop/services/generation-submission-handoff-service.js`
- `desktop/ipc/generation-submission-handoff-ipc.js`
- `src/content/generation-batch-runner.js`
- `src/content/article-review-service.js`
- `src/content/article-version-service.js`
- `src/content/article-trash-service.js`
- `src/content/article-removal-service.js`
- submission preparation/query 的 `getArticle` port

目标结果：

- `desktop` production 代码不再各自 import/new `createArticleStore`；仅唯一 content composition/adapter allowlist 可创建。
- IPC 不再 fallback 创建 store；缺少 application service 时启动 fail-fast。
- 用例模块只接收逻辑 ID、聚合、closed result 或安全 snapshot，不接收物理路径/index/journal。
- Test double 能力不得强于 production adapter；production contract test 与 fake contract test 使用同一套断言。

#### C. 删除旧路径

必须删除：

- `generation-batch-runner.js` 的可选 `articleStore.findByGenerationTaskId` 降级。
- `content-generation-batch-service.js` 的 `listArticles(...).find(...)` 第一项降级。
- handoff 同时依赖 `articleStore + contentStore` 的双 seam。
- IPC 内自行构造 ArticleStore/ContentStore。
- caller 自行拼 `clients/<id>`、自行枚举目录或自行计算文章业务 fingerprint。

为此新增 `tests/phase-05-production-seams.test.js` 或等价静态架构门禁；allowlist 必须精确，不得简单禁止底层 implementation 自身。

### 4.4 完成 GenerationHandoff 与 500/5000 容量门禁

必须通过真实 production ContentStore adapter，而不是只用内存 fake：

1. GenerationTaskId 0/1/many；many 产生可见 `HANDOFF_ARTICLE_IDENTITY_CONFLICT`，不入队。
2. ArticleId 0/1/many；task 中 ArticleId 与 GenerationTaskId 指向不同文章时冲突。
3. preview token 绑定 batch revision、targets、AccountProfile、每篇完整 content fingerprint。
4. preview 后文章、batch、target、AccountProfile 任一变化，commit stale。
5. commit 只调用 Submission application seam，不写 sidecar/batch/ledger/OperationalStore 内部状态。
6. client group 局部失败可安全 retry，已成功 group 幂等，不重复创建。
7. 500 和 5000 succeeded tasks 都运行完整 preview + commit；包含多 client、duplicate task、conflict 和 idempotent 项。
8. 容量测试记录耗时、内存/文件规模和关键调用次数；不使用易波动的极窄毫秒阈值，但必须用调用计数或等价证据证明不存在 task × 全库扫描。
9. 5000 项时 ContentStore 至多进行一次 workspace identity scan（或按 client 一次），不能为每个 task 调用全量 `listArticles`。

### 4.5 完成 Trash confirmation 全生命周期

在现有 version/fingerprint/TTL 基础上补齐：

- 两个窗口各自 prepare；一个 execute 后另一个 token 失效。
- restore → retrash 生成新 tombstone/version；旧 token 永远不能作用于新 tombstone。
- TTL 边界、时钟回退/非法时钟 fail-closed。
- 重复点击 execute 幂等拒绝，不重复永久删除。
- client/article 切换后 token 不能跨 identity 使用。
- tombstone fingerprint 使用 ContentStore 权威 snapshot/version，不再维护第三套 fingerprint。
- token 只在 workspace 生命周期内存中存在；dispose/切 workspace 后失效。
- 所有测试只操作临时 workspace，不操作真实内容。

### 4.6 实现 metadata migration/audit、备份与回滚

先检查当前 schema 是否真的需要改写，不得为了“有迁移”制造无意义 schema：

- 如果存在缺失/旧版 metadata，需要实现版本化一次性 migrator。
- 如果当前 schema 无需改写，仍要实现只读 audit/dry-run，证明所有现有受支持 schema 满足 identity 不变量；把“无需写迁移”的决定和证据写入交接，不建立 speculative writer。

可复用 `scripts/migrate-content-library-v2.js` 与 `scripts/migrate-operational-store-v1.js` 的安全模式，但不能改变它们的既有语义。新的 metadata migrator/auditor 必须：

1. CLI 默认不写；明确 `--dry-run` 与 `--execute` 二选一，execute 需要显式确认和独立 backup 路径。
2. 校验 workspace/backup 路径绝对、互不包含、无 symlink/越界。
3. dry-run 不创建或修改输入，输出 versioned JSON report。
4. report 至少包含扫描数、将写入数、缺 ID、重复 ClientId/ArticleId/GenerationTaskId、目录冲突、损坏 metadata、非法时间、symlink、未知/人工 repair 项。
5. 不通过标题、目录名或文件相似性生成 identity；不能安全决定的内容保留原位并进入 repair report。
6. execute 前创建整个内容库可校验快照/manifest；逐文件写临时文件、校验、原子替换。
7. 任一步失败恢复到执行前完整快照；支持显式 rollback，且 rollback 本身校验 manifest/hash。
8. 重复 dry-run/execute 幂等；中断后不得留下半新半旧 schema 被 production writer 接受。
9. 如 ArticleId/ClientId 不改变，不得触碰 Operations SQLite；如确需改变引用，立即触发原阶段停止条件并请求领域决定，不能自行猜测映射。
10. migration CLI 和 backup/report 不进入桌面安装包。

合成 fixture 必须覆盖：空库、当前 schema、每种旧 schema、缺 ID、重复 ID、损坏 JSON/Markdown、目录名不等于 ClientId、symlink、越界、冲突、中断、重复执行、execute 后验证、rollback 后逐 hash 一致。

未经用户提供明确隔离副本路径与授权，不得对真实内容库运行 dry-run 或 execute。合成门禁完成后，把真实副本演练列为 `PENDING_HUMAN`，不能伪造证据。

### 4.7 补齐排序、完整 lifecycle 和 production contract 测试

必须增加：

- `createdAt` 不同 offset 但不同 instant 的正确倒序。
- 表示同一 instant 的不同 offset 使用 ArticleId 稳定 tie-breaker。
- 编辑 title/content/remark/reviewedAt/updatedAt 不改变创建历史顺序。
- ClientId 与物理目录名不同的全链：question/material/article/save/list/review/version/handoff/trash/removal。
- ArticleId/GenerationTaskId 跨 client 冲突。
- production ContentStore 与 fake 的共享 contract suite。
- Trash restore→retrash、Removal crash/reopen、WorkspaceRuntime start/scheduler/dispose/diagnostics IPC 集成。
- production packaging 包含新的 runtime content modules，但排除一次性 migration CLI、backup、report 和 fixture。

### 4.8 删除旧实现并完成文档

代码稳定后才能删除旧路径和过时测试。遵循“replace，不 layer”：

- 新 contract/production 测试覆盖旧风险后，删除只穿透内部文件布局的旧测试。
- 保留对原子文件事务、复杂恢复算法、迁移和诊断有定位价值的内部测试。
- 不做无关格式化或 Phase 06 UI 重排。

更新：

- `docs/refactor/08-phase-05-content-lifecycle.md`：若 interface 发生经验证的细化，记录最终名称和不变量。
- `docs/refactor/13-progress-ledger.md`：实际状态、测试数量、skip、迁移/故障证据、静态零引用结果。
- `docs/refactor/handoffs/phase-05.md`：按 `14-handoff-template.md` 补齐生产调用图、修改/删除文件、迁移、全部门禁、偏差和下一阶段判断。
- 必要的 CONTEXT/ADR：记录 content fingerprint、identity cardinality、migration schema、removal transaction state machine。

## 5. 最终静态检查

执行者必须用 `rg` 检查并把输出/allowlist 写入交接：

1. `createArticleStore` 的 production 创建点只剩唯一 content composition/adapter。
2. `desktop/ipc` 不再 import `article-store` 或 `content-store` 来 fallback 组装。
3. 不存在 `listArticles(...).find(...generationTaskId...)`、可选 `findByGenerationTaskId` 降级或 duplicate 选第一项。
4. desktop/Renderer/content caller 不自行拼 `clients/<id>` 路径；底层 resolver/迁移 implementation 可在精确 allowlist 内出现。
5. ArticleStore 的 path/journal/backup API 不暴露给 IPC/Renderer/application DTO。
6. Removal/Trash/Handoff 不再各自维护不一致的文章 fingerprint 字段列表。
7. 旧无版本 token、启动时一次性伪 recovery、非法 status/phase 自动领取为零引用。
8. migration script 不在 production package files/resources 中。

静态检查应固化成测试，不能只在终端人工看一次。

## 6. 最终测试门禁

在 `F:/官媒投稿-refactor/auto—publish` 依次执行并记录精确 pass/fail/skip、耗时和环境：

### 6.1 Phase 05 定向门禁

```powershell
node --test tests/phase-05-production-seams.test.js tests/content-store.test.js tests/question-store.test.js tests/article-store.test.js tests/generation-submission-handoff.test.js tests/generation-submission-handoff-ipc.test.js tests/phase-05-trash-confirmation.test.js tests/article-removal-service.test.js tests/article-removal-transaction-store.test.js tests/article-removal-recovery-scheduler.test.js tests/article-attention-query.test.js tests/ai-content-ipc.test.js tests/runtime-diagnostics.test.js tests/runtime-diagnostics-ipc.test.js tests/workspace-runtime-lifecycle.test.js
```

再运行新增的：

- ArticleEditor Renderer 行为测试。
- metadata migration/audit/rollback 测试。
- 500/5000 production handoff 容量测试。
- 任何新增 content contract、trash/removal fault test。

如果实际文件名不同，交接必须列出等价命令；不能因为计划中的测试文件尚不存在而跳过对应风险。

### 6.2 全局门禁

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
git status --short --untracked-files=all
```

规则：

- 任何 fail 或非预期 skip 都不能标记 COMPLETE。
- 全量 `npm test` 不能替代 Phase 05 fault/migration/capacity/Renderer 行为门禁。
- 定向绿测不能替代全量、lint、typecheck、build 和 packaging。
- `pack:smoke` 只构建本地非签名目录制品，不进行真实登录、投稿或发布。
- 若工具链环境导致门禁不能运行，记录准确 blocker 并保持 `IN_PROGRESS`；不得把“未运行”写成通过。

## 7. COMPLETE 判定表

以下每项必须回答“是”并给出文件/symbol/测试证据：

- [ ] Removal 当前 I/O 租约过期不会产生重复 destructive effect。
- [ ] `needs_repair` 修复后显式 retry 可以安全继续。
- [ ] Removal/Trash/Handoff 共用完整 ContentStore snapshot/fingerprint。
- [ ] stale-lock ABA、live owner、dead owner 和未知 owner 均有正确边界。
- [ ] scheduler 自动恢复有 backoff/maxAttempts/attention/diagnostics/dispose，非法状态 fail-closed。
- [ ] ArticleEditor 初始化字段保真，open-close 零写，失败保持可恢复，A→B 迟到结果隔离。
- [ ] workspace 中只有一个 ContentIdentity/ContentStore production implementation 和一个 ArticleStore owner。
- [ ] 所有 production caller 已切换，IPC 不自行组装 store。
- [ ] ArticleId/GenerationTaskId 都是 0/1/many；many 不选第一项。
- [ ] handoff 只调用 Submission application seam，500/5000 preview+commit 无 N×M 扫描。
- [ ] Trash token 覆盖 TTL、双窗口、restore→retrash、重复点击、client switch。
- [ ] metadata audit/migration 有 dry-run、repair report、snapshot、atomic execute、rollback 和合成故障证据，或有充分证据证明无需写迁移。
- [ ] `createdAt` 使用真实 epoch 倒序和稳定 tie-breaker。
- [ ] 旧路径/降级/writer 静态检查通过。
- [ ] Phase 05 定向门禁和全局门禁全部通过，0 非预期 skip。
- [ ] 交接可独立替代聊天，记录生产调用图、迁移、故障、容量和删除清单。

只要有一项为否：

- Phase 05=`IN_PROGRESS` 或满足协议定义时=`BLOCKED`。
- Phase 06=`NOT_STARTED`，不得写 READY。
- 交接给出首个未完成 production symbol、失败测试和下一条最小动作。

全部为是时：

- 将账本 Phase 05 更新为 `COMPLETE`，完成 commit 先写 `待用户授权提交`，不能伪造 hash。
- 将 Phase 06 更新为 `READY`，但不在本任务实施 Phase 06。
- 不自动提交；向用户报告建议提交文件范围，等待明确授权。

## 8. 最终回复格式

最终执行者必须按以下顺序回复：

1. Phase 05 最终状态和 Phase 06 是否 READY。
2. 可观察的架构结果与已删除旧路径。
3. Removal/Editor/Identity/Handoff/Trash/Migration/Capacity 各自结果。
4. 所有测试命令、数量、fail/skip、耗时；未运行项明确写未运行。
5. 是否访问真实系统/真实内容库（预期为否）。
6. Git 状态、是否提交（预期为未提交）。
7. 若未完成，首个 blocker 和继续入口；若完成，请求用户授权固化 Phase 05 commit。
