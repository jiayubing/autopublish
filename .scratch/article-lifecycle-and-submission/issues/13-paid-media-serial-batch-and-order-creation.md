# 13 — 网站媒体严格串行付费批次

**What to build:** 按已确认费用快照逐篇串行创建网站媒体订单，只有取得真实订单号才移出投稿队列并进入付费处理中，支持独立暂停且重启不自动继续。

**Blocked by:** 02 — 投稿清理、删除协调与恢复深模块；04 — 扩展 SQLite 生命周期与队列事实；12 — 网站媒体付费预检与费用确认

**Status:** `COMPLETE`（以 `ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md` 中保留的实时 Ticket 13、Wave 5 audit/commit/handoff provenance 为准）；不得重复调度

**Scheduling gate:** 已关闭。历史实施、审计、修复与合并证据只从当前 Git 和波次计划读取；后续不得以本 ticket 文档为由重复创建 13 线程。

## 启动约定

- 核对 12 已创建不可变付费批次确认，04 已能保存 intent、订单和暂停事实。
- 启动时必须导入并复用 Ticket 08 唯一 domain owner 导出的 `articleIdentityV1` / `targetIdentityV1` validator；付费链路只允许 `targetIdentityV1.kind=media`，不得在订单聚合、OperationalStore 或供应商 adapter 复制身份字段或建立宽松 mapper。
- 付费批次与普通平台队列是不同应用服务；普通平台开始全部/暂停全部不得调用本服务。

## 执行过程

1. 建立全局串行付费批次编排器，每次只领取一个未开始项；已确认批次禁止追加新文章。
2. 每笔订单前复核资源接单状态、价格、文章指纹和系统投稿标识码；发生变化时暂停未提交项并要求重新确认。
3. 在远端调用前生成并持久化稳定 `orderCreationAttemptId`，绑定批次项、12 的不可变提交快照、活动目标、正文/价格 fingerprint 与 attempt prepared time；调用 11 前通过 `paidExecutionTransitions.beginOrderCreationRemoteCall` 只写一次 `remoteCallStartedAt`，其语义同 08：从此不得安全自动重放，不声称供应商已接收。事务成功后才调用创建订单端口，返回后通过 transition-specific outcome 事务按该身份持久化 observation；未收口 intent 不得重新生成身份，进程中断或本地持久化失败不能把已进入远端边界的 intent 重新变为可提交。
4. 只有明确成功且有订单号时，才由单个 success outcome 事务调用内部 `orderCreationAttemptGuard`，原子创建服务商订单快照、收口 attempt、终结付费批次项并保留订单对应的活动目标，使文章投影为付费处理中。该可信成功高于 14 的“确认没有订单”；若已存在同 attempt 的不同可信订单号，或人工收口后出现不兼容的新活动目标，保存真实订单安全证据、保持冻结并进入具名冲突，不自动挑选或再次下单。远端可能成功但本地无法完成该事务时，保持 order_creation_uncertain 交给 14 核对。
5. 文章/资源级明确拒绝通过具名 rejection outcome 事务原子保存 observation、收口 attempt、终结当前批次项和活动目标，并仅在无其他阻塞事实时恢复编辑；事务提交后才继续下一项。余额、账号、服务级明确拒绝通过另一具名 outcome 事务原子保存 observation、收口 attempt、把当前项置为安全 blocked、暂停批次并保持文章冻结；事务提交后才停止领取。任一 rejection outcome 落库失败都保留未收口 intent并失败关闭，不得提前继续、暂停后重试或解冻。
6. 暂停命令等待当前请求明确返回后阻止下一笔，不强制中断在途请求。
7. 应用重启后保持暂停，不自动恢复扣费；由用户重新确认继续资格。
8. 增加串行、价格竞态、错误范围、暂停竞态、重启和部分成功测试。

### 下游迁移必须复用的订单 V1 owner

Ticket 13 必须在 `src/domain/` 的订单聚合公开合同中建立以下唯一、版本化、递归封闭 validator。所有 object 都必须精确匹配字段集并拒绝 extra fields；所有嵌套身份都直接调用 08 的 owner validator，不复制字段。

- `orderIdentityV1 = { version, orderId }`：`version=1`；`orderId` 为供应商明确返回或 14 验证补录的 1–128 位 `[A-Za-z0-9._:-]` 身份，不得为 `null`、空白、控制字符或规范化后的另一形式。当前单供应商合同下 `orderId` 全局唯一；未来如需多供应商命名空间必须演进 V2，不得向 V1 追加可选字段。
- `orderSnapshotV1 = { version, orderIdentityV1, articleIdentityV1, targetIdentityV1, orderCreationAttemptId, mediaName, quotedPrice, estimatedTotal, actualAmount, systemSubmissionCode, submittedTitle, submittedBody, contentFingerprint, remoteCallStartedAt }`：`version=1`，`targetIdentityV1.kind=media`；`orderCreationAttemptId` 为 1–128 位安全身份；`systemSubmissionCode` 必须精确复用 12 已验收确认快照中的规范值和 1–128 上界，不得改名为供应商字段 `systemSubmissionId`；`mediaName` 为 1–256 个 UTF-16 code units；`submittedTitle` 为 1–30 个 Unicode code points，`submittedBody` 为 1–200,000 个 UTF-16 code units，并复用 12 已验收的 trim、非空和控制字符规则。`quotedPrice`、`estimatedTotal` 必须精确复用 12 的有限非负 number 合同和既有 `0..100000000` 上界，不得另行换算成整数分或现场引入 currency；`actualAmount` 为 `null` 或同一数值合同下的服务商实际金额，缺少供应商证据时必须为 `null`。`contentFingerprint` 为精确覆盖 `{ submittedTitle, submittedBody }` 稳定 UTF-8 规范序列化的 64 位小写 SHA-256；`remoteCallStartedAt` 为带时区的 ISO-8601 时刻且不可为 `null`。快照只记录订单建立时已知的不可变事实；后续发现的实际金额、状态和链接通过 15/16 的追加 observation/history 合同保存，不得回写 V1 快照或用预计费用冒充实际金额。
- `paidTargetV1 = { version, articleIdentityV1, targetIdentityV1, orderCreationAttemptId, orderIdentityV1, state, terminalAt }`：`version=1`，`targetIdentityV1.kind=media`，attempt/order 必须与同聚合快照一致；`state` 只允许 `ACTIVE_TRACKING|TERMINAL_PUBLISHED|TERMINAL_REJECTED|TERMINAL_CANCELLED`。`ACTIVE_TRACKING` 必须 `terminalAt=null`；三种 `TERMINAL_*` 必须提供带时区 ISO-8601 `terminalAt`；不确定创建不得伪造 `orderIdentityV1`/`paidTargetV1`，取消不确定仍保持 `ACTIVE_TRACKING`并由 16 的追加观测事实表达。
- 公开合同测试必须覆盖三个 DTO 的缺字段、extra field、错误版本/kind/enum、null 组合、字符串/金额上界、fingerprint/时间格式、身份不一致和递归嵌套 extra field。
- 14、15、16、22、23 只能导入该 owner 的 `orderIdentityV1` / `orderSnapshotV1` / `paidTargetV1` validator；不得从数据库行、供应商对象、Renderer 类型或 migration payload 复制订单/目标字段。若后续业务需要新增字段，必须新版本演进，不能放宽 V1。

## 职责边界

- 付费编排器只拥有领取顺序、复核、暂停和结果分发。
- 供应商适配器拥有远端契约，不操作本地批次。
- 订单聚合拥有真实订单和快照，不创建队列项。
- OperationalStore outcome 组合端口拥有 intent/observation、批次项、订单和活动目标的一致性事务；编排器不得拼接多个公开写操作。
- OperationalStore 内部 `orderCreationAttemptGuard` 是 13 正常 success/rejection outcome 与 14 两种人工 resolution 的唯一 attempt 收口优先级 owner：可信带订单号成功优先于“确认没有订单”，同向幂等，不同可信订单号或不兼容活动目标进入冻结冲突。guard 不公开、不执行远端调用，也不替代各自具名事务端口。
- composition 只向付费编排器注入 `paidExecutionTransitions` 最小 capability，包含串行领取、暂停、intent 与具名 outcome 所需操作；不得注入完整 OperationalStore、普通队列或迁移能力。
- 文章生命周期投影消费事实，不由编排器直接写界面阶段。

## 架构硬门槛

- 编排通过窄接口封装串行、复核和错误范围不变量；订单提交保持供应商边界，禁止为缩短文件拆出无独立职责的转发模块。
- 远端调用不在 SQLite 事务内；intent/outcome 协议必须可故障恢复。
- 不复用普通平台组状态机或全局控制器。
- 新增供应商不应要求修改文章分类核心或 Renderer 页面状态机。
- `paidExecutionTransitions` 隐藏 claim/intent/outcome 的正确顺序，调用方不能取得可任意组合的底层写方法；capability 本身不得是纯透传 wrapper。
- `orderCreationAttemptId` 是 13→14 的稳定核对身份，不是服务商幂等键；只由 13 创建，14 只能读取并通过共同 guard 收口。两个人工 resolution 之间 first-wins，但可信带订单号 success 具有更高优先级；未收口期间禁止产生新 attempt 或再次远端下单。

## Acceptance criteria

- [ ] 付费订单严格串行，任何时刻最多一个创建请求在途。
- [ ] 成功返回订单号后才建立订单并自动移除对应投稿队列项。
- [ ] 已确认批次不能追加文章，普通平台开始/暂停全部不影响付费批次。
- [ ] 资源/价格变化和账号/余额/服务问题暂停剩余项且不产生未确认费用。
- [ ] 文章/资源级明确拒绝仅在不存在其他阻塞事实时恢复该文章编辑，并且只有 rejection outcome 事务完整提交后才继续下一项。
- [ ] 在远端调用前后及成功响应后的本地事务中注入故障，证明任何已跨过远端边界但缺少完整本地终态的项都会冻结为 uncertain，重启后不会再次创建订单。
- [ ] 在 `beginOrderCreationRemoteCall` 提交前后注入崩溃，证明标记前没有远端下单且只能在用户重新确认后继续，标记后即使请求尚未来得及发出也保守冻结且绝不自动重放；`remoteCallStartedAt` 只写一次。
- [ ] 13→14 合同测试证明 `orderCreationAttemptId` 稳定绑定批次项、提交快照、目标、fingerprint 和时间证据；崩溃恢复与重复命令复用同一身份，未收口 intent 不会生成新 attempt。
- [ ] 正常 success 的重复、并发和事务故障通过本 ticket 的公开 outcome 行为证明 `orderCreationAttemptGuard` 对同向成功幂等、对同一 attempt 的不同可信订单号失败关闭，并为 14 暴露稳定的 attempt/证据/优先级消费合同；success、补录订单和“确认没有订单”的三方竞态由 Ticket 14 及波次 6 集成复验完成。
- [ ] 对文章/资源拒绝与账号/余额/服务拒绝的每个事务写点注入故障，证明只有完整提交后才继续下一项或暂停批次；失败不会提前解冻、领取下一项、遗留部分 observation 或丢失未收口 intent。
- [ ] composition/架构测试证明付费编排器只获得 `paidExecutionTransitions` 和 11 的创建订单端口，无法旁路调用其他 OperationalStore 写能力。
- [ ] 重启后不会自动继续付费，交接记录包含 intent/outcome、错误范围、模块职责、依赖方向及显著规模变化说明。
- [ ] `orderIdentityV1` / `orderSnapshotV1` / `paidTargetV1` 的精确公开导出、递归封闭字段/null/上界规则和正反合同测试已记录，且直接调用方只复用 owner validator；这三个合同成为 14/15/16/22/23 的硬前置，不允许下游补定义。

## 审计建议

- 等级：深度独立审计。
- 范围：付费批次串行领取、每笔复核、稳定 `orderCreationAttemptId`、intent/outcome、订单号门槛、批次/订单/活动目标原子转换、暂停/重启、错误范围和远端成功后本地故障。
- 必须注入价格竞态、两类明确拒绝的逐写点故障、响应缺订单号、进程中断和本地事务失败，证明事务提交前不继续/暂停且不会重复扣费；不重复审计 12 的确认模型或 14 的人工核对界面，不运行完整 `npm test`。

## Non-goals

- 不自动重试不确定创建结果；由 14 处理。
- 不实现订单状态刷新和取消。
