# 07 — CI、release checklist 与阶段交接

**What to build:** 每次提交都能执行固定名称的全局门禁，覆盖 Auth、迁移/备份、故障注入、诊断静态检查和 production directory smoke；release 证据包能复现 commit、schema、迁移、备份和制品状态，并明确哪些人工验收仍阻塞正式发布；阶段 8 可以直接从交接入口继续。

**Blocked by:** None for repository automation. Formal release still depends on the human gates listed in `auto—publish/docs/release-checklist.md`.

**Status:** completed — required CI contracts, evidence generation, and handoff documentation are in place; the generated evidence remains `BLOCKED_RELEASE` until human gates pass.

## Scope

- 将阶段 7 的自动化证据接入 Root CI，保持 Node 24 desktop 与 Node 22 Auth 容器/服务测试矩阵。
- 固定 required check 名称和执行顺序，收集测试发现清单、迁移 roundtrip、故障注入摘要、诊断静态检查和 production directory smoke。
- 建立 release checklist/evidence manifest，记录 commit、schema version、migration report、backup verification、制品 hash、人工平台/TLS 验收、回滚包和阻塞项。
- 将运维命令、RPO/RTO 决策、health 语义、限速容量、HTTPS 状态、diagnostic schema 和阶段 8 入口写入交接资料。

## Module boundaries

- **CI workflow:** 只编排固定 job、Node 版本、依赖安装和命令；不把业务判断写进 YAML。
- **Verification scripts:** 每个脚本只负责一种证据（test discovery、migration roundtrip、fault summary、package smoke、legacy absence）。
- **Evidence manifest writer:** 只汇总已完成命令的安全摘要和 hash；不读取 secrets、正文或原始日志。
- **Release checklist validator:** 只检查必填字段、required check 名称和人工 gate 状态；不自动批准 release。
- **Handoff document:** 只引用 evidence manifest、未决项和下一阶段入口；不复制实现细节或原始错误。

脚本和 validator 保持单一职责，约 200 行为软上限；复杂的证据收集按命令拆分，避免一个“全能 verify”脚本隐藏失败来源。

## Acceptance criteria

- [x] Root CI 固定运行全量门禁、Auth 容器测试、migration roundtrip、backup/restore fixture、限速容量测试、诊断/legacy 静态检查和 production directory smoke。
- [x] required check 名称稳定并写入 release checklist；`.js` 与 `.mjs` 测试都被收集，CI 输出实际收集清单。
- [x] CI 不注入生产 secrets、不访问真实 Auth 数据库、内容库、供应商、Cloudflare、Tunnel 或付费服务；外部 E2E 是单独人工受控 job。
- [x] 证据 manifest 记录 commit、应用/Auth schema、migration report、backup destination verification、制品 hash、self-test 结果和回滚包位置；没有报告时保持 `PENDING_HUMAN`，不会伪造通过。
- [x] release checklist 明确平台 endpoint/TLS、代理来源、签名证书、安装器/ACL 和真实部署 owner 的验收状态。
- [x] 缺少签名变量、生产 DNS/证书、外部 E2E 或人工 TLS 验收时只阻塞正式 release，不使本地代码门禁回退或默认放宽安全策略。
- [x] 失败演练能返回安全摘要和 diagnosticId；不会把原始错误、路径、密钥、Cookie、正文或截图写进 artifact。
- [x] 交接资料包含 Auth RPO/RTO 决策、备份/恢复命令、health 语义、限速容量、HTTPS 状态、diagnostic schema、制品 smoke、required checks、release blocker 和阶段 8 入口。
- [x] 最终 CI 运行记录可被离线复核；任何人工项均标记为 `PENDING_HUMAN`/`BLOCKED_RELEASE`，不能被自动化结果伪造为完成。

## Evidence

- Root test suite: 228 test files, 1477/1477 passed.
- Auth tests: 45/45 passed; migration tests: 56/56 passed; diagnostics tests: 32/32 passed; link-contract tests: 180/180 passed.
- `npm run test:packaging` (42 tests), `npm run lint`, and the expanded `npm run format:check`: passed.
- CI now exposes stable `required/*` job and step names for Node 24 desktop, Node 22 Auth, link security, migration, backup/restore, rate-limit capacity, diagnostics, and production directory smoke. The release-evidence job depends on all three required jobs and validates with `--allow-blocked` so human blockers remain visible.
- `build/release-evidence-manifest.json`: all automated required checks are `PASSED`; manual gates, migration report, backup/restore report, and rollback package remain explicitly pending. It also records `sourceState.status` and a hash of the porcelain state; dirty local evidence cannot become release-ready, so `releaseState` is `BLOCKED_RELEASE`.

## Implementation notes

- 保持 Core/Application/Renderer interfaces 冻结；本 ticket 只连接已有命令和证据，不改变业务运行时契约。
- CI 失败应按 ticket/证据类型分组，避免“全局 verify 失败”掩盖具体边界。
- release checklist 不代替真实 owner 验收；尤其是媒体 HTTP 风险、Cloudflare/Tunnel 来源头、TLS、签名和安装器行为。
