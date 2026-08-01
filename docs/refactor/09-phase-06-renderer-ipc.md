# 阶段6：Renderer状态与Typed IPC

> **2026-08-01 审计整改 checkpoint（当前权威）：** 证据 helper 现对同步必抛 callback 后的 `return`、动态提前 `return` 与 `finally { return; }` 分别执行 fail-closed/可达性判定，回归测试已固定。symbol evidence `148/148`；production matrix `33/33`（109 capability、21 lifecycle、5 event）；inventory/bridge fail-closed `16/16`；完整 `npm test` `1453/1453`，0 fail/skip；main/renderer/bridge typecheck、定向 lint/Prettier 与 `git diff --check` 通过。状态标记为 `P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。checkpoint tag：`phase-06-audit-remediation-green`；不提前宣称 Phase 06 `COMPLETE`，也未修改 production IPC、Renderer、订单或业务服务。

> **2026-08-01 Phase 06 独立审计后最小修复复验（最新权威，覆盖以下历史统计）：** 独立只读复核发现证据 helper 对 const 对象属性、字面量 `.length` 与 `typeof` 的静态短路值解析不足；四个永久 RED 反例已以最小 GREEN 收口。`staticPrimitiveValue()` 仅增加确定属性/长度/typeof 求值，未知或动态值仍 fail-closed；未修改 production runtime、IPC contract、业务服务或制品输入。symbol evidence `144/144`，production matrix `33/33`（109 capability、21 lifecycle、5 event），Coordinator `7/7`、caller inventory `3/3`、bridge fail-closed `9/9`、capability inventory `4/4`。完整 `npm test` 为 225 文件、132 suites、`1449/1449` pass、0 fail、1 个既有 Electron focus skip；Auth `16/16`、links `180/180`、packaging `33/33`、Lint、三套 typecheck、format、定向 Prettier、Renderer build `2157` modules、标准 pack smoke、`git diff --check` 全绿。当前 Renderer/preload/ASAR/exe 分别为 `758842`/`222731`/`7214697`/`225485824` bytes，SHA-256 为 `048D72A0856D0F50B0A0FB241467B799EC17D0B7010AAEFFE904B54122B15641`、`0A8642AB024AD5061E8ACC71C42DB566C62DC8E9D443277C45F2EE0C41B177F4`、`709A7AF4E555076F4FF695331E1B3985C5A5EF419DF2BAA8054CCF401FC8AFEA`、`983EDAC6B0CC86DC6DD884B217AE471655E5A3943ED3FA13EFDC34953DA051D3`。`P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`；未访问真实数据、账号、供应商或付费系统，未 stage/commit/push/PR。

> **2026-07-31 Phase 06 独立审计整改执行结果（当前唯一权威，覆盖以下历史记录）：** Ticket 1→4 串行 RED→最小 GREEN 完成。五个证据 RED 分别覆盖 production entry 丢弃 snapshot 返回值、局部非逃逸对象赋值、shadowed `Object.freeze`、`return-finally` 不可达读取、`throw-finally` 不可达读取；原因分别为 snapshot 没有可达 production consumer 或 query result 未到达 recorded snapshot field。普通 `try/finally` 对照保持 GREEN。Coordinator StrictMode seam 先证明 terminal `dispose()` 使第二次 effect setup 无法重新订阅，再以可重入幂等 `stop()` + Provider cleanup `stop()` 修复；终态 `dispose()` 和 dispose 后 fail-closed 语义保留。未新增第二验证器、文本兜底、production-only bypass，未改 IPC contract、业务服务、Phase 03/04 业务结论。
>
> 专项最终为 symbol evidence `121/121`、production matrix `33/33`（109 capability：43 query、61 command、5 event；21 lifecycle；5 event）、Coordinator `7/7`、caller inventory `3/3`、bridge fail-closed `9/9`；完整 `npm test` 为 225 文件、132 suites、`1426/1426`、0 fail/skip。Auth `16/16`、links `180/180`、packaging `33/33`、Lint、三套 typecheck、宽/定向 Prettier、Renderer build `2157` modules、标准 pack smoke、ASAR/source parity `10/10`、packaged preload `3/3`、Electron focus `1/1`、`git diff --check` 全绿。最终 Renderer/preload/ASAR/exe SHA-256 分别为 `048D72A0856D0F50B0A0FB241467B799EC17D0B7010AAEFFE904B54122B15641`、`0A8642AB024AD5061E8ACC71C42DB566C62DC8E9D443277C45F2EE0C41B177F4`、`709A7AF4E555076F4FF695331E1B3985C5A5EF419DF2BAA8054CCF401FC8AFEA`、`983EDAC6B0CC86DC6DD884B217AE471655E5A3943ED3FA13EFDC34953DA051D3`。
>
> 冻结现场仍为 `codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`，status `M=117/D=14/??=21`、staged=0；真实数据、账号、Auth 数据库、外部/付费系统、投稿、同步、扣费和付费 submit 均为 `0`。`P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。

> **2026-07-31 本轮独立审计四项最小整改（当前唯一权威）：** `verifyCapabilityEvidence()`公共 seam 新增永久 RED→GREEN 反例并收紧三处证据：逗号表达式中被丢弃的 query 结果不再污染 snapshot 值流；`void`、丢弃表达式及未到达可观察 sink 的 snapshot 字段读取不再算真实 Renderer consumer；event feature 除了持有真实 disposer，还必须从记录 Renderer entry 可达地调用对应 cleanup member。preload 将 event schema 解析与业务 listener 执行分离，畸形豆包/生成/文章移除事件不进入 typed listener，合法事件 listener 抛错只调用一次；workspace/platform 的解析失败改走无业务 payload 的独立安全诊断通道。production matrix 109/109、lifecycle 21/21、event 5/5；完整 `npm test` 225 文件 1415/1415，lint、main/renderer/bridge typecheck、`format:check` 与 `git diff --check` 通过。`P1-CONVERGENCE-01=RED`，本线程不自行恢复 `VERIFIED`；Phase03/04/06 继续 `IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

> **2026-07-31 最终独立审计五项P1最小整改（当前唯一权威）：** 唯一公开`verifyCapabilityEvidence()` seam新增五个永久RED→GREEN反例，覆盖跨模块未调用返回API、未渲染intrinsic JSX handler、未调用application返回成员中的send、未由真实订阅返回的consumer disposer，以及从不可达JSX实例借用lifecycle snapshot。修复仅收紧entry级callsite可达性、渲染实例、application owner返回成员、精确subscription call/disposer类型及snapshot wiring；保留真实跨模块runtime API消费，未修改production runtime、IPC合约、业务服务、package输入或制品。Phase06证据组合152/152，production matrix109/109、lifecycle21/21、event5/5；完整`npm test`225文件1408/1408，lint、三套typecheck、定向Prettier与`git diff --check`通过。`P1-CONVERGENCE-01`整改复验为`VERIFIED`，Phase03/04/06继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 本轮最终独立审计四项P1直接整改（当前唯一权威）：** 唯一公开`verifyCapabilityEvidence()` seam新增五项永久RED→GREEN反例：producer仅在`while(false)`中调用、正确feature实例仅由dead JSX wiring提供、registration receiver以`ipcMain || fake`进入错误运行时分支、preload `removeListener`仅在静态不可达分支、feature disposer仅在静态不可达分支调用。修复后静态循环与dispose证明均按可达控制流fail-closed，composition props/context wiring只接受从记录Renderer entry可达的callsite并按Program/entry缓存，registrar逻辑回退拒绝任何可提供错误receiver的运行时分支。证据核心、109项production matrix、21项lifecycle、5项event及bridge fail-closed组合111/111，capability inventory 4/4；完整`npm test`225文件1371/1371，lint、format、三套typecheck与`git diff --check`通过。仅证据helper/test与本轮记录变化，production runtime、package input和既有制品未变；`P1-CONVERGENCE-01`整改复验为`VERIFIED`，但Phase03/04/06继续`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 最终只读审计三项P1直接整改（当前唯一权威）：** 唯一`verifyCapabilityEvidence()`新增三项永久RED→GREEN反例：Renderer owner仅经未调用entry callback、owner仅作为未消费JSX prop、producer callback仅在`if(false)`中调用。入口现在只沿确证callback契约，JSX只接受intrinsic事件或闭合到子组件真实消费的prop，callback调用证明排除静态不可达分支；React `lazy`及既有React/标准异步集合边界按TypeChecker声明闭合。证据专项66/66、matrix33/33（109 capability、21 lifecycle、5 event）、fail-closed7/7，合计106/106；完整`npm test`225文件1366/1366，lint、定向Prettier与`git diff --check`通过。仅测试证据helper/test变化，Phase03/04/06 production、package input和既有制品未变；阶段继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 本轮独立审计后追加整改（当前唯一权威）：** 审计确认唯一`verifyCapabilityEvidence()`仍会把未调用callback中的Renderer consumer、registration entry传入的fake `ipcMain`/application实参判为真实链路。三个独立反例均先RED，再以最小GREEN修复：consumer callback只允许经TypeChecker symbol确认的React effect、`useWorkspaceScope`和标准集合/异步回调边界；fixture新增registration receiver/application entry binding事实，registrar现在按实际callsite参数传播闭合。证据专项63/63，matrix33/33（109 capability、21 lifecycle、5 event），fail-closed7/7，合计103/103；Phase06组合32/32。完整`npm test`225文件1363/1363、Auth16/16、links180/180、packaging33/33，lint、三套typecheck、format与`git diff --check`通过。本轮未修改production runtime或package input，制品hash保持不变；Phase03/04/06继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**
>
> **2026-07-30 计划21最终审查后TDD终态（当前唯一权威）：** 五项追加假阳性已通过与109项production matrix相同的唯一公开`verifyCapabilityEvidence()` seam串行RED→GREEN：application无owner/receiver时fail-closed，producer静态不可达分支失败，composition不确定conditional的错误实例失败，preload同时闭合Electron receiver/member symbol，registrar不接受未调用nested application。唯一证据专项60/60，与production matrix/fail-closed组合100/100；matrix109/109、lifecycle21/21、event5/5，inventory仍109。未增加第二验证器或production测试出口。`npm test`225文件1360/1360，Auth16/16、links180/180、packaging33/33，lint/format/三套typecheck、标准`pack:smoke`与diff check通过。以下旧统计均为历史记录。

> **当前唯一权威制品：** Renderer 757,886 bytes/SHA-256 `E1B965347C5BEA36B27006555E0DCFC5E380211A6BA39D925A7516FFD204A860`；preload 222,057 bytes/SHA-256 `3F56D207A9FB3BFB8C807CFCCA5DF3F5F57CC93B7D38DC97A128840433BFB8EC`；ASAR 7,212,426 bytes（2026-07-30T14:07:52.2749266+08:00）/SHA-256 `71CD2F7A24CC0106D712348835B1803F943C6BB36F18E41133E025B1CA6BF073`；exe 225,485,824 bytes（2026-07-30T14:07:52.9803709+08:00）/SHA-256 `60E05AFB17FF24E541DC9AEDCB82B749D8024B15F46CF66D51688B017239AAF6`。

> 当前状态：**IN_PROGRESS；2026-07-30 计划21整改已完成，等待最终独立只读审计。Phase 03、Phase 04、Phase 06保持`IN_PROGRESS`，不得恢复`COMPLETE`；Phase 07保持`NOT_STARTED`。**
>
> **2026-07-30 最终复验更正：** 补充“导出producer入口内声明但未调用的arrow helper”反例后，当前实现只沿实际IIFE、调用参数callback、返回API与本地调用图；该回归RED→GREEN且5/5 production event不变。最终corpus33/33、production suite33/33（合计66/66），`npm test`225文件1333/1333、0 fail/skip（164.262秒），lint复验通过。本句取代紧随其后的32/32、1332/1332中间统计。
>
> **2026-07-30 最终证据引擎整改执行记录（当前权威，取代下方2026-07-29统计）：** 5个串行Ticket严格按RED→最小GREEN完成。新增反例并修复：仅import但不可调用的Renderer owner、同factory错误feature实例；bridge错误preload receiver、dead registrar helper；无关UI snapshot、无关state同名字段、query结果未流入snapshot；producer send仅在dead helper、同一import第二consumer、noop返回disposer+dead removal、未消费event application。production与mutation继续只调用`verifyCapabilityEvidence(context, fixture)`；corpus32/32，production suite33/33，其中inventory仍109（43 query、61 command、5 event）、lifecycle21/21、event5/5。订单真实SQLite矩阵31/31。完整`npm test`225文件1332/1332（171.121秒）、0 fail/skip；Auth16/16、links180/180、packaging33/33、capacity19/19、三套typecheck、lint/format、Renderer2157 modules（`index-DQopcXb_.js`）、preload222,057 bytes、pack smoke、order owner/ASAR parity、retired path zero、packaged preload3/3、Electron focus1/1及diff check全绿。ASAR7,212,371 bytes（2026-07-30 07:51:39.869 +08:00）/SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe225,485,824 bytes/SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。分支/HEAD=`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`，147条WIP保留、staged=0，真实数据/账号/供应商/投稿/同步/扣费/付费submit=0。`P1-CONVERGENCE-01`、`P2-FINAL-ORDER-01`、`P2-CONVERGENCE-02`均`VERIFIED`；Phase03/04/06=`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**
>
> **2026-07-29 唯一证据核心最终整改（最新当前权威，取代下方同日统计）：** production-level RED直接调用109项matrix相同入口，分别证明旧production verifier错误放行不存在的lifecycle `stateSource`与不存在的event producer；其余独立反例覆盖错误receiver identity、shadow/作用域同名、错误binding/props/factory wiring、registrar分离或错误application symbol、dead export、lifecycle未更新/未消费以及event错误channel/第二consumer/缺dispose。现仅保留`verifyCapabilityEvidence(context, fixture)`权威核心，production与mutation直接调用同一实现，以同一Program/TypeChecker验证Renderer entry→module→callable owner可达性、receiver/callee symbol identity、feature→bridge→preload→registrar/application；21项lifecycle逐项闭合query→state field update→snapshot→可达consumer，5项event逐项闭合producer→唯一bridge consumer→同channel/同callback dispose。`P1-CONVERGENCE-01=VERIFIED`；inventory仍109（43 query、61 command、5 event），matrix 109/109、lifecycle21/21、event5/5、mutation/acceptance20/20。Phase03 supplier `2→9`订单RED已由canonical published+安全持久URL统一投影/command语义修复，`P2-FINAL-ORDER-01=VERIFIED`；`P2-CONVERGENCE-02`继续`VERIFIED`。完整`npm test`225文件1318/1318、0 fail/skip，Auth16/16、links180/180、packaging33/33、capacity20/20（原冻结19项均通过）、13k SQLite query/SQL=1/1、parsed=3、orders=3、paid send=0，三套typecheck、lint/format、Renderer2157 modules（`index-DQopcXb_.js`）、preload222,057 bytes、pack smoke、最新ASAR parity、packaged preload3/3、Electron focus1/1及diff均通过；等价移除event producer channel恒真比较后，matrix/lifecycle/event/mutation组合54/54与lint再次通过。最新ASAR 7,212,371 bytes（23:29:01.007 +08:00），SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe 225,485,824 bytes（23:29:01.819 +08:00），SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`，既有WIP保留且staged为空；真实数据与外部/付费调用为0。Phase03/04/06保持`IN_PROGRESS`，Phase07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**
>
> **2026-07-29 最终审计收敛整改（当前权威）：** `P1-CONVERGENCE-01`先冻结12类mutation：同名错误receiver、局部shadow、另一作用域helper、文件别处binding、同名member未使用binding、bridge未传factory、错误props wiring、registrar外层分离、handler错误application symbol、event缺dispose/第二consumer/无producer、lifecycle无snapshot consumer、dead export；connected baseline GREEN且12/12 mutation均RED。正式109项matrix已删除parse-only旧helper，不再使用receiver文本、全文件同名声明、`featureMethod===binding`、`.endsWith(application)`或channel/application跨call拼接，改为一个TypeScript Program/TypeChecker中的alias resolution、symbol identity、作用域内调用图、参数/常量传播、JSX wiring与registrar handler闭合；109/109 GREEN。为静态闭合实际production binding，仅将content command surface、settings query调用和GeneratedArticles命令类型显式化，并纠正14个application owner路径与1个preload member fixture；non-Auth inventory/schema仍109（43 query、61 command、5 event），Typed IPC/preload/registrar/public transport schema未变，Renderer内部Commands类型更精确。B归属Phase03且行为矩阵28/28。C为完整225文件1281/1281、Auth16/16、links180/180、packaging33/33、capacity19/19、ASAR/legacy/preload12/12、显式Electron focus1/1、三套typecheck/lint/format/build/pack/diff全绿。最新ASAR7,212,213 bytes，SHA-256 `DB9DB4FC1629A59CE4534D1EC65937337B6C14D3BCB540C8CCB5FACA574C9F7F`，Renderer `index-DQopcXb_.js`。Phase03/04/06保持`IN_PROGRESS`，Phase07=`NOT_STARTED`；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**
>
> **2026-07-29 第三轮整改（当前权威）：** 独立审计的same-name断链反例先使matrix 5/6 RED。当前109项fixture逐capability显式记录consumer receiver，调用必须匹配完整`receiver.method`；bare callback单独记录为空receiver。feature→bridge证据删除`members.length + file binding`与`featureMethod===binding + file binding`两个兜底，只接受正式member、从member可达的局部声明、显式nested `commands`容器或单独记录的direct lifecycle call；meta门禁要求receiver并拒绝旧文件级模式。mutation与完整matrix转绿，capability/caller/fail-closed为20/20，inventory仍109（43 query、61 command、5 event）。Phase06 production bridge/preload/registrar/API surface未改。完整1267/1267、ASAR/legacy/preload11/11、capacity19/19、最新Renderer focus1/1及全部全局门禁通过；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**
>
> **2026-07-29 追加审计整改（当前权威）：** capability证据RED证明旧`invokesMethod`只看终端同名调用、`containsNamedFeatureMember`接受任意identifier/string，registrar还可把channel与application property分离匹配。现109项matrix使用结构化AST：consumer必须调用记录的方法，正式feature member必须使用记录的bridge binding，同一个registrar `CallExpression`必须同时出现精确channel与application property；meta门禁物理拒绝两个旧helper，未加入源码字符串白名单。capability/caller/fail-closed 19/19、完整matrix 5/5，canonical inventory保持109（43 query、61 command、5 event）。同时复核Phase03跨聚合batch item拒绝与MediaOrderService packaged owner parity；最终223文件1265/1265、capacity19/19、ASAR/legacy/preload11/11、最新Renderer focus1/1及所有全局门禁通过。Phase06 production bridge/preload/registrar/API surface未改变，本轮只强化证据；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**
>
> **2026-07-29 第二轮整改检查点 C 最终权威结论：** 原17项`P1-01..P1-07`、`P2-08..P2-15`、`P3-16..P3-17`与`P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`共20项逐项复核为`VERIFIED`。旧ASAR packaged OperationalStore parity先7/8 RED，本轮pack后source/export/import-call/test/ASAR为8/8；`P1-05`正式observation链正确且旧reconcile/fallback/source/export/test/ASAR物理消失，`P1-AUDIT-03`完整覆盖schema v2→v3、新表、retained methods、migration/backup/restore/verify/fault。canonical non-Auth inventory仍为109（43 query、61 command、5 event）。专项131/131、capacity19/19、完整223文件1263/1263、Auth16/16、links180/180、packaging33/33、三套typecheck、lint、format、Renderer2157 modules、pack smoke、packaged preload3/3、最新Renderer Electron focus1/1、diff check全绿；Main/Renderer容量与第20,001项truncated边界通过，最新ASAR7,209,908 bytes（12:37:55.544 +08:00）。OperationalStore schema/public interface确有变化，Phase06 Typed IPC/Renderer interface未因A/B改变。真实外部/付费调用为0；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**
>
> Phase 05 已在 `13-progress-ledger.md` 与 `handoffs/phase-05.md` 记录为
> `COMPLETE`，完成commit为 `75dba966375302a99ebfd020c02ee6dd83930a9e`，里程碑记录commit为
> `365df706af110a25f900f63f05406a50d7b5e3b9`。本任务从
> `743571d9597ea2c68ab10a08da0914ccaed5352b` 启动；分支、commit ancestry、空工作区、前序状态、
> IPC inventory、定向基线和完整基线均已核验；最终实现从该 commit 后的未提交工作树完成，
> 用户于2026-07-28明确授权在完整安全门禁后形成一次Phase 06里程碑commit；未授权push/PR。Phase 07 保持 `NOT_STARTED`。
>
> 本阶段的唯一文档来源是 `F:/官媒投稿-refactor/docs/`。除非本文或本文引用的当前
> `docs/refactor` 文档明确引用，禁止读取或采用 `auto—publish/docs/` 下的 ADR、计划、
> 产品契约、测试清单或操作说明；它们属于旧代码历史材料，不能覆盖当前 `docs/`、当前代码和阶段交接。

### 2026-07-29 最终独立审计第二轮整改：检查点 B 当前权威结论

- `P1-AUDIT-03` 的文档RED由当前代码/Git差异与静态文档扫描共同确认：下方历史段落仍把本轮写成“未改OperationalStore/schema/interface”，与实际Phase 03 schema v2→v3、新表`order_display_snapshots`、新增`listOrderDisplayViews()`/`recordRemoteOrderObservation()`不符；历史inventory=110也已失效，canonical仍为109（43 query、61 command、5 event）。本段取代所有相冲突历史说法，但不删除历史记录。
- v3表精确契约：`attempt_id`为`TEXT PRIMARY KEY NOT NULL`且唯一FK到`publication_attempts.attempt_id`；title/filename/resource name/created time均`TEXT NOT NULL`，`quoted_price REAL`可空。media outcome与batch item同事务写不可变snapshot；历史缺失值不倒填。
- `listOrderDisplayViews()`由Phase 03 `MediaOrderService.listOrderViews()`消费，一条`LEFT JOIN ... LIMIT 20000`且只解析订单行；Phase 06只接收删除raw URL/workflow identity后的安全Renderer DTO。`recordRemoteOrderObservation()`由`MediaOrderService.syncOrder()`调用，事务保存supplier observation并执行安全HTTPS evidence规则；A已物理删除`reconcileRemoteOrder()`和canonical→supplier fallback。
- B RED为v3专项2/4：损坏FK/required nullability未被open/restore verifier拒绝；恢复fixture路径也未命中canonical DB。修复正确owner后为4/4，覆盖v2→v3、连续history、重复启动、三个fault point回滚/重试、损坏结构、backup verify与临时restore。扩展45/45；13k为query/SQL=1/1、parsed=3、heap143,288 bytes、0.471ms、paidSendCalls=0；三套typecheck、lint、format、links180/180、packaging33/33、diff check通过。
- Interface判断：OperationalStore schema/public surface确有变化；PublicationWorkflow、Publisher、ContentStore、Domain/Application及Phase 06 Typed IPC/Renderer interface本检查点未变。真实外部/投稿/同步/付费submit=0。`P1-AUDIT-03`达到检查点级`VERIFIED`；下一动作严格进入C，Phase 03/04/06保持`IN_PROGRESS`，Phase07=`NOT_STARTED`。

### 2026-07-29 最终独立审计第二轮整改：检查点 A

- 当前工作树 source/export/import-call/test/packaged-ASAR 回归先为 0/4 RED；Phase 03 正确 owner 物理删除 OperationalStore `reconcileRemoteOrder` 定义与 public export、canonical publication status→supplier code fallback 和只验证旧 wrapper 的测试，URL evidence 测试迁至 `recordRemoteOrderObservation()`，不留 wrapper/re-export。
- 删除后源码/测试为 3/4，仅旧 ASAR 保持 RED；本轮 Renderer build 与 pack smoke 后为 4/4，连同既有 legacy source/import/ASAR 门禁为 7/7。Phase 06 只负责永久 source graph/packaged evidence，没有新增、删除或改变 109 项 non-Auth Typed IPC capability；Auth 六项豁免不变。
- Interface/schema 判断：A 未改变 schema；Phase 03 OperationalStore public interface 确实删除 `reconcileRemoteOrder`，保留的正式 supplier sync 路径为 `MediaOrderService.syncOrder()` → `recordRemoteOrderObservation()`。Phase 06 Renderer DTO/bridge/registry interface 未变化。
- supplier/order 定向 23/23；main/renderer/bridge 三套 typecheck、lint、format、packaging 33/33、Renderer 2157 modules、preload 222,057 bytes、pack smoke 与 diff check通过。新 ASAR 7,209,505 bytes（2026-07-29 12:14:07 +08:00），真实 workspace/内容库/Auth/账号/供应商/投稿/同步/扣费/付费 submit调用均为0。
- 状态：`P1-05` 的旧 fallback 物理删除部分达到本轮检查点 `VERIFIED`；下一动作严格进入 B，核对 Phase 03 schema v2→v3 与 retained OperationalStore interface。Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`。

### 2026-07-29 P2-09 最终证据纠正

- RED 1：新增永久门禁后，`media.removeDraft` 仍出现在 production registry，但 Renderer 只有定义、没有调用者；测试 1/2、1 fail。GREEN：从 media contract、registrar、preload、bridge、feature dependency/public method、fixture 与测试 fake 全链物理删除，production source 中 `media.removeDraft` / `media:remove-draft` / `removeDraft` 为零。
- RED 2：109 项 fixture 起初均没有 capability-specific `consumer` 事实，shape 门禁在 `workspace.getBootstrapState` 首项失败。GREEN：每项显式记录 direct/lifecycle/event consumer、production source、调用方法、feature source/public method；TypeScript AST 验证 source 从 `main.tsx`（含 dynamic import）可达并真实调用，禁止 `source.includes`。
- 自动 query 不能以通用 hook 冒充调用者：21 项 lifecycle query 另记录并验证真实 UI snapshot root/field 消费；4 条 props 回调链验证父组件将 feature public method 绑定到子组件实际调用 prop；5 个 event 继续验证 producer、唯一 bridge consumer、精确 channel 与 dispose。
- 最终 inventory 为 109 项：43 query、61 command、5 event；owner 为 workspace 9、settings 14、media 17、platform 10、content 43、attention 3、generation 13。历史 110 项记录保留为整改历史，不再代表当前 canonical tree。
- 正确 owner 为 Phase 06 Typed IPC/feature composition；仅删除未消费的 media IPC capability，没有重开或修改 Phase 03/04 的 Domain/Application、PublicationWorkflow、OperationalStore、Publisher、schema、PlatformRun 或 adapter 冻结 interface。
- 当前工作树完整门禁：`npm test` 222 文件 1255/1255、0 fail/skip、160.808 秒；inventory/media 专项 39/39；Auth 16/16、links 180/180、packaging 33/33；lint、format、三套 typecheck、Renderer 2157 modules、preload 222,057 bytes、pack smoke、packaged source/import/ASAR 5/5、Electron focus 1/1、容量与 `git diff --check` 均通过。
- 新制品：ASAR 7,210,485 bytes（2026-07-29 11:05:55），exe 225,485,824 bytes（11:05:56），Renderer asset `index-cypc4NxJ.js`。全部使用 AST、VM、临时 SQLite、内存 fake、合成 fixture 和本地 Electron；真实 workspace、账号、供应商、投稿、同步、扣费及付费 submit 调用为 0。Phase 03/04/06 继续 `IN_PROGRESS`，Phase 07 继续 `NOT_STARTED`。**整改完成，等待最终独立只读审计。**

### 2026-07-29 最终独立审计后续整改：检查点 A

- 状态保持 `IN_PROGRESS`；`P1-AUDIT-01` 已按当前工作树完成 production-level RED→GREEN，并达到检查点级 `VERIFIED`。本结论不恢复 Phase 03/04/06 的 `COMPLETE`，Phase 07 仍为 `NOT_STARTED`。
- RED：新增 `tests/phase-06-production-bridge-fail-closed.test.js`，直接 bundle 并执行真实 Renderer bridge；旧实现 6 tests / 0 pass / 6 fail，真实复现非 Electron、`desktopConsole`、namespace、具体 query/command/event capability 及成功 envelope `data:null/undefined` 时返回空数组、空分页、`false`、`null`、idle/selection/diagnostic fixture、resolved void 或 noop disposer。
- GREEN：Phase 06 `bridge/transport.ts` 成为唯一 non-Auth fail-closed owner，以固定 `OperationalError` 投影 `IPC_CAPABILITY_UNAVAILABLE` / `IPC_RESULT_INVALID`、`category=transport`、`retryability=safe`；media/platform/settings/workspace/publication/account-profile/content 全部使用固定 namespace/capability gate，移除 production synthetic business success。Auth 5 invoke + 1 event 继续保持 Phase 07 明确豁免，没有扩大。
- 显式 mock：测试数据仅由测试内 `mockAdapter` 注入；production bridge 在同一非 Electron 条件下仍拒绝。没有新增 browser fallback、compatibility wrapper、catch-all 或 Domain/Application 修改。
- 验证：新行为测试 6/6；bridge/media/platform/settings/workspace/content/publication/feature 定向集 14 files、97/97、0 fail/skip；三套 typecheck、lint、format check 与 `git diff --check` 通过。真实 workspace、内容库、Auth 数据库、账号、供应商和付费服务调用均为 0，真实投稿/同步/付费 submit 为 0。
- `P1-07` 已扩大重验为所有 non-Auth production bridge，而不再只覆盖 content bridge；下一动作严格进入检查点 B，重建逐 capability 结构化真实 caller inventory。

### 2026-07-29 最终独立审计后续整改：检查点 B

- RED：新增 `tests/phase-06-capability-specific-inventory.test.js`；旧 fixture 通过 `productionCallerTrace(entry)`、按 capability owner 推导通用 hook，并在 matrix 中用 `source.includes` 证明，结果为 0/1（1 fail）。
- GREEN：110 项 capability 全部改为显式独立 `productionCaller`；owner 分布为 workspace 9、settings 14、media 18、platform 10、content 43、attention 3、generation 13。TypeScript AST 逐项验证 View/root 实际调用或渲染 feature、feature 明确导出及 capability-specific bridge binding/调用、bridge export、preload 命名 member→精确 channel、registrar channel 与 application/service property access。
- 5 个 event（`platform.stateChanged`、`content.articleRemovalTransactionChanged`、`content.doubaoQueueChanged`、`generation.runtimeChanged`、`workspace.invalidated`）另验证 producer、唯一直接 bridge consumer、精确 event channel 与 `ipcRenderer.removeListener` dispose。Auth 5 invoke + 1 event 仍为 Phase 07 精确豁免。
- 本轮真实 inventory 未发现新的无 consumer capability；此前已按当前 canonical tree 删除的 18 项没有恢复，未增加 wrapper、通用 hook 或通用 IPC。B 定向 15 files、89/89、0 fail/skip；三套 typecheck、lint、format 与 `git diff --check` 通过。
- Phase 03/04/06 保持 `IN_PROGRESS`，Phase 07 保持 `NOT_STARTED`。全部验证使用静态 AST、VM、内存 fake 或合成 fixture，真实 workspace、内容库、Auth 数据库、账号、供应商、投稿、同步与付费 submit 调用均为 0。下一动作严格进入检查点 C。

### 2026-07-29 最终独立审计后续整改：检查点 C

- RED：新增 `tests/phase-06-legacy-path-absence.test.js`，在删除前当前 source tree 与 2026-07-29 01:15:52 旧 ASAR 上为1/3、2 fail；明确证明四条点名路径仍同时存在于 source 与制品，production import graph 已为零。
- 删除：物理删除 `src/core/jobs.js`、`desktop/services/submission/submission-preparation.js`、`desktop/services/submission/submission-query.js`、`src/platforms/media/preflight.js`；同时删除 `desktop/services/submission/` 下 `action.js`、`preparation.js`、`query.js`、`read-snapshot.js`、`submission-action.js`、`submission-read-snapshot.js` 六条等价 dead implementation。没有迁移到别处、re-export、compatibility wrapper或 package glob例外。
- 旧测试处置：删除只执行旧 submission query 与 media preflight implementation 的两个测试文件；`published-archive` 仅移除依赖 `src/core/jobs.js` 的旧远端协调用例，保留 canonical post-processor 使用的 archive 原子性测试；Phase 05 seam清单移除已删除路径。旧 `resourceId/resourceName` 单资源 preflight fallback 随 production 文件物理消失。
- GREEN：source tree、production import graph及本轮新 `release-alpha/win-unpacked/resources/app.asar` 三项3/3；ASAR对四条点名路径与六条等价 submission 路径均为零。Phase 03/04/legacy/packaging扩展定向25 files、95/95；packaging33/33；三套typecheck、lint、format、Renderer build 2157 modules、preload 222,542 bytes、pack smoke与`git diff --check`通过。
- 新制品：`release-alpha/win-unpacked/resources/app.asar` 7,211,917 bytes、`release-alpha/win-unpacked/鱼饼大王.exe` 225,485,824 bytes，2026-07-29 08:32:10。全部为本地合成fixture、临时SQLite、VM与本地Electron；真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步及付费submit为0。
- Phase 03/04/06继续`IN_PROGRESS`，Phase 07继续`NOT_STARTED`。下一动作仅为逐项复核原17项、`P1-AUDIT-01`、`P2-AUDIT-02`及第10节最终完整门禁。

### 2026-07-29 最终终态：19项复核与第10节门禁

- Git终态基线保持`codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`；启动时已有Phase 03/04/06整改WIP均已保留并解释，staged diff始终为空，未reset、checkout、clean、stage、commit、push或创建PR。
- A二次Electron composition检查发现真实`contextBridge`冻结namespace与transport返回bound function冲突；新增frozen namespace用例先为6/7、1 fail，transport在继续拒绝缺namespace/capability/result的同时改为返回原始函数引用，最终行为测试7/7。测试数据仍只由显式`mockAdapter`注入，production bridge没有synthetic success或noop event。
- B终态仍为110/110 non-Auth capability：43 query、62 command、5 event；workspace 9、settings 14、media 18、platform 10、content 43、attention 3、generation 13。每项由TypeScript AST证明真实View/root→feature→bridge→preload→registrar/application链，5项event另证明producer、唯一直接consumer及dispose。Auth仅保留5 invoke+1 event精确豁免；本轮未发现新的无consumer能力。
- C终态为source tree、production import graph和本轮ASAR零路径3/3；四条点名文件及六条等价submission implementation均物理删除，无迁移、re-export、wrapper或package例外。

| Finding | 当前复核 | Production证据与RED→GREEN |
| --- | --- | --- |
| `P1-01` Platform event workspace identity | `VERIFIED` | Phase 04/06 owner；A→B后迟到heartbeat/terminal RED转为runtime identity fencing GREEN，真实Renderer composition保持B snapshot，未改PlatformRun/Publisher interface。 |
| `P1-02` ConfirmationHost/destructive scope | `VERIFIED` | Phase 06 owner；root scope、FIFO、focus、exactly-once及execute前identity复验均由真实Renderer测试覆盖，旧页面级confirmation owner已删除。 |
| `P1-03` SafeOperationalError语义安全 | `VERIFIED` | Phase 06 registry owner；敏感路径、URL credentials、Cookie、stack、正文反例转为固定安全错误与diagnostic ID，Phase 01冻结DTO未变化。 |
| `P1-04` raw URL/内部订单字段 | `VERIFIED` | Phase 03/06 projection owner；Renderer DTO只保留`hasPublishedUrl`，打开URL由main按OperationalStore HTTPS evidence解析；raw URL/workflow字段旧桥接路径为零。 |
| `P1-05` supplier/canonical状态解耦 | `VERIFIED` | Phase 03 owner；supplier `0/1/2/4/9`独立observation测试转绿，只有`2`加安全evidence提升canonical状态；legacy ledger/status fallback已删除。 |
| `P1-06` 媒体价格canonical化 | `VERIFIED` | MediaResourceService摄取owner；字符串报价RED转为唯一finite non-negative number/unknown投影，cache/pool/workbench/submission重复转换与raw副本已删除。 |
| `P1-07` production bridge synthetic fallback | `VERIFIED` | Phase 06 transport owner；初始0/6 RED→6/6，再以冻结namespace 6/7 RED→7/7；全部non-Auth query/command/event/result缺失fail-closed，显式mock仅在测试。 |
| `P2-08` registrar fail-closed | `VERIFIED` | Phase 06 registrar owner；未登记非Auth channel RED转为注册前拒绝，Auth六项只在精确allowlist，通用invoke/on不存在。 |
| `P2-09` production caller traceability | `VERIFIED` | Phase 06 inventory owner；旧`productionCallerTrace`/owner通用hook/`source.includes`为0/1 RED，现110/110逐项AST真实链通过，event producer/唯一consumer/dispose闭合。 |
| `P2-10` invalid event diagnostic sink | `VERIFIED` | Phase 06 workspace/platform event owner；malformed event经真实preload进入同一有界安全diagnostic store，read/subscribe/dispose通过且不保留原payload。 |
| `P2-11` 唯一SettingsFeatureProvider | `VERIFIED` | Phase 06 root composition owner；production AST只存在一个provider，Settings与media第三方标识共用该owner，重复provider路径为零。 |
| `P2-12` sync reconcile错误传播 | `VERIFIED` | Phase 03 application owner；supplier解析/SQLite/evidence冲突故障注入统一为`MEDIA_ORDER_SYNC_FAILED`并事务回滚，原payload与路径不泄露。 |
| `P2-13` 有界订单projection | `VERIFIED` | Phase 03 OperationalStore owner；13k临时SQLite为query=1、SQL=1、parsed=3、orders=3、heap=143,288 bytes、0.358ms、paidSendCalls=0，service fallback已删除。 |
| `P2-14` dead `media.stopSubmit` | `VERIFIED` | Phase 06 owner；contract/fixture/preload/bridge/feature/registrar及未读service flag全链删除，production零引用。 |
| `P2-15` media Promise/error owner | `VERIFIED` | Phase 06 media feature owner；refresh/toggle错误由snapshot收敛，void caller纵向测试无unhandled rejection，旧rethrow路径删除。 |
| `P3-16` `navigationSummary` dead scope | `VERIFIED` | Phase 06 protocol owner；main invalidation/Renderer known scopes零引用，仅保留Sidebar本地derived view。 |
| `P3-17` `publishedAt`真实性 | `VERIFIED` | Phase 03/06 owner；ISO instant贯穿store/main/IPC/bridge，只有OrdersView格式化；UTC跨日、`+08:00`与空值回归通过。 |
| `P1-AUDIT-01` 全production bridge fail-closed | `VERIFIED` | 检查点A与frozen namespace二次RED均转绿；所有non-Auth bridge缺transport/namespace/capability/result/event时稳定拒绝，production synthetic business success为零。 |
| `P2-AUDIT-02` legacy source/ASAR物理删除 | `VERIFIED` | 检查点C 1/3、2 fail→3/3；四条点名及六条等价路径从source/import graph/ASAR消失，没有wrapper、迁移副本或package例外。 |

以上19项均在正确owner内整改，未重开Domain/Application、PublicationWorkflow、OperationalStore、Publisher、schema或其它冻结interface；适用旧路径删除见各行，统一由下列当前工作树门禁覆盖：

- `npm test`：222文件、1252/1252、0 fail、0 skip，158.040秒；Auth16/16、links180/180、packaging33/33、最终专项138/138。
- lint、format、main/renderer/bridge三套typecheck均通过；Renderer build为2157 modules，preload为222,542 bytes；pack smoke通过；packaged preload+legacy ASAR为6/6；基于本轮最新Renderer的Electron focus为1/1；`git diff --check`通过。
- 最新制品：`release-alpha/win-unpacked/resources/app.asar` 7,211,886 bytes（2026-07-29 08:58:01），`release-alpha/win-unpacked/鱼饼大王.exe` 225,485,824 bytes（2026-07-29 08:58:02），Renderer asset为`index-DVe8E-ba.js`。
- 容量：Main 1k/10k/13k/20k请求10/100/130/200，payload 44,603/464,188/610,078/950,488 bytes；Renderer各1请求，payload 4,279/4,280/4,280/4,280 bytes；第20,001项明确truncated。13k SQLite指标见`P2-13`行。
- 所有执行仅使用fake client、临时SQLite、VM、内存adapter、合成workspace/resource和本地Electron；真实workspace、内容库、Auth数据库、账号、供应商与付费服务访问为0，真实投稿、订单同步、扣费及付费submit调用均为0。

**整改完成，等待最终独立只读审计。** Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`；本任务不得自行改变这些状态，也不得开始Phase 07。

### 2026-07-28 审计整改检查点C

- P2-08、P2-09、P2-10、P2-11、P2-14、P2-15、P3-16均为`VERIFIED（检查点C）`；进入C前A/B定向复验124/124且三套typecheck通过，未发现回归。
- 非Auth production Typed IPC重新按真实consumer清点为110项：43 query、62 command、5 event；owner分布为workspace 9、settings 14、media 18、platform 10、content 43、attention 3、generation 13。canonical fixture的110/110 `productionCaller`逐项验证View hook→feature bridge wiring→bridge export→真实preload命名方法/精确channel→registrar，event另验证producer、唯一直接bridge consumer与removeListener dispose。
- 物理删除18项无真实consumer能力：`attention.getArticleAttention`；`content.listTemplates`、`content.listGeneratedArticles`、`content.reviewArticles`、`content.listArticleTrash`、`content.previewTrashArticles`、`content.listArticleRemovalTransactions`、`content.listSubmissionBatches`、`content.previewCancelSubmissionBatch`、`content.previewRetryFailedPublication`、`content.retryFailedPublication`、`content.startDoubaoBatch`；`generation.createBatch`、`generation.listBatches`、`generation.getBatch`、`generation.startBatch`、`generation.getState`；`publication.listForArticles`。contract、registrar、preload、bridge、fixture和专属旧测试同步删除，无兼容wrapper。
- Auth六项保持Phase 07显式豁免：invoke `auth:get-state`、`auth:login`、`auth:change-password`、`auth:refresh`、`auth:logout`；event `auth-state-changed`。未新增通用invoke/on/channel。
- malformed `workspace:data-invalidated`和`platform-state`纵向测试以VM执行真实`desktop/preload.js`，经workspace coordinator/platform router进入同一个有界diagnostic store；只保留固定code/source，拒绝原payload、路径、URL credentials、Cookie、stack、正文和unknown scope，并覆盖read/subscribe与transport dispose。
- production只有一个`<SettingsFeatureProvider>`；registrar对未登记非Auth channel保持fail-closed；media refresh/toggle Promise失败由feature snapshot owner安全显示且不rethrow；production/fixture中`media.stopSubmit`/`media:stop-submit`为零引用，协议层`navigationSummary`为零引用（Sidebar本地derived view保留）。
- C实施定向21文件129/129，文档写回后独立21文件复核集128/128且重复覆盖核心110/110 matrix与纵向测试；packaging 33/33、三套typecheck及`git diff --check`通过。全部使用VM、内存fake或合成fixture，真实投稿/付费调用为0。该条为C检查点历史终态；最终完整门禁已在下节完成。

### 2026-07-28 最终完整门禁与证据收口

- 当前工作树完整`npm test`为221文件、1247/1247、0 fail/skip；Auth16/16、links180/180、packaging33/33，lint、三套typecheck、format、Renderer build、pack smoke与diff check通过。
- 专项71/71；inventory 110/110；packaged ASAR 3/3；最新Renderer Electron focus 1/1。容量与SQLite指标、Auth六项豁免及真实付费submit=0的完整记录见`16-phase-06-final-audit-remediation-plan.md`第2.1节和本阶段handoff。
- 17/17 findings提升为最终`VERIFIED`，但本轮不自行恢复阶段`COMPLETE`；Phase 03/04/06继续`IN_PROGRESS`，等待下一轮独立只读审计，Phase 07不启动。

## 1. 阶段目标

把 Renderer 从分散的页面状态、请求竞态、重复 invalidation 订阅和共享 command busy，重构为按真实业务状态所有权划分的 feature modules；把 preload/main IPC 收敛为固定能力、版本化 DTO、运行时验证和安全错误转换。

完成后应同时改善：

- **低耦合**：View 不知道跨 query 刷新顺序、publication/content 内部规则、IPC channel 或错误转换规则。
- **可维护**：每个 snapshot、query identity、command lifecycle 和 invalidation consumer 都有唯一 owner。
- **可扩展**：新增 mutation 通常只修改一个 feature module、一个 typed IPC contract 和对应 application capability，不在多个页面复制订阅/刷新。
- **运行时性能**：避免重复 query、过期响应写入、无界资源抓取、超大 IPC structured clone 和无关 View 重渲染。

关联工作：OPT-015、020、021、022、023、024、027；覆盖 F-H01、F-M03～M08、F-L01。

## 2. 非目标

- 不改变 Domain/Application interface 来迁就页面状态。
- 不修改 publication、content identity、removal、PlatformRun 或 publisher 的既有业务语义。
- 不重做 UI 视觉设计，不新增普通产品功能。
- 不一次性把全仓改写为 TypeScript，不默认引入大型状态框架。
- 不在本阶段重构 `auth:*` 业务协议；Auth 的灾备、限速和安全收口属于 Phase 07。
- 不向 Renderer 暴露原始日志流、文件路径、数据库、Cookie、密钥、原始 Error 或 stack。

## 3. 开始条件

以下条件必须全部满足才可把 Phase 06 从“计划”切换为“实施”：

1. Phase 05 在进度账本和交接中均为 `COMPLETE`，有明确里程碑 commit。
2. 当前工作区没有未解释的 Phase 05 WIP；用户已有修改已识别并可隔离。
3. Publication、Content、Platform application interfaces及其 DTO 已稳定。
4. 当前 Renderer 可通过阶段0门禁构建和类型检查。
5. 按执行协议记录分支、HEAD、status、unstaged/staged diff 和前序完成证据。
6. 先形成现存 IPC 能力清单、feature ownership 表和基线测试证据，再写第一个失败测试。

任一条件不满足时停止实施，只允许继续完善本文。

## 4. 必读输入

- `docs/refactor/README.md`、总纲、目标架构、执行协议、进度账本和本文。
- Phase 03～05 当前交接；以最新 Phase 05 交接为前序事实，不以旧 review 结论覆盖当前代码。
- `docs/review/modules/` 中 M05、M06、M07、M08、M09、M10、M23 module报告。
- 当前 preload、IPC registrars、renderer bridges、App、ContentWorkbench、PlatformWorkbench、GeneratedArticlesView、SettingsView、OrdersView、attention/workspace stores。
- OPT-015、020～024、027及 `docs/optimization/03-verification-matrix.md`。
- `docs/refactor/12-traceability-matrix.md` 中 Phase 06 对应项。

## 5. 允许修改

- Renderer feature modules、views、controllers/stores/hooks和 feature composition。
- Preload固定能力面、非 Auth IPC adapters、共享 IPC DTO/validators和安全错误投影。
- Workspace invalidation consumer、query/command identity infrastructure。
- 媒体资源 service 的分页、去重、容量边界和安全诊断；不得改变外部媒体 API 的业务语义或凭据处理。
- Renderer unit/integration/Electron E2E、deferred promise、焦点、容量和 IPC contract测试。
- 删除已被新 feature module替代的旧 hooks/controller/bridge订阅和无消费者事件发送。
- Phase 06 阶段文档、交接、进度账本和当前文档明确要求的测试清单。

## 6. 禁止修改

- Domain/Application interface 来迁就 View 局部状态。
- OperationalStore、ContentStore、平台 adapter implementation或 Auth 业务语义。
- 让 Renderer 获得文件路径、数据库 handle、Cookie、密钥、原始 Error、stack、原始日志或任意 IPC channel。
- 同时保留新 feature module 与旧页面订阅作为长期双轨。
- 建立通用 `invoke(channel, payload)`、通用 mega-store、通用 command 字符串分派或只转发旧 bridge 的浅 wrapper。
- 让 View 自行组合多个 bridge response 判断业务阶段、解释 reasonCode 或决定 publication 状态。
- 取消已到达 main/application 的 mutation 来伪装 UI 取消；mutation 结果可以在旧 scope 中被丢弃，但业务事实必须通过当前 scope 安全刷新重新发现。
- 为状态管理默认增加大型依赖；只有删除测试证明 caller interface 显著变小且现有原语不足时才允许提议依赖，并须先停下更新本文。

## 7. 已确认设计决策

### 7.1 Feature ownership

| Owner | 权威 Renderer snapshot 与职责 | 不属于它的职责 |
|---|---|---|
| `workspace` | bootstrap/current workspace、opaque runtime identity、唯一 invalidation transport consumer、scope dispatch、导航摘要 projection | 不解释各 feature 的业务状态，不读取路径 |
| `content` | 客户、资料、问题/调研、当前文章、文章管理、trash/removal；单篇生成作为更新当前文章的 content command | 不拥有 generation batch runtime，不推断 publication 状态 |
| `generation` | generation batch/run snapshot、pause/stop/continue/retry、generation→submission handoff | 不复制 content 客户/文章 snapshot |
| `platform` | 投稿队列、account profile/login projection、PlatformRun snapshot、submit/pause/stop、queue residue | 不在 Renderer 重建 PlatformRun 状态机 |
| `media` | 媒体稿件/草稿、资源页、资源池、余额、资源选择、媒体 submission、orders | 不全量加载资源，不修改远端订单事实 |
| `attention` | attention query snapshot、后端允许动作闭集、preview/execute lifecycle | 不持久化第二份 publication 状态 |
| `settings` | AI/platform/runtime/storage settings query 与独立 command 状态 | Auth 协议、workspace invalidation 或业务运行状态 |

`confirmation` 是跨 feature 的 UI infrastructure，不是业务 feature。一个 View 可以消费多个 feature snapshot，但不能成为它们的协调 owner。Feature 数量只能因真实状态所有权变化而调整；不能按页面一一建立浅 wrapper。

### 7.2 Feature public interface

每个 feature 对 View 的稳定外形至少包含：

```ts
type Unsubscribe = () => void;

interface FeatureModule<Snapshot, Scope> {
  getSnapshot(): Snapshot;
  subscribe(listener: () => void): Unsubscribe;
  setScope(scope: Scope): void;
  refresh(reason?: "initial" | "manual" | "invalidation" | "command-result"): Promise<void>;
  dispose(): void;
  // 每个 feature 另行暴露命名明确、参数严格的 commands；禁止通用 dispatch。
}
```

该外形是约束，不要求实现通用基类。每个 snapshot 至少包含 scope identity、query lifecycle、数据、结构化错误和命名明确的 command states。View 只订阅、渲染和调用命名 command。

删除测试：若删除 feature module 会让 request identity、刷新映射、command busy/error 或业务阶段判断重新散回多个 View/caller，该 module 才有保留价值。

### 7.3 Query 与 command identity

- Query identity key 至少为 `feature + query + scope identity`，不得只使用页面级计数器。
- initial、manual refresh、invalidation refresh 和 command-result refresh 使用同一 token 规则。
- 每次 refresh 都产生新 token并使旧 token失效；不能因已有 in-flight initial request 就把较新的 invalidation 合并到旧 Promise。
- 查询可以使用 AbortController 降低无效 I/O，但提交 response 前仍必须同时验证 token、scope identity和 feature 未 disposed。
- Scope 切换、workspace runtime 切换和 dispose 立即使旧 query/command UI result失效。
- 已进入 main/application 的 mutation 不因 UI token失效而被取消；迟到结果不写旧 scope，并触发当前 scope 的安全 refresh。
- 每种 command 有独立 operation token、busy/error/result owner；不使用全局 busy，也不让 pause/stop 窃取 submit 的 finalize 权。
- Platform busy 以 PlatformRun snapshot 为最终权威；Renderer command state只表示命令请求本身。

### 7.4 Typed IPC范围

Phase 06 启动后先生成实际能力清单。当前 preload 基线约有 131 个 invoke channel 和6个 event channel；数字只能作为规划提示，实施时必须重新统计。

- 覆盖所有仍有 production Renderer caller 的非 Auth capability，包括 workspace、content、generation、platform、media、settings、storage、runtime diagnostics、publication和相关 events。
- `auth:*` 作为 Phase 07 明确豁免项保留现状，但必须列入 inventory和Phase 06 handoff；不得借豁免留下任意 channel能力。
- 无 production Renderer caller 的 channel/event 在证明无其他安全消费者后删除，不为了“以后可能用”进入 preload。
- 当前无消费者的 `publish-log` 不新增 preload/Renderer raw-log能力；Phase 06 删除无效 Renderer事件发送，Phase 07 基于安全结构化 diagnostic interface提供观测。
- Preload只暴露领域/应用能力方法，不暴露 channel名、`ipcRenderer`、通用 invoke/on或可变参数透传。

### 7.5 IPC contract 与错误协议

每个剩余 command/query/event 必须在唯一 contract registry 中记录：

- 固定 capability 名和内部 channel；
- `schemaVersion`；
- exact request DTO validator；
- exact success DTO validator；
- `SafeOperationalError` 与该 capability允许的 error code闭集；
- event payload validator和订阅 dispose语义；
- owning feature、main application capability和production caller。

统一 response envelope：

```ts
type IpcResult<T> =
  | { schemaVersion: 1; ok: true; data: T }
  | { schemaVersion: 1; ok: false; error: SafeOperationalError };
```

约束：

- Main IPC adapter依次执行认证、request runtime validation、application调用、success DTO validation和安全错误转换。
- 未知版本、未知字段、未知 enum/status、非有限数字、超长字符串和不安全字符 fail-closed。
- 原始 Error、message、stack、绝对路径、Cookie、API key、正文、原始响应和DOM不得进入 result/event。
- Preload使用同一 registry 验证暴露给 Renderer 的 result/event，不复制 schema规则。
- Renderer bridge只调用固定 capability并把失败转换为稳定 `OperationalError`；不重复字段验证、业务错误映射或刷新编排。
- Contract registry必须是无 Electron/React/Node I/O 的纯运行时边界；Renderer只能导入安全 type，不导入 main/preload implementation。

### 7.6 Workspace invalidation协议

Main process 的 `reasonCode → scopes` 映射保持唯一权威；Renderer不再根据 reasonCode决定刷新什么。`reasonCode`在 Renderer仅用于安全诊断。

事件固定为：

```ts
type WorkspaceInvalidatedEvent = {
  schemaVersion: 1;
  workspaceRuntimeId: string; // 每次 workspace runtime 创建时生成的 opaque ID，不含路径
  revision: number;           // 同一 runtime 内严格单调
  scopes: WorkspaceDataScope[];
  reasonCode: string;
};
```

唯一 root coordinator 消费 `workspace:data-invalidated`：

- 新 `workspaceRuntimeId`：dispose旧 scope状态，重置 revision并对当前已注册 scope执行 initial load。
- 同 runtime 且 `revision <= lastRevision`：按重复/过期事件忽略。
- 同 runtime 且 `revision === lastRevision + 1`：只 dispatch event携带的已知 scopes。
- 同 runtime 且 revision有缺口：记录安全诊断，并刷新所有当前已注册的已知 scopes，避免未知漏刷新。
- 未知 scope：安全忽略该 scope并记录诊断；不得崩溃或刷新任意 query。
- 未知 schema、畸形 runtime ID/revision/reason：拒绝事件并记录安全诊断。
- 同一 revision/scope只触发一次 query；多个 View 不得各自订阅原始 IPC event。

`platform-state`、generation runtime和removal transaction等 feature 专属实时事件由各自 feature module消费，不塞入 workspace invalidation coordinator；它们仍须版本化、验证、去重和dispose。

### 7.7 Confirmation语义

- 全 Renderer 只有一个 `ConfirmationHost`。
- `confirm(options)` 使用 FIFO queue；不得像当前实现一样在已有 pending confirmation 时直接把第二个请求判为取消。
- Host负责 portal、backdrop、焦点陷阱、默认聚焦“取消”、Escape、Tab/Shift+Tab和焦点恢复。
- Host卸载、workspace/scope切换或发起 feature dispose时，尚未展示/未完成的请求统一 resolve为取消。
- Cancel执行零业务 command；Confirm在重复点击、键盘和事件交错下恰好执行一次。
- Destructive prepare必须先成功并产生后端 token/revision/fingerprint，再展示确认；execute仍由后端重验。
- 高风险文案显示安全目标 identity、数量、费用/不可逆影响；不得显示绝对路径、密钥或正文。

### 7.8 Orders语义

删除“清空记录”按钮及仅清 React state 的行为。订单是 OperationalStore/远端事实的只读 projection；本阶段只保留筛选、搜索、刷新/同步，不实现持久删除或“本次隐藏”。未来若需要删除，必须另立包含审计保留策略的工作项。

### 7.9 Media容量口径

按实际预计约 13,000 项资源设置安全余量：

- Renderer默认 `pageSize=50`；
- IPC/main查询允许的 `pageSize` 最大100，超出 fail-closed，不静默 clamp；
- 远端刷新默认/最大抓取页数200页；
- 单次刷新最多接收20,000个唯一 resource ID；
- 去重保持首见顺序；重复页 fingerprint、重复ID、total/hasNext/短页矛盾均产生安全 diagnostic；
- 达到 `maxPages` 或 `maxResources` 时停止、保留已验证结果，并在 snapshot/UI明确显示 `truncated=true`、原因、已加载数量和刷新时间；不得把截断伪装成完整成功；
- Renderer不能传入或放大 maxPages/maxResources，不能用 `99999` 绕过；
- 搜索和翻页走 service query，不把20,000项数组整体 structured-clone到Renderer。

若真实规模接近或超过20,000，立即触发停止条件，先依据供应方分页/搜索能力重新确定边界，不自行提高为无界值。

## 8. 目标目录与组合方向

目录以真实 seam 为准，允许在实施时微调名称：

```text
media-workbench/src/
  features/
    workspace/
    content/
    generation/
    platform/
    media/
    attention/
    settings/
  infrastructure/
    query-identity/
    confirmation/
  bridge/                  # 固定 typed preload clients；无刷新编排

desktop/
  ipc/
    contracts/             # 纯 DTO/validator/registry
    adapters/              # auth + validate + application call + safe result
  preload.js               # 固定领域能力；不得暴露任意 channel
```

不为了目录整齐先搬文件。每个 work block必须完成“新 interface → production caller切换 → 旧路径删除”，不能先叠 wrapper后延期迁移。

## 9. 串行实施工作块

### 9.0 启动审计与基线

1. 复核 Phase 05 completion commit、分支和dirty worktree。
2. 自动生成非 Auth IPC inventory：capability/channel/version/request/result/error/event/owner/caller。
3. 列出所有原始 invalidation订阅、feature事件订阅、native confirm、`void async`入口、全局 busy和 `99999`请求。
4. 运行并记录现有 Renderer/IPC定向基线及完整门禁；数量以现场输出为准。
5. 若 inventory揭示需要修改 Domain/Application interface，停止并重新打开前序阶段。

### 9.1 Typed IPC与identity基础

1. 先以一个只读 query、一个 mutation、一个 event建立 contract registry和统一 result/error seam。
2. 写未知版本/字段/status、未认证、unsafe error、event dispose测试。
3. 建立 query identity、独立 command state和 feature test harness。
4. 证明 newer refresh可以使旧 initial失效，且 mutation迟到结果不会写错 scope。
5. 基础稳定后再迁移feature，禁止多个 feature自行复制 token逻辑。

### 9.2 Workspace coordinator

1. 引入 `workspaceRuntimeId`并版本化 invalidation event。
2. root只保留一个原始 invalidation订阅。
3. 实现 revision重复、缺口、未知 scope、runtime切换和dispose矩阵。
4. 逐个 scope接入 coordinator；同一 scope最后一个 caller切换后立即删除旧页面订阅。

### 9.3 Content与generation

- Content feature拥有客户、资料/问题/调研、当前文章、文章管理和removal snapshot。
- 单篇生成结果只能提交到仍匹配的client/article scope；旧客户结果触发当前scope安全刷新。
- Generation feature拥有batch/run/handoff；start/pause/stop/continue/retry各有独立command owner。
- Destructive command统一 `prepare → queued confirmation → execute`；prepare reject进入snapshot error，不产生confirmation或unhandled rejection。
- View不组合多个bridge query猜测阶段，不以refresh token props串联刷新顺序。

### 9.4 Platform

- PlatformRun snapshot是运行busy权威；`stopping`明确可见，terminal前不能重新start。
- Submit、pause、stop分别拥有token和finalize；旧run event/旧command result不覆盖当前run。
- 覆盖pending submit→pause/stop→resolve/reject及100轮交错。
- Queue、profile/login projection和residue command归platform feature；不在View重验账号或publication规则。

### 9.5 Media

- Media feature分离但统一拥有 articles/drafts、resources/pool、submission、orders等query scopes。
- 资源按页加载/搜索，按ID去重，验证total/hasNext/短页/repeat fingerprint。
- Draft save与资源选择使用独立revision；保存期间资源增删或文章切换不得丢状态。
- Resource selection、submission和orders query各有scope identity与独立busy/error。
- 物理删除订单“清空记录”按钮及其仅清本地state的回调；同步命令失败进入可见snapshot error，不只写console。
- 记录1k/10k/13k/20k资源的主进程内存、Renderer内存、IPC payload、请求数和响应延迟。

### 9.6 Attention、settings与confirmation

- Attention只消费后端allowedActions闭集；preview/execute绑定attention revision/fingerprint。
- Settings自检、保存、测试、清理分别有command state；success/failure/finally/dispose后均收敛。
- 迁移全部业务native confirm，包括未保存草稿/回答等非破坏性离开确认；静态搜索只允许宿主内部实现需要的名字，不允许浏览器原生调用。
- FIFO confirmation覆盖并发请求、发起方dispose、host卸载、重复点击和焦点恢复。

### 9.7 删除旧状态路径

每个feature production caller切换后立即删除：

- 页面级原始 workspace invalidation订阅；
- 被替代的controller/hooks及其只验证旧结构的测试；
- 重复bridge event wrapper、DTO验证和错误映射；
- 全局共享busy、刷新token props和View编排的reload顺序；
- native `window.confirm/confirm`；
- `pageSize:99999`、无界maxPages和全量资源IPC；
- 无消费者`publish-log` Renderer事件发送；
- 无production caller的preload capability/channel。

删除前后都运行production-reference静态门禁；不得留下长期双轨。

## 10. 测试矩阵

### 10.1 Query/scope lifecycle

- Deferred Promise：A→B客户、A→B文章、initial→manual refresh、initial→invalidation、command→invalidation、workspace runtime切换。
- unmount/dispose后不得set state、发新I/O、保留订阅或写error。
- Stale success与stale failure都不能覆盖新snapshot。
- 同revision/scope多个View只产生一次query；revision gap刷新所有已注册known scopes。

### 10.2 Command lifecycle

- 每个command success/failure/finally、重复点击、dispose和scope切换。
- Platform submit/pause/stop 100轮交错，busy最终由真实snapshot解释。
- Generation start/pause/stop/continue/retry交错。
- Destructive prepare reject、token过期、cancel零command、confirm恰好一次。

### 10.3 IPC边界

- 每个contract至少覆盖合法request/result、未知schemaVersion、未知字段、非法enum/status、容量超限和畸形event。
- 未认证、application throw、validator throw和unsafe原始错误只返回SafeOperationalError。
- Preload没有任意invoke/on能力；Renderer/worker无Node implementation import。
- Contract inventory中每个非Auth production capability都有owner、validator和测试；Auth豁免项完整列出。

### 10.4 Invalidation/event

- runtime ID切换、revision重复/倒退/缺口、未知scope、未知reason和dispose。
- Platform/generation/removal event的旧run/旧batch/旧transaction丢弃。
- 未知或畸形event只产生安全diagnostic，不泄露payload。

### 10.5 Media容量

- 正常分页、可信total/hasNext、无total短页、远端忽略page、重复页、重复ID、矛盾total。
- 1k、10k、13k、20k唯一资源；第20,001项必须显式截断。
- IPC单响应不超过100项；不存在99999或全量数组返回。
- 记录请求数、payload bytes、main/Renderer内存峰值和查询延迟；不是只断言数组长度。

### 10.6 Confirmation与交互

- FIFO、backdrop、默认取消焦点、Tab、Shift+Tab、Escape、焦点恢复。
- 发起控件卸载、feature dispose、workspace切换和host卸载。
- Settings success/failure、Orders筛选/刷新、attention action、未保存编辑离开。
- Static search无业务native confirm、无旧controller production引用。

## 11. 阶段门禁

Phase 06实施时先在 `auto—publish` 运行定向基线，至少覆盖：

- renderer content/client switch/refresh/management/generation/handoff；
- platform controller/task store/queue lifecycle；
- media resource/service/library/workbench；
- workspace invalidation/runtime lifecycle；
- confirmation/settings/Electron focus；
- desktop IPC response、authenticated IPC和各业务 IPC registrar。

最终必须执行并记录实际文件数、pass/fail/skip和fixture类型：

```powershell
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

Electron焦点测试必须在最新Renderer build后运行；容量测试只能使用合成资源，不连接真实付费媒体或生产系统。

## 12. 完成条件

- 七个feature owner和其scope/snapshot/commands在handoff中逐项列明；View只渲染snapshot和发命名command。
- 所有initial/refresh/invalidation/command result使用同一query identity规则。
- 无跨客户/文章/workspace stale state、永久busy或unhandled rejection。
- `workspace:data-invalidated`只有一个Renderer transport consumer，reason→scope映射只在main存在。
- 每个非Auth production IPC capability有版本化精确schema、runtime validation、安全错误闭集、owner和测试；Auth豁免完整移交Phase 07。
- Preload无通用invoke/on/channel能力，Renderer不接收原始错误、日志、路径或秘密。
- Media在约13,000项下保持分页、可搜索和有界；20,000硬上限可观察，单IPC最多100项。
- Confirmation为FIFO独立host，可访问性和exactly-once测试通过；无业务native confirm。
- Orders不再声称或模拟删除审计记录。
- 被替代旧hooks/controller/订阅/channel/event已删除，无长期双轨。
- 完整门禁通过，阶段交接记录容量基线、contract inventory、删除清单和Phase 07可用的结构化diagnostic/error seam。

## 13. 停止条件

- 为解决View状态需要向Domain/Application加入页面专用方法或状态。
- 新feature module只转发旧bridge，View仍知道query顺序、invalidation reason或业务阶段。
- 引入状态库但无法减少caller必须知道的interface。
- Renderer需要路径、数据库、Cookie、密钥、原始错误/日志或任意IPC能力。
- 同一snapshot、subscription、command lifecycle或reason映射出现两个production owner。
- Media达到20,000项仍可能是正常业务规模，或分页上限会静默漏数据。
- Typed IPC需要改变已冻结application DTO语义；应重新打开对应前序阶段，不能在bridge中兼容绕过。
- Phase 05尚未COMPLETE，或工作区包含无法隔离的前序WIP。

## 14. 交接重点

Phase 06 handoff必须列出：

1. 七个feature modules及其production composition路径。
2. 每个query scope、snapshot字段、request identity和command owner。
3. 非Auth typed IPC inventory、删除项与Auth豁免清单。
4. Workspace runtime ID/revision/scopes协议和唯一consumer证据。
5. 删除的旧hooks/controller/subscriptions/native confirm/channel/events。
6. 1k/10k/13k/20k容量数据、截断诊断、IPC payload和内存基线。
7. 全部定向/全局门禁与Electron焦点测试结果。
8. Phase 07可直接使用的SafeOperationalError、diagnostic code和Auth IPC迁移入口。

## 15. 计划决策记录（2026-07-26）

- 用户确认本阶段优先优化低耦合、可维护、可扩展和运行时性能。
- 用户确认采用本文七个feature owner、非Auth typed IPC范围、main唯一reason→scope映射、opaque workspace runtime ID、FIFO confirmation、移除订单清空按钮和不暴露raw publish log。
- 媒体资源预计约13,000项；采用默认页50、IPC最大100、200页/20,000唯一项硬上限，并要求显式截断和容量实测。
- Phase 06 已按本文串行工作块完成；最终 inventory、feature owner、删除项、容量数据和门禁证据见 `handoffs/phase-06.md`。

### 2026-07-28 付费媒体预检补充验收

- `buildConfirmationSummary`已删除依赖退役legacy publication ledger的简化早退，Typed IPC预检会返回逐article/resource的可提交与阻止明细，不再出现有价格却目标数为0的矛盾snapshot。
- 重复发布保护由main组合边界只读接回OperationalStore publication read model，并复用真实媒体command preparation identity；进行中、已提交、已发布和不确定状态均阻止，失败/取消允许重试。未修改冻结接口，也未恢复旧ledger。
- 新增registrar纵向fixture覆盖可提交和已发布阻止，明确断言付费发送调用为0。媒体全域69/69、全仓1220/1220及完整门禁通过；最新本地目录制品时间为2026-07-28 00:23:54。详细证据见`handoffs/phase-06.md`。

### 2026-07-28 付费媒体payload补充验收

- media command preparation必须保留Renderer已保存的投稿标题，不得回退为带业务UUID的staging文件basename；文件名继续只作为main内部定位和post-processing identity。
- 供应方`content`字段现为main投影的有效HTML正文，独立标题行不重复进入body，原始HTML字符被转义；multipart合成fixture逐字段验证`resource_id/title/content/third_id`且不联网。
- `third_id`默认等于本地每次PublicationWorkflow尝试的`attempt-UUID`；若操作员在付费媒体页保存了第三方标识，则只替换供应方multipart中的`third_id`，内部attempt identity与evidence仍保持唯一且不变。远端订单号仍只来自响应`order_nid/orderNid`。媒体专项72/72、全仓1222/1222及完整门禁通过，证据见`handoffs/phase-06.md`。

### 2026-07-28 第三方标识与投稿后预览补充验收

- 付费媒体页通过既有settings feature与`platform-settings:get/save`精确capability提供第三方标识输入；应用配置可长期保存、最长128字符并可随时替换，`XQW_THIRD_ID`环境override时只读。未新增通用IPC或capability。
- 保存值只作为供应方`third_id`；留空回退内部唯一attempt ID。OperationalStore、PublicationWorkflow evidence和重复投稿保护继续使用内部attempt identity，未改变冻结接口或把操作员字符串当作审计主键。
- `media.scanArticles`的Typed IPC结果是无正文的article summary；Renderer bridge现将summary与preview detail分别规范化，投稿后重扫只更新摘要字段，不再把“正文缺失”伪造成空字符串覆盖已打开正文。文章被真实移除时仍按feature规则关闭。
- 真实Renderer RED→GREEN覆盖投稿后summary重扫无需切换文章即可保留正文；第三方标识读取/替换及900/1180/1280宽度均通过，并断言付费submit调用为0。全部使用内存fake和临时合成fixture，未调用真实`media/send`。
- 最新完整门禁：`npm test`221文件1226/1226、Auth16/16、links180/180、packaging33/33、Renderer responsive11/11；lint、三套typecheck、format、Renderer build2154 modules、preload231,843 bytes、pack smoke、最新Renderer Electron focus1/1、packaged ASAR3/3与`git diff --check`通过。Phase 07未启动。

### 付费媒体订单展示快照与供应商状态投影收口（2026-07-28）

- 订单页标题、文件名、媒体名和投稿报价来自提交时已验证的submission item不可变快照；历史记录缺少报价时显示“未记录”，不得读取当前资源价格倒填，也不得把缺失值伪装为`0`或最终结算金额。
- 页面状态以供应商原始状态为唯一显示来源：`0=待安排`、`1=已安排`、`2=已发布`、`4=已退稿`、`9=售后中`。内部`submitted/published/failed/uncertain`只用于PublicationWorkflow流程控制，不能覆盖或冒充供应商状态。
- 为使供应商状态跨进程重启保持一致，Phase 03 remote-order projection被窄范围重新打开并完成：未改schema、Publisher、ContentStore或Domain/Application接口，只在既有`remote_orders.payload_json` evidence中保存严格闭集`remoteStatusCode`并由`listRemoteOrders()`投影。未知状态拒绝；确实没有历史raw状态时才按既有publication事实安全回退。
- RED→GREEN覆盖五状态表驱动、供应商`1`经fake `orderInfo`同步、store关闭/重开后仍显示“已安排”，以及真实Renderer订单分类。完整门禁：221文件1230/1230、Auth16/16、links180/180、packaging33/33、媒体定向24/24、Renderer订单1/1、三套typecheck、lint、format、Renderer build2154 modules、preload231,843 bytes、pack smoke、最新Renderer Electron focus1/1、packaged ASAR3/3与`git diff --check`通过。
- 所有订单同步/投稿fixture均为临时SQLite和fake client；未连接真实供应商、账号或`media/send`，真实付费submit调用为0。新目录制品`release-alpha/win-unpacked/鱼饼大王.exe`为225,485,824 bytes，2026-07-28 08:55:36。Phase 03与Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。

### 付费媒体订单报价identity、精简视图与安全外链收口（2026-07-28）

- 订单报价快照本身已存在，实际缺口是submission batch创建后才生成attemptId，导致remote order无法按attempt identity关联快照。attempt现在于batch创建前生成，并同时写入batch payload与workflow command；真实临时SQLite纵向fixture锁定新订单标题、媒体名和报价`36.5`均可恢复。
- 订单View删除源文件、内部publication状态/ID及资源ID，不把内部流程事实重复展示为订单状态；保留供应商订单状态、标题、媒体、投稿报价、订单号、时间与发布链接。
- 新增`media.openPublishedUrl`命名command，Typed IPC inventory为129/129。Renderer只发送orderNid；main只从OperationalStore已发布订单读取持久HTTPS evidence后调用Electron shell。HTTP、带凭据URL、未发布/缺失证据、打开失败均安全拒绝，不开放任意URL或通用IPC。
- 最新门禁：媒体/Typed IPC/API surface38/38、workspace/composition/security46/46、真实Renderer订单1/1、全仓221文件1232/1232、Auth16/16、links180/180、packaging33/33；lint、format、三套typecheck、Renderer2154 modules、preload234,062 bytes、pack smoke、packaged ASAR3/3、Electron focus1/1和diff check通过。新exe为225,485,824 bytes，2026-07-28 10:31:32；真实付费submit为0，Phase 07未启动。

### 付费媒体供应商字符串报价收口（2026-07-28）

- 现场新订单仍显示“未记录”不是attempt identity再次失配；标题与媒体名已能关联，唯独供应商资源缓存把报价保存为数字字符串，而正式提交解析与不可变快照此前只接受JavaScript `number`。预检使用另一条数值规范化路径，因此会显示正确金额并掩盖该差异。
- main的资源ID解析边界现在把合法、有限、非负且不超过既有contract上限的数字字符串规范化为number；不可变submission快照owner执行同一安全检查。缺失、非法或超限值仍保持缺失，不伪造为0，也不读取当前报价倒填历史订单。
- 两条纵向RED→GREEN分别覆盖供应商字符串报价经Typed IPC registrar进入提交输入，以及`media submission service → OperationalStore → listOrderViews()`恢复`36.5`。全部使用临时SQLite、合成资源缓存和fake workflow，真实付费submit为0。
- 最终门禁：媒体/Renderer定向37/37、三套typecheck；`npm test`221文件1233/1233、Auth16/16、links180/180、packaging33/33；lint、format、Renderer build2154 modules、preload234,062 bytes、标准pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及`git diff --check`通过。新exe为225,485,824 bytes，2026-07-28 10:59:58；Phase 06保持`COMPLETE`，Phase 07未启动。

## 16. 实施完成记录（2026-07-26）

- 七个 owner 已固定为 workspace、content、generation、platform、media、attention、settings；View 只消费 snapshot 和命名 command。
- 非 Auth production Typed IPC 为 129/129：56 query、68 command、5 event；每项均有独立合法 fixture、owner、production caller、request/result/error/event validator。新增项仅为按order identity安全打开已发布证据的`media.openPublishedUrl`命名command；Auth 5 invoke + 1 event 明确留给 Phase 07。
- `workspace:data-invalidated` 只有一个 Renderer transport consumer；opaque runtime ID、revision gap、known scopes 全量刷新和安全 diagnostic 已实现。
- 旧 controller/store/modal、原始页面订阅、native confirm、`pageSize:99999`、`publish-log` sender、无消费者 preload channel 均已删除。
- 媒体默认页 50、IPC 页上限 100、远端上限 200 页/20,000 unique ID，第 20,001 项显式 truncated；1k/10k/13k/20k 合成容量数据已记录。
- 完成后真实启动复核发现 P1：`sandbox: true` 的 production preload 直接加载本地 CommonJS contract registry 时整体失败，导致 `window.desktopConsole.auth` 缺失并显示“桌面认证不可用”。Phase 06 临时重新打开后，以单文件 `build/preload/preload.cjs` 收口；开发启动及全部 pack/dist 路径均先构建该 bundle，ASAR 明确包含并直接加载它，未关闭 sandbox、未扩展 preload 能力面。
- 原 VM mock `require` packaging 测试与合成 preload Electron focus 未经过真实 production sandbox composition，因而漏检。新增真实 Electron 精确症状回归：source sandbox 2/2，显式 packaged ASAR 3/3；两者均断言固定 Auth API 存在且无通用 invoke/on。
- 登录恢复后又以 production composition 精确复现 workspace bootstrap P1：main 把已自行执行版本化验证的 workspace registrar 接入 `createAuthenticatedIpcMain`，同一 wire request 被解码两次；已有工作区读取和目录选择均闭合为 `IPC_REQUEST_INVALID`。现由 workspace registrar 单独拥有认证、request验证和result编码，main直接传原始`ipcMain`与`requireAuthenticated`，未保留双路径wrapper。合成existing/selection及未认证安全拒绝、真实sandbox与packaged ASAR workspace调用均已锁定。
- AI单篇生成production RED确认：domain research/reference snapshot会保留“可选字段存在但值为`undefined`”，content exact result validator因此返回`IPC_RESULT_INVALID`。Content DTO projector现统一省略undefined可选字段，未放宽schema；真实generator形状、source sandbox与packaged ASAR `content:generate-article`均通过。
- workspace切换锁定RED确认：runtime为内部模块写入`AUTO_PUBLISH_WORKSPACE`，`app.relaunch()`继承后被下一进程误判为外部环境override。main现捕获启动时该键的原始存在状态和值，relaunch前恢复；应用自写值不再污染重启，同时真实显式用户override仍保持锁定语义。Windows Process/User/Machine范围均未发现用户设置。
- 最终门禁：221 个默认测试文件、1196/1196（0 fail/skip，约153秒）；Auth 16/16；links 180/180；packaging 33/33；本轮最新Content/Renderer/preload定向51/51；lint、三套 typecheck、format、Renderer build（2153 modules）、preload build（227,170 bytes）、pack smoke、最新 Renderer build 上的 Electron focus 1/1、packaged ASAR production-preload/workspace/content 3/3、`git diff --check` 全部通过。
- 用户复核继续显示“内容结果未通过安全校验”并采集到`Content command is unavailable`后，production RED证实两条提示属于同一连锁：domain允许中文客户目录名及中文自定义platform/template identity，而content Typed IPC共用ASCII token validator，导致workspace sources查询失败且无selected client；页面随后初始化workspace级豆包队列，旧统一门禁又错误要求selected client。content business identity现使用拒绝路径分隔符、控制字符、`.`/`..`和首尾空白的Unicode-safe segment validator；confirmation token仍使用ASCII opaque token。workspace级content command仅要求workspace scope，客户级mutation继续fail-closed。
- 另一个独立production RED证实旧research snapshot缺少`collectionMethod`时仍会形成`IPC_RESULT_INVALID`；投影边界现显式归类为`legacy`，不放宽result validator、不改变ContentStore或Domain/Application接口。Unicode client/platform/template generation request/result与legacy provenance均已通过source及packaged ASAR Electron探针。
- 问题与采集页后续production RED证实豆包contract仍保留独立ASCII-only identity，中文client/question在preload request编码即失败并显示“豆包结果未通过安全校验”；同时passive登录检查的`PLAYWRIGHT_SESSION_NOT_OPEN`未进入豆包安全错误闭集，被降级为`IPC_INTERNAL`，Renderer无法进入保留上次稳定状态的分支而显示`session_error`。豆包identity现使用与main边界一致的Unicode-safe path-free segment，session-not-open现返回精确`transport/safe` SafeOperationalError；raw session消息、Cookie、profile路径仍不进入Renderer。
- 本轮最终门禁更新为221文件1198/1198、豆包/Renderer/source preload定向43/43、Auth16/16、links180/180、packaging33/33、三套typecheck/lint/format、Renderer2153 modules、preload229,242 bytes、标准pack smoke、packaged ASAR 3/3、最新Renderer Electron focus1/1与diff check全部通过。
- 批量生成“检查并确认”production RED证实两条独立Typed IPC偏差：generation identity仍为ASCII-only，中文client/platform/template/material/research ID在preload request编码阶段失败；真实模板预检又携带`source/readOnly`，registrar未投影而exact result只允许`platform/templateId`。generation现使用Unicode-safe path-free business segment，并由main精确投影preview DTO；preload也已把本地request校验失败分类为`IPC_REQUEST_INVALID`，不再伪装成result-invalid。
- 单篇保存后文章与投稿下拉同时为空的production RED证实article-management snapshot中的真实`actionPlan.items`没有`status`，却错误复用普通submission item validator，导致整个snapshot返回`IPC_RESULT_INVALID`并被Renderer空模型遮蔽。cancellation plan现有独立精确validator/projector，与Renderer既有action-plan DTO一致；普通submission item严格schema未放松。管理页显式显示query error，不再把失败呈现为“暂无历史文章”。
- `ARTICLE_SAVED` wire event经preload `parseEvent`验证后会移除envelope `schemaVersion`，workspace coordinator此前再次强制要求该字段，造成所有production invalidation被拒。coordinator现接受已验证payload或直接测试wire payload，unknown version仍由preload registry拒绝；main reasonCode→scopes、单一raw consumer及revision规则不变。
- 最新完整门禁：221文件1203/1203、Auth16/16、links180/180、packaging33/33；批量/management/invalidation域回归69/69；三套typecheck、lint、format、Renderer build 2153 modules、preload 230,279 bytes、标准pack smoke、packaged ASAR 3/3、最新Renderer Electron focus1/1及diff check均通过。全部新增验证使用临时合成fixture，未访问真实workspace/账号/数据；Phase 07未启动。
- 个别客户的文章管理仍会被一条旧publication record整体拒绝：历史记录可以在合法的`publicationId/clientId/articleId/status/attempts`之外缺少后来才增加的`articleKey/targetKey/createdAt/updatedAt`及顶层attempt摘要。article-management read-model现将这些增强字段精确标为optional，不伪造domain identity，不放宽必填业务字段、unknown field或unsafe error校验。
- 单篇生成页左下旧“导出平台”会列出所有content queue平台，但该旧快捷service实际只接受`media`，是一个会诱导用户进入必然失败路径的伪通用入口。该footer、下拉框和页面caller已删除；正式多平台/账号/确认流程仍由文章管理页拥有，底层Typed IPC因其他production consumer仍在而保留。
- 本次现场回归最终门禁：221文件1205/1205，Auth16/16、links180/180、packaging33/33、域定向50/50；三套typecheck、lint、format、Renderer build 2153 modules、preload 230,459 bytes、pack smoke、packaged ASAR 3/3、最新Renderer Electron focus1/1及`git diff --check`均通过。制品为`release-alpha/win-unpacked/鱼饼大王.exe`（225,485,824 bytes，2026-07-27 13:43:43）。
- 用户以同一工作区两个客户的对照截图证明上述legacy publication修复仍不完整。进一步producer/contract差分找到真正的按客户触发项：豆包parser和ResearchStore合法允许无界引用title/url/snippet，article-management result却有既定1,000/4,096/10,000上限；某篇文章携带10,001字摘要时会使整个客户snapshot返回`IPC_RESULT_INVALID`。
- main Content DTO projector现对引用标题/URL移除控制字符并按既有contract上限截断，对摘要保留合法换行、移除非法控制字符并限为10,000字；`null/undefined`可选摘要直接省略。schema仍为有界exact DTO，未改ContentStore/ResearchStore或冻结接口。
- 本轮验证：article/content/management域70/70；`npm test`221文件1206/1206；Auth16/16、links180/180、packaging33/33、三套typecheck、lint、format、Renderer2153 modules、preload231,191 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1。source和packaged ASAR均通过真实`getArticleManagementSnapshot("畅途")`链验证10,001→10,000且`ok:true`。新制品时间2026-07-27 14:31:19。
- 后续跨客户production RED证实引用`snippet`不只可能超长，也可能是object/array；Research producer合法保留该结构，但Renderer DTO只允许文本。Content main projector现仅在IPC边界省略非文本snippet，文本仍按既有10,000字上限投影；exact schema、unknown-field拒绝和Domain/Application/ContentStore接口均未放宽。
- 工作区串数据诊断分别锁定Renderer公开snapshot与主进程真实业务IPC：runtime A→B会同步清空A且拒绝A迟到结果；两个临时合成workspace含相同clientId时，新runtime只返回B文章。真正的生命周期缺口是bootstrap重复创建时读取可变`process.env`，把runtime内部写入的旧`AUTO_PUBLISH_WORKSPACE`误判为外部override。main现把应用启动瞬间该键的存在状态和值冻结为bootstrap唯一环境输入；内部runtime写回不再锁住旧workspace，显式外部override仍保持原语义。
- 最新完整门禁：221文件1210/1210、0 fail/skip；Auth16/16、links180/180、packaging33/33；本轮Content/Workspace定向66/66；三套typecheck、lint、format、Renderer build 2153 modules、preload 231,173 bytes、标准pack smoke、packaged ASAR 3/3、最新Renderer Electron focus1/1及`git diff --check`全部通过。所有新增测试只使用临时合成workspace/DTO，未读取真实内容库、账号、Cookie或Auth数据库。最新制品为`release-alpha/win-unpacked/鱼饼大王.exe`（225,485,824 bytes，2026-07-27 15:32:47）；Phase 07未启动。
- 用户后续对照证明失败与客户历史状态稳定相关：从未投稿的客户可持续显示，已失败客户新增文章后仍整页失败。真实OperationalStore→article-management snapshot→Typed IPC RED确认`listPublicationRecords()`的合法producer形状固定为`clientId:null`，而Renderer publication DTO要求客户identity；任一投稿记录因此使整个client snapshot返回`IPC_RESULT_INVALID`。
- 修复位于client-scoped article-management组合边界：先仅保留当前客户article ID集合对应的publication records，再将null的历史client identity绑定到已验证的请求scope；若record显式声称另一客户则fail-closed。未改OperationalStore冻结接口，未放宽nullable IPC schema。回归同时包含旧已投稿文章与同客户新生成文章，两者均返回。
- 最新门禁：221文件1211/1211、0 fail/skip；Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer 2153 modules、preload 231,173 bytes、标准pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1与`git diff --check`通过。标准制品已在用户关闭旧进程后重建；Phase 07未启动。
- 普通投稿与付费媒体handoff现场RED确认：submission contract把合法业务`clientId`错误限制为ASCII技术token，中文客户的`preview/create submission batch`与`preview/export media`四条请求均在preload编码阶段返回`IPC_REQUEST_INVALID`，main与service从未执行。contract现复用content核心既定的Unicode-safe、path-free客户identity规则；文章、账号绑定、target和confirmation仍使用各自精确validator，unknown field与敏感边界不变。
- 列举网/头条登录现场RED确认：公开preload caller先传`{ platformId }`，platform contract `fromArgs`又按位置参数包装，形成嵌套identity并被拒。`openLogin/checkLogin`现只传原始单一`platformId`；不改session service、平台adapter或领域接口。
- 本轮结论不是历史数据不兼容：相同错误会拒绝当前合法中文客户下的新旧文章，登录请求完全不读取客户/文章/采集数据。无需删除、迁移或重建历史资料，也未增加legacy wrapper。完整门禁更新为221文件1213/1213、Auth16/16、links180/180、packaging33/33、域定向52/52、三套typecheck/lint/format、Renderer 2153 modules、标准pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及diff check通过；最新exe为225,485,824 bytes，2026-07-27 20:46:18。Phase 07未启动。
- 付费媒体工作台的三个现场问题也不是历史数据兼容问题。文章预览result原错误复用禁止换行的单行`safeText`，正常Markdown正文因此成为`IPC_RESULT_INVALID`；现改用有界多行正文validator（最大2,000,000字符），不允许路径、raw error或额外字段。收藏失败来自公开Renderer传入完整资源，而wire contract只接受`resourceId/name/price`；preload现只做精确DTO投影，wire schema未放宽。刷新请求本身成功执行，但App遗漏command error/result消费；现同时显示安全失败、完成数量和显式truncated反馈。
- 资源库旧“添加媒体”只向Renderer局部state写入随机`RES-*`，没有Typed IPC capability或后端owner，且未打开文章时静默失效；该按钮、表单、caller和feature command已删除，没有新增兼容wrapper。资源分页/收藏/远端刷新仍由既有18项media Typed IPC能力拥有。
- 最新完整门禁：媒体定向47/47；`npm test`221文件1217/1217、0 fail/skip；Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer build 2153 modules、preload 231,751 bytes、标准pack smoke、packaged ASAR preload sandbox 3/3、最新Renderer Electron focus1/1及`git diff --check`全部通过。容量fixture在1k/10k/13k/20k均为单页单请求，payload约4.28KB，未访问真实workspace、付费平台、账号或内容库。最新exe为225,485,824 bytes，2026-07-27 23:03:31；Phase 07未启动。
- 付费媒体13k刷新现场RED确认外部multipart adapter使用camelCase `pageSize`，与该API既有`api_key/resource_id/third_id`字段约定不一致；供应方退回默认20项且无可识别分页元数据时，main又以`20 < 100`错误结束并声称complete。adapter现发送`page_size`；资源服务会学习供应方实际页宽，不能再把首个20项页伪装为完整成功。合成13,000项在100项/页时130次请求完成；若供应方仍固定20项，则严格在200页/4,000项处显式`truncated=max-pages`，不提高Phase 06硬上限。
- “预检并提交”无反应来自media feature把所有扫描稿件都作为单次候选，并在任一未选媒体时静默禁用顶部按钮；prepare失败又只显示在成功后才打开的modal中。feature现仅对明确选过资源的稿件建立有界预检快照，未选稿件不进入本次候选；顶部入口改为“投稿预检”，安全失败直接显示。最终按钮明确为“确认付费提交”，只能提交已成功预检的快照；选择变化、workspace切换或文章刷新会使旧预检失效。
- 本轮没有调用真实`media/send`、真实付费平台或真实账号；Renderer测试中的submit仅为内存计数fake，并断言预检阶段submit调用数为0。最新门禁为媒体域63/63、全仓221文件1220/1220、Auth16/16、links180/180、packaging33/33，三套typecheck/lint/format/build、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及diff check通过。最新exe为225,485,824 bytes，2026-07-27 23:35:24；Phase 07未启动。
