# GEO 批量发文：文章生成与列举网投稿修复计划

状态：`COMPLETE`（P0–P5 已完成，最终本地门禁通过）
执行结果：`COMPLETE`（D1–D6 和所有工作包已闭合；真实外部操作仍受授权边界约束）
计划类型：已完成执行记录
审计范围：文章生成、批量任务编排、列举网（Lieju）普通平台投稿；提交中心列表只作为直接受影响的辅助范围。

## 1. 目标

产品的基础目的，是在 GEO 优化过程中稳定地产出并批量发布大量文章。本计划的目标是让主链路先完成这个目的，再保留必要的安全和一致性约束：

1. 用户选择的批量规模在开始前就得到一致、可理解的预检结果，不出现预览通过、执行阶段才因同一限制失败。
2. “单篇生成”页面允许用户指定一次任务生成几篇文章；同一客户、资料、调研回答和模板下，每篇都是独立文章事实，并能看到成功/失败进度。
3. 批量任务不会先物化一个远超系统承受范围的笛卡尔积；任务上限、并发度和资源读取都在明确 owner 中受控。
4. 生成链路不把所有客户的完整资料和文章素材一次性搬进 renderer，也不为每个任务重复读取同一批来源。
5. 列举网投稿按队列运行复用可复用的账号、城市和表单准备结果，减少每篇文章的重复远端检查，同时保留账号绑定、目标冻结和不确定结果人工核对等必要门禁。
6. 远端投稿结果与本地会话持久化结果分离表达：远端已确认接受时，不因本地会话保存失败而丢失已确认的发布事实；远端未知时仍不得自动重试。
7. 提供跨客户的投稿总览并保留按客户筛选，避免 GEO 大批量发文时反复切换客户；后续按主题/多维度批量生成仍走明确的产品决策入口。

## 2. 边界

### 2.1 本次包含

- `desktop/services/content-generation-batch-service.js` 及其 IPC、preload、renderer 批量生成用例。
- 单篇生成页面、`ai-content-service`、article generation IPC/bridge 合同，以及单次生成多篇文章的持久化与结果展示。
- `src/content` / `src/ai` 中的来源读取、任务 runner、生成器输入限制和批次状态投影。
- `src/platforms/lieju`、`regular-platform-preparation-port` 以及普通队列 admission/submit 直接调用链。
- 受上述链路直接影响的提交中心列表查询：分段失败隔离、分页/截断可见性、客户范围传递和 N+1 查询。
- 公开行为测试、故障注入测试和必要的类型/构建验证。

### 2.2 本次不包含

- 不移除列举网账号档案绑定、远端 fingerprint 校验、文章目标冲突检查、入队冻结、原子入队或不确定结果人工核对。
- 不把超时、断线、缺订单号等不确定远端结果改成自动重试；不以 sleep、固定成功值或吞错换取吞吐。
- 不扩展付费媒体、订单/支付、第三方自媒体、auth-server、真实生产数据库迁移或真实发布操作。
- 不实现“客户 × 模板 × 主题/多维度”的新任务轴；该能力延期为独立产品决策，不能用隐式循环或复制批次伪造实现。单篇页面的 `articleCount`（1–100）不属于该延期项。
- 不在没有真实能力验证前承诺列举网图片传输机制的扩大范围。
- 不进行与本链路无关的全仓库重构、格式化或兼容层堆叠。
- 这是内部桌面工具；本计划不新增 RBAC/多租户权限体系、复杂加密改造、跨环境零信任隔离、全面安全审计平台或扩大的合规日志。凭据不泄露、账号绑定一致性和远端副作用保护仍按最小必要范围保留。

### 2.3 必须单独决策的产品项

| 决策项 | 当前事实 | 决策输出 |
| --- | --- | --- |
| 单篇每次生成上限 | 当前接口固定返回一篇，没有篇数合同 | **已确认：N 范围 1–100，默认 1**；100 是一次操作的总篇数上限，不是并发数 |
| 主题/多维度批量生成 | 当前批量任务只有“客户 × 模板”；大量 GEO 主题仍需人工重复操作 | **延期，不阻塞本计划**；另立产品决策，定义主题轴、单批上限、拆批规则和计费/配额语义 |
| 跨客户投稿总览 | 当前 renderer 以选中客户为范围，提交中心没有稳定的全局分页合同 | **已确认需要全局视图**：跨客户分页总览、按客户筛选、排序和部分失败展示 |
| 已接受但会话保存失败 | 当前适配器会把该组合降为 `uncertain` | **已确认采用双结果合同**：远端 accepted 保留发布身份；会话保存失败单独诊断，不解除绑定、不重试 |

## 3. 已确认的审计问题

问题等级按当前项目审计协议解释；`P1/P2` 代表需要进入本计划，未授权的真实外部验收不作为已完成证据。

| ID | 等级/归因 | 问题与影响 | 主要 owner |
| --- | --- | --- | --- |
| GEN-01 | P1 / `EXPOSED_PREEXISTING` | generator 对素材和研究各限制 50 条，而 renderer 可“全选”并 IPC 合同允许到 1000；用户可能先看到可执行预览，运行时才失败 | 生成输入合同、批量 UI、generator |
| GEN-02 | P1 / `EXPOSED_PREEXISTING` | 批量服务先展开客户 × 模板任务数组，随后才撞击 store 的 1000 任务上限；1000×1000 请求会造成无必要的内存/延迟峰值 | batch service、OperationalStore admission |
| GEN-03 | P1 / `EXPOSED_PREEXISTING` | runner 被固定为并发 1，底层能力支持 1–4；批量发文被串行化，无法达到基础吞吐 | batch service、runner |
| GEN-04 | P1/P2 / `CROSS_COMPONENT_INTERACTION` | renderer 为每个选中客户并发拉取完整详情；详情读取会遍历并转换素材文件，批量选择会把大量正文带入 renderer | renderer feature、content/material store |
| GEN-05 | P2 / `CROSS_COMPONENT_INTERACTION` | 每个生成任务再次读取同一客户素材和研究，形成客户数 × 模板数的重复 I/O | batch service、generator、stores |
| GEN-06 | P1 / `EXPOSED_PREEXISTING` | 单篇生成请求和 UI 只有一篇文章语义，没有“本次任务生成几篇”的输入、进度和多结果合同；GEO 批量工作只能复制操作 | single-generation view、ai-content-service、generation IPC/bridge |
| LIEJU-01 | P1/P2 / `EXPOSED_PREEXISTING` | 普通投稿准备阶段对每篇文章重复做账号检查、城市目录和发布表单请求；批量投稿会放大远端请求和瞬时故障面 | regular preparation port、Lieju adapter |
| LIEJU-02 | P2 / `EXPOSED_PREEXISTING`（D4 已确认） | 远端已返回接受信息但本地会话保存失败时，当前结果被降级为 `uncertain`，已确认的远端身份可能丢失 | Lieju submit outcome、lifecycle contract |
| LIST-01 | P2 / `CROSS_COMPONENT_INTERACTION` | 提交中心多个分区使用 `Promise.all`，任一读取失败会阻断整页；大队列有全局 20000 截断但无 `hasMore` | submission-center snapshot、queue runtime |
| LIST-02 | P2 / `EXPOSED_PREEXISTING` | 普通队列分组接口无范围参数，应用层再按客户逐组读取文章，形成跨客户噪声和 N+1 I/O | regular queue application、IPC/preload |

## 4. 修复阶段与交付物

### Phase 0：合同和上限先行

- 以同一份合同定义素材/研究单次选择上限、批次任务上限和稳定错误码；首轮沿用 generator 已存在的 50 条来源限制，并让 UI、IPC、service 在预览阶段共同执行。
- 在构造任务数组前计算客户 × 模板（以及未来显式维度）的任务数；超限时返回预检错误，不创建大数组、不写入批次、不调用模型。
- 为单篇生成增加显式 `articleCount`（首版范围 1–100，默认 1），不能用重复点击或 renderer 循环伪造。D1 已确认：一次用户操作包含 N 个独立生成项，每个生成项调用 AI 生成一篇，成功一篇就保存一篇；不要求模型一次返回多篇，也不新增多文章边界解析器。复用既有生成任务能力表达操作关联与每篇唯一的任务身份，提供确定顺序和幂等查询语义，不另建一套执行状态机。
- 明确批次拆分是用户可见操作还是自动分块；如果没有产品决策，先采用可解释的“预检拒绝 + 建议缩小选择”行为。

交付物：合同变更、预检状态/错误码、单篇篇数选择和 identity 结果合同、边界测试（49/50/51、任务上限边界、空选择、篇数 0/1/上限/超限）。

### 执行顺序与工作包边界

Terra 必须按以下顺序串行推进；每个工作包完成自己的定向测试、Primary Audit、阻塞 finding 修复和 bounded re-audit 后，才能进入下一个工作包：

| 工作包 | 依赖 | 只负责 | 明确不负责 |
| --- | --- | --- | --- |
| P0 合同与预检 | 无 | `articleCount` 1–100/默认 1、来源各 50、批次任务上限 1000、错误码和预检 | 不实现 UI 视觉优化、Lieju 远端缓存 |
| P1A 单篇多篇生成 | P0 | 单篇页面选择 N、N 次独立调用、逐篇保存、父操作查询和 partial 状态 | 不改批量客户×模板调度、不改投稿适配器 |
| P1B 批量容量与并发 | P0 | 任务数预检、runner 并发 1–4（默认 2）、重启/幂等 | 不改单篇 UI、不改 Lieju 远端请求 |
| P1C 来源读取与 renderer 负载 | P1A、P1B | 在现有 service 内做 operation/batch-scope 内存复用、bounded hydration、重复 I/O 消除 | 不新增通用 cache manager、远端缓存或新的内容状态机 |
| P2 Lieju 准备复用 | P0 | queue-run 内账号/城市/表单准备复用及失效 | 不改变 accepted/uncertain 结果分类 |
| P3 投稿结果分类 | P2 | accepted 与会话保存诊断解耦，保留绑定事实 | 不重新设计账号绑定或投稿队列 |
| P4 跨客户提交中心 | P1C、P2 | 全局分页总览、客户筛选、部分失败隔离 | 不增加主题轴、订单/付费能力 |
| P5 集成验证与 closure | P1A–P4 | 最终 gate、Plan bounded closure evidence | 不自动执行真实登录或生产投稿 |

每个工作包的最小 gate：实现和对应行为测试在同一 integration HEAD；定向测试通过；Primary Audit 的 P0/P1 和直接影响正确性的 P2 已关闭；bounded re-audit 只覆盖该工作包 diff、直接调用方和受影响状态矩阵。P5 额外运行最终 renderer typecheck、项目 build/CI gate，并记录缺失的 Playwright 浏览器或真实外部验收。

### Phase 1A：单篇多篇生成

- 在单篇生成 UI 中提供篇数输入/选择器（1–100，默认 1）；开始前展示“本次将生成 N 篇”。执行 N 次独立 AI 调用，每次返回一篇；每篇生成成功后立即保存、展示并进入待投稿生命周期，不等待其他文章全部完成，生成期间显示进度。文章数量与同时运行的调用数分别控制，不将 N 直接作为并发度。
- 每篇使用独立文章 ID 和 task identity；多篇允许使用同一客户、资料和模板平台，不自动投稿。已保存文章不因其他项失败被删除或回滚；D3 已确认：失败项不自动重试，继续执行其他未开始项，最终标记 `partial`，用户可单独手动重试失败项。
- 同一操作的来源读取可复用现有快照能力，但每次独立 AI 请求仍需携带必要上下文；本次不新建远端会话或 prompt cache 服务，也不把本地读取复用宣称为输入 token 节省。
- 保持任务幂等、入队冻结和重启恢复语义不变。

交付物：单篇 UI、`ai-content-service`、IPC/bridge 合同和逐篇保存；篇数边界、逐篇成功/失败、重复调用和父操作查询测试。

### Phase 1B：批量任务容量与并发

- 在物化任务数组前计算客户 × 模板任务数；超过 1000 时返回稳定预检错误，不创建大数组、不写入批次、不调用模型。
- 将批量 runner 并发限制为 1–4，默认 2；批次状态和诊断中可观察实际并发。重复点击、重试、重启保持既有幂等和恢复语义。

交付物：batch service、runner 和批次合同调整；容量、并发、重启和重复调用回归测试。

### Phase 1C：来源读取与 renderer 负载

- 只在现有 batch service/worker 内建立只读来源快照或等价的 operation/batch-scope 内存复用；不新增独立 cache manager、持久化快照或跨批次缓存。复用范围仅限当前批次运行和恢复，不跨客户、平台或批次。worker 不得为每个任务重新遍历相同素材；读取失败要显式失败，不得静默使用空来源。
- renderer 只请求客户/来源的摘要和选择状态；完整素材在执行边界按需读取，且读取并发有上限。先采用已有 store/bridge 能力，只有在证据显示仍超时才增加分页或虚拟化。
- 单篇多篇调用的来源复用只针对本地读取，不宣称减少 AI 输入 token；不新建远端会话或 prompt cache 服务。

交付物：来源快照/读取 owner、renderer hydration 调整；fake store 重复读取计数、bounded concurrency 和大客户选择回归测试。

### Phase 2：列举网投稿准备复用

- 在现有 preparation service/adapter 的一个明确 queue-run/session 内存范围复用账号 fingerprint、城市目录和发布表单准备结果；首版不做跨 queue-run 的时间 TTL、持久化缓存或通用 cache manager。复用数据必须绑定平台、账号身份和表单版本，不能跨账号或跨目标复用。
- 只有在需要重新确认身份、表单漂移、表单版本变化或 queue-run 结束后才发起新的远端检查。准备失败应在 POST 前可解释地阻断；POST 已发出后的未知结果必须保留为 `uncertain`，不得自动重试。
- 增加 transport 计数和故障注入测试，证明批量文章不会按文章数线性重复做相同准备请求。

交付物：preparation port 合同、Lieju adapter 映射、缓存失效规则、批量准备测试。

### Phase 3：投稿结果分类

- 平台绑定（`accountProfileId`、`platformId`、`remoteFingerprint`）作为持久事实保留；将远端 accepted 的发布身份与本地会话/Cookie 保存诊断分开持久化/展示。会话保存失败不解除绑定、不降级当前 accepted，也不重新 POST；只在远端响应未知时进入人工核对。
- 同步更新生命周期规范、operational store schema/迁移（如确有必要）和 renderer 状态展示；不得用兼容 DTO 保留互斥的旧状态机。

交付物：结果合同、结果矩阵测试、迁移与回滚/repair 说明（若涉及 schema）。

### Phase 4：提交中心查询收敛（核心范围；在生成/投稿合同稳定后执行）

- 各分区独立返回成功、失败或部分结果；一个分区失败不能抹掉列举网队列的可用数据。
- 为队列读取增加明确分页/`hasMore` 或等价的可见截断合同；移除无范围的全量扫描和 N+1 逐客户读取。
- 默认范围为全局客户集合，并提供显式客户筛选、分页和排序；当前客户视图作为筛选快捷方式保留，不再是唯一入口。

交付物：IPC/preload 合同、queue application 查询、提交中心空态/错误态/部分失败测试。

### Phase 5：验证与 bounded re-audit

- 先运行受影响的定向行为测试，再运行 typecheck/build；修复只针对本计划 finding 和直接回归。
- Primary Audit → finding remediation → 只覆盖已知 finding、修复 diff 和直接调用方的 bounded re-audit；不因一般性重构重新开启全仓 fresh review。
- 真实列举网登录、发布、图片上传和生产账号验收仍需本次明确授权；在授权前只能使用合成数据和 fake transport。
- Terra 交付时必须在计划末尾记录每个工作包实际运行的命令、结果、integration HEAD 和 evidence 文件名；不得用旧 HEAD 的测试结果证明新代码。

## 5. 验收条件

以下条件全部满足，计划才能标记 `COMPLETE`；每项都必须由公开行为、持久事实或可观察 transport 结果证明。

### 5.1 文章生成

- 单篇生成页面可以选择篇数 N（1–100，默认 1）；输入 N 后，预览和执行均显示 N。正常成功且无重试时，fake AI transport 观测到恰好 N 次调用，每次返回一篇，最终持久化恰好 N 篇文章；文章 ID 和生成 task identity 各自唯一，全部绑定同一客户、来源、调研回答和模板。创建时间允许相同，不能用时间戳判断身份唯一性。输入 0 或 101 必须在调用 AI 前被拒绝。
- 使用 N=3 的受控响应验证：第一篇生成并保存后，即使其余调用尚未完成，第一篇也能通过文章查询读取且生命周期为待投稿；后续项失败不能回滚它。此验收不要求自动投稿。
- 多篇操作重复调用、刷新或重启不会再次创建已确认成功的文章；按父 operation identity 查询时能稳定返回已完成项及其顺序，不把“同一操作产生多篇”误报为 identity conflict。
- 多篇操作出现部分失败时，已成功文章保留且可投稿，失败项有稳定错误和手动重试入口；界面明确显示 partial/failed，不得显示为全部完成。
- 选择 51 条素材或研究时，预览与执行返回同一稳定错误码/提示；在拒绝路径没有模型调用、批次写入或大任务数组物化。
- 超过批次任务上限的组合在任务数组创建前被拒绝或按已确认的分块规则拆分；内存和耗时不随未执行的笛卡尔积增长。
- 配置并发为 1、2、4 时，runner 的实际最大并发分别不超过配置值，且批次状态可观察；重复点击、重试、重启不会产生重复文章或重复任务。
- 选择大量客户时，renderer 不加载所有客户的完整素材正文；来源读取受限于 batch scope 和 bounded concurrency，fake store 计数证明同一客户来源不会被每个模板重复读取。
- 生成失败、部分成功、恢复和空来源均有明确状态；不得以空 catch、静默空内容或固定成功值掩盖失败。

### 5.2 列举网投稿

- 同一 queue-run 中，相同账号/城市/表单准备只发生一次或按当前 queue-run 规则复用；缓存跨 queue-run、账号、平台和表单漂移时必定失效。
- 准备阶段的远端失败在 POST 前可解释地阻断；POST 已发出但结果未知时持久化 `uncertain`，不会自动重试或创建第二篇投稿。
- 远端已确认 accepted 的响应，其发布身份不因本地会话保存失败而丢失；平台绑定仍可查询，后续投稿在会话不可用时明确要求重新登录或人工处理，不得自动重试当前 POST。
- 账号绑定、目标冻结、普通平台无订单语义和人工核对路径的现有 acceptance 全部继续通过。

### 5.3 提交中心辅助查询

- 任一分区读取失败时，其他分区仍返回可用结果，并向用户显示失败分区和重试意图。
- 队列超过单页容量时，用户能看到 `hasMore`/分页或明确截断提示；不再把截断结果伪装成完整列表。
- 客户范围由 IPC 合同显式传递，查询次数不随客户数产生无界 N+1；全局范围是默认入口，客户筛选是显式收窄操作。

### 5.4 工程与证据

- 受影响定向测试、renderer typecheck 和项目规定的 build/CI gate 在最终 HEAD 上通过；源码、schema 或关键测试最后一次修改后必须重新运行相关命令。
- 当前审计已运行：49 个定向生成/提交测试通过；`npm run typecheck:renderer` 通过；renderer attention E2E 因本机缺少 Playwright Chromium 可执行文件未运行通过，不能作为完成证据。
- 未经本次明确授权，不运行真实列举网登录、投稿、图片上传、付费或生产数据操作；计划中必须保留未运行原因和后续授权边界。

## 6. 风险与停止条件

- 若当前规格、源码和 schema 对“accepted + session save failure”或全局提交范围存在实质冲突，先记录冲突并停止该子阶段，不建立第二套状态机。
- 若缓存导致账号身份、表单版本或远端结果不可证明，宁可回退到显式人工核对，也不能静默复用或自动重试。
- 若需要真实数据迁移、公开 IPC/schema 破坏性变化、真实账号或生产发布，必须先完成对应产品/操作授权；普通实现选择和定向测试失败不构成停止理由。

## 7. 完成记录模板

实施时在本计划末尾追加：改动文件与 owner、每个 finding 的修复状态、实际运行命令及结果、最终 bounded re-audit 结论、未运行验收及原因、剩余风险和 Git 状态。不得把未运行的浏览器 E2E 或真实投稿写成已通过。

## 8. 计划审计记录（2026-08-31）

### 8.1 阶段拆分审计

- **Phase 0 的位置和范围已收敛。** 来源各 50、单篇篇数 1–100、批次任务上限 1000 及稳定错误码均已确认；主题/多维度任务轴延期，不阻塞本计划。
- **原 Phase 1 已拆分为 1A/1B/1C。** 单篇多篇、批量容量并发、来源读取/renderer hydration 分属不同 owner，分别测试和 bounded re-audit。
- **Phase 2 边界已闭合。** 首版只在当前 queue-run 内复用，不做跨运行 TTL；账号、平台、表单版本或漂移变化即失效，POST 前失败仍阻断。
- **Phase 3 的结果合同已确认。** accepted 发布事实、平台绑定和会话保存诊断分开表达，不因会话保存失败降级当前结果。
- **Phase 4 保留在本计划且是核心范围。** 跨客户总览直接影响 GEO 大批量发文的可操作性；其 owner 限定在 queue reader、application、IPC/preload 和 renderer 查询，不扩大到新的投稿状态机。
- **Phase 5 合理。** 工作包依赖、最小 gate 和 evidence 记录要求已补充；Terra 执行时仍须把实际命令、integration HEAD 和 evidence 文件名写回计划。

### 8.2 验收条件审计

验收条件已收敛为 Terra 可执行的 gate；执行时只需将实际命令、结果和 evidence 绑定到对应工作包：

- 批次并发默认值已定为 2，范围 1–4；队列缓存首版为当前 queue-run 范围，不使用模糊 TTL。
- 调用语义已由 D1 关闭：N 次独立 AI 调用，每次一篇、成功即保存；不采用单次多篇响应。
- 成功项立即保留、失败后继续剩余项、失败项手动重试和 `partial` 状态均已由 D3 确认；中断恢复沿用既有批次恢复合同，不新增自动重试。
- 来源快照由 batch service/worker 侧 owner 创建，仅在当前批次运行和恢复期间有效；列举网准备缓存仅在当前 queue-run 内有效，POST 前准备失败仍阻断。
- 全局视图已由 D5 确认；必须通过显式范围、分页和排序合同实现，不能用逐客户循环在 UI 层拼接。

### 8.3 决策记录与延期项

| 决策编号 | 需要确认的内容 | 影响范围 |
| --- | --- | --- |
| D1 | **已确认**：一次用户操作执行 N 次独立 AI 调用，每次生成一篇；成功一篇就独立保存一篇。替代此前“一次请求返回 N 篇”的讨论方案 | `articleCount` API、单篇输出、成本、部分失败、幂等 |
| D2 | **已确认：N 范围 1–100，默认 1**；100 是一次用户操作的总篇数上限，不是并发数 | UI、IPC 合同、资源预算、验收边界 |
| D3 | **已确认**：成功项立即保存；继续其他未开始项；失败项不自动重试，最终为 `partial`，可单独手动重试 | 持久化、结果展示、重试安全 |
| D4 | **已确认**：平台绑定持久保存；远端 accepted 保留发布身份；会话/Cookie 保存失败单独诊断，不解除绑定、不降级 accepted、不重试 POST | 生命周期规范、schema、结果分类 |
| D5 | **已确认**：保留 Phase 4；提供跨客户全局分页总览、按客户筛选、排序和部分失败展示 | Phase 4 范围、IPC 查询合同 |
| D6 | **已确认**：素材最多 50 条、调研回答最多 50 条；超限在调用 AI 前统一拒绝，不新增来源压缩/分块系统 | Phase 0 预检、批量可用规模 |

D1–D6 已关闭；主题/多维度任务轴已延期且不阻塞本计划。计划状态为 `READY`，Terra 可按工作包顺序开始实现。

## 9. 过度设计与门禁复审（2026-08-31）

### 9.1 应保留的最小门禁

以下规则直接保护数据一致性、成本或不可逆远端副作用，不能因为是内部工具而删除：

- 文章和生成项的唯一身份、重复调用幂等、成功项立即保存以及 `partial` 事实。
- 列举网平台绑定与远端 fingerprint 一致性；绑定是业务事实，不是额外的安全产品。
- POST 前账号/表单准备失败要阻断；POST 后远端结果未知不得自动重试。
- 已确认 accepted 的发布身份不得因本地会话保存失败而丢失；Cookie/session 诊断与当前发布结果分开。
- 日志、renderer payload 和诊断不得泄露 Cookie、Token、API Key 或文章正文之外的敏感凭据。
- 真实登录、投稿、图片上传和生产数据操作仍需明确授权；这是防止误操作的执行边界，不是运行时增加的用户审批流程。

### 9.2 已明确删除或后置的复杂度

- 不实现一次 AI 请求返回多篇的边界解析器；单篇 N 篇采用 N 次独立调用。
- 不新增 prompt cache、远端会话服务、通用 cache manager、跨 queue-run TTL 缓存、持久化快照、来源压缩/分块系统或新的持久化状态机。
- renderer 分页/虚拟化只有在已有 bounded hydration 仍被证据证明过载时才追加，不作为首轮必做项。
- 不设置未经测量的吞吐、内存或延迟硬 SLA；先用任务上限、并发上限、请求计数和无界 fan-out 回归证明可维护性。
- 不把主题/多维度任务轴、付费/订单、角色权限和全面安全审计纳入本计划。

### 9.3 对 Terra 的执行约束

Terra 不得因为“内部工具”而删除上述最小门禁，也不得因为“安全审计”而新增未在本计划列出的权限、加密、审批或合规系统。每个工作包只做其 owner 和验收条件要求的改动；非阻塞的安全/性能建议登记为后续事项，不阻断本计划 closure。

## 10. 执行记录（2026-08-31）

> 进度校正：P1B、P1C 已完成；P2 已完成。以下实时验收补充记录以本节最新条目为准。

### 实时 Lieju 验收补充

- 东爵客户位于工作区 `F:\测试\2`，绑定 Lieju 账号档案 `account-dbadbe38-900e-4677-afb5-56bf1add16b9`（显示名 yoyo），投稿资料城市为焦作。
- HTTP 预检首次因登录态缺失返回 `LOGIN_REQUIRED`；用户完成登录后再次执行，单篇文章 `2dcbf76e-9cf9-4aaf-b313-eee2395be681` 获远端 `accepted`，远端编号 `109757228`，地址 `https://jz.lieju.com/qitashenghuofuwu/109757228.html`。
- 城市目录受 WAF 页面影响时，适配器已按合同回退北京（`beijing_fallback`）；本次预检与真实投稿均未自动重试。
- 真实调用为直接 HTTP 验收，未经过本地队列 admission，因此 `operations.db` 未生成该次投稿记录；未擅自补写本地事实，后续 P3/P5 需通过正式队列链路验证远端 accepted 与本地持久化解耦。

### P0 合同与预检

- 状态：`COMPLETE`（实现与定向测试已完成，待后续工作包集成）。
- 改动：批量来源素材/调研选择统一限制为 50；未显式选择时若可用来源超过 50 也返回 `GENERATION_SOURCE_LIMIT`；客户×模板任务数在任务数组物化前检查 1000 上限并返回 `GENERATION_TASK_LIMIT`；单篇 IPC 合同增加 `articleCount`（1–100，默认 1），服务边界拒绝 0/101 等非法值。
- 验证：`node --test --test-concurrency=1 tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/phase-06-generation-typed-ipc.test.js`（29/29 通过）；此前生成器/AI 服务定向集合（59/59）通过。
- 未运行：尚未进入 P1A；真实 AI、登录、投稿和浏览器 E2E 仍按计划禁止/待授权。

### P1A 单篇多篇生成

- 状态：`COMPLETE`（核心生成/保存、IPC 投影、父操作幂等及重启后子项复用已接通；进度以运行中总篇数和最终聚合结果展示）。
- 改动：`articleCount` 触发顺序独立生成；每篇使用父操作派生的唯一 operation identity，成功即保存；失败项记录索引和稳定错误码并继续后续项；IPC 返回完成/部分/失败聚合结果；单篇 UI 增加 1–100 篇输入与结果提示。
- 验证：`node --test --test-concurrency=1 tests/ai-content-service.test.js tests/ai-content-ipc.test.js tests/phase-06-content-core-typed-ipc.test.js`（41/41 通过）；`npm run typecheck:renderer` 通过。
- 未运行：真实 AI 调用、浏览器 E2E 与真实投稿仍未授权；P1B 已开始。

### P1B 批量容量与并发

- 状态：`IN_PROGRESS`。
- 已开始：批次合同增加并发参数（1–4），默认 2；批次服务预检、持久化和运行状态开始传递并发配置。
- 验证：`content-generation-batch-service`、`content-generation-batch-ipc`、`generation-batch-runner` 共 36/36 通过。
- 已完成：按批次实际配置选择 runner 并发；runner 状态快照反映实际并发。
- 并发 1/2/4 状态矩阵和重复启动回归已补齐；runner 重启恢复测试沿用既有故障注入覆盖。
- 状态：`COMPLETE`。
- 最新验证：`node --test --test-concurrency=1 tests/content-generation-batch-service.test.js tests/generation-batch-runner.test.js tests/content-generation-batch-ipc.test.js`（36/36）；新增服务并发矩阵后 `content-generation-batch-service`（16/16）；`npm run typecheck:bridge` 通过。

### P1C 来源读取与 renderer 负载

- 状态：`IN_PROGRESS`。
- 已开始：batch run 范围内按客户/来源 identity 复用素材和调研读取 Promise；运行结束或异常时清理，不跨批次持久化。
- 多模板重复读取计数回归已通过；`npm run build:renderer` 构建通过。
- renderer hydration 已切换到本机 Microsoft Edge 并通过；P1C 定向 renderer 行为与 hydration 证据已闭合，状态：`COMPLETE`。
- 验证：`node --test --test-concurrency=1 tests/renderer-batch-generation-client-hydration.test.js`（1/1，Edge）；`node --test --test-concurrency=1 tests/renderer-batch-generation.test.js tests/renderer-generation-batch-navigation.test.js`（8/8）；`npm run typecheck:renderer` 通过。

### P2 Lieju 准备复用

- 状态：`COMPLETE`（本地实现与合成 transport 验证完成；真实外部验收待单独授权）。
- 已开始：准备 port 增加 queue-run 生命周期边界；同一运行内按平台/账号复用首次账号检查结果，运行结束清理，扩展方法设为非枚举以保持既有 executor 合同。
- 验证：`tests/article-lifecycle-ticket-08.test.js`（36/36）；新增 queue-run transport 计数与结束后失效回归。
- 已开始：Lieju HTTP 准备按 queue-run token + 城市缓存解析后的表单，避免同一运行内重复城市目录/表单 GET；不同 token 自动失效。
- 已完成：账号检查复用、HTTP 城市/表单准备复用、queue-run 间失效与表单版本键；浏览器 transport 仍只做 fake 验证。
- Lieju transport policy 回归：`tests/lieju-transport-policy.test.js`（13/13）通过；HTTP/浏览器分流及未知结果不重试保持不变。
- 表单准备缓存键已纳入显式 `preparationFormVersion`；版本变化不会命中旧表单缓存。缺少版本时保持当前 adapter 默认行为，仍需后续真实平台证据确认版本字段来源。
- 未运行：真实列举网登录、发布、图片上传及生产账号表单版本验证；原因是本计划和项目规则要求本次明确外部操作授权。

### P3 投稿结果分类

- 状态：`COMPLETE`（远端 accepted 与本地会话保存诊断已解耦；未改账号绑定或队列状态机）。
- 改动：`auto—publish/src/platforms/lieju/adapter.js` 的 HTTP 提交能力始终依据已收到的远端响应分类结果；会话状态保存失败仅保留 `LIEJU_HTTP_STATE_SAVE_FAILED` 诊断，不再把已确认的远端身份降级为 `uncertain`，也不触发第二次 POST。
- 回归测试：`auto—publish/tests/lieju-transport-policy.test.js` 新增会话保存失败场景，验证 accepted、remoteId、remoteUrl 保留且 POST 次数为 1。
- 验证：`node --test --test-concurrency=1 tests/article-lifecycle-ticket-08.test.js tests/lieju-transport-policy.test.js`（50/50 通过）；`npm run typecheck:bridge` 通过。
- 未运行：真实列举网登录、发布、图片上传和生产账号验收；按本计划和项目规则仍需本次明确外部授权。

### P4 跨客户提交中心

- 已完成服务/合同底座：查询客户范围改为可选（省略即全局），增加 `page`、`pageSize`、`hasMore` 和分区 `failures`；三个分区使用 `Promise.allSettled`，单区失败不再抹掉其他可用数据。
- `regular-queue-application` 的既有无客户范围读取被提交中心复用，避免 UI 层逐客户拼接队列。
- 已补测试：全局分页、`hasMore`、普通队列分区失败隔离；提交中心定向测试 8/8，`npm run typecheck:bridge` 通过。
- 状态：`COMPLETE`。Renderer 已提供全局默认入口、客户筛选、分页按钮、`hasMore` 与分区失败提示；提交中心 feature 支持 scope 切换和页码查询。
- 本轮补充：renderer 已展示分区失败提示与 `hasMore` 分页提示；提交中心 feature 接受全局 `clientId: null` 响应，桥接类型支持可选客户与分页参数。
- 继续推进：提交中心 renderer scope 默认改为全局（未选客户时请求 `{}`），仍兼容显式客户 scope；App 已切换到全局入口，保留文章库当前客户用于文章操作上下文。

### P5 集成验证与 closure

- 状态：`COMPLETE`。最终 integration state 是基于 `e2e87bbb0875d9a1dbdf9df514b210dd3df0d8dd` 的 dirty working tree；用户未授权 commit，因此没有把未提交改动伪装成 clean-HEAD evidence。
- 用户确认列举网已经可以 HTTP 发文后，默认 `auto` 投稿路径已收敛为 HTTP-only：HTTP 账号核验或表单准备失败均在 POST 前阻断，不再自动启动 Playwright 或 fallback 到浏览器投稿。显式 `playwright_only` 能力只保留给用户主动登录/保存 Cookie 和现有隔离测试，不属于默认队列投稿 transport。
- P3 结果合同保持闭合：远端响应已明确 accepted 时，即使 Cookie/session 保存失败，仍保留 `accepted`、`remoteId` 和 `remoteUrl`；本地保存失败只作为安全诊断，重复调用不会发出第二次 POST。远端结果未知仍为 `uncertain`，不得自动重试。
- P4 集成修复：attention 与提交中心支持 workspace-only 全局 scope，默认跨客户查询不再错误绑定当前文章客户；显式客户筛选仍可收窄范围。
- Primary Audit 阻塞项已关闭：HTTP 准备失败自动浏览器 fallback、accepted 被本地 session 保存失败降级、全局 attention 错绑客户均已修复。Bounded re-audit 只检查这些 finding、修复 diff、直接调用方和回归；未发现新的 P0/P1 或直接阻塞 P2。
- P5 直接回归修复：同步当前 renderer fixture 的 `getClientDetails` / `listResearchMetadata` 合同；为队列幂等 fixture 显式设置零投稿间隔；将 legacy IPC absence 静态检查改为精确 channel 字面量，避免 `content:get-client` 误匹配 `content:get-client-details`；队列公开能力清单纳入已实现的投稿间隔更新方法。

最终验证（2026-09-01）：

- `node --test tests/phase-06-dead-content-ipc.test.js tests/phase-07-regular-queue.test.js`：18/18 通过。
- Lieju HTTP-only、结果分类及队列定向集合：69/69 通过；attention/submission feature：9/9 通过；content/queue bounded 回归：52/52 通过；renderer history/question/responsive/queue：67/67 通过；attention E2E：1/1 通过。
- `npm run test:desktop-core`：收集 273 个测试文件，1943 tests，1942 passed，0 failed，2 skipped，runner lifecycle `CLOSED`；evidence 为 `auto—publish/build/evidence/root-test-timings.json`。跳过项是既有显式环境测试，不影响本计划验收。
- `npm run typecheck:renderer`：通过。
- `npm run typecheck:bridge`：通过。
- `npm run build:renderer`：通过；仅保留 Vite chunk-size warning。
- `git diff --check`：无 whitespace error，仅有工作区 CRLF 转换 warning。

未运行与剩余边界：

- 本轮没有执行真实列举网登录、真实投稿、图片上传、付费或生产数据操作；用户的 HTTP 能力说明用于确定 transport 产品方向，不构成新的真实外部操作授权。
- 完整门禁在 workspace 生命周期测试中仍可看到“Browser 'lieju' is not open”的冷启动探测 stderr，但对应测试通过，且默认投稿不会因此启动 Playwright。该诊断不代表浏览器投稿被执行。
- 工作树包含本计划及用户已有的大量未提交改动和未跟踪文件；均未回退、未 stage、未 commit。
