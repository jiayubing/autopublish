# Phase 03/04/06 最终审计收敛执行计划

> 日期：2026-07-29 Asia/Shanghai  
> 状态：`READY`，供下一整改线程执行。本文不是完成证明。  
> 阶段约束：Phase 03、Phase 04、Phase 06保持`IN_PROGRESS`；Phase 07保持`NOT_STARTED`。  
> 前置依据：`15-phase-06-code-audit.md`、`16-phase-06-final-audit-remediation-plan.md`、`17-phase-06-independent-audit-followup-remediation-plan.md`、`18-phase-03-final-audit-remediation-plan.md`、当前阶段文档、账本与handoff。

## 1. 为什么审计反复出现新问题

前几轮同时包含两类问题：

1. **production correctness问题**：例如OperationalStore曾允许错误`batchItemId`把另一稿件或另一batch的display snapshot写入当前订单。这类问题会改变真实业务状态，必须由production owner修复。
2. **acceptance evidence问题**：例如用字符串、正则或浅层AST按名字证明caller、feature binding、registrar或fallback不存在。这类门禁即使为GREEN，也可能被同名变量、作用域遮蔽、假receiver、外层CallExpression或另一种语法误导。

反复整改的主要原因是第二类：每次只给启发式检测器补一个反例，下一轮更强的反例又能绕过。测试名称声称“真实调用链”或“所有mapping shape”，实际只证明了若干文本形态。

本计划的目标不是继续扩充正则，而是把验收方式改成**符号身份与行为不变量**，冻结一次最终验收口径。

## 2. 当前独立审计结论

### 2.1 已验证的production修复

- OperationalStore schema仍为v3；`order_display_snapshots`、`listOrderDisplayViews()`、`recordRemoteOrderObservation()`事实不变。
- media submission item以durable `attemptId`绑定正式attempt；跨article/target以及同article/target跨batch均以`OPERATIONAL_BATCH_ITEM_MISMATCH`事务回滚。
- `reconcileRemoteOrder`、canonical publication status→supplier code旧fallback、旧submission/jobs/media preflight路径均已从当前source与最新ASAR物理删除。
- 当前canonical non-Auth inventory为109（43 query、61 command、5 event）；`media.removeDraft`没有恢复。

### 2.2 仍阻止最终通过的证据问题

#### `P1-CONVERGENCE-01`：109项caller证据仍可误绿

当前自制AST helper仍可被以下断链反例绕过：

- 无关对象只要使用fixture记录的receiver名称，即可满足`receiver.method`。
- `localDeclarations()`按全文件同名声明扩展，不解析作用域与symbol identity；另一作用域的同名helper可闭合错误链。
- `featureMethod === binding`时存在无需证明member调用bridge的shortcut。
- registrar可从一个外层CallExpression的两个独立嵌套调用分别收集channel与application property。

因此当前109/109只可视为整改基线，不能作为最终`VERIFIED`证据。

#### `P2-CONVERGENCE-02`：fallback syntax detector不是终态证明

当前AST detector已覆盖直接if/ternary、switch和直接变量object map，但仍可能漏掉：

- `Object.freeze({...})[publication.status]`
- inline object map
- `Map`、helper lookup或逻辑表达式
- 未来任何语义相同但语法不同的实现

当前production与ASAR中没有发现实际fallback；阻断点是“永久零路径”门禁仍依赖枚举语法。

## 3. 本轮冻结的验收原则

本节在执行开始后不得临时降低，也不得用另一组启发式名字扫描替代。

1. **production行为由行为测试证明**；不得以源码文本替代可执行的不变量。
2. **跨文件调用链由TypeScript compiler symbol identity证明**；不得以terminal method name、receiver文本、`endsWith`或全文件同名声明证明。
3. **物理删除由source/export/import graph/packaged ASAR证明**；不得保留wrapper、re-export或测试专用production caller。
4. **制品事实由本轮最新pack smoke证明**；旧ASAR的GREEN结果不得复用。
5. **验收语料在第4节冻结**；最终审计仍可报告新的真实correctness/security问题，但不得因“还能想象另一种源码写法”否定已经由syntax-independent行为不变量证明的结论。
6. 不以“理论上永远不可能再发现问题”为完成条件。完成条件是：冻结语料全绿、当前production不变量全绿、完整门禁全绿、最终只读审计无P0/P1。

## 4. 冻结的对抗语料

### 4.1 Capability/caller mutation corpus

最终证据工具必须拒绝以下全部synthetic mutation：

1. terminal method同名但receiver不同；
2. receiver文本相同但symbol来自无关局部变量；
3. 同名helper位于另一函数或块作用域；
4. feature public member存在，但bridge binding只在文件其他位置出现；
5. feature method与binding同名，但method body不使用该binding；
6. bridge symbol被import但未传入feature factory；
7. props callback存在但parent wiring指向另一函数；
8. registrar外层调用分别包含channel与application property，而真正`ipcMain.handle/on`未绑定application method；
9. registrar handler调用同名但不同symbol的方法；
10. event consumer未dispose、存在第二直接consumer或没有真实producer；
11. lifecycle query被调用但snapshot字段没有production consumer；
12. source文件可达，但目标call site位于不可达函数/死export。

每条mutation必须先在旧证据工具上形成RED或明确记录旧工具为何误绿，再由新工具转为GREEN。

### 4.2 Supplier/canonical behavior corpus

必须用真实临时SQLite OperationalStore执行以下矩阵，而不是解析实现语法：

1. canonical `submitted/published/failed/uncertain`各自存在remote order，但没有supplier observation时，supplier status均为空/unknown；
2. supplier observation `0/1/2/4/9`只来自正式supplier response owner；
3. `2 + 安全HTTPS evidence`仅可提升允许的进行中canonical状态；
4. `2`无evidence不得提升；
5. `9`或其他observation不得撤销canonical published；
6. restart、backup、restore后supplier observation保持不变；
7. source与ASAR中`reconcileRemoteOrder`、旧fallback owner和等价wrapper均为零；
8. packaged OperationalStore与MediaOrderService必须与当前production source逐字节一致。

只要第1项行为矩阵覆盖全部canonical状态，fallback使用ternary、switch、Map、freeze、helper或其他语法都会通过真实输出被发现；不再要求维护“所有可能语法”的detector。

## 5. 检查点A：用symbol identity重建109项证据

### 5.1 工具要求

使用项目现有TypeScript compiler创建`Program`和`TypeChecker`，包含实际Renderer `.ts/.tsx/.js`入口与依赖。最终证据必须记录并验证：

- consumer call expression解析后的callee symbol；
- receiver symbol的声明来源；
- feature public member symbol；
- feature factory参数与bridge import symbol之间的真实argument/parameter binding；
- bridge export与preload member/channel；
- registrar必须定位真正的`ipcMain.handle/on`调用，channel必须是该调用的直接参数，application invocation必须位于该调用的handler参数函数体；
- props callback必须通过显式parent JSX wiring逐层闭合；
- event必须闭合producer、唯一consumer和dispose；
- lifecycle必须闭合调用、state更新和真实snapshot字段consumer。

禁止：

- terminal name匹配；
- receiver字符串匹配；
- 全文件同名声明搜索；
- `.endsWith(application)`；
- 从owner/root自动生成fixture；
- `source.includes()`或为测试加入production caller。

### 5.2 实施建议

优先建立独立测试工具模块，而不是继续增长单个matrix测试文件。每个fixture保留显式capability与预期source/call-site记录；工具返回解析后的symbol path和失败原因，便于最终审计复核。

如果JS动态结构无法由TypeChecker可靠解析，必须二选一：

1. 在production中做不改变业务语义的显式静态binding重构；或
2. 为该条能力增加真实composition/runtime integration test。

不得退回字符串证据。

### 5.3 A完成门禁

- 第4.1节12类mutation全部GREEN；
- 109/109逐项symbol chain GREEN；
- 5个event与21个lifecycle query专项GREEN；
- capability-specific inventory、registry、API surface、production composition GREEN；
- 三套typecheck、lint、format、`git diff --check`通过。

## 6. 检查点B：用行为不变量替换fallback语法枚举

### 6.1 正确owner

- supplier response解析owner：`desktop/services/media-order-service.js`；
- supplier observation持久化与order projection owner：OperationalStore；
- canonical publication status不得作为supplier status的输入源。

### 6.2 实施要求

1. 建立第4.2节完整临时SQLite行为矩阵。
2. 保留source/export/import graph与ASAR物理删除断言。
3. 保留两个order owner的current source↔packaged ASAR exact parity。
4. 现有syntax detector可删除，或降级为非权威辅助检查；不得继续宣称它覆盖所有mapping shape。
5. 不新增schema v4，不恢复`reconcileRemoteOrder`或任何fallback wrapper。

### 6.3 B完成门禁

- supplier/canonical行为矩阵全部GREEN；
- source/import/export/test/ASAR旧路径为零；
- Phase03 order/workflow/migration/backup/restore/fault专项通过；
- capacity19/19；
- 三套typecheck、lint、format、packaging与`git diff --check`通过。

## 7. 检查点C：最终完整门禁与一次性审计

在`auto—publish`执行：

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

另行执行并记录：

- 第4.1节完整mutation corpus；
- 109项symbol identity matrix；
- 第4.2节supplier/canonical行为矩阵；
- Phase03扩展与schema v3 migration/backup/restore/fault；
- capacity19/19及13k SQLite projection；
- source/import/export/test/ASAR零路径；
- packaged preload；
- 基于本轮最新Renderer与pack smoke的显式Electron focus；
- branch、HEAD、status、staged diff、artifact path/size/time/hash。

最终独立只读审计只做一次终态判定：

- 若发现真实P0/P1 correctness/security问题，整改继续；
- 若冻结mutation或行为矩阵失败，整改继续；
- 若仅提出已经被syntax-independent行为测试覆盖的另一种假想源码写法，不重新开启语法枚举；
- 无P0/P1且全部冻结门禁通过时，可建议恢复阶段状态，但执行线程本身仍不得自行恢复`COMPLETE`。

## 8. 完成条件与明确终点

以下条件全部成立即达到本整改线程的终点：

1. `P1-CONVERGENCE-01`与`P2-CONVERGENCE-02`为`VERIFIED`；
2. 109项由symbol identity或真实runtime integration证明，不再依赖名字启发式；
3. supplier/canonical隔离由完整行为矩阵证明，不再依赖语法穷举；
4. 第4节冻结对抗语料全部通过；
5. 当前source与本轮最新ASAR一致；
6. 完整门禁全部通过且0 fail/skip；
7. 最终独立只读审计无P0/P1；
8. 真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费与付费submit调用均为0；
9. 未stage、commit、push或创建PR；
10. Phase03/04/06仍由执行线程保持`IN_PROGRESS`，Phase07仍为`NOT_STARTED`。

执行线程完成后只能写：**整改完成，等待最终独立只读审计。**

## 9. 禁止事项

- 不使用`code-review`技能。
- 不reset、checkout、clean或覆盖既有WIP。
- 不访问真实workspace、内容库、Auth数据库、账号、供应商或付费服务。
- 不执行真实投稿、同步、扣费或付费submit。
- 不stage、commit、push或创建PR。
- 不新增兼容wrapper、测试专用production caller、源码字符串白名单或owner/root自动生成fixture。
- 不启动Phase07。

## 10. 下一执行线程Prompt

```text
在 F:/官媒投稿-refactor 原地执行最终审计收敛整改。

完整读取并严格执行 docs/refactor/19-final-audit-convergence-plan.md，连同其引用的
15/16/17/18计划、当前Phase03/04/06文档、13-progress-ledger及三个handoff。

先执行Git启动门禁，保留全部既有Phase03/04/06 WIP；不得reset、checkout、clean、
stage、commit、push或创建PR。Phase03/04/06保持IN_PROGRESS，Phase07保持NOT_STARTED。
不要使用code-review技能，不访问任何真实workspace、内容库、Auth数据库、账号、供应商
或付费服务，不执行真实投稿、同步、扣费或付费submit。

严格串行完成：
A. 用TypeScript Program/TypeChecker symbol identity重建109项consumer→feature→bridge→
   preload→registrar/application证据，先固化第4.1节12类mutation RED；不得继续按名字、
   receiver文本、全文件同名声明或endsWith匹配。
B. 用第4.2节临时SQLite行为矩阵证明canonical status绝不回填supplier status；保留
   source/import/export/test/ASAR物理删除与两个order owner exact parity，不再枚举所有语法。
C. 重跑第7节全部当前工作树门禁、capacity、最新ASAR与显式Electron focus。

把每项RED、正确owner、修改/删除、schema/interface判断、测试和下一动作写回Phase03/04/06
文档、账本与handoff。完成后只写“整改完成，等待最终独立只读审计”，不得自行恢复阶段
COMPLETE或开始Phase07。
```
