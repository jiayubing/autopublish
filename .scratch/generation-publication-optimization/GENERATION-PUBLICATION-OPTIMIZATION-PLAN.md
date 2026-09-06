# 文章生成与发布链路优化计划

## 1. 当前状态与授权

- 创建日期：2026-09-05。
- 状态：`L_CI_PENDING`。A/B/C 已全部合并到 `master`；L 已完成直接组合调用链收口审计，未发现阻塞 finding，当前等待 L PR 同一最终 HEAD 的 required CI evidence 闭合；D/E 未开始。
- L 开始时源码真源：`master` `3dc7d59a6d2fa4507e7daf326323ce40b5509ae3`，该提交已包含 A（PR #22）、B（PR #24）和 C（PR #25）。
- C 开始时源码真源：`master` `3498eb64f9c87291254af821186e2974c9f7d3ec`，该提交已包含 A（PR #22）和 B（PR #24）。
- 用户目标：先做好生成文章、发布文章；本计划不评估 GEO 优化效果。
- 用户新增要求：已发布文章显示的时间应为实际发布时间，不是文章生成时间。
- 当前线程授权仅覆盖 L 的组合回归、收口审计、必要修复、计划 evidence、提交、push、PR 与 CI 修复；不包含自动 merge，不进入 D/E，也不执行真实账号或生产发布操作。
- 下一步：建立 L PR，以 PR 当前最终 HEAD 的 required checks 为最终 gate；全绿后仅报告 `L_READY_FOR_REVIEW`，PR 保持未合并，不顺带开始 D/E。

本计划是本次优化的唯一范围、进度与验证入口，不重新启动已完成的历史计划，也不改变文章生命周期 Wave Plan 中尚未完成的真实外部验收状态。

## 2. 范围与最小阅读集

### 2.1 包含

1. 修复生成结果页批量投稿的部分失败恢复和再次进入操作。
2. 修复已发布文章的时间展示，并按用户确认结果处理关联排序、筛选和分组摘要。
3. 治理批量生成中的全库身份查找读放大，验证内容库积累后的运行成本。
4. 用真实公开行为和关键交互测试覆盖以上链路；去除被等价行为测试替代的业务源码字符串断言。
5. 将 CI 重复执行的去重列为后续非阻塞优化，不降低安全、事务、恢复和打包保障。
6. 单独列出真实平台验收前置条件，不用本地合成结果代替真实可用性。

### 2.2 不包含

- GEO 排名、品牌提及、引用率、收录和效果归因；不建设效果监测模块。
- 新平台、新插件系统、同文多目标发布、同平台多账号并行、无人值守定时发布。
- 重写整个架构、全面迁移数据库、全仓 TypeScript 改造、无关格式整理。
- 修改已发布永久只读、唯一活动目标、不确定结果不得自动重试等既有产品规则。
- 自动修补真实历史数据、登录账号、发布文章、图片上传、付费下单、订单核对或生产迁移。

### 2.3 阅读入口

先读根 `README.md`、`docs/AI-ENTRY.md`、`docs/WORK-INDEX.md`、本计划；再按工作项读取：

- 根与 `auto—publish/AGENTS.md`、应用 `README.md` 的相关命令。
- `CONTEXT.md` 中生成任务、生成批次、模板文章组、活动发布目标、已发布文章和结果不确定。
- `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` §3–5、§9、§11。
- `docs/adr/0001-model-batch-generation-as-client-template-tasks.md`、`0003-store-operational-state-in-workspace-sqlite.md`、`0006-separate-article-lifecycle-from-submission-work.md`，仅在对应工作项涉及该边界时阅读。
- `.scratch/article-lifecycle-and-submission/EXECUTION-PROTOCOL.md` 与 `AUDIT-PROTOCOL.md`。
- §4 指定的 owner、直接调用方和测试；不得批量加载历史 Wave、handoff 或 archive。

下文源码路径相对 `auto—publish/`，除非明确指向仓库根文档。

## 3. 产品决策

### 3.1 已确认，不再另行设计

- 先把生成和发布链路闭合，GEO 效果评估不作为完成 gate。
- 已发布文章的时间来自发布事实，不允许使用文章 `createdAt` 充当发布时间。
- 原始生成时间保留，不重写文章内容元数据来修界面。
- 缺失发布时间不能伪造；最近刷新时间、文章编辑时间、迁移执行时间均不能冒充发布时间。
- 普通平台明确接受即形成发布成功，不为本次时间修复新增公开页面轮询或等待审核流程。
- Renderer 不建立新的发布状态或时间 writer；复用 OperationalStore 既有发布证据和只读模型。

### 3.2 已确认的时间语义（2026-09-06）

| ID | 确认内容 | 执行规则 | 影响范围 |
| --- | --- | --- | --- |
| D1 | 用户接受精确平台时间缺失时显示首次成功确认时间或人工确认时间，并明确标注来源。 | 平台事件时间显示“发布时间”；首次成功 observation 显示“确认发布时间”；人工正向证据时间显示“人工确认时间”；完全缺失则显示“发布时间未记录”。这些不是同一种精度，不能统一冒充精确远端发布时间。 | B 的 fallback、标签和对应验收。 |
| D2 | 用户同意“已发布”页的排序、日期筛选及分组“最新”统一使用发布时间。 | 组内按 D1 对应的发布事实时间倒序，组间按最新发布事实时间倒序，日期筛选使用同一时间；其他分类保持原规则。“全部”混合视图的已发布行修正时间标签，但不改变混合视图排序。未知时间排在已知时间之后并使用稳定次序，不借生成时间推断发布时间。 | B 的排序、筛选、分组范围，以及对应 SPEC / CONTEXT 修改。 |

当前 `CONTEXT.md` 的“模板文章组”明确使用生成时间倒序。D2 已确认“已发布”页例外；实施 B 时同步更新这一真源，其他分类不变。

真实平台若没有精确时间，本地代码不能凭空取得；D1 不能通过恢复旧审核路线、爬公开页或改写历史证据来绕过。以上决定已记录，实施时同步产品真源。

## 4. 实施顺序与工作项

本地产品修复顺序：`A → B → C → L`。D1/D2 已确认，不再存在对应决策阻塞。不得并行修改共享 owner。

| 项 | 状态 | 性质 | 完成条件 |
| --- | --- | --- | --- |
| A 批量投稿失败恢复 | `DONE`（PR #22 已合并） | 阻塞主操作链路 | 删除旁路投稿事实，失败和移出后的操作正确，行为测试通过。 |
| B 已发布时间 | `DONE`（PR #24 已合并） | 用户明确需求；D1/D2 已确认 | 发布证据到列表闭合，展示与确认的排序筛选语义一致。 |
| C 批量生成读取成本 | `DONE`（PR #25 已合并） | 规模化风险 | 消除已证明的逐任务全库枚举，幂等、恢复、失效语义不退化，给出实测数据。 |
| L 本地集成收口 | `CI PENDING` | 本地完成 gate | A/B/C 的直接组合回归、一次收口审计及必要有界复审闭合；PR 当前最终 HEAD required CI 全绿后转 `L_READY_FOR_REVIEW`。 |
| D CI 执行去重 | `PENDING` | 非阻塞维护；不阻塞 A/B/C/L | 保持有效覆盖与 evidence 合同，重复执行减少且可证明。 |
| E 真实平台验收 | `PENDING` | 外部授权 gate；独立于本地完成 | 获得当次明确授权并完成约定范围，不自动执行。 |

### A. 批量投稿失败恢复

问题来源：`P2 / EXPOSED_PREEXISTING`，见 `BatchRegularSubmissionDialog.tsx` 和 `GenerationBatchDetail.tsx`。

Owner 与范围：

- `media-workbench/src/features/submission/batch-regular-submission-coordinator.js` 只编排跨客户请求与部分结果。
- `desktop/services/regular-queue-application.js`、既有文章生命周期投影和 mutation coordinator 继续决定资格、幂等和活动目标。
- `media-workbench/src/components/content/BatchRegularSubmissionDialog.tsx`、`GenerationBatchDetail.tsx`、`BatchGenerationView.tsx` 只收集选择和呈现结果。

实施要求：

1. 先补复现“全选提交部分失败，关闭弹窗再进入后重试入口消失”的回归。
2. 删除 `auto-publish:batch-admitted:*` 作为资格和按钮显示来源的读写；不是改成只缓存成功项。账号选择偏好可保留，但不拥有业务事实。
3. 重进批次时以既有权威资格判断可投稿文章；成功、冻结、不确定、明确失败、已移出等状态必须分别处理。
4. 跨客户提交保留 partial 结果，不宣称整个跨客户请求具备全局事务；同一客户 admission 的事务保障不退化。
5. 重试失败客户不重投已成功文章；重复入队仍由既有 owner 幂等处理。请求结果未知时先查询事实，不直接解释为未入队。

验收矩阵：全部成功；部分客户失败；全部失败；关闭后重进；清空浏览器存储；切换内容库；重复确认；文章在预检后失效；队列项移出后重新投稿；远端 uncertain 不允许自动重试。

复用 `batch-generation-submission.test.mjs`、`renderer-generation-batch-navigation.test.js`、生命周期与普通队列行为测试。增加实际完成确认和结果恢复的交互用例，不能仅证明按钮文字或弹窗存在。

### B. 已发布文章时间

问题来源：用户截图与 `P2 / EXPOSED_PREEXISTING`；列表目前直接展示 `article.createdAt`。

事实与 owner：

- OperationalStore 发布证据已有 `firstPublishedAt`、`firstPublishedAtSource`，区分 `provider_event_time`、`first_positive_observation_time`、`manual_positive_evidence_time`、`legacy_unavailable`。
- `desktop/services/article-management-snapshot.js` 已提供发布档案，优先通过现有批量只读模型关联文章身份，不新增逐文章 IPC 查询。
- 展示范围为 `GeneratedArticlesList.tsx`、直接 feature / 分组筛选模型、必要的 bridge/DTO，以及 `PublicationHistoryDrawer.tsx` 的时间语义一致性。

实施要求：

1. 将 §7 的合成复现转为公开行为回归测试；使用生成时间和发布时间跨天、跨月且顺序相反的 fixture。
2. 从既有首次成功发布证据取得时间及来源，不使用生成时间、最后编辑时间、订单创建时间或最后刷新时间兜底。
3. 不把新增的 article DTO `publishedAt` 当作第二个持久事实 owner；若需要新增只读字段，明确来自哪份发布证据并随 revision 失效。
4. 现有首次成功事实不因刷新、重启、迟到 observation、售后或退款被改写；不扫描真实历史文章做无依据补值。
5. 按 D1/D2 的明确决定实现标签、未知值、时间排序、分组摘要和日期筛选；显示继续复用北京时间格式化能力。
6. 实施同步更新根 SPEC 的文章库时间合同，并按已确认 D2 更新 `CONTEXT.md` 的已发布分类排序例外。

验收矩阵：普通平台直接接受；网站媒体已发布；人工确认；历史时间缺失；生成早但发布晚；生成晚但发布早；北京时间跨日边界；重复刷新；重启；已发布后迟到事件；混合分类中的已发布行；组内/组间排序、分组“最新”和日期筛选一致性。未知时间不可通过生成时间匹配发布日期范围。

### C. 批量生成读放大

问题来源：`P2 / EXPOSED_PREEXISTING`。`generation-batch-runner.js` 每个任务调用 `ContentStore.findByGenerationTaskId`；该调用每次新建全库身份索引。

Owner：`src/content/content-store.js`、`content-identity-index.js`、`generation-batch-runner.js`，以及直接依赖的生成 service。文件持久化仍由现有 store 负责。

实施要求：

1. 先保留合成读取计数基线，再用临时合成内容库建立完整文件路径的性能基线。
2. 优先复用现有批量身份解析/索引能力；在 owner 内定义作用域、更新和失效，避免每个任务重建全库索引。不用永久不失效的缓存交换幂等安全。
3. 覆盖本批次新增文章、另一生成入口写入、内容库切换、恢复已有文章和身份冲突；不得省略“同一任务已有文章”的恢复检查。
4. 同步测量标题补全、整批 JSON 更新及事件投影成本。只有实测证明它们是本链路瓶颈才局部调整，不预先承诺全部重写。
5. 不通过单纯提高并发、减少校验或忽略落盘失败掩盖读取问题。

验收：已有 100 / 1,000 篇文章时各执行 100 个合成生成任务，对比读取次数；再测当前合同上限 1,000 个任务。相同环境记录墙钟时间、事件循环延迟、读取量、写入量和事件负载，不把本机结果宣传成生产吞吐承诺。保留成功任务不重生、暂停/取消、异常恢复和并发身份一致性回归。

#### C 实施与证据（2026-09-06）

实现保持既有事实 owner，不修改 `generation-batch-runner` 的每任务幂等检查：

- `ContentStore` 每实例惰性建立一个 `ContentIdentityIndex`，后续 `findByGenerationTaskId` / operation identity 查询复用同一索引，不再逐任务全库重建。
- `createArticle` / `saveArticle` 仅在文件持久化成功后增量 `upsert`；`moveArticleToTrash` 成功后从索引移除；restore / permanent-delete 等非热路径成功后失效索引并在下一次读取安全重建。
- `ContentIdentityIndex` 继续保存 closed-cardinality 的 `none/one/many` 语义，不选择冲突候选，不降低重复身份保护。
- `createGenerationTaskIndex` 保持独立新建的 snapshot seam，没有把 live cache 变成全局永久事实。
- bounded re-audit 发现生产 `ArticleMutationCoordinator.createArticle()` 原先直接持有裸 `ArticleStore`，会让另一个合法生成入口绕过 live index。composition 已改为向 coordinator 注入同一个 `ContentStore` mutation seam；mutation session 内 create/replace/trash/restore 与普通 ContentStore 写入共享同一 identity view。
- 每个 workspace/content-library 重新构造独立 `ContentStore`，索引不跨内容库共享；workspace switch 不依赖全局 cache 清理。
- runner 的暂停、继续、取消、已有文章恢复、失败恢复和冲突控制流未改写，继续由既有 runner/store owner 和回归套件验证。

真实临时目录 + 真实 `ArticleStore` 文件路径基线来自 PR #25 CI run #237（Windows / Node 24）。该轮虽然 benchmark 的“维护型写入必须为 0”错误断言导致 3 个测试失败，但失败前已完整记录旧实现与新实现的真实 I/O 数据；其余 1932 / 1935 项通过，新增 mutation-session freshness 回归也通过：

| 场景 | 旧实现 | C 实现 | 结果 |
| --- | --- | --- | --- |
| 100 articles × 100 lookups | 69,984.9 ms；100 次全库扫描；10,000 条文章记录；40,000 file reads；20,100 directory enumerations；50,000 读路径维护写操作 | 460.57 ms；1 次全库扫描；100 条文章记录；400 file reads；201 directory enumerations；500 读路径维护写操作 | 全库扫描与文章读取 100× 收敛 |
| 1,000 articles × 100 lookups | 490,673.82 ms；100 次全库扫描；100,000 条文章记录；400,000 file reads；200,100 directory enumerations；500,000 读路径维护写操作 | 4,738.61 ms；1 次全库扫描；1,000 条文章记录；4,000 file reads；2,001 directory enumerations；5,000 读路径维护写操作 | 全库扫描与文章读取 100× 收敛 |
| 1,000 articles × 1,000 lookups | 按相同旧 owner 路径为 1,000 次全库扫描 / 1,000,000 条文章记录读取 | 5,076.35 ms；1 次全库扫描；1,000 条文章记录；4,000 file reads；2,001 directory enumerations；5,000 读路径维护写操作 | 当前 1,000-task 合同仍为单次建索引 |

说明：上述“写入”不是业务文章写入，而是 `ArticleStore.listArticles()` 真实读取路径中的锁/事务维护 I/O。run #237 的失败暴露的是 benchmark 口径错误，不是生产逻辑失败。后续 benchmark 已把该指标明确为 `maintenanceWrites`，持续 CI 使用“一次真实旧路径扫描 + 线性旧成本模型 + 优化后完整 100 / 1,000-task 实跑”，避免每次 PR 故意重放已证明的约 10 分钟病态旧实现。run #238 在代码 HEAD `196b008195cba77b8e6b5fe5b78f6d57f67f38af` 上 required jobs 全绿；run #239 又在包含完整 C 证据的文档 HEAD 上完成 SUCCESS。合并前仍以 PR 当前 HEAD required checks 为最终 gate，不借历史绿色结果覆盖新提交。

事件证据：identity lookup 本身不发 Renderer event，benchmark 的 `eventPayloads=0`；独立 generation snapshot event 基线为 100 events、0 follow-up IPC、0 batch file reads。该同步文件路径的 `performance.eventLoopUtilization()` 观测为 0，因此不将其宣传为有效生产延迟承诺。

### L. 本地集成收口（2026-09-06）

L 从当时 GitHub 最新 `master` `3dc7d59a6d2fa4507e7daf326323ce40b5509ae3` 建立独立分支 `codex/generation-publication-optimization-l-integration-closeout`。开始时已直接核实 A / B / C 均已合并：PR #22 → `9e440eebafc45408a4c309bb06ccbc9212c2dc67`，PR #24 → `3498eb64f9c87291254af821186e2974c9f7d3ec`，PR #25 → `3dc7d59a6d2fa4507e7daf326323ce40b5509ae3`。

本次不是全仓 Primary Audit，只检查最终 A/B/C diff 与直接组合调用链：

- A：`batch-regular-submission-coordinator` → `regular-queue-application` → `ArticleMutationCoordinator` / lifecycle projection / regular admission policy → OperationalStore 与 ContentStore。跨客户 partial result 只由 coordinator 编排；资格、active target、幂等和失败/uncertain 事实仍由权威生命周期 owner 决定。明确失败后可重新 admission；已成功项为 idempotent，不进入新的 fresh admission；未开始队列项移出后 active target 与 queue 同步清除并恢复投稿资格；uncertain 冻结文章、暂停组，只暴露人工确认 accepted / not accepted，不存在盲目自动 retry。
- B：OperationalStore `applyFirstPublicationSuccess` / publication archive → `article-management-snapshot` → `article-history-logic` → `GeneratedArticlesView` / `GeneratedArticlesList` / `PublicationHistoryDrawer`。首次成功事实 first-wins / idempotent；迟到 accepted 不改写首个发布事实。已发布页的展示、排序、日期筛选、组内/组间“最新”统一使用 `firstPublishedAt` 及来源；缺失时显示“发布时间未记录”，不回退 `createdAt`；混合 `all` 仅已发布行改显示时间，仍走原生成时间分组/排序合同。
- C：`generation-batch-runner` → ContentStore live `ContentIdentityIndex` → ArticleMutationCoordinator mutation session；composition 把 coordinator 与普通写路径接到同一个 ContentStore owner。runner 每任务已有文章恢复检查保留；identity cardinality 继续 `none / one / many` fail-closed；create/save/trash/restore/purge 的更新/移除/失效边界保持一致；每个 workspace 构造独立 ContentStore，不跨内容库复用索引。100 / 1,000 历史文章及 1,000-task 继续按 C 已建立的 bounded benchmark 合同验证，不重新故意执行病态旧实现完整基线。

收口审计结果：**0 个阻塞 finding**。没有发现 `INTRODUCED_BY_CHANGE`、`CROSS_TICKET_INTERACTION` 或新增 `EXPOSED_PREEXISTING` 阻塞项；没有新增第二业务事实 owner、Renderer 旁路 writer、重复 publication owner、跨 workspace 永久 cache，或绕开 ContentStore identity owner 的合法写路径。错误、取消、暂停、恢复、重复 admission、发布竞争和 uncertain 路径仍 fail-closed。没有证据要求为“收口”重写 A/B/C，因此 L 不修改生产代码，也未触发 bounded re-audit。

Evidence note：`PROCESS_EVIDENCE_GAP`（非代码 finding）。当前执行会话的通用容器无法解析 `github.com`，不能从 GitHub clone 仓库，所以没有把本地容器中的 `npm test` / `npm run test:integration` 等命令伪记为执行成功。计划允许在**同一最终 HEAD** 复用可信 GitHub CI；L PR 将以现有 `required/desktop-node24` 的全测试发现与 toolchain step 作为实际执行 evidence。`test:desktop-core` 无 `--suite` 时会发现全部测试，再按现有 exclusion 过滤特殊发布/容量组，因此覆盖 core 与 integration 中 A/B/C 的回归；toolchain 真实执行 lint、renderer/bridge/main typecheck、format check、renderer build，并额外执行 preload build。任何 skipped 条件 job 都单独登记，不冒充成功。

L 最终 PR CI evidence 当前待闭合。基线参考仅为开始时 master 同 SHA 的 CI #241 `completed/success` 与 Windows Installer #42 `success`；这些不替代 L 分支最终 HEAD gate。D 未开始。E 未开始且未授权；没有操作真实账号、真实发布、图片上传、付费下单、生产迁移或 GEO 效果评估。

### D. CI 去重与维护成本（非阻塞）

Owner：根 `.github/workflows/ci.yml`、应用 `package.json`、`scripts/run-tests.js`、`scripts/test-suites.json` 和直接 evidence scripts。

- 盘点 `test:desktop-core` 与迁移、diagnostics、transport 等独立 job 的重复集合，以及 renderer typecheck/build 重复。
- 先形成“测试集合 → 唯一执行位置 → evidence 消费者”映射；保留全量发现、遗漏/重复分类检查和 skip 不能冒充通过的规则。
- 优先复用同一最终源码状态、环境和真实执行结果；不通过写死 PASSED、忽略失败或删除有效行为用例实现提速。
- CI 合同变化需要验证 PR / push 两条路径；修改前后的覆盖差异、实际耗时和 evidence 一致性必须可解释。
- 主进程 typecheck 当前只覆盖 composition TypeScript，应如实记录覆盖范围；本计划不全仓转换 JavaScript，也不新建仅用于让门禁显得完整的类型层。
- 不把 auth-server、打包、安全和真实验收整套门禁强加到每次局部生成/UI 修改上；同样不能直接删除发布门禁。

## 5. 验证阶梯与收口

实施时从 `auto—publish/` 运行，先定向、再集成，不在每次修复后重跑所有历史门禁。

| 场景 | 必要验证 |
| --- | --- |
| A/B 单项 | 对应公开行为测试、实际 Renderer 交互；加载/空/错误/禁用态；重复操作、切页/重进和失效结果。 |
| C 单项 | runner / ContentStore / 身份解析 / batch service 定向测试；恢复与并发回归；前后读取量和合成文件性能对比。 |
| A/B/C 最终本地源码 | `npm test`、`npm run test:integration`、`npm run lint`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`、`npm run build:renderer`；`format:check` 按现有受管范围执行。 |
| 改动 IPC/preload | 再跑受影响生产 IPC 合同、`npm run build:preload`，验证受控 API 和 runtime/revision 隔离。 |
| 改动 schema/打包/CI | 仅增加相应 migration、packaging、CI 合同和 evidence gate；不得以非目标为由漏掉实际改变的边界。 |
| 宣称可分发版本 | 另行满足发布组、干净源码打包和 unpacked smoke；本地业务测试通过不等于已完成发布验收。 |

`build:renderer` 已包含 renderer typecheck；同一最终源码状态下可由该命令满足对应校验，不为满足表格重复运行。其他结果也只有在源码状态、环境和执行范围相同且 evidence 可追溯时才能复用。

本次前一轮审计已经识别的 findings，不重新开展全仓 Primary Audit。实施时验证修复 diff、直接调用链和不变量；L 做一次本计划集成收口。新增阻塞 finding 修复后仅作有界复审，扩大范围必须满足 Audit Protocol 的 escalation 条件。

本地修复完成条件：A/B/C 的确认范围实现、失败路径安全、无新增事实 writer、关键交互及定向性能证据通过、阻塞 findings 关闭、最终源码验证和计划 evidence 一致。D 未执行可明确登记为后续非阻塞维护；E 未获授权须标注未验收，不能伪记完成。commit/merge 未授权时不执行，也不宣称 final clean-HEAD 发布 gate 已完成。

## 6. 真实平台验收前置条件

E 只能在用户逐次明确授权后建立具体验收任务。授权必须明确平台和账号、目标文章、篇数、是否带图、付费预算（如涉及）、允许的副作用与停止条件。

建议验收覆盖少量文章的确认、入队、远端接受、本地已发布、时间与来源、发布详情一致性；不能故意制造真实重复发布或收费来做故障注入。不确定结果立即停止自动重试，保存真实观察并人工核对。

生成/发布的真实业务验收与 GEO 效果评估无关；后者不进入本计划，也不阻止前者完成。历史 Ticket 19/25/26 的外部 gate 状态仍由 Wave Plan 记录，不在这里复制或改写。

## 7. 已有证据与当前复现

### 7.1 前一轮审计证据（不是本计划修复后的验收）

源码 `b2395db`，Windows / Node `v24.16.0`：

- `npm test`：61 文件、551 项通过，执行器 6,299 ms。
- `npm run test:integration`：196 文件、1,024 项通过，执行器 57,230 ms。
- 上述两组均 0 fail / skipped / cancelled / todo；`lint`、`typecheck:main`、`typecheck:bridge` 通过。
- 合成公共接口计数：100 个任务，对 100 / 1,000 篇历史文章分别枚举 100 次内容库，读取 10,000 / 100,000 条文章记录；这不是磁盘耗时测试。
- 批量投稿入口：生产组件渲染在 attempted refs 缓存存在时从 1 个按钮变为 0 个；缓存写入失败客户的路径由源码取证确认，不宣称已跑完整浏览器故障流程。

### 7.2 本轮发布时间取证

输入：生成时间 `2026-08-01T00:00:00Z`，独立发布时间 `2026-09-05T00:00:00Z`，文章阶段 `published`。

通过 `diagnosing-bugs` 的合成复现检查生产 `GeneratedArticlesList` 的渲染结果。观测到行和分组“最新”均显示 `2026-08-01 08:00:00`；期望发布时间的断言失败，退出码 1。该失败是已知 bug 的证据，不是修复完成。本次为计划取证，不进入生产修复和 cleanup 阶段；测试未读真实文章或远端账号。

复现命令（应用目录，PowerShell）：

```powershell
node --import ./media-workbench/node_modules/tsx/dist/loader.mjs --input-type=module -e 'import React from "./media-workbench/node_modules/react/index.js"; import {renderToStaticMarkup} from "./media-workbench/node_modules/react-dom/server.node.js"; import List from "./media-workbench/src/components/content/GeneratedArticlesList.tsx"; import {load} from "cheerio"; import assert from "node:assert/strict"; const article={id:"a",clientId:"c",title:"Synthetic article",createdAt:"2026-08-01T00:00:00Z",publishedAt:"2026-09-05T00:00:00Z"}; const noop=()=>{}; const html=renderToStaticMarkup(React.createElement(List,{groups:[{key:"g",platform:"lieju",label:"fixture",templateSnapshot:null,articles:[article]}],visibleError:"",clientId:"c",collapsed:{g:false},selected:[],workflowByArticle:new Map([["a",{stage:"published",label:"已发布",publicationSummary:{status:"published",label:"已发布"}}]]),isArticleSelectable:()=>false,isArticleSubmittable:()=>false,commandBusy:()=>false,onToggleCollapsed:noop,onToggleGroup:noop,onToggleArticle:noop,onOpenArticle:noop,onOpenPublication:noop})); const text=load(html).root().text(); console.log(text); assert.ok(text.includes("2026-09-05 08:00:00"),"Published article must display publication time, not generation time");'
```

该最小复现只证明列表未消费独立发布时间，不证明当前生产 article DTO 已有 `publishedAt`。正式回归必须从实际发布档案/只读模型进入组件，不能为了让上述注入字段生效而新增旁路事实。

### 7.3 进展记录

- 2026-09-05：完成范围收敛、用户时间需求登记、源码取证、确定性显示错误复现及计划编写；D1/D2 待用户确认。
- 2026-09-06：用户回复“1.接受，2.同意”，D1/D2 已确认；更新本计划和工作索引，实施状态仍为 `PENDING`。未修改生产源码、未执行 Git 提交或真实外部操作。
- 2026-09-06：A 已通过 PR #22 合并，B 已通过 PR #24 合并；C 从 `master` `3498eb64f9c87291254af821186e2974c9f7d3ec` 建立 `codex/generation-publication-optimization-c-read-amplification`，PR #25 仅治理批量生成 identity read amplification。
- 2026-09-06：C 将逐任务新建全库身份索引改为 ContentStore 实例级惰性 live index，并在 create/save/trash/restore/purge mutation seam 内维护或失效；bounded re-audit 同时关闭了 `ArticleMutationCoordinator` 绕过 ContentStore 导致 stale index 的合法写路径。
- 2026-09-06：PR #25 run #237 取得真实 100/1,000 articles × 100 lookups 和 1,000-task 数据；该轮仅 3 个 benchmark 口径断言失败，其余 1932/1935 项通过。修正测试口径并限制持续 CI 不再重放病态旧实现后，代码 HEAD `196b008195cba77b8e6b5fe5b78f6d57f67f38af` 的 run #238 required jobs 全绿。
- 2026-09-06：包含完整 C 证据的文档 HEAD `7d8e7986fc4f64b81ae4a9426a504476e9e936ca` 在 run #239 完成 SUCCESS；本次状态收口提交只修改本计划文字，合并前仍要求 PR 当前 HEAD required checks 绿色。
- 2026-09-06：C 已通过 PR #25 合并，master 为 `3dc7d59a6d2fa4507e7daf326323ce40b5509ae3`；L 从该真源建立独立分支并完成 A/B/C 直接组合调用链收口审计。当前 0 个阻塞 finding，无生产代码修复、无 bounded re-audit；L PR 同一最终 HEAD CI evidence 待闭合。D 未开始，E 未开始且未授权，无真实外部副作用。
