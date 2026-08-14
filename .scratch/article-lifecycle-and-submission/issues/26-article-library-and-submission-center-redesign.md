# 26 — 文章库与投稿中心重设计

**What to build:** 按 2026-08-15 新产品规格，把生成、文章管理、普通队列、付费投稿、需处理和删除重组为“内容生产 → 文章库 → 投稿中心 → 订单”的单一用户链路，同时保持既有远端副作用、单活动目标、不确定结果和审计事实安全。

**Status:** `document-ready / 26-0 planning complete / implementation not started`

**Implementation precondition:** 26-0 识别的既有修改已经按 owner 验证并收口为 `6a9232b`、`79dbe36`、`6fc897f`、`c10a838` 四个基线提交；当前 Ticket 26 production implementation 尚未开始。每个工作包必须从包含这四个提交和 Ticket 26 计划提交的 clean integration HEAD 创建，不得从旧 `e8edc3a` 或项目默认分支重新实现、覆盖或增加兼容层。

**Scheduling gate:** Ticket 26 作为图片 Wave 前的新产品收敛波次严格串行执行。一个 Goal 主任务为当前最左工作包创建一个新的 Codex project worktree 任务；该任务完成、提交、交接并进入 clean integration HEAD 后，主任务才创建下一包。Wave 12–13 图片工作继续保持 `PENDING`。

## 权威产品变化

1. 旧六个互斥文章入口不再作为导航和总状态机。
2. 生成成功只保存文章；删除生成批次直接入队交接。
3. 普通平台在确定平台和账号并确认入队后冻结文章。
4. 付费媒体在选定媒体并确认最新费用后才建立批次、活动目标和冻结；删除持久 `paid_staging_items` 业务概念。
5. 文章库使用 `待投稿 | 待完善 | 投稿中 | 已发布 | 回收站` 只读投影。
6. `需处理事项` 是独立人工待办，不是文章阶段。
7. 移出队列与移入回收站严格分开；删除预检不得自动撤销队列。
8. 已确认付费批次不可追加或单独移除；可暂停并取消全部剩余未开始项，重新提交必须重新预检费用。

## 串行工作包

每个工作包都有独立合同。工作包任务只读取根 `AGENTS.md`、该合同列出的 SPEC/CONTEXT 章节、当前 Wave 状态、上一工作包 handoff 和直接 owner/tests；不得默认读取其他工作包合同、历史 handoff 或 archive。

| 工作包 | 独立合同 |
| --- | --- |
| 26-A | `.scratch/article-lifecycle-and-submission/issues/26-A-article-library-projection-and-permissions.md` |
| 26-B | `.scratch/article-lifecycle-and-submission/issues/26-B-generation-creates-articles-only.md` |
| 26-C | `.scratch/article-lifecycle-and-submission/issues/26-C-unified-submission-intake-and-paid-staging-retirement.md` |
| 26-D | `.scratch/article-lifecycle-and-submission/issues/26-D-submission-center-regular-queue.md` |
| 26-E | `.scratch/article-lifecycle-and-submission/issues/26-E-confirmed-paid-batch-workbench.md` |
| 26-F | `.scratch/article-lifecycle-and-submission/issues/26-F-typed-attention-center.md` |
| 26-G | `.scratch/article-lifecycle-and-submission/issues/26-G-separate-removal-from-queue-mutation.md` |
| 26-H | `.scratch/article-lifecycle-and-submission/issues/26-H-renderer-information-architecture.md` |
| 26-I | `.scratch/article-lifecycle-and-submission/issues/26-I-integration-audit-and-closure.md` |

每份独立合同均固定：目标、最小必读、实施边界、验收条件、最低验证、停止条件和交接要求。独立合同优先于本 umbrella 的摘要描述；若冲突，停止并只修正文档，不猜测实施。

### 26-0 — Dirty reconciliation 与合同冻结

- 固定当前 Git HEAD、dirty 文件、来源意图、已运行测试和未完成 handoff。
- 将重叠 diff 分类为：继续保留的真实修复、由新设计吸收的 UI 工作、需要在后续 owner 中重做的旧模型实现、生成物/外部验收证据。
- 不修改 production owner；只更新权威词汇、SPEC、ADR、本合同、Wave Plan 和 reconciliation handoff。
- 给出后续每个工作包的准确 base state 和禁止覆盖文件清单。

### 26-A — 文章库投影与权限合同

Owner：`article-lifecycle-projection` / 文章操作策略。

- 用文章可用性、投稿资格和运行事实计算五个文章库分类。
- 从投影中移除 `paid_processing` 和 `failed` 文章阶段；保留订单摘要和待办数量作为独立字段。
- 统一 edit/submit/trash/restore/purge 权限和稳定 reason code。
- 保持现有文章、队列、订单、发布和删除事实 schema，不新增平行 writer。
- 先完成 owner 行为矩阵，再修改应用 read model 和 transport DTO。

### 26-B — 内容生产只创建文章

Owner：生成批次应用服务与生成 Renderer feature。

- 删除生成批次直接创建普通队列的生产 capability 和 UI。
- 批次成功后提供“查看本批次文章”导航意图，文章库按 `generationBatchId` 筛选。
- 生成模块不得注入普通队列、付费批次或订单写能力。
- 现有 generation handoff consumer 清零后删除 service/IPC/bridge/contract/tests，不保留 alias。

### 26-C — 统一发起投稿与付费暂存退役

Owner：普通 admission、付费预检/确认、正式 migration。

- 建立不持久化的投稿选择/预检会话合同。
- 普通路径继续复用唯一 regular admission transaction。
- 付费路径在费用确认成功时直接复用唯一 paid admission transaction；确认前不写 staging、active target 或 batch。
- 新 migration 原子记录并清除旧 `paid_staging_items`，产生一次安全迁移摘要，不建立 runnable facts。
- 删除 staging add/remove/set-media 的生产 capability、IPC、bridge、Renderer store 和 compatibility surface。

### 26-D — 投稿中心只读模型与普通队列操作

Owner：投稿工作台 query、regular queue application/orchestrator。

- 一次读取普通队列组、当前项、剩余顺序、文章安全摘要和组级动作。
- 将普通队列开始、暂停、开始全部、暂停全部和移出未开始项集中到投稿中心。
- 文章库只发起投稿和导航，不直接编排队列执行。
- 保持不同平台并行、同平台会话锁和重启暂停规则。

### 26-E — 已确认付费批次工作台

Owner：paid preflight、paid batch orchestrator、paid execution transitions。

- 投稿中心展示已确认批次、费用快照、剩余项、当前订单创建和暂停原因。
- 禁止追加或单项移除。
- 增加“取消全部剩余未开始项”具名事务；在途请求和已有订单不受影响。
- 取消后只在无其他阻塞事实时结束对应活动目标并恢复文章。
- 重启保持暂停，继续前重新验证资格；不得自动产生费用。

### 26-F — 需处理中心

Owner：attention query/policy/resolver 与各真实 resolution port。

- 类型固定为普通明确失败、普通不确定、付费创建不确定、订单状态异常、删除修复和归档修复。
- 明确失败的再次投稿回到统一投稿入口；删除通用 `retry-publication` 业务动作。
- 不确定结果仅允许合同规定的人工核对动作。
- UI 可按文章聚合展示，但每项 identity、policy、stale guard 和 resolution 保持独立。
- 系统修复项不得获得远端投稿或订单动作。

### 26-G — 删除链路收敛

Owner：article removal policy/service/coordinator。

- 删除预检只报告活动队列、批次、订单、不确定、发布或开放事务阻塞。
- 移入回收站不调用 queue cancel/remove，不建立跨 owner 组合副作用。
- 普通未开始项必须先通过投稿中心移出。
- 恢复不恢复投稿任务；永久删除继续保留订单与发布证据。
- 删除旧 `queuedToCancel` / 自动 queue-actions 路径及只为该路径存在的兼容合同，但保留 durable 文件删除恢复状态机。

### 26-H — Renderer 信息架构

Owner：Renderer feature 与页面组合，不拥有业务状态。

- 主导航调整为内容生产、文章库、投稿中心、订单、媒体资源、设置。
- 文章库、投稿中心和订单各消费自己的版本化 read model。
- 移除“其他平台投稿”“付费媒体投稿暂存队列”“历史文章六阶段 tabs”等旧入口。
- 关键跨页导航携带稳定文章/批次/待办 identity，不通过全局可变对象传递。
- 覆盖加载、空态、错误、禁用、确认、筛选、窄屏和 stale refresh。

### 26-I — Integration、audit 与 closure

- 运行有限状态矩阵、迁移/崩溃/并发/幂等/性能和 Renderer acceptance。
- Primary Audit 只覆盖 26 最终组合边界；修复 blocking findings 后执行 bounded re-audit。
- 在最终 clean integration HEAD 上执行合同要求的完整 gate。
- 真实登录、发布、付费、取消或生产迁移仍需逐项明确授权；缺少外部验收时标记 implementation complete / external acceptance pending，不伪造 COMPLETE。

## 深模块硬门槛

- 文章内容、生命周期投影、普通队列、付费批次、订单、需处理和删除各有唯一 owner。
- 不建立通用 workflow engine、万能 `SubmissionManager` 或共享可变 article state。
- Renderer 只能消费应用命令和只读模型。
- composition 只注入最小具名 capability；不得把完整 OperationalStore 或供应商对象传播给业务服务。
- 允许 IPC/bridge 等 transport adapter 薄，但业务模块必须隐藏事务、幂等、锁序、错误分类和恢复语义。
- 删除旧入口时同时删除 DTO、contract、bridge、fixture、测试和文档残影；没有真实消费者时不保留 compatibility layer。

## 最低 acceptance

- [ ] 生成成功零投稿事实。
- [ ] 普通入队与付费确认是仅有的两类新活动目标入口。
- [ ] 确认前不冻结，确认后原子冻结。
- [ ] 同一文章最多一个活动目标，首次成功永久只读。
- [ ] 付费暂存 migration 不产生队列、订单或远端动作。
- [ ] 普通移出、付费取消剩余项和文章删除的副作用边界互不混淆。
- [ ] 不确定结果无直接 retry。
- [ ] 订单和发布事实不可删除。
- [ ] UI 不再要求用户跨文章管理/平台/付费暂存三个页面完成同一投稿任务。
- [ ] 公开行为测试不读取生产源码证明业务正确。

## 停止条件

仅在以下情况停止请求用户决定：

- 当前 integration HEAD 与 26-0 provenance 不一致，且继续会覆盖无法辨认的用户工作；
- 新规格与真实外部供应商合同发生无法自行消解的冲突；
- 需要不可逆生产数据迁移或真实付费/发布授权；
- 发现已有订单/发布事实会因 staging 退役而丢失。

普通实现选择、测试失败、局部 finding 和可安全迁移的旧暂存数据不构成停止理由。
