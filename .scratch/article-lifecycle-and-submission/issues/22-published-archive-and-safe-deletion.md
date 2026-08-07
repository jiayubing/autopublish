# 22 — 已发布档案与安全删除规则

**What to build:** 为普通平台成功和网站媒体已发布订单保存完整只读投稿档案，禁止已发布文章回收，同时允许安全删除未发布正文而永久保留订单与最小审计信息。

**Blocked by:** 06 — 统一文章编辑、改投与回收权限；09 — 普通平台结果分类与人工收口；16 — 服务商订单取消与永久历史

**Status:** document-ready；当前不可调度

**Scheduling gate:** 作为独立波次 8，等待波次 7 `COMPLETE` 且业务依赖 06、09、16 均已进入集成历史后调度；不再与 Ticket 18 同波或等待图片扩展。

## 启动约定

- 已发布档案保存“实际投稿内容”，不得声称等同于服务商可能改写后的最终网页正文。
- 首次可信发布成功形成永久事实；售后、退款、链接失效或未收录都不解除冻结。

## 执行过程

1. 定义发布档案只读模型：复用 09 唯一 validator 验证的 `publicationEvidenceV1`，包括文章身份、客户安全快照、实际投稿标题/正文快照或不可得标记、content fingerprint、图片安全摘要或历史不可得标记、目标、账号/媒体快照、`submittedAt`、`firstPublishedAt`、时间来源/不可得原因、结果、订单号和安全远端链接；该模型只读，不复制 schema，也不从当前文章、图片库或浏览器会话重新推导/补写历史投稿内容、图片布局与时间。
2. 审计并复用 09 已建立、15 已消费的唯一 publication-success primitive；普通平台 accepted 和网站媒体状态 2 在进入本 ticket 前已经通过该 owner 原子建立首次全局发布成功与不可变投稿快照。本 ticket 只补齐档案查询/展示、保留完整性和删除保护，不创建、替换或包装第二个成功 writer，也不在归档层补写旁路事实。
3. 文章管理已发布入口展示档案和投稿内容，移除编辑、再次入队、复制版本和回收动作。
4. 回收预检拒绝任何可信发布成功，即使当前订单处于售后/退款或远端链接不可用。
5. 未发布且无活动事实的文章可进入回收站和恢复；在 06 article mutation coordinator owner 内增加具名 `restoreArticles` / `permanentlyDeleteArticles` 协调命令，复用规范 article-set 锁顺序，并在锁内重读正文状态、活动目标、订单、不确定结果和发布成功事实后，才驱动现有 durable deletion/recovery transaction。永久删除正文时保留标题、客户、目标、订单、金额、时间、结果及必要证据；不得暴露通用 callback 或无锁恢复/永久删除入口。
6. 订单历史和发布档案没有删除命令；删除事务失败进入需处理，不伪造成功。
7. 增加普通/付费发布、售后、退稿、取消、永久删除和恢复组合测试。

### 下游迁移必须复用的目标/删除 V1 owner

- Ticket 22 必须在活动目标与 durable deletion/recovery 的既有 owner 中导出唯一、版本化、递归封闭的 `terminalTargetV1`、`closedTargetV1`、`tombstoneIdentityV1` 与 `deletionTransactionIdentityV1` validator。精确字段必须只包含稳定身份、规范终态/原因、必要时间和安全 fingerprint；不得包含内部表名、绝对路径、正文、任意 metadata 或删除 callback。
- Ticket 23 只能引用这些最终公开合同；migration 不得根据 internal schema 或墓碑文件布局重建字段。若任一导出/合同测试缺失，Ticket 23 调度前必须阻断，而不是由迁移器临时补一个 DTO。

## 职责边界

- OperationalStore 内由 09 建立的 publication-success primitive 拥有不可变投稿快照和首次成功事实；发布档案投影拥有只读查询、展示 DTO 与保留完整性，不拥有写入规则。09/15 只调用各自具名事务端口并在内部委托同一 primitive。
- 文章存储拥有可编辑正文/回收正文，不拥有订单历史。
- 删除策略决定可否删除，删除协调器只执行协议。
- 06 coordinator 拥有恢复、永久删除与保存/入队/活动目标建立之间的跨进程文章锁；durable deletion transaction 继续拥有正文与墓碑/恢复证据的一致性，不把 SQLite 事务扩大到文件锁等待。
- composition 只向档案/删除用例注入 `publishedArchiveQueries` 与 `safeDeletionTransitions` 两个最小具名 capability；档案查询不得获得发布写能力，删除能力不得获得订单历史删除或通用 OperationalStore 写能力。
- Renderer 只展示档案与允许动作，不抓取网页覆盖本地投稿内容。

## 架构硬门槛

- 档案、删除策略、删除协调和 UI 保持明确 owner 与依赖方向；只在具有独立不变量、变化或测试理由时形成边界，禁止透传拆分。
- 审计保留使用最小稳定 DTO，不保留不必要客户敏感资料。
- 不通过一个“文章状态”覆盖发布、订单和删除事实。
- 已发布判断集中复用 03/06，不在回收站和页面分别实现。

## Acceptance criteria

- [ ] 普通 accepted 和网站媒体状态 2 都建立永久只读发布档案。
- [ ] 全库只有 09 建立的一个生产 publication-success primitive；普通平台与网站媒体的具名事务端口在内部委托它，22 不新增 writer，重复和并发 observation 不产生竞争事实。
- [ ] 档案显示实际投稿标题/正文、客户、目标、时间、结果和可用远端信息。
- [ ] 已发布文章不能编辑、再次入队、复制版本或进入回收站。
- [ ] 售后、退款、未收录和链接失效不撤销发布成功。
- [ ] 永久删除未发布正文后，服务商订单和最小审计信息仍可查询。
- [ ] 恢复/永久删除与保存、普通入队、付费 admission 和活动目标建立的正序/反序并发测试证明使用同一规范文章锁；锁内事实变化会拒绝删除，故障恢复不留下正文已删但运行事实随后建立的竞态。
- [ ] composition/架构测试证明档案 UI 只能消费只读 `publicationEvidenceV1`，不能旁路成功 writer、订单删除或通用 store。
- [ ] 普通平台和网站媒体档案正确展示提交时间与首次发布时间；对合成的 `legacy_unavailable` publication evidence，档案投影显示规范缺失原因且不以当前时间或另一个时间字段替代。本 ticket 不声称真实 migration import → archive query 链已通过，该生产链由 Ticket 23 及波次 9 集成复验完成。
- [ ] 当前生产纯文本档案展示 `text_only`、空图片清单和 `initial`，历史图片摘要不可得时展示规范缺失原因；使用 09 validator 的合成前向兼容 fixture 证明后置带图/换图/降级摘要可只读展示且不暴露路径或二进制，但本 ticket 不声称 Ticket 18–21 生产链已实现。
- [ ] 交接记录包含保留矩阵、隐私边界、删除故障测试、公开接口、依赖方向及显著规模变化说明。
- [ ] 上述四个 V1 身份/目标合同具有精确公开导出、上界与 extra/sensitive-field 反例测试，并在交接中列出 Ticket 23 的只读复用入口。

## 审计建议

- 等级：深度独立审计。
- 范围：09/15 发布成功唯一 writer、发布档案快照、06 coordinator 的 restore/permanent-delete、文章锁与运行事实竞态、已发布禁用、未发布永久删除和最小审计保留。
- 必须注入保存/入队/活动目标/恢复/永久删除并发及删除事务故障，确认不会删除订单或发布证据；不重复审计 09/16 的全部结果状态机，不运行完整 `npm test`。

## Non-goals

- 不抓取最终网页正文，不撤回远端内容。
- 不允许删除订单或发布证据。
