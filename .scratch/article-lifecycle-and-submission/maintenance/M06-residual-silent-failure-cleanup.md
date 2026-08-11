# M06 — Residual Silent Failure Cleanup

**Purpose:** 在核心业务、legacy cleanup、contract 与测试体系稳定后，完成 M02 延后的剩余空 catch/隐式吞错分类，使生产代码中的静默失败只剩经过明确证明的 best-effort cleanup 或 optional probe。

**Status:** `RUNNING`；M06-0 authoritative inventory/classification 与 A–G scope freeze 已完成；M06-A、M06-B、M06-C 已完成，下一 gate 为 M06-D

**Scheduling gate:** M05 `COMPLETE` 后调度；M06-A、M06-B、M06-C 已完成并将 M06-D 置为 `READY`，但 M06 仍在运行。M06 完成并通过维护 10.5 最终门禁后才允许波次 11 Ticket 25；M06 未完成前 10.5 不得标记 `COMPLETE`。

## Scope

- 全部生产 JS/TS/TSX（排除测试、生成物、vendor）；
- scripts/migration 仅在其会影响正式 operator/release/migration 结果时纳入；纯历史/一次性工具需记录但不为追求零数量机械修改。

## Authoritative inventory and execution order

M06-0 的唯一 inventory/scope 真源为：

- `M06-0-catch-inventory.mjs`：可复现 AST census；
- `../handoffs/M06-0-authoritative-residual-silent-failure-inventory.md`：classification、priority set、owner/failure semantics、A–G scope 与 closure matrix。

最终顺序冻结为：

`M06-0 → A → B → C → D → E → F → G`

| 包    | Owner / failure domain                                                                                                                                     | 状态       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| M06-0 | 全量 residual catch / rejection inventory、classification、scope freeze；不改 production                                                                   | `COMPLETE` |
| M06-A | OperationalStore / workspace / state persistence / cleanup                                                                                                 | `COMPLETE` |
| M06-B | content / file persistence / lifecycle                                                                                                                     | `COMPLETE` |
| M06-C | remote / process / platform runtime                                                                                                                        | `COMPLETE` |
| M06-D | optional probe / parse / diagnostics / IPC / Renderer                                                                                                      | `READY`    |
| M06-E | auth / security                                                                                                                                            | `PENDING`  |
| M06-F | operator / release / migration scripts                                                                                                                     | `PENDING`  |
| M06-G | combined audit、inventory/failure-semantics reconciliation、blocking remediation、bounded re-audit、final clean-HEAD full gate 与 Maintenance 10.5 closure | `PENDING`  |

不得按 catch 数量重新平均拆包。M06-0 census 为 505 个扫描文件、276 个有 catch 的文件、1,099 个 catch/rejection handler、0 parse diagnostics；其中 `EMPTY=148`。高优先级复核集去重后为 217 项：A=34、B=45、C=44、D=43、E=18、F=33。每包仍需检查其全部 inventory，不得把 priority set 当作其余项自动安全的白名单。

## Rules

- **best-effort cleanup**：可吞 cleanup 自身失败，但必须确保不覆盖主错误；必要时用安全 debug diagnostic。
- **optional probe/parse**：显式返回 `null`/result/fallback，并在调用方语义中可见。
- **state/persistence/security/remote/process**：不得空 catch，必须失败关闭或映射为稳定错误/diagnostic。
- 禁止 `catch {}` 变成 `catch (e) { console.log(e) }` 这种泄密/噪声修复。

## Acceptance criteria

- [x] M06-0 已完成生产代码/正式脚本 catch inventory、classification 与 A–G scope freeze；未修改 production。
- [ ] 生产代码 residual catch inventory 全部有最终 disposition；无未解释空 catch。
- [ ] persistence/security/remote/process 路径没有 silent swallow。
- [ ] 保留的 cleanup/probe 都有明确语义，且不会把失败伪装成成功。
- [ ] 敏感错误不写入日志；diagnostic metadata 仍为 allowlisted/sanitized。
- [ ] 完整测试与关键故障注入通过，交接记录保留项及理由。

M06-G 完成前，M06 与 Maintenance 10.5 均不得标记 `COMPLETE`，Ticket 25 不得启动。G 完成后停止，不自动进入 Ticket 25。

## M06-A package closure

M06-A 已完成其独立合同：OperationalStore owner/lease/recovery/transaction、workspace/config persistence、platform task state persistence、submission cleanup/staging 与 storage maintenance 的全部 A inventory handlers 均已逐项复核；无 A 包残留 `EMPTY` handler。定向测试、故障注入、Phase 08 architecture/package gate、AST before/after reconciliation、Primary Audit 与 bounded re-audit evidence 见 `handoffs/M06-A-operational-store-workspace-state-persistence-cleanup.md`。

M06-A closure 时状态为 `M06-A=COMPLETE`、`M06-B=READY`；其后的 M06-B closure 与当前调度状态见下节。M06-G combined closure 与维护 10.5 final gate 仍待后续串行工作包。

## M06-B package closure

M06-B 已完成 content / file persistence / lifecycle owner 的实现、定向故障注入验证、Primary Audit、blocking finding 检查、bounded re-audit 与 AST reconciliation。文章文件事务、锁与 removal recovery、生成 batch/AI test state、attention lookup、materials/questions/files 及 Doubao collection/generation persistence 均按失败语义收敛；读失败不再伪装为不存在，写入、rollback、lock、recovery 和关键 state cleanup 不再伪装成功。保留的 6 个 `EMPTY` handler 仅为已注释且可观察语义成立的 optional diagnostic artifact cleanup / historical optional parse probe。完整证据见 `handoffs/M06-B-content-file-persistence-lifecycle-cleanup.md`。

当前推进状态：`M06-A=COMPLETE`、`M06-B=COMPLETE`、`M06-C=COMPLETE`、`M06-D=READY`、`M06/Maintenance 10.5=PARTIAL`、`Ticket 25=PENDING/blocked`。M06-G combined closure 与维护 10.5 final gate 仍待后续串行工作包。

## M06-C package closure

M06-C 已完成 remote / process / platform runtime owner 的实现、定向故障注入验证、Primary Audit、blocking finding 最小根因修复、bounded re-audit 与 AST reconciliation。独立 handoff 见 `handoffs/M06-C-remote-process-platform-runtime-cleanup.md`。

本包收敛了 desktop task/workbench/orchestrator/worker、regular/paid submission、stop signal、browser session、Hepan/Lieju/Toutiao/media adapter/transport/store 的失败语义：远端请求在明确拒绝、明确接受和 uncertain 之间保持区分；缺少订单身份、协议/transport timeout、断线、浏览器探测未知和进程控制失败不再伪装成功或自动重试；关键 stop/pause signal、lease/state/article/publication store 读取异常进入稳定错误或 fail-closed outcome；cleanup 失败保留安全诊断且不覆盖主错误。保留的 4 个 `EMPTY` handler 分别是 Electron 可选能力加载、两处 Hepan 可选 JSON 行解析与媒体风险确认无效输入 no-op；另有 1 个 `OTHER` handler 将 paid preflight 异常映射为稳定 `PAID_ORDER_PRECHECK_FAILED`，均已在 handoff 登记公开语义。

C inventory after 为 67 个文件、254 个 handler、0 parse diagnostics；全库为 505 个扫描文件、275 个含 handler 文件、1,129 个 handler。相对 M06-C 起点（全库 1,116、C 241），C 新增的 13 个 handler 均服务于主错误保留、远端/进程/存储诊断或 unavailable/uncertain outcome；未新增 writer、状态机或兼容旁路。定向 209 个测试、diagnostics 30 个测试、Phase 08 cleanup 4 个测试、architecture/package gate（129/129 capabilities）与 format check 均通过；完整 `npm test` 仍保留给 M06-G。
