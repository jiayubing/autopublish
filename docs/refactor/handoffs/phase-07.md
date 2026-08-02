# Phase 7 Handoff: Auth / Build / Observability

- 状态：`COMPLETE`（代码与仓库自动化已收口）。
- 正式 release：`BLOCKED_RELEASE`；人工环境、签名、回滚和干净提交证据仍未满足。
- 日期：2026-08-02 Asia/Shanghai。
- 实施起点：分支 `codex/refactor-program`，HEAD `faf92c2cc96edebbc2963940b45c5ef335bb8287`；完成点为包含本 handoff 的 Phase 7 closeout commit。
- 启动时工作树为 clean；本 handoff 随 Phase 7 closeout 一并提交。提交前生成的本地 release evidence 保留 `sourceState=DIRTY`，不得当作 closeout commit 的正式发布证据。
- Core / Application / Renderer interfaces 保持冻结；Phase 8 handoff 未创建或修改，Phase 8 cleanup、全链验收和 release 批准未执行。

## 完成范围

- Root `.github/workflows/ci.yml` 固定 Node 24 desktop、Node 22 Auth service/container/verification、desktop security、link security 和 release-evidence jobs；CI 只安装依赖并调用脚本，不执行业务判断。
- desktop job 运行 `.test.js`/`.test.mjs` discovery、无 packaging contract 重复的 desktop core suite、迁移、toolchain、packaging、production directory smoke 和 production archive legacy absence；`required/root-tests` 与 `required/packaging-contracts` 合计覆盖完整桌面测试。
- Auth verification 拆分 migration roundtrip、backup destination/restore-check、health semantics 与 rate-limit/trusted-proxy capacity，避免 `verify.js` 与全量 runner 重复执行。
- verification scripts 各自产生一种安全摘要：test discovery、Auth migration、backup/restore、Auth test summary、Linux container smoke、production package/offline smoke 和 legacy absence。
- `create-release-evidence-manifest.js` 只聚合结构化输入、版本、相对 artifact 标识和 SHA-256；`validate-release-checklist.js` 只验证 schema、固定 check 名称、状态和人工 gate，不批准 release。
- Auth Dockerfile 固定 Linux Node 22 runtime；container smoke 使用无网络、只读 root、临时 `/data`/`/tmp`、drop capabilities、`no-new-privileges` 和 `CI_SYNTHETIC_ONLY=1`。

## 自动化证据

| 证据 | 结果 |
| --- | --- |
| `npm test` | 228 个测试文件、132 suites、1488/1488 pass、0 fail；一个既有 Electron focus case 由自身条件显式跳过，未造成失败 |
| `npm run test:desktop-core` | CI root-tests 的 224 个非 packaging contract 测试文件、130 suites、1442/1442 pass；四个 packaging contract 文件由独立 required check 执行，避免重复 |
| `npm --prefix auth-server test` | 47/47 pass、0 fail、13 suites；包含迁移 session 登录/refresh 与跨进程持续 WAL writer 的 100 次一致快照回归 |
| `npm run test:discover` / discovery writer | 228 files：216 `.test.js`、12 `.test.mjs`；摘要写入 `build/evidence/desktop-discovery.json` |
| `npm run test:migration` | 56/56 pass |
| `npm run test:packaging` | 46/46 pass，包含 release evidence tests |
| `npm run test:diagnostics` | 32/32 pass，包含结构化诊断、脱敏、轮换/容量和 legacy source contract |
| `npm run test:media-transport` | 9/9 pass，覆盖 HTTP confirmation、3xx、TLS、timeout 和敏感 body 不发送 |
| `npm run test:links` | 181/181 pass；link capability 为 file-symlink=yes、directory-junction=yes |
| `npm --prefix auth-server run test:health` | 9/9 pass |
| `npm --prefix auth-server run test:rate-limit` | 9/9 pass，覆盖 trusted proxy、100k identity、TTL/LRU 和 restart |
| `npm run lint`、三套 typecheck、`npm run format:check` | 全部 pass |
| `npm run build:renderer` | TypeScript lint pass，Vite 2157 modules built |
| `npm run build:preload` | pass，preload `226527` bytes |
| dirty production directory smoke | 非签名 `--dir` 构建 pass；13 项 artifact，Electron main/preload/renderer、Playwright、migration CLI、workspace schema 和 storage boundary pass；Hepan 未提供可选 Python，状态 `SKIPPED_OPTIONAL` |
| legacy archive absence | 当前 production `app.asar` 1737 entries，`publish-log`/命名 legacy paths 命中 0 |
| CI contract / evidence / checklist tests | `node --test tests/ci-workflow-contract.test.js tests/release-evidence.test.js tests/packaging-runtime.test.js` 为 12/12 pass；正式 release validator 在 blocked manifest 上按预期拒绝，`--allow-blocked` pass |
| `git diff --check` | pass |

本机没有 Docker executable，因此 Auth Linux/container job 未在本机执行；workflow、Dockerfile、container smoke 和无生产 secret contract 已静态验证。该本地环境限制不会改变 Root CI 的 required job 定义。

## Evidence manifest

- `build/production-artifact-manifest.json`：application `1.0.1`、workspace schema `1`、13 个 production artifact/resource 条目；每项只包含相对 path、location、bytes、version 和 SHA-256。
- 提交前的 `build/release-evidence-manifest.json`：manifest version `1`、commit `faf92c2cc96edebbc2963940b45c5ef335bb8287`、application `1.0.1`、Auth schema `2`、workspace schema `1`、source state `DIRTY`；它是本地诊断证据，Phase 8/正式 release 必须针对 closeout commit 重新生成。
- manifest 固定列出 16 个 CI subchecks、12 个 manifest human gates、migration/backup/auth/container/discovery/artifact/offline/legacy evidence、rollback 说明和 release blockers；GitHub branch protection 使用 7 个 job display names，不能把 step ID 当作 status check。
- 本地 manifest 的 `required/auth-container` 与 `containerTests` 为 `PENDING_HUMAN`，其余本地 required check 为 `PASSED`；12 个 manifest human gates 和独立 rollback evidence 仍为 `PENDING_HUMAN`；`releaseState` 为 `BLOCKED_RELEASE`。
- offline self-test 的原始结果不进入 manifest；manifest 只保存安全计数、输入 hash、版本和相对 artifact 摘要。对该 manifest 的检查确认没有绝对用户路径、Cookie、API key、token、raw error、正文、DOM 或截图。
- dirty source state 只通过 `sourceState.status=DIRTY` 与 porcelain 摘要 hash 表示，不能成为正式 release evidence。

## Auth RPO / RTO

- 决策：本阶段继续 Node + SQLite 单实例，不迁 PostgreSQL、不引入 HA；生产数据库恢复只能由受控运维命令执行，CI 和 recovery fixture 永远使用临时目录。
- RPO 决策：以已验证的 destination backup 作为恢复点；backup 完成后重新打开 destination，执行普通文件、schema、row/hash 和 integrity 检查。当前没有复制链路，正式 RPO 数值仍由 Auth owner 决定备份频率、destination retention、加密和访问控制，状态 `PENDING_HUMAN`。
- RTO 决策：本阶段只保证 migration、restore-check 和 isolated recovery drill 的可执行路径；真实数据规模下的恢复时限、值班 owner、切换/回滚窗口尚未测量，数值 RTO 为 `PENDING_HUMAN`。
- 未决项：备份 cadence、跨故障域 destination、保留周期、密钥/ACL、恢复批准人、最大数据库规模、恢复演练频率和最后一次人工 drill 记录。未决项阻塞正式 release，不阻塞 Phase 7 代码收口。

## Auth 操作语义

```powershell
node scripts/migrate.js
node scripts/backup.js <source-db> <destination-db>
node scripts/restore-check.js <existing-destination-db>
node scripts/recovery-drill.js --temp-root <system-temp-directory>
node scripts/integrity-check.js <database-path> --timeout-ms 10000
```

- `restore-check` 只接受已存在的普通文件，通过只读 SQLite 连接序列化一致快照后在隔离目录验证；不再逐个复制 DB/WAL/SHM，不存在的路径不会创建父目录、空库或 marker。
- 独立审查确认 v1 session migration 过去使用了与运行时不一致的 device hash，且文件级 DB/WAL/SHM 副本无法承受活跃 writer；两项均已修复。定向 13/13、Auth 全套 47/47，另以双行事务不变量执行 250 次跨进程快照，0 次不一致。
- migration 在目标 schema 和 integrity 验证成功后才提交版本 marker；失败保持 rollback、可重试和 fail-closed。
- liveness（`/healthz`、`/healthz/live`）只证明进程可以响应 HTTP；readiness（`/healthz/ready`、`/readyz`）执行轻量 repository connection/schema probe，不运行 SQLite `integrity_check`。
- integrity 是受控运维命令/worker，带 timeout、cancellation、audit retention/rotation 和 database capacity 诊断；健康响应只返回稳定 code、category、retryable 和 safe metadata。
- limiter 使用 source、identity、combination 三个有界 TTL/LRU bucket；capacity 可配置，默认硬上限为 4096，100k identity fixture 以 128 capacity 验证 entries/expiry metadata 不增长失控。成功登录会清理 identity 状态，重启不恢复内存 bucket。
- proxy 默认 direct-only；只有显式 header、`trustedHops`（1-16）和 `trustedProxyCidrs` 配置且 direct peer 在 CIDR 内时才读取转发来源。裸 boolean trust、未配置 header、spoofed untrusted headers 都 fail-closed。Cloudflare/Tunnel 的真实来源链仍须人工验收。

## Media transport risk

- Media endpoint 必须显式配置；默认不生成公网 HTTP fallback。
- 当前供应商 HTTPS 可用性/生产证书与 hostname 尚未由人工 owner 验收，因此媒体正式状态为 `PENDING_HUMAN`，对应正式 release `BLOCKED_RELEASE`。
- HTTP 仅在精确 endpoint 与显式 `allowInsecure` confirmation 下启用，并持续显示未加密风险；未确认时在 API key 或正文/multipart 创建前拒绝。
- client 不跟随 3xx；TLS hostname/certificate、connect/read timeout 和 server error 保持稳定分类。缺少 TLS、DNS 或供应商验收时不得关闭 ASAR、恢复源码 fallback、隐式降级 HTTP 或放宽 proxy/diagnostic 规则。

## Diagnostics and legacy boundary

- diagnostic record 只允许 `diagnosticId`、时间、稳定 `code`、`module`、`category`、`operationId`/`runId` 和有界 safe metadata；metadata 数量/值长度、token/code 字符集和时间格式均受 schema 限制。
- Renderer 只获得 diagnosticId、固定用户消息和安全状态；不获得正文、Cookie、API key/token、绝对路径、raw exception/stack、DOM、URL credentials 或截图。
- Auth maintenance 默认 audit retention 为 90 天、audit rotation threshold 为 64 MiB；容量/retention/rotation 只输出 safe summary。workspace Doubao diagnostics 只保留最近 20 组，启动和异常清理由目录 policy、regular-file、symlink/path boundary 约束。
- `publish-log` sender/channel/consumer 与命名 legacy paths 已从 source contract 移除；production archive verifier 对当前 `app.asar` 命中为 0。

## Production directory and required checks

- production smoke 使用 `electron-builder.production-smoke.yml` 的非签名 `--dir` 配置，验证真实 `app.asar`、`app.asar.unpacked`、`resources/tools/node`、Playwright CLI、Hepan unpacked script、migration CLI、workspace schema、storage boundary 和 Electron offline entry。
- `required/` job display names 固定为：`required/desktop-node24`、`required/auth-node22`、`required/auth-container-node22`、`required/auth-verification-node22`、`required/desktop-security-node24`、`required/link-security`、`required/release-evidence`。
- required check/step IDs 固定为：
  `required/root-tests`、`required/test-discovery`、`required/migration-roundtrip`、`required/toolchain`、`required/packaging-contracts`、`required/production-directory-smoke`、`required/legacy-publish-log-absence`、
  `required/auth-tests`、`required/auth-container`、`required/auth-migration-roundtrip`、`required/backup-restore-fixture`、`required/health-semantics`、`required/rate-limit-capacity`、
  `required/media-transport`、`required/diagnostics-static`、`required/link-security`。
- 这些名字是 branch protection/release checklist contract；后续若必须改名，必须同时更新 workflow、manifest writer、validator、checklist、handoff 和迁移说明。
- CI 不读取生产 secrets，不访问真实 Auth DB、workspace、content library、account、supplier、Cloudflare/Tunnel、posting 或 paid system；container 使用 `network=none`，外部 E2E/TLS/proxy/signing/installer 是独立人工 gate。

## Formal release gates

| 状态 | 项目 | release 影响 |
| --- | --- | --- |
| `PASSED` | 本地/CI 自动 required checks 和安全 evidence | 可进入人工 review，不等于批准 release |
| `PENDING_HUMAN` | Phase 4 四项受控验收：平台账号 remote ID/profile binding、Hepan 断连后的远端核对、媒体 HTTP 风险与测试资源、签名制品中的真实浏览器登录 | 阻塞正式 release，不阻塞 Phase 7 code closeout |
| `PENDING_HUMAN` | production endpoint/DNS/TLS certificate/hostname、Cloudflare/Tunnel source header chain、signing certificate/timestamp、installer ACL/upgrade/rollback/SmartScreen/clean machine、external E2E owner | 阻塞正式 release |
| `PENDING_HUMAN` | rollback package、restore drill owner、Auth RPO/RTO numeric target | 阻塞正式 release |
| `BLOCKED_RELEASE` | 本地 manifest `sourceState=DIRTY`、本机未执行 Docker container、任一 required check/evidence 未取得、签名变量缺失 | 只能阻塞正式 release；不得用 fallback 或安全策略放宽来消除 |
| `NOT_APPLICABLE` | 没有显式 Hepan Python 时 offline self-test 的可选 Hepan check | 不单独批准 release；若目标发布要求 Hepan 能力，必须转为配置后人工/自动验收 |

Signing configuration remains fail-closed: missing `WIN_CSC_LINK` or `WIN_CSC_KEY_PASSWORD` blocks `pack:production`/`dist:production` and does not change ASAR, HTTP, proxy, or diagnostics policy.

## Phase 8 entry

Phase 8 remains `NOT_STARTED`; this ticket does not execute its cleanup, final full-chain acceptance, or release approval. It may start only after:

- the Phase 7 closeout commit containing this handoff exists, and evidence is regenerated against that exact commit before any release decision;
- Phase 7 handoff, Ticket 07 acceptance, progress ledger, fixed required check contract and `build/release-evidence-manifest.json` are available;
- Auth schema `2`, workspace schema `1`, migration roundtrip, backup destination/restore-check, production artifact/resource manifest, offline self-test and legacy absence evidence are reviewable;
- Phase 4 human items remain explicitly `PENDING_HUMAN`/`BLOCKED_RELEASE` if not complete; this does not turn Phase 8 into release approval;
- Phase 8 owner has the phase documents, Phase 3/4/5/6 handoffs, traceability matrix, current package manifest and the unresolved release gate list.

The Phase 8 input is the evidence and decision set above. Phase 8 must perform its own cleanup/final-chain acceptance under its own scope; this handoff does not pre-approve it.

## Boundary statement

All automated work used temporary directories, synthetic SQLite, in-memory fakes, local Electron and offline package resources. No real workspace, content library, Auth database, account, supplier, Cloudflare/Tunnel, posting, paid submission, production service or payment system was accessed.
