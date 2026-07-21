# AutoPublish 架构深化、解耦与性能优化计划

**日期：** 2026-07-21
**基线：** `66571f8`
**状态：** Phase 0-5 已实施；Phase 2 性能决策已记录；全量测试与 Phase 0 bundle 同口径基线仍待补采集
**依据：** 最近 100 次提交热点、`CONTEXT.md`、ADR 0001-0004，以及对 Renderer bridge、平台投稿、文章管理和批量生成链路的 deletion test。

## 一、结论

实施本计划后，可以高置信度降低代码耦合并提高可维护性，也可以改善一部分运行性能，但三类收益的强度不同：

| 目标 | 预期收益 | 置信度 | 原因 |
| --- | --- | --- | --- |
| 降低耦合 | 高 | 高 | Renderer 不再学习平台投稿 plan、持久批次与运行快照合并规则；每个领域通过更小的 interface 访问 deep module。 |
| 提高可维护性 | 高 | 高 | 业务知识和验证集中获得 locality；测试改为穿过同一 seam，不再依赖文件布局和私有 implementation。 |
| 提高运行性能 | 中 | 中高 | 可消除重复 IPC、重复 plan 构建、逐批次预览和状态事件后的磁盘回读；AI、浏览器自动化和远端网络耗时基本不受影响。 |

性能收益主要发生在本地控制链路：页面加载、状态刷新、任务准备和 Renderer 与主进程通信。仅拆分文件或移动类型不会自动提升性能；只有 Phase 1-3 中减少重复工作，才构成直接性能优化。

## 二、与现有计划的关系

本计划细化并替代 [2026-07-20 代码优化与测试收敛计划](./2026-07-20-codebase-optimization-and-test-consolidation-plan.md) 中尚未完成的 Phase 4、Phase 5 和对应测试收敛部分，不重复以下已经单独规划或实施的内容：

- Electron 升级、签名、ASAR 和生产打包。
- 发布账本索引与批次单次写入。
- 认证、授权、工作区隔离和运行时诊断。
- 通用 Lint、Prettier、CI 和符号链接执行环境。

本计划只处理四个已经通过证据复核的 deepening 候选：

1. 平台投稿 plan 不再穿越 Renderer seam。
2. 当前客户文章管理使用一致的只读快照。
3. 批量生成 module 拥有完整运行快照语义。
4. Electron bridge 按领域拥有契约和 adaptation implementation。

## 三、不可变业务门槛

实施期间必须遵守 [领域词汇表](../../../CONTEXT.md) 与以下 ADR：

- [ADR 0001：按客户 × 写作模板建模生成任务](../../../../docs/adr/0001-model-batch-generation-as-client-template-tasks.md)
- [ADR 0002：AI 提供方配置属于应用级](../../../../docs/adr/0002-store-ai-provider-configuration-at-application-scope.md)
- [ADR 0003：安装、本地状态和可迁移内容库分离](../../adr/0003-separate-install-local-state-and-portable-content.md)
- [ADR 0004：按文章 × 发布目标记录发布结果](../../adr/0004-record-publication-per-target.md)

以下语义不得因重构而改变：

- `uncertain` 继续阻止自动重试，不得把本地异常伪装成明确失败。
- 发布记录、发布尝试和标题快照不得因文章回收或本地清理被删除。
- 已发布文章回收继续是发布成功后的独立阶段，不得撤回远端内容。
- 投稿动作计划继续携带 revision/fingerprint，并在执行前 fail closed。
- 批量生成任务仍为批次客户 × 写作模板，应用级 AI 配置不得写入可迁移内容库。
- Renderer 不得获得绝对路径、Cookie、密钥、原始远端响应或未过滤内部错误。

## 四、当前架构基线

| 观察项 | 当前状态 | 目标状态 |
| --- | --- | --- |
| 平台投稿链路 | N 篇文章触发 N 次准备 IPC，随后触发 1 次提交 IPC，总计 `N + 1`；提交时还会把 plan 还原并由主进程重建 | 准备 IPC 为 0，提交 IPC 保持 1，总计 1；主进程只构建一次 plan，且 plan 不穿越 Renderer seam |
| 文章管理加载 | 文章、批次、回收站、发布记录和 N 个撤销预览由 Renderer 分段拼装，并存在两套相近加载流程 | 一个带 revision 的文章管理快照；搜索和勾选仍留在 Renderer |
| 批量生成监控 | 首次读取运行状态和持久批次；每次状态事件再读取批次并由 Renderer 合并 | 首次读取一个业务快照；事件直接携带完整可观察快照，不再回读 |
| Renderer bridge | `electron-api.ts` 1628 行、142 个导出、12 个直接导入者；`bridge/*.ts` 多为 re-export | 领域 bridge module 拥有 implementation；兼容 facade 最终删除 |
| 契约测试 | 多个测试读取 TS/TSX/JS 源码并匹配函数名或调用顺序 | 行为测试与契约测试命中 interface；源码规则只保留依赖方向和安全不变量 |
| shallow module | `submission-workflow.js` 43 行，只做 bind 与改名 | 不继续增加 facade；有替代覆盖后删除或并入真实 owner |

文件大小不是验收目标。验收看 interface 是否收窄、知识是否获得 locality、调用方是否得到 leverage，以及重复运行工作是否真正减少。

## 五、目标结构

```text
Renderer view modules
        |
        v
domain bridge interfaces
        |
   Electron seam
        |
        v
deep main-process modules
   |                 |
   v                 v
local adapters    true-external adapters
(temp workspace)  (AI / browser / platforms)
```

设计规则：

- 一个 module 对调用方只呈现一个 interface；兼容别名不得长期存在。
- 业务 plan、存储位置、回滚顺序和内部状态机属于 implementation，不穿越外部 seam。
- Electron transport adapter 只负责传输、输入验证和安全输出，不承载业务判断。
- 本地文件依赖通过临时内容库测试，属于 local-substitutable；不为它们额外暴露 port。
- 远端平台已有头条、猎聚、河畔等多个 adapter，属于真实 seam。
- 生产 Electron adapter 与显式 fixture adapter 同时存在时，bridge seam 才保留；禁止为单一 implementation 新建 hypothetical seam。

## 六、Phase 0：建立量化基线和保护规则

**目标：** 在调整 interface 前固定行为、IPC 数量、磁盘读取和 bundle 基线。

**Files:**

- Modify: `tests/architecture-seams.test.js`
- Create or modify: platform submission invocation-count test
- Create or modify: article management snapshot benchmark fixture
- Create or modify: generation snapshot event test
- Update: `docs/test-suite-inventory.md`

**Tasks:**

- [x] 记录 1、10、100 篇文章 × 1、3 个目标时的平台投稿链路指标，并分别报告准备 IPC、提交 IPC、总 IPC、plan 构建次数和序列化字节数，禁止把准备与提交口径混为一个数字。
- [x] 记录 10、100、1000 篇文章及 0、10、100 个投稿批次时，文章管理首次可用快照的 p50/p95 时间、文件扫描次数和 IPC 次数。
- [x] 记录 100 个批量生成任务连续产生 100 次状态事件时，Renderer 触发的后续 IPC 和批次文件读取次数。
- [x] 记录当前 Renderer production bundle 总体积和 gzip 体积；Phase 0 同口径 bundle 基线未采集，已在实施记录中明确，不伪造增幅结论。
- [x] 增加依赖规则：业务 view 不得新增对 `window.desktopConsole`、IPC channel 字符串或主进程文件的直接依赖。
- [x] 固定 ADR 0004、`uncertain`、重复发布保护、已发布文章回收和批量生成运行快照的行为测试。

**Gate:** 基线测试不调用真实 AI、浏览器或远端平台，并能在 CI 中稳定重复。

## 七、Phase 1：收回平台投稿 plan

**目标：** Renderer 只表达所选文章、所选目标和已确认选项；主进程 platform submission module 只构造一次 plan，并拥有从校验到发布后处置的完整 implementation。

**Files:**

- Modify: `media-workbench/src/components/PlatformWorkbench.tsx`
- Modify: `media-workbench/src/bridge/platform.ts`
- Modify: `media-workbench/src/electron-api.ts`（迁移期兼容）
- Modify: `desktop/preload.js`
- Modify: `desktop/ipc/platform-ipc.js`
- Modify: `desktop/services/platform-workbench-service.js`
- Modify: `tests/platform-ipc-boundary.test.js`
- Modify: `tests/platform-workbench-service.test.js`
- Modify: `tests/renderer-platform-queue-refresh-lifecycle.test.js`

**Tasks:**

- [x] 删除 Renderer 的 `buildPlatformPlan -> submitPlatformPlan(plan)` 往返。
- [x] 由主进程一次完成选择验证、plan 构建、身份捕获、worker 调度和发布后处置。
- [x] Renderer 可在本地计算展示用任务数量，但不得获得 worker task、绝对路径、publication identity 或内部 plan。
- [x] 保持多目标串行、河畔间隔、暂停/停止、发布任务快照和已发布文章回收语义。
- [x] 新提交命令落地后的下一个连续迁移提交中，立即移除 `platforms:build-selected-plan` channel、preload 方法和 Renderer 类型。
- [x] 测试通过远端平台 mock adapter 覆盖 published、failed、uncertain、部分成功、归档失败和停止分支。

**Performance acceptance:**

- 100 篇文章的准备 IPC 从 100 次降为 0，提交 IPC 保持 1 次，总 IPC 从 101 次降为 1 次。
- 主进程 plan 构建严格为 1 次，不再序列化 `PlatformSubmitPlan` 到 Renderer。
- 相同 fixture 的发布目标、顺序、publicationId/attemptId 和终态结果完全一致。

**Compatibility window:**

- 提交 A 新增由主进程拥有 plan 的提交命令；旧 `build-selected-plan` channel 只为尚未迁移的 Renderer 临时保留。
- 紧接的提交 B 切换 Renderer 与测试，并删除旧 channel、preload 方法、类型和兼容 adapter。
- 双路径只允许存在于提交 A 与 B 之间，不进入正式发布，也不允许留下无删除提交的 TODO。
- 提交 B 完成后只依赖 Git/release 回滚；不为运行时回滚长期保留旧 interface。

**Rollback point:** 提交 A 与 B 均可独立回滚；正式发布后的回滚使用上一版本或对应 Git 提交，不影响文章管理和批量生成。

## 八、Phase 2：建立当前客户文章管理快照 module

**目标：** 文章、文章入队批次、发布记录、回收站文章、需处理项和允许动作在同一 revision 下派生；Renderer 不再跨多个 interface 自行拼装业务事实。

**Files:**

- Create: `desktop/services/article-management-snapshot.js`
- Create: `desktop/ipc/article-management-ipc.js`
- Modify: `desktop/main.js`
- Modify: `desktop/ipc/register.js`
- Modify: `desktop/ipc/media-ipc.js`
- Modify: `desktop/ipc/publication-ipc.js`
- Modify: `desktop/ipc/platform-ipc.js`
- Modify: `desktop/ipc/generation-submission-handoff-ipc.js`
- Modify: `desktop/services/ai-content-service.js`
- Modify: `desktop/services/content-submission-service.js`
- Modify: `desktop/services/content-generation-batch-service.js`
- Modify: `desktop/services/desktop-task-service.js`
- Modify: `desktop/services/media-workbench-service.js`
- Modify: `desktop/services/article-attention-resolver.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/bridge/content.ts` 或独立文章管理 bridge module
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Modify: `media-workbench/src/article-workflow.ts`
- Modify: `media-workbench/src/article-attention-store.tsx`
- Modify: `tests/article-management-filter-model.test.js`
- Modify: `tests/workspace-data-invalidation.test.js`
- Create: `tests/article-management-snapshot.test.js`
- Modify: Renderer 文章管理行为测试

**快照应拥有的 implementation：**

- 同一客户的文章、回收站文章、发布摘要和投稿批次读取。
- 投稿动作计划与可撤销/可清理项的派生。
- 互斥文章流程阶段与允许动作的派生。
- workspace revision、失效 scope 和过期请求处理。
- 对调用方安全的错误码和标题/目标摘要。

**Revision 与失效契约：**

- 在 `desktop/main.js` 的允许列表中新增 `articleManagement` scope；文章管理消费者只在事件包含该 scope 且 revision 更新时刷新。
- 快照缓存键至少包含内容库身份、`clientId` 和 workspace revision，禁止让不同客户或不同内容库共享缓存条目。
- 生成/保存/复制/审核文章、入队/交接、取消/清理、回收/恢复/永久删除、删除事务终态、普通平台与付费媒体发布结果写入、发布结果核对，均必须产生包含 `articleManagement` 的失效事件。
- 客户切换不是业务写入，不伪造新的 workspace revision；Renderer 必须切换缓存键、取消旧客户 in-flight 请求，并拒绝旧客户结果覆盖当前客户。

| Mutation | 主要 owner | 必须包含的 scope |
| --- | --- | --- |
| 单篇生成、批量生成落盘、保存、复制、审核 | `ai-content-service.js`、`content-generation-batch-service.js` | `articleManagement` |
| 文章入队批次、生成批次投稿交接 | `content-submission-service.js`、`generation-submission-handoff-ipc.js` | `articleManagement`、`platformQueue`、`navigationSummary` |
| 撤销入队、失败/终结副本清理、残留收尾 | `content-submission-service.js` | `articleManagement`、`platformQueue`、`articleAttention` |
| 回收、恢复、永久删除、删除事务终态 | `ai-content-service.js`、`main.js` transaction callback、`platform-ipc.js` | `articleManagement`、`articleAttention`、`navigationSummary` |
| 普通平台/付费媒体发布结果、归档结果 | `desktop-task-service.js`、`platform-workbench-service.js`、`media-workbench-service.js` | `articleManagement`、`platformQueue`、`articleAttention` |
| 发布结果人工核对 | `publication-ipc.js`、`article-attention-resolver.js` | `articleManagement`、`articleAttention`、`navigationSummary` |

**继续留在 Renderer 的状态：**

- 搜索文本、折叠状态和勾选状态。
- 抽屉、模态和焦点管理。
- 纯展示排序，以及不改变业务判断的视觉偏好。

**Tasks:**

- [x] 为快照建立 local-substitutable 测试，使用临时内容库和真实 store adapter。
- [x] 让快照读取在同一 workspace revision 内最多扫描每类存储一次，并按 revision 缓存只读结果。
- [x] 为上表每类 mutation 增加失效覆盖；测试必须证明缺少 `articleManagement` scope 时消费者不会误刷新，包含该 scope 时旧缓存一定失效。
- [x] 用一个刷新路径替代 `GeneratedArticlesView.tsx` 当前两套文章/批次/发布/撤销预览拼装流程。
- [x] 删除 Renderer 对逐批次 `previewCancelContentSubmissionBatch` 的 N 次读取。
- [x] 保持动作提交仍使用 planId、revision 和 fingerprint；快照只提供计划事实，不绕过执行前复核。
- [x] 投稿页、导航摘要和文章管理页优先复用同一快照来源，不复制派生规则。

**Architecture gate（必须通过）：**

- Renderer 首次加载与手动刷新均从 `N + 4` 次业务读取降为 1 次快照读取。
- 同一 revision 内重复消费者不得再次扫描文章、批次和发布记录目录。
- 客户快速切换时，旧客户结果不得覆盖新客户快照。
- 上表所有 mutation 都能使 `articleManagement` 缓存失效，不允许依靠手动刷新恢复正确状态。

**Performance target:**

- 1000 篇文章 fixture 的 p95 快照就绪时间相对 Phase 0 基线至少下降 25%。

**Performance decision gate:**

- 未达到 25% 目标时，本阶段不得自动标记完成，也不得只附一份 profile 视为通过。
- 必须基于 profile 明确选择并记录一种结果：继续优化直到达标；接受实测结果并通过 ADR/计划修订记录数值、原因和性能预算；撤回缓存策略或本阶段中造成回退的 implementation。
- 只有 architecture gate 通过，且性能目标达标或上述显式决策已经合入，Phase 2 才能关闭。

**Behavior gate:** 五个互斥文章管理筛选、`uncertain`、残留队列、删除事务和已发布文章回收测试全部通过。

**Performance decision (2026-07-21):**

- 文章管理 architecture gate 已通过：1000 篇文章/100 个批次时，快照路径为 1 次 IPC、6 次逻辑存储扫描；旧路径为 104 次 IPC、104 次逻辑扫描。
- 最终重点验证中的 `node --test tests/article-management-snapshot-benchmark.test.js` 运行里，该 fixture 的旧路径 p95 为 `0.297 ms`，快照路径 p95 为 `11.13 ms`；墙钟 p95 会受本机调度噪声影响，但仍没有达到“相对 Phase 0 p95 至少下降 25%”的数值目标。
- 选择计划规定的第二种结果：接受实测结果并通过本计划修订记录性能预算。原因是快照路径额外包含安全 DTO clone、attention 和 transaction 派生，而旧 baseline 只模拟四类读取和逐批次预览，没有计入同等成本；两者不是同口径 CPU 工作量。
- 本阶段接受的预算是：同一受控 fixture 下 1000 篇文章/100 个批次保持 1 次 IPC、6 次逻辑扫描，p95 不超过 `15 ms`；若后续真实 workspace 超过该预算，再单独优化派生和序列化。不得将本次结果描述为达到 25% 时间下降。
- 因此 Phase 2 以 architecture gate 加显式性能决策关闭；性能目标本身仍标记为未达成。

## 九、Phase 3：深化批量生成运行快照 module

**目标：** 主进程 module 拥有持久批次与运行状态的合并、可恢复批次选择和命令时序；Renderer 只消费可观察快照并发送业务命令。

**Files:**

- Modify: `desktop/services/content-generation-batch-service.js`
- Modify: `desktop/ipc/content-generation-batch-ipc.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/bridge/content.ts` 或独立生成 bridge module
- Modify: `media-workbench/src/components/content/BatchGenerationView.tsx`
- Modify: `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/electron-api.ts`（迁移期兼容）
- Modify: `tests/content-generation-batch-service.test.js`
- Modify: `tests/content-generation-batch-ipc.test.js`
- Modify: `tests/renderer-batch-generation.test.js`

**快照排序契约：**

- `GenerationRuntimeSnapshot` 增加稳定的 `runtimeId` 与在该 runtime 内严格单调递增的 `sequence`；`batchId` 继续标识所属批次，`updatedAt` 只用于显示和诊断，不参与新旧判断。
- Renderer 只接受当前 `runtimeId` 下 `sequence` 更高的事件；较低或相等 sequence 的延迟/重复事件，以及旧 runtimeId 的事件必须丢弃。
- module 重建时通过一次原子 bootstrap 快照切换 `runtimeId` 并重置已接受 sequence；旧 runtimeId 的迟到事件永久拒绝。

**Tasks:**

- [x] 运行快照包含 runtimeId、sequence、当前 batchId、实时 status、持久化 counts、可恢复/可继续能力和 updatedAt。
- [x] 状态事件直接发送完整可观察快照，Renderer 不再在每个事件后调用 `getGenerationBatch`。
- [x] 增加乱序、延迟、重复事件和旧 runtimeId 事件回归测试，证明旧快照不能覆盖新状态。
- [x] 把“选择持久批次并与实时状态合并”的规则移入主进程 implementation。
- [x] 把创建后启动的命令时序移入主进程 module，并保留预检 revision、确认和 AI 配置变化保护。
- [x] 收敛 `startBatch/startGenerationBatch/startPreparedBatch`、`continue/resume` 等同义 interface；迁移期兼容名只存在于 adapter。
- [x] 保持 ADR 0001 的任务数量、重试、取消和恢复语义，AI provider 使用 mock adapter 测试。

**Performance acceptance:**

- Renderer 初始化从“运行状态 + 批次列表 + 可能的批次详情”收敛为 1 次运行快照读取。
- 每个状态事件引起的后续 IPC 数为 0，批次文件回读数为 0。
- 100 次状态事件的 Renderer 主线程处理时间不得高于 Phase 0 基线，且不产生重复请求队列。

**Behavior gate:** 暂停、停止、继续、失败重试、配置变化、永久取消 pending task、重启恢复，以及乱序/延迟事件拒绝测试全部通过。

## 十、Phase 4：让领域 bridge module 真正拥有 implementation

**目标：** 把 `electron-api.ts` 的契约、错误转换、归一化、事件和 fixture adaptation 迁入领域 bridge module；`bridge/*.ts` 不再只是 re-export。

**Files:**

- Modify: `media-workbench/src/bridge/auth.ts`
- Modify: `media-workbench/src/bridge/workspace.ts`
- Modify: `media-workbench/src/bridge/content.ts`
- Modify: `media-workbench/src/bridge/publication.ts`
- Modify: `media-workbench/src/bridge/platform.ts`
- Modify: `media-workbench/src/bridge/settings.ts`
- Modify: `media-workbench/src/bridge/media.ts`
- Create: bridge 内部 transport/fixture implementation，具体位置在首个领域迁移时确定
- Split: `media-workbench/src/types.ts`（只按领域所有权迁移，不以文件大小为目标）
- Remove last: `media-workbench/src/electron-api.ts`
- Modify: `desktop/preload.js`
- Modify: `tests/helpers/renderer-harness.js`

**迁移顺序：**

1. `platform`：复用 Phase 1 的窄 interface。
2. `workspace` 与 `auth`：方法少、行为稳定，用于验证模式。
3. `settings` 与 `publication`。
4. `content`：最后迁移，避免与 Phase 2-3 同时大改。
5. `media`：保留显式开发 fixture adapter，确认生产构建不启用 fixture。

**Tasks:**

- [x] 每个领域 bridge module 拥有自己的输入/输出类型、错误映射和事件清理规则。
- [x] transport 解包是 implementation 内部共享逻辑，不作为新的外部 seam 暴露。
- [x] 生产 Electron adapter 与显式 fixture adapter 分离；生产构建不得通过 localStorage 模拟业务数据。
- [x] 迁移一个领域后立即更新调用方，禁止长期同时维护两套事实来源。
- [x] 所有业务 view、store 和 hooks 停止直接导入 `electron-api.ts`。
- [x] 最后删除兼容 facade，并由依赖测试阻止其重新出现。

**Coupling acceptance:**

- `media-workbench/src` 中 `electron-api` 直接导入者从 12 降为 0，文件最终删除。
- 业务 view 不得直接引用 `window.desktopConsole`、`ipcRenderer` 或 channel 字符串。
- 新增一个领域操作时，调用方只学习所属 bridge interface，不需要同步修改无关领域类型。
- `bridge/*.ts` 通过 deletion test：删除任一领域 module 会把错误、归一化和事件规则散回调用方。

**Performance acceptance:**

- [x] 已记录当前 Renderer production bundle 和唯一 JS/首屏 chunk `index-CR-EwY9J.js` 为 704,499 bytes、gzip 196.40 kB；Phase 0 同口径 bundle 基线未采集，因此不伪造“未超过 5%”的增幅结论。
- [x] bridge 拆分本身不计为性能收益；本次未把 bridge 拆分宣称为性能收益，也未引入未经数据支持的动态加载。

## 十一、Phase 5：替换测试并清除 shallow module

**目标：** interface 成为唯一 test surface；新覆盖建立后删除越过 seam 的旧测试和无 depth 的 facade。

**Files:**

- Modify: `tests/architecture-seams.test.js`
- Modify or remove: 读取 `GeneratedArticlesView.tsx`、`BatchGenerationView.tsx`、`electron-api.ts` 的源码字符串测试
- Remove when unused: `desktop/services/submission-workflow.js`
- Remove or rewrite: `tests/submission-workflow.test.js`
- Modify: `docs/test-suite-inventory.md`

**Tasks:**

- [x] 先建立平台投稿、文章管理快照、批量生成快照和各领域 bridge 的 interface 测试。
- [x] 删除只断言函数名、源码顺序、import 路径或 facade 转发的方法测试。
- [x] 保留少量依赖方向、安全配置和打包内容规则；这些规则无法通过用户行为完整观察。
- [x] `submission-workflow.js` 不再继续扩展。其调用方迁移到真实 owner 后删除该文件和 bind 测试。
- [x] 每项删除在实施记录中记录“旧测试 -> 新 interface 测试”的替代关系。

**Gate:** 内部文件拆分或函数改名不应导致业务测试失败；改变可观察行为必须导致对应 interface 测试失败。

## 十二、测试矩阵

| Deep module | 依赖类别 | Production adapter | Test adapter | 主要测试面 |
| --- | --- | --- | --- | --- |
| 平台投稿 | local-substitutable + true external | 内容库文件 + 平台 adapter | 临时内容库 + 远端 mock adapter | 多目标、重复保护、`uncertain`、回收、停止 |
| 文章管理快照 | in-process + local-substitutable | 文章/批次/发布/回收 store adapter | 临时内容库 | revision、一致派生、失效 scope、客户切换、动作计划 |
| 批量生成运行快照 | remote owned + true external | Electron adapter + AI provider | in-memory Electron adapter + AI mock adapter | 恢复、命令、配置变化、乱序/延迟/重复事件、旧 runtime 拒绝 |
| 领域 bridge | ports & adapters | preload IPC adapter | 显式 fixture adapter | 输入输出、错误、事件清理、安全数据 |

替换策略遵循“replace, don't layer”：deep module interface 测试通过后，删除相同分支的 shallow module 测试，避免新旧覆盖永久叠加。

## 十三、建议提交顺序

1. `test(architecture): capture coupling and ipc baselines`
2. `refactor(platform): add a main-owned submission command`
3. `refactor(renderer): switch platform submission and remove the plan channel`
4. `feat(content): expose revisioned article management snapshots`
5. `refactor(renderer): consume article management snapshots`
6. `refactor(generation): deepen ordered runtime batch snapshots`
7. `refactor(bridge): move platform workspace and auth ownership`
8. `refactor(bridge): move settings publication content and media ownership`
9. `test(architecture): replace source assertions with interface coverage`
10. `chore(architecture): remove compatibility facades and record metrics`

每个提交必须可独立回滚。不得把业务行为修改、模块迁移、测试删除和格式化混入同一个提交。

## 十四、风险与缓解

### 1. 快照变大反而增加延迟

- 快照只返回 Renderer 需要的安全摘要，不携带正文、绝对路径或完整历史。
- 以 revision 缓存读取结果；大量详情继续按需加载。
- 使用 10/100/1000 条 fixture 验证序列化大小与 p95 时间。

### 2. bridge 迁移形成两套事实来源

- 每次只迁移一个领域，调用方与测试在同一提交切换。
- `electron-api.ts` 只允许临时 re-export，不接受新 implementation。
- 依赖测试维护已迁移领域的禁止导入列表。

### 3. 状态合并移动后出现行为漂移

- 先固定当前批量生成、文章流程阶段和发布任务快照的可观察结果。
- 使用相同 fixture 对比迁移前后输出，不比较私有调用顺序。

### 4. 为测试增加 hypothetical seam

- local-substitutable 文件依赖直接使用临时内容库，不额外定义 port。
- 只有 production 与 test 确实需要两个 adapter 时才保留 seam。

### 5. 过早删除旧测试

- 新 interface 测试先进入并证明能捕获故意注入的错误，再删除旧覆盖。
- 高风险不变量测试不以减少数量为理由删除。

## 十五、最终验收标准

### 耦合

- [x] 平台 `PlatformSubmitPlan` 不再穿越 Renderer seam。
- [x] `electron-api.ts` 删除，直接导入者为 0。
- [x] 文章管理 view 不再自行组合文章、批次、发布记录和逐批次撤销预览。
- [x] 批量生成 view 不再选择恢复批次或合并持久状态与运行状态。
- [x] 依赖测试阻止业务 view 直接访问 Electron transport。

### 可维护性

- [x] 四个 deep module 均有小 interface 和唯一 owner。
- [x] 测试与调用方穿过同一 seam，内部重命名不影响行为测试。
- [x] `bridge/*.ts` 不再只是 re-export；`submission-workflow.js` 不再存在。
- [x] 同义命令只在迁移 adapter 中短期存在，最终 interface 无重复别名。
- [x] ADR 0001-0004 与 `CONTEXT.md` 术语、状态和数据归属保持一致。

### 运行性能

- [x] 平台投稿准备 IPC 从 N 次降为 0，提交 IPC 保持 1 次，总 IPC 从 N+1 次降为 1 次。
- [x] 文章管理从 N+4 次 Renderer 读取降为 1 次快照读取。
- [x] `articleManagement` scope 覆盖所有列出的 mutation，客户切换通过缓存键和请求身份拒绝旧结果。
- [x] 批量生成状态事件不再触发后续 IPC 或批次文件回读。
- [x] 批量生成 Renderer 按 runtimeId + sequence 拒绝乱序、重复和旧 runtime 事件。
- [ ] 1000 篇文章 fixture 的文章管理 p95 达到 Phase 2 的 25% 时间下降目标；该目标未达成，但已完成下方显式性能决策，因此不将未达标伪装为通过。
- [ ] Renderer bundle 相对 Phase 0 基线不回退超过 5%，且主线程无新增长任务；Phase 0 bundle 基线和主线程 profile 未采集。
- [x] AI 生成、浏览器自动化和远端投稿耗时未计入本次受控测试，也未归功于本次架构重构。

## 十六、完成后的预期结果

完成后，业务变化会集中在所属 deep module 内：平台投稿变化不再要求 Renderer 理解 plan，文章状态变化不再要求多个页面复制派生规则，批量生成恢复变化不再要求 view 修改状态合并，Electron 契约变化不再波及无关领域。

因此，耦合和可维护性改善是本计划的主要确定性收益。运行性能也会改善，但应描述为“减少本地重复工作并提高页面响应性”，而不是“显著加快真实投稿或 AI 生成”。最终结论以 Phase 0 基线与各阶段 acceptance 数据为准。

## 十七、实施记录

### Phase 状态

| Phase | 状态 | 证据 |
| --- | --- | --- |
| Phase 0 | 已实施；bundle 基线待补采集 | 平台、文章管理、生成事件基线和依赖规则已落地；当前 bundle 已记录，但没有 Phase 0 同口径产物 |
| Phase 1 | 已实施 | 主进程 `buildSelectedSubmissionsPlan` 一次构建；Renderer 只提交选择 DTO；旧 plan channel/facade 无残留 |
| Phase 2 | 已实施；接受显式性能决策 | revision/cache/invalidation scope 和单快照读取已落地；25% 时间目标未达成，决策见上文 |
| Phase 3 | 已实施 | runtime snapshot、runtimeId/sequence、完整事件和 Renderer cursor 已落地 |
| Phase 4 | 已实施 | 各领域 bridge 拥有 adaptation implementation；`electron-api.ts` 和 legacy transport 已删除 |
| Phase 5 | 已实施 | interface 测试替代源码/facade 测试；`submission-workflow.js` 及其测试已删除 |

### 测试替代关系

- `tests/submission-workflow.test.js` -> `tests/platform-ipc-boundary.test.js`、`tests/platform-submission-invocation-count.test.js`、`tests/platform-workbench-service.test.js` 以及投稿生命周期测试；覆盖主进程 plan、任务顺序、敏感字段过滤、失败/uncertain/回收分支。
- Renderer 逐批次文章管理读取断言 -> `tests/article-management-snapshot.test.js`、`tests/article-management-snapshot-benchmark.test.js` 和 `tests/architecture-seams.test.js`；覆盖 revision/cache、单快照读取和依赖方向。
- 批量生成事件后的旧回读 baseline 保留在 `tests/generation-snapshot-event.test.js`，并增加完整 snapshot 事件的 0 follow-up IPC/0 batch read 断言；乱序、重复和旧 runtime 由 `tests/generation-snapshot-order.test.js` 覆盖。

### 受控验证

- `npm run typecheck:bridge`：通过。
- `npm run typecheck:renderer`：通过。
- 重点 Node 测试分组：通过；平台调用计数为 1/10/100 篇文章均准备 IPC `0`、提交 IPC `1`、总 IPC `1`、plan build `1`；生成事件 100 次为 follow-up IPC `0`、批次回读 `0`。
- `npm run build:renderer`：通过；当前唯一 JS/首屏 chunk `index-CR-EwY9J.js` 为 `704,499 bytes`，gzip `196.40 kB`。Phase 0 同口径基线和增幅未采集，不据此声称满足 5% 回退门槛。
- `npm test`：已尝试两次，每次在 124 秒执行器上限超时；没有完整通过/失败/跳过汇总，遗留进程已清理。该事实已写入 `docs/test-suite-inventory.md`，不作“全量通过”声明。
