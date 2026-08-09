# M05 — Test Quality Analysis, Initial Inventory, and Work-Package Map

日期：2026-08-09
状态：`ANALYSIS COMPLETE / IMPLEMENTATION NOT STARTED`

## 1. Scope and evidence boundary

本次只分析 M05、建立初始 inventory 并重写执行合同；没有修改 production 或测试，没有删除/降级断言，没有开始 M05-0–I，没有 commit/push，也没有执行真实登录、发布、付费、取消、上传或生产数据操作。

读取的当前真源包括根 `AGENTS.md`、`EXECUTION-PROTOCOL.md`、`AUDIT-PROTOCOL.md`、Wave Plan、原 M05 maintenance、Ticket 24 与 M04-C/24-G closure evidence、当前 `package.json`、runner/inventory scripts、tests/helpers/fixtures 及代表性 phase/Renderer/IPC/adapter tests。归档计划仅用于确认原 M05 历史意图，不作为实时调度真源。

## 2. Current suite baseline

### 2.1 Discovery and runtime

| 项目 | 当前证据 |
| --- | ---: |
| 根 runner 自动发现 | 267 files |
| `.test.js` | 250 files |
| `.test.mjs` | 17 files |
| 根测试实际运行 | 1,925 tests；1,925 PASS；0 failed/skipped/cancelled/todo |
| hybrid pool | 226 parallel files / 41 serial files |
| 本次 wall clock | 458,933 ms（约 7 分 39 秒） |
| `auth-server/tests/*.test.js` | 12 files；不属于根 runner，本次未运行 |
| 根测试目录形态 | 267 个 test files 全部直接位于 `auto—publish/tests/`；另有 `helpers/` 与 `fixtures/` |

运行命令为 `npm test`。第一次工具调用在外层命令超时后，runner 继续运行并产出 `build/evidence/root-test-timings.json`；profile 报告全绿，但 `phase-04-platform-run.test.js` worker 与父 `scripts/run-tests.js` 在 summary/profile 后仍持续存活，最终只终止了本次调用精确确认的两个 PID。该现象不是业务测试失败，但属于 M05-H 必须建立回归证据的 test-process lifecycle/evidence 问题；不能把“已写 PASS profile”等同于“runner 已干净退出”。

当前最慢文件为：production IPC fixture matrix 123,208 ms、Phase 8 cleanup gates 100,622 ms、handoff capacity 75,259 ms、platform run 60,084 ms、runtime capacity 23,062 ms。M05 目标不是性能优化，但这些文件决定最终 gate 成本和 serial pool 风险。

### 2.2 Historical `phase-*` distribution

`phase-*` 共 81/267 files（30.3%），静态近似提取 550 个 `test(...)` 声明；动态矩阵会使静态声明数与实际运行数不同，不能据此做删除决策。

| Phase | Files | 静态近似测试声明 | 主要历史关注点 |
| --- | ---: | ---: | --- |
| 01 | 2 | 7 | domain contract、早期 architecture |
| 02 | 4 | 34 | migration、OperationalStore、runtime capacity、architecture |
| 03 | 17 | 90 | composition、store v3、publication/media/order、legacy removal |
| 04 | 6 | 33 | platform run/account、browser evidence、store v4、media transport |
| 05 | 5 | 12 | P1 fault/recovery、production seams/removal/capacity |
| 06 | 32 | 253 | typed IPC、Renderer feature、capability inventory、workspace/settings/media/content |
| 07 | 1 | 10 | regular queue |
| 08 | 11 | 79 | cleanup gates、reverse dependency、store internals、orchestration、Renderer races |
| 11 | 2 | 17 | media supplier contract/transport |
| 12 | 1 | 15 | paid-media preflight |

phase 名只表达历史到达顺序，不是当前 owner。大量 phase tests 是高质量行为测试，不能按命名整体删除；另一些 phase files 是合法 architecture/absence gate；真正需要治理的是重复 invariant 和用源码形状替代行为的单项断言。

### 2.3 Existing inventory tool gap

`scripts/test-inventory.js` 当前只扫描根 `tests/*.test.js`，记录 250 files / 1,713 个静态声明；它不覆盖 17 个 `.test.mjs`，不与实际 1,925 runtime tests 对齐，也没有 package script/discovery contract 证明其清单完整。其 `readsProductionSource` 是 file-level heuristic：当前标记 57 个 JS files、这些文件共 339 个声明，但这不表示 339 项都是不合理 static test；混合文件中可能同时存在真实行为测试、合法 static gate 和待替换源码断言。M05-0 必须先修正 evidence 工具和人工 disposition ledger，再允许删除。

## 3. Test evidence classification

### 3.1 Genuine behavior/contract evidence

以下是当前真实行为证据的代表性 owner，不是完整文件白名单：

- lifecycle/OperationalStore/application：`article-submission-eligibility`、Ticket 08/13/14/15/16/22/23、`article-mutation-coordinator`、removal transaction/recovery、phase-02/03/04 store、phase-07 queue、phase-08 orchestration。它们实际调用 public facade/service，验证持久事实、fault injection、idempotency、restart 或并发结果。
- Renderer feature：phase-06 content/generation/workspace feature/read-model tests、phase-08 content race tests、article-lifecycle-ticket-14-renderer、platform controller tests。它们调用稳定 feature/controller 接口并观察 snapshot、command state、stale result 或 visible state，而不是读取 TSX 文本。
- IPC/contract：phase-06 typed IPC suites 中调用 registry parser、registrar、preload/bridge fake transport 并断言 exact DTO、safe error、version/unknown-field failure 的部分；M04 的 129-capability TypeChecker identity matrix 是公开 contract closure evidence。
- adapter：regular platform outcomes、Hepan/Doubao parser/client/browser/session、media supplier contract/transport 中以 synthetic response/fake transport 验证 typed outcome、evidence binding 和 cleanup 的部分。
- test tooling：`test-discovery-contract.test.js` 中直接调用 `collectTestFiles/createExecutionPlan/parseArguments` 的测试属于 runner public behavior；其中读取 `package.json`/runner source 的个别 assertion 需在 M05-H 单独分类。

内部测试仍可保留：transaction choreography 的故障注入、复杂 parser/algorithm、关键 recovery diagnostics 等通过公共门面难以定位的风险，不应为了“只测最外层”牺牲诊断价值。

### 3.2 Source/regex assertions that are primarily trying to prove business/UI behavior

旧 inventory 的 file-level 检测给出以下高优先候选。这里的结论是“需逐 assertion 替换/确认”，不是整文件删除清单。

| Cluster | 检测到的 files/tests | 典型问题 | 推荐替代 owner |
| --- | ---: | --- | --- |
| `renderer-*` source readers | 25 files / 108 declarations | 读取 TS/TSX 后匹配 hook/callback/private state/function name、文案附近实现、某组件调用顺序，借此证明刷新、busy、selection、retry、history、trash 等行为 | M05-A/B/C：feature snapshot/command、controller、Renderer harness observable behavior |
| legacy UI/workbench source suites | 6 files / 51 declarations | `content-workbench-regression`、`doubao-content-workbench`、`react-workbench-regression`、desktop/media workbench/UX 通过源码字符串证明页面可达、动作存在、selection/refresh 语义 | M05-A/B/C；少量 public capability/packaging assertion 转 M05-D/G |
| mixed `phase-*` source readers | 14 files / 88 declarations | 同一文件混合 contract behavior、capability absence、dependency guard 和业务源码断言；例如 Phase 04 用“源码不含弱成功 predicate”证明 adapter 成功语义，Phase 05 用 wiring 字符串证明 editor state machine | M05-D/E/F/G 按单项 invariant 拆分，不整文件处理 |
| mixed owner files | 6 files / 47 declarations | Ticket 14、migration、Hepan settings、preload sandbox、discovery 等多数是真行为或合法 gate，但个别 renderer/packaging/source assertion 需重新归类 | 对应 M05-B/D/F/G/H |

代表性不合理模式包括：

- `renderer-article-management-flow` 读取多个 TSX，再用 `articleStageFilter`、`snapshotWorkflowByArticle`、prop 名与中文文案组合证明文章管理行为。
- `renderer-content-refresh-lifecycle` 通过 `refreshRequestIdRef`、`createQueryIdentity`、hook method name 的 presence/absence 证明刷新和 stale fencing；仓库已有 phase-06/08 feature race 行为测试可作为替代候选，但仍需逐风险映射。
- `doubao-content-workbench`、`renderer-batch-generation` 等将一个组件内部调用/状态名当作 queue、selection、retry 和 client-switch 正确性的证据。
- `phase-04-browser-evidence` 只证明 adapter 源码不含 page-wide weak predicate；远端 accepted/failed/uncertain 的映射应由 synthetic adapter contract behavior 证明，静态 absence 不能替代结果分类。

`renderer-encoding`、layout/accessibility、fixed named public API 等边界不能机械归为业务源码测试：其中 encoding/artifact quality、accessibility markup、public capability surface 可能合理保留窄静态 guard，但不能顺带证明业务状态转换。

### 3.3 Static tests that should remain

以下类别与代表性 guard 应保留并在 M05-G 收敛，而不是为了消灭 regex/source inspection 删除：

| 合法类别 | 当前代表性 evidence | 保留理由 |
| --- | --- | --- |
| architecture/dependency | `architecture-seams`、phase-01/02 architecture、phase-08 reverse-dependencies、OperationalStore internals、Renderer contract layout | import graph、forbidden dependency、facade/internal boundary 与唯一 assembly 本来就是静态事实 |
| security | `electron-security`、auth local-data/IPC/protected boundary、workspace validator/path/symlink、production preload sandbox | sandbox/CSP、敏感数据隔离、forbidden path/import/package content 适合静态/结构 gate；运行时 fail-closed 仍需行为测试 |
| retired capability / legacy absence | Ticket 24-E/G、`verify-ticket-24-e-absence`、`verify-legacy-absence`、phase-03 remote-order/runtime-ledger absence、phase-06 dead/legacy path、phase-08 renderer artifact absence | “能力/路径/公开 surface 不存在”只能通过 capability graph、path/import/source/package absence 证明；必须保留 migration-only allowlist |
| packaging/release/CI | desktop/production packaging、packaging runtime、release evidence、CI workflow、Phase 8 package gate | package include/exclude、generated artifact、workflow/script/discovery contract 是静态/产物事实 |
| IPC/public surface | M04 production registry/capability matrix、named preload/bridge surface、TypeChecker symbol identity | exact public contract、consumer closure、legacy/untyped surface absence 是合法 contract/static evidence；DTO 行为仍由 parser/registrar tests 证明 |
| test discovery/runner | discovery collection、single pool assignment、evidence schema | 测试是否被发现/执行一次、CI 使用哪个 runner 是 tooling contract，不是业务行为 |

保留不等于原文件原样不动。多个 phase gate 扫描同一 root/allowlist 时，应保留一个明确 owner 和诊断输出；package source equality、private-data exclusion 与业务 startup behavior 也应在混合文件中分开。

## 4. Duplicate invariant clusters

重复是按“同一风险被多个历史层重复保护”判断，不按相同测试名或 fixture signature 机械判断。当前最明显的 cluster：

| Invariant | 重复保护位置 | 收敛方向 |
| --- | --- | --- |
| OperationalStore 唯一 writer/facade/internal 依赖 | phase-02 architecture、phase-03 composition/runtime-no-ledger、phase-05 production seams、phase-08 OperationalStore internals/reverse-dependencies、`architecture-seams` | 行为留 public facade/transaction tests；静态依赖留一个 architecture gate owner |
| typed IPC exact capability、安全 error、dead caller/legacy absence | phase-06 各 domain typed suites、typed-ipc-production、production-caller-inventory、production fixture matrix、renderer bridge surface、Ticket 24-E | registry/parser/registrar 行为矩阵 + 一个 capability/symbol/absence gate；不要每域重复扫描 preload/Renderer source |
| Renderer content refresh/query identity/stale fencing | `renderer-content-read-model-seam`、`renderer-content-refresh-lifecycle`、workbench controller seams、phase-06 content feature/read model/workbench feature、phase-08 race suite | 以 feature query/command snapshot 和 race matrix 为 owner；组件源码 presence assertions 只保留真正 UI observable 缺口 |
| regular submission single target/outcome/queue claim | phase-03 publication/operational-content、phase-04 store lifecycle、phase-07 queue、phase-08 orchestration、Ticket 24 B/C/G、regular outcome suites | 按 admission、durable queue、remote outcome 三个 public owner保留状态矩阵，删除历史 phase 的同义 happy-path 重复 |
| retired publication/order/ledger capability absence | legacy submission audit、phase-03 remote order/runtime ledger/workbench readonly、phase-06 dead/legacy path、phase-08 artifact absence、Ticket 24-E/G | Ticket 24 allowlist/production capability/package absence 成为唯一负向 gate；不删除 migration-only evidence |
| packaging/private-data/artifact absence | desktop/production packaging、packaging-runtime、phase-03 ASAR absence、phase-06 capability ASAR、phase-08 cleanup/package gate、release evidence | 按 alpha/production package contract 与 legacy artifact absence 分 owner，避免每个历史 phase 重扫整个 ASAR |
| Renderer page/action presence | content/react/doubao workbench regression + 多个 `renderer-*` source suites，与 phase-06/08 feature tests/真实 Renderer harness 重叠 | feature behavior + 少量 user-visible harness smoke；不以 component private shape 作为第二证据体系 |

## 5. Real owners and independent closure boundaries

| Owner | 独立闭环 | 依赖 |
| --- | --- | --- |
| test inventory/classification | discovery-aligned before ledger、每个 source assertion disposition、duplicate map；Closure 后成为 A–H 唯一 authoritative inventory/disposition ledger | 最先完成；当前下一项 M05-0 |
| Renderer content/generation | `features/content` 的 content sources/article management/content generation/paid-media execution、`features/generation`、`features/attention` | M05-0 authoritative ledger |
| Renderer publication/platform/media | `features/platform`、`features/media`、publication presentation/read projection | M05-A Closure；不拥有 paid-media execution 或 provider settings |
| Renderer workspace/settings/shell | `features/workspace`、`features/settings`、diagnostics、confirmation/application shell/presentation utilities | M05-B Closure；不拥有 content/platform/media state |
| typed IPC/preload/bridge | registry DTO、safe error、registrar/preload mapping、capability surface | Renderer callers稳定 |
| core lifecycle/store/submission | lifecycle、transaction、queue、outcome、recovery matrices | contract稳定 |
| external adapters/runtime | third-party mapping/evidence/cleanup，无远端副作用 | core outcome稳定 |
| architecture/security/absence/packaging | 合法 static guards 与 allowlist | 行为替代全部落地 |
| runner/discovery | final file set、pool、cleanup、before/after inventory | 所有测试修改完成 |
| combined audit/closure | 替代 evidence、静态 guard、runner、无 production diff | 所有实现包 Closure |

这些边界能各自形成测试闭环，但不适合并行：共享 inventory disposition、Renderer harness/fixture、capability consumer evidence、测试文件重命名和 discovery 都会让并行线程基于不同事实工作。采用独立线程串行执行，主要收益是每个线程只维护一个测试 owner 心智模型，而不是增加并行速度。

Renderer cluster ownership 已冻结为 maintenance 合同 2.1 表。paid-media execution command state 属于 M05-A；media resource/order read projection 属于 M05-B；AI/media/Hepan provider settings UI 属于 M05-C。component、bridge、共享 App/Sidebar/harness 不因调用关系获得业务 ownership。

## 6. Recommended plan adjustment

原 M05 的 5 条 Execution 原则正确，但把 inventory、全部业务 owner、static gates 和 runner 放在同一个执行项中，无法满足 task-per-work-package、bounded audit 和 owner locality。已将 maintenance 合同调整为：

`M05-0 → M05-A → M05-B → M05-C → M05-D → M05-E（或由 M05-0 冻结为 E1 → E2 → E3）→ M05-F → M05-G → M05-H → M05-I`

其中 M05-0 是硬 inventory gate，其 Closure 输出 `M05-0-authoritative-test-disposition-ledger.md`，作为 A–H 唯一 ownership/scope/disposition 真源。M05-0 Closure 前必须判断 E 是单包，还是 lifecycle/ArticleMutationCoordinator、OperationalStore、submission/publication 三个独立闭环对应的 E1/E2/E3；这是唯一预授权的 package 拆分点。

M05-0 COMPLETE 后，A–H 不得自行改变 ownership、scope、package 或 disposition；只可回填 execution status、替代 evidence、测试结果和 digest。只有 Primary Audit 确认的 blocking finding 才允许主任务显式修订 authoritative ledger、maintenance 合同与必要 Wave Plan。M05-I 是独立 combined audit/closure，不是新的广泛 implementation 阶段；它只审计最终组合 diff、修复已确认 blocking finding并 bounded re-audit。任何包若暴露 production bug，只按 Audit Protocol 分类并判断是否直接阻塞当前 evidence；不能为了让测试更容易而改 production 或新增 test-only seam。

## 7. Commands actually run

- `npm run test:discover` — PASS；267 files。
- `npm test` — profile 记录 1,925/1,925 PASS、0 skip/todo，wall clock 458,933 ms；但 summary 后存在上述 test worker/runner clean-exit gap，已只终止本次精确识别的遗留 PID。
- 静态 inventory probe — 250 JS files、1,713 静态声明；57 个 file-level source-reading candidates / 339 declarations；该工具缺少 MJS，数字只作筛查。
- phase distribution probe — 81 files；各 phase 分布见上表。
- `git status --short`（文档修改前）— clean。

未运行：auth-server tests、Renderer build/typecheck、packaging/release、真实 Electron package、真实外部账号操作。它们不是本次只读分析的完成条件；M05 各工作包按合同执行对应 gate。

## 8. Final planning freeze

- 下一可执行项唯一为 M05-0；本规划线程不开始 M05-0。
- 严格顺序为 `0 → A → B → C → D → E（或 0 冻结的 E1 → E2 → E3）→ F → G → H → I`；每一步都等待前一步 Closure 和新的 clean integration HEAD。
- M05-0 ledger 冻结 A–H ownership/scope/disposition；后续 handoff 只记录执行 delta/evidence，不建立第二套分类真源。
- M05-I 只做独立 combined audit、blocking remediation、bounded re-audit、final clean-HEAD gate 和 closure；不重新开展广域 implementation。
- 本次收敛完成后结束 planning，不修改 production/test implementation，不创建 M05-0 执行线程。
