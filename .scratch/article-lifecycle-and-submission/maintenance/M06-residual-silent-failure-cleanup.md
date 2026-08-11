# M06 — Residual Silent Failure Cleanup

**Purpose:** 在核心业务、legacy cleanup、contract 与测试体系稳定后，完成 M02 延后的剩余空 catch/隐式吞错分类，使生产代码中的静默失败只剩经过明确证明的 best-effort cleanup 或 optional probe。

**Status:** `COMPLETE`；M06-H 后续 bounded audit 暴露的 queue `inputDir` 非法文件系统类型 finding 已在最终 implementation commit `af3d116` 完成最小修复、fault-injection coverage、bounded re-audit 与 final clean-HEAD root/supplemental gates；最终 evidence 见 `../handoffs/M06-H-final-bounded-remediation-clean-head-evidence.json`。

**Scheduling gate:** M05、M06-A～G 与 Maintenance 10.5=`COMPLETE`。Ticket 25 保持 `PENDING`/blocked/not started，不能由本 closure 自动启动。

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
| M06-D | optional probe / parse / diagnostics / IPC / Renderer                                                                                                      | `COMPLETE` |
| M06-E | auth / security                                                                                                                                            | `COMPLETE` |
| M06-F | operator / release / migration scripts                                                                                                                     | `COMPLETE` |
| M06-G | combined audit、inventory/failure-semantics reconciliation、blocking remediation、bounded re-audit、final clean-HEAD full gate 与 Maintenance 10.5 closure | `COMPLETE` |

不得按 catch 数量重新平均拆包。M06-0 census 为 505 个扫描文件、276 个有 catch 的文件、1,099 个 catch/rejection handler、0 parse diagnostics；其中 `EMPTY=148`。高优先级复核集去重后为 217 项：A=34、B=45、C=44、D=43、E=18、F=33。每包仍需检查其全部 inventory，不得把 priority set 当作其余项自动安全的白名单。

## Rules

- **best-effort cleanup**：可吞 cleanup 自身失败，但必须确保不覆盖主错误；必要时用安全 debug diagnostic。
- **optional probe/parse**：显式返回 `null`/result/fallback，并在调用方语义中可见。
- **state/persistence/security/remote/process**：不得空 catch，必须失败关闭或映射为稳定错误/diagnostic。
- 禁止 `catch {}` 变成 `catch (e) { console.log(e) }` 这种泄密/噪声修复。

## Acceptance criteria

- [x] M06-0 已完成生产代码/正式脚本 catch inventory、classification 与 A–G scope freeze；未修改 production。
- [x] 生产代码 residual catch inventory 全部有最终 disposition；无未解释空 catch。A～F ledger 已由 M06-G 全库 reconciliation 闭合。
- [x] persistence/security/remote/process 路径没有 silent swallow；保留项均为明确 outcome、optional probe/parse、listener isolation 或 best-effort cleanup。
- [x] 保留的 cleanup/probe 都有明确语义，且不会把失败伪装成成功；cleanup failure 不覆盖主错误。
- [x] 敏感错误不写入日志；diagnostic metadata 仍为 allowlisted/sanitized，provenance 缺失时 fail closed。
- [x] 最终 bounded remediation 的 clean-HEAD full gate evidence 已保存并与 implementation HEAD `af3d116` 对账；旧 `8cd5c1c`/`2af0cb0` evidence 不作为最终 HEAD 证明。

M06-G 完成前，M06 与 Maintenance 10.5 均不得标记 `COMPLETE`，Ticket 25 不得启动。G 完成后停止，不自动进入 Ticket 25。

## M06-A package closure

M06-A 已完成其独立合同：OperationalStore owner/lease/recovery/transaction、workspace/config persistence、platform task state persistence、submission cleanup/staging 与 storage maintenance 的全部 A inventory handlers 均已逐项复核；无 A 包残留 `EMPTY` handler。定向测试、故障注入、Phase 08 architecture/package gate、AST before/after reconciliation、Primary Audit 与 bounded re-audit evidence 见 `handoffs/M06-A-operational-store-workspace-state-persistence-cleanup.md`。

M06-A closure 时状态为 `M06-A=COMPLETE`、`M06-B=READY`；其后的 M06-B closure 与当前调度状态见下节。M06-G combined closure 与维护 10.5 final gate 仍待后续串行工作包。

## M06-B package closure

M06-B 已完成 content / file persistence / lifecycle owner 的实现、定向故障注入验证、Primary Audit、blocking finding 检查、bounded re-audit 与 AST reconciliation。文章文件事务、锁与 removal recovery、生成 batch/AI test state、attention lookup、materials/questions/files 及 Doubao collection/generation persistence 均按失败语义收敛；读失败不再伪装为不存在，写入、rollback、lock、recovery 和关键 state cleanup 不再伪装成功。保留的 6 个 `EMPTY` handler 仅为已注释且可观察语义成立的 optional diagnostic artifact cleanup / historical optional parse probe。完整证据见 `handoffs/M06-B-content-file-persistence-lifecycle-cleanup.md`。

历史推进快照已由下方 M06-G closure supersede；当前状态为 `M06-A～G=COMPLETE`、`M06/Maintenance 10.5=COMPLETE`、`Ticket 25=PENDING/blocked/not started`。

## M06-C package closure

M06-C 已完成 remote / process / platform runtime owner 的实现、定向故障注入验证、Primary Audit、blocking finding 最小根因修复、bounded re-audit 与 AST reconciliation。独立 handoff 见 `handoffs/M06-C-remote-process-platform-runtime-cleanup.md`。

本包收敛了 desktop task/workbench/orchestrator/worker、regular/paid submission、stop signal、browser session、Hepan/Lieju/Toutiao/media adapter/transport/store 的失败语义：远端请求在明确拒绝、明确接受和 uncertain 之间保持区分；缺少订单身份、协议/transport timeout、断线、浏览器探测未知和进程控制失败不再伪装成功或自动重试；关键 stop/pause signal、lease/state/article/publication store 读取异常进入稳定错误或 fail-closed outcome；cleanup 失败保留安全诊断且不覆盖主错误。保留的 4 个 `EMPTY` handler 分别是 Electron 可选能力加载、两处 Hepan 可选 JSON 行解析与媒体风险确认无效输入 no-op；另有 1 个 `OTHER` handler 将 paid preflight 异常映射为稳定 `PAID_ORDER_PRECHECK_FAILED`，均已在 handoff 登记公开语义。

C inventory after 为 67 个文件、254 个 handler、0 parse diagnostics；全库为 505 个扫描文件、275 个含 handler 文件、1,129 个 handler。相对 M06-C 起点（全库 1,116、C 241），C 新增的 13 个 handler 均服务于主错误保留、远端/进程/存储诊断或 unavailable/uncertain outcome；未新增 writer、状态机或兼容旁路。定向 209 个测试、diagnostics 30 个测试、Phase 08 cleanup 4 个测试、architecture/package gate（129/129 capabilities）与 format check 均通过；完整 `npm test` 仍保留给 M06-G。

## M06-D package closure

M06-D 已完成 optional probe / parse、diagnostics、IPC 与 Renderer owner 的实现、定向故障注入、Primary Audit、blocking finding 最小根因修复、bounded re-audit 与 AST reconciliation。独立证据见 `handoffs/M06-D-optional-probe-parse-diagnostics-ipc-renderer-cleanup.md`。M06-F 已在其后完成；M06-G combined closure 前 M06 与 Maintenance 10.5 仍保持 `PARTIAL`，Ticket 25 继续 blocked。

## M06-E package closure

M06-E 已完成 auth / security owner 的全量 E inventory 对账、实现、窄故障注入、直接调用链回归、Primary Audit、blocking remediation 与 bounded re-audit。独立 evidence 见 `handoffs/M06-E-auth-security-cleanup.md`。

本包已收敛：密码 candidate 类型/编码/参数校验 fail-closed；audit 写入、backup/recovery、数据库 verifier/health close、migration/repository rollback 与 recovery cleanup 的失败均进入稳定 outcome/code 或安全 cleanup metadata；cleanup failure 不覆盖主错误；桌面 logout 对 transport、非 2xx/显式失败和本地 token 清理均保留不确定/失败状态；auth-server 请求错误诊断不再记录原始 URL path。未新增 writer、状态机、schema 或兼容旁路。

E 的 exact-parent AST baseline（`ed9f8ec48a315ab21d4ac2fdb45dfdacebab67a7`）为 505 个扫描文件、275 个含 handler 文件、1,137 个 handler；E 为 21 个文件/76 个 handler。最终 AST 为 505/274/1,138；E 为 20 个文件/77 个 handler，parse diagnostics 为 0，`EMPTY=0`、`OTHER=0`。新增 handler 均为主错误保留、cleanup outcome、稳定 health mapping 或 safe diagnostic；`sqlite-integrity-check.js` 的原空 rejection handler 被显式 termination outcome 替代并从 AST catch 计数移除。完整 `npm test` 与 M06-G combined gate 仍保留给后续 M06-G。

## M06-F package closure

M06-F 已完成 operator / release / migration scripts 全量 F inventory 对账、实现、窄故障注入、直接调用链回归、Primary Audit、blocking remediation 与 bounded re-audit。独立 handoff 见 `handoffs/M06-F-operator-release-migration-scripts-cleanup.md`。本包未执行真实发布、生产迁移、生产数据库、真实账号、付费、push、release 或其他外部写操作。

F 的 exact-parent 是 `2c3e97d57c32316b214ce8cbfc1f2281a4f1a0dd`。parent AST 为 505 个扫描文件、274 个含 handler 文件、1,138 个 handler；F 为 42 个文件/138 个 handler，shape 为 `DIAGNOSTIC=42`、`ASSIGNMENT_MAPPING=4`、`RETURN_OR_FALLBACK=14`、`PROPAGATE_OR_RETHROW=44`、`SIDE_EFFECT_OR_MAPPING=6`、`EMPTY=26`、`OTHER=2`。implementation tree 的最终 reconciliation 为 505/274/1,151；F 为 42 个文件/151 个 handler，shape 为 `DIAGNOSTIC=42`、`ASSIGNMENT_MAPPING=18`、`RETURN_OR_FALLBACK=16`、`PROPAGATE_OR_RETHROW=54`、`SIDE_EFFECT_OR_MAPPING=21`、`EMPTY=0`、`OTHER=0`，parse diagnostics 为 0。新增 13 个 handler 仅位于 metadata migration (+3)、operational-store migration (+2)、offline smoke cleanup (+1)、alpha package verifier (+3)、packaged DOCX verifier (+2)、packaged Playwright verifier (+2)，分别用于主错误保留、稳定 outcome、受控 cleanup 或 fail-closed provenance/package evidence；未新增 writer、第二状态机、schema 或兼容旁路。

本包已闭合：migration 的 `NEEDS_REPAIR`、lock/lease、rollback、partial/uncertain/operator action；package/manifest/provenance unreadable 或不可验证时的 fail-closed；release/operator result 与实际 HEAD/sourceState/command 的绑定；cleanup failure 与主业务错误隔离；以及 CLI/diagnostic 的稳定 code 与敏感信息屏蔽。F 的 26 个 baseline `EMPTY` 与 2 个 baseline `OTHER` 均已在 authoritative inventory 中逐项解释并清零。M06-G 已完成 combined audit、全量 reconciliation 与最终 clean-HEAD full gate；当前 `M06=COMPLETE`、`Maintenance 10.5=COMPLETE`，Ticket 25 继续 `PENDING/blocked/not started`。

## M06-G final closure

M06-G 的完整 provenance、combined Primary Audit、blocking remediation、bounded re-audit、authoritative AST ledger、故障矩阵、最终 clean-HEAD 命令与未跑项见 `handoffs/M06-G-closure-audit-and-clean-head-evidence.md`。本节只保留调度结论：所有 M06 gate 已满足，M06 与 Maintenance 10.5 标记 `COMPLETE`；Ticket 25 保持 `PENDING`/blocked/not started；本 closure 后停止等待集成，不自动启动后续任务。
