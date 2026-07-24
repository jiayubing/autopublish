# 重构工程进度账本

> 本文件由每个阶段执行任务更新。规划完成不代表阶段完成。状态只能使用`NOT_STARTED`、`READY`、`IN_PROGRESS`、`BLOCKED`、`PENDING_HUMAN`、`COMPLETE`。

## 1. 当前程序基线

| 项目 | 当前记录 |
|---|---|
| 原审查代码基线 | `master@e8d817847bab3a9e6020006cab35340f645e527f` |
| 重构规划分支 | `codex/refactor-program` |
| 重构规划commit | `dc5265359ca10a866ccd10e56a84314214b7897f` |
| 活跃worktree | `F:\官媒投稿-refactor` |
| 规划日期 | 2026-07-24 Asia/Shanghai |
| 目标形态 | 文件内容 + workspace SQLite运行状态 + Electron/React/Node |
| 当前可执行阶段 | 阶段0 |
| 普通功能开发 | 冻结 |
| 正式release | 冻结 |

重构worktree已从独立规划commit创建；review、optimization、refactor、ADR和领域词汇已纳入该commit。原工作区`F:\官媒投稿`中用户维护的`auto—publish/docs/...`删除和未跟踪旧文档README没有进入重构分支，也不得由后续任务复制、恢复或清理。阶段0开始时必须重新核验当前HEAD和工作区状态。

## 2. 已冻结的架构决定

| 决定 | 状态 | 权威记录 |
|---|---|---|
| 用户创作内容保持文件化 | ACCEPTED | ADR-0003 |
| 运行协调状态迁入workspace SQLite | ACCEPTED | ADR-0003 |
| 串行阶段、单writer切换、无长期双轨 | ACCEPTED | ADR-0004 |
| 普通平台target包含AccountProfileId | ACCEPTED | `01-target-architecture.md`、CONTEXT |
| Electron/React/Node/Playwright保留 | ACCEPTED | `00-program-charter.md` |
| 诊断默认结构化、无原始整页截图 | ACCEPTED | 阶段4/7计划 |
| 删除死publish-log，不新增原始日志UI | ACCEPTED | 阶段7计划 |
| Media production只允许HTTPS | ACCEPTED | 阶段4/7计划 |

## 3. 阶段状态

| 阶段 | 状态 | 开始commit | 完成commit | 自动验证 | 人工验证 | Handoff |
|---:|---|---|---|---|---|---|
| 0 工程基线 | COMPLETE | `bee1b3f24039bb77be0d13d9a663b88e5657e61c` | `0bcbbfcca9ac4baf140359e048f3bf706f7b9526` | canonical本地门禁、静态workflow契约与link安全172/172均通过 | 无；remote/PR/push/required checks为`NOT_APPLICABLE` | `docs/refactor/handoffs/phase-00.md` |
| 1 领域契约 | READY | — | — | Phase 0里程碑与交接已完成 | 不得在本任务执行 | — |
| 2 OperationalStore | NOT_STARTED | — | — | — | 隔离workspace路径需授权 | — |
| 3 PublicationWorkflow | NOT_STARTED | — | — | — | 迁移副本需授权 | — |
| 4 Platform/Adapters | NOT_STARTED | — | — | — | 平台fixture/测试账号/TLS | — |
| 5 Content生命周期 | NOT_STARTED | — | — | — | 内容迁移副本需授权 | — |
| 6 Renderer/IPC | NOT_STARTED | — | — | — | 可访问性手工smoke | — |
| 7 Auth/Build/Ops | NOT_STARTED | — | — | — | RPO/RTO、TLS、签名、release owner | — |
| 8 Cleanup/Acceptance | NOT_STARTED | — | — | — | 全部release门 | — |

## 4. 当前阶段记录模板

阶段执行时用实际内容替换以下占位，并在完成后保留历史：

```md
### 阶段X：名称

- 状态：IN_PROGRESS
- 开始时间：
- 开始分支/commit：
- 执行任务/线程：
- 用户已有改动：
- 计划内文件范围：
- 已完成工作：
- 未完成工作：
- Interface/schema偏差：
- 测试命令与结果：
- 故障/迁移/回滚证据：
- 人工待办：
- 停止条件是否触发：
- Handoff路径：
- 下一阶段是否READY：否
```

## 5. 测试证据规则

只写“测试通过”无效。每次记录至少包含：

- 命令；
- 测试文件/测试数量；
- pass/fail/skip；
- skip原因；
- 运行环境；
- fixture或隔离workspace类型；
- 故障点；
- 失败时保留的诊断ID或报告路径。

不得把真实投稿、真实数据库恢复、签名或TLS配置写成自动验证。

## 6. 阻塞与重开

- 当前阶段触发停止条件时设为`BLOCKED`，写明唯一阻塞事实和已尝试的安全检查。
- 发现前序interface/schema错误时，把前序阶段从`COMPLETE`改为`IN_PROGRESS`并记录原因；当前阶段不得用兼容wrapper绕过。
- 只缺生产人工验收但代码/自动证据完整时可标`PENDING_HUMAN`；是否允许下一阶段由对应阶段文档决定。
- 阶段8之前不得把整个工程标为`COMPLETE`。

## 7. 最终工程记录

阶段8完成时填写：

- 最终分支/commit：
- Workspace schema版本：
- Auth schema版本：
- Production runtime/controller路径：
- Domain/Application modules：
- Publisher adapters：
- Renderer feature modules：
- 全局测试结果：
- Migration/rollback结果：
- Production package结果：
- 剩余`PENDING_HUMAN`：
- Release状态：
- 普通功能开发状态：

### 阶段0：工程基线与可信门禁

- 状态：COMPLETE
- 开始时间：2026-07-24 Asia/Shanghai（本阶段执行任务开始时）
- 前一阶段完成证据：不适用；阶段0是唯一不要求前序阶段完成的阶段，阶段1及以后均保持未开始。
- 开始分支/commit：`codex/refactor-program` / `bee1b3f24039bb77be0d13d9a663b88e5657e61c`
- Phase 0里程碑commit：`0bcbbfcca9ac4baf140359e048f3bf706f7b9526`（`refactor(phase-0): establish trusted engineering gates`）
- Git根与应用根：Git根 `F:\官媒投稿-refactor`；应用根 `F:\官媒投稿-refactor\auto—publish`
- 执行环境：Windows 11 专业版 build 26200；Node `v24.16.0`；npm `11.13.0`；Electron `43.1.1`
- package lock状态：根应用、`auth-server`、`media-workbench` 三份 `package-lock.json` 均未修改；未执行普通依赖升级
- 用户已有改动：未恢复、覆盖或清理原工作区历史文档删除及无关文件；未连接真实workspace、投稿、扣费或生产账号
- 计划内文件范围：根 `.github/workflows/`、`auto—publish/package.json`、测试收集/manifest/锁验证脚本、架构/打包测试、确认无生产引用的旧seam资产、本阶段账本与交接；本任务获准的最小例外为submission batch `localArchive`存储及其测试
- 已完成工作：
  - 在Git根新增 `.github/workflows/ci.yml`，所有应用命令显式使用 `auto—publish` 工作目录，并分离Node 24 desktop与Node 22 auth矩阵。
  - `scripts/run-tests.js` 收集并排序全部 `.test.js`/`.test.mjs`，以 `--test-concurrency=1` 串行运行；`test:discover` 输出176个测试文件并包含 `.mjs`。
  - production runtime统一为 `desktop/workspace-runtime.js`，由 `desktop/main.js` 组装；production renderer controller seam为 `media-workbench/src/controllers/platform-submission-controller.js` 与 `media-workbench/src/article-management-controller.js`。架构测试直接约束这些入口。
  - 删除无production引用的 `desktop/services/workspace-runtime.js`、`desktop/workspace-invalidation-policy.js` 和三个旧renderer hook及其旧测试；替换为production interface测试。
  - 新增合成workspace只读manifest：仅输出分类计数、字节数、相对路径与SHA-256，不复制或输出正文；新增renderer构建锁的陈旧锁回收/活动owner保护测试。
  - 新增本地测试/打包脚本：`test:discover`、`test:packaging`、`pack:smoke`；`pack:smoke` 已完成非签名目录制品构建。
  - 修复原基线合并提交 `e8d817847bab3a9e6020006cab35340f645e527f` 的 `localArchive` 回归：历史batch缺失字段保持缺失，不再在读/写/transition时伪造为`pending`；新发布路径仍显式持久化`pending`。
  - 保留 `submission-query` 对显式`pending`和`failed`的本地清理安全拦截；新增定向测试确认显式`pending`、`archived`、`failed`均可验证、持久化并跨store重建恢复。
  - 根CI的阻断audit改为 `npm audit --omit=dev --audit-level=high`；完整开发依赖audit保留为非阻断已知风险报告，未运行`npm audit fix`且未修改任何lockfile。
- 已核验的基线缺陷与收口：
  - `desktop/services/storage-maintenance-service.js` 的原基线扫描器使用 `lstat` 后安全跳过文件链接和目录junction，却把该动作错误计入 `followedSymlinks`。字段现仅表示真正进入链接目标的次数（安全扫描恒为0）；新增兼容性的诊断字段 `skippedSymlinks`。定向回归以临时合成fixture实际创建文件链接和目录junction，证明不读取目标、不计入容量且清理不触及目标。
  - `npm run test:links`已在本机实际运行：`file-symlink=yes`、`directory-junction=yes`、172/172通过、0 skip；旧的Windows EPERM阻塞结论失效。
  - 本项目采用本地Git里程碑提交；Git未配置remote，PR/push/required checks为`NOT_APPLICABLE`，根workflow仅作可移植配置和静态契约对象。
- Interface/schema偏差：无持久化schema、用户数据或外部平台行为变更；未执行真实迁移。唯一production runtime为 `desktop/workspace-runtime.js`，renderer使用明确的feature controller seam。
- 测试命令与结果：
  - `npm run test:discover`：通过，收集176个 `.test.js/.test.mjs`，包含新增CI workflow contract测试。
  - 修复前定向基线：原工作树与重构工作树均为 `tests/published-article-trash.test.js` 7项中5通过、2失败（`:59`、`:191`）；均来自 `e8d817847bab3a9e6020006cab35340f645e527f`。
  - 修复后定向测试：`node --test tests/published-article-trash.test.js`：8/8通过；相关submission/archive集成、查询与reconcile测试：13/13通过。
  - `node --test tests/storage-maintenance-service.test.js`：修复前6项中5通过、1失败（`:75`，实际`followedSymlinks=1`）；修复后6/6通过、0 skip，覆盖文件链接与目录junction跳过、容量排除和清理边界。
  - `npm test`：955 tests；955 pass、0 fail、0 skip；全部使用默认合成/临时fixture。
  - `npm run test:auth`：16/16通过。
  - `npm run lint`：通过。
  - `npm run typecheck:renderer`、`npm run typecheck:bridge`：均通过。
  - `npm run build:renderer`：通过，Vite转换2137 modules。
  - `npm run test:packaging`：33/33通过。
  - `npm run pack:smoke`：通过，`electron-builder --dir --config electron-builder.alpha.yml`完成非签名Windows目录制品；未发布正式包。
  - `npm run format:check`：通过。
  - `npm run test:links`：通过，172/172、0 skip；`file-symlink=yes`、`directory-junction=yes`。
  - Phase 00定向架构/锁/发现/manifest/刷新/controller/CI测试：7个文件、14/14通过（`architecture-seams`、`ci-workflow-contract`、`renderer-harness-lock`、`test-discovery-contract`、`workspace-manifest`、`renderer-content-refresh-lifecycle`、`renderer-workbench-controller-seams`）。
  - `npm audit --audit-level=high`：非阻断报告，`brace-expansion`、`fast-uri`两项high，均在开发/构建工具传递依赖；未执行`npm audit fix`。
  - `npm audit --omit=dev --audit-level=high`：通过，0 high、0 critical（`found 0 vulnerabilities`）；这是CI阻断门禁。
- 故障/迁移/回滚证据：
  - manifest测试使用临时合成workspace，验证publication、batch、sidecar、order各1项，仅返回相对路径/计数/字节数/哈希且序列化结果不含合成正文、私密材料或绝对workspace路径；CLI测试确认只读行为。
  - renderer harness锁测试验证陈旧锁可回收、活动owner锁不被回收；未对用户workspace做删除或恢复。
  - Phase 00不引入schema迁移；正式workspace迁移、备份恢复和外部平台回滚均未执行，按阶段边界留给后续阶段/人工授权。
- 人工待办：
- 自动验证已完成：`npm run test:links`在启用Developer Mode后实际执行172/172并通过；未弱化、跳过或伪造成功。
- remote、PR/push与required checks：`NOT_APPLICABLE`；根workflow保留为可移植配置并由静态契约验证。
- 开发依赖风险待办：由依赖维护者在单独授权的工作中处理2个high；Phase 0不升级普通依赖。
- 停止条件是否触发：否。所有canonical本地门禁已通过，并已由本地里程碑commit固化。
- Handoff路径：`docs/refactor/handoffs/phase-00.md`
- 下一阶段是否READY：是。阶段1为`READY`，但本任务未执行且不得开始Phase 1。
