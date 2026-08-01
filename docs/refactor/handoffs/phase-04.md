# 阶段04交接：平台运行期与 Publisher Adapters

> **2026-07-30 最终只读审计三项P1直接整改（当前唯一权威）：** 唯一`verifyCapabilityEvidence()`新增三项永久RED→GREEN反例：Renderer owner仅经未调用entry callback、owner仅作为未消费JSX prop、producer callback仅在`if(false)`中调用。入口现在只沿确证callback契约，JSX只接受intrinsic事件或闭合到子组件真实消费的prop，callback调用证明排除静态不可达分支；React `lazy`及既有React/标准异步集合边界按TypeChecker声明闭合。证据专项66/66、matrix33/33（109 capability、21 lifecycle、5 event）、fail-closed7/7，合计106/106；完整`npm test`225文件1366/1366，lint、定向Prettier与`git diff --check`通过。仅测试证据helper/test变化，Phase03/04/06 production、package input和既有制品未变；阶段继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 计划21最终审查后TDD交接（当前唯一权威）：** Phase04 production未改。共享的唯一公开`verifyCapabilityEvidence()` seam已对追加审查的五项假阳性串行RED→GREEN；证据专项60/60、production matrix/fail-closed组合100/100、matrix109/109、lifecycle21/21、event5/5，inventory仍109。完整测试1360/1360，标准`pack:smoke`及其余门禁通过。`P1-CONVERGENCE-01=VERIFIED`；Phase04=`IN_PROGRESS`，Phase07=`NOT_STARTED`，人工验收仍阻止正式release。真实账号、投稿、同步、扣费与付费服务调用为0；以下旧统计均为历史记录。

## 状态

- 当前唯一权威制品：Renderer/preload/ASAR/exe SHA-256分别为`E1B965347C5BEA36B27006555E0DCFC5E380211A6BA39D925A7516FFD204A860`、`3F56D207A9FB3BFB8C807CFCCA5DF3F5F57CC93B7D38DC97A128840433BFB8EC`、`71CD2F7A24CC0106D712348835B1803F943C6BB36F18E41133E025B1CA6BF073`、`60E05AFB17FF24E541DC9AEDCB82B749D8024B15F46CF66D51688B017239AAF6`；exe 225,485,824 bytes。

- 状态：`IN_PROGRESS`（2026-07-30 计划21整改已完成，等待最终独立只读审计；不得恢复`PENDING_HUMAN`或`COMPLETE`，四项人工验收继续阻止正式release。）
- 分支/基线：`codex/refactor-program` / `8cbce7f1761c4e67baf4467d89f0a8397e93d9db`；等待本阶段里程碑提交。
- 范围：仅阶段04；未访问真实账号、稿件、投稿、扣费或媒体API。

2026-07-30 最终复验更正：补充导出入口内dead arrow producer回归后corpus33/33、production suite33/33、最终全仓225文件1333/1333（164.262秒）；取代下方同日中间计数，Phase04边界与状态不变。

2026-07-30 当前权威交接：Phase04 production未改；event evidence现拒绝dead producer、同import第二consumer、noop返回disposer和不存在application path，并保持5/5 production event。corpus32/32、production suite33/33、完整225文件1332/1332及全部全局/制品/Electron门禁通过。ASAR7,212,371 bytes/SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`，staged=0、真实外部调用0。Phase04=`IN_PROGRESS`、Phase07=`NOT_STARTED`，人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

2026-07-29 证据引擎与订单链接整改交接（最新当前权威，取代下方同日统计）：production-level RED证明旧production verifier放行不存在的lifecycle state source/event producer；唯一`verifyCapabilityEvidence()`核心现由109项production matrix与20项mutation/acceptance直接共享，21项lifecycle和5项event逐项闭合，`P1-CONVERGENCE-01=VERIFIED`。Phase03 supplier `2→9`订单已按canonical published+安全持久URL修复，`P2-FINAL-ORDER-01=VERIFIED`；`P2-CONVERGENCE-02`继续`VERIFIED`。Phase04 production interface未改。inventory109（43 query、61 command、5 event）；完整225文件1318/1318、Auth16/16、links180/180、packaging33/33、capacity20/20（原冻结19项全通过）、13k projection、三套typecheck/lint/format、Renderer/preload/pack smoke、最新ASAR parity、packaged preload3/3、Electron focus1/1与diff均通过。ASAR7,212,371 bytes/SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe225,485,824 bytes/SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。staged为空，真实数据与外部/付费调用为0。Phase04保持`IN_PROGRESS`、Phase07保持`NOT_STARTED`，四项人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

2026-07-29 最终审计收敛交接（当前权威）：A以TypeChecker symbol identity重新闭合109项，其中platform/media registrar/application与event链均由作用域内真实symbol证明，12类mutation保持RED；B属于Phase03。Phase04 production无修改，PlatformRun、DesktopTaskService event contract、Publisher、adapter、media preflight、schema/interface均不变。完整1281/1281、capacity19/19、最新ASAR/preload/focus与全部门禁通过。下一动作仅为最终独立只读审计；Phase04保持`IN_PROGRESS`，四项人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

2026-07-29 第三轮整改交接（当前权威）：Phase03 attempt归属、Phase06 inventory证据与Phase03 fallback detector三项RED均已修复；Phase04 production未修改。Phase03扩展80/80、capability20/20、capacity19/19、完整223文件1267/1267及全部制品/Electron门禁通过。PlatformRun/DesktopTaskService event/adapter/Publisher/schema/interface不变，Phase04仍`IN_PROGRESS`且四项人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

2026-07-29 追加整改交接（当前权威）：三项RED的正确owner分别为Phase03 OperationalStore、Phase03 supplier fallback回归与Phase06 AST inventory；Phase04 production未修改。跨稿件/target batch item现被事务拒绝，MediaOrderService已进入packaged exact parity，109项inventory弱helper已移除。Phase03扩展79/79、capability19/19、capacity19/19、完整223文件1265/1265及全部制品/Electron门禁通过。Phase04 PlatformRun/DesktopTaskService event/adapter/Publisher/schema/interface不变，仍`IN_PROGRESS`且四项人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

2026-07-29 第二轮整改检查点C最终交接：原17项`P1-01..P1-07`、`P2-08..P2-15`、`P3-16..P3-17`及`P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`共20项均复核为`VERIFIED`。旧ASAR parity先7/8 RED，重建后source/export/import-call/test/ASAR 8/8；Phase03 reconcile/fallback及Phase03/04 legacy paths已物理删除且无wrapper。OperationalStore schema/public interface确有v2→v3、新表、retained methods等变化；Phase04 PlatformRun/DesktopTaskService event/adapter/Publisher/interface未变。专项131/131、capacity19/19、完整223文件1263/1263及全部typecheck/packaging/Electron门禁通过；最新ASAR7,209,908 bytes（12:37:55.544 +08:00），inventory109，真实外部/投稿/同步/付费调用0。下一动作仅为最终独立只读审计；Phase04保持`IN_PROGRESS`、四项人工验收继续阻止release。**整改完成，等待最终独立只读审计。**

2026-07-29 第二轮整改检查点B边界：Phase03已如实记录OperationalStore schema v2→v3、新表及两个retained public methods，A删除旧reconcile method；历史未改schema/interface与110 inventory结论失效，canonical为109。B的v3专项2/4→4/4、扩展45/45、三套typecheck、links180/180、packaging33/33等门禁通过。该Phase03重开未修改Phase04 PlatformRun/DesktopTaskService event/adapter/Publisher/media preflight interface；Phase04保持`IN_PROGRESS`，四项人工验收继续阻止release，真实外部/投稿/同步/付费submit=0。下一动作严格为C。

2026-07-29 最终独立审计第二轮整改检查点 A 边界：Phase 03 以0/4 RED→4/4 GREEN物理删除OperationalStore `reconcileRemoteOrder`及canonical→supplier fallback，最新ASAR合并legacy门禁7/7。该动作删除Phase 03 public method，但未修改Phase 04 PlatformRun、DesktopTaskService event contract、adapter、Publisher、media canonical preflight或任何Phase 04 schema/interface。A定向23/23、三套typecheck、lint/format、packaging、Renderer/pack smoke通过；真实外部/投稿/同步/付费submit=0。下一动作为Phase 03检查点B事实核对；Phase 04保持`IN_PROGRESS`，四项人工验收继续阻止release。

2026-07-29 P2-09 纠正交接：media inventory 由历史18项更正为17项，无 production consumer 的 `media.removeDraft` 已由 Phase 06 owner 从完整 IPC 链物理删除；platform仍为10项且event producer/唯一consumer/dispose闭合。未修改PlatformRun、DesktopTaskService event contract、adapter、Publisher或Phase 04冻结interface；Phase 04继续`IN_PROGRESS`，真实外部/投稿/同步/付费submit=0。

## 2026-07-29 检查点 A 边界记录

- Phase 06 Renderer platform bridge 与其他 non-Auth bridge 已统一 fail-closed；production-level行为测试由0/6 RED转为6/6 GREEN，扩展定向97/97与三套typecheck通过。
- 未修改PlatformRun、DesktopTaskService event contract、adapter、Publisher或其它Phase 04冻结interface；真实外部、投稿、同步和付费submit调用为0。Phase 04保持`IN_PROGRESS`，四项人工验收继续阻止正式release。

## 2026-07-29 检查点 B 边界记录

- capability-specific AST inventory 已逐项证明 platform 10 项、media 18 项的真实 View/root→feature→bridge→preload→registrar/application 链；`platform.stateChanged` 同时验证 producer、唯一 consumer 与 dispose。
- 未发现新的无 consumer capability；未修改 PlatformRun、DesktopTaskService event contract、adapter、Publisher 或其它 Phase 04 冻结 interface。定向89/89与三套typecheck通过；真实外部、投稿、同步和付费submit为0，Phase 04保持`IN_PROGRESS`。

## 2026-07-29 检查点 C 边界记录

- 无production caller的`src/platforms/media/preflight.js`已物理删除，其单资源`resourceId/resourceName`fallback及仅验证旧实现的测试同步消失；未迁移、re-export或保留wrapper。
- source/current-ASAR从1/3、2 fail转为新制品3/3；扩展定向95/95、packaging33/33、三套typecheck、lint、format、pack smoke与diff check通过。未修改PlatformRun、adapter、Publisher或冻结interface；真实外部、投稿、同步和付费submit为0，Phase 04保持`IN_PROGRESS`。

## 2026-07-29 最终交接

- `P1-01` 与 `P2-AUDIT-02` 已在当前 production composition、本轮新 Renderer 与 packaged ASAR 上重验；platform 10项、media 18项逐 capability AST 链完整，`platform.stateChanged` 的 producer、唯一 consumer及dispose闭合，legacy media preflight及单资源fallback在source/import/ASAR均为零。
- 完整门禁：222测试文件、1252/1252、0 fail/skip（158.040秒）；专项138/138；Auth16/16、links180/180、packaging33/33、packaged preload+legacy ASAR 6/6、最新Renderer Electron focus1/1；lint、format、三套typecheck、Renderer build、pack smoke与diff check均通过。
- 未修改PlatformRun、DesktopTaskService event contract、adapter、Publisher或冻结interface；全部验证使用VM、内存fake、合成fixture或本地Electron，真实外部、投稿、同步、供应商及付费submit调用为0。Phase 04保持`IN_PROGRESS`，四项人工验收继续阻止正式release。**整改完成，等待最终独立只读审计。**

## 2026-07-28 窄范围整改：Platform event runtime fencing

- RED：`tests/platform-submission-controller.test.mjs` 的“rejects delayed platform heartbeat and terminal events from the previous workspace runtime”在 runtime A→B 后注入 A event，实际把 B snapshot 写成`run-a`（断言`runId === null`失败）。
- 允许范围：`DesktopTaskService`、`platform-state` typed event/DTO、workspace runtime composition、Renderer platform feature与对应定向测试；不修改 adapter、Publisher、OperationalStore、ContentStore或Domain/Application接口。
- 目标：main/runtime sender 绑定 opaque `workspaceRuntimeId`；Renderer 在更新 run snapshot 和触发 terminal refresh 前验证其等于当前 scope。完成前保持`IN_PROGRESS`；完成后恢复`PENDING_HUMAN`而非`COMPLETE`。
- GREEN：`platform-state` contract、DesktopTaskService state query/event及workspace composition均传递同一runtime identity；feature先检查identity再写snapshot或terminal refresh。新增真实Renderer lifecycle fixture确认A→B后A heartbeat/terminal不会改变B snapshot、busy、queue revision或refresh次数。未触及adapter、Publisher、OperationalStore、ContentStore或Domain/Application接口；本轮状态保持`IN_PROGRESS`。

## 交付

- `PlatformRun` 是唯一 child lifecycle owner：`starting → running → stopping → terminal`；不可变publisher/account/target上下文与AbortSignal、schema v1/runId/闭集worker消息，旧消息、超大及敏感payload拒绝；remote-started 后直至 child exit 不释放 start gate，cleanup恰一次。
- 头条和列举删除弱页面成功谓词；没有当前文章绑定的response/详情URL/内容节点证据时均返回`uncertain`。
- Hepan 采用异步 child；POST后断连、超时或协议问题以`uncertain`收敛。Python JSON 给出`stage`及`requestMayHaveBeenSent`；打包resolver只接受 unpacked 普通脚本。Cookie/payload均为0600临时文件，正常/异常/启动恢复只回收严格命名、同目录、非链接且过期的普通文件。
- Media endpoint 必须显式配置；HTTP仅限媒体provider且须`allowInsecure`，UI持续显示“不加密连接”，不跟随3xx；worker媒体发布明确退出，API key不进入worker。
- Doubao诊断不再写整页截图、URL或绝对路径，仅写结构化摘要和diagnosticId。
- 普通平台 production 账号探测已接通：worker 仅对唯一已注册任务调用 adapter 的最小只读 `inspectAccount`；主进程核验显式 AccountProfile 与 platformId 后，以 `sha256(platformId + NUL + remoteAccountId)` 生成稳定脱敏指纹。原始 remote ID/displayName 不进入 workflow DTO、队列或发布记录。
- 本地 `platform-account-bindings.json` 仅保存 AccountProfile ID、platformId 和 opaque fingerprint，并以0600创建；首次绑定必须来自用户已显式选择的同平台 AccountProfile。后续远端身份漂移、profile/platform 不匹配、缺少可靠只读证据，以及损坏、链接或不可读绑定文件均 fail-closed，不会静默覆盖绑定。
- 首次目录制品人工 smoke 后补齐 AccountProfile 查询/确认/选择链路：普通文章入队和生成批次交接均携带显式 `platformId → accountProfileId` 映射；无档案时必须由用户确认当前登录账号，唯一已有档案可自动选中；媒体 resource target 不再进入普通账号队列。
- 修复投稿页二次提交遗漏 AccountProfile 的生产断点：队列 API 只投影 sidecar 中已有的 opaque AccountProfileId，Renderer 原样回传给 IPC；main process 仍以 sidecar 的 durable target/profile 作一致性校验，不能借此切换账号或让旧无档案队列通过。
- 文章管理页恢复独立“加入付费媒体投稿”入口：复用 `previewExport` / `exportArticle` 生产边界，仅将选中文章复制到媒体工作台；后续必须选择具体 `MediaResourceId` 并再次确认，该交接操作本身不投稿、不扣费。
- 修复首次制品暴露的 production 断点：`operational-content-submission-service` 已实现真正的 `previewExport` / `exportArticle`，原子写入 `input/media` 与 version 2 provenance sidecar；重复交接幂等，文件或sidecar冲突时 fail-closed。
- 普通平台不再在批次开始时一次性 claim 所有目标，而是每项临执行前原子 claim；首项账号校验失败不会遗留后续 `claimed` 项，租约过期项可按 OperationalStore 既有规则恢复，不删除旧队列或绕过有效执行租约。
- 头条和列举已通过 authenticated IPC/preload/bridge 暴露非阻塞“打开登录”与“检查登录”；检查成功后保存会话，Renderer 显示结构化状态。Hepan 不显示浏览器登录入口，继续使用配置/Cookie。
- Hepan adapter 已把服务商只读 `--check-login` 的受信账号节点转换为 `inspectAccount` 证据；只有 authenticated、合法数字 uid 与安全displayName同时存在才参与现有opaque fingerprint绑定，否则 fail-closed。

## 自动收口

- 已修复先前记录的 PlatformRun 上下文、文章级发布证据、Hepan abort/resolver/default runner、worker安全 outcome、media production network boundary和跨进程错误 DTO 问题；相应 Phase 04 定向测试均通过。
- `pack:smoke` 强制准备 Node runtime，构建后对真实 `release-alpha/win-unpacked/resources` 验证 app.asar、app.asar.unpacked 和 resources/tools/node；最终制品的隔离 Playwright 与 Hepan payload smoke 均通过。

## 自动验证

- `npm test`：929 pass、0 fail、0 skip（177个测试文件，约87秒；Windows、临时合成fixture；包含队列恢复、付费媒体 staging、浏览器登录和 Hepan 身份回归）。
- `npm run lint`、`typecheck:main`、`typecheck:renderer`、`typecheck:bridge`：通过；`test:auth` 16/16，`test:links` 173/173，`test:packaging` 33/33。
- `npm run pack:smoke`：通过，非签名 Windows `--dir` alpha 制品；真实目录 verifier 通过，捆绑 Node `v24.18.0` 与 Playwright CLI 隔离执行通过；未发布。首次重建因旧测试制品仍运行而 `EBUSY`，仅关闭该目录制品进程后复跑成功。
- 付费媒体入口回归：修复前 `node --test tests/renderer-content-client-switch.test.js` 精确因“加入付费媒体投稿”按钮不存在而超时；实现后 1/1 通过，并断言确认后请求为 `{ clientId, generatedArticleId, targetPlatform: "media", confirmed: true }`。随后全量 912/912 和最新目录制品重建均通过。
- 定向覆盖：100轮stop/start、旧消息、watchdog gate、cleanup once、短真实local child强杀；Hepan fake HTTP server POST后断连；HTTP确认/3xx/TLS fake transport；安全诊断与临时秘密残留回收。
- Phase 04 定向：PlatformRun、adapter browser evidence、Hepan resolver、media transport、account inspector/binding、worker-main contract 与 workspace lifecycle 共28/28；覆盖显式 profile/platform、只写opaque fingerprint、身份漂移和损坏绑定文件不覆盖。
- 投稿页回归：queue durable AccountProfileId projection、IPC forwarding、platform workbench 与 Renderer 共9/9；未绑定队列仍按原规则拒绝。
- 投稿 DTO 回归：`tests/platform-workbench-service.test.js` 与完整 `tests/phase-03-content-publication-chain.test.js` 共3/3通过；适配器缺失 `body` 时回读受校验源文件正文，标题-only 文件在工作台返回 `ARTICLE_BODY_REQUIRED`，不再穿透为 `Operational DTO is invalid`。
- 2026-07-26 蓝色河畔多行正文现场回归：最新 `hepan` 队列正文含 35 个换行；旧 `safeString()` 将换行误判为非法控制字符，首次提交返回 `PUBLISH_INPUT_INVALID / Operational DTO is invalid`，而 claim 已先持久化，立即重试返回 `OPERATIONAL_BATCH_ITEM_NOT_EXECUTABLE`。只读核验该现场没有创建 publication、attempt 或 recovery intent，未触发远端调用。
- 修复：publisher DTO 正文允许 `LF/CR/TAB`，仍拒绝其他控制字符；`PublicationSubmissionService` 在 claim 前校验完整 DTO，任何纯本地 DTO 错误都不会占用队列。新增多行正文端到端回归和 claim 前校验回归；定向 34/34、全量 1012/1012、links 176/176、packaging 33/33、lint/typechecks/format/renderer build 全部通过。
- 打包：旧 `release-alpha/win-unpacked` 正被用户窗口占用，标准 `npm run pack:smoke` 本轮因 Windows `EBUSY` 未覆盖；使用相同配置生成独立 `release-alpha-fixed/win-unpacked`，`node scripts/verify-alpha-package.js release-alpha-fixed/win-unpacked/resources` 通过。未连接真实蓝色河畔或执行投稿。
- 2026-07-26 账号核验现场回归：DTO 与 claim 修复后，蓝色河畔在投稿前返回 `Current platform account could not be verified`；只读数据库显示该项已安全回到 `queued`，没有 publication/attempt。根因是 production AccountInspector 仍直接调用旧 Hepan adapter，未接入应用设置服务保存的 Python/Cookie/vendor 配置。现由 runtime adapter seam 复用 `platformSettingsService.test("hepan")` 的只读 `--check-login` 结果，并仅转换安全 uid/displayName；无效结果继续 fail-closed。账号 runtime 定向 34/34、全量 1014/1014、lint、main typecheck、format 均通过；独立 `release-alpha-fixed` verifier 重建通过。未执行真实投稿。
- 本轮现场故障定向：`phase-03-operational-content-submission`、`phase-03-content-publication-chain`、`phase-04-*`、`platform-account-*`、Hepan login/publish contract 与 Renderer regression 共49/49通过；红测分别复现缺失 `previewExport`、批量遗留 claim/过期 claim 不可恢复、缺失登录 handler/UI 以及 Hepan 缺少 `inspectAccount`。

## 2026-07-26 蓝色河畔现场 Playwright Node 回归

- 现场症状：蓝色河畔提交前置能力检查返回 `Bundled Playwright Node is unavailable`。
- 根因：Node 由 `extraResources` 安装到 `resources/tools/node/node.exe`，但 runtime diagnostics 只按 `appRoot/tools/node/node.exe` 查找；打包应用的 `appRoot` 是 `resources/app.asar`，导致“文件存在但 resolver 不可见”。Playwright CLI 同时位于 `resources/app.asar.unpacked/node_modules`，也必须使用独立 resources/unpacked 语义。
- 修复：`resourcesPath` 从 Electron main 贯穿 WorkspaceRuntime、runtime-config 和 diagnostics；packaged resolver 优先解析 `resources/tools/node` 与 `resources/app.asar.unpacked/node_modules/@playwright/cli`，不依赖 PATH 或用户配置。
- 防回归：新增真实 packaged-layout 单测；alpha verifier 现在临时解包实际 `app.asar`，用最终 `resources` 路径执行 runtime diagnostics，并在 Node/CLI unavailable 时失败，不再只证明资源文件“存在”。
- 验证：原始最小复现由 Node=`null` 转为 bundled Node/CLI；runtime/WorkspaceRuntime 26/26，packaging 37/37，完整 `npm test` 189 files、1010 pass/0 fail/0 skip；lint、main/bridge typecheck、format、packaging 33/33、`git diff --check` 通过；`npm run pack:smoke` 重建并通过最终 resources verifier。
- 未连接蓝色河畔账号或执行真实投稿；新解包制品位于 `auto—publish/release-alpha/win-unpacked`。阶段仍为 `PENDING_HUMAN`。

## 数据、回滚与人工项

- 未修改 PublicationWorkflow public interface、OperationalStore authority 或持久化schema；迁移/回滚不适用。
- 待人工：头条/列举受控账号 remote ID 核验及首次显式 profile binding；Hepan断连后远端核对；媒体服务商HTTP风险确认与测试资源；签名正式制品中的真实浏览器登录。
- 用户决策：入队后撤销、清理及其他跨页状态/UI问题不在本次 Phase 04 局部修复中扩展，留给 Phase 05/06 按完整重构边界统一收口。
- 自动收口：已移除宽泛`asarUnpack: "**/*"`；Alpha/production共享显式边界。最终resources verifier分开验证app.asar应用文件、app.asar.unpacked运行文件、普通非链接Hepan脚本及两侧私有数据，并执行最终制品Playwright/Hepan安全smoke。
- 停止条件：未触发。阶段保持`PENDING_HUMAN`，不得标记`COMPLETE`。Phase 05为`READY`，允许本地重构；四项人工验收仍阻止正式release。
