# 模板发现刷新与文章发布记录防重复修复计划

> 日期：2026-07-18  
> 项目范围：仅 F:\官媒投稿\auto—publish  
> 内容工作区示例：F:\1，它不是源代码目录  
> 基线提交：11ea5847995998fa12461e041f2fdc26fc85112f

## 1. 目标与边界

本计划处理两组问题：

1. 修复空客户工作区不加载模板 catalog、缺少刷新入口、模板名称不清晰。
2. 建立贯穿历史文章、投稿队列、普通平台和付费媒体的发布记录与重复发布保护。

不重新设计 AI Prompt，不新增投稿平台，不修改登录方式，不自动删除旧队列、旧订单、旧 published 文件或用户模板。

实施约束：

- 先写能复现真实症状的红色测试，再修改生产代码。
- 迁移默认 dry-run，显式确认后才执行，且不删除旧数据。
- 正式安装包只从干净 Git 提交构建。
- 发布记录不保存 API Key、Cookie、资料全文、Prompt、浏览器 profile 或远端完整响应。
- 远端已成功但本地归档失败时，不得降级成可安全重试。

---

## 2. 已确认现场与根因

### 2.1 模板文件和路径有效

当前内容工作区是 F:\1，模板是：

~~~text
F:\1\templates\xiaohongshu\xiaohongshu.md
~~~

当前解包应用中的 template-store.js 能返回：

~~~text
ctrip/ctrip_standard_guide:builtin
xiaohongshu/xiaohongshu_experience_note:builtin
xiaohongshu/xiaohongshu:custom
diagnostics = []
~~~

因此不是路径、打包遗漏或 v2 正文-only格式错误。

### 2.2 Renderer 错误绑定 clientId

问题文件：

~~~text
media-workbench/src/components/content/ArticleGenerationView.tsx
~~~

当前逻辑在 clientId 为空时清空 research 和 templates，listContentTemplateCatalog 与 listContentSubmissionPlatforms 又和客户 research 放在同一个受 clientId 限制的加载过程里。

现场 F:\1\clients 为空，所以客户、模板平台和模板三个下拉框都为空。加入临时合成客户后，页面立即出现 xiaohongshu 平台、内置 Experience note 和自定义 xiaohongshu。临时数据已清理。

### 2.3 缺少刷新入口

- 客户只在 ContentWorkbench 首次挂载时读取一次。
- 模板只在生成页挂载、平台变化或 refreshToken 变化时读取。
- 运行时新增客户或模板没有明确刷新按钮。
- 空客户时 catalog 根本不加载。

### 2.4 模板显示名称容易误判

以下内容会整体成为正文，显示名仍是文件名 xiaohongshu：

~~~text
displayName：1是的

模板正文
~~~

正确的可选元数据是：

~~~markdown
---
displayName: 1是的
---

模板正文
~~~

正文-only模板继续合法，UI 和文档必须解释名称派生规则。

### 2.5 当前只有文件幂等，没有发布目标级防重

已有基础：

- submission-export-service.js 写入 generatedArticleId 和 contentHash sidecar。
- content-submission-service.js 能识别相同队列文件为 idempotent。
- jobs.js 在普通平台成功后移动到 published。
- 付费媒体有 submission-orders.jsonl。
- 历史文章能显示“已入队”。

现有缺口：

- 历史文章不知道每个平台或媒体资源的最终结果。
- 投稿批次创建后常驻 queued，worker 没有回写同一业务记录。
- 普通平台结果主要存在于本次返回值和日志。
- 统一 published 目录不能表达发布目标。
- 付费媒体订单不能稳定关联生成文章。
- 超时、浏览器崩溃、远端成功但本地记录失败没有 uncertain 状态。
- 重复点击、多个窗口或多个批次没有原子占位。

---

## 3. 领域规则

### 3.1 审核状态与发布结果分离

文章保留现有审核生命周期：

~~~text
generated -> saved
~~~

不得把文章本体简单改成全局 published。一篇文章可投多个目标，发布结果由独立发布记录表达。

### 3.2 统一术语

- 文章：具有稳定 articleId 的生成内容。
- 投稿队列项：等待人工确认或执行器消费的本地快照。
- 发布目标：真正需要判断重复的远端目的地。
- 发布记录：一篇文章对一个发布目标的持久化状态聚合。
- 发布尝试：聚合中的一次实际尝试；重试追加 attempt。
- 结果待确认：请求可能到达远端，但本地无法证明最终结果。
- 重复发布保护：入队和调用远端前执行的检查与原子占位。

### 3.3 发布目标粒度

~~~text
普通平台：articleKey + platformId
付费媒体：articleKey + mediaResourceId
~~~

映射：

~~~text
toutiao -> platform:toutiao
hepan   -> platform:hepan
lieju   -> platform:lieju
media   -> media-resource:<resourceId>
~~~

保留不可逆 accountFingerprint 供未来多账号审计，但第一版普通平台仍按同文章×同平台严格防重。

### 3.4 文章身份

1. 有生成 sidecar：generated:<clientId>:<articleId>。
2. 手工队列文件：content:<normalizedContentHash>。

同一 articleId 即使正文被编辑，已发布目标仍阻止再次发布。重新发布修改版必须“复制为新版本”，创建新 articleId。

### 3.5 状态机

~~~text
queued
submitting
submitted
published
uncertain
failed
cancelled
~~~

规则：

- queued、submitting、submitted、published、uncertain 均阻止重复。
- failed 明确未成功，可以追加 attempt。
- cancelled 只表示远端调用前安全取消。
- uncertain 必须核对，不能直接重试。
- published 永远不能返回 queued。
- 远端成功而本地归档失败时 publication 仍成功。

主要迁移：

~~~text
queued -> submitting
queued -> cancelled
submitting -> submitted | published | uncertain | failed
submitted -> published | uncertain | failed
uncertain -> published | failed（必须核对）
failed -> queued（追加 attempt）
~~~

### 3.6 权威来源

发布记录是历史页面和防重复判断的权威来源。队列文件、published 归档、订单 JSONL 和日志只是运行材料或兼容证据。

---

## 4. 目标模块

建立：

~~~text
src/publication/publication-ledger-store.js
src/publication/publication-ledger.js
src/publication/publication-state.js
src/publication/publication-targets.js
src/publication/article-identity.js
~~~

外部接口：

~~~text
preview(articleRefs, targets)
reserve(articleRef, target, context)
markSubmitting(publicationId, attemptId)
recordOutcome(publicationId, attemptId, outcome)
listForArticles(clientId, articleIds)
reconcile(publicationId, decision)
~~~

内部负责身份解析、目标键、状态机、原子占位、attempt 历史、安全错误和旧记录兼容。

存储位置：

~~~text
<workspace>\.autopublish\submission-records\publications\
~~~

每个 articleKey + targetKey 使用一个 versioned JSON 聚合。首次占位排他创建，更新采用同目录临时文件和原子 rename。

允许保存 publicationId、文章引用、contentHash、platformId、targetKey、安全显示名、accountFingerprint、状态、attempt、remoteId、remoteUrl、安全结果码和时间。

禁止保存密钥、Cookie、Authorization、文章正文、客户资料、Prompt、远端完整响应和原始堆栈。

---

## 5. 分阶段执行任务

### Task 0：建立两组红色反馈环

Create / Modify：

- Create: tests/renderer-template-discovery-empty-client.test.js
- Modify: tests/template-catalog.test.js
- Create: tests/publication-ledger.test.js
- Create: tests/publication-duplicate-guard.test.js
- Modify: tests/renderer-responsive-layout.test.js（仅真实页面探针需要时）

模板探针：

- [ ] 临时工作区 clients 为空，包含 templates/xiaohongshu/custom.md。
- [ ] 启动真实 Renderer 或 Electron 页面。
- [ ] 断言 catalog 已加载，平台存在 xiaohongshu，模板存在 custom。
- [ ] 断言生成按钮因无客户禁用，并显示空客户说明。
- [ ] 页面保持打开时新增模板，点击刷新后无需重启即可出现。
- [ ] 当前代码必须因 clientId 提前返回而失败。

防重探针：

- [ ] 同一文章对 toutiao 连续 reserve，第二次被阻止。
- [ ] 同一文章可分别 reserve toutiao 和 hepan。
- [ ] 同一文章可 reserve 两个不同媒体资源。
- [ ] 相同媒体资源不能重复 reserve。
- [ ] uncertain 和 submitted 阻止重试。
- [ ] failed 后可追加 attempt，但 publicationId 不变。
- [ ] 两个并发 reserve 只有一个成功。

完成条件：每组都有秒级、确定、无人值守且直接命中用户症状的红色命令。

### Task 1：解耦客户与模板加载

Modify：

- media-workbench/src/components/content/ArticleGenerationView.tsx
- media-workbench/src/components/ContentWorkbench.tsx
- media-workbench/src/electron-api.ts
- media-workbench/src/types.ts
- tests/renderer-content-generation.test.js
- tests/renderer-template-discovery-empty-client.test.js

实施：

- [ ] catalog、投稿平台、客户 research 拆成三个加载过程。
- [ ] listContentTemplateCatalog 不依赖 clientId。
- [ ] listContentSubmissionPlatforms 不依赖 clientId。
- [ ] 只有 listContentResearch 在无客户时跳过。
- [ ] 无客户时保留模板平台、模板、revision 和 diagnostics。
- [ ] 无客户只禁用生成，不清空 catalog。
- [ ] 平台切换只过滤已加载 catalog。
- [ ] 处理异步竞态，旧客户请求不能覆盖新客户。
- [ ] 损坏模板只显示诊断，不隐藏其他模板。

空状态文案：

~~~text
模板目录已加载；当前工作区还没有客户。
请在 clients/<客户名称>/ 第一层添加资料，然后刷新客户与模板。
~~~

### Task 2：增加“刷新客户与模板”

Modify：

- media-workbench/src/components/ContentWorkbench.tsx
- media-workbench/src/components/content/ArticleGenerationView.tsx
- media-workbench/src/components/content/BatchGenerationView.tsx
- tests/content-workbench-regression.test.js
- tests/renderer-batch-generation.test.js
- tests/renderer-template-discovery-empty-client.test.js

实施：

- [ ] 内容工作台顶部增加刷新按钮。
- [ ] 一次刷新重新读取客户、catalog 和当前客户资料，不调用 AI 或外网。
- [ ] 按钮有刷新中、成功和失败状态。
- [ ] 新增客户后无需重启即可出现。
- [ ] 新增、修改、删除模板后无需重启即可刷新。
- [ ] 删除当前模板后清空选择并提示，不静默改选。
- [ ] 当前客户仍存在时保留选择；删除后清空并提示。
- [ ] 单篇和批量使用同一 catalog revision。
- [ ] 第一版不使用文件 watcher，以显式刷新保证可审计。

### Task 3：完善模板名称、来源和诊断

Modify：

- ArticleGenerationView.tsx
- BatchGenerationView.tsx
- media-workbench/src/types.ts
- docs/template-catalog-v2.md
- docs/content-generation-operations.md
- tests/renderer-content-generation.test.js

实施：

- [ ] 显示“写作模板平台”和“写作模板”标签。
- [ ] 自定义模板标记“自定义”，内置模板标记“内置只读”。
- [ ] 正文-only名称来自文件名 stem。
- [ ] 合法 displayName 覆盖派生名称。
- [ ] 文档说明使用 --- 和半角冒号。
- [ ] diagnostics 只显示平台、文件名和安全错误码，不返回绝对路径。
- [ ] 默认平台行为可预测，避免默认 ctrip 隐藏小红书模板的感知。

### Task 4：记录领域词汇和 ADR

Create：

- CONTEXT.md
- docs/adr/0004-record-publication-per-target.md

实施：

- [ ] CONTEXT.md 只记录业务词汇。
- [ ] ADR 解释为何不使用全局 published。
- [ ] ADR 解释普通平台和付费媒体的目标粒度。
- [ ] ADR 解释 uncertain 默认阻止重试。
- [ ] ADR 解释发布记录属于可迁移内容库。

### Task 5：实现文章身份和发布目标解析

Create：

- src/publication/publication-targets.js
- src/publication/article-identity.js
- tests/publication-targets.test.js
- tests/publication-article-identity.test.js

Modify：

- src/core/platforms.js
- 各平台 adapter 的元数据声明

实施：

- [ ] 普通平台声明 platform 粒度。
- [ ] 付费媒体声明 resource 粒度。
- [ ] 拒绝空 ID、路径字符、未声明平台和非法 resourceId。
- [ ] accountFingerprint 使用不可逆哈希。
- [ ] 生成队列优先使用 generatedArticleId/clientId。
- [ ] 手工队列使用规范化标题+正文 SHA-256。
- [ ] Renderer 不生成 articleKey 或 targetKey。
- [ ] 目标 DTO 只有安全显示字段。

### Task 6：实现原子发布记录

Create：

- src/publication/publication-ledger-store.js
- src/publication/publication-ledger.js
- src/publication/publication-state.js
- tests/publication-ledger-store.test.js
- tests/publication-ledger.test.js
- tests/publication-duplicate-guard.test.js

Modify：

- desktop/workspace-paths.js
- desktop/storage-paths.js
- tests/workspace-paths.test.js
- tests/storage-paths.test.js

实施：

- [ ] 增加受验证 publication directory。
- [ ] 每个 articleKey + targetKey 只有一个聚合。
- [ ] reserve 使用排他原子机制。
- [ ] 更新使用临时文件 + rename。
- [ ] 严格校验 version、字段和状态。
- [ ] attempt ID 由主进程生成。
- [ ] 状态迁移集中验证。
- [ ] failed 重试追加 attempt。
- [ ] published 永久阻止 reserve。
- [ ] uncertain 只有 reconcile 可以解除。
- [ ] 损坏、符号链接、短写、rename 失败和并发更新均失败关闭。
- [ ] 错误只返回稳定安全 code。

### Task 7：历史文章入队接入发布记录

Modify：

- desktop/services/content-submission-service.js
- src/content/submission-export-service.js
- src/content/submission-batch-store.js
- desktop/ipc/content-submission-ipc.js
- desktop/preload.js
- media-workbench/src/electron-api.ts
- media-workbench/src/types.ts
- tests/content-submission-batch.test.js
- tests/content-submission-export.test.js
- tests/content-submission-ipc.test.js

实施：

- [ ] preview 同时检查队列冲突和发布重复。
- [ ] 区分 queueable、alreadyQueued、blockedPublished、blockedUncertain、conflict。
- [ ] createBatch 先 reserve，再写队列和 v2 sidecar。
- [ ] sidecar 增加 publicationId、attemptId、articleKey、targetKey。
- [ ] 队列写入失败时把未调用远端的 reservation 转 cancelled。
- [ ] 崩溃后可恢复“有 reservation 无队列文件”。
- [ ] 取消未改动队列时同步 cancelled。
- [ ] submitting/submitted/published/uncertain 不可撤销为可重试。
- [ ] 同批次允许已发布目标跳过、其他目标继续。
- [ ] 确认窗口显示原因和实际任务数。

### Task 8：接入普通平台 worker

Modify：

- desktop/services/platform-workbench-service.js
- desktop/ipc/platform-ipc.js
- desktop/worker/run-task.js
- desktop/services/desktop-task-service.js
- src/core/jobs.js
- src/core/files.js
- src/platforms/lieju/adapter.js
- src/platforms/toutiao/adapter.js
- src/platforms/hepan/adapter.js
- tests/platform-workbench-service.test.js
- tests/platform-ipc-boundary.test.js
- tests/published-archive.test.js

实施：

- [ ] 队列扫描忽略 submission/meta/临时 sidecar。
- [ ] 主文件扫描时验证 v2 sidecar。
- [ ] worker plan 只携带安全引用。
- [ ] 调 adapter 前再次 duplicate guard。
- [ ] 调远端前原子更新 submitting。
- [ ] adapter 统一 outcome：published、submitted、uncertain、failed。
- [ ] 集中兼容旧 true/submitted/pending/false。
- [ ] 有远端证据才记录 published。
- [ ] 只证明已提交时记录 submitted。
- [ ] 点击后超时、浏览器崩溃或响应不明时记录 uncertain。
- [ ] 远端调用前停止可安全取消；调用后停止不得假定失败。
- [ ] 远端成功但本地归档失败时 publication 仍成功。
- [ ] worker 结果回写原投稿批次。

### Task 9：付费媒体资源级防重复

Modify：

- desktop/services/media-workbench-service.js
- src/platforms/media/submission-order-store.js
- desktop/services/media-order-service.js
- desktop/ipc/media-ipc.js
- media-workbench/src/App.tsx
- media-workbench/src/components/ArticleList.tsx
- media-workbench/src/components/ArticleEditor.tsx
- media-workbench/src/components/PreflightModal.tsx
- media-workbench/src/components/OrdersView.tsx
- tests/media-workbench-service.test.js
- tests/media-order-service.test.js
- tests/media-runtime-workspace.test.js

实施：

- [ ] article × resourceId 创建独立目标。
- [ ] 同一文章选择三个资源时创建三个 publication。
- [ ] 相同资源已 queued/submitting/submitted/published/uncertain 时阻止。
- [ ] thirdId 使用稳定 publication/attempt 身份；远端支持时复用幂等键。
- [ ] 订单记录增加 publicationId。
- [ ] API 接受投稿只标 submitted。
- [ ] 订单同步确认发布后推进 published。
- [ ] API 明确拒绝且未创建订单时标 failed。
- [ ] 超时或结果不明标 uncertain。
- [ ] 确认界面显示阻止资源、可提交资源和实际价格。
- [ ] 阻止项不计入预计扣费。

### Task 10：历史文章发布摘要和详情

Create：

- desktop/ipc/publication-ipc.js
- media-workbench/src/components/content/PublicationHistoryDrawer.tsx
- media-workbench/src/publication-status.ts
- tests/publication-ipc.test.js
- tests/renderer-publication-history.test.js

Modify：

- desktop/ipc/register.js
- desktop/preload.js
- media-workbench/src/electron-api.ts
- media-workbench/src/types.ts
- media-workbench/src/components/content/GeneratedArticlesView.tsx
- tests/renderer-article-history.test.js
- tests/renderer-responsive-layout.test.js

实施：

- [ ] 批量 listForArticles，避免每篇一次 IPC。
- [ ] 审核状态和发布摘要分开显示。
- [ ] 增加未投稿、已入队、投稿中、审核中、部分发布、已发布、待确认、失败筛选。
- [ ] 卡片按平台/资源显示结果。
- [ ] 详情显示目标、状态、时间、远端 URL/订单号和安全错误码。
- [ ] uncertain 显著警告，不提供直接重试。
- [ ] 入队预览逐目标显示将入队、已阻止或冲突。
- [ ] 已发布一个平台不影响尚未发布的平台。
- [ ] 删除文章时保留发布记录最小引用。
- [ ] 窄窗口徽标换行，不复发标题压缩。

### Task 11：复制为新版本和结果核对

Create / Modify：

- Create: src/content/article-version-service.js
- Modify: desktop/services/ai-content-service.js
- Modify: desktop/ipc/ai-content-ipc.js
- Modify: GeneratedArticlesView.tsx
- Modify: PublicationHistoryDrawer.tsx
- Create: tests/article-version-service.test.js
- Modify: tests/renderer-publication-history.test.js

实施：

- [ ] 已发布文章可复制为新版本，创建新 articleId。
- [ ] 新版本保留 sourceArticleId/version，不继承旧 reservation。
- [ ] 不允许修改 articleId 或清记录绕过防重。
- [ ] 支持订单同步等自动 reconcile。
- [ ] 无法自动核对时提供“确认已发布”和“确认未发布”。
- [ ] 人工核对二次确认并记录非敏感原因和时间。
- [ ] “确认未发布”只允许 uncertain 转为可重试 failed。
- [ ] published 不提供解除阻止；重新发布必须复制新版本。

### Task 12：迁移旧队列、订单和归档

Create：

- scripts/migrate-publication-ledger-v1.js
- tests/publication-ledger-migration.test.js
- docs/publication-ledger-migration.md

Modify：

- electron-builder.alpha.yml
- tests/desktop-packaging.test.js

规则：

- [ ] 默认 dry-run。
- [ ] 只有 --execute 加确认令牌才写入。
- [ ] 有有效生成 sidecar 的队列迁移为 queued。
- [ ] 投稿批次与 sidecar 一致时关联 batchId。
- [ ] 付费媒体订单只有稳定关联文章和 resourceId 时迁移。
- [ ] 只有远端明确成功才迁移 published。
- [ ] 单独存在于 published 的文件只报告 legacy_unlinked，不制造事实。
- [ ] 不删除旧 sidecar、订单、队列或归档。
- [ ] 清单记录来源、目标、字节数、SHA-256、版本和提交，不含秘密或正文。
- [ ] 重复执行幂等，不覆盖新 publication。

### Task 13：文档、打包与干净电脑验收

Modify：

- docs/content-generation-operations.md
- docs/content-workspace-contract.md
- docs/desktop-workbench.md
- docs/clean-machine-installation.md
- docs/alpha-packaging-checklist.md
- scripts/verify-alpha-package.js
- tests/desktop-packaging.test.js

实施：

- [ ] 说明源代码目录与内容工作区不同。
- [ ] 给出正文-only和 displayName 示例。
- [ ] 说明空客户时模板仍可发现，但不能生成。
- [ ] 说明审核、入队、提交、发布和待确认的区别。
- [ ] 包验证确认不包含 publication、订单、队列和客户数据。
- [ ] 继续执行 DOCX、Playwright 和 provider secret 检查。
- [ ] 干净电脑验证模板刷新、普通平台防重、资源级防重和订单同步。

---

## 6. 建议提交顺序

1. test(templates): reproduce discovery without a selected client
2. fix(templates): load catalog independently from client data
3. feat(renderer): refresh clients and templates explicitly
4. docs(domain): define publication records and duplicate scope
5. test(publication): specify target-level duplicate protection
6. feat(publication): persist atomic publication records
7. feat(submission): reserve publication targets while queueing
8. feat(platforms): record structured publication outcomes
9. feat(media): prevent duplicate resource submissions
10. feat(history): show per-target publication status
11. feat(content): copy published articles as new versions
12. chore(migration): import legacy publication evidence safely
13. test(packaging): keep publication data outside the package
14. docs: document template refresh and publication operations

---

## 7. 自动化验证

模板专项：

~~~powershell
node --test tests/template-catalog.test.js tests/renderer-template-discovery-empty-client.test.js tests/renderer-content-generation.test.js tests/renderer-batch-generation.test.js tests/content-workbench-regression.test.js
~~~

发布专项：

~~~powershell
node --test tests/publication-targets.test.js tests/publication-article-identity.test.js tests/publication-ledger-store.test.js tests/publication-ledger.test.js tests/publication-duplicate-guard.test.js tests/content-submission-batch.test.js tests/platform-workbench-service.test.js tests/media-workbench-service.test.js tests/media-order-service.test.js tests/renderer-publication-history.test.js
~~~

全量：

~~~powershell
npm run verify
~~~

正式打包前 git status --short 必须无输出，然后执行：

~~~powershell
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-docx-runtime.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke
npm run dist:alpha
~~~

dirty 打包只能用于本地诊断，不能交付。

---

## 8. 人工验收

### 8.1 模板

- [ ] 只有模板、没有客户时仍显示 xiaohongshu/custom。
- [ ] 页面解释无客户，生成按钮不可用。
- [ ] 新增客户并刷新后无需重启即可选择。
- [ ] 运行时新增正文-only模板，刷新后单篇和批量都出现。
- [ ] 修改正文后 revision 更新。
- [ ] 删除当前模板后选择清空并提示。
- [ ] 合法 displayName 正确显示。
- [ ] 错误元数据只产生诊断，不隐藏其他模板。

### 8.2 普通平台

- [ ] 文章 A 发布到今日头条后，再投今日头条被阻止。
- [ ] 同一文章仍可发布到蓝色河畔。
- [ ] 同批次一个已发布目标跳过，其他目标继续。
- [ ] 超时后为待确认，不能直接重试。
- [ ] 明确失败后可重试并保留 attempt。
- [ ] 远端成功、本地归档失败仍阻止重复。

### 8.3 付费媒体

- [ ] 文章 A 可同时投资源 1001 和 1002。
- [ ] 资源 1001 已提交后再次选择被阻止。
- [ ] 资源 1002 不受影响。
- [ ] 阻止项不计入价格。
- [ ] 订单同步发布后历史文章显示发布时间。

### 8.4 历史与迁移

- [ ] 审核状态与发布摘要分开显示。
- [ ] 可按未投稿、已入队、审核中、已发布、待确认、失败筛选。
- [ ] 详情显示每个发布目标。
- [ ] 已发布文章可复制为新版本。
- [ ] 删除原文后发布记录仍保留。
- [ ] 1128×527 和 1424×861 无压缩或溢出。
- [ ] dry-run 不写数据。
- [ ] 无法判断平台的旧归档只报告，不制造成功记录。
- [ ] 旧订单、队列和归档不删除。
- [ ] 安装包不包含 publication、订单、客户内容或密钥。

---

## 9. 完成标准

- [ ] 空客户仍能发现模板。
- [ ] 客户和模板可显式刷新，无需重启。
- [ ] 单篇和批量使用同一 catalog。
- [ ] 发布记录按文章与目标持久化。
- [ ] 普通平台按文章×平台防重。
- [ ] 付费媒体按文章×资源防重。
- [ ] queued/submitting/submitted/published/uncertain 均阻止重复。
- [ ] 明确失败可重试并保留 attempt。
- [ ] 历史文章显示每个目标的真实摘要。
- [ ] 远端成功但本地归档失败不会触发危险重试。
- [ ] 旧数据只迁移可证明事实，不删除或猜测。
- [ ] 全量测试、Renderer、portable、NSIS 和干净电脑验收通过。

---

## 10. 明确不做

- 不把文章本体改成全局 published。
- 不允许修改文件名绕过生成文章发布记录。
- 不把 published 文件夹当成唯一事实。
- 不在网络超时后自动重试。
- 不在没有远端证据时把“已提交”显示为“已发布”。
- 不提供普通“强制重复发布”按钮。
- 不自动删除旧队列、旧订单、旧归档或旧 sidecar。
- 不把发布记录写入安装目录或秘密配置目录。
- 不把模板平台和投稿目标平台重新合并。
