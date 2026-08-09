# M05-H handoff — runner/discovery/process cleanup/after inventory evidence

## 状态与 Git

- 结果：`COMPLETE`（H scope/gates；完整根测试的两个既有 artifact/runtime failure 保留为 exception，未被 runner 吞掉）。
- Base：`76416590c9015218f19287e50145da95f10f1029`，启动时已核对 HEAD 与工作树 clean。
- Final：`c50f7d857f7453d8f189f8f9f8d5a99b8e86ace6`（M05-H implementation/evidence source state）。
- Next：`M05-I`。本任务未启动 I/M06、未创建子代理或并行线程。

## 范围与实现

只修改 H 合同允许的 runner、runner policy、discovery/evidence/inventory tooling、相关测试与纯测试资源 cleanup；未修改 production、业务断言、A–G owner、timeout、并发上限或真实外部操作。

- `run-tests.js`：hybrid group 只有在 Node test stream `close` 与 reporter `finish` 均完成，并 drain 一个 event-loop turn 后才生成结果/profile/最终 summary；summary 缺失、文件未报告、failed/skipped/cancelled/todo 均 fail-closed。
- `test-runner-policy.js`：显式校验每个 discovered file 恰好属于 `parallel` 或 `serial`，分区总数与 discovery 集合一致；并发仍限制在既有 `1..4`。
- `create-test-discovery-evidence.js`：记录 JS/MJS 文件集合、pool assignment、pool digest 与唯一分配结论。
- `test-inventory.js` / `create-test-inventory-evidence.js`：提供 machine-readable snapshot/reconciliation；逐文件核对新增/删除/pool，逐 declaration 核对 name/package/disposition，fail-closed 报告 removed/mismatched/unexpected-new declaration。
- `phase-04-platform-run.test.js`：为“durable result pending”情形注入已有 watchdog timer seam，清理纯测试资源；不改变业务断言。该回归从真实 60 秒 watchdog 残留降为约 0.06 秒完成。

## Final discovery / after inventory

机器 evidence：[`M05-H-evidence.json`](./M05-H-evidence.json)。

- Discovery：248 files = 231 `.test.js` + 17 `.test.mjs`；discovery digest=`4703caa064cbd3036cb97eba0f66ff4efcc7451fc645f366843850454ab4822f`。
- Pool：parallel=210、serial=38；pool digest=`dab08bf8f6b7e063030751ff3d5ed49e5de36936ea4a2830e0af0a8b430da428`；每文件恰好一个 pool。
- Before（M05-G final）：248 files、1,687 declarations，manifest=`92f42b0fa74c5c2fbe5cc5baa9dc1dda186ea62e48951ff208dc0c738a921c9d`。
- After：248 files、1,691 declarations，实际可复现 manifest=`9b51cb6bef527e7636283204265557db94c9bc69b4214048ab3edf38c3f5e533`。原 handoff 中的 `29dfa8ca...` 为 stale digest，已由 M05-I 复核并在 `M05-H-evidence.json` / authoritative ledger 中更正。
- 对账：added files=0、removed files=0、pool mismatches=0、disposition mismatches=0、unexpected new declarations=0、removed declarations=0。新增 4 条 declaration 均为 `M05-H`，无业务 static rewrite。

## Runner evidence / gates

实际运行：

- `node --test tests/test-discovery-contract.test.js`：7/7 PASS。
- `node --test tests/test-inventory-contract.test.js`：5/5 PASS。
- `node --test tests/phase-04-platform-run.test.js`：8/8 PASS；无 60 秒 timer 残留。
- `node --test tests/renderer-harness-lock.test.js`：1/1 PASS。
- `node --test tests/phase-08-cleanup-gates.test.js`：4/4 PASS（补齐 renderer lockfile 依赖后）。
- `node --test tests/release-evidence.test.js`：9/9 PASS。
- `npm run test:discover`：248 files，JS/MJS 均发现。
- `node scripts/test-inventory.js --output <temp>`：248 files、1,691 declarations，实际可复现 manifest=`9b51cb6b...`；原始记录的 `29dfa8ca...` 已由 M05-I 标为 stale provenance。
- `node scripts/create-test-discovery-evidence.js --output <temp>`：PASSED，pool 唯一性 PASS。
- `node scripts/create-test-inventory-evidence.js --before <M05-G snapshot> --output <temp>`：PASSED，逐项 before/after 对账 PASS。
- 小型 hybrid/serial parity probe（phase-04 + discovery + inventory 三文件）：两模式均 20/20 PASS，counts 相等；两者 `CLOSED`、all files reported、无 skip/todo。
- `npm run format:check`：PASS；`git diff --check`：PASS。

Final-file-set profile `npm test -- --profile-output <temp>`：

- 248 files；1,802 tests，1,800 passed、2 failed、0 skipped、0 cancelled、0 todo。
- parallel：210 files，1,536/1,536，`stream-closed`，unreported=0。
- serial：38 files，264/266，`stream-closed`，unreported=0。
- runner evidence：`lifecycle=CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`；runner 返回非零，未隐藏 worker/test failure。

## Primary review / bounded re-check

Primary review 只检查 H diff、直接 runner/discovery/inventory/evidence 调用链、测试资源 cleanup 与 H gate。发现并修复 1 个 `P2 / INTRODUCED_BY_CHANGE`：file event 缺少 `details` 时 runner 的 file-suite 判定可能抛异常；同时让 reporter sink error fail-closed 解除等待。该修复未改变执行策略或业务语义。

Bounded re-check 只覆盖该修复、stream close/reporter barrier、pool/discovery、after reconciliation、phase-04 cleanup、format/diff gate；全部 PASS，未触发公开合同/schema/owner/副作用 escalation。

## Exceptions / environment

- 完整根 runner 的两个失败为既有环境/artifact 前置，不属于 H：`tests/alpha-smoke-verifier.test.js` 缺少 bundled Playwright Node；`tests/phase-06-capability-specific-inventory.test.js` 缺少 `release-alpha/.../app.asar`。没有执行真实 pack/build 来伪造它们，runner 如实返回失败。
- root 与 `media-workbench` 使用各自 lockfile 执行 `npm ci --ignore-scripts`；npm audit 报告 root 5 个既有漏洞、Renderer 2 个 high，未升级依赖。
- 未运行 auth-server 业务测试、完整 `npm test` 以外的 M05-I combined closure、M06、真实登录/投稿/付费/上传/打包/发布；这些不属于 H。

## Next / do-not-touch

- Next：`M05-I` combined audit/closure；H 不启动 I。
- Do-not-touch：production、A–G behavior/static owner、业务断言与 schema、runner timeout/concurrency 上限、auth-server 业务测试、M06、Ticket 25、真实外部操作。

## M05-I reconciliation note

本节只记录 M05-I 对 H provenance 的校正与 bounded closure，不改变 H 的历史 scope。M05-I 在 H source state `c50f7d857f7453d8f189f8f9f8d5a99b8e86ace6` 重建 after inventory，确认 H 的真实 after digest 为 `9b51cb6b...`，不是原文记录的 `29dfa8c...`。随后仅修复一个 combined-audit blocking finding：runner 原先会把 top-level `describe.skip` 计为零 skip 并返回成功；`12ee4bfa5ba7659703150d83b35a70866aedb197` 增加 reporter marker fail-closed 计数及回归测试。修复后的最终 M05-I inventory 为 248 files / 1,692 declarations，manifest=`58de55cbec54a83ce839dcbcdb25240276cc32b1779cd11bed900658dc08f84d`；完整 closure 见 `M05-I-combined-closure.md`。
