# 05 — 结构化诊断与 publish-log 清理

**What to build:** 运行故障都能形成有界、脱敏、可关联的 diagnostic record；操作员通过 attention、task snapshot 和 diagnosticId 定位问题，Renderer 只收到安全摘要；本地日志具备轮换、容量和目录安全策略，废弃的原始 `publish-log` interface 完全移除。

**Blocked by:** None — can start immediately

**Status:** completed

## Scope

- 统一 diagnostic record：时间、稳定 code、module、operationId/runId 和 safe metadata。
- 将结构化 sink、文件日志 sink、Renderer DTO projection 和启动清理拆开。
- 删除无 consumer 的 publish-log sender/channel/original entry path，但保留业务所需的 task snapshot、attention 和安全状态。
- 建立日志轮换、容量上限、目录权限、symlink/path escape 防护。

## Module boundaries

- **Diagnostic schema/factory:** 只校验字段白名单、长度和安全 metadata；拒绝正文、Cookie、API key、绝对路径、DOM、stack 和账号显示名。
- **Bounded in-memory sink:** 只保留最近记录、去重/关联和读取快照；不负责文件 IO 或 Renderer 通知。
- **File sink/rotation:** 只写安全序列化记录、执行大小/数量轮换和启动清理；不解释业务状态。
- **IPC projection:** 只将 diagnosticId、用户消息和有限摘要映射给 Renderer；不得读取原始 error 对象。
- **Legacy cleanup guard:** 只做静态 consumer/source 检查和删除旧 sender/channel；不在运行时兼容旧 raw log。

新增模块保持短小且依赖单向：生产者 -> schema -> sink -> projection。任何模块超过约 200 行，应拆出序列化、轮换或策略组件。

## Acceptance criteria

- [x] 所有 diagnostic record 具有时间、code、module 和 operationId/runId；metadata 只允许固定白名单和有界字符串/数字。
- [x] 生产日志和 DTO 中不存在正文、Cookie、API key、绝对路径、原始 DOM、stack 和账号显示名。
- [x] Renderer 只获得 diagnosticId、安全用户消息和有限 code/category，不获得原始错误或完整日志行。
- [x] 内存 sink 有记录数和字段长度上限；文件 sink 有大小/数量轮换、启动清理和写入失败分类。
- [x] 日志目录创建、权限、普通文件检查、symlink/junction 跳过和 canonical path 逃逸均有测试。
- [x] attention 和结构化状态仍是可操作故障及恢复事实源，日志不能单独改变任务状态或触发重试。
- [x] 静态检查确认无 publish-log sender、consumer、channel 和原始 entry path；现有合法日志调用改用结构化 sink。
- [x] 覆盖容量上限、轮换、损坏日志、权限拒绝、symlink/path escape、敏感字段脱敏和 IPC DTO 边界。

## Implementation notes

- 复用 Phase 06 已建立的安全 diagnostic DTO/IPC 边界，不重新暴露内部状态。
- 不为诊断增加大而全的 logger 类；每个 sink、projection 和 policy 都有独立测试替身。
- 不保存原始整页截图；若需要证据，只保存安全 code 和受控 metadata。
