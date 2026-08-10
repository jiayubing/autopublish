# M05 — Test Quality Cleanup

**Purpose:** 在业务规则和 contract surface 最终稳定后，减少“测试源码长什么样”的脆弱测试，把业务保证迁移到公开行为/合同/集成测试，同时保留真正有价值的 architecture/security/static absence/packaging 门禁。

**Status:** `COMPLETE`；M05-0 authoritative ledger、A–H 测试迁移、M05-I combined audit/closure 与 M05-J final evidence reconciliation 均已完成。M05-J3 已关闭 classifier/P1 residual、完成 bounded re-audit，并在 implementation HEAD 上取得完整 `npm test` PASS；最新 closure handoff 见 `../handoffs/M05-J3-final-static-guard-closure.md`，当前唯一 inventory 真源仍见 `../handoffs/M05-0-authoritative-test-disposition-ledger.md`。

**Scheduling gate:** M04 `COMPLETE` 后调度；该 gate 已满足。维护 10.5 第二项已按 `M05-0 → M05-A → M05-B → M05-C → M05-D → M05-E1 → M05-E2 → M05-E3 → M05-F → M05-G → M05-H → M05-I → M05-J` 从 clean integration HEAD 严格串行完成。M05-J Closure 后本任务停止；M06 仍未启动。

## 1. Evidence policy

### 1.1 Allowed static-test categories

源码/regex/static inspection 只允许证明：

1. architecture/dependency direction、forbidden import 或唯一 assembly/owner 边界；
2. public capability、IPC/preload/bridge surface 或 retired/legacy capability 的存在/不存在；
3. generated artifact、CI、test discovery、packaging/release contract；
4. security static boundary，包括 sandbox、CSP、敏感数据/路径隔离和 package exclusion。

这些门禁必须使用明确 production root、精确 capability/path/import graph 或受控 allowlist；不得把任意源码字符串、私有函数名或实现行数包装成“architecture”测试。

### 1.2 Behavior evidence required

业务状态转换、错误分类、权限结果、队列/订单行为、持久化一致性、并发/幂等/恢复、adapter outcome 和 UI 操作必须通过公开行为、稳定 contract、直接调用链 integration 或真实 Renderer harness 的可观察结果证明。删除旧 static assertion 前必须先确认同一风险已有等价行为证据；不能只因为另一个测试名相似就视为替代。

### 1.3 Global prohibitions

- M05 不修改 production behavior，不为了测试重构 production，也不新增 test-only production seam/export/flag。
- 不通过 skip、todo、放宽断言、提高超时或固定 mock 成功值换取绿色。
- 不机械按文件数、phase 名或源码读取存在与否删除测试；混合文件必须按单项 invariant 分类。
- 若新行为测试暴露 production bug，按 Audit Protocol 标注 severity 与 `INTRODUCED_BY_CHANGE` / `EXPOSED_PREEXISTING` / `CROSS_COMPONENT_INTERACTION` / `PROCESS_EVIDENCE_GAP`；除非直接阻塞当前 M05 evidence，不顺手扩大 production scope。
- auth-server 是独立边界；根 runner 不覆盖它。M05-0 只确认其 discovery/owner 状态，除非发现同类明确债务，否则不把 auth-server 行为测试拉入桌面测试清理。

## 2. Work packages

每个工作包由一个新的独立 Codex 执行线程从最新 clean integration HEAD 开始。前一包必须完成定向测试、Primary Audit、blocking remediation、bounded re-audit、handoff 和 integration 后，才允许创建后一线程；不得预创建并行任务。各包允许修改范围中的“tests”包括对应 fixture/helper，但不自动授权 production source。

### 2.1 Frozen Renderer ownership

M05-A/B/C 只按当前仓库已经存在的 authoritative feature owner 划界，不因测试文件位置、组件嵌套或共享 bridge/harness 改变 ownership：

| Package | Authoritative owner / feature 范围 | 明确不属于该包 |
| --- | --- | --- |
| M05-A | `features/content/` 下的 `content-workbench-feature`、`content-sources-feature`、`article-management-feature`、`content-generation-feature`、`paid-media-execution-feature` 及对应 hooks；`features/generation/generation-feature`；`features/attention/attention-feature`。覆盖客户/问题/研究资料、文章管理/历史/编辑/删除动作投影、单篇与批量生成、生成后投稿 handoff、内容工作台内 paid-media preflight/execution command state、attention action。 | platform account/queue/run、media resource/order list、provider settings、workspace/bootstrap、IPC/bridge contract、adapter outcome。 |
| M05-B | `features/platform/platform-feature`、`platform-event-router`、`platform-feature-context`；`features/media/media-feature`、`order-list-projection` 及对应 hook；现有 publication presentation helpers/read models（例如 publication status/history projection，以及 publication-derived navigation summary）。覆盖 account selection、platform run/queue/progress、publication history/uncertain presentation、media resource pool 与 order list/read projection。 | content workbench 的 paid-media execution command state（归 A）、media/Hepan provider configuration（归 C）、transport contract（归 D）、远端 adapter mapping（归 F）。 |
| M05-C | `features/workspace/workspace-feature`、`workspace-coordinator`、runtime diagnostic sink/store 及 contexts；`features/settings/settings-feature`/context；Renderer application shell、workspace bootstrap gate、confirmation API/host 和纯 presentation utility（route/layout、responsive layout、time/encoding/accessibility）。覆盖 AI/media/Hepan provider settings 的 Renderer command/status 展示，但不覆盖 provider adapter 行为或 publication-derived summary。 | content/platform/media 业务 feature、publication-derived navigation/read projection（归 B）、Electron security/packaging static gate（归 G）、IPC/bridge contract（归 D）、provider runtime/adapter（归 F）。 |

Component 只展示并收集用户意图，不因被某组件 import 就成为 authoritative owner。跨 cluster 的 `App`、`Sidebar`、account selector、shared confirmation 或 Renderer harness 测试，按其实际证明的 feature state/action 归属；若一项断言同时声称保护两个 owner，M05-0 必须先拆成两个 disposition，后续包不得共同拥有同一 invariant。

### M05-0 — Reproducible inventory and disposition ledger

**Scope:** 将本次分析的初始扫描升级为可复现 before inventory；覆盖根 runner 实际发现的 `.test.js` 与 `.test.mjs`、测试声明/动态矩阵、source-reading 候选、合法 static 类别、重复 invariant cluster、runner pool 与每项 disposition。每个待删/改 static assertion 必须记录真实保护意图、替代行为 evidence owner 和后续工作包。M05-0 Closure 必须产出 `../handoffs/M05-0-authoritative-test-disposition-ledger.md`；该 ledger 是 M05-A–H 对测试 ownership、scope、disposition、替代 evidence 和保留 static guard 理由的唯一 authoritative inventory。本分析 handoff 在该时点降为历史输入，不与 ledger 竞争。

**主要 owner:** test evidence inventory / classification；不是任何业务事实 owner。

**允许修改:** `auto—publish/scripts/test-inventory.js`、必要的 inventory 自测、`package.json` 中仅与 inventory 命令发现有关的 script、M05 inventory/handoff 文档。

**禁止触碰:** production、现有业务测试断言的删除/降级、runner concurrency/timeout/pool policy、auth-server 业务测试。

**前置依赖:** M04 COMPLETE；`../handoffs/M05-analysis-and-work-package-map.md`。M05-0 已完成；当前唯一可执行项为 M05-A。

**完成标准:** inventory 与 `npm run test:discover` 文件集合一致；JS/MJS 均覆盖；file-level heuristic 与 assertion-level 人工结论明确区分；所有 source-reading 候选和 phase duplicate cluster 有唯一 disposition/owner/后续包；混合文件不被整文件误分类；before manifest/digest 可供 M05-I 对照。ledger 必须冻结 A/B/C authoritative owner、A–H 每项 scope/disposition、替代 evidence、允许修改范围和直接 gate，并完成下述 M05-E complexity decision。

**M05-E mandatory complexity decision:** M05-0 Closure 前必须重新评估 lifecycle projection/ArticleMutationCoordinator、OperationalStore persistence/transaction/recovery、submission/publication application orchestration 是否已经形成三个独立状态机、fixture 集和可单独 Closure 的测试闭环。若没有，保持单包 M05-E；若有，允许且只允许在 M05-0 Closure 中把 E 冻结为：

1. `M05-E1` — lifecycle projection、domain article permissions/attention policy/query 与 ArticleMutationCoordinator 行为矩阵；不含 M05-A 的 Renderer attention feature；
2. `M05-E2` — OperationalStore public facade、持久事实、transaction、fault/restart/recovery 行为矩阵；
3. `M05-E3` — submission/publication application、admission/queue claim、remote outcome/reconciliation 行为矩阵。

拆分判断必须记录 owner、测试闭环、文件/fixture 交叠和严格顺序 `D → E1 → E2 → E3 → F`，并同步更新本合同与 Wave Plan 后才可将 M05-0 标记 COMPLETE。不得产生 E1/E2/E3 之外的新 package，也不得让 migration reader、Renderer、IPC 或 adapter 进入 E1–E3。

**Post-M05-0 scope freeze:** M05-0 COMPLETE 后，A–H 只能执行 authoritative ledger 已分配的 ownership/scope/disposition，不得自行移动测试、改变 owner、合并/拆分 package 或扩大允许修改范围。后续包只可更新 ledger 的 execution status、替代 evidence link、测试结果和 digest 等事实字段。只有当前包 Primary Audit 确认的 blocking finding 才能触发 ownership/scope/disposition 例外；例外必须先按 Audit Protocol 分类，暂停后续调度，由主任务在同一 integration HEAD 显式修订 ledger、本合同和必要 Wave Plan，再继续当前包。普通实现便利、新发现的非阻塞重复或“顺手更合理”均不构成改 scope 的理由。

**主要测试/gate:** inventory 自测、`npm run test:discover`、`test-discovery-contract.test.js`、`git diff --check`。

**独立线程:** 是；这是后续实现的硬 gate，不与其他包并行。

**M05-0 Closure freeze（2026-08-09，ledger after inventory）：** authoritative ledger 已覆盖 runner 实际发现的 231 个 `.test.js` 与 17 个 `.test.mjs`、1,680 个静态声明、动态矩阵、file-level/assertion-level source-reading distinction、合法 static category、duplicate invariant/signature cluster、pool assignment 和逐项 disposition。A/B/C ownership 采用本合同 2.1 表；A–H scope/disposition/replacement mapping 以 `../handoffs/M05-0-authoritative-test-disposition-ledger.md` 为唯一真源。M05-E 已冻结为 `M05-E1 → M05-E2 → M05-E3`，严格顺序为 `D → E1 → E2 → E3 → F`；migration reader 不进入 E1–E3。M05-0 未删除/改写任何业务测试、未改 runner policy、未触碰 production。

### M05-A — Renderer content, article-management, and generation evidence

**Scope:** 仅治理 2.1 表中 M05-A authoritative owners：ContentWorkbench content sources、article management/history/editor、generation/batch、Doubao question/research、attention，以及内容工作台内 paid-media execution command state 的源码/regex 业务断言；复用现有 feature public API、query/command snapshot、race/failure tests 和必要的 Renderer harness observable behavior，合并重复 phase/renderer invariant。

**主要 owner:** 2.1 表列出的 content/article-management/content-generation/generation/paid-media-execution/attention features；该表是本包 authoritative owner 清单，component 不拥有状态机。

**允许修改:** 与该 cluster 直接相关的根测试、fixture、`tests/helpers/renderer-harness.js`（仅测试资源生命周期/复用）、M05 handoff/ledger。

**禁止触碰:** Renderer/desktop production source、platform/media/settings/workspace 测试、IPC registry、OperationalStore、为测试导出私有 hook/function。

**前置依赖:** M05-0 COMPLETE；authoritative ledger 已冻结并进入新的 clean integration HEAD。除此之外不得提前启动。

**完成标准:** content/generation 的状态、stale fencing、busy/error/finally、刷新和用户动作由 public feature/observable UI 证明；不再以组件源码中的 callback 名、hook 名、文案附近实现片段或私有函数名证明业务行为；旧 static tests 只有在等价风险已映射后才合并/删除；失败可定位到 content/generation owner。

**主要测试/gate:** content/generation feature tests、phase-08 renderer race tests、相关 Renderer harness tests、Renderer typecheck/build（若触及 harness/TS test fixture）、inventory delta。

**独立线程:** 是。

### M05-B — Renderer publication, platform, and media evidence

**Scope:** 仅治理 2.1 表中 M05-B authoritative owners：普通平台 account/run/queue/progress、publication history/uncertain presentation、media resource pool 与 order list/read projection 的 Renderer 源码断言；优先通过既有 platform/media feature、event router、projection/read model 和可观察 UI 证明。

**主要 owner:** 2.1 表列出的 platform feature/event router/context、media feature/order-list projection、publication presentation helper/read model；adapter 结果语义仍归 M05-F。

**允许修改:** 对应 Renderer tests、fixture/helper、M05 handoff/ledger。

**禁止触碰:** production、content/generation/workspace/settings cluster、外部 adapter implementation、OperationalStore 状态机、IPC registry 重整。

**前置依赖:** M05-A COMPLETE 并进入新的 clean integration HEAD；只消费 M05-0 authoritative ledger 与 A 的完成 delta，不重新决定 scope。

**完成标准:** queue refresh、跨页进度、uncertain 禁止直接重试、publication/order presentation 和 media actions 由 feature/controller/harness observable behavior 证明；保留真正的 public capability absence，移除用组件源码布局或私有调用名替代行为的证据；无第二 Renderer state owner。

**主要测试/gate:** platform/publication/media Renderer feature/controller tests、相关 typed fixture smoke、Renderer typecheck/build、inventory delta。

**独立线程:** 是。

### M05-C — Renderer workspace, settings, shell, and shared UI evidence

**Scope:** 仅治理 2.1 表中 M05-C authoritative owners：workspace bootstrap/selection/coordinator/diagnostics、settings feature（含 AI/media/Hepan provider configuration UI）、confirmation host、navigation/responsive layout、time/encoding/accessibility 等 shell/presentation 测试；区分真正的 UI observable behavior、窄静态质量 guard 和脆弱源码片段断言。

**主要 owner:** 2.1 表列出的 workspace feature/coordinator/diagnostics、settings feature/context、application shell/confirmation host 与纯 presentation utility；不拥有 content/platform/media 生命周期或 provider adapter。

**允许修改:** 对应 Renderer/Electron harness tests、fixture/helper、M05 handoff/ledger。

**禁止触碰:** production、content/platform/media feature tests、Electron security/packaging gate（留给 M05-G）、IPC registry。

**前置依赖:** M05-B COMPLETE 并进入新的 clean integration HEAD；只消费 M05-0 authoritative ledger 与 A/B completion delta。

**完成标准:** bootstrap invalid/error/disabled states、workspace command lifecycle、settings/confirmation/nav/layout 的用户可见结果由 public feature 或 harness 证明；源码编码扫描若保留必须被分类为窄静态质量 gate，不能证明业务流程；共享 harness 无资源泄漏且不靠增加 timeout。

**主要测试/gate:** workspace/settings feature tests、Renderer harness/electron UI tests、Renderer typecheck/build、inventory delta。

**独立线程:** 是。

### M05-D — Typed IPC, preload, bridge, and contract evidence consolidation

**Scope:** 审查历史 phase-06 typed IPC family、production IPC fixture matrix、caller inventory、dead-capability/bridge API tests；把 DTO validation、safe error projection、registrar/preload behavior 与 capability/absence/dependency static guard 分开，合并重复 exact-count/consumer assertions但保留 M04 后唯一 contract owner 和 TypeChecker symbol-identity closure。

**主要 owner:** domain IPC contracts/registry、desktop registrar、preload、Renderer bridge mapping；transport 不拥有业务事实。

**允许修改:** IPC/preload/bridge contract tests、fixture matrix、TypeScript symbol evidence helper、对应 test script 与 M05 handoff/ledger。

**禁止触碰:** production contract/registry/preload/bridge、Renderer业务测试、adapter/store、为了测试恢复旧 barrel/compatibility export。

**前置依赖:** M05-C COMPLETE 并进入新的 clean integration HEAD；Renderer caller evidence 已稳定后才能收敛 production caller inventory。

**完成标准:** request/result/version/unknown-field/safe-error/event tests 通过公开 registry/registrar/preload/bridge 行为证明；静态测试仅保留 named capability surface、consumer/absence、symbol identity 和 dependency boundary；重复 phase tests 合并后仍覆盖全部 129 capability（若生产合同未变）且失败能定位 contract owner。

**主要测试/gate:** typed IPC owner suites、`npm run test:production-ipc-matrix`、main/bridge/renderer typecheck、`test:ticket-24-e` 的 IPC/capability subset、inventory delta。

**独立线程:** 是。

### M05-E — Core lifecycle, OperationalStore, and submission behavior consolidation

**Scope:** 对 phase-02/03/04/05/07/08 与 ticket/owner-named tests 中重复保护文章生命周期、单活动目标、queue claim、publication outcome、order observation、removal/recovery 和 migration isolation 的行为矩阵进行 owner-based consolidation；保留能定位 transaction/failure/concurrency boundary 的内部测试。

**主要 owner:** lifecycle projection、OperationalStore public facade、submission/publication application service、ArticleMutationCoordinator；migration reader 仍为隔离 owner。

**允许修改:** 上述 owner 的 behavior/integration tests、合成 fixture/helper、M05 handoff/ledger。

**禁止触碰:** production、Renderer/IPC/adapter/static gate tests、schema/migration implementation、仅为减少文件数删除故障注入或恢复诊断。

**前置依赖:** M05-D COMPLETE 并进入新的 clean integration HEAD；M05-0 已冻结“单包 E”或“E1→E2→E3”决定。单包时执行 M05-E；拆分时本节共同合同由 E1、E2、E3 依次消费，任一前包未 Closure 不得启动下一包。

**完成标准:** 每个核心 invariant 由最少但充分的 owner/public-call-chain 状态矩阵保护；正常、明确失败、uncertain、duplicate/idempotent、stale/reordered、restart/recovery 的必要分支不因去重丢失；同一 invariant 不再被多个历史 phase 文件用近似 fixture 重复保护；保留测试可诊断性。

**主要测试/gate:** lifecycle/OperationalStore/submission/publication/removal/migration 定向矩阵、fault injection/concurrency tests、inventory delta。

**独立线程:** 是；若 M05-0 决定拆分，则 E1/E2/E3 各用一个独立线程严格串行，不得重新合并或并行。

### M05-F — External adapter and runtime-boundary evidence

**Scope:** 治理 regular platform、Hepan、Doubao browser/media adapter 与 worker/runtime tests；用窄 adapter contract 的输入→typed outcome/remote evidence mapping 和 failure/uncertain 行为替换“生产源码不含弱成功 predicate/某调用片段”等业务源码扫描，同时保留外部能力 absence、credential/path security 和无真实远端调用边界。

**主要 owner:** platform adapters、publisher contract、browser/session runtime boundary；不拥有 lifecycle freeze/retry/manual-resolution 事实。

**允许修改:** adapter/runtime tests、synthetic fixture/fake transport、M05 handoff/ledger。

**禁止触碰:** production adapter、真实登录/发布/付费/取消/上传、Renderer/IPC/store/static packaging tests、录入真实 Cookie/token/provider body。

**前置依赖:** 未拆分时 M05-E COMPLETE；拆分时 M05-E1、E2、E3 全部 COMPLETE；且最终 E sourceState 已进入新的 clean integration HEAD。核心 outcome 语义稳定后才能判断 adapter 测试是否重复或越权。

**完成标准:** adapter success/explicit failure/uncertain/evidence binding/credential cleanup 由 contract behavior 证明；源码 static 只保留明确 security/absence/dependency guard；不通过 adapter 测试复制 lifecycle 状态机；全部数据合成且无远端副作用。

**主要测试/gate:** regular adapter outcomes、Hepan/Doubao/media adapter contract、worker/runtime failure tests、security cleanup tests、inventory delta。

**独立线程:** 是。

### M05-G — Architecture, security, absence, packaging, and CI guard consolidation

**Scope:** 在业务/contract replacement evidence 已完成后，统一审查合法 static tests；按 architecture/dependency、security、retired capability/legacy absence、packaging/release/CI 四类收敛重复 phase guard，保存 Ticket 24 migration allowlist 与 legacy absence，不以 regex 证明业务正确性。

**主要 owner:** architecture gate、security gate、legacy-absence gate、packaging/CI contract；这些是验证 owner，不是业务事实 owner。

**允许修改:** static gate tests/scripts/allowlist、packaging/test discovery contract tests、M05 handoff/ledger。

**禁止触碰:** production、migration allowlist 语义放宽、删除 Ticket 24 必要 absence、把行为断言改名成 architecture gate、打包真实产物或发布。

**前置依赖:** M05-F COMPLETE 并进入新的 clean integration HEAD；只有所有替代行为 evidence 已落地才能删除重叠 static assertion。

**完成标准:** 每个保留 static guard 都有唯一类别、目标 root/graph/capability 与失败说明；OperationalStore reverse dependency、Electron sandbox/CSP、auth local-data boundary、Ticket 24 legacy absence、package/private-data exclusion、CI/discovery 等关键门禁仍在；跨 phase 重复扫描合并且 allowlist fail closed。

**主要测试/gate:** architecture/reverse-dependency、electron/auth security、`npm run test:ticket-24-e`、`npm run test:legacy-absence`、packaging/CI/discovery contracts、`npm run test:phase-08:gates`。

**独立线程:** 是。

### M05-H — Test runner, discovery, after inventory, and execution evidence

**Scope:** 在最终测试集合上校准 discovery、serial/parallel pool、资源 cleanup、profile/evidence 与 after inventory；修复本次分析已观察到的“summary/profile 已 PASS 但 `phase-04-platform-run` worker/父 runner 未退出”类 test-process 生命周期问题，但不得把业务测试失败隐藏为 runner 成功。

**主要 owner:** `scripts/run-tests.js`、`scripts/test-runner-policy.js`、test discovery/evidence/inventory tooling。

**允许修改:** runner/policy/evidence scripts、runner/discovery/inventory tests、纯测试资源 cleanup、M05 handoff/ledger。

**禁止触碰:** production、业务断言、提高 timeout、强制吞掉 worker failure、扩大 concurrency 超过既有安全上限、把未完成测试计为 PASS。

**前置依赖:** M05-G COMPLETE 并进入新的 clean integration HEAD；必须针对最终文件集合工作。

**完成标准:** `.js/.mjs` 自动发现无人工名单遗漏；每文件恰好进入一个 pool；runner 只有所有 worker/resources 退出后才返回最终状态；after inventory 能逐项对照 before disposition；无 skip/todo/未报告文件；定向串行和 hybrid profile 均可解释。

**主要测试/gate:** runner-policy/discovery/inventory/evidence tests、相关 process cleanup regression、`npm run test:discover`、小型 hybrid/serial parity probe、`git diff --check`。

**独立线程:** 是。

### M05-I — Combined audit and closure

**Scope:** 作为独立 combined audit / closure，只审计 M05-0–H（若拆分则含 E1–E3）的最终组合 diff，核对替代 evidence、合法 static guard、duplicate closure、runner/discovery、authoritative ledger 对账和无 production 改动。M05-I 不是新的广泛 implementation 阶段，不重新分类全仓测试、不重新设计 package、不主动增加测试抽象或开启新的 cleanup；只允许修复 combined audit 已确认的 blocking finding，之后执行 bounded re-audit。

**主要 owner:** M05 combined evidence/closure；不新增测试 abstraction 或业务 owner。

**允许修改:** blocking remediation 所需的测试/tooling/doc 最小闭环、最终 handoff、Wave Plan/M05 状态。

**禁止触碰:** production、A–H 已冻结 scope 的重新实施、fresh full-rewrite/reclassification、M06 silent-catch、Ticket 25、真实外部操作、非阻塞历史债的大范围清理。

**前置依赖:** M05-H Closure，且 0–H 全部进入同一 clean integration HEAD。

**完成标准:** before/after inventory 完整；每个删除/改写的业务 static assertion 有等价 public behavior evidence；保留 static guard 分类正确；blocking findings 关闭；bounded re-audit PASS；最终 clean HEAD 上 M05-specific gate PASS。完整 `npm test` 必须实际运行且 runner `CLOSED`、`allFilesReported=true`、`skipped/todo/cancelled=0`；仅在真实 artifact/runtime prerequisite failure 时登记窄范围 exception，本次 M05-J3 已无该 exception。M05 标记 COMPLETE 后停止，不自动进入 M06。

**主要测试/gate:** 所有工作包定向矩阵、`npm run test:discover`、完整 `npm test`、auth discovery/专项（仅若 M05-0 纳入其改动）、main/bridge/renderer typecheck、lint、format/diff check、architecture/security/absence/packaging gates。

**独立线程:** 是；必须独立于实现包。

### M05-J — Final evidence reconciliation

**Scope:** 只处理 M05-I closure 后发现的 classifier false negative、业务 source assertion residual 与 full-test closure contract/evidence 对账；不重做 M05-A–I，不进入 M06，不修改 production behavior、runner concurrency/timeout/pool policy 或真实 artifact。

**完成标准:** classifier 能识别 file-scope production reader helper、拆分 path reader 与 source-text assertion，并以回归测试区分 runtime harness；最终 `REWRITE_PUBLIC_BEHAVIOR=0`；业务/UI/runtime residual 已迁移到 public behavior/contract/Renderer harness/owner seam；所有 retained static guard 绑定允许 category、owner、invariant、不可由 behavior test 替代的理由；完整 runner 在 implementation HEAD 实际运行并记录 `CLOSED`、`allFilesReported=true`、无 skip/todo/cancelled；最终 handoff 写明 Base/implementation/closure HEAD、manifest、commands/results、replacement mapping 与 verdict。

**主要测试/gate:** `tests/test-inventory-contract.test.js`、M05-J residual 定向 tests、`npm run test:discover`、`node auto—publish/scripts/test-inventory.js`、完整 PowerShell 命令 `$env:RUN_ELECTRON_FOCUS_TESTS='1'; npm test -- --profile-output <temp>`、`git diff --check`。

**独立线程:** 是；完成后 M05 保持 `COMPLETE`，不得自动进入 M06。

**M05-J3 final closure（2026-08-10）：** implementation commit `35ff6998419af1f1ae7d5708862bc9634ca13409` 仅修改测试/测试工具；classifier regression 证明任意私有实现名本身为 `REWRITE_PUBLIC_BEHAVIOR`，真实 sandbox boundary guard 仍为 `RETAIN_STATIC_GUARD`。最终 inventory 为 248 files（231 JS、17 MJS）、1,680 declarations、53 source-assertion candidates、53 retained static guards、`REWRITE_PUBLIC_BEHAVIOR=0`、`semantic REWRITE_PUBLIC_BEHAVIOR=0`。完整 runner 为 248/248 files、1,792/1,792 passed、0 failed、0 skipped、0 todo、0 cancelled，`CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`。具体替代映射、P1 closure、production diff、P3 non-blocking note 和完整命令结果见 `../handoffs/M05-J3-final-static-guard-closure.md`；closure commit 为 docs/evidence-only，准确 hash 以最终 Git 验证为准。

## 3. Serial order and dependency rationale

推荐且唯一默认顺序：

`M05-0 inventory → M05-A Renderer content/generation → M05-B Renderer publication/platform/media → M05-C Renderer workspace/settings/shell → M05-D typed IPC → M05-E1 lifecycle/projection → M05-E2 OperationalStore/transaction/recovery → M05-E3 submission/publication/outcome → M05-F external adapters → M05-G legal static gates → M05-H runner/after inventory → M05-I combined audit/closure → M05-J final evidence reconciliation`

严格依赖表：

| Next | 必须已 COMPLETE 的直接前置 | 启动条件 |
| --- | --- | --- |
| M05-0 | M04 | COMPLETE；ledger 已集成，下一项为 M05-A |
| M05-A | M05-0 | authoritative ledger 与 E complexity decision 已冻结并集成 |
| M05-B | M05-A | A Closure/evidence 已进入新的 clean integration HEAD |
| M05-C | M05-B | B Closure/evidence 已进入新的 clean integration HEAD |
| M05-D | M05-C | 三个 Renderer cluster 全部稳定，caller evidence 不再变动 |
| M05-E1 | M05-D | M05-0 已冻结拆分形态；D Closure 已集成 |
| M05-E2 | M05-E1 | E1 Closure 已集成 |
| M05-E3 | M05-E2 | E2 Closure 已集成 |
| M05-F | M05-E3 | E1/E2/E3 核心 lifecycle/store/submission evidence 全部 Closure |
| M05-G | M05-F | 行为替代已完成，才允许收敛合法 static guards |
| M05-H | M05-G | 最终测试文件集合与 guard 集合已稳定 |
| M05-I | M05-H | 0–H 全部位于同一 clean integration HEAD；只做 combined audit/closure |
| M05-J | M05-I | 只做 closure evidence reconciliation；不重做 A–I、不修改 production、不进入 M06 |

- M05-0 ledger 是 A–H 的唯一 ownership/scope/disposition 真源；后续 handoff 只记录执行 delta/evidence，不创建竞争分类表。
- A/B/C 都可能共享 Renderer harness、fixture 和 source-reading ledger，必须串行，但按 2.1 冻结的 feature owner 分开以限制单线程心智模型。
- D 依赖最终 Renderer caller/capability evidence；E 依赖稳定 contract；F 依赖核心 outcome 语义；G 必须等行为替代已存在后才能安全去重 static guard。
- H 必须基于最终测试集合校准 discovery/pool/cleanup；I 必须独立执行一次 combined audit/closure。
- 即使文件范围看似不重叠，也不建议并行：inventory disposition、测试重命名/合并、shared helper 和最终 discovery 都是共享证据 owner。

## 4. Acceptance criteria

- [x] M05-0 产出可复现 before inventory，覆盖实际 discovery 的 JS/MJS，并明确每个被删/改 static assertion 的替代行为 evidence。
- [x] 不再存在用私有函数名、实现行数、任意源码片段证明业务行为的测试；任意私有实现名 name-only regression 不再被 classifier 授权为 static guard。
- [x] architecture/security/legacy absence/packaging/CI/discovery static guard 被保留并有清晰分类；53 个 retained guards 均落入合法 category。
- [x] 核心业务 owner 都有稳定公开接口或直接调用方测试，失败能定位到领域边界；本次删除项的 replacement mapping 已记录。
- [x] 重复 phase tests 按 invariant/owner 收敛，而非按文件数机械删除；必要故障注入和诊断价值保留。
- [x] 未修改 production behavior，未新增 test-only production seam，未执行真实外部操作。
- [x] M05-H 产出 after inventory 与 runner cleanup evidence；无 discovery omission、skip/todo 或 summary 后遗留测试进程。
- [x] M05-I combined audit、blocking remediation、bounded re-audit 与 M05-specific final clean-HEAD gates PASS；其 full-run provenance 由 M05-J 重新绑定到最终 clean HEAD。
- [x] M05-J classifier、residual migration、static-category ledger 与 full-test contract reconciliation 完成；implementation HEAD 上完整 runner PASS；M06 未启动。
