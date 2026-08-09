# M05-C Handoff — Renderer workspace, settings, shell, and shared UI evidence

## Result / Git

`COMPLETE`。Base HEAD：`e09524ed52b315d90307feca5bdd01d2408bf37b`。Final implementation/evidence source state：`af6356e260e9f8ea0c8c9079ecc9b700cabfb747`（`test: migrate M05-C renderer evidence`）。本 handoff/ledger 为该 source state 之上的 docs-only closure commit，不改变 production/test behavior；最终 clean docs HEAD 由本文件所在 commit 与最终交接共同确认。

## Scope / owner

仅治理 frozen M05-C owners：Renderer workspace feature/coordinator/bootstrap/diagnostics，settings feature/context 及 AI/media/Hepan provider settings 展示，application shell、confirmation host、navigation/responsive layout、time/encoding/accessibility utility 与对应 test harness。未修改 production，未新增 test-only seam，未触碰 M05-A/B business owner、IPC/bridge contract、provider adapter/runtime、Electron security/packaging gate、M05-D/M06 或真实外部操作。

## Migrated / retired / retained

- Migrated：workspace initial refresh/runtime lifecycle 改为 public coordinator/feature/integration behavior；settings named command/status 改为 public feature matrix + 真实 Renderer 交互；AI URL/time utility 直接执行公开 export；confirmation 改为真实 FIFO/focus/abort/workspace-scope/dialog behavior。
- Retired：`batch-workspace-scan`、`phase-06-article-editor-confirmation`、`renderer-content-confirmation-flow`、`renderer-workspace-contract`、`workspace-data-invalidation` 五个重复源码/模块形状文件；混合文件只删除 M05-C 源码业务断言。
- Retained：workspace bootstrap/store/runtime failure/recovery、provider settings/security、diagnostic bounds/cleanup 等可诊断 public behavior 原样保留。`T-67af0d4657`、`T-962647d3c1`、`T-c0b53000b4`、`T-be1ac3dabf`、`T-98276db88f` 五条合法 static guard 按 ledger 的 security / architecture / retired-capability 分类保留；Renderer encoding 扫描仅作窄编码质量 gate。

## Replacement mapping

- `T-4c470edd09`：`adapter-workspace-injection` 的 injected workspace public scan + workspace feature/runtime integration；退役 env/module-cache wrapper。
- `T-1a8f0a74f2`、`T-ca83e903a9`（base inventory 中当前稳定 ID 为 `T-c06d320970`、`T-c3a39f5204`）：`phase-06-workspace-coordinator` 对 `articleAttention` / `orders` 每次注册一次 initial refresh，并验证 invalidation 路由。
- `T-0223becd5a`、`T-0602260c46`：`phase-06-settings-feature` 的 named API/command-owner、overlap/failure/stale matrix；`renderer-responsive-layout` 的真实 AI validation、runtime/storage/nav presentation。
- `T-7e66333daf`：M05-A 已在共享 `renderer-batch-generation` 改写中移除该旧声明；替代 evidence 为真实 content dialog/selection/output behavior，M05-C 未再改 M05-A owner。
- `T-9c3817d9d4`、`T-4c75bcb80e`、`T-591b10e886`：`renderer-confirmation-host-behavior`、`renderer-content-client-switch`、`renderer-history-editor-flow` 的 FIFO、exactly-once settlement、abort/unmount/workspace cancellation、Tab/Escape/focus restore 与真实 destructive-action dialog。
- `T-dc47bff3d3`、`T-258713f9f3`、`T-91bf35e103`：settings feature command/error snapshot + 真实 Renderer AI/runtime/storage/nav/layout；active cleanup 可见 disabled。
- `T-da1c1d9c70`、`T-ee92145e2c`：`renderer-time-format` 直接执行 public formatter 的 UTC/legacy/invalid 矩阵；order presentation 已由 M05-B SSR 证据保护，bridge contract 保留给 M05-D。
- `T-2e40789162`、`T-1a318d9cd5`：`platform-submission-controller` 的 query identity/stale fencing 与 `renderer-platform-queue-refresh-lifecycle` 的真实 initial/manual/runtime-switch behavior。
- `T-8bfe49f38f`、`T-c7c7672854`、`T-190c7fdb78`、`T-81a31db889`、`T-4d1e15b170`：`workspace-runtime-lifecycle` 保留原 public integration/failure/cleanup assertions，将 production module path 加载移到 fixture setup，不再用声明内实现路径当作业务证据。
- 重复 `phase-06-article-editor-confirmation`、`renderer-workspace-contract`、`renderer-ai-provider-settings` source rows 分别由真实 editor/confirmation suites、workspace feature + UI logic/bootstrap state、settings feature + 真实 settings page/public validator 替代。`DUP-08` 的 C 侧 workspace/settings/shell/confirmation 已收敛，未重新拥有 B 侧 invariant。

## Inventory / discovery evidence

- Before→after：260→255 files；1,740→1,708 declarations；file-level source candidates 54/321→46/267；assertion-level candidates 133→113；M05-C declarations 191→159；M05-C rewrite residual=0。
- After manifest：`b670d1a2d230890cfd6d73d8552f29e5c43f796d425a6637efa8ff440c1ff496`；discovery：`1f480cecd797c7f48a9a0583f628eb0c58a3882c9c1ac087cdec73e62bd1affc`。
- Discovery/inventory contract：8/8 PASS；`npm run test:discover` PASS，255 files（238 JS / 17 MJS）。

## Tests / gates

- M05-C owner regression：167/167 PASS（workspace feature/coordinator/bootstrap/runtime，settings/provider/config，diagnostics，confirmation，time/encoding）。
- Replacement-specific matrix：33/33 PASS（injected workspace、Hepan patch、platform query identity/manual refresh、真实 content/editor confirmation）。
- 真实 Renderer observable suites + Electron focus：22/22 PASS（settings/nav/layout、AI validation、runtime/storage disabled state、confirmation FIFO/focus、content/editor dialogs、queue runtime switch，以及显式 `RUN_ELECTRON_FOCUS_TESTS=1` 的 Hepan save/test/clear）。
- Frozen static guards：5/5 PASS；Renderer encoding/accessibility 可观测 gate PASS。
- `npm run build:renderer`：PASS（Renderer `tsc --noEmit` + Vite production build）；仅有既有 bundle-size warning。
- changed-test Prettier（新写/改写格式文件）、`git diff --check`：PASS。`workspace-runtime-lifecycle` 保留原文件格式以避免无关全文格式化。
- 未运行完整 `npm test`：本包无 production/contract/schema 变化，合同将完整 final gate 留给 M05-I；定向 owner、真实 Renderer/Electron、typecheck/build、inventory/discovery 已覆盖本次影响。

## Audit / exceptions

Primary self-review：PASS。检查 frozen scope、21 条 ledger rewrite mapping（其中 `T-7e66333daf` 已在 M05-A 共享文件 delta 中退役）、bootstrap invalid/error/disabled、workspace query/command/runtime cleanup、settings save/test/error/busy、confirmation FIFO/focus/cancel、diagnostic safety、nav/layout/time 与 5 条合法 static guard；无 blocking finding。Bounded re-check 仅复核最终 test diff、replacement suites、inventory residual、production absence 与 docs/evidence；无 escalation。

为运行 gate 按现有 lockfile 安装了 ignored root/Renderer `node_modules`，未修改 lockfile/依赖版本。`npm audit` 报告既有依赖漏洞，属 dependency-upgrade/M05-C 禁止范围，未执行 `audit fix`。

## Next / do-not-touch

Next=`M05-D`，必须从本 docs-only closure commit 之后的新 clean HEAD 独立启动。不得以 M05-C 名义继续 IPC/preload/bridge、content/platform/media owner、adapter/store/static packaging/runner、M06 或任何 production 修改；本任务在 clean HEAD 后结束，不启动 M05-D。
