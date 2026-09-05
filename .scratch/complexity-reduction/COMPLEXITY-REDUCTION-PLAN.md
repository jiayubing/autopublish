# AutoPublish 复杂度收敛与测试瘦身计划

## 1. 目标

在不削弱 GEO 文章生成、批量入队、普通平台发布、失败恢复和不确定结果人工核对能力的前提下，降低个人维护成本。

本计划针对当前单批次通常低于 100 篇、单机使用的场景。目标不是把项目改造成云端多租户系统，也不是继续增加抽象层。

完成后应达到：

- 日常 GEO 主链路可以被少量核心模块和测试覆盖；
- paid-media、订单、迁移、发布证据和打包门禁不再干扰日常开发；
- 默认测试在几分钟内完成；
- 历史 phase/ticket 测试不再是主要业务入口；
- 删除或归档代码都有真实消费者和数据兼容证据。

## 2. 范围

### 2.1 保留的核心能力

```text
客户资料 → GEO 研究 → 文章生成 → 文章持久化
→ 选择平台与账号 → 入队 → 发布
→ 成功 / 失败 / 不确定结果
```

必须保留并继续验证：

- 客户、素材、研究结果和模板隔离；
- 生成批次的暂停、恢复、失败和幂等；
- 文章身份与单一发布目标约束；
- 队列 claim、lease、恢复和重复入队保护；
- 普通平台发布结果的成功、失败、不确定状态；
- workspace 启动、重启和最小恢复路径；
- preload / IPC 的最小公开合同。

### 2.2 本计划不主动扩大范围

- 不新增真实账号、真实发布或生产迁移操作；
- 不提高当前批次上限和发布并发；
- 不重写 SQLite 存储；
- 不把应用改成服务端或多用户架构；
- 不删除仍可能被真实 workspace 使用的迁移能力；
- 不为了测试暴露新的生产 API。

## 3. 当前基线

截至计划建立时：

- `auto—publish/tests` 约有 288 个测试文件；
- 其中大量文件使用 `phase-*`、`ticket-*`、`contract`、`packaging`、`release` 命名；
- 测试运行器同时承担测试执行、并发隔离、超时、计时和 evidence 生成；
- 核心生成服务、workspace composition、迁移和 OperationalStore aggregate 存在较大文件；
- 单批次通常低于 100 篇，因此当前 1000 任务上限不是近期瓶颈；
- `npm run test:capacity` 已通过，容量基线不作为本计划的主要整改对象。

## 4. 目标结构

### 4.1 代码职责分区

先建立清单和依赖边界，再决定是否移动文件：

```text
core/
  content generation
  article lifecycle
  regular publication queue
  publication outcome

infrastructure/
  workspace
  SQLite / OperationalStore
  files and runtime

optional/
  paid-media
  orders
  extended diagnostics
  legacy migration

maintenance/
  migration runners
  capacity benchmarks
  packaging and release evidence
```

分区的目的，是让修改普通 GEO 工作流时不需要理解 paid-media、订单和发布证据系统；不以增加 facade、manager 或 compatibility layer 为目标。

### 4.2 测试分层

#### Core：默认 `npm test`

覆盖客户资料、文章生成、批次状态、文章生命周期、普通队列、发布结果和 workspace 基本恢复。

目标规模：约 30–50 个测试文件。

#### Integration：提交前运行

覆盖生成到存储、文章到入队、入队到发布结果、IPC 到 service、workspace 启动到恢复等跨层行为。

目标规模：约 10–20 个测试文件。

#### Maintenance：偶尔运行

包括 migration、capacity、diagnostics、legacy absence、production IPC matrix 和历史兼容测试。

#### Release：发布前运行

包括 lint、typecheck、renderer/preload build、打包 smoke、release evidence 和 clean-build 检查。

## 5. 执行阶段

### Phase 0：建立清单与证据

任务：

1. 统计测试文件、源码入口、脚本和 package 命令的实际调用关系。
2. 为每个测试标记 `core`、`integration`、`maintenance` 或 `release`。
3. 标记重复覆盖、历史证据、真实公开合同和未知消费者。
4. 记录当前 `npm test`、核心测试、lint、typecheck 的耗时和结果。

完成条件：

- 有一份测试分类清单；
- 每个拟移动或删除的测试都有保留理由或删除理由；
- 未发现的真实消费者被明确列为阻塞项。

### Phase 1：切分默认测试入口

任务：

1. 新增 core、integration、maintenance、release 四类测试 profile。
2. 让默认 `npm test` 只运行 core。
3. 保留完整测试命令，确保现有测试仍可单独运行。
4. 将 evidence 生成从日常测试执行中分离。

建议命令：

```text
npm test
npm run test:integration
npm run test:maintenance
npm run test:release
```

完成条件：

- 默认测试不再自动执行打包、迁移和发布证据测试；
- core 测试通过；
- 完整测试仍可通过显式命令运行；
- 没有通过降低断言或隐藏失败来缩短时间。

### Phase 2：按业务行为合并测试

任务：

1. 将 `ticket-*` 和 `phase-*` 测试映射到当前业务行为。
2. 合并覆盖同一状态机的重复测试。
3. 将测试名称从历史工单名改为业务行为名。
4. 为生成、入队、发布结果各保留一组状态矩阵测试。
5. 删除仅证明历史实施过程、且不保护当前合同的重复测试。

完成条件：

- 核心测试不依赖历史 Ticket 编号才能理解；
- 成功、失败、暂停、恢复、不确定和幂等路径都有公开行为断言；
- 删除的测试有迁移记录；
- core 测试数量和运行时间明显下降。

### Phase 3：隔离可选服务的装配与外部依赖

任务：

1. 把 paid-media、资源与订单服务的具体装配集中到媒体装配入口，普通 GEO 编排不再维护媒体内部依赖。
2. 保留启动时的本地订单暂停与恢复；供应商配置、网络请求和资源缓存按实际用例读取。调查已证明构造本身不执行这些读取，不为延迟构造增加 wrapper。
3. paid-media、订单和媒体资源的有效业务回归保留 integration；只有迁移、容量及历史静态证据归入 maintenance，不增加第五套 optional profile。
4. 将历史 migration 和 release evidence 脚本移出日常业务入口。

完成条件：

- 普通 GEO 工作流启动不依赖付费媒体的配置、远端连接或资源缓存可用；
- 普通发布用例不负责订单/资源内部装配；workspace 集成测试仍覆盖共享的本地订单恢复；
- 可选功能仍可通过显式命令运行；
- 没有形成第二套状态或旁路 writer。

### Phase 4：收敛大文件职责

优先调查：

- `desktop/services/content-generation-batch-service.js`
- `src/content/article-removal-service.js`
- `desktop/composition/workspace-runtime-composition.js`
- OperationalStore 下的大型 aggregate

拆分原则：

- 只按稳定业务职责拆分；
- 输入校验、批次生命周期、任务执行和持久化可以独立测试；
- 不新增泛化 manager、helper 或 adapter 以规避根因；
- 拆分后调用方应更少、更清楚，而不是层数更多。

完成条件：

- 主要服务的修改原因更单一；
- 对外合同不变，或合同变更有明确迁移；
- 相关核心测试和集成测试通过；
- 变更没有扩大到无关 owner。

### Phase 5：历史代码处置

仅在确认真实 workspace 不再需要旧格式后执行：

1. 将 legacy migration 移到 maintenance 目录；
2. 删除无消费者的旧路径和兼容层；
3. 删除仅保护旧路线的 absence 测试；
4. 保留一次性迁移说明和回滚证据。

如果仍存在旧 workspace，暂停删除，改为保留 maintenance migration。

## 6. 验收门禁

### 日常门禁

- core 测试通过；
- 生成、入队、发布结果和恢复状态矩阵通过；
- lint 和相关 typecheck 通过。

### 集成门禁

- 生成到持久化链路通过；
- 入队到发布结果链路通过；
- workspace 重启恢复通过；
- IPC 和 preload 公开合同通过。

### 发布门禁

- 完整测试通过；
- migration、capacity、packaging 和 release evidence 按需执行；
- clean-build 和打包 smoke 通过。

## 7. 停止条件

遇到以下情况停止删除或合并，先记录证据：

- 无法确认某段迁移代码是否仍有真实 workspace 消费者；
- 真源之间出现生命周期或发布结果冲突；
- 改动需要修改公开 schema、权限或不可逆数据；
- 为了减少测试数量而降低了状态覆盖；
- 为了隔离可选服务而出现第二个事实 owner；
- 普通 GEO 流程必须依赖 paid-media 或订单服务才能运行。

## 8. 预期结果

完成后，维护者日常只需理解：

```text
客户资料、GEO 研究、文章生成、普通队列、发布结果和 workspace
```

预计结果：

- 默认测试从全量仓库测试变为核心行为测试；
- 测试文件从约 288 个逐步收敛到约 50–80 个日常可见文件；
- 发布、迁移和容量证据仍然存在，但不再阻塞普通开发循环；
- 普通 GEO 主链路不依赖付费媒体外部配置与连接；共享本地订单恢复保持启动执行；
- 代码层数减少，新增抽象保持克制；
- 不牺牲幂等、恢复和不确定远端结果安全语义。

## 9. 当前状态

- 状态：执行中
- 当前阶段：Phase 0/1 已落地；Phase 2 首批精简、Phase 3 装配隔离和 Phase 4 局部职责收敛已实施；Phase 5 消费者处置决策已记录；本地全量与发布组通过，已获提交授权，正在验证干净提交构建
- 负责人：项目维护者
- 下一步：验证正式 clean-build、干净提交的本地 unpacked 构建与打包测试，记录最终结果；不 push、不发布。保留有真实消费者的迁移与状态机，不继续为文件数量扩大重构

## 10. 执行记录与决策

### 2026-09-05：Phase 0 启动

- 源码基线 HEAD：`b98cfaa2378bfa290d26e759dcd05d2f186b1962`。
- 当前 Node：`v24.16.0`，与桌面 CI 的 Node 24 大版本一致。
- 实际发现 288 个测试文件；当前执行器分配 250 个到 parallel 池，38 个到 serial 池。该分类是资源隔离分类，不等同于 core/integration/maintenance/release。
- `npm run lint` 通过。
- `npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge` 均通过。
- 上一次全量测试会话已失效，且没有找到最终计时报告；不得记为通过。重新执行的全量基线已结束：exit 1，耗时 314.985 秒；执行器报告 2006 tests、2004 passed、1 failed、2 skipped、0 cancelled。serial Node reporter 原始输出为 1 skipped，执行器合并后为 2，计数差异需要核对，不能将该结果报告为全绿。
- 失败项：`renderer-batch-generation-client-hydration.test.js:77` 等待“文章生成”button 超时 30 秒。当前尚未判定是过期导航 locator、fixture 缺失还是产品回归；下一步单独复现。
- 本地基线日志：系统 TEMP 下 `autopublish-complexity-baseline.log`；计时报告：`auto—publish/build/evidence/root-test-timings.json`。均为生成物，不提交。所有 288 个文件均 reported，执行器 lifecycle 为 CLOSED。
- 慢点：`ticket-25-c-regular-platform-acceptance` 90.634 秒；`phase-06-production-ipc-fixture-matrix` 90.106 秒；失败的 hydration 测试 31.037 秒；运行容量测试 21.847 秒。应先排查真实等待与静态分析成本，再决定测试入口和删减。
- 测试文件清单见 [TEST-INVENTORY.md](TEST-INVENTORY.md)。分类尚需行为与消费者核对，不按文件名自动批准删除。

### 已确认的复杂度来源

1. `tests/helpers/typescript-symbol-evidence.js` 自建静态调用链/控制流分析；消费者为 `phase-06-symbol-identity-evidence.test.js` 和 `phase-06-production-ipc-fixture-matrix.test.js`。前者验证分析器本身，后者为 CI 中的 production IPC matrix 门禁。需要先核对运行时合同覆盖，再决定精简或替代，不能直接删除 helper。
2. `scripts/create-root-test-evidence.js` 直接调用无参数 `scripts/run-tests.js`，同时以全量 `collectTestFiles()` 数量建立证据。切换默认 profile 时必须保证执行集合与证据集合一致。
3. CI 使用 `test:desktop-core`，其意义是排除已委派套件，并非未来个人日常 core profile。不能简单重命名或复用而导致 CI 漏跑。
4. `ticket-25-b-lifecycle-acceptance`、`ticket-25-c-regular-platform-acceptance` 直接验证冻结、幂等、不确定结果、暂停与恢复，不能以历史命名为由归档。

### 执行口径修正

- 30–50、50–80 个文件等数字是早期估计，不是删除配额；以实际重复覆盖、运行时间和维护负担决定。
- 文件移动本身不构成瘦身；优先减少重复实现、测试辅助工具复杂度和人工维护清单。
- paid-media 是现有产品能力，隔离不等于废弃；初始化时的恢复职责必须先追踪，不能因未进入媒体页面而遗漏持久订单恢复。
- core 通过不代表全量通过。日常、集成、维护、发布结果必须分别报告。

### 后续顺序

以下是 Phase 0 时的历史安排，后续完成情况以本节末尾记录和第 9 节为准。

1. 单独复现 hydration 测试失败，检查当前页面导航及 fixture；禁止删除失败用例换绿灯。
2. 定位 Ticket 25-C 的 90 秒等待来源；如属于人工提交间隔，优先在测试注入可控时钟并继续断言调度行为。
3. 继续完成 TEST-INVENTORY 的未核对项，然后实施 Phase 1；当前 Phase 0 尚未完成。
4. 当前仅文档变更；未 stage、commit、push，未改变生产、测试、CI 或外部状态。

### 2026-09-05：基线问题的最小修复

- hydration 单独复现失败（约 31.4 秒）：当前页面直接提供“批量生成”button，旧测试仍点击“文章生成”button 和“批量生成”tab。已修正两处过期导航步骤，客户 B 的素材与 hydration 调用断言全部保留。
- Ticket 25-C 的入队 fixture 未指定间隔，落入产品默认 30 秒，导致非间隔专项测试实际等待约 90 秒。通过已有公开 `queueConfig.submissionIntervalSeconds: 0` 明确测试配置；没有新增生产 API、修改产品默认值或删除状态断言。
- `node --test tests/renderer-batch-generation-client-hydration.test.js tests/ticket-25-c-regular-platform-acceptance.test.js tests/regular-queue-submission-interval.test.js`：7/7 通过、零跳过，总耗时 1.341 秒。hydration 约 1.110 秒；25-C 四项约 0.510 秒；默认 30 秒与间隔边界/重启持久化测试仍通过。
- 修改后 `npm run lint` 通过，`git diff --check` 通过。此次仅测试变更，无生产代码变更，因此未重复无关 typecheck/build。
- Primary Review：核对了当前 ContentWorkbench 导航、公开入队配置及间隔专项测试；无本次修改引入的阻塞项。未删除行为断言或扩大测试豁免。
- 全量日志实际存在两个 `# SKIP`：打包平台登录 smoke、Electron settings focus suite。后者需 `RUN_ELECTRON_FOCUS_TESTS=1`。原始 Node summary 与执行器计数差异包含 suite skip，不能据此判定执行器重复计数；保留 skipped 非零失败规则。
- 未重跑仍会因上述前置条件跳过的全量入口；下一步继续分类和 profile 分离，显式记录 release 前置条件。Phase 0 分类仍未完成，不能宣称全部计划完成。
- Git：修改两个测试和工作索引，新增计划与清单；未 stage/commit/push。

### 2026-09-05：Phase 1 分组入口落地

- `scripts/test-suites.json` 是执行分组的唯一配置。core 61 文件、integration 196、maintenance 17、release 14，合计 288；本轮没有删除任何测试。
- core 明确保留客户/素材、生成、文章生命周期、普通发布与不确定结果、workspace 恢复。剩余未列入显式分组的文件进入 integration，包括付费媒体和订单回归。业务仍保留，不能将其视为已弃用。
- `npm test` 选择 core；新增 `test:integration`、`test:maintenance`、`test:release`、`test:all`。`test:discover`、无参数执行器、现有 CI `test:desktop-core` 和全量证据消费者的原语义保留。
- 选择器检查重复/缺失分类文件；未知 suite 返回非零。新文件自动进入 integration。分组后再应用已有 exclude 参数。
- core/integration/maintenance/release 的计时输出位于 `build/test-results/`，不会覆盖 `build/evidence/root-test-timings.json`。已实际验证原全量 314.985 秒报告保持不变。
- 第一次 integration 197 文件运行：无断言失败，但一个打包导航 smoke 因前置条件缺失跳过，因此 exit 1。将包含该 smoke 的混合 Electron 文件整体归入 release 后复跑通过；保留原测试及 skip 失败规则，后续如拆文件必须保留共享 fixture 行为。

验证（当前测试/执行器版本）：

| 命令 | 结果 |
| --- | --- |
| `npm test` | 550/550，通过，零跳过；约 6.5 秒，最终配置已复跑通过 |
| `npm run test:integration` | 1022/1022，通过，零跳过；57.573 秒 |
| `npm run test:maintenance` | 328/328，通过，零跳过；30.407 秒 |
| `node --test tests/test-discovery-contract.test.js tests/ci-workflow-contract.test.js tests/release-evidence.test.js` | 23/23，通过，零跳过 |
| `npm run lint` | 通过 |
| `npx prettier --check scripts/run-tests.js scripts/test-suites.json tests/test-discovery-contract.test.js` | 通过 |
| `git diff --check` | 通过 |

发布组/all 未在此变更后完整执行：需要 Windows、合成 unpacked 构建及显式 Electron 测试开关。前置条件已写入应用 README；局部分组通过不能代替发布验收。生产源代码/schema 未变化，不重复运行无关构建或生产迁移。

Primary Review 已核对：分组并集/互斥、新文件归属、未知参数失败、全量发现及证据消费者、输出隔离、CI 入口和跳过失败规则。无当前分组改动引入的阻塞 finding。归档/删除判定仍属于 Phase 2，不能用本清单当作已证明重复的清单。

完成范围：Phase 0 的基线/执行清单已建立，Phase 1 日常入口本地验证通过。整体目标仍未完成：Phase 2 测试精简、Phase 3 可选服务隔离、Phase 4 职责收敛、Phase 5 历史代码消费者判断及最终验收仍待推进。未 stage、commit 或 push。

### 2026-09-05：Phase 2 首项重复覆盖收敛

- `phase-06-production-ipc-fixture-matrix.test.js` 首个测试已逐一执行全部 118 个 fixture 的 `verifyCapabilityEvidence`，后续又对其中 25 个 lifecycle query 和 4 个 event 重复执行，且只重复断言 `result.ok`。
- 已核对 registry：25 个 lifecycle 的 kind 都是 query，4 个 event 的 kind 都是 event。旧 lifecycle 重复调用使用 invoke，但分析器 `requireQueryResult` 由 query 或 lifecycle 条件启用，preload 分支只区分 event 与非 event，因此没有额外独有分支。首轮还输出 capability、reasons、trace，诊断信息更完整。
- 删除两段重复循环，共 20 行、29 个重复测试注册；保留全部 fixture、25/4 数量检查、首轮每能力分析及请求/结果/事件 round-trip、错误与未知字段负例。没有删除分析器或放宽断言。
- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js tests/phase-06-symbol-identity-evidence.test.js`：161/161，通过、零跳过；总耗时 75.201 秒，全部 118 能力分析约 74.952 秒。原矩阵基线约 90.106 秒，执行环境与并发不同，不以差值作为严格性能保证。
- `npm run lint`（应用目录）和 `git diff --check` 通过。一次在仓库根目录误调用 npm 导致缺少 package.json，已在正确目录重跑通过。
- Primary Review：确认剩余首轮覆盖所有被删子集、kind 分支等价、数量约束保留，以及 CI/脚本没有按被删测试标题选择执行。没有本次引入的阻塞项。
- Phase 2 仍在进行。静态分析器约 9400 行的维护成本尚未解决；当前仍有 production IPC matrix 消费者，不能把移动执行组或删除重复调用当成该工具已退役。生产源代码未改，未执行外部操作或提交。

### 2026-09-05：移除失效历史验收工具

- 调查业务命名时发现 Ticket 25-B/C 路径被历史验收矩阵及带 observedSourceState 的记录引用。本轮没有改写历史证据，也没有创建兼容 wrapper。
- 当前 `test:ticket-25-a` 调用的 `tests/ticket-25-a-contract.test.js` 已不存在；驱动 `ticket-25-a-evidence.js` 仅被 npm 命令引用，没有 CI 或当前测试消费者。
- 删除该失效 npm 入口及 70 行驱动。原 793 行 `ticket-25-a-contract.js` 剩余唯一消费者是现存基准脚本，只用到八个导出；按该消费者保留预算读取/校验、输出路径检查和最小证据字段检查，形成约 220 行 `article-management-benchmark-contract.js`，旧模块删除，净减少约 643 行工具代码。
- 保留基准公开命令、预算文件、版本字段、错误码及 provenance；没有篡改历史验收 JSON/handoff。`format:check` 同步移除失效文件并检查新模块。README 中不存在的 `test:phase-08:gates` 替换为当前 `test:integration`。
- `npm run benchmark:ticket-25-a -- --output build/evidence/complexity-benchmark.json` 实际运行并在格式化后复跑：预算 hardGate PASSED（queries 5/8、scans 5/8、externalTransportCalls 0）；总体仍为 OBSERVED_NOT_A_FINAL_GATE，不升级为最终验收。
- `npm test`：550/550，通过、零跳过。直接调用保留接口验证合法预算、未来版本拒绝、越界输出路径拒绝、合法生成证据及敏感字段拒绝，均通过。
- 最终 `npm run lint`、两个变更脚本的 Prettier check 通过。首次格式检查发现 benchmark 文件格式问题，已格式化并重跑实际 benchmark，未忽略失败。
- Primary Review：搜索应用 scripts/tests、CI、当前 docs 中旧模块/入口消费者，最终无剩余引用；保留函数通过 TypeScript AST 提取，逻辑未重写，实际 benchmark 与负例检查证明保留消费链可用。无本轮阻塞 finding。
- 本轮只改测试/维护工具与文档，没有业务状态、schema、账号或真实外部操作变更。Phase 2 继续，未 stage/commit/push。

### 2026-09-05：核心验收命名与 Phase 3 启动依赖调查

- 核心入口改为 `tests/article-lifecycle-acceptance.test.js`（原 `ticket-25-b-lifecycle-acceptance.test.js`）及 `tests/regular-platform-acceptance.test.js`（原 `ticket-25-c-regular-platform-acceptance.test.js`）。后者测试标题移除 25-C 前缀，fixture 和断言保留。
- 同步 test-suites 和 discovery 合同。旧历史 handoff/observedSourceState 记录不改写；对应当前路径按本映射定位。失效历史验收工具上一轮已删除，没有为了保留旧路径新增 wrapper。
- `npm test` 550/550 通过、零跳过，`npm run lint` 通过。仅名称/注释变化，公开行为断言与测试数不变。
- Phase 2 已完成的收敛为：重复 IPC 执行合并、失效历史工具删除、核心验收业务命名。其他历史命名暂保留，不进行纯改名批量整理；静态分析器尚有真实消费者，其独有反例不能按文件规模删除。
- Phase 3 已识别关键启动不变量：`paid-media-batch-composition.js` 创建时调用 `orchestrator.initializePaused()`，workspace 主装配还会执行 publication recovery。可选媒体服务延迟装配必须保留这些启动恢复，不能把所有订单恢复推迟到用户打开页面。
- 下一步：追踪媒体资源 store、媒体应用及订单 tracker 的真实初始化副作用，确定可延后的资源装配和必须保留的启动恢复；随后以 workspace 重启/切换测试验证。整体计划尚未完成，未提交。

### 2026-09-05：媒体扫描职责收敛

- 执行顺序：先完成有明确消费者证据的局部职责收敛，再决定可选服务装配改造。Phase 3 的整组延迟装配仍是待验证方案，不能把文件移动或新增 lazy wrapper 算作收益。
- `MediaResourceStore`、`MediaPoolStore`、`MediaDraftStore` 的构造与 `resolveStorePath` 只解析路径，读取发生在方法调用。`createMediaWorkbenchService` 的扫描也在调用时执行；不能仅凭初始化了对象就认定有启动 I/O。
- workspace 的 attention/submission center 使用媒体应用的订单核对和批次查询接口；`createPaidMediaBatchComposition` 启动时执行 `initializePaused()`。任何隔离必须继续保留这些事实及恢复职责。
- 全应用源码/测试/脚本消费者检索确认：`createMediaWorkbenchService` 只有媒体应用一个生产消费者，仅使用 `scanArticles`。删除未暴露到当前 IPC 的 `previewArticle`、`resolveSubmissionFile`、`expandSubmissionTasks`、`buildConfirmationSummary` 及专用 helper/import，共净减少 159 行。保留扫描函数原实现，不新增模块、状态 owner 或兼容 wrapper。
- 付费预检仍由 `paid-media-preflight-service` 拥有；没有修改订单、价格确认、生命周期、schema 或外部副作用。其他 platform workbench 的同名文件解析接口不在删除范围。
- 在现有媒体 IPC 测试文件补公开应用扫描回归：合成目录、空目录结果、临时文件过滤、草稿标题/备注保留、构造不读取草稿、不创建输入/数据目录、本地扫描不调用供应商客户端。新增测试自动归入 integration。
- 定向验证：`node --test tests/phase-06-media-typed-ipc.test.js tests/media-article-drawer-boundary.test.js tests/ticket-25-d-paid-media-acceptance.test.js`，26/26 通过、零跳过；`npm run lint`、`npm run typecheck:main`、`git diff --check` 通过。最终 `npm run test:integration`：196 文件、1023/1023 通过、零跳过，54.611 秒，执行器 CLOSED、allFilesReported=true。报告位于 `auto—publish/build/test-results/integration-timings.json`。
- Primary Review 已检查删除函数的全部调用关系、保留扫描实现、当前 IPC 合同及付费预检回归；未发现本次改动引入的阻塞项。整体计划仍执行中，未 stage/commit/push。

### 2026-09-05：生成预检与批次运行职责分离

- 对比保留原文件、抽取通用校验工具、按业务预检职责拆分三种方案，选择最后一种。收益是修改客户来源筛选或模板预检时不再需要理解运行中的 pause/resume、异常落盘和事件状态；不是按文件行数要求拆分。
- 新增 `desktop/services/content-generation-batch-preview.js`，只导出预检函数工厂；客户、素材、研究和模板查询依赖显式注入。复用原服务的错误及输入校验函数，沿用项目 removal cursor/state 等已有的注入约定，不增加第二套错误规则或生产持久化入口。
- 预检私有函数通过 TypeScript AST 定位后原样迁出，再格式化新文件；去掉只转发查询的 `listMaterials`、`listResearch`、`clientExists`，直接使用对应 store。客户隔离、显式来源选择、数量限制、模板目录 revision 和错误信息语义保留。
- `content-generation-batch-service.js` 继续装配依赖，并独占批次创建、运行控制、状态恢复、生成后持久化与事件投影；公开 `preview/createBatch/startBatch/...` 和 IPC 错误合同不变。主服务净减少 177 行；新文件格式展开导致总文本行数增加，本项是职责收敛，不计作代码总量下降。
- 原业务测试仍通过公开 service 验证，不为新模块复制一套测试。新增一个跨客户来源误选与只读预检回归；原依赖方向检查的范围补入新模块，防止迁出后漏检。
- 验证：`npm test` 551/551 通过、零跳过，6.980 秒；生成 IPC、typed IPC、模板生成合同定向 15/15 通过。`npm run lint`、`npm run typecheck:main`、新文件 Prettier check、`git diff --check` 通过。主进程 typecheck 当前只覆盖 composition TypeScript，不能代替 JS 服务的行为测试。
- 当前 Node 直接查询仍为 v24.16.0；测试日志中子进程版本不得代替主命令的实际运行环境。
- 最终 `npm run test:integration`：196 文件、1023/1023 通过，零跳过，55.317 秒；`npm run test:production-ipc-matrix`：5/5 通过，包含全部 118 个能力的符号检查，73.367 秒。现有静态分析器能识别新调用路径，没有为通过门禁增加豁免。
- Primary Review：核对预检的新依赖不含 batch store、runner、生成器或发布接口，公开 service/IPC 消费者不变，生命周期代码没有迁出。迁移对照最初 token 比较因格式化省略冗余括号失败；改用忽略冗余括号的 AST 结构对照后，11 个迁出函数与原实现一致（除已审核的三处查询直接调用）。该对照仅作为重构差异检查，业务正确性由上述公开行为测试证明。
- 本轮无引入的阻塞 finding。Phase 4 已完成生成预检的首项职责收敛，workspace 装配、删除服务和 OperationalStore 的调查仍未闭合；Phase 3、Phase 5 及完整发布验收也未完成。整体计划仍执行中，未 stage/commit/push。

### 2026-09-05：媒体装配边界集中

- 新增 `desktop/composition/media-workbench-composition.js`，集中供应商、资源/收藏/草稿 store、提交前 recheck、付费批次及媒体应用装配。workspace 主装配仅传入现有 owner 与环境依赖，接收原有批次与媒体应用；净减少 143 行。未新增状态、wrapper 或兼容路线。
- 沿用现有 `paid-media-batch-composition` 的唯一初始化路径。publication recovery 仍先执行，随后执行付费批次 `initializePaused()`，再向 attention/submission center/IPC 提供原有服务。资源构造从恢复之前移到媒体装配入口，但该构造仅解析路径，不产生业务读写；媒体应用构造不执行网络或订单 mutation。
- 删除向媒体应用传入的无消费者 `platformWorkbenchService` 参数；普通平台装配和媒体装配没有这个伪依赖。其余服务参数及业务代码通过 AST 定位搬迁，recheck、配置读取异常语义保留。
- 原 Phase 3 的“只有打开媒体页才装配全部订单服务”与已存在的启动恢复和共享投稿中心不相容。改为隔离装配和外部依赖，保留本地恢复；这不是删除付费功能或降低恢复验证。有效 paid-media 回归保留 integration，不仅因其可选就降为维护测试。
- 新增合成数据库回归：先将已入队付费批次运行意图设为 running，再创建真实媒体装配，确认该持久事实恢复 paused、已有应用读到同一 paused 事实，供应商配置与客户端没有被访问，损坏资源/草稿缓存不阻止启动，显式读取损坏草稿仍返回 `MEDIA_DRAFT_STORE_CORRUPT`。本项证明装配时的恢复，跨进程重启不由此单项测试代替。
- 验证：付费验收定向 13/13 通过；最终 `npm test` 551/551 通过、6.697 秒；`npm run test:integration` 1024/1024 通过、55.955 秒；均零跳过。lint、主进程 typecheck、新媒体装配文件 Prettier check、diff check 通过。workspace 文件的无关格式化已按 AST 等价检查撤回，保留原有格式。
- 当前测试日志暴露已有 workspace 生命周期用例在清理时调用真实 Playwright CLI（报告 lieju session 未打开）；本次新增媒体装配回归不加载平台浏览器。测试环境隔离不足登记到 workspace-runtime-lifecycle 测试 owner，后续验收前收敛，不能将无浏览器会话当作可靠隔离。
- 最终 `npm run test:production-ipc-matrix`：5/5 通过，覆盖全部 118 个生产能力，零跳过，73.822 秒。Primary Review 核对初始化顺序、模块消费者、相同 owner 的注入、attention/submission center 引用及失败清理；没有本次引入的阻塞 finding。既有测试环境隔离问题按上条登记继续处理。
- 整体尚未完成，删除服务/OperationalStore 调查、历史迁移消费者判断及最终发布验收仍需推进。未 stage/commit/push。

### 2026-09-05：测试外部隔离与保留决策

- 修复 `workspace-runtime-lifecycle.test.js` 的外部边界：在加载平台适配器前用 Node 原生 mock 替换 `pwInvokeSync`、`runCode`。假 transport 显式返回会话未打开错误；测试结束检查只发生 state-save/close 清理调用、没有执行页面代码，最后恢复 mock。没有修改生产生命周期，也没有 mock 掉 workspace、数据库、恢复或服务清理行为。
- 定向 workspace 测试 10/10 通过；最终 `npm test` 551/551 通过、零跳过，6.390 秒，原 CLI 会话报错不再出现。lint 和 diff check 通过。本次仅测试变更，不重复业务源码未变化的 IPC 全矩阵。
- Primary Review：mock 在适配器解构导入前建立，错误路径沿用已有 absent-session 语义；测试末尾的调用审查可发现被生产 cleanup 捕获的非预期命令。没有为测试增加生产注入 API；上一轮登记的该文件环境隔离问题已关闭。
- Phase 4 保留 `article-removal-service`：游标、状态机、事务文件 store 已分别存在明确 owner；主服务负责跨文件删除步骤、claim 与恢复协调。`recoverPendingRemovals` 和事务查询均会调用 `canonicalizeOpenTransactions`，其中旧队列操作必须被区分为已完成或 needs_repair，不能直接删除。现有 removal 回归验证这两类迁移及活动操作恢复。继续机械拆分会增加持久状态在函数间传递，本轮不扩大改造。
- Phase 4 保留 OperationalStore aggregate：公共门面已按 publication/submission/queue/paid execution/order/recovery 组合并统一注入事务 context，transition ports 限定 writer。所查 submission 与 paid execution 的 claim/renew/begin-remote/cancel 共享事务与运行事实；不能为减少文件长度再建第二套 store 或旁路写入。当前生成预检与媒体装配两项已闭合本轮有证据的职责拆分。
- Phase 5 保留决策：`workspace-startup-composition` 实际调用 `runWorkspaceMigrationGate`，后者使用 `legacy-migration-planner/reader`、迁移租约、备份与 journal；`migrate-geo-data.js` 仍调用 `legacy-migration.js`；OperationalStore v1 迁移脚本仍被维护测试及容量验证使用。它们不是无消费者代码。迁移测试已从日常 core 分到 maintenance，保留原入口避免引入兼容 wrapper。
- 未读取真实 workspace 或确认所有用户旧数据均已迁移，因此不执行历史格式删除，也不宣称迁移退役。已证实无消费者的历史工具及媒体旧业务路径已在此前删除；其余保留消费者、理由与现有测试，不因历史名称或代码行数删除。
- 下一步进入最终完成条件核对和维护/发布验收；当前仍不能宣称全量通过或整个计划完成。未 stage/commit/push。

### 2026-09-05：最终门禁首批结果

- `npm run test:maintenance`：17 文件、328/328 通过，零跳过，30.181 秒；包含迁移故障恢复、容量、诊断和静态分析器回归。报告 `auto—publish/build/test-results/maintenance-timings.json`。
- `npm run typecheck:bridge` 通过；`npm run build:renderer` 内含 renderer typecheck，通过；Vite 构建通过，主 JS 811.23 kB、gzip 228.33 kB，报告超过 500 kB 的 chunk 提示。本轮未修改 renderer，不为消除体积提示新增拆包改造。
- `npm run build:preload` 通过，生成 373030 bytes 的 `build/preload/preload.cjs`。构建产物未手改或提交。
- 正式 `check:clean-build` 的当前源码要求 clean Git commit；当前 dirty worktree 不满足，不能把本地测试或诊断打包标为正式发布通过。下一步使用既有本地 smoke 路径准备合成 unpacked 产物，验证 release 测试，保留 formal clean-build 的限制。
- release/all 尚未完整运行，计划保持执行中。

### 2026-09-05：发布测试修复与本地打包验收

- 本地诊断产物：`auto—publish/release-alpha/complexity-smoke/win-unpacked/ETO—001.exe`。通过既有 alpha 配置及 electron-builder API 指定独立输出目录构建，未覆盖旧产物；运行时准备和 alpha package verifier 通过。产物绑定基线 HEAD，明确记录 dirty=true，不作为正式发布。
- ASAR 中五个新增/修改生产模块与工作区逐字节一致：媒体装配、workspace 装配、生成预检、生成批次服务、媒体扫描服务。最初读取失败来自 Windows ASAR 路径分隔符，路径规范化后验证通过。
- 三个 Electron 测试的启动环境使用各自临时 user-data、APPDATA、LOCALAPPDATA，并清除继承的 workspace override；所有登录、配置测试均为合成 IPC，不执行真实登录或发布。
- 首次 release：80 项、78 通过、2 失败、零跳过，约 131.791 秒。随后两项定向重跑仍失败，分别定位为平台列表 fixture 缺失和已废弃的河畔错误码；没有删除失败断言或延长超时。
- 登录 smoke 改为通过设置中的平台账号入口，提供当前 get-queue 合同的合成平台列表；删除不再消费的文章管理 snapshot fixture。仍验证 open-login/check-login 穿过真实打包 preload/IPC，命令顺序正确且无页面异常。
- 焦点测试改为 UID/密码及“测试账户”当前产品合同，使用 HEPAN_GEO_API_TIMEOUT 错误码；保留首次保存、取消确认后焦点恢复、成功、失败、清除及输入可交互断言，移除旧 Python/Cookie/upload-context fixture 字段。
- 最终定向测试 2/2 通过；完整 release 14 文件、80/80 通过、零跳过，100.116 秒，执行器 CLOSED、allFilesReported=true。N4 打包导航 20/20 收敛，mutationCalls=0、pageErrors=0；全部 118 个 IPC 能力仍通过。报告：`auto—publish/build/test-results/release-timings.json`。
- 最终 lint、diff check 通过。format:check 仍有 19 个既有文件失败：18 个本轮未修改，workspace-runtime-composition 的 HEAD 原格式也不合规；本轮引入的 discovery 文件格式问题已修正。没有混入无关格式化或宣称全仓格式通过。
- 实际运行正式 check:clean-build 返回 BUILD_WORKTREE_DIRTY；显式诊断检查 --allow-dirty 返回 clean=false。该限制没有通过伪造提交、移除门禁或把诊断产物冒充正式产物绕过。
- 当前全部变更中的 JS/MJS 文本合计从 9726 行到 9229 行，净减少 497 行；计入所有新增文件和改名后的测试，不使用 git diff 中把未跟踪改名文件误算为删除的统计。行数仅作结果说明，不作验收目标。
- Bounded Re-review：检查新设置入口的直接组件、平台队列 bridge/IPC 合同、河畔 feature 错误映射，以及 fixture 安装顺序；两项过期测试问题已闭合。全量 test:all 正在执行，结果待追加；尚未提交或进行真实外部操作。

### 2026-09-05：全量验证与完成条件核对

- 最终 `npm run test:all`：288 文件、1983/1983 通过、零失败/跳过/todo/cancelled，191.697 秒；250 文件 parallel、38 文件 serial，执行器 CLOSED、allFilesReported=true。与四组测试数之和 551+1024+328+80 一致。
- all 入口保留原全量 evidence 语义，本次生成的 `auto—publish/build/evidence/root-test-timings.json` 已替换原基线计时报告。314.985 秒且有失败/跳过的旧基线保留在本计划历史记录及原 TEMP 日志中；不得再声称该路径仍存放旧基线。各分组独立报告继续位于 build/test-results。
- 本次完整运行包含生成/入队/发布/恢复行为、迁移与容量回归、IPC 矩阵、真实 bundled preload、合成打包导航和设置交互。没有执行真实客户批次、发布、付费或生产迁移；不将合成验收当作这些外部能力已验收。
- 当前所有 JS/MJS 变更在最终全量测试之后未再改变；后续仅更新文档。Git 保持未提交状态，未 stage/commit/push。

| 计划要求 | 当前证据与结论 |
| --- | --- |
| Phase 0：分类、消费者与基线 | 288 文件清单、唯一执行配置、消费者调查和基线记录已建立。未证明重复的文件保留，不冒充已逐一完成删除评估。 |
| Phase 1：默认核心、显式全量、独立计时 | core 61 文件约 6.4 秒；四组与全量均通过；无参数执行器及 CI 原入口保留。 |
| Phase 2：业务命名与有效去重 | core 已无 phase/ticket 文件名；两项核心验收改名，IPC 删除 29 次重复注册，死工具删除，过期 Electron fixture 收敛。其余历史命名与静态分析器仍保留，不能宣称全仓历史工具已退役。 |
| 生成、入队、发布结果状态覆盖 | generation-batch-runner/service、article-lifecycle-acceptance、regular-platform-acceptance 等公开行为验证成功、失败、暂停、恢复、幂等和不确定结果；完整测试通过。 |
| Phase 3：可选媒体依赖隔离 | 媒体装配集中、供应商配置/网络按用例读取；合成持久库验证启动暂停恢复和损坏可选缓存不阻塞构造；订单业务回归仍在 integration。 |
| Phase 4：收敛职责 | 生成预检与运行 owner 分离，workspace 移出媒体内部装配，删除扫描服务死接口；删除服务和 aggregate 已调查，按明确事务 owner 保留。 |
| Phase 5：历史代码处置 | 无消费者工具已删除；仍有启动/脚本/维护消费者的迁移保留。未满足真实 workspace 全部迁移的删除前提，不进行退役。 |
| 日常/集成/维护/发布测试 | 四组与最终 all 均通过且零跳过；lint、相关 typecheck、renderer/preload build 已通过。 |
| 格式与构建限制 | 全仓 format:check 存在 19 项基线失败；正式 check:clean-build 返回 BUILD_WORKTREE_DIRTY。诊断 alpha 构建和 verifier 已通过，正式发布门禁未通过。 |
| 完成状态 | 本轮实现与本地验收可供审阅；因正式干净提交门禁未完成，整个计划和 Goal 不标 COMPLETE。 |

- 提交授权边界来源：根 AGENTS §8 将提交是否允许交给执行协议与用户授权；EXECUTION-PROTOCOL §1.2 规定“仅在用户当前 Goal 明确授权 commit/merge 时自动执行这些 Git 变更；否则到相应 gate 停止”。本次 Goal 未明确授权 commit/merge，提交确认是当前剩余门禁的前置条件。

### 2026-09-05：获得提交授权并形成实现提交

- 用户明确回复“授权”，允许按工程意图提交本轮变更并继续验证干净提交构建；不 push、不发布。
- 五个本地实现提交：c3e3e37（测试分组与失效工具清理）、7d64fa3（媒体扫描死接口删除）、b451022（生成预检职责分离）、29af836（媒体装配与恢复）、70d1906（测试隔离及设置合同更新）。
- 没有在提交时修改生产源码或测试行为；最终全量 1983 项通过的工作区内容已进入 Git。下一步提交本文档与清单后执行 clean-build 和干净提交的本地构建验收，结果尚未预先标为通过。
