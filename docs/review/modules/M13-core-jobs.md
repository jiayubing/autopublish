# M13 平台装载与通用 jobs 深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M13 提供配置驱动 adapter 装载、队列快照，以及旧的通用 `createJob/runJob/runJobs` 串行发布器。当前 Electron worker 的生产投稿执行器不是 `runJobs`，而是 `desktop/services/platform-workbench-service.js::submitSelectedPlanSerially`；`publish-batch.createQueueSnapshot` 仍被 worker 的 `snapshot` 任务调用。

十项维度均已覆盖：adapter 动态路径来自受跟踪配置而非 renderer；接口校验要求会话/登录/发布/关闭和成对 scan/parse；快照扫描、stop、远端 outcome 归一化、ledger、归档和串行等待均已核对。发现旧 jobs 对 media 的 ledger 目标解析确有缺陷，但未发现当前生产调用方，因此不把第一阶段 R3 直接保留为有效产品 finding。

## 已检查目录与关键文件

- 全部生产文件：`auto—publish/src/core/platforms.js`、`src/core/jobs.js`、`src/app/publish-batch.js`。
- 配置与 adapter 契约：`auto—publish/config/platforms.json`；完整读取 `src/platforms/media/adapter.js`，并核对 lieju/toutiao/hepan 的公开 contract。
- 当前调用方：`desktop/worker/run-task.js`、`desktop/ipc/platform-ipc.js`、`desktop/services/platform-workbench-service.js`、`desktop/services/desktop-task-service.js`。
- 被调用方：`core/files.js` 的归档/失败副本、`core/stop-signal.js`、`publication/*`。
- 相关测试：`batch-workspace-scan.test.js`、`published-archive.test.js`、`platform-workbench-service.test.js`、`platform-submission-invocation-count.test.js`、`submission-batch-worker-integration.test.js`、`desktop-task-service.test.js`。无未读 M13 生产文件。

## 关键调用链

1. worker `snapshot` → `createQueueSnapshot` → `loadPlatforms` → adapter scan → 安全摘要。
2. 当前生产提交：platform IPC → main plan → fork worker → `platform-workbench-service.submitSelectedPlanSerially`，不经过 `core/jobs.runJobs`。
3. 旧/库式通用提交：`createJob` → `runJob` → 从 sidecar 构造 publication → mark submitting → adapter → outcome → ledger → archive。

## 第一阶段风险复核

### R3（通用 jobs 对 media 绕过 ledger）：机制成立，但当前生产可达性未成立

- `config/platforms.json:2` 确实启用 `media`；`batch-workspace-scan.test.js` 证明通用 snapshot 可以扫描 media。
- `jobs.js:98-101` 对 media 调 `resolvePublicationTarget({platformId:"media"})` 会失败并被吞掉，随后 `jobs.js:202` 仍调用 adapter。最小复现中 adapter 调用 1 次、ledger reserve 0 次、结果 `submitted`。
- 但是全仓生产调用搜索显示 `runJob/runJobs/createJob` 没有非测试调用者；worker 投稿走独立 platform-workbench，并且其队列扫描明确排除 media，资源付费投稿走 media workbench。
- 因而本轮不把 R3 列为有效生产 finding；保留为“若未来重新接入 `runJobs`，必须先修”的契约门禁。若存在仓库外 CLI/脚本调用 `runJobs`，需由现场信息重新提升。

### R6/R16 在本模块的结论

`jobs.runJob` 在 ledger outcome 写失败时只设置 `job.ledgerError` 并仍返回远端 outcome；最小复现确认该行为。但同样由于无生产调用者，本模块不单独建立产品 finding。当前生产实现中的等价问题已在 M24 记录。`jobs` 的日志只保留文本，属于 R16 的既有机制事实，未发现本轮独立的敏感信息泄漏证据。

## 候选发现

本模块没有满足“当前生产可达路径”的有效候选 finding。上述 R3/R6 机制证据记录为待接线门禁，不进入 findings 合并。

## 测试情况

- 定向联合命令 133/133 通过；`batch-workspace-scan` 明确通过 media snapshot 场景。
- 额外最小复现：media job 被调用而 ledger reserve 未调用；另一个复现确认 ledger outcome 写失败仍返回 `submitted`。二者用于验证代码机制，不用于虚构当前生产入口。
- 当前缺少“禁止 production 重新调用 core jobs media”架构测试，也缺少 `runJobs` 自身的直接状态组合测试。

## 未覆盖区域与待验证

- 待现场确认是否有仓库外脚本、快捷方式或运维工具直接 require `src/core/jobs.js`；仓库内没有。
- 未连接真实平台；adapter 页面行为属于 M25/M26。
- 动态 require 的打包闭包由构建模块审查，本模块只验证声明 adapter 的装载契约。

## 模块审查结论

M13 达到深审完成门槛，0 条有效候选发现。第一阶段 R3 的代码机制被复现，但当前 Electron 提交链不使用通用 jobs，因此应从“生产高风险”降为未接线兼容风险；不能据此计算当前有效 finding。
