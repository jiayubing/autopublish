# 15 — 服务商订单同步、筛选与刷新

**What to build:** 提供以待安排为默认入口的订单页，稳定映射服务商状态，支持页面打开刷新一次、刷新全部和刷新单个订单；刷新失败不篡改原事实，已知订单查询缺失通过证据绑定的具名人工命令安全收口。

**Blocked by:** 09 — 普通平台结果分类与唯一发布成功 writer；11 — 网站媒体服务商契约深模块；13 — 网站媒体严格串行付费批次

**Status:** ready-for-agent

## 启动约定

- 订单页只展示真实订单号对应记录；不确定但无订单号的任务留在需处理。
- 订单详细状态属于订单页，文章管理只消费付费处理中、需处理或已发布的高层投影。

## 执行过程

1. 定义订单只读模型、状态映射和计数：0 待安排、1 已安排、2 已发布、4 已退稿、9 售后中、全部。
2. 实现批量同步与单订单同步应用服务，使用 11 的端口查询；每个 observation 与其派生的生命周期事实通过单个 transition-specific 事务原子保存，不把整批网络请求放入一个事务。
3. 状态 2 的订单 observation 事务必须在 OperationalStore 内委托 09 建立的唯一 publication-success primitive，按 `publicationEvidenceV1` 映射网站媒体实际投稿标题/正文、媒体/目标安全快照、订单号、结果和安全链接；`submittedAt` 取 13 保存的订单创建提交快照，`firstPublishedAt` 优先取可信服务商发布时间，否则取首次观察到 status 2 的时间并保存规范来源。两个在线时间字段均不得缺失或互相替代。事务原子保存首次发布成功与活动目标终态，不得建立网站媒体专用成功 writer。状态 4 原子记录退稿并在不存在其他阻塞事实时恢复编辑，状态 9 不撤销已有发布成功。
4. 查询传输失败时保留原状态并报告刷新失败；已知订单明确缺失时原子记录 order-status-anomaly、保留订单与活动目标并冻结文章，不自动推断取消、退稿或发布。
5. 提供 `prepareOrderStatusAnomalyResolution`：绑定订单身份、最新 observation fingerprint、当前发布事实和证据 fingerprint，尽量通过 11 查询并返回 `verified_trackable`、`verified_published`、`verified_non_published_terminal` 或 `inconclusive` 及短期确认令牌。查询失败、缺失且无额外证据或信息不足保持 `inconclusive`。
6. 只提供三个具名 resolution：`resumeOrderTracking` 以可跟踪证据原子保存新 observation、清除 anomaly 并保留活动目标；`confirmOrderPublished` 以发布证据在同一事务调用唯一 publication-success primitive、清除 anomaly并永久冻结，其中 `submittedAt` 仍取 13 快照，`firstPublishedAt` 优先可信远端事件时间，否则取首次正面证据被操作者确认的时间并标记 source=`manual_positive_evidence_time`，不得冒充供应商发布时间；`confirmOrderNotPublished` 以明确取消/退稿/其他非发布终态证据原子保存人工决定、清除 anomaly、结束活动目标，并仅在无其他阻塞事实时恢复编辑。存在未收口 cancellation intent 时，除已发布证据可建立永久成功外，其他 resolution 返回稳定冲突并交由 16 收口。
7. 三种 resolution 都复核 expected observation、证据 fingerprint、当前发布事实和 anomaly 未收口状态；重复同向命令幂等，相反决定或状态漂移冲突，所有人工证据只保存安全摘要。
8. Renderer 默认选中待安排，显示各筛选数量并按创建时间倒序；页面首次打开自动刷新一次，避免重复挂载循环。订单状态异常只展示 prepare 返回的证据状态和允许的具名动作，不自行推断。
9. 提供顶部刷新全部和详情刷新单个按钮，展示逐项失败而不清空旧列表；长期待安排/已安排只显示延迟提醒，不自动判定失败。

## 职责边界

- 订单同步服务负责查询与保存 observation，不决定页面筛选。
- 订单状态策略负责规范状态到生命周期事实的转换。
- 订单投影负责筛选、计数和排序，不发网络请求。
- OperationalStore 订单 observation 组合端口拥有 observation、首次发布成功和活动目标转换的一致性事务；同步服务不得先写状态再另行补生命周期事实。
- order-status-anomaly 核对服务只拥有证据准备和三个具名 resolution 的编排；不复用 14 的订单创建 uncertain 或 16 的取消 uncertain，也不暴露通用 resolve。
- OperationalStore 内建立唯一的 `orderTransitionGuard` 内部 aggregate/decision seam，统一读取当前 order observation、首次 publication success、open order-status-anomaly 和 open cancellation intent，固定“已发布优先、未知冻结、状态漂移冲突、明确非发布才可解冻”的优先级。15 的 observation/anomaly 具名事务和 16 的 cancellation intent/outcome 具名事务都必须在各自 SQLite 事务内调用它；guard 不作为公开通用 resolve，也不执行远端调用。
- composition 只向订单同步服务注入 `orderObservationTransitions` capability，包含 observation、anomaly prepare/resolution 和必要的 guard-backed fact read；不得注入完整 OperationalStore 或任意取消/迁移写能力。
- Renderer feature 负责刷新请求身份和反馈，组件只展示。

## 架构硬门槛

- 同步、状态策略、投影和 UI 保持明确 owner 与依赖方向；只在具有独立变化或测试理由时设边界，禁止为缩短文件增加透传层。
- 不把批量刷新循环、状态映射和 JSX 塞入同一组件。
- 批量同步可部分成功，单个失败不回滚其他已确认 observation。
- 页面不读取供应商原始响应决定按钮。
- order-status-anomaly 信息不足时失败关闭；未收口 anomaly 或 cancellation intent 不得被普通刷新/手工命令旁路解冻。
- `orderTransitionGuard` 是唯一订单事实优先级 owner；订单同步、取消服务、Renderer 和订单投影不得复制其判断。

## Acceptance criteria

- [ ] 订单页默认待安排，提供 0/1/2/4/9 和全部筛选、数量与倒序。
- [ ] 页面打开只自动刷新一次，并支持刷新全部和单个订单。
- [ ] 刷新失败保留原状态和列表，不伪造失败或发布。
- [ ] 已发布、退稿、售后和订单缺失正确更新文章高层投影。
- [ ] observation 保存故障不会出现订单状态已更新但发布/活动目标事实缺失（或反向缺失）的部分转换；批量同步仍允许其他订单独立成功。
- [ ] status 2 从订单 observation 公开行为证明复用 09 的唯一 publication-success primitive，与普通 accepted 并发时 first-wins、快照不可覆盖且不会产生第二个 writer。
- [ ] status 2 生成的 `publicationEvidenceV1` 保留订单创建 `submittedAt`，并将可信服务商发布时间或首次 status 2 observation 映射为带来源的 `firstPublishedAt`；不得把两者压成同一时间。
- [ ] `confirmOrderPublished` 在没有可信远端发布时间时使用明确标记的 `manual_positive_evidence_time`，既能完成合法人工收口，也不会把确认执行时间伪装成供应商发布时间。
- [ ] 订单缺失进入 anomaly 后，prepare 对可跟踪、已发布、明确非发布终态和 inconclusive 返回稳定类别；三个具名 resolution 在重复、相反决定、stale token、状态漂移和事务故障下保持订单、活动目标、发布事实和文章权限一致。
- [ ] Ticket 15 的公开 observation/anomaly 行为证明 `orderTransitionGuard` 集中执行“已发布优先、anomaly 未收口保持冻结、明确非发布终态才可恢复编辑”，且向 Ticket 16 暴露读取 open cancellation intent 与追加 guard-backed transition 所需的稳定内部合同，不在本 ticket 提前创建取消命令。
- [ ] cancellation intent 与 anomaly 并存、15/16 共同调用 guard 以及取消在途时 status 2 永久优先的公开行为，明确留给 Ticket 16 及波次 7 集成复验；Ticket 15 不增加 test-only cancellation writer 验证未来行为。
- [ ] 长期未完成只提示延迟，不自动终结。
- [ ] 交接记录包含状态映射、同步事务、UI 组件边界、依赖方向及显著规模变化说明。

## 审计建议

- 等级：深度独立审计。
- 范围：11 查询端口、状态 0/1/2/4/9、唯一 publication-success primitive、observation 事务、订单缺失 anomaly prepare/三种 resolution、刷新/取消并发、批量部分成功、筛选和 Renderer 动作投影。
- 必须验证 status 2/4/9、普通/付费成功并发、订单缺失证据不足、guard 对未来 open cancellation intent 的封闭消费合同、状态漂移和事务故障；不提前验证 Ticket 16 的取消公开行为，不重复审计 13 的远端下单副作用，不运行完整 `npm test`。

## Non-goals

- 不实现订单取消；由 16 完成。
- 不实现自动申诉、退款或图片传输。
