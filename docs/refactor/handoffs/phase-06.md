# Phase 06 Renderer状态与Typed IPC交接

> **2026-08-01 checkpoint（当前权威）：** 最小证据修复已完成并复验：同步 callback 的必然抛错路径、动态提前 return 与 `finally { return; }` 边界均有独立回归；symbol evidence `148/148`、production matrix `33/33`、inventory/bridge fail-closed `16/16`、全量 `npm test` `1453/1453`，三套 typecheck 与定向格式检查通过。状态：`P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。Git checkpoint：`phase-06-audit-remediation-green`。后续计划可从该 checkpoint 继续执行；不得把本 checkpoint 误写为 Phase 06 `COMPLETE`。

> **2026-08-01 Phase 06 独立审计后最小修复复验（最新权威，覆盖以下历史统计）：** 独立只读复核发现证据 helper 对 const 对象属性、字面量 `.length` 与 `typeof` 的静态短路值解析不足；四个永久 RED 反例已以最小 GREEN 收口。未知/动态值继续 fail-closed，未修改 production runtime、IPC contract、业务服务或制品输入。symbol `144/144`；production matrix `33/33`（109 capability、21 lifecycle、5 event）；Coordinator `7/7`、caller `3/3`、bridge fail-closed `9/9`、capability inventory `4/4`。完整 `npm test` 为 225 文件、132 suites、`1449/1449` pass、0 fail、1 个既有 Electron focus skip；Auth `16/16`、links `180/180`、packaging `33/33`、Lint、三套 typecheck、format、定向 Prettier、Renderer build `2157` modules、标准 pack smoke、diff check 全绿。当前制品尺寸为 Renderer/preload/ASAR/exe `758842`/`222731`/`7214697`/`225485824` bytes，hash 已核验。`P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`；仅使用合成/临时 fixture，未访问真实数据、账号、供应商或付费系统，未 stage/commit/push/PR。

> **2026-07-31 独立审计整改最终交接（当前唯一权威，覆盖以下历史记录）：** 已按计划冻结现场并串行完成 Ticket 1→4 的 RED→最小 GREEN。五个公开 `verifyCapabilityEvidence()` 反例精确为：production entry 丢弃返回 snapshot 对象、snapshot 字段只写入局部非逃逸对象、局部 shadow `Object.freeze`、`return-finally` 后不可达 snapshot read、`throw-finally` 后不可达 snapshot read；前两/后三类分别稳定返回 `lifecycle snapshot field has no reachable production consumer` 或 `lifecycle query result does not reach the recorded snapshot field`。正常 try/finally 对照保持通过。Coordinator lifecycle seam 证明 StrictMode `setup→cleanup→setup` 在 terminal dispose 后失效，现由可重入幂等 `stop()` 和 Provider cleanup `stop()` 闭合，终态 `dispose()` 仍拒绝 post-dispose register/start。
>
> 证据/门禁：symbol `121/121`；production matrix `33/33`，其中 capability `109/109`（43 query、61 command、5 event）、lifecycle `21/21`、event `5/5`；Coordinator `7/7`、caller `3/3`、bridge fail-closed `9/9`；完整 `npm test` `225` 文件、`132` suites、`1426/1426`；Auth `16/16`、links `180/180`、packaging `33/33`、Lint、三套 typecheck、宽/定向 Prettier、Renderer build `2157` modules、pack smoke、ASAR/source parity `10/10`、packaged preload `3/3`、Electron focus `1/1` 和 `git diff --check` 全绿。
>
> 制品：Renderer `index-DmAGTIWM.js` `758842` bytes/SHA-256 `048D72A0856D0F50B0A0FB241467B799EC17D0B7010AAEFFE904B54122B15641`；preload `222731` bytes/SHA-256 `0A8642AB024AD5061E8ACC71C42DB566C62DC8E9D443277C45F2EE0C41B177F4`；ASAR `7214697` bytes/SHA-256 `709A7AF4E555076F4FF695331E1B3985C5A5EF419DF2BAA8054CCF401FC8AFEA`；exe `225485824` bytes/SHA-256 `983EDAC6B0CC86DC6DD884B217AE471655E5A3943ED3FA13EFDC34953DA051D3`。分支/HEAD=`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`，status `M=117/D=14/??=21`，staged=0。
>
> 边界与状态：只使用合成/临时 fixture，无真实 workspace、内容库、Auth 数据库、账号、供应商或外部/付费系统访问；真实投稿、同步、扣费、付费 submit=`0`。`P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`；Phase 07=`NOT_STARTED`。不得在本线程宣布 Phase 06 `COMPLETE` 或恢复 `VERIFIED`；下一动作仅为再次独立只读审计。

> **2026-07-31 本轮独立审计四项最小整改（当前唯一权威）：** 值流丢弃、伪 UI consumer、未调用 cleanup 和 preload typed event 诊断污染四项已按公共 seam 完成 RED→GREEN；production matrix 109/109、lifecycle 21/21、event 5/5，完整 `npm test` 225 文件 1415/1415，lint、三套 typecheck、`format:check` 与 `git diff --check` 通过。`P1-CONVERGENCE-01=RED`，Phase06 继续 `IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

> **2026-07-31 最终独立审计五项P1最小整改（当前唯一权威）：** 唯一公开`verifyCapabilityEvidence()` seam新增五个永久RED→GREEN反例，覆盖跨模块未调用返回API、未渲染intrinsic JSX handler、未调用application返回成员中的send、未由真实订阅返回的consumer disposer，以及从不可达JSX实例借用lifecycle snapshot。修复仅收紧entry级callsite可达性、渲染实例、application owner返回成员、精确subscription call/disposer类型及snapshot wiring；保留真实跨模块runtime API消费，未修改production runtime、IPC合约、业务服务、package输入或制品。Phase06证据组合152/152，production matrix109/109、lifecycle21/21、event5/5；完整`npm test`225文件1408/1408，lint、三套typecheck、定向Prettier与`git diff --check`通过。`P1-CONVERGENCE-01`整改复验为`VERIFIED`，Phase03/04/06继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 本轮最终独立审计四项P1直接整改（当前唯一权威）：** 唯一公开`verifyCapabilityEvidence()` seam新增五项永久RED→GREEN反例：producer仅在`while(false)`中调用、正确feature实例仅由dead JSX wiring提供、registration receiver以`ipcMain || fake`进入错误运行时分支、preload `removeListener`仅在静态不可达分支、feature disposer仅在静态不可达分支调用。修复后静态循环与dispose证明均按可达控制流fail-closed，composition props/context wiring只接受从记录Renderer entry可达的callsite并按Program/entry缓存，registrar逻辑回退拒绝任何可提供错误receiver的运行时分支。证据核心、109项production matrix、21项lifecycle、5项event及bridge fail-closed组合111/111，capability inventory 4/4；完整`npm test`225文件1371/1371，lint、format、三套typecheck与`git diff --check`通过。仅证据helper/test与本轮记录变化，production runtime、package input和既有制品未变；`P1-CONVERGENCE-01`整改复验为`VERIFIED`，但Phase03/04/06继续`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 最终只读审计三项P1直接整改（当前唯一权威）：** 唯一`verifyCapabilityEvidence()`新增三项永久RED→GREEN反例：Renderer owner仅经未调用entry callback、owner仅作为未消费JSX prop、producer callback仅在`if(false)`中调用。入口现在只沿确证callback契约，JSX只接受intrinsic事件或闭合到子组件真实消费的prop，callback调用证明排除静态不可达分支；React `lazy`及既有React/标准异步集合边界按TypeChecker声明闭合。证据专项66/66、matrix33/33（109 capability、21 lifecycle、5 event）、fail-closed7/7，合计106/106；完整`npm test`225文件1366/1366，lint、定向Prettier与`git diff --check`通过。仅测试证据helper/test变化，Phase03/04/06 production、package input和既有制品未变；阶段继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 本轮独立审计追加整改交接（当前唯一权威）：** 新增三个永久RED反例，分别覆盖未调用callback中的Renderer consumer、registration entry传入fake `ipcMain`、registration entry传入fake application；均直接调用与109项matrix相同的`verifyCapabilityEvidence()`并已串行RED→GREEN。修复后只承认symbol精确的React effect/`useWorkspaceScope`/标准回调边界，并从registration entry实际callsite传播receiver/application参数；未改production runtime。证据63/63、matrix33/33、fail-closed7/7，合计103/103；完整`npm test`225文件1363/1363，Auth16/16、links180/180、packaging33/33、Phase06组合32/32，lint/三套typecheck/format/diff全绿。制品输入未变且hash保持；Phase03/04/06=`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**
>
> **2026-07-30 计划21最终审查后TDD交接（当前唯一权威）：** 最终审查追加的五项假阳性已通过与109项production matrix相同的唯一公开`verifyCapabilityEvidence()` seam串行RED→GREEN：删除event application文本兜底，过滤静态不可达producer，条件factory实例fail-closed，preload精确比较Electron member symbol，registrar application改用callable-reachability。证据专项60/60，production matrix/fail-closed组合100/100，matrix109/109、lifecycle21/21、event5/5，inventory仍109。没有第二验证器或测试专用production export。`npm test`225文件1360/1360、Auth16/16、links180/180、packaging33/33，lint/format/三套typecheck、标准`pack:smoke`、alpha verifier与diff check通过。`P1-CONVERGENCE-01`、`P2-FINAL-ORDER-01`、`P2-CONVERGENCE-02`均`VERIFIED`；Phase03/04/06=`IN_PROGRESS`，Phase07=`NOT_STARTED`。以下旧统计均为历史记录。

## 1. 状态与边界

- 当前唯一权威制品：Renderer/preload/ASAR/exe SHA-256分别为`E1B965347C5BEA36B27006555E0DCFC5E380211A6BA39D925A7516FFD204A860`、`3F56D207A9FB3BFB8C807CFCCA5DF3F5F57CC93B7D38DC97A128840433BFB8EC`、`71CD2F7A24CC0106D712348835B1803F943C6BB36F18E41133E025B1CA6BF073`、`60E05AFB17FF24E541DC9AEDCB82B749D8024B15F46CF66D51688B017239AAF6`；尺寸分别为757,886、222,057、7,212,426、225,485,824 bytes。

- 状态：`IN_PROGRESS`（2026-07-30 Asia/Shanghai；计划21整改已完成，等待最终独立只读审计）。
- 分支/启动 HEAD：`codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`。
- Phase 05 completion `75dba966375302a99ebfd020c02ee6dd83930a9e` 与 milestone record `365df706af110a25f900f63f05406a50d7b5e3b9` 均已核验为祖先。
- 检查点A/B/C及第10节最终完整门禁均已完成；原17项与`P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`共20项已按当前production tree复核。**整改完成，等待最终独立只读审计。** Phase 03、Phase 04、Phase 06保持`IN_PROGRESS`，不得恢复`COMPLETE`；Phase 07=`NOT_STARTED`。未访问真实投稿、付费、生产账号、Auth数据库或内容库，未stage、commit、push或创建PR。
- Phase 04 的人工验收项继续阻止正式 release；其审计整改状态不得写回为`PENDING_HUMAN`或`COMPLETE`。

> **2026-07-30 最终复验更正：** producer dead-helper再覆盖导出入口内未调用arrow函数，RED→GREEN且5/5 production event保持；corpus33/33、production suite33/33、合计66/66，最终`npm test`225文件1333/1333、0 fail/skip（164.262秒）。本句取代下方同日中间计数。

### 2026-07-30 最终证据引擎整改交接（当前权威）

- TDD：5个串行Ticket均先RED再最小GREEN；新增并冻结callable entry/精确feature实例、bridge/preload/registrar、lifecycle三类、event四类和真实SQLite订单三类回归。
- 证据：唯一`verifyCapabilityEvidence()` corpus32/32；production suite33/33，109 capability、21 lifecycle、5 event全绿；订单/OperationalStore31/31。
- 门禁：完整225文件1332/1332、Auth16/16、links180/180、packaging33/33、capacity19/19、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、order owner/ASAR parity、retired path zero、packaged preload3/3、Electron focus1/1、diff check全绿。
- 制品/Git：ASAR7,212,371 bytes/SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe225,485,824 bytes/SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`；147条WIP保留、staged=0，真实数据与外部/付费调用0。
- 状态：`P1-CONVERGENCE-01`、`P2-FINAL-ORDER-01`、`P2-CONVERGENCE-02`均`VERIFIED`；Phase03/04/06=`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

### 2026-07-29 唯一证据核心整改交接（最新当前权威，取代下方同日统计）

- RED：production matrix同入口错误放行不存在的lifecycle `stateSource`和event producer；独立mutation还覆盖receiver/shadow/scope、binding/props/factory、registrar/application、dead export、lifecycle update/consumer及event producer/channel/unique consumer/dispose断链。Phase03临时SQLite复现canonical published订单supplier `2→9`后按钮可见但main拒绝。
- GREEN：109项production matrix与20项mutation/acceptance直接共享唯一`verifyCapabilityEvidence()` TypeChecker symbol-identity核心；receiver与production reachability闭合，21项lifecycle逐项闭合query→state→snapshot consumer，5项event逐项闭合producer→唯一consumer→dispose。订单打开权限统一为canonical published+安全持久URL，supplier code只展示。`P1-CONVERGENCE-01=VERIFIED`、`P2-FINAL-ORDER-01=VERIFIED`、`P2-CONVERGENCE-02=VERIFIED`。
- inventory/门禁：109（43 query、61 command、5 event）；matrix109/109、lifecycle21/21、event5/5、mutation/acceptance20/20；完整225文件1318/1318、Auth16/16、links180/180、packaging33/33、capacity20/20（原冻结19项全通过）、13k SQLite query/SQL=1/1、parsed=3、orders=3、paid send=0，三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、最新ASAR/order-owner parity、packaged preload3/3、Electron focus1/1与diff均通过。移除producer channel恒真比较后相关组合54/54与lint复验通过。
- 制品/Git：ASAR7,212,371 bytes（2026-07-29 23:29:01.007 +08:00），SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe225,485,824 bytes（23:29:01.819 +08:00），SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`；Renderer `index-DQopcXb_.js`。`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`，147条既有WIP保留且staged为空；真实数据、账号、供应商、投稿、同步、扣费和付费submit为0。
- 状态：Phase03/04/06保持`IN_PROGRESS`，Phase07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

### 2026-07-29 最终审计收敛整改交接（当前权威）

- RED/owner：第4.1节connected baseline 1/1 GREEN，12类断链mutation 12/12 RED；正确owner为Phase06 evidence matrix。B的canonical/supplier隔离正确owner为Phase03 OperationalStore/MediaOrderService。
- 修改/删除：新增单一Program/TypeChecker证据器，以symbol identity、alias resolution、作用域调用图、参数/常量传播、JSX wiring和registrar handler闭合109项；正式matrix删除名字/receiver文本/全文件同名/shortcut/`endsWith`/跨call旧helper。显式化动态content command、settings refresh和GeneratedArticles Commands类型，纠正14个application owner与1个preload member fixture。B删除fallback语法枚举，保留退休owner物理零路径和两个order owner exact parity。
- schema/interface：Phase03 schema仍v3、public methods本轮不变；Phase04 interface不变；Phase06 non-Auth inventory仍109（43 query、61 command、5 event），Typed IPC/preload/registrar/public transport schema不变，仅Renderer内部Commands类型收紧。
- 测试：109/109 symbol matrix、mutation13/13、B行为/legacy/v3/order28/28；完整225文件1281/1281、Auth16/16、links180/180、packaging33/33、capacity19/19、ASAR/legacy/preload12/12、Electron focus1/1、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、diff全绿。
- 制品/Git：ASAR7,212,213 bytes（2026-07-29 22:16:41.498 +08:00），SHA-256 `DB9DB4FC1629A59CE4534D1EC65937337B6C14D3BCB540C8CCB5FACA574C9F7F`，exe225,485,824 bytes，Renderer `index-DQopcXb_.js`；分支/HEAD不变，146条WIP保留且staged为空。真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费、付费submit均为0。
- 下一动作仅为最终独立只读审计；Phase03/04/06保持`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

### 2026-07-29 独立只读审计第三轮整改最终交接（当前权威）

- RED：v3同article/target跨batch为5/6；inventory断链same-name mutation使matrix5/6；fallback object-map/switch/numeric-ternary detector mutation失败，且production修改后旧ASAR parity保持RED。
- 修复：OperationalStore按media item durable `attemptId`精确归属并事务回滚；109项fixture逐项显式receiver、完整`receiver.method`、member可达局部声明/显式commands/direct lifecycle证据，两个文件级binding兜底删除；fallback改为TypeScript AST覆盖if/ternary、switch与canonical-status对象索引。无wrapper、re-export、测试专用production caller或legacy路径恢复。
- schema/interface：schema仍v3，public method集合未变，`commitRemoteOutcome()`行为前置条件继续收紧；Phase04/06 production interface无变化，inventory仍109（43 query、61 command、5 event）。
- 门禁：v3 6/6、Phase03 80/80、capability20/20、capacity19/19、ASAR/legacy/preload11/11、完整223文件1267/1267、Auth16/16、links180/180、packaging33/33、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、最新Renderer focus1/1、diff全绿。
- 制品/Git：ASAR7,210,414 bytes（2026-07-29 20:16:29 +08:00），exe225,485,824 bytes；`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`，140条既有WIP保留且staged为空。真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费、付费submit均为0。
- 下一动作仅为最终独立只读审计；Phase03/04/06保持`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

### 2026-07-29 追加审计整改最终交接（当前权威）

- RED：定向15项先12 pass/3 fail，覆盖跨稿件/target batch item、漏检`submitted/uncertain` fallback、以及109项matrix仍含同名/任意identifier/registrar分离匹配弱证据。
- 修复/删除：OperationalStore事务归属校验不匹配即`OPERATIONAL_BATCH_ITEM_MISMATCH`并无部分写；fallback detector覆盖全部旧mapping且OperationalStore/MediaOrderService均与ASAR精确一致；inventory以结构化AST闭合consumer method、feature member、recorded bridge binding和同一registrar call，旧`invokesMethod`/`containsNamedFeatureMember`被meta门禁拒绝。没有wrapper、re-export、测试专用production caller或legacy路径恢复。
- schema/interface：OperationalStore仍为schema v3，`order_display_snapshots`及两个retained method不变；public method集合未变，`commitRemoteOutcome()`行为前置条件收紧。Phase04与Phase06 production interface无变化，inventory仍109（43 query、61 command、5 event）。
- 门禁：v3 5/5、Phase03 79/79、capability/caller/fail-closed19/19、capacity19/19；旧ASAR parity5/6 RED→新制品order/legacy/preload11/11；完整223文件1265/1265、Auth16/16、links180/180、packaging33/33、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、最新Renderer focus1/1、diff check全绿。
- 制品/Git：ASAR7,210,147 bytes（2026-07-29 18:12:40 +08:00），exe225,485,824 bytes；`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`，staged为空。真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费、付费submit均为0。
- 下一动作仅为最终独立只读审计；Phase03/04/06保持`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

### 2026-07-29 最终独立审计第二轮整改检查点 C 最终权威交接

- 逐项状态：`P1-01`、`P1-02`、`P1-03`、`P1-04`、`P1-05`、`P1-06`、`P1-07`、`P2-08`、`P2-09`、`P2-10`、`P2-11`、`P2-12`、`P2-13`、`P2-14`、`P2-15`、`P3-16`、`P3-17`、`P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`共20项均为`VERIFIED`。
- RED/删除：C新增packaged OperationalStore与current source精确一致性断言，旧ASAR时为7/8、1 fail；重建后8/8。`P1-05`正式observation行为正确，旧`reconcileRemoteOrder`定义/public export/专用测试、canonical publication status→supplier code fallback均从source与ASAR物理消失，没有wrapper、re-export或测试专用caller；此前四条点名与六条等价legacy路径删除证据保持有效。
- schema/interface：OperationalStore确为v2→v3，新增`order_display_snapshots`和retained `listOrderDisplayViews()`/`recordRemoteOrderObservation()`，A删除`reconcileRemoteOrder()`；migration/backup/restore/verify/三个fault point与损坏结构拒绝全部复核。PublicationWorkflow、Publisher、ContentStore、Domain/Application、Phase04冻结interface及Phase06 IPC/Renderer interface无当前production差异；inventory保持109（43 query、61 command、5 event）。
- 测试/容量：原17项+audit专项131/131、capacity19/19；完整`npm test`223文件1263/1263、0 fail/skip、170.554秒；Auth16/16、links180/180、packaging33/33、三套typecheck、lint、format、Renderer build2157 modules、pack smoke、packaged preload3/3、最新Renderer Electron focus1/1及`git diff --check`全部通过。Main 1k/10k/13k/20k请求10/100/130/200、payload44,603/464,188/610,078/950,488 bytes；Renderer均1请求、payload4,279/4,280/4,280/4,280 bytes，第20,001项明确truncated。
- 制品/Git/边界：最新`release-alpha/win-unpacked/resources/app.asar`为7,209,908 bytes，2026-07-29 12:37:55.544 +08:00，Renderer asset `index-cypc4NxJ.js`。终检仍为`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`且staged为空。全部使用临时SQLite/fake/VM/合成fixture/本地Electron，真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费与付费submit均为0。
- 下一动作仅为最终独立只读审计；Phase03/04/06保持`IN_PROGRESS`，Phase07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

### 2026-07-29 最终独立审计第二轮整改检查点 B 当前权威交接

- 文档RED：代码/Git差异明确包含Phase03 OperationalStore schema v2→v3、`order_display_snapshots`、`listOrderDisplayViews()`、`recordRemoteOrderObservation()`，而下方历史仍写“未改schema/interface”并保留110 inventory；这些历史结论现明确失效，canonical inventory为109。
- schema/写入：attempt_id为TEXT PK NOT NULL FK到publication_attempts；title/filename/resource name/created time必填，quoted_price REAL可空。`commitRemoteOutcome()`仅在media evidence+正式batch item事务内写不可变snapshot。
- retained interface/caller：`MediaOrderService.listOrderViews()`→`listOrderDisplayViews()`（单SQL LEFT JOIN、LIMIT20000）；`MediaOrderService.syncOrder()`→`recordRemoteOrderObservation()`（事务、0/1/2/4/9、安全HTTPS与promotion规则）。A已删除`reconcileRemoteOrder()`。
- RED→GREEN：v3专项2/4暴露verifier漏检FK/required nullability及恢复fixture路径错误；修复后4/4，覆盖migration history、重复启动、三个fault point rollback/retry、损坏structure、backup verify和临时restore。扩展45/45，13k query/SQL=1/1、parsed3、heap143,288 bytes、0.471ms、paidSendCalls=0；三套typecheck、lint、format、links180/180、packaging33/33、diff通过。
- interface判断：OperationalStore schema/public interface确有变化；PublicationWorkflow/Publisher/ContentStore/Domain/Application和Phase06 IPC/Renderer interface未变。真实外部/投稿/同步/付费submit=0。`P1-AUDIT-03`检查点级VERIFIED；下一动作严格为C，Phase03/04/06保持`IN_PROGRESS`，Phase07=`NOT_STARTED`。

### 2026-07-29 最终独立审计第二轮整改检查点 A

- RED：新增永久 source/export/import-call/test/packaged-ASAR 门禁在当前工作树为0/4；删除production wrapper和旧测试后为3/4，精确保留旧ASAR失败。
- 修改/删除：Phase 03 owner物理删除OperationalStore `reconcileRemoteOrder`定义/public export及canonical publication status→supplier `2/4/0` fallback；删除只验证旧wrapper的`phase-03-media-order-reconcile.test.js`，URL evidence回归迁至`recordRemoteOrderObservation()`。没有compatibility wrapper、re-export或测试专用caller。
- schema/interface：A没有schema变化；OperationalStore public interface确有删除。retained正式链为supplier response→`MediaOrderService.syncOrder()`→`recordRemoteOrderObservation()`；Phase 06 Typed IPC/Renderer interface和canonical 109项inventory均未变化。
- GREEN/门禁：本轮pack smoke后4/4，合并legacy path为7/7；supplier/order定向23/23；三套typecheck、lint、format、packaging33/33、Renderer2157 modules、preload222,057 bytes、pack smoke、diff check通过。新ASAR7,209,505 bytes（12:14:07 +08:00）；真实workspace/内容库/Auth/账号/供应商/投稿/同步/扣费/付费submit=0。
- 下一动作：严格进入检查点B，核对Phase 03 schema v2→v3、新表、retained public methods与migration/backup/restore/verify/fault证据。Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`。

### 2026-07-29 P2-09 最终证据纠正

- `media.removeDraft` registry absence 测试先 RED，确认 Renderer production 中只有定义、没有 consumer；现已从 contract、registrar、preload、bridge、feature、fixture 与测试 fake 全链物理删除。
- inventory 为 109 项（43 query、61 command、5 event；workspace9/settings14/media17/platform10/content43/attention3/generation13）。109/109 显式记录 consumer kind/source/method 与 feature source/public method；AST 从 `main.tsx`（含 lazy dynamic import）验证可达性和真实调用，21 lifecycle query 验证 snapshot 消费，4 props 链验证 wiring，5 event 验证 producer/唯一consumer/dispose。
- owner/interface：整改属于 Phase 06 Typed IPC/feature composition；未重开 Phase 03/04 冻结 interface。Auth 5 invoke+1 event豁免、SafeOperationalError、workspace/platform identity 与统一 diagnostic sink 保持原闭合证据。
- 门禁：`npm test`222文件1255/1255、0 fail/skip、160.808秒；专项39/39、Auth16/16、links180/180、packaging33/33；lint、format、三套typecheck、Renderer2157 modules、preload222,057 bytes、pack smoke、packaged source/import/ASAR5/5、Electron focus1/1、容量与diff check全绿。
- 新制品：ASAR7,210,485 bytes（11:05:55）、exe225,485,824 bytes（11:05:56）、Renderer `index-cypc4NxJ.js`。真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费与付费submit均为0；staged diff为空，未stage/commit/push/PR。Phase 03/04/06保持`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

### 审计整改状态账本（2026-07-28）

#### 2026-07-29 检查点 A：`P1-AUDIT-01`

- 状态：`VERIFIED（检查点A）`。RED为`tests/phase-06-production-bridge-fail-closed.test.js`旧实现0/6、6 fail；GREEN为6/6。真实执行覆盖非Electron、`desktopConsole`、namespace、具体query/command/event capability，以及成功envelope `data:null/undefined`。
- 正确owner：Phase 06 Renderer bridge/transport；未重开Domain/Application、OperationalStore、ContentStore、Publisher、schema或Phase 03/04冻结interface。
- production修改：`bridge/transport.ts`统一稳定`OperationalError`；media/platform/settings/workspace/publication/account-profile/content移除synthetic empty/idle/false/null/resolved-void/noop event，具体capability缺失也稳定拒绝。Auth 5 invoke + 1 event仍为Phase 07精确豁免。
- 显式mock：测试内`mockAdapter`提供fixture数据；production bridge在同一非Electron条件下保持fail-closed。旧production fallback symbols与同类返回经静态清点为0（Auth豁免除外）。
- 验证：行为6/6；扩展定向14文件97/97，0 fail/skip；main/renderer/bridge三套typecheck、lint、format与`git diff --check`通过。真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步与付费submit调用均为0。
- 下一动作：严格进入检查点B；旧110项通用caller证据失效，必须逐capability建立结构化View/root→feature→bridge→preload→registrar/application inventory。

#### 2026-07-29 检查点 B：`P2-09` / `P2-AUDIT-02` inventory 复核

- RED：`tests/phase-06-capability-specific-inventory.test.js` 在旧通用 `productionCallerTrace`、owner推导 hook 与 matrix `source.includes` 下为0/1（1 fail）。
- GREEN：110/110 capability 改为显式 caller；TypeScript AST 逐项验证 View/root 实际调用或渲染、feature export及capability-specific bridge binding/调用、bridge export、preload method→channel、registrar/application。owner 为 workspace 9、settings 14、media 18、platform 10、content 43、attention 3、generation 13。
- Event：5项均验证 producer、唯一直接 bridge consumer、channel 与 `removeListener` dispose。Auth 5 invoke + 1 event豁免未扩大；本轮未发现新的无consumer能力，旧18项未恢复。
- 验证：inventory/matrix及纵向composition/packaging定向15 files、89/89，0 fail/skip；main/renderer/bridge三套typecheck、lint、format和diff check通过。全部使用静态AST、VM、内存fake或合成fixture，真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步和付费submit均为0。
- 状态：`VERIFIED（检查点B复核）`；Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`。下一动作严格进入检查点C。

#### 2026-07-29 检查点 C：`P2-AUDIT-02` legacy source / ASAR

- RED：`tests/phase-06-legacy-path-absence.test.js` 在删除前当前source与旧ASAR为1/3、2 fail；import graph 1/1已绿，证明文件无caller但仍被打包。
- 删除：四条点名production文件与`desktop/services/submission/`六条等价dead implementation全部物理删除；仅执行旧query/preflight实现的测试删除，jobs远端协调旧用例删除。没有重命名迁移、re-export、compatibility wrapper或package例外；单资源media preflight fallback物理消失。
- GREEN：source/import graph/本轮新ASAR为3/3，四点名+六等价路径在source和ASAR均为零。Phase 03/04扩展定向25 files、95/95；packaging33/33；三套typecheck、lint、format、Renderer2157 modules、preload222,542 bytes、pack smoke与diff check通过。
- 制品：`release-alpha/win-unpacked/resources/app.asar` 7,211,917 bytes、exe 225,485,824 bytes，2026-07-29 08:32:10。真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、付费submit均为0。
- 状态：`VERIFIED（检查点C）`；Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`。下一动作仅为19项finding复核与第10节最终门禁。

#### 2026-07-29 最终终态

- A补充Electron composition RED：真实`contextBridge`冻结namespace下旧transport绑定函数导致行为集6/7、1 fail；保持缺namespace/capability/result拒绝并返回原始函数引用后为7/7。production bridge无synthetic success/noop event，测试数据仍只经显式`mockAdapter`注入。
- B终态：110/110 non-Auth capability逐项AST链完整（43 query、62 command、5 event；workspace9/settings14/media18/platform10/content43/attention3/generation13），5项event的producer、唯一consumer、dispose闭合；Auth仅5 invoke+1 event；无新增无consumer能力。
- C终态：source/import graph/本轮ASAR为3/3；四条点名及六条等价submission路径物理消失，无wrapper、re-export、迁移副本或package例外。
- 完整门禁：`npm test`222文件、1252/1252、0 fail/skip、158.040秒；最终专项138/138、Auth16/16、links180/180、packaging33/33；lint、format、三套typecheck、Renderer build（2157 modules）、preload（222,542 bytes）、pack smoke、packaged preload+legacy ASAR 6/6、最新Renderer Electron focus1/1和`git diff --check`全部通过。
- 最新制品：`release-alpha/win-unpacked/resources/app.asar` 7,211,886 bytes（2026-07-29 08:58:01）；`release-alpha/win-unpacked/鱼饼大王.exe` 225,485,824 bytes（2026-07-29 08:58:02）；Renderer asset `index-DVe8E-ba.js`。
- 容量：Main 1k/10k/13k/20k请求10/100/130/200、payload 44,603/464,188/610,078/950,488 bytes；Renderer均1请求、payload 4,279/4,280/4,280/4,280 bytes；第20,001项明确truncated。13k临时SQLite为query=1、SQL=1、parsed=3、orders=3、heap=143,288 bytes、0.358ms、paidSendCalls=0。
- fixture仅为fake client、临时SQLite、VM、内存adapter、合成workspace/resource及本地Electron；真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费与付费submit调用为0。Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

启动门禁：`codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`；已完整记录`status --short --untracked-files=all`、未暂存差异和最近五个提交。工作树含本整改的既有 WIP，未reset、checkout、clean或覆盖。Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`；未连接真实workspace、内容库、Auth数据库、账号或付费服务；不stage、commit、push或创建PR。

| Finding | 状态 | 目标阶段/owner | RED / 修改 / 验证 |
| --- | --- | --- | --- |
| P1-01 Platform event workspace identity | VERIFIED（检查点A） | Phase 06 + Phase 04（`IN_PROGRESS`） | RED：A→B 后 A event写入 B `run-a`。修改：`platform-contracts`、`desktop-task-service`、`workspace-runtime`、platform feature/type DTO；真实Renderer fixture现以同一runtime identity覆盖A→B及A迟到heartbeat/terminal拒绝，B的`7 / 20`与queue refresh不变。 |
| P1-02 ConfirmationHost/destructive scope | VERIFIED | Phase 06 | root绑定runtime+client scope并取消FIFO；确认后identity复验，feature拒绝跨client input。content/confirmation定向20/20及三套typecheck通过。 |
| P1-03 SafeOperationalError语义安全 | VERIFIED（检查点A） | Phase 06 IPC registry | registry按contract code重建固定安全error并丢弃路径、URL credentials、Cookie、stack和正文等不可信语义；已恢复冻结的Phase 01 domain DTO合约。 |
| P1-04 raw URL/内部订单字段退出Renderer | VERIFIED（检查点A） | Phase 06 + Phase 03（`IN_PROGRESS`） | DTO仅含`hasPublishedUrl`；移除raw URL/workflow/internal字段，evidence写入拒绝credentials/query/fragment/non-HTTPS。 |
| P1-05 supplier/canonical状态解耦 | VERIFIED（检查点B） | Phase 03 + Phase 06 projection | RED：supplier `2`缺URL触发整体sync失败。GREEN：`0/1/2/4/9`独立observation持久化；`2`缺URL不提升，`2 + 安全HTTPS`才提升，`9`不撤销published，缺observation保持unknown；删除canonical fallback、remoteStatusCode兼容读取和legacy ledger mutation。 |
| P1-06 媒体价格canonical化 | VERIFIED（检查点B） | Phase 06 MediaResourceService | RED：绕过摄取的字符串`"36.50"`在submission owner被二次转换成`36.5`，cache保留raw非法报价。GREEN：仅MediaResourceService摄取字符串并生成finite non-negative canonical number或unknown；cache/pool raw副本及workbench/submission/IPC/Renderer二次转换物理删除。 |
| P1-07 production bridge synthetic fallback | VERIFIED（检查点A+终态） | Phase 06 | 初始0/6 RED→6/6；Electron frozen namespace补充RED为6/7→7/7。全部non-Auth bridge的transport/namespace/capability/result/event缺失fail-closed，显式mock只在测试，production synthetic success/noop event为零。 |
| P2-08 registrar fail-closed | VERIFIED（检查点C） | Phase 06 | RED：未登记`media:typo`此前可安装handler。`ipc/register.js`注册前拒绝所有未列入production registry的非Auth channel；真实registrar定向复核继续fail-closed。 |
| P2-09 production caller traceability | VERIFIED（终态） | Phase 06 | 先前18项无consumer能力已全链删除；本轮旧`productionCallerTrace`/owner通用hook/`source.includes`形成0/1 RED。现110/110逐capability TypeScript AST验证真实View/root→feature→bridge→preload→registrar/application链，event另含producer、唯一consumer及dispose。 |
| P2-10 invalid event diagnostic sink | VERIFIED（检查点C） | Phase 06，预留Phase 07 seam | VM执行真实`desktop/preload.js`，malformed `workspace:data-invalidated`与`platform-state`经真实解析失败路径、workspace coordinator/platform router进入同一个有界diagnostic store；仅保留固定code/source，不含路径、URL credentials、Cookie、stack、正文或unknown scope，并验证read/subscribe/dispose。 |
| P2-11 唯一SettingsFeatureProvider | VERIFIED（检查点C） | Phase 06 | production静态composition只有一个`<SettingsFeatureProvider>`实例；Settings页和媒体第三方标识共用该owner，Auth recovery回归仍通过。 |
| P2-12 sync reconcile错误传播 | VERIFIED（检查点B） | Phase 03/Phase 06 application boundary | RED：supplier observation getter异常泄漏原payload/路径。GREEN：supplier解析、SQLite before-commit、evidence URL冲突和observation冲突均成为固定`MEDIA_ORDER_SYNC_FAILED`，事务回滚，UI保留订单且不显示成功。 |
| P2-13 有界订单projection | VERIFIED（检查点B） | Phase 03 | RED：13k真实SQLite fixture无法取得SQL/payload有界观测。GREEN：正式projection单SQL、`LIMIT 20000`且只解析3个订单payload；service fallback删除。指标：query=1、SQL=1、parsed=3、heap=143,376 bytes、elapsed=0.618ms。 |
| P2-14 dead media.stopSubmit | VERIFIED（检查点C） | Phase 06 | contract、fixture、preload、bridge、feature、registrar与无读取service flag均已删除；production与canonical fixture中`media.stopSubmit`/`media:stop-submit`零引用。 |
| P2-15 media Promise/error owner | VERIFIED（检查点C） | Phase 06 | refresh/toggle失败由media feature snapshot owner收敛为安全UI错误且不rethrow；void caller纵向测试以`doesNotReject`证明无unhandled rejection。 |
| P3-16 navigationSummary dead scope | VERIFIED（检查点C） | Phase 06 | protocol/main invalidation/Renderer known scope中的`navigationSummary`零引用；Sidebar的`deriveNavigationSummary`仅为本地derived view，不是协议scope。 |
| P3-17 publishedAt真实性 | VERIFIED（检查点B） | Phase 03 projection + Phase 06 DTO | RED：main把`2026-07-28T12:00:00.000Z`改成无timezone文本，bridge再次格式化。GREEN：main/IPC/bridge保留ISO instant，OrdersView唯一格式化；UTC跨日、`+08:00`和空值回归通过。 |
| P1-AUDIT-01 production bridge fail-closed | VERIFIED（终态） | Phase 06 Renderer bridge/transport | 所有non-Auth query/command/event/result缺失统一稳定拒绝；0/6→6/6及frozen namespace 6/7→7/7两轮production-level RED→GREEN，测试数据仅显式mock adapter。 |
| P2-AUDIT-02 legacy source/ASAR物理删除 | VERIFIED（终态） | Phase 03/04，Phase 06 packaging evidence | source/旧ASAR为1/3、2 fail；物理删除四条点名和六条等价路径后source/import/本轮ASAR为3/3，无迁移、re-export、wrapper或package例外。 |
| P1-AUDIT-03 OperationalStore schema/interface重开记录 | VERIFIED（第二轮B/C） | Phase 03 OperationalStore | 文档RED确认历史“未改schema/interface”不实；已如实记录v2→v3、新表、两个retained methods、A删除public reconcile method及migration/backup/restore/verify/fault证据。 |

检查点A完成记录：P1-01、P1-02、P1-03、P1-04、P1-07均为`VERIFIED（检查点A）`；RED、修改和删除项见上表。本轮在进入B前重新执行 platform/content/confirmation/workspace/IPC/security 定向门禁（82 pass、0 fail、0 skip），其中包含真实Renderer A→B迟到事件、客户切换、FIFO confirmation、历史删除恢复和问题编辑；订单evidence边界、packaging VM registry require和publish-log logger断言也通过。`typecheck:main`、`typecheck:renderer`、`typecheck:bridge`与`git diff --check`通过。全部使用fake、临时SQLite或隔离Renderer fixture，真实付费submit为0；A证据仍有效。

检查点B完成记录：P1-05、P1-06、P2-12、P2-13、P3-17均为`VERIFIED（检查点B）`。RED包括supplier `2`缺URL整体失败、submission二次转换字符串报价、supplier异常泄漏、缺少大历史SQL观测以及publishedAt重复格式化；均已转绿。物理删除`MediaOrderService` JSONL/legacy ledger/raw DTO/status fallback、本地订单mutation，资源cache/pool raw副本、workbench legacy ledger和所有下游报价转换，main/bridge订单时间格式化及service projection fallback。Phase 03/media/order/evidence/workflow定向79 pass、0 fail、0 skip；真实13k临时SQLite为query=1、SQL=1、parsed payload=3、orders=3、heap delta=143,376 bytes、elapsed=0.618ms；fake supplier付费send=0。检查点A复跑82/82；三套typecheck与`git diff --check`通过。未触及Domain/Application、ContentStore、Publisher或schema；Phase 03/04/06保持`IN_PROGRESS`，Phase07=`NOT_STARTED`。该段为B结束时历史边界；随后C与最终完整门禁均已完成。

检查点C完成记录：P2-08、P2-09、P2-10、P2-11、P2-14、P2-15、P3-16均为`VERIFIED（检查点C）`。进入C前复验A/B定向124/124，三套typecheck通过，未发现回归。C实施定向集为21文件129 pass、0 fail、0 skip；文档写回后的独立21文件复核集为128/128，核心110/110 matrix与纵向测试均重复覆盖；packaging 33/33；三套typecheck与`git diff --check`通过。真实inventory为110项；逐项fixture/matrix验证完整View→feature→bridge→preload→registrar链，event另验证producer/唯一consumer/dispose。malformed workspace/platform event经真实preload进入统一安全diagnostic store。Settings owner唯一、registrar对未登记非Auth channel fail-closed、media Promise错误所有权明确，`media.stopSubmit`和协议`navigationSummary`生产旧引用均为0。全部测试使用VM、内存fake或合成fixture，真实付费submit为0。该段为C结束时历史边界；最终完整门禁见下文，Phase 07仍不得启动。

### 最终完整门禁与production composition重验（2026-07-28）

- 初始完整`npm test`真实RED为221文件、1247项中1244 pass/3 fail：两个陈旧测试要求已删除`getGenerationBatchState`，一个Renderer订单fixture仍传raw `orderUrl`。另有format RED：OperationalStore projection与content bridge两文件。分别归属P2-09、P1-04、P2-13/P1-07；只修正旧测试/机械格式，不恢复production seam。定向45/45后，当前工作树完整`npm test`为1247/1247、0 fail/skip（159.306秒）。
- 其余完整门禁：Auth16/16、links180/180、packaging33/33；lint、main/renderer/bridge typecheck、format、Renderer build（2157 modules）、pack smoke（38.3秒，preload 222,542 bytes）与`git diff --check`通过。
- 专项71/71：110/110真实View→feature→bridge→preload→registrar inventory与Auth六项豁免；workspace/platform迟到及malformed event；ConfirmationHost FIFO/scope/focus/exactly-once；supplier/order/price/SQLite故障注入与13k历史单SQL projection（query/SQL=1/1、parsed=3、paidSendCalls=0）；publish-log零引用。
- 容量终态：main 1k/10k/13k/20k请求10/100/130/200，payload 44,603/464,188/610,078/950,488 B，heap 0/2,137,320/5,329,640/2,106,760 B，延迟1.219/4.245/4.644/5.708ms；Renderer请求均1，payload 4,279/4,280/4,280/4,280 B，heap 351,688/1,268,472/480,912/407,160 B，延迟1.001/1.059/1.074/1.525ms。第20,001项明确`truncated/max-resources`。
- packaging VM registry require与logger断言通过；packaged ASAR preload 3/3；基于本轮最新Renderer的Electron focus 1/1。所有执行均为临时SQLite/VM/本地Electron/内存fake/合成fixture，真实付费submit调用为0。

## 2. Feature owner与production composition

| Owner | Production composition | Query/snapshot scopes | 命名command owner |
| --- | --- | --- | --- |
| workspace | `features/workspace/workspace-feature-context.tsx`、`workspace-coordinator-context.tsx` | bootstrap、current、runtime identity、known invalidation scopes | choose/confirm/cancel/open/switch，各自独立 token |
| content | `features/content/use-content-workbench-feature.ts` | workspaceSources、clientSources、researchIndex、articleManagement | 普通 mutation 与 destructive prepare/execute 独立 owner；removal subscription归content |
| generation | `features/generation/use-generation-feature.ts` | runtime/batch/handoff，scope=`workspaceRuntimeId+batchId` | preview/start/pause/resume/stop/continue/retry/cancel/handoff 独立 owner |
| platform | 根级 `features/platform/platform-feature-context.tsx` | queue、PlatformRun、residue、login、accountProfiles | submit/pause/stop/cleanup/openLogin/checkLogin/confirmAccountProfile 独立 owner |
| media | `features/media/use-media-feature.ts` | articles、drafts、resources、pool、balance、orders、submission | scan/save/resource/pool/submission/order sync 独立 owner |
| attention | `features/attention/use-attention-feature.ts` | allowedActions/revision/fingerprint | preview/execute 绑定当前 revision/fingerprint |
| settings | `features/settings/settings-context.tsx` | AI、platform provider、storage usage/status | save/test/clear/clean/self-check 各自独立 owner |

所有 initial、manual refresh、invalidation 和 command-result 均使用 `feature + query + scope` identity。修复了 removal transaction effect 因不稳定 `refreshManagement` 引用重复订阅的 lifecycle 缺陷；当前暴露稳定 feature method 引用。

## 3. Typed IPC inventory

Canonical registry：`auto—publish/desktop/ipc/contracts/production-registry.js`。Canonical 逐项 inventory/合法 fixture：`auto—publish/tests/fixtures/phase-06-production-ipc-contract-fixtures.js`。

| Owner | Query | Command | Event | 合计 |
| --- | ---: | ---: | ---: | ---: |
| workspace | 3 | 5 | 1 | 9 |
| settings | 5 | 9 | 0 | 14 |
| media | 10 | 7 | 0 | 17 |
| platform | 4 | 5 | 1 | 10 |
| content | 15 | 26 | 2 | 43 |
| attention | 2 | 1 | 0 | 3 |
| generation | 4 | 8 | 1 | 13 |
| **合计** | **43** | **61** | **5** | **109** |

109/109每项包含独立request/result（event项为event）fixture、owner和真实production caller。`productionCaller`逐项记录并验证可达consumer文件与实际调用、feature public surface、bridge import/wiring symbol、bridge export、preload命名方法与精确channel、invoke registrar；lifecycle query另验证UI snapshot消费，props链验证父子wiring，event另验证producer、唯一直接bridge consumer和removeListener dispose。registry表驱动测试继续遍历unknown version、unknown field、missing required field、unsafe/raw error。

检查点C及后续P2-09纠正共物理删除19项无真实consumer的能力：`attention.getArticleAttention`、`content.listTemplates`、`content.listGeneratedArticles`、`content.reviewArticles`、`content.listArticleTrash`、`content.previewTrashArticles`、`content.listArticleRemovalTransactions`、`content.listSubmissionBatches`、`content.previewCancelSubmissionBatch`、`content.previewRetryFailedPublication`、`content.retryFailedPublication`、`content.startDoubaoBatch`、`generation.createBatch`、`generation.listBatches`、`generation.getBatch`、`generation.startBatch`、`generation.getState`、`publication.listForArticles`、`media.removeDraft`。删除覆盖contract、registrar、preload、bridge、feature、fixture及只服务这些能力的旧测试；没有保留兼容wrapper。

Auth Phase 07豁免清单：invoke `auth:get-state`、`auth:login`、`auth:change-password`、`auth:refresh`、`auth:logout`；event `auth-state-changed`。它们只存在于显式 allowlist，不提供通用 invoke/on/channel。

SafeOperationalError 闭集：`{ code, category, retryability, userMessage, diagnosticId? }`。非Auth Renderer只消费 `userMessage`；旧 Auth `message` envelope 仅在 `authIpcError` 隔离，作为 Phase 07 迁移入口。

## 4. Workspace invalidation协议

- Main process 是 `reasonCode -> scopes` 唯一 owner；event 为版本化精确对象，包含 opaque `workspaceRuntimeId`、单调 `revision`、`scopes`、`reasonCode`。
- Renderer 原始 `workspace:data-invalidated` consumer 只有 `bridge/workspace.ts -> workspace-coordinator-context.tsx` 一条链。
- 重复/倒退 revision 忽略；revision gap 刷新全部已注册 known scopes并记录 `WORKSPACE_INVALIDATION_REVISION_GAP`。
- malformed event与未知scope只产生安全 diagnostic：`WORKSPACE_INVALIDATION_EVENT_REJECTED`、`WORKSPACE_INVALIDATION_UNKNOWN_SCOPE`，不泄露payload。
- runtime切换使旧 query/command/event result失效；dispose移除transport和feature订阅。

## 5. 删除与安全边界

已删除：`app-draft-save-controller`、`article-management-controller`、`platform-submission-controller`、`platform-task-store`、`workspace-data-store`、`article-attention-store`、`ActionConfirmationModal`，以及对应页面级原始订阅/旧结构测试。

Production静态审计为0：通用 `callContent`/字符串command dispatch、动态 `api?.[method]`、`Record<string, any>`、业务 `window.confirm/globalThis.confirm`、`pageSize:99999`、`publish-log`、上述旧controller/store/modal。Preload没有通用 invoke/on/channel；Renderer DTO无 path/database/Cookie/key/raw Error/stack/raw log。Orders“清空记录”按钮和仅清本地state回调已移除。

ConfirmationHost 为 AuthGate 内根级单实例：FIFO、默认焦点取消、Tab/Shift+Tab/Escape、焦点恢复、requester/feature/host dispose、重复点击 exactly-once 均有测试。destructive flow为 prepare -> FIFO confirmation -> execute；cancel不发command。

## 6. Media容量

约束：Renderer默认 `pageSize=50`；IPC/main单页最大100；远端最多200页；最多20,000 unique resource IDs；第20,001项显式 `truncated`，不得伪装完整成功。搜索/翻页仅structured-clone当前页。

| Unique IDs | Main请求数 | Main heap增量 | Main延迟 | Renderer请求数 | Payload bytes | Renderer heap增量 | Renderer延迟 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 10 | 362,768 B | 2.808 ms | 1 | 4,279 B | 351,400 B | 1.044 ms |
| 10,000 | 100 | 2,729,360 B | 9.767 ms | 1 | 4,280 B | 1,290,952 B | 1.110 ms |
| 13,000 | 130 | 3,575,472 B | 11.553 ms | 1 | 4,280 B | 444,160 B | 1.069 ms |
| 20,000 | 200 | 5,295,696 B | 17.963 ms | 1 | 4,280 B | 1,090,440 B | 1.659 ms |

全部为临时合成 fixture。20,000 仅在provider明确完成时可视为完整；本轮未出现“20,000仍是正常规模”的证据，未触发提高上限停止条件。

## 7. 测试、fixture与故障注入

- 扩大定向矩阵：56个选定文件、244/244，覆盖content/client switch/refresh/management/generation/handoff、PlatformRun/task/queue/account profile、media service/library/workbench/capacity、workspace invalidation/runtime、confirmation/settings和IPC registrars。
- 原全量陈旧fixture收口集合：12文件、62/62；未恢复旧production seam。
- 最终 `npm test`：收集221个测试文件，1194 pass、0 fail、0 skip（约153秒）。
- `npm run test:auth`：16/16；`npm run test:links`：180/180；`npm run test:packaging`：33/33，均0 fail/skip。
- `npm run lint`、`typecheck:main`、`typecheck:renderer`、`typecheck:bridge`、`format:check`、`build:renderer`、`build:preload`、`pack:smoke`、`git diff --check` 全部通过。Renderer build转换2153 modules；最新preload bundle为226,830 bytes；pack smoke生成并验证非签名Windows目录制品。
- 最新pack smoke Renderer build后，以 `RUN_ELECTRON_FOCUS_TESTS=1` 真实运行Electron settings focus：1/1 pass、0 fail/skip（默认未启用的一次skip不计最终证据）。
- fixture类型：临时合成workspace、内存fake registrar/service、bounded synthetic media pages、Playwright Renderer harness、临时Electron preload/main；未连接真实外部系统。
- 故障注入：全部registry的非法版本/字段/缺字段/unsafe error；未认证/application throw/validator throw；stale success/failure与dispose；revision gap/runtime switch/malformed event；Platform submit/pause/stop 100轮交错；destructive prepare reject/token stale/cancel；remote repeat page/重复ID/矛盾total/20,001截断；confirmation requester/host卸载与重复点击；settings success/failure/finally；account profile reject无unhandled rejection。

### Production sandbox preload P1收口（2026-07-27）

- 完成后真实启动复核精确复现“桌面认证不可用”：`sandbox: true` 的 production preload 新增本地 CommonJS contract registry依赖后，Electron sandbox无法运行时加载该模块，preload整体失败，`window.desktopConsole`与固定Auth API均未暴露。
- 原 packaging 测试使用VM mock `require`，Electron focus使用合成preload，未经过真实production composition；这是先前门禁未捕获该问题的原因。
- 修复保持 `sandbox: true`：`scripts/build-preload.js` 使用既有esbuild把production preload生成单文件 `build/preload/preload.cjs`，仅external `electron`；开发启动、smoke及全部pack/dist脚本先构建bundle，Electron入口改为该bundle，builder与package verifier明确要求它进入ASAR。bundle检查拒绝残留本地相对`require`。
- 新增真实Electron回归 `production-preload-sandbox.electron.test.js`：source sandbox 2/2；重建目录制品后显式从packaged ASAR加载3/3。断言 `desktopConsole.auth`固定能力存在，同时无通用invoke/on/channel。
- P1收口后重跑完整门禁；结果以上述220文件、1187/1187及最新pack smoke/ASAR探针为准。测试只使用临时窗口、合成fixture和本地目录制品，未连接真实Auth数据库或账号。
- Phase 06已重新关闭为`COMPLETE`；Phase 07仍为`NOT_STARTED`。Phase 04人工项继续只阻止正式release。

### Workspace bootstrap production composition P1收口（2026-07-27）

- preload已把工作区请求编码为版本化envelope；但main原先把自行解析typed wire的`registerWorkspaceBootstrapIpc`再次接到`createAuthenticatedIpcMain`。外层先解码并转成legacy参数，内层再按envelope解析，导致已有工作区读取和目录选择统一返回`IPC_REQUEST_INVALID`。
- 确定性RED差分：raw registrar返回`ok:true/state:ready`，原production guarded composition返回`ok:false/IPC_REQUEST_INVALID`；与“已有工作区无法加载且无法重新选择”完全一致，且不依赖用户工作区数据。
- 修复后workspace registrar是认证、request验证与result编码的唯一owner；main传原始`ipcMain`和显式`requireAuthenticated`。未增加兼容wrapper，未改变Workspace/Domain/Application接口。
- 回归覆盖existing workspace、synthetic native selection、未认证`AUTH_REQUIRED`安全闭集、production main单owner静态composition、128/128 registry矩阵，以及真实Electron source sandbox和新packaged ASAR中的workspace registrar+preload调用。workspace/registry定向74/74；ASAR探针3/3。
- 新目录制品已重建到`release-alpha/win-unpacked`；测试只使用临时合成workspace/service与隔离Electron窗口，未读取或修改真实工作区、Auth数据库或账号。

### AI生成DTO与workspace relaunch环境P1收口（2026-07-27）

- 单篇AI生成精确production RED：`content:generate-article`的research/reference snapshot会保留own-property `undefined`可选字段；严格exact result validator正确拒绝并返回用户看到的“内容结果未通过安全校验”。Content projector现省略undefined可选字段而不放宽request/result schema；真实generator形状、128 registry矩阵和新ASAR调用均为GREEN。
- 工作区“由环境变量控制”并非用户配置：Windows Process/User/Machine均不存在`AUTO_PUBLISH_WORKSPACE`。runtime内部为旧模块写入该键，应用relaunch继承后被下一进程误判成显式override。
- main在runtime初始化前捕获该键启动状态，relaunch前恢复：原本不存在则删除内部写入，原本存在则恢复用户原值。因此普通已保存工作区可切换，真正显式environment override仍不可切换。
- 本轮RED→GREEN：AI production seam 1/1；relaunch absent/present/main ordering 3/3；Content/Workspace/packaging定向104/104；真实source sandbox 2/2与packaged ASAR preload/workspace/content 3/3。容量、安全与Auth豁免清单不变。
- 新目录制品已再次重建；全部验证使用合成article/workspace/environment和隔离Electron，未调用真实AI、未读取真实内容库/Auth数据库或账号。

### AI生成Unicode identity与workspace command连锁P1收口（2026-07-27）

- 用户继续复核时同时得到“内容结果未通过安全校验”和`Content command is unavailable`。合成production RED确认：中文客户目录默认identity、中文自定义platform/template identity均为当前domain合法值，但content IPC原先复用ASCII token validator，`list-clients`或`list-template-catalog`因此返回`IPC_RESULT_INVALID`；sources并行查询失败后selected client为空，问题采集页仍初始化豆包队列，旧`runCommand`又对workspace级command错误要求selected client，形成第二条英文提示。
- content业务identity现为Unicode-safe path-free segment：拒绝`/`、`\\`、控制字符、`.`、`..`和首尾空白；confirmation token继续使用独立ASCII opaque validator。`getDoubaoQueueState`等workspace级command只要求`workspaceRuntimeId` scope；`createQuestion`等客户级mutation在无selected client时仍fail-closed。没有通用dispatch或兼容wrapper。
- 旧research记录缺少`collectionMethod`的独立RED也稳定复现`IPC_RESULT_INVALID`；safe DTO投影现归类为`legacy`，exact result validator保持不变。回归通过Unicode client/platform/template generation request/result、legacy provenance、无客户workspace command及客户command拒绝。
- 最终证据：Content/Renderer/preload定向51/51；三套typecheck；`npm test` 221文件、1196/1196、0 fail/skip；Auth 16/16；links 180/180；packaging 33/33；lint、format、`git diff --check`；Renderer 2153 modules；preload 227,170 bytes；标准`release-alpha/win-unpacked` pack smoke及verifier；packaged ASAR 3/3；最新Renderer Electron focus 1/1。fixture仅为合成Unicode DTO、临时窗口与本地目录制品，未访问真实内容库、AI、Auth数据库或账号。
- 标准修复制品：`auto—publish/release-alpha/win-unpacked/鱼饼大王.exe`，2026-07-27 08:11:58，225,485,824 bytes。Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。

### 豆包Unicode identity与passive session恢复P1收口（2026-07-27）

- 用户在问题与采集页继续看到“豆包结果未通过安全校验”，且打开登录和状态保存正常、手动刷新变成`session_error`。两个production RED分别证实：豆包contract仍用ASCII-only `id`，中文client/question在preload request编码阶段失败；`getLoginState()`被动检查遇到正常关闭的session会抛`PLAYWRIGHT_SESSION_NOT_OPEN`，但该code未在Typed IPC安全错误闭集登记，production降级为`IPC_INTERNAL`，使Renderer预设的previous-login恢复分支不可达。
- 豆包client/question/task business identity现使用Unicode-safe path-free segment，继续拒绝路径分隔符、Windows非法字符、控制字符、`.`/`..`及首尾空白/尾点。`PLAYWRIGHT_SESSION_NOT_OPEN`现返回`category=transport`、`retryability=safe`和固定安全文案；Renderer恢复上次`authenticated/login_required`状态，不暴露原始`session closed`、Cookie、profile或路径。登录DTO五种合法shape本身未放宽。
- 最终验证：豆包/Renderer/source preload定向43/43；`npm test`221文件1198/1198、0 fail/skip；三套typecheck、lint、format；Auth16/16；links180/180；packaging33/33；Renderer2153 modules；preload229,242 bytes；标准`release-alpha/win-unpacked` pack smoke；packaged ASAR3/3；最新Renderer Electron focus1/1。全部使用合成Unicode DTO、关闭session错误和临时Electron窗口，未访问真实账号、Cookie、工作区或内容库。
- 最新标准制品：`auto—publish/release-alpha/win-unpacked/鱼饼大王.exe`，2026-07-27 08:26:01，225,485,824 bytes。Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。

### 批量生成与文章管理现场回归收口（2026-07-27）

- 批量预检：generation business identity从ASCII-only收口为Unicode-safe path-free segment；main对preview模板、source与task做精确投影，真实模板内部`source/readOnly`不越过Renderer DTO。preload request编码失败现在返回`IPC_REQUEST_INVALID`，不再误报“生成结果未通过安全校验”。
- 文章管理：真实cancellation action-plan item没有队列`status`。Typed IPC新增独立action-plan item/plan validator与projector，保留`clientId/action/planId/fingerprint/counts`及安全逐项字段；普通submission item validator保持不变。这样已有queued batch/actionPlan不再使整个management snapshot失效，保存文章与`submissionPlatforms`可同时恢复显示。
- Invalidation：production `registry.event -> parseEvent -> coordinator`纵向测试锁定preload已验证payload不含envelope版本字段的事实；coordinator不再二次误拒`ARTICLE_SAVED`，仍维持唯一raw consumer、main唯一reason→scope owner及revision gap规则。
- 可观察性：文章管理query失败现在显示SafeOperationalError，而不是静默渲染空历史；不显示原始Error、stack、路径或日志。
- 最终验证：`npm test` 221文件1203/1203；Auth16/16；links180/180；packaging33/33；域定向69/69；lint、main/renderer/bridge typecheck、format、Renderer build（2153 modules）、preload build（230,279 bytes）、pack smoke、packaged ASAR 3/3、最新Renderer Electron focus1/1、`git diff --check`均通过。最新标准制品为`release-alpha/win-unpacked/鱼饼大王.exe`（225,485,824 bytes，2026-07-27 12:19:01）。
- 边界不变：未修改OperationalStore、ContentStore、Publisher或冻结Domain/Application接口；未访问真实账号、Cookie、Auth数据库或内容库；未stage/commit/push/PR；Phase 07=`NOT_STARTED`。

### 旧publication read-model与单篇伪导出入口收口（2026-07-27）

- 最小production DTO RED证实：合法新保存文章与一条旧publication record共存时，后者缺少后期增强的`articleKey/targetKey/timestamps`即会使整个article-management snapshot变成`IPC_RESULT_INVALID`。read-model contract现只将这些增强字段设为optional；`publicationId/clientId/articleId/status/attempts`仍必填，不伪造identity，unknown field、unsafe error和敏感数据边界均不变。
- 单篇生成页的“导出平台”不是写作模板平台；其UI列出多个平台，而底层旧快捷导出service仅接受`media`。该伪通用footer及Renderer caller已删除。投稿仍统一从文章管理页的平台+账号档案+preview/confirmation流程进入；相关IPC因管理页仍有production caller而未删除。
- 验证：域定向50/50；`npm test` 221文件1205/1205、0 fail/skip；Auth16/16、links180/180、packaging33/33；main/renderer/bridge typecheck、lint、format、Renderer build 2153 modules、preload 230,459 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1、diff check均通过。新制品`release-alpha/win-unpacked/鱼饼大王.exe`（225,485,824 bytes，2026-07-27 13:43:43）。所有新验证使用合成article/publication和临时Electron窗口，未读取真实workspace。

### 客户专属引用快照边界收口（2026-07-27）

- 同workspace客户对照证据排除全局preload/平台目录问题。producer差分证实ResearchStore与豆包parser未限制reference title/url/snippet长度，而文章管理exact DTO限制1,000/4,096/10,000；因此只有携带超长引用的客户整页失败，新文章选中该调研回答后也会立即复现。
- Content main projector现对引用字段做有界安全投影，省略nullable可选snippet。未将IPC设为无界，未向Renderer暴露raw record，未修改ContentStore、ResearchStore、OperationalStore或Domain/Application接口。
- RED命令稳定得到`IPC_RESULT_INVALID`，GREEN后同fixture为10,000字且`ok:true`。source sandbox与新packaged ASAR都实际调用`content:get-article-management-snapshot`并通过，而不只是检查preload暴露。
- 最终：域70/70，`npm test`221文件1206/1206、0 fail/skip；Auth16/16、links180/180、packaging33/33；三套typecheck/lint/format、Renderer2153 modules、preload231,191 bytes、pack smoke、packaged ASAR3/3、Electron focus1/1。最新exe 225,485,824 bytes，2026-07-27 14:31:19。仍未stage/commit/push/PR，Phase 07未启动。

### 结构化引用与workspace启动环境归属收口（2026-07-27）

- 个别客户文章/生成结果失败的production RED定位到research reference的`snippet`可为object/array，而Typed IPC result只允许文本。IPC projector会省略非文本snippet；正文、引用title/url及其他来源快照仍保留，文本snippet继续执行既有有界投影。未修改ContentStore、ResearchStore、OperationalStore或Domain/Application接口。
- workspace隔离使用两个临时合成workspace、相同clientId和不同articleId贯穿真实WorkspaceRuntime→ArticleManagement IPC：新runtime只返回新workspace文章。Renderer A→B公开snapshot测试同时确认切换立即清空且拒绝旧异步结果。
- 生命周期根因是`configureRuntimeEnvironment`内部写入`process.env.AUTO_PUBLISH_WORKSPACE`后，后续bootstrap重新读取同一可变对象并将旧workspace误标为external override。bootstrap现在只接收应用启动瞬间捕获的不可变workspace环境；内部写入不会污染重建，真正由用户/系统显式提供的startup override仍保持锁定。
- 最新验证：本轮Content/Workspace定向66/66；`npm test`221文件1210/1210、0 fail/skip；Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer2153 modules、preload231,173 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及diff check均通过。最新exe为225,485,824 bytes，2026-07-27 15:32:47。仅使用临时合成fixture；未stage/commit/push/PR，Phase 07未启动。

### OperationalStore publication client identity收口（2026-07-27）

- 用户截图证明失败按客户历史稳定触发：正常客户继续新增文章仍正常，失败客户新增文章仍不显示。临时合成workspace上的真实OperationalStore `reservePublicationTarget`→management snapshot→registry链路稳定RED为`IPC_RESULT_INVALID`。
- 根因是OperationalStore publication read model合法返回`clientId:null`，但Renderer exact DTO要求client identity；旧投稿记录持续毒化后续整份client snapshot。旧fixture手工填写字符串clientId，因此漏检production shape。
- article-management现仅保留当前article ID集合对应records，将null identity绑定到请求client scope，显式异客户record拒绝。GREEN回归一次返回旧已投稿文章和同客户新生成文章，不改OperationalStore/ContentStore/Domain/Application冻结接口。
- 工作区和客户都不共享文章：设置页workspace/内容库以runtime隔离，截图右上为当前客户切换，以clientId隔离。已有合成A/B workspace真实IPC和Renderer旧异步拒绝回归。
- 最新验证：`npm test`221文件1211/1211；Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer/preload build、标准pack smoke、packaged ASAR3/3、Electron focus1/1与diff check通过。仅使用临时合成workspace/SQLite/DTO，未读取真实内容库或账号；未stage/commit/push/PR，Phase 07未启动。

### 投稿、付费媒体handoff与平台登录请求边界收口（2026-07-27）

- 普通投稿和付费媒体handoff共享的submission contract原先把`clientId`限制为ASCII token，但content领域与客户目录明确允许Unicode-safe、path-free identity。中文客户的batch preview/create以及media preview/export因此在preload request编码阶段稳定失败；main、submission service和media service均未执行。这既影响新文章也影响旧文章，不是历史资料格式不兼容。
- submission DTO现仅将客户字段切换为content核心既定identity规则：拒绝`/`、`\\`、控制字符、`.`、`..`和首尾空白；article、platform、account profile、token与confirmation validator保持各自闭集。没有修改ContentStore、OperationalStore、Publisher或Domain/Application接口，没有migration或compatibility wrapper。
- 列举网/头条`openLogin/checkLogin`失败来自preload先构造`{platformId}`，contract `fromArgs`再次构造导致嵌套object。公开caller现传单一原始platform identity，production registry负责唯一编码；登录链路与任何客户、文章或采集数据无关。
- RED→GREEN覆盖四条Unicode客户投稿/媒体请求与两条公开平台登录请求。域定向52/52；完整`npm test`221文件1213/1213、Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer build 2153 modules、标准pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及`git diff --check`通过。首次pack尝试仅因GitHub Electron下载`ETIMEDOUT`失败，重试成功；最新制品`release-alpha/win-unpacked/鱼饼大王.exe`为225,485,824 bytes，2026-07-27 20:46:18。
- 全部新增验证使用合成Unicode identity和本地fixture；未读取真实workspace、客户资料、文章、Cookie、账号或外部服务；未stage/commit/push/PR，Phase 07=`NOT_STARTED`。

### 付费媒体预览、刷新与资源池command收口（2026-07-27）

- 文章“打开”无响应的真实registrar RED返回`IPC_RESULT_INVALID`：预览正文错误使用禁止LF/CR/TAB的单行`safeText`。`articlePreview.content`现使用最大2,000,000字符的有界多行validator；正常Markdown可通过，unknown field、路径、raw error和stack仍被拒绝。
- 收藏RED证明公开`media.addToPool(fullResource)`在preload编码阶段失败且Electron invoke次数为0。公开参数现投影为精确wire DTO `{resourceId,name?,price?}`；18项media capability inventory、exact request schema和owner不变，没有为历史资源放宽contract。
- “刷新库”链路原已执行并由command owner保存error/result，但App未消费`refreshResources.error/result`，成功且数量不变或失败时都呈现无反应。Renderer现显示安全错误、完成数量及truncated上限提示；`openArticle.error`也进入同一安全告警位。
- 删除了没有Typed IPC capability、没有后端owner且仅写局部state的旧“添加媒体”按钮、表单、caller与feature command。合法资源仍只能通过有界远端刷新、分页查询和明确资源池command进入工作台。
- RED→GREEN后最小回归21/21，媒体完整域47/47，三套typecheck通过。最终`npm test`为221文件1217/1217、0 fail/skip；Auth16/16、links180/180、packaging33/33；lint、format、Renderer build（2153 modules）、preload bundle（231,751 bytes）、pack smoke、packaged ASAR sandbox 3/3、最新Renderer Electron focus1/1及diff check均通过。
- 1k/10k/13k/20k Renderer容量fixture均保持1次请求、单页50项和约4.28KB payload；20,001显式truncated及200页上限原测试继续通过。全部使用临时合成fixture，未连接真实付费媒体、账号、workspace或内容库。新制品`auto—publish/release-alpha/win-unpacked/鱼饼大王.exe`为225,485,824 bytes，2026-07-27 23:03:31；未stage/commit/push/PR，Phase 07=`NOT_STARTED`。

### 13k刷新与付费预检可见性收口（2026-07-27）

- 刷新production链路的`fetchAll`、Typed IPC和Renderer分页均正确，真正截断点位于供应方adapter和main刷新结束判断：multipart错误发送`pageSize`后供应方退回默认20项，service把相对请求hint的短页误判为完整末页。adapter现使用与供应方其他字段一致的`page_size`；无元数据且实际页宽较小时，service学习该页宽并继续，最多200页后必须显式truncated。
- 容量RED→GREEN使用纯合成client/store：13,000 unique资源、100项/页为130请求并complete；忽略页宽、固定20项/页时为200请求、4,000项并`truncated=max-pages`，不会报告complete。Renderer仍只查询单页50项，13k snapshot payload约4.28KB；20,000 unique和第20,001项边界不变。
- 预检静默RED包含两篇稿件（仅一篇有明确资源选择）：旧`every`门禁使绿色按钮实际disabled；另一个RED让Typed preflight返回SafeOperationalError，旧App因modal未打开而无可见错误。media owner现从显式选择派生本次候选并保存预检快照，未选稿件不进入该批次；失败显示在工作台，选择/文章/workspace变化使预检失效。
- 顶部只读入口改为“投稿预检”，最终modal按钮改为“确认付费提交”。测试在预检阶段断言`submitSelected`调用数为0；成功生命周期测试也只调用内存fake，从未连接真实`media/send`、付费平台、账号或workspace。
- 本轮媒体域63/63；`npm test`221文件1220/1220、0 fail/skip；Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer build2153 modules、preload231,751 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及diff check均通过。最新exe 225,485,824 bytes，2026-07-27 23:35:24；未stage/commit/push/PR，Phase 07=`NOT_STARTED`。

### 付费媒体预检明细与OperationalStore重复发布保护收口（2026-07-28）

- 用户现场截图中已选择1个媒体且预计扣费为¥3，但预检弹窗显示“选中目标0、可提交0、阻止0”。真实`registerMediaIpc` + production contract registry + 临时文章/资源RED精确复现：文章数、资源数和价格都正确，`submitableResourceCount`却为0。
- 根因是Phase 03移除legacy `publicationLedger` production owner后，`media-workbench-service.buildConfirmationSummary()`仍在ledger缺席时提前返回只有计数的旧摘要，丢弃刚构建的`submitableResources`/`blockedResources`明细。该退路已删除；没有恢复legacy ledger或兼容wrapper。
- 为防止恢复明细后削弱重复投稿保护，预检组合边界复用冻结的`platformWorkbenchService.prepareMediaPublicationCommands()`生成与实际执行一致的article/resource identity，并只读查询`OperationalStore.listPublicationRecords()`。`queued/submitting/submitted/published/uncertain`组合进入阻止列表，`failed/cancelled`仍可重试；价格只统计可提交目标。未修改OperationalStore、Publisher、ContentStore或Domain/Application接口。
- RED→GREEN测试使用临时合成文章、缓存资源、内存OperationalStore read model和计数fake；预检及重复阻止两条路径都断言付费submit调用为0，从未调用真实`media/send`、账号或付费平台。
- 最终证据：media registrar 6/6、媒体全域69/69；`npm test`221文件1220/1220、0 fail/skip；Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer build（2153 modules）、pack smoke、packaged ASAR/preload sandbox3/3、最新Renderer Electron focus1/1及`git diff --check`通过。容量fixture保持1k/10k/13k/20k单页单请求，13k远端刷新130个有界请求；第20,001项和200页上限继续显式truncated。
- 最新标准制品为`auto—publish/release-alpha/win-unpacked/鱼饼大王.exe`，225,485,824 bytes，2026-07-28 00:23:54。未stage/commit/push/PR；Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。

### 付费媒体标题、正文HTML与第三方标识核对（2026-07-28）

- 现场订单标题带完整UUID文件名的RED已在公开`prepareMediaPublicationCommands()` seam用三个互异值稳定复现：Renderer保存标题、文件首行标题、文件basename。`resolveSubmissions`原本已正确合并`draft.title`，但media command preparation只把filename/fileBaseName传给parser，最终`title`必然退化为basename。现将已验证保存标题原样传入command，article identity继续按最终有效title+body派生。
- 供应方`/api/media/send`契约要求`content`为HTML；旧PublicationWorkflow路径发送的是去掉首行后的原始Markdown/文本。main现将正文分块投影为有效HTML：段落为`p`、Markdown标题为`h1`至`h6`、段内换行为`br`，并转义`&<>\"`，不会把独立标题行、UUID文件名或可执行原始HTML混入正文。没有向Renderer暴露正文payload或放宽Typed IPC。
- `third_id`默认来源为`media-publication-submission-service`为每次尝试生成的`attempt-${crypto.randomUUID()}`；若操作员保存了第三方标识，MediaPublisher只替换供应方multipart中的`third_id`。我方幂等/追踪attempt identity、OperationalStore evidence与重复发布保护始终保留内部唯一值；远端订单事实仍只来自响应`order_nid/orderNid`。
- 合成multipart测试逐字段锁定`resource_id/title/content/third_id`；publisher fake同时核对完全相同的title、HTML body和attempt identity。全部使用临时Markdown与内存fetch/client，未调用真实`media/send`或产生费用。
- 最终证据：媒体专项72/72；`npm test`221文件1222/1222、0 fail/skip；Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer build2153 modules、preload231,751 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1和`git diff --check`通过。最新exe为225,485,824 bytes，2026-07-28 00:59:49。Phase 07未启动。

### 第三方标识与投稿后文章预览状态收口（2026-07-28）

- 付费媒体页新增由settings feature拥有的“第三方标识”控件，复用既有`platform-settings:get/save` Typed IPC；应用配置长期保存且可替换，最大128字符，环境变量`XQW_THIRD_ID`优先且只读。留空时继续使用每次投稿的内部唯一attempt ID。
- workspace runtime只向MediaPublisher注入只读`thirdIdProvider`。供应方请求可使用操作员标识，但内部attempt token、busy/error/finalize owner、OperationalStore evidence与审计identity均不变；没有修改OperationalStore、ContentStore、Publisher Domain/Application冻结接口或增加兼容wrapper。
- 投稿后预览只剩标题的根因是summary/detail语义在Renderer bridge被抹平：`media.scanArticles`合法不含正文，旧normalizer却补出`content:""`，重扫后覆盖已打开preview。bridge现拆分article summary与preview normalizer，media feature按同一article identity合并并保留已加载详情；文件不存在时仍关闭active article。
- RED→GREEN使用真实Renderer build、内存desktop bridge和submit计数fake：投稿后summary重扫正文保留，第三方标识读取与替换成功且`submitCalls=0`，900/1180/1280视口无横向溢出。持久化/替换、129字符拒绝、自定义/回退`third_id`及内部attempt隔离均有独立fixture。
- 完整验证：定向媒体/settings 23/23、Renderer responsive11/11；`npm test`221文件1226/1226、0 fail/skip；Auth16/16、links180/180、packaging33/33；lint、三套typecheck、format、Renderer build2154 modules、preload231,843 bytes、pack smoke、最新Renderer Electron focus1/1、packaged ASAR3/3及`git diff --check`通过。最新exe为225,485,824 bytes，2026-07-28 04:16:54。
- 全部新增测试只使用临时合成配置/fixture和内存fake，未连接真实workspace、账号、Auth数据库、内容库或`media/send`；未stage/commit/push/PR。Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。

### 付费媒体订单快照与供应商状态显示收口（2026-07-28）

- “金额为0、标题无标题”的根因不是历史客户资料不兼容，而是OperationalStore订单read model没有提交时展示事实，Renderer又把缺失金额强制显示为0。新提交现在把`titleSnapshot/filename/resourceNameSnapshot/quotedPrice`保存到既有submission item payload；订单服务按attempt identity只读关联。历史缺失值明确显示“未记录”，投稿报价不冒充最终扣款/结算金额。
- 供应商状态与内部publication状态是两个不同事实。订单页严格显示供应商闭集：`0 待安排`、`1 已安排`、`2 已发布`、`4 已退稿`、`9 售后中`；内部canonical状态只供PublicationWorkflow控制，不再进入页面分类。
- 为持久保留`0`与`1`的区别，Phase 03只窄修既有remote-order evidence projection：`reconcileRemoteOrder()`接受可选且严格验证的`remoteStatusCode`，保存进既有`payload_json`并由`listRemoteOrders()`返回。没有schema migration，没有兼容wrapper，没有修改Publisher、ContentStore或Domain/Application冻结接口；该窄修已验证完成，Phase 03恢复`COMPLETE`。
- 回归使用临时SQLite与fake supplier response：五种状态逐项通过，状态`1`同步后关闭/重开store仍为`1/已安排`，真实Renderer使用供应商分类并显示保存标题与投稿报价。任何预检和同步fixture的真实付费submit计数均为0。
- 最终证据：媒体/订单定向24/24、真实Renderer订单1/1、`npm test`221文件1230/1230、Auth16/16、links180/180、packaging33/33；lint、format、三套typecheck、Renderer build2154 modules、preload231,843 bytes、标准pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1与diff check通过。新制品`release-alpha/win-unpacked/鱼饼大王.exe`为225,485,824 bytes，2026-07-28 08:55:36。
- 未stage/commit/push/PR，未连接真实workspace、账号、供应商或付费投稿服务。Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。

### 付费媒体订单报价关联、精简展示与发布链接收口（2026-07-28）

- 新订单仍显示“未记录”的真实根因是attempt identity生成晚于submission batch创建：快照已保存标题/媒体/报价，但payload没有attemptId，订单read model无法把remote order与快照关联。现在每个command在batch创建前生成唯一attemptId，batch payload与PublicationWorkflow command共享同一值；没有用标题、文件名或资源ID做模糊关联。
- 新增真实纵向fixture：付费提交只使用临时SQLite和fake workflow，经`media submission service → OperationalStore → listOrderViews()`后标题、媒体名和`36.5`投稿报价同时可见。旧历史订单若当时没有保存快照仍明确显示“未记录”，不伪造价格。
- 订单页删除源文件、内部publication状态、内部记录ID和资源ID；只显示标题、媒体、供应商订单状态、投稿报价、订单号、必要时间与发布链接。搜索不再依赖源文件名。
- 新增`media.openPublishedUrl`精确Typed IPC command，inventory更新为129/129（56 query、68 command、5 event；media 19项）。Renderer只提交orderNid；main从当前workspace OperationalStore解析已发布订单的持久HTTPS evidence，再调用`openExternal`。未发布、缺失URL、HTTP/带凭据URL及shell失败均返回SafeOperationalError；Renderer不能提供任意URL，也没有新增通用invoke/on/channel。
- RED→GREEN覆盖报价真实链、HTTPS evidence边界、19项media contract、129项registry公共反例、media command owner及真实Renderer。页面回归确认“源文件”和“发布记录”均为0个，点击“打开发布链接”只传订单号。
- 最终门禁：媒体/Typed IPC/API surface 38/38、workspace/composition/security 46/46、真实Renderer订单1/1；`npm test`221文件1232/1232、Auth16/16、links180/180、packaging33/33；lint、format、三套typecheck、Renderer build2154 modules、preload234,062 bytes、标准pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及diff check通过。
- 新制品`release-alpha/win-unpacked/鱼饼大王.exe`为225,485,824 bytes，2026-07-28 10:31:32。全部投稿/同步测试使用fake，真实付费submit为0；未stage/commit/push/PR。Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。

### 付费媒体供应商字符串报价收口（2026-07-28）

- 新订单标题和媒体名正常而报价仍“未记录”的根因是供应商资源缓存中的`price`为数字字符串。预检会规范化它，但正式提交解析保留字符串，不可变报价快照此前只接受number，因此只丢报价；不是旧资料不兼容，也不是attempt identity再次失配。
- `resolveSubmissions`现在按既有0..100,000,000边界把合法数字字符串规范化为number；submission snapshot owner复核相同边界。非法、缺失或超限报价不转成0，历史缺失快照不使用当前资源价格倒填。
- RED→GREEN覆盖真实Typed IPC registrar提交形态和临时SQLite订单投影链。媒体/Renderer定向37/37、全仓221文件1233/1233、Auth16/16、links180/180、packaging33/33、三套typecheck、lint、format、Renderer2154 modules、preload234,062 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及diff check通过。
- 新制品`release-alpha/win-unpacked/鱼饼大王.exe`为225,485,824 bytes，2026-07-28 10:59:58。测试只使用合成资源、临时SQLite和fake workflow，真实付费submit为0；未stage/commit/push/PR，Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。

## 8. Phase 07入口

Phase 07应直接复用 SafeOperationalError闭集、`diagnosticId`与上述 workspace diagnostic codes；迁移6项Auth豁免到版本化精确contract，并删除 `authIpcError` legacy `message` envelope。不得重新引入raw错误、stack、日志、路径、Cookie、密钥或通用IPC。Phase 07在本任务中未启动。
