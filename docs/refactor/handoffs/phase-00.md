# 阶段00交接：工程基线与可信门禁

## 1. 状态

- 状态：COMPLETE
- 前一阶段完成证据：不适用；Phase 00是唯一不要求前序阶段完成的阶段，Phase 01仍为 `NOT_STARTED`。
- 开始分支与commit：`codex/refactor-program` / `bee1b3f24039bb77be0d13d9a663b88e5657e61c`
- Phase 0里程碑commit：`0bcbbfcca9ac4baf140359e048f3bf706f7b9526`（`refactor(phase-0): establish trusted engineering gates`）
- 工作区状态：Phase 0代码、测试、workflow和主要文档已由上述本地里程碑提交固化；三份lockfile未修改。没有恢复或清理原工作区历史文档；本项目采用本地Git里程碑，remote/PR/push/required checks为`NOT_APPLICABLE`，未push、未创建PR、未配置remote。
- 执行日期与环境：2026-07-24 Asia/Shanghai；Git根 `F:\官媒投稿-refactor`；应用根 `F:\官媒投稿-refactor\auto—publish`；Windows 11 build 26200；Node `v24.16.0`；Electron `43.1.1`

## 2. 已完成结果

- 根 `.github/workflows/ci.yml` 已建立，desktop/auth/link-security job 的 `working-directory` 均明确指向 `auto—publish`，并分别使用Node 24与Node 22。
- `scripts/run-tests.js` 现在递归收集、排序全部 `.test.js` 与 `.test.mjs`，默认以 `--test-concurrency=1` 运行；`npm run test:discover` 收集176个测试文件。
- production main 入口只组装 `desktop/workspace-runtime.js`；架构测试约束其生命周期、invalidations和IPC注册。
- renderer生产页面使用 `media-workbench/src/controllers/platform-submission-controller.js` 和 `media-workbench/src/article-management-controller.js` 两个明确feature controller seam；旧hook不再是production caller。
- 无production引用的shadow runtime、旧invalidation policy和旧renderer hooks及其测试已删除；相关architecture/renderer interface tests通过。
- 新增合成workspace manifest工具/测试，仅输出分类计数、字节数、相对路径和SHA-256；新增renderer构建锁陈旧锁回收/活动owner保护测试。
- 新增 `test:discover`、`test:packaging`、`pack:smoke` canonical scripts；非签名目录制品 smoke 已完成。
- `localArchive`缺失字段现在保持`undefined`，不会在历史batch读/写/transition时伪造成`pending`；真实新发布归档仍由 `platform-workbench-service` 显式持久化`pending`。
- 未修改 `submission-query` 对显式`pending`/`failed`的本地清理安全拦截；新增回归测试覆盖显式`pending`、`archived`、`failed`的验证、持久化与重建恢复。
- CI以生产依赖audit为阻断门禁（`npm audit --omit=dev --audit-level=high`）；完整开发依赖audit为非阻断已知风险报告。
- manifest识别production writer的`.autopublish/submission-batches/batch-*.json`为batch；fixture仅使用临时合成workspace，仍只输出相对路径、类别、字节数和SHA-256。
- 新增独立CI workflow contract测试，验证根路径、旧workflow不存在、desktop/media/auth/link目录、Node 24/22矩阵及两类audit语义；renderer refresh测试已合并纯重复读取/断言。
- 修复原基线 storage maintenance 计数契约：文件链接与目录junction均由 `lstat` 发现后跳过；`followedSymlinks` 只表示真正跟随（安全扫描为0），`skippedSymlinks`记录发现并跳过的链接。定向fixture证明链接目标不被读取、不计入容量且缓存清理不扩大到目标。

## 3. 权威interface与schema

| 名称 | 文件 | Caller | 不变量/错误模式 |
|---|---|---|---|
| 唯一production workspace runtime | `auto—publish/desktop/workspace-runtime.js` | `auto—publish/desktop/main.js#createWorkspaceRuntime` | 由main创建、注册IPC并负责异步dispose；bootstrap未ready时不初始化业务runtime |
| 平台提交controller | `auto—publish/media-workbench/src/controllers/platform-submission-controller.js` | `PlatformWorkbench.tsx` | 维护request identity、订阅和terminal refresh，view不直接持有旧controller hook |
| 文章管理controller | `auto—publish/media-workbench/src/article-management-controller.js` | `GeneratedArticlesView.tsx` | 通过revisioned snapshot seam加载，view不再直接拼接多个列表接口 |
| 合成workspace manifest | `auto—publish/scripts/workspace-manifest.js#buildWorkspaceManifest` | `tests/workspace-manifest.test.js`或显式CLI调用 | 只读；输出相对路径、类别、字节数和SHA-256，不输出正文/绝对路径，不读取真实workspace |

本阶段没有新增或修改持久化schema，也没有用户数据迁移。

## 4. Production调用图

```text
desktop/main.js
  -> desktop/workspace-runtime.js#createWorkspaceRuntime
     -> workspace bootstrap / runtime services / IPC registration
     -> workspace-data-invalidation lifecycle

media-workbench/src/components/PlatformWorkbench.tsx
  -> controllers/platform-submission-controller.js
     -> domain bridge -> main-process platform submission boundary

media-workbench/src/components/content/GeneratedArticlesView.tsx
  -> article-management-controller.js
     -> content article-management snapshot bridge
```

本阶段只验证静态生产调用边界和合成fixture；没有连接真实投稿、扣费、Cookie、生产数据库或生产workspace。

## 5. 修改文件

- 本阶段新增：
  - `F:\官媒投稿-refactor\.github\workflows\ci.yml`
  - `auto—publish/scripts/run-tests.js`
  - `auto—publish/scripts/workspace-manifest.js`
  - `auto—publish/tests/ci-workflow-contract.test.js`
  - `auto—publish/tests/renderer-harness-lock.test.js`
  - `auto—publish/tests/test-discovery-contract.test.js`
  - `auto—publish/tests/workspace-manifest.test.js`
  - `docs/refactor/handoffs/phase-00.md`
- 本阶段修改：
  - `auto—publish/package.json`
  - `auto—publish/src/content/submission-batch-store.js`
  - `auto—publish/tests/architecture-seams.test.js`
  - `auto—publish/tests/helpers/renderer-harness.js`
  - `auto—publish/tests/published-article-trash.test.js`
  - `auto—publish/tests/renderer-content-refresh-lifecycle.test.js`
  - `auto—publish/tests/renderer-workbench-controller-seams.test.js`
  - `docs/optimization/02-optimization-plan.md`
  - `docs/optimization/03-verification-matrix.md`
  - `docs/optimization/04-risk-and-decisions.md`
  - `docs/optimization/05-execution-checklist.md`
  - `docs/refactor/03-phase-00-engineering-foundation.md`
  - `docs/refactor/12-traceability-matrix.md`
  - `docs/refactor/13-progress-ledger.md`
- 本阶段删除：
  - `auto—publish/.github/workflows/ci.yml`（应用内workflow移至Git根）
  - `auto—publish/desktop/services/workspace-runtime.js`
  - `auto—publish/desktop/workspace-invalidation-policy.js`
  - `auto—publish/media-workbench/src/hooks/use-article-management-snapshot.ts`
  - `auto—publish/media-workbench/src/hooks/use-platform-workbench-controller.ts`
  - `auto—publish/media-workbench/src/hooks/use-request-identity.ts`
  - `auto—publish/tests/workspace-invalidation-policy.test.js`
  - `auto—publish/tests/workspace-runtime.test.js`
- 用户已有但未触碰：原工作区历史文档删除、无关未跟踪文档及真实用户workspace；没有复制、恢复、覆盖或清理它们。

## 6. 已删除旧路径

| 旧seam/writer | 删除/替代证据 | 静态0引用检查 |
|---|---|---|
| `desktop/services/workspace-runtime.js` | `desktop/main.js`直接引用 `desktop/workspace-runtime.js`；`tests/architecture-seams.test.js`断言旧文件不存在 | production caller为0；测试仅保留“旧文件不存在”的断言 |
| `desktop/workspace-invalidation-policy.js` | 由production `desktop/workspace-data-invalidation.js` seam承接；架构测试断言旧policy不存在 | production caller为0 |
| 三个 `media-workbench/src/hooks/*workbench*/*snapshot*/*request*`旧hook | controller tests断言production view使用新controller且不使用旧hook | production view对旧hook为0 |

## 7. 数据与迁移

- Schema版本：无变更。
- Dry-run fixture：临时合成workspace；publication、batch、sidecar、order各1项；manifest序列化不包含合成正文、私密材料或绝对workspace路径。
- 正式迁移演练：未执行；Phase 00只建立只读manifest能力，禁止读取真实敏感workspace。
- Backup/restore：未执行；没有创建或恢复真实备份。
- 冲突/人工项：完整开发依赖树的2个high；remote、PR/push、required checks为`NOT_APPLICABLE`；`npm run test:links`已实际确认file symlink与directory junction均可用并172/172通过，不存在等待symlink能力的阻塞。
- 回滚结果：未做破坏性迁移，因此没有需要回滚的用户数据；renderer harness锁测试覆盖陈旧锁回收和活动owner保护。

## 8. 测试证据

| 命令 | 结果 | 测试数量 | Skip | 环境/fixture |
|---|---|---:|---:|---|
| `npm run test:discover` | 通过 | 176文件 | 0 | 应用根，含 `.test.js`/`.test.mjs`和新增CI workflow contract |
| 修复前 `node --test tests/published-article-trash.test.js` | 失败 | 7；5 pass、2 fail | 0 | 原工作树和重构工作树均复现；`:59`、`:191` 是原基线合并提交 `e8d817847bab3a9e6020006cab35340f645e527f` 的回归，不是Phase 00引入 |
| 修复后 `node --test tests/published-article-trash.test.js` | 通过 | 8/8 | 0 | 临时合成workspace；未修改失败期望、跳过或排除测试 |
| 相关submission/archive集成、查询与reconcile测试 | 通过 | 13/13 | 0 | 临时合成workspace；涵盖显式archive状态和恢复 |
| `node --test tests/storage-maintenance-service.test.js`（修复前） | 失败 | 6；5 pass、1 fail | 0 | 临时合成fixture；`:75`期望`followedSymlinks=0`而实际为1 |
| `node --test tests/storage-maintenance-service.test.js`（修复后） | 通过 | 6/6 | 0 | 临时合成fixture；文件链接和目录junction均跳过，目标不计容量且不进入清理范围 |
| `npm test` | 通过 | 955；955 pass、0 fail、0 skip | 0 | 应用默认合成/临时fixture |
| `npm run test:auth` | 通过 | 16/16 | 0 | `auth-server`隔离测试 |
| Phase 00定向架构/锁/发现/manifest/刷新/controller/CI测试 | 通过 | 7文件；14/14 | 0 | `architecture-seams`、`ci-workflow-contract`、`renderer-harness-lock`、`test-discovery-contract`、`workspace-manifest`、`renderer-content-refresh-lifecycle`、`renderer-workbench-controller-seams`；临时合成workspace与静态source contract |
| `npm run lint` | 通过 | — | — | 应用根 |
| `npm run typecheck:renderer` | 通过 | — | — | `media-workbench` TypeScript |
| `npm run typecheck:bridge` | 通过 | — | — | strict bridge TypeScript |
| `npm run build:renderer` | 通过 | — | — | Vite；2137 modules |
| `npm run test:packaging` | 通过 | 33/33 | 0 | source/desktop/production packaging contract |
| `npm run pack:smoke` | 通过 | — | — | `electron-builder --dir`；非签名Windows目录制品，未发布 |
| `npm run format:check` | 通过 | — | — | 应用根 |
| `npm run test:links` | 通过 | 172/172 | 0 | `file-symlink=yes`、`directory-junction=yes`；启用Developer Mode后实际执行 |
| `npm audit --audit-level=high` | 非阻断风险报告 | 2 high | — | 开发/构建工具传递依赖 `brace-expansion`、`fast-uri`；未执行 `npm audit fix` 或依赖升级 |
| `npm audit --omit=dev --audit-level=high` | 通过 | 0 high、0 critical | — | `found 0 vulnerabilities`；CI阻断门禁 |

故障注入及可观察结果：默认测试扩大到 `.mjs` 后通过串行runner避免renderer并发端口冲突；锁测试区分陈旧锁与活动owner；manifest测试证明只读和敏感内容不泄漏；链接安全在权限前置阶段明确失败而非被glob隐藏。

## 9. 偏差与决定

- 相对阶段计划的偏差：授权的基线回归修复仅限submission batch存储及storage maintenance链接计数/测试；没有扩展publication/content模块。根workflow只作静态契约对象，remote/PR/push/required checks为`NOT_APPLICABLE`；本任务已明确授权本地里程碑commit。
- 更新的CONTEXT/ADR：无。没有改变既有领域、schema或外部平台决定。
- 为什么没有扩大interface：Phase 00只固定可信工程边界；除获准的localArchive合并回归外，publication/content/auth业务变更和普通依赖升级均超出允许范围。

## 10. 未完成与阻塞

- 代码未完成：无；默认测试和本地可运行门禁已完成。
- 自动验证未完成：无；本机 `npm run test:links`实际执行172/172、0 skip。根workflow保留可移植配置并由静态契约验证；真实PR/push为`NOT_APPLICABLE`。
- 收口：Phase 0里程碑已创建；本文件的SHA/状态记录由紧随其后的仅文档收口commit固化。开发依赖2个high只作为非阻断风险记录，须在单独授权的依赖维护任务处理。
- 触发的停止条件：否；所有canonical本地门禁通过且已形成里程碑commit。阶段1可标记`READY`，但本任务不执行Phase 1。

## 11. 下一任务入口

- 必读文件：`docs/refactor/README.md`、`docs/refactor/00-program-charter.md`、`docs/refactor/01-target-architecture.md`、`docs/refactor/02-codex-execution-protocol.md`、`docs/refactor/03-phase-00-engineering-foundation.md`、`docs/refactor/13-progress-ledger.md`，以及本交接。
- 首个production symbol：`auto—publish/desktop/main.js#createWorkspaceRuntime` → `auto—publish/desktop/workspace-runtime.js#createWorkspaceRuntime`。
- 首个回归测试：`auto—publish/tests/storage-maintenance-service.test.js:56`；原失败断言为`:75`。修复后6/6通过，文件链接/目录junction不跟随、目标不计容量且不清理。既有获准的submission batch回归 `published-article-trash.test.js` 亦保持8/8通过。
- 允许修改范围：解决本阶段验证阻塞所需的CI/测试/架构门禁/文档，以及获准的submission batch `localArchive`合并回归；任何其他业务、schema、真实迁移和依赖升级需单独授权。
- 禁止修改范围：真实投稿/扣费/生产账号或Cookie、真实workspace、publication/content/auth语义、用户无关历史文档、lockfile与普通依赖（无明确授权）。
- 下一阶段是否READY：是；阶段1为`READY`，但本任务到此结束，未执行Phase 1。
