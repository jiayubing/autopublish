# M06-C — Remote / Process / Platform Runtime Cleanup Handoff

## 状态

- `M06-C=COMPLETE`
- 下一 gate：`M06-D=READY`
- `M06/Maintenance 10.5=PARTIAL`
- `Ticket 25=PENDING/blocked by M06`
- 本包没有启动 M06-D/G 或 Ticket 25；没有合并 integration。

## Provenance 与范围

本包从精确 integration HEAD `8d46d22f3a3555b29bc0d00b97a9dd0b9538f105` 开始，在独立 worktree `C:\Users\violet\.codex\worktrees\a3bb\官媒投稿-refactor` 执行；当前 integration branch `codex/article-lifecycle-submission` 位于另一 worktree，未被修改。开始前已确认仓库根、detached HEAD、clean worktree、空暂存区、无嵌套仓库、精确起点祖先关系、M06-A/B `COMPLETE`、M06-C `READY`，且无重复 M06-C worktree/thread。没有 push、release、真实登录/投稿/付费/取消/上传或生产数据操作。

执行依据为根 `AGENTS.md`、`CONTEXT.md`、生命周期 spec、Wave Plan、`EXECUTION-PROTOCOL.md`、`AUDIT-PROTOCOL.md`、M06 maintenance contract、M06-0 authoritative inventory/script 与 M06-A/B handoff。范围严格限于 remote / process / platform runtime 及必要直接调用链：desktop task/workbench/orchestrators/worker、regular/paid submission、stop signal、runtime browser smoke/session、Hepan/Lieju/Toutiao/media adapters/transports/stores、相关 projection/preflight。

## 实现闭环

按唯一 owner 收敛了以下公开失败语义：

- stop/pause signal 的读、写、清除失败使用稳定错误；读取异常 fail-closed；暂停/停止控制信号未写入时不返回控制成功。worker IPC stop signal 的同步/异步发送失败进入安全诊断。
- `PlatformRun`、desktop task、worker、browser smoke/session：子进程 kill、browser close、Playwright 临时目录、Hepan 临时 cookie/payload、listener/worker payload 序列化失败均保持主结果，并以 allowlisted metadata 诊断；stop-signal 清除失败发生在 Hepan 临时 cookie 创建后时先 best-effort cleanup，再传播主错误。
- browser session `list` 探测失败现在是 `BROWSER_SESSION_PROBE_FAILED`，不会把 unknown 当成“不活跃”并重复启动 daemon。
- regular/paid submission claim renewal 与 stop-state 读取失败分别进入稳定 renewal/unavailable 结果；lease cleanup 不覆盖 remote workflow 已产生的 outcome。queue reader、command preparer、paid preflight、submission projection 的 article/publication/batch state 读取异常不再被投影成 active、not-found 或空历史。
- Hepan 预提交配置/进程与已开始远端调用保持 `group_blocked`、明确 remote rejection、`uncertain` 的边界；超时、abort、协议异常和缺少远端身份不升级为 accepted，不自动 retry。Lieju/Toutiao prepared submit 使用 `STOP_REQUESTED` code，不再匹配错误文本。
- media standalone adapter 与既有 supplier response owner 共享显式拒绝判定；订单号缺失、嵌套响应无法绑定、transport/timeout/disconnect/server/protocol/TLS 失败保持 safe `uncertain`，query/balance 的远端请求失败同样不返回 definite error；媒体 draft/pool/resource store 的损坏或非 ENOENT 读取/清除失败传播稳定 storage error。
- 所有新增诊断只使用 `platformId`、`operationId`、`action`、`session` 等 allowlisted/sanitized metadata；没有 token、Cookie、请求头、客户正文、数据库行、绝对敏感路径或供应商原始异常。没有新增 writer、状态机、兼容旁路或 test-only production seam。

主要 production owner 文件包括：

```text
auto—publish/desktop/services/desktop-task-service.js
auto—publish/desktop/services/platform-run.js
auto—publish/desktop/services/platform-settings/hepan-settings-adapter.js
auto—publish/desktop/services/platform-workbench-application.js
auto—publish/desktop/services/platform-workbench/command-preparer.js
auto—publish/desktop/services/platform-workbench/queue-reader.js
auto—publish/desktop/services/paid-media-preflight-service.js
auto—publish/desktop/services/publication-submission-orchestrator.js
auto—publish/desktop/services/regular-queue-group-orchestrator.js
auto—publish/desktop/services/runtime-browser-smoke.js
auto—publish/desktop/services/submission-item-projection.js
auto—publish/desktop/services/worker-publisher.js
auto—publish/src/core/operator-flow.js
auto—publish/src/core/stop-signal.js
auto—publish/src/platforms/hepan/adapter.js
auto—publish/src/platforms/hepan/article-source.js
auto—publish/src/platforms/lieju/adapter.js
auto—publish/src/platforms/media/adapter.js
auto—publish/src/platforms/media/media-draft-store.js
auto—publish/src/platforms/media/media-pool-store.js
auto—publish/src/platforms/media/media-resource-store.js
auto—publish/src/platforms/media/media-supplier-response.js
auto—publish/src/platforms/media/media-transport.js
auto—publish/src/platforms/shared/browser-session-lifecycle.js
auto—publish/src/platforms/toutiao/adapter.js
```

新增公开行为/故障注入测试：`auto—publish/tests/m06-c-remote-process-runtime.test.js`。测试使用合成文件、内存/fake transport、故障注入和 fake browser/process，不执行真实外部操作。

## AST inventory 对账

命令：`node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary`；最终 `parseDiagnostics=[]`。

| 指标 | M06-C 起点（A/B closure 后） | M06-C after | 变化 |
| --- | ---: | ---: | ---: |
| 扫描生产/正式脚本文件 | 505 | 505 | 0 |
| 含 catch/rejection handler 的文件 | 275 | 275 | 0 |
| 全库 handlers | 1,116 | 1,129 | +13 |
| C 文件 | 67 | 67 | 0 |
| C handlers | 241 | 254 | +13 |
| C `EMPTY` | 32 | 4 | -28 |
| C `RETURN_OR_FALLBACK` | 93 | 93 | 0 |
| C `PROPAGATE_OR_RETHROW` | 57 | 71 | +14 |
| C `SIDE_EFFECT_OR_MAPPING` | 22 | 52 | +30 |
| C `ASSIGNMENT_MAPPING` | 17 | 13 | -4 |
| C `OTHER` | 2 | 1 | -1 |
| C `DIAGNOSTIC` | 18 | 20 | +2 |

新增的 13 个 C handler 均位于本包 owner 的主错误保留、cleanup/process/session 诊断、state-unavailable 或 uncertain outcome 直接调用链；没有为降低数量机械改写，也没有把原有 handler 当作安全白名单。最终 C 中所有 254 项均已复核：71 项显式传播/转换；20 项安全诊断；其余 163 项按调用点登记为 `EXPLICIT_OUTCOME`、`BEST_EFFORT_CLEANUP`、`OPTIONAL_PROBE_PARSE`、`LISTENER_ISOLATION` 或 `FAIL_CLOSED`。

保留项的逐项边界：

- `auto—publish/desktop/runtime-paths.js:3`：`OPTIONAL_PROBE_PARSE`/可选 Electron capability；非 Electron runtime 使用明确 fallback。
- `auto—publish/desktop/services/paid-media-batch-orchestrator.js:166`：`EXPLICIT_OUTCOME`；paid order precheck 异常投影为 `PAID_ORDER_PRECHECK_FAILED`，释放 claim，不制造远端成功。
- `auto—publish/desktop/services/platform-settings/hepan-settings-adapter.js:356`、`auto—publish/src/platforms/hepan/adapter.js:154`：`OPTIONAL_PROBE_PARSE`；逐行 JSON 探测忽略 malformed line，最终返回 null/稳定脚本解析失败，调用方不会生成 accepted evidence。
- `auto—publish/desktop/services/platform-settings/media-risk-confirmation-adapter.js:50`：`FAIL_CLOSED`；无效 endpoint invalidate 为安全 no-op，不产生 HTTP confirmation。
- 其余 `RETURN_OR_FALLBACK`、`SIDE_EFFECT_OR_MAPPING`、`ASSIGNMENT_MAPPING`：按 adapter explicit rejection/uncertain、account/session verification、listener/cleanup isolation、safe state projection、stable preflight/query outcome 分别登记；没有 remote/process 路径静默吞错。`DIAGNOSTIC` handlers 仅记录安全 metadata。

## 测试与 gate evidence

最终 source/test 变更后实际运行并通过：

- 定向 C 直接调用链：`node --test --test-concurrency=1 tests/m06-c-remote-process-runtime.test.js tests/hepan-publish-contract.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-platform-outcomes.test.js tests/platform-browser-session-lifecycle.test.js tests/phase-04-platform-run.test.js tests/platform-task-progress.test.js tests/platform-workbench-service.test.js tests/phase-03-media-adapter-readonly.test.js tests/phase-11-media-supplier-contract.test.js tests/phase-04-media-transport.test.js tests/phase-12-paid-media-preflight.test.js tests/phase-07-regular-queue.test.js tests/desktop-task-service.test.js tests/media-draft-store.test.js tests/media-resource-service.test.js tests/phase-03-worker-main-contract.test.js tests/phase-08-publication-submission-orchestration.test.js tests/hepan-provider-settings.test.js tests/hepan-settings-patch-contract.test.js tests/media-client.test.js tests/media-provider-settings.test.js tests/media-order-evidence.test.js tests/submission-preparation-lifecycle.test.js tests/submission-cleanup-recovery.test.js`：`209/209` passed。
- `npm run test:diagnostics`：`30/30` passed。
- `npm run test:phase-08:gates`：`4/4` passed。
- `node scripts/verify-phase-08-gates.js`：`PASSED`；dependency direction、OperationalStore boundary、unique owners/writers、legacy absence、tracked generated output 全 PASS，capability `129/129` reachable。
- `npx eslint` 对全部本包修改 production/test 文件：通过。
- `npm run lint`：通过。
- `npm run format:check`：通过；只对本包已修改且属于 format glob 的 `runtime-browser-smoke.js` 与 `browser-session-lifecycle.js` 做了机械格式化。
- `npm run test:links`：`189/189` passed；`npm run test:migration`：`65/65` passed，用于验证 A/B 直接调用链无回归。
- 所有修改 source/test `node --check` 与 `git diff --check`：通过。
- `node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary`：505/275/1,129，C 67/254，parse diagnostics 0。

Phase 08 capability gate 首次运行因本地缺少 `media-workbench/node_modules/typescript` 报 `MODULE_NOT_FOUND`，未记为 PASS；随后执行 `npm --prefix media-workbench ci --ignore-scripts --no-audit --no-fund` 安装锁定依赖，再以更长运行上限重跑并通过。没有修改 tracked dependency files。

未运行完整 `npm test`、renderer build/typecheck、packaging/release gate，原因是完整 clean-HEAD combined gate 属于后续 M06-G，renderer/build/package 不在 M06-C 合同内。未执行任何真实账号、远端投稿、付费、取消、上传、生产数据库或发布操作。

## Primary Audit 与 bounded re-audit

Primary Audit 使用 code-review 规则检查 C inventory 全部 254 项、44 项基线高优先级集合、唯一 owner/调用链、remote outcome、process/session cleanup、stop/pause control、diagnostic metadata、A/B 直接回归与公开测试。发现并修复以下 blocking findings：

1. `EXPOSED_PREEXISTING / P1`：standalone media adapter 对 query/balance 的远端 transport/server/protocol 异常返回 definite error，且 provider explicit failure 带订单号时仍可能 accepted；修复为统一显式拒绝判定、safe uncertain，并复用 `media-supplier-response` owner。
2. `EXPOSED_PREEXISTING / P1`：paid preflight article store read exception 映射为 `PAID_MEDIA_ARTICLE_NOT_FOUND`，submission item projection 的 publication/batch store read exception 映射为空结果；修复为 `PAID_MEDIA_ARTICLE_STATE_UNAVAILABLE`、`SUBMISSION_PUBLICATION_STATE_UNAVAILABLE`、`SUBMISSION_BATCH_STATE_UNAVAILABLE`。
3. `INTRODUCED_BY_CHANGE / P1`：stop-signal clear 失败在 Hepan temporary cookie 已创建后会跳过 cleanup；修复为先 best-effort cleanup、诊断 cleanup failure，再传播 `DESKTOP_STOP_SIGNAL_CLEAR_FAILED`。

随后只按 Audit Protocol 做 bounded re-audit：复核上述 finding、最终修复 diff、remote explicit fail/success/uncertain、cleanup 主错误保持、stop/session/process control、直接调用方和回归测试；没有重新开启 fresh full review。bounded re-audit PASS，无 P0/P1/P2 blocking finding 残留。

## 交接与 Git

Wave/M06 实时状态已更新为 `M06-C=COMPLETE`、`M06-D=READY`、`M06/Maintenance 10.5=PARTIAL`、`Ticket 25=PENDING/blocked`。本 handoff、Wave Plan、M06 maintenance contract 与本包实现将在一个 commit 中提交；提交后不得 push、release、merge integration 或启动后续任务。最终完整 commit SHA 与 clean worktree 证据由提交后的交接回复记录。
