**项目整体审查：日常链路、架构与重构遗留（2026-09-10）**

本文保留修复前 Primary Audit。后续用户已授权实施；本轮修复、最终验证及 closure 结论见 [REMEDIATION-2026-09-10.md](REMEDIATION-2026-09-10.md)，下文 BLOCKED 不再代表当前状态。

结论：架构主体具备继续开发的基础，不需要再启动全项目重构；目前不宜直接将日常工作链路标为稳定，也不建议马上叠加新的投稿/订单功能。先关闭 R1–R3，收敛产品合同偏差及 CI 格式失败，再开展一批有限旧代码清理。R4 按日常数据规模决定先后。此次是一次新的 Primary Audit，未实施修复，不能标记 remediation/closure PASS。

**Scope 与证据边界**

- 审查代码基准：`master`，`69b5fbd9a9b66f7d7eee42dc1914ad9bd164340a`。开始时工作树干净；全部行为测试运行期间未修改生产源码、schema 或已有测试。
- 按 README → AI-ENTRY → WORK-INDEX 进入当前 Codebase Governance Plan，再查必要 SPEC、执行/审计协议、源码和直接测试；没有把 archive/handoff 当作当前调度规则。
- 对 src、desktop、media-workbench/src、auth-server/src 的 480 个 JS/TS 源文件（约 10.8 万行）完成文件与依赖入口盘点，沿核心用例逐段追踪 owner、生产装配、调用方和失败边界。该数字是盘点范围，不表示每一行都经过逐行人工证明。
- 核查链路：鉴权/内容库启动与切换 → 客户资料/采集 → 单客户与批量生成 → 文章编辑与权限 → 普通投稿/付费确认 → 结果、订单与人工核对 → 回收恢复 → Renderer 刷新、IPC、安全与打包合同。
- 检查不变量：唯一文章身份/活动目标、CAS 与锁内事实复读、发布成功永久冻结、FIFO/同平台串行、付费前复核、不确定结果禁止自动重试、迟到 observation、重启暂停、历史证据保留、前后端职责和工作区隔离。
- 本机为 Windows、Node `v24.16.0`、npm `11.13.0`。鉴权 CI 基线是 Linux Node 22；本机鉴权通过不等于已验证该 CI 环境。
- 所有探针使用合成数据、隔离临时内容库、假投稿 transport 或本地回环 HTTP。没有访问用户客户资料、真实账号、真实投稿/上传/付费/订单、生产数据库或服务器。

**已确认 findings（严重度按当前全库审查风险，来源均为既有问题）**

**R1 · P1 · EXPOSED_PREEXISTING：投稿执行未纳入运行环境销毁，数据库先于在途结果关闭。**

定位：`auto—publish/desktop/composition/workspace-runtime-composition.js:424–453`；数据库关闭注册在 `:171–174`；普通与付费 orchestrator 的公开接口均缺少 dispose/drain。

触发：投稿请求已发出，在返回前关闭应用或销毁内容库运行环境。composition 只等待已注册的 disposer/service；普通队列及付费批次没有注册进该生命周期。随后 OperationalStore 被关闭，在途请求仍可能返回。

行为复现使用真实 workspace composition、真实 SQLite 和假普通投稿接口：远端请求已开始 → `composition.dispose()` 已返回而请求未结束 → store 报 `OPERATIONAL_STORE_CLOSED` → 释放假接口并返回 accepted → outcome 落库同样报 `OPERATIONAL_STORE_CLOSED`；重新打开合成数据库后记录仍是 `remote_started`，remoteId 未保存。普通链路已实证；付费链路的同型装配缺口由源码确认，未调用真实服务商。

影响：本来可以确认的成功/订单号变成需要人工核对的记录；退出、切库和在途副作用没有闭合。已有重启恢复和禁止重试保护可以限制后果，但不能代替在退出前记录已到达的真实结果。

Owner：workspace runtime composition、regular-queue-group-orchestrator、paid-media-batch-orchestrator。修复方向：先停止领取后续任务，按明确期限等待在途 outcome 完成或保留可靠 uncertain 边界，再释放会话/store。不能伪造远端取消，也不能仅吞掉 closed-store 错误。

**R2 · P2（阻塞）· EXPOSED_PREEXISTING：旧任务快照仍用于忙碌判断，当前投稿对保护逻辑不可见。**

定位：`desktop/services/desktop-task-service.js:9–17`、`desktop/workspace-bootstrap-service.js:266–292`、`desktop/services/platform-settings-service.js:179–184`；当前实际投稿在两个新 orchestrator 中运行。

旧 worker 已退役，desktop-task-service 只读取历史 platform-task-snapshot，没有接收当前队列/付费执行更新。上述 R1 探针中，在远端请求未结束时该快照仍为 idle，所有 running 标志为 false，`platformSettingsService.save('hepan', ...)` 实际成功。切库 busy 检查和缓存维护也消费这一旧活动信息。

影响：用户可在当前投稿期间修改平台配置；切库保护不能看到普通/付费投稿活动。此处已证明保护失效，没有声称真实账号误投已经发生。

Owner：runtime 活动投影及 settings/workspace/storage maintenance 的调用方。修复方向：从现有执行 owner 暴露只读活动信息并接入保护，随后退役旧快照。不要为兼容旧字段复制第二套任务状态机。注意内部账号核验目前也调用 settings.test；修复时必须区分用户配置修改与执行期间只读核验，不能简单把所有 test 请求一律 busy 拒绝。

**R3 · P2（阻塞）· EXPOSED_PREEXISTING：鉴权接口收到非法 JSON 时请求永久不 settle。**

定位：`auto—publish/auth-server/src/server.js:109–116`。

`readBody` 在 JSON.parse 前把 settled 设为 true；解析抛错后 fail 因 settled 已为 true 而忽略 reject，导致 handle 一直等待。

本地 HTTP 实证：同一隔离 server 的 `/v1/auth/login` 收到 `{}` 立即返回 HTTP 400；收到 `{` 不返回，探针在 700 ms 后主动断开。源码确认没有其它路径将该 Promise settle，700 ms 是探针停止期限，不是服务端修复或正式超时。

Owner：auth-server HTTP transport。应先成功解析，再标记 settle；增加格式错误 JSON 的端到端 HTTP 回归，断言 HTTP 400 与安全错误码，并保留 oversized body 测试。

**R4 · P2（按规模处理）· EXPOSED_PREEXISTING：文章管理全量快照在千篇规模存在已测得的秒级成本。**

定位：`desktop/services/article-management-snapshot.js:205–232` 及 ArticleStore 的同步枚举/文件读取。现有缓存命中表现良好，保存导致 revision 变化后重新读取当前客户的全部文章、正文和相关事实。

来自当前源码已有 `article-management-snapshot-storage-cost.test.js` 的本机合成基准，正文每篇 4096 bytes，测试工作区包含三个客户。下表为三次不插桩采样中位数；这是服务缓存 miss/刷新，不是操作系统冷盘声明，也不是用户实际库测量。

| 每客户文章 | 事实类型 | 首次读取 | 保存后刷新 | 缓存命中 | 首次文件读次数 | 返回数据 |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 无发布记录 | 765 ms | 801 ms | 0.8 ms | 400 | 0.67 MB |
| 100 | 已发布 | 775 ms | 807 ms | 1.5 ms | 400 | 1.42 MB |
| 1000 | 无发布记录 | 6632 ms | 6559 ms | 7.6 ms | 4000 | 6.67 MB |
| 1000 | 明确失败 | 6730 ms | 6618 ms | 11.7 ms | 4000 | 7.95 MB |
| 1000 | 已发布 | 7046 ms | 7077 ms | 14.8 ms | 4000 | 14.23 MB |

每篇读取包括 JSON/Markdown 与锁 owner 校验；4000 是文件 API 调用次数，不等于物理磁盘读取。该测试只测量并验证成本模型，没有设时延预算，所以测试通过不表示性能达标。SQLite 本轮该查询为 8 次，不能仅凭历史计划将它描述为当前 N+1 根因。

Owner：文章读模型/ContentStore。若日常单客户会积累数百至千篇，优先做列表摘要与正文按需读取、按变更范围更新投影，并保留唯一事实 owner、锁与 CAS。先减少重复工作，不先引入通用缓存层或重写数据库。小规模功能开发可在 R1–R3 修复后继续，容量较大的批量功能应先处理此项。

**产品合同偏差：不能按“旧代码”直接删除。**

SPEC §5.3 与根 AGENTS 写明普通平台明确接受即发布、不增加审核等待；当前 Hepan adapter 在 `src/platforms/hepan/adapter.js:64–68` 返回 remote_pending，definition 启用 remoteReview，运行环境每分钟运行 reconciler，并有 pending→published/rejected 的行为测试。Git 显示该能力由 `d257ef08 feat(hepan): publish through official GEO API` 引入，是当前生产路径。

应由产品合同 owner 澄清“接口建立草稿/待审”与“明确接受投稿”是否同一事实，并同步 SPEC/AGENTS/接入合同。此次只记录偏差，不自行更改语义或删除轮询。需要接入审核型平台的新功能，在该合同收敛前不宜继续复制例外。

**架构、可维护性与扩展性判断**

| 领域 | 当前判断 | 后续重点 |
| --- | --- | --- |
| 核心事实 | ArticleStore/变更协调、OperationalStore、生命周期 projection 的边界基本成立；重复入队、单成功目标、不确定结果和回收有大量行为测试 | 保持唯一 writer，补齐执行生命周期集成 |
| 生成/采集 | 当前客户生成和批量生成共享 AI 执行调度；有重试、幂等、来源快照、暂停/恢复测试。豆包失败暂停、失败题不自动重发的边界明确 | 新功能延伸现有服务，不重新向文章编辑 service 塞生成状态 |
| 普通/付费投稿 | 准备证据与远端开始边界、价格确认、原子 admission、结果应用有明确 owner | 优先 R1/R2；订单和普通平台保持各自用例语义 |
| IPC/Renderer | bridge、具名合同、feature 与生命周期投影有明确分工；有实际 Chromium 交互测试 | 清理无人消费的 feature wrapper 与旧界面，不扩大传输门面 |
| 平台扩展 | definition + port/contribution + enabled ID 有可操作的接入合同，JS 标准平台可沿现有机制增加 | 不需要提前建设第三方插件框架；审核型/付费型变化先收敛合同 |
| 模块复杂度 | 剩余大文件集中在订单转换、admission 和删除/迁移；大文件不自动等于错误 | 只有未来修改跨越多个不变量时才按业务职责拆分，禁止按行数拆文件 |
| 运行与交付 | 日常测试分层、合同/打包证据、目录隔离基础较好 | 关闭格式 gate；补在途退出/切库回归与真实外部验收 |

**可退役清单：先查实际消费者，再做一批删除。**

已检查生产 import/require、动态平台入口、脚本、测试和当前 JSX 使用。下列结论不依赖“名字含 legacy”这一条件。

| 对象（路径相对 auto—publish） | 生产可达性与建议 |
| --- | --- |
| `media-workbench/src/components/ArticleList.tsx`、`ArticleEditor.tsx`、`components/article-editor-session.js` | 旧组件没有生产导入；现行文章编辑使用 GeneratedArticleEditorPanel/ArticleEditorSnapshot。旧 session 仅被旧组件和专属测试引用，可成组退役 |
| `media-workbench/src/mockData.ts`、`generation-runtime-snapshot-logic.js` | 未发现生产消费者，可作为最小安全清理批次；保持当前 contract fixture 测试 |
| `features/content/article-library-feature.js`、`content-production-feature.js`、`use-content-generation-feature.ts`、`features/platform/platform-event-router.js` | 没有当前生产导入，部分只被旧阶段测试、布局约束或测试 harness 引用。先把仍有价值的行为映射到现行 owner，再删 wrapper/专属旧断言 |
| `src/core/articles.js` | 旧文件名解析/扫描/失败文件流，无生产引用，只有 articles-docx 专属测试；DOCX 当前能力在 core/docx-text-extractor 与 client-material-store，不能连这些现行能力一起删 |
| `src/publication/article-identity.js`、`publication-targets.js`、`publication-state.js` | 没有生产消费者，仍被测试直接验证，前两者还进入 core。当前事实由 domain/OperationalStore/生命周期 owner 持有；迁移有效断言后可删除旧模型，保留 `regular-outcome-observation.js` |
| `desktop/services/media-publisher.js` | 没有生产装配，只被 phase-03/phase-11/ticket-25-d 测试直接引用；当前付费 composition 使用 mediaSupplierProvider().createOrder。宜迁移这些测试到实际接口，再删除旧 publisher |
| `npm run snapshot` → `desktop/worker/run-task.js` → `src/app/publish-batch.js` → legacyQueue port | CLI 仍是显式消费者，但三个内置平台 legacyQueueImport 均 false，正常内置配置只会得到空旧队列。建议一起退役无实际用途的 CLI/worker/旧 capability，不能把 migration 的 legacyQueueEvidence 一并删除 |
| `desktop/services/desktop-task-service.js`、`platform-task-state-store.js` | 不可直接删除：仍被启动/配置/维护等保护消费，且已导致 R2；先改接现行活动 owner，再退役旧 writer/worker event 处理及其专属测试 |
| `media:get-drafts` / `media:scan-articles` → `media-workbench-service` / `media-draft-store` → media feature articles/drafts | 仍在启动/刷新中执行，但未发现现行页面展示这些列表或调用旧编辑能力；App 只把其 query 状态算入“数据已就绪”。扫描旧 input/media、逐份解析 DOCX 和读取 drafts 仍产生成本/错误提示。可做一批贯穿 service→IPC→preload→bridge→feature→readiness 的退役；历史 draft 文件/迁移证据保持不动 |

不能删除的“历史”代码：正式 schema v4–v9 migration、legacy-migration reader/planner、删除事务修复、prepared-submission recovery、最小发布/订单档案、当前打包/安全 gate，以及 benchmark 直接读取的 acceptance JSON。它们仍承担升级、恢复或验收职责。也不能按 phase/ticket 文件名前缀删除测试。

**本轮实际验证**

| 命令（从 auto—publish 执行） | 当前代码结果 |
| --- | --- |
| `npm test` | 63 文件，571/571，通过，约 47 秒 |
| `npm run test:integration` | 208 文件，1076/1076，通过，约 403 秒；含真实 Chromium 合成交互 |
| `npm run test:maintenance` | 16 文件，172/172，通过，约 32 秒；仅合成迁移与容量数据 |
| `npm run test:auth` | 63/63，通过；Windows Node 24，本机验证 |
| `node --test tests/production-packaging.test.js tests/desktop-packaging.test.js tests/packaging-runtime.test.js tests/release-evidence.test.js tests/ci-workflow-contract.test.js tests/phase-06-production-ipc-fixture-matrix.test.js` | 6 文件，59/59，通过 |
| `npm run lint`、`npm run typecheck:main`、`npm run typecheck:bridge` | 全部 exit 0 |
| `npm run build:renderer` | Renderer typecheck/build 均通过；单 JS chunk 854.65 kB，gzip 240.03 kB，有体积提示 |
| `npm run build:preload` | exit 0 |
| `npm run format:check` | exit 1：platform-runtime-composition.js、bridge/client-generation.ts、types/client-generation.ts 三文件，和计划已登记基线一致 |
| `node scripts/run-tests.js --list` | 发现 301 桌面测试文件；发现不等于执行 |
| 隔离 lifecycle / malformed JSON 探针 | 复现 R1、R2、R3，不是通过的产品验收 |

已有自动化用例合计 1941 项通过；其中桌面运行了 293/301 个发现文件，另含独立鉴权套件。没有跳过/todo/cancelled。没有运行完整 release/all、当前源码安装包端到端、Electron 焦点/打包导航、Linux Node 22/container、真实登录/豆包页面/普通发布/图片上传/付费与生产迁移。未将上述合同检查等同于真实安装包或外部验收。

完整输出在 `auto—publish/build/evidence/project-review-20260910/`：core.log、integration.log、maintenance.log、auth.log、packaging-ipc.log、各 lint/typecheck/build/format 日志，以及 lifecycle-probe.log、auth-malformed-json-probe.log。R1/R2 探针脚本保存在本机临时文件 `C:/Users/violet/AppData/Local/Temp/autopublish-review-lifecycle-20260910.cjs`，需从应用目录运行；仅用合成输入，禁止改接真实 transport。

**建议执行顺序及停止条件**

1. 修复 R1/R2：现行投稿/付费执行参与 shutdown 与活动投影，补“在途接受后退出”“准备/间隔等待时退出”“切库/改配置被拒绝”“内部账号核验仍正常”的行为矩阵。
2. 修复 R3，关闭三处 format gate；对本轮已知 finding 做一次 bounded re-review，不重新发起全库审查。
3. 一批清理已确认孤儿与无展示用途的媒体扫描链，迁移有效测试到当前生产 owner；不删持久历史文件或正式 migration。
4. 对 Hepan pending 语义同步唯一产品合同；按客户文章规模安排 R4。如果准备扩大批量产能，先给文章读模型明确时延和响应大小预算。
5. 上述阻塞项关闭、受影响合同与最终代码验证通过后，即可进入新增功能。普通展示/筛选等局部功能无需等待所有非阻塞性能/历史文档清理；涉及发布、收费、账号/工作区生命周期的功能必须先关闭对应阻塞边界。

最终判断：**架构可以继续演进；当前稳定性审查 BLOCKED（R1–R3），不要求全项目重新重构。** 本轮仅新增报告和向治理计划追加审查证据，未修改生产代码/测试，未 stage、commit、merge、push 或发布。
