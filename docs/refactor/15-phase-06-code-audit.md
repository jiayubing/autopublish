# Phase 06 Renderer 状态与 Typed IPC 代码审计报告

> 审计日期：2026-07-28  
> 审计状态：完成；本报告只记录问题，不修改 production code、阶段账本或 Phase 07。  
> 文档依据：仅使用 `docs/refactor/`、当前代码和当前 Git 历史；未读取或采用 `auto—publish/docs/`。

> 2026-07-29 整改后证据附记：本报告原 17 项 finding 的历史审计结论不改写。针对后续独立审计重新打开的 `P2-09`，当前 canonical inventory 已由 110 更正为 109；无 consumer 的 `media.removeDraft` 全链物理删除，其余 109 项均补齐真实 production consumer/public method/lifecycle AST 证据并通过完整门禁。Phase 03/04/06 仍为 `IN_PROGRESS`，只能由下一轮独立只读审计决定是否恢复 `COMPLETE`。

## 1. 审计范围与结论

审计基线：

- 分支：`codex/refactor-program`
- Phase 05 完成点：`75dba966375302a99ebfd020c02ee6dd83930a9e`
- Phase 06 计划点：`743571d9597ea2c68ab10a08da0914ccaed5352b`
- Phase 06 主实现：`f631c4f0567668446f37497cffbe643b859dea98`
- 本轮安全检查点：`3992736d01413d83504253c7d905c21fcfe3183c`
- 主要审计差异：`743571d9597ea2c68ab10a08da0914ccaed5352b...3992736d01413d83504253c7d905c21fcfe3183c`

结论：现有自动门禁全部通过，但不能据此维持 Phase 06 的最终完成结论。审计发现 17 项问题，其中 P1 7 项、P2 8 项、P3 2 项。没有发现 P0，也没有证据表明需要为历史客户、文章或采集数据建立兼容层。主要风险来自 workspace 事件隔离、destructive confirmation 作用域、安全错误语义、订单安全投影，以及供应商事实与内部 PublicationWorkflow 事实混用。

建议把 Phase 06 从 `COMPLETE` 重新打开为 `IN_PROGRESS`，修复并重跑完整门禁后再恢复完成状态；在此之前不要开始 Phase 07。本报告没有直接修改进度账本，以保留审计与整改两个动作的边界。

## 2. Findings

### P1-01 Platform 实时事件缺少 workspace identity

位置：

- `auto—publish/desktop/ipc/contracts/platform-contracts.js:152-181`
- `auto—publish/desktop/services/desktop-task-service.js:44-45,236-279`
- `auto—publish/media-workbench/src/features/platform/platform-feature.js:156-171,208-249`

`platform-state` snapshot/event 不携带 `workspaceRuntimeId`。Renderer 切换 workspace 时会清空本地状态，但旧 runtime 的 heartbeat 或 terminal event 仍可能迟到；feature 只能按 `runId` 和时间戳判断，无法证明事件属于当前 workspace。迟到的 terminal snapshot 还可能用旧 workspace 的 `queueRevision` 刷新新 workspace。

整改：给 platform event 增加 opaque runtime identity，由 main/runtime sender 绑定；feature 在修改 run snapshot 或触发 terminal refresh 前验证 identity。补充 A→B 切换后 A 的迟到 heartbeat/terminal 均被拒绝的 production composition 测试。

### P1-02 Production ConfirmationHost 没有绑定 scope

位置：

- `auto—publish/media-workbench/src/main.tsx:9-18`
- `auto—publish/media-workbench/src/components/ConfirmationHost.tsx:205-212,295-306`
- `auto—publish/media-workbench/src/components/content/GeneratedArticlesView.tsx:479-496`
- `auto—publish/media-workbench/src/features/content/content-workbench-feature.js:360-379`

Host 已实现 `scopeKey` 变化时 `cancelAll()`，但 production 根节点未传 `scopeKey`，只有测试使用了显式 workspace scope。永久删除流程在 prepare 后、confirm 前只检查一次当前客户；confirm 返回后直接 execute。content feature 又使用当前 selected client 作为 command owner scope，却不验证 `input.clientId` 与该 scope 相同。

因此，在 prepare 属于客户 A 后切换客户/workspace，悬挂确认仍可能执行 A 的 token。后端 token 重验不能替代 Renderer scope fencing。

整改：唯一 Host 绑定 `workspaceRuntimeId + client identity`；scope 切换和 feature dispose 取消请求；destructive execute 前再次验证 scope；feature command owner 拒绝 input identity 与当前 scope 不一致的调用。新增 production root composition RED，而不只测试 Host 组件的可选属性。

### P1-03 SafeOperationalError 只验证形状，不保证语义安全

位置：

- `auto—publish/src/domain/safe-operational-error.js:22-53`
- `auto—publish/desktop/ipc/contracts/registry.js:481-506,509-532`

`safeString()` 只限制长度和控制字符。只要 error code 在 capability allowlist 中，plain object 自带的 `userMessage` 和 `diagnosticId` 就会被接受。绝对路径、Cookie、token、stack 片段等可作为普通可打印字符串穿过 main、preload 和 Renderer 校验。

整改：contract 根据 code 产生固定安全文案，不信任 caller 提供的文案；`diagnosticId` 只允许受限 opaque token。共享 registry 反例需要遍历全部 capability，覆盖“形状合法但包含路径、credentials、Cookie、stack、正文片段”的错误对象。

### P1-04 原始发布 URL 和内部订单字段仍进入 Renderer

位置：

- `auto—publish/src/infrastructure/operational-store/operational-store.js:1539-1557`
- `auto—publish/desktop/services/media-order-service.js:221-255`
- `auto—publish/desktop/ipc/media-ipc.js:329-349`
- `auto—publish/desktop/ipc/contracts/media-contracts.js:200-216`
- `auto—publish/media-workbench/src/bridge/media.ts:180-200`

新增 `media.openPublishedUrl` command 正确地只接收 `orderNid`，但订单 query 仍把 `orderUrl` 原文发到 Renderer。OperationalStore 的写入校验只要求字符串以 `https://` 开头，没有拒绝 username/password 或 query 中的 token；更严格的 URL 校验只在点击打开时发生，已经晚于数据泄漏边界。

同时，UI 虽不再显示内部字段，DTO/bridge 仍携带 `publicationId`、`attemptId`、`publicationStatus` 和 `resourceId`。这属于只隐藏 View、没有删除旧数据路径。

整改：订单 query DTO 删除 `orderUrl` 和无 UI 所需的内部标识，只返回 `hasPublishedUrl` 等安全事实；点击仍只传 `orderNid`。remote evidence 在持久化/投影入口复用 credential-free HTTPS validator，不能仅在 shell open 时验证。

### P1-05 供应商订单状态与 canonical publication 状态仍被混为一个事实

位置：

- `auto—publish/desktop/services/media-order-service.js:87-134,221-265`
- `auto—publish/src/infrastructure/operational-store/operational-store.js:1510-1580`
- `auto—publish/media-workbench/src/components/OrdersView.tsx:73-98,200,318`

`syncOrder()` 将供应商状态映射成 `published/failed/submitted/uncertain`，随后 `reconcileRemoteOrder()` 同时更新 publication attempt 和 publication record。供应商 `9=售后中` 会落成 canonical `uncertain`，可能抹掉此前已经发布的内部事实。反向方向也存在：缺少真实 `remoteStatusCode` 时，`supplierStatusOrFallback()` 又从 canonical 状态伪造供应商 `0/2/4/9`。

此外 main 已生成 `statusLabel`，Renderer 又维护一套 code→label/tabs，形成第二 owner。

整改：供应商 observation 独立保存和展示；没有 observation 时显示“未同步/未知”，不得从 canonical 状态推断供应商 code。重新打开 Phase 03，定义 supplier observation 如何影响、以及何时不得影响 canonical workflow；尤其 `9` 不能自动撤销“已发布”事实。状态业务 label 只保留一个 owner。

### P1-06 媒体价格规范化修在多个下游层，而供应商边界仍保留原始类型

位置：

- `auto—publish/desktop/services/media-resource-service.js:28-40`
- `auto—publish/desktop/ipc/media-ipc.js:25-47,475-490`
- `auto—publish/desktop/services/media-publication-submission-service.js:5-30`
- `auto—publish/desktop/services/media-workbench-service.js:19-22`

供应商 anti-corruption boundary 的 `normalizeResource()` 仍把 `price/cost/amount/fee` 原类型写入缓存。下游分别使用 `Number()`、缺失时返回 0、非法时返回 0/undefined，甚至先删除非数字字符再转换。后者会把 `-10` 变为 `10`；IPC projection 会把非法字符串伪装成 `0`。同一资源经过哪个 caller 决定最终价格类型和缺失语义，这正是“预检有价格、订单快照丢价格”反复出现的结构性原因。

整改：在 `MediaResourceService` 摄取供应商数据时一次性形成 canonical monetary value；非法、负数、超限和缺失必须有明确且一致的失败/诊断语义。下游只接受已规范化 number，不再保留多套兼容转换。

### P1-07 Production content bridge 会把 capability 缺失伪装成成功空结果

位置：

- `auto—publish/media-workbench/src/bridge/content.ts:272-294,428-480,590-617`
- `auto—publish/media-workbench/src/bridge/content.ts:859-887,908-952,998-1029,1189-1222,1320-1336`

当不在 Electron、`desktopConsole.content` 缺失，或 result data 为 null 时，多项 production query/preview 返回 synthetic fallback，例如空 batch 列表、idle runtime、0 项取消预检、空平台列表和空 residue。该行为曾能把 preload/capability 接线失败表现成“没有数据/当前空闲”，违背 typed boundary fail-closed，也让现场问题更难定位。

整改：production bridge 对 transport/capability/result 缺失统一抛稳定 OperationalError。浏览器 story/test 所需的空数据只能由显式注入的 mock adapter 提供，不能放在 production caller 内。

### P2-08 authenticated registrar 对未登记 channel fail-open

位置：`auto—publish/desktop/ipc/register.js:4-25`

`createAuthenticatedIpcMain()` 在 registry 找不到 channel 时直接调用原 handler。这样拼错或遗漏登记的非 Auth handler 会绕过 version、exact request/result、安全错误和 preload 对称验证。

整改：非 Auth channel 注册时即 throw；Auth 保留 Phase 07 明确豁免 wrapper，不允许通用未登记分支。

### P2-09 129/129 production caller 证据只证明 preload 中存在 channel 字符串

位置：

- `auto—publish/tests/phase-06-production-ipc-fixture-matrix.test.js:75-93`
- `auto—publish/tests/fixtures/phase-06-production-ipc-contract-fixtures.js`

每个 fixture 的 `productionCaller` 固定为 `desktop/preload.js:<channel>`，测试只搜索 preload 是否包含 channel。它没有证明 `View → feature owner → bridge → preload capability` 的真实调用链，无法发现 dead capability、缺少 View caller 或绕过 feature owner 的调用。

整改：每项 capability 记录真实 production caller 文件/导出方法/feature command；用静态 import/API surface 加少量纵向 composition test 锁定完整链。事件还需证明 subscribe、dispose 和唯一 consumer。

### P2-10 invalidation/event 校验失败后的诊断链不可达

位置：

- `auto—publish/desktop/preload.js:55-70`
- `auto—publish/media-workbench/src/features/workspace/workspace-coordinator-context.tsx:13-21`

preload 捕获 `parseEvent()` 异常后直接吞掉 payload，Coordinator 无法收到畸形事件，所以其 invalid-event diagnostic 分支对真实 transport 不可达。Coordinator diagnostics 又只进入内存数组，没有接入 runtime diagnostics service、UI 或 Phase 07 seam。

整改：preload 将校验失败转换成不含原 payload 的结构化 diagnostic；Coordinator 的 revision gap/unknown scope/invalid event 均写入统一安全 sink，并验证不会泄漏原始 event。

### P2-11 settings feature 在 production 中有两个 owner 实例

位置：

- `auto—publish/media-workbench/src/App.tsx:127-131`
- `auto—publish/media-workbench/src/components/SettingsView.tsx:299-304`

付费媒体页第三方标识与设置页各自创建 `SettingsFeatureProvider`。这违反七个固定 feature owner 中 settings 单一 owner 的约束，并会产生切页竞态：旧 provider 的保存尚未完成，新 provider 已读取旧值，而旧结果无法刷新新 owner。

整改：在稳定 app/installation scope 创建唯一 SettingsFeatureProvider，两处 View 只消费同一 snapshot 和命名 command。

### P2-12 订单同步吞掉所有 OperationalStore reconcile 错误

位置：`auto—publish/desktop/services/media-order-service.js:87-134`

`syncOrder()` 对 `reconcileRemoteOrder()` 使用 catch-all 并继续返回供应商 response。SQLite 写失败、evidence 校验失败或状态冲突都会表现为“同步成功但没有变化”，与此前“点击同步无反应”的现场症状一致。

整改：storage/evidence failure 必须成为 SafeOperationalError；只有文档明确定义的幂等已处理结果可以忽略。

### P2-13 订单查询通过全量 submission batch 回扫补 display snapshot

位置：

- `auto—publish/desktop/services/media-order-service.js:69-80,198-218`
- `auto—publish/src/infrastructure/operational-store/operational-store.js:1153-1209`

每次订单刷新先查询全部 batch ID，再逐 batch 查询和解析全部历史 item payload，仅为按 attemptId 给订单补标题、媒体名和报价。这是无界 N+1，也把 Phase 03 read-model 缺口修在 Phase 06 presentation service。

整改：重新打开 Phase 03，提供按 order/attempt 有界关联的正式 order display projection，使用单次 SQL/join 或等价有界 query；Phase 06 只消费投影 DTO。不得继续加 cache 或兼容 wrapper 掩盖接口缺口。

### P2-14 `media.stopSubmit` 是无效 capability

位置：

- `auto—publish/desktop/ipc/media-ipc.js:619-623`
- `auto—publish/desktop/services/media-workbench-service.js:200-207,336-343`
- `auto—publish/media-workbench/src/features/media/media-feature.js:27,746-749`

`requestStop()` 只把 `stopRequested=true`，production 提交循环从不读取该值，App 也没有调用该 command 的 UI。该 capability 具备 registry/preload/feature 外形，却没有行为，是典型未完成 wrapper。

整改：当前产品不需要时完整删除 contract、fixture、preload、bridge、feature 和 registrar；若确需停止，先在 Phase 03 定义只能阻止尚未开始的后续 attempt、不能假装取消已进入远端 mutation 的正式接口。

### P2-15 refresh/toggle command 的 Promise 错误未被 caller 消费

位置：

- `auto—publish/media-workbench/src/features/media/media-feature.js:421-447`
- `auto—publish/media-workbench/src/App.tsx:218-223,316-320`

feature 将错误写入 snapshot 后仍 rethrow，App 使用 `void mediaFeature.togglePool(...)` 和 `void mediaFeature.refreshResources()`，没有 `.catch()`。真实失败会在 UI 显示安全错误的同时触发 `unhandledrejection`；同页 prepare/submit 已显式 catch，语义不一致。

整改：统一 command API 的错误所有权。若 snapshot 是 owner，feature 不再 rethrow；若 Promise caller 是 owner，所有 production caller 必须 await/catch，且避免重复展示。

### P3-16 `navigationSummary` scope 没有注册 owner

位置：

- `auto—publish/media-workbench/src/features/workspace/workspace-coordinator.js:1-9`
- `auto—publish/desktop/workspace-data-invalidation.js:6-40`
- `auto—publish/media-workbench/src/components/Sidebar.tsx:46-55`

main 持续发 `navigationSummary` invalidation，Coordinator 也声明 known scope，但 production 没有 `useWorkspaceScope("navigationSummary")`。Sidebar 自己跨 platform/content/media snapshot 组合摘要。多数 reason 同时包含底层 scopes，所以通常只是死 scope，但会制造协议与真实 owner 不一致。

整改：若 summary 是纯 derived view，删除该 invalidation scope；若它应是独立 query，明确唯一 owner 并注册。不要保持两种模型。

### P3-17 `publishedAt` 在没有发布证据时间时伪装为订单创建时间

位置：`auto—publish/desktop/services/media-order-service.js:221-250`

当 canonical status 为 published 时，`publishedAt` 直接使用 `createdAt`。订单创建时间不等于供应商发布时间，当前 UI 会显示一个精确但不真实的时间。

整改：没有正式 evidence timestamp 时保持空值；若产品需要发布时间，应在 Phase 03 供应商 observation/evidence projection 中增加语义明确的字段。

## 3. 修错层/修错位置矩阵

| 现场问题或目标 | 当前修复位置 | 为什么不正确 | 正确 owner/阶段 |
| --- | --- | --- | --- |
| 供应商字符串报价、订单缺价 | IPC projection、submission service、workbench service 各自转换 | 同一事实多种转换，非法值可变成 0 或正数 | `MediaResourceService` 供应商摄取边界；Phase 06 |
| 订单标题、媒体名、报价恢复 | `MediaOrderService` 查询时全量回扫 submission batches | 无界 N+1，presentation service 重建持久 read model | OperationalStore 有界 order display projection；重新打开 Phase 03 |
| 显示供应商五状态 | `syncOrder()` 将状态写回 canonical publication records | 供应商 observation 与内部 workflow 状态是不同事实 | Phase 03 supplier observation/evidence 模型 |
| 安全打开发布链接 | 新增 main command，但 query 仍返回 raw URL | 修正了动作入口，没有收紧数据出口 | Phase 03 evidence validator + Phase 06 精简 DTO |
| 第三方标识共享 settings 状态 | 在两个页面局部分别加 Provider | View 局部实例成为 owner，产生竞态 | app/installation scope 唯一 settings owner；Phase 06 |
| 129/129 caller 证明 | fixture 把 preload channel 当 production caller | 证明 contract 暴露，不证明真实 feature/View 使用 | feature owner 到 preload 的纵向 trace；Phase 06 |
| invalidation 安全诊断 | Coordinator 期待处理 invalid event，preload 先吞掉 | 诊断放在拿不到失败的下游 | preload 结构化 diagnostic + 统一 sink；Phase 06/Phase 07 seam |
| preload/capability 缺失时页面可用 | production bridge 返回空数组/idle fallback | 把边界故障伪装成业务空状态 | production fail-closed，mock 数据只在测试 adapter |
| workspace 下 PlatformRun 隔离 | feature 有 scope，但 event payload 无 identity | consumer 无法证明事件属于当前 scope | runtime sender + event contract + feature fencing；Phase 06，必要时窄开 Phase 04 |

## 4. 为什么现有测试会假绿

1. Contract matrix 对 129 项 request/result/error/event 的形状覆盖较完整，但 caller 字段恒等于 preload channel，未验证真实 View/feature 调用链。
2. ConfirmationHost 测试传入 `scopeKey`，production root 未传；组件测试没有锁定实际 composition。
3. Platform feature 测试覆盖 runId/时间戳和 dispose，却没有 A→B workspace 切换后的旧 runtime 迟到事件，因为 event contract 本身没有 runtime identity。
4. SafeOperationalError 反例集中在 unknown field/version/control character，缺少形状合法但语义敏感的路径、credentials、Cookie、stack 和正文片段。
5. 订单测试验证五个 supplier labels 和同步后持久化，却没有断言 `9` 不得覆盖已发布 canonical record，也没有断言缺失 supplier observation 不得由 canonical 状态伪造。
6. 发布链接测试验证 Renderer 不能提交任意 URL，却没有断言订单 query 完全不含 URL 和内部 workflow IDs。
7. 价格测试分别锁定字符串转换后的局部结果，没有锁定供应商摄取后缓存中价格已是唯一 canonical number，也没有对 `-10`、货币字符串、非法字符串跨全部 caller 做一致性断言。
8. 订单报价纵向测试数据量很小，没有历史 batch 数量增长下的查询次数、payload 解析量和延迟预算。

## 5. 建议整改顺序

第一批，Phase 06 release blockers：

1. Platform event workspace fencing。
2. Production ConfirmationHost scope 和 destructive identity 重验。
3. SafeOperationalError 固定文案与 opaque diagnostic ID。
4. 订单 query 删除 raw URL/内部字段，并前移 evidence URL validator。
5. Production content bridge 移除 synthetic fallback。
6. 供应商状态与 canonical publication 状态解耦。
7. 价格规范化回到 `MediaResourceService` owner。

第二批，边界和行为完整性：

1. 未登记 registrar fail-closed。
2. sync reconcile 错误不再吞掉。
3. 唯一 SettingsFeatureProvider。
4. 删除 dead `media.stopSubmit`，或先定义正式停止语义。
5. 统一 media command Promise/error owner。
6. 建立有界订单 projection。

第三批，证据与清理：

1. 重写 production caller traceability。
2. 接通 structured diagnostic sink。
3. 删除或实现 `navigationSummary` scope。
4. 保持未知 `publishedAt` 为空并增加真实性测试。

阶段处理建议：

- Phase 06：重新打开为 `IN_PROGRESS`，承担 Renderer composition、Typed IPC、feature owner、error/diagnostic、DTO 删除和 caller evidence。
- Phase 03：为 supplier observation/canonical 状态解耦、有界订单 display projection、remote evidence URL/timestamp 语义做窄范围重新打开；不得在 Phase 06 增加兼容 wrapper。
- Phase 04：优先由 Phase 06 runtime composition 给 platform event 绑定 identity；若必须改变已冻结的 DesktopTaskService event interface，再窄范围重新打开 Phase 04。
- Phase 07：保持 `NOT_STARTED`；只预留 diagnostic/error seam，不在本轮迁移 Auth。

## 6. 整改验收补充

除 Phase 06 既有完整门禁外，至少增加以下 RED→GREEN：

- A workspace 运行平台任务，切换 B 后注入 A 的 heartbeat/terminal，B snapshot 和 query revision 均不变。
- production root 在 workspace/client scope 切换时取消 FIFO 中全部 confirmation；旧 token 不执行。
- 全 registry 遍历语义敏感 SafeOperationalError 反例。
- 订单 query 断言不存在 URL、credentials、publication/attempt 内部标识；open command 只接受 order identity。
- supplier `9` 不覆盖既有 canonical published；无 supplier observation 显示 unknown，不做 fallback 推断。
- 供应商价格在资源摄取后即为 canonical number；非法、负数、超限不会成为 0 或正数。
- production content API 缺失时所有相关 query/preview 明确失败，不返回 idle/空数据。
- 未登记非 Auth IPC handler 注册立即失败。
- 订单列表在大历史 fixture 下保持有界 query 次数和 payload 规模。
- 所有 production media command caller 不产生 `unhandledrejection`。

## 7. 安全声明

本次审计只读取当前仓库、执行本地静态/合成检查并创建本报告。未连接真实投稿、真实付费媒体、生产账号、真实 Auth 数据库或真实内容库；真实付费 submit 调用为 0。未修改 OperationalStore、ContentStore、Publisher 或 Domain/Application production interface，未 push、未创建 PR，也未开始 Phase 07。

## 8. 后续整改执行协议

> 本节是后续新线程的自包含执行入口。执行者不得依赖聊天上下文补全本节，也不得因上下文压缩而省略门禁、findings 或验收要求。

### 8.1 权威来源和已知状态

整改任务允许采用的文档来源仍仅为 `F:/官媒投稿-refactor/docs/`。除非当前 `docs/refactor/` 文档明确引用，禁止读取或采用 `auto—publish/docs/` 下的 ADR、计划、产品契约、测试清单或操作说明。

权威输入：

1. 当前代码和 Git 历史。
2. `docs/refactor/09-phase-06-renderer-ipc.md`。
3. `docs/refactor/handoffs/phase-06.md`。
4. `docs/refactor/13-progress-ledger.md`。
5. 本审计报告的 17 项 findings、修错层矩阵和验收补充。
6. Phase 03、Phase 04、Phase 05 当前完成交接；旧 review finding 只能作为线索，不能覆盖当前代码和本报告的实际证据。

已知安全检查点：

- 分支：`codex/refactor-program`
- 预期起始 HEAD：`3992736d01413d83504253c7d905c21fcfe3183c`
- commit subject：`fix(phase-06): complete paid media order workflow`
- 本报告在该检查点之后创建，可能仍是已知且授权保留的未提交文件：`docs/refactor/15-phase-06-code-audit.md`

若本报告未提交，不得把它视为未知阻断改动，不得删除、覆盖或混入 production 修复提交。其他未解释的 production、schema、migration、OperationalStore、ContentStore、Publisher、测试或打包制品改动仍按原启动门禁处理：立即停止并报告具体文件，不得 reset、checkout、clean 或覆盖。

### 8.2 启动门禁

开始整改前必须执行并记录：

```text
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --name-only
git diff --cached --name-only
git log --oneline -5
```

必须确认：

- 当前分支为 `codex/refactor-program`。
- 若尚无新的授权提交，HEAD 为 `3992736d01413d83504253c7d905c21fcfe3183c`。
- 本报告是唯一已解释的检查点后文件；若还有其他改动，必须辨明 owner 和来源后才可继续。
- Phase 07 仍为 `NOT_STARTED`。
- Phase 04 的 `PENDING_HUMAN` 继续阻止正式 release，但不阻止本地整改。
- 不连接或读取真实 workspace、真实内容库、真实 Auth 数据库、生产账号或付费服务。

门禁通过后，先把 Phase 06 从 `COMPLETE` 正式改为 `IN_PROGRESS`并记录审计原因，不能只改文字而不执行整改。

### 8.3 阶段重开权限和边界

本报告建议后续整改任务获得以下明确权限；若新任务没有明确授予其中某项，执行者应在触及该项前停止请求授权，不得用兼容 wrapper 绕过：

1. Phase 06 重新打开为 `IN_PROGRESS`，负责 Renderer composition、Typed IPC、feature owner、DTO、安全错误、diagnostic、production caller evidence 和旧路径删除。
2. Phase 03 为以下三项窄范围重新打开：
   - supplier observation 与 canonical publication 状态解耦；
   - 有界 order display projection；
   - remote evidence URL 和真实时间语义。
3. Platform event workspace identity 优先在 Phase 06 runtime composition 收口；如果必须改变 Phase 04 冻结的 DesktopTaskService event interface，先记录证据并窄范围重新打开 Phase 04。
4. 不重新打开 Phase 05，除非 RED 证明后端 destructive token/identity 冻结接口本身错误；此时必须停止并单独报告，不能在 Phase 06 增加 wrapper。
5. Phase 07 保持 `NOT_STARTED`；Auth IPC 继续位于明确豁免清单，只允许预留安全 diagnostic/error seam。

任何前序阶段重开都必须同步更新进度账本、阶段文档和对应 handoff，完成其定向与全局门禁后才能恢复 `COMPLETE`。

### 8.4 不可违反的整改原则

- 测试先行，单位是独立行为和风险的纵向切片，不要求对纯 registry 登记做机械循环。
- 每个切片执行：失败测试 → 明确目标 interface/owner → production caller 切换 → 删除旧路径 → 定向回归 → 三套 typecheck → 下一切片。
- 不以现有测试通过作为 finding 不成立的依据；必须先复现本报告描述的真实 production 执行链或给出可审计的反证。
- 不通过放宽 validator、返回空数组/idle/0、伪造 fallback、View 层过滤、catch-all、缓存或兼容 wrapper 掩盖接口缺口。
- 历史 evidence 没有价格、URL 或发布时间时保持“未记录/未知”，不得读取当前资源倒填历史事实。
- 不为历史客户、文章或采集数据建立新的兼容架构；只有 RED 证明当前 canonical 数据不符合当前契约时才讨论正式迁移。
- 不修改 OperationalStore、ContentStore、Publisher 或 Domain/Application 冻结接口来迁就 View；确需修改时按所属阶段正式重开。
- 不进行真实付费投稿。所有 submit、状态、容量和故障测试只使用 fake client、临时 SQLite 和合成 workspace。
- 不 stage、commit、push 或创建 PR，除非新任务明确授权。即使获得 commit 授权，也必须把审计文档检查点和 production 整改提交分开。

### 8.5 Finding 状态账本

整改期间必须维护以下状态之一：

- `OPEN`：尚未开始。
- `RED_REPRODUCED`：已用失败测试或最小 production harness 证明。
- `FIXED`：生产实现和旧路径删除已完成，尚未完成全部验证。
- `VERIFIED`：定向测试、三套 typecheck 和适用的全局门禁通过。
- `DEFERRED_WITH_USER_APPROVAL`：只有用户明确接受延期时可用，必须记录理由、风险和后续入口。

初始账本：

| ID | 初始状态 | 目标阶段/owner |
| --- | --- | --- |
| P1-01 Platform event workspace identity | OPEN | Phase 06；必要时窄开 Phase 04 |
| P1-02 ConfirmationHost/destructive scope | OPEN | Phase 06 |
| P1-03 SafeOperationalError 语义安全 | OPEN | Phase 06 |
| P1-04 raw URL/内部订单字段退出 Renderer | OPEN | Phase 06 + Phase 03 evidence boundary |
| P1-05 supplier/canonical 状态解耦 | OPEN | Phase 03 + Phase 06 projection |
| P1-06 媒体价格 canonical 化 | OPEN | Phase 06 `MediaResourceService` |
| P1-07 content bridge synthetic fallback | OPEN | Phase 06 |
| P2-08 registrar fail-closed | OPEN | Phase 06 |
| P2-09 production caller traceability | OPEN | Phase 06 |
| P2-10 invalid event diagnostic sink | OPEN | Phase 06，预留 Phase 07 seam |
| P2-11 唯一 SettingsFeatureProvider | OPEN | Phase 06 |
| P2-12 sync reconcile 错误传播 | OPEN | Phase 03/Phase 06 application boundary |
| P2-13 有界订单 projection | OPEN | Phase 03 |
| P2-14 dead `media.stopSubmit` | OPEN | Phase 06；若保留则先定义 Phase 03 语义 |
| P2-15 media Promise/error owner | OPEN | Phase 06 |
| P3-16 `navigationSummary` dead scope | OPEN | Phase 06 |
| P3-17 `publishedAt` 真实性 | OPEN | Phase 03 projection + Phase 06 DTO |

每个状态变化必须记录：RED 测试/fixture、修改文件、删除文件或 symbol、定向测试结果、三套 typecheck 结果，以及是否触及前序冻结 interface。

### 8.6 强制整改顺序

不得从低风险清理开始后以时间不足提前结束。按以下稳定检查点串行推进：

#### 检查点 A：workspace、destructive 和安全数据出口

1. P1-01 Platform workspace event fencing。
2. P1-02 ConfirmationHost scope 与 destructive identity 重验。
3. P1-03 SafeOperationalError 固定安全文案和 opaque diagnostic ID。
4. P1-04 raw order URL/内部 IDs 退出 Renderer，并前移 evidence URL validator。
5. P1-07 production content bridge 移除 synthetic fallback。

完成后必须运行相关 workspace/platform/content/confirmation/IPC/security 定向测试、三套 typecheck、packaging VM registry require 和 publish-log logger 断言。不得拖到 inventory 全部收口之后。

#### 检查点 B：供应商事实和订单 read model

1. P1-05 supplier observation 与 canonical publication 状态解耦。
2. P1-06 价格在 `MediaResourceService` 摄取时 canonical 化。
3. P2-12 reconcile/storage 错误安全传播。
4. P2-13 OperationalStore 有界 order display projection。
5. P3-17 `publishedAt` 保持真实或未知。

该检查点必须使用临时 SQLite、fake supplier 和合成大历史 fixture；付费 send 调用必须为 0。

#### 检查点 C：owner、死能力和证据完整性

1. P2-08 未登记非 Auth registrar fail-closed。
2. P2-09 重写真实 production caller traceability。
3. P2-10 structured diagnostic sink。
4. P2-11 唯一 SettingsFeatureProvider。
5. P2-14 删除 dead `media.stopSubmit`，或在获得正式语义授权后实现。
6. P2-15 统一 media Promise/error owner。
7. P3-16 删除或正式实现 `navigationSummary` scope。

每个检查点结束后运行相应域测试和三套 typecheck，不得把全部验证推迟到最后。

### 8.7 强制 RED→GREEN 场景

以下不是可选建议，而是进入最终门禁前必须存在的 production-level regression：

1. workspace A 运行平台任务，切换 B 后注入 A 的迟到 heartbeat 和 terminal；B 的 PlatformRun snapshot、busy、queue revision 和 refresh 次数均不变。
2. production root composition 在 workspace/client scope 切换时取消正在显示和 FIFO 队列中的所有 confirmation；旧 prepare token 的 execute 调用为 0。
3. destructive command 在 feature 层拒绝 input identity 与当前 command scope 不一致，即使 token 形状合法。
4. 共享 registry 表驱动遍历全部 capability，对路径、URL credentials、Cookie、API key、stack、原始日志和正文片段等“形状合法但语义敏感”SafeOperationalError fail-closed。
5. order query DTO 明确不存在 `orderUrl`、`publicationId`、`attemptId`、`publicationStatus` 和其他 View 不需要的内部标识；open command 只接收 order identity。
6. HTTPS evidence 拒绝 username/password、敏感 query/fragment 和不允许的 scheme；被拒绝值从未持久化或投影到 Renderer。
7. supplier status `9` 不覆盖既有 canonical `published`；五种 supplier code 作为独立 observation 正确显示。
8. 缺少 supplier observation 时显示 unknown/未同步，不从 canonical 状态伪造 code。
9. `reconcileRemoteOrder()` 的 SQLite/evidence/status 冲突错误成为稳定 SafeOperationalError，UI 不得声称同步成功。
10. 供应商资源进入 cache 时价格已经是 canonical finite non-negative number；负数、非法字符串、货币混合字符串、NaN、Infinity 和超限值不会变成 `0` 或正数。
11. 新订单标题、媒体名和报价通过有界正式 projection 恢复；历史缺失报价仍显示“未记录”。
12. 大历史 fixture 证明订单查询次数、SQL 次数和 payload 解析量有界，不随全部 submission batch 数量形成 N+1。
13. production content capability、preload namespace 或 result data 缺失时明确失败，不返回空数组、idle runtime、0 项预检或 synthetic runtime ID。
14. 未登记非 Auth channel 在注册阶段立即失败；Auth 豁免只接受明确 allowlist。
15. Settings 两个页面共享同一 feature owner；保存后切页不会读回旧 snapshot 或产生第二 owner 竞态。
16. `media.stopSubmit` 若删除，其 contract、fixture、preload、bridge、feature、registrar和文档记录全部消失；若保留，测试必须证明正式 stop 语义而不是只写未读取 flag。
17. refresh/toggle 等 media command 故障既能显示安全错误，又不会触发 `unhandledrejection`。
18. malformed invalidation/platform event 产生不含原 payload 的结构化 diagnostic，并能到达统一 sink。
19. 若无真实 published evidence timestamp，Renderer 显示未知/空，不得使用 createdAt 伪装。

### 8.8 Typed IPC inventory 完成规则

- 保持每个 production 非 Auth capability 的 request/result/error/event validator、合法 fixture、owner 和真实 caller 记录。
- 公共 unknown field/version/missing field/unsafe error 由共享 registry 表驱动覆盖全部 inventory。
- destructive operation、event、dispose、scope identity、媒体容量和敏感边界保持独立纵向 RED→GREEN。
- `productionCaller` 必须指向真实 View/feature/bridge 调用链，不得再以 `desktop/preload.js:<channel>` 冒充完整 caller evidence。
- 删除无效 `media.stopSubmit` 后必须重新统计 inventory。预计 129 会回到 128，但数字必须由真实 production 能力清点证明；不得为了保持数字保留死能力，也不得漏记新增或删除项。
- Auth invoke/event 保持 Phase 07 明确豁免，不得借豁免留下任意非 Auth channel。
- Preload 继续禁止通用 `invoke/on`、channel 暴露和可变参数透传。
- 完成前必须确认旧 preload/channel/DTO/fallback/重复 Provider/无消费者 event 已物理删除，而不是只从 UI 隐藏。

### 8.9 最终完整门禁

在 17 项 findings 全部达到 `VERIFIED`，或极少数具有用户明确书面接受的 `DEFERRED_WITH_USER_APPROVAL` 后，先运行 Phase 03/04（若重开）和 Phase 06 全部定向测试，再执行：

```text
npm test
npm run test:auth
npm run lint
npm run typecheck:main
npm run typecheck:renderer
npm run typecheck:bridge
npm run format:check
npm run test:links
npm run test:packaging
npm run build:renderer
npm run pack:smoke
git diff --check
```

还必须执行并记录：

- Typed IPC registry/inventory、production API surface和真实 caller composition tests。
- workspace runtime/invalidation/platform delayed event tests。
- ConfirmationHost FIFO、scope、焦点和 exactly-once tests。
- media resource/service/library/workbench、订单 projection、供应商状态和故障注入 tests。
- 1k、10k、13k、20k 媒体容量的请求数、payload bytes、main/Renderer 内存和延迟；第 20,001 项显式 truncated。
- packaging VM registry require、publish-log logger 断言和 packaged ASAR tests。
- Electron 焦点测试必须基于本轮最新 Renderer build。
- 实际测试文件数、pass/fail/skip、fixture 类型、查询次数、容量数据和每个 fault injection point。
- 全部测试继续断言真实付费 submit 为 0。

测试失败不得以“与本 finding 无关”直接忽略；必须证明基线、归属和处置结果。

### 8.10 完成与交接

只有以下条件全部满足，才可恢复 Phase 03/04（若重开）和 Phase 06 为 `COMPLETE`：

1. 17/17 findings 均有最终状态、代码和测试证据；没有未经用户批准的延期。
2. P1 全部 `VERIFIED`。
3. 修错层矩阵中的逻辑已迁回正确 owner，旧实现物理删除。
4. Typed IPC inventory 重新统计并达到真实 production capability 的全覆盖。
5. 所有完整门禁通过，最新 Renderer/packaged Electron 验证通过。
6. 更新 `docs/refactor/09-phase-06-renderer-ipc.md`、`docs/refactor/13-progress-ledger.md` 和 `docs/refactor/handoffs/phase-06.md`。
7. 若重开 Phase 03/04，同步更新其阶段文档、账本和 handoff，记录冻结 interface 是否变化。
8. 写回最终 feature owner表、Typed IPC inventory、Auth豁免、invalidation/platform event协议、SafeOperationalError策略、删除清单、订单 projection、容量数据和 Phase 07 diagnostic/error入口。
9. 最终进行一次独立只读审计，重点验证 production composition，而不是复述已有测试。

不得因为代码可构建、主要现场功能可用、测试接近完成、上下文过长或已生成安装包而提前宣布 `COMPLETE`。未满足条件时保持 `IN_PROGRESS`，handoff 必须记录下一项具体动作。不得开始 Phase 07。

### 8.11 新线程和上下文恢复规则

本报告是整改任务的唯一自包含执行入口。新线程的启动 Prompt 只需指向本文件，不应复制第 8 节，以免 Prompt 与仓库文档发生漂移。

执行模型建议使用 GPT-5.6 Terra，推理强度 `xhigh`。模型使用规则：

- 暂时禁止使用 `code-review` 技能；审计和复核必须直接依据本报告、当前 docs、Git 差异和 production 执行链。
- 可以适当使用 subagent 执行边界清楚的只读调查、测试定位或独立复核；主代理必须亲自完整读取本报告、判断 interface/阶段归属、整合修改和执行最终验收。
- 首轮只执行启动门禁、建立 17 项状态账本并完成检查点 A。不得同时开始检查点 B、C 或最终交接。
- 后续线程或续轮只推进下一个未完成检查点，不重做已经有充分证据的 `VERIFIED` 项；但必须先确认 Git 状态和既有证据仍有效。
- 如果聊天上下文被压缩、丢失或自动摘要，立即重新完整读取本文件第 8 节和当前 finding 状态账本，然后从下一项具体动作继续；不得依靠摘要记忆降低要求。
- 每个稳定检查点完成时，必须把 finding 状态、RED、修改、删除项、测试和下一动作写回 `docs/refactor/`。这样后续线程可以仅靠仓库恢复，不依赖聊天历史。
- 若代码、文档与聊天指令冲突，以用户最新明确指令为最高优先级；否则以当前代码、当前 Git 历史和 `docs/refactor/` 为准。不得采用旧 `auto—publish/docs/` 补全上下文。

推荐的新线程最小启动 Prompt：

```text
在 F:/官媒投稿-refactor 原地执行整改。请完整读取并严格执行
docs/refactor/15-phase-06-code-audit.md，尤其是第8节；该文件是自包含任务规范。
先执行启动门禁并建立17项状态账本，本轮只完成检查点A。不要使用code-review技能。
```

推荐的后续续轮 Prompt：

```text
重新核对 Git 状态并完整复读 docs/refactor/15-phase-06-code-audit.md 第8节，
从状态账本中的下一项具体动作继续；不重做已VERIFIED项，不提前进入最终交接。
```
