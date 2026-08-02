# Phase 8 交接：旧架构删除与最终验收

## Ticket 02 执行交接（2026-08-02，当前记录）

- 状态：Ticket 02 `COMPLETE`；Phase 8 仍为 `IN_PROGRESS`，正式 release 仍为 `BLOCKED_RELEASE`。
- 分支/HEAD：`codex/refactor-program` / Ticket 01/02 固化 commit；未 push 或 PR。
- 修改边界：仅迁移 workspace/path、Playwright/runtime、Hepan packaged resource resolver 和对应架构/路径/打包测试；未改 workspace schema、ContentIdentity、PublicationWorkflow、OperationalStore schema/writer、Renderer 产品行为或真实数据。

### Ticket 02 的门禁与精确命中

开始前重新扫描得到的 5 条 production `src → desktop` import：

```text
src/content/client-material-store.js:6       ../../desktop/workspace-paths
src/content/generation-batch-store.js:5      ../../desktop/workspace-paths
src/core/files.js:7                           ../../desktop/workspace-paths
src/core/playwright.js:6                      ../../desktop/services/runtime-diagnostics-service
src/platforms/hepan/runtime-paths.js:5        ../../../desktop/packaging/packaged-runtime-resolver
```

新增 `tests/phase-08-reverse-dependencies.test.js` 后，红测现场为 5 个精确命中、1 test fail；迁移后同一真实 source-root 扫描为 2/2 pass，production `src → desktop` import 为 0。测试还从真实 `src/domain`、`src/application`、`media-workbench/src`、`desktop/worker` 和 `src/platforms` 检查禁止依赖与 OperationalStore writer 边界。

### 责任迁移与删除

| 责任 | 新 owner / seam | 真实 caller | 删除的旧入口 |
|---|---|---|---|
| storage/workspace path policy | `src/infrastructure/workspace/storage-paths.js`、`workspace-paths.js` | runtime config、workspace bootstrap、content/material/generation stores、offline/package smoke | `desktop/storage-paths.js`、`desktop/workspace-paths.js` |
| packaged resource validation | `src/infrastructure/runtime/packaged-runtime-resolver.js` | packaging scripts、artifact verifier、Hepan runtime、offline smoke | `desktop/packaging/packaged-runtime-resolver.js` |
| Playwright packaged path policy | `src/infrastructure/runtime/playwright-runtime-paths.js` | neutral Playwright runtime resolver、offline smoke | `desktop/packaging/playwright-runtime-paths.js` |
| Playwright/Node/CLI/Hepan executable resolution | `src/infrastructure/runtime/playwright-runtime-resolver.js` | `src/core/playwright.js`、desktop diagnostics、desktop task cleanup | `runtime-diagnostics-service` 中的 resolver 实现与 `resolvePlaywrightRuntime` 暴露 |

所有 packaged candidates 仍经过 regular-file/directory、ASAR、canonical root、link/junction 和 fail-closed 校验；packaged 分支没有恢复源码 fallback。Caller 只传 workspace/app/resources root、paths、环境和配置，不学习 Electron `app` 顺序或 ASAR 内部布局。

### Ticket 02 自动证据

| 命令 | 结果 |
|---|---:|
| `node --test tests/phase-08-reverse-dependencies.test.js` | 3/3 |
| workspace/path/content 定向组合 | 26/26 |
| runtime/packaging/Hepan/diagnostics 定向组合 | 26/26 |
| `npm run test:packaging` | 46/46 |
| `npm run test:links` | 181/181，file-symlink=yes、directory-junction=yes |
| `npm run test:diagnostics` | 32/32 |
| Phase 8 seam/architecture 扩展组合 | 82/82 |
| `npm run lint`、`typecheck:main`、`typecheck:renderer`、`typecheck:bridge` | 全部通过 |
| `npm test` | 229 个测试文件、132 suites、1490/1490 pass、0 fail、0 skip |

完整 root suite 与 `git diff --check` 均已通过；未将本 Ticket 提前标为 Phase 8 完成；人工 release gates 继续保持 `PENDING_HUMAN`。

> 以下编号章节保留 Ticket 01 的基线、调用图和后续 Ticket 决策，作为本 Ticket 的输入证据；本追加记录是当前 Ticket 02 的执行结果。

## 1. 状态

- 状态：`IN_PROGRESS`。
- 当前 ticket：Ticket 01，冻结 production 基线与 cleanup decision map。
- 开始分支与 commit：`codex/refactor-program` / `aff1dfd089aff2492f9054747ce55f94304cffdd`。
- 当前分支与 commit：`codex/refactor-program` / `aff1dfd089aff2492f9054747ce55f94304cffdd`。
- 启动时工作区：tracked source clean，staged=0；仅有用户提供的未跟踪 `.scratch/phase-08-cleanup-acceptance/issues/` 计划目录。
- 当前工作区：本 ticket 新增/修改的三份文档和未跟踪的用户计划目录；没有生产代码、测试、schema、package 或 build 输入修改；没有 stage/commit/push/PR。
- 日期与环境：2026-08-02 Asia/Shanghai；Windows 11；Node `v24.16.0`；npm `11.13.0`；Electron `43.1.1`。
- Phase 7：`COMPLETE`；Phase 4 人工验收：`PENDING_HUMAN`；正式 release：`BLOCKED_RELEASE`。

权威决策图：[phase-08-decision-map.md](../phase-08-decision-map.md)。它比本 handoff 包含更完整的 37 findings、29 OPT、33 个长模块和逐项 deletion-test register。

## 2. 已完成结果

- 从 `desktop/main.js`、`authenticated-runtime`、`workspace-runtime`、两类 composition、worker、IPC registry/preload 和 `media-workbench/src/main.tsx` 追踪了真实 production chain。
- 确认唯一 production composition/lifecycle root 是 `desktop/workspace-runtime.js`；Content owner 是 `desktop/composition/content-lifecycle-composition.js`；Publication/OperationalStore owner 是 `desktop/composition/publication-workflow-composition.js`；PlatformRun owner 是 `desktop/services/platform-run.js`；IPC owner 是 `desktop/ipc/register.js` + `desktop/ipc/contracts/production-registry.js`；Renderer invalidation owner 是 `workspace-coordinator`。
- 冻结 schema/contract 基线：workspace schema `1`、OperationalStore schema `v3`、Auth schema `2`、worker envelope schema `1`；non-Auth IPC inventory 为 109（43 query、61 command、5 event），lifecycle=21，event=5。
- 记录当前唯一确认的 5 条 production `src → desktop` 反向依赖，全部归 Ticket 02；目标是 0，不通过 re-export 或测试专用 setter 掩盖。
- 记录旧 publisher compatibility 层、numeric `runCode` signature、dead screenshot API、stale worker message type、legacy trash DTO、受控 migration DTO 和真实 worker snapshot 的不同处置；没有把所有 `legacy` 字样误判为可删除。
- 对第一方 production source 中所有超过 400 行的 33 个模块逐项给出行数、deletion test、职责分类、负责 ticket 和 blocker edge；未留下“以后再看”的模块。
- 将 37 条 finding、29 个 OPT、Phase 4/7 人工门映射到后续 Ticket 02–17；人工门仍是人工门，未标自动通过。
- 当前 ticket 未删除模块、未改 writer、未改 IPC、未改 Renderer、未执行真实迁移或外部动作。

## 3. 权威 interface 与 schema

| 名称 | 文件 / symbol | Caller | 不变量 / 错误模式 |
|---|---|---|---|
| Workspace lifecycle | `desktop/workspace-runtime.js` / `createWorkspaceRuntime` | `desktop/main.js`、authenticated runtime | 唯一 start/dispose；owned service/listener 只释放一次 |
| Content composition | `desktop/composition/content-lifecycle-composition.js` / `createContentLifecycleComposition` | workspace runtime | 唯一 ArticleStore/ContentStore composition；path/lock 不暴露给 IPC/View |
| Publication composition | `desktop/composition/publication-workflow-composition.js` / `createPublicationWorkflowComposition` | workspace runtime | OperationalStore facade + PublicationWorkflow；事务和 post-processing 不散到 caller |
| Operational state | `src/infrastructure/operational-store/operational-store.js` / `createOperationalStore` | publication/submission/order/attention services | schema v3；main-only writer；publication outcome、attempt、batch revision、order evidence、recovery intent 原子化 |
| Publication workflow | `src/application/publication-workflow.js` / `createPublicationWorkflow` | publication submission services | remote intent/outcome/attention/recovery；unknown 不自动 retry/publish |
| Platform run | `desktop/services/platform-run.js` / `createPlatformRun` | `desktop-task-service` | schema v1、runId 闭合；旧 child message 不能污染新 run；stop/watchdog/cleanup/terminal 单 owner |
| Typed IPC | `desktop/ipc/contracts/production-registry.js` / `productionIpcRegistry` | `desktop/ipc/register.js`、preload、domain bridges | 109 capability；输入输出 versioned/safe；raw error/path/Cookie/body 不过 Renderer |
| Invalidation | `desktop/workspace-data-invalidation.js` + `media-workbench/src/features/workspace/workspace-coordinator.js` | workspace services/features | runtimeId + revision；旧 workspace 事件丢弃；每个 feature 只注册自己的 scope |
| Auth | `desktop/services/auth-service.js`；`auth-server/src/auth-domain.js` + SQLite repository | Auth IPC/HTTP/AuthGate | Auth schema v2；Auth legacy envelope 与 non-Auth typed registry 隔离 |
| Diagnostics | `src/diagnostics/diagnostic-schema.js`、sinks；`desktop/services/runtime-diagnostics-service.js` | producers、Settings/diagnostics IPC | 只有 safe metadata/diagnosticId；有界 rotation；无 raw screenshot/stack/secret |

## 4. Production 调用图

```text
desktop/main.js
  -> authenticated-runtime
  -> workspace-runtime (唯一 workspace composition/lifecycle root)
     -> content-lifecycle-composition
        -> ContentStore / ArticleStore / ContentIdentity
     -> publication-workflow-composition
        -> PublicationWorkflow
        -> OperationalStore v3 (唯一 publication/batch/order writer)
        -> attention query/resolver/post-processor
     -> PlatformRun + desktop-task-service
        -> worker/run-task.js (schema v1, runId)
        -> publisher-executor -> Toutiao/Hepan/Lieju adapter
     -> media publisher/resource/order services
     -> content/generation/removal/settings services
     -> ipc/register.js -> production-registry -> preload
  -> media-workbench/src/main.tsx -> App.tsx
     -> workspace-coordinator -> domain feature owners -> typed domain bridges -> Views
```

Auth 旁路为 `desktop auth-service/auth-ipc -> auth-server AuthDomain -> SQLite repository`。release evidence 旁路为 diagnostic schema/sinks 与 artifact/evidence scripts；两者不成为业务第二 writer。

## 5. 本 ticket 文件

- 新增：[docs/refactor/phase-08-decision-map.md](../phase-08-decision-map.md)。
- 新增：本 handoff。
- 修改：[docs/refactor/13-progress-ledger.md](../13-progress-ledger.md)，顶部追加 Ticket 01 权威记录，Phase 8 行更新为 `IN_PROGRESS`。
- 删除：无。
- 用户已有但未触碰：`.scratch/phase-08-cleanup-acceptance/issues/` 全部计划文件；所有 production source、tests、package/build、历史 review 文档均未触碰。

## 6. 已删除旧路径

Ticket 01 没有执行删除。下表是“当前 absence 证据”和后续删除责任，不是本 ticket 的完成项。

| 旧 seam / writer | 当前证据 | 后续处置 |
|---|---|---|
| `src/core/jobs.js`、旧 submission paths、`src/platforms/media/preflight.js` | source/ASAR legacy absence 检查为 0；物理路径已不存在 | Ticket 13/15 继续保护 0 引用 |
| `publish-log` sender/consumer/path | source 与 production archive named hit 为 0 | Ticket 12/13 保持 absence，不恢复 sender |
| `src/infrastructure/publishers/legacy-adapter-publisher.js`、`publisher-router.js` | production import 为 0；旧 test 仍直接引用 | Ticket 13 删除旧模块和穿透测试，补真实 desktop publisher seam |
| 旧 publication/batch/order JSON writer | 当前 production composition 使用 OperationalStore v3；worker/adapter 不写 store | Ticket 03/05/13 完成 source/test/package 0 引用门 |

## 7. 数据与迁移

- Workspace schema：`1`；Auth schema：`2`；OperationalStore：`v3`；worker envelope：`1`。
- Ticket 01 不打开真实 workspace、Auth DB 或迁移输入，不执行 execute/rollback/restore。
- 受控旧内容、旧 metadata、legacy provider settings、legacy application config、unknown-account target 都保留为有证据的迁移/拒绝入口，不能在 Ticket 13 误删。
- Phase 7 的 migration、backup destination/restore-check、Auth recovery fixture 和 production directory/offline smoke 均只使用临时合成目录；正式真实恢复、RPO/RTO、rollback package 仍 `PENDING_HUMAN`。
- 下一次迁移/容量/制品验收由 Ticket 15 执行，必须重新记录 source state、相对路径、hash、schema 和人工 blocker。

## 8. 测试证据

| 命令 / 证据 | 结果 | 数量 | Skip | 环境 / fixture |
|---|---|---:|---:|---|
| `npm run test:discover` | pass | 228 文件 | 0 | `.test.js` 216、`.test.mjs` 12 |
| Phase 7 紧凑 architecture baseline | pass | 66/66 | 0 | 真实 production seam/owner 断言 |
| Ticket 01 扩展 architecture/owner/legacy/IPC command | pass | 81/81 | 0 | 临时/静态；包含 109 capability、21 lifecycle、5 event |
| `npm run test:legacy-absence` | pass | source 0 / archive 0 | 0 | 未提供 archive resources；archive `NOT_APPLICABLE` |
| `npm run lint` | pass | — | 0 | 本地 source |
| `npm run typecheck:main` | pass | — | 0 | Node/Electron main contract |
| `npm run typecheck:renderer` | pass | — | 0 | media-workbench |
| `npm run typecheck:bridge` | pass | — | 0 | strict bridge |
| `git diff --check` | pass | — | 0 | 当前文档 diff |

本 ticket 未运行完整 root suite 作为 cleanup 完成判断。Phase 7 handoff 的历史完整结果为 228 files、132 suites、1488/1488 pass、0 fail、1 个由自身条件控制的 Electron focus skip；删除/拆分后必须由 Ticket 13–15 重新执行。

故障/恢复证据边界：本 ticket 只冻结既有 fault owner 和测试入口；未注入强杀、磁盘满、WAL/corruption、真实 remote timeout、真实 login、真实 post、真实支付或真实 rollback。具体 fault matrix 归 Ticket 14/15。

## 9. 偏差与决定

- 相对 Phase 8 总计划的偏差：只执行 Ticket 01 的 evidence/boundary；没有提前删除 seam、拆长模块或运行最终功能/迁移/容量/准入验收，符合 ticket 允许修改范围。
- 当前 workspace 有用户提供的未跟踪 `.scratch` 计划文件；它是启动输入，不是可以用 `clean` 消除的代码 dirty。没有执行 reset/checkout/clean。
- architecture 证据同时记录紧凑 66/66 和本 Ticket 扩展 81/81：二者测试集合不同；后续应使用实际命令输出，不把一个集合的数量当成另一个集合。
- `runtime.lock`、`migration.lock`、`.article-lock`、removal transaction lock、diagnostic sink lock 都有 production caller；“删除旧 publication file lock”不等于删除这些当前保护。
- `legacy` 兼容面按“dead、migration-only、Auth-only、当前 production caller、stale worker contract”分类；没有因为命名相似而批量删除。
- 没有扩大 Domain/Application public interface；5 条 reverse dependency 留给 Ticket 02 的 neutral seam/injection。若消除依赖需要扩大接口，必须按停止条件重开前序阶段。
- 未更新 CONTEXT/ADR、原始 review、optimization 文档；最终文档一致性由 Ticket 17 处理。

## 10. 未完成与阻塞

- 代码未完成：5 条 reverse dependency 尚未消除；旧 test-only publisher compatibility 层尚未删除；长模块尚未拆分；Renderer domain barrel 尚未迁移/删除；全 Phase 8 cleanup 尚未执行。
- 自动验证未完成：Ticket 13 的完整 deletion/CI gates、Ticket 14 功能/故障/安全全链、Ticket 15 迁移/容量/制品、Ticket 16 admission simulations、Ticket 17 final traceability 尚未执行。
- `PENDING_HUMAN`：Phase 4 四项平台/媒体/签名登录门；Phase 7 endpoint/DNS/TLS、trusted proxy source chain、签名、installer/rollback、external E2E、Auth RPO/RTO/recovery owner、rollback package；本机 Docker 对 `required/auth-container` 的限制。
- 正式 release：继续 `BLOCKED_RELEASE`；Ticket 01 不批准 release。
- 触发的停止条件：无。当前发现的 reverse dependencies、dead compatibility candidates 和长模块均有明确 owner/ticket；没有发现活跃旧 writer、数据冲突或需要真实数据才能完成本 ticket 的判断。

## 11. 下一任务入口

- 必读文件：
  - [phase-08-decision-map.md](../phase-08-decision-map.md)
  - `.scratch/phase-08-cleanup-acceptance/issues/02-eliminate-reverse-dependencies.md`
  - `docs/refactor/01-target-architecture.md`、`02-codex-execution-protocol.md`
  - `auto—publish/desktop/workspace-paths.js`
  - `auto—publish/desktop/services/runtime-diagnostics-service.js`
  - `auto—publish/src/core/playwright.js`
  - `auto—publish/src/core/files.js`
  - `auto—publish/src/content/client-material-store.js`
  - `auto—publish/src/content/generation-batch-store.js`
  - `auto—publish/src/platforms/hepan/runtime-paths.js`
- 首个 production symbols：上述 5 个 import site；先写 reverse-dependency fail-closed architecture red test。
- 首个失败测试：Ticket 02 应新增“任一 production `src → desktop` import 即失败”的测试；若现有 path/runtime/link contract 先失败，记录实际 owner，不以 wrapper 绕过。
- 允许修改范围：依赖中立的 path/runtime resolver、composition injection、真实 caller、对应 architecture/path/link/package tests、Ticket 02 handoff/ledger。
- 禁止修改范围：OperationalStore schema/writer、PublicationWorkflow/Publisher 业务语义、Content identity/schema、Renderer product behavior、真实 workspace/外部服务、为测试新增 public setter。
- 下一阶段入口：Phase 8 仍 `IN_PROGRESS`；Ticket 01/02 已完成并由一个明确 commit 固化。Ticket 03、04、11、12 可从该 commit 分别创建独立分支/工作树并同时开始，但不得在同一工作树并发修改；handoff、进度账本和公共门禁冲突须顺序合并后统一刷新证据。Phase 8 不能标 `COMPLETE`，也不能开放正式 release。

## 12. 安全边界声明

本 handoff 和 decision map 不含 Cookie、API key、token、客户正文、生产路径、raw exception、DOM、截图或真实账号信息。所有自动化证据使用合成/临时/离线输入；未执行真实投稿、同步、扣费、恢复或发布。
