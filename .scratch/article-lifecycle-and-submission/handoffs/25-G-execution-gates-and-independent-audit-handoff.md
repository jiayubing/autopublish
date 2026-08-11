# Ticket 25-G — Execution Gates & Independent Audit Handoff

**状态：** `Ticket 25 execution ready for independent audit`（仅 25-G execution/package closure；不代表 Ticket 25 或 Wave 11 `COMPLETE`）

**记录时间：** 2026-08-12（Asia/Shanghai）

## 范围与停止边界

本包严格执行 25-G execution gates、必要的真实 owner 修复、generated evidence 汇总和 Independent Audit Handoff 材料。没有执行 Independent Combined Audit、finding remediation、bounded re-audit、正式 clean smoke、merge/integration、真实登录、真实平台发布、真实付费、真实订单刷新/取消、图片上传、生产数据库操作或 push。

图片能力继续严格保持 `DEFERRED_IMAGE_EXTENSION`。自动化只使用 synthetic data、isolated workspace/backup、fake/in-memory transport；没有实现 Ticket 18–21 图片链，也没有把空图片清单伪称为图片能力通过。

## Git、worktree 与 provenance

| 项目 | 事实 |
| --- | --- |
| Base integration HEAD | `4c9dfe577f8e963006e7dd0a00859170e77fae23`，主任务持有的 integration branch/worktree 仍以该基线为准 |
| 本执行 worktree | `C:\Users\violet\.codex\worktrees\8c4c\官媒投稿-refactor`，detached HEAD；未创建分支、未夺取主任务 branch |
| Implementation commit | `fa96f0868bb4ddff07ddd33fb632276a03044335` — `fix: close Ticket 25 packaging execution gates` |
| Docs/evidence commit | 本 handoff 与 Wave Plan 更新随最终 docs commit 提交；该 hash 由最终 Git 状态返回，不在本文件中自引用 |
| Tracked contract/evidence ancestry | 25-F 已由主任务集成到 `72ba6e136977f089405e9a1993747e368e0f8615`；唯一 story/state matrix、query budget、evidence manifest 与 F responsibility facts 均沿用，不创建第二份 |
| 最终本地状态 | docs commit 后应为 clean；不 merge、不 push，等待主任务核验和集成 |

G generated evidence 在 implementation commit 前的精确执行 sourceState 上生成：`commit=4c9dfe577f8e963006e7dd0a00859170e77fae23`、`status=DIRTY`、`diffSha256=1b3193963dfc7006e8d85399ccb99677cba78417763889f7263f6d84d21ff676`、`changedEntries=4`、`stagedEntries=0`、`unstagedEntries=4`、`untrackedEntries=0`。随后只提交了 evidence 已覆盖的同一 4 个实现/测试文件和 docs-only 状态文件；没有在最终 evidence 后再修改 production source、schema、关键行为测试或 gate。generated evidence 保持 ignored，不提交到 Git。

## 25-G 真实 owner 修复

G 首轮 gate 暴露 3 个可定位问题，均已在真实 owner 闭合，并按受影响边界直接回归和完整 G gate 重跑：

1. `scripts/migrate-content-library-v2.js` 被 production `extraResources` 作为单文件 CLI 复制，却顶层依赖仓库专用 `release-evidence-inputs.js`；包内 dry-run 因 `MODULE_NOT_FOUND` 失败。CLI 改为仅在源码仓库运行时按需加载 Git provenance，在 `AUTO_PUBLISH_PACKAGED=1` 或相邻 production manifest 的安装资源运行时跳过仓库专用 provenance，迁移行为保持不变。
2. `scripts/verify-legacy-absence.js` 将 ASAR entry 规范化为 `/` 后直接交给 Windows `@electron/asar.extractFile`，production electron-builder archive 的反斜杠 entry 因此被误报 unavailable。读取时改用 `path.normalize(entry)`，报告和 legacy 匹配仍使用安全的 `/` 相对路径。
3. `scripts/verify-phase-08-gates.js` 的敏感字段正则把 `hasApiKey: "boolean"` 的 `apiKey` 子串误报为凭据。增加标识符边界；真实 `apiKey: "<value>"` fixture 仍由 package boundary gate 拦截。

回归测试新增在 `tests/content-library-migration.test.js`，覆盖 packaged-mode migration CLI dry-run；既有 Phase 8 sensitive fixture 继续验证真实敏感值不会被放行。

## Tracked contract、matrix 与 responsibility evidence

- 唯一 `25-a-story-matrix.json`：85 stories、95 rows；10 个图片 portion 均保持 `DEFERRED_IMAGE_EXTENSION`，没有把 deferred 或 inventory 写成 acceptance PASS。
- 唯一 `25-a-state-matrix.json`：21 个有限状态/故障 case，覆盖 success/failure/uncertain/duplicate/stale/reordered/restart/first-wins/late observation/delete-restore race；未创建第二 state matrix。
- 唯一 `25-a-query-scan-budget.json`：`ticket-25-a-query-scan-budget-v1`，3 operations、固定 fixture、warm-up 2、measured 7、query/scan hard budget；未修改预算或 wall-clock baseline（仍 `NOT_APPROVED`/observation-only）。budget hash：`d6d5d238f7b7548b643dd9f84dfb1624ec7f743e04fdce99d2fdab9cfee7dfe9`。
- 唯一 `25-a-evidence-manifest.json`：17 tracked artifacts、5 generated artifact definitions、4 responsibility facts；F responsibility disposition 仍为 `FACTS_FOR_INDEPENDENT_AUDIT`，不是本执行线程的 architecture PASS。
- F benchmark 当前 contract input hashes：story matrix `b71cfe154bf7ee4a965e178aa0da7ea9d243c639b1005f879d0163bcd74dee7e`、state matrix `284976e412bababd5ac44035a85c28a747fa3f63b7e5ffd2616819b67b77171d`、evidence manifest `b16cb143b934831de9341ed674ddbb7d35177be3d0d961ed1ebde6ea3ac3b2fc`。

## 实际运行的 G gates 与结果

环境：Windows `win32/x64`，Node `v24.16.0`，npm `11.13.0`；依赖使用 `npm ci --ignore-scripts --no-audit --no-fund` 安装；自动化环境 `CI_SYNTHETIC_ONLY=1`。Electron focus regression 以既有测试合同要求的 `RUN_ELECTRON_FOCUS_TESTS=1` 显式启用。

| 命令/门禁 | 实际结果 |
| --- | --- |
| `npm test` | 最终 `255` test files，`1877/1877 PASS`，`0 failed/skipped/cancelled/todo`；包含新 packaged migration regression 和 Electron synthetic focus test |
| `npm run test:discover` | `255` files（238 `.test.js`、17 `.test.mjs`）；`ticket-25-test-discovery.json` PASS |
| `npm run test:ticket-25-a -- --output build/evidence/ticket-25-a-contract.json` | PASS；85 stories、95 rows、21 state cases、10 deferred image rows、17 tracked artifacts、4 responsibility facts；sourceState 为上述 `4c9dfe5 + DIRTY` |
| `npm run benchmark:ticket-25-a -- --output build/evidence/ticket-25-a-benchmark.json` | `OBSERVED_NOT_A_FINAL_GATE`；7 queries/7 scans，hard budget `8/8`，external transport `0`；p50/p95 仅 observation |
| `npm run benchmark:ticket-25-f -- --output build/evidence/ticket-25-f-benchmark.json` | `OBSERVED_NOT_A_FINAL_GATE`；article management `7/7` ≤ `8/8`，regular queue `1/1` ≤ `6/6`，paid order `1/1` ≤ `6/6`，external transport 全部 `0`；p50/p95 仅 observation |
| `npm run test:production-ipc-matrix` | `33/33 PASS`，129 production capabilities；typed IPC symbol identity、unknown fields、unsafe/raw errors 和 event disposal 均通过 |
| `npm run test:media-transport` | `9/9 PASS`；HTTP/TLS/timeout/API-key boundary synthetic checks |
| `npm run test:diagnostics` | `37/37 PASS`；safe diagnostics、sanitization、bounded sink 和 cleanup failure semantics |
| `npm run test:legacy-absence`、`npm run test:ticket-24-e` | source legacy absence PASS；Ticket 24-E absence layers PASS |
| `npm run test:phase-08:gates` / `node --test tests/phase-08-cleanup-gates.test.js` | Phase 8 source gate `4/4 PASS`；依赖方向、唯一 owner、legacy、package boundary 和 generated output checks 通过 |
| `npm run lint`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`、`npm run format:check`、`git diff --check` | 全部 PASS |
| `npm run build:renderer`、`npm run build:preload` | 全部 PASS；Renderer Vite build 和 bundled Preload boundary 通过 |
| `npm run test:capacity` | `13/13 PASS`；runtime/migration/Renderer capacity synthetic checks |
| `npm run test:links` | `190/190 PASS`；link-security strict gate 通过 |
| `npm run test:packaging` | `47/47 PASS` |
| `npm run pack:alpha:dirty` + alpha focused tests | alpha package build PASS；artifact/retired capability tests `5/5 PASS`；alpha archive legacy absence PASS |
| `npm --prefix auth-server test`、`test:health`、`test:rate-limit` | `63/63`、`9/9`、`9/9 PASS` |
| auth migration/backup synthetic evidence | `ticket-25-auth-migration-roundtrip.json` 与 `ticket-25-auth-backup-restore.json` 均 PASS，均为 `count=3/pass=3` |
| `npm audit --omit=dev --audit-level=high` | PASS，生产依赖 `0 vulnerabilities` |
| `npm run pack:production:smoke:dirty -- --output build/evidence/ticket-25-production-smoke-dirty.json` | PASS；专用 dirty smoke，未生成 clean smoke；11 checks 中 10 passed、1 optional Hepan check skipped，无 failed check |
| packaged `node scripts/verify-phase-08-gates.js --resources release-production-smoke/win-unpacked/resources --output build/evidence/phase-08-gates.json` | PASS；dependency、OperationalStore boundary、unique owners、129 capabilities、legacy absence、package boundary 全通过 |
| packaged `node scripts/verify-legacy-absence.js --resources release-production-smoke/win-unpacked/resources --output build/evidence/legacy-publish-log.json` | PASS；source/archive matches `0`，archive entries `1938` |

首轮完整 runner 因未先生成 `release-alpha` 产物出现 `1873/1875`（两个 artifact-dependent tests）；按 CI alpha artifact gate 生成后直接回归 `5/5`，最终完整 runner 以显式 Electron synthetic opt-in 为 `1877/1877`。首轮 dirty smoke 的 migration CLI failure、Windows ASAR path failure 和 `hasApiKey` boundary false positive 均已记录、修复并重跑；没有降低断言、放宽预算、提高 timeout 或排除测试。

## Generated evidence provenance

以下文件均位于 ignored `auto—publish/build/evidence/`，没有提交到 Git：

- `ticket-25-a-contract.json`：PASS，精确 commit/sourceState/Node/command/environment。
- `ticket-25-a-benchmark.json`：query/scan hard gate PASS，wall-clock observation-only。
- `ticket-25-f-benchmark.json`：三项 F batch/projection operation 的 hard budget PASS，wall-clock observation-only。
- `ticket-25-production-smoke-dirty.json`：Ticket 25 专用 dirty JSON，status `PASSED`，artifactCount `13`，checkCount `11`，`production-smoke.json` 不存在。
- `phase-08-gates.json`、`ticket-25-phase-08-gates.json`：packaged/source Phase 8 reports PASS。
- `legacy-publish-log.json`、`ticket-25-legacy-publish-log.json`、`ticket-25-alpha-legacy-absence.json`：source/production/alpha legacy absence reports PASS。
- `ticket-25-test-discovery.json`：255-file discovery report PASS。
- `ticket-25-auth-migration-roundtrip.json`、`ticket-25-auth-backup-restore.json`：synthetic auth verification PASS。

`ticket-25-production-smoke-clean.json` 和 generic `production-smoke.json` 均未生成。dirty smoke 的 `skipped=1` 仅表示 optional Hepan Python smoke 未提供本地 Python path，不是失败；没有真实登录、Python vendor 外部请求或平台操作。

## `DEFERRED_IMAGE_EXTENSION` 清单

唯一 story matrix 中的 10 个 image portions 为：`6.image_extension`、`29.image_extension`、`78.image_extension`、`79.image_extension`、`80.image_extension`、`81.image_extension`、`82.image_extension`、`83.image_extension`、`84.image_extension`、`85.image_extension`。核心 evidence 继续使用 `deliveryMode=text_only`、`images=[]`、`decisionKind=initial`；没有图片 UI、图片传输承诺、图片探索或 Ticket 18–21 adapter 实施。

## `USER_EXTERNAL_ACCEPTANCE_REQUIRED` 清单

以下只生成清单，不执行操作：

1. `user-control:regular-platform-two-groups-text-only`（stories 25）：需要针对这一次两组纯文本验收的单独明确授权。安全身份字段为 `platformAliasA`、`accountProfileAliasA`、`platformAliasB`、`accountProfileAliasB`、`targetAliasA`、`targetAliasB`。风险是产生公开内容；不得上传图片或增加第三目标。前置配置为两个已批准普通平台账号、两篇纯文本 synthetic article、用户可见停止控制、两个目标不得共享同一文章身份。记录安全账号/目标别名、开始/停止时间、队列组顺序、accepted/not-accepted 结果；远端链接只有用户明确授权记录时才保存。出现登录挑战、目标/账号不匹配、任何图片请求、不确定远端结果、意外费用或非文本副作用立即停止。
2. `user-control:website-media-order-status-refresh`（story 64）：需要针对一个已存在订单的单独明确、refresh-only 授权，不等于创建订单授权。安全身份字段为 `supplierAlias`、`orderAlias`、`mediaResourceAlias`、`articleAlias`。风险是暴露供应商状态并可能产生费用/账号后果；不得创建、取消、申诉、支付。前置配置为用户指定的已存在订单、supplier/account 安全复核、只读刷新能力、用户可见停止控制。记录安全 supplier/order/resource/article 别名、本地旧状态、观察到的状态、观察时间、刷新结果和停止原因。订单身份无法核对、刷新具备写能力、供应商要求支付或登录、观察缺失/矛盾时立即停止。

两项均保持 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`；本任务没有访问真实账号、真实 supplier 或真实订单。

## 残余风险与未运行项目

- dev dependency audit（`npm audit --audit-level=high`）报告 5 个已知漏洞（1 moderate、4 high）；CI 将其定义为 non-blocking known-risk report，本任务没有执行越界的 lockfile/依赖升级。production-only audit 为 0 vulnerabilities。
- Docker 未安装，CI 专用 auth-container build/run 未运行；auth-server full/health/rate-limit、migration roundtrip 和 backup/restore synthetic gates 已实际通过。该环境缺口不能被称为 auth-container PASS。
- 未运行 `npm run pack:production:smoke -- --output build/evidence/ticket-25-production-smoke-clean.json`；该正式 clean smoke 必须在独立审计、修复、授权 commit/merge 后的最终 clean integration HEAD 执行。
- 未运行 Independent Combined Audit、remediation、bounded closure re-audit、正式 final clean smoke、release signing/installer acceptance 或任何真实外部验收。
- 25-G 不对自身 diff、架构质量、responsibility manifest 或 Wave 11 状态给 audit PASS；这些材料交给后续独立审计。

## 后续 Independent Combined Audit scope

独立任务应在主任务核验并集成本 implementation/docs package 后，一次性检查：完整 Ticket 25 diff；85-story/95-row matrix 与 21-case state matrix；10 个图片 deferred rows；冻结 query/scan budget 与 F benchmark；A–E behavior evidence；4 个 responsibility facts；唯一 owner/依赖方向；typed IPC；legacy absence；安全敏感字段边界；完整 `npm test`/build/package/dirty smoke provenance；失败修复 diff；以及 clean smoke 命令/输出隔离合同。审计任务只输出 scope、invariants、findings（severity/source）、blocking/deferred、required remediation 和 bounded re-audit scope，不把本 handoff 或 dirty smoke 解释为自身 audit PASS。

**结论：** 25-G execution/package 材料已准备好供独立审计；Ticket 25/Wave 11 仍未 `COMPLETE`，主任务需要先核验 `fa96f08`、本 docs commit、clean worktree 和 evidence provenance，再决定集成与后续独立审计调度。
