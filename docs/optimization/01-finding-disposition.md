# 审查发现独立复核处置

> 代码基线：`master@e8d817847bab3a9e6020006cab35340f645e527f`。  
> 输入中不存在 `REVIEW-XXX`；以下保留 `docs/review/05-final-findings.md` 的 37 个原始稳定 `F-*` ID，不伪造替代编号。

## 1. 处置统计

| 状态 | 数量 |
|---|---:|
| 接受 | 29 |
| 调整 | 3 |
| 合并 | 3 |
| 暂缓 | 1 |
| 待确认 | 1 |
| 驳回 | 0 |
| 基线失效 | 0 |
| 合计 | 37 |

“合并”表示 finding 本身成立，但应并入同根工作项，不建立独立补丁；“调整”表示机制成立，但严重程度、验证状态或影响边界需要改变。

## 2. 高风险 finding（15）

| ID | 处置 | 独立复核理由与当前代码证据 | 对应优化项 |
|---|---|---|---|
| F-H01 | 接受 | `ArticleGenerationView.tsx:175-185` 只将响应 `clientId` 与请求闭包中的旧 `clientId` 比较；`ContentWorkbench.tsx:152-175` 切换客户只清当前 article，未取消仍挂载的请求。旧响应可写回共享 `article` state；后端 ID 校验会降低直接写错客户的概率，但不能消除跨客户 UI 混入。 | OPT-015 |
| F-H02 | 调整 | `ArticleEditor.tsx:44-51` 确实把已由 `media-workbench-service.js:241-251` 回读的 `remark/ignoreImages` 清零，`:90-101` 关闭即写回。问题成立；影响限于打开并关闭/保存的本地媒体草稿，不是无交互后台丢失，原“高”调整为中、P2。 | OPT-016 |
| F-H03 | 接受 | `doubao-browser-adapter.js:273-302` 直接调用 runtime screenshot；`core/playwright.js:266-271` 只执行整页截图，没有 DOM 遮罩、裁剪或像素处理。登录/challenge/timeout 等正常失败分支可达，结构化 JSON 白名单不保护 PNG。 | OPT-011 |
| F-H04 | 接受 | `publication-ledger-store.js:431-439` 对任意既有 `.lock` 直接报并发；`:469-482` 只在当前调用 `finally` 删除。无 owner token、创建时间、租约、PID 存活检查或启动回收。单聚合长期阻断真实成立。 | OPT-002 |
| F-H05 | 接受 | `desktop-task-service.js:199-235` watchdog 可 kill worker；worker heartbeat 是 `setInterval`（`run-task.js:155-170`），Hepan `spawnSync` 最长 240 秒会阻塞事件循环。ledger 已在 `platform-workbench-service.js:708-719` 进入 `submitting`，而 attention 只收 `uncertain/failed`（`article-attention-query.js:223-248`），reconcile 又仅接受 `uncertain`。 | OPT-003、OPT-004 |
| F-H06 | 接受 | `desktop-task-service.js:296-309` 在远端调用仍进行时把 `isPlatformRunning=false`；新 start 只检查该布尔值（`:153-155`）。旧 callback 在 `:215-218` 动态读共享 `activePlatformRunId`，旧 `finally` 还会清理新 run 共享字段，存在并发重复和消息错归。 | OPT-004 |
| F-H07 | 接受 | `platform-workbench-service.js:736-750` 吞下 `recordOutcome` 错误并继续按内存 outcome 计数；`:763-785` 仍可归档。下游没有 durable recovery intent，ledger 可留 `submitting`，batch/queue 却显示完成。 | OPT-003 |
| F-H08 | 调整 | `toutiao/adapter.js:255-266` 的标题和状态是两个全页独立谓词，`:348-351` 命中即写 `published`，文章级证据确实不足。真实生产 DOM、同名稿和 fallback 出现频率未现场验证，因此保留高后果但状态改为“需要验证”，不能无条件自动上线。 | OPT-006 |
| F-H09 | 接受 | Python 在 POST 后把任意 `RequestException` 输出 `HEPAN_REMOTE_REQUEST_FAILED`（`hepan_publish.py:303-321,725-730`）；Node 在 `adapter.js:229-243` 先将任意 `HEPAN_*` 映射为 `failed`。ledger 允许 failed 新 attempt，现实网络异常会导致盲重试。 | OPT-005 |
| F-H10 | 接受 | production `asarUnpack` 明确解包 Python 脚本，但 `runtime-paths.js:33-37` 仍返回 `__dirname/hepan_publish.py`；外部 Python 不理解 `app.asar` 虚拟路径。vendor resolver 已处理 `app.asar.unpacked`，进一步证明脚本 resolver 缺失。 | OPT-007 |
| F-H11 | 接受（处置更新） | `media-client.js:8,85-103,136-149` 原默认公网 HTTP 且发送 API key/全文；`media-settings-adapter.js:51-57` 原先特意豁免默认 HTTP 的显式确认。2026-07-25用户确认服务商当前只提供HTTP，因此不再以“全面强制HTTPS”为验收；改为删除隐式默认、HTTP必须显式配置并确认风险、底层client二次校验且持续显示未加密状态。 | OPT-008 |
| F-H12 | 接受 | `media-workbench-service.js:419-468` 先以不含 order ID 的 `submitted` 写 ledger，后解析并 append JSONL；append 异常只进入返回 DTO。ledger 与订单 store 都可能没有持久 orderNid，后续同步无法定位。 | OPT-009 |
| F-H13 | 接受 | `auth-server/scripts/backup.js:9-13` 完成 `backupTo(destination)` 后调用仍指向源库的 `repository.healthCheck()`；没有重新打开 destination。坏目标可被错误报告成功。 | OPT-010 |
| F-H14 | 接受 | `restore-check.js:4-12` 直接构造 repository；构造器 `sqlite-auth-repository.js:104-119` 会创建目录/文件、执行 migration 并校验新 schema。缺失路径会被改变成健康空库，检查命令具有副作用并可误报。 | OPT-010 |
| F-H15 | 接受 | Git 仅跟踪 `auto—publish/.github/workflows/ci.yml`，根 `.github/workflows/` 不存在；GitHub Actions 不发现嵌套 workflow。即使迁移文件，现有 steps 也未设置 `auto—publish` working directory。当前没有可信 PR 门禁。 | OPT-001 |

## 3. 中风险 finding（21）

| ID | 处置 | 独立复核理由与当前代码证据 | 对应优化项 |
|---|---|---|---|
| F-M01 | 合并 | `desktop/main.js:6` 使用根级 production runtime；`tests/architecture-seams.test.js:14-15` 仍读取 `desktop/services/workspace-runtime.js` 与旧 invalidation policy。问题成立，与 F-M20/F-M21 同属“默认门禁没有约束唯一生产 seam”，合并到门禁工作项。 | OPT-001 |
| F-M02 | 暂缓 | `workspace-runtime.js:89` 和 `platform-ipc.js:229` 确有 `publish-log` sender，preload/renderer 无 consumer。但当前文件日志仍存在，仓库没有“UI 必须实时显示日志”的产品契约；单独补一条宽事件 interface 的收益不足，先决定日志产品面再实施。 | OPT-028（暂缓） |
| F-M03 | 接受 | `App.tsx:83-106` 初始加载无 request ID；`:262-277` 失效刷新使用另一序列且不会使初始请求失效。慢初始请求可以覆盖更新后的 article/order state。 | OPT-015 |
| F-M04 | 接受 | 内容与平台生产代码仍有多处 `window.confirm/confirm`，而根领域上下文明确所有确认应由独立 modal host 负责 backdrop、焦点与 Escape。属于已写明 interface 漂移，不是样式偏好。 | OPT-024 |
| F-M05 | 接受 | `GeneratedArticlesView.tsx:485-494` 的 prepare await 位于 action try/catch 外，按钮以 `void` 调用；预检 reject 成为未处理 Promise，危险操作没有错误反馈。 | OPT-021 |
| F-M06 | 接受 | controller `pause()` 在 `platform-submission-controller.js:69-75` 递增共享 requestId，却不清 `submitting`；原 submit 的 `finally` 因 requestId 过期跳过（`:55-67`），busy 可永久保持。 | OPT-022 |
| F-M07 | 接受 | `media-resource-service.js:64-96` 仅空页终止、无 ID 去重，默认最多 600 页；`App.tsx:89,127` 再以 99999 全量跨 IPC。测试覆盖正常分页但未覆盖重复页/容量。 | OPT-020 |
| F-M08 | 接受 | `SettingsView.tsx:37-43` 的成功分支没有 `setChecking(false)`，只有 catch 清理；成功后按钮长期禁用。 | OPT-023 |
| F-M09 | 接受 | `client-knowledge.js:248-289` 明确由 metadata ID 查真实目录；`question-store.js:68-76,135-137` 却把逻辑 ID直接拼到 `clients/`。Doubao desktop service 直接调用该 store，目录名不等于 ID 时路径真实可达并失败。 | OPT-017 |
| F-M10 | 接受 | 产品契约要求创建时间倒序，`article-store.js:408-419` 明确按 `updatedAt` 优先排序，现有测试还固定该错误规则。影响是历史顺序，不涉及正文/发布事实，保留 P3。 | OPT-025 |
| F-M11 | 接受 | removal transaction 会增加 `retryCount` 并保留 `pending_auto_recovery`，但全实现无 timer/backoff；`workspace-runtime.js:75` 只在启动调用一次 recover。与明确的 bounded backoff 约定不符。 | OPT-018 |
| F-M12 | 接受 | `article-trash-service.js:118-140` token map 只保存 client/article ID，无 tombstone fingerprint、`deletedAt` 或 TTL；restore 会删除旧 tombstone但不清 token。旧确认可作用于同 ID 新回收版本。 | OPT-012 |
| F-M13 | 接受 | `submission-batch-store.js:80-91,139-197` 各更新均为 get 整文件→修改→rename，无 revision/lock/CAS。main 与 worker 各建实例，两个合法生产写者可覆盖彼此不同 item/localArchive。 | OPT-013 |
| F-M14 | 接受 | failed media record 含资源目标，但 `submission-preparation.js:86-110` 只用 `record.platformId`；`submission-export-service.js:21-44` 捕获 resource-required 后降级 untracked。attention DTO `article-attention-query.js:164-182` 同样不输出 resource ID。 | OPT-014 |
| F-M15 | 接受 | handoff 只有注入可选 `findByGenerationTaskId` 时才检查唯一性（`generation-submission-handoff-service.js:51-70`）；真实 ArticleStore interface `article-store.js:689` 不提供该方法。测试 double 的能力超过生产 adapter。 | OPT-019 |
| F-M16 | 调整 | `lieju/adapter.js:146-179` 将整页任意通用 success 子串视为成功，机制成立；但真实页面是否出现无关提示未验证，原中风险保留，状态改为“需要验证”，与头条共同建立文章级证据 interface。 | OPT-006 |
| F-M17 | 待确认 | 代码只按平台固定 profile/target，确实没有账号 ID；但若产品明确永久单账号且换号要求清空队列，是否把账号纳入 publication identity 会显著影响兼容和迁移。必须先取得业务账号模型。 | OPT-029（待决策） |
| F-M18 | 接受 | Hepan Cookie/payload 以明文临时文件写入，cleanup 错误被吞，且只依赖进程 `finally`（settings adapter `:233-273`、hepan adapter `:114-140,245-247`）。强杀路径可真实遗留秘密。 | OPT-011 |
| F-M19 | 接受 | auth domain 以攻击者可控 `loginName + source` 建 Map key（`auth-domain.js:197-211,344-350`），只有成功登录清当前 key；过期 timestamp 会在再次访问同 key 时过滤，但空 key 永久留存。属于有界化缺失的可用性风险。 | OPT-026 |
| F-M20 | 合并 | `package.json:9` 只匹配 `.test.js`，现有 `.mjs` 6/6 通过但不进入默认命令。与 F-H15/F-M01/F-M21 同属测试收集和生产 seam 门禁，合并实施。 | OPT-001 |
| F-M21 | 合并 | 本阶段实际运行 `renderer-workbench-controller-seams.test.js` 为 0/2，失败原因是仍要求弃用 hooks；生产已使用 controller，`.mjs` 行为测试 6/6。合并为“唯一生产 seam + 唯一默认测试面”。 | OPT-001 |

## 4. 低风险 finding（1）

| ID | 处置 | 独立复核理由与当前代码证据 | 对应优化项 |
|---|---|---|---|
| F-L01 | 接受 | `OrdersView.tsx:95-102` 明示“清空记录”，`App.tsx:245-248` 仅清 React state，orders bridge 没有删除命令；刷新必恢复。需要先决定是改文案还是实现持久删除。 | OPT-027 |

## 5. 根因与合并关系

| 根因簇 | 发现 | 规划处理 |
|---|---|---|
| 自动门禁未指向唯一 production seam | F-H15、F-M01、F-M20、F-M21 | 合并为 OPT-001；测试与 caller 通过同一 module interface，不再维护测试专用影子 seam |
| 远端事实缺少 durable recovery intent | F-H05、F-H07；关联 F-H04、F-M13 | OPT-002/003/004/013 按锁→恢复协议→run lifecycle→batch CAS 顺序实施，不做一个巨型改动 |
| Adapter 成功/失败证据没有文章级语义 | F-H08、F-H09、F-M16 | Hepan transport 语义（OPT-005）与浏览器页面证据（OPT-006）分开；前者可本地完成，后者需要外部 fixture/测试账号 |
| 敏感诊断/临时工件生命周期不闭合 | F-H03、F-M18 | OPT-011 统一最小落盘、ACL、启动清理与泄漏验证，但不同文件格式分别测试 |
| 媒体 resource target 在通用 DTO 中退化为 platform | F-M14 | OPT-014 在 attention→action→media coordinator 的 seam 保留 target identity；不与订单写入窗口 F-H12 混为一项 |
| Renderer 异步响应缺少统一请求身份 | F-H01、F-M03 | OPT-015 让 initial/refresh 和 client-scoped response 使用同一 request identity interface |

## 6. 复核结论

37 条 finding 全部完成代码级处置：没有误报到需要驳回，也没有基线变化导致失效；但 3 条需要调整验证/严重度，3 条应合并进同根工作项，1 条当前收益不足暂缓，1 条必须先取得多账号业务语义。29 条接受项并不等于 29 个独立修复；最终组织为 29 个 OPT，其中包含 2 个待决策项和 1 个暂缓项。
