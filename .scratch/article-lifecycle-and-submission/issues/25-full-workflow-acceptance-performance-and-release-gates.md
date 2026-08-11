# 25 — 核心地基验收、性能与交付门禁

**What to build:** 执行新文章生命周期、纯文本普通平台、网站媒体订单、迁移和删除核心流程的端到端验收用例，建立并运行可持续的性能、架构、类型和打包门禁，产出供独立审计使用的完整证据与人工验收交接；明确记录图片扩展尚未实施，不以“全流程”暗示图片已完成。

**Blocked by:** 24 — 收缩并删除全部旧业务规则

**Status:** `PARTIAL`；`25-0 — Startup Readiness`、`25-A`、`25-B`、`25-C`、`25-D`、`25-E`、`25-F`、`25-G` 已完成 package closure；25-G implementation、Independent Audit Handoff 与主任务侧 provenance 已核验并集成到新的 clean integration HEAD `c9a4ed8d692da6fd4714e25e12e6086085640c7d`。本次用户 Goal 在 25-G package closure、Independent Audit Handoff、集成和状态更新后停止；Ticket 25 / Wave 11 尚未执行 Independent Combined Audit、remediation、bounded closure re-audit、最终 clean smoke 或真实外部验收，也未达到 `COMPLETE`。

**Scheduling gate:** `SATISFIED`；波次 10 Ticket 24 与维护插槽 10.5（M04 → M05 → M06）均为 `COMPLETE`。Ticket 18–21 不属于前置依赖。启动基线与执行边界见 `../handoffs/25-0-startup-readiness.md`。

## 启动约定

- 本 ticket 是最终验收执行与证据收集，不自行承担代码/架构审计；它必须从公开行为重新生成证据，不以各 ticket 自报完成代替运行结果。完成后由用户另派独立审计 subagent 审查 diff、证据真实性和遗漏项。
- 自动化不得使用真实服务商、真实付费订单或真实平台账号；真实验证只生成用户可执行清单，不自行触发外部费用或发布。核心验收只要求纯文本外部链，不含图片专项验证。
- `25-0 — Startup Readiness` 是已完成的历史准备包，不得复用该编号。Ticket 25 的执行包固定为 `25-A → 25-B → 25-C → 25-D → 25-E → 25-F → 25-G`，全部属于同一个 Ticket 25 scope，不重开历史 Ticket，也不按 M05/M06 owner 重新分类。
- Ticket 25 的默认合同仍是 **Manual Dispatch package-by-package**：用户未授权 Continuous Goal 时，每次只调度当前最左、gate 已满足的一个执行包，不自动进入下一包、commit/merge、审计或真实外部验收。对本次用户明确授权的 Goal，`EXECUTION-PROTOCOL.md` 1.3 负责 `25-F → 25-G` 的严格 task-per-work-package 调度：每个包对应一个新的用户可见 `luna`/`max` 执行任务，主任务必须逐包等待实现/定向测试/evidence，核验后集成到新的 clean integration HEAD，再创建下一包；不得预建或并行 25-G。本次用户授权范围内允许 commit/merge，仍禁止 push。A～G 仍是同一 Ticket 25 scope 下的串行 package gate，不是七个独立 Ticket Closure；每包完成定向验证并留下可审计 evidence，但不各自开启 fresh full audit，`25-G` 后只执行一次独立 Ticket 25 / Wave 11 combined audit。本次 Goal 在 `25-G` package closure、Independent Audit Handoff、主任务集成和状态更新后停止；不进入 Independent Combined Audit、remediation、bounded closure re-audit、final clean smoke、真实外部验收或 Wave 11 final closure，也不把 25-G package closure 记为 Ticket 25/Wave 11 `COMPLETE`。该关系与停止边界见 `../handoffs/25-f-g-goal-mode-dispatch-reconciliation.md`。
- 包间传递的是前一包验证过的精确 sourceState；是否产生包级 commit 只由届时用户授权决定，不能为了串行推进擅自 commit/merge。finding 修复后只做 bounded closure re-audit，除 `AUDIT-PROTOCOL.md` 定义的 escalation 外不得再开启第三轮全量审计。
- 每个新执行包开始前必须在实际仓库重做 `EXECUTION-PROTOCOL.md` 第 2 节调度预检。前一包的退出门禁未满足时不得开始后一包分析或实现；包内发现真实产品缺陷时回到对应唯一 owner 修复，不创建 acceptance-owned service/store/state machine。

## 串行工作包与统一门禁

### 所有执行包的共同入口与退出规则

- **入口：** 当前包是 Wave Plan 中最左侧未完成包；上一包已满足退出门禁；实际 integration HEAD、累计 sourceState、分支/worktree、`git status --short`、暂存区、重复任务和直接依赖已重新核对。
- **实现：** 只修改当前包行为链及其真实 owner、直接调用方、公开合同测试和必要 evidence tooling。后续包只能记录待办，不能基于旧 HEAD 提前实现。
- **验证：** 先运行最贴近当前风险的公开行为/合同/故障注入测试；若修改生产 UI，补加载、空态、错误态、禁用态和关键交互验证。不得以读取生产源码、私有函数、内部表、源码 regex 或行数证明业务正确。
- **包级 evidence：** 更新 tracked story/state matrix，记录实际命令、结果、失败与修复、sourceState、受影响 owner、残余风险及下一包入口。generated evidence 只记录当前 sourceState 上实际运行的结果，不能沿用旧 HEAD。
- **包级审计要求：** A～F 只收集并冻结 combined audit 所需事实，不给自身代码/架构质量下 PASS 结论。每包的“审计目标”必须进入 `25-G` audit manifest；`25-G` 也不能自行确认审计通过。
- **退出：** 当前范围全部闭合、定向 gate 通过、blocking test failure 已修复、matrix 无当前包未映射条目、handoff/evidence 完整，才允许把当前包标记 `COMPLETE`，并把该精确 sourceState 作为下一包基线。任何后续修改触及已完成包不变量时，必须重跑其直接回归并更新 provenance，不机械重开 full review。

### 25-A — Acceptance Contract, State Matrix & Evidence Baseline

**入口门禁：** `25-0 — Startup Readiness=COMPLETE`；Ticket 25 调度 gate 满足；当前实际仓库预检通过。

**范围与产物：**

1. 建立受 Git 管理的 85-story tracked matrix。每个 story/可拆分 portion 至少记录 `storyId`、`portion`、`workPackage`、公开行为、证据类别（自动、模拟、用户控制）、evidence/test 引用、状态和 deferred reason；story 6、29、78–85 的图片部分逐条标记 `DEFERRED_IMAGE_EXTENSION`，纯文本部分单独映射，不得把 deferred 标为通过。
2. 建立有限状态/故障矩阵，覆盖正常成功、明确失败、uncertain/unknown、duplicate/idempotent、stale/reordered、restart/recovery、共享 owner 关键先后顺序、first-wins/terminal-priority、首次成功后的迟到远端 observation，以及删除/恢复与活动目标竞态。first-wins 至少冻结 publication success、普通平台 manual uncertain resolution、网站媒体 order-creation resolution 和 cancel-vs-publish 的竞争优先级；后续 B～E 只能补充实例和结果，不得另建第二份状态矩阵。
3. 盘点现有公开行为测试并区分“已有候选覆盖、需要补测、用户控制证据”；盘点本身不等于 PASS，不以测试名或源码字符串代替行为映射。
4. 在任何性能结果采集前，固定版本化 query/scan budget：合成数据规模、fixture 生成规则、计数边界、warm-up/重复协议、具体最大查询/扫描次数和失败输出。wall-clock 若没有执行前已批准的同环境 baseline，只定义观察协议，不现场发明通过阈值。
5. 固定 tracked evidence manifest/runner contract。production smoke 的精确调用固定为：执行态 dirty smoke 使用 `npm run pack:production:smoke:dirty -- --output build/evidence/ticket-25-production-smoke-dirty.json`；合并后的 final clean smoke 使用 `npm run pack:production:smoke -- --output build/evidence/ticket-25-production-smoke-clean.json`。25-A 必须以自动化合同验证 npm 参数透传、指定文件实际生成、provenance 完整及两条路径互不覆盖；通用 `build/evidence/production-smoke.json` 不能替代任一 Ticket 25 专用 evidence。另至少保留 Ticket 25 专用 test 与 benchmark 结果入口。每份 generated evidence 必须包含精确 commit、sourceState、Node 版本、命令、时间、结果和安全环境摘要。

**边界：** 本包不修改生命周期、队列、订单或迁移业务语义；若为了 evidence runner 增加工具，只能消费公开测试/诊断接缝，不得为测试暴露新的生产 API。tracked source 定义“验收什么”，`build/evidence/` 下 ignored generated evidence 只记录“实际运行了什么”。

**定向门禁：** matrix schema/唯一性/1–85 完整性、deferred 精确标记、状态矩阵枚举、budget schema 与数值存在性、evidence provenance/敏感字段拒绝、dirty/clean 文件名隔离的自动验证通过。

**审计目标：** combined audit 检查 story 是否完整且没有把 inventory 冒充 PASS、图片 deferred 是否精确、状态矩阵是否覆盖协议最低项、预算是否先于测量固定、generated evidence 是否可复现且无敏感数据。

**退出门禁：** tracked matrix、状态矩阵、具体 query/scan budget、evidence manifest/runner contract 均已版本化并通过定向验证；所有非 deferred story 已分配到 B～E 或明确的用户控制证据。

### 25-B — Lifecycle / Read Model / Archive Acceptance

**入口门禁：** `25-A=COMPLETE`；stories 1–21、76–77 的纯文本/核心部分已有唯一主工作包映射。

**范围与产物：** 验证生成即待投稿、显式保存、审核/来源门槛 absence、标题正文必需、队列冻结与尚未开始项单个/批量移除、一文单活动目标、旧目标结束后改投、六类入口互斥及计数、编辑权限、无复制入口、首次成功永久优先、已发布只读档案、回收/恢复/永久删除和最小订单审计保留。生产 UI 不再出现待审核、已审核或批量审核；已发布列表至少展示标题、客户、目标、时间和结果。覆盖成功高于售后/退稿、uncertain 永远冻结、已发布不回收、相似内容文章身份独立，以及 publication archive 展示实际投稿内容而不声称远端最终正文一致。

验证核心 evidence 接缝只接受并冻结 `deliveryMode=text_only`、空图片清单、`decisionKind=initial`；生产 UI 不暴露 0–5 配图、换图、降级或网站媒体图片入口。Ticket 17 图片库可以存在，但不得接入生产投稿。

**边界：** 生命周期分类仍由唯一 projection owner 从文章、目标、发布、订单和删除事实派生；Renderer/IPC 只映射和展示，不新增持久状态或旁路 writer。档案查询保持只读，删除能力不能删除订单、发布事实或最小审计证据。

**定向门禁：** 六类互斥/计数/权限的公开行为状态矩阵、保存/入队/移除/成功/退稿/售后/uncertain 组合、restore/permanent-delete 与保存/入队/活动目标的正序反序并发、档案内容和不可删除证据、相关 Renderer 类型/build（若 UI 有变化）通过。

**审计目标：** combined audit 检查 projection 是否唯一、首次成功是否永久优先、冻结/解冻是否没有第二 writer、archive 是否只读、删除事务/锁/恢复是否保留订单与发布证据、图片 UI absence 是否真实生产行为。

**退出门禁：** B 所有 matrix 条目都有公开行为结果；生命周期/档案/删除 blocking failure 已在真实 owner 修复并通过直接回归；无图片实现或 legacy 审核路线回流。

### 25-C — Regular Platform Acceptance

**入口门禁：** `25-B=COMPLETE`；生命周期冻结、活动目标和 publication-success 公开合同稳定。

**范围与产物：** 使用合成文章和假 transport 覆盖 stories 22–39：单次只选一个平台+账号、平台/账号分组、单账号隐藏层、至少两个不同普通平台组并行、当前核心同平台多账号组共享平台级锁、同组 FIFO、队列总体/当前项/剩余顺序、运行中追加到队尾并继承当前平台/账号、尚未开始项单个/批量移除、开始全部、手动暂停不被开始全部恢复、暂停全部、restart 后全部暂停、明确接受即成功、文章级失败继续、平台/认证/系统级失败仅暂停受影响组，以及第三方自媒体能力/UI absence。Story 29 的 `imageCount` portion 保持 `DEFERRED_IMAGE_EXTENSION`，不得用默认值或现有 UI 假装图片继承已验收。

对 uncertain 运行两个具名人工收口：确认已接受与确认未接受。验证 uncertain 不自动重试、暂停对应组并冻结文章；重复/重排人工决定、迟到明确成功和跨组结果不能覆盖 first-wins/单目标不变量。普通平台 submission-start 冻结的 evidence 必须为 text-only 初始决定，成功档案复用同一摘要。

**边界：** 假 transport 只模拟外部协议；adapter 不拥有冻结、重试、人工核对、队列暂停或 publication success。不得使用真实账号、真实登录、真实发布或公开页面轮询，不实现 Ticket 18–21 图片链。

**定向门禁：** 两平台并行/同组 FIFO/同平台锁、append/remove、start/pause/restart、文章级与平台级故障、uncertain 两种人工收口、duplicate/stale/reordered/late success、text-only evidence 和 UI 能力 absence 的公开行为测试通过。

**审计目标：** combined audit 检查 queue group identity、FIFO/锁/暂停 writer、错误范围、uncertain 禁止重试、人工收口 first-wins、publication-success 唯一 writer及跨平台独立性。

**退出门禁：** stories 22–39 的非图片部分全部有行为 evidence；普通平台状态矩阵通过；没有真实外部副作用、图片假实现或 adapter-owned 生命周期规则。

### 25-D — Paid Media / Order Acceptance

**入口门禁：** `25-C=COMPLETE`；单目标、冻结、首次成功和 text-only evidence 合同稳定。

**范围与产物：** 使用假供应商覆盖 stories 40–75：独立费用确认、文章数/媒体/最新价格/预计费用/系统标识展示、媒体不可用、价格变化重确认、标题 30 字限制、手机号/网址等内容风险提示与媒体备注同时展示且不自动改正文、全局投稿标识及缺失阻断、全局串行扣费、已确认批次禁止追加、独立暂停、restart 不续费、订单号门槛、余额/账号/服务级暂停、文章/资源级失败继续、成功后离队，以及文章管理高层投影。

覆盖订单创建 uncertain 禁止自动重试、可信订单号补录前远端核对、确认无订单、success/补录/无订单共享 attempt guard、不同可信订单号/解冻后不兼容新目标冲突；覆盖默认筛选、各状态计数、页面首次刷新/全部刷新/单笔刷新、刷新失败保留原事实、长期等待仅提醒、订单缺失/状态异常人工收口。覆盖待安排取消、已安排尝试取消、拒绝取消、取消传输不确定、取消与发布竞态、退稿恢复编辑、发布后售后不解冻，以及媒体/价格/标识/金额快照和不可删除历史。订单成功与档案继续冻结 text-only 初始 evidence。

**边界：** 自动化不得创建真实订单、扣费、刷新或取消真实服务商对象。供应商 adapter 只拥有传输/字段/状态映射；费用确认、批次串行与暂停、attempt guard、文章冻结、订单 observation 和人工 resolution 仍由各自现有 owner 负责。传输异常保留结果不确定或原远端事实，不自动重试、不猜测成功/失败。

**定向门禁：** preflight/价格/标识/风险提示与媒体备注、批次串行/暂停/restart、错误范围、订单号门槛、uncertain 三路竞争、刷新/缺失/人工 resolution、取消状态与竞态、退稿/售后/历史不可变、text-only evidence 的公开行为和故障注入矩阵通过。

**审计目标：** combined audit 检查付费确认与普通平台控制隔离、串行扣费及停止点、订单唯一 writer/attempt guard、unknown/uncertain 保真、取消与迟到发布 first-wins、订单历史和全局 published 事实分离、adapter 是否越权。

**退出门禁：** stories 40–75 全部有公开行为 evidence；所有不确定结果、取消/发布竞态和 immutable history 阻塞项闭合；无真实付费或供应商写操作。

### 25-E — Migration / Recovery Acceptance

**入口门禁：** `25-D=COMPLETE`；生命周期、publication、订单、target、删除公开 V1 与最终投影未发生未记录漂移。

**范围与产物：** 对隔离的合成旧库执行 dry-run、数量/阻断报告、backup、confirmation、atomic import、重开验证、backup restore、幂等重复运行和容量场景。覆盖 `MigrationJournalV1` 的 `detected → backed_up → confirmed → import_committed → verified`，在每个 phase 写入前后及 import 事务提交后立即注入崩溃；`import_committed` 只重跑验证，schema 当前但 journal 未 verified 仍阻断正常 composition。

覆盖六种 `ImportPlanV1` variant、成功优先级、历史内容/时间/图片摘要不可得、多个目标/缺订单号/身份内容冲突/deletion recovery conflict；递归拒绝缺字段、extra field、未知 enum、未来版本、重复 article/order identity 和跨 variant 冲突。证明 import 原子失败不产生部分事实、runnable queue/open remote intent/paid batch，migration root 不构造 publisher、worker、paid executor、订单查询/取消或供应商 adapter，放行后执行组仍保持暂停。

**边界：** 只使用合成副本；不读取或改写真实生产库，不调用远端，不新增 legacy compatibility writer、migration-only publication/order writer 或 internal schema 旁路。planner 不是跨事实不变量的唯一防线，OperationalStore import owner 必须二次失败关闭。

**定向门禁：** 六 variant 合同、恶意 plan、journal phase/crash matrix、atomic import/rollback、重开/backup restore/幂等、no-remote composition、正常公开投影、容量和 future-version 拒绝全部通过。

**审计目标：** combined audit 检查迁移是否复用唯一 owner/V1、journal 与 import 事务边界、成功/冲突优先级、不可得证据真实性、故障恢复是否重复 import、migration composition 是否绝无远端 capability 或 runnable facts。

**退出门禁：** 迁移与恢复矩阵在合成旧库闭合；所有故障点保留真实 journal/事实；没有真实数据操作、远端副作用、第二 writer 或 legacy 路线复活。

**上一轮 Goal 的 package closure 记录（2026-08-12，历史）：** 25-E 执行提交 `de07190ffcf25a0fce48bcb087827f394194e37d`、matrix/evidence 提交 `33657f217a2bc4edbc5dcbce5d5f9835204d497a`、handoff 提交 `3b1bc0fc9878667ee553531dc7a3a97fa1b7a8e6` 已由主任务 fast-forward 集成；主任务随后在最终状态更新 HEAD 重跑 E 直接组合 `93/93 PASS`、Ticket 25 contract（85 stories、95 rows、21 state cases、15 tracked artifacts、`sourceState=CLEAN`）、discovery `254`、lint、format 和 `git diff --check`，均通过。上一轮 A～E package closure 已完成；Ticket 25/Wave 11 保持 `PARTIAL`，上一轮 Goal 在 E 后停止。

### 25-F — Performance & Responsibility Gates

**入口门禁：** `25-E=COMPLETE`；B～E 的功能/故障矩阵在当前 sourceState 通过；25-A 的具体 query/scan budget 未被事后放宽。

**范围与产物：** 按 25-A 固定规模运行文章、普通队列和订单的批量接口/用户可感知投影 benchmark，以查询/扫描次数硬预算证明无 N+1。记录 wall-clock p50/p95、Node/OS/机器安全摘要与预热协议；只有存在执行前批准的同环境 baseline 才作耗时 PASS/FAIL，否则只记录观察数据和回归说明。

生成模块责任 evidence manifest：逐个记录本 Ticket 受影响生产模块的 owner、职责边界、公开接口/最小 capability、直接调用方、依赖方向、隐藏不变量、公开合同测试、故障 evidence 和显著规模变化理由。运行与本范围直接相关的依赖方向、架构、容量和 evidence contract gates；规模只作为审查信号，不以行数机械判定架构通过。

**边界：** benchmark 不以私有微基准替代公开批量行为，不为计数暴露新的生产 API。性能失败回到真实 query/projection owner 修复，并重跑受影响的 B～E 直接回归；不得通过提高预算、降低 fixture、排除慢路径或现场设置耗时阈值换取通过。责任清单是审计事实，不是自我架构 PASS。

**定向门禁：** 固定规模/计数口径与 25-A 一致；query/scan 全部低于或等于版本化硬预算；benchmark provenance 完整；责任 manifest 字段完整且引用公开合同 evidence；相关依赖方向/容量 gate 通过。

**审计目标：** combined audit 检查预算是否未事后调宽、测量是否覆盖用户可感知批量路径、N+1 判据是否确定、责任清单是否真实反映 owner/caller/invariant、是否用规模或清单替代架构判断。

**退出门禁：** 硬预算通过，耗时结论符合 baseline 规则，责任 evidence 可供独立审计；性能修复的直接功能回归已刷新到当前 sourceState。

**当前 Goal 的 25-F package closure 记录（2026-08-12）：** 25-F implementation/contract/test 提交 `a91346499458c08fbb403ac64ed901fed94053b4`、matrix/evidence 提交 `944dfcae2a180d0e62f481f6ec1607e4e00f7432`、handoff 提交 `72ba6e136977f089405e9a1993747e368e0f8615` 已由主任务从 `de72d734c47baca3129ddf43ee182eaa49a866f1` fast-forward 集成到 `72ba6e136977f089405e9a1993747e368e0f8615`。主任务在该 clean integration HEAD 重跑 F benchmark（三项 query/scan hard budget PASS，wall-clock observation-only）、25-A contract（85 stories、95 rows、21 cases、17 tracked artifacts、4 responsibility facts）、25-A/F direct tests `7/7 PASS`、architecture/dependency `15/15 PASS`、capacity `13/13 PASS`、discovery `255`、lint、format 和 `git diff --check`，均通过。25-G 尚未调度；Ticket 25/Wave 11 仍为 `RUNNING/PARTIAL`，不得把 F package closure 或当前 Goal 状态写成 Ticket 25/Wave 11 `COMPLETE`。

### 25-G — Execution Gate & Independent Audit Handoff

**入口门禁：** `25-F=COMPLETE`；85-story matrix、状态矩阵、查询预算、B～E 行为 evidence 和 F 责任 evidence 均绑定当前 sourceState。

**范围与产物：** 运行完整 `npm test`、typed IPC、legacy absence、安全、Renderer/Preload build、packaging gates，并使用 25-A 冻结的精确命令 `npm run pack:production:smoke:dirty -- --output build/evidence/ticket-25-production-smoke-dirty.json` 运行 dirty smoke。不得接受通用 `production-smoke.json` 或覆盖 clean smoke。任何失败都按真实 owner 修复，并重跑受影响包直接回归与 G 的完整 gate；生产源码、schema、关键测试或 gate 变化后旧 G evidence 立即失效。

汇总 tracked matrix/budget、所有 generated evidence、测试计数、benchmark、责任 manifest、失败与修复 diff、残余风险、`DEFERRED_IMAGE_EXTENSION` 清单、独立审计 scope 和用户控制的真实外部验收清单。外部清单至少包含普通平台纯文本两组并行及网站媒体真实订单状态刷新，并写明账号/目标安全身份、费用/发布风险、前置配置、记录字段和停止条件；本包不执行这些操作。

**边界：** 本包不是正式 final clean-HEAD gate，不运行真实登录/发布/付费/订单刷新，不执行独立审计，不给 Ticket 25 或 Wave 11 下自我 PASS/COMPLETE 结论。dirty worktree smoke 只证明当前执行 sourceState 的诊断结果。

**定向门禁：** 完整自动化、build、package/dirty smoke 全部通过；dirty smoke JSON 与未来 clean smoke 路径隔离且 provenance 完整；matrix 无遗漏/伪通过；handoff 可复现并明确 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`。

**审计目标：** 由后续独立审计检查 Ticket 25 完整 diff、85-story/状态矩阵、所有包 evidence 真实性、预算、owner/依赖方向、legacy absence、安全、typed IPC、完整测试/build 和 dirty smoke；G 执行线程只提供材料。

**退出门禁：** 状态只能是“Ticket 25 execution ready for independent audit”；不得标记 Ticket 25 或 Wave 11 `COMPLETE`，不得自动 commit/merge 或开始真实外部操作。

## 25-G 之后的独立 Closure Gate

固定顺序如下：

1. 用户另派独立审计任务执行一次 **Ticket 25 Primary Audit + Wave 11 Integration Audit 的 combined audit**；只输出 findings、blocking/deferred、required remediation 和 bounded re-audit scope，不由 Ticket 25 执行线程给自己盖章。
2. 在真实 owner 修复 P0/P1 和直接违反当前 acceptance、一致性、幂等/uncertain 安全、公开合同或直接回归的 blocking P2。修复后重跑直接包级回归以及所有因 sourceState 变化而失效的 25-G gates/evidence。
3. 执行 bounded closure re-audit，只检查已知 finding、修复 diff、直接不变量/调用方/状态矩阵和刷新后的 evidence；除 escalation 外不得 fresh full review。
4. 只有用户当前授权时才 commit/merge。所有修复进入最终 clean integration HEAD 后，使用 25-A 冻结的精确命令 `npm run pack:production:smoke -- --output build/evidence/ticket-25-production-smoke-clean.json` 运行正式 clean smoke；通用 `production-smoke.json` 和 dirty smoke 都不能替代该证据。之后 source/test/gate 再变化则 clean evidence 失效并重跑。
5. 用户针对每次真实登录、发布、付费或订单刷新另行明确授权并按清单执行。缺少真实普通平台纯文本两组并行或网站媒体订单刷新任一 evidence 时，Wave 11=`BLOCKED`，原因固定 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`；图片 evidence 缺失不阻塞核心完成。
6. 只有 combined audit/bounded re-audit、授权 commit/merge、最终 clean smoke、真实外部核心验收及全部 provenance 均闭合后，Ticket 25 / Wave 11 才能标记 `COMPLETE`。

## 职责边界

- 验收测试只通过公开应用/bridge 接缝观察行为，不访问私有函数和内部表结构。
- 合同测试可使用供应商传输边界，但不穿透应用状态机。
- 性能基准测量批量接口和用户可感知快照，不以微基准替代；查询/扫描次数是跨环境硬判据，耗时预算必须在运行前已版本化并注明环境，不以一次本机结果现场定阈值。
- 本 ticket 发现缺陷时记录并在对应所有者模块修复，不建立新的“验收补丁”巨型模块。
- Ticket 线程只负责验收执行、缺陷修复与证据收集，不评价自身 diff 的代码/架构质量，也不自行确认其修复已通过用户审计；正式 clean-build 打包由用户在修复提交合并后运行。
- 证据清单必须逐个记录：owner、职责边界、公开接口/最小 capability、直接调用方、依赖方向、隐藏不变量、公开合同测试、故障证据和显著规模变化理由；清单是供独立审计使用的事实，不是 Ticket 25 的自我审计结论。
- tracked 追踪矩阵和查询预算定义“验收什么”；ignored generated evidence 记录“某个精确 sourceState 上实际运行了什么”。两者不得互相替代，dirty/clean smoke 使用不同文件名和 provenance。

## 架构硬门槛

- 所有新生产模块按职责内聚、接口深度、依赖方向、变更局部性和公开接口可测试性验收；规模报告只提供审查信号，不以机械阈值判定通过。
- 原 2031 行投稿服务必须已收缩为隐藏复杂度的稳定门面；现有大型 Renderer/contract 模块若显著变化，必须说明 owner、接口、内部结构以及拆分或不拆分理由。
- 依赖方向、模块职责和公开接口由静态门禁与证据清单记录，最终是否满足由后续独立审计判断。
- 不以跳过、放宽断言、提高超时或排除测试换取绿色结果。

## Acceptance criteria

- [ ] 85 条 user stories 全部进入 tracked 追踪矩阵；图片相关部分明确标记 `DEFERRED_IMAGE_EXTENSION`，其余条目映射到自动化、模拟或明确的用户控制证据，不把 deferred 伪称已通过。
- [ ] 六类文章入口、普通平台并行链和网站媒体订单链端到端通过。
- [ ] 迁移、删除恢复、unknown/uncertain 和故障注入场景通过；核心纯文本 evidence 的图片清单为空且 UI 无不可用图片入口。Ticket 18–21 图片实现不属于本验收通过项。
- [ ] 批量投影在固定合成规模下满足版本化查询/扫描次数预算且没有 N+1；query/scan 硬预算可以独立判定 PASS。wall-clock 只有在执行前已存在同环境批准 baseline 时才判定耗时 PASS/FAIL；没有该 baseline 时只记录观察数据，不得伪称“耗时门禁通过”，也不得因此否定已经通过的 query/scan 硬门禁。
- [ ] 模块职责证据清单与规模观察已生成并记录，依赖方向、legacy absence、安全、typed IPC、完整测试与构建通过，ticket worktree 的 `pack:production:smoke:dirty` 诊断通过；dirty smoke 产出独立 JSON 且不覆盖 clean smoke，执行线程不据此给出自我审计结论。
- [ ] 证据清单包含每个受影响生产模块的 owner、职责、公开接口/最小 capability、调用方、依赖方向、隐藏不变量和公开合同测试，不能只列模块名称或行数。
- [ ] Ticket 25 修复经用户审计、提交并合并后，在干净集成工作树运行正式 `pack:production:smoke` 并记录证据；该项未完成前波次 11 不得标记 `COMPLETE`。
- [ ] 真实外部验证清单明确说明费用/发布风险、前置配置、记录字段和停止条件；用户后续明确授权并实际完成普通平台纯文本两组并行和网站媒体真实订单状态刷新后，分别记录账号/目标安全身份、订单号、媒体资源、最终链接、结果和停止条件。任一证据未完成时波次 11 保持 `BLOCKED`，原因记录为 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`；图片证据缺失不阻塞核心完成。
- [ ] 最终交接包含 tracked 追踪矩阵/查询预算、绑定 commit/sourceState 的 generated evidence、测试计数、性能数据、模块职责与显著规模变化说明、残余风险和 `DEFERRED_IMAGE_EXTENSION` 清单。

## 审计建议

- 等级：25-G 后必须另派一次深度独立 combined audit，同时承担 Ticket 25 Primary Audit 与 Wave 11 Integration Audit；Ticket 25 执行线程只产出验收证据，不再追加第三轮内容重复的全量审计。
- Primary/combined scope：85 条 user stories 与有限状态矩阵、deferred 标记、六类入口互斥、普通平台纯文本/付费/迁移/删除核心链、query/scan 硬预算、责任 evidence、Git provenance、legacy absence、安全、typed IPC、完整 `npm test`、build、独立 dirty smoke JSON，以及正式 clean smoke 的命令/输出隔离合同。此时不把尚未合并后运行的 clean smoke 伪称已有证据。
- 审计任务检查 Ticket 25 完整 diff、evidence 真实性、追踪矩阵遗漏和门禁覆盖，只报告 findings；blocking finding 修复后由独立 bounded closure re-audit 验证已知 finding、修复 diff、直接回归和刷新 evidence。之后才按授权 commit/merge，并在最终 clean integration HEAD 运行正式 smoke；Ticket 执行线程不得自行把波次标记为 `COMPLETE`。

## Non-goals

- 不自行创建真实付费订单、登录真实平台或发布真实文章。
- 不实现或验收 Ticket 18–21 普通平台图片链，不把任何图片 story 标记为核心已通过。
- 不执行网站媒体图片探索，也不把网站媒体图片传输标记为已实现。
