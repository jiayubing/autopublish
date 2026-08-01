# 阶段3：Publication工作流与恢复

> **2026-07-30 最终只读审计三项P1直接整改（当前唯一权威）：** 唯一`verifyCapabilityEvidence()`新增三项永久RED→GREEN反例：Renderer owner仅经未调用entry callback、owner仅作为未消费JSX prop、producer callback仅在`if(false)`中调用。入口现在只沿确证callback契约，JSX只接受intrinsic事件或闭合到子组件真实消费的prop，callback调用证明排除静态不可达分支；React `lazy`及既有React/标准异步集合边界按TypeChecker声明闭合。证据专项66/66、matrix33/33（109 capability、21 lifecycle、5 event）、fail-closed7/7，合计106/106；完整`npm test`225文件1366/1366，lint、定向Prettier与`git diff --check`通过。仅测试证据helper/test变化，Phase03/04/06 production、package input和既有制品未变；阶段继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 计划21最终审查后TDD终态（当前唯一权威）：** 五项追加假阳性已通过唯一公开`verifyCapabilityEvidence()` seam串行RED→GREEN：删除event application文本兜底、拒绝静态不可达producer、拒绝不确定conditional的错误factory实例、闭合Electron transport member symbol、拒绝registrar handler未调用nested function。证据专项60/60，与production matrix/fail-closed组合100/100；inventory仍109（43 query、61 command、5 event），lifecycle21/21、event5/5。订单production未改，`P1-CONVERGENCE-01`、`P2-FINAL-ORDER-01`、`P2-CONVERGENCE-02`均`VERIFIED`；Phase03=`IN_PROGRESS`，Phase07=`NOT_STARTED`。`npm test`225文件1360/1360、Auth16/16、links180/180、packaging33/33、lint/format/三套typecheck、标准`pack:smoke`与diff check全部通过。本区块以下旧统计均为历史记录。

> **当前唯一权威制品：** Renderer 757,886 bytes/SHA-256 `E1B965347C5BEA36B27006555E0DCFC5E380211A6BA39D925A7516FFD204A860`；preload 222,057 bytes/SHA-256 `3F56D207A9FB3BFB8C807CFCCA5DF3F5F57CC93B7D38DC97A128840433BFB8EC`；ASAR 7,212,426 bytes/SHA-256 `71CD2F7A24CC0106D712348835B1803F943C6BB36F18E41133E025B1CA6BF073`；exe 225,485,824 bytes/SHA-256 `60E05AFB17FF24E541DC9AEDCB82B749D8024B15F46CF66D51688B017239AAF6`。

> 当前状态：**IN_PROGRESS**。2026-07-30 计划21整改已完成，等待最终独立只读审计；不得恢复`COMPLETE`，Phase 07仍为`NOT_STARTED`。

> **2026-07-30 最终复验更正：** 自审补充“导出入口内未调用arrow producer helper”永久反例并RED→GREEN后，证据corpus为33/33、与production suite合计66/66；最终`npm test`为225文件1333/1333、0 fail/skip（164.262秒）。本句取代紧随其后的32/32、1332/1332中间统计，其余制品、门禁、状态与禁止事项不变。

> **2026-07-30 最终证据引擎整改执行记录（当前权威，取代下方2026-07-29统计）：** Ticket 5仅通过用户确认的`createMediaOrderService`+临时真实`OperationalStore` seam补齐永久行为矩阵，现覆盖supplier `2 + HTTPS → 0/1/4/9`后canonical仍为`published`、按钮仍可见、main每例只打开一次；restart、backup、restore后同一链接仍可打开；未published、URL缺失、HTTP、credentials、query、fragment、超长和损坏URL均隐藏且main fail-closed。订单/OperationalStore关联矩阵31/31，无需新增production修复。证据引擎corpus32/32、production fixture suite33/33（109 capability、21 lifecycle、5 event），完整`npm test`225文件1332/1332（171.121秒）、0 fail/skip；Auth16/16、links180/180、packaging33/33、capacity19/19、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、order owner/ASAR parity、packaged preload3/3、Electron focus1/1及`git diff --check`全绿。最新ASAR为7,212,371 bytes（2026-07-30 07:51:39.869 +08:00），SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe为225,485,824 bytes，SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。147条既有WIP保留、staged=0，真实数据/外部/投稿/同步/扣费/付费submit=0。`P2-FINAL-ORDER-01`与`P2-CONVERGENCE-02`为`VERIFIED`；Phase03保持`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

> **2026-07-29 证据引擎与订单链接整改（最新当前权威，取代下方同日统计）：** production-level RED 使用与109项matrix相同的`verifyCapabilityEvidence()`复现了不存在的lifecycle `stateSource`和不存在的event producer仍被旧production verifier放行；真实临时SQLite另复现canonical `published`订单在supplier `2→9`后`hasPublishedUrl=true`但main返回`MEDIA_ORDER_NOT_PUBLISHED`。现production matrix与冻结mutation直接共享唯一TypeChecker symbol-identity核心，`P1-CONVERGENCE-01=VERIFIED`；订单打开权限统一由canonical `published`与credential/query/fragment-free安全持久HTTPS URL决定，supplier code仅展示当前供应商状态，`P2-FINAL-ORDER-01=VERIFIED`；`P2-CONVERGENCE-02`继续`VERIFIED`且未恢复syntax detector。supplier `2→9`后按钮与main均可打开同一持久证据URL，非published或不安全URL继续fail-closed。inventory为109（43 query、61 command、5 event），21项lifecycle、5项event、20项mutation/acceptance全部通过；完整`npm test`为225文件1318/1318、0 fail/skip，Auth16/16、links180/180、packaging33/33、capacity当前20/20（原冻结19项仍全部通过）、13k临时SQLite query/SQL=1/1、parsed=3、orders=3、paidSendCalls=0，三套typecheck、lint、format、Renderer build、preload、pack smoke、最新ASAR parity、packaged preload3/3、最新Renderer Electron focus1/1与diff check均通过。最新ASAR为7,212,371 bytes（2026-07-29 23:29:01.007 +08:00），SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe为225,485,824 bytes（23:29:01.819 +08:00），SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。分支/HEAD为`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`，既有WIP原地保留、staged为空；真实workspace、内容库、Auth DB、账号、供应商、投稿、同步、扣费与付费submit调用均为0。Phase03保持`IN_PROGRESS`，Phase07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

> **2026-07-29 最终审计收敛整改（当前权威）：** `P2-CONVERGENCE-02` 的正确 owner 为 Phase 03 OperationalStore/MediaOrderService。旧语法枚举测试已删除，改由真实临时 SQLite 行为矩阵覆盖 canonical `submitted/published/failed/uncertain`：无 supplier observation 时 display 为 `""`、remote projection 为 `null`，绝不由 canonical 状态回填；supplier `0/1/2/4/9`仅经 fake supplier response→`MediaOrderService.syncOrder()`写入；`2`无 evidence 不提升，`2 + credential/query/fragment-free HTTPS evidence`只提升允许的进行中状态，`9`及其他 observation 不撤销 published；restart、backup、临时 restore 后 observation 不变。`reconcileRemoteOrder`与`supplierStatusOrFallback`在source/import/export/test/最新ASAR均为零，OperationalStore/MediaOrderService与最新ASAR逐字节一致。schema保持既有v3，`order_display_snapshots`与两个retained public methods不变，本轮未再改Phase03 public interface。B专项28/28，13k临时SQLite仍为query/SQL=1/1、parsed=3、orders=3、paidSendCalls=0；完整225文件1281/1281及全部C门禁通过。Phase03保持`IN_PROGRESS`，下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**

> **2026-07-29 第三轮整改（当前权威）：** 同article/target、不同batch/attempt的临时SQLite反例先5/6 RED，证明仅比较article/target仍会完成错误item并把B快照写进A订单。media submission payload已有durable `attemptId`，OperationalStore现于原事务内、覆盖payload前要求其与当前attempt精确相等；不匹配统一`OPERATIONAL_BATCH_ITEM_MISMATCH`并无任何部分写。v3专项6/6、Phase03扩展80/80；fallback永久回归改为AST并覆盖object map/switch/numeric ternary，最新ASAR parity及legacy/preload合并11/11。schema仍v3，新表和两个retained method不变，public method集合未变，只收紧既有commit行为。完整1267/1267及全部门禁通过，ASAR7,210,414 bytes（20:16:29 +08:00）。Phase03保持`IN_PROGRESS`；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**

> **2026-07-29 追加审计整改（当前权威）：** 新RED证明`commitRemoteOutcome()`接受另一稿件/target的`batchItemId`并可能跨聚合写快照/完成item。OperationalStore owner现于原事务内精确比较attempt与batch item的`article_id/target_key`，不匹配抛`OPERATIONAL_BATCH_ITEM_MISMATCH`并整体回滚；回归明确验证remote order、display snapshot及A/B item均无部分写入。另将canonical→supplier fallback detector补齐`submitted/uncertain`，并把真正旧fallback owner `media-order-service.js`纳入current source↔packaged ASAR精确parity。RED 12/15→源码专项全绿，OperationalStore v3 5/5、Phase03扩展79/79、最新ASAR相关11/11、完整223文件1265/1265。schema仍为v3，`order_display_snapshots`及`listOrderDisplayViews()`/`recordRemoteOrderObservation()`事实不变；本轮未新增public method，只收紧`commitRemoteOutcome()`既有行为契约。最新ASAR7,210,147 bytes（18:12:40 +08:00），真实外部/付费调用0。Phase03保持`IN_PROGRESS`；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**

> **2026-07-29 第二轮整改检查点 C 最终权威结论：** 20项（原17项`P1-01..P1-07`、`P2-08..P2-15`、`P3-16..P3-17`，加`P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`）逐项复核均为`VERIFIED`。C在旧ASAR上先得到OperationalStore current-source parity 7/8 RED，重建后source/export/import-call/test/ASAR 8/8；`P1-05`正式supplier observation路径正确，旧`reconcileRemoteOrder`定义/export/专用测试及canonical→supplier fallback均已物理删除，无wrapper。`P1-AUDIT-03`如实确认OperationalStore schema v2→v3、新表`order_display_snapshots`、retained `listOrderDisplayViews()`/`recordRemoteOrderObservation()`及migration/backup/restore/verify/fault证据；因此下方所有“未改OperationalStore/schema/interface”历史说法均失效。专项131/131、capacity19/19、完整223文件1263/1263、Auth16/16、links180/180、packaging33/33、三套typecheck、lint/format、Renderer2157 modules、pack smoke、packaged preload3/3、最新Renderer Electron focus1/1及diff check全绿；最新ASAR7,209,908 bytes（12:37:55.544 +08:00）。inventory保持109。真实外部与付费调用为0；下一动作仅为最终独立只读审计，Phase03保持`IN_PROGRESS`。**整改完成，等待最终独立只读审计。**

> **2026-07-29 第二轮整改检查点 B 当前权威结论（取代下方同日历史“未修改 OperationalStore/schema/interface”说法）：** Phase 03 因 `P1-05`/`P2-13` 正式窄范围重开，当前 Git 差异确实把 OperationalStore schema **v2 升至 v3**，新增 `order_display_snapshots`，并新增 retained public methods `listOrderDisplayViews()` 与 `recordRemoteOrderObservation()`；检查点 A 又删除 public `reconcileRemoteOrder()`。下方保留的 2026-07-28/29 “未改 OperationalStore/schema/interface”、在 canonical 状态缺 observation 时回退 supplier code、以及 inventory=110 的段落仅是历史执行记录，均已失效；当前 canonical non-Auth inventory 为109。
>
> v3 表契约为：`attempt_id TEXT PRIMARY KEY NOT NULL REFERENCES publication_attempts(attempt_id)`；`title_snapshot`、`filename`、`resource_name_snapshot`、`created_at` 均 `TEXT NOT NULL`；`quoted_price REAL` 可空。写入 owner 是 `commitRemoteOutcome()`：仅在 media remote evidence 与正式 `batchItemId` 同事务提交时，以已验证 submission payload 写入/替换不可变 display snapshot，历史缺失报价保持 `NULL/未记录`。`listOrderDisplayViews()` 由 `MediaOrderService.listOrderViews()` 唯一 production caller 消费，执行一条 `LEFT JOIN ... LIMIT 20000` SQL并只解析返回订单；`recordRemoteOrderObservation()` 由 `MediaOrderService.syncOrder()` 唯一 production caller 调用，在事务内保存 supplier `0/1/2/4/9` observation，复用 credential/query/fragment-free HTTPS validator；只有`2 + 安全evidence`可提升进行中 canonical record，`9`等不得撤销published。
>
> B RED 为 v3 专项2/4：旧 verifier 未检查 required-column nullability 和 `attempt_id` FK，损坏v3会被open/restore接受；另一个失败来自恢复fixture未安装到canonical DB路径。修复后 `verifyV3Structure()` 精确验证6列顺序/类型/nullable/PK及唯一FK，恢复fixture安装到`.autopublish/operations/operations.db`；v2→v3 migration history `[1,2,3]`、重复启动、`before-v3/after-v3-create/after-v3-record`事务回滚与干净重试、损坏结构拒绝、backup verify及临时workspace restore全部4/4。扩展Phase 02/03 schema/composition/order集45/45；13k临时SQLite为query=1、SQL=1、parsed=3、orders=3、heap=143,288 bytes、0.471ms、paidSendCalls=0；三套typecheck、lint、format、links180/180、packaging33/33、diff check通过。
>
> 冻结边界判断：PublicationWorkflow、Publisher、ContentStore、Domain/Application没有当前production差异；OperationalStore schema/public interface则**确有上述变化**。全部证据仅使用临时SQLite/fake/合成fixture，真实workspace、内容库、Auth、账号、供应商、投稿、同步、扣费与付费submit=0。下一动作严格进入C；Phase 03保持`IN_PROGRESS`。

> 2026-07-29 最终独立审计第二轮整改检查点 A：当前工作树永久回归先为 0/4 RED，分别证明 `reconcileRemoteOrder` 仍存在于 OperationalStore 定义/public return surface、production source/call graph、旧测试和当时 packaged ASAR，并保留 canonical publication status `published/failed/submitted/uncertain` → supplier `2/4/0` fallback。Phase 03 owner 随后物理删除该定义与 export，删除只验证旧 reconcile wrapper 的 `tests/phase-03-media-order-reconcile.test.js`，将 URL evidence 回归迁至 `recordRemoteOrderObservation()`；没有 wrapper、re-export 或测试专用 production caller。源码/测试转为 3/4，仅旧 ASAR 保持 RED；本轮 `pack:smoke` 后 source/export/import-call/test/ASAR 为 4/4，连同既有 legacy path 门禁为 7/7。supplier/order 定向 23/23，三套 typecheck、lint、format、packaging 33/33、Renderer build 2157 modules、preload 222,057 bytes、pack smoke 与 diff check 通过；新 ASAR 7,209,505 bytes（12:14:07 +08:00），真实外部/投稿/同步/扣费/付费 submit=0。Schema 在 A 未改变；OperationalStore public interface **确有删除**：`reconcileRemoteOrder` 退出，保留的正式 owner 为 `recordRemoteOrderObservation()`。下一动作仅为检查点 B，如实核对并写回既有 schema v2→v3、`order_display_snapshots`、两个 retained public methods 及 migration/backup/restore/verify/fault 证据；Phase 03 保持 `IN_PROGRESS`。

> 2026-07-29 P2-09 证据纠正：Phase 06 复核发现 `media.removeDraft` 没有任何 production consumer，已由 Phase 06 owner 从 contract→registrar→preload→bridge→feature→fixture 全链物理删除；inventory 因此为 109 项而非历史记录的 110 项。本轮没有修改 PublicationWorkflow、OperationalStore、Publisher、schema 或 Phase 03 冻结 interface。完整门禁 222 文件 1255/1255、13k SQLite paidSendCalls=0、新 ASAR legacy 零路径和其余门禁均通过；Phase 03 仍为 `IN_PROGRESS`，等待独立只读审计。

> 2026-07-29 检查点 A：Phase 06 non-Auth production bridge fail-closed RED→GREEN 已完成；未修改 PublicationWorkflow、OperationalStore、Publisher、schema 或任何 Phase 03 冻结 interface。Phase 03 继续 `IN_PROGRESS`，等待 A→B→C 全部整改与最终独立只读审计。
>
> 2026-07-29 检查点 B：110 项 non-Auth production capability 已逐项用 TypeScript AST 证明真实 View/root→feature→bridge→preload→registrar/application 链；5 个 event 另证明 producer、唯一直接 consumer 与 dispose。旧通用 owner hook / `source.includes` 证明先形成 0/1 RED 后删除；本轮未发现新的无 consumer capability，未修改 Phase 03 冻结 interface。Phase 03 保持 `IN_PROGRESS`，真实投稿、同步和付费 submit 为 0。
>
> 2026-07-29 检查点 C：确认无 production caller 后，物理删除 `src/core/jobs.js`、点名的两个 `submission-*` 文件及 `desktop/services/submission/` 下六个等价 dead implementation；没有迁移、re-export 或 wrapper。source/current-ASAR 测试先为1/3、2 fail，重建后3/3；Phase 03/04 扩展定向95/95、packaging33/33、三套typecheck与pack smoke通过。未修改 PublicationWorkflow、OperationalStore、Publisher、schema或冻结interface；Phase 03保持`IN_PROGRESS`，真实投稿/同步/付费submit为0。
>
> 2026-07-29 最终终态：Phase 03 owner 的 `P1-04`、`P1-05`、`P2-12`、`P2-13`、`P3-17` 与 `P2-AUDIT-02` 已用当前 production tree、临时 SQLite/fake supplier、source/import graph 和本轮 packaged ASAR 重新验证。13k order projection 为 query=1、SQL=1、parsed=3、orders=3、heap=143,288 bytes、0.358ms、paidSendCalls=0；source/import/ASAR 零路径为3/3。完整门禁为222文件、1252/1252、0 fail/skip（158.040秒），专项138/138、三套typecheck及其余第10节门禁均通过。未修改 PublicationWorkflow、OperationalStore、Publisher、schema 或任何冻结 interface；真实投稿、同步、供应商和付费 submit 调用为0。**整改完成，等待最终独立只读审计。**

## 1. 阶段目标

建立并切换唯一production `PublicationWorkflow`，把publication、attempt、batch、remote evidence、order reference、recovery intent和post-processing统一交给OperationalStore。阶段结束时旧publication/batch/order JSON writer和publication文件锁必须退出production，所有现有平台通过最终Publisher interface接入，即使其证据implementation要在阶段4继续强化。

关联工作：OPT-002、003、009、013、014；吸收F-H04、F-H05、F-H07、F-H12、F-M13、F-M14。

## 2. 开始条件

- 阶段2为`COMPLETE`。
- OperationalStore、migration dry-run、backup/restore和main-only write owner已验证。
- 当前workspace或合成迁移fixture有可重复manifest。
- 用户已明确授权在哪个隔离workspace副本执行正式迁移演练；不得默认选择真实内容库。

## 3. 必读输入

- 总纲、目标架构、执行协议、进度账本及阶段1/2交接。
- M13、M20、M22、M23、M24、M27 module报告。
- 当前`jobs.js`、platform workbench、publication ledger/store、submission batch/store、sidecar、archive、attention、media order/workbench。
- OPT-002、003、009、013、014及验证矩阵。

## 4. 允许修改

- PublicationWorkflow application/domain modules。
- OperationalStore事务用例和查询，但不得破坏阶段2schema不变量；schema变化必须新增versioned migration。
- Submission、archive、attention、media order和workspace composition生产caller。
- Worker结果协议，使worker不再写OperationalStore。
- 一次性旧状态migration/cutover和旧writer删除。
- 对应测试、文档和运行诊断。

## 5. 禁止修改

- 平台DOM selector、HTTP判定和Python内部发布逻辑；阶段4处理。
- Renderer页面结构；本阶段只保持现有bridge可消费的新DTO。
- Auth领域。
- 通过长期双写维持旧JSON和SQLite一致。
- 将旧无账号记录自动归到当前登录账号。

## 6. 核心不变量

- 文章—target在任一时刻最多一个非终结attempt。
- 远端调用前必须存在durable recovery intent。
- 远端调用后outcome和证据在一个SQLite事务中提交。
- Outcome未提交时不能归档、清队列或创建“完成”projection。
- `uncertain/submitted/submitting`阻断新attempt。
- Post-processing失败不篡改已保存的远端outcome。
- Attention可由OperationalStore和ContentStore完全重建。
- Worker只返回outcome/message，不写数据库、batch、archive或order store。

## 7. 实施步骤

### 7.1 实现PublicationWorkflow

实现并测试：

- `publish(command)`：验证文章/target/account、重复保护、创建attempt和intent、调用Publisher、提交outcome、安排后处理、返回安全结果。
- `recover()`：扫描未终结intent、陈旧run和待处理job，转换为可解释的安全状态。
- `reconcile(command)`：仅允许对明确目标和attempt进行人工核对，保留审计证据。

Interface不得要求caller手动依次调用reserve、markSubmitting、recordOutcome和archive。

### 7.2 建立最终Publisher适配

为现有Toutiao、Lieju、Hepan和Media implementation建立满足阶段1 Publisher interface的真实adapter。此adapter是最终seam，不是临时`LegacyPublisher`透传层：

- 输入使用统一identity/account/target。
- 输出转换为闭集outcome和证据。
- 旧implementation缺少可靠证据时保守返回`uncertain`。
- Adapter不再获得ledger、batch、archive或order store。

阶段4可以替换adapter内部implementation，但不得改变PublicationWorkflow interface。

### 7.3 切换batch和queue

- Submission batch/item迁入OperationalStore。
- Queue Markdown可以作为待投稿内容副本继续存在，但其执行/归档状态由SQLite拥有。
- Sidecar只保留必要的可移植内容快照；不得成为第二publication事实源。
- Main是batch唯一claim/update owner，worker通过消息返回结果。
- Revision、claim token和幂等完成在同一事务中执行。

### 7.4 切换媒体订单关联

- Remote order ID和publication attempt在提交outcome事务中关联。
- 订单展示projection失败不丢remote ID。
- Media retry保留resource target和account identity，不降级为通用platform target。
- 旧JSONL订单记录由migration导入后只读，不继续append。

### 7.5 建立post-processing

Archive、清理队列副本、本地文章回收和projection更新作为可恢复job：

- Job有稳定identity、输入fingerprint、attempt上限和错误分类。
- 远端outcome先提交，post-processing随后领取。
- 失败进入attention并可重试，不重新调用远端Publisher。
- 强杀后重复领取不得重复删除或归档错误文件。

### 7.6 重建attention/reconcile

- Attention从OperationalStore查询和内容文件现实状态派生。
- `submitting`陈旧、`uncertain`、known outcome未完成后处理、身份冲突和migration人工项必须可见。
- DTO包含稳定target/attempt/account/resource identity和允许动作闭集。
- Renderer无法提交未在允许动作中的任意状态修改。

### 7.7 执行production切换

按顺序：

1. 关闭应用并对授权副本生成manifest和备份。
2. Dry-run migration并人工核对所有冲突。
3. 生成全新operations数据库并完成验证。
4. 原子安装数据库和schema marker。
5. 切换composition root到PublicationWorkflow/OperationalStore。
6. 删除旧production writer和publication文件锁路径。
7. 启动恢复扫描和只读旧文件诊断。
8. 运行完整本地E2E；不连接真实外部平台。

旧文件保留在迁移快照中，但代码不得继续写入。旧版本打开升级workspace应明确拒绝，而不是部分写入。

## 8. 故障注入矩阵

至少覆盖：

- intent事务前/后强杀。
- Publisher调用前、调用中、返回后强杀。
- outcome事务失败或磁盘满。
- post-processing领取前、中、完成后强杀。
- batch两个并发claim和旧worker迟到消息。
- remote ID已知但projection失败。
- attention查询时内容文件缺失/变化。
- 同一target重复命令和不同账号target。
- migration完成后旧writer尝试启动。

## 9. 阶段验证

- 阶段0全局门禁。
- OperationalStore全套回归。
- PublicationWorkflow interface、fake Publisher、每个平台contract adapter测试。
- Worker→main result→outcome transaction→post-processing→attention端到端测试。
- 进程强杀/重启、磁盘满和并发claim测试。
- 合成旧workspace migration、升级后重启和完整回滚快照演练。
- 静态搜索证明worker/adapter不引用OperationalStore writer，旧JSON writer无production引用。

## 10. 完成条件

- Production只有一个PublicationWorkflow和一个OperationalStore write owner。
- 旧publication/batch/order writer、publication文件锁和跨文件read-modify-write退出production。
- 所有平台通过最终Publisher interface接入；弱证据为`uncertain`。
- 任一故障点重启后只能得到安全终态、可恢复job或明确attention。
- Remote outcome和order evidence不因projection/archive失败而丢失。
- Attention可删除并重建，不是第二事实源。
- 迁移、备份、旧版本拒绝和回滚快照均验证。

## 11. 停止条件

- Caller仍需理解transaction、intent或archive顺序。
- 为保持旧路径而出现双写。
- Worker/adapter仍直接写数据库或队列状态。
- 未知远端结果被自动判`failed/published`。
- Migration存在未解释冲突或旧账号被自动猜测。
- 回滚无法恢复迁移前完整workspace副本。

## 12. 交接重点

记录最终PublicationWorkflow/Publisher/OperationalStore入口、production调用图、删除的旧writer、schema版本、迁移报告、故障测试数量、所有attention动作和阶段4需要强化的各平台证据缺口。

