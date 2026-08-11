# M06-D Handoff — Optional Probe / Parse / Diagnostics / IPC / Renderer

日期：2026-08-11
起点：`96397c8cdb66e3479acd4524a72a94d38359a46e`（已含 M06-A/B/C）
范围：仅 M06-D；未启动 M06-E、M06-F、M06-G 或 Ticket 25；未执行真实账号、投稿、付费、取消、上传、生产数据、push 或 release 操作。

## 结论

M06-D 已完成。D owner 范围内的 optional probe/parse、diagnostics、IPC 和 Renderer 调用链均已复核；关键失败不再无痕丢失，malformed/读取异常保留不完整 observation，诊断 sink 失败只暴露安全状态与计数，listener/cleanup 失败不覆盖主错误。M06-D 的唯一 commit 在本 handoff 一并提交；最终 SHA 由任务 closure 报告。

Wave 状态已更新为：`M06-D=COMPLETE`、`M06-E=READY`、`M06/Maintenance 10.5=PARTIAL`、`Ticket 25=PENDING/blocked`。

## 实现边界与主要变更

- `desktop/services/runtime-diagnostics-probes.js`：`mammoth` 探测和 JSON/build-info 读取改为显式 `{ value/result, observation }`；config/root/package 降级分别保留 `complete`、`fallback` 或 `partial`，不把 malformed/read failure 当作无事实。
- `src/diagnostics/`：producer 记录安全 sink 状态/计数；projection 返回 `droppedCount`；runtime snapshot/IPC 只暴露 allowlisted status、counter、code 和 observation；file lock cleanup 保留主错误，只有无主错误时才抛 cleanup failure。
- `desktop/ipc/` 与 `desktop/main.js`：typed failure fail-closed；注册回滚、dispose、remove-handler 做 listener/模块隔离并保留首个错误；Renderer runtime event 发送失败写入固定 diagnostic code，不泄露 transport 异常正文。
- `media-workbench/src/bridge/`、components 与 features：Doubao cache/login、generation hydration、media draft read、platform queue/account/run refresh、workspace identity、article editor listener、订单链接和关键 fire-and-forget action 均有公开 observation、query/command error 或安全诊断；generation 在 action 已成功时不会把 follow-up refresh failure 改写成 action failure。
- IPC/Renderer error projection 只接受安全 code/userMessage；原始 `Error.message`、路径、cookie/token/header/body/database 等敏感文本不进入新增 diagnostics 或安全快照。

## Inventory 对账

权威脚本：`maintenance/M06-0-catch-inventory.mjs`。基线取本任务起点 integration HEAD（A/B/C 已完成），不是 M06-0 初始历史快照。

| 范围 | 基线（A/B/C 后） | M06-D after | 变化 |
| --- | ---: | ---: | ---: |
| 全库扫描文件 | 505 | 505 | 0 |
| 全库有 handler 文件 | 275 | 275 | 0 |
| 全库 catch/rejection handler | 1,129 | 1,137 | +8 |
| parse diagnostics | 0 | 0 | 0 |
| D 文件 | 54 | 54 | 0 |
| D handler | 182 | 190 | +8 |

D shape 对账：

| Shape | 基线 | After |
| --- | ---: | ---: |
| `DIAGNOSTIC` | 1 | 28 |
| `SIDE_EFFECT_OR_MAPPING` | 50 | 53 |
| `ASSIGNMENT_MAPPING` | 5 | 11 |
| `PROPAGATE_OR_RETHROW` | 46 | 48 |
| `RETURN_OR_FALLBACK` | 43 | 50 |
| `EMPTY` | 23 | 0 |
| `OTHER` | 14 | 0 |

净增 8 的原因已逐文件对账：

- `desktop/ipc/register.js` `+3`：模块 dispose、handler removal、registration rollback 的错误隔离/首错保留；
- `media-workbench/src/components/article-editor-session.js` `+1`：subscriber failure 的 diagnostic callback isolation；
- `media-workbench/src/features/generation/generation-feature.js` `+5`：hydration observation、action/refresh 分离、stale/follow-up refresh diagnostic；
- `media-workbench/src/features/platform/platform-feature.js` `+1`：fire-and-forget refresh failure diagnostic；
- `src/diagnostics/diagnostic-file-sink.js` `+1`：lock close/release cleanup outcome；
- `desktop/services/runtime-diagnostics-probes.js` `-2`、`media-workbench/src/features/media/media-feature.js` `-1`：合并/删除原 silent fallback，净变化仍为上述 `+8`。

M06-0 D 的 43 个 review-first occurrence（desktop IPC/main/probe/diagnostics、Renderer bridge/components/features）全部按当前源码和直接调用链复核；其余 D inventory 也全部纳入本次 AST after，不把 43 项当作白名单。当前 D 无 `EMPTY`/`OTHER`，因此没有未解释的 residual handler shape。

保留的 no-throw/no-diagnostic rows 共 114 个（after 的 `RETURN_OR_FALLBACK=50`、`SIDE_EFFECT_OR_MAPPING=53`、`ASSIGNMENT_MAPPING=11`），按以下 ledger 登记，均有公开结果或可观察投影：

| disposition | 适用 owner/语义 | 公开证据 |
| --- | --- | --- |
| `OPTIONAL_PROBE_PARSE` | build-info/package、mammoth、localStorage login、runtime event projection、generation hydration | `observation`、`fallback`、`unavailable`、`droppedCount` 或安全 hydration error |
| `LISTENER_ISOLATION` | article editor subscriber、generation event delivery、workspace/queue refresh callbacks | 其他 listener 继续执行，失败写入固定 diagnostic 或 feature query state |
| `BEST_EFFORT_CLEANUP` | diagnostic sink/lock、IPC unregister/rollback、desktop startup disposal | 主错误优先；无主错误时 cleanup failure 映射为稳定 failure code |
| `FAIL_CLOSED` | typed IPC registry、malformed result/request、bridge/cache write、renderer scope/query | `INTERNAL_SAFE_ERROR`、稳定 command/query error 或 unavailable observation |
| `EXPLICIT_OUTCOME` | 其余 IPC/Renderer action、query、refresh 与 UI fire-and-forget | visible alert、command/query snapshot、safe boolean/result 或可观察 diagnostic |

## 故障注入与行为验证

- malformed optional build JSON + valid package/root fallback：不会伪装 complete；保留 `partial`/`fallback`；malformed cached login 保留 `unknown/unavailable`；
- malformed runtime event / invalid declared observation：IPC 保留 projection `droppedCount` 和 `partial`；
- memory/file diagnostic sink failure：状态为 `degraded`，计数/安全 code 可见，不递归记录 sink failure，不暴露路径；
- file lock close/release failure：稳定 cleanup error；callback 主错误存在时主错误优先；
- throwing article-editor subscriber：健康 subscriber 仍收到通知并记录 listener diagnostic；
- renderer event send、platform refresh、generation hydration/action-follow-up refresh、media draft read、Doubao command error：失败进入 safe diagnostic 或 visible state；generation action success 不被 refresh failure 覆盖。

## Audit

已完成一次 Primary Audit（使用 `code-review` 约定，检查 D 全部 diff、直接调用方、owner 边界、敏感信息和失败语义）。发现并关闭的 blocking findings 均为 `INTRODUCED_BY_CHANGE`：

1. malformed login payload 曾可被标为 `complete`；改为 status allowlist + `unknown/unavailable`；
2. IPC 声明的非法 observation 可能覆盖 projection 已发现的 malformed count；改为只接受安全整数，否则使用 projection count；
3. config build-info 失败后使用 root fallback 曾标为 `complete`；改为 `fallback`；
4. generation action 成功后的 refresh failure 曾沿 action catch 传播；拆分 action owner 与 refresh observation，并保留 refresh diagnostic；
5. diagnostic sink startup status 与 renderer safe userMessage 边界收窄为 allowlisted/sanitized values。

Bounded re-audit 只复核上述 findings、修复 diff、受影响 invariant、直接调用方和回归测试；未重新开启无边界 full review。bounded re-audit 结果通过，D 无 blocking finding。

## 最终验证

以下均在最终源码上实际运行并通过：

- D 定向行为/故障注入：`node --test --test-concurrency=1 tests/phase-06-media-feature.test.mjs tests/phase-08-platform-media-settings-workspace-renderer-slice.test.mjs tests/phase-06-generation-feature.test.mjs tests/content-generation-batch-ipc.test.js tests/structured-diagnostics.test.js tests/runtime-diagnostics.test.js tests/runtime-diagnostics-ipc.test.js tests/article-editor-session.test.js tests/doubao-content-workbench.test.js` — **81/81**；
- diagnostics：`npm run test:diagnostics` — **37/37**；
- typed IPC/bridge/bootstrap/settings：对应五组 production tests — **42/42**；
- renderer interaction suite（batch/history/platform queue/client/settings/attention）— **15/15**；
- production IPC fixture matrix：`node --test tests/phase-06-production-ipc-fixture-matrix.test.js` — **33/33**，包含 129/129 capability TypeChecker；
- `npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`、`npm run lint` — 通过；
- `npm run build:renderer`（renderer interaction suite 也重新触发 Vite build）— 通过，仅保留既有 chunk-size warning；
- `node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary` — **505/275/1,137，D=54/190，parseDiagnostics=0，D EMPTY/OTHER=0**；
- `git diff --check` — 通过（Git 仅提示工作树 LF→CRLF warning，无 diff error）。

未运行：M06-G 要求的完整 `npm test`、最终 combined audit 和 clean-HEAD full gate；这些属于后续 M06-G，不是 M06-D 的 gate。真实外部操作全部未运行。

## 交接状态

- D：`COMPLETE`；E：`READY`；M06/10.5：`PARTIAL`；Ticket 25：`PENDING/blocked`；
- 未新增 parallel store/writer/state machine/compatibility path；未改变文章生命周期、投稿、订单或远端事实 owner；
- 本 handoff、Wave Plan 状态和本次源码/测试改动将随 M06-D 唯一 commit 一并提交；提交后必须保持 worktree clean。
