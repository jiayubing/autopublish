# M06-F — Operator / Release / Migration Scripts Cleanup

> 日期：2026-08-11。本文记录 M06-F 在隔离 worktree 中的完整实施、验证、Primary Audit、bounded re-audit 与交接。authoritative F 全量 AST ledger 与 baseline `EMPTY`/`OTHER` 清零证据见 `M06-0-authoritative-residual-silent-failure-inventory.md` 的第 9 节；本文不与该 inventory 竞争范围真源。

## 1. Scope、HEAD 与边界

- exact parent / integration HEAD：`2c3e97d57c32316b214ce8cbfc1f2281a4f1a0dd`。
- preflight：`git rev-parse HEAD` 精确匹配；`git status --porcelain=v1` 为空；无 staged changes；无重复 M06-F handoff。
- final source state：提交后通过 `git status --porcelain=v1` 验证为 `CLEAN`；最终 `HEAD` 与 `HEAD^` 的精确输出由本 handoff 同批 commit 后的交付记录给出，`HEAD^` 必须为上述 parent。commit hash 不自嵌入 handoff（否则会产生自引用 hash）；最终 SHA 以 post-commit Git 输出为准。
- implementation tree 在提交前必然为 `DIRTY`（仅包含本包代码、测试、合同、inventory 与 handoff）；没有把 dirty tree 当作 release PASS。
- 未执行真实登录、真实账号、投稿、发布、付费、取消、上传、生产迁移、生产数据库、Cloudflare/TLS、push、release 或任何外部写操作。所有故障注入使用临时目录、合成数据、内存/假 transport。
- 未启动 M06-G 或 Ticket 25。

## 2. 实施结果

M06-F 覆盖 operator/release/migration scripts 以及其直接 helpers/tests/contracts，未新增旁路 writer、第二状态机、schema 或无必要 wrapper。

- migration scripts：内容库、内容 metadata、OperationalStore、legacy GEO 的失败传播、`NEEDS_REPAIR`、lock/lease、rollback、partial/uncertain、manual operator action 与 cleanup outcome 均显式化；远端/安装结果不确定时禁止盲目自动重试。
- release/operator evidence：package、manifest、artifact、legacy absence、link capability、Phase 08 与 runtime preparation 在 unreadable/missing/unverifiable 时 fail closed；实际 HEAD、sourceState、Node/runtime、command 与 execution provenance 绑定 operator result；无 provenance 的 PASSED report 降为 `PENDING_HUMAN`，不伪造 PASS。
- runtime/package verification：归档 entry、license、CLI、Node、静态资源、ASAR/package content 读取失败不再 `continue` 成功；安装后 provenance 写入失败返回 install `UNCERTAIN` 与 operator action；cleanup failure 不覆盖主业务错误。
- CLI/diagnostic boundary：auth/operator/release/migration CLI 只输出稳定 allowlisted code 或 generic safe text；不输出 token、cookie、key、数据库行、敏感正文、供应商原始异常或不必要的绝对敏感路径。
- tests：补充 migration unreadable input、lease/rollback/after-rename、release provenance、runtime build provenance、missing test source 等窄公开行为/故障注入回归。

实现代码与测试共 48 个文件；本次 docs/evidence 共 4 个文件（Wave Plan、M06 contract、authoritative inventory、本文 handoff），最终单一 commit 共 52 个文件。生成物、node_modules、日志、缓存与运行期 workspace 未纳入提交。

## 3. Authoritative AST reconciliation

命令：

```powershell
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary
```

结果：parse diagnostics `[]`。

| tree | scanned files | files with handlers | all handlers | F files | F handlers | F shapes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| exact parent `2c3e97d57c32316b214ce8cbfc1f2281a4f1a0dd` | 505 | 274 | 1,138 | 42 | 138 | `DIAGNOSTIC=42`, `ASSIGNMENT_MAPPING=4`, `RETURN_OR_FALLBACK=14`, `PROPAGATE_OR_RETHROW=44`, `SIDE_EFFECT_OR_MAPPING=6`, `EMPTY=26`, `OTHER=2` |
| final implementation tree before commit | 505 | 274 | 1,151 | 42 | 151 | `DIAGNOSTIC=42`, `ASSIGNMENT_MAPPING=18`, `RETURN_OR_FALLBACK=16`, `PROPAGATE_OR_RETHROW=54`, `SIDE_EFFECT_OR_MAPPING=21`, `EMPTY=0`, `OTHER=0` |

F 的 151 个 handler 已在 authoritative inventory 第 9 节按文件、行号、AST shape 和最终 disposition 逐项登记。26 个 baseline `EMPTY` 与 2 个 baseline `OTHER` 均有单独清零说明；最终 F 无 `EMPTY`、无 `OTHER`。净增 13 个 handler 只来自 metadata migration、OperationalStore migration、offline cleanup、alpha package verifier、packaged DOCX verifier、packaged Playwright verifier 的显式主错误/cleanup/provenance 分支。

## 4. 实际运行的命令与结果

以下均在最终实现代码变更之后运行；没有把未运行命令写成 PASS。

### 定向行为与直接调用链

- `npm run test:migration`：**67/67 PASS**（content library、content metadata、legacy GEO、phase-02 migration）。
- `npm run test:links`：**189/189 PASS**，含 strict link capability 与直接 content/workspace callers。
- `npm run test:auth`：**63/63 PASS**，含 auth-server 全部 unit/integration tests。
- `node --test --test-concurrency=1 tests/release-evidence.test.js`：**10/10 PASS**。
- `node --test --test-concurrency=1 tests/runtime-tools.test.js`：**3/3 PASS**。
- `node --test --test-concurrency=1 tests/packaged-playwright-runtime.test.js`：**3/3 PASS**。
- `npm run test:packaging`：**47/47 PASS**，含 production/desktop/package/runtime/release evidence contracts。
- `npm run test:phase-08:gates`：**4/4 PASS**，含 current production tree、static owner、legacy absence、package gate。
- changed `.js` files `node --check`：**48/48 PASS**。

### 工程与安全 gates

- `npm run lint`：PASS。
- `npm run typecheck:renderer`：PASS。
- `npm run typecheck:bridge`：PASS。
- `npm run typecheck:main`：PASS。
- `npm run build:renderer`：PASS；Vite 仅报告既有 chunk >500 kB warning。
- `npm run build:preload`：PASS，输出 `build/preload/preload.cjs`。
- `npm audit --omit=dev --audit-level=high`：PASS，`0 vulnerabilities`。
- `git diff --check`：PASS。
- 当前 48 个修改文件的 `prettier --check --end-of-line auto`：PASS。
- 全量 `npm run format:check`：未通过，仅报告 6 个未修改的既有文件：`desktop/services/runtime-diagnostics-service.js`、`src/diagnostics/diagnostic-file-sink.js`、`src/diagnostics/diagnostic-producer.js`、`src/diagnostics/runtime-diagnostic-ipc.js`、`src/diagnostics/runtime-diagnostic-snapshot.js`、`media-workbench/src/types/workspace.ts`。本包未修改这些文件，未用格式化旁路掩盖该 process evidence gap。
- `npm audit --audit-level=high`：未通过，报告 5 个依赖树既有漏洞（4 high、1 moderate：brace-expansion、fast-uri、js-yaml、tar、undici）；本包未修改 package manifest/lock，未执行 `npm audit fix`，避免把依赖升级扩大到 M06-F。

## 5. Primary Audit 与 bounded re-audit

Primary Audit 按 `AUDIT-PROTOCOL.md` 和 code-review skill 执行，范围为 M06-F 全部 production/script/test diff、直接调用方、release provenance 合同、迁移状态/lock/rollback 边界、CLI diagnostics 与上述门禁。审计结论：初次审计发现的阻塞项已修复；bounded re-audit 仅复核修复 diff、受影响不变量和直接回归，没有重新开启无边界 fresh full review。

| finding classification | finding | disposition |
| --- | --- | --- |
| `INTRODUCED_BY_CHANGE` | migration/runtime/package cleanup 可能覆盖主错误、lease/lock 可能误删 replacement、post-rename/install 可能伪装成功 | 已修复：primary error 优先、稳定 cleanup code、identity/token guard、`NEEDS_REPAIR`/`UNCERTAIN`/operator action；migration/runtime/packaging 定向回归与 Phase 08 PASS |
| `CROSS_COMPONENT_INTERACTION` | release evidence、artifact manifest、runtime preparation 之间可能接受 caller 假造的 HEAD/sourceState/provenance 或无 provenance 的 PASSED | 已修复：读取实际 Git HEAD/sourceState/command；provenance 缺失降为 `PENDING_HUMAN`；实际 artifact/release tests 与 packaging 47/47 PASS |
| `INTRODUCED_BY_CHANGE` | archive/package entry unreadable、static runtime read failure、strict capability cleanup 可能被 `continue`/fallback 隐藏而 false PASS | 已修复：fail-closed violation/result，cleanup status 绑定 strict outcome；Phase 08 4/4、packaged runtime 3/3、links 189/189 PASS |
| `INTRODUCED_BY_CHANGE` | CLI catch 输出 raw error、绝对路径或供应商异常 | 已修复：CLI 仅 allowlisted stable prefix/generic text；node-check、lint、定向 auth/release gates PASS |
| `PROCESS_EVIDENCE_GAP` | 全量 format gate 的 6 个 preexisting drift；M06-G 所有 remediation 后的完整 `npm test` 尚未运行 | 非 M06-F blocking；已记录原始命令与原因。M06-G 必须在最终 clean HEAD 运行 full suite/combined audit 后才可关闭 M06/10.5 |
| `EXPOSED_PREEXISTING` | full dev dependency audit 的 5 个既有漏洞 | 非 M06-F owner；生产依赖 audit 已为 0 vulnerabilities，未扩大 package/lock scope |

Bounded re-audit 未发现 P0/P1 或直接影响当前 acceptance、持久事实一致性、幂等/uncertain safety、公开合同或安全边界的 P2；无遗留 blocking finding。剩余风险仅为 M06-G combined closure、full clean-HEAD suite、全量 format baseline 与 dev dependency ownership。

## 6. 未运行项与原因

- 未运行 `npm test`：按 M06 contract 归 M06-G 的最终 clean-HEAD full gate；M06-G 尚未启动，不能提前声称通过。
- 未运行真实 `prepare-runtime-tools` 下载、真实 electron-builder release/production packaging、真实迁移、真实数据库或真实 operator account：用户明确禁止真实外部/生产操作；对应行为使用 synthetic archive、temp Git/workspace、fault injection 和 package contracts 验证。
- 未运行 push、release、production migration、Cloudflare/TLS、付费、投稿或上传：同一安全边界，均保持未执行。
- 全量 format 与 full dev audit 已实际运行但未通过，原始失败项和归类见第 4、5 节；没有将其写成 PASS。

## 7. 状态与后续调度

- `M06-F=COMPLETE`。
- `M06-G=READY`，只允许后续执行 combined audit、blocking remediation、bounded re-audit、authoritative inventory/failure-semantics reconciliation 与最终 clean-HEAD full gate。
- `M06=PARTIAL`；`Maintenance 10.5=PARTIAL`。
- `Ticket 25=PENDING/blocked by M06`，未启动。
- 本包完成后停止，等待主任务集成；不得在本包 handoff 上自行启动 M06-G、Ticket 25、真实发布或生产迁移。
