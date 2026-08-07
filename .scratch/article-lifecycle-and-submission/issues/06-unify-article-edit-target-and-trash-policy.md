# 06 — 统一文章编辑、改投与回收权限

**What to build:** 用一个集中策略决定文章能否编辑、入队、改投和回收，保证一篇文章最多一个活动发布目标，首次成功后永久只读。

**Blocked by:** 04 — 扩展 SQLite 生命周期与队列事实；05 — 移除审核与生成来源投稿门槛

**Status:** `COMPLETE`（以 `ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md` 的实时 provenance 为准）；不得重复调度

## 启动约定

- 确认 04 已提供原子活动目标约束，05 已停止使用审核决定资格。
- 先建立文章事实到编辑/入队/改投/回收权限的完整决策表，并覆盖当前发布、订单、删除事务和结果不确定事实。

## 执行过程

1. 以 `article-lifecycle-projection.js` 作为公开权限 owner 建立集中文章操作策略，输入只读事实，按动作输出 `operations.edit|queue|retarget|trash = { allowed, reasonCodes, safeMetadata }`；展示文案仍由投影边界映射。允许提取内部纯策略模块，但不得形成第二个公开 owner 或第二套事实归一化路径。
2. 区分新文章首次持久化、用户修改既有文章和迁移/恢复内部写入，并使用不同命令边界。编辑器读模型在持久化 article DTO 之外返回服务端签发的不透明 `editFingerprint`；既有文章保存请求必须携带 `expectedFingerprint`。保存 IPC 成功合同使用封闭 typed result：`{ outcome: "saved", article, editFingerprint }` 或 `{ outcome: "conflict", code: "ARTICLE_EDIT_CONFLICT", articleId, refreshRequired: true }`；stale save 映射为后者，不通过通用 IPC failure 传递任意 metadata，也不返回当前正文、绝对路径或当前 fingerprint。fingerprint 不写入文章正文文件，Renderer 不自行计算或解释；冲突后必须重新读取文章和新 fingerprint。新建命令不得覆盖已有身份；迁移/恢复内部写入口不暴露给 Renderer。所有用户可达写入口使用同一编辑守卫，队列等待、远端执行、活动订单、不确定结果和发布成功都拒绝写入；底层 article store 只负责持久化，不反向依赖 OperationalStore。
3. 统一活动目标授权与存储冲突规范化，但不公开可任意解冻文章的通用 `release`。`PUBLICATION_DUPLICATE`、`PUBLICATION_TARGET_CONFLICT` 映射为 `ARTICLE_ACTIVE_TARGET_CONFLICT`，`PUBLICATION_UNCERTAIN` 保持为对应 queue/retarget 动作的 `PUBLICATION_UNCERTAIN`。活动目标只能由携带 owner identity、expected current target 和明确终态证据的转换命令收口；持久化不变量继续由 OperationalStore 门面拥有。
4. 回收预检只允许未发布且没有活动队列、订单或不确定结果的文章；永久删除仍遵守最小审计保留。
5. 将权限结果接入文章管理投影、编辑器和命令端口，删除 Renderer 自行组合锁定条件。
6. 在应用层建立窄的 article mutation coordinator，向调用方暴露保存既有文章、为当前发布执行授权活动目标和回收等明确命令，内部隐藏共享锁、事实重读、策略复核和副作用顺序。唯一逻辑锁键函数固定为 `canonicalArticleRefKey(articleRef) = normalize(clientId) + "\0" + normalize(articleId)`；身份验证、去重、锁路径解析、单文章锁与集合排序必须共同使用该函数，并拒绝缺失、非法或包含 NUL 的身份，禁止直接使用无分隔符字符串拼接。发布应用命令必须携带由内容库文章身份或持久化队列 metadata 解析出的 `articleRef { clientId, articleId }`，不得从 Renderer 输入、标题/正文、合成 articleId 或可选 post-processing payload 猜测 clientId。当前旧路径无法解析稳定 clientId 时在任何 reserve/publish 前返回 `ARTICLE_IDENTITY_UNRESOLVED` 并进入既有人工处理边界。publisher contract 继续只接收发布所需的 `articleId`，不拥有客户身份。coordinator 是跨 article store 与 OperationalStore 业务变更的唯一文章级锁 owner。重构 article store 当前内部锁接缝，使 coordinator 通过仅供该协调边界使用的窄 mutation session 完成已加锁读取、CAS 替换或回收，禁止外层锁再次调用会自行取得同一锁的 `saveArticle/getArticle/moveArticleToTrash`，也禁止公开通用 callback 或无锁写方法。
7. coordinator 内部实现单一私有 article-set 加锁原语，并由本 ticket 范围内现有公开批量回收 `trashArticles` 生产命令真实消费；不得为了测试暴露该原语、通用 callback 或新增虚构多文章命令。集合命令先用 `canonicalArticleRefKey` 规范化并去重，再按同一 key 升序取得全部跨进程锁；任一取得失败时逆序释放已持有锁且不开始 SQLite 事务；全部锁取得后一次性重读所有正文与运行事实、复核每篇权限和 expected fingerprint，再调用由 composition 注入且具名的 transition-specific 持久化端口；运行时调用方不得传入 callback、锁对象或 SQLite transaction；提交/失败后逆序释放全部锁。07/12 后续只在同一 coordinator owner 内增加 `admitRegularQueueItems`、`removePendingQueueItems`、`admitPaidBatch` 等具名方法并复用该原语，二者不得互相依赖或自行取得共享文章锁。
8. 所有回收执行路径共同使用 coordinator 的具名 `executeArticleRemovalTransaction`：首次 `trashArticles` 提交、启动/定时 `recoverPendingRemovals` 与 Renderer 可达的 `retryArticleRemovalTransaction` 都必须先按事务 selections 取得同一规范锁集合，在锁内重读文章、运行事实和事务 cursor，再调用已加锁 mutation session 继续现有 `perform` 协议。事务 claim 可以在加锁前持久化，但锁获取失败只能记录既有可恢复 retry 结果，不得执行移动；恢复和人工重试不得直接调用会自行取得 article-store 锁的旧 `perform → moveArticleToTrash` 路径。改造必须保留 operationId、cursor、claim、幂等恢复、needs_repair 和已完成事务复用语义。
9. 锁顺序固定为“全部文章锁 → 事实重读/策略复核 → 可选短 SQLite 事务”；持有 SQLite 事务时不得等待文件锁，锁内不得远端调用。`publication-workflow/execution.js` 可以在锁外先做不提交正文的 `inspectAccount`；检查抛错或身份不符时不得创建活动目标。检查成功后把由服务端权威文章读取或原子 admission 快照签发的 `expectedFingerprint` 和可信 `articleRef` 交给 coordinator；coordinator 在紧邻 publish 前锁内重读权威文章，验证 fingerprint，并以该次读取生成不可变 `publicationSnapshot { title, body, articleId, fingerprint }`。durable reserve 与 snapshot 关联保存后释放文章锁，execution 才能用 coordinator 返回的 snapshot 构造 `parsePublishInput` 并调用 `publisher.publish`；不得继续使用命令准备阶段或旧队列文件中的 title/body。检查期间发生编辑会导致 stale 拒绝且不 reserve/publish。
10. reserve 成功后的 publish 传输异常进入 uncertain；只读账号检查失败不写 uncertain。reserve 已提交但尚未调用 publisher 时进程崩溃，继续沿用现有 recovery intent 的 fail-closed 规则，在重启时标记 `PUBLICATION_UNCERTAIN` 并冻结，禁止自动重放。锁尚未取得或有活动 owner/超时时统一返回 `ARTICLE_MUTATION_BUSY`，其语义是副作用未开始、可由用户安全重试；副作用已提交但锁释放失败统一返回 `ARTICLE_MUTATION_RESULT_UNCERTAIN`，只允许静态安全错误描述和 diagnosticId，`retryability=manual-check`，禁止自动重放。保存 IPC 可将后者映射为封闭 `{ outcome: "result-uncertain", code, articleId, refreshRequired: true }`；回收返回现有 transactionId/可恢复状态；target reserve 停止 publish 并保留 durable recovery evidence。覆盖 reserve 后/publish 前崩溃、锁释放故障和进程崩溃后的陈旧锁恢复。

## 职责边界

- 操作策略只做业务决策，不执行写入；`article-lifecycle-projection.js` 保持公开权限 owner，内部策略若被提取只能由该 owner 组合和暴露。
- article mutation coordinator 是编辑、活动目标授权和回收竞态的应用层协调 owner；共享锁端口只注入该协调器，不把锁对象、SQLite 事务或通用 callback seam 暴露给各调用方。Renderer 预检和按钮禁用都不是授权。
- `articleRef` 的客户归属解析属于内容/队列应用边界；OperationalStore 仍以稳定 articleId 保存运行事实，publisher adapter 不接收 clientId。coordinator 只接受已经过可信解析且与当前文章文件匹配的 articleRef，所有 owner 复用同一个 canonical key 函数。
- article store 保留文章文件原子替换和崩溃恢复职责，但不得与 coordinator 竞争同一业务锁；新建文章等不跨运行事实的内部路径必须使用明确的 creation port，并继续具有身份冲突和文件原子性保护。
- 活动目标所有权属于运行状态存储，不写入文章正文文件。
- 回收服务执行删除协议，但必须使用统一策略决定是否允许。
- removal transaction store 继续拥有 claim/cursor/恢复事实；首次执行、自动恢复和人工重试都通过 coordinator 取得文章锁后才能驱动删除协议，不新增第二个恢复状态机。
- 普通平台队列用例拥有选择验证，并通过 07 的单个 SQLite admission/removal 组合端口原子改变活动目标与队列项；网站媒体应用服务通过 12 的付费批次确认组合端口原子改变活动目标与批次事实。二者消费同一权限决策，但不得分别调用通用 claim/release 拼接一致性。

## 架构硬门槛

- 操作策略保持纯函数；每个动作返回自己的稳定 reason code 和安全 metadata，命令拒绝直接消费该动作的首要 code，Renderer 只展示同一动作投影，不把中文展示文案或持久化副作用放进策略。
- 不把所有事实塞入一个可变 article 对象；使用明确的 article、queue、publication、order、removal facts。
- 以职责内聚、接口深度、依赖方向、变更局部性和公开接口可测试性验收模块；不得为缩短文件拆出透传层、重复映射或分散同一不变量。既有删除协调器只通过稳定端口接入权限，不在其中新增平行状态机。
- 并发正确性由文章级跨进程锁、正文 CAS、数据库约束和事务复核共同保证；所有路径遵循相同锁顺序，不依赖界面禁用按钮或轮询重试。
- 多文章命令必须遵守完整锁集合与规范顺序；06 只通过现有公开批量回收入口验证共享原语，不直接测试私有函数，07/12 再通过各自公开应用命令验证 transition-specific 接线。

## Acceptance criteria

- [ ] 当前 `publication-workflow/execution.js` 的活动目标授权成功即冻结文章；合成等待队列、活动订单、不确定和已发布事实的策略/命令测试均拒绝修改。07/12 的真实 admission 接线与端到端冻结回归由对应 ticket 验收，不作为 06 的完成前置条件。
- [ ] 一篇文章在并发请求下也最多只有一个活动发布目标。
- [ ] 编辑读模型返回 `editFingerprint`，既有保存必须提交 `expectedFingerprint`；typed save result 明确区分 `saved` 与 `ARTICLE_EDIT_CONFLICT`，保存成功返回下一 fingerprint，冲突只返回 articleId 与 `refreshRequired: true`。两个编辑会话的 stale save 被拒绝，Renderer 不计算 fingerprint，IPC failure 不携带任意 metadata。
- [ ] 跨进程 save/target、嵌套锁防回归、锁释放故障和陈旧锁恢复测试证明当前生产路径使用同一协调 seam；已提交但释放失败不会被报告为确定未执行或被自动重放。
- [ ] 当前发布命令从可信持久化身份得到 articleRef；缺少/冲突 clientId 时在 reserve 和 publish 前失败。账号检查期间并发编辑会使随后的 expected fingerprint 复核失败；检查 throw 或身份不符不创建活动目标，publish 不会被调用。
- [ ] 当前单文章保存/target 命令和公开批量回收 `trashArticles` 证明使用同一 coordinator；批量回收行为测试覆盖 articleRef 去重、正序/反序集合并发、部分锁取得失败逆序释放、锁内全量事实重读和并发保存，不直接测试私有锁函数或增加 test-only seam。
- [ ] `canonicalArticleRefKey` 在单文章、批量去重、锁路径和排序中结果一致；覆盖无分隔符会碰撞的身份样例、非法/NUL 身份和相反输入顺序。
- [ ] 首次回收、自动 `recoverPendingRemovals` 和人工 `retryArticleRemovalTransaction` 均通过同一 coordinator/mutation session；与 save/target 并发时不绕锁，并保持既有 claim、cursor、operationId、幂等完成与 needs_repair 行为。
- [ ] publisher 的 title/body 只来自 coordinator 锁内重读产生并与 durable reserve 关联的 publicationSnapshot；旧队列正文或命令正文即使不同也不能被提交。expected fingerprint 不接受 Renderer 或可选 payload 自报值。
- [ ] reserve 成功后、publisher 调用前崩溃会在重启时进入 uncertain 且不自动发布；`ARTICLE_MUTATION_BUSY` 证明无副作用可安全重试，`ARTICLE_MUTATION_RESULT_UNCERTAIN` 证明禁止自动重放并按保存/回收/target 的既定结果合同恢复。
- [ ] 明确失败、取消或退稿且无其他阻塞事实时恢复编辑和改投。
- [ ] 任意可信发布成功后文章永久禁止编辑、再次入队、改投和回收，售后退款不解除。
- [ ] 权限和锁定原因在主进程命令与 Renderer 展示中一致。
- [ ] 交接记录提供决策矩阵、typed edit fingerprint 读写合同、可信 articleRef 来源与 canonical key、publicationSnapshot 来源、单/多文章协调边界、全部回收执行入口、锁顺序、稳定锁错误与崩溃恢复、当前生产写入口接线表、账号检查与 reserve 顺序、留待 07/12 的具名扩展方法和测试、并发测试，以及显著规模变化和不拆分理由。

## Non-goals

- 不实现具体普通平台队列组或付费批次执行。
- 不替 07 定义或接线普通平台单目标队列命令，不替 12 建立付费确认流程；07/12 各自拥有其运行事实的事务化组合端口。
- 不提前实现 `admitRegularQueueItems`、`removePendingQueueItems` 或 `admitPaidBatch`；多文章协调只接入本 ticket 已有的批量回收生产入口，不新增只为测试存在的入口。
- `restore`、`permanentDelete` 不属于本 ticket 的动作集合，其完整规则由 22 收口；本 ticket 只保证现有入口不能绕过已发布或活动事实保护。
- 不执行完整历史迁移。
