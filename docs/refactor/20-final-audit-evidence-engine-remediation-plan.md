# Phase 03/04/06 最终审计证据引擎整改计划

> 日期：2026-07-29 Asia/Shanghai  
> 状态：`EXECUTED`（2026-07-30），整改完成，等待最终独立只读审计。  
> 阶段约束：Phase 03、Phase 04、Phase 06继续保持`IN_PROGRESS`；Phase 07继续保持`NOT_STARTED`。  
> 前置依据：`19-final-audit-convergence-plan.md`、本轮两份独立只读审计、当前Phase 03/04/06文档、`13-progress-ledger.md`及三个handoff。

> **最终复验更正：** 自审新增导出入口内未调用arrow producer helper断链回归并RED→GREEN；最终corpus33/33、production suite33/33、`npm test`225文件1333/1333（164.262秒）。本句取代下方执行结果中的32/32、1332/1332中间统计。

> **执行结果（当前权威）：** 5个串行TDD Ticket完成；共享证据corpus32/32、production suite33/33（109 capability、21 lifecycle、5 event）、真实SQLite订单/OperationalStore31/31。完整`npm test`225文件1332/1332、Auth16/16、links180/180、packaging33/33、capacity19/19及全部typecheck/lint/format/build/pack/ASAR/preload/Electron/diff门禁通过。最新ASAR7,212,371 bytes，SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；staged=0、真实外部/付费调用0。三个整改项均为`VERIFIED`，但这不是独立审计结论；Phase03/04/06继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

## 1. 合并后的独立审计结论

当前工作树不能通过最终审计。阻断项与非阻断项如下：

| ID | 优先级 | 状态 | 结论 |
| --- | --- | --- | --- |
| `P1-CONVERGENCE-01` | P1 | `RED` | 109项production matrix与12类mutation使用两套验证路径；正式验证器仍按receiver文本取调用、未限定真实可达production export，且没有实际执行21项lifecycle与5项event的专项证据。 |
| `P2-FINAL-ORDER-01` | P2 | `RED` | canonical published订单在供应商状态由`2`变为`9`后仍保留安全URL且Renderer显示打开按钮，但main按最新supplier code拒绝并返回`MEDIA_ORDER_NOT_PUBLISHED`。 |
| `P2-CONVERGENCE-02` | P2 | `VERIFIED` | 临时SQLite supplier/canonical行为矩阵、retired owner零路径、两个owner source↔ASAR逐字节一致性均通过；不得因本轮整改恢复语法枚举。 |

因此，阶段文档中“不再使用receiver文本”“event/lifecycle已由symbol identity闭合”“最终审计收敛完成”的当前结论均不得继续作为终态事实。完成本计划前不得写“最终审计通过”。

## 2. 已确认的当前证据

- 分支/HEAD：`codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`。
- 当前non-Auth基线为109项：43 query、61 command、5 event；此数字只是启动基线，不得为维持109而保留无真实consumer能力。
- `npm test`：225个文件、1281/1281、0 fail/skip。
- Auth 16/16、capacity 19/19、Electron focus 1/1；三套typecheck、lint、format、links、packaging及`git diff --check`通过。
- 当前ASAR为7,212,213 bytes，SHA-256为`DB9DB4FC1629A59CE4534D1EC65937337B6C14D3BCB540C8CCB5FACA574C9F7F`；OperationalStore、MediaOrderService与该ASAR逐字节一致。
- staged diff为空；既有146条Phase 03/04/06 WIP必须原地保留。
- 上述GREEN不能覆盖本计划的P1假绿与订单链接行为矛盾。

## 3. P1根因：mutation与production没有共享验收语义

当前存在两条独立路径：

- production matrix调用`verifyProductionCapability()`；
- mutation corpus调用`verifySyntheticCapability()`。

`verifyProductionCapability()`仍有以下已复现缺口：

1. `consumerCalls()`用`expression.expression.getText(sourceFile)`匹配receiver文本，只要求callee与receiver各自存在某个symbol，没有比较预期feature实例的symbol identity。
2. 搜索覆盖整个source file，没有把call site限定在从Renderer入口可达的真实production export/function；dead export可提供假调用。
3. 绝大多数fixture没有`wiringSource`；当前逻辑在缺少wiring source时允许不相等的callee/feature member继续通过。
4. `consumer.kind === "lifecycle"`时没有消费`stateSource/stateRoot/stateField`，没有闭合query调用→state更新→snapshot字段→真实UI读取。
5. `consumer.kind === "event"`时跳过registrar/application检查，也没有执行producer、唯一consumer、preload listener/removeListener同一callback及feature dispose闭环。
6. synthetic verifier能够拒绝mutation，并不能证明production verifier也能拒绝。独立反例已证明：把lifecycle state evidence或event application evidence改成不存在的值，production verifier仍返回`ok:true`。

## 4. 检查点A：建立唯一证据引擎

### 4.1 先冻结production-level RED

不得先改helper再补通过测试。先新增或重写永久测试，使以下反例直接调用与109项matrix完全相同的核心验证函数，并在当前代码上稳定失败：

1. terminal method同名但receiver symbol不同；
2. receiver文本相同但来自局部shadow；
3. 同名helper位于另一函数或块作用域；
4. feature member存在，但bridge binding只在文件其他位置使用；
5. feature member与binding同名，但member body不使用该binding；
6. bridge import未传给feature factory参数；
7. props callback存在，但parent JSX wiring指向另一symbol；
8. registrar外层调用分别含channel与application调用，真实`handle/on`没有绑定该application；
9. registrar handler调用同名但不同symbol的方法；
10. event分别覆盖无producer、第二直接consumer、无dispose、错误application evidence；
11. lifecycle分别覆盖不存在的`stateSource/stateRoot/stateField`、字段未更新、snapshot字段无真实consumer；
12. call site只存在于dead export、不可达local function或未从Renderer入口到达的模块。

每个反例必须断言具体失败原因，不能只断言`ok === false`。第10、11项中的多个失败维度必须独立测试，不能用一个同时损坏全部条件的fixture掩盖漏检。

### 4.2 合并为一个核心验证函数

建立并只保留一个权威核心，例如：

```js
verifyCapabilityEvidence(context, fixture)
```

要求：

- 109项production matrix直接调用该函数；
- mutation corpus也直接调用同一个函数；
- production与memory/synthetic只允许在`Program`构造、source resolver和entry roots上不同，不得各自实现consumer/feature/event/lifecycle/registrar判断；
- 如保留`verifyProductionCapability`或`verifySyntheticCapability`名称，只能是无分支的薄适配层，并由测试证明最终调用同一核心；优先删除双轨wrapper以减少再次分叉。

### 4.3 consumer与可达性闭环

正式fixture为每项能力显式记录入口与owner，不再仅记录receiver字符串。核心必须验证：

1. Renderer production入口（当前`main.tsx`及其静态/dynamic import）可达consumer module；
2. call site位于显式记录且从入口可达的export/component/hook/function内；
3. receiver解析后的symbol与实际feature实例、hook返回值或显式props参数symbol一致；
4. callee symbol与feature public member symbol一致，或通过逐层且同symbol的JSX props wiring闭合；
5. 不得以`getText()`、terminal method name、receiver文本、文件级同名声明或“有任意symbol”代替identity比较；
6. 如果JS动态构造无法可靠静态解析，只能做最小显式binding重构或增加真实composition/runtime integration test，不得回退字符串证据。

仅“模块被import”不能证明call site可达；dead export、未调用local function与只供测试调用的production函数必须被拒绝。

### 4.4 feature→bridge→preload→registrar/application闭环

- feature public member必须通过作用域内调用图到达精确factory参数/binding。
- composition必须证明精确bridge import symbol作为实参绑定该参数；不接受同名property或文件别处出现。
- bridge export必须在其可达函数体内调用精确preload namespace/member symbol；错误receiver上的同名member必须失败。
- preload member必须证明精确channel是实际`invoke/on`调用的直接参数。
- registrar必须定位真实`ipcMain.handle/on`调用；channel是该调用直接参数，application invocation位于该调用的handler参数函数体，并解析到记录的receiver/root symbol。
- registrar/helper本身必须从production registration entry可达，dead helper不得作为证据。

### 4.5 lifecycle专项闭环

21项lifecycle query逐项验证：

```text
query capability symbol
  → feature lifecycle method的真实调用
  → 对记录state field的更新
  → getSnapshot/selector暴露同一field symbol
  → 可达View/component读取该field
```

要求：

- `stateSource/stateRoot/stateField`全部实际消费并解析symbol；
- 读取另一个同名字段、只写不读、只读fixture或dead export均失败；
- 多能力共享`refresh()`时，每项仍须证明其精确bridge binding影响对应snapshot字段，不得因refresh中存在任意query而全部通过。

### 4.6 event专项闭环

5项event逐项验证：

```text
唯一production producer
  → 精确channel send
  → preload on(channel, wrapped)
  → bridge唯一直接consumer
  → feature订阅
  → dispose使用同一channel与同一wrapped callback removeListener
```

同时验证：

- producer与registrar/application evidence字段必须实际消费；不存在的路径立即失败；
- 第二个直接bridge consumer必须失败；
- noop disposer、不同callback、不同channel或只有fixture producer必须失败；
- producer、consumer、dispose call site均须从各自production entry可达。

### 4.7 A完成门禁

- 第4.1节所有独立mutation使用唯一核心验证函数并全部GREEN；
- 当前真实inventory逐项GREEN；若发现无真实consumer capability，物理删除整条contract/preload/bridge/registrar链并如实更新数量；
- 5项event与21项lifecycle专项逐项GREEN；
- capability-specific inventory、registry、API surface、production composition及fail-closed门禁GREEN；
- 三套typecheck、lint、format与`git diff --check`通过。

## 5. 检查点B：修复订单发布链接状态矛盾

### 5.1 当前RED

使用真实临时SQLite OperationalStore复现：

1. 创建media remote order；
2. supplier observation为`2 + safe HTTPS URL`，canonical提升为`published`；
3. 随后supplier observation变为`9`；
4. canonical仍为`published`，安全URL仍存在，`hasPublishedUrl === true`；
5. 当前`openPublishedUrl()`却返回`MEDIA_ORDER_NOT_PUBLISHED`且`openExternal`调用为0。

该RED必须成为永久行为测试，不得仅用fake order array。

### 5.2 正确owner与语义

- supplier code只负责供应商当前状态展示，不是canonical published事实的授权来源；
- 打开链接必须由main根据order identity解析OperationalStore中的canonical published事实和安全持久URL；
- `9`或后续其他supplier observation不得撤销canonical published，也不得仅因最新supplier code不为`2`而使既有安全发布证据不可打开；
- Renderer继续只接收`hasPublishedUrl`和order identity，不暴露raw URL；
- `hasPublishedUrl`必须与main实际可打开条件一致，不能显示一个必然失败的按钮；
- 非canonical published、URL缺失、HTTP、带credentials/query/fragment、超长URL及未知order继续fail-closed；
- 不修改schema，不恢复canonical→supplier fallback，不新增兼容wrapper。

建议把“是否可打开”的唯一判定收敛为：canonical status为`published`且存在通过统一安全validator的持久URL。projection与command必须复用同一语义owner，避免再次漂移。

### 5.3 B行为矩阵

至少覆盖：

1. `2 + HTTPS`提升后可打开；
2. `2 + HTTPS → 9`仍显示可打开并成功调用一次`openExternal`；
3. `2 + HTTPS → 0/1/4`不撤销canonical published，行为与冻结语义一致；
4. `2`无URL不提升、按钮隐藏、打开拒绝；
5. canonical未published即使存在不可信旧URL也拒绝；
6. HTTPS credentials/query/fragment、HTTP与损坏URL按钮隐藏且main拒绝；
7. restart、backup、restore后相同行为保持；
8. supplier/canonical原矩阵继续全部GREEN。

## 6. 检查点C：制品、完整门禁与文档写回

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

- 唯一引擎mutation corpus逐项结果；
- production inventory总数及query/command/event分布；
- 21项lifecycle与5项event逐项结果；
- supplier/canonical与订单打开行为矩阵；
- capacity 19/19、13k SQLite projection；
- retired owner source/import/export/test/ASAR零路径；
- OperationalStore与MediaOrderService current source↔本轮最新ASAR逐字节一致；
- packaged preload、最新Renderer Electron focus；
- branch、HEAD、status、staged diff、ASAR/exe路径、size、time与SHA-256。

写回Phase 03/04/06文档、`13-progress-ledger.md`和三个handoff时必须：

1. 明确记录本轮production-level RED与修复后的具体失败原因；
2. 撤销或取代此前“双验证器仍声称闭合”的不实终态段落；
3. 如实记录inventory是否仍为109；
4. 将`P1-CONVERGENCE-01`与`P2-FINAL-ORDER-01`分别置为`VERIFIED`，前提是对应冻结矩阵全部通过；
5. `P2-CONVERGENCE-02`继续由行为不变量证明，不恢复syntax detector；
6. Phase 03/04/06仍保持`IN_PROGRESS`，Phase 07仍为`NOT_STARTED`。

## 7. 禁止事项

- 不reset、checkout、clean或覆盖既有WIP。
- 不stage、commit、push或创建PR。
- 不访问真实workspace、内容库、Auth数据库、账号、供应商或付费服务。
- 不执行真实投稿、订单同步、扣费或付费submit。
- 不以另一组正则、receiver文本、terminal name、source string或浅层AST替代symbol identity。
- 不让mutation继续走与production matrix不同的判断实现。
- 不为维持109这个数字增加测试专用production caller、dead export、wrapper或假consumer。
- 不新增schema v4，不恢复`reconcileRemoteOrder`或canonical→supplier fallback。
- 不自行宣布最终审计通过，不恢复阶段`COMPLETE`，不启动Phase 07。

## 8. 完成条件

以下全部成立才可结束整改线程：

1. `P1-CONVERGENCE-01`达到`VERIFIED`，且production matrix与mutation corpus直接使用同一核心引擎；
2. receiver shadow、dead export、event与lifecycle全部production-level mutation通过；
3. 当前每项保留capability都有真实可达symbol chain；
4. `P2-FINAL-ORDER-01`达到`VERIFIED`，订单按钮投影与main打开条件一致；
5. `P2-CONVERGENCE-02`既有行为矩阵与物理删除证据继续通过；
6. 本轮最新source、Renderer、preload与ASAR一致，完整门禁0 fail/skip；
7. 真实数据、外部服务、投稿、同步、扣费与付费submit调用均为0；
8. staged/commit/push/PR均为0；
9. Phase 03/04/06仍为`IN_PROGRESS`，Phase 07仍为`NOT_STARTED`。

执行线程完成后只能写：**整改完成，等待最终独立只读审计。**

## 9. 下一整改线程短Prompt

```text
在 F:/官媒投稿-refactor 原地执行
docs/refactor/20-final-audit-evidence-engine-remediation-plan.md。

保留全部既有WIP，不得reset/checkout/clean/stage/commit/push/PR，不访问真实数据、
账号、供应商或付费服务。Phase03/04/06保持IN_PROGRESS，Phase07保持NOT_STARTED。

先建立production-level RED，然后完成两项整改：
1. 删除production/mutation双轨验收，让109项矩阵与冻结mutation直接调用同一个
TypeChecker symbol-identity核心；实际闭合receiver identity、入口/调用可达性、21项
lifecycle的query→state→snapshot consumer，以及5项event的producer→唯一consumer→dispose。
2. 修复published订单在supplier 2→9后按钮可见但main拒绝打开的问题；supplier code只
展示当前供应商状态，打开权限由canonical published与安全持久URL共同决定，Renderer
仍不得获得raw URL。

完成后重跑文档第6节全部门禁、最新ASAR parity/capacity/Electron，写回Phase03/04/06、
账本与handoff。只能写“整改完成，等待最终独立只读审计”，不得自行宣布审计通过。
```
