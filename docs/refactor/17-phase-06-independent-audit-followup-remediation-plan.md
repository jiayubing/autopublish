# Phase 03/04/06 最终独立审计后续整改计划

> 日期：2026-07-29 Asia/Shanghai  
> 状态：`REMEDIATED_AWAITING_INDEPENDENT_AUDIT`；Phase 03、Phase 04、Phase 06 必须保持 `IN_PROGRESS`，Phase 07 必须保持 `NOT_STARTED`。  
> 依据：`15-phase-06-code-audit.md`、`16-phase-06-final-audit-remediation-plan.md`、当前 Phase 03/04/06 阶段文档、进度账本、handoff、当前代码、当前 Git 差异，以及 2026-07-29 最终独立只读审计。  
> 边界：本文只定义整改和验收，不代表整改已完成。本次创建本文不修改 production code 或状态账本。

> 2026-07-29 执行终态：后续 P2-09 独立证据整改已完成。RED 证明 `media.removeDraft` 无 production consumer 后全链物理删除；inventory 从 110 更正为 109（43 query、61 command、5 event）。109/109 均记录并由 AST 验证真实可达 consumer、feature public method/lifecycle、bridge、preload、registrar/application；21 lifecycle query 有 snapshot consumer，4 props 链有 wiring，5 event 有 producer/唯一 consumer/dispose。完整 `npm test` 222 文件 1255/1255、其余门禁与新制品全绿，真实投稿/同步/付费 submit 为 0。本文不自行将阶段恢复为 `COMPLETE`；**整改完成，等待最终独立只读审计。**

## 1. 最终独立审计结论

上一轮整改记录的 17 项 finding 中，16 项仍有充分的代码与测试证据；`P2-09 production caller traceability` 的最终证据不足，必须重新打开。独立审计另发现两个未包含在原 17 项编号中的完成阻断：

| ID | 优先级 | 当前状态 | 阻断事实 |
| --- | --- | --- | --- |
| `P1-AUDIT-01` | P1 | `OPEN` | `media.ts`、`platform.ts`、`settings.ts` 等 production bridge 在 Electron、namespace、capability 或 result 缺失时仍返回空数组、空分页、`false`、`null` 或直接成功返回，边界故障被伪装成业务成功。 |
| `P2-09` | P2 | `REOPENED` | 110 项 Typed IPC inventory 使用按 owner/root 批量生成的通用 caller trace，并主要以 `source.includes()` 证明字符串存在；105 项 invoke 能力没有逐项证明具体 View 调用、feature public method、bridge binding 和 registrar application capability。 |
| `P2-AUDIT-02` | P2 | `OPEN` | 四个无已知 production caller 的 legacy 文件仍位于 production tree 并进入 packaged ASAR，其中包含旧 ledger/submission 协调或 legacy media preflight fallback。 |

因此：

- Phase 03、Phase 04、Phase 06 继续为 `IN_PROGRESS`。
- Phase 07 继续为 `NOT_STARTED`。
- 既有完整门禁的绿色结果只作为整改前基线；任何 production 修改后必须全部重跑，不能沿用为最终终态。
- 在三个阻断全部 `VERIFIED`、17/17 原 finding 重新核验、真实 production inventory 完整且最终门禁全绿之前，不得建议恢复 `COMPLETE`。

## 2. 当前可复核证据

### 2.1 Git 与历史门禁基线

- 分支：`codex/refactor-program`。
- HEAD：`3992736d01413d83504253c7d905c21fcfe3183c`。
- staged diff：空。
- 工作树包含已有 Phase 03/04/06 审计整改 WIP；不得 reset、checkout、clean、覆盖或把这些改动误判为可删除的无关文件。
- 最近一次完整记录：`npm test` 221 文件、1247/1247、0 fail、0 skip；Auth 16/16；links 180/180；packaging 33/33；lint、三套 typecheck、format、Renderer build、pack smoke、packaged ASAR、Electron focus 和 `git diff --check` 均通过；真实投稿与付费 submit 调用为 0。
- 上述结果不是整改后的最终证据。任何代码或测试变化后必须生成新的时间、数量、制品和工作树终态。

### 2.2 `P1-AUDIT-01` 代码证据

当前 production bridge 至少包含以下 synthetic success：

- `media-workbench/src/bridge/media.ts`
  - `scanArticles()`、`getDrafts()`、`getOrders()` 返回 `[]`；
  - `getResourcePage()`、`searchResourcePage()` 返回空分页；
  - `syncOrder()` 返回 `null`；
  - `setDraft()`、`removeDraft()`、`refreshResources()`、`addToPool()`、`removeFromPool()` 在 capability 缺失时直接返回成功。
- `media-workbench/src/bridge/platform.ts`
  - `checkPlatformLogin()` 返回 `false`；
  - `openPlatformLogin()`、`pausePlatformSubmit()`、`stopPlatformSubmit()` 直接返回；
  - `onPlatformState()` 返回 noop unsubscribe。
- `media-workbench/src/bridge/settings.ts`
  - `getStorageUsage()` 在非 Electron 环境返回 `null`。

这些返回值已可由独立内存 harness 真实复现。它们违反 Phase 06 typed boundary fail-closed 原则，也与 `P1-07` 已记录的 content bridge 结论不一致。

### 2.3 `P2-09` 代码证据

- 当前 registry/inventory 为 110 项：43 query、62 command、5 event。
- `tests/fixtures/phase-06-production-ipc-contract-fixtures.js` 的 `productionCallerTrace()` 按 capability root 把能力批量映射到少数通用 View、feature 和 bridge。
- 当前 110 项仅形成约 9 组唯一 View file/symbol 和约 9 组 feature file/symbol；同一 hook 在文件中出现并不等于每个 capability 均有真实调用。
- `tests/phase-06-production-ipc-fixture-matrix.test.js` 主要使用 `existsSync()`、`source.includes()` 和宽泛正则证明 symbol/channel 字符串存在，不能证明 capability-specific import、调用表达式、adapter binding 或 application registrar。
- 5 项 event 的唯一 consumer 与 `removeListener` dispose 检查较完整；105 项 invoke 链仍需逐项重建证据。

### 2.4 `P2-AUDIT-02` 代码与制品证据

最新 packaged ASAR 清点仍包含：

- `src/core/jobs.js`
- `desktop/services/submission/submission-preparation.js`
- `desktop/services/submission/submission-query.js`
- `src/platforms/media/preflight.js`

前三项仍含 legacy ledger/submission 协调或写回逻辑；`preflight.js` 仍接受单个 `resourceId/resourceName` 的 legacy fallback。静态搜索没有找到可信 production caller，但这些文件位于 production tree，且 `src/**/*` / desktop production 文件会被打包。无 caller 不能代替物理删除。

## 3. 启动门禁与权限边界

整改任务开始时先执行并记录：

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --name-only
git diff --cached --name-only
git log --oneline -5
```

必须遵守：

1. 完整读取本文、`15-phase-06-code-audit.md`、`16-phase-06-final-audit-remediation-plan.md`、Phase 03/04/06 阶段文档、`13-progress-ledger.md` 和三个 handoff。
2. 不使用 `code-review` 技能；直接依据当前代码、Git 差异、production composition 和真实执行结果判断。
3. 不读取或采用旧 `auto—publish/docs/` 补全规范。
4. 不启动 Phase 07，不迁移 Auth；Auth 仍仅允许 5 invoke + 1 event 的显式豁免。
5. 不连接真实 workspace、内容库、Auth 数据库、账号、供应商或付费服务；不执行真实投稿、同步或扣费。
6. 不 stage、commit、push 或创建 PR。
7. 允许为本文三个阻断修改 production code、测试和 Phase 03/04/06 文档/账本/handoff；不得扩大为普通功能开发。
8. 若发现当前分支、HEAD、staged diff 或既有 WIP 与本文基线无法解释，停止并报告，不得清理工作树。

## 4. 状态账本与 RED→GREEN 规则

三个阻断统一使用：

- `OPEN`：尚未建立当前工作树 RED。
- `RED_REPRODUCED`：通过 production-level test 或最小 harness 证明。
- `FIXED`：production 实现和旧路径删除已完成，尚未跑完适用门禁。
- `VERIFIED`：定向测试、静态/制品删除断言、三套 typecheck 和适用全局门禁均通过。

每次状态变化必须记录：

- RED 测试/harness 与失败断言；
- 正确 owner、是否触及冻结 interface；
- 修改和删除的文件/symbol；
- production composition 证据；
- 定向测试和三套 typecheck 结果；
- 真实外部/付费 submit 调用数。

不得通过修改断言、扩大 allowlist、返回空值、catch-all、兼容 wrapper、源码字符串白名单或只从 UI 隐藏旧路径来转绿。

## 5. 检查点 A：所有 production bridge fail-closed

Owner：Phase 06 Renderer bridge/feature boundary。除非 RED 证明 application contract 本身错误，不重开 Domain/Application 或 Phase 01。

### A1. 先写 production-level RED

建立表驱动行为测试，至少逐项覆盖：

1. 非 Electron 环境。
2. `window.desktopConsole` 缺失。
3. 对应 namespace 缺失。
4. 具体 query/command/event capability 缺失。
5. query 成功 envelope 的 `data` 缺失或为 `null`。
6. event capability 缺失时订阅失败，而不是返回可调用 noop。

RED 必须真实断言当前返回了 `[]`、空分页、`false`、`null` 或 resolved `void`，不能只搜索源码字符串。

### A2. Production 修复

- 为 media/platform/settings bridge 使用同一个稳定 fail-closed helper或等价明确实现。
- transport、namespace、capability、result 缺失统一抛 Renderer 可消费的稳定 `OperationalError`；错误不得包含路径、stack、URL、Cookie、正文或原始 payload。
- command 缺失不能 resolve 成功；event 缺失不能返回 noop unsubscribe。
- 浏览器 story、Renderer harness 和测试所需数据必须通过显式 mock adapter/feature dependency 注入，不得保留在 production bridge。
- 核对其他 production bridge；同类 fallback 必须一并清除，不能只修审计点名的三个文件。

### A3. A 完成条件

- query、command、event 的缺失路径均由行为测试证明 fail-closed。
- production bridge 不再包含 synthetic business success；显式 mock 只存在测试/fixture 路径。
- 不产生 `unhandledrejection`；feature snapshot 或明确 Promise caller 继续拥有错误展示。
- 运行 bridge/media/platform/settings 定向测试、三套 typecheck、lint、format 和 `git diff --check`。
- 写回 `P1-AUDIT-01` 状态；重新核验原 `P1-07` 结论覆盖全部 production bridge，而不只 content bridge。

## 6. 检查点 B：逐 capability 真实 Typed IPC inventory

Owner：Phase 06 Typed IPC、feature composition 和 test evidence。inventory 数量由真实生产调用图决定，不以 110 为目标。

### B1. 删除通用 caller 证明

- 移除 `productionCallerTrace(entry)` 按 root/owner 自动套用通用 View/feature 的做法。
- 每项 fixture 显式记录 capability-specific trace；不得只引用共享 hook 名称来代表该 hook 内全部 command。
- 不再用 `source.includes()`、文件存在或“同文件中出现过 symbol”作为 invoke 调用链的充分证据。

### B2. 每项 inventory 的强制字段

每个仍保留的 capability 至少记录并验证：

1. capability、channel、kind、owner。
2. request/result/error/event validator 与独立合法 fixture。
3. 真实 View 文件、导入 symbol、具体调用 symbol或 JSX binding；若无 View，必须记录并证明其 production root/bootstrap consumer。
4. feature public method、adapter binding 和 bridge import/call expression。
5. bridge export 与固定 preload namespace/method。
6. preload method 到精确 channel 的绑定。
7. registrar 文件、handler symbol 与实际 application/service capability。
8. event producer、唯一直接 consumer、subscribe path 和 dispose/removeListener。

### B3. 验证方式

- 优先使用 TypeScript/JavaScript AST 或等价结构化模块解析验证 import、member call、object binding 和 export；禁止仅靠宽泛字符串包含关系。
- 至少对 workspace、settings、media、platform、content、attention、generation 各做一条真实模块 composition 纵向执行；高风险 destructive、event、diagnostic、order open 必须保留独立纵向测试。
- 验证 production root 实际挂载 provider/hook/feature，而不只验证测试 fixture 可以手工构造。
- 对 event 继续验证唯一 consumer、producer、订阅和 dispose。

### B4. 无 consumer 能力的处理

- 若产品无需该能力：从 contract、registry、registrar、preload、bridge、feature、fixture、测试和文档全链物理删除。
- 若产品确需该能力：补真实 View/root consumer、feature public method、完整 binding 和纵向 composition test。
- 不得创建隐藏 View、测试专用 caller 或无行为 wrapper 只为维持 inventory 数字。

### B5. B 完成条件

- 每项 inventory 都有 capability-specific 结构化调用链证据。
- 真实 capability 数量、owner 分布、Auth 六项豁免与 Git 差异一致。
- invoke 与 event 均可追到 production composition；event dispose 全部闭合。
- `P2-09` 从 `REOPENED` 经真实 RED→GREEN 后才可重新标记 `VERIFIED`。
- 运行 inventory/registry/API surface/production composition 定向测试、packaging registry require、三套 typecheck、lint、format 和 `git diff --check`。

## 7. 检查点 C：legacy source 与 packaged ASAR 物理删除

Owner：

- `src/core/jobs.js`、`desktop/services/submission/submission-preparation.js`、`desktop/services/submission/submission-query.js` 归 Phase 03 publication/submission cutover。
- `src/platforms/media/preflight.js` 归 Phase 04 media adapter boundary。
- Phase 06 负责证明 Renderer/Typed IPC 没有依赖这些旧能力，并更新 packaging 证据。

### C1. 删除前 RED

新增 source-tree 与 packaged-ASAR 双重回归：

- 四个精确路径在 production tree 中必须不存在。
- 打包配置不得以复制、改名或 glob 重新带入等价 legacy 文件。
- `app.asar` 清单中四个路径必须为零。
- production import/require graph 对这些路径及其导出 symbol 必须为零。

测试应先在当前工作树和当前制品上失败，证明不是事后编写的假绿断言。

### C2. 删除实施

1. 逐文件确认无真实 production caller；区分 dead definition、测试资产和一次性迁移资产。
2. 无 caller 时直接物理删除 production 文件，不迁移到另一个 production 目录，不留 re-export 或兼容 wrapper。
3. 若仍有 caller，先把 caller 切到 Phase 03/04 当前 canonical owner，再删除旧文件。
4. 测试仍需旧格式 fixture 时，改成纯数据 fixture或测试 helper；不得保留可写 production implementation。
5. 删除 legacy `resourceId/resourceName` 单资源 fallback；正式 media preflight 只接受当前 canonical selected-resources shape。

### C3. 扩展零路径清单

同时重新扫描并证明以下旧类路径为零：

- JSONL order/publication/batch writer 或 reader fallback；
- raw order URL/内部 workflow DTO；
- bridge synthetic fallback/noop event；
- supplier price 下游重复转换；
- canonical status → supplier status fallback；
- dead capability、无 consumer event、重复 provider；
- legacy publication ledger/submission coordination 和未读取 flag。

### C4. C 完成条件

- 四个点名文件从 source tree 和 packaged ASAR 物理消失。
- production/test/package 配置中无等价旧实现或重新导出。
- Phase 03/04 阶段文档、账本与 handoff 记录删除 owner、冻结 interface 是否变化和对应 RED→GREEN。
- 运行 Phase 03 publication/submission、Phase 04 media adapter、packaging、pack smoke、packaged ASAR、三套 typecheck 和 `git diff --check`。

## 8. 冻结 interface 与阶段写回规则

- bridge fail-closed 与 caller inventory 应留在 Phase 06，不得为迁就测试修改 Domain/Application interface。
- legacy submission 文件删除属于 Phase 03 既有单 writer/cutover 范围；legacy media preflight 删除属于 Phase 04 既有 adapter boundary。
- 若删除前发现仍有 production caller，先记录当前调用链和 owner。只有 canonical owner 的现有 interface 无法承载且 RED 证明 interface 错误时，才窄范围重开对应阶段。
- 每次重开必须同时更新阶段文档、`13-progress-ledger.md` 和 handoff，明确：原因、允许修改、冻结 interface 是否变化、测试与恢复条件。
- 不允许在 Phase 06 bridge 或 View 增加 compatibility wrapper 绕过 Phase 03/04 owner 缺口。
- A/B/C 检查点写回必须与当前代码、`git diff --name-only`、删除清单和真实测试输出一致；旧数字保留为历史记录时必须标明日期和已失效原因。

## 9. 最终 17 项与新增阻断复核

完成 A/B/C 后，重新逐项列出原 17 个 finding 的最终判定：

- `P1-01` 至 `P1-07`
- `P2-08` 至 `P2-15`
- `P3-16`、`P3-17`

每项必须包含：最终状态、production code 证据、RED→GREEN 测试、owner/interface 判断、旧路径删除和适用门禁。`P2-09` 必须使用本计划的新 inventory 证据，不能复用旧 `source.includes()` 结论。

另列：

- `P1-AUDIT-01` production bridge fail-closed。
- `P2-AUDIT-02` legacy source/ASAR 物理删除。

任何一项证据不足、仅有测试 fixture/源码字符串而无 production composition、或旧路径仍存在，都必须保持 RED，Phase 03/04/06 继续 `IN_PROGRESS`。

## 10. 最终完整门禁

三个检查点均达到 `VERIFIED` 后，在 `auto—publish` 执行并记录当前工作树的真实终态：

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

还必须执行并记录：

1. 新的 capability-specific Typed IPC inventory、registry、API surface 和 production composition tests。
2. production bridge fail-closed 行为测试，覆盖 query/command/event 和显式 mock adapter。
3. workspace/platform delayed/malformed event、diagnostic sink、subscribe/dispose。
4. Auth 5 invoke + 1 event 豁免精确清单；未登记非 Auth registrar fail-closed。
5. SafeOperationalError 敏感语义反例和稳定 diagnostic ID。
6. ConfirmationHost FIFO/scope/focus/exactly-once 与 destructive identity。
7. supplier/order/price/SQLite fault injection、有界 order projection 和真实时间语义。
8. 1k、10k、13k、20k main/Renderer 请求数、payload bytes、heap 和延迟；第 20,001 项显式 truncated。
9. source tree legacy path 零断言、packaged ASAR 四路径零断言、production import graph 零引用。
10. packaged ASAR production preload tests，且使用本轮新制品。
11. Electron focus test必须在本轮最新 Renderer build 和 pack smoke 后运行，不能计入默认 skip。
12. 最终 `git status --short --untracked-files=all`、staged diff 为空、`git diff --check` 通过。

必须记录实际测试文件数、pass/fail/skip、运行时间、fixture 类型、制品路径/时间、inventory 数量和 owner 分布。任何失败都必须解释并整改；不得以“与本 finding 无关”忽略。

所有投稿、订单同步、供应商状态和容量测试必须使用 fake client、临时 SQLite、VM、内存 adapter、合成 workspace/resource 或本地 Electron。每一类 mutation 测试均应断言真实外部/付费 submit 调用为 0；总终态也必须明确记录为 0。

## 11. 完成与交接条件

只有以下条件全部满足，才可请求下一轮独立只读审计：

1. `P1-AUDIT-01`、`P2-09`、`P2-AUDIT-02` 全部 `VERIFIED`。
2. 原 17 项逐项重新核验，17/17 均有充分的当前 production 证据。
3. 所有 bridge capability/result/event 缺失路径 fail-closed；测试数据仅通过显式 mock adapter 注入。
4. inventory 每项都有真实 View/root→feature→bridge→preload→registrar/application 链；event consumer 与 dispose 完整。
5. 四个 legacy 文件和全部等价旧路径从 source tree 与 packaged ASAR 物理删除。
6. 修复位于正确 owner；冻结 interface 重开记录完整，没有兼容 wrapper。
7. 全部门禁在同一当前工作树和本轮最新制品上通过。
8. 真实投稿、同步和付费 submit 调用为 0。
9. Phase 03/04/06 阶段文档、账本和 handoff 与当前代码、Git 差异、inventory 和门禁一致。

整改执行线程不得自行把 Phase 03/04/06 恢复为 `COMPLETE`。它只能写回“整改完成，等待最终独立只读审计”。只有后续独立审计确认上述条件全部成立，才可建议恢复阶段状态；Phase 04 的四项人工验收仍继续阻止正式 release。不得开始 Phase 07。

## 12. 新任务执行 Prompt

```text
在 F:/官媒投稿-refactor 原地执行最终独立审计后续整改。

先完整读取并严格执行：
- docs/refactor/17-phase-06-independent-audit-followup-remediation-plan.md
- docs/refactor/15-phase-06-code-audit.md
- docs/refactor/16-phase-06-final-audit-remediation-plan.md
- 当前 Phase 03/04/06 阶段文档、docs/refactor/13-progress-ledger.md
- docs/refactor/handoffs/phase-03.md、phase-04.md、phase-06.md

先执行文档第3节Git启动门禁，保留并解释当前Phase 03/04/06整改WIP；不得
reset、checkout、clean或覆盖用户改动。Phase 03/04/06保持IN_PROGRESS，
Phase 07保持NOT_STARTED。

严格按A→B→C串行完成：
A. media/platform/settings及所有同类production bridge capability/result/event
   缺失统一fail-closed，测试数据只用显式mock adapter；
B. 重建逐capability真实View/root→feature→bridge→preload→registrar/application
   inventory，禁止按owner批量套用通用hook或只用source.includes证明；无真实consumer
   的能力全链物理删除，event验证producer/唯一consumer/dispose；
C. 删除src/core/jobs.js、desktop/services/submission/submission-preparation.js、
   desktop/services/submission/submission-query.js、src/platforms/media/preflight.js
   及等价legacy路径，并用source tree和packaged ASAR零路径测试证明。

每个检查点必须先建立当前工作树production-level RED，再修正确owner、删除旧路径、
跑定向测试和三套typecheck，并把状态、RED、修改、删除、interface判断、测试和下一动作
写回Phase 03/04/06文档、账本与handoff。不要使用code-review技能。

完成后逐项重验原17个finding以及P1-AUDIT-01、P2-AUDIT-02，运行文档第10节
全部当前工作树门禁，包括完整npm test、Auth、lint、三套typecheck、format、links、
packaging、Renderer build、pack smoke、capacity、packaged ASAR、最新Renderer Electron
focus和git diff check；记录真实inventory、pass/fail/skip、制品终态与真实付费submit=0。

不访问真实workspace、内容库、Auth数据库、账号、供应商或付费服务；不执行真实投稿、
同步或扣费；不stage、commit、push或创建PR。即使全部转绿，也只写回“整改完成，等待
最终独立只读审计”，不得自行把Phase 03/04/06改为COMPLETE，不得开始Phase 07。
```
