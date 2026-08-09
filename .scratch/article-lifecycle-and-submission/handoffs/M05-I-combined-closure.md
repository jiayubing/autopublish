# M05-I combined audit / closure handoff

日期：2026-08-10

## 结论

- M05-I combined audit：`PASS`。
- M05 acceptance：`PASS_WITH_EXPLICIT_NON_M05_EXCEPTIONS`；M05 标记为 `COMPLETE`。
- 完整 `npm test` 的真实结果是 `FAILED`，不是 full gate PASS；失败已保留为 H 继承的两项 `EXPOSED_PREEXISTING` artifact/runtime exception，未被吞掉、跳过或改写为成功。
- M06 未启动；本任务未创建子代理或并行线程，未执行真实登录、投稿、付费、上传、打包或发布。

## Scope / provenance

- 审计基线严格为 M05-H Final clean HEAD：`c50f7d857f7453d8f189f8f9f8d5a99b8e86ace6`；启动时 HEAD 与工作树均已核对 clean，`base..HEAD` 无提交差异。
- 只读取并核对了根 `AGENTS.md`、Wave Plan、`EXECUTION-PROTOCOL.md`、`AUDIT-PROTOCOL.md`、M05 maintenance contract、M05-0 authoritative ledger、M05-0/A/B/C/D/E1/E2/E3/F/G/H handoff、`M05-H-evidence.json` 与最终 runner profile/log。
- 未重做全仓初始分类，未重新设计 package/owner，未进入 M06。最终 remediation commit 为 `12ee4bfa5ba7659703150d83b35a70866aedb197`，只修改 runner 计数与其回归测试。

## Combined audit result

### 1. Discovery / before-after inventory

- `npm run test:discover`：`PASS`，248 files = 231 `.test.js` + 17 `.test.mjs`。
- Discovery digest：`4703caa064cbd3036cb97eba0f66ff4efcc7451fc645f366843850454ab4822f`；pool digest：`dab08bf8f6b7e063030751ff3d5ed49e5de36936ea4a2830e0af0a8b430da428`；parallel=210、serial=38；每个 discovered file 恰好一个 pool。
- M05-G before：248 files、1,687 declarations、manifest=`92f42b0fa74c5c2fbe5cc5baa9dc1dda186ea62e48951ff208dc0c738a921c9d`。
- M05-H source state 的真实 after：248 files、1,691 declarations、manifest=`9b51cb6bef527e7636283204265557db94c9bc69b4214048ab3edf38c3f5e533`。H 原 handoff 记录的 `29dfa8ca...` 未能在 c50 source state 重现，已作为 `PROCESS_EVIDENCE_GAP` 更正到 H evidence、H handoff 与 authoritative ledger。
- M05-I remediation 后最终 inventory：248 files、1,692 declarations，manifest=`58de55cbec54a83ce839dcbcdb25240276cc32b1779cd11bed900658dc08f84d`。
- 当前 before/after reconciliation：`PASSED`；added files=0、removed files=0、pool mismatches=0、disposition mismatches=0、unexpected new declarations=0、removed declarations=0、missing after disposition=0、`uniquePools=true`。新增 5 条 declaration 全部是 M05-H discovery/inventory contract rows（其中 1 条是本次 skip 回归）。

### 2. A–F behavior evidence / replacement mapping

- 已逐项复核 M05-A/B/C/D/E1/E2/E3/F handoff 与 M05-0 ledger 的 owner、invariant、replacement/retention mapping；各包的 `REWRITE_PUBLIC_BEHAVIOR` residual 均为 `0`，最终 ledger 中 missing replacement/retention=0。
- A/B/C 的内容、生成、attention、platform/publication/media、workspace/settings/shell 结论由 public feature、Renderer harness、可观察 action/state 结果证明；D 的 capability/typed IPC 结论由 public contract、caller/registrar/bridge behavior 与 capability gate 证明；E1/E2/E3 的 lifecycle、持久化、fault、uncertain、并发、restart/recovery 结论由 public facade、直接调用链、真实 SQLite/状态矩阵与故障注入证明；F 的 adapter/publisher、credential cleanup、success/failure/uncertain/evidence binding 结论由 public contract、fault/recovery 与 observable result 证明。
- 删除或改写的每一条 declaration 都在 authoritative ledger 与对应 handoff 具有 replacement mapping；没有使用 private function name、源码 regex 或 implementation line-shape 作为业务行为替代证据。

### 3. Static guard boundary

- 最终 inventory：1,469 `RETAIN_BEHAVIOR`、128 `RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION`、12 `RETAIN_DYNAMIC_MATRIX`、83 `RETAIN_STATIC_GUARD`，`REWRITE_PUBLIC_BEHAVIOR=0`。
- M05-G=259：179 behavior、34 file heuristic、46 static；G 没有业务 static residual，46 条 static 均保留为合法 architecture/dependency、security、retired-capability/legacy-absence 或 packaging/release/CI/discovery guard。
- 全部 83 static declaration 的 category signal 只落在允许集合：security=38、architecture/dependency=19、retired-capability/legacy-absence=18、packaging/release/CI=34（多 category signal 可能命中同一 declaration）；非法类别=0。每条 guard 均绑定 owner、目标边界、失败含义及 replacement/absence reason。

### 4. Runner / process lifecycle

- `run-tests.js` 的 group barrier 继续等待 test stream `close`、reporter sink `finish` 与一个 event-loop turn 后才生成最终 summary/profile；summary 之后无已知 runner/worker 残留。
- H 原 runner 的 blocking finding：top-level suite `describe.skip` 只在 reporter 输出中出现 `# SKIP`，旧计数为零并可能返回成功，违反 skip fail-closed 合同。该 finding 分类为 `P1 / INTRODUCED_BY_CHANGE`。
- 最小修复：在 legacy/programmatic output 合并 reporter `# SKIP`/`# TODO`/`# CANCELLED` marker，并让 `noSkippedTodo` 同时要求 skipped/cancelled/todo 全为零；增加真实 CLI 回归测试。bounded re-audit：`tests/test-discovery-contract.test.js` 8/8 PASS；skip-only probe 返回 exit=1、profile skipped=1、`noSkippedTodo=false`。
- 最终 full runner profile 显示 `lifecycle=CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`、0 skipped/todo/cancelled；runner 如实以非零返回暴露两个业务/环境失败。

### 5. Owner / scope / production diff

- 从 c50 到 remediation 的 working/committed diff 只有 `auto—publish/scripts/run-tests.js` 与 `auto—publish/tests/test-discovery-contract.test.js`；没有 `desktop/`、`src/`、`media-workbench/src/` 或 `auth-server/` production behavior diff。
- 没有新增 test-only production seam、旁路状态 owner、第二套 lifecycle、兼容 shim 或生产 flag；没有改动 A–H frozen owner、schema、runner concurrency/timeout policy 或真实 artifact 业务。
- closure 文档只更新 H provenance、authoritative ledger、maintenance status、Wave Plan 与本 handoff；未借 closure 扩大 cleanup 或重分类。

## Findings / disposition

### F1 — stale H manifest (`PROCESS_EVIDENCE_GAP`)

H handoff/evidence 宣称 after manifest=`29dfa8ca...`。在 H source state c50 上重建得到 after manifest=`9b51cb6b...`，文件集合、pool、声明数均与 H 叙述相符，故这是 provenance stale，不是生产或测试行为回归。已修订 `M05-H-evidence.json`、`M05-H-handoff.md` 与 authoritative ledger，并记录两种 digest，不再让 stale 值冒充最终证据。已关闭。

### F2 — top-level suite skip fail-open (`P1 / INTRODUCED_BY_CHANGE`)

旧 runner 对 `describe.skip` 的 reporter marker 未计数，skip-only file 可出现 exit=0、skipped=0、noSkippedTodo=true。修复已进入 `12ee4bfa...`；新增回归测试证明真实 CLI 返回非零并记录 skipped=1。bounded re-audit 已通过，已关闭。

## H inherited artifact/runtime exceptions

完整 runner 的两个失败明确归因如下，均不通过修改 production 或真实 artifact 处理：

1. `tests/alpha-smoke-verifier.test.js`：`PLAYWRIGHT_NODE_UNAVAILABLE: Bundled Playwright Node is unavailable`。缺少已构建的 bundled runtime package；未授权真实 pack/build。Disposition：`EXPOSED_PREEXISTING`，非 M05 owner。
2. `tests/phase-06-capability-specific-inventory.test.js`：`release-alpha/win-unpacked/resources/app.asar` 不存在。H/M05-I 不构建或伪造真实 alpha artifact。Disposition：`EXPOSED_PREEXISTING`，非 M05 owner。

两项 exception 使完整 `npm test` 保持 FAILED，但不影响 M05 自有 discovery、inventory、static、runner lifecycle、scope 或 bounded re-audit acceptance；因此 M05 acceptance 采用显式 exception 结论，绝不把完整 runner 写成 PASS。

## Final verification

以下均在当前 remediation source 上实际运行；未运行的命令没有计为 PASS：

| Command / evidence | Result |
| --- | --- |
| `npm run test:discover` | PASS；248 files，231 JS / 17 MJS |
| `npm run test:discover:evidence` | PASS；discovery/pool digest 与 unique pool PASS |
| `node scripts/test-inventory.js --output <temp>` | PASS；248 files / 1,692 declarations / manifest `58de55cb...` |
| `node scripts/create-test-inventory-evidence.js --before <M05-G snapshot> --output <temp>` | PASS；逐文件、逐 declaration reconciliation PASS |
| `node --test --test-concurrency=1 tests/test-discovery-contract.test.js` | PASS；8/8 |
| `npm run typecheck:main` / `typecheck:bridge` / `typecheck:renderer` | PASS |
| `npm run build:renderer` | PASS；仅有既有 chunk-size warning |
| `npm run test:production-ipc-matrix` | PASS；33/33 |
| `npm run test:packaging` | PASS；52/52 |
| `npm run test:legacy-absence` | PASS；sourceMatches=0 |
| `npm run test:ticket-24-e` | PASS；forbidden/source matches=0 |
| `npm run test:phase-08:gates` | PASS；4/4 |
| `npm run lint` / `npm run format:check` / `git diff --check` | PASS |
| Electron focus regression（显式 `RUN_ELECTRON_FOCUS_TESTS=1`） | PASS；1/1 |
| 完整 `npm test -- --profile-output <temp>` | **FAILED（真实结果）**；1804 tests，1802 pass、2 fail、0 skipped/todo/cancelled；profile=`C:\Users\violet\AppData\Local\Temp\m05-i-full-profile-final-0897f93f3f2f46548c8f9b365f7082a8.json`，log=`C:\Users\violet\AppData\Local\Temp\m05-i-full-run-final-9f6aee7d86c84dca863cff066f6e7f7a.log` |

Full runner 完成后已核对没有匹配的 M05 runner/worker 残留进程。root 与 `media-workbench` 依赖通过各自 lockfile 的 `npm ci --ignore-scripts` 准备，未产生 tracked lockfile diff；npm audit 的既有漏洞未在 M05-I 扩大处理。

## Final Git / handoff

- remediation commit：`12ee4bfa5ba7659703150d83b35a70866aedb197`。
- 最终 closure 文档、H evidence correction、ledger 与 Wave Plan 已包含在本次 docs closure commit；最终 clean HEAD 以 `git rev-parse HEAD`、`git status --porcelain` 和 `git diff --check` 复核。
- 本 handoff 是 M05-I 唯一 closure evidence；M06 保持未启动。
