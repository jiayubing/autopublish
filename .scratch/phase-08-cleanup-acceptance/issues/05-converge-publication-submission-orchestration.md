# 05 — 收敛发布、提交与平台执行编排

**What to build:** 一次内容或媒体提交从预检、显式账号/target 绑定、入队、remote intent、Publisher 调用、outcome 持久化到后处理和恢复，始终由 PublicationWorkflow 与唯一 PlatformRun owner 完成；巨型提交服务和 platform workbench 被拆成内部协作者，旧 ledger/batch/archive/order writer 与 compatibility result path 完全退出 production。

**Blocked by:** 03 — 深化 OperationalStore 内部结构；04 — 深化内容存储与文章生命周期

**Status:** COMPLETE

## 必读输入

- Tickets 03/04 handoff、稳定 store/content facade 与删除候选。
- PublicationWorkflow、PlatformRun、content/media submission、platform workbench、worker message、post-processing 当前实现与 callers。
- Phase 3/4 handoff、Publisher contract、账号绑定、remote outcome、attention/reconciliation 与 archive recovery tests。

## 开始门禁

1. 确认 Tickets 03/04 完成，schema/interface 未出现未处理偏差。
2. 冻结一次 submission 的状态序列、error/outcome code、worker message 与 post-processing 不变量。
3. 写 production-chain red/contract tests，覆盖旧 writer/export/compatibility path 的 absence 和真实 caller 可达性。

## 执行过程

1. 将计划/预检、队列 claim、Publisher 调用、outcome 提交、post-processing、query/projection 与恢复编排划为内部职责；外部只保留现有 use-case interface。
2. 先迁移一个完整 content target，再迁移 media target 和平台批次；每批贯穿 worker、workflow、store、attention 与 caller 回归。
3. PlatformRun 继续独占 runId、child、watchdog、heartbeat、abort、stop、cleanup 和 terminal transition；回调只捕获自己的 immutable run context。
4. 删除 production 中的旧 ledger/batch/archive/order JSON writer、文件锁、远端协调直写、legacy status/result fallback 和第二份 attention 事实。
5. 对 remote 调用前后强杀、接收后断连、弱证据、post-processing/archive 失败、旧消息、快速 stop/start 和重启恢复进行故障注入。
6. 合并浅 wrapper，确保 adapter 只处理外部协议，不决定 publication 状态或自行归档。

## 模块边界

- PublicationWorkflow 拥有业务协调；OperationalStore 拥有事务事实；Publisher adapter 拥有外部交互。
- PlatformRun 拥有单 run 生命周期，不拥有 publication 状态机。
- Query/projection 只读取权威状态，不写入第二份 ledger。
- Renderer/IPC 不得编排 batch、retry、archive 或 remote reconciliation。

## 验收标准

- [ ] content 与 media 提交均通过同一 PublicationWorkflow seam 和唯一 OperationalStore writer。
- [ ] target 至少绑定平台、账号 profile；媒体 target 保留 resource identity，重复保护域正确。
- [ ] remote intent、attempt、outcome、batch revision 和后处理状态在故障后可重建。
- [ ] 旧 production writer、文件锁、remote coordinator、legacy result/status fallback 为 0 引用并物理删除。
- [ ] adapter 不写 store、不归档、不决定业务状态；worker 不构造 application/workbench owner。
- [ ] 拆分后的内部模块职责清晰，caller interface 未扩大。

## 必跑验证

- Phase 3 publication/content/media/order/attention/post-processing、Phase 4 Publisher/PlatformRun/account binding/fault tests。
- migration/backup/restart 回归、架构与 legacy absence、完整 root suite、lint/typecheck、production packaging smoke、`git diff --check`。

## 交接与停止条件

- 记录 production 调用链、唯一 owner/writer、删除证据、fault matrix 和人工平台验收项。
- 若发现现有 PublicationWorkflow/Publisher interface 无法表达权威状态，停止并重开 Phase 3/4；不得加 Phase 8 wrapper。
- 不执行真实登录、投稿、扣费、同步或账号切换，不自动提交。
