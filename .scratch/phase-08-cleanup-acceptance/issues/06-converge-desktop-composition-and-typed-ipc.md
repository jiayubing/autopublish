# 06 — 收敛 Desktop 组合根与 Typed IPC

**What to build:** Electron composition root 只负责创建 application/store/adapter、注册 typed IPC 和统一 dispose；workspace runtime、bootstrap、preload 与 contract registry 按业务域组合，IPC handler 不再承担 publication、content、retry、archive 或状态投影编排。

**Blocked by:** 05 — 收敛发布、提交与平台执行编排

**Status:** ready-for-agent

## 必读输入

- Ticket 05 的 production 调用链、唯一 owner/writer 与冻结接口。
- 目标架构中的 composition root、typed IPC、Renderer feature 与 lifecycle 规则。
- 当前 main/runtime/bootstrap、IPC registrars/contracts、preload namespaces、workspace invalidation 和 dispose tests。
- Phase 6 handoff、capability inventory、production reachability 与 packaged preload evidence。

## 开始门禁

1. 确认 Ticket 05 完成，PublicationWorkflow、PlatformRun 和 Content owner 已稳定。
2. 冻结 canonical capability inventory：channel、kind、request/result schema、producer/consumer、lifecycle query 与 event dispose。
3. 写 composition/IPC red tests，禁止 registrar 编排业务或绕过 application interface。

## 执行过程

1. 将 runtime 依赖创建、workspace-scoped services、IPC registrar、event publication 和 disposal 拆为清晰内部阶段；保留一个外部 lifecycle owner。
2. 按 workspace/content、publication/platform、media/settings/auth/generation 业务域拆分声明和 projection；不得复制 channel 常量或 schema。
3. Contract module 只验证/投影 wire DTO；application module 决定业务结果；registrar 只完成 decode → invoke → encode。
4. Preload source 按 namespace 组合，production 仍生成单一 sandbox-compatible preload 制品；Renderer 不看到 `ipcRenderer`。
5. 对每个 query/command/event 证明 production root 可达、唯一 consumer/producer、事件 dispose 和稳定安全错误。
6. 删除旧 registrar、动态 method dispatch、通用 transport facade、重复 contract/projection 和无 consumer capability。
7. 复核 main/runtime 规模和参数：组合根不携带业务分支，service 不依赖整个全能 options bag。

## 模块边界

- Composition root 创建/连接/销毁，不实现业务规则。
- Contract registry 只拥有 wire validation 与安全 projection，不读取 store 或文件。
- IPC registrar 只适配 transport，不执行重试、归档、批次或状态恢复。
- Preload 只暴露最小 typed namespaces，不含 Node/infrastructure object。

## 验收标准

- [ ] 所有 canonical capability 均有真实 View/root consumer 到 application owner 的完整可达链。
- [ ] query/command/event 无重复 channel、动态逃生口或无 owner capability。
- [ ] workspace runtime 只有一个 start/dispose owner，所有 listener/child/store 按逆序且恰好一次释放。
- [ ] IPC 输入输出均运行时验证；原始 Error、路径、Cookie、正文和 stack 不进入 Renderer。
- [ ] registrar/preload/contract 已按业务域拆分，公共 wire schema 和 capability 数无意外变化。
- [ ] production preload 仍为 sandbox-compatible 单制品，Renderer 无 Node/IPC 直接引用。

## 必跑验证

- composition/runtime lifecycle、typed IPC inventory/production reachability、event/lifecycle、preload contract 定向测试。
- lint、三套 typecheck、Renderer/preload build、完整 root suite、package/ASAR smoke、`git diff --check`。

## 交接与停止条件

- 记录 capability inventory、模块/生命周期图、删除入口和 packaged preload 证据。
- 若需要新增业务 channel/DTO 语义才能完成拆分，停止并重开所属前序阶段。
- 不改变 Electron sandbox/security 配置，不自动提交。

