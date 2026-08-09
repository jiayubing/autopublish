# M05-A Handoff — Renderer content, article-management, and generation evidence

## Result / Git

`COMPLETE`。Base HEAD：`91c0e25177a112086dbc23bd327d54768519f476`。Final implementation/evidence source state：`58592ff03a2c2bd95dc4c265e516c83f2ec395b4` (`maintenance: migrate M05-A renderer evidence`)。本 handoff/ledger 为该 source state 之上的 docs-only closure commit，不改变 production/test behavior。

## Scope / owner

仅治理 frozen M05-A owners：Renderer content workbench/content sources/article management/content generation/paid-media execution、generation feature 和 attention feature 及对应 tests/harness。未修改 production，未新增 test-only seam，未触碰 M05-B platform/media/publication projection、M05-C workspace/settings/shell、IPC/bridge、adapter、OperationalStore、M06 或真实外部操作。

## Migrated / retired / retained

- Migrated：generation selection/template/source 转为稳定 helper 输入→输出行为；attention 补跨客户 stale fencing；paid resolution 补真实 Renderer 窄视口及 visible/disabled/enabled action 行为。
- Retired：`article-attention-invalidation`、`generation-snapshot-order`、`renderer-content-read-model-seam`、`renderer-content-refresh-lifecycle` 4 个重复源码形状文件；混合文件仅删除 ledger 分配给 M05-A 的 rewrite declarations。
- Retained；ledger 冻结的 `RETAIN_BEHAVIOR`、file-heuristic-only behavior 和 `RETAIN_STATIC_GUARD` 均保留；没有删除故障注入、race 或 Renderer harness 诊断。

## Replacement / inventory evidence

- `DUP-03` 由 `phase-06-content-feature`、`phase-06-content-read-model`、`phase-06-content-workbench-feature`、`phase-08-content-renderer-feature-races` 的 public snapshot/query identity/race/failure matrix 替代。
- generation ordering 由 `phase-06-generation-feature`，attention revision/client fencing 由 `phase-06-attention-feature`，用户动作由 question/client-switch/generation-handoff/attention 四个 Renderer observable suites 替代。
- Before→after：268→264 files；1,818→1,748 declarations；file-level source candidates 61/405→58/333；assertion-level candidates 218→144；M05-A rewrite residual=0。After manifest=`3f5245d066ff20689c87adc4da95b89b7f540989f17277215810bc017c5b074e`，discovery=`819d22b01d326e2290483b936c0913ab483bcdb289e304c674c23d302f6cbe45`。

## Tests / gates

- M05-A ledger parallel owner regression + attention public feature：PASS，199/199。
- Renderer observable suites：question editor 7/7；content client switch 1/1；generation submission handoff 1/1；article attention/paid resolution 1/1。
- `npm run build:renderer`：PASS（`tsc --noEmit` + Vite production build）；仅有既有 bundle-size warning。
- inventory/discovery contract：PASS，8/8；`npm run test:discover`：PASS，264 files（247 JS / 17 MJS）；after inventory 可复现且 M05-A rewrite residual=0。
- changed-test Prettier check：PASS；`git diff --check`：PASS。未机械运行完整 `npm test`（M05-I final gate）。

## Audit / exceptions

Primary self-audit 与 bounded re-audit：PASS。检查 owner/scope、replacement mapping、stale/busy/error/finally、refresh/dispose、Renderer actions、frozen static guards 与 production absence；无 blocking finding，无 disposition 例外。为运行 gate 仅按现有 lockfile 安装了 ignored `node_modules`，未修改 lockfile/依赖版本。`npm audit` 报告现有依赖漏洞，属 M05-A 禁止的 dependency-upgrade 范围，未执行 `audit fix`。

## Next / do-not-touch

Next=`M05-B`，必须从本 docs-only closure commit 之后的新 clean HEAD 独立启动。不得以 M05-A 名义继续 platform/media/publication、workspace/settings/shell、IPC/store/adapter/static-gate/runner 或 M06；本任务在 clean HEAD 后结束，不启动 M05-B。
