# M22 Publication 领域与账本深度审查

> 状态：已完成（2026-07-23）。本报告只读审查固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；业务代码、配置、依赖和测试相对第一阶段基线无变化，工作区变化仅为 `docs/review/` 审查文档。

## 模块职责和边界

M22 是文章×发布目标事实的权威所有者：生成文章身份按 `clientId + articleId`，手工文章按内容散列；普通平台目标按平台，付费媒体按资源；一条聚合记录保存当前状态和追加 attempt。它负责目标校验、状态转换、重复占位、`uncertain` 核对、记录校验、原子替换和进程间排他写，不负责队列文件、submission batch、本地归档、远端调用或 UI 派生状态。

十项审查维度均已覆盖。身份/目标输入和持久化字段采用闭集校验，记录不保存正文和凭据；状态机明确阻止 `queued/submitting/submitted/published/uncertain` 重复占位；文件更新使用临时文件替换。但锁没有租约/进程存活检查，崩溃恢复边界不完整。

## 已检查目录与关键文件

- 全部生产文件：`auto—publish/src/publication/{article-identity,publication-targets,publication-state,publication-ledger,publication-ledger-store}.js`。
- 运维直接调用方：完整读取 `auto—publish/scripts/migrate-publication-ledger-v1.js` 与 `auto—publish/docs/publication-ledger-migration.md`。
- 契约/组合：`auto—publish/docs/adr/0004-record-publication-per-target.md`、`auto—publish/CONTEXT.md`、`auto—publish/docs/content-workspace-contract.md`、`desktop/workspace-runtime.js`、`desktop/ipc/publication-ipc.js`。
- 业务调用方：`submission-export-service.js`、`content-submission-service.js` 及 `services/submission/`、`platform-workbench-service.js`、`media-workbench-service.js`、`media-order-service.js`、`src/core/jobs.js`。
- 相关测试：`publication-ledger*.test.js`、`publication-duplicate-guard.test.js`、`publication-targets.test.js`、`publication-article-identity.test.js`、`publication-ipc.test.js`、`runtime-publication-wiring.test.js`、`submission-batch-worker-integration.test.js`、`media-workbench-service.test.js`、`media-order-service.test.js`。第三方/生成文件未纳入；无遗漏的 M22 生产文件。

## 关键调用链与不变量

1. 文章/sidecar → `resolveArticleIdentity` → `resolvePublicationTarget` → `ledger.reserve` → 聚合文件独占创建。
2. worker/media → `markSubmitting` → 远端调用 → `recordOutcome`；只有 `uncertain` 可由 `reconcile` 转为 `published/failed`。
3. `failed/cancelled` → 新 `reserve` 追加 attempt；当前 attempt ID 不匹配时拒绝更新。
4. `publication-ledger-store.update` → `<record>.lock` → 重读记录 → 临时文件写入和校验 → rename → 删除锁。
5. migration 只从满足身份/散列/远端证据规则的旧队列与订单创建事实；dry-run 默认，执行需确认 token。

不变量核对结果：文章×目标聚合粒度正确；media 必须有资源 ID；`uncertain` 阻止盲重试；attempt 与聚合状态保持一致；远端成功不应被本地归档失败降级。R7 被代码和最小复现确认；R6 的本地失败传播问题位于 M24/M27 调用协调层，不是账本状态机本身。

## 候选发现

## TEMP-M22-01：进程崩溃遗留的 publication 锁没有租约或回收路径，会永久阻断该目标

- 分类：并发和生命周期 / 数据可用性
- 所属模块：M22 Publication 领域与账本
- 严重程度：高
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/src/publication/publication-ledger-store.js:431-438` `acquireLock`；`:469-481` `update`
- 问题描述：更新以 `flag:"wx"` 创建永久锁文件，只有当前调用的 `finally` 会删除。锁内只有 PID 文本，没有创建时间、租约、PID 存活判断、owner token 或受控回收 API。进程在建锁后异常退出/断电时，后续所有状态推进均固定报 `PUBLICATION_CONCURRENT_UPDATE`。
- 代码证据：`acquireLock` 对任意 `EEXIST` 直接拒绝；锁删除只存在于持锁调用栈的 `finally`。启动、ledger 构造、migration 和 reconcile 均没有扫描或恢复锁。
- 触发条件：在 `markSubmitting`、`recordOutcome`、`reconcile`、`ensureTitleSnapshot` 或失败重试更新期间，进程在锁创建后、`finally` 前终止。
- 可达路径或调用链：平台/媒体投稿 → ledger 状态更新 → `store.update` → 创建 `.lock` → Electron/worker 崩溃或机器断电 → 下次更新看到 `EEXIST`。
- 实际影响：该文章×目标可长期停在 `queued/submitting/uncertain`，不能继续投稿、核对或失败重试；重复保护同时把后续占位挡住。应用没有安全自愈入口。
- 影响范围：发生崩溃时正在更新的单个 publication 聚合；多个同时更新目标可分别受影响。
- 现有测试是否覆盖：并发 reservation 和普通锁释放有覆盖；没有崩溃遗锁、租约超时或启动恢复测试。
- 验证方法与结果：临时工作区创建记录后人工放置对应 `.lock`，调用 `markSubmitting`，稳定得到 `PUBLICATION_CONCURRENT_UPDATE`；退出码 0，临时目录已清理。
- 修复方向：锁写入不可猜测 owner token、PID 与时间；在严格验证记录/锁年龄/进程存活后提供租约回收或启动期恢复；回收必须避免误删活跃 writer 的锁，并增加崩溃故障注入测试。
- 关联发现：TEMP-M24-02（worker 被杀会扩大遗留 `submitting`/锁恢复问题）。

## 测试情况

- 定向 33 文件联合命令中的 publication/submission/media/worker/attention 相关测试全部通过；整体为 133 tests、133 pass、0 fail，约 1.63 秒。
- 最小锁复现通过并确认错误码。
- 既有测试证明正常状态转换、per-resource 去重、uncertain 核对、记录索引和跨 IPC 共用 ledger；通过不覆盖异常进程退出。

## 未覆盖区域与待验证

- 未执行会写真实内容库的 migration `--execute`；只读审查其完整源码和既有 migration 测试。
- 未做真实断电/进程强杀故障注入；最小复现直接构造了等价遗锁状态。
- Windows 文件系统/杀毒软件对 rename/目录时间戳的现场行为未实机压力验证。

## 模块审查结论

M22 达到代码级深审完成门槛。核心身份、目标、状态机和敏感字段边界清晰，第一阶段 R7 得到确认并提升为本轮有效候选；没有发现可恢复数据损坏或全局重复键错误。模块最高风险为高，进入方案设计前必须纳入锁租约/恢复与故障注入设计。
