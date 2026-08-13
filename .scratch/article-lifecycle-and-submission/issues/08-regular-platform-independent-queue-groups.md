# 08 — 普通平台独立队列组执行

**What to build:** 按“普通平台 + 平台账号档案”建立独立 FIFO 队列组，使不同平台的组可以并行，同组严格串行，并正确保存开始、暂停和重启意图。当前核心阶段同一平台的多个账号档案组共享平台级执行锁并串行；账号专属浏览器会话与同平台多账号并行后置扩展。

**Blocked by:** 07 — 普通平台单目标入队与待执行移除

**Status:** `COMPLETE`（以 `ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md` 的实时 provenance 为准）；不得重复调度

**Scheduling gate:** 已关闭。历史实施必须从波次计划和 Git 证据读取；后续不得以本 ticket 文档为由重复创建 08 线程。

## 启动约定

- 检查 07 已生成稳定单目标队列项和活动目标事实。
- 盘点现有平台运行器、worker、平台状态存储、开始/暂停命令和重启恢复行为；先建立两个平台组的特征测试。

## 执行过程

1. 定义队列组身份、组级运行状态、手工暂停意图、当前项和剩余 FIFO 顺序的只读模型。
2. 建立组编排器：一个组同一时间最多一个在途项，不同平台使用独立执行通道并可并行；同一平台的账号档案组在账号专属会话实现前共享平台级执行锁并串行。每次领取必须通过单个 transition-specific 事务原子复核组运行/暂停意图与 FIFO 头项，生成稳定 `regularPublicationAttemptId`，并一起保存组当前项、claim/lease 和 phase=`prepared` 的 in-flight intent；事务成功后才向平台执行器返回确定任务。未收口 intent 不得重新生成 attempt identity。
3. 支持向运行组追加文章到队尾，继承组的平台、账号和已有组配置，绝不插队。
4. 实现开始全部：只启动未开始且未被手工暂停的普通平台组；实现暂停全部：当前请求安全返回后停止领取下一项。
5. 平台阶段一返回仅进程内 `PreparedSubmission` capability：它公开不可变、安全的 `preparedSubmissionEvidenceV1` 和唯一具名方法 `submitPreparedPublication()`，平台会话、DOM、上传 token 与其他私有状态隐藏在 adapter 内部闭包中。Ticket 08 必须实现下述唯一 V1 owner/validator；纯文本阶段不得只保存“至少包含”字段或开放 metadata。submit 必须提交与 evidence 相同的已准备内容，不得在 evidence 冻结后改标题、正文、图片布局或降级模式；若内部状态漂移，submission-start 后只能返回 uncertain。capability 不可枚举平台状态、不可序列化、不可记录、不可进入 IPC/持久化，也不得退化为任意 callback/metadata 容器。今日头条已确认“预览并发布”只进入预览确认界面，广告弹窗处理也属于 preparation，只有“确认发布”是 capability 在 submission-start 后执行的不可逆动作；最终点击紧前必须再次核验账号身份。禾畔最终 payload 在 preparation 创建，投稿执行所需的临时 Cookie 只能在 submission-start 成功并真正调用 submit capability 时物化，正常返回和异常路径都立即清理。账号核验可在 submission-start 前使用独立、短生命周期的临时 Cookie，但必须在核验结束后立即清理，且不得借此发起投稿；用户于 2026-08-07 明确接受 begin 随后失败时该核验 Cookie 曾短暂物化的剩余风险。
6. executor 取得 `PreparedSubmission` 后，在调用其提交方法的紧前一刻调用 `beginRegularRemoteSubmission(attemptId, preparedSubmissionEvidenceV1)`；该事务原子校验 attempt/正文 fingerprint 与 phase，冻结完整 evidence，将 intent 从 `prepared` 推进为 `remote_call_started` 并只写一次 `remoteCallStartedAt`。事务成功后才调用 `submitPreparedPublication()`。该标记表示“从此不得安全自动重放”，不声称供应商一定收到请求；标记前可在用户重新开始后重做准备，标记后 evidence 已持久保存且缺少终态 observation 一律交给 09 uncertain。
7. 应用启动时所有普通平台组保持暂停，必须由用户明确开始；崩溃恢复只恢复本地事实，不自动调用远端。`prepared` intent 不得仅因 lease 过期自动运行，`remote_call_started` intent 不得重新变成 pending 或再次调用平台。
8. 一个组完成、暂停或失败不得取消、停止或改写其他组。
9. 增加并发、FIFO、追加、暂停竞态、证据冻结、远端边界前后、重启和多组隔离测试。

### 身份 V1 前置合同与唯一 owner

Ticket 08 必须先在 `src/domain/` 的稳定身份/DTO owner 中建立并导出以下两个递归封闭 validator；当前 `src/content/article-ref.js` 的运行时引用规范化只能作为调用方适配，不能充当 V1 owner，因为它不拥有版本合同且不得决定 evidence schema。

- `articleIdentityV1` 精确字段为 `{ version, clientId, articleId }`。`version=1`；`clientId`、`articleId` 必须分别复用现有 `ClientId`、`ArticleId` 规范化和上界。缺字段、extra field、错误 kind 的 identity、路径/控制字符或规范化后空值全部拒绝。
- `targetIdentityV1` 是精确封闭 union：普通平台 `{ version, kind, platformId, accountProfileId }`，网站媒体 `{ version, kind, mediaResourceId }`，迁移专用未知账号 `{ version, kind, platformId, autoExecutable }`。`version=1`；`kind` 分别固定为 `platform|media|legacy-unknown-account`；`platformId` 复用 `parsePublicationTarget` 的规范，账号/资源 ID 复用现有 domain identity；迁移专用 variant 必须 `autoExecutable=false`。在线普通平台 prepared evidence 只允许 `platform`，在线网站媒体只允许 `media`，第三个 variant 仅供 Ticket 23 读取历史冲突事实。
- 这两个 DTO 的字段、规范化、序列化与 validator 只能由该 domain owner 定义。08、09、13、22、23 和 IPC/持久化层只能导入复用，不得复制字段列表、放宽 extra-field 检查或创建同名 mapper 作为第二 owner。

### `preparedSubmissionEvidenceV1` 封闭 schema

V1 顶层字段精确为 `{ version, attemptId, articleIdentityV1, targetIdentityV1, title, body, contentFingerprint, deliveryMode, images, decisionKind }`，不得出现其他字段：

- `version` 固定为整数 `1`；`attemptId` 为 1–128 字符稳定身份；`articleIdentityV1` 与 `targetIdentityV1` 必须通过各自 owner 的 V1 封闭 validator。
- `title` 为 1–256 个 JavaScript UTF-16 code units；`body` 为 1–200,000 个 JavaScript UTF-16 code units，与 07 已验收的 `publicationSnapshot` 持久化上界和控制字符规则一致；二者都是 adapter 最终准备并将实际提交的内容，不得回退 admission 原文。`contentFingerprint` 为 64 位小写十六进制 SHA-256，精确覆盖稳定 UTF-8 规范序列化后的 `{ title, body }` 对象，不得使用无边界字符串拼接或包含文章其他可变 metadata。
- `deliveryMode` 只允许 `text_only|with_images`。核心纯文本阶段固定为 `text_only`；`images` 必须是空数组；`decisionKind` 固定为 `initial`。
- `images` 最多 5 项，条目字段精确为 `{ assetFingerprint, layoutSlot }`；`assetFingerprint` 为 64 位小写十六进制 SHA-256，`layoutSlot` 为 `0..9999` 的整数，条目按最终正文顺序排列且 fingerprint 不重复。此结构现在即固定，Ticket 18 只能填充值，不能添加字段或另建 V1。
- `decisionKind` 的完整 V1 enum 仍固定为 `initial|retry_preparation|replace_image|continue_text_only` 以保持既有 V1 兼容；后 3 项不再由 Ticket 18 新自动配图路径产生，新路径固定使用 `initial`。`continue_text_only` 的历史合同仍要求 `deliveryMode=text_only` 和空 `images`。
- validator 必须递归拒绝顶层和嵌套 extra fields、未知 enum、超界字符串/数组/slot、重复图片、不一致 mode/decision 组合，以及绝对路径、二进制、DOM、Cookie、token、原始请求/响应、任意 metadata 或其他敏感字段。持久化、日志和 IPC 只能接触通过该 validator 的 safe evidence；`PreparedSubmission` capability 本身永不进入 validator 或持久化。

## 职责边界

- 组编排器只负责领取顺序、并发隔离和暂停意图，不解释远端结果类别。
- 平台 executor 只协调 `preparePlatformSubmission → freeze evidence + beginRegularRemoteSubmission → PreparedSubmission.submitPreparedPublication`，只能读取安全 evidence 并调用具名方法，不能取得 adapter 私有 token/会话；Ticket 08 先为纯文本建立完整稳定 seam，Ticket 18–21 在核心完成后只能填充已声明图片字段并保持新自动路径 `decisionKind=initial`，再扩展阶段一交付，不改变 schema、submission-start 所有权或结果合同。平台 adapter 不获得 OperationalStore capability。
- 状态存储只保存组和任务事实，不启动 worker。
- 全局控制器只向符合条件的组发命令，不拥有组状态机。
- OperationalStore 的 `regularQueueGroupTransitions` 最小 capability 封装组快照读取、开始/暂停意图、“复核 FIFO 头项 + claim/lease + 组当前项 + 唯一 prepared intent”的领取事务，以及冻结 evidence 的幂等 `beginRegularRemoteSubmission`；它是普通平台 intent、实际提交 evidence 与 submission-start phase 的唯一 writer。组编排器不得用多个公开写操作拼接领取/证据/边界，也不得通过该 capability 写入 09 outcome/resolution。

## 架构硬门槛

- 编排边界以队列组状态机和窄命令接口形成深模块；平台执行细节不能进入通用组编排器，也不得为缩短文件拆出透传层。
- 不同平台之间不共享可变运行状态；当前核心阶段同一平台只共享一个最小执行锁，不共享队列顺序、暂停意图、当前项或 attempt 事实。全局开始/暂停不能成为全局大状态机。
- 使用明确的 claim/lease 或等价机制保证同组单消费者和崩溃恢复。
- lease 只解决本地单消费者所有权，不能充当远端幂等或安全重试证明。只有 durable `remote_call_started` 才表示已进入不可安全重放区；它是保守的本地边界标记，不伪装成供应商接收证据。
- Ticket 09 只能按 `regularPublicationAttemptId` 读取、标记或收口 08 创建的 intent，不得创建第二条 intent；正常 accepted、article_rejected、group_blocked 和人工 resolution 必须原子收口原 intent。
- composition 只向组编排器注入 `regularQueueGroupTransitions` capability 和单项平台执行端口；不得注入完整 OperationalStore，也不得暴露通用 claim/release、任意 lease 写入、付费/迁移能力或 09 的 outcome 写能力。capability 由 owner 直接聚合或冻结选取，禁止创建纯透传 wrapper。
- 禁止用定时轮询 Renderer 推断进度；只读快照和失效事件是界面入口。

## Acceptance criteria

- [ ] 同一平台账号组严格 FIFO 且最多一个在途项。
- [ ] 至少两个不同平台的账号组可并行，任一组结束或暂停不影响其他平台；同一平台的多个账号档案组当前严格串行，并在 preparation 前核验当前登录账号与目标档案一致。
- [ ] 运行组追加文章进入队尾并继承组身份和配置。
- [ ] 开始全部不会恢复手工暂停组，暂停全部不会强制中断当前远端请求。
- [ ] 应用重启后所有组保持暂停且不会自动产生投稿。
- [ ] 在 claim 后、submission-start 前、远端返回前和 observation 落库前分别注入崩溃：prepared 项不会被当作已投稿，可在用户重新开始并复核后重做准备；remote_call_started 项绝不再次调用平台，缺少明确结果时由 09 接管。
- [ ] 在 `beginRegularRemoteSubmission` 提交前后分别注入崩溃：标记前没有远端调用且只能在用户重新开始、复核后重做准备；标记后即使 adapter 尚未来得及执行也保守进入 uncertain，绝不自动重放。`remoteCallStartedAt` 只写一次。
- [ ] 纯文本默认路径生成图片清单为空、`deliveryMode=text_only` 的完整 `preparedSubmissionEvidenceV1`；begin 事务故障不保存半份 evidence也不调用提交，事务成功后的崩溃仍可从持久 evidence 完整人工收口。带图由 Ticket 18–21 在不改变本 ticket submission-start owner 的前提下扩展；新自动配图路径不建立换图/显式纯文本降级 decision 流程。
- [ ] 唯一 V1 validator 按上述精确字段、enum 和上界递归拒绝 extra/sensitive fields；Ticket 18 合同测试只能填充已存在的 `images`、`deliveryMode`、`decisionKind`，不能修改 schema 或创建平行 validator。
- [ ] `src/domain/` 唯一导出的 `articleIdentityV1` / `targetIdentityV1` validator 覆盖全部正反 variant；prepared evidence 只接受普通平台 target，当前宽松 articleRef/IPC 对象不能绕过版本和 extra-field 拒绝。交接必须列出导出位置和 09/13/23 的复用方式。
- [ ] `PreparedSubmission` 公开面只有安全 evidence 与具名 submit 方法；序列化、日志、IPC、跨平台传递、读取私有 session/token 和注入通用 callback/metadata 的架构测试均失败关闭。
- [ ] evidence 冻结后注入编辑器/会话内容漂移，submit 不会静默改写或重建 manifest；边界后只返回 uncertain，档案证据与任何明确 accepted 的实际准备内容一致。
- [ ] `claim_until <= now` 一律视为 lease 已过期；账号 fingerprint 在 preparation 与最终点击紧前必须相同；begin 失败或幂等未授权 submit 不创建禾畔投稿 Cookie。账号核验使用并立即清理的独立临时 Cookie 是用户明确接受的例外。
- [ ] 在组运行状态、FIFO 头项、claim/lease、组当前项和 in-flight intent 的每个持久化故障点注入失败，证明领取事务要么完整提交并返回唯一任务，要么不改变任何事实；不会留下“组已领取或已有当前项但缺少 in-flight intent”或重复领取状态。
- [ ] composition/架构测试证明组编排器只能获得 `regularQueueGroupTransitions` 和单项执行端口，不能旁路 09、拼接通用 claim/release 或访问付费、迁移及其他无关写能力。
- [ ] 合同测试证明同一未收口项只有一个稳定 `regularPublicationAttemptId`，08 是唯一 intent creator，并向 09 暴露只读/收口所需的稳定身份合同而不授予第二个 intent creator；09 对该合同的实际消费与不重复 intent 由 Ticket 09 及波次 6 集成复验完成。
- [ ] 交接记录提供组状态机、并发模型、恢复策略、模块职责、依赖方向及显著规模变化说明。

## 审计建议

- 等级：深度独立审计。
- 范围：组身份与 FIFO、同组单消费者、不同平台跨组并行、同平台账号组串行及账号核验、追加、开始/暂停意图、prepared/remote_call_started phase、重启暂停、lease 过期和远端未知结果失败关闭。
- 重点核对 executor 两阶段调用与 09 结果策略的边界；注入 submission-start 标记前后、远端调用中和 observation 前的崩溃，证明不会把未开始误写成已提交，也不会自动重复投稿。不重复审计 07 admission 或 10 UI 细节，不运行完整 `npm test`。

## Non-goals

- 不决定接受、失败和不确定的业务结果；由 09 完成。
- 不实现完整队列页面或图片上传。
