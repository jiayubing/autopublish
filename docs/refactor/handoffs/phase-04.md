# 阶段04交接：平台运行期与 Publisher Adapters

## 状态

- 状态：PENDING_HUMAN（自动门禁、最小解包目录制品与本地安全 smoke 已通过；不得标记`COMPLETE`）
- 分支/基线：`codex/refactor-program` / `8cbce7f1761c4e67baf4467d89f0a8397e93d9db`；等待本阶段里程碑提交。
- 范围：仅阶段04；未访问真实账号、稿件、投稿、扣费或媒体API。

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
- 本轮现场故障定向：`phase-03-operational-content-submission`、`phase-03-content-publication-chain`、`phase-04-*`、`platform-account-*`、Hepan login/publish contract 与 Renderer regression 共49/49通过；红测分别复现缺失 `previewExport`、批量遗留 claim/过期 claim 不可恢复、缺失登录 handler/UI 以及 Hepan 缺少 `inspectAccount`。

## 数据、回滚与人工项

- 未修改 PublicationWorkflow public interface、OperationalStore authority 或持久化schema；迁移/回滚不适用。
- 待人工：头条/列举受控账号 remote ID 核验及首次显式 profile binding；Hepan断连后远端核对；媒体服务商HTTP风险确认与测试资源；签名正式制品中的真实浏览器登录。
- 用户决策：入队后撤销、清理及其他跨页状态/UI问题不在本次 Phase 04 局部修复中扩展，留给 Phase 05/06 按完整重构边界统一收口。
- 自动收口：已移除宽泛`asarUnpack: "**/*"`；Alpha/production共享显式边界。最终resources verifier分开验证app.asar应用文件、app.asar.unpacked运行文件、普通非链接Hepan脚本及两侧私有数据，并执行最终制品Playwright/Hepan安全smoke。
- 停止条件：未触发。阶段保持`PENDING_HUMAN`，不得标记`COMPLETE`。Phase 05为`READY`，允许本地重构；四项人工验收仍阻止正式release。
