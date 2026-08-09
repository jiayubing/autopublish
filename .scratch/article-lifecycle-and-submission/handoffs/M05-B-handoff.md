# M05-B Handoff — Renderer publication, platform, and media evidence

## Result / Git

`COMPLETE`。Base HEAD：`163aa5abdc4fc6f2ef56a838e66e4e62a0d0d908`。Final implementation/evidence source state：`a49fe1a93d08d0b46098dd313f68de0cce28f413`（`test: migrate M05-B renderer evidence`）。本 handoff/ledger 为该 source state 之上的 docs-only closure commit，不改变 production/test behavior；最终 clean docs HEAD 由本文件所在 commit 与最终交接共同确认。

## Scope / owner

仅治理 frozen M05-B owners：Renderer platform feature/event router/context、media feature/order-list projection、publication presentation/read models 及其 tests/harness。未修改 production，未新增 test-only seam，未触碰 M05-A paid-media execution command state、M05-C workspace/settings/shell、IPC/bridge、adapter、OperationalStore、M06 或真实外部操作。

## Migrated / retired / retained

- Migrated：publication uncertain/read-model 源码断言改为实际 SSR presentation；media resource/order actions 改为 public feature/read-model + presentation；queue refresh/account confirmation/controller seam 改为 controller public snapshot 与真实 Renderer lifecycle。
- Retired：`media-workbench-flow`、`renderer-account-profile-selector`、`renderer-platform-queue-refresh`、`renderer-workbench-controller-seams` 四个纯 rewrite 文件；混合文件只删除 M05-B rewrite declarations。
- Retained：ledger 冻结的 `RETAIN_BEHAVIOR`、file-heuristic-only behavior、dynamic matrix 与 unproven duplicate 均保留。四条合法 static guard `T-356925768c`（security）、`T-1662609838`（security）、`T-31f1e3b32e`（retired capability/legacy absence）、`T-030a8da1bd`（architecture/capability absence）原样保留。

## Replacement mapping

- `T-bc4e42fd0b`、`T-41a1fb4749`：`platform-submission-controller` 的 queue identity/terminal revision/state subscription，以及 `renderer-platform-queue-refresh-lifecycle` 的显式刷新与 runtime-switch stale-event 行为。
- `T-819d11aff2`、`T-b597e7cd4b`：`platform-submission-controller` 的 account query/confirmation、busy settlement 与 safe command error public snapshot。
- `T-0cb0711e1d`：`renderer-publication-history` 的 status/read-model 与实际 SSR 输出，验证 target evidence、uncertain 无直接重试、busy 时两个 resolution actions disabled。
- `T-1c6a711cb5`、`T-beaf11449c`：`phase-06-media-feature` 的 bounded resource query/order command snapshot、`order-list-projection` 的 durable sorting/filtering，以及 resource/order presentation 输出。
- `T-c3a39f5204`、`T-9fc4cfd8e0`：`phase-06-media-feature` 的完整 snapshot/named command lifecycle、stale anomaly preparation 清理与重新准备；presentation 验证“重新核对可用证据”动作可见。
- `T-3300681cc9`：media feature 的 article/resource selection snapshot 与 ResourceLibrary presentation。
- `T-2eb989d245`：`phase-03-media-order-projection` 的 canonical supplier observation 行为，证明 downstream 只消费 canonical facts。
- `DUP-08`：仅收敛 account/queue/publication/media read-model assertions；workspace/settings/shell/confirmation 仍归 M05-C，未共同拥有 invariant。

## Inventory / discovery evidence

- Before→after：264→260 files；1,748→1,740 declarations；file-level source candidates 58/333→54/321；assertion-level candidates 144→133；M05-B declarations 86→78；M05-B rewrite residual=0。
- After manifest：`7a75ded708ec3fbfebf257f901274083c397c73b3260c61675814225a923eb61`；discovery：`5ff5ce7094da79bf55002763a9fee7c2c8e5bfa4fe9a949c21b2915a1e00483d`。
- Discovery/inventory contract：8/8 PASS；`npm run test:discover` PASS，260 files（243 JS / 17 MJS）。

## Tests / gates

- Direct feature/controller/presentation matrix：28/28 PASS。
- M05-B owner regression：59/59 PASS（platform account/run、media feature/capacity、queue/controller、publication/order projection、residue harness、legacy/capability absence）。
- 真实 Renderer queue lifecycle：2/2 PASS（初始单次加载、显式刷新、workspace 切换后迟到事件隔离）。
- Frozen static/capability guards：4/4 PASS。
- `npm run build:renderer`：PASS（Renderer `tsc --noEmit` + Vite production build）；仅有既有 bundle-size warning。
- changed-test Prettier、`git diff --check`：PASS。
- 未运行完整 `npm test`：本包无 production/contract/schema 变化，合同将完整 final gate 留给 M05-I；定向 owner、真实 Renderer、typecheck/build、inventory/discovery 已覆盖本次真实影响。

## Audit / exceptions

Primary self-review：PASS。检查 frozen scope、11 条 replacement mapping、queue/stale/terminal/account/uncertain/media actions、四条合法 static guard、DUP-08 owner split 与 production absence；无 blocking finding。Bounded re-check 仅复核 docs/evidence diff、最终受影响 tests/gates、rewrite residual 与 clean HEAD；无 escalation。

为运行 gate 按现有 lockfile 安装了 ignored root/Renderer `node_modules`，未修改 lockfile/依赖版本。`npm audit` 报告现有依赖漏洞，属 dependency-upgrade/M05-B 禁止范围，未执行 `audit fix`。

## Next / do-not-touch

Next=`M05-C`，必须从本 docs-only closure commit 之后的新 clean HEAD 独立启动。不得以 M05-B 名义继续 workspace/settings/shell、IPC/store/adapter/static-gate/runner、M06 或任何 production 修改；本任务在 clean HEAD 后结束，不启动 M05-C。
