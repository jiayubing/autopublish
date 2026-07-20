# AutoPublish 客户切换、Media 撤销刷新与授权遮挡回归修复计划

**日期：** 2026-07-20  
**范围：** `F:\官媒投稿\auto—publish` 源码、Renderer 构建产物和 `release-alpha\win-unpacked` 验收  
**目标：** 解决文章入队后客户选择器无法点击、`media` 付费投稿无法可靠撤销且文章列表不刷新、授权状态仍遮挡付费投稿确认按钮。此次不继续叠加旧补丁；先删除已证明错误或没有收益的实现，再建立单向刷新、统一投稿动作判定和独立的模态宿主。

---

## 一、重新排查结论

| 症状 | 当前代码证据 | 真实根因判断 | 优先级 |
| --- | --- | --- | --- |
| 文章入队后客户切换不可点击 | `ContentWorkbench` 的客户选择器本身没有 `disabled`。但 `GeneratedArticleEditorPanel` 在非 `embedded` 且窄窗口时使用 `fixed inset-0 z-30`，会覆盖工作台外层的客户选择器；同时 `GeneratedArticlesView.refreshHistoryData()` 调用父级 `onRefreshArticles()`，而父级的 `articleRefreshToken` 又是子组件加载 effect 的依赖，形成“子刷新 -> 父 token -> 子刷新”的反馈循环。上一版测试只调用 `selectOption()`，没有覆盖真实鼠标命中和连续刷新。 | 两个独立问题叠加：页面级固定编辑器/其他固定抽屉可能拦截 header；文章管理内部刷新存在错误的双向耦合，造成 UI 持续重渲染和操作窗口不稳定。 | P0 |
| Media 投稿后撤销仍失败 | Renderer 依据 `listBatches()` 返回的 `item.canCancel` 显示按钮；`previewCancelBatch()` 又自己按 `pairState` 判断；真正的 `cancelBatch()` 则再次经过 `reconcileBatch()` 与 `evaluateItemAction()`。三套判定不共享同一 action token，旧批次、缺少远端 publication/attempt id 或本地队列文件已被移走时，可能出现“预览可撤销、执行跳过/返回 0”。当前 `reconcileBatch()` 还保留了只为 media 增加的特殊分支，和通用判定重复。 | 撤销接口没有单一事实来源；预览结果不是执行承诺。必须删除 UI 推断和 media 特判，改为服务层生成一次带 fingerprint 的动作计划，预览和提交都消费同一计划。 | P0 |
| Media 投稿后文章列表不自动刷新 | `App.tsx` 的 `confirmRealSubmit()` 在 `submitSelected(articles)` 后只调用 `handleRefreshOrders()`，没有重新执行 `scanArticles()`，也没有清理已消失的 `activeArticle`。文章文件被媒体投稿流程移动/消费后，顶部文章列表仍使用旧的 `articles` state。 | 付费媒体流程缺少提交完成后的文章数据刷新闭环，与文章管理的本地队列刷新不是同一个事实源。 | P0 |
| 授权时间/设备数量仍遮挡确认 | 上一版把 `AuthGate` 固定状态从 `z-50` 改成 `z-30`，把 `PreflightModal` 改成 `z-[100]`；但授权信息仍是 `fixed` 页面浮层。层级数字不是可靠的交互隔离，尤其在 Electron/`motion`/父级 stacking context、窄窗口和不同构建 CSS 下仍可能覆盖或干扰确认区域。现有测试只匹配源码字符串，没有渲染并点击真实确认按钮。 | 设计错误不是单纯 z-index 数值，而是把全局授权状态做成覆盖层。应删除固定授权浮层，改为正常布局中的状态条；模态通过独立宿主/portal 管理焦点和点击。 | P0 |

### 当前验证结果

以下相关测试目前全部通过，但不能证明缺陷已修复，因为测试 seam 不完整：

```powershell
node --test tests/content-submission-batch.test.js tests/renderer-content-client-switch.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-responsive-layout.test.js
```

当前测试缺少：

- 入队期间真实鼠标点击客户选择器、固定编辑器遮挡和连续刷新次数断言。
- `media` 预览结果与实际取消结果的一致性断言。
- `submitSelected()` 完成后 `scanArticles()` 被调用且文章列表消失项被移除。
- 真实授权状态和预检确认按钮的 `elementFromPoint()` / click 命中测试。

---

## 二、必须删除的错误或无效实现

实施时以“删除后再补新 seam”为原则，以下代码不能继续保留：

1. **删除文章管理的反向刷新回调。**
   - 从 `GeneratedArticlesViewProps` 删除 `onRefreshArticles`。
   - 从 `ContentWorkbench` 向 `GeneratedArticlesView` 传递 `onRefreshArticles={refreshArticles}` 的代码删除。
   - 从 `GeneratedArticlesView.refreshHistoryData()` 删除 `onRefreshArticles?.()`。
   - 保留 `refreshToken` 只能作为父级（例如编辑器保存后）触发子级重新加载的单向输入；子级自己的入队、撤销和清理只更新自己的 state。
   - 若确认没有其他调用方需要该 prop，则删除 `articleRefreshToken` 以外的重复刷新包装函数，不保留兼容空回调。

2. **删除窄窗口页面级固定编辑器。**
   - 删除 `GeneratedArticleEditorPanel` 中的 `fixed inset-0 z-30` 方案。
   - 不用再增加更高 z-index 去压过它；编辑器应位于 `ContentWorkbench` 的内容区宿主内，不能覆盖全局 header 的客户选择器。
   - 删除只为该固定层编写的焦点循环/遮罩逻辑；保留必要的 Escape、脏数据确认和编辑器内部焦点管理。

3. **删除 media 专用的重复撤销分支和 UI 推断。**
   - 删除 `reconcileBatch()` 中只针对 `targetPlatformId === "media"` 且缺少 publication/attempt id 的独立判断分支。
   - 删除 `previewCancelBatch()` 自己计算 `publicationCancelable`、`pairState` 的另一套规则。
   - 删除 Renderer 通过 `item.canCancel`/`item.canCleanup` 自行聚合并逐批猜测执行结果的逻辑（包括 `cancelableBatches`、`cleanableBatches` 的临时聚合，如新接口已取代）。
   - 不删除 staged media 的业务能力；能力应迁移到统一的服务层动作解析器，而不是以平台名称分叉。

4. **删除授权 z-index 补丁。**
   - 删除 `AuthGate` 中 `fixed ... z-30` 的授权状态和恢复提示。
   - 删除只为压制该浮层而增加的 `z-[100]`/`z-30` 互相竞争的层级约定。
   - 不保留“pointer-events-none 但视觉上仍覆盖”的授权浮层。

---

## 三、目标设计

### 1. 客户工作台单向刷新

`ContentWorkbench` 只拥有客户选择和页面级刷新令牌；`GeneratedArticlesView` 只拥有当前客户的文章/批次/发布记录快照。

```text
父级 clientId / reloadToken  ─────► 文章管理加载
文章管理入队/撤销/清理 ───────────► 本地 refreshHistoryData()
文章管理不得反向修改父级 reloadToken
```

客户选择器必须位于全局 header；编辑器、详情抽屉和投稿预检只能渲染在内容区宿主或独立 modal root 中。

### 2. 投稿动作计划深模块

在 `desktop/services/content-submission-service.js` 内建立唯一接口：

```ts
type SubmissionActionPlan = {
  batchId: string;
  clientId: string;
  items: Array<{
    articleId: string;
    targetPlatformId: string;
    action: 'cancel' | 'cleanup';
    allowed: boolean;
    reasonCode?: string;
    fingerprint?: string;
  }>;
  allowedCount: number;
  blockedCount: number;
};
```

- `previewCancelBatch()` 只生成并返回该计划的安全 DTO。
- `cancelBatch()` 必须带 preview token/fingerprint，再由同一解析器重新校验 revision；不允许重新实现另一套媒体/普通平台规则。
- `media` staged item 的身份是 `{clientId, articleId, batchId, targetPlatformId}`；没有远端 publication/attempt id 不自动构成冲突，但缺失本地身份、路径不安全、内容改变或远端已开始时必须阻断。
- 多个同目标 item 不得只用 `publicationId || undefined` 作为匹配键；内部使用稳定的 `batchId + articleId + targetPlatformId`，必要时再附加 publication/attempt id。

### 3. Media 投稿完成刷新

在 `AppContent` 建立唯一的 `refreshMediaWorkbenchData()`：

- 重新 `scanArticles()`，更新文章列表；
- 重新 `getOrders()`，更新订单列表；
- 当前文章已不在扫描结果时清除 `activeArticle`；
- 只有提交 promise 成功后调用，失败保留当前文章并显示错误；
- 防止重复刷新请求覆盖较新的结果。

### 4. 非覆盖式授权状态

建立 `AuthStatusBar`（或等效深模块）：

- 状态条作为 App 普通布局的一部分，不使用 `position: fixed`；
- 模态打开时状态条仍可存在，但不会覆盖模态内容；也可以在 `modalOpen` 时隐藏；
- 模态通过 `createPortal(..., document.body)` 或统一 `ModalHost` 渲染，拥有唯一 backdrop、焦点和 Escape 语义；
- 不再让业务正确性依赖 z-index 数字比较。

---

## 四、实施任务

### Task 0：建立真正会失败的回归测试

**Create/Modify:**

- `tests/renderer-content-client-switch.test.js`
- `tests/renderer-content-submission-batch-actions.test.js`
- `tests/renderer-media-submit-refresh.test.js`
- `tests/renderer-preflight-modal.test.js`
- `tests/content-submission-batch.test.js`
- `tests/desktop-media-workbench.test.js`（如已有同类文件则合并）

**必须先看到红色：**

- 以真实 Renderer 鼠标坐标点击客户选择器，不使用 `selectOption()` 替代点击；入队请求人为延迟，断言 header select 的中心点 `elementFromPoint()` 仍是 select/option 交互区域。
- 打开历史编辑器后再执行入队和客户切换，断言编辑器不覆盖 header；切换后客户值、文章列表和筛选均更新。
- 给 `listContentArticles`/`listContentSubmissionBatches` 计数，执行一次文章管理入队；断言不会因为 `onRefreshArticles` 反馈产生无限重复加载，稳定窗口内最多一次初始加载 + 一次显式刷新。
- 构造一个没有远端 publication/attempt id 的 staged media item，分别执行 preview 与 cancel；断言 preview `allowedCount` 等于实际 `cancelledCount`，不可执行项不能显示可撤销按钮。
- 构造两个同一 media 目标、不同文章的 item，断言动作计划逐项匹配，不会把第一个 item 的 fingerprint 复用给第二个。
- Mock `submitSelected()` 移走一篇文章后，执行付费媒体确认；断言 `scanArticles()` 被调用、文章从列表消失、订单刷新且 active article 被清除。
- 渲染真实授权状态与预检弹窗，在 1280×720、1180×760 和窄测试 viewport 下点击确认按钮；断言命中按钮且授权文本不是按钮祖先或覆盖层。

**验证：**

```powershell
node --test tests/renderer-content-client-switch.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-media-submit-refresh.test.js tests/renderer-preflight-modal.test.js tests/content-submission-batch.test.js
```

### Task 1：删除刷新反馈环并隔离客户选择器

**Modify:**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`
- `tests/renderer-content-client-switch.test.js`

**实施要求：**

- [ ] 删除本计划“必须删除”第 1、2 项列出的代码。
- [ ] `refreshHistoryData()` 完成后只提交当前组件 state；所有异步回调检查 `clientId + requestId`，但不触发父级 reload token。
- [ ] 客户切换开始时取消/失效旧请求，先清理当前客户局部 state，再提交新客户；不把 `busy` 或旧请求的 `finally` 传播到客户选择器。
- [ ] 将编辑器放入内容区相对定位宿主，或使用不覆盖 header 的 portal；移除 `fixed inset-0 z-30`。
- [ ] 在真实 DOM 中确认 header select 始终可以获得鼠标命中；如果仍有其他固定抽屉覆盖，统一迁移到 `ModalHost`，不要局部再加 z-index。
- [ ] 保留 `pending_submission` 作为切换客户后的默认筛选，不恢复 `all`。

**验收：** 文章入队请求进行中、完成后、撤销后，以及编辑器打开时，都能 A→B→C 切换；没有持续刷新或无响应状态。

### Task 2：统一 Media/普通平台撤销判定

**Modify:**

- `desktop/services/content-submission-service.js`
- `desktop/services/submission-workflow.js`
- `desktop/ipc/content-submission-ipc.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/bridge/content.ts`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `tests/content-submission-batch.test.js`
- `tests/renderer-content-submission-batch-actions.test.js`

**实施要求：**

- [ ] 删除 `reconcileBatch()` 的 media 专用重复分支、`previewCancelBatch()` 的第二套判定和 Renderer 的 `canCancel` 猜测聚合。
- [ ] 新增服务层 `buildSubmissionActionPlan(batchId, action)`；预览、执行和列表摘要都使用同一解析器。
- [ ] preview 返回 `planId`/`fingerprint`、可执行项、阻断项和中文安全 reasonCode；IPC 去除路径后保留这些字段。
- [ ] execute 校验 plan 对应的 batch revision、item fingerprint 和当前文件/sidecar 状态；过期计划返回明确 `SUBMISSION_ACTION_STALE`，不得静默跳过。
- [ ] 对 staged media：本地身份完整且未开始投稿时可撤销；本地文件已不存在但身份可证明时按幂等收尾；身份不完整/内容改变/路径不安全/远端已开始时阻断并说明原因。
- [ ] 批次状态和 item 状态一次原子写入；执行结果返回 `cancelledCount`、`skippedCount`、`blockedItems`，不返回“成功”但实际为 0 的模糊结果。
- [ ] Renderer 只显示服务层 action plan；确认后执行同一个 plan，并在成功/阻断后重新加载当前客户数据。
- [ ] 对旧版本批次做只读迁移/重建 action metadata；不能把不明身份的旧 item 自动标成可撤销。

**验收：** Media 新入队、旧 queued 批次、重复批次和文件已被消费四种场景，预览和执行结果一致；不能再出现按钮显示可撤销但点击后无变化。

### Task 3：补齐付费 Media 提交后的文章刷新

**Modify:**

- `media-workbench/src/App.tsx`
- `media-workbench/src/components/ArticleList.tsx`
- `media-workbench/src/components/ArticleEditor.tsx`（仅在需要清理 active article 时）
- `tests/renderer-media-submit-refresh.test.js`

**实施要求：**

- [ ] 抽取 `refreshMediaWorkbenchData()`，带 request id/取消旧响应保护。
- [ ] `confirmRealSubmit()` 在 `submitSelected()` 成功后先刷新文章扫描，再刷新订单；失败不清空当前文章。
- [ ] 文章被移动或消费后从 `articles` 中消失；`activeArticle` 若不再存在则设为 null，避免编辑器继续显示已提交文件。
- [ ] 刷新不调用文章管理的 `refreshToken`，两个工作台各自拥有本地事实源；跨模块变化通过既有 invalidation 事件通知，不能互相触发循环。
- [ ] 保留提交中的按钮禁用，但不把刷新过程误报为投稿失败。

**验收：** 付费媒体确认成功后返回文章列表，已提交文章立即消失/状态更新，订单列表同步；切换到文章管理后不会看到旧快照。

### Task 4：删除授权覆盖层，建立 ModalHost

**Modify/Create:**

- `media-workbench/src/components/AuthGate.tsx`
- `media-workbench/src/components/PreflightModal.tsx`
- `media-workbench/src/App.tsx`
- 其他使用 `fixed inset-0` 的确认/抽屉组件
- `tests/renderer-preflight-modal.test.js`
- `tests/renderer-responsive-layout.test.js`

**实施要求：**

- [ ] 删除 AuthGate 中 fixed 授权状态和恢复提示；在 App 普通 header/状态区渲染 `AuthStatusBar`，或模态打开时完全隐藏状态条。
- [ ] 将 PreflightModal 和其他真正模态统一挂到 `ModalHost`/`document.body` portal；保留一个 backdrop 和焦点范围。
- [ ] 删除仅用于“z-30 对 z-[100]”的源码字符串测试，改成真实渲染、可见性和 pointer hit test。
- [ ] 预检内容区可滚动、footer 固定在模态内部，确认按钮在最小窗口尺寸仍可见；授权状态不得位于按钮祖先或按钮命中点之上。
- [ ] 检查平台确认、回收预检、交接抽屉、发布详情和文章编辑器，统一使用宿主，不留下另一套固定层级。

**验收：** 用户可以直接点击“确认提交”；授权时间和设备数量只在正常状态条中展示，不遮挡、不抢焦点、不阻断点击。

### Task 5：清理旧代码、构建产物和文档

**要求：**

- [ ] 删除未再被引用的 `onRefreshArticles` 类型、参数和调用；删除旧 `articleRefreshToken` 仅在确认没有单向调用方时执行。
- [ ] 删除旧 media 特判、旧 action 聚合字段和对应死测试；不得以注释保留废弃分支。
- [ ] 搜索并清理所有 `fixed inset-0 z-30` 的文章编辑器实例、AuthGate 状态浮层和只为旧方案存在的 CSS 类。
- [ ] 重新构建 `media-workbench/dist` 和 `release-alpha`，确认打包产物不再包含被删除的旧字符串/分支。
- [ ] 更新 `CONTEXT.md`：投稿动作预览与执行共享同一动作计划；付费媒体提交后会刷新本地文章扫描；授权状态不是模态层。
- [ ] 删除临时诊断脚本、截图和测试 workspace，不修改用户真实 `.autopublish` 数据。

---

## 五、验证顺序

### 快速回归

```powershell
node --test tests/content-submission-batch.test.js tests/renderer-content-client-switch.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-media-submit-refresh.test.js tests/renderer-preflight-modal.test.js
```

### Renderer 与类型

```powershell
npm --prefix media-workbench run lint
npm --prefix media-workbench run typecheck:strict
npm --prefix media-workbench run build
node --test tests/renderer-responsive-layout.test.js tests/renderer-history-editor-flow.test.js
```

### 全量与打包

```powershell
npm test
npm run verify
npm run pack:alpha:dirty
```

### Alpha 验收矩阵

| 场景 | 操作 | 必须结果 |
| --- | --- | --- |
| 客户切换 | A 文章加入普通投稿队列，立即切换 B/C | select 可点击，当前客户正确，默认“待投稿”，无循环刷新 |
| 编辑器覆盖 | 打开历史文章编辑器后切换客户 | header 不被遮挡；脏数据按一次确认处理，取消则保持原客户 |
| Media 撤销 | 新 media 入队，预览并确认撤销 | 预览数量等于实际取消数量，队列副本清理，文章阶段刷新 |
| Media 旧批次 | 最新批次 completed、旧批次 queued | 旧批次 action plan 可见；不能被“最近批次”隐藏 |
| Media 文件缺失 | 文件已被消费或旧批次身份不完整 | 可证明身份时幂等收尾；身份不明时明确阻断，不显示假可撤销 |
| Media 提交后刷新 | 付费提交成功 | 文章扫描、订单、active article 同步更新 |
| 授权状态 | 打开付费预检并点击最终确认 | 确认按钮可见可点击；授权时间/设备数不在覆盖层中 |

不得在验收中调用真实付费投稿、付款、AI 或不可逆删除；使用本地 fake adapter 和临时 workspace，真实账号只用于登录状态验证。

---

## 六、建议提交顺序

1. `test: add red client-switch refresh-loop and pointer-hit regressions`
2. `refactor(content): remove child-to-parent history refresh feedback`
3. `refactor(submission): unify preview and execute action plans`
4. `fix(media): refresh local article snapshot after paid submission`
5. `refactor(ui): remove fixed auth overlay and centralize modal host`
6. `test: replace source-string z-index checks with real modal interaction`
7. `chore: remove obsolete media special cases and rebuild alpha package`

每个提交只处理一个 seam；删除旧代码和新行为测试必须在同一模块提交中完成，避免留下“旧实现仍可被调用”的半迁移状态。

---

## 七、完成标准

- [ ] 客户切换不再被入队、刷新、编辑器或固定层遮挡；文章管理没有父子刷新反馈环。
- [ ] 切换客户后默认筛选为 `pending_submission`，客户数据和队列事实不串台。
- [ ] Media 与普通平台使用同一套可验证 action plan；预览可执行数量与实际执行结果一致。
- [ ] Media 投稿完成后文章列表和订单列表自动刷新，已消费文章不会继续显示旧快照。
- [ ] 授权状态不再是 fixed overlay；最终确认按钮在支持的窗口尺寸均可见、可聚焦、可点击。
- [ ] 旧的 `onRefreshArticles` 反馈、media 特判、z-index 补丁和相关死测试已经删除，不以注释或未引用文件形式残留。
- [ ] Renderer lint、严格类型检查、相关红绿回归测试、全量测试、verify 和 alpha 打包验收通过。
- [ ] `git status --short` 只包含本次计划文档及实施变更，用户真实工作区数据未被修改。

