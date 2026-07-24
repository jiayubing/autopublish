# M19 回收站与删除事务深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M19 对文章删除执行预览、确认、投稿队列影响评估、持久化跨 store transaction、文章移入回收站、恢复与永久删除。它需要保持 article store、submission batch/ledger、queue pair 和 attention 查询之间的补偿与恢复不变量。

十项维度已覆盖：preview token/TTL/fingerprint、TOCTOU 重验、selection 闭集、active publication 阻断、transaction cursor、队列取消和回滚、启动恢复、错误分类、重复执行、恢复语义、永久删除 tombstone、path/symlink 及测试故障点。发现自动恢复没有自动 backoff 调度，另发现永久删除令牌不绑定所确认的 tombstone 版本。

## 已检查目录与关键文件

- 全部生产文件：`src/content/article-trash-service.js`、`article-removal-service.js`、`article-removal-transaction-store.js`，以及 M18 `article-store.js` 的 trash/permanent-delete 实现。
- 跨模块边界：`desktop/services/content-submission-service.js` 及 submission action/snapshot、publication ledger、article attention、`desktop/workspace-runtime.js` 启动恢复接线、AI content IPC。
- 契约：`docs/content-generation-operations.md` 的统一删除事务和恢复规则、`docs/content-workspace-contract.md`。
- 相关测试：`article-trash-service.test.js`、`article-removal-recovery-regression.test.js`、`article-trash-submission-lifecycle.test.js`、`published-article-trash.test.js`、submission cancellation/reconcile 测试。

## 关键调用链

1. preview removal → 文章与 publication/queue snapshot → 阻断 active 状态 → fingerprint/token → renderer 确认。
2. commit → 重新预检 → durable transaction → 取消队列/ledger → article move → committed；中断时 cursor 保留。
3. workspace 启动 → `recoverPendingArticleRemovals()` → transaction store 列出待处理项 → 每项执行一次 `perform`。
4. restore → article store 从 trash pair 恢复；旧投稿队列不自动恢复。
5. permanent-delete prepare → 内存 token → execute → article store staging 删除正文/metadata，只保留终端 tombstone。

## 候选发现

## TEMP-M19-1：`pending_auto_recovery` 只在启动时尝试一次，没有承诺的 bounded backoff 自动重试

- 分类：错误处理 / 生命周期 / 恢复可靠性
- 所属模块：M19 回收站与删除事务；启动接线关联 M04
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/docs/content-generation-operations.md:272-277`；`auto—publish/src/content/article-removal-service.js:296-363,400-444` `perform/recoverPendingRemovals`；`auto—publish/desktop/workspace-runtime.js:75`
- 问题描述：规范要求 transient I/O/lock failure 进入 `pending_auto_recovery` 并使用 bounded backoff 自动重试。实现只更新 `retryCount`/状态并返回；恢复函数遍历一次，runtime 也只在 workspace 初始化时调用一次。
- 代码证据：整个 removal service 没有 timer、延迟计算、最大重试次数或重新调度入口；`recoverPendingRemovals` 对每条 transaction 同步执行单次 `perform`。失败后仍为 `pending_auto_recovery`，但没有消费者再次唤醒它。
- 触发条件：启动恢复或删除事务执行期间遇到可恢复的瞬时文件锁、临时 I/O 失败或注入的可修复中断，并且该次重试仍失败。
- 可达路径或调用链：删除 commit/启动 recovery → `perform` → transient error → transaction `pending_auto_recovery` → 返回调用方；此后同一进程无定时任务继续执行，只有重启或显式人工 retry 才会再尝试。
- 实际影响：命名为自动恢复的删除事务可无限期停留，留下已取消队列但文章未移动等中间状态；用户必须重启或人工处理，恢复时间和一致性不符合契约。
- 影响范围：所有在事务阶段遇到瞬时 I/O/锁失败的文章删除；无错误的正常事务不受影响。
- 现有测试是否覆盖：测试覆盖一次中断后显式调用 `recoverPendingRemovals()` 成功，以及重复恢复/修复分类；没有 fake clock/backoff、多次 transient failure 或“无需重启最终恢复”的测试。
- 验证方法与结果：静态检查全部状态写入和 runtime 接线，确认只有初始化的一次调用；全模块搜索无 `setTimeout`/scheduler/backoff。联合定向测试通过但未覆盖所承诺的调度行为。
- 修复方向：在 workspace 生命周期内建立有上限、带抖动/退避且可取消的恢复调度器；锁内重读 transaction，限制次数并最终转可见 repair 状态；dispose 时停止 timer，加入 fake clock 测试。
- 关联发现：无。

## TEMP-M19-2：永久删除确认令牌不绑定 tombstone 版本，旧令牌可删除恢复后再次回收的新版本

- 分类：破坏性操作安全 / TOCTOU / 身份版本
- 所属模块：M19 回收站与删除事务
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/src/content/article-trash-service.js:30,118-140` `confirmations/preparePermanentDelete/permanentlyDeleteArticle`；`auto—publish/src/content/article-store.js:578-604,633-666` `restoreTrashedArticle/permanentlyDeleteTrashedArticle`
- 问题描述：prepare 读取当前 tombstone 并展示 `deletedAt/status`，但 token map 只保存 `clientId/articleId`；execute 不校验 token 期限、`deletedAt`、状态或 tombstone fingerprint。准备后发生恢复并以相同 ID 再入回收站时，旧令牌仍能删除新回收版本。
- 代码证据：`confirmations.set(token, item)` 的 `item` 只有两个 ID；execute 只比较两个 ID，随后直接对“当前”trash pair 调 `permanentlyDeleteTrashedArticle`。恢复不会清理该 Map 中的旧 token。
- 触发条件：用户 A 打开永久删除确认；在提交前，同一文章被恢复并再次删除（可由另一个窗口/操作完成）；随后用户 A 提交旧确认 token。
- 可达路径或调用链：prepare IPC → 内存 token → restore IPC → trash IPC → permanent-delete IPC(旧 token) → 当前新 tombstone 被永久清除。
- 实际影响：不可恢复的删除作用于确认时未展示的新版本，破坏“确认的对象就是执行对象”的安全边界；同 ID 复用时正文和 metadata 被永久清除，仅留新终端 tombstone。
- 影响范围：存在多窗口、快速连续操作或其他同进程调用方的永久删除；应用重启会清空 token，因此跨重启不可利用。
- 现有测试是否覆盖：测试覆盖 token 必填、错误 token、一次性消费和重复永久删除；没有 prepare→restore→re-trash→旧 token 的 TOCTOU 场景，也不检查 TTL/版本绑定。
- 验证方法与结果：使用真实 ArticleStore 在临时目录复现。旧 token 的 `deletedAt=2026-07-15`；恢复并于 `2026-07-16` 再次回收后，以旧 token 成功删除，返回和终端 tombstone 均为 `2026-07-16`。Node 脚本退出码 0。
- 修复方向：token 应保存 tombstone 的不可变 fingerprint（至少 `deletedAt`、status、内容/版本标识）与短 TTL；execute 在删除前原子重读并比较，不一致即要求重新确认；恢复和成功删除时清理同文章全部 token。
- 关联发现：与 TEMP-M19-1 根因不同；前者是恢复调度，本文是破坏性确认 TOCTOU。

## 测试情况

- M14–M21 联合定向测试：313 个测试，308 通过、0 失败、5 跳过，退出码 0。
- 扩大相关测试曾得到 371 个测试、364 通过、2 失败、5 跳过；两项失败均来自 `published-article-trash.test.js` 的旧 fixture 预期。当前 `createBatch` 初始化 `localArchive: pending`，而最新契约要求本地归档未完成阻断回收，故未把测试失败建立为产品 finding。
- 额外真实 store 最小复现验证 TEMP-M19-2。

## 未覆盖区域与待验证

- 未故意制造真实 Windows 文件锁并持续等待恢复，TEMP-M19-1 的“无调度器”由完整静态调用链证明。
- 未并发修改现场 workspace；TOCTOU 复现仅写系统临时目录。
- 跨 store transaction 的所有故障点已有较多注入测试，但极端进程强杀与磁盘满仍需专项 fault-injection。

## 模块审查结论

M19 达到深审完成门槛，形成 2 条中等严重度候选。删除预检、fingerprint 和 durable cursor 总体设计较强，但“自动恢复”缺少活跃调度，永久删除的独立确认机制也缺少版本绑定；后者已经真实复现为旧确认删除新回收版本。
