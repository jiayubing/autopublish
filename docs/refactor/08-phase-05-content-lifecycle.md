# 阶段5：内容身份、交接与删除生命周期

> **强制收口补充：** 已启动 Phase 05 的后续 Codex 任务必须同时完整读取并执行
> `08a-phase-05-completion-runbook.md`。该 runbook 记录当前 WIP 的剩余 production
> caller、安全缺口、执行顺序、静态检查和最终门禁；不得只依据旧聊天或定向绿测标记本阶段完成。

## 1. 阶段目标

收敛客户、文章、生成任务、投稿交接、草稿、回收站和永久删除的identity与生命周期。文件内容继续保留，但所有caller通过深Content modules解释逻辑identity、路径和跨publication约束，不再自行拼目录或扫描全库猜测唯一性。

关联工作：OPT-012、016、017、018、019、025；覆盖F-H02、F-M09～M12、F-M15。

## 2. 开始条件

- 阶段4为`COMPLETE`或其代码完成且仅剩明确的外部人工验收。
- PublicationWorkflow/OperationalStore和account-aware target稳定。
- 平台adapter不再直接解释文章文件、trash或生成任务。

## 3. 必读输入

- 总纲、目标架构、协议、进度账本和阶段3/4交接。
- 根及应用CONTEXT、现有内容/删除ADR。
- M03、M14、M15、M17、M18、M19、M20、M21、M23 module报告。
- ArticleStore、client knowledge/material/question、generation batch/handoff、submission preparation、trash/removal、attention查询和ArticleEditor。
- OPT-012、016～019、025。

## 4. 允许修改

- ContentIdentity、ContentStore、GenerationHandoff、Trash/Removal modules。
- 文章/客户文件schema及必要的一次性迁移；必须保留内容备份和dry-run。
- 与OperationalStore查询publication约束的application seam。
- 对应IPC command/DTO，但不重构Renderer页面结构。
- 内容、迁移、删除恢复、容量和排序测试。

## 5. 禁止修改

- PublicationWorkflow状态机和平台adapter。
- 把文章正文迁入operations SQLite。
- 根据目录名、文件名或标题重新定义稳定identity。
- 自动删除重复/损坏内容来“修复”迁移。
- 无fingerprint重验的破坏性恢复。

## 6. 实施步骤

### 6.1 建立ContentIdentity module

- ClientId到真实目录只有一个resolver。
- ArticleId到文章位置只有一个resolver/query。
- GenerationTaskId查询返回0/1/many闭集结果；many是冲突，不自动选第一条。
- 路径解析验证普通文件/目录、workspace包含关系、symlink和重复metadata。
- Caller只传逻辑identity，不传自行拼接路径。

### 6.2 深化ContentStore

围绕用例提供interface，例如读取文章聚合、保存草稿、列出稳定排序、查询generation identity、创建内容快照。隐藏journal、备份、文件命名和metadata细节。

默认历史排序固定为createdAt倒序和稳定tie-breaker；编辑/审核不改变创建顺序。需要“最近更新”时作为独立查询，不污染默认语义。

### 6.3 修正草稿生命周期

- Editor初始化真实`remark/ignoreImages`等全部字段。
- Dirty根据初始快照和当前值计算。
- 直接打开关闭不写盘。
- 保存失败不关闭、不清dirty，并返回安全错误。
- 客户/文章切换结束旧编辑会话，旧保存结果不能写新文章。

### 6.4 重构GenerationHandoff

- Handoff只接受稳定ArticleId/GenerationTaskId和明确targets。
- ContentStore生产interface必须提供唯一查询，不允许测试double比production adapter能力更强。
- Duplicate task产生可见conflict，不自动入队。
- Handoff调用PublicationWorkflow/Submission application seam，不自行写batch/sidecar/ledger。
- 批次一次建立索引，避免N×M全库扫描。

### 6.5 重构Trash confirmation

- Prepare返回绑定ArticleId、tombstone fingerprint、deletedAt/version和TTL的一次性token。
- Execute重新读取并比较当前tombstone；旧token、过期token和新版本均拒绝。
- 双窗口、restore→retrash、重复点击和客户端切换均测试。
- Token只存在内存，不成为长期授权。

### 6.6 重构Removal recovery

- Removal transaction每一步保存稳定identity、fingerprint、cursor、attempt和错误类别。
- Bounded backoff scheduler由workspace生命周期owner管理，启动后自动恢复，不依赖重启。
- 达到最大次数进入`needs_repair`并派生attention。
- 每次恢复破坏性步骤前重新验证publication状态、内容identity和fingerprint。
- Scheduler dispose后不再I/O；同事务不能被两个runner领取。

### 6.7 删除旧路径

- 删除caller自行拼`clients/<id>`路径。
- 删除可选`findByGenerationTaskId`降级逻辑。
- 删除无版本trash token。
- 删除只在启动执行一次的伪auto-recovery。
- 删除按updatedAt实现默认创建顺序的测试/implementation。
- 新interface测试稳定后删除旧store内部结构测试。

## 7. 数据迁移

如文章/client metadata需增加或规范identity：

- Dry-run列出无ID、重复ID、目录冲突、损坏metadata和将写入记录。
- 绝不通过文件名相似或标题猜测identity。
- 冲突内容保留原位并生成repair report。
- 正式迁移写新文件后验证，再原子替换；保留整个内容库快照。
- Operations SQLite引用同步更新必须在应用关闭的迁移事务中完成。

## 8. 测试要求

- 目录名不等于ClientId的全链测试。
- ArticleId和GenerationTaskId的0/1/many测试。
- 路径越界、symlink、损坏/重复metadata。
- Draft open/close/save fail/client switch交错。
- Generation handoff duplicate和500/5000任务容量。
- Trash token TTL、版本、双窗口、restore/retrash。
- Removal fake clock、backoff、强杀、重复runner、needs_repair。
- Publication active/uncertain时删除阻断。
- 内容迁移dry-run、冲突和回滚。

## 9. 完成条件

- 所有内容caller使用ContentIdentity/ContentStore interface，不自行拼路径。
- Production唯一查询与测试能力一致。
- 草稿无打开关闭清零，失败保持可恢复。
- Handoff不写publication/batch内部状态。
- 旧trash token不能作用于新tombstone。
- Removal无需重启自动恢复且有上限、幂等和attention。
- 默认文章排序稳定且符合CONTEXT。
- 所有迁移冲突保留并可人工修复。

## 10. 停止条件

- 需要通过标题、目录名或列表第一项猜测identity。
- ContentStore interface暴露journal/备份/路径顺序给caller。
- 自动恢复可能重复执行永久删除。
- Operations SQLite和文件迁移无法在一个停机步骤保持引用一致。
- 发现用户内容需要删除才能通过测试。

## 11. 交接重点

记录ContentIdentity/ContentStore interface、迁移报告格式、删除恢复状态机、scheduler owner、所有破坏性command、旧路径删除清单和阶段6可安全消费的content DTO。

## 12. 本次收口结果（2026-07-26，三个 P1 已修复并重新验收）

- 状态：`IN_PROGRESS`；Phase 06：`NOT_STARTED`。本轮只收口三个独立复核 P1，阶段状态仍等待独立复核与后续授权，不宣布 `COMPLETE/READY`。
- P1-1 Production queue action 的根因是先删除 queue 主文件/sidecar、后写 OperationalStore，写失败会留下“文件缺失 + item 仍 queued”的不可恢复窗口。现以 OperationalStore-backed `submission_item_operations` 持久化稳定 `operationId`、expected status/fingerprint、before pair manifest 和 checkpoint；主文件、sidecar 按 `prepared → main_staged → sidecar_staged → staged → state_applied → complete` 迁入 operation staging，数据库状态变更后再清 staging。相同 operationId 只恢复同一操作并可幂等收敛；hash、拓扑、状态、operation 归属或 staging 不可证明时 fail-closed，不放宽 fingerprint。
- P1-2 `activeOperation=retryable` 的根因是 reconcile 结果被无条件转成 `needs_repair`，显式 retry 从未复用原操作。现在保留 `retryable`，retry 前重验 blockedItems、剩余 queue action fingerprint、content identity、active operation 的 kind/cursor/operationId 归属，并继续使用 claim token、revision CAS、lease 和 I/O fence；通过后由原 operationId 再次调用 queue action。completed 只推进一次 cursor；operationId 冲突、归属不明、状态矛盾或真实 fingerprint 冲突保持 `needs_repair`。
- P1-3 同一 ArticleId 的 props 更新会覆盖未保存编辑的根因是编辑会话按 props 生命周期重开/直接覆盖。现在 ArticleEditor 使用稳定 Article identity；同一 identity 调用 `mergeExternal()`，只把未被本地修改的外部字段和资源事实合并，不重置本地 title/remark/dirty/error/save 状态；不同 identity 才 `open()` 重置会话。save、timer、dispose 和跨文章迟到结果继续由 session fence 隔离。
- 唯一生产 seam：`desktop/composition/content-lifecycle-composition.js` 创建唯一 ArticleStore，并组装唯一 workspace ContentStore；运行期 desktop/IPC/content caller 只接收逻辑 identity 和 ContentStore API。一次性 `src/content/legacy-migration.js` 的底层 ArticleStore 创建属于明确迁移 allowlist，不是 workspace runtime。静态检查确认 IPC 不组装 store、不暴露物理 store API，generation caller 不选第一项。
- ArticleRemoval、Trash 和 Handoff 共用 ContentStore snapshot/fingerprint；Removal 继续覆盖 stale-lock live/dead/unknown/corrupt/ABA、双 runner claim/fence 和 dispose 后无新 I/O。`scripts/migrate-content-metadata-v1.js` 的 dry-run、manifest/backup 校验、staging 故障恢复和 byte-for-byte rollback 仍只在临时合成 workspace 验证。
- 本轮定向证据：P1 组合（`tests/phase-05-p1-blockers.test.js` + `tests/article-editor-session.test.js`）16/16；08b 六文件专项 49/49；08a 原主定向 112/112；Phase 05 扩展定向 140/140，均 0 fail、0 skip。覆盖 queue state_applied cleanup 恢复、rollback rename 中断、staging 根 symlink、queue 写失败/中断/外部篡改/部分缺失/相同 operationId retry、operationId 冲突、ArticleEditor 同 identity merge、A→B 迟到 resolve/reject、dispose fence。
- 完整门禁：`npm test` 收集 189 个测试文件，1007 pass、0 fail、0 skip；`npm run lint`、renderer/bridge/main typecheck、`npm run format:check`、`git diff --check` 通过；`npm run test:links` 176/176、`npm run test:packaging` 33/33；`npm run build:renderer` 通过（Vite 2140 modules）；`npm run pack:smoke` 通过（本地非签名 alpha `win-unpacked` 与 resources verifier）。所有测试使用临时合成 workspace/fixture。
- 残余风险：真实内容库 dry-run/execute/rollback、Phase 04 四项人工平台验收仍为 `PENDING_HUMAN`；本轮未连接真实投稿、付费、生产系统，未读取/迁移真实内容库，未 stage、commit、push 或创建 PR。上述边界和独立复核未完成是保持 `IN_PROGRESS/NOT_STARTED` 的原因。

## 13. P1 恢复安全复核补充（2026-07-26）

- queue 的 `state_applied` 不是 completed：只要 operation staging 仍有主文件或 sidecar，恢复必须使用原 `operationId`，重验 batch/item/action、expected fingerprint、terminal item 状态、source/staging 拓扑及哈希，才可清理并 checkpoint `complete`。清理 EIO 保留 active operation 可重试；staging hash/意外目录项/source-staging 重叠均 fail-closed。
- migration 采用持久状态机 `PREPARED → STAGING_VERIFIED → COMMITTING → INSTALLED → CLEANUP_PENDING → COMMITTED`，并有 `ROLLBACK/ROLLED_BACK/NEEDS_REPAIR`。安装验证成功后先持久 checkpoint；`oldRoot` 是可延后清理的残留，不再是 rollback 来源，唯一可信 before 来源为 immutable `snapshot`。
- rollback 另有持久 `ROLLBACK_COMMITTING` 状态；restore switch 中断后由 `recover()` 根据 snapshot、restore staging、rollback oldRoot 和 before/after inventory 继续，只有完整证据才写 `ROLLED_BACK`。`COMMITTED`/`ROLLED_BACK` no-op 也必须验证 workspace inventory 和残留路径。
- `--recover` 在 workspace 缺失前读取并校验 manifest/snapshot：before+staging after 可继续 switch；workspace 缺失+oldRoot before+staging after 可安装；workspace after+oldRoot（完整或可证明的清理残留）可完成 cleanup；所有 evidence root（workspace、staging、oldRoot、restore）根路径 symlink/junction 均 fail-closed；任何 inventory/hash/path/symlink 证据矛盾写 `NEEDS_REPAIR` 并不做删除。`NEEDS_REPAIR` 默认拒绝再次恢复，只有显式 `--confirm-repair`（API `repairConfirmed: true`）才可按同一证据矩阵重试；已安装 workspace 旁存在 residual staging 也不允许 checkpoint 为 `COMMITTED`。状态仍为 Phase 05=`IN_PROGRESS`、Phase 06=`NOT_STARTED`，等待下一轮独立复核。

## 14. 08d 代码审查阻断项整改（2026-07-26）

- 最终状态 Phase 05=`COMPLETE`、Phase 06=`NOT_STARTED`；`08d-phase-05-code-review-remediation.md` 的 A-G 及再次独立复核追加阻断项均已关闭，用户已授权形成 Phase 05 里程碑提交。本轮未开始 Phase 06，也未 push/PR。
- Removal 在首次 queue 前、queue 完成后、每篇 article cursor 前及 ArticleStore 内部 move 前重验同一 ContentStore canonical fingerprint；不一致进入 `needs_repair`，已完成 cursor 不回退。终态 phase/status/resolution 改为同一次 CAS；遗留 `pending_* + committed` 走 finalize-only 自动恢复，不重复 queue/move，完成记录可跨重启查询但不进入 open/attention 投影。
- queue `state_applied` 恢复允许“两个 staging、仅一个、都没有”三种已验证 cleanup 子集；source 必须均不存在，剩余文件仍按 before hash、类型、operation binding、item terminal status 验证。staging 根及祖先在 read/readdir/unlink/rmdir 前以 lstat、realpath 和精确父子关系验证，junction/symlink、额外文件、类型/hash/source 冲突均 fail-closed，外部合成目标保持不变。
- metadata migration 的 `PREPARED/STAGING_VERIFIED/NEEDS_REPAIR+confirm` 进入统一证据矩阵；安全的 partial staging 只从 immutable snapshot 丢弃重建。新增 `OLD_ROOT_READY` checkpoint。manifest transactionId 只接受 UUID v4，所有 staging/old/restore/rollback-old 路径在任何 mutation 前验证为精确安全 sibling。`NEEDS_REPAIR` 持久保存 forward/rollback repair intent；rollback 接受严格 before inventory 子集的 old-root 残留，未知目录/文件、hash/type/symlink/junction 仍在 workspace mutation 前拒绝；只有 workspace=before 且全部 staging/old-root/restore 残留清理后才写 `ROLLED_BACK`。
- App 的 draft 保存与资源增删统一走 revision-safe controller；跨 await 只用 functional updater 合并 title/remark/ignoreImages 并保留最新资源。Editor session 在保存期间出现更新时保持 dirty、取消虚假 success，第二次保存后才收敛。
- ArticleStore 的 expected fingerprint 校验、journal recovery 与 JSON/Markdown trash rename 处于同一 per-article 跨进程独占锁内；save/restore 共用该锁。完整 candidate lock 原子 rename 获锁，canonical lock 原子 rename 后释放；live/dead/unknown owner、ABA 及 acquire/release 进程退出窗口均有真实进程反例。
- OperationalStore schema 升至 v2；v1→v2 在事务内创建并验证 `submission_item_operations` 后记录版本，future schema fail-closed。verifier 精确检查 9 列类型/nullability、operation_id identity、三列 unique、两个 FK target/from/to、连续 `[1,2]` history 与可解析 applied_at；迁移逐表哈希证明所有 v1 表数据不变。
- 本轮 08d 原命令四组为 `40/40`、`26/26`、`15/15`、`22/22`；独立复核扩展为 Removal+ArticleStore `68/68`、migration `26/26`、Editor/App/seams `19/19`、OperationalStore/submission chain `22/22`，均 0 fail/skip。Phase 05 扩展定向 `176/176`。全局：`npm test` 收集 191 文件，`1050 pass / 0 fail / 0 skip`；auth `16/16`、links `180/180`、packaging `33/33`；lint、main/renderer/bridge typecheck、format、renderer build（2141 modules）、pack smoke 和 `git diff --check` 最终通过。全部破坏性测试使用临时合成 workspace；本轮未读取或操作真实内容库/授权副本，未连接真实外部系统。最终独立只读复核未发现剩余 P0/P1。

