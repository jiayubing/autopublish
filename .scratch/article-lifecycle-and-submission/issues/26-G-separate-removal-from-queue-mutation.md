# 26-G — 删除链路收敛

## 目标

使“移入回收站”只改变文章内容/墓碑事实，不自动撤销普通队列或付费批次。所有活动投稿必须先在投稿中心安全结束。

## 最小必读

1. 根 `AGENTS.md`。
2. `CONTEXT.md` 中：普通平台队列项、已确认付费批次、活动发布目标、回收站文章、已发布文章、结果不确定。
3. SPEC：§2.4、§5.2、§8、§9.2、§11 第 6–7/12–13 项。
4. Wave Plan 当前动作、umbrella、26-D/E/F handoff、本合同；`EXECUTION-PROTOCOL.md` §§2–6、§8；`AUDIT-PROTOCOL.md` §§1–6、§10。
5. 直接 owner：`article-removal-service.js`、`article-submission-removal-coordinator.js`、`article-trash-service.js`、article mutation removal cluster、removal transaction store/state/plan。
6. 直接策略/事实：lifecycle projection operations、regular/paid active target query ports。
7. 直接测试：article removal service/store/recovery、trash confirmation、published-trash、phase-05 trash/removal tests。

不要读取平台 adapter、订单供应商传输、生成模块或无关 migration handoff。

## 实施边界

- 新删除预检只返回 blocked facts，不生成 queue cancel actions。
- 新删除事务不调用 regular remove、paid cancel 或订单 cancel。
- 历史开放的旧 queue-action 删除事务只能通过一次性 migration/recovery 收口为安全完成或 `needs_repair`；不得继续创建旧格式事务或长期保留兼容入口。
- 恢复不恢复投稿任务；永久删除不删除订单/发布证据。
- 复用唯一文章锁、CAS 和 durable file transaction。

## 验收条件

- 有普通 queued item、已确认付费 item、活动订单、在途/不确定或已发布时删除预检明确阻止，且零副作用。
- 用户先移出普通队列或取消付费剩余项后，文章在无其他阻塞时才可回收。
- 删除命令不存在 `queuedToCancel`/queue-actions 新写入。
- 并发入队/确认/保存/删除遵守规范文章锁，最多一个提交成功。
- 崩溃恢复不出现正文已删但活动目标随后建立。
- 恢复文章按内容完整性回待投稿/待完善，不恢复队列。
- 永久删除正文后订单、金额、目标、时间、结果和发布证据仍可查询。
- 旧开放事务 migration/recovery 有有限状态矩阵和明确退出点。

## 最低验证

- removal preview/commit/recovery/concurrency/fault tests。
- regular/paid active-target blocking integration tests。
- published archive/order retention tests。
- Renderer trash flow regression。
- old queue-action writer absence gate。
- `git diff --check`。

## 停止条件

- 发现历史开放事务已部分撤销队列且正文状态无法判定，继续会丢失数据；
- 需要删除真实订单/发布证据；
- 无法确定唯一 article lock/transaction owner；
- 需要不可逆生产数据删除授权。

为旧开放事务编写一次性安全 migration、修复测试和删除旧 writer 不构成停止理由。

## 完成交接

记录删除状态矩阵、旧事务收口策略、移除的 queue mutation surface、保留证据和实际测试。完成后停止，不进入 26-H。
