# 阶段6：Renderer状态与Typed IPC

> 当前状态：**COMPLETE；2026-07-26 已完成 Renderer 状态与 Typed IPC 重构，2026-07-27 已收口 production sandbox preload、workspace bootstrap composition、AI/豆包DTO、Unicode业务identity、workspace级command与豆包session恢复门禁、workspace relaunch环境P1并重跑全部门禁**。
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
