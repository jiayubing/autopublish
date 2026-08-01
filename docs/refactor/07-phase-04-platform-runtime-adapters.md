# 阶段4：平台运行期与Publisher Adapters

> **2026-07-30 最终只读审计三项P1直接整改（当前唯一权威）：** 唯一`verifyCapabilityEvidence()`新增三项永久RED→GREEN反例：Renderer owner仅经未调用entry callback、owner仅作为未消费JSX prop、producer callback仅在`if(false)`中调用。入口现在只沿确证callback契约，JSX只接受intrinsic事件或闭合到子组件真实消费的prop，callback调用证明排除静态不可达分支；React `lazy`及既有React/标准异步集合边界按TypeChecker声明闭合。证据专项66/66、matrix33/33（109 capability、21 lifecycle、5 event）、fail-closed7/7，合计106/106；完整`npm test`225文件1366/1366，lint、定向Prettier与`git diff --check`通过。仅测试证据helper/test变化，Phase03/04/06 production、package input和既有制品未变；阶段继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 计划21最终审查后TDD终态（当前唯一权威）：** Phase04 production interface未改。五项追加证据假阳性已通过唯一公开`verifyCapabilityEvidence()` seam串行RED→GREEN，证据专项60/60、production matrix/fail-closed组合100/100、matrix109/109、lifecycle21/21、event5/5，inventory保持109。`npm test`225文件1360/1360、Auth16/16、links180/180、packaging33/33、lint/format/三套typecheck、标准`pack:smoke`与diff check通过。`P1-CONVERGENCE-01=VERIFIED`；Phase04=`IN_PROGRESS`，Phase07=`NOT_STARTED`，人工验收仍阻止正式release。真实账号、投稿、同步、扣费与付费submit调用为0；以下旧统计均为历史记录。

> **当前唯一权威制品：** Renderer/preload/ASAR/exe SHA-256分别为`E1B965347C5BEA36B27006555E0DCFC5E380211A6BA39D925A7516FFD204A860`、`3F56D207A9FB3BFB8C807CFCCA5DF3F5F57CC93B7D38DC97A128840433BFB8EC`、`71CD2F7A24CC0106D712348835B1803F943C6BB36F18E41133E025B1CA6BF073`、`60E05AFB17FF24E541DC9AEDCB82B749D8024B15F46CF66D51688B017239AAF6`；exe 225,485,824 bytes。

> 当前状态：**IN_PROGRESS**。2026-07-30 计划21整改已完成，等待最终独立只读审计；不得恢复`PENDING_HUMAN`或`COMPLETE`，四项人工验收继续阻止正式 release。

> **2026-07-30 最终复验更正：** producer可达性新增导出入口内未调用arrow helper反例并转绿；corpus33/33、production suite33/33、最终全仓225文件1333/1333（164.262秒）。本句取代紧随其后的中间计数；Phase04 production仍未修改。

> **2026-07-30 最终证据引擎整改边界（当前权威，取代下方2026-07-29统计）：** 本轮Phase04 production interface未改；Ticket 4只强化共享TypeChecker证据核心，新增producer export/callback可达性、同一import的真实唯一bridge消费、返回disposer上的同channel/同callback removal，以及event application真实symbol解析。corpus32/32、production suite33/33，109 capability、21 lifecycle、5 event全绿；完整225文件1332/1332、Auth16/16、links180/180、packaging33/33、capacity19/19、三套typecheck、lint/format、Renderer/preload、pack smoke、ASAR parity、packaged preload3/3、Electron focus1/1、diff check全绿。最新ASAR7,212,371 bytes/SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe225,485,824 bytes/SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。真实数据/账号/供应商/投稿/同步/扣费/付费调用为0，staged=0。`P1-CONVERGENCE-01=VERIFIED`；Phase04保持`IN_PROGRESS`、Phase07=`NOT_STARTED`，四项人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

> **2026-07-29 证据引擎与订单链接整改边界（最新当前权威，取代下方同日统计）：** production-level RED证明旧production verifier会放行不存在的lifecycle state source与event producer；同一唯一`verifyCapabilityEvidence()`现直接服务109项production matrix及20项冻结mutation/acceptance，以TypeChecker symbol identity实际闭合receiver、production入口/owner可达性、registrar/application、21项query→state→snapshot consumer与5项producer→唯一consumer→dispose，`P1-CONVERGENCE-01=VERIFIED`。Phase03真实临时SQLite复现并修复canonical published订单supplier `2→9`后按钮可见而main拒绝，打开权限仅取canonical published与安全持久URL，`P2-FINAL-ORDER-01=VERIFIED`；`P2-CONVERGENCE-02`继续`VERIFIED`。Phase04 production interface未改。inventory为109（43 query、61 command、5 event）；完整225文件1318/1318、Auth16/16、links180/180、packaging33/33、capacity20/20（原冻结19项全通过）、13k query/SQL=1/1、parsed=3、orders=3、paid send=0，三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、最新ASAR parity、packaged preload3/3、Electron focus1/1与diff均通过。最新ASAR 7,212,371 bytes，SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe 225,485,824 bytes，SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。真实数据、账号、供应商、投稿、同步、扣费和付费服务调用为0，staged为空。Phase04保持`IN_PROGRESS`、Phase07保持`NOT_STARTED`，四项人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

> **2026-07-29 最终审计收敛整改边界（当前权威）：** A的109项TypeChecker symbol-identity矩阵包含platform/media registrar→application与`platform.stateChanged`链，12类断链mutation均保持RED；B的supplier/canonical矩阵归属Phase03。Phase04的PlatformRun、DesktopTaskService event contract、Publisher、adapter、media canonical preflight、schema与public interface均未修改；只纠正跨阶段证据 owner，不恢复任何legacy wrapper。完整225文件1281/1281、capacity19/19、最新ASAR、bundled preload与显式Electron focus全部通过。Phase04保持`IN_PROGRESS`，四项人工验收继续阻止release；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**

> **2026-07-29 第三轮整改边界（当前权威）：** 三项新RED归属Phase03 OperationalStore attempt归属、Phase06 inventory证据与Phase03 fallback回归；未修改PlatformRun、DesktopTaskService event contract、adapter、Publisher、media canonical preflight或Phase04 schema/interface。同target跨batch已按durable attempt fail-closed，inventory断链mutation与fallback三类结构性反例均转绿。Phase03扩展80/80、capability20/20、完整1267/1267及最新制品/Electron门禁全绿。Phase04保持`IN_PROGRESS`，四项人工验收继续阻止release；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**

> **2026-07-29 追加审计整改边界（当前权威）：** 本轮三项RED均归属Phase03 OperationalStore行为约束、Phase03旧supplier fallback证据及Phase06 inventory AST证据；未修改PlatformRun、DesktopTaskService event contract、adapter、Publisher、media canonical preflight或Phase04 schema/interface。Phase03现拒绝跨稿件/target batch item并事务回滚；旧fallback detector覆盖`submitted/uncertain`且packaged ASAR同时核对MediaOrderService owner。Phase03扩展79/79、capacity19/19、完整223文件1265/1265及全部typecheck/packaging/最新Electron门禁通过。Phase04保持`IN_PROGRESS`，四项人工验收继续阻止release；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**

> **2026-07-29 第二轮整改检查点 C 最终权威边界：** 原17项`P1-01..P1-07`、`P2-08..P2-15`、`P3-16..P3-17`与`P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`共20项均复核为`VERIFIED`。旧ASAR current-source parity先7/8 RED，重建后source/export/import-call/test/ASAR 8/8；legacy media preflight、submission/jobs旧路径及Phase03 `reconcileRemoteOrder`/canonical→supplier fallback均物理消失且无wrapper。Phase03 schema确为v2→v3并增加新表和两个retained methods；Phase04的PlatformRun、DesktopTaskService event contract、adapter、Publisher及media canonical preflight interface没有当前production变化。专项131/131、capacity19/19、完整223文件1263/1263及三套typecheck、Auth/links/packaging、lint/format、pack smoke、packaged preload3/3、最新Renderer Electron focus1/1、diff check全绿；最新ASAR7,209,908 bytes（12:37:55.544 +08:00）。真实外部/投稿/同步/付费调用为0；下一动作仅为最终独立只读审计。Phase04保持`IN_PROGRESS`且四项人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

> 2026-07-29 第二轮整改检查点 B 边界：Phase 03 当前权威事实已纠正为OperationalStore schema v2→v3、新表`order_display_snapshots`、retained public `listOrderDisplayViews()`/`recordRemoteOrderObservation()`及A删除`reconcileRemoteOrder()`；历史“未改OperationalStore/schema/interface”结论失效，canonical inventory为109而非110。该schema/interface重开仍不改变Phase 04的PlatformRun、DesktopTaskService event contract、adapter、Publisher或media canonical preflight；Phase 04 interface判断保持无变化。v3 RED2/4→4/4、扩展45/45、三套typecheck、links180/180、packaging33/33及lint/format/diff通过，真实外部/投稿/同步/付费submit=0。下一动作严格为C复核；Phase 04保持`IN_PROGRESS`，四项人工验收继续阻止release。

> 2026-07-29 最终独立审计第二轮整改检查点 A 边界：Phase 03 已以 0/4 RED→4/4 GREEN 物理删除 OperationalStore `reconcileRemoteOrder` 及 canonical status→supplier code fallback，本轮新 ASAR 与既有 legacy path 合并门禁为 7/7。该删除收窄 Phase 03 OperationalStore public surface，但未修改 Phase 04 的 PlatformRun、DesktopTaskService event contract、adapter、Publisher 或 media preflight canonical boundary；Phase 04 schema/interface 判断不变。A 定向 23/23、三套 typecheck、lint/format、packaging 33/33、Renderer/pack smoke 通过，真实外部/投稿/同步/付费 submit=0。下一动作是检查点 B 的 Phase 03 schema/interface 事实核对；Phase 04 保持 `IN_PROGRESS`，四项人工验收继续阻止 release。

> 2026-07-29 P2-09 证据纠正：media inventory 由历史 18 项更正为 17 项；无 production consumer 的 `media.removeDraft` 已由 Phase 06 owner 全链物理删除。platform 仍为 10 项且 event producer/唯一 consumer/dispose 闭合。本轮未修改 PlatformRun、DesktopTaskService event contract、adapter、Publisher 或 Phase 04 冻结 interface；真实外部、同步、投稿及付费 submit 为 0，Phase 04 保持 `IN_PROGRESS`。

> 2026-07-29 检查点 A：Renderer platform bridge 与其他 non-Auth bridge 统一 fail-closed；未修改 PlatformRun、DesktopTaskService event contract、publisher adapter 或 Phase 04 冻结 interface。Phase 04 继续 `IN_PROGRESS`，四项人工验收仍阻止正式 release。
>
> 2026-07-29 检查点 B：逐 capability AST inventory 已证明 platform 10 项与 media 18 项均有真实 View/root→feature→bridge→preload→registrar/application consumer；`platform.stateChanged` 另有唯一 consumer、producer 与 dispose 证据。本轮没有无 consumer 项需要删除，也未修改 PlatformRun、Publisher adapter 或 Phase 04 冻结 interface。Phase 04 保持 `IN_PROGRESS`，真实外部、同步、投稿和付费 submit 为 0。
>
> 2026-07-29 检查点 C：无 production caller 的 `src/platforms/media/preflight.js` 已物理删除，随之删除仅验证该旧实现的测试；其 `resourceId/resourceName` 单资源 fallback 不再存在。当前 media preflight 仍只由 main/feature 的 canonical selected-resources owner 提供。source/current-ASAR RED 1/3→GREEN 3/3，扩展定向95/95、packaging33/33、三套typecheck和pack smoke通过；未修改 PlatformRun、Publisher adapter或冻结interface。Phase 04保持`IN_PROGRESS`，四项人工验收仍阻止release，真实外部/同步/投稿/付费submit为0。
>
> 2026-07-29 最终终态：Phase 04 owner 的 `P1-01` 与 `P2-AUDIT-02` 已在当前 production composition 和本轮 packaged ASAR 上复核；platform 10项、media 18项 capability 均有逐项 AST 调用链，`platform.stateChanged` 的 producer、唯一 consumer 与 dispose 闭合，legacy media preflight 及单资源 fallback 在 source/import/ASAR 均为零。222文件、1252/1252、专项138/138、packaged preload+legacy ASAR 6/6、最新 Renderer Electron focus 1/1 及其余第10节门禁通过。未修改 PlatformRun、DesktopTaskService event contract、adapter、Publisher或冻结interface；真实外部、同步、投稿、供应商及付费submit调用为0。Phase 04保持`IN_PROGRESS`，四项人工验收仍阻止正式release。**整改完成，等待最终独立只读审计。**

## 1. 阶段目标

重构平台执行生命周期和所有publisher adapter，使一个run拥有完整不可变上下文，每个平台只负责外部协议和证据采集。完成后新增平台不需要修改PublicationWorkflow，stop/watchdog/旧消息不会污染新run，模糊远端结果统一为`uncertain`。

关联工作：OPT-004、005、006、007、008、011、029；覆盖F-H03、F-H06、F-H08～H11、F-M16～M18。

## 2. 开始条件

- 阶段3为`COMPLETE`。
- PublicationWorkflow、Publisher interface和OperationalStore production切换完成。
- 阶段3交接列出每个平台证据缺口和当前contract fixture。
- 平台账号档案已进入target identity。

## 3. 必读输入

- 总纲、目标架构、协议、进度账本和阶段3交接。
- M08、M11、M12、M24、M25、M26、M27、M30 module报告。
- 当前desktop task/run、worker protocol、jobs、Playwright runtime、platform loader及四个平台implementation。
- OPT-004～008、011、029及风险决策文档。

## 4. 允许修改

- PlatformRun、worker protocol、publisher registry和平台adapter implementation。
- Playwright/runtime path、安全诊断和临时工件生命周期。
- 平台账号探测与本地account profile配置。
- 平台contract/fixture/fake server/worker/package测试。
- 为fail-closed需要的设置校验；不重构Renderer页面结构。

## 5. 禁止修改

- PublicationWorkflow外部interface和OperationalStore权威关系。
- 在adapter中重新引入ledger/batch/archive/attention访问。
- 使用生产账号、真实稿件或付费接口自动验收。
- 为兼容弱成功判断继续返回无证据`published`。
- 把原始DOM、Cookie、正文或整页截图写入诊断。

## 6. 实施步骤

### 6.1 建立PlatformRun深module

一个run context必须不可变持有：

- runId、publisher/account/target；
- child与消息channel；
- start time、heartbeat、watchdog；
- AbortController、stop reason；
- cleanup registry；
- phase和terminal result。

状态至少为`starting/running/stopping/terminal`。只有自己的terminal transition可以释放start gate；旧callback/finally不能清理新run。

外部interface保持小，例如`start(command)`、`stop(runId)`、`snapshot()`；pause若属于batch领取策略，不混进child生命周期。

### 6.2 重写worker协议

- 所有message携带schemaVersion、runId和闭集type。
- Worker只执行Publisher调用并返回outcome/heartbeat/progress。
- Main拒绝旧run、未知type、超大payload和敏感字段。
- Watchdog知道是否已进入remote-started；终止前由PublicationWorkflow保持durable intent。
- Stop是幂等请求，remote-started后直到child终结都不允许第二run。

### 6.3 头条adapter

- 账号探测返回稳定本地account profile和可脱敏remote fingerprint。
- 成功证据必须来自与当前文章绑定的response、remote ID、详情URL或同一内容节点。
- 跨行标题+状态、同名稿、无关toast、通用成功文案均不能`published`。
- 使用脱敏DOM/response fixture建立正负contract tests。
- 没有获批测试账号时，production启用保持人工验证门；本地implementation仍可完成。

### 6.4 列举adapter

- 移除整页通用success substring谓词。
- 优先解析当前请求响应或文章详情证据。
- 无文章级证据返回`uncertain`。
- 覆盖无关成功提示、同名内容和页面延迟。

### 6.5 河畔adapter

- 用异步child替代`spawnSync`，heartbeat和abort不被240秒阻塞。
- Python outcome包含stage、requestMayHaveBeenSent和安全错误code。
- POST前明确失败可`failed`；POST可能发送后的timeout/断连/protocol错误为`uncertain`。
- Cookie/payload使用最小权限临时目录、精确owner和启动残留清理。
- Production resolver只返回`app.asar.unpacked`中可执行的普通脚本文件。
- Fake HTTP server覆盖接收后断连、慢响应、HTTP拒绝和非法JSON。

### 6.6 媒体adapter

- endpoint必须显式配置，不保留隐式公网HTTP默认值。
- HTTPS无需额外确认；服务商当前仅提供HTTP时，必须由操作者显式勾选`allowInsecure`，未确认则在发送body前拒绝。
- HTTP状态必须持续显示“不加密连接”风险；媒体请求不自动跟随重定向，不允许从HTTPS静默降级；该例外仅适用于媒体provider。
- Production媒体发布只能由main进程通过platform settings解析完整config并构造client；旧worker `publishArticle -> createMediaAdapter()`空参路径必须退出production，不得为修复它而把API key发进worker message。
- 无production caller的旧`media/preflight.js`非dry-run和standalone空参client路径应删除或明确退出production，不能依赖隐式endpoint复活。
- Target使用media resource identity，outcome包含remote order evidence。
- 价格变化、资源下架、重复idempotency和超时结果明确分类。
- TLS、证书错误和fake server测试不使用真实API key。

### 6.7 安全诊断

- 默认只保存结构化诊断摘要和diagnosticId。
- 原始整页截图路径删除；确有需求时只能保存固定安全区域、遮罩后图像和短TTL，并由人工决策另行启用。
- DTO、日志、fixture和临时文件扫描不得含Cookie、API key、正文、账号名称或绝对路径。
- Cleanup归PlatformRun owner，正常、失败、stop、watchdog和启动恢复均覆盖。

### 6.8 删除旧运行路径

删除或退出production：

- 共享可变`activePlatformRunId`式状态；
- 旧jobs对ledger/archive的协调；
- 同步Hepan运行；
- 弱页面成功谓词；
- 原始截图；
- 返回`app.asar/...py`伪路径的resolver；
- 平台粒度、无账号的普通target构造。
- 媒体worker空参publisher和无caller的非dry-run preflight网络路径。

## 7. 测试要求

- PlatformRun快速start/stop、旧消息、旧finally、watchdog、cleanup恰好一次。
- 100轮stop-start交错和短真实child强杀。
- 每个平台Publisher contract及脱敏fixture正负测试。
- Hepan fake server、异步child、打包脚本self-test。
- Media显式HTTP确认/拒绝、3xx不跟随、HTTPS/TLS错误、main-process runtime config caller、remote ID和resource target测试。
- 账号切换：旧队列明确阻断，不静默改target。
- 敏感信息静态/像素/文件扫描。
- `electron-builder --dir`最终制品worker/Playwright/Python smoke。

## 8. 完成条件

- PlatformRun是唯一run lifecycle owner，旧run无法污染新run。
- Stop后child终结前第二start明确拒绝。
- 所有publisher只返回证据化outcome；弱证据全部`uncertain`。
- 换号后旧队列阻断，target记录accountProfileId。
- Hepan异步、可abort、heartbeat不阻塞，脚本在最终制品执行。
- Media无隐式公网HTTP默认值；HTTP只有在显式配置并确认风险后可用，未确认时不发送body。
- 无原始诊断截图和异常退出秘密残留。
- 新增fake publisher无需修改PublicationWorkflow即可通过contract suite。

## 9. 停止条件

- 必须用生产账号/付费投稿才能证明基本正确性。
- 平台无法获取文章级证据且implementation仍试图返回`published`。
- Publisher需要访问OperationalStore才能工作。
- Stop/cleanup要求callback读取全局当前run。
- implementation尝试静默启用HTTP、跳过`allowInsecure`确认，或把媒体例外扩展到其他provider。
- Fixture无法脱敏。

## 10. 人工验收

本阶段可在无真实账号下完成代码和fixture验收，但以下项目必须保持“待人工”直到获授权：

- 头条/列举受控测试账号成功投稿及remote ID核对。
- 河畔测试账号断连后的远端核对。
- 媒体服务商HTTP endpoint的人工风险确认、测试资源投稿；服务商未来提供HTTPS后优先迁移验证。
- Production签名制品中的真实浏览器登录。

人工项未完成不允许正式release，但不阻止阶段5本地重构。

## 11. 交接重点

列出PlatformRun状态机、worker message schema、publisher registry、每个平台证据优先级、所有待人工项、禁用feature flags、package smoke结果和已删除旧运行路径。

