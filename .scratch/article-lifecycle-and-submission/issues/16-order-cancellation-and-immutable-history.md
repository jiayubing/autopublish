# 16 — 服务商订单取消与永久历史

**What to build:** 允许用户取消待安排订单、尝试取消已安排订单，在明确成功后按全局发布事实决定是否恢复文章，并以证据绑定的两种人工命令收口取消结果不确定，同时永久保留订单、费用和取消证据。

**Blocked by:** 15 — 服务商订单同步、筛选与刷新

**Status:** document-ready；当前不可调度

**Scheduling gate:** 等待波次 6 `COMPLETE`，并等待波次 7 的 Ticket 10 完成轻量定向复核、提交、合并和定向复验后，从新的集成 `HEAD` 调度；该顺序不建立 16←10 的业务依赖。

## 启动约定

- 取消是远端业务动作，不等同于移除本地投稿队列；已有订单必须始终从订单页操作。
- 已发布、已退稿和售后中不提供取消；已安排取消必须提示可能被服务商拒绝。

## 执行过程

1. 定义取消预检和执行命令，包含订单号、当前 observation 指纹、允许性、风险提示、确认令牌和服务端生成的稳定 cancellation attempt identity。
2. 待安排显示“取消订单”，已安排显示“尝试取消”；其他状态不返回取消动作。
3. 跨过远端调用边界前，先通过 cancellation intent 事务原子保存 attempt identity、订单身份、expected observation fingerprint、确认身份和必要安全快照，再调用 11 的取消端口。恢复流程不得自动重放尚无明确 outcome 的 intent。
4. cancellation outcome 事务必须复核未收口 attempt、expected observation fingerprint、当前订单 observation 和全局发布事实。无漂移时，明确成功原子追加取消 observation、收口 intent、结束活动目标并在无其他阻塞事实时恢复编辑；明确拒绝原子收口 intent 并保持订单与活动目标。若在途期间已建立全局发布成功，明确成功或拒绝只追加取消 outcome 并收口 intent，绝不撤销发布、结束永久成功事实或报告恢复编辑；unknown 仍保留 intent 与冻结。若 observation 漂移到其他不允许状态，返回稳定冲突并保持冻结进入人工核对。超时、断线、进程中断或成功响应后的本地事务失败保留 intent 与原远端事实，不猜测取消成功，也不自动再次取消。
5. 提供 `prepareCancellationResolution` 查询/证据命令：以 attempt identity 读取未收口 intent，通过 11 的订单详情端口尽量取得最新规范 observation，并返回 `verified_cancelled`、`verified_active` 或 `inconclusive`、安全证据摘要及绑定 attempt、expected observation fingerprint 和证据 fingerprint 的短期确认令牌。查询失败、订单缺失或供应商信息不足保持 `inconclusive`，不得自动推断任何结果。
6. 只提供两个具名人工收口命令：`confirmCancellationSucceeded` 必须携带可核对的规范远端证据或用户从服务商取得的取消凭据，通过单个 cancellation resolution 事务原子收口 intent、追加人工决定与取消 observation、结束活动目标，并仅在不存在其他阻塞事实时恢复待投稿；`confirmCancellationNotApplied` 必须携带订单仍活动/取消被拒绝的规范证据，通过同类事务收口 intent、追加人工决定并保留订单与活动目标，随后只有基于最新 observation 的新预检才能再次尝试取消。`inconclusive` 不允许收口，证据不足时继续冻结。
7. 两种 resolution 都在事务内复核未收口 attempt、expected observation fingerprint、证据 fingerprint 和当前发布/订单事实；已有全局发布成功时任何 resolution 都只能追加证据并保持永久冻结，不得恢复编辑。状态漂移、重复或相反决定返回稳定幂等/冲突结果。人工证据只保存规范状态、来源、时间、外部凭据安全摘要和操作者决定，不保存供应商原始响应、凭据正文或敏感页面内容。
8. 订单记录、创建快照、价格、系统标识码、取消尝试、人工收口和后续售后永久保留，不提供删除命令。
9. Renderer 通过统一确认宿主展示取消风险、cancellation-uncertain 的证据状态和且仅有的两个人工动作；刷新后仍能看到已取消及人工核对历史。
10. 增加状态竞态、重复取消、明确拒绝、传输异常、重启恢复、两种人工收口和已发布禁用测试。

## 职责边界

- 取消策略决定哪些状态可尝试和提示文本。
- 取消应用服务编排远端调用与 observation，不删除订单。
- 订单聚合只追加事实，禁止破坏性覆盖历史。
- OperationalStore cancellation intent/outcome/resolution 组合端口拥有尝试身份、取消 observation、人工证据、订单历史和活动目标终结的一致性事务；应用服务不得以多个公开写操作拼接 intent、取消结果或人工收口。
- 取消核对服务只编排订单查询、证据匹配和两种具名 resolution，不创建新的远端取消尝试；不得复用 14 的订单创建 uncertain 状态机或暴露通用 resolve 命令。
- 取消 intent/outcome 事务必须调用 15 固化的内部 `orderTransitionGuard`，不复制发布优先级或 anomaly/cancellation 并存判断；composition 只注入 `orderCancellationTransitions` capability，不注入完整 OperationalStore 或订单同步的任意写能力。
- Renderer 不根据状态码自行构造远端操作。

## 架构硬门槛

- 取消策略与供应商请求在应用/adapter 边界分离；策略接口应隐藏允许矩阵，禁止为缩短文件拆出无独立职责的转发模块。
- 历史采用追加事实/不可变快照，不用一个可变 status 覆盖全部证据。
- 传输异常失败关闭，不能通过本地状态回滚推断远端取消成功。
- attempt identity 只用于本地幂等与核对，不得假定服务商取消端口提供远端幂等；存在未收口 intent 时拒绝新的取消尝试。
- cancellation-uncertain 状态机通过 prepare + 两种 resolution 的窄接口隐藏证据匹配和转换规则；IPC、Renderer 和订单同步不得各自解释证据或直接结束 intent。
- 不将取消逻辑加入文章回收服务或普通平台队列移除模块。

## Acceptance criteria

- [ ] 待安排可取消，已安排显示风险后可尝试，2/4/9 不提供取消。
- [ ] 明确取消成功后仅在不存在全局发布成功和其他阻塞事实时恢复待投稿和编辑；若取消在途期间已发布，则只追加取消证据并保持永久冻结。订单历史始终可查询。
- [ ] 明确拒绝保持付费处理中，传输异常不改变原远端事实。
- [ ] 重复取消幂等，状态在预检后变化会使确认失效。
- [ ] 在 intent 保存前后、远端响应前后和 outcome 事务中注入故障，证明跨过远端边界的未收口 intent 会保持冻结、阻止再次取消并进入人工核对；远端 outcome 路径只有明确拒绝/成功可直接收口，其他情况只能经证据绑定的两种人工 resolution 收口。
- [ ] 取消成功后的本地事务故障保持安全冻结并要求核对，不会出现文章已解冻但取消证据缺失，也不会据此自动再次取消。
- [ ] `prepareCancellationResolution` 对已取消、仍活动、订单缺失、查询失败和信息不足返回稳定证据类别；缺失与未知保持 `inconclusive`，不能解冻或开放新取消。
- [ ] “确认已取消”原子保存人工证据、收口 intent、结束活动目标并按其他事实决定是否恢复编辑；“确认未取消”原子保存证据、收口 intent并保留订单/活动目标，且只有新 observation 下的新预检可再次取消。
- [ ] 重启、重复同向命令、相反命令、stale token、状态漂移和 resolution 事务故障不会留下 intent、订单、活动目标与文章权限相互矛盾的部分状态。
- [ ] 保存 cancellation intent 后并发同步 status 2，再收到取消成功、拒绝或 unknown 时，首次发布事实始终优先且永久保留；取消链只追加证据，不恢复编辑或重新开放目标。
- [ ] composition/架构测试证明取消服务只能通过 `orderCancellationTransitions` 和 11 的取消端口工作，不能旁路订单 observation、迁移或其他写能力；`orderTransitionGuard` 仍是唯一优先级 owner。
- [ ] 订单、价格、标识码和取消证据没有删除入口。
- [ ] 交接记录包含允许矩阵、异常语义、历史模型、公开接口、依赖方向及显著规模变化说明。

## 审计建议

- 等级：深度独立审计。
- 范围：取消允许矩阵、durable intent/outcome、cancellation-uncertain prepare 与两种 resolution、证据 fingerprint、状态漂移、重启/重复命令、文章冻结/解冻和不可变订单历史。
- 必须注入远端响应前后、outcome/resolution 事务故障及相反人工决定，证明不会自动再次取消或出现文章权限与订单事实分离；不重复审计 22 的永久删除，不运行完整 `npm test`。

## Non-goals

- 不自动取消、自动申诉或自动退款。
- 不撤销已发布文章的全局发布事实。
