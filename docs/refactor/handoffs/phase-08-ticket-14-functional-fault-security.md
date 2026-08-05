# Ticket 14 交接：功能、故障与安全最终验收

## 状态

- Ticket 14：`IN_PROGRESS`。源码功能、故障恢复、安全和 Electron boundary 自动矩阵通过；完整 root suite 仍有 4 个可归属的制品前置失败。
- Phase 8：保持 `IN_PROGRESS`；正式 release：保持 `BLOCKED_RELEASE`。
- 基线 HEAD：`fd47958bcac8296bb76b6c89a58c70e9aee87157`；本轮开始时工作树 clean，依赖和 build 输出均未进入 source diff。
- 执行环境：Windows / Node 24；依赖使用本机 npm cache 的 `--offline --ignore-scripts` 安装；测试网络关闭。
- 禁止边界已遵守：未访问真实 workspace、Auth 数据、账号、Cookie、供应商、投稿、同步、扣费或外部平台；没有执行真实删除、恢复、签名或安装器操作。

## 冻结的自动验收 manifest

机器可读摘要为 [`phase-08-ticket-14.json`](../phase-08-ticket-14.json)。schema version 为 `1`；manifest 与本交接文档需先进入 Git index，随后由接收者提交后才成为历史 canonical evidence。本工作树的验收记录会明确报告 `tracked/staged/committed` 状态。每个 suite 固定记录 `id/category/owner/status/tests/passed/failed/skipped/fixture/command/exitCode`，并公开 `sha256(id|tests|passed|failed|skipped|status)` 算法。`caseMatrix` 每项均有 `testBindings[{testFile,testName}]`、命令、owner、故障点、稳定 code、持久事实、重启结果、状态和 `evidenceHash` 或 `evidenceSuites[{id,summaryHash}]`；汇总数字不相加，避免同一 root suite 与专项 suite 被重复统计。

## 自动结果

| Suite | Owner | 结果 | 计数 | Fixture |
| --- | --- | --- | ---: | --- |
| root | root test runner | `1605 passed / 4 failed / 0 skipped` | 1609 | synthetic source + artifact-required assertions |
| Auth | AuthDomain/repository | `49/49` | 49 | isolated SQLite/in-memory |
| links/security | content path policy/stores | `184/184` | 184 | temporary symlink/junction/path fixtures |
| media transport | media transport boundary | `9/9` | 9 | fake HTTP/TLS/redirect/timeout |
| diagnostics | diagnostic/runtime resolver | `40/40` | 40 | temporary diagnostic roots/fake tools |
| architecture/Phase 8 gates | authoritative owners/gates | `74/74` and `3/3` | 77 | fake publisher, SQLite, lifecycle, package fixtures |
| Electron focus | main/preload/Renderer | `14/14` | 14 | temporary Electron app and bundled preload |
| packaging/release evidence | package/evidence contracts | `48/48` and `6/6` | 54 | temporary ASAR/metadata fixtures |

The root run completed with `134` suites and `1609` tests in about `392.8s`; it emitted no skip. The four failures are recorded one-for-one in the manifest: three tests fail their artifact existence assertion (`ASSERTION_FAILURE`, normalized owner category `ARCHIVE_MISSING`) and one runtime smoke test reports `PLAYWRIGHT_NODE_UNAVAILABLE`. All four are owned by the packaging/runtime artifact boundary and are `PENDING_ARTIFACT`, not product behavior passes or human gates.

## 逐 case traceability

The JSON `caseMatrix` is the canonical detailed ledger. This index makes the test-to-case mapping reviewable without relying on ignored build output; every binding uses the repository's actual `auto—publish/` path and exact test name. `evidenceSuites` lists every suite summary that supports a multi-suite case; a summary hash is not a claim that a raw log is versioned.

| Case | Test file / selector | Command | Owner | Result / hash |
| --- | --- | --- | --- | --- |
| functional content/generation queue | `auto—publish/tests/phase-03-content-publication-chain.test.js` — queue claim, account verification, expired claim | `node --test tests/phase-03-content-publication-chain.test.js` | ContentStore / GenerationBatch / submission | `PASSED` / `97c8f2c0…b3628` |
| functional fake publishers | `auto—publish/tests/phase-03-publication-workflow.test.js` — reserve/outcome/crash/recovery; `auto—publish/tests/phase-03-media-publication-workflow.test.js` — receipt/batch delegation | `node --test tests/phase-03-publication-workflow.test.js tests/phase-03-media-publication-workflow.test.js` | PublicationWorkflow / publisher registry | `PASSED` / `97c8f2c0…b3628` |
| functional account/resource target | `auto—publish/tests/phase-08-publication-submission-orchestration.test.js` — duplicate media; `auto—publish/tests/phase-03-operational-content-submission.test.js` — account-bound queue; `auto—publish/tests/phase-04-platform-account-projection.test.js` — durable profile mapping | `node --test tests/phase-08-publication-submission-orchestration.test.js tests/phase-03-operational-content-submission.test.js tests/phase-04-platform-account-projection.test.js` | target / submission aggregate | `PASSED` / `97c8f2c0…b3628` |
| functional handoff/order/trash | `auto—publish/tests/generation-submission-handoff*.test.js`, `auto—publish/tests/phase-05-trash-confirmation.test.js`, `auto—publish/tests/phase-08-content-lifecycle.test.js` | `node --test tests/generation-submission-handoff.test.js tests/generation-submission-handoff-ipc.test.js tests/phase-05-trash-confirmation.test.js tests/phase-08-content-lifecycle.test.js` | handoff / ArticleRemovalService | `PASSED` / `97c8f2c0…b3628` |
| fault remote/uncertain | `auto—publish/tests/phase-03-publication-workflow.test.js` — crash/stranded intent; `auto—publish/tests/phase-08-publication-submission-orchestration.test.js` — startup recovery | same files as above | PublicationWorkflow / platform adapter | `PASSED` / `97c8f2c0…b3628` |
| fault timeout/stop/start | `auto—publish/tests/phase-04-platform-run.test.js` — watchdog and 100 stop-start interleavings; `auto—publish/tests/phase-08-publication-submission-orchestration.test.js` — stop/pause | `node --test tests/phase-04-platform-run.test.js tests/phase-08-publication-submission-orchestration.test.js` | PlatformRun / worker lifecycle | `PASSED` / `97c8f2c0…b3628` |
| fault archive/removal runner | `auto—publish/tests/phase-08-publication-submission-orchestration.test.js` — archive/retry/restart; `auto—publish/tests/article-removal-recovery-scheduler.test.js` — dispose/recovery | `node --test tests/phase-08-publication-submission-orchestration.test.js tests/phase-08-content-lifecycle.test.js tests/article-removal-recovery-scheduler.test.js` | post-processing / ArticleRemovalService | `PASSED` / `97c8f2c0…b3628` |
| fault SQLite/WAL/disk | `auto—publish/auth-server/tests/backup-restore-migration.test.js` — backup/restore; `auto—publish/auth-server/tests/health-semantics.test.js`; `auto—publish/tests/phase-08-diagnostics-artifact-toolchain.test.js` | `npm run test:auth && node --test tests/structured-diagnostics.test.js tests/runtime-diagnostics.test.js tests/runtime-diagnostics-ipc.test.js tests/phase-06-legacy-path-absence.test.js tests/phase-08-diagnostics-artifact-toolchain.test.js` | OperationalStore / Auth / diagnostics | `PASSED` / `auth e04f1f5c…a14240 + diagnostics 2739e564…a917` |
| artifact prerequisite | `auto—publish/tests/alpha-smoke-verifier.test.js`; `auto—publish/tests/phase-03-remote-order-legacy-path-absence.test.js`; `auto—publish/tests/phase-06-capability-specific-inventory.test.js` | `npm test` | archive verifier / runtime resolver | `PENDING_ARTIFACT` / `d28cefbc…f267c` |
| security Electron/preload/IPC | `tests/electron-security.test.js`; `production-preload-sandbox.electron.test.js`; `renderer-settings-window-focus.electron.test.js` | `set RUN_ELECTRON_FOCUS_TESTS=1 && node --test ...` | Electron main/preload/Renderer | `PASSED` / `f5912bdc…f9f3` |
| security media transport | `tests/phase-04-media-transport.test.js` — HTTP/TLS/redirect/timeouts | `npm run test:media-transport` | media transport | `PASSED` / `1d9cf074…6fc4e` |
| security path/DTO/package | `auto—publish/tests/client-material-store.test.js`; `auto—publish/tests/structured-diagnostics.test.js`; `auto—publish/tests/desktop-packaging.test.js`; `auto—publish/tests/release-evidence.test.js` — exact selectors in manifest | `npm run test:links && node --test tests/structured-diagnostics.test.js tests/runtime-diagnostics.test.js tests/runtime-diagnostics-ipc.test.js tests/phase-06-legacy-path-absence.test.js tests/phase-08-diagnostics-artifact-toolchain.test.js && npm run test:packaging && npm run test:release-evidence` | path policy / diagnostics / package boundary / evidence | `PASSED` / `links 0d041cb5…e010 + diagnostics 2739e564…a917 + packaging f69be87b…2712 + release 5fb13393…1933` |
| security account switch/Auth | `auto—publish/tests/renderer-content-client-switch.test.js`; `auto—publish/tests/phase-03-content-account-binding-execution.test.js`; `auto—publish/auth-server/tests/auth-proxy-rate-limit.test.js` — source/limiter/policy | `node --test tests/renderer-content-client-switch.test.js tests/phase-03-content-account-binding-execution.test.js && npm run test:auth` | Renderer scope / durable account binding / Auth policy | `PASSED` / `renderer 5c8fae73…1614 + Auth e04f1f5c…a14240` |

Automatic fake-transport, Renderer, account-binding, and Auth cases are `manualReview: NOT_REQUIRED`. Real account binding/login, production TLS/DNS/redirect, proxy headers, signing, installer, external E2E, and Auth backup/RPO/RTO/recovery remain separate `PENDING_HUMAN` gates below; they must not be inferred from synthetic automatic cases.

## Functional case ledger

| Case | Authoritative owner | Fault point / expected code | Durable fact | Restart result | Human check |
| --- | --- | --- | --- | --- | --- |
| client/article/template/generation chain | Content stores and generation batch owner | validation failures remain typed; no external call | article, draft, template and batch identity remain in isolated fixture state | snapshots and task state are reconstructed by the application stores | no |
| fake publisher per platform | PublicationWorkflow and publisher registry | `REMOTE_FAILED` / uncertain outcome category | outcome/evidence and attention are durable before post-processing | recovery reads the durable publication intent | no |
| multi-account and media resource target | publication target/query owner | `PUBLICATION_DUPLICATE` rejects duplicate protection | target keeps account/resource identity | retry reuses the same target aggregate | no |
| handoff, ordering and submission | generation handoff and submission owner | `OPERATIONAL_BATCH_ITEM_NOT_EXECUTABLE` for invalid claim | claim, item status and handoff link are persisted | startup recovery sees the same batch/item state | no |
| attention and trash | ArticleRemovalService and article management owner | `REMOVAL_BLOCKED`, `REMOVAL_RETRY_FAILED`, `ARTICLE_STORE_BUSY` | tombstone/attention and article pair remain coherent | list/recover obeys the article lock and rebuilds attention | no |

## Fault and recovery ledger

| Case | Authoritative owner | Fault point / stable code | Durable fact | Restart result | Human check |
| --- | --- | --- | --- | --- | --- |
| remote call before/after handoff | PublicationWorkflow / platform adapter | `REMOTE_CALL_FAILED`, `REMOTE_FAILED`, uncertain outcome | intent and outcome are stored before archive decisions | stranded intent is recovered and remains attention-visible when evidence is weak | no |
| platform timeout and stop/start | PlatformRun / worker lifecycle | `PLATFORM_WORKER_WATCHDOG_TIMEOUT`, `STOP_REQUESTED`, `PLATFORM_RUN_ACTIVE` | run status and stop fence prevent a new runner from claiming old work | old messages/finally paths cannot mutate the new run | no |
| post-processing/archive failure | submission and article-removal owners | `PUBLISHED_ARCHIVE_CONFLICT`, `REMOVAL_RETRY_FAILED` | failed archive/removal is durable as attention, not silently published | retry/reconcile uses the persisted action and drains only eligible work | no |
| duplicate runner and lock contention | Article file transaction/removal owner | `ARTICLE_STORE_BUSY`, `ARTICLE_REMOVAL_RECOVERY_FAILED` | journal, lock identity and pair topology are preserved | recovery is bounded and fails closed on unknown ownership | no |
| SQLite/WAL/corruption and diagnostic disk fault | OperationalStore/Auth repository/diagnostic sinks | stable schema/corruption/permission categories; `DIAGNOSTIC_FILE_PERMISSION_DENIED` | transaction rollback and safe diagnostic record are retained | reopen/recovery does not invent a second business state | no |
| runtime/artifact boundary | packaged runtime resolver and archive verifier | `PLAYWRIGHT_NODE_UNAVAILABLE`, `ASSERTION_FAILURE` normalized as `ARCHIVE_MISSING` | no package/runtime fact exists in this source-only worktree | deferred until a synthetic packaged artifact is supplied | `PENDING_ARTIFACT` / Ticket 15 |

## Security summary

The safe summary contains counts, code/category, fixture type, and hashes only. It contains no absolute path, customer content, secret, raw error, DOM, cookie, or screenshot.

| Category | Count/result | Codes or state | Fixture | Hash |
| --- | ---: | --- | --- | --- |
| Electron sandbox/preload/IPC | 14/14 | `PASSED` | temporary Electron + bundled preload | `f5912bdc3aeda18c58c67a66112fed74d15a7c75375f86e9856e05b6b89ff9f3` |
| media HTTP/TLS/redirect | 9/9 | `MEDIA_HTTP_CONFIRMATION_REQUIRED`, `MEDIA_REDIRECT_REJECTED`, `MEDIA_TLS_*`, `MEDIA_*_TIMEOUT` | fake transport | `1d9cf074c5460ebe66c16105f506c20c1352e9a7463fc2398d18cd4e8f66fc4e` |
| DTO/log/fixture/temp/package | 40/40 + 48/48 | `PASSED`; safe projection/scan | temporary diagnostic and ASAR fixtures | `2739e5645abc00724a41d85133b2533b54a1919fd280daab94f7264d5822a917` |
| path traversal/symlink/workspace boundary | 184/184 | `GENERATION_BATCH_PATH_UNSAFE`, `ARTICLE_REMOVAL_PATH_INVALID`, `PASSED` | temporary link/path fixtures | `0d041cb594a67b98c929814a73a19110d6a829636be24604013c55f91fe1e010` |
| Auth secret/proxy/limiter | 49/49 | bounded limiter, trusted-source policy, safe DTO | isolated Auth fixtures | `e04f1f5c20cfea4a320918069a04f615dc943ebdb055c8ed7b2fc66f4ea14240` |
| architecture/legacy/capability | 109/109 reachable; source/archive legacy 0/0 | `PASSED`; archive `NOT_APPLICABLE` | source tree and temporary package fixtures | `4eb8642a7536eafe06f1d239ec7973e5c592db44fd4a16be6635993d8b23e23c` |

## Toolchain and discovery

Passed: lint; main/Renderer/bridge typecheck; format check; Renderer build (`2171` modules); preload build (`234097` bytes); `git diff --check`; packaging contracts; release evidence contract; and test discovery (`238` files: `224` `.test.js`, `14` `.test.mjs`). The legacy absence evidence is `PASSED` with source/archive matches `0/0` and archive status `NOT_APPLICABLE`.

## Reopen decision and stopping condition

No Phase 8 wrapper or compatibility patch was added. The source functional/fault/security results are attributable to the owners above and are now individually traceable through the versioned manifest. Ticket 14 remains `IN_PROGRESS` because the root suite cannot claim all automatic items while the current worktree has no alpha package or bundled runtime tools. Reopen/continue with Ticket 15's synthetic artifact and production-directory acceptance; this is an automatic artifact prerequisite, not a human gate or a domain failure.

The following remain explicitly `PENDING_HUMAN`: real account binding and signed browser login, provider/TLS/DNS/redirect risk, proxy source headers, signing certificate, installer ACL/upgrade/rollback/SmartScreen, external E2E, Auth backup policy/RPO/RTO and recovery drill. They are not marked passed here.

## Next entry

- Read this report and Ticket 15's plan before supplying any artifact.
- Use only a temporary synthetic package/resources root; do not use a real workspace or production account.
- First command after the artifact gate is available: rerun the root suite and the physical archive/runtime smoke cases, then refresh the manifest hashes.
- Ticket 14 evidence is staged for Git tracking but is not committed, pushed, or opened as a PR; the plan's no-auto-commit stop condition remains in force.
