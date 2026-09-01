# 内容生产链路整改与优化计划

状态：`COMPLETE`
当前阶段：`Phase 6 — 集成验证与 bounded re-audit`（`COMPLETE`）
范围 owner：内容生产（客户资料、问题与调研、单篇生成、生成批次、文章创建）
停止边界：文章成功进入文章库后停止；投稿、发布、付费、订单和需处理事项不在本计划实施范围内。

## 1. 文档职责

本计划是内容生产整改的唯一持续执行入口，负责阶段顺序、范围、gate、进度、发现、决策和验证 evidence。它不替代：

- `AGENTS.md` 的长期工程规则；
- `CONTEXT.md` 的业务术语；
- `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` 的用户可观察产品行为；
- 当前源码、测试、schema、脚本和 Git 状态所表达的实时事实。

后续每次只执行一个阶段。阶段完成后先写回本计划的 Progress、Discoveries、Decision Log、验证结果和剩余风险，再进入下一阶段。不得因为局部修复顺手扩大到投稿链路或历史计划。

## 2. 整体目标与完成定义

目标是保留当前健康的生成与持久化底座，同时关闭以下真实问题：

1. 单篇生成未纳入内容库 runtime 生命周期，切换或退出时可能形成结果不确定和重复生成风险；
2. 批量“暂停/停止”和“继续/新建”语义重叠，失败批次缺少可达的结束出口；
3. 普通文章编辑可能把来源身份改写为与生成快照不一致的值；
4. Renderer content workbench 反向聚合文章管理、投稿入口和付费执行；
5. 常用刷新路径全量读取并跨 IPC 传输所有客户的资料和调研正文。

计划完成必须同时满足：

- 单篇和批量生成的活动任务、暂停、恢复、结束与失败语义对用户清楚；
- 同一生成操作在响应丢失、重复调用或 runtime 切换下不会盲目重复创建文章；
- 文章来源快照是唯一权威事实，普通正文编辑不改写生成来源；
- 内容生产 Renderer 不再依赖付费执行或投稿 admission 才能加载和刷新；
- 初始内容生产 hydration 不随整个内容库正文总量线性跨 IPC 传输；
- 单篇和批量仍共用现有 `article-generator`、文章 mutation owner 和文章 store；
- 生成成功只创建文章，不创建投稿、订单、活动目标或发布事实；
- blocking findings 关闭，最终验证绑定最终代码和 clean Git evidence。

## 3. 长期不变量

实施所有阶段时必须保持：

- 完整文章生成成功后立即保存并进入文章库，不增加“待审核/批量审核”路线。
- `article-generator` 负责按确定输入形成文章与来源快照；文章 mutation/content store 负责正式落库。
- 生成批次仍拥有持久任务身份、崩溃恢复和按 `generationTaskId` 去重修复能力。
- 文章来源快照记录一篇文章实际使用的客户资料、GEO 调研回答和模板版本；它不等于冻结整个生成批次。
- 暂停只阻止继续领取新任务；已经发送给供应商的请求不得伪装为从未发生。
- 取消生成任务只针对尚未开始的任务，取消后不得继续或失败重试；不得用“停止生成”代替取消。
- 内容生产不拥有投稿队列、付费批次、订单、活动目标、发布档案或需处理事项。
- 不为兼容无真实消费者的旧 `stop` 路线保留 wrapper、alias 或第二套状态机。
- 不通过 UI、IPC 临时字段、缓存或第二个 store 建立新的文章/任务事实 owner。

## 4. 最小阅读集

每个阶段开始前先读：

1. 根 `README.md`、`docs/AI-ENTRY.md`、`docs/WORK-INDEX.md`；
2. 本计划的当前阶段、Progress、Discoveries、Decision Log；
3. `CONTEXT.md` 中“生成任务、文章来源快照、生成批次、取消生成任务”；
4. `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` §2.2、§3.1、§9.1 和验收项 1–2；
5. 当前阶段列出的 owner、直接调用方和定向测试。

默认不读其他 Wave、Ticket、handoff 或 archive。只有发生真源冲突或当前阶段明确引用时才扩展。

## 5. 阶段总览

| 阶段 | 优先级 | 状态 | Gate |
| --- | --- | --- | --- |
| Phase 0：基线与状态矩阵 | Gate | `COMPLETE` | 用公开行为测试锁定整改前风险与必须保持的不变量 |
| Phase 1：单篇生成 runtime 生命周期 | P1 | `COMPLETE` | 切换、退出、重复请求和响应丢失不产生盲目重复文章 |
| Phase 2：批量任务产品状态机收敛 | P1 | `COMPLETE` | 暂停语义唯一，失败批次可明确结束并新建 |
| Phase 3：文章来源事实收敛 | P2 | `COMPLETE` | 普通编辑不能改写生成来源身份或快照 |
| Phase 4：Renderer 内容生产边界拆分 | P2 | `COMPLETE` | 内容生产加载和刷新不依赖投稿/付费 feature |
| Phase 5：内容来源读模型瘦身 | P2 | `COMPLETE` | 初始 hydration 只传 metadata/readiness，正文按需加载 |
| Phase 6：集成验证与 bounded re-audit | Gate | `COMPLETE` | 所有 blocking finding 关闭，最终代码和 evidence 一致 |

阶段必须顺序执行。Phase 4 先于 Phase 5，以免在混合 workbench 上继续扩展错误的读模型边界。

## 6. Phase 0 — 基线与状态矩阵

### 目标

在修改生产代码前，用公开 service/IPC/feature 行为建立可证伪基线，明确 Phase 1–3 的状态转换和必须保持的文章落库不变量。

### 边界

- 只新增或调整测试、fixture 和必要的测试 transport；不修改生产行为。
- 不通过读取源码字符串、私有函数名或文件布局证明业务正确。
- 不执行真实 AI、豆包登录、发布、付费或生产数据操作。
- 不提前设计 Renderer 拆分或读模型新接口。

### 必须建立的状态矩阵

- 单篇：请求未开始、远端处理中、文章已保存但 IPC 响应未交付、明确失败、runtime dispose、重复 operation identity。
- 批量：running → paused → continue；failed → retry；failed → 明确结束；pending → cancelled；重启后的 interrupted。
- 来源：生成后只编辑标题/正文；当前资料增删；当前模板隐藏/删除；保存后快照与来源身份一致。

### 最小验证

先把三个已知问题分别整理为下一阶段可直接实现的公开行为回归用例；可以使用一次性 probe 确认其当前可复现，但 Phase 0 不把预期失败测试留在分支上。随后在 `auto—publish/` 下至少运行并记录：

```powershell
node --test tests/ai-content-service.test.js tests/article-generator.test.js tests/generation-batch-runner.test.js tests/generation-batch-store.test.js tests/content-generation-batch-service.test.js tests/renderer-content-generation.test.js tests/renderer-batch-generation.test.js tests/workspace-bootstrap-service.test.js tests/workspace-runtime-lifecycle.test.js
```

Gate：“单篇 runtime 缺口、失败批次无结束出口、普通编辑来源错配”均已有可复现步骤和待实现的公开行为断言；提交到分支的基线测试全部通过。每个后续修复阶段在修改生产代码前，先把对应断言落成 red regression test，再完成到 green，不降低断言换取绿灯。

## 7. Phase 1 — 单篇生成 runtime 生命周期

### 目标

建立单篇生成的唯一 workspace-scoped operation owner。每次生成拥有稳定请求身份；内容库切换、runtime dispose、IPC 响应丢失和重复提交时，系统能够区分正在执行、明确失败、已保存和结果不确定，不盲目再次调用 AI 或创建第二篇正式文章。

### 实现方向

- 在 application/service 层登记活动单篇生成；Renderer 只展示 operation read model，不自行推断最终状态。
- 生成开始前创建稳定 `generationOperationId`（最终字段名在实现时按现有术语确定），文章创建时绑定该身份。
- 复用文章 store/mutation owner 的 identity 查询或索引；不得为单篇文章建立第二个内容 store。
- workspace busy state 必须读取该 operation owner；有活动请求时禁止切换内容库。
- runtime dispose 必须显式处理活动请求。若远端调用已经发出且无法确认结果，不把它当作普通失败并自动重试。
- 相同 operation identity 的重复提交返回既有文章或既有结果；只有用户明确开始一次新的生成操作才分配新身份。

### 边界

- 只处理单篇文章生成，不重写批量 runner/store。
- 不把单篇生成伪装成一条批量任务，也不复制批量状态机全部字段。
- 不增加自动重试、后台轮询或通用 workflow 框架。
- 不改变 AI provider 的业务接口，除非为 AbortSignal/稳定请求 metadata 做最小必要扩展。
- 不修改投稿、订单或文章库分类规则。

### 最小验证

- 单篇生成进行中请求切换内容库，返回稳定 busy outcome，旧内容库不被静默切走。
- 文章已保存但 IPC 响应丢失后，以同一 operation identity 重试不会再次调用 AI，也不会创建第二篇文章。
- dispose 发生在 provider 返回前、返回后但落库前、落库后但响应前，均有明确可观察结果。
- 两个不同 operation identity 可以按用户明确意图各生成一篇文章。
- `tests/ai-content-service.test.js`、`tests/ai-content-ipc.test.js`、`tests/workspace-bootstrap-service.test.js`、`tests/workspace-runtime-lifecycle.test.js` 通过。
- `npm run typecheck:main` 与 `npm run typecheck:renderer` 通过。

Gate：单篇活动任务已被 workspace/runtime owner 观察；响应丢失路径有稳定 identity 去重证据；没有新增第二套文章 writer。

## 8. Phase 2 — 批量任务产品状态机收敛

### 目标

让用户只面对有独立业务价值的状态和动作：暂停/继续、重试失败、取消未开始任务、明确结束当前批次。删除当前“暂停”和“停止”执行相同转换的伪双语义，并让永久失败批次可以保留证据后退出监控、新建批次。

### 实现方向

- `pause` 成为唯一的可恢复中断动作；持久状态和 UI 文案统一表达“已暂停”。
- 删除无独立消费者的 `stop` UI、bridge、preload、IPC、service 和 runner 路径；不保留长期 alias。
- 增加明确的“结束当前批次”转换。推荐使用具有独立业务含义的 terminal batch outcome（例如 `abandoned`），而不是让 `stopped` 同时表示终态和可恢复态。
- 结束批次时保留成功文章、失败 task/error 和批次审计信息；尚未开始的任务转为取消，不删除批次文件。
- runtime snapshot 不再把已明确结束的批次选为当前可恢复批次；Renderer 可以进入新批次向导。
- 若持久状态集合发生变化，正式更新 serialization、迁移/兼容读取、typed IPC 和产品规格；旧状态只做一次性归一，不维持双路线。

### 边界

- 不改变批量任务固定并发 1。
- 不自动重试失败或 interrupted task。
- 不取消或伪造已经发给供应商的请求结果。
- 不删除批次、文章或失败证据。
- 不扩展到豆包采集批次、普通投稿队列或付费批次的状态机。

### 最小验证

- running → pause 后不领取新任务；在途任务按真实结果或 interrupted 规则落位。
- paused → continue 只执行可恢复任务，已成功 task 不重复调用 AI。
- failed 批次可选择 retry，也可明确结束；结束后重启仍可进入新批次向导。
- 取消未开始任务后，这些 task 不参与 continue/retry。
- 结束批次不会删除已成功文章或失败 error evidence。
- `tests/generation-batch-runner.test.js`、`tests/generation-batch-store.test.js`、`tests/content-generation-batch-service.test.js`、`tests/content-generation-batch-ipc.test.js`、`tests/renderer-batch-generation.test.js`、`tests/renderer-generation-batch-navigation.test.js` 通过。

Gate：代码、类型、fixture、测试和 UI 中不存在无真实消费者的“停止生成”路线；失败批次不再形成 UI 死路。

## 9. Phase 3 — 文章来源事实收敛

### 目标

明确 `materialSnapshots`、`researchSnapshots` 和 `templateSnapshot` 是文章实际生成来源的权威事实。普通文章编辑只能修改正文类字段，不得根据当前客户资料、当前模板目录或生成表单选择改写历史来源。

### 实现方向

- 生成时把必要的来源 identity 与快照一次性写入文章；若 `materialIds` 仍是必要索引，必须由实际快照派生并与快照一起冻结。
- 普通保存只提交标题、正文和明确允许的编辑字段；不得附带当前生成表单的 `materialIds` 或重新解析后的 `templateId`。
- 打开历史文章时，来源展示使用文章快照，不回退成“当前客户全部有效资料”。
- 更换资料或模板属于新的“重新生成”操作，不借普通保存修改 provenance。
- serialization/typed IPC 必须拒绝或归一互相矛盾的来源表达，不能静默持久化两套 owner。

### 边界

- 不改变文章正文编辑、CAS fingerprint、冻结权限和文章库分类。
- 不重新读取当前资料来改写历史快照。
- 不删除已有历史文章的快照；旧文章缺少字段时只做安全、可解释的读取归一。
- 不为测试暴露新的生产 API。

### 最小验证

- 仅用 1/3 份资料生成，当前客户后来增加/删除资料，再编辑正文，保存后来源仍是原 1 份快照。
- 模板被隐藏、删除或同名替换后，编辑正文不会改变文章的模板 identity/snapshot。
- 普通保存输入不包含用户未编辑的来源字段。
- 冲突保存和 result-uncertain 保存仍保持原有 CAS 行为。
- `tests/article-generator.test.js`、`tests/ai-content-service.test.js`、`tests/article-store.test.js`、`tests/article-editor-session.test.js`、`tests/renderer-content-generation.test.js` 通过。

Gate：一篇文章的历史来源只有一个权威 writer；普通编辑无法制造 identity 与 snapshot 矛盾。

## 10. Phase 4 — Renderer 内容生产边界拆分

### 目标

将 Renderer/application 组合层拆成内容生产与文章库两个浅组合边界。内容生产页面只依赖客户资料、问题、调研和生成能力；文章落库后通过 invalidation/read-model 边界通知文章库，不拥有投稿、付费或文章移除命令。

### 实现方向

- 保留可共享的 `contentSources` read model，但分别组合 production feature 和 library/management feature。
- 从 production feature 的 adapters、snapshot 和 commands 中移除 regular admission、paid media execution、article removal 等下游能力。
- `App.tsx`/context 分别装配两个 feature；共享 workspace identity 和最小 invalidation，不共享业务状态机。
- 内容生产刷新失败与付费批次、投稿 read model 失败相互隔离。
- 删除迁移后无消费者的旧聚合导出，不增加 compatibility wrapper。

### 边界

- 不移动后端文章、投稿或付费事实 owner。
- 不重写页面视觉布局，不顺手重构所有 content component。
- 不复制客户资料 store 或建立第二份 Renderer 客户状态。
- 不在本阶段优化正文 payload；只建立 Phase 5 所需的正确 seam。

### 最小验证

- 内容生产初始加载和手动刷新不会调用付费批次或投稿 admission adapter。
- 付费/投稿 read model 明确失败时，问题采集和文章生成仍可加载、操作和显示错误。
- 文章生成成功后，文章库按既有 invalidation 看到新文章。
- workspace/client scope 切换的 stale result 防护继续生效。
- `tests/content-workbench-regression.test.js`、`tests/phase-06-content-workbench-feature.test.mjs`、`tests/phase-06-content-feature.test.mjs`、`tests/renderer-content-generation.test.js` 通过。
- `npm run typecheck:renderer` 通过。

Gate：内容生产 feature 的公开依赖中不再出现投稿、付费、订单或文章移除命令；文章库与生产仍共享唯一文章 owner。

## 11. Phase 5 — 内容来源读模型瘦身

### 目标

让常用初始刷新只读取客户、资料和调研的 metadata/readiness/revision；资料正文和回答正文仅在当前客户展示、用户展开/选择或服务端实际生成时按需读取。避免全内容库正文随每次刷新跨 IPC 传输。

### 实现方向

- workspace client index 只返回客户和资料 metadata，不返回完整 `content`。
- research index 只返回 readiness、数量、更新时间/revision 等生成向导需要的信息。
- 复用或收敛为明确的 current-client details 查询；批量向导只为实际勾选客户读取必要详情。
- 批量 `preview/start` 继续由 service 直接读取 owner 并重新校验，Renderer preview 不成为事实来源。
- mutation 后按 revision/invalidation 刷新受影响客户，不再无条件对所有客户执行 `listResearch`。
- 迁移所有消费者后删除旧全量合同；不长期并存 full/summary 两条公共路线。

### 边界

- 不建立复杂缓存、LRU、后台预取或数据库索引，除非基准证明必要。
- 不提高批量 AI 并发。
- 不让 Renderer 自行计算最终可执行性替代 service 预检。
- 不改变客户资料的文件夹真源。

### 最小验证

- 初始 production hydration 的客户列表 payload 不含资料 `content`，且不会对每个客户调用完整 `listResearch`。
- 选择一个客户只读取该客户详情；批量选择 N 个客户只加载所需 N 个客户，不加载未选择客户正文。
- 单个问题/回答 mutation 后不会触发全客户正文重读。
- 使用合成多客户、多大正文 fixture，验证初始 payload 大小与正文总量解耦，并以调用次数断言避免 N+1 回归。
- 单篇和批量生成仍按实际选择形成相同 prompt 与来源快照。
- `tests/client-material-store.test.js`、`tests/research-store.test.js`、`tests/question-store.test.js`、`tests/template-store.test.js`、相关 IPC/Renderer feature 测试通过。
- `npm run typecheck:main`、`npm run typecheck:renderer` 通过。

Gate：常用初始刷新不再全量传输正文；没有用复杂缓存换取表面性能；服务端预检仍是可执行性 owner。

## 12. Phase 6 — 集成验证与 bounded re-audit

### 目标

对 Phase 1–5 的最终代码做一次有边界的集成验证和复审，确认已知 findings 关闭、核心不变量未回归，并绑定最终 clean HEAD evidence。

### 边界

- 只复审已知 findings、修复 diff、受影响不变量、直接调用方和直接回归。
- 只有公开合同、持久 schema、事实 owner、事务/副作用边界发生变化，或发现新的 P0/P1，才扩大范围。
- 不重新开启无边界的全仓 fresh review。
- 不执行真实账号、AI 费用、发布、付费或生产迁移操作。

### 最小验证

在 `auto—publish/` 下至少执行：

```powershell
npm run typecheck:main
npm run typecheck:renderer
node --test tests/article-generator.test.js tests/ai-content-service.test.js tests/ai-content-ipc.test.js tests/article-store.test.js tests/article-editor-session.test.js tests/generation-batch-runner.test.js tests/generation-batch-store.test.js tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/generation-snapshot-event.test.js tests/renderer-content-generation.test.js tests/renderer-batch-generation.test.js tests/renderer-generation-batch-navigation.test.js tests/content-workbench-regression.test.js tests/phase-06-content-workbench-feature.test.mjs tests/phase-06-content-feature.test.mjs tests/workspace-bootstrap-service.test.js tests/workspace-runtime-lifecycle.test.js
git status --short --branch
```

若 production source、schema、关键测试或构建 gate 在最终验证后再次变化，必须重跑受影响 gate。

Gate：无 P0/P1；阻塞性 P2 关闭；最终代码、测试结果、计划记录和 Git 状态一致。非阻塞优化只能登记明确未来 owner，不继续扩大本计划。

## 13. Progress

| 日期 | 阶段 | 状态 | 结果 |
| --- | --- | --- | --- |
| 2026-08-20 | 独立端到端审计 | `COMPLETE` | 核心生成/持久化底座健康；确认 3 个 P1 与 3 个 P2，未修改生产代码 |
| 2026-08-20 | 建立整改计划 | `COMPLETE` | 建立 Phase 0–6 顺序、边界与最小验证；等待从 Phase 0 开始实施 |
| 2026-08-20 | Phase 0：基线与状态矩阵 | `COMPLETE` | 定向公开行为基线 120/120 通过；记录三个可复现风险及 Phase 1–3 的回归断言入口 |
| 2026-08-20 | Phase 1：单篇生成 runtime 生命周期 | `COMPLETE` | 新增 workspace-scoped operation identity、持久索引去重、dispose 不确定结果和切换 busy gate；定向测试与主/Renderer 类型检查通过 |
| 2026-08-20 | Phase 2：批量任务产品状态机收敛 | `COMPLETE` | pause 成为唯一可恢复中断动作；旧 stopping/stopped 读取归一为 paused；新增 abandoned 终态，结束时保留成功/失败/中断证据并取消 pending；删除 generation stop 的 IPC、preload、bridge、feature 与 UI 路线；定向测试、typed IPC、Renderer build、主/Renderer 类型检查通过 |
| 2026-08-20 | Phase 3：文章来源事实收敛 | `COMPLETE` | 文章 mutation owner 的普通保存仅接受标题/正文；过时或矛盾的 material/research/template identity 与 snapshots 不再覆盖生成时 provenance；新增来源漂移回归测试；83 个 Phase 3 定向测试、主进程与 Renderer 类型检查通过 |
| 2026-08-20 | Phase 4：Renderer 内容生产边界拆分 | `COMPLETE` | 新增 production/library 两个非拥有式 Renderer 边界投影；production 仅暴露客户资料、问题、调研、生成输入及文章保存接缝，不暴露投稿 admission、付费执行或文章移除；App 按 production/library 页面装配；14 个边界与内容生成定向测试、Renderer 类型检查通过 |
| 2026-08-20 | Phase 5：内容来源读模型瘦身 | `COMPLETE` | 客户索引改为 identity + 资料 metadata，当前客户通过详情查询加载资料/调研正文；研究索引改为 metadata/readiness，问题/回答 mutation 只刷新当前客户；新增 2 个读模型回归测试，60 个受影响测试通过，主进程与 Renderer 类型检查通过 |
| 2026-08-21 | Phase 6：集成验证与 bounded re-audit | `COMPLETE` | 首轮集成集合发现并修复 Renderer 边界缺少 `snapshot` 投影的 P1 回归；修复后 189/189 定向测试通过，主进程与 Renderer 类型检查通过，`git diff --check` 通过；无 P0/P1 或阻塞性 P2 |

## 14. Discoveries

- 单篇和批量最终共用 `article-generator` 与文章 mutation owner，应在原 owner 上修复，不建立第二套生成核心。
- 批量 `generationTaskId` 已能修复“文章已保存但任务状态未提交”，单篇缺少对应稳定 identity。
- 批量 runner 的 `pause()` 当前直接调用 `stop()`；`stopped` 同时被 Renderer 当作 terminal 和可继续状态。
- runtime hydration 会优先返回 `failed` 可恢复批次，而失败状态没有“结束并新建”入口。
- 文章快照本身保真；错配来自普通保存附带当前表单的 `materialIds/templateId`。
- 后端内容生成没有直接写投稿或订单事实；反向耦合主要位于 Renderer `content-workbench-feature`。
- 当前性能对小规模内容库足够，优化重点是去掉常用路径的全量正文 hydration，不是增加缓存或并发。
- Phase 0 基线确认：`content:generate-article` 的公开请求没有稳定 operation identity；相同输入的第二次调用会再次进入 AI 生成并创建另一篇文章。Phase 1 回归断言应覆盖“响应丢失后用同一 identity 重试只返回既有结果”。
- Phase 0 基线确认：批量 service 同时公开 `pauseBatch` 与 `stopBatch`，两者分别进入 `pausing`/`stopping`，而停止后的批次仍被恢复快照视为 unfinished；失败批次只有 retry/continue 路径，没有结束当前批次并进入新建向导的公开动作。Phase 2 回归断言应覆盖 failed→retry 与 failed→明确结束两条互斥出口。
- Phase 0 基线确认：单篇生成后在当前资料选择或模板目录发生变化时，仅编辑标题/正文并保存，Renderer 的公开保存命令仍携带当前 `materialIds` 与解析后的 `templateId`；因此可把文章历史来源身份改写成与生成快照不一致的值。Phase 3 回归断言应只提交正文编辑字段，并验证来源快照保持生成时版本。
- Phase 1 实现确认：`generationOperationId` 作为文章可持久化 provenance 字段进入 generator、serialization、IPC projection 和 content identity index；同一 identity 的活动调用复用 in-flight promise，已落库结果通过 identity 查询返回，多个匹配则 fail closed。
- Phase 1 实现确认：单篇 service 的 `getState()` 是 workspace runtime 的唯一活动观察入口；dispose 将未确认的远端调用标记为 `uncertain/result-uncertain`，不自动重试；workspace bootstrap 在切换前读取该状态并返回稳定 `WORKSPACE_SWITCH_BUSY`。
- Phase 2 实现确认：批量 runner 的 pause 只设置领取闸门，在途任务继续等待真实结果；runtime dispose 才通过 AbortSignal 将已认领任务记为 interrupted。
- Phase 2 实现确认：持久化批次状态集合删除 stopped/stopping；读取旧文件时一次性归一到 paused；abandoned 批次的 pending 任务变为 cancelled，成功文章与失败/中断任务证据原样保留，abandoned 不再进入 continue 或 runtime hydration 当前批次。
- Phase 2 实现确认：generation 的 stop UI、bridge、preload、IPC channel、service alias、typed contract 和生产 fixture 均已移除；Doubao collection 与 platform execution 的独立 stop 路线不属于本阶段且保持不变。
- Phase 3 实现确认：`saveExistingArticle` 在锁内重读当前文章并只合并标题与正文；普通 Renderer 即使提交整篇旧文章，也不能成为 provenance writer。文章的 material/research/template snapshots 与 identity 始终来自当前持久文章。
- Phase 3 实现确认：模板快照序列化会按现有合同归一可选 `source` 字段；回归断言比较归一后的历史快照，不把当前模板目录作为来源。
- Phase 4 实现确认：`createContentProductionFeature` 仅包装 `content-sources-feature`，不要求或调用投稿/付费/移除 adapter；文章保存与编辑读取作为生产→文章库的最小持久化接缝保留。
- Phase 4 实现确认：`createContentWorkbenchFeature` 的 `production` 与 `library` 是共享 sources/management owner 的只读边界投影，不复制客户 store；production refresh 不触发付费批次刷新，library refresh 不触发付费批次刷新。
- Phase 5 实现确认：`listClients` 使用 `listClientIdentities` 与 `listMaterialMetadata`，不再为每个客户读取资料正文；只有 `getClientDetails`/单篇生成/批量任务实际取数路径读取完整资料。
- Phase 5 实现确认：研究索引使用 `listResearchMetadata`，仅返回问题、更新时间、回答长度、引用数量和 readiness；当前客户详情仍返回完整研究回答，服务端批量 preview/start 继续直接读取 owner。
- Phase 5 实现确认：内容来源 feature 的普通客户命令只刷新当前客户详情，不再无条件对所有客户调用完整研究读取；Renderer 类型将资料/回答正文改为可选字段，摘要合同不传正文。
- Phase 6 bounded re-audit 发现：`production/library` 边界原先只有 `getSnapshot()`，而 `ContentWorkbench` 的公开消费合同读取 `content.snapshot`，导致导航页面首次渲染抛出异常；修复后边界在共享 owner 上提供只读 `snapshot` 投影，并把各自允许的 command projection 同步放入 snapshot，不新增状态 owner。

## 15. Decision Log

| 日期 | 决策 | 原因 |
| --- | --- | --- |
| 2026-08-20 | 采用有边界的分阶段整改，不做系统 rewrite | 核心 generator、store、批量恢复和文章库边界已经健康 |
| 2026-08-20 | 先修生命周期和状态机，再拆 Renderer，再优化读模型 | 按正确性与 owner 风险排序，避免在错误 seam 上优化 |
| 2026-08-20 | 文章来源快照为历史来源唯一权威事实 | 当前术语与产品规格均要求按生成时实际版本解释文章 |
| 2026-08-20 | 不保留无真实消费者的 stop compatibility path | “停止生成”与取消/暂停语义冲突，兼容层会延续第二路线 |
| 2026-08-20 | 性能优化采用 metadata + 按需详情，不建设复杂缓存 | 符合小规模桌面应用实际负载和最小复杂度原则 |
| 2026-08-20 | 单篇 operation identity 作为文章 provenance 的持久字段 | 复用现有 content identity index 和文章 writer，支持响应丢失/重启后的闭环去重，不增加第二个 store |
| 2026-08-20 | 批量明确结束使用 `abandoned` 终态 | 与可恢复 `paused`、任务级 `cancelled` 分离；结束动作保留历史证据并让 UI 进入新建向导，不复用 stopped 双语义 |
| 2026-08-20 | Phase 4 采用共享 owner 的边界投影 | 生产与文章库需要同一客户/文章事实；通过浅投影拆分公开依赖，避免第二份 Renderer store 或跨边界同步状态机 |
| 2026-08-21 | 边界 snapshot 与 command projection 由共享 workbench owner 即时投影 | 现有组件合同仍以 `content.snapshot` 读取状态；在边界补齐只读投影即可闭合公开合同，避免组件内复制状态或重新引入投稿/付费依赖 |

## 16. 验证记录与剩余风险

建立计划前已通过：内容生成链路定向测试 143/143、持久化与 workspace 定向测试 120/120、`npm run typecheck:main`、`npm run typecheck:renderer`。这些结果只证明审计时的原始 HEAD，不证明后续实现。

Phase 0 最终验证（2026-08-20）：在 `auto—publish/` 运行计划规定的九组测试，`120` 个测试全部通过、`0` 失败、退出码 `0`。`workspace-runtime-lifecycle` 夹具在 stderr 输出未启动 `lieju` 浏览器的 Playwright 诊断，但未改变测试结果；未执行真实 AI、登录、发布、付费或生产操作。

Phase 1 最终验证（2026-08-20）：运行 `ai-content-service`、`ai-content-ipc`、`workspace-bootstrap-service`、`workspace-runtime-lifecycle` 定向测试及 `npm run typecheck:main`、`npm run typecheck:renderer`；`63` 个测试全部通过、类型检查通过。运行期夹具仍有未启动 `lieju` 浏览器的 stderr 诊断，不影响退出码 `0`。

Phase 2 最终验证（2026-08-20）：批量 runner/store/service、IPC、typed IPC、Renderer feature/navigation/symbol evidence 定向测试全部通过；本阶段新增与受影响定向集合共 `206` 个测试通过；`npm run typecheck:main`、`npm run typecheck:renderer`、Renderer build 通过；`git diff --check` 通过。未执行真实 AI、登录、发布、付费或生产操作。

Phase 3 最终验证（2026-08-20）：在 `auto—publish/` 运行 `article-generator.test.js`、`ai-content-service.test.js`、`article-store.test.js`、`article-mutation-coordinator.test.js`、`article-editor-session.test.js`、`renderer-content-generation.test.js`，共 `83` 个测试全部通过、`0` 失败；`npm run typecheck:main` 与 `npm run typecheck:renderer` 通过。新增回归覆盖资料/调研/模板发生变化后普通正文编辑仍保留原始 provenance。未执行真实 AI、登录、发布、付费或生产操作。
Phase 4 最终验证（2026-08-20）：在 `auto—publish/` 运行 `phase-04-content-boundaries.test.mjs`、`content-workbench-regression.test.js`、`phase-06-content-workbench-feature.test.mjs`、`phase-06-content-feature.test.mjs`、`renderer-content-generation.test.js`，共 `14` 个测试全部通过、`0` 失败；`npm run typecheck:renderer` 通过。新增回归证明 production boundary 可在没有投稿/付费 adapter 时完成客户资料加载，并将来源加载错误限制在自身 query；未执行真实 AI、登录、发布、付费或生产操作。
Phase 5 最终验证（2026-08-20）：在 `auto—publish/` 运行 `phase-05-content-read-model.test.js`、`ai-content-service.test.js`、`client-material-store.test.js`、`research-store.test.js`、`content-generation-batch-service.test.js`、`content-workbench-regression.test.js`、`phase-06-content-workbench-feature.test.mjs`、`phase-06-content-feature.test.mjs`、`renderer-content-generation.test.js`，共 `60` 个测试全部通过、`0` 失败；`npm run typecheck:main` 与 `npm run typecheck:renderer` 通过；`git diff --check` 通过。新增回归证明初始客户索引和研究索引不含正文，当前客户详情才读取正文，mutation 不触发全客户完整研究重读。未执行真实 AI、登录、发布、付费或生产操作。

Phase 6 最终验证（2026-08-21）：首轮按计划运行主进程/Renderer 类型检查与 189 个定向集成测试时发现
`renderer-generation-batch-navigation.test.js` 因边界缺少 `content.snapshot` 而失败（188/189）；沿直接调用链修复
`content-workbench-feature.js` 的 production/library snapshot 与 command projection；bounded re-audit 又收窄 production
projection，仅保留共享渲染 effect 所需的 revision/workflow fence，不暴露文章/回收/removal 读模型。最终重新运行同一集合，
189/189 测试通过、0 失败；`npm run typecheck:main`、`npm run typecheck:renderer` 通过，Renderer 导航测试同时完成 Vite build，
`git diff --check` 通过。测试夹具仍输出未启动 `lieju` 浏览器的 Playwright 诊断，但不影响退出码；未执行真实 AI、登录、发布、
付费或生产迁移操作。最终工作树状态已记录，未擅自提交或清理用户已有改动。

当前未验证且必须在对应阶段补齐：

- 真实进程退出/重启窗口下的单篇结果丢失与去重；
- provider 已发出请求后进程被强制终止的真实 OS 级窗口；当前以 dispose/不确定结果故障注入覆盖，未做真实外部调用。
- 新批量 terminal outcome 对旧持久批次文件的读取归一；
- 大型合成内容库的初始 payload 和调用次数；
- 打包后 GUI 的暂停、失败结束、新建批次和文章库可见性。
- 新 `abandoned` 状态对历史旧批次文件的真实 GUI 重启回归，以及在途 provider 请求的真实 OS 强制终止窗口仍未验证；当前由序列化归一、故障注入和 dispose 状态矩阵覆盖。
- Phase 3 尚未验证打包后 GUI 的历史来源展示；当前由文章编辑读取 projection、mutation owner 和序列化/存储行为测试覆盖，未执行真实客户工作区操作。

真实 AI、豆包登录、发布、付费、取消订单和生产迁移不属于本计划的自动验证授权。
