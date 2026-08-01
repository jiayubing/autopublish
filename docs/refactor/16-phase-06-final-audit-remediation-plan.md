# Phase 06 最终独立审计整改计划

> 日期：2026-07-28 Asia/Shanghai  
> 状态：已执行；17/17 findings 已通过最终完整门禁，等待下一轮独立只读审计决定是否恢复阶段 `COMPLETE`  
> 依据：`docs/refactor/15-phase-06-code-audit.md`、当前代码、当前 Git 历史和 2026-07-28 最终独立只读审计。  
> 边界：本计划不启动 Phase 07，不连接真实 workspace、内容库、Auth 数据库、账号或付费服务，不执行真实投稿、stage、commit、push 或 PR。

> 2026-07-29 纠正记录：本文此前写入的 `P2-09 110/110 VERIFIED` 证据不足，已按后续独立审计重新整改。当前真实 inventory 为 109（43 query、61 command、5 event；media 17）；`media.removeDraft` 因无 production consumer 全链删除。109/109 已具备从 `main.tsx` 可达的真实 consumer、feature public method/lifecycle、bridge、preload、registrar/application AST 证据；完整门禁为 222 文件 1255/1255。历史表格保留为当时记录，本附记为当前终态。

## 1. 当前结论

2026-07-28 最终完整门禁与production composition重验已完成：17/17 findings 为最终 `VERIFIED`，没有延期。Phase 03、Phase 04、Phase 06仍保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`；只有下一轮独立只读审计可决定是否恢复阶段`COMPLETE`。

完整 `npm test` 在当前工作树收集221个测试文件，1247 pass、0 fail、0 skip（159.306秒）。执行期间先真实复现3个陈旧验收RED：两个测试要求已删除的`generation.getState/getGenerationBatchState`，一个订单fixture仍向Renderer注入raw `orderUrl`；另复现format RED 2文件。它们分别归属P2-09、P1-04与P2-13/P1-07，均未恢复旧production seam，整改后完整测试与format门禁转绿。

## 2. 当前 finding 状态

| ID | 当前状态 | 最终证据 |
| --- | --- | --- |
| P1-01 Platform event workspace identity | VERIFIED | 真实Renderer A→B后拒绝A迟到heartbeat/terminal，B snapshot/busy/queue revision/refresh不变。 |
| P1-02 Confirmation/destructive scope | VERIFIED | production root scope切换取消active/FIFO；focus与exactly-once通过，旧token execute=0。 |
| P1-03 SafeOperationalError | VERIFIED | Phase 06 registry闭集重建安全文案与opaque diagnostic ID，冻结Phase 01契约已恢复。 |
| P1-04 raw URL/内部订单字段 | VERIFIED | order DTO仅保留`hasPublishedUrl`，open只接收order identity；credential/query/fragment/non-HTTPS写前拒绝，JSONL/raw路径删除。 |
| P1-05 supplier/canonical 解耦 | VERIFIED | `0/1/2/4/9`独立observation；`2`缺URL不提升，`9`不撤销published，缺observation为unknown。 |
| P1-06 价格 canonical 化 | VERIFIED | 仅MediaResourceService摄取时canonicalize；负数、混合货币、NaN、Infinity、超限均为unknown且raw副本/下游转换删除。 |
| P1-07 content bridge fallback | VERIFIED | synthetic/noop fallback旧symbols物理删除，capability/result/event缺失fail-closed。 |
| P2-08 registrar fail-closed | VERIFIED | 未登记非Auth channel在安装handler前失败。 |
| P2-09 production caller inventory | VERIFIED | 110/110逐项验证View→feature→bridge→preload→registrar；18项无consumer能力全链删除。 |
| P2-10 diagnostic sink | VERIFIED | malformed workspace/platform event经真实preload进入同一安全有界sink并验证read/subscribe/dispose。 |
| P2-11 唯一 Settings owner | VERIFIED | production仅一个`SettingsFeatureProvider`。 |
| P2-12 sync error propagation | VERIFIED | supplier parse、SQLite、evidence与observation冲突均回滚并返回固定安全错误，UI不伪报成功。 |
| P2-13 bounded order projection | VERIFIED | 13k真实临时SQLite：order query/SQL=1/1、parsed payload=3、paid send=0。 |
| P2-14 dead `media.stopSubmit` | VERIFIED | contract/fixture/preload/bridge/feature/registrar及service flag删除，production/canonical inventory零引用。 |
| P2-15 media Promise/error owner | VERIFIED | refresh/toggle错误进入安全feature snapshot且无unhandled rejection。 |
| P3-16 `navigationSummary` dead scope | VERIFIED | protocol scope零引用；Sidebar仅保留本地derived view。 |
| P3-17 `publishedAt` 真实性 | VERIFIED | main/IPC/bridge保留timezone-bearing instant，仅Orders View格式化一次；空evidence保持空。 |

### 2.1 最终完整门禁与专项终态（2026-07-28）

- `npm test`：221文件，1247/1247，0 fail/skip；`test:auth` 16/16；`test:links` 180/180；`test:packaging` 33/33。
- `lint`、`typecheck:main`、`typecheck:renderer`、`typecheck:bridge`、`format:check`、`build:renderer`、`pack:smoke`与`git diff --check`均通过。Renderer为2157 modules；preload bundle 222,542 bytes；pack smoke 38.3秒并验证Windows目录制品。
- inventory：110项=43 query/62 command/5 event；owner为workspace9/settings14/media18/platform10/content43/attention3/generation13；合法fixture 110。Auth豁免仅invoke `auth:get-state/login/change-password/refresh/logout`与event `auth-state-changed`。
- 专项71/71覆盖真实caller matrix、malformed/迟到workspace/platform event、ConfirmationHost、supplier/order/price/SQLite与容量；publish-log production零引用。packaged ASAR preload 3/3，基于本轮最新Renderer build的Electron focus 1/1。
- main 1k/10k/13k/20k：请求10/100/130/200；payload 44,603/464,188/610,078/950,488 bytes；heap delta 0/2,137,320/5,329,640/2,106,760 bytes；延迟1.219/4.245/4.644/5.708ms。
- Renderer 1k/10k/13k/20k：请求均1；payload 4,279/4,280/4,280/4,280 bytes；heap delta 351,688/1,268,472/480,912/407,160 bytes；延迟1.001/1.059/1.074/1.525ms。第20,001项明确`truncated/max-resources`且只缓存前20,000项。
- 所有fixture均为临时SQLite、VM、Electron本地窗口、内存fake或合成workspace/resource；真实workspace、内容库、Auth数据库、账号和付费服务均未连接，真实付费submit调用为0。

## 3. 启动门禁和状态写回

开始 production 整改前必须记录：

```text
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --name-only
git diff --cached --name-only
git log --oneline -5
```

随后先修正状态账本：

1. Phase 03、Phase 04、Phase 06 标为 `IN_PROGRESS`。
2. Phase 07 保持 `NOT_STARTED`。
3. 将本文件第 2 节状态写回 Phase 06 handoff；不得继续保留 A/B 全部 `VERIFIED` 的结论。
4. 记录当前完整测试 1238/1244，而不是用前 110 个文件的 685/685 替代完整门禁。
5. 记录 `pack:smoke` 已在本机 59.1 秒通过；旧“无终态”记录不再代表当前事实。
6. 修正 Phase 06 handoff 中陈旧的 129/129 inventory 表；真实 production 数量必须等待检查点 C 清点。

## 4. 检查点 A：production composition 与安全边界

严格串行完成以下切片。每个切片执行：RED → 明确 owner/interface → production caller切换 → 旧路径删除 → 定向测试 → 三套 typecheck。

### A1. P1-01 Platform production composition

- 修正真实 Renderer fixture，使 runtime query、workspace invalidation 和 platform event 使用同一 `workspaceRuntimeId`。
- 保留 A→B 后 A 的 heartbeat/terminal 全部被拒绝。
- 断言 B 的 snapshot、busy、queue revision 和 refresh 次数不变。
- 将 `renderer-platform-queue-refresh-lifecycle.test.js` 恢复为 GREEN。

### A2. P1-02 content command scope

- 删除 `content-workbench-feature.js` 对所有非空 target command 的 blanket `input.clientId` 判断。
- 为每个 command 定义显式 identity extractor。
- wire DTO 无 `clientId` 时，由 feature command input 携带当前 scope identity，adapter 在调用 bridge 前剥离。
- 对 batch、removal transaction、prepared Doubao task 使用 authoritative snapshot/entity owner 验证归属。
- confirmation 返回后再次核验 workspace/client scope；旧 prepare token 的 execute 调用必须为 0。

必须转绿：

- `renderer-content-client-switch.test.js`
- `renderer-history-editor-flow.test.js`
- `renderer-question-editor-session.test.js`
- production root workspace/client scope switch + active/FIFO confirmation cancellation

### A3. P1-03 SafeOperationalError owner

推荐把固定文案、diagnostic ID 与敏感语义校验收口到 Phase 06 IPC registry，并恢复 Phase 01 domain contract。这样不需要重开 Phase 01。

如果 RED 证明共享 domain contract 必须改变，则正式窄开 Phase 01，并更新 Phase 01 文档、handoff、账本和完整门禁；不得继续声称未修改冻结 Domain/Application interface。

### A4. P1-04 evidence URL 与旧订单路径

- 建立唯一 credential-free HTTPS evidence validator。
- `commitRemoteOutcome()`、supplier observation、reconcile 和 open command 全部复用。
- validator 必须拒绝 username/password、query、fragment 和非 HTTPS scheme。
- 失败必须发生在事务写入前；`remote_evidence`、`remote_orders` 均不得有残留。
- 删除 `MediaOrderService` 的 JSONL fallback、legacy publication ledger、raw DTO、raw URL 和内部 workflow IDs。
- production service 构造必须强制要求 OperationalStore 和正式 order display projection。

### A5. P1-07 content bridge fail-closed

- 删除 `_fallback`、`hasFallback`、`emptySnapshot`、`renderer-fallback` 及所有旧 callsite。
- 删除 capability 缺失时返回 noop unsubscribe 的 event path。
- 浏览器 story/test 空数据改由显式 mock adapter提供。
- query、command、event capability/result缺失必须稳定失败或进入安全 diagnostic sink。
- 将脆弱的源码正则测试改为行为 harness，并静态断言旧 symbols 为零。

### A 完成门禁

- platform/content/confirmation/workspace/IPC/security 定向测试。
- 三套 typecheck。
- packaging VM registry require。
- publish-log logger断言。
- `git diff --check`。
- 检查点 A 的所有 finding 才可从 `RED_REPRODUCED/FIXED` 升到检查点级 `VERIFIED`。

## 5. 检查点 B：供应商事实与订单模型

### B1. P1-05 supplier observation

- supplier `0/1/2/4/9` observation 均可独立持久化。
- `2` 缺 URL 时保存 observation，但不得提升 canonical publication。
- 只有 `2 + 安全 HTTPS evidence` 可提升进行中的 canonical 状态。
- `9` 及其他 supplier code 永不撤销 canonical `published`。
- 缺 observation 显示 unknown，不从 canonical 状态推断 supplier code。
- 删除旧 `mapOrderStatus()`、canonical fallback 和 legacy ledger mutation。

### B2. P1-06 canonical price

- `MediaResourceService` 摄取后只产生 canonical finite non-negative number 或明确 unknown。
- 删除缓存/pool中的原始供应商价格副本。
- 删除 workbench、submission、IPC 的 `Number()`、字符剥离、非法→0兼容转换。
- `-10`、货币混合字符串、NaN、Infinity、超限和缺失不得变成 0 或正数。
- 下游遇到非 canonical price 必须 fail-closed或保持“未记录”，不得自行修复。

### B3. P2-12 sync failure

保留当前错误传播，并补齐 SQLite写入、evidence冲突、observation冲突的故障注入；UI不得显示同步成功，SafeOperationalError不得包含SQL、路径或原payload。

### B4. P2-13 bounded order projection

- 保留单次有界 SQL projection。
- 新增真实临时 SQLite 大历史 fixture。
- 记录订单查询次数、SQL次数、payload解析量、内存和延迟。
- 证明其不随全部 submission batch 数量形成 N+1。
- 删除 service 中的 projection fallback，不用cache或wrapper掩盖接口缺口。

### B5. P3-17 published time

- main、IPC、bridge全程传递带timezone的ISO instant。
- main不得提前删除 `Z`，bridge不得格式化。
- 只允许 Orders View 格式化一次。
- 无 evidence timestamp 时保持空。
- 增加UTC跨日、Asia/Shanghai与空值回归。

### B 完成门禁

- 使用临时 SQLite、fake supplier和合成大历史fixture。
- 真实付费send调用为0。
- Phase 03订单/evidence/workflow定向测试。
- media resource/service/workbench测试。
- 三套typecheck和`git diff --check`。

## 6. 检查点 C：Typed IPC、diagnostic 与死能力

### C1. P2-09 真实 production inventory

每个 capability 必须逐项记录并验证：

1. capability、channel、kind、owner。
2. request/result/error/event validator与合法fixture。
3. preload命名方法。
4. bridge export。
5. feature query/command或event subscription。
6. 真实View consumer。
7. event dispose与唯一consumer。

不得再按owner套用七组通用文件。测试必须验证具体symbol/import/call，而不是仅验证文件存在、bridge含任意`desktopConsole`、preload含channel。

对无真实consumer的能力：

- 产品不需要：删除contract、registrar、preload、bridge、fixture和文档项。
- 产品需要：补真实feature/View caller及纵向composition test。

删除后重新统计inventory。数字以真实production调用图为准，不以128或129为目标。

### C2. P2-10 structured diagnostic sink

- 增加 malformed workspace/platform event 经真实preload到统一sink的纵向测试。
- sink只保存安全code/category，不含原payload、路径、URL、stack、Cookie或正文。
- 提供明确的只读/订阅seam供Phase 07复用，但本阶段不迁移Auth。

### C3. 已修项目回归

- P2-08：未登记非Auth registrar注册立即失败。
- P2-11：production仅一个SettingsFeatureProvider。
- P2-14：`media.stopSubmit` production零引用。
- P2-15：refresh/toggle错误可显示且不产生`unhandledrejection`。
- P3-16：协议中无`navigationSummary` scope，Sidebar仅为derived view。

## 7. 最终完整门禁

17项均完成实现和旧路径删除后执行：

```text
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

还必须记录：

- 实际测试文件数、pass/fail/skip。
- 真实 production caller/inventory纵向矩阵。
- workspace/platform delayed event composition。
- ConfirmationHost FIFO/scope/focus/exactly-once。
- supplier/order/price/SQLite故障注入。
- 1k、10k、13k、20k main与Renderer请求数、payload bytes、内存和延迟。
- 第20,001项显式`truncated`。
- packaging VM registry require、publish-log断言、packaged ASAR与最新Renderer Electron focus。
- 所有投稿/同步测试的真实付费submit调用为0。

任何失败都不得以“与本finding无关”直接忽略；必须给出基线、归属和处置结果。

## 8. 完成条件

只有以下条件全部满足，才可恢复 Phase 03、Phase 04、Phase 06 为 `COMPLETE`：

1. 17/17 findings均为最终`VERIFIED`，没有未经用户批准的延期。
2. 7项当前RED全部已有production-level RED→GREEN。
3. 逻辑迁回正确owner，冻结interface重开记录完整。
4. JSONL/raw DTO/fallback/重复转换/死capability等旧路径已物理删除。
5. Typed IPC inventory由真实production调用图重新统计。
6. 完整 `npm test` 和全部附加门禁同时通过。
7. Phase 03/04/06阶段文档、账本和handoff同步更新。
8. 再执行一次独立只读审计，重点验证production composition而非复述测试。

在此之前不得开始 Phase 07。

## 9. 新任务简短 Prompt

```text
在 F:/官媒投稿-refactor 原地执行整改。完整读取并严格执行
docs/refactor/16-phase-06-final-audit-remediation-plan.md，并以
docs/refactor/15-phase-06-code-audit.md 为审计规范。先核对Git状态并把
Phase 03/04/06保持IN_PROGRESS，本轮只完成检查点A的RED→GREEN、旧路径删除、
定向门禁和证据写回。不要使用code-review技能，不启动Phase07，不执行真实投稿、
付费调用、stage、commit、push或PR。
```
