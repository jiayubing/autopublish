# AutoPublish 投稿、单篇生成、付费媒体刷新、品牌与多目标待投稿修复优化计划

**日期：** 2026-07-22  
**范围：** `F:\官媒投稿\auto—publish` 源码、Renderer 测试、Electron IPC、`release-alpha` 打包验收  
**基线：** 架构优化提交 `c67ba83d03f9996f0113d7bc195df3d03260ab22`，父提交 `66571f8`  
**依据：** [2026-07-21 架构深化、解耦与性能优化计划](./2026-07-21-architecture-deepening-decoupling-performance-plan.md)、`CONTEXT.md`、ADR 0001-0004 以及本次可复现诊断结果  
**状态：** 待实施；本文是修复计划，不是已完成声明

## 一、现状审查结论

### 已兑现的优化

1. 平台投稿 plan 已收回主进程。重点测试证明 Renderer 准备 IPC 为 0、提交 IPC 为 1、plan 构建为 1，原来的 `N + 1` IPC 链路已消除。
2. 文章管理已有带 revision 的主进程快照，10/100/1000 篇文章和 0/10/100 批次都只经过一个快照 IPC；重复读取和逐批次取消预览已从 Renderer 移除。
3. 批量生成事件已经携带完整运行快照，100 个事件的 Renderer 后续 IPC 和批次回读均为 0。
4. bridge 已按领域拆分，`electron-api.ts` 和旧 transport facade 已删除；bridge 严格类型检查、Renderer 类型检查和架构重点测试通过。

### 未完成或存在回归风险的部分

1. Phase 3 的批量生成仍由 Renderer 先 `createGenerationBatch`、再 `startGenerationBatch`，没有兑现“创建后启动命令时序归主进程”的要求，仍有两次 IPC 和中间失败窗口。
2. 主进程快照虽然返回 `workflowByArticle`，`GeneratedArticlesView` 没有使用它，仍依据批次、发布记录和 attention 在 Renderer 二次派生；这让相同事实存在两个 owner。
3. `article-management-snapshot.js` 将所有 `archiveError` 和任意 `needs_repair` 事务扩散到客户内每一篇文章，局部异常可能错误地把无关文章归入“失败”。
4. 快照只在开始读取时取得 revision，多个存储 `await` 完成后不再次校验 revision，可能缓存跨 mutation 的混合时点数据。
5. 原计划承认的文章快照 p95 下降 25%、主线程 profile 和 Phase 0 同口径 bundle 基线仍未完成。当前基准在 1000 篇/100 批次约为 p95 `7ms`，只能证明读取次数下降，不能证明达到时间目标。
6. `npm test` 在本环境运行 304 秒后超时，未得到完整通过/失败汇总；不能作“全量通过”声明。重点分组 23 项通过，bridge/Renderer 严格类型检查通过。
7. `release-alpha` 的 `config/build-info.json` 仍标记提交 `66571f8` 且 `dirty: true`，而源代码 HEAD 已是 `c67ba83`。后续打包必须修复产物可追溯性，否则用户可能运行内容正确但诊断信息过期的包。
8. 标准审查另发现：`package.json` 的 `format:check` 改动违反 `.editorconfig` 的 2 空格缩进；bridge 多处重复 transport unwrap，文章快照重复解码 stage，属于应在本次收尾中一并收敛的维护风险。

### 已建立的失败反馈环

以下最小断言均在当前实现上稳定失败，作为本计划的红测起点：

- `deriveWorkflow(article, publishedRecord, queuedBatch).locks.canCancel` 实际为 `true`，但同一文章—目标已经 `published` 时必须为 `false`。
- `createContentSubmissionService().exportArticle({ targetPlatform: "media" })` 后失效事件数量为 `0`，付费媒体工作台没有刷新信号。
- 单条 `published` 记录传给 `deriveArticleManagementStatus` 时返回 `published`，但在仍存在其他可用目标时必须保留在 `pending_submission`。
- 真实 `GeneratedArticleEditorPanel` 在文章状态为 `generated` 且标题/正文未改动时，保存按钮 `disabled=true`。

这些反馈环不调用真实 AI、浏览器自动化、远端平台、付款或用户工作区。

## 二、问题根因与目标语义

### 1. 发布成功后仍出现“撤销未开始投稿”

当前 `GeneratedArticlesView` 重新用 `submissionBatches` 的全部 item 状态计算 `workflowByArticle`，只要任意 batch item 为 `queued` 就把文章视为 queued，并以 `batchStatuses.includes('queued')` 开放取消。它没有按“文章 × 发布目标”配对判断，也没有优先使用主进程已派生的快照结果。

普通平台 worker 确实会更新 submission batch item 和 publication ledger，但旧快照、迟到响应或另一发布目标的 queued item 仍可能驱动同一篇文章的取消按钮。取消接口再次执行时动作 plan 已经失效，所以用户看到“点击没有用处”。

目标语义：

- `canCancel` 只允许来自同一 `articleId + targetKey` 的 `queued` 本地队列项，且远端调用尚未开始。
- `published`、`submitted`、`uncertain` 等目标不得被任何其他目标的 queued 事实覆盖。
- 文章级汇总只显示“仍有 queued 目标”的取消入口，并在详情中列出具体目标；已完成目标不再显示撤销。
- 发布终态更新、批次收口和快照失效必须在一个可观察 revision 中完成；旧 plan 返回 `SUBMISSION_ACTION_STALE` 后只能清除并重新读取一次。

### 2. 单篇生成必须改字才能保存

`ArticleGenerationView.generate()` 只把返回文章放入当前编辑器选中态，没有触发文章管理刷新。编辑器的 `dirty` 只表示相对 `base` 有修改，保存按钮又使用 `disabled={saving || !dirty}`，因此刚生成且没有改字的文章既不能确认保存，也不会可靠出现在文章管理。

目标语义：

- 单篇生成完成即获得稳定文章身份，并立即刷新当前客户的文章管理快照。
- `generated` 初次确认保存不要求修改标题或正文；`dirty` 只负责离开确认和已保存修改提示。
- 保存成功后状态变为 `saved`，按钮回到“无修改”状态；保存失败保留编辑内容和可重试错误。

### 3. Media 入队后付费媒体投稿页不刷新

文章生成页调用的是 `contentSubmissionService.exportArticle` 的单篇导出路径。该路径写入 media 文件和 sidecar，但没有调用 `onDataInvalidated`；主进程允许的失效 scope 也没有付费媒体文章扫描/订单工作台 scope。`App.tsx` 只在挂载时扫描 `scanArticles()`、`getOrders()`，没有订阅内容入队事件，因此页面继续显示旧列表。

目标语义：

- 单篇导出、批量创建和媒体提交都发出结构化 workspace invalidation。
- 新增明确的 `mediaWorkbench` scope（内部可拆成 `mediaArticles`、`mediaOrders`，但外部只暴露最小集合）。
- App 以 revision 和 requestId 去重刷新文章扫描与订单；当前文章已被消费时关闭 active article，迟到响应不能覆盖新快照。

### 4. 应用品牌名称和中英文层级

当前可见品牌分散在 `Sidebar.tsx`、`AuthGate.tsx`、`WorkspaceSelectionPanel.tsx`、`index.html`、`desktop/main.js` 和 electron-builder 配置中，显示为 `Auto Publish`/`AutoPublish` 与“智能媒体分发台”。用户要求打开软件后的中文名为“鱼饼大王”，且汉字大于英语。

目标语义：

- 可见品牌统一为主标题“鱼饼大王”，英文 `Auto Publish` 作为较小的辅助标识。
- 统一窗口标题、登录页、侧边栏、欢迎页、HTML title、快捷方式和打包元数据，避免启动后不同位置显示不同名称。
- 不修改认证产品值 `AutoPublish`、application id、工作区标记、`%APPDATA%/AutoPublish` 和 `%LOCALAPPDATA%/AutoPublish` 等内部兼容身份；品牌改名不能导致旧数据目录丢失。

### 5. 多目标文章错误离开“待投稿”

`article-workflow.ts` 和主进程 `deriveWorkflow` 的 `combined` 只包含已有 publication records 以及终态 batch item，没有“当前可用发布目标全集”。当一条目标记录为 `published` 时，`allTargetsTerminal` 对当前已知记录为真，文章直接进入 `published`，即使它还可以投稿到其他普通平台或媒体资源。

目标语义：

- 发布目标是独立的 `article × targetKey`，普通平台和 media resource 都是目标；不能用文章全局状态代替目标状态。
- 只要存在一个当前可用且未终结、未被重复保护阻断的目标，文章仍属于 `pending_submission`。
- 所有目标均为 `published`/`failed`/`cancelled` 时才允许进入 `published` 或 `failed`；`uncertain` 继续优先阻断自动动作。
- “待投稿”列表和文章详情共享同一主进程派生结果，Renderer 不再自行猜测。

## 三、不可变业务门槛

实施期间必须继续遵守 `CONTEXT.md` 和 ADR 0001-0004：

- `uncertain` 不得被伪装为失败或允许自动重试。
- 发布记录、发布尝试和标题快照不因本地回收删除。
- 已发布文章回收仍是本地阶段，不撤回远端内容。
- 投稿 plan 继续绑定 revision/fingerprint，执行前 fail closed。
- 生成批次仍按客户 × 写作模板，应用级 AI 配置不写入可迁移内容库。
- Renderer 不得接收绝对路径、Cookie、密钥、原始远端响应或未过滤内部错误。
- 品牌显示名与内部 application identity 分离；任何迁移必须显式、可回滚。

## 四、实施阶段

### Phase 0：先建立红测和观测边界

**目标：** 每个用户症状都有一个稳定、快速、穿过真实 interface 的失败测试。

**新增或修改：**

- `tests/article-management-snapshot.test.js`
- `tests/article-management-filter-model.test.js`
- `tests/content-submission-export.test.js`
- `tests/content-submission-batch.test.js`
- `tests/renderer-article-management-filters.test.js`
- `tests/renderer-content-generation.test.js`
- `tests/renderer-content-refresh-lifecycle.test.js`
- 新增 `tests/renderer-generation-save-flow.test.js`
- 新增 `tests/renderer-media-submit-refresh.test.js`
- 新增 `tests/application-branding.test.js`

**必须先红的场景：**

1. 同一 `articleId + targetKey` 具有 `published` publication 和旧 `queued` batch item 时，快照不得给出 `canCancel`。
2. 发布一个目标后，向目标目录加入第二个可用目标，文章仍出现在 `pending_submission`；两个目标均终结后才离开。
3. `exportArticle(media)` 写入队列 pair 后，捕获到一次包含 `mediaWorkbench` 的 invalidation；失败写入不得发出成功事件。
4. 单篇生成返回 `status: generated` 后，文章管理列表最终出现文章；未改任何字符点击保存成功，保存 IPC 恰好一次。
5. Media 工作台挂载后等待 `SUBMISSION_BATCH_CREATED`/`CONTENT_EXPORT_QUEUED`，`scanArticles` 与 `getOrders` 各最多刷新一次；重复 revision 不重复请求。
6. 真实 UI 中“鱼饼大王”的计算字体尺寸大于“Auto Publish”，窗口标题和登录/欢迎/侧边栏文本一致；认证产品仍为 `AutoPublish`。

**快速红绿命令：**

```powershell
node --test tests/article-management-snapshot.test.js tests/article-management-filter-model.test.js tests/content-submission-export.test.js tests/content-submission-batch.test.js
node --test tests/renderer-generation-save-flow.test.js tests/renderer-media-submit-refresh.test.js tests/application-branding.test.js
```

不得用源码字符串断言替代上述行为测试；源码规则只能检查依赖方向、安全不变量和不存在的旧 facade。

### Phase 1：建立发布目标矩阵并让快照成为唯一 owner

**修改：**

- `desktop/services/article-management-snapshot.js`
- `desktop/ipc/article-management-ipc.js`
- `src/publication/publication-targets.js`
- `src/content/article-submission-eligibility.js`
- `media-workbench/src/types.ts`
- `media-workbench/src/article-workflow.ts`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `tests/article-management-snapshot.test.js`
- `tests/article-management-filter-model.test.js`

**要求：**

- [ ] 快照读取当前发布目标目录，输出每篇文章的 `targetFacts`/`workflowByArticle`；目标 key 必须区分普通平台和 media resource。
- [ ] 以一个 stage policy map 同时定义 `stage`、`primaryAction`、`allowedBulkActions` 和 locks，删除重复的 stage switch。
- [ ] `published` 只表示所有可用目标都终结且至少一个目标 published；存在未处理目标时为 `pending_submission`。
- [ ] `failed`、`uncertain`、局部 archive error 和 needs-repair 只绑定到对应 article/target；禁止全局 attention 污染客户内全部文章。
- [ ] Renderer 直接消费快照的 `workflowByArticle` 和 `cancellationPlans`，删除本地 `deriveArticleWorkflow` 二次拼装、空 transactions 参数和旧 `queuedArticleIds` 猜测。
- [ ] 快照在返回前重新读取 revision；若读取期间 revision 改变，丢弃本次结果并重试一次，仍变化则返回明确的 `ARTICLE_MANAGEMENT_SNAPSHOT_STALE`。
- [ ] 快照缓存 key 同时包含 workspace、client 和 revision；失效只清理受影响 scope，不允许旧客户响应写入当前客户。

**验收：** 单目标已发布、多目标一目标已发布、多目标全终结、uncertain、局部 archive error、旧 queued batch 六组夹具的 stage 和 actions 与 `CONTEXT.md` 一致。

### Phase 2：收口发布成功、批次状态与撤销动作

**修改：**

- `desktop/services/content-submission-service.js`
- `src/content/submission-batch-store.js`
- `desktop/services/platform-workbench-service.js`
- `desktop/services/desktop-task-service.js`
- `desktop/ipc/platform-ipc.js`
- `desktop/ipc/content-submission-ipc.js`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/bridge/content.ts`
- `tests/content-submission-batch.test.js`
- `tests/submission-batch-worker-integration.test.js`
- `tests/renderer-content-submission-batch-actions.test.js`

**要求：**

- [ ] worker 每次 publication outcome 更新 batch item 的 `status`、`publicationStatus`、remote id、attempt 和 `updatedAt`；不能只更新 ledger。
- [ ] 一个 batch 全部 item 进入终态后原子收口为 `completed`/`cancelled`；仍有 queued item 时保持 queued，并重新生成 action plan。
- [ ] `buildSubmissionActionPlan('cancel')` 只允许真实 queued 且 identity/content/fingerprint 匹配的 item；published item 和其他 target 不得进入 allowed 数量。
- [ ] `cancelled` 重复调用可返回 `idempotent`，但不得再次出现在新的可撤销 plan；旧 plan 必须在成功、阻断或 stale 后清除。
- [ ] 统一 mutation-to-scope policy，发布成功、批次撤销、批次创建都发出一次递增 revision 的失效事件；禁止在多处手写 scope 数组造成 shotgun surgery。
- [ ] Renderer 取消按钮只读取 plan 的 `allowedCount`，点击后立即显示 pending；旧 client/request 的 finally 不得清理新 client 的 busy 状态。
- [ ] 文章管理中的取消入口显示目标名称和原因；不能把“另一个目标仍 queued”误报为已发布目标可撤销。

**验收：** 普通平台发布成功后按钮消失；同文多目标只有未开始目标显示撤销；重复撤销只返回幂等结果；旧批次不会被新完成批次遮蔽；事件后文章管理、主导航和投稿队列最终一致。

### Phase 3：修复单篇生成的保存闭环

**修改：**

- `media-workbench/src/components/content/ArticleGenerationView.tsx`
- `media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `desktop/services/ai-content-service.js`
- `desktop/ipc/ai-content-ipc.js`
- `tests/renderer-generation-save-flow.test.js`
- `tests/article-generator.test.js`

**要求：**

- [ ] `generate()` 成功后先保存/确认生成文章的稳定 identity，再触发当前客户文章管理快照刷新；不能只更新选中编辑器。
- [ ] 编辑器区分 `requiresInitialSave` 与 `dirty`：新生成文章即使没有字符变化也可保存；历史已保存文章仍只有 dirty 时可保存。
- [ ] 初次保存成功后将 `status` 规范化为 `saved`、更新 version/updatedAt，并通过快照让文章管理立即可见。
- [ ] 保存失败保留草稿和错误 reasonCode；重复点击在请求期间只产生一次 IPC。
- [ ] 关闭确认只依赖 dirty，不因初次保存按钮可用而误弹确认。
- [ ] 保存/生成刷新使用 clientId + requestId；切换客户或切换 tab 后迟到响应不得污染当前文章。

**验收：** 单篇生成 → 不改字 → 点击保存 → 文章管理出现；单篇生成 → 修改正文 → 保存；保存失败重试；切换客户期间生成完成四组场景全部通过。

### Phase 4：建立 Media 工作台失效订阅和自动刷新

**修改：**

- `desktop/main.js`
- `desktop/services/content-submission-service.js`
- `desktop/ipc/register.js`
- `desktop/preload.js`
- `media-workbench/src/workspace-data-store.tsx`
- `media-workbench/src/App.tsx`
- `media-workbench/src/bridge/workspace.ts`
- `media-workbench/src/bridge/media.ts`
- `tests/workspace-data-invalidation.test.js`
- `tests/renderer-media-submit-refresh.test.js`

**要求：**

- [ ] 允许并文档化 `mediaWorkbench`（或明确拆分的 `mediaArticles`/`mediaOrders`）scope；事件 payload 仍只含 revision、scopes、reasonCode。
- [ ] `exportArticle` 成功写入 pair 后发送 `CONTENT_EXPORT_QUEUED`；批量创建复用同一事件策略，失败回滚不得误报成功。
- [ ] `AppContent` 订阅 workspace invalidation，按 revision 去重并用 requestId 丢弃旧的 `scanArticles`/`getOrders` 响应。
- [ ] 文章扫描刷新后如果 active article 已被消费，关闭它；订单刷新与文章刷新属于同一 request 生命周期。
- [ ] 切换页面、重复事件和挂载期间 in-flight 请求不产生刷新环；手动刷新仍可用。

**验收：** 在 AI 内容页把文章导出到 media，切换到“付费媒体投稿”时列表自动出现；在页面已打开时导出，列表无需手动刷新即可出现；提交后文章扫描、订单和 active article 同步更新。

### Phase 5：统一“鱼饼大王”品牌显示并保护内部兼容性

**修改：**

- `desktop/application-identity.js`
- `desktop/main.js`
- `media-workbench/index.html`
- `media-workbench/src/components/Sidebar.tsx`
- `media-workbench/src/components/AuthGate.tsx`
- `media-workbench/src/components/WorkspaceSelectionPanel.tsx`
- `electron-builder.alpha.yml`
- `electron-builder.production.yml`
- `tests/application-identity.test.js`
- 新增 `tests/application-branding.test.js`
- `docs/alpha-packaging-checklist.md`

**要求：**

- [ ] 建立单一 brand 常量：中文主名 `鱼饼大王`、英文辅助名 `Auto Publish`、内部产品/目录名 `AutoPublish`。
- [ ] 侧边栏、登录页、工作区欢迎页、HTML title、BrowserWindow title、快捷方式和打包产品名统一显示中文主名；英文仅作小号 secondary label，且字体尺寸小于中文。
- [ ] 保持 auth entitlement product、application id、userData/local-state/workspace 路径和迁移白名单不变；增加旧目录启动 smoke test。
- [ ] 不在各组件重复硬编码品牌字符串；品牌测试同时检查不存在旧的“智能媒体分发平台/智能媒体分发台”可见文案。
- [ ] 重新生成 `config/build-info.json`，commit 必须等于实际 HEAD，`dirty=false`；产物中不得残留旧 HTML title 或旧品牌文案。

**验收：** 开发模式、alpha 包和 production 包的窗口标题/登录页/侧边栏一致；旧 AutoPublish 工作区和授权仍可正常打开，内部诊断仍报告 `AutoPublish` 产品。

### Phase 6：补齐原架构计划的收尾项

**修改：**

- `media-workbench/src/components/content/BatchGenerationView.tsx`
- `desktop/services/content-generation-batch-service.js`
- `desktop/ipc/content-generation-batch-ipc.js`
- `media-workbench/src/bridge/auth.ts`
- `media-workbench/src/bridge/settings.ts`
- `media-workbench/src/bridge/publication.ts`
- `media-workbench/src/bridge/workspace.ts`
- `media-workbench/src/bridge/transport.ts`
- `tests/architecture-seams.test.js`
- `tests/generation-submission-handoff-ipc.test.js`

**要求：**

- [ ] 提供主进程 `createAndStartGenerationBatch` 深 interface，Renderer 不再编排 create→start 两次命令。
- [ ] 将 bridge 通用 invoke/unwrap/error/fallback 行为收进已有 transport seam；保留领域模块的类型化命令。
- [ ] 删除仅匹配函数名/源码顺序的契约测试，替换为 interface 行为测试；源码扫描只保留依赖方向和安全规则。
- [ ] 统一 mutation scope 常量和 stage policy map，删除重复 switch、旧别名和死 facade；修正 `package.json` 2 空格缩进。
- [ ] 增加 revision 混合时点测试：读取任一存储期间注入 mutation，第一次结果必须丢弃，第二次结果必须全量来自新 revision。

### Phase 7：回归、打包和真实窗口验收

**快速回归：**

```powershell
node --test tests/article-management-snapshot.test.js tests/article-management-filter-model.test.js tests/content-submission-batch.test.js tests/content-submission-export.test.js tests/submission-batch-worker-integration.test.js
node --test tests/renderer-generation-save-flow.test.js tests/renderer-media-submit-refresh.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-content-client-switch.test.js tests/renderer-article-management-filters.test.js
node --test tests/workspace-data-invalidation.test.js tests/application-branding.test.js tests/architecture-seams.test.js
```

**类型、构建和质量门：**

```powershell
npm run typecheck:bridge
npm run typecheck:renderer
npm run build:renderer
npm run format:check
git diff --check
```

**全量与打包：**

```powershell
npm test
npm run verify
npm run pack:alpha:dirty
```

`npm test` 必须输出完整 pass/fail/skip 汇总；若再次超时，必须拆分出阻塞测试并记录进程、测试文件和复现命令，不得以超时后没有错误堆栈作为通过。

**Alpha 验收矩阵：**

| 场景 | 操作 | 必须结果 |
| --- | --- | --- |
| 发布成功后撤销 | 文章投到一个普通平台并完成 published | 该目标不再显示撤销；点击不存在旧按钮，其他仍 queued 目标可独立撤销 |
| 旧 batch | 新 batch 完成、旧 batch 仍 queued | 旧 batch 的真实 queued item 仍可见，已完成 item 不可撤销 |
| 单篇生成 | 生成后不改字符直接保存 | 保存按钮可点击，文章管理立即出现，保存只调用一次 |
| Media 入队 | 内容页导出到 media，停留或切换到付费媒体页 | 文章扫描自动刷新，消费后 active article 关闭 |
| 多目标待投稿 | 文章先投平台 A，再选择平台 B/media resource | A 成功不隐藏文章；直到所有可用目标终结才离开待投稿 |
| 品牌 | 启动 alpha 包和开发窗口 | 主标题“鱼饼大王”大于英文 `Auto Publish`，无旧品牌文案 |
| 兼容性 | 使用旧 AutoPublish 工作区、旧授权和旧配置 | 数据目录、认证产品和迁移行为不改变 |

不得在验收中调用真实 AI、真实浏览器平台、付费媒体 API、付款或不可逆删除；使用临时 workspace、fake adapter 和明确的 publication fixture。真实包只用于窗口标题、资源加载、build-info 和旧目录兼容验证。

## 五、建议提交顺序

1. `test: add red submission-generation-media-multi-target regressions`
2. `fix(publication): make target matrix and management snapshot authoritative`
3. `fix(submission): reconcile terminal batch items and close stale cancel actions`
4. `fix(content): allow initial save and refresh after single generation`
5. `fix(media): invalidate and refresh paid-media workbench after queue changes`
6. `refactor(generation): move create-and-start sequencing into main process`
7. `refactor(branding): introduce fish-cake display identity without changing internal paths`
8. `test: replace source-string contracts and add revision atomicity coverage`
9. `chore: rebuild alpha package with exact commit metadata`

每个提交只跨一个清晰 seam；红测和对应实现放在同一提交，删除旧实现不能延期到无法验证的最后一步。

## 六、完成标准

- [ ] 发布成功的目标不再显示或接受撤销；旧 queued 目标仍按目标独立处理，重复撤销只返回明确幂等结果。
- [ ] 主进程快照是文章阶段、目标事实、取消 plan 的唯一 owner；Renderer 不再二次派生或读取过期数据。
- [ ] 单篇生成不改字也能保存，生成后文章管理可见，保存/刷新无重复 IPC 或迟到响应污染。
- [ ] Media 单篇/批量入队和提交后自动刷新文章、订单和 active article，事件 revision 可去重。
- [ ] 多目标文章在仍有可用目标时留在待投稿，所有目标终结后才进入最终阶段；`uncertain` 继续 fail closed。
- [ ] “鱼饼大王”是唯一中文可见品牌，中文大于英文；内部 `AutoPublish` 身份、路径和授权兼容不变。
- [ ] 原架构计划的 create/start 收口、源码字符串测试清理、revision 原子性、bundle/profile 基线和 full test 汇总均有可验证证据。
- [ ] `npm run typecheck:bridge`、`npm run typecheck:renderer`、快速回归、`npm test`、`npm run verify`、alpha 打包和真实窗口验收全部有结果；无临时诊断文件、无调试日志、无用户真实数据变更。

