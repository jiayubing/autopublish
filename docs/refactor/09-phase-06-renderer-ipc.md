# 阶段6：Renderer状态与Typed IPC

> 当前状态：**READY；计划已澄清，尚未启动实施**。
>
> Phase 05 已在 `13-progress-ledger.md` 与 `handoffs/phase-05.md` 记录为
> `COMPLETE`，完成commit为 `75dba966375302a99ebfd020c02ee6dd83930a9e`，里程碑记录commit为
> `365df706af110a25f900f63f05406a50d7b5e3b9`。Phase 06 仍为 `NOT_STARTED`；只有新的明确任务
> 在干净且无未解释前序改动的工作区通过第3节门禁后，才可将其改为 `IN_PROGRESS` 并开始实施。
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
- 本次只完善Phase 06计划；Phase 05已为`COMPLETE`，Phase 06为`READY/NOT_STARTED`，须由新的明确任务通过启动门禁后实施。
