# M05-F handoff — external adapter and browser/session runtime evidence

## 状态

- 结果：`COMPLETE`。
- Base integration HEAD：`52835a796e1eab41439969f8323fedb931ef6726`（M05-E3 Final clean HEAD，启动前已核对 clean）。
- Final：本 handoff 随本次 implementation/evidence closure commit 提交；commit 后用真实 `git rev-parse HEAD` 与 `git status --porcelain` 验证 clean，最终 hash 以提交后的 Git evidence 为准。
- 下一项：`M05-G`。
- 本任务未启动 M05-G 或任何后续包；未创建子代理/并行线程。

## 范围与 owner

本包只处理 regular platform、Hepan、Doubao browser/media adapter 与 worker/runtime 的测试 evidence：输入到 typed outcome、remote evidence binding、failure/uncertain 分类、browser/session runtime 与 credential/payload cleanup。没有修改 production adapter、publisher contract、lifecycle freeze/retry/manual-resolution owner、Renderer/IPC/store/static packaging、runner policy 或真实外部操作。

## Migrated / retired / retained

### Migrated / closed residual

M05-0 ledger 中 3 条 F `REWRITE_PUBLIC_BEHAVIOR` residual 全部关闭，未删除对应行为声明：

| Ledger row | Final declaration | Replacement evidence |
| --- | --- | --- |
| `T-81ad439b2a` — `tests/phase-04-browser-evidence.test.js:8` | `T-b0499a4523` — `:62` | synthetic Playwright transport 驱动 Toutiao/Lieju public `preparePlatformSubmission`；验证 prepared target/attempt binding，提交无法绑定远端身份时返回 typed `{ status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" }`。 |
| `T-cde8b2edd3` — `tests/phase-08-feature-development-admission.test.mjs:111` | `T-67dc99b937` — `:104` | fake Publisher registry 通过 public publication workflow 与 OperationalStore projection 验证调用隔离、精确 account target binding、持久 `uncertain` attempt，且没有 remote identity。 |
| `T-412188bf3a` — `tests/regular-platform-adapter-outcomes.test.js:62` | `T-74625c5ce3` — `:63` | 保留 Hepan public accepted outcome / safe remote identity contract；adapter 装配移出 test declaration，消除 inventory 的 assertion-level production-path heuristic。 |

### Retired / retained

- F residual 没有需要退休的行为声明；总计 260 个 F declarations 保持完整，3 条 residual 改写为 public behavior 后仍计入 owner regression。
- `T-3f3d155aad`、`T-7031adc8c8` 的 workspace/config isolation 是窄 security static guard，保留。
- `T-4b25588054`、`T-04b418f288`、`T-16c044feee` 的 retired-capability/legacy-absence behavior 保留；F 没有借替换删除合法 absence 或 security evidence。
- regular/Hepan/Doubao/media 的 dynamic outcome、parser、fake transport、session lifecycle、worker envelope、credential/payload cleanup 与 uncertain/no-retry safety matrix 保留。

## Inventory / replacement gate

- Final inventory：254 files（237 JS / 17 MJS）、1,708 declarations；M05-F=`260`。
- Command：`node scripts/test-inventory.js --output $env:TEMP\m05-f-final-inventory.md`。
- Final manifest digest：`09475f16b3a7713cd2a42a434623152f6716ccd90063bab97ba91acd2fd11057`。
- Discovery path digest：`9470ff0afa48f3818ed8456f07be67d71365f02671b3c2a3e0dedfea951d63ef`。
- M05-F `REWRITE_PUBLIC_BEHAVIOR` residual：`0`；全局剩余 4 条均属于 M05-G，未触碰。
- `npm run test:discover`：254 files。
- `node --test --test-concurrency=1 tests/test-inventory-contract.test.js tests/test-discovery-contract.test.js`：8/8 passed。

## Gates / evidence

- Affected：`node --test --test-concurrency=1 tests/phase-04-browser-evidence.test.js tests/phase-08-feature-development-admission.test.mjs tests/regular-platform-adapter-outcomes.test.js`：7/7 passed。
- Complete F owner regression：ledger manifest 的 35 个 M05-F files，`node --test --test-concurrency=1 ...`：275/275 passed，19 suites，0 failed，最终一次 duration `126716.9061ms`。
- `npm run typecheck:main`：passed。
- `npx prettier --check --end-of-line auto tests/phase-04-browser-evidence.test.js tests/phase-08-feature-development-admission.test.mjs tests/regular-platform-adapter-outcomes.test.js`：passed。
- `git diff --check`：passed。
- 所有测试只使用 synthetic data、temporary directories、fake transport/browser/session、synthetic Python/runtime；没有真实登录、投稿、付费、取消、上传、生产数据库或第三方写操作。

## Primary review / bounded re-check

Primary review scope 限于当前 3 个测试文件 diff、M05-0 F rows、E3/F boundary、adapter public contract、remote evidence binding、failure/uncertain、credential cleanup 与直接 F owner regression。检查结论：没有遗留 P0/P1/P2/P3 actionable finding；没有 production change、test-only production seam、断言弱化、lifecycle 状态机复制、自动重试或真实远端副作用。

审查中关闭一个 `P2 / PROCESS_EVIDENCE_GAP`：admission replacement 初版只验证 fake platform target key 前缀，未精确验证本次 account profile binding；修复为与 `profile.accountProfileId` 的完整 public target key 相等。Bounded re-check 只覆盖该修复 diff、account/evidence binding、affected 7-test regression、完整 275-test F matrix、inventory/discovery、main typecheck、format 与 diff gate，全部 PASS；未触发 escalation。

## Exceptions / environment

- 初始 worktree 缺少 `node_modules`；执行 `npm ci --ignore-scripts` 后验证。npm 报告 5 个依赖漏洞（1 moderate、4 high），未执行 `npm audit fix`，不属于 M05-F test-evidence scope。
- 一次 120 秒外层命令预算在完整 F 测试已报告 275/275 PASS 后返回 124；该次不计作 gate PASS。保持测试命令与内部 timeout 不变，以 240 秒外层预算重跑并正常退出，最终 evidence 采用后者。
- 未运行完整 `npm test`、Renderer/bridge typecheck、build/package、M05-G/H/I gate；这些不属于 F，且按停止条件不得启动后续包。

## Do-not-touch / next

下一且唯一后续项是 `M05-G`。后续不要回头修改 E3 submission/publication/queue/outcome owner、OperationalStore、production adapter/browser runtime、Renderer/IPC/store/static tests，或启动 M05-H/I、M06、真实外部操作；任何 scope 变化必须先按 Audit Protocol 修订 authoritative ledger/合同。
