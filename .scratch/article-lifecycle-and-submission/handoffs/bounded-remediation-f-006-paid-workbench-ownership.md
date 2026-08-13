# F-006 Bounded Remediation Handoff — Paid Workbench Ownership

## 结论

```text
R4_PASS
```

文章管理现在只保留普通平台和付费媒体 staging admission 入口；“付费媒体投稿”页面成为唯一正式 paid submission workbench。`PaidSubmissionStagingPanel` 在正式 Renderer tree 中只有一个业务实例。

## Provenance

- source thread：`019ff8d3-3af2-7a50-86fe-4d01204bdff9`
- R4 execution thread：`019ff937-29b5-71e3-b055-281aa20908f0`
- base integration HEAD：`cd435d689be7376114a1b0c53b85e3c81877e475`
- worktree：`C:\Users\violet\.codex\worktrees\5b23\官媒投稿-refactor`
- branch：detached HEAD
- subagents：none；未并行实现
- implementation commit：`dfbca28f9609fecd1cfe6b9211636570790ab729`
- merge/push/真实登录、发布、订单、付费、取消：none

开始时已保留且未暂存主线程预存变更：删除的 `M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md` 与未跟踪的 `PAID-SUBMISSION-ACCEPTANCE-REMEDIATION-R1-R4.md`。

## Scope、owner 与实现

Primary owner 是 Renderer paid-media workbench / route composition。没有新增第二个业务状态 owner。

- `auto—publish/media-workbench/src/App.tsx`
  - 在 `AppContent` 复用唯一 `useContentWorkbenchFeature()` 实例。
  - `currentView="workbench"` 改为渲染 `PaidMediaWorkbench`，移除旧 `ArticleList`/`ArticleEditor` 的文章+媒体直接组装 UX。
  - 继续从既有 `useMediaFeature` 传入 `pool`，没有复制媒体池状态。
  - `ContentWorkbench` 接收同一个 content feature handle，不再在页面内创建第二实例。
- `auto—publish/media-workbench/src/components/PaidMediaWorkbench.tsx`
  - 承接唯一 `PaidSubmissionStagingPanel` 实例。
  - 复用既有 `paidStaging`、`paidMediaExecution`、paid preflight/confirm/start/pause commands 与 media pool。
  - 提供当前 client scope、刷新入口和公开 workbench shell；客户切换由既有 feature scope 与 panel 临时状态清理规则处理。
- `auto—publish/media-workbench/src/components/ContentWorkbench.tsx`
  - 删除完整 paid staging panel，只保留文章管理 admission 及文章管理独立功能。
- `auto—publish/media-workbench/src/components/Sidebar.tsx`
  - 增加已有公共 `ResourceLibrary` route 的“公共媒体资源”入口，保留媒体资源/收藏管理能力。
- `auto—publish/media-workbench/src/features/content/use-content-workbench-feature.ts`
  - 只增加窄的共享 feature handle 类型，未新增 store 或事实 writer。
- `auto—publish/tests/renderer-content-client-switch.test.js`
  - 将真实 Renderer 客户切换/paid execution regression 调整为文章管理 admission → paid workbench，并覆盖单实例、控制权、client isolation、Start/Pause 与路由往返。
- `auto—publish/tests/renderer-responsive-layout.test.js`
  - 将公共媒体刷新回归导航到独立 resources route。

未修改 paid staging feature、paid preflight/execution、IPC/preload、schema、supplier、OperationalStore 或 R1–R3 application owners。

## Acceptance 与 local self-audit

- 文章管理存在“加入付费媒体投稿队列”，但没有 paid staging region、收藏媒体 picker、费用预检、confirm 或 Start/Pause controls。
- paid workbench 显示 staging list；有 staging 时显示 favorite media selection、批量指定、preflight、confirm 和 paused batch Start/Pause。
- Renderer source 只有一个 `<PaidSubmissionStagingPanel` 业务实例，且位于 `PaidMediaWorkbench`；content route 没有该实例。
- `useContentWorkbenchFeature()` 在正式 App wiring 中只有一个调用；ContentWorkbench 与 PaidMediaWorkbench 共用同一 snapshot/commands，没有第二套 paid staging/media pool/execution state。
- client switch 通过已有 `content.selectClient`、feature scope 和 panel `[currentClientId]` cleanup 清理 selection、picker、errors、preflight；staging/batch 仍按当前 client 过滤。
- `文章管理`、`其他平台投稿`、`付费媒体投稿`、`公共媒体资源` route 可在真实 Renderer 中往返；公共 ResourceLibrary owner 未重写。
- self-audit findings：none。
- blocking findings：none；无 escalation（未改变 schema、持久事实 owner、事务边界或远端副作用边界）。

## Tests and evidence

在旧 wiring 上先运行修改后的 R4 direct regression，文章管理仍出现 paid region，得到预期红灯：`actual 1 !== expected 0`。完成 wiring 后在最终 implementation HEAD 上重跑：

| Command | Result |
| --- | --- |
| `node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js` | PASS `1/1`；文章管理无完整 paid controls，paid workbench 单实例承接 picker/preflight/confirm/Start/Pause，client isolation 与路由往返通过。 |
| `node --test --test-concurrency=1 tests/renderer-responsive-layout.test.js` | PASS `7/7`；公共媒体刷新、content history、settings 与窄/宽 viewport regression 通过。 |
| `node --test --test-concurrency=1 tests/phase-01-paid-media-staging.test.js tests/phase-02-paid-media-staging-application-ipc.test.js tests/phase-03-paid-media-staging-renderer.test.mjs tests/phase-07-regular-queue.test.js tests/phase-12-paid-media-preflight.test.js tests/ticket-25-c-regular-platform-acceptance.test.js tests/ticket-25-d-paid-media-acceptance.test.js tests/content-workbench-regression.test.js tests/content-submission-ipc.test.js` | PASS `68/68`；R1–R3 paid staging、regular invalidation、generated eligibility、preflight/execution 与直接 content regressions 通过。 |
| `node --test --test-concurrency=1 tests/renderer-history-editor-flow.test.js` | PASS `5/5`；dirty editor 仍阻止 admission，文章管理独立行为不回归。 |
| `node --test --test-concurrency=1 tests/renderer-confirmation-host.test.js tests/architecture-seams.test.js tests/renderer-resource-library-api.test.js` | PASS `7/7`；confirmation、dependency seam、ResourceLibrary contract 通过。 |
| `node --check tests/renderer-content-client-switch.test.js` | PASS。 |
| `npm --prefix media-workbench run typecheck:strict` | PASS。 |
| `npm --prefix media-workbench run build` | PASS；只有既有 Vite chunk-size advisory（bundle > 500 kB）。 |
| `git diff --check` | PASS；仅有既有 LF/CRLF normalization warnings。 |

派生 worktree 没有本地依赖；测试期间临时 junction 复用了 `F:\官媒投稿-refactor\auto—publish\node_modules` 与 `media-workbench\node_modules`，未执行 `npm install`，最终已删除 junction，并删除本次生成的 `media-workbench/dist`。F: 依赖目标保持存在。

## 未运行的 gate 与剩余风险

- 未运行完整 `npm test`、desktop/auth/main/preload/package/alpha smoke、production packaging、最终 clean integration gate；R4 合同要求本线程只做到 implementation → targeted tests → direct regressions → local self-audit → handoff。
- 未运行 R1–R4 combined bounded re-audit；应由主线程在最终 integration HEAD 上执行。
- 未执行任何真实登录、平台发布、供应商订单、付费、取消、生产数据库或外部资源写操作。
- touched files 的 file-wide `prettier --check` 仍报告既有 renderer 格式差异；本 R4 未做无关 bulk reformat。功能行为、strict typecheck、build 与 `git diff --check` 已通过。
- build 的 chunk-size advisory 保持原有风险，不属于 F-006 owner。

## Git 状态交接

implementation commit 后工作树只保留主线程预存的删除项与未跟踪 R1–R4 合同文档；它们未被暂存或修改。本 handoff 文档随后单独提交，主线程可分别 cherry-pick implementation 与 handoff，并在最终 integration HEAD 重跑 combined gate。
