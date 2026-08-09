# M05-G handoff — legal static architecture/security/absence/packaging evidence

## 状态与 Git

- 结果：`COMPLETE`。
- Base：`deae15de4346c5588df5c7f90e46ee3b6760fbdc`（M05-F Final clean HEAD；启动时已核对 clean）。
- Final：本 handoff 与 implementation/evidence 一并提交；提交后以真实 `git rev-parse HEAD` 和 clean `git status --porcelain` 为最终 Git evidence。
- Next：`M05-H`。本任务未启动 H/I/M06，未创建子代理或并行线程。

## 范围与结论

本包只收敛合法 architecture/dependency、security、retired-capability/legacy-absence、packaging/release/CI/discovery static evidence。没有修改 production behavior、migration allowlist 语义、Renderer/IPC/store/adapter implementation、runner policy/concurrency/timeout、依赖版本或真实外部系统。

Final inventory 为 248 files（231 JS / 17 MJS）、1,687 declarations；M05-G=259，其中 179 `RETAIN_BEHAVIOR`、34 `RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION`、46 `RETAIN_STATIC_GUARD`。G 与全局 `REWRITE_PUBLIC_BEHAVIOR` residual 均为 0。manifest=`92f42b0fa74c5c2fbe5cc5baa9dc1dda186ea62e48951ff208dc0c738a921c9d`，discovery=`4703caa064cbd3036cb97eba0f66ff4efcc7451fc645f366843850454ab4822f`。

## Retained / narrowed static rows

下表是 46 条 final static rows 的唯一 primary classification。inventory 中 `security；packaging` 等多 signal 只是关键词命中；实际 owner 由“失败时证明哪个边界被破坏”确定，不建立第二事实 owner。

| Primary category | Final rows / files | Verification owner 与精确目标 | 保留理由 / failure meaning |
| --- | --- | --- | --- |
| `architecture/dependency` | 12：`architecture-seams` 4、`phase-01-architecture` 3、`phase-03-composition` 1、`phase-05-production-seams` 2、`phase-08-cleanup-gates` architecture row 1、Renderer slice import row 1 | `verify-phase-08-gates` + narrow seam tests；production roots/import graph、OperationalStore internal/facade importer allowlist、single assembly paths、Renderer→bridge/feature boundary | 失败表示 forbidden import、第二 assembly/writer、retired implementation edge 或 required owner/path 缺失；不证明业务状态转换。 |
| `security` | 7：`electron-security` 3、`j4125-auth-contract` 1、`workspace-paths` 3 | Electron sandbox/context isolation/navigation/window/CSP；auth-server local-data isolation；explicit app/workspace roots 与 secrets-free error | 失败表示 sandbox/auth/path/diagnostic isolation 回退。`auth-local-data-boundary` 的 public request behavior 另作为 security behavior gate保留，不算 static row。 |
| `retired-capability/legacy-absence` | 7：migration-package exclusions 2、retired submission/content-store seams 2、canonical legacy fail-closed matrix 1、renderer artifact absence 1、Ticket 24 classification 1 | `verify-legacy-absence`、`verify-ticket-24-e-absence`、`verify-renderer-contract-absence`；exact retired paths/tokens/capabilities/channels/DTO fields、source/ASAR，migration-only allowlist | 失败表示已退休能力重新可达，或 migration/storage compatibility 越出 allowlist。Ticket 24 allowlists 原样保留且 source/package fault fixtures fail closed。 |
| `packaging/release/CI/discovery` | 20：`desktop-packaging` 19、`desktop-workbench-flow` 1 | alpha/production config、required packaged paths、private/runtime-data exclusion、React dist entry、runtime/tool/license contracts | 失败表示 package surface、private-data exclusion、artifact/runtime identity 或 release contract 回退。另由 production packaging、CI workflow、discovery/inventory contract behavior gates证明配置可执行性。 |

### Narrowed rows

- 原 `T-4bc4faf162` 收窄为 `T-bf2a4ef60f`：删除 attention/private method、snapshot 字段与 UI 状态源码形状，改为精确 import graph、workspace assembly path 和 retired path absence。
- 原 `T-f616f81555` 收窄为 `T-d949dc704b`：删除 revision/cancellation/workflow 私有字段和 JSX prop 形状，改为 production registry capability + service→IPC→feature assembly path。
- `phase-05-production-seams` 只保留 unique assembly/retired injection/package exclusion；identity fallback、ArticleEditor session 调用序列、App mutation method shape 已退休，由 E1/A/B public behavior evidence承担。
- OperationalStore reverse dependency 与迁移后 runtime path 从重复 `phase-02`/`phase-08` 全树扫描集中到 `verify-phase-08-gates`；facade import 同时接受 extensionless 与 `.js` specifier，并用精确 importer allowlist fail closed。

## Retired / replacement evidence

共退休 22 条 declarations，新增 1 条 canonical legacy source/package fault matrix，净减少 21 declarations / 6 test files。

| Retired set | Disposition / replacement evidence |
| --- | --- |
| `T-e0902f6eab` React workbench source-shape | 由保留的 public media/content feature snapshot、`renderer-publication-history` observable render 与 workspace feature tests 覆盖；不再用 component 名称字符串证明用户流程。 |
| `T-d1ddf9f7bc` queue-group JSX/source-shape | 由 `phase-08-platform-media-settings-workspace-renderer-slice` 的 public queue-group command/read-model matrix（start/pause、manual pause、stale query）覆盖。 |
| `T-d0c56689b6`、`T-4f0ee85dda` module line-count advisory/baseline | 退休且不伪装成 architecture guard。行数与 baseline registry 不属于允许的 dependency/security/absence/package 类别；模块质量仍由 owner、接口、依赖和公开行为审查，不需要等价行数测试。 |
| Phase 5 三条 identity/editor/media private source shape | 由 `article-mutation-coordinator`、generation handoff、`article-editor-session` 与 media feature public behavior matrices覆盖；没有删除业务行为 evidence。 |
| `phase-02-architecture`、`phase-08-reverse-dependencies` 共 4 条重复 graph scan | 收敛到 `verify-phase-08-gates` 的 dependency、OperationalStore importer allowlist、required/retired path reports；current-tree gate + exact helper fault assertions均保留。 |
| `legacy-submission-path-audit`、`phase-03-runtime-no-legacy-ledger`、`phase-03-remote-order-legacy-path-absence`、`phase-06-legacy-path-absence` 共 11 条 historical scan | 收敛到 `verify-legacy-absence` 的 exact path/token/source/package owner；新 fault matrix逐项注入 7 个 retired source capabilities 并注入 ASAR remote-order token。package freshness/hash 由 packaging/release evidence owner承担。 |

未删除 Ticket 24 required absence、Renderer contract artifact absence、private-data/package exclusion、Electron sandbox/CSP、auth local-data boundary、CI/discovery contract 或 migration reader behavior tests。

## Gates / evidence

- Legal static owner suite（21 files）：110/110 passed；覆盖 architecture seams、migration exclusion、desktop/production packaging、Electron/auth security、Phase 8 canonical gates、Renderer artifact absence、Ticket 24、workspace path、CI、discovery/inventory contract。CI stale-reference finding 修复后，受影响 CI/discovery/inventory 10/10 direct regression另行 PASS；未受影响的其余 suite 无需重新开启 full review。Phase 8 symbol reachability仍基于 129-capability production program，无源码字符串替代业务 behavior。
- `npm run test:packaging`：52/52 passed；只运行 synthetic/package contract tests，没有构建或发布真实产物。
- `npm run test:legacy-absence`：PASSED，sourceMatches=0，archive 未提供时明确为 `NOT_APPLICABLE`；synthetic ASAR fault coverage由 static owner suite提供。
- `npm run test:ticket-24-e`：PASSED；3 retired capabilities、2 channels、DTO/Renderer/runtime vocabulary 与 migration-only allowlist全部 fail closed。
- `npm run test:discover`：248 files。
- `node scripts/test-inventory.js --output $env:TEMP\m05-g-final-inventory.md`：248 files、1,687 declarations，G/global rewrite residual=0。
- Prettier affected check：passed。
- `git diff --check`：passed。

所有测试只使用 current source/config、temporary directories、synthetic ASAR、fake transport/runtime；没有真实登录、投稿、付费、取消、上传、生产数据库、构建、打包或发布。

## Primary review / bounded re-check

Primary review scope 仅为本包 diff、G row classification、canonical graph/absence/package roots、Ticket 24 allowlist 与上述 gates。检查 unique owner、allowlist fail-closed、source/package absence replacement、business-static residual、package/CI/discovery stale references及是否触及 H boundary。

Implementation self-check 曾发现 OperationalStore facade import matcher初版只匹配带 `.js` 的 resolved path；提交审查前已修复为两种 specifier均识别，并加入 exact helper regression。

Primary review 发现并关闭 1 个 `P2 / INTRODUCED_BY_CHANGE`：canonical ASAR token scan初版会扫描第三方 `node_modules`，可能把依赖内部同名 token误判为应用 retired capability。修复为只扫描 app-owned `desktop/`、`src/`、`scripts/`、`build/preload/`、`media-workbench/dist/` 与 `package.json`，并加入含同名 vendor token 的 synthetic ASAR regression。

Bounded re-check 的 stale-reference gate 又关闭 1 个 `P1 / INTRODUCED_BY_CHANGE`：alpha artifact CI 仍调用已退休的 historical test，实际 CI 会因文件不存在失败。直接 consumer 改为对 alpha ASAR 执行 canonical `verify-legacy-absence`，并增加 CI contract exact-command assertion。复查只覆盖两个 findings、修复 diff、canonical source/package absence、110-test legal static suite、修复后的 CI/discovery/inventory 10-test direct regression、format 与 diff gate；全部 PASS，未触发公开合同/schema/owner/副作用 escalation。

## Exceptions / environment

- 初始 root 与 `media-workbench` 缺少 `node_modules`；分别执行锁文件 `npm ci --ignore-scripts` 后验证。root npm 报告 5 个既有漏洞（1 moderate、4 high），Renderer npm 报告 2 个 high；未执行 upgrade/`npm audit fix`，依赖升级不属于 M05-G。
- 一次定向测试在嵌套 TypeScript 依赖安装前因 `MODULE_NOT_FOUND` 失败；补齐锁定依赖后完整重跑并 PASS，不计为 gate PASS。
- 未运行完整 `npm test`、真实 `pack:*`/`dist:*`、M05-H runner parity/process cleanup、M05-I combined audit 或 M06；这些明确不属于 G。

## Do-not-touch / next

下一且唯一后续项是 `M05-H`。H 只可基于本包稳定后的 248-file final set处理 runner/discovery/after-inventory/process cleanup；不要回头修改 A–F behavior owner、G canonical allowlists、production、Renderer/IPC/store/adapter implementation，不要在 H 重新引入 module-size/source-shape业务断言，也不要启动 I/M06 或真实外部操作。
