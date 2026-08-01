# Phase 03/04/06 最终独立审计第二轮整改计划

> 日期：2026-07-29 Asia/Shanghai  
> 状态：**整改完成，等待最终独立只读审计**。Phase 03、Phase 04、Phase 06 必须保持 `IN_PROGRESS`，Phase 07 必须保持 `NOT_STARTED`。  
> 依据：`15-phase-06-code-audit.md`、`16-phase-06-final-audit-remediation-plan.md`、`17-phase-06-independent-audit-followup-remediation-plan.md`、当前 Phase 03/04/06 文档、进度账本、handoff、当前代码与 Git 差异，以及 2026-07-29 最终独立只读审计。  
> 边界：本文只定义整改与验收，不代表整改完成；创建本文不修改 production code、阶段状态或进度账本。

> **2026-07-29 独立只读审计第三轮整改终态（当前权威）：** 审计新增三项RED均已按正确owner修复。`commitRemoteOutcome()`的同article/target跨batch反例先5/6 RED，现对media submission item持久化`attemptId`做精确归属校验，错误item抛`OPERATIONAL_BATCH_ITEM_MISMATCH`且attempt/publication、remote evidence/order、display snapshot及两个batch item全部事务回滚；Phase03专项6/6、扩展80/80。109项inventory的断链same-name mutation先5/6 RED，现每项fixture显式记录receiver，consumer必须匹配完整`receiver.method`；feature binding仅可由正式member、从该member可达的本地声明、显式`commands`容器或单独记录的direct lifecycle call闭合，文件级兜底已删除，专项20/20。fallback detector的object map/switch/numeric ternary先RED，现以TypeScript AST覆盖if/ternary、switch及由canonical status索引的对象映射；源码5/6（仅旧ASAR parity RED）→重建后6/6，合并ASAR/legacy/preload11/11。
>
> 最终`npm test`为223文件1267/1267、0 fail/skip（160.799秒），Auth16/16、links180/180、packaging33/33、capacity19/19、最新Renderer Electron focus1/1、三套typecheck、lint、format、Renderer2157 modules、preload222,057 bytes、pack smoke与diff check全绿。最新ASAR为7,210,414 bytes（2026-07-29 20:16:29 +08:00），inventory仍为109（43 query、61 command、5 event）。schema仍为v3，public method集合未变；本轮只继续收紧`commitRemoteOutcome()`行为前置条件并强化测试证据，Phase04/06 production interface未改。Git仍为`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`、140条既有WIP保留且staged为空；真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费与付费submit均为0。下一动作仅为最终独立只读审计；Phase03/04/06保持`IN_PROGRESS`，Phase07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

> **2026-07-29 最终独立审计第二轮追加整改终态（当前权威）：** 在既有20项整改结论之上，本轮先建立三项当前工作树RED：定向15项为12 pass/3 fail，分别证明`commitRemoteOutcome()`可把另一稿件/target的`batchItemId`提交进当前attempt、canonical→supplier fallback detector漏掉`submitted/uncertain`、109项inventory仍保留可被同名调用/任意identifier/registrar分离匹配误绿的弱helper。正确owner整改为：(1) OperationalStore在同一事务内读取attempt与batch item的`article_id/target_key`并要求精确一致，不一致抛`OPERATIONAL_BATCH_ITEM_MISMATCH`且remote order/snapshot/item均回滚；(2) fallback回归覆盖`published/failed/submitted/uncertain`全部旧映射，并同时比较OperationalStore与真正fallback owner `desktop/services/media-order-service.js`的当前source/packaged ASAR精确一致性；(3) capability matrix改为结构化AST，要求正式feature member关联已记录bridge binding，且同一registrar call同时绑定精确channel与application property，旧`invokesMethod`/`containsNamedFeatureMember`被门禁拒绝。没有新增或恢复wrapper/legacy production path。
>
> 源码整改后OperationalStore v3专项5/5、Phase03扩展79/79、capability/caller/fail-closed 19/19、capacity19/19；旧ASAR上order-owner parity明确5/6 RED，`pack:smoke`后order/legacy/packaged preload合并11/11，最新Renderer Electron focus1/1。最终`npm test`为223文件1265/1265、0 fail/skip（228.598秒），Auth16/16、links180/180、packaging33/33、三套typecheck、lint、format、Renderer2157 modules、preload222,057 bytes、pack smoke与diff check全绿。最新ASAR为7,210,147 bytes（2026-07-29 18:12:40 +08:00），inventory保持109（43 query、61 command、5 event）。本轮没有schema v4或public method集合变化：schema仍为v3；`commitRemoteOutcome()`仅收紧既有行为前置条件，Phase04与Phase06 production interface不变。Git仍为`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`且staged为空；真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费和付费submit均为0。下一动作仅为最终独立只读审计；Phase03/04/06保持`IN_PROGRESS`，Phase07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

> 2026-07-29 执行记录—检查点 A：启动门禁通过且既有WIP全部保留。永久source/export/import-call/test/ASAR回归先为0/4 RED；物理删除`reconcileRemoteOrder`定义/public export、canonical status→supplier fallback与旧专用测试，迁移URL evidence测试后为3/4，仅旧ASAR仍RED；本轮pack smoke后为4/4，合并legacy path为7/7。A未改schema，但确实删除OperationalStore public method；supplier/order定向23/23、三套typecheck、lint、format、packaging、Renderer build、pack smoke与diff check通过，新ASAR为7,209,505 bytes（12:14:07 +08:00），真实外部/投稿/同步/扣费/付费submit=0。下一动作严格进入B；Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`。

> 2026-07-29 执行记录—检查点 B：当前权威事实已写回全部阶段文档/账本/handoff。OperationalStore schema为v2→v3，新表`order_display_snapshots`具精确PK/FK/nullability；新增retained `listOrderDisplayViews()`/`recordRemoteOrderObservation()`，A删除`reconcileRemoteOrder()`。B专项先2/4 RED，修复v3 verifier漏检FK/required nullability及恢复fixture路径后4/4；覆盖history、重复启动、三个fault point回滚重试、损坏结构、backup/restore/verify。扩展45/45，13k query/SQL=1/1、parsed3、heap143,288 bytes、0.471ms、paidSendCalls=0；三套typecheck、lint/format、links180/180、packaging33/33、diff通过。历史“未改OperationalStore/schema/interface”及110 inventory明确失效，canonical=109；PublicationWorkflow/Publisher/ContentStore/Domain/Application未变。真实外部/投稿/同步/付费submit=0。下一动作严格进入C；阶段状态不变。

> **2026-07-29 执行记录—检查点 C 最终权威结论：** 原17项 `P1-01`、`P1-02`、`P1-03`、`P1-04`、`P1-05`、`P1-06`、`P1-07`、`P2-08`、`P2-09`、`P2-10`、`P2-11`、`P2-12`、`P2-13`、`P2-14`、`P2-15`、`P3-16`、`P3-17`，以及 `P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`，共20项均按当前production tree复核为`VERIFIED`。C先以旧ASAR得到packaged OperationalStore source↔current source 7/8 RED，证明制品仍含旧路径；重建后source/export/import-call/test/ASAR为8/8。`P1-05`的supplier observation正式路径继续正确，`reconcileRemoteOrder`定义/export/旧专用测试与canonical status→supplier fallback已物理删除且无wrapper；`P1-AUDIT-03`确认schema v2→v3、`order_display_snapshots`、两个retained methods及migration/backup/restore/verify/fault证据。原17项+audit专项131/131、capacity19/19；完整测试223文件1263/1263、0 fail/skip（170.554秒），Auth16/16、links180/180、packaging33/33、三套typecheck、lint、format、Renderer build 2157 modules、pack smoke、packaged preload3/3、最新Renderer Electron focus1/1与diff check全部通过。Main 1k/10k/13k/20k请求10/100/130/200、payload 44,603/464,188/610,078/950,488 bytes；Renderer均1请求、payload 4,279/4,280/4,280/4,280 bytes，第20,001项明确truncated。最新ASAR为`release-alpha/win-unpacked/resources/app.asar`，7,209,908 bytes，2026-07-29 12:37:55.544 +08:00；canonical inventory保持109（43 query、61 command、5 event）。Git终检仍为`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`且staged为空。OperationalStore schema/public interface确有变化；PublicationWorkflow、Publisher、ContentStore、Domain/Application及Phase04冻结interface无当前production差异。全部使用临时SQLite/fake/VM/合成fixture/本地Electron，真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费与付费submit=0。下一动作仅为最终独立只读审计；不得恢复阶段`COMPLETE`或开始Phase 07。**整改完成，等待最终独立只读审计。**

## 1. 审计结论与当前状态

最终独立只读审计确认：

- 原 17 项 finding 中 16 项 `VERIFIED`，`P1-05 supplier/canonical 状态解耦` 仍为 `RED`。
- `P1-AUDIT-01 production bridge fail-closed` 与 `P2-AUDIT-02 legacy source/ASAR 物理删除` 为 `VERIFIED`。
- 新增 `P1-AUDIT-03 OperationalStore schema/interface 重开记录不完整`，状态为 `RED`。
- 当前 non-Auth Typed IPC inventory 为 109 项：43 query、61 command、5 event；该 inventory、Auth 六项豁免和 production composition 本轮无需重建，除非整改导致 capability 变化。
- 当前完整自动门禁均通过，但绿色门禁不能覆盖 production dead path 或不真实的 schema/interface 写回。

因此 Phase 03、Phase 04、Phase 06 继续保持 `IN_PROGRESS`；Phase 07 继续保持 `NOT_STARTED`。整改线程不得自行恢复阶段 `COMPLETE`。

## 2. 两个完成阻断

### 2.1 `P1-05`：canonical→supplier dead path 仍在 production

当前 `auto—publish/src/infrastructure/operational-store/operational-store.js` 仍定义并导出 `reconcileRemoteOrder()`。该方法把 canonical publication outcome：

- `published` 反推为 supplier code `2`；
- `failed` 反推为 supplier code `4`；
- `submitted/uncertain` 反推为 supplier code `0`。

静态调用图显示它没有 production caller，只有旧测试调用，但该定义和 export 仍进入最新 packaged ASAR。这与 P1-05 的完成要求“supplier observation 与 canonical workflow 是不同事实、不得从 canonical 状态推断 supplier code、旧 fallback 必须物理删除”冲突。

### 2.2 `P1-AUDIT-03`：OperationalStore v3/schema/interface 写回不真实

当前 Git 差异实际包含：

- OperationalStore schema v3；
- 新表 `order_display_snapshots`；
- 新 public query `listOrderDisplayViews()`；
- 新 public mutation `recordRemoteOrderObservation()`；
- 对应 migration、verify、backup/restore 与测试变化。

但当前 Phase 03 阶段文档和 handoff 的最终记录仍声称未修改 OperationalStore、schema 或冻结 interface。Phase 03 的确是这些修复的正确 owner，但重开记录必须如实说明 schema `v2 → v3`、新增接口、迁移和恢复证据，不能继续写成“无 schema/interface 变化”。

## 3. 启动门禁

开始整改前，在 Git 根执行并记录：

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --name-only
git diff --cached --name-only
git log --oneline -5
```

必须确认：

1. 分支仍为 `codex/refactor-program`。
2. 若没有新的授权提交，HEAD 仍为 `3992736d01413d83504253c7d905c21fcfe3183c`。
3. staged diff 为空。
4. 当前 Phase 03/04/06 整改 WIP 全部保留，不得 reset、checkout、clean 或覆盖。
5. Phase 03/04/06 为 `IN_PROGRESS`，Phase 07 为 `NOT_STARTED`。
6. 不连接真实 workspace、内容库、Auth 数据库、账号、供应商或付费服务。

若 Git 状态出现无法由现有整改解释的新 production/schema 改动，停止并报告，不得清理工作树。

## 4. 检查点 A：物理删除 canonical→supplier dead path

Owner：Phase 03 OperationalStore supplier observation boundary。

### A1. 先建立当前工作树 RED

新增永久回归，必须先在当前代码和当前 packaged ASAR 上失败：

1. production source 不得定义或导出 `reconcileRemoteOrder`。
2. production import/call graph 对 `reconcileRemoteOrder` 为零。
3. packaged ASAR 中的 OperationalStore source 不得包含该 symbol。
4. production/test 中不得存在 canonical publication status → supplier `0/2/4/9` 的 fallback 映射。

RED 不能只搜索某个 UI 文件；必须覆盖 source、export surface、调用图和 packaged ASAR。

### A2. Production 删除

1. 删除 `reconcileRemoteOrder()` 定义。
2. 从 OperationalStore public return surface 删除该 export。
3. 删除只验证旧 canonical→supplier reconcile 行为的测试。
4. 若旧 evidence 测试只依赖该 API 验证 URL 边界，将其迁移到 `recordRemoteOrderObservation()` 或正式 remote evidence owner；不得保留兼容 wrapper。
5. 保持唯一同步路径：supplier response → `MediaOrderService.syncOrder()` → `recordRemoteOrderObservation()`。
6. 保持 `status 2 + 安全 HTTPS evidence` 可提升进行中 canonical publication；status `9` 或其他 supplier code 不得撤销 canonical `published`。

### A3. A 完成门禁

- source/export/import graph/ASAR 零引用测试转绿。
- supplier `0/1/2/4/9` observation 独立持久化测试通过。
- 缺 observation 显示 unknown，不从 canonical 状态生成 supplier code。
- `2` 缺 URL 不提升；`9` 不撤销 published。
- Phase 03 order/evidence/workflow 定向测试通过。
- 三套 typecheck、lint、format、packaging 与 `git diff --check` 通过。
- 所有同步和投稿 fixture 的真实外部/付费 submit 调用为 0。

## 5. 检查点 B：如实收口 OperationalStore v3 与冻结 interface 重开

Owner：Phase 03 OperationalStore schema、order display projection 与 migration；Phase 06 只消费安全 Renderer DTO。

### B1. 先核对代码事实

逐项核对当前 Git 差异和测试，形成明确清单：

1. schema v3 的建表 SQL、migration history 和版本检查。
2. `order_display_snapshots` 的列、PK/FK、nullable 规则和写入时机。
3. `listOrderDisplayViews()` 的边界、`LIMIT 20000`、单 SQL 和 payload 解析量。
4. `recordRemoteOrderObservation()` 的事务、URL validator、supplier observation 和 canonical promotion 规则。
5. schema v2 → v3 migration、重复启动、损坏结构、故障注入、backup、restore 和 verify 测试。
6. public interface 的新增、删除与 production caller。

### B2. 文档和状态写回

更新以下文件：

- `docs/refactor/06-phase-03-publication-workflow.md`
- `docs/refactor/07-phase-04-platform-runtime-adapters.md`（仅在边界说明需要纠正时）
- `docs/refactor/09-phase-06-renderer-ipc.md`
- `docs/refactor/13-progress-ledger.md`
- `docs/refactor/handoffs/phase-03.md`
- `docs/refactor/handoffs/phase-04.md`（仅在边界说明需要纠正时）
- `docs/refactor/handoffs/phase-06.md`
- 本文件

必须明确写入：

1. Phase 03 因 P1-05/P2-13 正式窄范围重开。
2. OperationalStore schema 从 v2 升为 v3。
3. 新表及两个 retained public methods 的 owner、caller 和不变量。
4. `reconcileRemoteOrder` 已物理删除。
5. migration、backup/restore、verify、fault injection 和 13k projection 证据。
6. 未修改的冻结边界：PublicationWorkflow、Publisher、ContentStore、Domain/Application；若实际差异证明其中任何一项变化，必须如实记录，不得沿用“未修改”。
7. 历史 110 项 inventory 仅为已失效历史；当前 canonical inventory 为 109。

不得删除历史记录，但必须在当前权威段落明确标注旧数字和旧 interface 结论已经失效。

### B3. B 完成门禁

- 文档中的 schema version、接口、inventory、删除清单与当前 Git 差异逐项一致。
- migration/restore/verify 测试使用临时 SQLite，不访问真实 workspace。
- 13k order projection 保持 query=1、SQL=1、parsed payload=3、paidSendCalls=0，或记录本轮真实新指标。
- 三套 typecheck、lint、format、links、packaging 与 `git diff --check` 通过。

## 6. 检查点 C：最终复核与当前工作树门禁

完成 A、B 后重新逐项复核原 17 项，以及 `P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`。

重点要求：

1. `P1-05` 必须同时满足新 observation 主路径正确和旧 fallback 物理删除。
2. `P1-AUDIT-03` 必须由代码、Git diff、migration tests 和文档共同闭合。
3. 109 项 Typed IPC inventory 若未受影响，可复用结构化 fixture，但必须重跑 AST matrix；若 capability 数量变化，必须重新统计。
4. 5 个 event 继续验证 producer、唯一 consumer 和 dispose。
5. Auth 仍仅允许 5 invoke + 1 event；不得迁移 Auth 或启动 Phase 07。
6. 最新 ASAR 必须同时证明 named legacy paths、`media.removeDraft` 和 `reconcileRemoteOrder` 为零。

在 `auto—publish` 运行：

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

- capability-specific inventory、registry、API surface 和 production composition tests；
- supplier observation、order projection、schema v3 migration/restore/fault tests；
- 1k、10k、13k、20k main/Renderer capacity 与第 20,001 项 truncated；
- packaged source/import/ASAR 零路径测试；
- 基于本轮最新 Renderer 和 pack smoke 制品的 Electron focus，显式启用，不得计入默认 skip；
- 最终 branch、HEAD、status、staged diff 和 artifact path/size/time。

所有 mutation 测试继续使用 fake client、临时 SQLite、VM、内存 adapter 或合成 workspace/resource。真实投稿、同步、供应商和付费 submit 调用必须为 0。

## 7. 完成条件

只有以下条件全部满足，整改线程才可写回“整改完成，等待最终独立只读审计”：

1. `P1-05` 与 `P1-AUDIT-03` 均达到 `VERIFIED`。
2. `reconcileRemoteOrder` 从 source、export surface、tests、import graph 和 packaged ASAR 物理消失。
3. schema v3、`order_display_snapshots` 和新增 OperationalStore interface 已如实记录，并有 migration/restore/verify 证据。
4. 原 17 项及三个 audit finding 均有当前 production 证据。
5. 109 项 inventory 和 Auth 六项豁免与当前代码一致。
6. 所有最终门禁在同一当前工作树和本轮最新制品上通过。
7. 真实外部投稿、同步和付费 submit 调用为 0。

整改执行线程不得自行把 Phase 03、Phase 04 或 Phase 06 恢复为 `COMPLETE`。只有下一轮独立只读审计确认全部条件成立，才可建议恢复阶段状态。Phase 04 的四项人工验收继续阻止正式 release。不得开始 Phase 07。

## 8. 禁止事项

- 不使用 `code-review` 技能。
- 不读取或采用旧 `auto—publish/docs/` 补全规范。
- 不访问真实 workspace、内容库、Auth 数据库、账号、供应商或付费服务。
- 不执行真实投稿、真实订单同步、扣费或付费调用。
- 不 reset、checkout、clean 或覆盖既有 WIP。
- 不 stage、commit、push 或创建 PR。
- 不通过兼容 wrapper、旧 export、测试专用 production caller、源码字符串白名单或放宽 validator 转绿。
- 不启动 Phase 07。

## 9. 新线程执行 Prompt

```text
在 F:/官媒投稿-refactor 原地执行最终独立审计第二轮整改。

完整读取并严格执行：
- docs/refactor/18-phase-03-final-audit-remediation-plan.md
- docs/refactor/17-phase-06-independent-audit-followup-remediation-plan.md
- docs/refactor/15-phase-06-code-audit.md
- docs/refactor/16-phase-06-final-audit-remediation-plan.md
- 当前 Phase 03/04/06 阶段文档、docs/refactor/13-progress-ledger.md
- docs/refactor/handoffs/phase-03.md、phase-04.md、phase-06.md

先执行第3节Git启动门禁，保留并解释当前Phase 03/04/06整改WIP；不得
reset、checkout、clean或覆盖用户改动。Phase 03/04/06保持IN_PROGRESS，
Phase 07保持NOT_STARTED。不要使用code-review技能。

严格串行完成：
A. 先建立source/export/import graph/packaged ASAR RED，然后从OperationalStore
   物理删除无production caller的reconcileRemoteOrder及canonical publication
   status→supplier code fallback；删除或迁移只验证旧路径的测试，不留wrapper。
B. 如实收口Phase 03重开：核对并记录OperationalStore schema v2→v3、
   order_display_snapshots、listOrderDisplayViews、recordRemoteOrderObservation、
   migration/backup/restore/verify/fault证据；修正文档中“未修改schema/interface”的
   不实结论，并保持当前canonical inventory为109。
C. 逐项复核原17项与P1-AUDIT-01、P2-AUDIT-02、P1-AUDIT-03，重跑当前
   工作树全部门禁、capacity、packaged ASAR和最新Renderer Electron focus。

每个检查点必须先有当前工作树RED，再修正确owner、物理删除旧路径、跑定向测试
和三套typecheck，并把状态、RED、修改、删除、schema/interface判断、测试和下一动作
写回Phase 03/04/06文档、账本与handoff。

不访问真实workspace、内容库、Auth数据库、账号、供应商或付费服务；不执行真实投稿、
同步或扣费；不stage、commit、push或创建PR。即使全部转绿，也只写回“整改完成，等待
最终独立只读审计”，不得自行恢复Phase 03/04/06为COMPLETE，不得开始Phase 07。
```
