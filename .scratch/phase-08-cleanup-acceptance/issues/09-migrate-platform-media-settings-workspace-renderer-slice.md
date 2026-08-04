# 09 — 迁移 Platform、Media、Settings 与 Workspace Renderer 切片

**What to build:** 平台运行、publication history/attention、媒体资源与订单、设置、安全状态、workspace/auth shell 从 typed bridge 到 feature snapshot 和 View 全链使用分域模块；每个 feature 独立拥有状态和生命周期，不共享隐式 busy、账号或 endpoint 状态。

**Blocked by:** 07 — 扩展 Renderer 分域类型与 Bridge 布局

**Status:** ready-for-agent

## 必读输入

- Ticket 07 的 domain layout及 platform/media/settings/workspace/auth symbol 清单。
- 对应 bridges、features、contexts/hooks、PlatformWorkbench、Orders/Settings/App/Sidebar 等真实 Views。
- Phase 4/6/7 handoff、安全 media endpoint、account binding、PlatformRun、attention 和 runtime diagnostics contracts。

## 开始门禁

1. 确认 Ticket 07 完成，相关 IPC/preload contracts 无未决变化。
2. 冻结 platform task snapshot、media/order projection、settings security state、workspace/auth lifecycle 和诊断安全字段。
3. 建立每个主要用户流的 production consumer 链和 event dispose contract。

## 执行过程

1. 按 platform/publication、media/orders、settings/security、workspace/auth shell 四个批次迁移类型与 bridge imports。
2. 将 request identity、snapshot、commands、busy/error/result、event/invalidation subscription 和 dispose 收入各自 feature。
3. 拆分过长 Workbench/Settings/Orders/App 组件，但不把业务状态机分散到多个 View 或通用 hook。
4. 账号切换、stop/start、旧 worker message、订单刷新、endpoint 变化、HTTP 风险确认、登录失效均通过 feature 可观察状态验证。
5. 删除重复 queue refresh、page-level invalidation、共享 busy、native confirm、无 consumer action 和跨 domain 类型耦合。
6. 保持 Renderer 只收到安全诊断摘要，不能通过重构重新暴露 raw error、URL credentials、Cookie、路径或截图。

## 模块边界

- Platform feature 只投影 PlatformRun/application snapshot，不拥有 child 或 publication writer。
- Media/order feature 只消费权威 projection，不创建第二份订单/publication 状态。
- Settings feature 展示安全配置状态并发命令，不保存 secret。
- Workspace/auth shell 只协调顶层可用性和导航，不吞并各业务 feature 状态。

## 验收标准

- [ ] 本 ticket 所有 production caller 改用分域类型与 bridge，不再引用旧共享 barrel。
- [ ] 每个 feature 独立拥有 snapshot、request identity、busy/error/result、subscription 和 dispose。
- [ ] 快速 stop/start、账号/endpoint 切换、订单刷新和 workspace 重建无 stale overwrite。
- [ ] HTTP 未确认、TLS/redirect、登录失效和 diagnostics 均保持 fail-closed、安全 DTO。
- [ ] 无重复 invalidation、共享 busy、native confirm、无 owner UI 或跨 domain 可变状态。
- [ ] 长 View/feature 已按内聚职责拆分并符合 Ticket 01 规模门。

## 必跑验证

- PlatformRun/queue/history/attention、media/order、settings/security、workspace/auth、runtime diagnostics 与 confirmation 定向测试。
- renderer/bridge typecheck、Renderer build、lint、完整 root suite、Electron/package smoke、`git diff --check`。

## 交接与停止条件

- 记录迁移 symbol、feature owners、事件生命周期、删除旧 imports 和 Ticket 10 剩余项。
- 真实账号、供应商 HTTPS/TLS、付费订单和外部 E2E 保持 `PENDING_HUMAN`。
- 若需要更改现有业务/IPC interface，停止并重开所属阶段；不自动提交。

