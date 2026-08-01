# Phase 03/04/06 最终独立审计证据引擎整改计划（二）

> **2026-07-31 本轮独立审计四项最小整改（当前唯一权威）：** 唯一公开 `verifyCapabilityEvidence()` seam 新增 query 结果被 comma expression 丢弃、`void snapshot.field`伪 consumer、feature cleanup 未从 Renderer entry 调用三个永久反例；preload 新增畸形豆包/生成/文章移除事件和合法 listener 抛错回归，typed listener 与无 payload 安全诊断通道分离。production matrix 109/109、lifecycle 21/21、event 5/5，完整 `npm test` 225 文件 1413/1413，lint 与 main/renderer/bridge typecheck、`git diff --check` 通过；`format:check` 仍仅有整改前已知的 `platform.ts`、`transport.ts` 两项。`P1-CONVERGENCE-01=RED`，Phase03/04/06=`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

> **2026-07-31 最终独立审计五项P1最小整改（当前唯一权威）：** 唯一公开`verifyCapabilityEvidence()` seam新增五个永久RED→GREEN反例，覆盖跨模块未调用返回API、未渲染intrinsic JSX handler、未调用application返回成员中的send、未由真实订阅返回的consumer disposer，以及从不可达JSX实例借用lifecycle snapshot。修复仅收紧entry级callsite可达性、渲染实例、application owner返回成员、精确subscription call/disposer类型及snapshot wiring；保留真实跨模块runtime API消费，未修改production runtime、IPC合约、业务服务、package输入或制品。Phase06证据组合152/152，production matrix109/109、lifecycle21/21、event5/5；完整`npm test`225文件1408/1408，lint、三套typecheck、定向Prettier与`git diff --check`通过。`P1-CONVERGENCE-01`整改复验为`VERIFIED`，Phase03/04/06继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-31 本轮最小P1整改（当前唯一权威）：** 针对最终独立审计的三项断链反例，唯一公开`verifyCapabilityEvidence()` seam新增永久RED→GREEN覆盖：`if (1 === 2)`中的producer、Renderer consumer与disposer均不再可达；Renderer entry中未消费返回API的成员不再提供owner链路；producer entry同文件内未调用helper对返回API成员的调用不再提供producer链路。修复只收紧`tests/helpers/typescript-symbol-evidence.js`及其回归集，保留已验证的跨模块runtime API消费，不改production runtime、package输入或既有制品。109项production matrix、21项lifecycle、5项event与新增反例均通过；完整`npm test`225文件1400/1400，lint、三套typecheck、定向Prettier与`git diff --check`通过。Phase03/04/06继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 本轮最终独立审计四项P1直接整改（当前唯一权威）：** 唯一公开`verifyCapabilityEvidence()` seam新增五项永久RED→GREEN反例：producer仅在`while(false)`中调用、正确feature实例仅由dead JSX wiring提供、registration receiver以`ipcMain || fake`进入错误运行时分支、preload `removeListener`仅在静态不可达分支、feature disposer仅在静态不可达分支调用。修复后静态循环与dispose证明均按可达控制流fail-closed，composition props/context wiring只接受从记录Renderer entry可达的callsite并按Program/entry缓存，registrar逻辑回退拒绝任何可提供错误receiver的运行时分支。证据核心、109项production matrix、21项lifecycle、5项event及bridge fail-closed组合111/111，capability inventory 4/4；完整`npm test`225文件1371/1371，lint、format、三套typecheck与`git diff --check`通过。仅证据helper/test与本轮记录变化，production runtime、package input和既有制品未变；`P1-CONVERGENCE-01`整改复验为`VERIFIED`，但Phase03/04/06继续`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 最终只读审计三项P1直接整改（当前唯一权威）：** 唯一`verifyCapabilityEvidence()`新增三项永久RED→GREEN反例：Renderer owner仅经未调用entry callback、owner仅作为未消费JSX prop、producer callback仅在`if(false)`中调用。入口现在只沿确证callback契约，JSX只接受intrinsic事件或闭合到子组件真实消费的prop，callback调用证明排除静态不可达分支；React `lazy`及既有React/标准异步集合边界按TypeChecker声明闭合。证据专项66/66、matrix33/33（109 capability、21 lifecycle、5 event）、fail-closed7/7，合计106/106；完整`npm test`225文件1366/1366，lint、定向Prettier与`git diff --check`通过。仅测试证据helper/test变化，Phase03/04/06 production、package input和既有制品未变；阶段继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 本轮最终独立审计追加整改（当前唯一权威）：** 计划21执行后的再次独立审计发现三个新P1反例：未调用callback中的Renderer consumer、registration entry传入fake `ipcMain`、registration entry传入fake application均被错误接受。三项均直接使用唯一`verifyCapabilityEvidence()` seam串行RED→最小GREEN；没有第二验证器、文本兜底或production测试出口。修复将consumer callback收紧为TypeChecker symbol确认的React effect、项目`useWorkspaceScope`与标准回调契约，并将registration receiver/application从entry实际callsite传播到registrar参数。证据专项63/63，matrix33/33（109 capability、21 lifecycle、5 event），fail-closed7/7，合计103/103；完整`npm test`225文件1363/1363、Auth16/16、links180/180、packaging33/33、Phase06组合32/32，lint/三套typecheck/format/diff全绿。本轮不改production runtime/package input，不重建已有制品；制品hash继续使用计划21记录。`P1-CONVERGENCE-01`整改复验为`VERIFIED`，Phase03/04/06保持`IN_PROGRESS`、Phase07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**
>
> 日期：2026-07-30 Asia/Shanghai  
> 状态：`POST_AUDIT_TDD_REMEDIATION_COMPLETE_AWAITING_FINAL_INDEPENDENT_READ_ONLY_AUDIT`。最终独立审查发现的五项假阳性已按公开seam串行RED→GREEN修复，等待再次最终独立只读审计。  
> 阶段约束：Phase 03、Phase 04、Phase 06继续保持`IN_PROGRESS`；Phase 07继续保持`NOT_STARTED`。  
> 前置依据：`20-final-audit-evidence-engine-remediation-plan.md`、2026-07-30最终独立只读审计、当前production tree、Phase 03/04/06文档、`13-progress-ledger.md`及三个handoff。

## 1. 独立审计结论

> **执行后当前唯一权威：** 下表五项均已按本计划严格串行RED→最小GREEN并复验为`VERIFIED`；本节其余`RED`文字是启动审计历史记录。`P1-CONVERGENCE-01`、`P2-FINAL-ORDER-01`、`P2-CONVERGENCE-02`均为`VERIFIED`，但不据此自行宣布最终审计通过。

计划20不能通过最终独立审计。常规门禁、订单整改和当前制品均为GREEN，但唯一证据引擎仍能接受多类断链证据，因此`P1-CONVERGENCE-01`必须恢复为`RED`，不得继续声明最终审计收敛完成。

| ID | 优先级 | 状态 | 结论 |
| --- | --- | --- | --- |
| `P1-EVIDENCE-APPLICATION-01` | P1 | `VERIFIED` | 启动RED证明event `application`可被`ipcRenderer.invoke`、`ipcRenderer.on`或局部`console.log`冒充；GREEN后只接受从真实producer entry/owner可达的send及记录的application receiver/member symbol。 |
| `P1-EVIDENCE-PRODUCER-02` | P1 | `VERIFIED` | 启动RED证明未由production entry调用的exported/import-only producer可冒充；GREEN后producer owner必须从记录的entry实际callable-reachable。 |
| `P1-EVIDENCE-COMPOSITION-03` | P1 | `VERIFIED` | 启动RED证明comma expression中的未生效bridge occurrence可冒充；GREEN后按实际有效值闭合，comma、不确定conditional及nested unused occurrence均失败。 |
| `P1-EVIDENCE-PRELOAD-04` | P1 | `VERIFIED` | 启动RED证明fake/shadow receiver可冒充；GREEN后闭合Electron `ipcRenderer`精确invoke/on/removeListener symbol、channel及同一callback。 |
| `P1-EVIDENCE-REGISTRAR-05` | P1 | `VERIFIED` | 启动RED证明`other.handle`/shadow `ipcMain`可冒充；GREEN后从production registration entry闭合精确`ipcMain`、handle/on、channel及同handler application symbol。 |

关联状态：

- `P1-CONVERGENCE-01=RED`；
- `P2-FINAL-ORDER-01`本轮复验未发现新缺陷，继续`VERIFIED`；
- `P2-CONVERGENCE-02`本轮复验未发现新缺陷，继续`VERIFIED`；
- Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。

## 2. 已确认的审计证据

- 分支/HEAD启动基线：`codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`。
- 工作树启动状态：staged=0；既有tracked/untracked WIP必须原地保留。
- 当前inventory：109项（43 query、61 command、5 event）；该数字只是启动基线，不是必须维持的目标。
- 独立复验：完整`npm test`225文件exit 0；Auth16/16、links180/180、packaging33/33、lint、format、三套typecheck与`git diff --check`通过。
- 当前证据corpus与production suite合计66/66，但上述五类反例证明其仍存在假阳性。
- 真实临时SQLite订单/OperationalStore专项18/18；supplier `2→9`、不安全URL、restart、backup、restore行为均通过。
- 当前ASAR为7,212,371 bytes，SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；当前exe SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。
- 上述GREEN不能覆盖证据引擎接受断链fixture的P1问题。

## 3. 总体整改原则

1. 串行TDD；每个Ticket必须先在当前实现上得到可复现RED，再做最小GREEN。
2. 109项production matrix与全部mutation继续直接调用唯一`verifyCapabilityEvidence()`核心；不得恢复双验证器或旁路helper。
3. 所有跨层证据必须比较TypeChecker symbol identity及真实可达call site，不得以receiver文本、terminal name、属性路径后缀、任意symbol存在或source字符串代替。
4. entry、owner、receiver、callee、参数和返回值必须属于同一条真实production调用链；“文件被import”“函数被export”“symbol在表达式中出现”均不是充分条件。
5. 静态分析遇到无法可靠证明的动态表达式时，必须fail-closed；可以做最小production binding重构或增加真实composition/runtime integration test，不得放宽为文本证据。
6. 本轮默认只修改证据helper、fixture和测试。若必须修改production composition以获得可证明的显式binding，先记录原因、最小边界和interface影响。

## 4. Ticket 0：冻结启动现场与永久RED

### 4.1 启动记录

执行并记录：

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --stat
git diff --cached --stat
```

确认：

- 不reset、checkout、clean、stage、commit、push或创建PR；
- 不访问真实workspace、内容库、Auth数据库、账号、供应商或付费服务；
- 不执行真实投稿、订单同步、扣费或付费submit。

### 4.2 五组production-level RED

在`tests/phase-06-symbol-identity-evidence.test.js`或等价永久测试中新增独立反例；每个反例直接调用与109项matrix相同的`verifyCapabilityEvidence()`，并断言具体失败原因：

1. 真实event fixture把`application`改为Program中确实存在但无关的`ipcRenderer.invoke`；
2. 同一反例分别覆盖`ipcRenderer.on`与`console.log`，防止仅修某个名称；
3. producer正确send只存在于未被任何production entry导入/调用的exported function；
4. producer module被import，但记录producer owner没有从entry调用；
5. composition binding为`(void realBridge, fake)`；
6. composition binding为`condition ? realBridge : fake`且条件无法静态证明；
7. real bridge只出现在nested unused property、spread副作用或另一参数中；
8. preload使用`fake.invoke(channel)`；
9. preload使用局部shadow `ipcRenderer.invoke(channel)`，symbol不是Electron binding；
10. event preload使用fake receiver的`on/removeListener`，即使channel与callback一致也必须失败；
11. registrar使用`other.handle(channel, handler)`；
12. registrar使用局部shadow `ipcMain.handle(channel, handler)`；
13. channel与正确application invocation都在handler内，但registration receiver不是记录的ipcMain symbol。

不得用一个同时破坏多个维度的fixture掩盖漏检；application、producer reachability、composition、preload receiver、registrar receiver必须分别RED。

## 5. Ticket 1：闭合event producer与application

### 5.1 Fixture契约

每个event fixture显式记录并实际消费：

- producer source；
- producer production entry source；
- producer owner/export symbol；
- producer application receiver/member binding；
- 精确channel；
- 必要时记录从registration/composition root到producer owner的显式中间owner。

不得再把`application: "webContents.send"`之类文本路径作为独立充分证据。若保留该字段，只能用于定位预期symbol，最终必须与真实producer call expression解析出的receiver/member symbol相等。

### 5.2 可达性与identity

核心验证：

```text
production event entry
  → 可达producer owner
  → producer owner内可达send call
  → 精确application receiver/member symbol
  → 精确channel直接参数
```

要求：

- producer遍历根只能来自fixture记录的production entry，不得从文件全部exports起算；
- export但未被entry调用、仅import未调用、dead local/helper、未调用callback均失败；
- `applicationPathResolves()`全Program后缀扫描必须删除或改为严格symbol闭合，不得保留兜底；
- producer application必须绑定真实send call，不得由Program其他文件中的同名调用满足；
- 5项production event逐项保持GREEN。

## 6. Ticket 2：闭合composition有效值

`compositionBindsBridge()`或替代实现必须证明精确bridge export symbol是实际传给feature factory目标binding的有效运行时值。

要求：

- shorthand与直接property assignment比较最终value symbol；
- 支持可证明的局部alias链，但每层必须保持同一symbol；
- sequence/comma expression只取最终求值项，前置副作用中的symbol不得计为binding；
- conditional、logical、spread、computed property或动态table无法证明所有运行时分支都绑定同一bridge时fail-closed；
- bridge symbol仅出现在nested object、另一参数、默认值、类型位置或未执行表达式中必须失败；
- 不得继续用`walk(property, symbol === bridgeSymbol)`作为通过条件。

完成后重新运行全部query/command/lifecycle fixture，确认没有以假动态证据维持inventory。

## 7. Ticket 3：闭合preload Electron receiver

核心必须定位preload中真实Electron `ipcRenderer` binding，并验证：

- invoke capability：精确`ipcRenderer.invoke` member symbol，channel为该call的直接首参数；
- event capability：精确`ipcRenderer.on` member symbol，channel和wrapped callback为直接参数；
- disposer：同一`ipcRenderer` receiver symbol、同一channel、同一wrapped callback调用`removeListener`；
- 合法alias必须从Electron binding逐层按symbol追踪；局部shadow、fake object、同名参数或其他namespace全部失败；
- helper可达性从记录preload member开始，dead helper不得提供channel或dispose证据。

`preloadMemberEvidence()`与`preloadEventDisposes()`不得只检查method文本和“receiver有任意symbol”。

## 8. Ticket 4：闭合registrar ipcMain receiver

每个invoke/command fixture的registrar证据必须形成：

```text
production registration entry
  → 可达registrar owner/helper
  → 精确ipcMain binding
  → ipcMain.handle/on(channel, handler)
  → handler内精确application symbol invocation
```

要求：

- fixture显式记录registration entry、registrar owner及ipcMain binding来源；
- `handle/on` receiver必须解析到该精确ipcMain symbol；任意object、shadow参数或同名property失败；
- channel必须是该registration call的直接参数；
- application invocation必须位于该registration call的handler参数内，并解析到记录的application root/member symbol；
- registrar/helper必须从production registration entry callable-reachable；export本身不代表可达；
- 删除“只要rootIdentifierSymbol非空即可”的通过条件。

## 9. Ticket 5：共享核心与全inventory复验

完成Ticket 1至4后：

1. 确认production matrix与mutation corpus仍直接import并调用同一`verifyCapabilityEvidence()`；
2. 将本计划第4.2节全部反例永久纳入corpus，并逐项断言稳定失败原因；
3. 109项当前inventory逐项复验；如某项不能形成真实可达symbol chain，物理删除其contract→registrar/preload→bridge→feature链并如实更新数量；
4. 21项lifecycle与5项event逐项复验；
5. capability-specific inventory、registry、API surface、production composition、fail-closed与legacy-path absence门禁全部GREEN；
6. 检查helper中不得残留以下充分条件：
   - 全Program属性路径后缀匹配；
   - 文件全部exports作为production roots；
   - expression任意后代出现目标symbol；
   - receiver只需存在任意symbol；
   - terminal method/channel/source string单独决定通过。

## 10. Ticket 6：订单整改非回归

本轮不主动修改订单production owner。重新执行真实临时SQLite矩阵，确认：

- supplier `2 + HTTPS → 0/1/4/9`后canonical仍为`published`；
- Renderer `hasPublishedUrl`与main实际可打开条件一致；
- restart、backup、restore保持；
- 未published、URL缺失、HTTP、credentials、query、fragment、超长和损坏URL均fail-closed；
- `P2-FINAL-ORDER-01`与`P2-CONVERGENCE-02`继续`VERIFIED`；
- 不恢复canonical→supplier fallback、`reconcileRemoteOrder`、schema v4或兼容wrapper。

## 11. Ticket 7：完整门禁、制品与文档写回

### 11.1 完整门禁

在`auto—publish`执行并记录：

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

另行记录：

- 新corpus逐项名称、期望失败原因与最终数量；
- production inventory总数及query/command/event分布；
- 21项lifecycle和5项event逐项结果；
- 五类独立RED→GREEN证据；
- supplier/canonical与打开链接矩阵；
- capacity、13k SQLite projection、retired owner零路径；
- current source↔最新ASAR逐字节一致性；
- packaged preload与最新Renderer Electron focus；
- branch、HEAD、status、staged diff、ASAR/exe路径、size、time和SHA-256；
- 真实数据、外部服务、投稿、同步、扣费及付费调用数量必须为0。

### 11.2 文档写回

写回以下文档：

- `06-phase-03-publication-workflow.md`；
- `07-phase-04-platform-runtime-adapters.md`；
- `09-phase-06-renderer-ipc.md`；
- `13-progress-ledger.md`；
- `handoffs/phase-03.md`、`phase-04.md`、`phase-06.md`；
- 本计划执行结果。

写回必须：

1. 明确记录本轮五类production-level假阳性及具体反例；
2. 撤销计划20执行后`P1-CONVERGENCE-01=VERIFIED`的失效终态声明；
3. 只有本计划全部完成后才能重新写`P1-CONVERGENCE-01=VERIFIED`；
4. 如实记录最新corpus、production suite、完整测试与inventory数量，不以“更正句”长期保留互相冲突的当前权威统计；
5. Phase 03/04/06继续`IN_PROGRESS`，Phase 07继续`NOT_STARTED`；
6. 执行线程只能写“整改完成，等待最终独立只读审计”，不得自行宣布最终审计通过。

### 11.3 执行结果（当前唯一权威）

- 严格串行TDD：最终审查追加确认的五项假阳性均直接通过与109项matrix相同的公开`verifyCapabilityEvidence()` seam先RED再最小GREEN：删除缺失application owner/receiver时的文本兜底；拒绝`if(false)`producer call site；拒绝不确定conditional在两个factory实例中只闭合一个；preload必须同时闭合Electron receiver与`invoke/on/removeListener` member symbol；registrar handler未调用nested function不得提供application证据。没有第二验证器、正则/文本兜底或测试专用production export。唯一证据专项现为60/60，其中本轮新增5项永久回归；与production matrix及bridge fail-closed组合为100/100。
- production复验：inventory109/109（43 query、61 command、5 event），21/21 lifecycle、5/5 event；Phase06 capability/inventory/bridge/fail-closed/legacy组合101/101。未发现无真实consumer capability，因此未删除链路。唯一运行期production文件变化是`desktop/main.js`增加`BrowserWindow | null` JSDoc，让TypeChecker获得真实`mainWindow.webContents.send` member symbol；运行时行为不变。
- 订单复验：真实临时SQLite 34/34，supplier `2 + HTTPS → 0/1/4/9`、打开一次、restart/backup/restore及不安全URL矩阵全部通过；13k projection为query=1、SQL=1、parsedPayloads=3、orders=3、paidSendCalls=0；capacity19/19。Phase03 production默认未改。
- 第11节门禁：`npm test`225文件1360/1360、0 fail/skip；Auth16/16、links180/180、packaging33/33；lint、format、三套typecheck、Renderer build（2157 modules）、preload build与`git diff --check`通过。标准`npm run pack:smoke`已于2026-07-30 14:07+08:00原样成功，覆盖Electron下载、`electron-builder --dir`和alpha package verifier；不再以等价命令代替标准门禁。
- 最新制品：Renderer `index-DQopcXb_.js`，757,886 bytes，SHA-256 `E1B965347C5BEA36B27006555E0DCFC5E380211A6BA39D925A7516FFD204A860`；preload `build/preload/preload.cjs`，222,057 bytes，SHA-256 `3F56D207A9FB3BFB8C807CFCCA5DF3F5F57CC93B7D38DC97A128840433BFB8EC`；ASAR `release-alpha/win-unpacked/resources/app.asar`，7,212,426 bytes，2026-07-30T14:07:52.2749266+08:00，SHA-256 `71CD2F7A24CC0106D712348835B1803F943C6BB36F18E41133E025B1CA6BF073`；exe `release-alpha/win-unpacked/鱼饼大王.exe`，225,485,824 bytes，2026-07-30T14:07:52.9803709+08:00，SHA-256 `60E05AFB17FF24E541DC9AEDCB82B749D8024B15F46CF66D51688B017239AAF6`。Renderer、preload与ASAR内容hash保持稳定，新exe由本次标准pack smoke生成。
- 安全/Git：分支`codex/refactor-program`，启动HEAD `3992736d01413d83504253c7d905c21fcfe3183c`；全部既有tracked/untracked WIP原地保留，未reset/checkout/clean/stage/commit/push/PR。真实workspace、内容库、Auth数据库、账号、供应商、投稿、订单同步、扣费和付费submit调用均为0。
- 状态：五项P1 evidence ticket、`P1-CONVERGENCE-01`、`P2-FINAL-ORDER-01`、`P2-CONVERGENCE-02`均`VERIFIED`；Phase03/04/06保持`IN_PROGRESS`，Phase07保持`NOT_STARTED`。

## 12. 禁止事项

- 不reset、checkout、clean或覆盖既有WIP。
- 不stage、commit、push或创建PR。
- 不访问真实workspace、内容库、Auth数据库、账号、供应商或付费服务。
- 不执行真实投稿、订单同步、扣费或付费submit。
- 不增加第二验证器、production专用旁路或只供测试调用的production export。
- 不以正则、receiver文本、terminal name、属性路径后缀、source string或浅层AST替代symbol identity。
- 不为维持109增加dead caller、wrapper或假consumer。
- 不修改schema为v4，不恢复retired owner或canonical→supplier fallback。
- 不自行宣布最终审计通过，不恢复阶段`COMPLETE`，不启动Phase 07。

## 13. 完成条件

以下全部成立才可结束整改线程：

1. 本计划五个P1均达到`VERIFIED`；
2. 本计划第4.2节每个mutation直接使用唯一核心并全部GREEN；
3. event application与producer均从真实production entry按symbol identity闭合；
4. composition证明bridge是实际有效binding，不是表达式中任意出现；
5. preload精确闭合Electron `ipcRenderer`，registrar精确闭合真实`ipcMain`；
6. 每项保留capability都有真实可达symbol chain；
7. 21项lifecycle、5项event及当前inventory逐项通过；
8. 订单矩阵、retired owner零路径与制品parity继续通过；
9. 完整门禁0 fail/skip，最新source、Renderer、preload与ASAR一致；
10. 真实数据、外部/付费调用、stage、commit、push和PR均为0；
11. Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。

执行完成后只能写：**整改完成，等待最终独立只读审计。**

## 14. 下一执行线程Prompt

```text
在 F:/官媒投稿-refactor 原地执行
docs/refactor/21-final-independent-audit-evidence-engine-remediation-plan.md。

保留全部既有WIP，不得reset/checkout/clean/stage/commit/push/PR；不得访问真实
workspace、内容库、Auth数据库、账号、供应商或付费服务；不得执行真实投稿、
订单同步、扣费或付费submit。Phase03/04/06保持IN_PROGRESS，Phase07保持
NOT_STARTED。

严格串行TDD，先用与109项production matrix完全相同的
verifyCapabilityEvidence()冻结五类RED，再做最小GREEN：
1. event application不能再全Program按属性路径后缀匹配，必须绑定真实producer
   entry、owner、send call和application receiver/member symbol；未被production entry
   调用的exported producer必须失败。
2. composition必须证明bridge export是feature factory目标binding的实际有效值；
   (void realBridge, fake)、不确定conditional、nested unused occurrence均必须失败。
3. preload必须闭合Electron ipcRenderer的精确invoke/on/removeListener symbol、channel
   和同一callback；fake receiver与shadow ipcRenderer必须失败。
4. registrar必须从production registration entry闭合精确ipcMain symbol、handle/on、
   channel和handler内application symbol；other.handle与shadow ipcMain必须失败。

不得新增第二验证器、文本/正则兜底、测试专用production caller或dead wrapper。
完成后逐项复验当前inventory、21项lifecycle、5项event及全部新增mutation；如发现
无真实consumer capability，物理删除整链并如实更新数量。订单production默认不改，
但必须重跑supplier/canonical、打开链接、restart/backup/restore与不安全URL矩阵。

最后执行计划第11节全部门禁，重建并核对最新Renderer/preload/ASAR，写回
Phase03/04/06、进度账本、三个handoff及本计划。只能写“整改完成，等待最终独立
只读审计”，不得自行宣布审计通过。
```

整改完成，等待最终独立只读审计。
