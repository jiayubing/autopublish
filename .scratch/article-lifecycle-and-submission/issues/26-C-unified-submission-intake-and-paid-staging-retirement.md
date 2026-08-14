# 26-C — 统一发起投稿与付费暂存退役

## 目标

建立确认前不持久化、不冻结的统一投稿选择；普通平台确认直接入队，付费媒体费用确认直接建立已确认付费批次。正式退役 `paid_staging_items` 及其公开能力。

## 最小必读

1. 根 `AGENTS.md`。
2. `CONTEXT.md` 中：待投稿文章、普通平台队列项、已确认付费批次、活动发布目标、媒体资源、系统投稿标识码、结果不确定。
3. SPEC：§2.3、§4、§6、§9.4–9.5、§10、§11 第 3–5/10 项。
4. Wave Plan 当前动作、umbrella、26-A/B handoff、本合同；`EXECUTION-PROTOCOL.md` §§2–6、§8；`AUDIT-PROTOCOL.md` §§1–6、§10。
5. 普通 admission：`regular-queue-application.js`、article mutation admission cluster、OperationalStore queue admission transaction。
6. 付费确认：`paid-media-preflight-service.js`、paid admission transition port、paid staging aggregate/schema、相关 composition。
7. 当前 UI/transport 中 add/remove/set paid staging 的 contract、IPC、bridge、feature 和 panel。
8. 直接测试：paid staging、paid preflight、queue admission、transaction/concurrency、migration/schema tests。

不要读取具体平台 adapter、订单状态同步 UI、图片 Ticket 或旧 migration handoff；仅在 schema gate 需要时读取当前 schema owner/migration tests。

## 实施边界

- 投稿选择/预检 token 不得成为持久业务队列、活动目标或文章状态。
- 普通确认复用唯一 regular admission transaction。
- 付费确认复用唯一 paid admission transaction，并在确认时创建批次/快照/活动目标。
- 正式 migration 原子记录旧 staging article refs 与摘要后清除 staging rows；不创建 runnable facts。
- 删除 staging add/remove/set-media 的 production surface 和全部消费者，不保留兼容 re-export。

## 验收条件

- 打开/关闭投稿面板、选择渠道/媒体、付费预检均不冻结文章且重启后不产生残留队列。
- 普通确认成功原子入队并冻结；失败零部分事实。
- 付费确认前资源/价格/正文变化使 token 失效且零写入；确认成功原子建立已确认批次与活动目标。
- 同一文章并发普通确认/付费确认最多一个成功。
- 旧 staging 数据迁移后文章保持待投稿，产生一次安全摘要；无订单、attempt 或远端调用。
- 新 schema/runtime 不再写 `paid_staging_items`，公开 capability/IPC/bridge/UI 全部 absence。
- migration crash/retry/idempotency 不丢失活动目标、订单或发布事实。

## 最低验证

- regular/paid admission state matrix、fault injection、concurrency tests。
- paid preflight tests。
- formal migration/schema upgrade/restart tests。
- contract/IPC/bridge absence tests。
- Renderer submission intake tests 与 typecheck/build。
- `git diff --check`。

## 停止条件

- 发现 staging row 实际承载订单、远端 attempt 或不可替代的活动目标事实；
- 清除 staging 需要删除/改变真实订单或发布证据；
- schema migration 需要生产数据不可逆选择且当前规格未定义；
- 供应商真实合同与“确认时才建批次”发生实质冲突。

价格/指纹竞态、测试失败和旧 capability 消费者较多不构成停止理由。

## 完成交接

记录 schema before/after、migration matrix、删除的 surface、并发/故障结果和最终 consumer absence。完成后停止，不进入 26-D。
