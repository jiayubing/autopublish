# 26-E — 已确认付费批次工作台

## 目标

在投稿中心管理已完成费用确认的付费批次：进度、暂停、继续资格和取消全部剩余未开始项。禁止追加和单项移除。

## 最小必读

1. 根 `AGENTS.md`。
2. `CONTEXT.md` 中：已确认付费批次、媒体资源、服务商订单、系统投稿标识码、活动发布目标、结果不确定、投稿中心。
3. SPEC：§3.3–3.4、§4.3、§6、§7 付费事项、§9.5、§11 第 4/9–10/13 项。
4. Wave Plan 当前动作、umbrella、26-C/D handoff、本合同；`EXECUTION-PROTOCOL.md` §§2–6、§8；`AUDIT-PROTOCOL.md` §§1–6、§10。
5. 直接 owner：`paid-media-preflight-service.js`、`paid-media-batch-orchestrator.js`、paid execution/admission transitions、paid batch read model。
6. 直接 UI：当前 paid media workbench/panel 与 content paid execution feature。
7. 直接测试：paid preflight、paid batch orchestrator、order creation resolution、Ticket 25-D paid acceptance、renderer paid controls。

不要读取普通平台 adapter、订单详情页面全部实现、图片流程或旧 staging 代码（26-C handoff 已提供最终 absence）。

## 实施边界

- 工作台只展示已确认批次；确认前选择由 26-C 投稿入口拥有。
- 批次 article set/quote 不可变，不允许追加或单项移除。
- 新增一个具名原子命令取消全部剩余未开始项；不得拆成逐项 release。
- 当前在途请求等待明确返回；已有订单永久保留。
- 继续执行前复核资源、价格、正文和系统投稿标识；变化时要求新批次确认，不改写原确认。

## 验收条件

- 显示媒体、确认价格、预计费用、文章总数、已创建订单数、剩余数、当前项和暂停原因。
- 重启后保持暂停，不自动下单。
- 暂停只阻止下一项，不中断在途请求。
- 取消剩余项只结束未开始 items/targets；在途和已有订单不变。
- 并发取消/开始/远端成功由真实结果优先，不能解冻已经有订单或不确定结果的文章。
- 取消后相关安全文章恢复待投稿；再次提交必须重新预检费用。
- UI 无追加、单项移除或绕过费用确认的入口。

## 最低验证

- paid batch state/concurrency/fault matrix。
- restart/pause/cancel-remaining tests。
- paid order creation success/rejection/uncertain regressions。
- Renderer workbench/typecheck/build/responsive tests。
- `git diff --check`。

## 停止条件

- 当前 schema 无法区分未开始、在途和已有订单，继续可能解冻真实远端请求；
- 取消剩余项需要供应商远端取消或产生新费用；
- 上游 26-C 未完成 staging 退役或确认快照不稳定；
- 需要新的部分退款/费用产品规则。

局部 schema migration、事务测试失败和 UI 重组不构成停止理由。

## 完成交接

记录批次状态矩阵、取消事务、并发优先级、Renderer 控制和实际测试。完成后停止，不进入 26-F。
