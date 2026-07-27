# Phase 06 Renderer状态与Typed IPC交接

## 1. 状态与边界

- 状态：`COMPLETE`（2026-07-26 Asia/Shanghai）。
- 分支/启动 HEAD：`codex/refactor-program` / `743571d9597ea2c68ab10a08da0914ccaed5352b`。
- Phase 05 completion `75dba966375302a99ebfd020c02ee6dd83930a9e` 与 milestone record `365df706af110a25f900f63f05406a50d7b5e3b9` 均已核验为祖先。
- 本阶段未修改 OperationalStore、ContentStore、Publisher 或冻结 Domain/Application interface；未访问真实投稿、付费、生产账号、Auth数据库或内容库。
- 用户于2026-07-28明确授权在安全检查点形成一次Phase 06里程碑commit；本handoff随同该单一commit收口。未授权push或PR。Phase 07=`NOT_STARTED`。
- Phase 04 的四项 `PENDING_HUMAN` 继续阻止正式 release，不影响本阶段本地完成。

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
| media | 10 | 8 | 0 | 18 |
| platform | 4 | 5 | 1 | 10 |
| content | 24 | 29 | 2 | 55 |
| attention | 3 | 1 | 0 | 4 |
| generation | 7 | 10 | 1 | 18 |
| **合计** | **56** | **67** | **5** | **128** |

128/128 每项包含独立 request/result（event项为event）fixture、owner和production caller；registry表驱动测试对全部 capability 遍历 unknown version、unknown field、missing required field、unsafe/raw error。destructive、event/dispose、scope identity、媒体容量与敏感边界另有纵向RED→GREEN测试。

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
- `third_id`来源已明确：`media-publication-submission-service`为每次尝试生成`attempt-${crypto.randomUUID()}`，PublicationWorkflow/MediaPublisher原样传入供应方`third_id`。它是我方幂等/追踪attempt identity，不是远端订单号；远端订单事实来自响应`order_nid/orderNid`并持久化为remote evidence。后续若修改展示值，应保持内部attempt identity唯一且不可与远端order ID混淆。
- 合成multipart测试逐字段锁定`resource_id/title/content/third_id`；publisher fake同时核对完全相同的title、HTML body和attempt identity。全部使用临时Markdown与内存fetch/client，未调用真实`media/send`或产生费用。
- 最终证据：媒体专项72/72；`npm test`221文件1222/1222、0 fail/skip；Auth16/16、links180/180、packaging33/33；三套typecheck、lint、format、Renderer build2153 modules、preload231,751 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1和`git diff --check`通过。最新exe为225,485,824 bytes，2026-07-28 00:59:49。Phase 07未启动。

## 8. Phase 07入口

Phase 07应直接复用 SafeOperationalError闭集、`diagnosticId`与上述 workspace diagnostic codes；迁移6项Auth豁免到版本化精确contract，并删除 `authIpcError` legacy `message` envelope。不得重新引入raw错误、stack、日志、路径、Cookie、密钥或通用IPC。Phase 07在本任务中未启动。
