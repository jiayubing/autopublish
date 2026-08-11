# M06-E auth/security cleanup handoff

**Status:** `COMPLETE`；M06-F=`READY`；M06 与 Maintenance 10.5=`PARTIAL`；Ticket 25=`PENDING`/blocked。未启动 M06-F、M06-G 或 Ticket 25。

## Source state and scope

- Worktree：`C:\Users\violet\.codex\worktrees\a7d3\官媒投稿-refactor`
- Exact sourceState / base parent：`ed9f8ec48a315ab21d4ac2fdb45dfdacebab67a7`
- Start checks：HEAD exact match、worktree clean、staged clean、无重复 M06-E handoff；全部通过。
- Final Git contract：本 handoff 与本节所列实现/测试/清单必须进入一个 child commit，parent 必须精确为上述 sourceState；最终 `HEAD`、完整 SHA、parent 和 clean 状态以提交后的 Git evidence 与 closure response 为准。
- Scope：M06-0 inventory 中 E 的 21 个 parent 文件/76 个 handler 的全量复核；最终 AST 20 个文件/77 个 handler。仅修改 auth/security owner、直接调用链测试和 M06 状态/evidence 文档。
- 禁止项确认：未执行真实账号、真实登录、生产数据库、投稿、付费、取消、上传、发布、push 或外部写操作；未启动 M06-F、M06-G、Ticket 25。

## Implementation

### Auth/security owners

- `auth-database-verifier.js`：数据库 verifier 在 close failure 时失败关闭；主错误保留并附安全 `cleanupCode`；不暴露原始行/正文/绝对路径。
- `auth-backup-orchestrator.js`：backup primary error、source close 和 destination verification 均有稳定 outcome；close 未确认时不再返回 backup success。
- `auth-migration-guard.js`、`sqlite-auth-repository.js`：rollback/constructor close failure 可观察，cleanup 不覆盖 primary error。
- `auth-recovery-check.js`、`recovery-fixtures.js`：isolation、source close、repository close、临时目录 cleanup 均进入稳定错误或 cleanup metadata；恢复结果不再伪装成功。
- `auth-domain.js`：audit writer 返回失败或抛错时显式失败；secondary device audit failure 保留主 domain error，添加安全 `auditStatus`；password verifier 只接受严格的布尔 `true`。
- `domain/auth-password-policy.js`：candidate 必须为 string；encoded hash 长度、段数、scrypt 参数、salt/derived key 格式和范围校验失败均返回 `false`；scrypt rejection fail-closed。
- `health/integrity-runner.js`、`sqlite-integrity-check.js`、`sqlite-integrity-worker.js`：abort、worker termination、DB close failure 均有稳定 health outcome；不返回 false healthy。
- `server.js`：未知请求错误仍返回 unavailable，并只记录 allowlisted method；不再记录原始 URL path。
- `desktop/services/auth-service.js`：session token 清理失败返回安全状态；logout 对 transport error、非 2xx、显式 `{ ok: false }` 和本地 token cleanup failure 保留失败/不确定 outcome；remote failure 不再伪装 clean logout。

### Direct regression test

新增 `auth-server/tests/m06-e-auth-security.test.js`，覆盖：

1. malformed/non-string/password candidate 与 rejected verifier 的 fail-closed 行为；
2. audit write failure 保留设备限制主错误且不泄露敏感正文；
3. backup source close、destination primary error、database verifier close failure；
4. migration/repository rollback failure 保留 primary error；
5. recovery source close/cleanup failure 的可观察稳定 code 与路径脱敏；
6. health integrity DB close failure；
7. auth-server request failure diagnostic 的原始 path/query 脱敏；
8. desktop logout 的非 2xx remote failure 与 local token cleanup failure。

未新增生产 test-only seam、writer、状态机、wrapper、compatibility path 或 schema/migration。

## Authoritative AST reconciliation

命令：`node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary`

| state | scanned | files with handlers | handlers | E files | E handlers | E shapes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| exact parent `ed9f8ec48a315ab21d4ac2fdb45dfdacebab67a7` | 505 | 275 | 1,137 | 21 | 76 | propagate 34 / side-effect 10 / assignment 3 / return 13 / diagnostic 3 / EMPTY 12 / OTHER 1 |
| final implementation tree | 505 | 274 | 1,138 | 20 | 77 | propagate 32 / side-effect 20 / assignment 7 / return 15 / diagnostic 3 / EMPTY 0 / OTHER 0 |

parse diagnostics：`0`。原 parent 的 12 个 EMPTY 与 1 个 OTHER 已逐项写入 authoritative inventory 第 8 节并清零；`sqlite-integrity-check.js` 的原空 rejection handler 改为显式 worker termination outcome，因此从最终 AST handler 数中移除。最终 77 行的逐项 shape/disposition ledger 见 `handoffs/M06-0-authoritative-residual-silent-failure-inventory.md` 第 8 节。

## Verification evidence

### Passed

- `node --test --test-concurrency=1 auth-server/tests/m06-e-auth-security.test.js`：9/9 passed。
- `npm run test:auth`：auth-server 63/63 passed。
- `node --test --test-concurrency=1 tests/auth-service.test.js tests/auth-local-data-boundary.test.js tests/auth-ipc-boundary.test.js tests/auth-gate.test.js tests/auth-protected-ipc.test.js tests/authenticated-runtime.test.js`：18/18 passed。
- changed source/test `node --check`：14/14 files passed。
- `npm run lint`：PASS。
- `npm run typecheck:main`：PASS。
- `npm run typecheck:bridge`：PASS。
- `npm run typecheck:renderer`：PASS。
- `npm run test:diagnostics`：37/37 passed。
- `npm run build:renderer`：PASS；Vite transformed 2,170 modules；仅有既有 >500 kB chunk warning。
- `git diff --check`：PASS。
- final AST summary：505 scanned / 274 files with handlers / 1,138 handlers；E 20/77；parse diagnostics 0；EMPTY/OTHER 0/0。

### Not green / not run, with reason

- `npm run format:check`：命中 6 个未改动的既有文件：`desktop/services/runtime-diagnostics-service.js`、`src/diagnostics/diagnostic-file-sink.js`、`src/diagnostics/diagnostic-producer.js`、`src/diagnostics/runtime-diagnostic-ipc.js`、`src/diagnostics/runtime-diagnostic-snapshot.js`、`media-workbench/src/types/workspace.ts`。未对无关文件做格式化；本次 changed-path direct Prettier check 也显示 14 个 auth/security 文件原有全文件风格未满足 Prettier，未进行无关整文件重写。
- `npm run test:phase-08:gates` 与 `npm run verify:phase-08`：尝试运行；full static/package sweep 超过 120 秒未完成，随后显式终止由本次尝试遗留的 phase-08 Node 进程。未宣称通过。该 gate 不改变 M06-E owner 行为；M06-G 仍负责最终 combined/full gate。
- 根 `npm test`、完整 packaging/release smoke、真实 auth/production 操作：未运行；完整根测试与最终 clean-HEAD full gate 属于 M06-G，真实外部操作被本任务明确禁止。

## Primary Audit → remediation → bounded re-audit

### Primary Audit findings

1. `P1 EXPOSED_PREEXISTING`：数据库 verifier、backup/recovery、health 和 repository close/rollback 的 cleanup failure 可能被忽略或覆盖结果，存在 false success/false healthy 风险。已在对应 owner 中加入稳定 outcome 与主错误保留；故障注入覆盖 close/rollback/cleanup。
2. `P1 EXPOSED_PREEXISTING`：audit writer 返回值未验证，secondary audit failure 只有空 catch；设备限制主错误可能缺少可观察审计失败状态。已由 `_audit` 明确检查并以安全 `auditStatus` 保留 primary error。
3. `P1 EXPOSED_PREEXISTING`：password candidate verifier 依赖 truthiness/宽松编码输入；自定义 verifier 非布尔成功值可放行。已在 verifier 与 AuthDomain 两层 fail-closed/strict-true。
4. `P1 EXPOSED_PREEXISTING`：desktop logout 对 transport 之外的非 2xx/显式失败响应未分类，且本地 token 清理失败仍可返回 clean state。已保留 remote/local failure code；远端未确认不再报告 clean logout。
5. `P1 EXPOSED_PREEXISTING`：auth-server request diagnostic 记录原始 URL path，直接错误链可携带不必要敏感路径；已收敛为 allowlisted method，所有 auth/health boundary 继续使用安全 code/metadata。
6. `P2 PROCESS_EVIDENCE_GAP`（non-blocking）：format baseline 与 Phase 08 full sweep 没有形成绿色证据，分别记录为既有格式债务和超时未完成；未把它们伪造为通过，也未因该证据缺口扩大到 M06-F/G。

### Bounded re-audit

修复后只复核上述 finding 的 diff、受影响 auth invariants、直接调用方和回归：

- 重跑 M06-E 9/9、auth-server 63/63、desktop auth chain 18/18、diagnostics 37/37；全部通过。
- 重跑 AST 全量 reconciliation，E 全部 77 handlers 均有非空 disposition，EMPTY/OTHER 清零，parse diagnostics 为 0。
- 重读 backup/verifier/recovery/migration/repository/health/auth-domain/auth-service 的直接调用链，确认 cleanup failure 不覆盖 primary、remote failure 不被当成成功、diagnostic 无 password/token/cookie/key/body/database row/绝对敏感路径。
- 未开启新的 full review；M06-F、M06-G、Ticket 25 未触碰。

## Remaining risk and next gate

- M06-F 仍为 READY，负责 operator/release/migration scripts；本 handoff 不提前实现。
- M06-G 仍负责 combined audit、最终全量 inventory/failure-semantics reconciliation、完整 `npm test`、最终 clean-HEAD gates 和 Maintenance 10.5 closure。
- M06 与 Maintenance 10.5 必须保持 `PARTIAL`；Ticket 25 必须保持 `PENDING`/blocked，直到 M06-G 通过。
- 未做真实登录、远端 auth、生产 DB 或发布操作，因此真实环境网络/凭据/部署差异仍由明确授权的后续 gate 负责。

## Git handoff

实现与本 handoff、inventory reconciliation、Maintenance contract 和 Wave Plan 状态更新必须作为一个清楚意图的 commit 提交，commit parent 精确为 `ed9f8ec48a315ab21d4ac2fdb45dfdacebab67a7`；不 push。提交后必须验证 `git rev-parse HEAD`、`git rev-parse HEAD^`、`git status --short`，并在 closure response 给出最终完整 SHA、parent、文件数和 clean evidence。
