# Codebase Governance Plan

状态：COMPLETE（2026-09-10，本轮授权治理范围）
范围：减少历史维护负担，收敛已确认的旧入口，并修复小范围内部使用下也会累积的运行时资源问题。

## 目标

- 保留仍被运行时、迁移、CI 或验收脚本使用的合同与证据。
- 删除有明确证据表明无生产消费者的孤儿代码和失效测试路径。
- 让生成、缓存和失效通知的 Owner 更清楚，避免继续增加旁路实现。
- 先用定向测试和静态检查验证每个小批次，再扩大清理范围。

## 执行批次

1. **安全清理**：删除 `verify.js` 中不存在的测试路径；移除完全无生产/测试引用的 `desktop/services/submission-boundary.js`；去掉重复 Renderer lint。
2. **运行时资源**：限制 `client-generation-service` 终态 operation 保留并在 dispose 清理；为 `article-management-snapshot` 增加缓存淘汰/销毁清理，并补回归测试。
3. **Owner 收敛**：确认旧 `ai-content-service.generateArticle`、`legacyQueue` worker、`src/app/publish-batch.js` 的生产可达性；仅在行为证据成立后删除或改接当前 Owner。
4. **文档与测试治理**：建立 `.scratch/ARCHIVE-INDEX.md`，更新 `WORK-INDEX.md`；按行为映射合并/重命名测试，不按历史前缀批量删除；保留迁移和发布安全门禁。
5. **按需性能**：在真实数据量或基准证明需要时，优化文章同步扫描、发布记录 N+1 查询和批次 JSON 全量写入。

## 当前证据与约束

- `.scratch` 中的生命周期 acceptance JSON 被 benchmark 脚本直接读取，不能随历史 Markdown 一起删除。
- `OperationalStore`、平台 capability/port、IPC contract 和 preload 安全边界暂不做大重构。
- 旧发布 worker 已用合成输入验证会返回 `SUBMISSION_ADAPTER_MISSING`；删除前仍需确认没有 UI/IPC 生产消费者。

## 验证门禁

- 每批运行受影响的定向测试、`npm run test:discover`、lint 和三项 typecheck。
- 生产源、schema 或关键测试变化后，旧 CI 结果不再作为最终证据。
- 任何迁移、发布或外部账号行为不在本计划自动执行。

## Progress

- 2026-09-10：完成本次项目审查的修复、有限退役和 bounded re-review，详见 [REMEDIATION-2026-09-10.md](REMEDIATION-2026-09-10.md)。R1–R3 关闭；河畔按用户决定接受即发布，审核跟踪退役，待处理旧回执沿唯一成功事务恢复；R4 千篇首次/刷新由约 6.6–7.1 秒降至约 3.0–3.4 秒，后续摘要分页由文章读模型 Owner 按容量需求推进。
- 最终 core 566、integration 1052、maintenance 172、auth 64、packaging/IPC 59 全通过；lint、类型、Renderer/preload 构建、格式和 diff 检查通过；最终空白整理后另补跑 122 项。未进行 Git 提交或真实外部操作。本轮可进入新增功能，不再扩大清理。

- 2026-09-08：完成批次 1。`verify.js` 的失效测试清单已收敛，删除无引用的
  `desktop/services/submission-boundary.js`，去掉重复 Renderer lint。
- 2026-09-08：完成运行时资源批次的第一步。文章管理快照按客户只保留最新 revision，
  客户生成操作默认最多保留 50 个终态记录，销毁时清空；新增两组回归测试。
- 2026-09-08：新增 `.scratch/ARCHIVE-INDEX.md`，`docs/WORK-INDEX.md` 改为只保留当前入口和归档索引。
- 2026-09-08：定向测试 9/9 通过；`npm test` 568/568 通过；lint、main/bridge/renderer typecheck 通过。
- 2026-09-08：`npm run verify` 通过；构建提示 Renderer 单 chunk 约 835 kB（gzip 235 kB），当前记录为按需优化项；核心测试最慢文件约 40 秒，为 `generation-read-amplification.test.js`。
- 2026-09-08：完成媒体历史适配器清理。删除无生产引用的 `src/platforms/media/adapter.js`，
  移除其专属测试和过时打包清单项；保留当前 `media-supplier-adapter` 链路。
- 2026-09-08：删除无生产装配的 `desktop-publisher-router.js`、`worker-publisher.js` 及其专属测试；
  旧 `platform-submit` worker 本身暂留，待下一批连同 `desktop-task-service` 旧控制面统一退役。
- 2026-09-08：媒体清理定向测试 47/47 通过，测试发现降至 304 个文件。
- 2026-09-08：继续清理无生产装配的 `desktop-publisher-router.js`、`worker-publisher.js`，
  并移除仅覆盖旧 Worker 合同的 `phase-03-worker-main-contract.test.js`。旧 `platform-submit`
  执行器及 `desktop-task-service.getState` 暂留，待确认启动状态合同后再整体退役。
- 2026-09-08：当前工作区测试发现降至 303 个文件；受影响定向测试 48/48、核心测试 568/568、lint 和三项 typecheck 通过。
- 2026-09-08：删除媒体适配器后同步调整平台加载器测试，使其只检查实际存在的可选 adapter；未改变当前三个平台的公开能力合同。
- 2026-09-09：确认 `desktop-task-service` 的生产合同只有 `getState()`，退役不可达的
  `platform-submit` 控制面、`publisher-executor.js`、`platform-run.js` 及其历史测试；保留
  `run-task.js snapshot` 与 `src/app/publish-batch.js`，因为它们仍由公开的 `npm run snapshot` 使用。
  测试发现降至 300 个文件；`npm run verify`、核心测试 568/568、Renderer 构建和三项 typecheck 通过。
- 2026-09-09：当前仍保留 `platform-workbench` 队列/命令准备模块及其历史验证合同；虽然没有现代投稿消费者，
  删除它需要同步改动 alpha 打包清单、Ticket 24-E absence 脚本和多组阶段测试，列为下一轮独立批次。
- 2026-09-09：完成 `platform-workbench` 旧队列/命令准备链清理。移除其生产装配、`legacyQueuePorts`、
  队列读取和命令准备模块，保留现行 `platform-workbench-application` 的平台目录与登录能力；同步更新
  alpha 打包清单、Ticket 24-E 校验和相关测试。测试发现降至 298 个，核心测试 568/568、verify、lint、
  三项 typecheck 和 Renderer 构建全部通过。
- 2026-09-09：明确生成链的 Owner 边界。文章内容服务继续负责文章资料、生命周期和编辑能力，
  `client-generation-service` 负责客户生成任务；组合层改为冻结门面，避免后续通过可变 `Object.assign`
  意外覆盖公共方法。该批次不删除文章服务内仍被历史行为测试覆盖的生成方法，避免扩大公开合同变化。
- 2026-09-09：完成客户生成旧 Owner 退役。删除 `ai-content-service` 内重复生成、状态、结果缓存及 AI
  依赖约 200 行；生产组合层只从 `client-generation-service` 暴露生成 API，文章回收恢复与生命周期
  直接引用文章内容 Owner。IPC 合同及持久化格式不变。
- 旧生成测试迁到 `client-generation-tasks.test.js` 并纳入 core：保留单篇/多篇重启去重、并发重复请求、
  部分失败与显式重试、逻辑客户资料读取、来源快照顺序、输入校验、配置失败与销毁中止。
  `article-lifecycle-acceptance.test.js` 改走当前生成服务；文章服务测试只覆盖其现有公开能力。
- `docs/WORK-INDEX.md` 已改为以本计划作为当前治理入口，客户生成计划作为关联功能合同按需读取。

## 本轮验证与审查（2026-09-09）

- 定向 `node --test`：文章服务、客户生成、生命周期验收、工作区生命周期、内容读模型、回收刷新
  共 32/32；客户分组、Renderer 分组及内容 IPC 共 15/15。
- `npm run lint`、`npm run typecheck:main`、`npm run typecheck:bridge` 通过。
- 最后一次生产源修改后重跑 `npm run verify` 通过：core 63 个文件、566/566 测试，
  Renderer typecheck/build 通过；保留已有的 835.46 kB chunk 提示。完整本机输出位于
  `auto—publish/build/evidence/governance-generation-verify.log`（忽略的运行产物）。
- `npm run test:discover` 发现 298 个文件；这是发现数量，不代表已运行全套测试。
- Primary Review 已检查本轮删除、测试迁移、生成 IPC 门面、回收恢复与直接调用方，无阻塞 finding。
  随后只修复工作区组合层的一处空行，限定复核确认无行为变化。
- `npm run format:check` 尚有 3 处基线格式问题：`platform-runtime-composition.js`、Renderer
  `bridge/client-generation.ts`、`types/client-generation.ts`。对这三个文件分别用 `git show HEAD:<path>`
  输入 Prettier 均复现失败；留给对应文件 Owner 后续修改时处理，不扩成本轮格式化。
- 未运行完整 all/release 套件、安装包或真实外部操作；本轮无 UI 行为、schema 或迁移变更。
- Git：保留此前各轮未提交改动，本轮未 stage、commit 或 push。

## 项目整体只读审查（2026-09-10）

- 审查基准 `69b5fbd9a9b66f7d7eee42dc1914ad9bd164340a`，开始时工作树干净；本次没有实施生产代码修复。
- 结论、finding、Owner、退役清单及验证范围见 [PROJECT-REVIEW-2026-09-10.md](PROJECT-REVIEW-2026-09-10.md)。这是新的 Primary Audit；R1–R3 尚未关闭，不能标记治理或稳定性验收完成。
- 已用真实 composition/SQLite 与假 transport 复现：在途投稿未参与 dispose，数据库提前关闭；旧任务快照仍报告 idle，允许投稿期间修改配置。独立回环 HTTP 探针另复现鉴权非法 JSON 请求不返回。
- 当前代码 core 571/571、integration 1076/1076、maintenance 172/172、auth 本机 63/63、6 文件 packaging/IPC 合同 59/59 通过；lint、main/bridge typecheck、Renderer typecheck/build、preload build 通过。format:check 仍为此前登记的三个文件失败。
- 现有真实存储合成基准显示单客户 1000 篇时快照首次读取/刷新约 6.6–7.1 秒；为按规模安排读模型优化提供了当前证据，不能只以测试通过认定性能达标。
- 剩余执行顺序：先修 R1–R3 与格式 gate，再做有限孤儿/旧媒体扫描链退役；Hepan remote_pending 与当前产品文档偏差需收敛；不扩大成新一轮全项目重构。修复后只做已知 finding 的 bounded re-review。
- 未运行完整 release/all、安装包端到端、Linux Node 22/container 或任何真实账号/投稿/上传/付费/生产操作。日志位于 `auto—publish/build/evidence/project-review-20260910/`。
