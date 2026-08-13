# 09 — 普通平台结果分类与人工收口

**What to build:** 让普通平台明确接受即形成全局已发布事实，按错误范围决定继续或暂停，并将不确定结果限制为两种人工收口动作。

**Blocked by:** 08 — 普通平台独立队列组执行

**Status:** document-ready；当前不可调度

**Scheduling gate:** 等待 Ticket 08 完成审计、提交、合并和定向复验，且波次 5 与维护 5.5（M01 → M02）均 `COMPLETE`、波次 6 变为 `READY`；这是执行顺序，不新增业务依赖。

## 启动约定

- 阅读规格中普通平台所有转换和“不等待公开页面”的明确非目标。
- 盘点三个普通平台适配器当前返回的 `submitted/published/failed/uncertain`、错误码和证据，先定义规范结果合同。

## 执行过程

1. 定义投稿执行的规范 outcome：accepted、article_rejected、group_blocked、uncertain；每类包含安全原因和必要远端证据。accepted/uncertain 只能来自 submission-start 后的最终提交阶段；提交前阶段可在明确内容拒绝或平台/认证阻塞时返回 article_rejected/group_blocked。后置 Ticket 18–21 的图片 best-effort 失败不是第五种 outcome，也不得进入本结果策略。
2. 固化下述唯一、版本化、递归封闭的 `publicationEvidenceV1` owner/validator。普通平台实际内容必须只读取 08 在 submission-start 事务冻结的 `preparedSubmissionEvidenceV1`，不得回退 admission 原文、重建图片布局或读取已丢失的 adapter 会话；网站媒体读取 13 的不可变提交快照。15、22、23 只能复用此 validator 和嵌套 DTO，不得复制字段、放宽 missing/time 规则或建立平行 schema。
3. 在 OperationalStore 内建立唯一的 `applyFirstPublicationSuccess` 内部 primitive，集中拥有证据校验、首次成功 first-wins、幂等、不可变 `publicationEvidenceV1`、全局永久冻结和既有成功不可覆盖规则。它不作为调用方可自由调用的通用写接口，只能由 transition-specific 事务端口在同一 SQLite 事务内委托；09 的普通平台 accepted outcome 首先消费该 primitive。
4. 在适配器边界映射平台特有响应，平台明确接受后通过 regular accepted outcome 事务按 `regularPublicationAttemptId` 原子读取冻结的 prepared evidence、写入 observation、调用唯一 publication-success primitive、保存证据、收口 intent、终结队列项和活动目标，不再生成通用 `submitted/reviewing` 新事实。
5. 文章级明确失败通过对应 outcome 事务按 attempt identity 原子写入 observation、收口原 intent、终结队列项并结束当前活动目标；事务成功后才恢复编辑并继续同组下一篇。
6. 平台、账号、认证或系统级明确失败通过 group-blocked outcome 事务写入 observation、收口原 intent并暂停当前组，其他组继续；当前项是否可恢复必须由明确结果决定。
7. 不确定结果不得新建 intent；outcome 事务只按 attempt identity 在 08 phase=`remote_call_started` 的既有 intent 上追加 uncertain observation、保持 intent 未收口、冻结文章并暂停当前组。重启恢复只能对具有 `remoteCallStartedAt` 且缺少终态 observation 的 intent 调用具名 `markOrphanedRegularAttemptUncertain`；phase=`prepared` 的项不属于 09 uncertain。不得按 lease 重放或创建替代 intent。
8. 提供 `prepareRegularUncertainResolution`：绑定 attempt identity、最新 observation fingerprint、证据 fingerprint、当前发布事实和目标/队列事实，返回短期确认令牌和且仅有的“确认已接受”“确认未接受”动作；证据不足继续冻结。
9. `confirmRegularAccepted` resolution 复核令牌与全部绑定事实，只从冻结的 prepared evidence 加上第 2 步时间来源生成完整发布证据，调用同一 publication-success primitive、收口 intent并终结队列/目标；`confirmRegularNotAccepted` 原子保存人工证据、收口 intent、终结队列/目标，并仅在没有发布成功或其他阻塞事实时恢复待投稿。重复同向命令幂等，相反决定、stale token 或状态漂移稳定冲突；可信 accepted observation 永远优先，迟到但可绑定原 attempt 的可信 accepted 仍建立永久发布事实，绝不恢复编辑或再次投稿。
10. 删除任何公开页面轮询、审核等待或可见性判定的新调用路径。

### `publicationEvidenceV1` 封闭 schema

V1 顶层字段精确为 `{ version, articleIdentityV1, customerSnapshotV1, contentAvailable, title, body, contentFingerprint, targetSnapshotV1, resultCode, submittedAt, submittedAtSource, firstPublishedAt, firstPublishedAtSource, imageSummaryV1, orderNumber, remoteUrl, missingReasons, safeEvidenceRefs }`，不得出现其他字段：

- `version` 固定为整数 `1`；身份/客户/目标快照必须通过各 owner 的 V1 封闭 validator。客户与目标快照只保留展示和核对需要的安全字段，不得含凭据、Cookie、绝对路径或供应商原始对象。
- `contentAvailable=true` 时，`title` 为 1–256 个 JavaScript UTF-16 code units、`body` 为 1–200,000 个 JavaScript UTF-16 code units，并复用 08/13 已冻结实际提交内容的控制字符规则；`contentFingerprint` 为该实际 `{ title, body }` 稳定 UTF-8 规范序列化结果的 64 位小写十六进制 SHA-256，且不得包含 `LEGACY_SUBMISSION_CONTENT_UNAVAILABLE`。`contentAvailable=false` 仅允许 Ticket 23 迁移历史，三项内容字段都为 `null`，且 `missingReasons` 必须包含 `LEGACY_SUBMISSION_CONTENT_UNAVAILABLE`。所有在线成功路径必须 `missingReasons=[]`；Ticket 23 可在内容可得时仅记录其他历史缺失项。
- `resultCode` 只允许 `REGULAR_ACCEPTED|PAID_PUBLISHED`。`submittedAt`/`firstPublishedAt` 为 ISO-8601 UTC 字符串或历史迁移专用 `null`；在线成功两者都必须非空。
- `submittedAtSource` 只允许 `regular_remote_call_started|paid_order_remote_call_started|legacy_unavailable`；普通平台时间精确取 08 `remoteCallStartedAt`，网站媒体精确取 13 `remoteCallStartedAt`。`firstPublishedAtSource` 只允许 `provider_event_time|first_positive_observation_time|manual_positive_evidence_time|legacy_unavailable`；优先可信 provider event，其次首次正面 observation，人工确认只可使用明确标记的 `manual_positive_evidence_time`。一个时间不得替代另一个，也不得以迁移/查询执行时间冒充未知时间。
- `imageSummaryV1` 在线路径字段精确为 `{ deliveryMode, images, decisionKind }`，约束与 08 对应字段一致且最多 5 项；核心纯文本路径固定为 `text_only`、空 `images`、`initial`。仅 Ticket 23 导入无法证明历史图片摘要时允许该字段为 `null`，并必须包含 `LEGACY_IMAGE_SUMMARY_UNAVAILABLE`；15/22/23 不得重建图片布局或以空清单冒充未知历史事实。
- `orderNumber` 为 `null` 或 1–128 字符；普通平台必须为 `null`，网站媒体必须非空。`remoteUrl` 为 `null` 或最多 2048 字符的 `https` URL。
- `missingReasons` 最多 4 项且不重复，完整 enum 为 `LEGACY_SUBMISSION_CONTENT_UNAVAILABLE|LEGACY_SUBMITTED_AT_UNAVAILABLE|LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE|LEGACY_IMAGE_SUMMARY_UNAVAILABLE`；仅 Ticket 23 的历史导入可使用。对应时间为 `null` 时 source 必须为 `legacy_unavailable` 且含对应 reason，反之禁止出现该 reason；`imageSummaryV1=null` 与图片缺失 reason 也必须双向一致。
- `safeEvidenceRefs` 为 1–16 项且 `(kind,fingerprint)` 不重复，条目字段精确为 `{ kind, fingerprint }`；`kind` 只允许 `PREPARED_SUBMISSION|REGULAR_ACCEPTED_OBSERVATION|MANUAL_POSITIVE_EVIDENCE|PAID_ORDER_SNAPSHOT|PAID_PUBLISHED_OBSERVATION|LEGACY_EVIDENCE`，`fingerprint` 为 64 位小写十六进制 SHA-256。禁止原始响应、任意 metadata、token、请求头、页面正文或不受控 URL。
- owner validator 必须递归拒绝所有 extra fields、未知 enum、字段组合/来源/missing reason 不一致、超界值和敏感字段；成功 primitive、15 observation、22 archive query 和 23 import 必须调用同一 validator。

嵌套展示快照同样由 `src/domain/` 稳定 DTO owner 唯一定义，Ticket 09 在实现顶层 validator 前必须建立以下精确合同：

- `customerSnapshotV1 = { version, clientId, displayName }`；`version=1`，`clientId` 复用 `articleIdentityV1` 的 domain identity，`displayName` 为 1–256 个 UTF-16 code units 的安全展示文本。不得包含客户资料正文、联系方式、内容库路径或任意 metadata。
- `targetSnapshotV1` 是封闭 union：普通平台 `{ version, kind, platformId, platformName, accountProfileId, accountLabel }`；网站媒体 `{ version, kind, mediaResourceId, mediaName }`；迁移专用未知账号 `{ version, kind, platformId, platformName }`。`version=1`，`kind` 固定为 `platform|media|legacy-unknown-account`，身份字段复用 08 的 `targetIdentityV1` 规则；四个展示名称/标签均为 1–256 个 UTF-16 code units 的安全文本。在线成功只允许前两个 variant，第三个只允许 Ticket 23 的历史导入。
- 两个快照 validator 必须递归拒绝 extra fields、控制字符、凭据、Cookie、路径、供应商原始对象和超界展示文本。15、22、23 只能复用导出，不得通过页面投影或 migration mapper 重新解释字段。

## 职责边界

- 平台适配器阶段一返回 ready 或既有明确 article_rejected/group_blocked；后置 Ticket 18–21 的图片失败只能自动减量/纯文本，不建立 pre-submit 图片 decision。阶段二识别供应商/网页提交响应并只返回四种规范 outcome。两阶段都不决定队列下一步，09 只消费规范 outcome。
- 结果策略决定文章和队列组转换，不操作浏览器。
- 人工核对用例只收口 uncertain，不提供重试捷径。
- 发布存储保存成功/失败/不确定事实和证据，不解释 UI 标签。
- OperationalStore outcome 组合端口拥有 observation、队列项、活动目标和发布事实的一致性事务；调用方不得用多个公开写操作拼接结果转换。
- OperationalStore 的 publication-success primitive 是普通平台 accepted、人工确认已接受和后续网站媒体 status 2 的唯一首次发布成功 writer；平台应用服务只调用各自具名事务端口，不直接调用 primitive。
- composition 只向普通平台结果服务注入 `regularOutcomeTransitions` capability，包含本流程所需的既有 intent 读取/标记/收口、具名 outcome、prepare/resolution 和事实读取；不得包含 intent 创建能力，不得注入完整 OperationalStore 或向应用层暴露 publication-success primitive。

## 架构硬门槛

- 规范结果类型保持封闭可扩展，新增平台只需实现适配映射。
- 通用编排器不包含列举网、今日头条或蓝色河畔条件分支。
- 结果策略和人工核对通过稳定结果码与命令形成清晰边界；不得按平台复制状态机，也不得为缩短文件拆出透传层。
- 错误范围必须显式，不允许用字符串匹配在多层重复分类。
- 普通平台 intent 的唯一创建 owner 是 08；09 的深度来自隐藏 outcome/resolution、证据绑定、success-first 和跨事实原子收口，不得复制 intent writer 或暴露通用 `resolve(type, payload)`。

## Acceptance criteria

- [ ] 普通平台明确接受后立即进入已发布并永久冻结，不出现审核等待阶段。
- [ ] 文章级失败恢复编辑且同组继续下一篇。
- [ ] 平台/账号/系统级失败只暂停受影响组，其他组继续。
- [ ] uncertain 冻结文章、暂停组、禁止自动重试，并只提供两种人工收口。
- [ ] 人工收口幂等且记录操作者决定，不会产生重复发布尝试。
- [ ] `prepareRegularUncertainResolution` 的短期令牌绑定 attempt、observation/证据 fingerprint、发布事实和目标/队列事实；重复同向、相反决定、stale token、状态漂移及证据不足均返回稳定结果且不会旁路冻结。
- [ ] accepted observation、确认已接受和确认未接受三方并发及各事务故障证明可信成功永久优先；原 intent 只被收口一次，不会错误解冻、丢失成功或产生第二次投稿。
- [ ] 成功、明确失败、uncertain 和两种人工收口在任一写入故障下都不会留下发布事实、队列项和活动目标互相矛盾的部分状态。
- [ ] 唯一 publication-success primitive 从公开 outcome/resolution 行为验证 first-wins、重复/并发幂等、不可变快照和永久冻结；Ticket 15 后续可在其订单 observation 事务内复用，不需要建立第二个 writer。
- [ ] 普通 accepted 与人工确认已接受都保存完整 `publicationEvidenceV1` 必需字段；缺少实际在线投稿正文、目标快照或关键证据时事务失败关闭，不写不完整成功事实。
- [ ] `publicationEvidenceV1` 只有一个 owner/validator；15、22、23 的直接合同测试证明它们复用同一精确 schema、时间来源和 missing reason 规则，递归 extra/sensitive fields 一律失败关闭。
- [ ] `customerSnapshotV1` / `targetSnapshotV1` 的三个 target variant、在线/迁移允许矩阵、展示文本上界和敏感字段拒绝由 domain owner 的公开合同测试固定；15、22、23 不复制嵌套 schema。
- [ ] 使用合成的最终 manifest 合同覆盖带图与自动减量至纯文本摘要，证明 `confirmRegularAccepted` 只按冻结 evidence 恢复相同标题/正文/content fingerprint/实际成功图片布局摘要，不会用 admission 原文冒充实际提交内容；本 ticket 不声称图片选择/上传生产链已实现，真实应用链由核心完成后的 Ticket 18–21 集成复验完成。
- [ ] 在线成功同时保存有规范来源的 `submittedAt` 与 `firstPublishedAt`；历史不可得只允许由 23 写入 `null + missing reason`，任何路径都不得拿 observation/迁移执行时间冒充未知时间。
- [ ] 直接 accepted 与 `confirmRegularAccepted` 分别覆盖 provider event、positive observation 和 manual positive evidence 三类来源；人工确认时间可作为明确标记的正面证据时间，但绝不伪装成供应商发布时间。
- [ ] composition/架构测试证明结果服务只获得不含 intent 创建能力的 `regularOutcomeTransitions`，无法调用 08 creator、付费、取消、迁移或其他无关写能力。
- [ ] 交接记录包含规范结果、三个平台映射、错误范围、模块职责、依赖方向及显著规模变化说明。

## 审计建议

- 等级：深度独立审计。
- 范围：三平台结果映射、accepted 即发布、文章/组错误范围、既有 intent 收口、outcome 组合事务、uncertain prepare 与两种人工收口、时间证据、禁止重试/轮询及其他组隔离。
- 必须通过公开应用命令验证成功、明确失败、orphan/adapter uncertain、证据绑定人工收口、迟到 accepted 优先和原子事实转换；确认 09 不创建 intent。不重复审计 08 的 FIFO 实现或 15 的订单状态同步，不运行完整 `npm test`。

## Non-goals

- 不抓取公开发布页面，不轮询审核或收录。
- 不实现网站媒体订单结果。
