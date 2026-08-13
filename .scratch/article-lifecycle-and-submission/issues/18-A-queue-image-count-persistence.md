# 18-A — 普通队列组 Image Count 持久化与迁移

**Goal:** 让 OperationalStore 成为普通平台队列组 `imageCount` 的唯一持久 owner，完成 0–5 校验、旧组安全迁移、新组默认值和重启稳定性。

**Blocked by:** 18-0 `COMPLETE`。

## 本线程职责

1. 仅在 OperationalStore queue-group cluster 增加 `imageCount` 持久字段及正式 schema migration。
2. 旧数据库中已经存在且没有该字段的 queue group 一律迁移为 `0`；迁移必须幂等。
3. 新建 queue group 默认 `1`，显式输入只接受整数 0–5。
4. 既有 group 追加文章时不得被新 admission 的默认值或调用方缺省值改写；使用当前 group 已持久化值。
5. 提供受控 transition 更新 group 的 `imageCount`；更新 revision/updatedAt，不能改 platform/account identity。
6. queue-group snapshot 返回 `imageCount`，供后续 application/IPC 消费。
7. 增加 migration、create/update、inherit、restart、invalid-input、concurrency/revision 直接测试。

## Owner / 允许修改

- `src/infrastructure/operational-store/internal/operational-store-schema-*`
- queue group runtime / queue admission transaction / transition ports 中与 `imageCount` 直接相关的最小范围
- 对应 OperationalStore tests / migration tests

## 禁止跨界

- 不修改 `regular-queue-application`、IPC、bridge、Renderer。
- 不实例化 Ticket 17 图片库，不选择图片。
- 不修改 `regular-platform-preparation-port`、任何 platform adapter 或 evidence schema。
- 不加入用户 decision、图片错误码或上传状态。

## Acceptance criteria

- [ ] 新 schema 对 queue group 有唯一 `imageCount` 字段，数据库约束/owner 校验共同保证 0–5 整数。
- [ ] 旧组迁移后 `imageCount=0`，重复 migration/restart 不改变该值，也不会静默变成新组默认 1。
- [ ] 新 group 未显式指定时为 1；显式 0..5 原样持久化。
- [ ] 向已有 group 追加文章不改变 `imageCount`。
- [ ] 受控 update 能把已有 group 在 0..5 间修改并增加 revision；非法值原子失败。
- [ ] queue-group snapshot 稳定返回 `imageCount`；不包含任何图片引用或路径。
- [ ] fault/concurrency 测试证明更新失败不会留下部分配置，重启后值稳定。
- [ ] 定向 OperationalStore/migration tests PASS，handoff 记录 schema version、migration 规则、公开 transition 与实际命令。

## Stop / return conditions

若当前 schema migration owner 不能安全增加字段而需要新的全局迁移架构，或 queue group identity/唯一约束与此字段发生产品冲突，停止并返回主线程；不自行创建旁路 JSON 配置。
