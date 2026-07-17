# Code Review Remediation, Migration, and Cleanup Plan

**Goal:** 先修复完整代码审查确认的 7 个缺陷，建立不会误报投稿结果、不会覆盖文章、不会破坏引用的稳定基线；随后在有备份、dry-run、校验清单和人工确认的前提下迁移旧业务数据，最后分批清理遗留代码、生成物、worktree 和 Git 不可达对象。

**Order:** 修复 -> 全量验收 -> 备份 -> 迁移 dry-run -> 人工确认 -> 迁移执行 -> 迁移校验 -> 清理候选复核 -> 分批删除。任何阶段失败都停止，不跳过门槛继续清理。

**Baseline:** `master`，计划编写时 HEAD 为 `2109599`。当前基线为 601 tests、594 pass、0 fail、7 skip；Renderer type-check/build 通过；production dependency audit 为 0 漏洞。

---

## 不可变安全边界

- 修复阶段不修改、移动或删除真实 `.env`、客户资料、调研结果、生成文章、待投稿文件、投稿记录、媒体资源、订单和浏览器 profile。
- 自动化测试不得调用真实付费 AI、真实投稿接口或真实豆包采集。
- 每个缺陷先写能稳定失败的回归测试，再做最小修复；相关测试通过后才运行全量验证。
- 迁移只允许“复制 -> 校验 -> 标记完成”，不得自动删除源目录。
- 迁移执行前必须先 dry-run，且 dry-run 的冲突数必须为 0。
- 清理必须是迁移完成后的独立步骤和独立提交；不得把业务修复、数据迁移与大批删除混在一个提交中。
- `.worktrees` 只能使用 `git worktree remove` 管理，不得手工递归删除。
- Git GC 前必须有仓库备份；包含不可达提交时不得把 `--prune=now` 作为默认动作。

## 目标提交顺序

1. `fix(publishing): make published archive collision-safe and transactional`
2. `fix(content): retain tombstones after permanent article deletion`
3. `fix(ai): separate provider connection tests from saved configuration`
4. `fix(content): correct submission preview and latest-batch ordering`
5. `fix(renderer): complete reviewed-article bulk selection`
6. `test: lock reviewed remediation behavior`
7. `refactor(renderer): remove retired renderer after test migration`
8. `chore(migration): migrate and verify legacy content library`
9. `chore(cleanup): remove verified legacy artifacts`

---

## Phase 0：建立修复基线

**Files:**

- No production file changes
- Record results in the implementation handoff or commit notes

- [ ] 确认主工作区位于 `master`，且开始修复前 `git status --short` 为空。
- [ ] 保留当前两个 worktree，不在修复阶段移除。
- [ ] 运行根测试、Renderer 类型检查和构建。
- [ ] 记录 7 个 symlink skip；若权限环境允许创建链接，额外运行这些测试并记录结果。
- [ ] 不读取或输出真实密钥、Cookie、客户正文和完整 Prompt。

**Verification:**

```powershell
cd F:\官媒投稿\auto—publish
npm test
npm --prefix media-workbench run lint
npm run build:renderer
npm audit --omit=dev
```

**Gate:** 与当前基线一致或更好；任何新增失败必须先解释并解决。

---

## Phase 1：修复投稿成功后的归档覆盖与非原子移动（P1/P2）

**Problems:**

- `src/core/files.js` 在目标同名时先删除旧正文和 sidecar，造成无提示覆盖。
- 正文和 sidecar 分两步移动且无回滚；sidecar 失败时正文已经离开来源目录。
- `src/core/jobs.js` 会把“远端已经投稿成功、仅本地归档失败”改记为普通失败，后续重试可能重复投稿。

**Files:**

- Modify: `src/core/files.js`
- Modify: `src/core/jobs.js`
- Modify if required: article scan/normalization code under `src/core/articles.js`
- Create: `tests/published-archive.test.js`
- Modify: `tests/desktop-task-service.test.js` or the closest job lifecycle test

- [ ] 先写同名归档测试：已有目标和 sidecar 必须保持不变，不允许静默 `unlink`。
- [ ] 写故障注入测试：正文移动成功、sidecar 移动失败时，来源正文/sidecar 和已有目标必须恢复到调用前状态。
- [ ] 写“远端成功、本地归档失败”测试：任务必须明确报告 archive failure，且不得变成可自动重投的普通 publish failure。
- [ ] 在网络投稿前确定并保留归档目标。目标命名必须稳定且唯一；发生真实冲突时拒绝覆盖，不能删除旧文件。
- [ ] 将正文和 sidecar 作为一个文件对处理：使用同目录 staging/backup、逐步写入、失败逆序回滚、成功后清理备份。
- [ ] 归档异常使用稳定错误码，例如 `PUBLISHED_ARCHIVE_CONFLICT`、`PUBLISHED_ARCHIVE_FAILED`。
- [ ] 区分“投稿失败”和“投稿已成功但本地归档失败”；后者应阻止自动重投并给出人工恢复提示。
- [ ] 日志只记录文章 ID/安全文件名和错误码，不输出正文、凭据或远端响应体。

**Verification:**

```powershell
node --test tests/published-archive.test.js tests/desktop-task-service.test.js
npm test
```

**Pass:** 旧归档永不被覆盖；任何一步失败都不留下半对文件；远端成功不会因本地归档异常而被再次投稿。

---

## Phase 2：永久删除正文后保留 tombstone（P1）

**Problem:** `src/content/article-store.js` 当前把 JSON、Markdown 和 tombstone 一并移入 staging 后删除，违反“永久删除正文后仍保留最小引用”的设计。

**Files:**

- Modify: `src/content/article-store.js`
- Modify: `src/content/article-trash-service.js`
- Modify if required: `desktop/storage-paths.js` / `desktop/workspace-paths.js`
- Modify: `tests/article-store.test.js`
- Modify: `tests/article-trash-service.test.js`
- Modify: `tests/renderer-article-history.test.js`

- [ ] 先写回归测试：永久删除后正文 JSON 和 Markdown 不存在，但 tombstone 仍存在且只含允许字段。
- [ ] tombstone 增加不可逆终态，例如 `purgedAt`/`permanentlyDeleted: true`；不得保留标题、正文、Prompt、客户资料或调研回答。
- [ ] 活跃回收站列表过滤已永久删除的 tombstone，避免永久删除后仍显示“可恢复”。
- [ ] 恢复、再次准备永久删除、重复永久删除都对终态 tombstone 返回稳定结果，不得重新创建正文。
- [ ] 生成批次和投稿记录需要解析引用时，可以获得“原文章已删除”的最小状态。
- [ ] 永久删除事务只删除正文对；tombstone 的终态写入必须原子化。任何失败不得留下“正文已删但 tombstone 未标记”的不一致状态。
- [ ] 修正现有把 tombstone 消失当作成功的测试。

**Verification:**

```powershell
node --test tests/article-store.test.js tests/article-trash-service.test.js tests/renderer-article-history.test.js
npm test
```

**Pass:** 正文不可恢复，最小引用仍可解析；回收站 UI 不展示已永久删除项；队列和批次记录不丢失引用语义。

---

## Phase 3：分离“保存 AI 配置”和“测试连接”（P2）

**Problem:** 首次没有已保存配置时，测试连接成功会把表单草稿和 API Key 写入正式配置。

**Files:**

- Modify: `desktop/services/ai-provider-service.js`
- Modify: `desktop/ai-provider-config-store.js`
- Create or extend: application-scoped no-secret test status store
- Modify: `tests/ai-provider-service.test.js`
- Modify: `tests/ai-provider-config-store.test.js`
- Modify: `tests/renderer-ai-provider-settings.test.js`

- [ ] 将现有“首次测试会保存配置”的测试改为失败基线：测试成功后 `hasApiKey` 仍为 false，正式配置文件仍不存在。
- [ ] `testConnection` 始终使用当前表单创建临时 client，不改变当前生效配置和配置指纹。
- [ ] 最近测试状态若需要跨重启持久化，使用独立的应用级无密钥状态文件，只保存 `{testedAt, ok, code}`；不得为保存测试状态而创建正式 provider 配置。
- [ ] 已有正式配置时，测试草稿失败或成功都不得替换 base URL、model、timeout 或 API Key。
- [ ] `save` 继续只做本地校验、不发网络请求；`clear` 同时清除正式配置和无密钥测试状态。
- [ ] Renderer 明确区分“已测试”和“已保存”，不能让测试成功看起来像配置已经生效。

**Verification:**

```powershell
node --test tests/ai-provider-config-store.test.js tests/ai-provider-service.test.js tests/ai-provider-ipc.test.js tests/renderer-ai-provider-settings.test.js
npm test
```

**Pass:** 测试连接不会隐式保存凭据；保存、测试、清除三种操作的状态和副作用彼此独立。

---

## Phase 4：修正入队预览计数和“最近批次”顺序（P2/P2）

**Problems:**

- `queueableTaskCount` 把 `idempotent` 也计入新增数量。
- submission batch store 返回未排序的目录枚举；UI 用第一项作为最近批次。

**Files:**

- Modify: `desktop/services/content-submission-service.js`
- Modify: `src/content/submission-batch-store.js`
- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Modify: `tests/content-submission-batch.test.js`
- Modify: `tests/renderer-article-history.test.js`

- [ ] 写重复入队测试：`queueableTaskCount === 0`、`idempotentCount === 1`，总任务数保持文章数乘平台数。
- [ ] 确认 UI 文案分别显示“新增”“幂等跳过”“冲突”，不得把跳过项说成新增项。
- [ ] batch store 的 `list()` 按 `createdAt` 降序返回；时间相同时用稳定 ID 作为次级排序键。
- [ ] 对损坏时间戳定义稳定策略：拒绝损坏记录或将其置后，但不能依赖文件系统枚举顺序。
- [ ] UI 仅从已排序结果选择最近 `queued` 批次，并新增多批次乱序文件名的回归测试。

**Verification:**

```powershell
node --test tests/content-submission-batch.test.js tests/content-submission-ipc.test.js tests/renderer-article-history.test.js
npm test
```

**Pass:** 确认框新增数量与实际写入完全一致；“撤销最近入队”始终命中最新 queued 批次。

---

## Phase 5：补齐已审核文章批量选择（P2）

**Problem:** 当前筛选全选和模板组全选只以 `generated` 为可选集合，导致全为 `saved` 时无法批量入队或删除。

**Files:**

- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Modify: `tests/renderer-article-history.test.js`
- Modify if required: `tests/renderer-batch-generation.test.js`

- [ ] 定义统一的 `selectableArticles`：`generated` 和 `saved` 均可选择；审核动作仍只消费 `generated`，入队动作仍只消费 `saved`。
- [ ] “全选当前结果”选择当前过滤结果内所有可操作文章，不选择损坏、不可识别或不属于当前客户的记录。
- [ ] 模板组复选框按该组所有可操作文章计算 checked/indeterminate/disabled，不再只看待审核数量。
- [ ] 新增三种测试：仅 saved、generated+saved 混合、切换筛选后选择集收敛。
- [ ] 保持删除二次确认规则：含 saved/queued/published 状态时显示更强确认。

**Verification:**

```powershell
node --test tests/renderer-article-history.test.js tests/content-submission-batch.test.js
npm --prefix media-workbench run lint
npm run build:renderer
```

**Pass:** 当前筛选、模板组和手选三种批量入口均支持已审核文章；审核、入队、删除各自只处理允许状态。

---

## Phase 6：修复完成总验收

- [ ] 运行所有相关专项测试和根测试。
- [ ] 运行 Renderer 类型检查、生产构建和 `npm run verify`。
- [ ] 运行 production dependency audit。
- [ ] 重新执行打包内容边界测试，确认 tombstone、AI 测试状态和业务数据没有进入安装包。
- [ ] 审查 `git diff`：不得包含真实业务内容、生成物、`.env`、profile、日志或安装包。
- [ ] 手工验证一次无真实外部调用的 UI 流程：测试连接草稿、历史文章混合全选、重复入队预览、撤销最近批次、回收站永久删除。

**Commands:**

```powershell
npm test
npm --prefix media-workbench run lint
npm run build:renderer
npm run verify
npm audit --omit=dev
```

**Repair completion gate:**

- 7 个审查缺陷均有红绿回归测试。
- 全量测试 0 fail；skip 不得比基线增加。
- TypeScript、构建、verify、audit 全部 exit 0。
- 未出现真实网络调用和业务数据改动。
- 只有达到本门槛，才能开始 Phase 7。

---

## Phase 7：退休旧 Renderer 与脚手架

**Purpose:** 先清除会干扰迁移判断的代码遗留；该阶段仍不删除业务数据。

**Remove after test migration:**

- `desktop/renderer/**`
- `.playwright-cli/page-2026-07-04T03-26-05-542Z.yml`
- `.playwright-cli/page-2026-07-04T03-26-32-038Z.yml`
- root `tests/media-ipc-thin.test.js`
- `media-workbench/README.md`
- `media-workbench/.env.example`
- `media-workbench/metadata.json`
- `media-workbench/scripts/build.cmd`

**Tests/docs to migrate before deletion:**

- `tests/desktop-workbench-flow.test.js`
- `tests/media-article-drawer-boundary.test.js`
- `tests/media-order-service.test.js` legacy Renderer assertion only
- `tests/media-resource-ux.test.js`
- `tests/media-workbench-flow.test.js`
- `tests/renderer-resource-library-api.test.js`
- `docs/media-workbench-ui.md`

- [ ] 把仍有价值的行为断言迁移到 React 组件、preload 或 service 测试。
- [ ] 删除只验证退役 DOM 字符串或旧脚本存在性的测试。
- [ ] 确认 `desktop/main.js`、打包配置和生产文档都只指向 React `media-workbench/dist`。
- [ ] 删除 AI Studio/Gemini 元数据后，确认项目中不再出现 `GEMINI_API_KEY`、`AI Studio`、`react-example`。
- [ ] 根 `.gitignore` 增加 `/.playwright-cli/`，防止页面快照再次进入 Git。

**Gate:** `npm test`、Renderer lint/build、`npm run verify` 全通过；打包内容不含 `desktop/renderer`。

---

## Phase 8：业务数据迁移准备

**Source candidates:**

- `clients/**`
- `generated/**`
- `templates/**`
- `research/**`
- supported records under `data/**`
- `logs/**`, `tmp/**`, supported cache/profile paths
- allowlisted platform runtime settings from `.env`

**Must not be inferred or deleted:**

- AI provider credentials
- unknown files outside migration mappings
- `input/**`, `published/**`, media drafts/resources/pool/orders unless a reviewed mapping explicitly supports them

- [ ] 关闭 AutoPublish、平台浏览器和所有发布/采集任务。
- [ ] 复制整个旧业务根目录到独立备份位置；备份不得位于迁移源、目标内容库或 local state 内。
- [ ] 记录源目录文件数、总字节数和 SHA-256 清单。
- [ ] 选择新的内容库、local state 和应用配置路径，确认彼此不重叠。
- [ ] 核对 `scripts/migrate-content-library-v2.js` 的 `MAPPINGS` 是否覆盖本机实际业务目录；未映射目录必须列入人工保留清单。
- [ ] 特别确认当前 `data/media-resources.json`、`data/media-pool.json`、`data/media-drafts.json`、`data/submission-orders.jsonl` 的归属；没有明确迁移映射前一律保留。
- [ ] 对迁移脚本再运行专项测试。

**Verification:**

```powershell
node --test tests/content-library-migration.test.js tests/storage-paths.test.js tests/desktop-packaging.test.js
```

---

## Phase 9：迁移 dry-run、执行与验收

**Dry-run first:**

```powershell
node scripts/migrate-content-library-v2.js `
  --source "<legacy-root>" `
  --content-library "<new-content-library>" `
  --local-state "<new-local-state>" `
  --app-config "<new-app-config-file>" `
  --dry-run
```

- [ ] 保存 dry-run JSON 输出，不包含密钥值或客户正文。
- [ ] `conflicts === 0`；逐项解释 missing 和 duplicate。
- [ ] planned 文件数、分类和字节数与源清单一致。
- [ ] 用户明确确认目标路径和迁移摘要后，才将 `--dry-run` 改为 `--execute`。
- [ ] 执行后读取 migration manifest 和 completion marker；校验每个目标文件 SHA-256。
- [ ] 启动应用指向新内容库，验证客户、调研、模板、文章、批次、队列和设置读取。
- [ ] 做一次只读抽样：每类至少检查首项、末项和一个中文路径项。
- [ ] 保留旧源目录，观察至少一个完整使用周期；不得在迁移命令中删除源。

**Migration completion gate:**

- completion marker 为 complete。
- manifest 中全部文件完成且校验一致。
- 应用从新路径启动，核心读取和离线操作正常。
- 新运行产生的可变数据不再写入安装/源码目录。
- 备份和旧源均仍可用。

---

## Phase 10：迁移后的分批清理

### Batch A：可重建生成物

- `release-alpha/**`
- root and renderer `node_modules/**`
- `media-workbench/dist/**`
- `.playwright-cli/**`
- `logs/**`（迁移并确认后）
- `tmp/**`

删除前关闭应用；删除后用 `npm ci`、`npm --prefix media-workbench ci` 和 `npm run build:renderer` 验证可恢复性。

### Batch B：旧业务副本

- 仅删除已经出现在迁移 manifest、SHA-256 一致、且经过观察期的 `clients/**`、`generated/**`、`templates/**`、`research/**` 和受支持记录。
- 未映射的 `input/**`、`published/**`、媒体 JSON、`.env` 和 profile 继续保留，直到有单独迁移决策。
- 旧业务副本删除必须独立提交或独立文件操作记录，附迁移 manifest 和备份位置。

### Batch C：worktree 和合并分支

- `desktop-content-lifecycle-storage-optimization`：确认仍干净且已合并后，用 `git worktree remove` 移除。
- `content-operations-optimization`：先保存未跟踪的 `2026-07-15-generation-batch-pending-fix.md`，再确认分支已合并并移除 worktree。
- worktree 移除后再决定是否删除已合并分支；不删除未合并分支。

### Batch D：Git 对象维护

- 先制作仓库级备份并记录所有 refs。
- 先运行普通 `git gc`，重新测量 `git count-objects -vH`。
- 不可达对象包含 30 个 commit；只有确认无需恢复且备份可用时，才另行批准激进 prune。
- 不手工删除 `.git/objects` 内的 pack、tmp object 或索引文件。

---

## 最终验收清单

- [ ] 7 个缺陷均有回归测试且已修复。
- [ ] 全量测试、Renderer lint/build、verify、audit 全部通过。
- [ ] 退役 Renderer 和 AI Studio 脚手架已移除，生产入口唯一。
- [ ] 迁移 manifest、completion marker 和备份位置均有记录。
- [ ] 新内容库中的文件数、字节数和 SHA-256 与计划一致。
- [ ] 旧源只在迁移验收和观察期之后分批删除。
- [ ] `.env`、媒体业务 JSON、待投稿/已投稿文件和浏览器 profile 未被误删。
- [ ] 两个 worktree 均通过 Git 命令安全处理，未手工删除元数据。
- [ ] Git GC 有备份、有前后空间对比，不影响当前 refs。
- [ ] 最终 `git status --short` 只包含经过审查的代码、测试、文档和预期删除。

## 停止条件

遇到以下任一情况立即停止，不进入下一阶段：测试新增失败、迁移冲突非零、校验和不一致、目标路径重叠、发现未映射业务目录、应用仍向源码目录写数据、备份不可恢复、worktree 有未保存文件、或 Git 不可达提交尚未确认是否需要保留。
