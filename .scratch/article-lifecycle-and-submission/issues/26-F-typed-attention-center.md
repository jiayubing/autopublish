# 26-F — 需处理中心

## 目标

把所有人工待办收敛为具名类型与有限 resolution。明确失败回到统一投稿入口；不确定结果没有直接 retry；系统修复项不能获得远端动作。

## 最小必读

1. 根 `AGENTS.md`。
2. `CONTEXT.md` 中：需处理事项、结果不确定、活动发布目标、服务商订单、已发布文章、投稿中心。
3. SPEC：§5.3、§6、§7、§9.6–9.8、§11 第 8–9/11 项。
4. Wave Plan 当前动作、umbrella、26-D/E handoff、本合同；`EXECUTION-PROTOCOL.md` §§2–6、§8；`AUDIT-PROTOCOL.md` §§1–6、§10。
5. 直接 owner：`article-attention-query.js`、`article-attention-policy.js`、`article-attention-resolver.js`。
6. Resolution ports：regular platform outcome service、paid order creation resolution、order reconciliation、article removal recovery、publication archive retry。
7. UI：`ArticleAttentionPanel.tsx`、detail drawer、attention feature；既有 commit `c10a838` 与其 handoff。
8. 直接测试：attention query/policy/actions、regular uncertain、paid uncertain、order anomaly、removal/archive repair Renderer tests。

不要读取完整平台/供应商 adapter、生成链或历史 audit handoff。

## 实施边界

- 类型只允许规格列出的六类；每项保留稳定 identity、owner、safe facts、freeze 和 allowed actions。
- UI 可按文章聚合卡片，但 resolver 永远按独立 attention ID 预检和执行。
- 删除通用 `retry-publication`；明确失败使用“打开发起投稿”导航。
- 不确定普通平台只允许 accepted/not-accepted；付费创建只允许 bind order/confirm absent。
- stale revision/token fail-closed，不按错误文本路由。

## 验收条件

- 同一文章多事项只占一张卡，但每项原因/动作/确认独立。
- 明确失败文章在无阻塞时可编辑/回收/重新发起投稿。
- 不确定文章冻结且无直接重试。
- 订单状态异常只有恢复跟踪、确认发布、确认非发布终态三类动作。
- 删除/归档修复项没有普通/付费投稿动作。
- resolution 重复、相反、stale、迟到 accepted/订单成功遵守既有优先级。
- 已解决事项自动从 query 消失；失败 resolution 不伪造关闭。

## 最低验证

- attention query/policy/resolver tests。
- regular/paid/order resolution state matrix。
- Renderer attention action/typecheck/build/responsive tests。
- stable code/closed contract tests。
- `git diff --check`。

## 停止条件

- 来源事实没有稳定 identity，无法安全 fence 重复/相反 resolution；
- 需要新增未在 SPEC 定义的人工决定；
- 某 resolution 只能通过供应商错误文本或 UI 本地状态判断；
- 需要未经授权的真实订单/发布核对。

测试失败、UI 聚合调整和旧 retry 删除不构成停止理由。

## 完成交接

记录 type/action matrix、删除的 generic action、stale/priority 证明、UI 聚合和实际测试。完成后停止，不进入 26-G。
