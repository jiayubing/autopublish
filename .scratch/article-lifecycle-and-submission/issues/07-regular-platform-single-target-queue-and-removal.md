# 07 — 普通平台单目标入队与待执行移除

**What to build:** 让用户一次把多篇待投稿文章加入一个确定的普通平台和账号，并可单篇或批量移除尚未开始的队列项，安全恢复文章编辑。

**Blocked by:** 02 — 投稿清理、删除协调与恢复深模块；06 — 统一文章编辑、改投与回收权限

**Status:** ready-for-agent

## 启动约定

- 验证 02 的投稿门面和移除端口已稳定，06 的活动目标与编辑守卫已启用。
- 先固定现有多目标请求、队列副本、取消计划和账号绑定行为，明确哪些兼容入口将在 24 删除。

## 执行过程

1. 定义普通平台单目标入队命令：文章集合、平台、平台账号档案和可选队列配置；拒绝平台集合或媒体资源混入。
2. 预检批量读取文章资格与操作权限，返回可入队、幂等、缺失和冲突项；提交时在事务内重新验证。
3. 在 06 coordinator owner 内增加 `admitRegularQueueItems` 具名方法并复用已由批量回收验证的私有 article-set 锁原语，严格遵守身份去重、规范排序、部分失败逆序释放、全量事实重读和 composition-time transition port 合同；锁内从权威文章生成 expected fingerprint 与不可变投稿快照，再为每篇成功项调用 OperationalStore 的单个 admission 事务端口，同时声明唯一活动目标、保存该快照并创建待执行队列项。快照只供执行和审计，不作为可独立编辑文章暴露；执行期 publisher input 必须使用该快照而非旧队列文件。
4. 提供单篇和批量移除命令，只允许尚未领取/尚未远端开始的项；通过 06 coordinator 的 `removePendingQueueItems` 具名方法在文章锁内复核，再调用 transition-specific removal 事务同时写入明确终态、移除队列项并结束对应活动目标，不调用通用 release。
5. 重复入队与重复移除返回稳定幂等结果，部分失败不能造成文章冻结与队列事实分离。
6. 接入 typed IPC 和最小 Renderer 操作流，完整队列组界面留给 10。

## 职责边界

- 入队用例拥有选择验证；OperationalStore admission/removal 组合端口拥有活动目标与队列项的一致性事务，调用方不得用多个公开写操作拼接。
- 06 coordinator 拥有文章锁、规范锁顺序和锁内事实复核；本 ticket 只在该 owner 内增加普通平台具名方法并注入 admission/removal 端口，不自行取得锁或接收通用 callback。
- composition 向同一个共享 coordinator 运行时实例增加 `regularQueueTransitions` 最小 capability，包含普通队列 admission/removal 所需的事实读取和两个具名事务操作；coordinator 可继续持有既有 publication/recovery 等方法各自所需的其他具名最小 capability，并由 12 在同一实例增加独立 `paidAdmissionTransitions`，但不得注入完整 OperationalStore、通用 claim/release 或任意写能力。`admitRegularQueueItems` / `removePendingQueueItems` 只能闭包消费 `regularQueueTransitions` 和共享文章锁/策略端口，不能访问付费、订单 outcome 或迁移 capability；composition 只向普通队列应用服务暴露包含这两个普通平台命令的冻结 facade。
- 队列存储拥有任务身份、FIFO 序号和领取状态，不保存可编辑文章副本。
- 移除用例只处理 pending 项，不承担远端取消。
- 平台账号解析是独立端口，不能由 Renderer 名称代替稳定账号身份。

## 架构硬门槛

- 单目标请求契约保持窄小，不保留新的 `targetPlatformIds` 集合接口。
- 用例、存储和投影边界职责清晰，公开接口保持窄小；不得为缩短文件拆出透传层或复制活动目标不变量。
- 禁止在 UI 中复制入队资格或可移除判断；提交时必须服务器侧复核。
- 不新增队列文件/数据库双写所有者；SQLite 是运行事实权威源。
- `regularQueueTransitions` 由 OperationalStore owner 直接提供或在 composition 冻结选取，不创建只做同名参数转发的 wrapper；普通队列 facade 只做能力收窄，不重新实现状态转换或事务。

## Acceptance criteria

- [ ] 一次入队只能选择一个普通平台和一个确定账号。
- [ ] 多篇文章返回明确逐项结果；每个成功项的活动目标和队列项在同一 SQLite 事务中建立，入队后立即冻结且不存在孤立事实。
- [ ] 尚未开始项支持单篇和批量移除，成功后文章恢复待投稿和编辑。
- [ ] admission/removal 命令消费 06 的统一权限与协调端口；真实队列入队后既有文章保存被拒绝，pending 移除完成后使用新读取到的 edit fingerprint 可以保存，stale fingerprint 仍被拒绝。
- [ ] 通过公开 `admitRegularQueueItems` 行为覆盖 articleRef 去重、正序/反序集合并发、部分锁取得失败逆序释放、锁内全量事实重读和并发保存；不得直接测试私有锁函数或增加 test-only seam。
- [ ] 已领取、远端开始、活动订单或不确定项不能按本地移除处理。
- [ ] 重复入队/移除幂等，失败不会留下孤立活动目标或无主队列项。
- [ ] 交接记录包含命令契约、状态转换、兼容入口、模块职责、依赖方向及显著规模变化说明。
- [ ] composition/架构测试证明共享 coordinator 未获得完整 OperationalStore 或通用写能力，`admitRegularQueueItems` / `removePendingQueueItems` 只能消费 `regularQueueTransitions`；普通队列应用服务获得的冻结 facade 看不到付费、订单 outcome、迁移或其他无关命令，且 admission/removal 事务不能由调用方拆开拼接。

## 审计建议

- 等级：深度独立审计。
- 范围：06 coordinator 的 admission/removal 具名端口、article-set 锁键/锁序/失败释放、OperationalStore 单事务活动目标与队列项、逐项结果、CAS 冻结/解冻、typed IPC 和直接 Renderer 回归。
- 必须用公开 `admitRegularQueueItems` / `removePendingQueueItems` 行为验证正序/反序并发、部分失败和 stale fingerprint；不审计 08 的组编排或 12 的付费规则，不运行完整 `npm test`。

## Non-goals

- 不实现队列组并行运行、开始全部或暂停全部。
- 不实现图片配置和平台上传。
