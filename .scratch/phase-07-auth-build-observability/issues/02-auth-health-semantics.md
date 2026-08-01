# 02 — Auth 健康检查语义拆分

**What to build:** 监控系统可以分别判断 Auth 进程是否存活、是否具备服务请求的最低条件，以及数据库是否通过完整 integrity 检查；高频 readiness 不再触发昂贵的全库扫描，运维可以单独运行带超时的完整检查并获得安全诊断。

**Blocked by:** None — can start immediately

**Status:** completed

## Scope

- 明确 liveness、readiness 和完整 integrity check 的输入、查询成本、超时和错误语义。
- 将数据库审计保留/轮换和容量异常纳入诊断，不把完整扫描塞进固定周期的 readiness。
- 为 HTTP health adapter、repository probe 和运维命令建立独立模块。

## Module boundaries

- **Liveness handler:** 只检查进程事件循环和 HTTP 响应能力；不得访问 SQLite 或审计表。
- **Readiness probe:** 只执行必要的轻量查询和连接状态检查；不得调用完整 `integrity_check`。
- **Integrity runner:** 只执行完整 schema/integrity/容量检查，带可取消超时；不得直接决定 HTTP 状态码。
- **Health mapper:** 将 probe 结果映射为稳定 code/category/retryability；不得透传 SQLite 原始错误、路径或 SQL。
- **Maintenance diagnostics:** 只报告 audit retention、轮换和容量摘要；不得成为业务恢复事实源。

单个 health 模块保持短小，目标是每个模块只拥有一个探针或映射职责；周期调度、HTTP adapter 和 CLI 不得互相导入内部实现。

## Acceptance criteria

- [x] liveness 在数据库不可用时仍能准确反映“进程和 HTTP 响应存活”，且不执行数据库查询。
- [x] readiness 只执行预先定义的轻量必要查询，数据库正常时不会每 30 秒调用完整 integrity check。
- [x] 完整 integrity check 只能由受控运维命令或定时任务触发，有明确超时、取消和非零退出语义。
- [x] schema 未知、数据库损坏、锁等待超时、容量不足和审计维护异常分别映射为稳定安全 code。
- [x] health 响应只包含状态、code、时间和安全 metadata，不包含原始错误、SQL、绝对路径或数据库内容。
- [x] readiness 和 integrity 的调用次数、超时和失败分类均有单元测试；测试可证明 readiness 未触发全库扫描。
- [x] 审计保留/轮换和数据库容量达到阈值时能产生可操作 attention/diagnostic，但不会伪造业务成功或恢复状态。
- [x] HTTP health adapter、repository probe、完整检查 CLI 和诊断 mapper 可分别替换测试，不需要启动完整桌面 runtime。

## Acceptance evidence (2026-08-01)

- `auth-server/src/health/http-health-handler.js` separates `/healthz` compatibility liveness from `/healthz/live`, `/healthz/ready`, and `/readyz`; liveness has no repository dependency.
- `auth-server/src/health/repository-probe.js` calls only the repository `probeReadiness()` seam. SQLite startup/readiness uses schema/connection probes with `SELECT 1` and table metadata; `integrity_check` is not part of that path.
- `auth-server/src/health/integrity-runner.js`, `sqlite-integrity-check.js`, and `sqlite-integrity-worker.js` run full schema/integrity/foreign-key/capacity/audit checks only through a worker-backed controlled runner. Timeout, `AbortSignal` cancellation, stable non-zero CLI outcomes, and safe error categories are implemented in `scripts/integrity-check.js`.
- `auth-server/src/health/maintenance-diagnostics.js` reports audit retention/rotation attention and database plus WAL/SHM capacity states. `health-diagnostic-mapper.js` emits stable category/code/retryability values and allowlisted metadata only.
- `auth-server/tests/health-semantics.test.js`: 9/9 passed. It proves liveness survives unavailable, unknown-schema, and corrupt repositories; readiness call count stays bounded; injected `integrityCheck` is never called by readiness; worker integrity timeout/cancellation and safe mapping work; audit/capacity attention is reported without content, SQL, path, or raw exception data.
- `npm run test:auth`: 45/45 passed (0 failed, 0 skipped).
- `node --test tests/j4125-auth-contract.test.js tests/ci-workflow-contract.test.js`: 2/2 passed.
- Root `npm test` target (`node scripts/run-tests.js`): 226 files, 1470 tests, 1470 passed, 0 failed, and 0 skipped. The previously observed runtime-diagnostics failures were not reproducible in this completed aggregate run; no Auth health test failed.
- No production database, account, provider, or content library was accessed. No stage/commit/push/reset/checkout/clean was performed. Release owner confirmation of route/threshold wiring remains a manual deployment item as specified above.

## Implementation notes

- 与 ticket 01 共用安全的 schema verifier 语义，但不要让 readiness 依赖备份/恢复编排器。
- 不改变 Renderer feature interface；若桌面端展示状态，只消费已有安全 diagnostic DTO。
- 真实部署的 liveness/readiness 路由、代理和监控阈值需要人工 owner 在 release 前确认。
