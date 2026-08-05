# 重构工程进度账本

> **2026-08-05 Phase 8 Ticket 17 审计后状态（当前最高权威）：** Phase 8=`IN_PROGRESS`，普通功能开发继续冻结，正式 release=`BLOCKED_RELEASE`。虽然 root suite、迁移、链接、安全、打包、准入模拟和 Phase 8 package gate 均通过，固定自动门 `required/auth-container` 仍无 CI Linux/Docker pass，不能改记为人工通过或据此关闭工程。evidence 绑定 `codex/refactor-program` 的 `9dcab0194ccf3e4f8f8a90fb718ebadf64e55aa4`，并保留提交前的 `DIRTY` source state；Ticket 17 closeout 已在用户授权后提交。37 条 finding、29 个 OPT、module/owner/dependency/legacy/package gates、schema/migration/recovery、三项准入模拟和所有人工 release blocker 的逐项证据见 `phase-08-final-report.md` 与 `handoffs/phase-08.md`。

> **2026-08-05 Phase 8 Ticket 15 完成与专项复验（当前最高权威）：** Ticket 15=`COMPLETE`；第五轮独立 `sol`/medium 专项复验无新增 actionable finding，P0/P1/P2/P3 均为 `0`；Phase 8 仍=`IN_PROGRESS`，正式 release=`BLOCKED_RELEASE`。基线为 detached `HEAD` `fd47958bcac8296bb76b6c89a58c70e9aee87157`（`codex/refactor-program`）；修复范围包含 Content rollback API/fixture、bounded recovery page、generation IPC task projection、独立 migration/capacity evidence contract、CI 命令与既有 module-size exception；未 stage/commit/push/PR。只使用系统临时目录、仓库合成旧 workspace/Auth fixture、隔离 SQLite、合成容量数据和本地 production `--dir` 制品，未访问真实 workspace、内容库、Auth DB、账号、Cookie、供应商、投稿、同步、扣费或外部平台。

> 迁移/恢复：Content library v2 新增 guarded byte-for-byte rollback，并通过 manifest ownership/hash、completion-marker hash、unexpected-backup 和 byte-for-byte rollback 验收；Content metadata v1、OperationalStore v1、Auth v1→v2 的 dry-run、冲突/损坏/路径边界、atomic/断点/重复执行、备份恢复、故障注入、rollback/retry 和残留证据均通过；desktop migration `65/65`，Auth `49/49`，health `9/9`，rate-limit `9/9`。容量 report `20/20`：10,000 publications 的 recovery 单页上限 `256`、总 facts `10,000`；submission batch `500/5,000`；generation `500/5,000` 的 IPC task projection 上限 `256`；media `1,000/10,000/13,000/20,000`；Auth limiter `100,000` identity，均通过并保持有界查询、payload、heap/entry 和 IPC/page-size 断言。migration report SHA-256=`6529ca719323db5c22b81ce76d2ff03f22c3745ad6d6910e9ca25f64204e052b`；capacity report SHA-256=`a84ffdb258d4f78012f92fe15571798de75aadaa6de536ea9ec5066a2de6d3fe`。

> 制品/证据：本轮 production `--dir` 使用本地 Electron `43.1.1` distribution 验收，ASAR `1,799`、unpacked `385`、extraResources `6`，capability `109/109`，legacy/package violations `0`；保留 `app.asar` SHA-256=`db6f984c9c268d33159a70842c7a06e0851c1dfea23bf011985dd40749ebb190`。production artifact manifest 为 `13` artifacts，SHA-256=`35d35da19ce2fabc7dfc47457ee72f89a7c55a072ab697c1f8f32e78a5f0060e`；production smoke 为 `10` passed、`0` failed、`1` `SKIPPED_OPTIONAL`，SHA-256=`84d4de538ffd02c45972be93ff6aeceae75c50cb6ca9311f4d1a86533dc3eb73`。Docker 不可用，`required/auth-container` 保持 `PENDING_HUMAN`，source state 为 `DIRTY`，release state 为 `BLOCKED_RELEASE`。

> 自动化收口：最终 root suite 为 `238` 个测试文件、`134` suites、`1618/1618` pass、0 fail、0 skip；lint、main/renderer/bridge typecheck、format、Phase 8 gates、production verifier、offline smoke、legacy absence、`git diff --check` 均通过。release evidence manifest 已按文档修改重生成，source state 仍为 `DIRTY`、release state 仍为 `BLOCKED_RELEASE`。

> 人工门：真实生产恢复、签名 rollback package、installer upgrade/rollback、TLS/proxy/signing、真实 external E2E、Auth backup policy/recovery drill/RPO-RTO 及 Phase 4 平台/账号/Hepan/media/signed-login 均未执行，不能以合成 fixture 代替。若真实恢复、未知远端事实或签名 rollback 证据失败，应按计划重开所属阶段；本 Ticket 不新增 wrapper、不放宽边界。证据路径为 `auto—publish/build/production-artifact-manifest.json`、`auto—publish/build/release-evidence-manifest.json` 和 `auto—publish/build/evidence/`。

> **2026-08-05 Ticket 13 审计闭环最终追加（当前最高权威）：** 第二轮独立 `sol`（medium）复审发现 3 个 P2 门禁缺口并已最小修复：`packageBoundaryReport` 现在扫描 `app.asar`、`app.asar.unpacked` 及 resources extraResources；Renderer dependency gate 同时拒绝 bare/`node:` Node builtin；owner/writer gate 识别 qualified SQLite `DatabaseSync`/open writer，并以 publisher surface inventory 拒绝额外 owner。新增 extraResources secret、bare `fs`/`child_process`、qualified writer、duplicate owner 反例，Phase 8 gate 专项由2项扩为3项并全绿。

> 第三轮也是最多轮次的独立只读 `sol`（medium）审计结论为 `P0=0、P1=0、P2=0、P3=2`，仅指出 extraResources 负例断言的 `OR` 不独立和 owner inventory 原依赖文件名；主线程已拆独立断言，并改为按 publisher surface 识别候选，未启动第四轮。fresh package 实际 gate `PASSED`：ASAR 1798、unpacked 385、extraResources 5、violations 0；capability `109/109`、legacy `0/0`、module-size/stale `0/0`。最终 lint、三套 typecheck、format、gate `3/3`、`git diff --check` 全部通过。

> **2026-08-05 Phase 8 Ticket 13 执行、审计与复验（当前最高权威）：** Ticket 13=`COMPLETE`；Phase 8 仍=`IN_PROGRESS`，正式 release 仍=`BLOCKED_RELEASE`。本轮删除无 production caller 的 `legacy-adapter-publisher.js`、`publisher-router.js`、旧 `phase-03-publisher-adapter.test.js` 和无 owner `cleanup-source-runtime.js`；新增真实 desktop publisher router contract test；删除 numeric `runCode` 兼容分支与 Playwright screenshot export；Doubao 收缩为 JSON diagnostic 并在 trim 时清除遗留 PNG；runtime tool manifest 从 tracked `build` output 迁移到 `config/runtime-tools-manifest.json`；renderer Vite 从 production `dependencies` 收缩为唯一直接 `devDependencies` 声明并同步 lockfile。完整 deletion/replace 映射、retired source/archive 0 引用证据见 `docs/refactor/handoffs/phase-08.md`，历史 review 文档未修改。

> 本轮固化 `verify-phase-08-gates.js` 与 `phase-08-cleanup-gates.test.js`：`dependencyDirection`、`operationalStoreBoundary`、`uniqueOwnersAndWriters`、`capabilityReachability`、`legacyAbsence`、`moduleSize`、`trackedGeneratedOutput`、`packageBoundary`；CI/release evidence required check 为 `required/phase-08-gates`。capability gate 复用真实 TypeScript symbol evidence，109/109 reachable；package gate 扫描 ASAR/unpacked 的 private/test/retired/sensitive 内容（含 JS/CJS/MJS）与 link；module gate 维护 37 项有理由的 ceiling，并拒绝缺失、超限或 stale exception。CI-only verifier、module exception、build-input manifest 排除 production ASAR。

> 首轮独立 `sol`（medium）审计发现 1 个 P1、3 个 P2、1 个 P3，主线程已按最小范围修复：补 JS 敏感扫描与 ASAR 负例、保留 PNG 遗留清理、补 Vite 直接 dev dependency、把 capability 从 metadata 计数改为真实 symbol reachability、将 stale module exception 改为 fail。修复后专项复验及修复后独立只读复审无 P0/P1；subagent 未修改、stage 或 commit。

> 最终验证：root `238` 个测试文件 `1608/1608` pass、Auth `49/49`、fresh `npm run pack:production:smoke:dirty` 及 production preload/renderer/offline/package/legacy/capability/module gates 全部通过（capability `109/109`、legacy source/archive `0/0`）；lint、main/renderer/bridge typecheck、format、renderer `npm ci --dry-run`、`git diff --check` 全部通过。工作树仍未 stage/commit/push/PR；所有 fixture 为临时/合成/离线输入，正式 release 与人工 gates 状态不变。

> **2026-08-03 Phase 8 Ticket 04 提交与合并（最新 Git 状态）：** Ticket 04 已通过定向复验，在 `codex/phase-08-ticket-04` 提交 `d4510bf`，并以 merge commit `d60424a` 合并回 `codex/refactor-program`；Ticket 04=`COMPLETE`，Phase 8 仍=`IN_PROGRESS`，未 push/PR。下方 Ticket 04 记录保留合并前的执行证据，不再作为当前 Git 状态依据。

> **2026-08-02 Phase 8 Ticket 04 最小修复复验（当前追加记录）：** 独立审计暴露 3 个 P1/P2 边界问题，均先以真实调用面的最小红测复现再收口：restore 持锁期间 trash listing 可触发 unlocked recovery；workspace root 为 junction 时 research、question、legacy migration 可越界写入；generation batch 仅枚举 canonical 文件而漏掉 `.journal/.bak/.tmp` 残留。修复仅拆出 ArticleStore 的 unlocked trash helper、在共享 `content-path-policy` 增加 root boundary 检查并接入 3 个入口、让 batch listing 从合法 artifact 推导 canonical 文件并 recovery；未改 Content application interface、Content IDs、DTO、Markdown/sidecar、batch schema、removal token/fingerprint/TTL 或 error codes。新增回归为 phase lifecycle5/5、article28/28、batch6/6、content/link/migration96/96、lifecycle/removal33/33；`test:links` 为184/184（file-symlink=yes、directory-junction=yes），`test:migration` 为57/57；修复前 3 类红测均失败，修复后全绿。完整 root `node scripts/run-tests.js`（`npm test` 等价入口）230 文件/133 suites/1500 pass/0 fail/0 skip；lint、main/renderer/bridge typecheck、format、`git diff --check` 通过。全部证据仅使用临时合成 workspace、子进程 fault 注入和链接 fixture；未访问真实内容库、未执行真实永久删除、外部投稿或付费调用；未 stage/commit/push/PR。Phase 8 仍=`IN_PROGRESS`，正式 release 继续`BLOCKED_RELEASE`。

> **2026-08-02 Phase 8 Ticket 04 Content storage/lifecycle internals（当前执行记录）：** 在 `codex/phase-08-ticket-04` 将 ArticleStore、ContentStore、ClientMaterialStore、TemplateStore/Catalog、GenerationBatchStore、ArticleRemoval/Trash facades 的内部职责拆为 ContentIdentity/path policy、article serialization、article/content file transaction、article lock、batch serialization/file store、removal plan/cursor/state/confirmation；稳定 Content IDs、DTO、Markdown/sidecar、batch schema、removal token/fingerprint/TTL/error codes 未改变。新增 lifecycle fault fixtures 覆盖 trash move/restore 中断、permanent-delete staging 恢复与 generation/removal junction fail-closed。Content 定向147/147、拆分组合69/69、links181/181、migration56/56、Phase02/05/06/08 architecture/caller168/168、alpha packaging46/46、alpha smoke/ASAR/retired-path8/8、完整 root `npm test` 230文件/133 suites/1495 pass/0 fail/0 skip；lint、三套 typecheck、定向 Prettier、`git diff --check` 通过。`client-knowledge`、question/research legacy reader 与 `legacy-migration` 中残余 `path.join` 已审计为 module-internal/migration-only，不是生产 caller 侧 path/layout seam。全部证据仅使用临时合成 workspace/dirty alpha package，未访问真实内容库，未执行真实永久删除、外部投稿或付费调用；未 stage/commit/push/PR。Phase 8 仍=`IN_PROGRESS`，Phase 4/7人工门与正式 release 继续`PENDING_HUMAN`/`BLOCKED_RELEASE`。

> **2026-08-02 Phase 8 Ticket 11 Auth policy internals（当前执行记录）：** `codex/phase-08-ticket-11` 已将原 713 行 `auth-domain.js` 拆为 facade + Password/Account/Device/Session/Entitlement/Projection/Policy-utils 内部模块；`SourceResolver`、`LoginPolicy`、`BoundedWindowLimiter` 继续保持独立职责。Auth public facade、HTTP routes/status、稳定错误、schema v2、token/hash/device contract 未改变；删除无 production caller 的 `auth-store` compatibility helper 与 `opts.store` composition path，HTTP contract test 改用 `InMemoryAuthRepository + AuthDomain`。Auth49/49、health9/9、rate-limit9/9、backup/restore13/13、migration56/56、packaging46/46、diagnostics32/32、links181/181、legacy source/archive named matches0/0；lint、main/renderer/bridge typecheck、format、架构/Auth contract与`git diff --check`通过。Root `npm test`/`test:desktop-core` 在本机 Windows Node test runner 超过400秒未返回summary，保持`PENDING_ENVIRONMENT`，未将其误标GREEN；Phase 8仍=`IN_PROGRESS`，Phase 4/7人工门与正式release继续`PENDING_HUMAN`/`BLOCKED_RELEASE`，未stage/commit/push/PR，未访问真实数据或外部服务。
> **2026-08-03 Phase 8 Ticket 03 最小修复与专项复验收口（当前最高权威）：** 针对独立 `sol` subagent（中等推理强度）确认的 migration payload 失败清理误删 live-B 与 importer allow-list 过宽，已做最小修复：migration 仅在当前路径仍对应原 fd 文件身份且 token 未变时清理不完整 lease；结构门禁对 migration importer 使用精确 importer→specifier allow-list，仅允许 recovery guard。前一轮已落地的 SQLite `BEGIN IMMEDIATE` recovery guard、静态副作用 import 识别保持不变。新增 live-B replacement 红回归与精确 allow-list 回归；本地定向20/20，独立专项复验相关回归45/45，P0/P1/P2/P3均为0；format、lint、main/renderer/bridge三套typecheck、`git diff --check`均通过。最终完整 root suite 本轮为230个测试文件、132 suites、1501/1502 pass，唯一失败仍为既有 offline Electron storage-boundary 波动；隔离 `tests/packaging-runtime.test.js` 为7/7通过。Ticket 03=`COMPLETE`，Phase 8继续=`IN_PROGRESS`，正式release继续=`BLOCKED_RELEASE`。subagent未修改、stage或commit；本工作树未stage/commit/push/PR，未访问真实workspace、Auth数据、账号、Cookie、供应商或外部平台。

> **2026-08-02 Phase 8 Ticket 03 专项复验整改（当前最高权威）：** 独立 `sol` subagent（中等推理强度）只读复验发现2个P1与1个P2：未取得 migration lease 的 contender 会在 `finally` 删除他人锁；runtime/migration 失活锁回收存在 ABA 删除窗口；importer 门禁遗漏 `auth-server` 且漏判恰好指向 internal 目录的导入。已做最小修复：migration 仅由本次 token 所有者清理；runtime/migration 失活回收删除前重新确认 token，invalid runtime lock fail-closed；结构门禁加入 `auth-server/src`、`auth-server/scripts`，并覆盖 internal 目录本身导入；新增 contender 锁保护回归。定向组合33/33；`npm test` 为230个测试文件、132 suites、1497/1497 pass、0 fail、0 skip（300.188秒）；format、lint、main/renderer/bridge三套typecheck、`git diff --check`均通过。subagent未修改、stage或commit；本工作树未stage/commit/push/PR。Phase 8继续=`IN_PROGRESS`，正式release继续=`BLOCKED_RELEASE`。

> **2026-08-02 Phase 8 Ticket 03 独立审计整改（当前最高权威）：** 按用户要求由独立 subagent（`sol`，中等推理强度）完成只读审计，主线程复核确认 3 项发现：runtime/migration lease 的检查与创建存在 TOCTOU 窗口（P1）、migration 被强杀后 `migration.lock` 无失活回收（P1）、缺少禁止 production caller 直导 OperationalStore internal modules 的结构门禁（P2）。已做最小修复：runtime owner 在原子取得 `runtime.lock` 后二次检查 migration lease，失败按 token 释放；migration lease 写入 token、仅回收确认已退出 PID 的失活锁，并在取得 migration lock 后、构建临时库前二次检查 runtime owner；新增 production-root importer 门禁与两侧 lease 回归。定向组合32/32；`npm test` 为230个测试文件、132 suites、1496/1496 pass、0 fail、0 skip（395.916秒）；format、lint、main/renderer/bridge三套typecheck、`git diff --check`均通过。subagent未修改、stage或commit；本工作树未stage/commit/push/PR。Phase 8继续=`IN_PROGRESS`，正式release继续=`BLOCKED_RELEASE`，未访问真实workspace、Auth数据、账号、Cookie、供应商或外部平台。

> **2026-08-02 Phase 8 Ticket 03 执行记录（当前最高权威）：** 在保留 `createOperationalStore` public surface、schema `v3`、稳定 error code、事务不变量和 main-only writer 的前提下，将原约 1,891 行 `operational-store.js` 拆为 82 行 facade 与 runtime/owner lease、schema/migration/verifier、context/transaction、publication、submission batch、recovery/post-processing、order、maintenance、safe utility 等 12 个 internal modules。facade 不再包含 `DatabaseSync`、SQL、表名或 transaction choreography；新增 `tests/phase-08-operational-store-internals.test.js` 固化 35 个 public keys、冻结 facade、schema v3、内部模块存在和 SQL/表名隐藏；`phase-08-reverse-dependencies` 继续保护 production `src → desktop = 0`。Ticket 03 定向 Phase 2/3 组合112/112、facade/结构/reverse-dependency/alpha组合6/6、packaging46/46、links181/181、diagnostics32/32、migration56/56、legacy absence source/archive 0/0、test discovery230文件；lint、main/renderer/bridge typecheck、format、pack smoke、`git diff --check`均通过。完整 root suite 为230个测试文件、132 suites、1493/1493 pass、0 fail、0 skip（386.270秒）。Phase 8 继续=`IN_PROGRESS`，正式 release 继续=`BLOCKED_RELEASE`；未 stage/commit/push/PR，未访问真实 workspace、Auth 数据、账号、Cookie、供应商或外部平台。旧 writer、migration reader、runtime/migration lock 和 public caller 均未误删，Ticket 03 仅删除 facade 内部复杂性并合并为受控 internal owners。

> **2026-08-02 Phase 8 Ticket 01/02 审计修复与固化（当前最高权威）：** 重新采集的 5 条 production `src → desktop` 命中已全部迁移为 `src/infrastructure/workspace/*` 与 `src/infrastructure/runtime/*` 中立 seam；删除 `desktop/storage-paths.js`、`desktop/workspace-paths.js`、`desktop/packaging/packaged-runtime-resolver.js`、`desktop/packaging/playwright-runtime-paths.js` 和 runtime diagnostics 内旧 resolver 暴露。架构门禁现按 importer 将相对 import 解析为仓库相对路径后再分类，并有最小回归覆盖；定向架构测试3/3通过，同时保护 Domain/Application、Renderer、worker/adapter 禁止依赖。workspace/path定向26/26、runtime/packaging/Hepan/diagnostics定向26/26、packaging46/46、links181/181、diagnostics32/32、扩展architecture82/82；lint与main/renderer/bridge typecheck通过；完整root suite为229个测试文件、132 suites、1490/1490 pass、0 fail、0 skip；`git diff --check`通过。未改schema、ContentIdentity、PublicationWorkflow、OperationalStore writer、Renderer产品行为或真实数据；已由一个明确 commit 固化，未 push/PR。Phase 8仍=`IN_PROGRESS`，Ticket 03、04、11、12可从该 commit 分别在独立分支/工作树开始，正式release继续`BLOCKED_RELEASE`。

> **2026-08-02 Phase 8 Ticket 01 基线冻结（历史记录，Ticket 02 已在上条记录完成）：** Phase 8 已由 `codex/refactor-program` / `aff1dfd089aff2492f9054747ce55f94304cffdd` 启动为 `IN_PROGRESS`。当前 tracked source diff=0、staged=0；工作区唯一未跟踪项是用户提供的 `.scratch/phase-08-cleanup-acceptance/issues/` 计划目录，未清理、未恢复、未覆盖。已创建 `docs/refactor/phase-08-decision-map.md`，冻结 production chain `desktop/main.js → authenticated-runtime → workspace-runtime → content/publication compositions → services/stores/publishers → IPC registry/preload → media-workbench`、唯一 owner/writer、5 条 `src → desktop` 反向依赖、compatibility/legacy DTO、33 个超过400行第一方 production 模块及其 Ticket 02–17 归属。现场 discovery 为228文件（216 `.test.js`、12 `.test.mjs`）；Phase 7 紧凑 architecture 基线66/66；本 Ticket 扩展 production-root/owner/legacy/IPC 组合81/81；legacy source/archive absence摘要为0/0；lint、main/renderer/bridge三套typecheck、`git diff --check`通过。Phase 04=`PENDING_HUMAN`、正式 release=`BLOCKED_RELEASE`继续保持；未访问真实 workspace、内容库、Auth DB、账号、Cookie、供应商、外部投稿、同步、扣费、生产或付费系统；未stage/commit/push/PR。Ticket 02已完成；下一 frontier 为 Ticket 03、04、11、12，可从 Ticket 01/02 固化 commit 分别在独立分支/工作树开始；Phase 8 cleanup、全链验收、功能开发准入和release批准尚未执行。

> **2026-08-02 Phase 07 代码与自动化收口（当前最高权威，覆盖下方历史状态）：** Ticket 07 的 Root CI、固定 required checks、Auth migration/backup/restore evidence、结构化 diagnostics/legacy absence、production directory/offline smoke、release manifest、checklist validator、独立审查整改和 Phase 7 handoff 已完成；Phase 07=`COMPLETE`，完成点为包含本条记录的 Phase 7 closeout commit。提交前生成的本地证据明确为 `sourceState=DIRTY`，正式 release=`BLOCKED_RELEASE`；Phase 8 或正式发布前必须对 closeout commit 重新生成证据。Phase 04=`PENDING_HUMAN`，其人工验收继续阻塞正式 release但不阻止 Phase 07 代码收口；Phase 08=`NOT_STARTED`，本 closeout 未执行其 cleanup、全链验收或 release 批准。未访问真实数据、账号、供应商、生产服务或付费系统。

> **2026-08-01 Phase 03/04/06 阶段收口（当前最高权威，覆盖下方历史状态）：** 用户确认终止开放式重复审计，以 `af56c12` / `phase-06-audit-remediation-green` 的完整 GREEN 证据作为自动化收口基线。`P1-CONVERGENCE-01=VERIFIED`；Phase 03=`COMPLETE`，Phase 06=`COMPLETE`，Phase 04=`PENDING_HUMAN`（四项受控人工验收仅阻止正式 release），Phase 07=`READY`。后续只有可从 production 调用链复现且涉及数据损坏、安全、错误投稿/扣费或主流程不可用的 P0/P1 才能重开已关闭阶段；新增 evidence-helper 理论反例、长模块拆分和测试提速进入后续技术债，不再阻止 Phase 07。本次状态提交以 `phase-03-06-closure` 标记。

> **2026-08-01 Phase 06 审计整改 checkpoint（当前权威）：** 追加收紧证据 helper 的 callback `return`/`finally` 控制流：同步必抛 callback 后的不可达 cleanup、动态提前 return 均 fail-closed；`finally { return; }` 吞异常仍保持可达。仅修改证据 helper 与回归测试，未扩大到 production IPC、Renderer、订单或业务服务。symbol evidence `148/148`；production matrix `33/33`（109 capability、21 lifecycle、5 event）；inventory/bridge fail-closed `16/16`；完整 `npm test` 为 225 文件、132 suites、`1453/1453` pass、0 fail/skip；main/renderer/bridge typecheck、定向 lint/Prettier 与 `git diff --check` 通过。`P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。本 checkpoint 以 `phase-06-audit-remediation-green` 标记，不能作为 Phase 06 `COMPLETE` 结论；未访问真实 workspace、账号、供应商或外部/付费系统。

> **2026-08-01 Phase 06 独立审计后最小修复复验（最新权威，覆盖以下历史统计）：** 独立复核发现证据 helper 对 const 对象属性、字面量 `.length` 与 `typeof` 的静态短路值解析不足；四个永久 RED 反例已以最小 GREEN 收口。仅增加确定静态值求值并保持未知值 fail-closed，未改 production runtime、IPC contract、业务服务或制品输入。symbol `144/144`；production matrix `33/33`（109 capability、21 lifecycle、5 event）；Coordinator `7/7`、caller `3/3`、bridge fail-closed `9/9`、capability inventory `4/4`。完整 `npm test` 为 225 文件、132 suites、`1449/1449` pass、0 fail、1 个既有 Electron focus skip；Auth `16/16`、links `180/180`、packaging `33/33`、Lint、三套 typecheck、format、定向 Prettier、Renderer `2157` modules、pack smoke、diff check 全绿。当前 Renderer/preload/ASAR/exe 尺寸为 `758842`/`222731`/`7214697`/`225485824` bytes，hash 与本轮制品已核验。`P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`；仅使用合成/临时 fixture，未访问真实数据或外部付费系统，未 stage/commit/push/PR。

> **2026-07-31 Phase 06 独立审计整改最新交接（当前唯一权威，覆盖以下历史统计）：** 现场冻结于 `codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`；`git status --short --untracked-files=all` 为 `M=117`、`D=14`、`??=21`，staged=0，既有 WIP 保留，未 reset/clean/stage/commit/push/PR。Ticket 1→4 串行 TDD 全部完成：五个 verifier RED（entry 丢弃返回 snapshot、local non-escaping assignment、shadowed `Object.freeze`、return-finally、throw-finally）及一个真实 Coordinator StrictMode lifecycle RED 均转为最小 GREEN；普通 try/finally 对照保持 GREEN。证据核心仍唯一公开 `verifyCapabilityEvidence()`，Coordinator 以 `stop()` 支持 effect replay，`dispose()` 仍为 terminal API。
>
> 最新证据为 symbol `121/121`、production matrix `33/33`（109 capability：43 query、61 command、5 event；21 lifecycle；5 event）、Coordinator `7/7`、caller `3/3`、bridge fail-closed `9/9`。完整 `npm test` `225` 文件/`132` suites/`1426/1426`，Auth `16/16`、links `180/180`、packaging `33/33`，Lint、main/renderer/bridge typecheck、宽/定向 Prettier、Renderer `2157` modules、pack smoke、ASAR/source parity `10/10`、packaged preload `3/3`、Electron focus `1/1`、diff check 全绿。Renderer/preload/ASAR/exe SHA-256 为 `048D72A0856D0F50B0A0FB241467B799EC17D0B7010AAEFFE904B54122B15641`、`0A8642AB024AD5061E8ACC71C42DB566C62DC8E9D443277C45F2EE0C41B177F4`、`709A7AF4E555076F4FF695331E1B3985C5A5EF419DF2BAA8054CCF401FC8AFEA`、`983EDAC6B0CC86DC6DD884B217AE471655E5A3943ED3FA13EFDC34953DA051D3`。
>
> 所有测试仅使用合成/临时 fixture；真实 workspace、内容库、Auth 数据库、账号、外部服务、供应商、投稿、同步、扣费和付费 submit 均为 `0`。`P1-CONVERGENCE-01` 为“整改复验 GREEN，等待最终独立只读审计”，不是 `VERIFIED`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。本线程停止于等待下一次独立只读审计。

> **2026-07-31 本轮独立审计四项最小整改（当前唯一权威）：** 值流丢弃、伪 UI consumer、未调用 cleanup 和 preload typed event 诊断污染四项已按公共 seam 完成 RED→GREEN；production matrix 109/109、lifecycle 21/21、event 5/5，完整 `npm test` 225 文件 1413/1413，lint 与三套 typecheck、`git diff --check` 通过。`format:check` 仍仅有整改前已知的 `platform.ts`、`transport.ts` 两项。`P1-CONVERGENCE-01=RED`，Phase03/04/06=`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

> **2026-07-31 最终独立审计五项P1最小整改（当前唯一权威）：** 唯一公开`verifyCapabilityEvidence()` seam新增五个永久RED→GREEN反例，覆盖跨模块未调用返回API、未渲染intrinsic JSX handler、未调用application返回成员中的send、未由真实订阅返回的consumer disposer，以及从不可达JSX实例借用lifecycle snapshot。修复仅收紧entry级callsite可达性、渲染实例、application owner返回成员、精确subscription call/disposer类型及snapshot wiring；保留真实跨模块runtime API消费，未修改production runtime、IPC合约、业务服务、package输入或制品。Phase06证据组合152/152，production matrix109/109、lifecycle21/21、event5/5；完整`npm test`225文件1408/1408，lint、三套typecheck、定向Prettier与`git diff --check`通过。`P1-CONVERGENCE-01`整改复验为`VERIFIED`，Phase03/04/06继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 本轮最终独立审计四项P1直接整改（当前唯一权威）：** 唯一公开`verifyCapabilityEvidence()` seam新增五项永久RED→GREEN反例：producer仅在`while(false)`中调用、正确feature实例仅由dead JSX wiring提供、registration receiver以`ipcMain || fake`进入错误运行时分支、preload `removeListener`仅在静态不可达分支、feature disposer仅在静态不可达分支调用。修复后静态循环与dispose证明均按可达控制流fail-closed，composition props/context wiring只接受从记录Renderer entry可达的callsite并按Program/entry缓存，registrar逻辑回退拒绝任何可提供错误receiver的运行时分支。证据核心、109项production matrix、21项lifecycle、5项event及bridge fail-closed组合111/111，capability inventory 4/4；完整`npm test`225文件1371/1371，lint、format、三套typecheck与`git diff --check`通过。仅证据helper/test与本轮记录变化，production runtime、package input和既有制品未变；`P1-CONVERGENCE-01`整改复验为`VERIFIED`，但Phase03/04/06继续`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 最终只读审计三项P1直接整改（当前唯一权威）：** 唯一`verifyCapabilityEvidence()`新增三项永久RED→GREEN反例：Renderer owner仅经未调用entry callback、owner仅作为未消费JSX prop、producer callback仅在`if(false)`中调用。入口现在只沿确证callback契约，JSX只接受intrinsic事件或闭合到子组件真实消费的prop，callback调用证明排除静态不可达分支；React `lazy`及既有React/标准异步集合边界按TypeChecker声明闭合。证据专项66/66、matrix33/33（109 capability、21 lifecycle、5 event）、fail-closed7/7，合计106/106；完整`npm test`225文件1366/1366，lint、定向Prettier与`git diff --check`通过。仅测试证据helper/test变化，Phase03/04/06 production、package input和既有制品未变；阶段继续`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待再次最终独立只读审计。**

> **2026-07-30 Phase06独立审计追加整改（当前唯一权威）：** 唯一证据核心对“未调用callback中的Renderer consumer”与“registration entry传入fake receiver/application”仍有三类假阳性；本轮三个永久反例均经公开`verifyCapabilityEvidence()`先RED后最小GREEN。现在consumer只沿确证会执行的callback边界可达，registrar receiver/application必须由registration entry实际callsite实参闭合。专项63/63、matrix33/33（109 capability、21 lifecycle、5 event）、fail-closed7/7，合计103/103；Phase06组合32/32。完整`npm test`225文件1363/1363、Auth16/16、links180/180、packaging33/33，lint/三套typecheck/format/diff通过。本轮仅变更证据helper/fixture/test，production runtime与package input未变，已有制品hash保持。`P1-CONVERGENCE-01`整改复验为`VERIFIED`，但不代表最终独立审计通过；Phase03/04/06=`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**
>
> **2026-07-30 计划21最终审查后TDD终态（当前唯一权威）：** `P1-EVIDENCE-APPLICATION-01`、`P1-EVIDENCE-PRODUCER-02`、`P1-EVIDENCE-COMPOSITION-03`、`P1-EVIDENCE-PRELOAD-04`、`P1-EVIDENCE-REGISTRAR-05`已针对追加审查的文本application兜底、静态不可达producer、条件factory错误实例、未解析preload member、dead nested registrar application五项反例串行RED→GREEN，仍直接使用唯一公开`verifyCapabilityEvidence()` seam。证据专项60/60，production matrix/fail-closed组合100/100，matrix109/109（43 query、61 command、5 event），lifecycle21/21，event5/5。`npm test`225文件1360/1360、Auth16/16、links180/180、packaging33/33，lint/format/三套typecheck、Renderer/preload build、标准`npm run pack:smoke`、alpha verifier与`git diff --check`通过。`P1-CONVERGENCE-01`、`P2-FINAL-ORDER-01`、`P2-CONVERGENCE-02`均`VERIFIED`；Phase03/04/06=`IN_PROGRESS`，Phase07=`NOT_STARTED`。以下旧统计均为历史记录。

> 本文件由每个阶段执行任务更新。规划完成不代表阶段完成。状态只能使用`NOT_STARTED`、`READY`、`IN_PROGRESS`、`BLOCKED`、`PENDING_HUMAN`、`COMPLETE`。

> **当前唯一权威制品：** Renderer/preload/ASAR/exe SHA-256分别为`E1B965347C5BEA36B27006555E0DCFC5E380211A6BA39D925A7516FFD204A860`、`3F56D207A9FB3BFB8C807CFCCA5DF3F5F57CC93B7D38DC97A128840433BFB8EC`、`71CD2F7A24CC0106D712348835B1803F943C6BB36F18E41133E025B1CA6BF073`、`60E05AFB17FF24E541DC9AEDCB82B749D8024B15F46CF66D51688B017239AAF6`；尺寸分别为757,886、222,057、7,212,426、225,485,824 bytes。

2026-07-30 最终复验更正（最高优先级）：自审追加导出入口内未调用arrow producer helper断链回归，RED→GREEN后corpus33/33、production suite33/33、合计66/66；最终`npm test`225文件1333/1333、0 fail/skip（164.262秒），lint与diff check复验通过。此行取代下方同日32/32、1332/1332中间统计，其余制品哈希、147条WIP、staged=0、外部调用0及阶段状态不变。

2026-07-30 最终证据引擎整改终态（当前权威，取代下方2026-07-29统计）：按用户确认seam串行完成5个TDD Ticket。RED覆盖Renderer callable reachability/精确实例、bridge/preload/registrar精确symbol、lifecycle query→state→snapshot→UI、event producer→唯一consumer→真实返回disposer/application，以及真实SQLite订单打开矩阵；所有RED均以最小GREEN收口。证据corpus32/32，production suite33/33：109 capability（43 query、61 command、5 event）、21 lifecycle、5 event全绿；订单/OperationalStore31/31。完整`npm test`225文件1332/1332（171.121秒）、0 fail/skip，Auth16/16、links180/180、packaging33/33、capacity19/19、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、ASAR order-owner parity/retired zero path、packaged preload3/3、Electron focus1/1、`git diff --check`全绿。最新ASAR7,212,371 bytes（2026-07-30 07:51:39.869 +08:00），SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe225,485,824 bytes，SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。分支/HEAD不变，147条WIP保留、staged=0；真实workspace、内容库、Auth DB、账号、供应商、投稿、同步、扣费及付费submit=0。三个整改项均`VERIFIED`；Phase03/04/06=`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

2026-07-29 证据引擎与订单链接整改终态（最新当前权威，取代下方同日统计）：production-level RED直接经109项matrix相同核心复现旧production verifier错误放行不存在的lifecycle `stateSource`和event producer；真实临时SQLite复现canonical published订单supplier `2→9`后按钮可见但main拒绝。整改后109项production matrix与20项mutation/acceptance直接调用唯一`verifyCapabilityEvidence()` TypeChecker symbol-identity核心，闭合receiver/production reachability、21项query→state→snapshot consumer和5项producer→唯一consumer→dispose，`P1-CONVERGENCE-01=VERIFIED`。订单投影与main command复用canonical published+安全持久URL语义，supplier code仅展示，`P2-FINAL-ORDER-01=VERIFIED`；syntax-independent supplier/canonical不变量保持，`P2-CONVERGENCE-02=VERIFIED`。inventory为109（43 query、61 command、5 event）；matrix109/109、lifecycle21/21、event5/5、mutation/acceptance20/20。完整`npm test`225文件1318/1318（约213.8秒）、0 fail/skip，Auth16/16、links180/180、packaging33/33、capacity20/20（原冻结19项仍全部通过）、13k SQLite query/SQL=1/1、parsed=3、orders=3、paid send=0，三套typecheck、lint、format、Renderer2157 modules/`index-DQopcXb_.js`、preload222,057 bytes、pack smoke、retired owner与最新ASAR/order-owner parity6/6、packaged preload3/3、Electron focus1/1、diff check均通过。最新ASAR `auto—publish/release-alpha/win-unpacked/resources/app.asar`为7,212,371 bytes（2026-07-29 23:29:01.007 +08:00），SHA-256 `399812E8617DE57994B8D810F9895293938FAF11A841479739BC0A0456120A19`；exe为225,485,824 bytes（23:29:01.819 +08:00），SHA-256 `FC6F03EE4CC60BC51D1C0CD95548A69999C8A4134A19C93DCA768A7C51AFDC49`。分支/HEAD为`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`，147条既有WIP原地保留、staged为空；真实workspace、内容库、Auth DB、账号、供应商、投稿、同步、扣费和付费submit调用为0。Phase03/04/06=`IN_PROGRESS`，Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

2026-07-29 最终审计收敛整改终态（当前权威）：启动门禁为`codex/refactor-program`/`3992736d01413d83504253c7d905c21fcfe3183c`、staged为空，全部既有WIP保留。A先冻结第4.1节12类断链mutation，connected baseline 1/1 GREEN、mutation 12/12 RED；正式109项证据改为单一TypeScript Program/TypeChecker symbol identity、alias/作用域调用图/参数常量/JSX/registrar handler闭合，删除旧parse-only矩阵的名字、receiver文本、全文件同名、shortcut、`endsWith`及跨call拼接，109/109。正确owner为Phase06 evidence；仅显式化动态content/settings binding与GeneratedArticles内部Commands类型，IPC schema/inventory不变。B正确owner为Phase03：真实临时SQLite完整覆盖四canonical无observation、五supplier code、promotion/不提升/published单调性/restart/backup/restore；删除fallback语法枚举，退休owner source/import/export/test/ASAR为零，两个order owner source↔ASAR逐字节一致；schema保持v3且public interface无本轮变化。C完整`npm test`225文件1281/1281（173.206秒）、Auth16/16、links180/180、packaging33/33、capacity19/19、ASAR/legacy/preload12/12、Electron focus1/1、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke与diff全绿。最新ASAR7,212,213 bytes（2026-07-29 22:16:41.498 +08:00），SHA-256 `DB9DB4FC1629A59CE4534D1EC65937337B6C14D3BCB540C8CCB5FACA574C9F7F`，exe225,485,824 bytes，Renderer `index-DQopcXb_.js`；146条WIP保留、staged为空，真实workspace/内容库/Auth数据库/账号/供应商/投稿/同步/扣费/付费submit均为0。Phase03/04/06=`IN_PROGRESS`、Phase07=`NOT_STARTED`；下一动作仅为最终独立只读审计。**整改完成，等待最终独立只读审计。**

2026-07-29 独立只读审计第三轮整改终态：三项新增finding均先固化当前工作树RED。跨batch同article/target为v3专项5/6，现以media item durable `attemptId`精确归属并事务回滚，6/6、Phase03扩展80/80；inventory断链mutation为matrix5/6，现109项显式receiver、完整receiver.method、member可达声明/显式commands/direct lifecycle闭合且移除文件级兜底，capability专项20/20；fallback object-map/switch/numeric-ternary mutation RED后改为AST，旧ASAR parity保持RED至重建，最终ASAR/legacy/preload11/11。完整223文件1267/1267（160.799秒）、Auth16/16、links180/180、packaging33/33、capacity19/19、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、Electron focus1/1、diff全绿。ASAR7,210,414 bytes（20:16:29 +08:00）；inventory仍109，schema仍v3且public method集合不变，Phase04/06 production interface未变。Git分支/HEAD不变、140条WIP保留、staged为空，真实数据/账号/外部/付费调用0。Phase03/04/06=`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

2026-07-29 最终独立审计追加整改终态：当前工作树定向15项先12/15、3 RED：OperationalStore跨稿件/target接受`batchItemId`；fallback detector漏`submitted/uncertain`且ASAR未核对MediaOrderService真正owner；109项inventory可被同名调用/任意identifier/registrar分离匹配误绿。整改后OperationalStore同事务精确校验归属并以`OPERATIONAL_BATCH_ITEM_MISMATCH`整体回滚；fallback覆盖全部旧mapping且两个order owner均做current source↔ASAR精确parity；inventory改为feature member↔recorded binding及同一registrar call精确channel/application的结构化AST，旧弱helper由meta门禁拒绝。OperationalStore v3 5/5、Phase03扩展79/79、capability专项19/19、capacity19/19；旧ASAR parity 5/6 RED→新制品11/11。完整223文件1265/1265（228.598秒）、Auth16/16、links180/180、packaging33/33、三套typecheck、lint/format、Renderer2157 modules、preload222,057 bytes、pack smoke、Electron focus1/1与diff全绿。ASAR7,210,147 bytes（18:12:40 +08:00）；inventory仍109。schema仍v3且public method集合未变，本轮只收紧`commitRemoteOutcome()`行为；Phase04/06 production interface未变。Git分支/HEAD不变、staged为空，真实数据/账号/外部/付费调用0。Phase03/04/06=`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

2026-07-29 最终独立审计第二轮整改检查点C最终权威记录：原17项`P1-01..P1-07`、`P2-08..P2-15`、`P3-16..P3-17`以及`P1-AUDIT-01`、`P2-AUDIT-02`、`P1-AUDIT-03`共20项逐项复核均为`VERIFIED`。C在旧ASAR上先得到current OperationalStore source parity 7/8 RED，pack后source/export/import-call/test/ASAR为8/8；`P1-05`正式supplier observation正确，旧reconcile/fallback/source/export/test/ASAR物理删除且无wrapper；`P1-AUDIT-03`确认schema v2→v3、`order_display_snapshots`、两个retained methods及migration/backup/restore/verify/fault。专项131/131、capacity19/19、完整223文件1263/1263、0 fail/skip（170.554秒），Auth16/16、links180/180、packaging33/33、三套typecheck、lint/format、Renderer2157 modules、pack smoke、packaged preload3/3、最新Renderer Electron focus1/1、diff check全绿；最新ASAR7,209,908 bytes（2026-07-29 12:37:55.544 +08:00）。inventory保持109（43 query、61 command、5 event）；OperationalStore schema/interface确有变化，其余Phase03冻结边界、Phase04接口及Phase06 IPC/Renderer接口无当前production差异。Git终检分支/HEAD不变且staged为空；真实数据/账号/外部/付费调用为0。下一动作仅为最终独立只读审计；Phase03/04/06=`IN_PROGRESS`、Phase07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

2026-07-29 最终独立审计第二轮整改检查点B当前权威记录：Phase 03因`P1-05/P2-13`窄范围重开，实际Git差异为OperationalStore schema **v2→v3**、新表`order_display_snapshots`、retained public methods `listOrderDisplayViews()`与`recordRemoteOrderObservation()`；A另删除`reconcileRemoteOrder()`。历史“未修改OperationalStore/schema/interface”与inventory=110记录保留但已失效；canonical inventory为109。v3表含attempt PK/NOT NULL/FK、四个required TEXT列及nullable REAL报价；media outcome+batch item同事务写snapshot。两个method的唯一production caller均为MediaOrderService（list/sync），13k projection保持单SQL、`LIMIT20000`、parsed=3。B新回归先2/4 RED，暴露v3 verifier漏检FK/required nullability及恢复fixture路径错误；修复后4/4，覆盖v2→v3、连续history、重复启动、三个fault point事务回滚/重试、损坏结构拒绝、backup verify和临时restore。扩展45/45，13k query/SQL=1/1、heap143,288 bytes、0.471ms、paidSendCalls=0；三套typecheck、lint、format、links180/180、packaging33/33、diff通过。PublicationWorkflow/Publisher/ContentStore/Domain/Application无当前production差异；OperationalStore schema/interface确有上述变化。真实外部/投稿/同步/付费submit=0；下一动作严格为C。Phase03/04/06=`IN_PROGRESS`，Phase07=`NOT_STARTED`。

2026-07-29 最终独立审计第二轮整改检查点 A：启动门禁为 `codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`，staged diff为空，既有Phase 03/04/06 WIP全部保留。新增永久 source/export/import-call/test/ASAR 门禁在当前工作树先为0/4 RED；物理删除 OperationalStore `reconcileRemoteOrder`定义/public export与canonical status→supplier code fallback、删除旧专用测试并迁移URL evidence测试后为3/4，旧ASAR仍RED；本轮pack smoke后为4/4，合并legacy path为7/7。A 的schema无变化，但Phase 03 OperationalStore public interface确有删除；正式路径仅保留supplier response→`MediaOrderService.syncOrder()`→`recordRemoteOrderObservation()`。supplier/order定向23/23、三套typecheck、lint、format、packaging33/33、Renderer2157 modules、preload222,057 bytes、pack smoke、diff check通过；新ASAR 7,209,505 bytes（12:14:07 +08:00），真实外部/投稿/同步/扣费/付费submit=0。下一动作仅为B的schema v2→v3/interface/migration证据核对；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。

2026-07-29 P2-09 最终证据纠正：发现 `media.removeDraft` 虽有完整 IPC 定义但无 Renderer production consumer，先形成 registry absence RED 后从 contract→registrar→preload→bridge→feature→fixture 全链物理删除。canonical non-Auth inventory 现为 109 项（43 query、61 command、5 event；media 17）；109/109 均由从 `main.tsx` 可达的 AST consumer、feature public surface、bridge/preload/registrar/application 链证明，21 项 lifecycle query 另有真实 snapshot consumer，4 条 props 链有父子 wiring，5 个 event 有 producer/唯一 consumer/dispose。完整 `npm test` 222 文件 1255/1255，Auth16/16、links180/180、packaging33/33、lint、format、三套typecheck、Renderer build、pack smoke、packaged source/import/ASAR5/5、Electron focus1/1、容量与diff check全绿；真实投稿/同步/供应商/付费submit=0，staged diff为空。Phase 03/04/06保持`IN_PROGRESS`，Phase 07=`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

## 1. 当前程序基线

| 项目           | 当前记录                                                  |
| -------------- | --------------------------------------------------------- |
| 原审查代码基线 | `master@e8d817847bab3a9e6020006cab35340f645e527f`         |
| 重构规划分支   | `codex/refactor-program`                                  |
| 重构规划commit | `dc5265359ca10a866ccd10e56a84314214b7897f`                |
| 活跃worktree   | `F:\官媒投稿-refactor`                                    |
| 规划日期       | 2026-07-24 Asia/Shanghai                                  |
| 目标形态       | 文件内容 + workspace SQLite运行状态 + Electron/React/Node |
| 当前可执行阶段 | 阶段7（`READY`；从 `phase-03-06-closure` 开始）             |
| 普通功能开发   | Phase 03/06=`COMPLETE`；Phase 04=`PENDING_HUMAN`；Phase 07=`READY`；正式release仍冻结 |
| 正式release    | 冻结                                                      |

前次Phase 06现场回归（2026-07-27）：Phase 06保持`COMPLETE`，Phase 07保持`NOT_STARTED`。production RED确认OperationalStore合法publication read model的`clientId:null`与Renderer exact DTO的必填client identity冲突，任一旧投稿记录会使该客户后续新文章也整页`IPC_RESULT_INVALID`。article-management组合边界现仅保留当前article IDs对应records，将null identity绑定到已验证client scope，显式异客户record fail-closed；未改OperationalStore冻结接口或放宽IPC schema。工作区和客户均不设计为共享文章，已有合成A/B runtime及client隔离回归。

最新Phase 06现场回归（2026-07-27）：普通投稿与付费媒体handoff的四个production请求错误复用了ASCII-only技术token validator，合法中文客户identity在preload编码阶段统一成为`IPC_REQUEST_INVALID`；列举网/头条登录caller又把`platformId`预包装成object，contract `fromArgs`二次包装后同样在preload边界拒绝。submission contract现使用与content核心一致的Unicode-safe、path-free client identity，登录caller只传单一原始platform identity；未加兼容wrapper，未改OperationalStore、ContentStore、Publisher或Domain/Application接口。历史客户/文章/采集数据不是根因，无需舍弃或迁移。完整门禁：221文件1213/1213、Auth16/16、links180/180、packaging33/33，域定向52/52、三套typecheck、lint、format、Renderer build 2153 modules、标准pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1与`git diff --check`通过。最新目录制品为`release-alpha/win-unpacked/鱼饼大王.exe`（225,485,824 bytes，2026-07-27 20:46:18）。未stage/commit/push/PR，未访问真实workspace、账号或外部服务；Phase 07未启动。

最新付费媒体现场回归（2026-07-27）：三个问题均来自Phase 06边界接线，不是历史客户、文章或采集数据不兼容。预览正文误用单行validator导致多行Markdown result-invalid；资源收藏缺少完整Renderer DTO到精确wire DTO投影；刷新command的error/result虽由owner保存却未接入UI反馈。现分别改为有界多行正文、`resourceId/name/price`精确投影及安全错误/完成数量/truncated提示，并删除没有Typed IPC capability或后端owner的旧局部“添加媒体”操作。未修改OperationalStore、ContentStore、Publisher或冻结Domain/Application接口。完整门禁：媒体域47/47，221文件1217/1217、Auth16/16、links180/180、packaging33/33，三套typecheck、lint、format、Renderer build2153 modules、preload231,751 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1与diff check通过。容量fixture保持1k/10k/13k/20k单页单请求及约4.28KB payload。最新exe为225,485,824 bytes，2026-07-27 23:03:31；未访问真实数据/账号/付费服务，未stage/commit/push/PR，Phase 07未启动。

最新13k刷新与付费预检回归（2026-07-27）：外部media multipart分页字段错误使用`pageSize`，供应方退回默认20项后main错误声称complete；现使用`page_size`并学习无元数据供应方实际页宽，仍严格保持200页/20,000 unique硬上限。合成13k在100项/页时130请求完成，固定20项时200页后4,000项显式truncated。预检只针对明确选择媒体的稿件建立快照，未选稿件不再静默禁用整个入口；prepare错误在modal外可见，最终按钮明确“确认付费提交”，旧预检在选择/文章/workspace变化时失效。所有submit均为计数fake，未调用真实付费投稿。门禁：媒体63/63、221文件1220/1220、Auth16/16、links180/180、packaging33/33，三套typecheck/lint/format/build、pack smoke、packaged ASAR3/3、Electron focus1/1及diff check通过。最新exe为225,485,824 bytes，2026-07-27 23:35:24；未stage/commit/push/PR，Phase 07未启动。

最新付费媒体预检明细回归（2026-07-28）：Phase 03退役legacy publication ledger后，media confirmation builder仍在ledger缺席时返回仅含计数/价格的旧简化摘要，导致现场出现已选1项且预计扣费¥3、弹窗目标却为0。现删除该早退，并在main组合边界复用真实media command identity只读查询OperationalStore publication records；queued/submitting/submitted/published/uncertain阻止重复付费，failed/cancelled可重试，未恢复旧ledger或改变冻结接口。真实registrar合成fixture覆盖可提交与published阻止且付费submit调用均为0。门禁：registrar6/6、媒体69/69、221文件1220/1220、Auth16/16、links180/180、packaging33/33、三套typecheck/lint/format/build、pack smoke、packaged ASAR3/3、Electron focus1/1及diff check通过。最新exe为225,485,824 bytes，2026-07-28 00:23:54；未访问真实账号/workspace/付费服务，未stage/commit/push/PR，Phase 07未启动。

最新付费媒体payload回归（2026-07-28）：保存标题在`resolveSubmissions`后被media command preparation丢弃，parser因预置fileBaseName而必然把带UUID的staging文件basename作为远端title；同时供应方声明为HTML的`content`实际收到去标题后的原始Markdown。现保留已验证draft title，并在main把正文投影为转义后的段落/标题/换行HTML，独立标题行与文件名不进入body。`third_id`核对为每次提交生成的本地`attempt-UUID`，远端订单号仍来自`order_nid/orderNid`。合成multipart与publisher fake逐字段验证且未调用真实付费服务。门禁：媒体72/72、221文件1222/1222、Auth16/16、links180/180、packaging33/33、三套typecheck/lint/format/build、pack smoke、packaged ASAR3/3、Electron focus1/1及diff check通过。最新exe为225,485,824 bytes，2026-07-28 00:59:49；Phase 07未启动。

最新第三方标识与投稿后预览回归（2026-07-28）：付费媒体页复用settings feature和既有精确Typed IPC保存最长128字符的第三方标识，应用配置可长期使用/随时替换，`XQW_THIRD_ID`环境override只读；保存值只替换供应方multipart `third_id`，留空回退内部attempt ID，OperationalStore/evidence/重复发布保护的attempt identity始终不变。投稿后只剩标题不是历史文章不兼容，而是Renderer bridge把合法article summary缺失的正文伪造为`""`并覆盖preview；summary/detail normalizer现分离，同identity重扫保留已加载详情。真实Renderer覆盖900/1180/1280且submit计数为0。完整门禁：定向媒体/settings23/23、Renderer responsive11/11、221文件1226/1226、Auth16/16、links180/180、packaging33/33、三套typecheck/lint/format、Renderer build2154 modules、preload231,843 bytes、pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1与diff check通过。最新exe为225,485,824 bytes，2026-07-28 04:16:54；未访问真实workspace/账号/付费服务，未stage/commit/push/PR，Phase 06保持`COMPLETE`，Phase 07未启动。

最新付费媒体订单投影回归（2026-07-28）：新订单把标题、文件名、媒体名与投稿报价作为submission item不可变快照保存；历史缺失报价显示“未记录”，不伪造0或当前/最终结算金额。订单页供应商状态固定为`0待安排/1已安排/2已发布/4已退稿/9售后中`，与内部PublicationWorkflow canonical状态分离。为跨重启保留供应商raw状态，Phase 03窄修既有remote-order evidence JSON投影（无schema migration、无冻结接口变更），严格只接受上述五值，完成后Phase 03恢复`COMPLETE`。fake状态`1`经同步和store重开仍显示“已安排”，真实Renderer分类通过。完整门禁：媒体/订单24/24、真实Renderer订单1/1、221文件1230/1230、Auth16/16、links180/180、packaging33/33、三套typecheck/lint/format、Renderer2154 modules、preload231,843 bytes、标准pack smoke、packaged ASAR3/3、最新Renderer Electron focus1/1及diff check通过。最新exe为225,485,824 bytes，2026-07-28 08:55:36；全部使用临时SQLite/fake，真实付费submit为0，未stage/commit/push/PR，Phase 06保持`COMPLETE`，Phase 07未启动。

最新付费媒体订单报价与发布链接回归（2026-07-28）：新订单“未记录”的根因是attemptId晚于submission batch生成，快照与remote order无法关联；现由batch payload和workflow command共享预先生成的唯一attempt identity，临时SQLite真实链可恢复标题、媒体名和报价。订单页移除源文件、内部publication状态/ID与资源ID，仅保留订单必要事实。新增`media.openPublishedUrl`命名command，inventory更新为129/129；Renderer只传orderNid，main只从当前workspace已发布订单的OperationalStore HTTPS evidence打开外链，拒绝HTTP/带凭据URL、未发布、缺失证据和任意Renderer URL。门禁：媒体/Typed IPC/API surface38/38、workspace/composition/security46/46、真实Renderer订单1/1、221文件1232/1232、Auth16/16、links180/180、packaging33/33、三套typecheck/lint/format、Renderer2154 modules、preload234,062 bytes、pack smoke、packaged ASAR3/3、Electron focus1/1及diff check通过。最新exe为225,485,824 bytes，2026-07-28 10:31:32；全部使用fake/临时SQLite，真实付费submit为0，未stage/commit/push/PR，Phase 06保持`COMPLETE`，Phase 07未启动。

最新付费媒体供应商字符串报价回归（2026-07-28）：现场新订单标题和媒体名均正常但报价仍“未记录”，证明attempt关联已经生效。真正缺口是供应商资源缓存保留数字字符串报价：预检会规范化，正式提交解析和不可变快照却只接受number，因而只丢报价。main资源ID解析边界及submission snapshot owner现在按既有0..100,000,000安全范围规范化合法数字字符串；非法/缺失/超限仍保持缺失，不伪造0或用当前报价倒填历史订单。Typed IPC registrar与临时SQLite订单链两条RED→GREEN通过。完整门禁：媒体/Renderer37/37、221文件1233/1233、Auth16/16、links180/180、packaging33/33、三套typecheck/lint/format、Renderer2154 modules、preload234,062 bytes、pack smoke、packaged ASAR3/3、Electron focus1/1与diff check通过。最新exe为225,485,824 bytes，2026-07-28 10:59:58；真实付费submit为0，未stage/commit/push/PR，Phase 06保持`COMPLETE`，Phase 07未启动。

最新Phase 06审计整改终态（2026-07-28）：17/17 findings为最终`VERIFIED`。非Auth Typed IPC为110项（43 query、62 command、5 event），110/110真实caller/fixture通过；Auth仅豁免5 invoke+1 event。完整`npm test`221文件1247/1247，Auth16/16、links180/180、packaging33/33及其余完整门禁全部通过；packaged ASAR3/3、最新Renderer focus1/1，真实投稿和付费调用为0。未stage/commit/push/PR；Phase 03/04/06保持`IN_PROGRESS`等待下一轮独立只读审计，Phase 07=`NOT_STARTED`。

2026-07-29 最终独立审计后续整改检查点A：启动门禁与`17-phase-06-independent-audit-followup-remediation-plan.md`基线一致，既有Phase 03/04/06 WIP全部保留，staged diff为空。`P1-AUDIT-01` production RED为新增行为测试0/6（6 fail），覆盖transport/namespace/query/command/event/result缺失的真实synthetic success；统一non-Auth bridge owner后为6/6 GREEN，扩展定向14文件97/97、三套typecheck、lint、format与diff check通过。未改前序冻结interface；Phase 03/04/06继续`IN_PROGRESS`，Phase 07继续`NOT_STARTED`；真实外部、投稿、同步和付费submit调用为0。下一动作是检查点B逐capability结构化production inventory，旧110项数字在完成前不得作为最终证据。

2026-07-29 最终独立审计后续整改检查点B：旧通用`productionCallerTrace`、owner推导 hook 与`source.includes` inventory 先形成0/1 RED；现110项全部为显式独立caller记录，并以TypeScript AST逐项证明真实View/root调用、feature export与capability-specific binding、bridge export、preload精确member/channel、registrar/application链。owner分布为workspace 9、settings 14、media 18、platform 10、content 43、attention 3、generation 13；5个event另证明producer、唯一直接consumer与removeListener dispose。未发现新的无consumer能力，旧18项没有恢复。定向15文件89/89、三套typecheck、lint、format、diff check通过；Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`，真实外部、投稿、同步和付费submit为0。下一动作严格为检查点C legacy source/ASAR物理删除。

2026-07-29 最终独立审计后续整改检查点C：source/current-ASAR零路径测试在删除前为1/3、2 fail；确认无production caller后，物理删除四条点名文件及`desktop/services/submission/`六条等价dead implementation，不留re-export/wrapper/package例外，并删除仅执行旧实现的测试。重建后source/import graph/ASAR为3/3，四条点名与六条等价路径均为零；Phase 03/04扩展定向25文件95/95、packaging33/33、三套typecheck、lint、format、Renderer 2157 modules、preload222,542 bytes、pack smoke、diff check通过。新ASAR 7,211,917 bytes、新exe 225,485,824 bytes，2026-07-29 08:32:10；Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`，真实外部、投稿、同步和付费submit为0。下一动作仅为19项finding与第10节最终完整门禁。

2026-07-29 最终独立审计后续整改终态：A在真实Electron frozen namespace上补充6/7 RED并转为7/7；B保持110/110逐capability TypeScript AST真实链（43 query、62 command、5 event；workspace9/settings14/media18/platform10/content43/attention3/generation13），5项event的producer/唯一consumer/dispose闭合；C的source/import/本轮ASAR为3/3。原17项逐项复核结果为`P1-01`至`P1-07`、`P2-08`至`P2-15`、`P3-16`、`P3-17`均`VERIFIED`；新增`P1-AUDIT-01`、`P2-AUDIT-02`均`VERIFIED`，逐项production证据、RED→GREEN、owner/interface及删除记录见Phase 06阶段文档与handoff。完整门禁：222文件1252/1252、0 fail/skip、158.040秒；专项138/138、Auth16/16、links180/180、packaging33/33、三套typecheck、lint、format、Renderer 2157 modules、preload222,542 bytes、pack smoke、packaged preload+legacy ASAR6/6、最新Renderer Electron focus1/1、diff check全部通过。最新ASAR为7,211,886 bytes（08:58:01），exe为225,485,824 bytes（08:58:02），Renderer asset为`index-DVe8E-ba.js`。Main容量请求10/100/130/200、payload44,603/464,188/610,078/950,488 bytes；Renderer均1请求、payload4,279/4,280/4,280/4,280 bytes，第20,001项明确truncated；13k SQLite为query=1、SQL=1、parsed=3、orders=3、heap143,288 bytes、0.358ms、paidSendCalls=0。真实workspace、内容库、Auth数据库、账号、供应商、投稿、同步、扣费和付费submit调用为0；staged diff为空，未reset/checkout/clean/stage/commit/push/PR。Phase 03/04/06保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`。**整改完成，等待最终独立只读审计。**

重构worktree已从独立规划commit创建；review、optimization、refactor、ADR和领域词汇已纳入该commit。原工作区`F:\官媒投稿`中用户维护的`auto—publish/docs/...`删除和未跟踪旧文档README没有进入重构分支，也不得由后续任务复制、恢复或清理。阶段0开始时必须重新核验当前HEAD和工作区状态。

## 2. 已冻结的架构决定

| 决定                                | 状态                           | 权威记录                                                                                      |
| ----------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| 用户创作内容保持文件化              | ACCEPTED                       | ADR-0003                                                                                      |
| 运行协调状态迁入workspace SQLite    | ACCEPTED                       | ADR-0003                                                                                      |
| 串行阶段、单writer切换、无长期双轨  | ACCEPTED                       | ADR-0004                                                                                      |
| 普通平台target包含AccountProfileId  | ACCEPTED                       | `01-target-architecture.md`、CONTEXT                                                          |
| Electron/React/Node/Playwright保留  | ACCEPTED                       | `00-program-charter.md`                                                                       |
| 诊断默认结构化、无原始整页截图      | ACCEPTED                       | 阶段4/7计划                                                                                   |
| 删除死publish-log，不新增原始日志UI | ACCEPTED                       | 阶段7计划                                                                                     |
| Media允许服务商HTTP例外             | ACCEPTED（2026-07-25用户决策） | endpoint必须显式配置；HTTP要求`allowInsecure`确认并持续警告；不得静默降级或扩展到其他provider |

## 3. 阶段状态

|                  阶段 | 状态          | 开始commit                                 | 完成commit                                 | 自动验证                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 人工验证                                                   | Handoff                              |
| --------------------: | ------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
|            0 工程基线 | COMPLETE      | `bee1b3f24039bb77be0d13d9a663b88e5657e61c` | `0bcbbfcca9ac4baf140359e048f3bf706f7b9526` | canonical本地门禁、静态workflow契约与link安全172/172均通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 无；remote/PR/push/required checks为`NOT_APPLICABLE`       | `docs/refactor/handoffs/phase-00.md` |
|            1 领域契约 | COMPLETE      | `926723f076cd1d8c88beb35695567bfb74df6639` | `027e9f88e00cb206669c2490cec9fcad7e6a47ad` | 178个默认测试文件、Phase 01 contract/architecture测试、严格类型检查、renderer/worker/package smoke均通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 无；不得在本任务执行                                       | `docs/refactor/handoffs/phase-01.md` |
|    2 OperationalStore | COMPLETE      | `7cab1c9aad167c7e2eca8f1dd2732124ba24a434` | `7d8f81452f98c8211308ada0ffba7873428a764b` | 182测试文件、默认977/977、Phase 02 15/15、auth 16/16、links 172/172、packaging 33/33、Electron SQLite probe及所有canonical门禁通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 仅合成workspace；未请求或访问真实库                        | `docs/refactor/handoffs/phase-02.md` |
| 3 PublicationWorkflow | COMPLETE | `7d8f81452f98c8211308ada0ffba7873428a764b` | `phase-03-06-closure` | Phase 03 owner findings、legacy删除、迁移/恢复及真实SQLite订单矩阵已复核；自动化证据收口。 | Phase 04人工项继续阻止正式release，不影响本阶段完成 | `docs/refactor/handoffs/phase-03.md` |
|   4 Platform/Adapters | PENDING_HUMAN | `8cbce7f1761c4e67baf4467d89f0a8397e93d9db` | — | P1-01、legacy media preflight、platform/media inventory及event生命周期自动验证完整。 | 四项受控人工验收继续阻止正式release | `docs/refactor/handoffs/phase-04.md` |
|     5 Content生命周期 | COMPLETE | `9ff69a073eb7869df930b688d15bfd2dabb79fc8` | `75dba966375302a99ebfd020c02ee6dd83930a9e` | 08d A-G 与追加 P1 全部 RED→GREEN；专项、176/176 扩展、1050/1050 全局门禁、打包 smoke 及最终独立复核均通过，无剩余 P0/P1 | Phase 04 人工项仍阻止正式 release，不影响本阶段本地完成 | `docs/refactor/handoffs/phase-05.md`   |
|        6 Renderer/IPC | COMPLETE | `743571d9597ea2c68ab10a08da0914ccaed5352b` | `phase-03-06-closure` | inventory109/109、lifecycle21/21、event5/5、symbol evidence148/148及全量1453/1453通过；自动化证据收口。 | Phase 04人工项继续阻止正式release，不影响本阶段完成 | `docs/refactor/handoffs/phase-06.md` |
|      7 Auth/Build/Ops | COMPLETE | `faf92c2cc96edebbc2963940b45c5ef335bb8287` | 本条所在 Phase 7 closeout commit                 | Root CI固定7个job display name、16个required check；桌面228文件/132 suites/1488 pass；CI root-tests分割为224文件/130 suites/1442 pass，packaging-contracts为46/46且无文件重复；Auth47/47；migration56/56；backup/restore destination verification通过；迁移 session device hash 与活跃 WAL writer 一致快照经独立复验关闭；health9/9；rate-limit/trusted-proxy9/9；media9/9；diagnostics32/32；packaging46/46；discovery228（216 `.test.js`、12 `.test.mjs`）；production directory 13 artifacts/offline self-test通过；lint、三套typecheck、format、renderer/preload build通过；manifest与checklist validator离线复核通过 | Phase 04四项人工项、生产DNS/TLS、proxy source chain、签名、安装器/ACL/upgrade/rollback/SmartScreen、external E2E、Auth RPO/RTO数值、rollback evidence仍为`PENDING_HUMAN`/`BLOCKED_RELEASE`；提交前 dirty evidence和本机Docker不可用也只阻塞正式release | `docs/refactor/handoffs/phase-07.md` |
|  8 Cleanup/Acceptance | IN_PROGRESS   | `aff1dfd089aff2492f9054747ce55f94304cffdd` | Ticket 01/02 固化 commit；Ticket 03 当前工作树未提交 | Ticket 01/02 已完成；Ticket 03 最小修复与独立专项复验已完成：OperationalStore 拆为 facade + internal modules，runtime/migration acquisition、失活回收与 release 共用 recovery guard，migration 失败清理按 fd 文件身份与 token 保护，静态副作用 import 与精确 allow-list 门禁补齐；本地定向20/20、subagent专项45/45、packaging7/7；lint、三套typecheck、format、diff check通过；完整root suite本轮1501/1502，唯一失败为既有 offline storage-boundary 波动 | Phase 04人工项与正式release继续`PENDING_HUMAN`/`BLOCKED_RELEASE`；Ticket 03=`COMPLETE`，未访问真实数据，Phase 8 后续全链验收/Ticket 13–17仍未完成 | `docs/refactor/handoffs/phase-08.md`、`docs/refactor/phase-08-decision-map.md` |

### 阶段4：平台运行期与 Publisher Adapters

- 状态：PENDING_HUMAN（自动门禁与最小解包目录制品 smoke 已收口；四项受控人工验收继续阻止正式release，但不阻止 Phase 07 本地实施。）
- 开始时间：2026-07-25 Asia/Shanghai
- 开始分支/commit：`codex/refactor-program` / `8cbce7f1761c4e67baf4467d89f0a8397e93d9db`
- 执行任务/线程：当前 Codex 任务
- 用户已有改动：开始时工作区干净；未恢复、覆盖、清理或访问真实内容库。
- 计划内文件范围：PlatformRun、worker protocol、adapter/runtime、安全诊断、platform tests、账本与交接。
- 已完成工作：PlatformRun 已成为 desktop task service 的唯一 child lifecycle owner；worker envelope 在主进程按 version/runId/闭集type/32 KiB/敏感字段拒绝；头条和列举无文章级证据一律`uncertain`；Hepan 异步 child、unpacked resolver、最小权限临时文件和启动残留精确回收已完成；媒体仅 main-process runtime config，HTTP仅显式endpoint+`allowInsecure`确认；诊断仅保存结构化摘要，无原始截图。首次人工 smoke 后补齐 AccountProfile 持久查询、authenticated IPC/preload/Renderer 选择与显式确认，并把账号映射绑定到普通文章入队和 generation handoff 预检令牌；媒体 resource target 已从普通账号队列排除。普通投稿页面现仅投影队列 sidecar 中已持久化的 AccountProfileId，并在提交时原样回传；主进程继续校验它与 durable target/profile 一致，旧无档案项继续 fail-closed。文章管理页的“加入付费媒体投稿”现由 production `previewExport`/`exportArticle` 原子写入媒体 staging 与 provenance sidecar，不选择资源、不投稿、不扣费。普通平台提交改为逐项临执行前 claim，首项账号失败不再占用后续项，过期 claim 可由 OperationalStore 原子恢复。头条/列举新增非阻塞“打开登录”和“检查登录”入口，成功检查后保存会话；Hepan 使用只读 `--check-login` 的受信账号节点提供真实身份，不显示浏览器登录入口。`pack:smoke` 已改为准备 Node runtime 并验证真实目录制品。
- 自动收口：PlatformRun 完整冻结运行上下文；头条/列举只接受文章级证据；Hepan AbortSignal 与 child close 生命周期、普通 unpacked resolver和默认异步 runner已覆盖；worker只传递安全 outcome；media standalone 网络路径已退出生产。Alpha/production共用显式最小解包边界，最终 resources verifier 分别检查 app.asar、app.asar.unpacked与resources/tools/node，并执行隔离 Playwright和Hepan安全 smoke。
- Interface/schema偏差：无；未修改 PublicationWorkflow public interface、OperationalStore schema 或 writer。
- 测试命令与结果：Phase 04定向27/27、`npm test` 933/933、`npm run test:auth` 16/16、`npm run test:links`、`npm run test:packaging`、`npm run lint`、`npm run format:check`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`、`npm run pack:smoke`、`git diff --check`均通过。`pack:smoke`重建非签名`win-unpacked`，验证app.asar、最小unpacked运行期和resources/tools/node，并运行最终制品的Playwright/Hepan安全 smoke；无真实外部调用。
- 故障/迁移/回滚证据：精确复现并回归锁定三个现场故障：production content service 缺少 `previewExport`/`exportArticle` 导致 `Submission operation is unavailable: previewExport`；批量预先 claim 与旧状态快照提前拒绝导致 `Queued publication is no longer executable`；头条/列举无公共登录 IPC/bridge/UI。修复未修改 OperationalStore schema 或 writer，过期租约使用现有原子 claim 规则恢复，不删除或伪造队列状态。Hepan账号身份来自只读检查返回的受信 `uid`/displayName，缺失或变化仍 fail-closed。临时Cookie/payload在正常、失败、stop/watchdog与下次启动均有有界清理和回收验证。
- 人工待办（四项）：(1) 头条/列举受控账号 remote ID 核验及首次显式 AccountProfile binding；(2) Hepan断连后的远端核对；(3) 媒体服务商HTTP风险确认与测试资源；(4) 签名正式制品中的真实浏览器登录。它们仍阻止正式release，但不阻止Phase 05本地重构。
- 2026-07-26 现场回归：蓝色河畔提交提示 `Bundled Playwright Node is unavailable`。根因为 `extraResources` 将 Node 放在 `resources/tools/node`，runtime diagnostics 却只在 `appRoot/tools/node` 查找。现已把 `resourcesPath` 从 main 贯穿 WorkspaceRuntime/runtime-config/diagnostics，并解析 unpacked CLI；alpha verifier 会临时解包真实 app.asar 并执行最终布局诊断。runtime/WorkspaceRuntime 26/26、packaging 37/37、全量 1010/1010、pack:smoke 通过；未连接真实河畔或投稿。
- 2026-07-26 现场回归：蓝色河畔多行正文（35 个换行）触发 `PUBLISH_INPUT_INVALID / Operational DTO is invalid`，首次失败后 item 被 claim，立即重试为 `OPERATIONAL_BATCH_ITEM_NOT_EXECUTABLE`；只读数据库确认无 publication/attempt/recovery intent，未触发远端。现已允许正文 `LF/CR/TAB`，并在 claim 前完成完整 DTO 校验；新增双回归，定向 34/34、全量 1012/1012 通过。旧目录制品仍运行导致标准 pack smoke `EBUSY`，独立 `release-alpha-fixed/win-unpacked` verifier 通过；未连接真实河畔或投稿。
- 2026-07-26 现场回归：多行正文与 claim 修复后，蓝色河畔返回 `Current platform account could not be verified`；队列项已安全释放为 `queued`，无 publication/attempt。根因是 production AccountInspector 未使用 platformSettingsService 保存的 Hepan Python/Cookie/vendor 配置；现已通过 runtime adapter seam 调用设置服务的只读 `--check-login` 并转换安全账号证据。账号/平台定向 34/34、全量 1014/1014、lint/main typecheck/format 通过；独立解包制品 verifier 重建通过，未执行真实投稿。
- 后续产品问题分期：用户同意将入队后撤销、清理及其他跨页状态/UI问题留到完整重构的 Phase 05/06 边界内统一收口；本次不扩大 Phase 04 修复范围。
- 停止条件是否触发：否；未把弱证据升级为published，媒体HTTP只能由显式配置和`allowInsecure`确认启用。
- Handoff路径：`docs/refactor/handoffs/phase-04.md`
- 历史启动记录：Phase 04 完成自动门禁时，Phase 05 曾为`READY`仅限本地重构；现已启动并以本表状态为准，必须保持`IN_PROGRESS`。Phase 04维持`PENDING_HUMAN`，不得标记`COMPLETE`，直到四项人工验收完成。

## 4. 当前阶段记录模板

阶段执行时用实际内容替换以下占位，并在完成后保留历史：

```md
### 阶段X：名称

- 状态：COMPLETE
- 开始时间：
- 开始分支/commit：
- 执行任务/线程：
- 用户已有改动：
- 计划内文件范围：
- 已完成工作：
- 未完成工作：
- Interface/schema偏差：
- 测试命令与结果：
- 故障/迁移/回滚证据：
- 人工待办：
- 停止条件是否触发：
- Handoff路径：
- 下一阶段是否READY：否
```

## 5. 测试证据规则

只写“测试通过”无效。每次记录至少包含：

- 命令；
- 测试文件/测试数量；
- pass/fail/skip；
- skip原因；
- 运行环境；
- fixture或隔离workspace类型；
- 故障点；
- 失败时保留的诊断ID或报告路径。

不得把真实投稿、真实数据库恢复、签名或TLS配置写成自动验证。

## 6. 阻塞与重开

- 当前阶段触发停止条件时设为`BLOCKED`，写明唯一阻塞事实和已尝试的安全检查。
- 发现前序interface/schema错误时，把前序阶段从`COMPLETE`改为`IN_PROGRESS`并记录原因；当前阶段不得用兼容wrapper绕过。
- 只缺生产人工验收但代码/自动证据完整时可标`PENDING_HUMAN`；是否允许下一阶段由对应阶段文档决定。
- 阶段8之前不得把整个工程标为`COMPLETE`。

## 7. 最终工程记录

阶段8完成时填写：

- 最终分支/commit：
- Workspace schema版本：
- Auth schema版本：
- Production runtime/controller路径：
- Domain/Application modules：
- Publisher adapters：
- Renderer feature modules：
- 全局测试结果：
- Migration/rollback结果：
- Production package结果：
- 剩余`PENDING_HUMAN`：
- Release状态：
- 普通功能开发状态：

### 阶段5：内容身份、交接与删除生命周期（2026-07-26 独立复核整改）

- 状态：COMPLETE（本段后续续记与阶段状态主表为权威）
- 开始时间：2026-07-25 Asia/Shanghai；重开时间：2026-07-26 Asia/Shanghai
- 开始分支/commit：`codex/refactor-program` / `9ff69a073eb7869df930b688d15bfd2dabb79fc8`
- 完成时间：2026-07-26 Asia/Shanghai；commit：`75dba966375302a99ebfd020c02ee6dd83930a9e`。
- 用户已有改动：继承并保留全部未提交 Phase 05 WIP；未 reset、checkout、clean、覆盖或遗漏 untracked 文件；未访问、复制或修改真实内容库、投稿、付费或生产系统。
- 独立复核整改：本轮三个 P1 已完成。queue action 已改为 OperationalStore-backed stable operationId + before manifest + `prepared → main_staged → sidecar_staged → staged → state_applied → complete` checkpoint/staging 协议；active queue operation 的 retryable 会重验 blockedItems、content/remaining-queue fingerprint、kind/cursor/operationId 归属和 claim/revision/lease/fence 后复用原 operationId；ArticleEditor 同 ArticleId props 更新使用 `mergeExternal()`，保留本地 title/remark/dirty，异文章及迟到 save/timer/dispose 继续由 session fence 隔离。metadata migration 已改为 PREPARED manifest + snapshot/staging/safe switch，并严格校验 manifest、backup、after hash 和 rollback；clients 缺失仍扫描 generated；文档数字来自本次最终命令输出。
- 删除的旧路径：IPC 自行组装 ArticleStore/ContentStore、desktop/content service 的 `articleStore` fallback、runner 注入/可选 `findByGenerationTaskId` fallback、handoff 第一项选择和 caller 侧目录/路径知识。`legacy-migration.js` 的 ArticleStore 创建仅保留为明确的一次性迁移 allowlist，不属于 workspace runtime。
- Interface/schema偏差：无；正文仍为文件内容，Operations SQLite 未被触碰；ContentStore snapshot/fingerprint 是 Removal/Trash/Handoff 唯一权威。
- 测试命令与结果：P1 组合（`tests/phase-05-p1-blockers.test.js` + `tests/article-editor-session.test.js`）14/14 pass、0 fail、0 skip；08b六文件专项命令 45/45；08a原始主定向命令 112/112；扩展 Phase 05 定向 136/136，均 0 fail、0 skip（含 ArticleEditor/session、metadata、500/5000 handoff、production removal、operational submission）；`npm test` 收集 189 个测试文件，1001 pass、0 fail、0 skip；`npm run lint`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`、`npm run format:check`、`npm run test:links` 176/176、`npm run test:packaging` 33/33、`npm run build:renderer`（Vite 2140 modules）、`npm run pack:smoke`、`git diff --check` 均通过。所有测试使用临时合成 workspace/fixture。
- 故障/迁移/回滚证据：queue 主文件/sidecar 写失败、main-only 中断、外部 hash 篡改、部分/全部缺失边界、相同 operationId retry 和 operationId 冲突均通过；active queue retryable 会实际再次调用同 operationId，blocked/remaining fingerprint/归属冲突 fail-closed；article active operation、stale runner fence、stale lock 5/5（dead/live/unknown/corrupt/ABA）均通过；ArticleEditor 同 identity merge 和 A→B 迟到 resolve/reject 均通过；migration 9/9 覆盖 clients 缺失仍扫描 generated、首/中/末 staging 写故障、manifest/backup 篡改、重复 execute/rollback、逐文件 byte-for-byte rollback；500/5000 handoff 证明每次 preview/commit 仅一次 identity scan。真实副本演练未执行，保留为 `PENDING_HUMAN`。
- 停止条件是否触发：否。08d 阻断项、真实授权副本验收、完整门禁与最终独立复核均已完成；Phase 04 人工项继续阻止正式 release，但不阻止 Phase 05 本地完成。Phase 06 保持 `NOT_STARTED`。
- Handoff路径：`docs/refactor/handoffs/phase-05.md`
- 下一阶段是否READY：是；Phase 06=`NOT_STARTED`，必须由新的明确任务启动，本任务未实施 Phase 06。

#### 2026-07-26 P1 恢复安全续记

- 状态不变：Phase 05=`IN_PROGRESS`，Phase 06=`NOT_STARTED`；原因是等待下一轮独立复核。未 stage、commit、push、PR，未访问真实内容库或真实外部系统。
- 根因/协议：queue `state_applied` 的 DB terminal item 与 staging cleanup 曾被错误折叠为 completed，现以同 operationId 重验 binding/fingerprint/terminal status/topology/hash 后 cleanup→complete，并把派生 `cleanupCancelledLocal` 识别为已完成 cancel 的 cleanup continuation。migration 在 oldRoot 部分删除失败后曾删除新 workspace 并尝试恢复残缺 before；现在新 after workspace 安装验证后持久 `INSTALLED/CLEANUP_PENDING`，oldRoot cleanup 独立可重试，snapshot 是唯一 rollback authority。`COMMITTING` 由 recover/CLI `--recover` 在 workspace 缺失时也可根据 manifest、snapshot、staging、oldRoot inventories 恢复，矛盾证据进入 `NEEDS_REPAIR`。
- 本次真实命令：P1+editor 16/16；08b 六文件 47/47；扩展 Phase 05 138/138；`npm test` 189 files、1005 pass/0 fail/0 skip；lint、三项 typecheck、format 通过；links 176/176；packaging 33/33；renderer 2140 modules；pack smoke 通过；`git diff --check` 见本轮最终检查。所有 fixture 均为临时合成 workspace。

#### 2026-07-26 rollback 与路径边界续记

- 状态不变：Phase 05=`IN_PROGRESS`，Phase 06=`NOT_STARTED`；未 stage、commit、push、PR，未访问真实内容库或真实外部系统。
- 本轮修复：rollback 使用持久 `ROLLBACK_COMMITTING` 状态；restore switch 中断后由 `recover()` 依据 snapshot、restore staging、rollback oldRoot 和 before/after inventory 恢复；`COMMITTED`/`ROLLED_BACK` no-op 先验证 workspace inventory 与残留。`inventoryAt()` 对 workspace、staging、oldRoot、restore 根路径统一 lstat，symlink/junction/非目录 fail-closed，避免 staging 链接被安装成 workspace。
- 新增故障注入：rollback 第二次 rename 中断后可 recover；staging 根 junction 在 mutation 前进入 `NEEDS_REPAIR`；`NEEDS_REPAIR` 无显式授权不可再次 recover；已安装 workspace 旁 residual staging 不得伪装为 `COMMITTED`；dangling symlink evidence path 也 fail-closed。迁移专项 16/16；P1+editor 18/18；08b 六文件 51/51；Phase 05 扩展定向 142/142；`npm test` 189 files、1009 pass/0 fail/0 skip；lint、三项 typecheck、format、links 176/176、packaging 33/33、renderer build 2140 modules、pack smoke、`git diff --check` 均通过。所有 fixture 均为临时合成 workspace。

#### 2026-07-26 08d 代码审查与再次独立复核续记

- 状态：Phase 05=`COMPLETE`，Phase 06=`NOT_STARTED`。08d A-G 与再次独立复核追加 P1 均已完成 RED→GREEN；最终独立只读复核未发现剩余 P0/P1。用户现已授权形成 Phase 05 里程碑提交。
- 追加修复：ArticleStore save/recovery/move/restore 共用 per-article 跨进程锁，fingerprint 与 rename 位于同一锁内；candidate/release 目录原子 rename 消除 acquire/release 崩溃半锁，覆盖 live/dead/unknown/ABA 与真实子进程退出。queue operation staging 根及祖先拒绝 junction/symlink/canonical escape。migration 限制 UUID v4 transactionId 并验证所有派生 evidence sibling，`NEEDS_REPAIR` 持久 forward/rollback intent，禁止残留 restore 误写 `COMMITTED`，补 old-root junction。OperationalStore v2 精确验证列、identity、unique、FK、连续 history/applied_at，并逐表哈希保护 v1 数据。
- 最终命令：08d 原四组 `40/40`、`26/26`、`15/15`、`22/22`；独立复核扩展 `68/68`、`26/26`、`19/19`、`22/22`；Phase 05 扩展定向 `176/176`；`npm test` 191 files、`1050/1050`；auth `16/16`；links `180/180`（file symlink 与 directory junction available）；packaging `33/33`；lint、main/renderer/bridge typecheck、format、renderer build（2141 modules）、pack smoke、`git diff --check` 全部通过，0 fail/skip。全部新增破坏性、迁移、恢复和并发测试仅使用临时合成 workspace；本轮未访问真实内容库或真实投稿、付费、生产系统。
- Git/边界：HEAD 仍为 `9ff69a073eb7869df930b688d15bfd2dabb79fc8`；未 reset/checkout/clean，未 stage/commit/push/PR；既有 Phase 05 WIP 与无关 Phase 06 计划文档修改均原样保留，且不计入本轮 08d 证据。

#### 2026-07-26 用户授权副本人工 migration 验收

- 仅操作用户明确指定的 `F:\workspace-migration-copy` 副本；未连接投稿、付费或生产系统，未操作原始内容库。
- 初次 dry-run 发现 13 个客户缺失 `client.json`；已在副本中补齐。12 个客户沿用生成文章中已有的一致 `clientId`；`头一锅` 使用新 UUID `1b9a780e-52c6-4db7-a4a5-a820b7125e65`。修复前副本备份为 `F:\workspace-migration-copy.pre-client-repair-backup`。
- execute：13 clients、52 articles、65 个 metadataVersion 写入，manifest=`COMMITTED`；execute 后 dry-run=`writes 0 / repairItems 0`（`头一锅` 的目录名与逻辑 UUID 差异记录为允许的 `directoryConflicts`）。
- rollback：manifest=`ROLLED_BACK`；backup snapshot 与 workspace 均 814 个文件，逐文件 SHA-256 差异为 `0`。证据目录：`F:\workspace-migration-copy.phase05-evidence`；migration backup：`F:\workspace-migration-copy.phase05-backup`。
- 本次副本验收已完成，但 Phase 05 仍=`IN_PROGRESS`，等待独立复核；Phase 06 仍=`NOT_STARTED`。

### 阶段0：工程基线与可信门禁

- 状态：COMPLETE
- 开始时间：2026-07-24 Asia/Shanghai（本阶段执行任务开始时）
- 前一阶段完成证据：不适用；阶段0是唯一不要求前序阶段完成的阶段，阶段1及以后均保持未开始。
- 开始分支/commit：`codex/refactor-program` / `bee1b3f24039bb77be0d13d9a663b88e5657e61c`
- Phase 0里程碑commit：`0bcbbfcca9ac4baf140359e048f3bf706f7b9526`（`refactor(phase-0): establish trusted engineering gates`）
- Git根与应用根：Git根 `F:\官媒投稿-refactor`；应用根 `F:\官媒投稿-refactor\auto—publish`
- 执行环境：Windows 11 专业版 build 26200；Node `v24.16.0`；npm `11.13.0`；Electron `43.1.1`
- package lock状态：根应用、`auth-server`、`media-workbench` 三份 `package-lock.json` 均未修改；未执行普通依赖升级
- 用户已有改动：未恢复、覆盖或清理原工作区历史文档删除及无关文件；未连接真实workspace、投稿、扣费或生产账号
- 计划内文件范围：根 `.github/workflows/`、`auto—publish/package.json`、测试收集/manifest/锁验证脚本、架构/打包测试、确认无生产引用的旧seam资产、本阶段账本与交接；本任务获准的最小例外为submission batch `localArchive`存储及其测试
- 已完成工作：
  - 在Git根新增 `.github/workflows/ci.yml`，所有应用命令显式使用 `auto—publish` 工作目录，并分离Node 24 desktop与Node 22 auth矩阵。
  - `scripts/run-tests.js` 收集并排序全部 `.test.js`/`.test.mjs`，以 `--test-concurrency=1` 串行运行；`test:discover` 输出176个测试文件并包含 `.mjs`。
  - production runtime统一为 `desktop/workspace-runtime.js`，由 `desktop/main.js` 组装；production renderer controller seam为 `media-workbench/src/controllers/platform-submission-controller.js` 与 `media-workbench/src/article-management-controller.js`。架构测试直接约束这些入口。
  - 删除无production引用的 `desktop/services/workspace-runtime.js`、`desktop/workspace-invalidation-policy.js` 和三个旧renderer hook及其旧测试；替换为production interface测试。
  - 新增合成workspace只读manifest：仅输出分类计数、字节数、相对路径与SHA-256，不复制或输出正文；新增renderer构建锁的陈旧锁回收/活动owner保护测试。
  - 新增本地测试/打包脚本：`test:discover`、`test:packaging`、`pack:smoke`；`pack:smoke` 已完成非签名目录制品构建。
  - 修复原基线合并提交 `e8d817847bab3a9e6020006cab35340f645e527f` 的 `localArchive` 回归：历史batch缺失字段保持缺失，不再在读/写/transition时伪造为`pending`；新发布路径仍显式持久化`pending`。
  - 保留 `submission-query` 对显式`pending`和`failed`的本地清理安全拦截；新增定向测试确认显式`pending`、`archived`、`failed`均可验证、持久化并跨store重建恢复。
  - 根CI的阻断audit改为 `npm audit --omit=dev --audit-level=high`；完整开发依赖audit保留为非阻断已知风险报告，未运行`npm audit fix`且未修改任何lockfile。
- 已核验的基线缺陷与收口：
  - `desktop/services/storage-maintenance-service.js` 的原基线扫描器使用 `lstat` 后安全跳过文件链接和目录junction，却把该动作错误计入 `followedSymlinks`。字段现仅表示真正进入链接目标的次数（安全扫描恒为0）；新增兼容性的诊断字段 `skippedSymlinks`。定向回归以临时合成fixture实际创建文件链接和目录junction，证明不读取目标、不计入容量且清理不触及目标。
  - `npm run test:links`已在本机实际运行：`file-symlink=yes`、`directory-junction=yes`、172/172通过、0 skip；旧的Windows EPERM阻塞结论失效。
  - 本项目采用本地Git里程碑提交；Git未配置remote，PR/push/required checks为`NOT_APPLICABLE`，根workflow仅作可移植配置和静态契约对象。
- Interface/schema偏差：无持久化schema、用户数据或外部平台行为变更；未执行真实迁移。唯一production runtime为 `desktop/workspace-runtime.js`，renderer使用明确的feature controller seam。
- 测试命令与结果：
  - `npm run test:discover`：通过，收集176个 `.test.js/.test.mjs`，包含新增CI workflow contract测试。
  - 修复前定向基线：原工作树与重构工作树均为 `tests/published-article-trash.test.js` 7项中5通过、2失败（`:59`、`:191`）；均来自 `e8d817847bab3a9e6020006cab35340f645e527f`。
  - 修复后定向测试：`node --test tests/published-article-trash.test.js`：8/8通过；相关submission/archive集成、查询与reconcile测试：13/13通过。
  - `node --test tests/storage-maintenance-service.test.js`：修复前6项中5通过、1失败（`:75`，实际`followedSymlinks=1`）；修复后6/6通过、0 skip，覆盖文件链接与目录junction跳过、容量排除和清理边界。
  - `npm test`：955 tests；955 pass、0 fail、0 skip；全部使用默认合成/临时fixture。
  - `npm run test:auth`：16/16通过。
  - `npm run lint`：通过。
  - `npm run typecheck:renderer`、`npm run typecheck:bridge`：均通过。
  - `npm run build:renderer`：通过，Vite转换2137 modules。
  - `npm run test:packaging`：33/33通过。
  - `npm run pack:smoke`：通过，`electron-builder --dir --config electron-builder.alpha.yml`完成非签名Windows目录制品；未发布正式包。
  - `npm run format:check`：通过。
  - `npm run test:links`：通过，172/172、0 skip；`file-symlink=yes`、`directory-junction=yes`。
  - Phase 00定向架构/锁/发现/manifest/刷新/controller/CI测试：7个文件、14/14通过（`architecture-seams`、`ci-workflow-contract`、`renderer-harness-lock`、`test-discovery-contract`、`workspace-manifest`、`renderer-content-refresh-lifecycle`、`renderer-workbench-controller-seams`）。
  - `npm audit --audit-level=high`：非阻断报告，`brace-expansion`、`fast-uri`两项high，均在开发/构建工具传递依赖；未执行`npm audit fix`。
  - `npm audit --omit=dev --audit-level=high`：通过，0 high、0 critical（`found 0 vulnerabilities`）；这是CI阻断门禁。
- 故障/迁移/回滚证据：
  - manifest测试使用临时合成workspace，验证publication、batch、sidecar、order各1项，仅返回相对路径/计数/字节数/哈希且序列化结果不含合成正文、私密材料或绝对workspace路径；CLI测试确认只读行为。
  - renderer harness锁测试验证陈旧锁可回收、活动owner锁不被回收；未对用户workspace做删除或恢复。
  - Phase 00不引入schema迁移；正式workspace迁移、备份恢复和外部平台回滚均未执行，按阶段边界留给后续阶段/人工授权。
- 人工待办：
- 自动验证已完成：`npm run test:links`在启用Developer Mode后实际执行172/172并通过；未弱化、跳过或伪造成功。
- remote、PR/push与required checks：`NOT_APPLICABLE`；根workflow保留为可移植配置并由静态契约验证。
- 开发依赖风险待办：由依赖维护者在单独授权的工作中处理2个high；Phase 0不升级普通依赖。
- 停止条件是否触发：否。所有canonical本地门禁已通过，并已由本地里程碑commit固化。
- Handoff路径：`docs/refactor/handoffs/phase-00.md`
- 下一阶段是否READY：是。阶段1为`READY`，但本任务未执行且不得开始Phase 1。

### 阶段1：领域契约与目标module骨架

- 状态：COMPLETE
- 开始时间：2026-07-24 Asia/Shanghai
- 开始分支/commit：`codex/refactor-program` / `926723f076cd1d8c88beb35695567bfb74df6639`
- 完成commit：`027e9f88e00cb206669c2490cec9fcad7e6a47ad`（`refactor(phase-1): establish domain contracts`）
- 执行任务/线程：当前 Codex 任务
- 用户已有改动：开始时工作区干净；未恢复、覆盖或混入原工作区的历史文档删除、未跟踪文件或真实内容库。
- 计划内文件范围：纯 `src/domain`/`src/application` contract，测试、类型/构建门禁、仅供测试组装的 composition skeleton、renderer 安全 DTO 声明、CONTEXT/ADR、账本和交接。
- 已完成工作：新增唯一 domain contract 出口 `src/domain/index.js`；account-aware 普通 target、media target及 `legacy-unknown-account` fail-closed 规则；安全错误、版本化 IPC/worker envelope、publisher outcome/evidence validator和fake publisher；未接入生产的 PublicationWorkflow/composition 骨架；严格 TS contract 检查和依赖方向测试；更新平台账号术语与主进程类型策略 ADR。
- 未完成工作：没有 SQLite schema、迁移、writer切换、远端 adapter 切换、renderer产品行为或真实 workspace 操作；这些均属后续阶段。
- Interface/schema偏差：旧 publication target 仍仅按 platform 建模，Phase 1 未添加兼容字段或改写旧记录；Phase 2 必须将旧普通平台记录导入为 `legacy-unknown-account`，且不得自动执行。
- 测试命令与结果：完整 `npm test`、`npm run test:auth`、`npm run lint`、`npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run build:renderer`、`npm run test:links`、`npm run format:check`、`npm run test:packaging`、`npm run pack:smoke` 均通过；默认发现178个测试文件，新增Phase 01定向7/7，auth 16/16，links 172/172，packaging 33/33；仅临时合成fixture、无真实外部调用。
- 故障/迁移/回滚证据：Phase 1禁止创建SQLite/迁移或改变writer，因此迁移、备份与回滚为不适用而非未验证；静态生产引用检查确认 `desktop/main.js`/`workspace-runtime.js`未引用新composition，未改变旧writer。非法identity、未知字段、未知DTO版本、缺失/不匹配证据、legacy未知账号均有拒绝测试。
- 人工待办：真实内容库副本、迁移、备份和恢复仅在获得隔离路径授权后的Phase 2执行。
- 停止条件是否触发：否。
- Handoff路径：`docs/refactor/handoffs/phase-01.md`
- 下一阶段是否READY：是；Phase 2为`READY`，但本任务不执行Phase 2。

### 阶段7：Auth、Build、Ops 与 release evidence（2026-08-02）

- 状态：`COMPLETE`（代码与仓库自动化完成）；正式 release 仍为`BLOCKED_RELEASE`，不把人工验收写成自动化通过。
- 开始时间：2026-08-02 Asia/Shanghai
- 开始分支/commit：`codex/refactor-program` / `faf92c2cc96edebbc2963940b45c5ef335bb8287`
- 完成commit：包含本条记录的 Phase 7 closeout commit；不得把实施起点 `faf92c2` 伪装成完成 commit。
- 执行任务/线程：当前 Codex 任务
- 用户已有改动：开始时工作树 clean；保留并提交全部 Ticket 07、独立审查修复和交接改动；未执行 reset、checkout、clean、push 或 PR。
- 计划内文件范围：Root CI、Auth Docker/verification、test discovery、release evidence manifest/checklist validator、production package verifier、release checklist、Ticket 07、Phase 7 handoff 和本账本；Core/Application/Renderer interfaces 保持冻结。
- 已完成工作：固定 Node 24 desktop 与 Node 22 Auth 矩阵及 7 个 job display name；固定 16 个 required check/step ID；拆分 migration、backup/restore、container、health、rate-limit/trusted-proxy、test discovery、legacy absence、production directory/offline smoke evidence；root-tests 使用 desktop core collection，packaging-contracts 独立覆盖四个 packaging contract 文件，避免 CI 重复执行；manifest 只汇总安全摘要、版本、相对路径和 hash；checklist validator 只校验字段、check 名称和 gate 状态，不批准 release。
- 自动验证：`npm test` 为 228 文件、132 suites、1488/1488 pass、0 fail，1 个既有 Electron focus case按自身条件 skip；`npm --prefix auth-server test` 47/47；backup/restore/migration 定向13/13，包含迁移 session 登录/refresh 与跨进程持续 WAL writer 的100次快照；独立双行事务不变量250次快照、0不一致；`npm run test:desktop-core` 为224文件、130 suites、1442/1442 pass；`npm run test:discover` 228个（216 `.test.js`、12 `.test.mjs`）；migration 56/56；packaging 46/46；diagnostics32/32；media transport9/9；health9/9；rate-limit/trusted-proxy9/9；links181/181；lint、renderer/bridge/main typecheck、format、renderer/preload build通过；CI contract/evidence/checklist定向测试12/12；`git diff --check`通过。所有fixture均为临时合成/离线环境。
- 制品与证据：`build/production-artifact-manifest.json` 记录 application `1.0.1`、workspace schema `1` 和 13 个相对 artifact/resource hash；production directory/offline self-test通过，Hepan Python 缺失项为`SKIPPED_OPTIONAL`；`build/release-evidence-manifest.json` 记录 Auth schema `2`、16 个 required check、migration、backup/restore、Auth/discovery/container、artifact、offline self-test、legacy absence、manual gates 和 rollback 说明。manifest 的本地 `sourceState=DIRTY`、`releaseState=BLOCKED_RELEASE`，无绝对用户路径、Cookie、API key/token、raw error、正文、DOM 或截图。
- Auth/RPO/RTO：继续 Node + SQLite 单实例，不引入 PostgreSQL/HA；destination backup 完成后重新打开并做 schema/row/hash/integrity/restore-check；liveness 只证明进程响应，readiness 执行轻量 repository/schema probe，integrity 为受控运维命令。备份 cadence、destination/retention/encryption/ACL、RPO/RTO 数值、恢复 owner 和 recovery drill 仍为`PENDING_HUMAN`。
- 安全边界：limiter 的 source/identity/combination bucket 有界 TTL/LRU，默认硬上限4096；proxy 默认 direct-only，仅显式 header + trusted hops/CIDR 才读取来源；media endpoint 必须显式配置，HTTP 仅显式`allowInsecure`确认，HTTPS/DNS/TLS/供应商状态仍待人工验收；diagnostic schema 只输出安全字段，Auth audit 默认90天/64MiB rotation，legacy `publish-log` source 与 production archive 命中均为0。
- 人工待办：Phase 04 四项受控验收、production endpoint/DNS/TLS、Cloudflare/Tunnel source chain、签名证书/timestamp、installer ACL/upgrade/rollback/SmartScreen/clean machine、external E2E、Auth RPO/RTO 数值与 recovery drill owner、rollback package/procedure；本机 Docker 不可用，`required/auth-container` 保持`PENDING_HUMAN`。这些只阻塞正式 release，不关闭 ASAR、不恢复源码 fallback、不允许隐式 HTTP、不放宽 proxy/diagnostic 安全策略。
- 故障/迁移/回滚证据：migration roundtrip、backup destination/restore-check、recovery fixture 和 production smoke 均只在临时 fixture/离线目录执行；未执行真实数据恢复、签名、真实 TLS、外部 E2E 或 release 批准。rollback manifest 记录为`PENDING_HUMAN`，不伪造已有回滚包。
- 停止条件是否触发：否。CI 未使用生产 secret，未访问真实 Auth DB、workspace、内容库、账号、供应商、Cloudflare/Tunnel、投稿、生产服务或付费系统。
- Handoff路径：`docs/refactor/handoffs/phase-07.md`
- 下一阶段是否READY：否；Phase 8=`NOT_STARTED`。Phase 8 的 cleanup、最终全链验收、handoff 更新和 release 批准均不属于本 ticket；其开始输入为本 handoff、Ticket 07、fixed required checks、manifest、schema/migration/backup/restore、production artifact/offline smoke 和未决 release gate 清单。
> **2026-08-05 Phase 8 Ticket 16 feature-development admission simulations (current highest authority):** Ticket 16=`COMPLETE`; Phase 8 remains=`IN_PROGRESS`, and release remains=`BLOCKED_RELEASE`. Ticket 15 was recorded `COMPLETE`; the pre-simulation root suite collected 238 test files and passed `1618/1618` with 0 fail/skip, while the post-audit root suite collected 239 files and passed `1621/1621` with 0 fail/skip; the Phase 8 cleanup gate passed `3/3`. The three fixture-only proofs cover a fake Publisher adapter/registry, an authoritative publication query plus typed DTO and one feature snapshot, and a Content application command plus typed IPC and one Renderer feature. Their deletion tests execute an alternative caller after removing the relevant boundary, demonstrating the workflow's five ordered actions, five separate management reads plus projection, and IPC-level command validation/execution rather than relying on metadata. No production source, schema, capability inventory, production IPC registry/preload, account, secret, external call, real workspace/content/Auth database, or product capability was changed; `package.json` now includes the admission `.test.mjs` file in the mandatory format check. Detailed evidence: `docs/refactor/handoffs/phase-08-ticket-16-feature-development-admission.md`; executable proof: `auto—publish/tests/phase-08-feature-development-admission.test.mjs`.
