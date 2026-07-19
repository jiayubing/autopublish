# 问题编辑会话、免审核投稿与批量入队交接优化计划

**日期：** 2026-07-19

**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`

**源代码：** `F:\官媒投稿\auto—publish`

**基线提交：** `4dd9c7e feat: complete published article trash and management filters`

**前置计划：** `docs/superpowers/plans/2026-07-19-published-article-trash-and-management-filter-simplification-plan.md`

**目标：** 合并问题维护的重复动作；把人工回答编辑改成可关闭、不会跨客户串状态的独立会话；取消人工审核作为投稿硬门槛；为 50 篇及以上跨客户生成批次提供一次选平台、一次预检、一次确认的批次级投稿交接。

本计划只修改设计文档和业务词汇，不直接修改实现代码，也不操作真实客户资料、文章、生成批次、投稿队列或发布账本。

---

## 1. 结论摘要

| 现象 | 已确认原因 | 处理结论 | 优先级 |
| --- | --- | --- | --- |
| “问题与采集”同时有保存和新增 | 同一个输入框已通过 `editingId` 区分 create/update，但 UI 又放置保存和清空新增两个动作。 | 只保留一个“保存问题”主动作；保存后自然回到新建状态，编辑时只额外提供“取消编辑”。 | P1 |
| 人工编辑回答无法关闭、切客户仍显示 | `editingId` 同时承担问题编辑和回答编辑身份；编辑区没有关闭动作，`clientId` 变化时也不清理状态。 | 拆成问题草稿和人工回答会话；会话绑定 `clientId + questionId`，可关闭并在上下文切换时终止。 | P0 |
| 打开人工回答后部分输入框难以点击 | 当前内联区没有明确焦点生命周期、事件隔离或焦点恢复；问题/回答操作还会触发整套客户与模板刷新，扩大重渲染和焦点抖动。 | 新增真实 Renderer 交互回归，修复焦点和指针事件，并把刷新收敛到内容来源 scope。 | P0 |
| 生成文章必须先审核才能入队 | 批量生成固定写入 `status=generated`，投稿服务固定只接受 `status=saved`。 | 审核不再是强制门槛；抽取“投稿就绪”规则，完整的 generated/saved 文章均可预检入队。 | P0 |
| 50 篇以上要逐个客户入队 | 文章管理和投稿批次 API 都以单一 `clientId` 为边界，Renderer 选择也随当前客户切换。 | 在生成批次结果提供跨客户“投稿交接”；应用层按客户分组，复用现有投稿服务逐组创建队列。 | P0 |

---

## 2. 已完成的排查与反馈信号

### 2.1 已确认的代码事实

`QuestionCollectionView.tsx` 当前存在：

- “保存问题”和“新增问题”两个相邻图标；
- `editingId` 同时控制问题文本更新和人工回答区显示；
- 人工回答区只有“保存人工回答”，没有关闭/取消；
- 客户变化只重新加载问题，没有清理 `editingId`、回答正文和引用草稿；
- 打开另一个问题时没有清空上一问题的引用标题和 URL；
- 保存人工回答成功后不会关闭会话或恢复来源按钮焦点。
- 问题、回答和采集操作在本地 `loadQuestions()` 后又调用父级 `refreshWorkspaceSources()`，导致客户和模板目录被不必要地重读并再次推动子视图刷新。

批量生成与投稿当前存在：

- `content-generation-batch-service.js` 对成功文章固定执行 `article.status = "generated"`；
- `content-submission-service.js` 对 `article.status !== "saved"` 固定归为未审核并排除；
- `GeneratedArticlesView.tsx` 只选择当前客户文章，并以一个 `clientId` 创建投稿批次；
- `GenerationBatchDetail` 没有把成功任务批量交接到投稿队列的入口；
- 生成模板平台与投稿目标是不同概念，不能根据模板平台静默猜测投稿平台。

### 2.2 只读缺陷探针

已运行源码结构探针，结果为：

```text
FAIL single question save action
FAIL manual answer editor can close
FAIL manual editor resets on client change
FAIL batch output is immediately submission-eligible
FAIL submission eligibility is not hard-coded to saved
FAIL batch completion exposes one bulk queue action
```

该探针能捕获五个确定的结构性问题。输入焦点故障仍需用真实 React/Playwright 点击测试锁定，不能只靠源码正则判断。

### 2.3 当前测试基线与缺口

已运行当前 `npm test`：

```text
tests 809
pass 802
fail 0
skipped 7
```

现有测试全部通过但没有拦住本轮问题，缺口包括：

- 没有断言问题编辑只存在一个保存动作；
- 没有打开/关闭人工回答编辑器并继续点击其他输入框；
- 没有验证切换客户后旧问题、旧回答和旧引用全部消失；
- 没有覆盖 generated 文章直接进入投稿预检；
- 没有覆盖一个生成批次跨 2 个以上客户、50 篇以上文章的一次性入队；
- 没有覆盖跨客户交接中途失败后的幂等重试。

---

## 3. 领域与流程决策

### 3.1 问题保存只有一个业务命令

问题输入区保留一个“保存问题”按钮：

- 没有正在编辑的问题时，保存创建新问题；
- 正在编辑现有问题时，保存更新该问题；
- 保存成功后清空草稿并回到新建状态；
- 编辑状态额外提供“取消编辑”，它只放弃草稿，不创建或保存数据；
- 不再显示独立“新增问题”按钮。

“保存”和“取消”含义不同，因此不属于重复入口。

### 3.2 人工回答编辑是独立会话

人工回答编辑会话身份固定为：

```text
clientId + questionId + sessionId
```

会话规则：

- 问题文本编辑和回答编辑使用两套状态，不共享 `editingId`；
- 打开会话时一次性填充当前回答和引用草稿；
- 切换问题前先处理未保存内容；
- 切换客户、离开“问题与采集”或组件卸载时结束会话；
- 保存成功后关闭并把焦点还给触发按钮；
- 保存失败时保留输入并显示安全错误；
- 延迟返回的旧客户请求不得覆盖新会话；
- 引用草稿不得从上一个问题带到下一个问题。

### 3.3 第一版取消强制人工审核

本计划用“投稿就绪”取代“已审核才能投稿”：

```text
标题非空
+ 正文非空
+ 客户、文章身份合法
+ 生成来源与模板快照完整
+ 目标平台支持队列导入
+ 没有重复投稿保护阻断
= 可进入投稿预检
```

关键约束：

- 不删除内容完整性校验，只删除人工点击审核的强制步骤；
- `generated` 和 `saved` 都可以在满足规则时成为投稿就绪；
- 旧 `saved`、`reviewedAt` 字段继续兼容读取，不做破坏性批量迁移；
- 编辑并保存文章仍然可用，但只是内容修改，不再被命名为审核；
- 不完整的旧文章显示具体不可入队原因，不静默补造来源；
- 复制已发布文章的新版本不会自动投稿，仍需显式选择目标并确认入队。

### 3.4 文章管理合并“待审核”与“待投稿”

强制审核取消后，文章管理收敛为五个互斥阶段：

```text
待投稿 | 已入队 | 已发布 | 失败 | 回收站
```

派生优先级：

1. 回收站；
2. 失败、待确认、生成失败或投稿资格校验失败；
3. 已入队/投稿中/已提交；
4. 已发布；
5. 投稿就绪且尚未入队。

这会替代前置计划中的“待审核”阶段，但不删除兼容字段和历史时间。

### 3.5 批量入队放在生成批次完成处

生成批次结束后显示：

```text
成功 50 篇 · 失败 2 篇
[将成功文章加入投稿队列]
```

点击后进入一次批次级交接：

1. 选择一个或多个投稿目标平台；
2. 默认纳入本批次全部投稿就绪的成功文章；
3. 主进程统一预检文章—目标组合；
4. 显示新增、已存在跳过、已发布阻断、待确认阻断、冲突和不可用文章数量；
5. 用户一次确认；
6. 按客户创建现有投稿批次；
7. 返回跨客户汇总和失败分组，允许只重试未完成部分。

默认不自动猜测目标平台，也不在生成结束后自动远端发布。

---

## 4. 低耦合模块边界

### 4.1 `article-submission-eligibility`

新增纯规则模块，只回答：

```text
这篇文章当前是否投稿就绪？如果不是，原因是什么？
```

它不写文章、不改状态、不创建队列。以下调用方共用同一规则：

- 投稿批次预检；
- 文章管理的待投稿阶段；
- 批量生成结果的投稿交接；
- 失败重试入口；
- Renderer 的按钮能力展示。

避免 Renderer、审核服务和投稿服务分别拼写不同资格条件。

### 4.2 `generation-submission-handoff-service`

新增应用层编排器，职责仅为：

- 读取一个生成批次的成功任务；
- 找到任务实际生成的文章；
- 调用投稿就绪规则；
- 按客户分组；
- 委托 `ContentSubmissionService.previewBatch/createBatch`；
- 汇总跨客户结果。

它不得：

- 直接写 input 目录或 sidecar；
- 直接 reserve publication ledger；
- 修改生成任务结果；
- 调用远端发布适配器；
- 复制投稿服务中的冲突和幂等判断。

队列文件、sidecar、投稿批次和 publication reservation 仍只有 `ContentSubmissionService` 可以创建。

### 4.3 跨客户不改写现有投稿批次边界

现有投稿批次继续只属于一个客户。交接编排器将 50 篇文章按客户拆成多个投稿批次，UI 只把它们显示为一次交接结果。

优点：

- 不改变 worker、取消、清理和删除事务对 `clientId` 的既有假设；
- 单客户失败不会破坏已经成功创建的其他客户队列；
- 再次执行时，现有 article—target 幂等保护会跳过已入队项目；
- 无需引入第二个队列写入者。

### 4.4 编辑会话组件不拥有存储

新增 `ManualResearchEditorPanel` 只接收草稿、保存和关闭回调。父层会话控制器拥有 `clientId/questionId/sessionId`，主进程的 collection service 仍是回答存储的唯一写入入口。

### 4.5 内容来源刷新与客户模板刷新分离

新增最小 `contentSources` 失效 scope，问题、采集回答或客户资料内容变化只刷新依赖这些内容的视图。只有用户明确点击“刷新客户与模板”时才重新扫描客户和模板目录。

这样可以避免保存回答后出现“客户与模板已刷新”的错误反馈，也避免广域重渲染干扰正在编辑的输入焦点。

---

## 5. 目标交互设计

### 5.1 问题与采集

新建状态：

```text
[输入问题................................] [保存]
```

编辑状态：

```text
正在编辑：问题标题
[输入问题................................] [保存] [取消编辑]
```

问题行将“编辑问题”和“人工回答”拆成两个明确动作，避免一个铅笔按钮同时打开两类编辑。

### 5.2 人工回答面板

面板头部：

```text
人工编辑回答 · 客户名 · 问题摘要                 [关闭]
```

底部：

```text
[取消] [保存人工回答]
```

交互要求：

- 桌面宽度采用不遮挡主列表的侧栏；窄屏采用有明确关闭按钮的全屏面板；
- Escape 等同取消；
- 有未保存修改时关闭需确认；
- 打开后聚焦回答正文；
- 关闭后恢复到“人工回答”来源按钮；
- 面板以外输入框在非模态桌面布局下仍可点击；
- 窄屏模态布局必须用正确遮罩和焦点陷阱，不得留下透明层拦截指针。

### 5.3 生成批次投稿交接抽屉

第一屏只显示摘要和目标选择：

```text
成功文章：50
涉及客户：12
投稿目标：[ ] 蓝色河畔 [ ] 头条 [ ] 其他媒体
预计文章—目标任务：50 × 已选目标数
[检查并确认]
```

预检后显示：

```text
可新增：92
已存在跳过：6
已发布阻断：1
待确认阻断：0
内容/身份冲突：1
不可投稿文章：2
```

默认折叠正常文章，只展开异常客户和异常文章，避免 50 篇列表造成滚动负担。用户可以取消个别异常文章后重新预检。

确认成功后显示每个客户的投稿批次 ID 和任务数，并提供“打开其他平台投稿”，不要求用户重新逐个客户选择文章。

---

## 6. 分阶段实施任务

### Task 0：先建立红色回归

**Create：**

- `tests/renderer-question-editor-session.test.js`
- `tests/article-submission-eligibility.test.js`
- `tests/generation-submission-handoff.test.js`
- `tests/renderer-generation-submission-handoff.test.js`

**Modify：**

- `tests/doubao-content-workbench.test.js`
- `tests/content-submission-batch.test.js`
- `tests/article-workflow.test.js`
- `tests/renderer-article-management-filters.test.js`
- `scripts/verify.js`

实施：

- [ ] 断言问题输入区只有一个“保存问题”业务动作且没有“新增问题”按钮。
- [ ] 用真实 React 点击打开、关闭、Escape、客户切换和其他输入框焦点，复现当前故障。
- [ ] 断言切换问题不会继承上一问题的引用草稿。
- [ ] 断言保存问题/回答不会触发“客户与模板已刷新”或广域 refresh token。
- [ ] 断言 generated 完整文章在旧服务中被错误排除，先看到 RED。
- [ ] 构造 2 个客户、每个 25 篇成功文章的一次性交接测试，旧实现先 RED。
- [ ] 记录每条 RED 命令和症状后再开始实现。

### Task 1：拆分问题草稿与人工回答会话

**Modify：**

- `media-workbench/src/components/content/QuestionCollectionView.tsx`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/types.ts`
- `desktop/main.js`
- `desktop/services/doubao-collection-service.js`

**Create：**

- `media-workbench/src/components/content/ManualResearchEditorPanel.tsx`
- `media-workbench/src/content-question-editor-session.ts`

实施：

- [ ] 将 `editingId` 拆成 question draft 和 manual answer session。
- [ ] 问题编辑只保留保存，编辑态显示取消编辑。
- [ ] 人工回答使用独立按钮、独立会话和独立草稿。
- [ ] 关闭、Escape、保存成功、客户变化、标签变化、卸载都执行明确会话收尾。
- [ ] 旧请求返回前比较 sessionId，拒绝写入新会话。
- [ ] 保存中只禁用面板动作，不冻结无关页面输入。
- [ ] 关闭后恢复来源按钮焦点。
- [ ] 问题/回答变更发出 `contentSources` 失效，不再调用整套 `refreshWorkspaceSources()`。
- [ ] 单篇和批量生成收到 `contentSources` 后只重读资料/回答，不重扫模板目录。

### Task 2：修复回答面板的焦点与指针事件

**Modify：**

- `media-workbench/src/components/content/ManualResearchEditorPanel.tsx`
- `media-workbench/src/index.css`
- `tests/renderer-question-editor-session.test.js`
- `tests/renderer-responsive-layout.test.js`

实施：

- [ ] 桌面侧栏不渲染覆盖整个内容区的透明层。
- [ ] 窄屏遮罩只在面板打开时存在，关闭后节点完全卸载。
- [ ] 面板内部点击不冒泡到折叠行或选中控件。
- [ ] Tab 顺序、Escape、初始焦点和焦点恢复可自动测试。
- [ ] 依次点击问题输入、客户选择、回答文本、引用输入均可获得焦点。
- [ ] 1024px、1366px 和窄屏布局均无不可点击区域。

### Task 3：抽取投稿就绪规则并移除强制审核门槛

**Create：**

- `src/content/article-submission-eligibility.js`

**Modify：**

- `src/content/article-review-service.js`
- `desktop/services/content-submission-service.js`
- `src/content/submission-export-service.js`
- `desktop/services/article-attention-policy.js`
- `media-workbench/src/article-workflow.ts`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`
- `media-workbench/src/types.ts`

实施：

- [ ] 用一个纯函数返回 `eligible` 和稳定 reasonCodes。
- [ ] generated/saved 只要内容与来源完整均可入队。
- [ ] 投稿服务在创建队列前重新读取并重新校验文章。
- [ ] 删除“审核已选”和“只有已审核文章可入队”的提示与按钮。
- [ ] 将待审核合并到待投稿，文章阶段变为五类互斥视图。
- [ ] 旧 saved/reviewedAt 继续读取；不批量重写真实文章。
- [ ] 不完整来源、空正文、损坏身份保持阻断并显示中文原因。
- [ ] 重试发布也复用同一投稿就绪规则。

### Task 4：实现生成批次投稿交接编排器

**Create：**

- `desktop/services/generation-submission-handoff-service.js`
- `desktop/ipc/generation-submission-handoff-ipc.js`
- `tests/generation-submission-handoff.test.js`

**Modify：**

- `desktop/ipc/register.js`
- `desktop/preload.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`

建议接口：

```text
previewGenerationSubmissionHandoff({ generationBatchId, targetPlatformIds })
commitGenerationSubmissionHandoff({ generationBatchId, targetPlatformIds, previewToken, confirmed: true })
```

实施：

- [ ] 只接受终结或已停止批次中的 succeeded 任务。
- [ ] 用 generationTaskId 找到唯一文章，拒绝缺失或身份冲突。
- [ ] 按 clientId 分组调用现有投稿预检。
- [ ] previewToken 绑定批次 revision、文章身份、目标集合和预检摘要。
- [ ] commit 前重新预检，过期时返回稳定 `HANDOFF_PREVIEW_STALE`。
- [ ] 每客户调用 `ContentSubmissionService.createBatch`，不直接写队列。
- [ ] 返回 created/idempotent/blocked/conflict/failedClientGroups 汇总。
- [ ] 中途失败后重复提交只补齐未完成组，已创建目标幂等跳过。
- [ ] IPC 不返回绝对路径、正文、客户资料、Prompt 或密钥。

### Task 5：在生成批次结果接入一次性入队 UI

**Modify：**

- `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- `media-workbench/src/components/content/BatchGenerationView.tsx`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/Sidebar.tsx`

**Create：**

- `media-workbench/src/components/content/GenerationSubmissionHandoffDrawer.tsx`

实施：

- [ ] 成功任务存在时显示“将成功文章加入投稿队列”。
- [ ] 投稿目标只选择一次，不随客户重复选择。
- [ ] 显示文章数、客户数、目标数和组合任务数。
- [ ] 正常文章折叠，异常文章默认展开并可取消选择。
- [ ] 一次确认后展示跨客户分组结果。
- [ ] 部分失败提供“重试未完成客户”，不重复全部操作。
- [ ] 成功后刷新文章管理、队列快照、导航徽标和投稿页。
- [ ] 提供“打开其他平台投稿”，但不自动开始远端发布。

### Task 6：文档、全量验证与打包验收

**Modify：**

- `docs/content-generation-operations.md`
- `docs/content-workspace-contract.md`
- `docs/desktop-workbench.md`
- `docs/alpha-packaging-checklist.md`
- `CONTEXT.md`

实施：

- [ ] 删除文档中“只有 reviewed/saved 才能导出”的旧契约。
- [ ] 记录投稿就绪、人工回答编辑会话和生成批次投稿交接。
- [ ] 在临时工作区验证 50 篇跨客户交接，不使用真实客户文章。
- [ ] 运行专项、全量、Renderer build、verify 和 alpha 打包。
- [ ] 从 `release-alpha\win-unpacked` 验证问题编辑、客户切换、50 篇入队和投稿页刷新。

---

## 7. 测试矩阵

### 7.1 问题和人工回答

| 场景 | 预期 |
| --- | --- |
| 空草稿保存 | 不调用创建，显示校验提示 |
| 新问题保存 | 创建一次，清空草稿，保持新建态 |
| 编辑问题保存 | 更新一次，不创建重复问题 |
| 编辑问题取消 | 原问题不变，草稿清空 |
| 打开人工回答后关闭 | 面板卸载，焦点回到来源按钮 |
| 有脏数据按 Escape | 提示确认，取消确认时保留草稿 |
| 从客户 A 切到客户 B | A 的会话、正文和引用全部清空 |
| A 的慢请求在切换后返回 | 不覆盖 B 的问题或回答 |
| 从问题 1 切到问题 2 | 引用标题、URL 不串值 |
| 面板打开/关闭后点击其他输入 | 每个输入可正常获得焦点 |

### 7.2 投稿就绪

| 文章事实 | 资格 |
| --- | --- |
| generated + 完整标题/正文/来源 | 可投稿 |
| saved + 完整标题/正文/来源 | 可投稿 |
| generated + 空正文 | 阻断，`ARTICLE_CONTENT_EMPTY` |
| generated + 来源快照不完整 | 阻断，`ARTICLE_PROVENANCE_INCOMPLETE` |
| 已 published 的相同目标 | 幂等/阻断重复，不新建 attempt |
| uncertain 的相同目标 | 阻断并要求核对 |
| failed 的相同目标 | 允许按既有重试规则形成新 attempt |

### 7.3 50 篇跨客户批次交接

| 场景 | 预期 |
| --- | --- |
| 2 客户 × 25 篇 × 1 目标 | 一次确认，创建 2 个客户投稿批次、50 个任务 |
| 10 客户 × 5 篇 × 2 目标 | 100 个组合任务按 10 客户分组 |
| 其中 5 项已入队 | 5 项幂等跳过，其余创建 |
| 其中 1 项 published | 不重复创建该目标，摘要明确 |
| 其中 1 项 uncertain | 该项阻断，不猜测失败 |
| 第 2 个客户创建失败 | 已成功客户保留，重试只补未完成组 |
| preview 后文章被修改 | commit 返回预检过期，不按旧摘要入队 |
| 重复点击确认 | 不生成重复 queue pair 或 attempt |

---

## 8. 验证命令

```powershell
node --test `
  tests/renderer-question-editor-session.test.js `
  tests/article-submission-eligibility.test.js `
  tests/content-submission-batch.test.js `
  tests/generation-submission-handoff.test.js `
  tests/renderer-generation-submission-handoff.test.js `
  tests/article-workflow.test.js `
  tests/renderer-article-management-filters.test.js
```

```powershell
npm test
npm run build:renderer
npm run verify
npm run pack:alpha
```

专项信号应最终变为：

```text
GREEN question-save-action: exactly 1
GREEN manual-answer-session: closable, client-scoped, focus-safe
GREEN submission-eligibility: generated and saved use one policy
GREEN generation-handoff: 50 articles, one confirmation, idempotent retry
GREEN article-management: 5 mutually exclusive stages
```

---

## 9. 建议提交顺序

1. `test: reproduce question editor and bulk handoff regressions`
2. `fix: isolate manual answer editing sessions`
3. `fix: restore question editor focus and pointer behavior`
4. `refactor: derive submission eligibility without mandatory review`
5. `feat: orchestrate generation batch submission handoff`
6. `feat: add one-confirmation bulk queue handoff UI`
7. `docs: document submission readiness and batch handoff`
8. `chore: package and verify question and bulk submission flow`

---

## 10. 最终验收标准

- [ ] 问题输入区只有一个保存动作，不再显示重复新增按钮。
- [ ] 人工回答编辑器有关闭、取消和 Escape；保存成功后自动关闭。
- [ ] 切换客户、问题或标签不会保留旧回答、引用或编辑身份。
- [ ] 打开/关闭编辑器后，页面其他输入框均可正常点击和输入。
- [ ] 人工审核不再是生成文章加入投稿队列的硬前置条件。
- [ ] 完整 generated/saved 文章使用同一投稿就绪规则。
- [ ] 文章管理不再保留没有实际动作的待审核阶段。
- [ ] 50 篇以上跨客户生成结果可一次选择目标、一次预检、一次确认入队。
- [ ] 生成模块不直接写投稿文件，投稿服务仍是唯一队列写入者。
- [ ] 跨客户部分失败可安全重试，不重复创建 queue pair 或 publication attempt。
- [ ] 入队完成后文章管理、导航徽标、投稿队列自动刷新。
- [ ] 入队不是远端发布，仍需用户在投稿工作台确认执行。
- [ ] 专项、全量、Renderer build、verify 和打包验收全部通过。

---

## 11. 非目标与数据保护

- 不自动选择或猜测投稿平台。
- 不在生成完成后自动执行远端发布。
- 不跳过标题、正文、来源快照、身份和重复投稿保护校验。
- 不删除旧文章的 saved/reviewedAt 兼容字段。
- 不把生成模板平台等同于投稿目标平台。
- 不把跨客户大操作实现成新的队列文件写入者。
- 不让 Renderer 直接拼写队列文件、sidecar、batch 或 publication record。
- 不在真实工作区进行批量入队验收；使用临时副本或合成 fixture。
- 不在日志、IPC、测试截图或计划中暴露正文、客户资料、绝对队列路径、Cookie、Prompt、API Key 或完整远端响应。
