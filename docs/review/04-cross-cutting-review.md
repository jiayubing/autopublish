# 横向专题审查

> 状态：已完成（2026-07-23）。基线为 `master@e8d817847bab3a9e6020006cab35340f645e527f`。本报告独立追踪跨模块生产调用链，并以当前已生成的模块深审报告交叉核对；只引用候选 `TEMP-*`，稳定编号由最终汇总阶段分配。

## 1. 范围、方法与总体结论

本轮按附件要求独立执行十项横向专题，而不是把模块报告重新排列。代码复核集中在五条端到端链：认证/工作区建立、内容生成与交接、普通平台投稿、付费媒体投稿、文章删除恢复和豆包采集诊断。每条链均从 renderer/IPC 入口跟踪到权威 store、外部边界、失败恢复和可观测出口。

当前横向结论如下：

- Electron renderer→preload→authenticated IPC、AI provider 密钥和工作区路径边界总体可靠；明确的安全缺口集中在媒体默认明文 HTTP、豆包原始诊断截图和旧客户响应注入新客户 UI。
- 最大系统性风险不是单个状态机，而是“远端事实 + publication ledger + submission batch + queue pair + archive/order”的跨所有者协调。正常路径有较强的占位和 fingerprint；进程退出、锁遗留或本地写失败时没有统一 durable recovery intent。
- 输入闭集、路径穿越和 safe DTO 普遍有测试，但逻辑身份在 seam 间仍有三类断裂：`Client.id→物理目录`、`generationTaskId→唯一文章`、`media resource→统一重试 target`。
- 运行观测不能完整表达发布故障：`publish-log` 没有 renderer 消费方，`submitting` stranded record 不进入 attention，部分关键错误只活在一次性返回 DTO。
- 测试数量和故障语义覆盖较强，但 CI 所在路径、生产/遗留 runtime seam、漏跑 `.mjs` 和外部/灾备矩阵使其尚不能作为完整发布门禁。

当前模块报告共含 41 条候选（高 16、中 24、低 1；按模块报告暂存编号统计）。横向去重后有四组不应重复进入最终 findings：媒体失败重试、stranded submitting、媒体资源全量加载、原生确认框。M02、M28–M31 已补齐模块报告；认证、部署与灾备事实仍区分代码证据和现场不确定性。

## 2. 端到端调用链

### 链 A：认证、工作区与业务 IPC 安全边界

`AuthGate → auth bridge/preload → auth IPC/client → auth server/domain/repository → authenticated runtime → workspace bootstrap → workspace runtime → authenticated IPC registrar`

- `desktop/main.js:45-62` 启用 sandbox/context isolation、禁用 Node integration并限制导航/权限；`desktop/preload.js` 只暴露白名单能力。
- `desktop/ipc/register.js:3-15,36` 在业务 handler 外统一执行 `requireAuthenticated`；`desktop/workspace-runtime.js` 只在认证后的工作区中组装服务。
- M01、M03、M04 的深审确认退出/切换与 handler dispose 有明确 owner；未发现 renderer 任意 IPC 或路径越界入口。
- 横向缺口在服务端运维面：TEMP-M29-01/02 记录 auth restore-check/backup 误判，TEMP-M30-01 记录仓库根没有可被 GitHub 识别的 workflow；这些是代码级 finding，现场 TLS、Tunnel、签名和灾备演练仍属未覆盖项。

### 链 B：内容源、AI 生成、文章聚合与投稿交接

`客户列表/资料/问题/研究/模板 → AI provider/prompt → generation batch → ArticleStore → generation handoff → submission preview/create`

- M15 的 safeStorage、HTTPS/loopback、Abort/timeout、模型输出校验和来源快照通过；M17 的单活批次、1–4 并发、暂停/停止和失败恢复通过。
- `client-knowledge.listClients` 返回 `client.json.id`，但 `question-store.clientDirectory` 把该 ID 拼成客户物理目录，形成 TEMP-M14-1。
- `content-generation-batch-service.js:448` 保存文章；handoff 的 `findArticle` 仅在可选 `findByGenerationTaskId` 存在时做唯一性检查，而生产 `article-store.js:689` 不暴露该方法，形成 TEMP-M21-1。
- ArticleStore 双文件事务和来源 schema 较强；`listArticles` 按 `updatedAt` 而非文档要求的 `createdAt` 排序，形成 TEMP-M18-1。
- Renderer 单篇生成响应只比较请求闭包内旧 `clientId`，客户切换后可注入旧客户文章，形成 TEMP-M07-1。它是 UI 请求身份缺失，不与 M14 的物理路径问题合并。

### 链 C：普通平台投稿、worker、账本、归档与需处理中心

`生成/保存文章 → M20 submission pair/batch → M22 ledger reserve → M24 child worker → adapter → ledger outcome → archive/batch → M23 management/attention`

- 正常路径有文章×目标占位、attempt、pair/hash、worker 内重验和 `uncertain` 阻止盲重试；这部分由 M20/M22/M24 联合测试验证。
- M20 batch 仍是无 revision/锁的整文件 read-modify-write；main 与 worker 可丢失彼此 item/localArchive 更新（TEMP-M20-01）。
- publication store 的 `.lock` 只有正常 `finally` 删除，崩溃遗锁会永久阻断目标（TEMP-M22-01）。
- `remote-started` 后 stop 过早清 busy，允许第二 run 并使旧 worker 消息冒充新 run（TEMP-M24-01）。
- 同步 adapter 阻塞 heartbeat 后 watchdog 可 kill worker；ledger 已是 `submitting`，main 只改运行快照而不持久化 `uncertain`。attention 又只读取 `uncertain/failed`，构成 TEMP-M24-02 的根因和 TEMP-M23-02 的下游不可见后果，应合并而非计两次。
- 已知远端 outcome 后 `recordOutcome` 失败只写进返回 DTO，仍可继续归档（TEMP-M24-03）；这与锁遗留可组合，使 ledger、batch、archive 三方永久分叉。
- Adapter 自身的远端证据也有缺口：头条把全页任意标题和任意状态跨行拼成成功（TEMP-M25-01），列举把任意通用 success 文案当成本次发布成功（TEMP-M25-02）；二者可把错误事实继续固化到 ledger/归档。
- 浏览器 profile 和 publication target 只绑定平台、不绑定账号，换号后无法阻断错误账号投稿（TEMP-M25-03）。河畔 POST 的 timeout/连接异常被归为可重试 `failed` 而非 `uncertain`（TEMP-M26-01），与 ledger 幂等语义直接冲突。

### 链 D：付费媒体配置、资源、投稿、账本与订单

`Settings → media config → MediaClient → resource refresh/cache → renderer selection → resource-level ledger → sendArticle → order JSONL/sync → attention retry`

- `media-settings-adapter.js:51-57` 对批准的默认 `http://8.138.187.158:8082` 豁免 insecure 确认；`media-client.js:85-100` 通过该边界发送 API key、标题和正文，形成 TEMP-M27-01。
- 正常首次提交按 media resource 占位；但远端响应后先写 `submitted` 且没有 order ID，再 append JSONL。append 失败仍返回 success，形成 TEMP-M27-02。
- failed publication 进入 attention 后只剩 `platformId:"media"`，M20 generic retry 也只携带平台 ID；TEMP-M23-01 是 TEMP-M20-02 的 DTO/派生后果，两者同属“资源目标身份丢失”，最终只应保留一条根因 finding。
- 资源刷新只在空页停止、没有 ID 去重，最多 600 页；App 再请求 `pageSize:99999`。TEMP-M27-03 描述服务端根因，TEMP-M09-2 描述 renderer 放大，应合并为同一容量链。

### 链 E：文章删除、补偿、恢复与永久销毁

`回收预览 → submission/ledger/queue 影响快照 → fingerprint/token → durable removal transaction → 取消队列 → 移入 trash → startup recovery / restore / permanent delete`

- M19 的普通删除预览会重验 publication active 状态、pair/hash 和 selection fingerprint，并用 transaction cursor 保存跨 store 进度，正常补偿路径较强。
- transient 错误写成 `pending_auto_recovery` 后没有 timer/backoff；workspace 只在启动时调用一次恢复（TEMP-M19-1）。
- 永久删除 token 只绑定 `clientId/articleId`，不绑定 tombstone `deletedAt`/fingerprint/TTL；旧 token 已真实复现可删除恢复后再次回收的新版本（TEMP-M19-2）。
- Renderer 永久删除 prepare 在 try/catch 外，失败时成为未处理 Promise（TEMP-M07-3）；这是错误反馈缺口，不与后端 TOCTOU 合并。

### 链 F：豆包采集与失败诊断

`客户/问题 → Doubao IPC → collection queue → Playwright profile/page → DOM parser → research store；错误 → screenshot + structural summary`

- 队列容量、串行状态、暂停/停止、DOM message 作用域、120 秒 deadline 和诊断组数量有测试。
- TEMP-M14-1 可在进入队列前阻断合法逻辑客户 ID。
- `doubao-browser-adapter.captureDiagnostic` 直接调用 `runtime.screenshot`，后者执行 Playwright 原始页面截图，没有遮罩/裁剪；TEMP-M16-1 是独立的敏感数据落盘问题。

## 3. 十项横向专题

### 3.1 身份认证、授权与安全边界

结论：桌面 renderer→主进程权限边界总体通过；客户数据隔离和外部传输存在三条已证实缺口，认证 HTTP/domain 另有 TEMP-M28-01 的内存可用性风险，部署边界仍需现场证据。

- 正面证据：Electron sandbox/context isolation、导航/permission allowlist、preload 白名单、authenticated IPC wrapper；AI API key 使用应用级 safeStorage且不回传 renderer；publication/tombstone DTO 不保存正文/凭据。
- 缺陷证据：TEMP-M27-01（默认公网 HTTP 发送 key/正文）、TEMP-M16-1（未脱敏诊断 PNG）、TEMP-M26-03（强杀后明文 Cookie/正文临时文件残留）、TEMP-M07-1（旧客户响应注入新客户 UI）、TEMP-M25-03（执行会话/目标没有账号身份）。TEMP-M14-1 是身份路径错误而非授权绕过，但会破坏客户边界一致性。
- 第一阶段待核：auth server 的 Cloudflare Tunnel/trustProxy、真实客户端 IP、Windows ACL、真实 TLS 和生产 base URL；对应 R2、R13，需 M28/M30 深审或现场配置证据。
- 候选映射：TEMP-M07-1、TEMP-M16-1、TEMP-M25-03、TEMP-M26-03、TEMP-M27-01；不与其他专题重复计数。

### 3.2 数据一致性、事务、并发与幂等性

结论：单一 store 内部多使用原子替换、journal、attempt 和 fingerprint；跨 store/跨进程边界仍是最高风险面。

- 权威划分：ArticleStore 拥有文章 pair；publication ledger 拥有远端目标事实；submission batch/sidecar 是执行和审计材料；order JSONL 保存媒体订单关联；removal transaction 保存删除补偿 cursor。
- 关键风险簇：TEMP-M20-01（batch lost update）、TEMP-M22-01（崩溃锁）、TEMP-M24-01（run 重入/消息错归）、TEMP-M24-02 + TEMP-M23-02（中断后 stranded submitting）、TEMP-M24-03（outcome 落账失败后仍归档）、TEMP-M27-02（order ID 持久化窗口）。
- 删除链：TEMP-M19-1 是恢复调度缺失；TEMP-M19-2 是确认对象 TOCTOU。生成链的 TEMP-M21-1 是唯一身份不变量缺失。
- 外部 outcome：TEMP-M25-01/M25-02 会把弱页面信号固化为 `published`；TEMP-M26-01 会把 POST 后未知结果固化为可重试 `failed`。它们发生在 adapter 证据层，不与 M24 的 worker lifecycle finding 合并。
- 幂等保护有效面：ledger 对 active/uncertain 阻止重复 reservation，attempt ID 拒绝旧更新；M20 create/retry 有 pair fingerprint；M17 成功任务不重复生成。
- 根因判断：不是“所有文件写都不原子”，而是多所有者提交没有统一 recovery journal，且 worker lifecycle 事件没有被持久化成 ledger 可恢复状态。

### 3.3 API 契约、输入验证与错误协议

结论：路径/字段闭集和 safe IPC response 普遍较强；跨模块身份 DTO 与错误传播有明确断裂。

- 身份契约：TEMP-M14-1 违反 `Client.id != directory name`；TEMP-M21-1 违反 `generationTaskId` 唯一文章；TEMP-M20-02 + TEMP-M23-01 丢失 media resource target，最终应合并。
- 事件/错误契约：TEMP-M05-1 中 `publish-log` 有发送端无 preload/renderer 能力；TEMP-M07-3 的预检 reject 越过 catch；TEMP-M24-03、TEMP-M27-02 的关键持久化错误只留在一次性 DTO。
- 外部结果协议：TEMP-M25-01/M25-02 缺少文章级远端成功证据；TEMP-M26-01 对调用已开始后的 transport exception 使用错误的 `failed` 语义。
- UI 契约：TEMP-M07-2 与 TEMP-M08-2 都是原生 confirm 绕过统一 modal host，应合并成一条跨内容/平台入口的确认契约 finding。
- 不重复项：TEMP-M18-1 是明确排序业务规则漂移；TEMP-M09-3 是“清空记录”标签与仅内存行为不一致；TEMP-M10-1 是 lifecycle 状态未收敛。

### 3.4 数据库、缓存、消息队列和后台任务

结论：桌面端没有通用数据库/消息队列，主要使用文件 store、child worker 和内存队列；这种部署匹配单机产品，但崩溃恢复、锁租约和容量必须由应用自己承担。

- 文件 store 优点：ArticleStore journal、publication temp+rename、removal transaction、submission pair/hash 都有损坏或部分失败检查。
- 后台任务缺口：TEMP-M19-1 没有真正的 auto-recovery scheduler；TEMP-M24-02 的 heartbeat 与同步 adapter 不兼容；TEMP-M20-01 的 main/worker batch update 无跨进程协调。
- 临时任务数据：TEMP-M26-03 的 Cookie/payload 仅依赖进程 `finally` 删除，没有启动期残留恢复。
- 缓存缺口：TEMP-M27-03/TEMP-M09-2 的资源 cache/IPC 全量链无去重和容量上限；M23 management snapshot 用 workspace revision 防 stale，当前 mutation 映射未发现漏刷新。
- Auth SQLite：repository 使用 transaction 和 `PRAGMA integrity_check`；TEMP-M29-01/02 已确认备份目标未被校验且 restore-check 会创建/迁移不存在的目标。migration 版本写入顺序及每次 health 全库扫描仍是容量/运维验证项。
- 无传统 broker：所有任务恢复依赖本地 JSON/JSONL、信号文件和 child IPC，因此不能假设有外部 exactly-once/visibility timeout 保护。

### 3.5 性能、资源使用和容量风险

结论：唯一已复现的显著容量缺陷是媒体资源的请求放大与全量复制；其他文件列表、同步日志和 auth health 的风险需要真实规模数据。

- 已验证：TEMP-M27-03 + TEMP-M09-2。异常分页可请求 600 页并累积重复资源，随后用 `pageSize:99999` 跨主进程/IPC/renderer复制；两条只计一个根因 finding。
- 生命周期资源：M01/M04 的 disposer、M12 self-check profile 和 M17 runner dispose 有明确清理；M24 stop/run context 共享导致 child 生命周期失守（TEMP-M24-01）。
- 阻塞调用：Hepan `spawnSync` 最长 240 秒会阻塞 worker heartbeat，真实可靠性后果已计 TEMP-M24-02，不再另计“性能问题”。
- 待容量实测：ArticleStore 同步读取客户全部文章、logger 同步 append、超大 prompt/DOCX、500 项生成/采集，以及 auth `integrity_check`。当前没有真实客户数、资源数、文章数、RPS 或延迟 SLO，不能升级为确定 finding。

### 3.6 配置、环境变量、密钥和第三方依赖

结论：AI 配置边界符合契约；媒体默认 transport 是高风险配置缺陷；外部平台现场契约仍是主要不确定性。

- M15：仅允许 HTTPS 或 loopback HTTP，API key 加密存储，workspace `.env` 不作为 provider 密钥源，timeout/Abort 已实现。
- M27：TEMP-M27-01 的默认 HTTP 被特殊豁免，且 multipart 携带 API key 和完整稿件；实际生产是否另有 TLS/VPN 只能影响置信度，不能消除代码默认。
- 浏览器/profile：M12 会话隔离和临时 self-check 清理通过；M16 PNG 与持久 profile 的 ACL/备份策略待现场核对。
- 浏览器/河畔：TEMP-M25-03 表明平台 profile 没有账号 identity；TEMP-M26-03 表明 Cookie/payload 的异常生命周期不闭合。河畔 Python HTTP 固定 HTTPS origin，错误 JSON 不回显 Cookie/正文。
- 第三方契约缺口：媒体服务端幂等键、订单状态、分页元数据；头条/列举/河畔 DOM 和远端确认；Cloudflare Tunnel。未对真实系统发请求，避免投稿/扣费。

### 3.7 日志、监控、审计和故障诊断能力

结论：本地文本日志和 publication/order 记录提供基础审计，但故障从 worker/store 到 UI 的可见性不闭合；敏感诊断本身又构成风险。

- TEMP-M05-1：`publish-log` 从 worker/main 发送后没有 preload/renderer consumer。
- TEMP-M24-03：ledger write failure 只留在 worker result；TEMP-M27-02：order append error 只留在本次 result；二者没有 durable attention intent。
- TEMP-M23-02：`submitting` 不进入 attention，management 又显示成 queued；这是 TEMP-M24-02 的不可观测后果，应合并。
- TEMP-M16-1：诊断 PNG 未脱敏；结构化 JSON 已做字段约束且诊断最多 20 组，不能抵消像素泄漏。
- TEMP-M26-03：强杀/cleanup failure 后明文 Cookie 和文章 payload 留在本地，且 cleanup 错误被吞；既是秘密生命周期问题，也是诊断/恢复不可见问题。
- Auth logger 默认 no-op、无集中 metrics/trace；真实生产是否注入 logger 未知。错误消息在部分 IPC seam 直接回传，尚未发现 key/cookie 明文日志，但内部路径泄漏和测试门禁由 M31 报告列为剩余验证项。

### 3.8 测试体系、CI/CD 和发布可靠性

结论：单元/集成测试数量和状态机覆盖较强，但执行门禁与生产 seam 不可靠，目前不能单凭测试通过批准发布。

- 当前定向验证包括：M22–M24/M27 联合 133/133 通过；M14–M21 联合 313 tests、308 pass、0 fail、5 skip；M01/M03/M04/M11/M12 相关 147 项中 145 通过、2 个 Windows symlink skip。命令集合有重叠，不相加作为全仓总数。
- M25/M26 的浏览器/河畔/打包联合验证为 59/59 通过；但没有头条/列举直接 adapter DOM 测试，河畔现有测试反而固定了 transport exception→`failed` 的错误语义，production packaging 测试只检查 YAML 文本而不执行最终 ASAR 脚本路径。
- TEMP-M04-1：架构测试约束非生产 workspace runtime/invalidation；renderer seam 专项有 2 个失败，仍要求已经弃用的 controller hooks。
- Article trash 扩大套件的 2 个失败来自 fixture 仍期待旧 `localArchive` 语义，与最新“pending 阻断回收”契约漂移，已排除为产品 defect，但证明测试需同步。
- TEMP-M30-01/TEMP-M31-01：Git 根没有 `.github/workflows`、默认 JS glob 漏跑 `.mjs`；Node 24 CI 意图与 Node 22 auth 镜像不同。代码事实已复核，生产安装/签名仍未现场验证。
- 未覆盖：真实 Electron 安装包、Linux auth 容器、TLS/Tunnel、真实外部站点、migration/backup destination、断电/磁盘满/Windows ACL。

### 3.9 跨模块耦合、循环依赖和架构违规

结论：静态扫描未发现直接文件级循环，但目录分层存在反向依赖，生产/遗留 seam 并存；更重要的是发布协调器接口过宽且权威边界需要人工理解。

- `src/core/files.js`、`src/content/client-material-store.js`、`generation-batch-store.js` 依赖 `desktop/workspace-paths.js`，`src/core/playwright.js` 依赖 desktop diagnostics；形成 `src→desktop` 反向边，而 desktop 又广泛依赖 src。
- TEMP-M04-1 是反向/重复 seam 的实际后果：测试和生产 runtime 分叉。renderer controller seam 红测提供第二个实例，而不是单纯目录风格偏好。
- publication ledger 的权威定义清楚，但 submission batch、sidecar、archive、order 和 attention 分属多个模块；TEMP-M20-01、M24-03、M27-02 证明协调失败已经发生为可达缺陷。
- M23 的 invalidation 是单一生产者、多 renderer consumer；当前 reason→scope 链未证明漏刷新，因此不把“多消费者”本身报告为架构违规。
- M25/M26 已核对动态 adapter 的直接运行图，未发现 CommonJS 初始化循环；第三方 Playwright/Python vendor 不据此声明已逐文件审查。

### 3.10 部署、启动、关闭、恢复和回滚能力

结论：桌面正常启动/切换/退出的 owner 清楚，异常恢复和服务端灾备尚不足以支撑“已验证可回滚”。

- 正面证据：M01 并发退出共享 promise；M03 工作区选择有 realpath/marker/write probe 和保存回滚；M04 handler/subscription/service 逆序 dispose；M17 成功任务重启不重复执行；M19 删除 cursor 可显式恢复。
- 异常恢复缺口：TEMP-M22-01（崩溃锁无回收）、TEMP-M19-1（仅启动一次恢复）、TEMP-M24-02/TEMP-M23-02（submitting 无启动修复）、TEMP-M24-03（无 outcome recovery journal）、TEMP-M27-02（无 order 关联重建）。
- Adapter/制品：TEMP-M26-02 证明 production ASAR resolver 指向 `app.asar` 内部伪路径而不是已解包 Python 脚本；TEMP-M26-03 没有启动期清理异常退出残留。TEMP-M25-01/M25-02/M26-01 则要求恢复/回滚决策先保守保存远端不确定性。
- Auth 灾备：TEMP-M29-01/02 已确认目标校验缺失和 restore false positive；v1→v2 migration、WAL/磁盘满和隔离恢复尚未演练。
- 发布门禁：TEMP-M30-01、TEMP-M26-02、TEMP-M31-01/02 已确认 CI 发现、ASAR 路径、默认测试 glob 和 seam 门禁问题；签名/SmartScreen 和实际安装升级未验证。
- 当前不能声明具备可靠 RPO/RTO 或自动回滚；只能说明正常关闭路径和部分文件事务补偿已实现。

## 4. 去重、根因与关联映射

| 最终合并建议 | 根因 | 应合并候选 | 保留为关联但不合并 |
|---|---|---|---|
| 媒体失败重试丢失资源目标 | attention/M20 retry DTO 只保留 `platformId`，没有 resource target | TEMP-M20-02、TEMP-M23-01 | TEMP-M27-02（订单关联是另一持久化窗口） |
| worker 中断后 publication 永久 stranded | 远端阶段 watchdog/退出没有 durable transition 到 uncertain，attention 又只识别 uncertain/failed | TEMP-M24-02、TEMP-M23-02 | TEMP-M22-01（锁可造成/放大阻塞）、TEMP-M24-03（已知 outcome 落账失败） |
| 媒体资源无界全量链 | 服务分页不去重/只等空页，renderer 绕过分页一次全取 | TEMP-M27-03、TEMP-M09-2 | TEMP-M06-1（stale request 是不同并发根因） |
| 统一确认宿主被绕过 | 内容/平台入口直接调用原生 confirm | TEMP-M07-2、TEMP-M08-2 | TEMP-M19-2（后端 confirmation token TOCTOU） |
| 发布多事实源恢复薄弱（专题关联簇） | ledger、batch、archive/order 缺统一 recovery intent | TEMP-M20-01、TEMP-M22-01、TEMP-M24-03、TEMP-M27-02 主题相关但不应强制合并 | 各自触发、数据所有者和修复原语不同，建议保留独立 finding |
| 身份 seam 不一致（专题关联簇） | 逻辑身份在模块边界被降级为目录名/可选方法/平台 ID | TEMP-M14-1、TEMP-M21-1、媒体重试合并项 | 三者对象和影响不同，建议保留独立 finding |

其余候选没有同根重复：TEMP-M05-1、M06-1、M07-1、M07-3、M08-1、M09-1、M09-3、M10-1、M16-1、M18-1、M19-1、M19-2、M24-01、M25-01、M25-02、M25-03、M26-01、M26-02、M26-03、M27-01。

## 5. 验证证据与排除项

- 重新读取并核对的关键生产边界包括：`desktop/main.js`、`ipc/register.js`、`workspace-runtime.js`；client/question/generation/article/handoff/submission；publication ledger/store；desktop task/worker/platform workbench；头条/列举浏览器 adapter 与河畔 Node/Python/ASAR；attention query；media settings/client/resource/workbench/order store；article removal/trash；auth server/repository/backup/restore；CI workflow。
- 已有最小复现证据被横向复核：Client.id 路径失配、generationTaskId duplicate、permanent delete stale token、worker stop 后双 child/旧消息污染、publication 遗锁、media order append 失败、资源重复分页、controller busy 卡死。
- 排除的误报：M13 通用 jobs 的 media ledger 绕过机制成立，但仓库内无生产调用者，未作为当前产品 finding；M23 多 renderer invalidation consumer 在当前 reason→scope 链没有漏刷新证据；M17 空闲 snapshot 选择最老终态批次缺产品语义；published-trash 红测是 fixture/契约漂移，不自动建立产品缺陷。

## 6. 未覆盖区域与现场不确定性

1. M02、M28–M31 已有模块深审报告；本报告仍不能替代真实部署、外部站点和灾备现场验证。
2. 未连接真实 AI、豆包、头条、列举、河畔或付费媒体 API，未执行投稿、扣费或账号操作。
3. 生产媒体 base URL/TLS/VPN、Cloudflare Tunnel/trustProxy、服务端幂等键、真实 API 分页和订单状态契约未知。
4. 未在真实 Windows 安装包验证 ACL、签名、SmartScreen、浏览器 profile/Cookie、杀软锁文件、磁盘满和断电。
5. 未执行 auth v1 升级、backup destination 校验或隔离 restore 演练；RPO/RTO 和备份保留没有现场证据。
6. 未获得客户/文章/资源/attempt/日志的容量分布和延迟 SLO；除已复现的媒体资源链外，不把理论性能风险升级为 finding。
7. 未真实强杀 worker/机器；stranded submitting 由生产状态机和 timeout 数值闭合证明，现场发生率仍未知。

## 7. 横向审查结论

十项专题均已执行，六条端到端链已核验。当前优先级最高的横向根因是：外部成功/未知事实的证据协议不可靠、远端事实缺少统一持久化恢复意图、worker lifecycle 与 ledger 状态机没有闭环、默认媒体 transport 不安全、失败诊断与 UI/attention 可观测链不完整。生成/文章/删除链的单 store 事务基础较好，但身份 seam 和破坏性确认仍有已验证缺陷。

在最终 findings 合并前，应先按第 4 节完成候选去重，并把 TEMP-M28–M31 纳入统一优先级；现场部署/灾备缺口未关闭前，本项目仍不具备无条件宣称可发布的证据，但已经具备开展修复方案设计和风险排序的基础。
