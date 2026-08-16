# Post-Wave 投稿架构收尾优化计划

**Status:** `PARTIAL / POST_WAVE_CLOSEOUT`

**职责：**把 2026-08-16 架构排查中确认的四个候选收敛为一条可串行实施、可审计、可停止的独立收尾计划。它以既有 Wave/Ticket 全部完成为前提，不属于新的 Wave/Maintenance，不写入或回填 `ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md`，也不重开任何已完成 gate。

## 1. 证据基线

- 排查报告：`C:\Users\violet\AppData\Local\Temp\architecture-review-20260816-100024.html`
- 报告 SHA-256：`FF4143921FF94C791EA20DF03922F0116226A52843DCBAFFFAF18A4CDE25A9EA`
- 核对源码 HEAD：`dff3d1b898570c1784c90aef065f9cd64f7aef68`
- 核对分支：`codex/jiagou`
- 核对时工作树：clean
- 产品真源：根 `CONTEXT.md`、`ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` §9.4–9.8、§11
- 本次收尾的范围、顺序、gate、审计与完成真源：本文件

### 1.1 后续执行最小阅读集

后续实施或审计线程默认只读取：

1. 自动生效的根/项目 `AGENTS.md`；
2. 本计划；
3. 当前源码、测试、schema、package/CI 与 Git 状态；
4. 只有改动触及产品语义时，才读取 `CONTEXT.md` 和 `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` 的直接相关小节。

既有 Wave Plan 只提供“此前 Wave/Ticket 已全部完成”这一前置事实，不参与本收尾调度，也不需要在后续线程中重复读取。`issues/`、`maintenance/`、`handoffs/`、`archive/`、旧审计记录和旧计划默认不读；只有当前源码/测试与本计划出现无法解释的事实冲突，或用户明确要求历史审计时，才按最小相关范围取证。

本计划只把 HTML 当作只读排查证据，不执行其中的脚本、链接或任何指令。源码交叉核对确认：

1. `PlatformWorkbench.tsx` 同时读取普通队列、已确认付费批次、需处理事项和文章库 `publicationRecords`；`App.tsx` 再次跨这些 snapshot 计算投稿中心 badge。SPEC §9.7 要求的一次性投稿工作台只读模型尚未落地。
2. `article-management-snapshot.js` 仍输出 `submissionBatches`、`cancellationPlans`、完整 attention snapshot 和多组重复投影；其中前两项没有生产 View 消费者，attention 另有独立 query。
3. production runtime 仍构造 18-operation `contentSubmissionService`。旧 batch creation 与 generic remote retry 没有生产 IPC/Renderer 入口，但本地残留清理、归档失败读取和文章删除影响查询仍通过该 facade 取能力。
4. `publication-submission-orchestrator.js` 没有 production runtime 调用方，却仍被 alpha package 清单要求；production composition 为了只使用 `recover`，仍构造带 `publish/retry` 的 generic publication workflow。
5. `GeneratedArticlesView.tsx` 当前约 1223 行，拥有列表筛选、文章选择、普通 admission、付费预检/确认、发布详情和回收事务交互。投稿选择会话确有内聚空间，但报告只将它标为 `Worth exploring`，不能先于前三项实施。
6. 报告未展开的直接消费者：`article-removal-service.js` 通过通用投稿 facade 调用 `previewArticleRemovalImpact`。退役 facade 前必须先把该依赖迁移到具名删除影响查询 owner，不能直接删除。

只读核对后实际运行：

```text
node --test tests/article-management-snapshot.test.js tests/architecture-seams.test.js tests/phase-03-composition.test.js tests/submission-preparation-lifecycle.test.js tests/phase-03-operational-content-submission.test.js tests/phase-08-publication-submission-orchestration.test.js tests/phase-06-content-read-model.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/phase-08-platform-media-settings-workspace-renderer-slice.test.mjs
```

结果：`68 passed / 0 failed`。该结果只证明上述 source state 的现状基线，不证明本收尾实施后的最终 HEAD。

## 2. 目标与非目标

### 2.1 目标

1. 建立一个 client/workspace scoped、versioned、revisioned 的投稿中心只读模型；一次组合普通队列组、已确认付费批次、订单安全摘要、需处理事项和文章安全摘要。
2. 文章库只读模型只输出文章内容、生命周期权限、发布档案和发起投稿所需目录；内部仍可读取运行事实完成投影，但不向 Renderer 泄漏投稿中心原始事实。
3. 将真实维护、删除影响查询和启动恢复迁移到具名 owner 后，删除无 production consumer 的 generic batch/retry/orchestrator surface 及过期 package/test 要求。
4. 在前三项完成后重新评估并视 gate 结果内聚临时投稿选择会话，让 View 只展示 session snapshot 和提交用户意图。
5. 保持普通队列、付费批次、订单、需处理、文章生命周期和删除状态机的唯一 owner 不变。

### 2.2 非目标

- 不改变普通平台 `accepted | article_rejected | group_blocked | uncertain` 产品语义。
- 不改变付费预检、费用确认、订单创建、不确定结果或人工核对语义。
- 不新增自动重试、同文多目标、发布后再投稿或公开页面轮询。
- 不删除 OperationalStore 中现存队列、批次、订单、发布、恢复或最小审计事实；默认不做 schema migration。
- 不重写平台 adapter、媒体供应商协议、图片传输或真实发布流程。
- 不用通用 `SubmissionManager`、workflow engine 或 compatibility facade 替代当前 facade。
- 不以文件行数、私有函数名或源码字符串作为业务正确性证据。

## 3. 方案取舍

| 方案 | 结论 | 理由 |
| --- | --- | --- |
| 保持 Renderer 拼接，只抽一个 React hook | 不采用 | revision 仍来自多个 query，业务标签和 badge 推断继续泄漏到 Renderer，违反 SPEC §9.7。 |
| 继续扩宽文章库 snapshot，把投稿中心也塞进去 | 不采用 | 会让文章库成为跨领域聚合 facade，无法收窄 interface，也会混淆文章库与投稿中心 owner。 |
| 新增通用 submission manager 统一所有命令 | 不采用 | 普通、付费、需处理和删除状态机不应合并；会建立新的业务事实 owner 或浅转发层。 |
| 新增只读组合模型，命令仍路由到现有具名 owner | 采用 | 满足一次性 revisioned read model，同时不移动状态转换和持久事实 writer。 |
| 直接删除通用投稿 facade | 不采用 | 当前残留清理、归档失败读取和删除影响查询仍有真实消费者，必须先迁移。 |
| 一次性同时重写 read model、legacy 与巨型 View | 不采用 | 修改面横跨主进程、transport、Renderer 和恢复边界，无法建立可信的 bounded review。 |

## 4. 目标 owner 与边界

| 事实/行为 | 收尾后权威 owner | 本计划允许的变化 |
| --- | --- | --- |
| 文章正文、回收站、生命周期权限 | 现有 content/lifecycle projection owner | 只收窄输出 DTO；不新增 writer。 |
| 普通平台队列与动作 | `regular-queue-application` / group orchestrator | 投稿中心模型只读取并投影；命令继续调用原 owner。 |
| 已确认付费批次与动作 | paid batch orchestrator / paid transitions | 投稿中心模型只读取并投影；命令继续调用原 owner。 |
| 需处理事项与 resolution | attention query/policy/resolver | 投稿中心模型组合安全摘要；preview/execute 仍由原 owner。 |
| 订单事实 | OperationalStore/order application | 只向投稿中心提供必要安全摘要，不复制订单状态机。 |
| 投稿中心组合 revision | 新的投稿中心只读模型 | 只读、可缓存、revision changed 时重试一次；不写业务事实。 |
| 文章删除阻塞事实 | 现有 `article-submission-removal-coordinator` 或等价具名 impact query | 从通用 facade 中解耦，直接作为窄 port 注入删除 owner。 |
| 本地队列残留与归档失败 observation | 具名 submission maintenance module | 保留真实 cleanup/observation；不得拥有远端 retry。 |
| startup uncertain recovery / post-processing drain | 具名 publication recovery composition | 生产 composition 不再构造 generic publish/retry execution。 |
| 确认前投稿选择 | Renderer 内临时 session（条件实施） | 只拥有易失 UI 状态；admission 仍由主进程 owner 决定。 |

## 5. 串行工作包

固定顺序：

`C0 → C1 → C2 → C3 → C4 gate → C5`

共享 `workspace-runtime-composition.js`、IPC registry、Renderer feature/context 和 contract/types 的工作包不得并行。每个工作包基于上一个工作包已验证的集成状态开始；是否创建 commit 以当次用户授权为准，未提交时用 `HEAD + git diff/status` 绑定 source state。

### C0 — 实时消费者清单与合同冻结

**目的：**在写 production implementation 前固定真实 consumer、公开 capability、持久事实和删除顺序。

必须产出：

1. 三个现有查询链的 before map：普通队列、付费批次、attention，以及 `App.tsx`/`PlatformWorkbench.tsx`/文章库如何组合它们。
2. `article-management-snapshot` wire 字段逐项 ledger：生产消费者、测试消费者、内部投影依赖、去向（保留/迁入投稿中心/删除）。
3. 18-operation content submission facade ledger，至少覆盖：
   - production composition consumer；
   - IPC handler 是否真实注册；
   - article-management、attention、article-removal consumer；
   - test-only 与 package-only consumer；
   - 持久事实/恢复依赖。
4. `publication-workflow` / `publication-submission-orchestrator` 的 production、test、package caller map。
5. 新投稿中心 read-model DTO v1 和 command mapping；先冻结字段、scope、revision、error code、刷新语义，再实现。
6. 冻结 query/scan budget。只允许根据真实 batch reader 数量设定常数上限；不得发明 wall-clock 门槛，也不得允许计数随文章、队列项、订单或 attention 数量增长。
7. 为现有测试建立 disposition ledger：`KEEP`、`REPLACE_WITH_PUBLIC_BEHAVIOR`、`DELETE_WITH_RETIRED_SURFACE`。不得只删红灯测试，也不得永久叠加新旧合同测试。

**停止条件：**

- 发现 repo 外仍有必须支持的通用 facade consumer；
- 发现删除旧代码必须丢弃现存业务事实或 migration history；
- 投稿中心无法从同一个 authoritative workspace revision 得到一致 snapshot；
- 需要改变产品页面、状态或人工核对动作。

上述情况需要请求用户决策。普通调用方较多、测试需要替换或文件较大不构成停止理由。

### C1 — 投稿中心一次性只读模型

**推荐 seam：**主进程新增一个投稿中心 snapshot/query service，由 workspace composition 注入现有 owner 的窄 reader；通过一个版本化 IPC capability、preload/bridge 和一个 Renderer submission-center feature 暴露。

**必须行为：**

1. 输入只接受当前 workspace runtime 下的合法 `clientId`；输出至少包含：
   - `schemaVersion`、`clientId`、统一 `revision`；
   - 普通队列组、当前项、剩余顺序、组级动作与文章安全摘要；
   - 已确认付费批次、费用/订单安全摘要、剩余项、暂停原因与允许动作；
   - 需处理事项、允许动作、目标安全标签；
   - 投稿中心 badge 所需的权威 counts。
2. 读取前后比较 authoritative workspace revision；变化时只重读一次，再变化则返回稳定 stale error。缓存 key 必须包含 workspace identity、clientId、revision。
3. DTO 不暴露绝对路径、正文、Cookie/Token、供应商原始异常、OperationalStore row 或可由 Renderer 反推状态机的内部字段。
4. 普通、付费和 attention 命令继续进入现有 owner。submission-center feature 只负责 query identity、command busy/error、stale command result 后刷新和 workspace/client scope reset。
5. `PlatformWorkbench.tsx` 不再读取 article-management `publicationRecords` 补 attention 目标标签；该安全标签由只读模型给出。
6. `App.tsx` 不再跨 `platformSnapshot`、`content.snapshot.paidMediaExecution` 和 article-management attention 自行计算投稿中心 badge。
7. 文章 intake 仍可使用 platform account/login capability；不得为了本阶段把账号状态塞进投稿中心业务 owner。
8. queue residue maintenance 可以保留为按需 maintenance query/command，不要求塞入主 snapshot，也不得影响 snapshot revision 的业务语义。

**最低测试：**

- 同一 revision 一次组合、缓存复用、revision 中途变化重读、连续变化 fail-closed；
- client/workspace 隔离、旧 query 迟到、旧 command 迟到、切换 scope 清空；
- 普通/付费/attention 的 empty/loading/error/disabled/stale matrix；
- accepted/rejected/uncertain、paid order uncertain、repair attention 的组合不改变原 owner 事实；
- badge 与三个 section 来自同一 snapshot；
- query/scan 常数预算与 0 external transport；
- IPC exact contract、preload/bridge typecheck、Renderer query/interaction tests。

**完成门槛：**删除旧 Renderer 组合逻辑后，复杂度不会散回 `App`、`PlatformWorkbench` 或三个 feature；新模块只读且没有任何 mutation capability。

### C2 — 收窄文章库 read-model interface

**依赖：**C1 已提供投稿运行事实的新去向。

**实施要求：**

1. `article-management-snapshot` 内部继续批量读取生命周期所需事实并由唯一 lifecycle projection 计算权限；不得让 Renderer 重新计算 stage、locks 或 reason code。
2. 公开输出只保留文章库需要的：文章/回收站内容摘要、生命周期分类与权限、发布档案/发布详情、投稿入口目录、计数和 scope/revision。
3. 从 production wire、projector、bridge、types、feature default、props、fixture 和测试同步移除无消费者字段：
   - `submissionBatches`；
   - `cancellationPlans`；
   - 重复的完整 attention snapshot；
   - 已被 `workflowByArticle` 覆盖且无消费者的平行 summary maps。
4. 从 Renderer-facing workflow DTO 删除 legacy alias/shape：`locks.canQueue`、`operations.queue`、`operations.retarget`。内部 lifecycle/admission owner 仍可使用其现有具名操作，本阶段不强迫重命名内部稳定合同。
5. `publicationRecords` / `publishedArchives` 只保留文章库发布详情真实需要的安全字段；不得为了瘦身删除发布事实或最小审计证据。
6. `submissionPlatforms` 必须改由具名投稿入口目录提供，不能因 C3 删除 generic facade 而继续隐式依赖旧 batch planner。
7. 所有删除以 C0 consumer ledger 为准。发现新的真实 View consumer 时先迁移到正确 read model，不保留 optional legacy field。

**最低测试：**

- 五类文章状态与 edit/submit/trash/restore/purge 权限状态矩阵；
- 发布详情、回收站、批次筛选、投稿入口目录和客户切换回归；
- wire exact-object 验证和 legacy field absence gate；
- snapshot cache/revision/批量读取 benchmark；
- Renderer fixtures 与 production IPC matrix 同步收敛；
- 不以源码 regex 证明业务行为，absence test 只验证公开合同/legacy surface 消失。

**完成门槛：**文章库 Renderer 不再获得普通队列组、已确认付费批次、attention 原始列表或取消计划；其可用动作仍完全由 lifecycle owner 输出。

### C3 — 迁出真实能力并退役 shadow submission chain

**依赖：**C1/C2 已清除 article-management 和 Renderer 对旧 facade 的读依赖。

按以下顺序实施，不能先删后补：

1. **删除影响查询迁移**
   - 复用现有 `article-submission-removal-coordinator` 或以相同 owner 形成窄 `previewArticleRemovalImpact` port；
   - composition 直接注入 `article-removal-service`；
   - 不允许 article removal 自行写/移出/取消队列，不建立第二个 lifecycle projection。
2. **投稿维护模块具名化**
   - 保留 `preview/cleanupTrashedArticleQueueResidue` 和 `listArchiveFailures`；
   - 维护模块只做本地残留清理、归档失败 observation 与安全诊断；
   - cleanup failure 不覆盖业务错误，不触发远端投稿或订单 retry。
3. **发布恢复模块具名化**
   - production composition 直接组装 startup uncertain recovery 与 post-processing drain；
   - `recover` 仍把 stranded remote-started 结果保真为 uncertain，并继续处理 post-processing；
   - production runtime 不再为了 `recover` 构造 generic `publish/retry` execution，也不再需要一个只为影子执行存在的 publisher dependency。
4. **删除无消费者 surface**
   - 删除 18-operation `content-submission-application` facade；
   - 删除 production 不可达的 generic batch preview/create/cancel/reconcile 与 generic failed-publication retry capability；
   - 删除 `createSubmissionInterface` 中没有 handler 的 preparation/retry namespace；
   - 删除 test-only `publication-submission-orchestrator` 及 alpha/package 对它的强制要求；
   - 对 `src/application/publication-workflow/*` 做 consumer-led disposition：恢复/后处理迁入具名模块后，删除只支撑 generic publish/retry 的 production files 和 test-only composition；不得保留“以后也许会用”的兼容层。
5. **测试替换而非叠加**
   - legacy generic execution 测试按风险迁入 regular queue、paid batch、recovery、post-processing、removal-impact 或 maintenance 公开行为测试；
   - 只有已经被当前 owner 行为覆盖的旧测试才可删除；
   - package gate 应验证真实 production runtime 所需文件存在以及 retired file absence，不再要求 test-only 文件进入包。

**必须保留的不变量：**

- startup recovery、post-processing drain、队列残留清理、发布归档修复和删除阻塞查询继续工作；
- uncertain 不自动重试；
- ordinary/paid execution 仍各自拥有状态机；
- 现存 OperationalStore facts、migration journal 和 archive evidence 不删除；
- production composition 只有一个 OperationalStore writer，外部不依赖 `internal/`。

**最低测试：**

- startup stranded claim → uncertain，0 次远端 publish/retry；
- post-processing complete/deferred/failed 与 restart drain；
- 本地 residue preview/confirm/cleanup、归档失败 observation、cleanup failure diagnostics；
- article removal impact 的 queued/claimed/remote-started/uncertain/published/order/open-transaction 阻塞矩阵；
- retired facade/orchestrator/capability/package absence；
- regular/paid admission、outcome、cancel remaining、manual resolution 直接回归；
- desktop composition、IPC registry、production package manifest 与 smoke。

**完成门槛：**删除 generic facade/orchestrator 后，真实复杂度只回到具名 maintenance、removal impact、recovery、regular 和 paid owner，而不是散落到 composition/IPC/UI。

### C4 — 临时投稿选择会话（条件实施）

C4 不是默认因文件较长而强制拆分。C3 完成后先运行 gate：

- 普通/付费选择、target、preflight token、confirmation、busy/error、client/workspace stale reset 仍由 `GeneratedArticlesView` 协调；
- 至少两个交互路径需要理解同一组 session 不变量；
- 抽取后能通过一个 snapshot + 少量 intent 收窄 View interface；
- 不需要新增持久状态、主进程业务规则或通用 command dispatcher。

四项全满足则实施；否则记录 `DEFERRED_WITH_EVIDENCE`，本收尾不因机械拆文件而阻塞 closure。

**若实施：**

1. 新模块只拥有确认前易失状态：选中文章 identity、模式、目标、预检结果、确认 token、busy/error/feedback 和 stale reset。
2. 普通 admission、付费预检/确认均通过现有具名 adapter；主进程继续做最终 eligibility、费用和原子冻结判断。
3. client/workspace/selection/target 改变时废弃旧 token 和旧 async result；关闭或 unmount 不产生持久事实。
4. 回收事务、文章编辑、发布详情和列表筛选不塞进投稿 session；它们留在各自组件/feature。
5. `GeneratedArticlesView` 只展示 session snapshot、提交意图和处理导航；不得访问 Electron transport 或复制 reason-code 状态机。

**状态矩阵：**

- open/close/reopen；
- regular preview → confirm/cancel/error/stale；
- paid preview → target change/token stale/confirm/cancel/error；
- client/workspace/selected articles change during in-flight request；
- double-click/duplicate command/busy guard；
- success 后 selection/session 清理；
- dirty article 不进入 session；
- preflight/confirm failure 不伪造入队、批次或订单事实。

### C5 — Combined audit 与 closure

1. 对 C1～C4 最终组合边界执行一次 Primary Audit；不重做已完成历史 Wave 的全库 review。
2. finding 按 `INTRODUCED_BY_CHANGE`、`EXPOSED_PREEXISTING`、`CROSS_COMPONENT_INTERACTION`、`PROCESS_EVIDENCE_GAP` 分类。
3. 修复 blocking findings 后只执行 bounded re-audit，覆盖 finding、修复 diff、受影响调用方和状态矩阵。
4. 只有公开合同、schema、事实 owner、事务/远端副作用边界变化或新 P0/P1 才扩大审计范围。
5. 所有 production/test/package 修改进入同一个最终 source state 后，运行最终 gate 并绑定 `HEAD + diff/status` evidence；旧 HEAD 的 68-test baseline 不能替代。
6. 不更新 Wave Plan，也不新建 Maintenance/Ticket。实施期间的 source state、命令、finding、修复与最终结果集中写入本文件末尾的 closure record；除非用户明确要求，不再创建新的 handoff。

## 6. 最终验收矩阵

- [ ] 投稿中心一个 query 返回普通、付费、attention 和 badge 所需一致 snapshot。
- [ ] 所有 section 共享一个 authoritative revision；stale/reordered result 不覆盖新 scope。
- [ ] Renderer 不再跨 article-management、platform、paid 和 attention snapshot 推断标签或动作。
- [ ] 文章库 wire 不含 `submissionBatches`、`cancellationPlans`、完整 attention snapshot 和重复 summary maps。
- [ ] Renderer-facing article workflow 不含 `canQueue`、`queue`、`retarget` legacy shape；内部 admission owner 行为保持正确。
- [ ] 文章删除影响查询不再依赖通用投稿 facade，且仍只读、fail-closed。
- [ ] residue cleanup、archive failure observation、startup recovery 和 post-processing drain 保留。
- [ ] generic batch/retry facade、test-only orchestrator 和过期 package requirement 消失。
- [ ] uncertain 路径没有自动远端 retry，startup recovery 也不产生远端请求。
- [ ] regular/paid/attention/removal 各自唯一 owner 未增加 writer、锁或状态机。
- [ ] 投稿选择 session 若实施，只保存易失 UI 状态；若 defer，有 gate evidence。
- [ ] query/scan 数量为预先冻结的常数预算，0 external transport。
- [ ] Renderer 覆盖 loading、empty、error、disabled、confirm、stale、client switch 和 narrow layout。
- [ ] contract/IPC/preload/bridge/types/fixtures/tests/package 同步删除 legacy surface，无 compatibility alias。
- [ ] Primary Audit、blocking remediation、bounded re-audit 和最终 source-state gate PASS。

## 7. 验证阶梯

实施时按风险逐级执行，具体文件名以 C0 ledger 和最终测试发现为准：

1. owner/query unit：submission-center snapshot、article-management snapshot、maintenance、removal impact、recovery/post-processing。
2. contract/integration：IPC exact contract、production registry、preload/bridge、workspace composition、scope/revision race。
3. state/failure：regular/paid/attention/removal/uncertain/restart/idempotency matrix。
4. Renderer：submission center、article library、intake session、navigation badge、responsive 和 customer/workspace switch。
5. 架构/absence：唯一 owner、no `internal/` dependency、retired facade/orchestrator/capability/package absence。
6. 性能：冻结后的 query/scan budget；wall clock 只记录 p50/p95，不在无同环境批准基线时设 pass/fail。
7. build/gate：`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`、`npm run build:renderer`、相关 packaging tests；C0 根据真实影响面决定是否再运行完整 `npm test` 和 production package smoke，并把未运行项及理由写入 closure record。
8. `git diff --check` 与最终 `HEAD + diff/status` evidence。

自动化测试只使用合成数据、隔离 OperationalStore 和 fake transport。真实登录、投稿、付费、取消、订单核对或生产迁移不属于本地 closure；如要执行，必须另获当次明确授权。

## 8. 风险与回退原则

| 风险 | 预防/检测 | 回退原则 |
| --- | --- | --- |
| composite snapshot 出现跨 revision 混合 | 统一 revision 前后校验、一次 bounded retry、race test | 保持旧 query 到当前工作包通过后再删除；不建立双写。 |
| 收窄文章库 DTO 误删真实消费者 | C0 字段 ledger + exact contract/fixture matrix | 迁移消费者到正确 read model，不恢复 optional legacy field。 |
| 退役 facade 误删删除/恢复能力 | 先迁移 impact/maintenance/recovery，再做 absence gate | 只撤销当前工作包的 in-scope 改动并保留用户改动；不恢复 generic remote retry。 |
| 测试删除造成风险缺口 | disposition ledger，replace-don't-layer | 恢复风险覆盖测试到新 owner interface，而不是恢复旧 production API。 |
| Renderer session 成为第二状态机 | 仅易失状态、主进程最终 admission、scope/token stale tests | gate 不满足则 defer，不机械抽象。 |
| package 清单继续携带 test-only 文件 | production caller manifest + packaged smoke | package 跟随真实 runtime；不靠强制打包死文件保绿。 |

## 9. 需要向用户询问的条件

当前没有阻断本计划编写的产品不确定项。实施前/实施中只在以下情况请求用户决定：

1. 是否开始实施本收尾计划；本文件的建立与修订本身不代表实施授权。
2. consumer inventory 证明 repo 外存在必须继续支持的通用 facade/API 消费者。
3. 必须新增/删除 schema、迁移或业务事实，且无法保持现存记录无损。
4. 需要改变投稿中心页面、公开动作、文章分类、uncertain/manual-resolution 或发布后只读语义。
5. 需要真实账号、真实发布、付费、取消、生产数据或供应商环境验证。

普通实现路径、文件命名、局部测试失败、in-scope finding、fixture 更新和可由当前合同消解的调用方迁移不请求产品决策。

## 10. 完成定义

本收尾只有在以下条件全部成立后才能标记 `COMPLETE`：

- C0～C3 已按串行 source state 完成；C4 已实施或有合规 defer evidence；
- 业务事实 writer owner 数量没有增加，且不存在新旁路 writer/状态机/compatibility layer；
- 所有 blocking findings 关闭，bounded re-audit PASS；
- 最终 production source、contracts、tests、package gate 和文档已进入同一可识别 source state；
- 最终验证在该 source state 实际运行并 PASS，evidence 记录命令、结果、HEAD、diff/status 和环境；
- 本文件的 closure record 记录改动文件、实际测试、未运行验收及原因、剩余风险和 Git 状态；
- closure record 已在本文件内绑定最终 `HEAD + diff/status` 与真实验证结果；Wave Plan、既有 Ticket/Maintenance 和历史 handoff 保持不变。

## 11. Closure record（实施时填写）

- **Execution status:** `PARTIAL`
- **Current gate:** `C4 COMPLETE / C5 READY`
- **Base HEAD:** `ed81e6c47e0c12b8d03766268550841e1c4fdc45`
- **Final source state (`HEAD + diff/status`):** C3 已进入 commit `3f5931cc4a51f6b9ce45c46de4cc80900b3804ff`，C3 closure record 已进入 `b6e7365fe3abf1ae826bf29cc48b2366699b6f89`；C4 基于该 clean HEAD 实施，当前以 `HEAD b6e7365 + working-tree diff` 绑定未提交 source state。
- **Implemented scope:** C0～C3 已完成；C4 四项 gate 全满足后，新增只拥有确认前易失状态的 Renderer session hook，统一 selection snapshot、mode/target、paid preflight token、feedback/error、同步 pending guard 与 workspace/client/selection/target stale fencing；View 只消费 snapshot/intents，普通/付费命令仍进入既有具名 owner，回收/编辑/详情/筛选未迁入 session。
- **Commands and results:** C0～C3 evidence 见 §12～§15；C4 最终 Renderer build、Renderer/bridge typecheck、8 项投稿会话直接交互矩阵、相邻 content feature/attention/responsive 回归与 diff check PASS，见 §16.4～§16.5。
- **Audit findings and disposition:** C0～C3 见既有记录；C4 Primary Audit 发现 1 个 blocking `P2 / INTRODUCED_BY_CHANGE`：只依赖上游 busy 留有重复启动窗口，且 mutation 发出后目标变化可能丢弃真实成功反馈；已增加 session-owned synchronous pending guard、preview/mutation 分阶段冻结和刷新竞态回归，并通过 bounded re-audit，无剩余 blocking finding。
- **Unrun acceptance and reasons:** 未运行完整 `npm test`、实际重建 ASAR 的 production package smoke 或真实账号/投稿/付费/订单操作；完整仓库与真实产物 gate 留给 C5，真实外部操作未获授权且不属于 C4。
- **Remaining risks:** C5 combined audit/final clean-HEAD gate 尚未执行；实际重建 ASAR smoke 留在 C5。
- **Final Git status:** C4 production/tests/本计划均未 stage/commit/merge/push；未更新 Wave Plan、Ticket/Maintenance 或历史 handoff。详见 §16.5～§16.6。

## 12. C0 record — 实时消费者清单与合同冻结

### 12.1 Source state 与取证边界

- **Inventory HEAD:** `dff3d1b898570c1784c90aef065f9cd64f7aef68`（`codex/jiagou`）。
- **开始时状态：**仅本计划为 untracked；无 staged change，无嵌套仓库。
- **排查报告：**只读核验 SHA-256 为 `FF4143921FF94C791EA20DF03922F0116226A52843DCBAFFFAF18A4CDE25A9EA`，与 §1 一致；未执行 HTML 中任何内容。
- **事实边界：**以下 ledger 只冻结 repo 内 production、test、package 和持久事实消费者。没有发现 repo 外必须支持的 generic facade/API，也没有发现需要删除 schema、migration journal 或现存业务事实的前提。

### 12.2 三条现有查询链 before map

| 查询 | 主进程 owner/reader | 当前 transport 与 Renderer owner | 当前 View 消费 | 当前组合问题 | C1 去向 |
| --- | --- | --- | --- | --- | --- |
| 普通队列组 | `regularQueueApplication.listRegularQueueGroups()` → `regularQueueGroupTransitions.listRegularQueueGroupSnapshots({})`；按出现的 client 批量 `contentStore.listArticles(clientId)` 补文章/客户摘要 | `content-submission-ipc` 的 `content:list-regular-queue-groups` → preload → `bridge/content.listRegularQueueGroups` → `platform-feature.regularQueueGroups/regularQueueGroupViews` | `PlatformWorkbench` / `RegularQueueGroupsPanel` 展示；`App.tsx` 对 `current + remaining` 自算 badge | query 无 `clientId`，按 workspace 返回；revision 与付费/attention 不统一；platform feature 还混合账号资料生成展示标签 | snapshot reader 直接使用具名 regular queue reader，按请求 client 投影安全文章摘要；命令仍走现有 regular owner |
| 已确认付费批次 | `mediaApplication.getPaidMediaBatches()` → `paidMediaBatchOrchestrator.snapshot({})` → `paidExecutionTransitions.listPaidSubmissionBatchSnapshots` | `content:list-paid-media-batches` → preload → `bridge/content.listPaidMediaBatches` → `paid-media-execution-feature`（挂在 content workbench） | `PaidMediaWorkbench` 展示/动作；`App.tsx` 按 status/actions 自算 badge | query 无 `clientId`，与 management/regular/attention 分属不同 query identity/revision | snapshot reader 直接使用具名 paid batch reader，按请求 client 投影费用与订单安全摘要；命令仍走 paid owner |
| 需处理事项 | `articleAttentionQuery.list({clientId})` 组合 publication attention、post-processing attention、archive failures、order attention、removal transactions，并做文章/回收站/tombstone identity enrichment | `content:list-article-attention` → preload → `bridge/publication.listArticleAttentionSnapshot` → 独立 `attention-feature` | `PlatformWorkbench` 展示及 preview/execute；同时 article-management 又调用同一 query 输出一份完整 `attention` | 重复查询；`PlatformWorkbench` 再查 management `publicationRecords` 补 target label；现有 enrichment 可随 attention 数量逐项读取文章身份 | snapshot 组合一次安全 attention DTO 与 target label；preview/resolve 命令仍走原 attention policy/resolver |

当前 `App.tsx` 同时读取 `platformSnapshot.regularQueueGroupViews`、`content.snapshot.paidMediaExecution`、`content.snapshot.management.attention` 计算投稿中心 badge。当前 `PlatformWorkbench.tsx` 同时读取 platform regular snapshot、content paid snapshot、独立 attention snapshot和 management `publicationRecords`。文章库 query 本身又读取 batches、publications、orders、attention 与 removal transactions 来投影 lifecycle。C1 后 badge 与三个 section 必须只读同一个投稿中心 snapshot；文章库只保留 lifecycle 所需投影和发布详情。

### 12.3 `article-management-snapshot` production wire ledger

下表以 `projectManagementSnapshot` 的 exact wire object 为准；service 内部的 raw `orders`、`workflowByArticle`、`publicationSummaries`、`attentionCounts`、`orderSummaries` 不是 wire 字段，分别被投影为 `workflowItems` 等数组。

| Wire 字段 | Production consumer | 测试/fixture consumer | 内部投影依赖 | 冻结去向 |
| --- | --- | --- | --- | --- |
| `clientId` | bridge scope 校验与 feature scope | contract/read-model/race fixtures | cache key / client ownership guard | **KEEP** |
| `revision` | management query freshness | snapshot cache/stale/benchmark/typed IPC | authoritative revision 前后校验 | **KEEP** |
| `articles` | article library、编辑/选择/筛选、navigation count fallback | article management、Renderer library/navigation suites | lifecycle 输入 | **KEEP** |
| `trash` | article trash panel、navigation count fallback | removal/library/Renderer suites | lifecycle 输入 | **KEEP** |
| `submissionBatches` | 无 View 消费；仅 feature default/type/props 残影 | lifecycle/snapshot/IPC/Renderer fixtures | 当前 lifecycle 输入；C2 应改用内部 batch facts，不出 wire | **DELETE_FROM_WIRE**（内部投影保留所需 facts） |
| `cancellationPlans` | 无 View 消费；仅 feature default/type/props 残影 | snapshot/lifecycle/IPC/Renderer fixtures及 retired batch-actions suite | 由 batch `actionPlan` 重复派生，lifecycle 不消费 | **DELETE** |
| `publicationRecords` | article library 发布详情；`PlatformWorkbench` 补 attention target label | snapshot/lifecycle/read-model/Renderer fixtures | lifecycle 输入 | **KEEP_NARROWED_FOR_LIBRARY**；投稿中心标签迁入新 DTO |
| `publishedArchives` | article library 只读发布档案详情 | Ticket 22 / preload sandbox fixtures | 不参与 lifecycle | **KEEP_NARROWED_FOR_LIBRARY** |
| `attention` | management feature default；`App.tsx` badge；无 article-library View 明细消费 | lifecycle/read-model/attention Renderer fixtures | lifecycle 输入 | **DELETE_FROM_WIRE**；内部仍批量读取用于 lifecycle，完整列表迁入投稿中心 |
| `submissionPlatforms` | `GeneratedArticlesView` 普通投稿入口目录 | library/IPC/Renderer fixtures | 当前来自 generic facade `listPlatforms` | **KEEP**，C2 改接具名投稿入口目录 |
| `workflowItems` | bridge 还原 `workflowByArticle`；`ContentWorkbench`/article library 所有 stage/permission/action | lifecycle/read-model/Renderer suites | 唯一 lifecycle projection 输出 | **KEEP_NARROWED**；C2 删除 `locks.canQueue`、`operations.queue/retarget` |
| `publicationSummaryItems` | bridge 还原平行 map；无独立 production View 读取（View 使用 workflow 内 summary） | IPC 与多个 Renderer fixtures | 从 `workflowByArticle[*].publicationSummary` 重复派生 | **DELETE** |
| `attentionCountItems` | bridge 还原平行 map；无独立 production View 读取 | IPC/lifecycle/Renderer fixtures | 与 workflow `attentionCount` 重复 | **DELETE** |
| `orderSummaryItems` | bridge 还原平行 map；无独立 production View 读取 | IPC/lifecycle/Renderer fixtures | 与 workflow `orderSummary` 重复 | **DELETE** |
| `lifecycleVersion` | 当前无 View 读取 | lifecycle/contract tests | projection contract version | **KEEP**（版本化 lifecycle DTO evidence） |
| `lifecycleCounts` | `App.tsx` article-library badge、`ArticleLibraryFilters` | snapshot/lifecycle/acceptance tests | lifecycle aggregate counts | **KEEP** |

### 12.4 18-operation content submission facade ledger

共同事实：production `workspace-runtime-composition` 构造一个完整 `contentSubmissionService`，传给 article-management、AI content/removal、attention 与 IPC。`createSubmissionInterface` 会绑定 preparation/cleanup/retry namespace，但 production handler 只注册 cleanup 的两个操作；不存在 preparation 或 retry handler。`operational-content-submission-service` 构造时还无条件执行 `batchPersistence.recoverPreparedBatches()`，该启动修复必须在 C3 做 consumer-led disposition，不能随 facade 静默消失。

| Operation | Production composition / consumer | IPC handler | test/package consumer | 持久事实/恢复依赖 | 冻结去向 |
| --- | --- | --- | --- | --- | --- |
| `listPlatforms` | article-management 投稿入口目录 | 无；仅被未使用 preparation namespace 绑定 | preparation、snapshot/benchmark fixtures | 无写入 | C2 迁至具名目录 reader 后删除 facade surface |
| `previewBatch` | 无真实 production caller | 无；仅未使用 namespace | `submission-preparation-lifecycle` | 读正文/target/preflight | `DELETE_WITH_RETIRED_SURFACE` |
| `createBatch` | 无真实 production caller | 无；仅未使用 namespace | preparation、operational、removal/cleanup tests | 写 queue files + OperationalStore batch/items；constructor recovery 修复 prepared batch | generic creation 删除；先确认 recovery 风险已由现有 migration/maintenance 覆盖或迁入具名 local recovery |
| `listBatches` | article-management lifecycle 输入 | 无 | snapshot/operational/preparation tests | 批量读 OperationalStore submission facts | C2 改接窄 batch/lifecycle facts reader 后删除 facade surface |
| `getBatch` | 无真实 production caller | 无 | operational/preparation tests | 读单 batch | `DELETE_WITH_RETIRED_SURFACE` |
| `buildSubmissionActionPlan` | 无真实 production caller | 无 | preparation lifecycle | 只读 projection/policy | `DELETE_WITH_RETIRED_SURFACE` |
| `previewCancelBatch` | 无真实 production caller | 无 | preparation lifecycle | 只读并生成易失 plan | `DELETE_WITH_RETIRED_SURFACE` |
| `cancelBatch` | 无真实 production caller | 无 | preparation lifecycle | 本地 cancel/action recovery 写入 | `DELETE_WITH_RETIRED_SURFACE`；不影响 regular/paid 各自取消 owner |
| `reconcileBatch` | 无真实 production caller | 无 | operational/preparation tests | 只读 batch + pair projection | `DELETE_WITH_RETIRED_SURFACE` |
| `previewArticleRemovalImpact` | `article-removal-service.buildImpact` 经 AI content facade 调用；startup removal recovery 也复用该 owner | 对外 handler 是 `ai-content-ipc` 的文章删除 preview，不是 submission IPC | removal、lifecycle、acceptance tests | 只读 queue/publication/order/attention/open transaction facts，fail-closed | C3 先把窄 port 直接注入 article removal，再移出 facade |
| `inspectSubmissionPair` | 无真实 production caller | 无 | preparation/diagnostic tests | 只读 queue file pair 与 store projection | 风险覆盖迁入 maintenance/diagnostic 后删除 surface |
| `evaluateItemAction` | 仅 facade 内部 module 间调用；无 facade 外 production caller | 无 | preparation/cleanup tests | policy only | 保持为 maintenance 内部实现，不再公开 |
| `isSubmissionItemExecutable` | 无 facade 外 production caller | 无 | preparation tests | policy only | `DELETE_WITH_RETIRED_SURFACE` |
| `previewTrashedArticleQueueResidue` | IPC cleanup query | **有**：`content:preview-trashed-article-queue-residue` | IPC、cleanup、Renderer residue tests/fixtures | 扫描本地 submission item views + article trash state；0 remote | C3 迁入具名 submission maintenance |
| `cleanupTrashedArticleQueueResidue` | IPC cleanup command | **有**：`content:cleanup-trashed-article-queue-residue` | IPC、cleanup、Renderer residue tests/fixtures | 本地 action recovery；逐项明确 failed diagnostic；0 remote | C3 迁入具名 submission maintenance |
| `previewRetryFailedPublication` | 无真实 production caller | 无；仅未使用 retry namespace | operational/preparation/caller-inventory tests | 读取 failed publication、batch、queue pair | 删除 generic remote retry capability |
| `retryFailedPublication` | production composition 未注入 executor，因而即使调用也不 eligible | 无；仅未使用 retry namespace | operational/preparation/caller-inventory tests | 可发远端 retry 的影子能力 | 删除；uncertain/failed 不获得自动远端 retry |
| `listArchiveFailures` | `articleAttentionQuery.readArchiveFailures` | 无独立 handler；结果进入 attention query | cleanup/attention tests | 读 `listPostProcessingAttention`，0 remote | C3 迁入具名 submission maintenance/attention reader |

### 12.5 Publication workflow / orchestrator caller map

| Surface | Production caller | Test caller | Package/static caller | 冻结去向 |
| --- | --- | --- | --- | --- |
| `src/application/publication-workflow.js` | `publication-workflow-composition` 构造完整 `publish/retry/recover`，但 production 只暴露并在 startup 调用 `recover`；attention query/resolver 收到的也是 recover-only object | `phase-03-publication-workflow`、`article-mutation-coordinator`、`phase-08-feature-development-admission`、`phase-08-publication-submission-orchestration`；旧 `phase-01-composition` 仅测试/静态架构 | alpha verifier 强制 execution/post-processing/recovery files；phase-08 gate 要求 composition file | C3 将 recovery/post-processing 迁入具名 composition；generic execution tests 按 owner 风险替换后删除 publish/retry chain |
| `desktop/services/publication-submission-orchestrator.js` | **无**；`workspace-runtime-composition` 有明确 absence test | 仅 `phase-08-publication-submission-orchestration` 直接构造 | `scripts/verify-alpha-package.js` 强制打包；test inventory 把名称当 architecture/absence 词 | 删除 test-only orchestrator，并把测试迁往 regular/paid/recovery owner；alpha verifier 改为真实 runtime presence + retired absence |
| `publication-workflow/execution.js` | 仅因 composition 构造完整 workflow 而可达，production capability 不暴露 publish/retry | generic workflow/orchestrator suites | alpha verifier 强制存在 | C3 删除或把仍需的窄 primitive 迁回具名 owner；不得留下未来兼容 facade |
| `publication-workflow/recovery.js` | startup `publicationWorkflow.recover()` 的真实 owner | workflow/composition/restart tests | alpha verifier 强制存在 | **KEEP_BEHAVIOR / MOVE_TO_NAMED_RECOVERY**；stranded remote-started → uncertain，0 remote request |
| `publication-workflow/post-processing.js` | recover drain 与 attention retry 的真实行为 | workflow/post-processing tests | alpha verifier 强制存在 | **KEEP_BEHAVIOR / MOVE_TO_NAMED_RECOVERY_OR_POST_PROCESSING** |

### 12.6 投稿中心 DTO v1、command mapping 与刷新合同

**Capability / scope**

- 新 query capability 冻结为 `content.getSubmissionCenterSnapshot`，channel 冻结为 `content:get-submission-center-snapshot`；request 是 exact `{ clientId: string }`，只接受当前 workspace runtime 中存在的 client。
- 成功 DTO 顶层 exact shape：`{ schemaVersion: 1, clientId, revision, regular, paid, attention, counts }`。`revision` 是 workspace invalidation owner 的非负整数，不采用三个子查询自己的局部 revision。
- `regular` exact shape：`{ groups }`。group 保留 `queueGroupId/platformId/accountProfileId/imageCount/imagePublishingSupported/runState/pauseIntent/current/remaining/actions/revision/createdAt/updatedAt`；item 只保留 `itemId/batchId/articleId/articleRef/regularPublicationAttemptId/phase|position/articleSummary{title,customerName}`。只输出请求 client 的 item；不得输出另一 client 的文章 identity/摘要。group actions 仍由 regular owner 给出，不在 read model 重算。
- `paid` exact shape：`{ batches }`。batch 保留 `batchId/mediaResourceId/status/pauseIntent/runState/actions/articleCount/mediaName/createdOrderCount/remainingCount/currentItem/pauseReason/quotedPrice/estimatedTotal/createdAt/updatedAt/items`；item 只保留 `itemId/articleRef/status/phase/title`。只输出请求 client 的 batch/items；费用和订单只用现有安全 snapshot，不输出供应商原始 row/异常。
- `attention` exact shape：`{ items }`。item 以现有 `ArticleAttentionItem` 安全字段为上限，并新增 owner 计算的 `targetLabel: string|null`；不再要求 Renderer 查询 publication record 或解析 target key 生成标签。只输出请求 client 的 item。
- `counts` exact shape：`{ regularItems, paidBatches, attentionItems, total }`；四项均由同一 DTO 投影。`regularItems` 等于 scoped group `current + remaining` 数，`paidBatches` 等于现有 UI 定义的 actionable batch 数，`attentionItems` 等于 scoped attention total，`total` 为三者之和。
- 明确禁止：正文、绝对路径、Cookie/Token/API key、supplier raw error、OperationalStore row、内部 claim token/lease、confirmation token、可执行 publisher/transport。

**稳定 error code**

| Code | 条件 | Renderer 行为 |
| --- | --- | --- |
| `SUBMISSION_CENTER_CLIENT_INVALID` | request shape/clientId 非法或 client 不属于当前 workspace | fail-closed，不保留旧 scope 数据 |
| `SUBMISSION_CENTER_SNAPSHOT_STALE` | 第一次读取 revision 变化后重读一次，第二次仍变化 | 展示稳定 stale error，可由用户/下一次 invalidation 刷新；本次不返回混合 snapshot |
| `SUBMISSION_CENTER_SNAPSHOT_INVALID` | 任一 reader 返回不符合安全 shape/client scope 的事实 | fail-closed，安全诊断不含正文/路径/raw row |
| `SUBMISSION_CENTER_QUERY_FAILED` | 其他可安全归一的本地读取失败 | 保留 code/category/retryability/userMessage 的安全错误 DTO；不触发 mutation/remote retry |

**刷新与 cache**

1. 读取 `revisionBefore`，按固定批量 reader 集合读取并投影，再读取 `revisionAfter`；不同则完整重读一次，第二次仍不同返回 `SUBMISSION_CENTER_SNAPSHOT_STALE`。
2. cache key exact 包含 `workspaceRuntimeId + clientId + revision`；返回 clone/frozen DTO，workspace/client 切换立即清空旧 snapshot、query token、busy/error 与迟到 result。
3. workspace invalidation、普通/付费/attention 命令成功或安全失败后刷新；stale command result 不覆盖当前 scope，只触发当前 scope refresh。手动 refresh 复用同一 query identity。
4. queue residue maintenance 不进入主 snapshot，也不改变上述 counts 语义。

**Command mapping（read model 不拥有 mutation）**

| UI intent | 现有 authoritative command owner |
| --- | --- |
| 普通 admission / remove pending | `regularQueueApplication.previewRegularQueueAdmission/admitRegularQueueItems/removePendingQueueItems` |
| 普通 group image/start/pause/start-all/pause-all | regular queue application + group orchestrator 现有具名 commands |
| 付费 preflight/confirm | paid preflight/application owner |
| 付费 start/pause/cancel remaining | paid batch orchestrator/application owner |
| attention preview/resolve | `articleAttentionResolver.preview/resolve` |
| residue preview/cleanup | C3 具名 submission maintenance；C1 期间保持现有 handler |

### 12.7 冻结 query/scan budget

预算按当前真实批量 reader 清单冻结，不设置 wall-clock pass/fail：

| Reader cluster（每次 attempt） | 最大批量调用数 | 依据 |
| --- | ---: | --- |
| authoritative revision | 2 | read 前/后各一次 |
| regular queue groups | 1 | `listRegularQueueGroupSnapshots`；文章摘要必须按请求 client 一次 bulk read，不得 per item |
| paid batch snapshots | 1 | `listPaidSubmissionBatchSnapshots` |
| attention base facts | 5 | removal transactions、publication attention、post-processing attention、archive failures、order attention 各一次；若 archive 与 post-processing 复用同一结果可低于预算 |
| scoped article identity/summary | 2 | active articles 与 trash/tombstone 走至多两个批量 reader；禁止 `getArticle/getTrashedArticle/getTombstone` 随 item 数增长 |
| **合计（单 attempt）** | **11 = 2 revision + 9 batch readers** | 文章/queue item/order/attention 数量变化时保持常数 |
| **一次 bounded retry 上限** | **22** | 第二次完整 attempt；不得有第三次读取 |
| external transport | **0** | snapshot 只读本地 owner/store/content |

测试计数以注入 reader 的 invocation counter 为准；SQLite 内部实现可用等价批量 join/scan 降低数量，但不得把一个逻辑 batch reader拆成 N 次 per-entity query。p50/p95 只记录，不作为 C1 gate。

### 12.8 现有测试 disposition ledger 与 C0 evidence

| Disposition | 现有 suite / artifact | C1～C3 处理 |
| --- | --- | --- |
| `KEEP` | `article-management-snapshot.test.js`、`article-management-snapshot-benchmark.test.js` | 收窄为文章库公开行为、revision/cache、批量 lifecycle facts 与新 budget；删除字段的正向断言改为 exact wire absence |
| `KEEP` | `article-attention-query.test.js`、`article-attention-policy.test.js`、`phase-06-attention-feature.test.mjs` | 保留 policy/resolution 行为；query identity enrichment 改批量 reader，投稿中心增加 target label/scoped tests |
| `KEEP` | `phase-07-regular-queue.test.js`、regular outcome/group/image tests | 保留 ordinary owner 行为；新 snapshot 只组合，不复制状态机 |
| `KEEP` | paid admission/execution/order resolution suites、`phase-08-platform-media-settings-workspace-renderer-slice.test.mjs` | 保留 paid owner 状态/uncertain/order 行为；新增 client-scoped read-model projection |
| `KEEP` | `article-removal-service.test.js`、`phase-05-production-removal.test.js`、Ticket 22/25-B/26-G removal acceptance | C3 改为窄 impact port 注入，保持 queued/claimed/remote-started/uncertain/published/order/open transaction matrix |
| `KEEP` | `submission-cleanup-recovery.test.js`、`content-submission-ipc.test.js`、`renderer-residue-cleanup-flow.test.js` | 迁到具名 maintenance contract；保持 local-only、confirm、partial failure diagnostics |
| `KEEP` | post-processing/restart/recovery cases in `phase-03-publication-workflow.test.js` 与 composition tests | 迁到具名 recovery/post-processing public behavior；保持 stranded → uncertain 与 0 remote |
| `REPLACE_WITH_PUBLIC_BEHAVIOR` | `phase-06-content-read-model.test.mjs`、content workbench/race tests、production IPC fixture matrix、preload sandbox | 用 submission-center exact contract、scope race、badge/section consistency 与收窄 management wire 替代旧字段 fixtures；不并存新旧 shape |
| `REPLACE_WITH_PUBLIC_BEHAVIOR` | Renderer article-attention/actions/navigation/responsive/history fixtures | attention 展示改用 submission-center snapshot/targetLabel；文章库 fixture 移除 submission/attention 平行字段 |
| `REPLACE_WITH_PUBLIC_BEHAVIOR` | `submission-preparation-lifecycle.test.js`、`phase-03-operational-content-submission.test.js` 中 generic facade/policy/reconcile/retry cases | 风险分别迁至 regular、paid、maintenance、removal impact、recovery/post-processing；只保留仍被真实 owner 使用的本地 prepared-batch recovery evidence |
| `DELETE_WITH_RETIRED_SURFACE` | `renderer-content-submission-batch-actions.test.js` 中仅验证无 View 消费的 cancellation/batch props | C2 wire/props 删除后删除；不以删测试掩盖行为回归 |
| `DELETE_WITH_RETIRED_SURFACE` | `phase-08-publication-submission-orchestration.test.js` 中只构造 test-only orchestrator/generic publish-retry 的 cases | 风险迁入 regular/paid/recovery 后随 orchestrator 删除 |
| `REPLACE_WITH_PUBLIC_BEHAVIOR` | `scripts/verify-alpha-package.js`、desktop/production packaging tests、phase-08 gates | 要求真实 recovery/maintenance/runtime 文件存在，并明确 retired facade/orchestrator/execution absence |
| `KEEP` | `architecture-seams.test.js`、`phase-03-composition.test.js` | 更新为窄 reader/owner direction、single OperationalStore writer、no `internal/` consumer 与 no generic capability |

C0 实际执行的只读/文档命令：

```text
git status --short --branch
git rev-parse HEAD
rg --files / rg -n（consumer、IPC、bridge、Renderer、test、package caller inventory）
Get-FileHash -Algorithm SHA256 architecture-review-20260816-100024.html
git diff --check -- .scratch/article-lifecycle-and-submission/POST-WAVE-SUBMISSION-ARCHITECTURE-CLOSEOUT-PLAN.md
git diff --no-index --check -- NUL .scratch/article-lifecycle-and-submission/POST-WAVE-SUBMISSION-ARCHITECTURE-CLOSEOUT-PLAN.md
node --test tests/article-management-snapshot.test.js tests/architecture-seams.test.js tests/phase-03-composition.test.js tests/submission-preparation-lifecycle.test.js tests/phase-03-operational-content-submission.test.js tests/phase-08-publication-submission-orchestration.test.js tests/phase-06-content-read-model.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/phase-08-platform-media-settings-workspace-renderer-slice.test.mjs
```

结果：HEAD 与报告 hash 均和 §1 一致；所有 ledger 引用的当前文件存在；18/18 facade operation 与 16/16 management wire field 均有 ledger disposition；tracked diff check exit 0；由于本计划原本就是 untracked，新文件 no-index check 按 Git 语义 exit 1（表示存在 diff），但没有 whitespace-error 输出，仅有 LF→CRLF 工作树提示。上述现状矩阵实际运行 `68 passed / 0 failed`。C0 未改 production/test/schema/package，故未运行 typecheck、build、full `npm test` 或 package smoke；68-test 结果只验证 C0 inventory 所依据的当前源码，不证明 C1～C5。

### 12.9 C0 Primary Audit

- **Scope：**§12.2～§12.8、其直接 owner/consumer、持久事实与 package/test caller。
- **Checked invariants：**没有新增 writer；没有把 generic retry 认作真实 capability；prepared-batch startup recovery、residue cleanup、archive failure observation、removal impact、startup uncertain recovery 与 post-processing 均有明确 disposition；DTO 不含敏感正文/路径/token/raw row；budget 为 entity-count independent 常数。
- **Findings：**`P2 / INTRODUCED_BY_CHANGE`：初稿把 `C0_COMPLETE / C1_READY` 混入固定状态字段，违反项目状态词表；已把 status 收敛为 `PARTIAL`，工作包 gate 单列为 `C0 COMPLETE / C1 READY`。`PROCESS_EVIDENCE_GAP` 已关闭：alpha package 对 test-only orchestrator 的强制要求、facade constructor recovery 与 attention per-item enrichment 均已进入 ledger/gate，而非遗漏。
- **Blocking / deferred：**无 blocker；C1～C5 acceptance 按串行计划 deferred，不属于 C0 缺口。
- **Bounded re-audit：**只复核状态字段、closure record 与 §12.9 修复 diff；固定状态值和 gate 已分离，未改变 DTO、owner、budget 或 disposition，PASS，未触发 escalation。
- **Conclusion：**`PASS`；C0 `COMPLETE`，C1 `READY`。C0 仅冻结合同；不得据此跳过 C1 的 public behavior tests 或直接删除 facade。

## 13. C1 record — 投稿中心一次性只读模型

### 13.1 Source state 与实施边界

- **Base / closure：**基于 `dff3d1b898570c1784c90aef065f9cd64f7aef68`（`codex/jiagou`）实施；用户在 C1 closure 后明确授权提交，所有 C1 source/test/evidence 进入同一个 closure commit。
- **执行模式：**Manual Dispatch；只实施 C1、Primary Audit、finding remediation、bounded re-audit、定向验证和本 closure record。未进入 C2 或完整仓库 gate。
- **外部副作用：**全部测试使用合成数据、临时 workspace、fake transport 或 headless Renderer；未执行真实登录、投稿、付费、取消、订单核对或生产数据操作。
- **Owner 边界：**新增 owner 只组合现有 regular/paid/attention reader，不提供 mutation；ordinary、paid、attention 的命令与持久事实 writer 保持原 owner。

### 13.2 实施结果

1. 主进程新增 `desktop/services/submission-center-snapshot.js`：以 `workspaceRuntimeId + clientId + revision` 缓存；读取前后比较 authoritative revision，最多完整重读一次，连续变化返回 `SUBMISSION_CENTER_SNAPSHOT_STALE`；结果 deep-clone/deep-freeze，reader 异常转为稳定安全错误。
2. 新增 `desktop/ipc/contracts/submission-center-contracts.js`，并接入 contract registry、workspace composition、content submission IPC 与 preload。公开 capability 固定为 `content.getSubmissionCenterSnapshot` / `content:get-submission-center-snapshot`，request exact `{ clientId }`，response exact `{ schemaVersion, clientId, revision, regular, paid, attention, counts }`。
3. `regular-queue-application.js` 和 `paid-media-batch-orchestrator.js` 增加 client-scoped read；跨客户 paid batch fail-closed。`media-workbench-application.js` 下传 scope；`workspace-data-invalidation.js` 增加 `submissionCenter` scope，使既有相关 mutation 刷新新 read model。
4. Renderer 新增 `features/submission-center/submission-center-feature.js` 与 `use-submission-center-feature.ts`，由 `App.tsx` 实例化唯一 feature。投稿中心 badge、regular/paid/attention 三个业务 section 读取同一 snapshot；attention target label 由主进程 DTO 提供，不再回查 article-management `publicationRecords`。
5. bridge/types/components 与 attention hydration 已接通；旧 attention query 仍服务未迁移的真实消费者，但投稿中心路径不重复查询。普通队列的 platform/account 展示标签继续由既有 platform presentation owner 映射，业务组、项、动作、count 和 revision 不从该 projection 取值。
6. production IPC fixture inventory 从 114 更新为 115 个 capability、从 24 更新为 25 个 lifecycle query；新增 capability 的 caller → bridge → preload → registrar → state consumer 符号链闭合。

主要 production 文件：

- `desktop/services/submission-center-snapshot.js`
- `desktop/ipc/contracts/submission-center-contracts.js`
- `desktop/composition/workspace-runtime-composition.js`
- `desktop/ipc/content-submission-ipc.js`、`desktop/preload.js`
- `desktop/services/regular-queue-application.js`、`desktop/services/paid-media-batch-orchestrator.js`、`desktop/services/media-workbench-application.js`
- `desktop/workspace-data-invalidation.js`
- `media-workbench/src/features/submission-center/*`
- `media-workbench/src/App.tsx`、`components/PlatformWorkbench.tsx`、`components/PaidMediaWorkbench.tsx`、`components/RegularQueueGroupsPanel.tsx`
- `media-workbench/src/features/attention/*`、`features/workspace/workspace-coordinator.js`、`bridge/content.ts`、`types/publication.ts`

主要测试与 fixture：

- `tests/submission-center-snapshot.test.js`
- `tests/submission-center-feature.test.mjs`
- `tests/phase-07-regular-queue.test.js`
- `tests/article-lifecycle-ticket-13.test.js`
- `tests/fixtures/phase-06-production-ipc-contract-fixtures.js`
- `tests/phase-06-production-ipc-fixture-matrix.test.js`
- `tests/renderer-article-attention-actions.test.js`

### 13.3 定向验证中关闭的问题

- scoped paid reader 回归首次证明 client filter 误读不存在的 `item.articleRef`；已改用持久 DTO 的权威 `item.articleIdentityV1.clientId`，client A/B batch 隔离测试 PASS。
- 真实 Renderer fixture 首次启动时报 `Workspace scope registration is invalid`；已把 `submissionCenter` 加入唯一 workspace coordinator scope registry，并由 coordinator 驱动 invalidation refresh。
- attention 页面 fixture 原先只提供旧 attention query；已改为提供统一 submission-center snapshot，并验证同一 snapshot 的 target label 与三类 attention 展示。
- production capability matrix 曾在移除 regular presentation mapping 的试验状态下正确报告旧 named query 无 View consumer；对照 C0 exact DTO 与 C1 条款 7 后，保留既有 platform presentation owner 的 label 映射，不从其读取组/项/动作/count/revision。最终 matrix 已在最终 production source 上重跑 PASS。

### 13.4 最终命令与结果

```text
node --test tests/submission-center-snapshot.test.js tests/submission-center-feature.test.mjs tests/content-submission-ipc.test.js tests/phase-06-submission-typed-ipc.test.js tests/phase-07-regular-queue.test.js tests/article-lifecycle-ticket-13.test.js tests/article-attention-query.test.js tests/phase-06-content-core-typed-ipc.test.js tests/phase-06-production-bridge-fail-closed.test.js tests/phase-06-renderer-bridge-api-surface.test.js tests/phase-06-workspace-coordinator.test.mjs tests/phase-06-attention-feature.test.mjs tests/phase-06-content-read-model.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/phase-08-content-renderer-feature-races.test.mjs tests/phase-08-platform-media-settings-workspace-renderer-slice.test.mjs
148 passed / 0 failed

node --test tests/phase-06-production-ipc-fixture-matrix.test.js
34 passed / 0 failed; 115/115 production capabilities and 25/25 lifecycle queries closed

node --test tests/renderer-article-attention-actions.test.js tests/renderer-generation-batch-navigation.test.js tests/renderer-responsive-layout.test.js
9 passed / 0 failed

node --test tests/desktop-packaging.test.js tests/production-packaging.test.js tests/production-preload-sandbox.electron.test.js
33 passed / 0 failed

npm run typecheck:renderer
npm run typecheck:bridge
npm run typecheck:main
npm run build:renderer
all PASS; Vite only reported the existing >500 kB chunk warning

git diff --check
exit 0; only Git LF→CRLF working-copy warnings, no whitespace error

git diff --no-index --check -- NUL .scratch/article-lifecycle-and-submission/POST-WAVE-SUBMISSION-ARCHITECTURE-CLOSEOUT-PLAN.md
exit 1 because the user-supplied plan remains untracked; no whitespace-error output, only the LF→CRLF warning
```

未运行完整 `npm test`、实际构建 ASAR 的 production package smoke 和真实外部账号操作。完整仓库与产物 smoke 留给后续 combined closure；真实登录、投稿、付费、取消和订单操作不属于 C1 且未获授权。

### 13.5 Git / closure 状态

- C1 closure commit 以 `dff3d1b898570c1784c90aef065f9cd64f7aef68` 为 parent；最终 commit id、clean status 与 diff check 在提交后重新取证并由交接输出绑定。
- 用户原始 untracked closeout plan 保持原路径并更新本记录；未更新 Wave Plan，未新建 Ticket/Maintenance，也按 §C5 约束未新建独立 handoff。
- C1 implementation、tests 与本 closure record 一并提交；提交后再次执行 `git status --short`、`git show --check` 并绑定交接证据。
- **C1 conclusion：**`COMPLETE`；**next gate：**`C2 READY`。本结论代表 C1 implementation、Primary Audit、blocking finding remediation、bounded re-audit 与 directed validation 完成；不代表 C2～C5 或 combined closure 已完成。

### 13.6 C1 Primary Audit、remediation 与 bounded re-audit

- **Audit scope：**C1 production/test diff；submission-center owner、IPC/preload/bridge、Renderer 唯一 feature；regular/paid/attention 直接 reader 与 command consumer；workspace/client scope、revision/cache、query budget、exact contract 和安全错误映射。未扩大到 C2～C5、generic facade 退役或文章库 DTO 收窄。
- **Checked invariants：**投稿中心只读且无第二 writer；badge/三个 section 同 snapshot；workspace/client 切换清空旧数据并拒绝迟到结果；source 模式不触发旧 attention query；attention article enrichment 对 entity count 保持常数；旧 attention wire contract 不因 C1 扩宽；未知客户与 client-store 读取失败使用不同稳定错误；无 transport、真实投稿或付费副作用。
- **Finding 1 — `P2 / INTRODUCED_BY_CHANGE`：**空 `clientId` 时 submission-center hook 保留上一客户 snapshot。新增 `clearScope()`，invalidate query identity、清空 scope/data/query；回归测试证明迟到结果不能恢复旧数据。
- **Finding 2 — `P2 / INTRODUCED_BY_CHANGE`：**统一 source 模式在 scope change 仍调用旧 `attention.listArticleAttention`，相同 revision 下迟到结果可覆盖新 source。source 现显式绑定 `clientId`；匹配前保持新 scope 空态，只做 `replaceSnapshot`，不调用旧 query。
- **Finding 3 — `P2 / EXPOSED_PREEXISTING`（直接阻塞 C1 budget）：**production attention enrichment 逐项调用 `getArticle/getTrashed*`。composition 改注入 client-scoped active/trash batch reader；query 按 `revision + clientId` 缓存并在投影前过滤 scope。300-item counter test 证明每个 client/revision 仅两个 article batch read、零 single lookup，另一 client 不泄漏。
- **Finding 4 — `P2 / INTRODUCED_BY_CHANGE`：**C1 曾把 `targetLabel` 加入旧 `articleAttentionItem` exact schema。已从旧合同删除，只在新 submission-center DTO 中设为 required，并增加旧合同拒绝该字段的回归测试。
- **Additional direct remediation：**`validateClient` 只把 `CLIENT_NOT_FOUND` 映射为 `SUBMISSION_CENTER_CLIENT_INVALID`；其他 client-store/boundary 故障映射为 `SUBMISSION_CENTER_QUERY_FAILED`，避免把存储故障伪装成用户输入错误。
- **Bounded re-audit：**仅复核上述修复 diff、直接调用方与受影响不变量；scope/client race、late query fencing、batch invocation budget/client isolation、旧/新 exact contract、composition/IPC/Renderer consumer 均 PASS。没有公开合同、schema、writer、事务/副作用边界变化，未触发 escalation 或 fresh full review。
- **Conclusion：**`PASS`；P0/P1 为 0，直接阻塞 C1 的 P2 全部关闭，无 deferred blocker。C1 `COMPLETE`，C2 `READY`。

## 14. C2 record — 收窄文章库 read-model interface

### 14.1 Source state 与实施边界

- **Base HEAD：**`38a6c9e46cbb1322ba754170f232b4f09bffece0`（`codex/jiagou`），开始时 clean。
- **执行模式：**Manual Dispatch；实施 C2、Primary Audit、finding remediation、bounded re-audit、定向验证和本记录。未 commit、push 或进入 C3。
- **Owner 边界：**`article-management-snapshot` 内部继续读取 active/trash、OperationalStore lifecycle facts、attention、removal transactions 与 published archive，并只由 `projectArticleLifecycle` 计算 stage/locks/operations/reasons/counts；未新增 writer、schema、状态机或 mutation capability。
- **外部副作用：**测试只使用合成数据、临时 workspace、fake transport/headless Renderer；未执行真实登录、投稿、付费、取消或生产数据操作。

### 14.2 实施结果

1. `article-management-snapshot` public snapshot 删除 `submissionBatches`、`cancellationPlans`、完整 `attention`、内部 `orders` 及 `publicationSummaries/attentionCounts/orderSummaries`；这些事实只保留为 lifecycle projection 的内部输入。
2. exact IPC contract/projector、bridge、Renderer types/default、View props 与 fixtures 同步收窄；workflow wire 删除 `locks.canQueue`、`operations.queue`、`operations.retarget`，`submit` 仍可在主进程 projector 内从内部稳定 `queue` operation fallback，但 alias 不跨 wire。
3. `publicationRecords` 删除文章库不读取的 `version/articleKey/titleSnapshot`；保留发布详情实际使用的 target、状态、attempt、远端安全 identity/URL 与错误/核对码。`publishedArchives` 保留实际投稿正文、目标、结果、时间和图片摘要，因为文章库发布详情真实展示这些只读档案。
4. workspace composition 用 `loadedPlatforms` 构造现有 `submission-target-catalog` 并作为具名 `submissionPlatformDirectory` 注入；文章库不再通过 18-operation generic facade 读取 `listPlatforms/listBatches`。production lifecycle facts 存在时不调用 generic batch reader。
5. 删除仅验证无 production View consumer 的 `renderer-content-submission-batch-actions.test.js`；其余 fixture 改为新 exact shape。benchmark 改为对 10/100/1000 篇文章和 0/10/100 个 submission items 验证恒定 6 个 batch reads 与 retired wire absence。
6. C1 的 submission-center read model 移除对 `desktop/ipc/contracts/*` 的反向依赖，改为在 read-model owner 内投影自己的 paid/attention 安全 DTO；未改变 C1 public contract、revision、cache、count 或 command owner。

### 14.3 公开合同与不变量证据

- exact-object gate 证明旧顶层 submission/attention/summary 字段不再输出；嵌套 `canQueue/queue/retarget` 会被 contract 拒绝。
- 五类文章状态、发布后只读、attention/order 与分类独立、trash 冲突 fail-closed、客户切换/迟到 query fencing、生成批次筛选、发布详情/档案、回收站 restore/purge 均通过公开行为测试。
- 具名投稿入口目录测试给 generic facade 的 `listPlatforms/listBatches` 注入 throwing stub，查询仍通过 OperationalStore lifecycle facts 与 target catalog 成功。
- benchmark 的每组 fixture 均为 `1 IPC + 6 batch reads`；调用数不随文章或 submission item 数量增长，未执行 external transport。

### 14.4 最终命令与结果

```text
node --test tests/article-management-snapshot.test.js tests/article-management-snapshot-benchmark.test.js tests/architecture-seams.test.js tests/phase-03-composition.test.js tests/phase-03-six-stage-article-lifecycle.test.js tests/phase-06-content-core-typed-ipc.test.js tests/phase-06-production-ipc-fixture-matrix.test.js tests/phase-06-content-read-model.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/phase-08-content-renderer-feature-races.test.mjs tests/phase-08-feature-development-admission.test.mjs tests/article-management-filter-model.test.js tests/renderer-article-management-flow.test.js tests/renderer-article-management-filters.test.js tests/renderer-generation-batch-navigation.test.js tests/renderer-history-editor-flow.test.js tests/renderer-question-editor-session.test.js tests/renderer-responsive-layout.test.js tests/renderer-residue-cleanup-flow.test.js tests/renderer-lieju-publication-profile.test.js tests/renderer-article-attention-actions.test.js tests/article-lifecycle-ticket-22.test.js tests/ticket-25-b-lifecycle-acceptance.test.js tests/production-preload-sandbox.electron.test.js tests/submission-center-snapshot.test.js
163 passed / 0 failed; 115/115 production capabilities and 25/25 lifecycle queries closed

npm run typecheck:renderer
npm run typecheck:bridge
npm run typecheck:main
npm run build:renderer
all PASS; Vite only reported the existing >500 kB chunk warning

git diff --check
exit 0; only Git LF→CRLF working-copy warnings, no whitespace error
```

未运行完整 `npm test`、production package smoke 或真实外部账号操作；前两项按计划留给 C5 combined closure，真实操作不属于 C2 且未获授权。

### 14.5 Primary Audit、remediation 与 bounded re-audit

- **Scope：**C2 production/test diff；article-management internal facts → lifecycle projection → exact IPC → bridge/type/default/View；具名 target directory；publication detail/archive；revision/cache/batch-read budget；直接 Renderer/fixture consumer。
- **Checked invariants：**文章库没有获得普通/付费 submission runtime facts、attention 原始列表或 cancellation plan；生命周期权限仍来自唯一 owner；发布事实/档案未删除；投稿入口不依赖 generic facade；无第二 writer、schema 或远端副作用。
- **Finding 1 — `P2 / EXPOSED_PREEXISTING`（blocking architecture gate）：**C1 `submission-center-snapshot.js` 直接 import attention/paid IPC contract projector，违反 application service 不依赖 transport contract 的边界。修复为 read-model owner 自行投影其独立安全 DTO；C1 snapshot exact-contract、scope/cache/revision/budget 回归和 `architecture-seams.test.js` 均 PASS。
- **Bounded re-audit：**只复核 finding 修复 diff、submission-center direct callers、exact contract、C2 nested legacy absence、workspace composition 与最终状态矩阵；163-test 最终矩阵、三项 typecheck、Renderer build 和 diff check PASS。未改变 schema、writer、事务或外部副作用边界，不触发 escalation/fresh full review。
- **Conclusion：**`PASS`；P0/P1 为 0，blocking P2 已关闭，无 deferred C2 blocker。C2 `COMPLETE`，C3 `READY`。

### 14.6 Git / closure 状态

- 当前 HEAD 仍为 `38a6c9e46cbb1322ba754170f232b4f09bffece0`；C2 production、tests 与本计划是同一未提交 working-tree source state。
- 未 stage/commit/merge/push，未更新 Wave Plan、Ticket/Maintenance 或独立 handoff，未进入 C3。

## 15. C3 record — 迁出真实能力并退役 shadow submission chain

### 15.1 Source state 与实施边界

- **Base HEAD：**`ed81e6c47e0c12b8d03766268550841e1c4fdc45`（`codex/jiagou`），开始时 clean；该 commit 已包含 C2 closure。
- **执行模式：**Manual Dispatch；本轮完成 C3 implementation、定向验证、Primary Audit、blocking finding remediation 与 bounded re-audit；用户随后明确授权提交，未 push 或执行 C4 gate。
- **Owner 边界：**删除影响查询只读 OperationalStore lifecycle facts；maintenance 只处理本地 prepared/staging recovery、trash residue 与 archive failure observation；publication recovery 只把 stranded remote-started 标记为 uncertain 并 drain post-processing。未新增 writer、schema、远端 retry 或 transport。
- **外部副作用：**全部测试使用合成数据、临时 workspace、fake processor/transport 或静态 package fixture；未执行真实登录、投稿、付费、取消、订单核对、生产数据写入或网络请求。

### 15.2 实施结果

1. `article-submission-removal-coordinator` 现在可直接依赖具名 lifecycle-facts port；workspace composition 将该窄 port 注入 `article-removal-service`，AI/content/trash 链不再依赖通用投稿 facade。删除仍只由既有 removal transaction/lifecycle owner 执行，不自行取消或迁移队列。
2. 新增 `submission-maintenance-service.js`，公开能力仅为 residue preview/cleanup、archive failure observation 与 prepared-batch 本地恢复。原 constructor 中真实存在的 prepared/staging recovery 迁入 `prepared-submission-recovery.js` 并由 startup 显式执行；完整 evidence 提升为 queued，无 evidence 则丢弃 prepared 记录，冲突继续 fail-closed。
3. 新增 `publication-recovery.js` 与 `publication-recovery-composition.js`；startup recovery 和 post-processing complete/deferred/failed/restart drain 不再构造 publisher、generic publish 或 retry execution。stranded remote-started 只产生 manual-check uncertain，恢复对象没有 `publish/retry` capability。
4. content submission IPC 删除无 handler 的 preparation/retry namespace；真实 cleanup、regular、paid 与 submission-center handler 继续通过各自具名 owner。attention archive failure reader 改接 maintenance。
5. 删除 18-operation `content-submission-application`/service、generic batch preview/create/cancel/reconcile/retry 文件、generic publication workflow/execution、phase-01/test-only composition 和 `publication-submission-orchestrator`。保留 OperationalStore batch/order/publication/migration facts 与 regular/paid 状态机。
6. package verifier 改为要求 recovery/maintenance 真实 runtime 文件存在，并对 retired facade/orchestrator/generic execution/batch files fail-closed；Phase 8 gate 改指向 recovery composition。旧 generic 测试按 disposition 删除或迁到 recovery、maintenance、removal、regular、paid 与 mutation-owner 公开行为测试。

### 15.3 关键不变量证据

- startup stranded claim → uncertain：`publication-recovery.test.js` 验证 `manual-check` 且 recovery surface 没有 `publish/retry`。
- post-processing：complete、failed、archive-not-eligible deferred 与 restart drain 都通过具名 recovery 测试；既有 OperationalStore post-processing tests 保留。
- maintenance：failed residue cleanup、source/archive read fail-closed、prepared staging promotion 与 evidence-absent discard 均通过；cleanup 逐项诊断且不会覆盖业务错误或触发远端调用。
- removal impact：queued/active/published/uncertain/order/open transaction 与并发 claim matrix 通过；queued item 只阻塞删除，队列取消仍由原 owner 完成。
- regular/paid：admission、idempotency、uncertain、cancel remaining、global execution lock、订单同步失败保真与历史订单均通过直接 owner 回归。
- retired absence：source/static gate、115-capability TypeChecker matrix、Phase 8 dependency/unique-writer/legacy/package gate 均通过；production composition 不含 generic facade、workflow 或 publisher-router wiring。

### 15.4 实际命令与结果

```text
node --test（C3 recovery/maintenance/removal/regular/paid/attention/IPC/composition/architecture/workspace/package 定向矩阵）
最终受影响矩阵均 PASS；其中一次 149-test 组合先暴露 C2 后仍读取 management.orders 的旧断言，改为权威 paid order view 后对应 25/25 paid/regular 回归 PASS；maintenance/workspace 24/24 PASS；其余分组结果见本轮命令日志。

node --test tests/phase-06-capability-specific-inventory.test.js tests/phase-06-production-ipc-fixture-matrix.test.js
38 passed / 0 failed；115/115 production capabilities 与 25/25 lifecycle queries 通过 TypeChecker symbol identity；补齐 submission-center 显式 consumer evidence。

node scripts/verify-phase-08-gates.js
PASS；dependency direction、OperationalStore boundary、unique owners/writers、115 capability reachability、legacy absence 与 tracked generated output 全部通过。

node --test tests/alpha-smoke-verifier.test.js tests/production-packaging.test.js tests/packaging-runtime.test.js tests/phase-08-cleanup-gates.test.js
17 passed / 0 failed；current production tree、package/legacy absence 与 production packaging contract PASS。

npm run typecheck:main
PASS

node scripts/run-tests.js --list
PASS；最终发现 263 个 .test.js/.test.mjs 文件，无 deleted-test dangling entry。

node --test tests/test-discovery-contract.test.js tests/test-inventory-contract.test.js
相关 discovery/inventory tests PASS；未保留其生成的历史 M05 handoff 改写。

npx eslint <C3 changed production/new test files>
PASS，无输出。

git diff --check
exit 0；只有 Git LF→CRLF working-copy warning，无 whitespace error。
```

未运行完整 `npm test`、三项 Renderer/bridge typecheck、Renderer build、实际重新打包后的 ASAR smoke 或真实外部账号操作。C3 没有 Renderer 生产改动，主进程 typecheck 与完整 IPC symbol matrix 已覆盖直接合同；完整仓库、Renderer build 与真实产物 smoke 按计划留给 C5。真实登录、投稿、付费、取消和订单操作未获授权且不属于本地架构退役。

### 15.5 当前 gate / Git 状态

- C3 implementation、Primary Audit、blocking finding remediation 与 bounded re-audit 已完成，C3 标记 `COMPLETE`；C4 gate 变为 `READY`，本轮未执行 C4 gate。
- 最终 production/test/package source state 是 implementation commit `3f5931cc4a51f6b9ce45c46de4cc80900b3804ff`；本计划的 provenance 校正是 documentation-only，不使既有验证失效。
- implementation 与 closure record 均提交后工作树 clean；未 merge/push。
- 未更新 Wave Plan、Ticket/Maintenance 或历史 handoff；`M05-0-authoritative-test-disposition-ledger.md` 在测试工具生成后保持 HEAD 内容，不属于 C3 diff。

### 15.6 Primary Audit、remediation 与 bounded re-audit

- **Scope：**C3 production/test diff；删除影响窄 query、submission maintenance、prepared-batch recovery、publication recovery/post-processing、IPC/attention/composition、retired source 与 alpha package contract。
- **Checked invariants：**startup uncertain 不触发远端 retry；post-processing restart/deferred/failed 保真；residue cleanup 与 removal impact 不建立第二 writer；ordinary/paid owner 不变；retired facade/workflow 不进入 source 或 package；C3 runtime 文件在 package 中 fail-closed 校验。
- **Finding 1 — `P2 / PROCESS_EVIDENCE_GAP`（blocking）：**`verify-alpha-package.js` 的 retired inventory 漏掉 `phase-01-composition.js`、`publication-workflow/errors.js`、`publication-workflow/post-processing.js`，required inventory 也未覆盖 C3 maintenance/recovery 的直接运行依赖。Primary Audit 用合成 ASAR 证明：缺依赖且重新放回 retired file 时 `verifyPackage()` 仍错误成功。
- **Remediation：**补齐 C3 maintenance/recovery 直接 runtime inventory 与上述 3 个 retired file；新增 `c3-package-verifier.test.js`，用三份独立合成 ASAR 验证 baseline 通过、缺任一列明 runtime file 失败、混入任一遗漏 retired file 失败。
- **Bounded re-audit：**仅复核 finding 修复 diff、合成 ASAR 行为、package/production packaging、Phase 8 cleanup、test discovery/inventory、eslint 与 diff check；78 tests PASS，test discovery 发现 263 个测试文件且无 dangling entry。修复未改变 schema、writer、事务、公开业务合同或远端副作用边界，不触发 escalation。
- **Conclusion：**`PASS`；P0/P1 为 0，唯一 blocking P2 已关闭，无 deferred C3 blocker。C3 `COMPLETE`，C4 gate `READY`。

## 16. C4 record — 临时投稿选择会话

### 16.1 Gate 结论与 source state

- **Base HEAD：**`b6e7365fe3abf1ae826bf29cc48b2366699b6f89`（`codex/jiagou`），开始时 clean；该 HEAD 已包含 C3 implementation 与 closure record。
- **执行模式：**Manual Dispatch；本轮完成 C4 gate、implementation、定向验证、Primary Audit、blocking finding remediation 与 bounded re-audit。未 commit、push 或进入 C5。
- **Gate 结论：**四项全部满足，选择实施而非 defer：普通/付费路径仍共同协调 selection、target、preflight/confirmation、busy/error 与 scope stale reset；两条路径需要理解同一组 selection/target/token/pending 不变量；抽取后 View 可只消费一个 snapshot 与 intents；不需要新增持久状态、主进程业务规则或通用 dispatcher。
- **外部副作用：**全部自动化使用 headless Renderer、合成 workspace/client/article/media 与 fake desktop bridge；未执行真实登录、投稿、付费、取消、订单核对或生产数据操作。

### 16.2 实施结果与 owner 边界

1. 新增 `use-submission-intake-session.ts`，只拥有确认前易失状态：打开状态、文章 identity snapshot、普通/付费模式、目标、账号、付费 preflight/token、error/feedback 与本地 pending；关闭、unmount、scope/selection/target 变化均废弃旧 async result，且不写持久事实。
2. session 通过现有 `previewRegularQueueAdmission`、`admitRegularQueueItems`、`previewPaidMediaPreflight`、`confirmPaidMediaBatch` intents 调用具名 feature adapter；最终 eligibility、费用、确认 token、原子冻结与事实写入仍由主进程既有 owner 决定。
3. `ContentWorkbench` 将 `workspaceRuntimeId + clientId` 作为 session scope identity 下传；client/workspace 切换同步 fence 旧结果，随后 effect 清空 session。列表选择仍服务列表/回收交互，但打开投稿时复制为 session identity snapshot；selection eligibility 改变会关闭未提交 preview，已发出的 mutation 则冻结到明确结果，避免丢弃真实成功反馈。
4. `GeneratedArticlesView` 删除普通/付费投稿协调状态与 async command 流程，只展示 session snapshot、提交 intents、列表选择和处理导航。回收事务、文章编辑、发布详情、筛选与 lifecycle reason-code 仍留在原组件/feature，未进入 session。
5. session-owned synchronous pending guard 在 React 状态提交前即可阻止双击重复 preview/confirm；preview 阶段允许关闭或改变目标并丢弃迟到结果，`regular_admit` / `paid_confirm` 发出后冻结 session mutation intents，直到明确结果或 workspace/client scope 失效。

### 16.3 状态矩阵证据

- open/close/reopen 与 regular preview → cancel → confirm：取消确认不调用 admission，session 保留；再次确认只产生一次 admission，成功后清理 selection 并显示反馈。
- paid preview → close → target change：旧 preflight/token 被清空，未调用 confirm；新目标必须重新 preflight。paid confirm 双击只调用一次确认命令，成功后清理 session/selection。
- client scope switch + late async result：延迟 paid preflight 返回前切换客户，投稿 dialog 与 preflight 均保持关闭，迟到结果不覆盖新 scope，也不调用确认。
- command-driven management refresh race：fake admission/paid confirm 在返回前先把文章 lifecycle 投影改为 `in_submission`；session 在 mutation pending 期间不被 selection eligibility refresh 提前清空，明确成功结果仍展示且只提交一次。
- dirty/published/removal 边界：既有 dirty editor、published read-only、removal needs-repair → recovery 与窄 viewport 回归继续 PASS；session 未接管这些状态机。

### 16.4 最终命令与结果

```text
npm run build:renderer
PASS；包含 Renderer TypeScript `tsc --noEmit` 与 Vite production build。仅有既有 chunk-size warning。

node --test tests/renderer-history-editor-flow.test.js tests/renderer-responsive-layout.test.js tests/renderer-article-attention-actions.test.js tests/phase-06-content-workbench-feature.test.mjs tests/content-workbench-regression.test.js
25 passed / 0 failed；覆盖 session 普通/付费/target/scope/double-click/selection-clear、相邻 content feature、attention navigation 与响应式布局。

npm run typecheck:bridge
PASS。

git diff --check
exit 0；只有 Git LF→CRLF working-copy warning，无 whitespace error。
```

未运行完整 `npm test`、主进程 typecheck、实际重建 ASAR 的 production package smoke 或真实外部账号操作。C4 没有主进程/IPC/preload/package 改动，直接 Renderer/bridge/bundle 与交互矩阵已覆盖当前风险；完整仓库与真实产物 gate按计划留给 C5。真实登录、投稿、付费、取消和订单操作未获授权且不属于本地 session 内聚。

### 16.5 Primary Audit、remediation 与 bounded re-audit

- **Scope：**C4 production/test diff；session state/pending/scope fencing、`GeneratedArticlesView` snapshot/intents consumer、`ContentWorkbench` workspace/client identity、普通/付费具名 command adapter、相邻回收/编辑/attention/响应式回归。
- **Checked invariants：**session 只有易失 UI 状态；没有新增 writer、schema、主进程状态机、transport 或通用 dispatcher；ordinary/paid admission 仍由既有 owner 最终判断；target/selection/scope stale 不复用 token 或覆盖新状态；mutation 双击与 eligibility refresh 不制造重复命令或隐藏明确结果。
- **Finding 1 — `P2 / INTRODUCED_BY_CHANGE`（blocking）：**初版只从上游 `commandStates.busy` 派生 busy，React commit 前双击可启动两个 preview/confirm；mutation 请求已经发出后若 selection/target 投影变化，通用 stale reset 还可能丢弃真实成功反馈。
- **Remediation：**增加同步 `pendingRef` 与公开 pending snapshot，分离可废弃的 `regular_preview/paid_preview` 和已发出的 `regular_admit/paid_confirm`；所有 intents 在 mutation pending 时冻结，preview 仍可由 close/target/scope 变化废弃；selection eligibility effect 在 mutation pending 时等待明确结果。交互 fixture 增加同 tick 双击和 command-driven lifecycle refresh 竞态。
- **Bounded re-audit：**只复核 finding 修复 diff、session 直接调用方、双击/target/client/selection refresh 矩阵、最终 bundle、Renderer/bridge typecheck 与 diff check；直接 8 项 session/文章库交互全部 PASS，未发现重复 command、迟到覆盖或成功反馈丢失。修复未改变公开 IPC、schema、writer、事务或远端副作用边界，不触发 escalation。
- **Conclusion：**`PASS`；P0/P1 为 0，唯一 blocking P2 已关闭，无 deferred C4 blocker。C4 `COMPLETE`，C5 `READY`。

### 16.6 当前 gate / Git 状态

- 当前 source state 为 `HEAD b6e7365fe3abf1ae826bf29cc48b2366699b6f89 + C4 working-tree diff`；C4 production、tests 与本记录未提交。
- 工作树仅包含 C4 的 5 个 production/test 文件与本计划；无 staged change。未 merge/push，未更新 Wave Plan、Ticket/Maintenance 或历史 handoff。
- C5 combined audit、完整 final clean-HEAD gate 与实际重建 ASAR smoke 尚未执行；Manual Dispatch 到 C4 closure 停止，不自动进入 C5。
