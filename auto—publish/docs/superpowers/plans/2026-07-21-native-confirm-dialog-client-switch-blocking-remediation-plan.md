# AutoPublish 原生确认框阻塞客户切换修复计划

**日期：** 2026-07-21  
**范围：** `F:\官媒投稿\auto—publish` 的文章管理入队/撤销流程、Renderer 测试和 alpha 打包验收  
**目标：** 解决文章加入投稿队列或撤销队列后客户选择器失效、必须重启软件才能恢复的问题。此次重点删除 Electron Renderer 中仍然存在的同步 `window.confirm()`，用可观察、可关闭、绑定客户上下文的应用内确认流程替代，并保留上一版已修复的队列终态和请求隔离。

---

## 一、真正遗漏的根因

### 1. 入队和撤销仍调用同步原生确认框

当前代码仍有：

```tsx
// GeneratedArticlesView.queueSelected
window.confirm(`新增 ... 确认继续？`)

// GeneratedArticlesView.cancelCancelableBatches
window.confirm(`确认撤销当前客户 ...？`)
```

`window.confirm()` 是同步阻塞调用。在 Electron 中，Renderer 在确认框关闭前不会继续处理其他点击、select change、React state 更新或异步 UI 收尾。若确认框被其他窗口遮挡、失去焦点、出现在屏幕外或用户没有明确点击“确定/取消”，用户看到的现象就是：

- 客户选择器无法点击；
- 文章管理按钮不再响应；
- 队列看似没有撤销；
- 重启软件后恢复。

### 2. 现有测试把这个问题自动绕过了

当前真实 Renderer 测试使用：

```js
page.on("dialog", (dialog) => void dialog.accept());
```

这会自动接受所有原生确认框，因此测试从未验证真实用户面对确认框时的交互，也无法发现“确认框没有关闭导致页面不可操作”。

### 3. 客户选择器并没有真正被 `disabled`

当前 `ContentWorkbench` 的客户 `<select>` 没有 `disabled` 属性。结合原生确认框的同步阻塞，可以排除“代码显式锁定客户”的单一解释；真正需要修复的是阻塞式确认机制，以及确认动作完成后的客户上下文收口。

### 4. 已修复的服务层终态仍必须保留

上一轮服务层已经增加 action plan、`SUBMISSION_ALREADY_CANCELLED` 和失效事件逻辑，但本计划不把它们撤回。应用内确认只解决 Renderer 阻塞；取消后的 `cancelled` 终态、`allowedCount = 0`、workspace invalidation 仍必须继续验证。

---

## 二、必须删除的错误实现

1. 删除 `GeneratedArticlesView.queueSelected()` 中的 `window.confirm()`。
2. 删除 `GeneratedArticlesView.cancelCancelableBatches()` 中的 `window.confirm()`。
3. 删除相关测试中自动接受原生对话框的代码：

```js
page.on("dialog", (dialog) => void dialog.accept());
```

4. 删除只为原生对话框准备的“点击后一直 busy/等待 IPC”的假状态分支；确认前不应设置投稿 busy，确认后才进入请求态。
5. 不再通过提高 z-index、设置全屏遮罩或禁用客户选择器来掩盖原生确认框问题。

以下确认仍需迁移为同一套应用内确认模块，避免后续复发：

- 文章复制新版本；
- 发布结果人工核对；
- 文章恢复/永久删除；
- 未保存文章离开确认。

---

## 三、目标交互模型

### 1. 入队流程

```text
点击加入投稿队列
  -> 预览 IPC
  -> 设置 pendingConfirmation = { kind: 'queue', clientId, input, preview }
  -> 显示应用内确认条/对话框
  -> 用户确认：清除 pendingConfirmation，开始 createBatch
  -> 用户取消/切换客户：清除 pendingConfirmation，不创建队列
```

确认框必须显示在内容区内，不能使用 `window.confirm()` 阻塞整个窗口。客户切换发生时，旧客户确认上下文自动取消，不能把 A 客户的确认提交到 B 客户。

### 2. 撤销流程

```text
点击撤销
  -> 使用当前 action plan 生成 pendingConfirmation
  -> 显示批次数量、文章数、目标平台和阻断项
  -> 用户确认：清除旧 plan，开始 cancelBatch(planId)
  -> 完成：刷新当前客户数据和全局 invalidation
  -> 取消/切换客户：不执行任何取消
```

请求中的“正在撤销”只禁用确认按钮和当前客户文章动作；全局客户选择器始终可点击。切换客户时旧请求继续执行，但返回结果必须用 `{clientId, requestId, planId}` 丢弃旧客户 UI 更新。

### 3. 应用内确认模块接口

建议建立 `ConfirmationHost`/`ActionConfirmationModal` 深模块：

```ts
type PendingConfirmation =
  | { kind: 'queue'; clientId: string; input: ContentSubmissionBatchInput; preview: ContentSubmissionBatchPreview }
  | { kind: 'cancel'; clientId: string; plans: ContentSubmissionCancellationPreview[]; total: number };

type ConfirmationHostProps = {
  pending: PendingConfirmation | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};
```

模块负责可见性、焦点、Escape、取消按钮和窄窗口滚动；业务组件只负责创建 pending 数据和执行确认命令。

---

## 四、实施任务

### Task 0：建立真实红色回归测试

**Modify/Create:**

- `tests/renderer-content-client-switch.test.js`
- `tests/renderer-content-submission-batch-actions.test.js`
- `tests/renderer-content-confirmation-flow.test.js`
- `tests/content-submission-batch.test.js`

**先看到红色：**

1. 移除 `page.on("dialog", ...accept())`，点击“加入投稿队列”；当前实现应因原生 dialog 不在 DOM 中而无法完成可观察确认流程。
2. 断言页面存在可访问的应用内确认元素，例如 `role="dialog"`、标题“确认加入投稿队列”和“取消/确认”按钮。
3. 在确认框打开时点击取消，断言没有调用 `createSubmissionBatch`，客户仍可切换。
4. 在确认框打开时点击确认，断言调用一次 `createSubmissionBatch`，完成后客户可以切换。
5. 对撤销执行同样测试：确认前不调用 `cancelSubmissionBatch`；确认后调用一次；完成后客户可以切换。
6. 延迟 `cancelSubmissionBatch`，确认请求进行中切换 A→B→A；断言 B 的文章和筛选不被 A 的迟到响应覆盖。
7. 断言测试中不存在自动接受原生 dialog 的监听器。

**验证：**

```powershell
node --test tests/renderer-content-confirmation-flow.test.js tests/renderer-content-client-switch.test.js tests/renderer-content-submission-batch-actions.test.js
```

### Task 1：实现应用内确认，不再阻塞 Renderer

**Modify/Create:**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/ActionConfirmationModal.tsx`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/types.ts`
- `tests/renderer-content-confirmation-flow.test.js`

**要求：**

- [ ] `queueSelected()` 只负责预览并设置 `pendingConfirmation`，删除 `window.confirm()`。
- [ ] `cancelCancelableBatches()` 只负责整理当前 plan 并设置 `pendingConfirmation`，删除 `window.confirm()`。
- [ ] `pendingConfirmation` 记录 `clientId`、请求 id 和 plan id；切换客户或组件卸载时立即清除。
- [ ] 应用内确认 modal 的 backdrop 不能覆盖全局 header 客户选择器；至少保留一个可见的关闭/取消出口。确认框正文位于内容区，窄窗口可滚动。
- [ ] 确认按钮点击后才设置 `busy/submitting`；取消按钮不触发任何 IPC。
- [ ] 防止双击确认：同一 pending confirmation 只能提交一次。
- [ ] Escape 关闭确认，不提交；点击其他客户时自动关闭当前客户的 pending confirmation。
- [ ] 不允许把 `pendingConfirmation` 持久化到 localStorage 或工作区文件，重启后不恢复未确认动作。

### Task 2：修复确认后的队列和撤销收口

**Modify:**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `desktop/services/content-submission-service.js`
- `desktop/ipc/content-submission-ipc.js`
- `tests/content-submission-batch.test.js`

**要求：**

- [ ] 入队确认成功后清空当前客户 selected 和 pending confirmation，刷新文章/批次/action plan。
- [ ] 撤销确认成功后清空旧 cancellation plans，刷新当前客户；`cancelled` item 不再产生 `allowedCount > 0`。
- [ ] 撤销执行返回 `SUBMISSION_ACTION_STALE` 时只刷新一次并显示“队列已变化，请重新检查”，不能再次弹出原生确认或无限重试。
- [ ] 保留 `cancelBatch()` 的 batch terminal status、`SUBMISSION_BATCH_CANCELLED` invalidation 和 `changedScopes`。
- [ ] 如果结果为 `cancelledCount = 0` 且存在 blocked item，显示具体 reasonCode；不能显示空成功提示。

### Task 3：将其他阻塞式确认迁移到同一模块

**Modify:**

- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/ActionConfirmationModal.tsx`
- `tests/renderer-history-editor-flow.test.js`
- `tests/renderer-published-trash-flow.test.js`

**要求：**

- [ ] 迁移复制文章、人工核对发布结果、恢复/永久删除和未保存离开确认。
- [ ] 删除所有业务动作中的 `window.confirm()`；允许保留真正的 `beforeunload` 浏览器生命周期提示，但不得用它确认队列操作。
- [ ] 所有确认都具备明确标题、动作对象、确认/取消按钮、Escape 行为和错误反馈。
- [ ] modal 不覆盖全局客户选择器；若操作上下文与客户绑定，切换客户自动取消 pending。

### Task 4：打包一致性与运行态诊断

**Modify/Create:**

- `scripts/verify-alpha-package.js`
- `tests/production-packaging.test.js`
- `docs/test-suite-inventory.md`
- `CONTEXT.md`

**要求：**

- [ ] 构建检查禁止 Renderer dist 中出现 `window.confirm(`，除非是明确列入白名单的 `beforeunload` 代码。
- [ ] 构建检查确认 `ActionConfirmationModal` 已进入 alpha dist，旧原生确认文案只出现在测试 fixture 或迁移记录中。
- [ ] 测试在无 dialog listener 的情况下运行；任何原生 dialog 都视为失败。
- [ ] 开发模式下为确认流程记录 `[CONFIRM-FLOW]` 的 clientId、kind、requestId、opened/confirmed/cancelled/closed reason；不得记录文章正文、Cookie 或令牌。生产构建移除或关闭日志。
- [ ] alpha 包启动后显示 build commit，确保用户没有继续运行旧 dist。

---

## 五、验证顺序

### 快速回归

```powershell
node --test tests/renderer-content-confirmation-flow.test.js tests/renderer-content-client-switch.test.js tests/renderer-content-submission-batch-actions.test.js tests/content-submission-batch.test.js
```

### Renderer 类型与构建

```powershell
npm --prefix media-workbench run lint
npm --prefix media-workbench run typecheck:strict
npm --prefix media-workbench run build
```

### 全量与打包

```powershell
npm test
npm run verify
npm run pack:alpha:dirty
```

### Alpha 手工验收

1. 文章管理选择客户 A，点击加入投稿队列；确认框必须在应用内可见，取消/确认均能操作。
2. 确认入队成功后立即切换 B，再切回 A；不重启软件，客户选择器可用，A 的文章状态正确。
3. 点击撤销未开始投稿；确认框必须在应用内可见。取消确认后不改变队列，确认提交后队列进入 `cancelled`，按钮消失。
4. 撤销请求人为延迟时切换客户；客户选择器仍可点击，后台撤销继续，返回结果不污染新客户。
5. 触发计划过期/服务失败；显示中文错误和重试入口，不弹出隐藏原生确认框。

真实账号只用于登录状态验证；不得在验收中调用真实媒体投稿、付款或不可逆删除。

---

## 六、完成标准

- [ ] 入队和撤销路径不再调用同步 `window.confirm()`，Renderer 不会被隐藏原生框锁死。
- [ ] 应用内确认框可见、可取消、可用 Escape 关闭；客户切换不会把旧客户动作提交到新客户。
- [ ] 入队/撤销完成后队列、文章阶段、主导航和 action plan 一致；`cancelled` 不再显示可撤销按钮。
- [ ] 撤销进行中、成功、失败和过期时客户选择器都能正常切换，不需要重启软件。
- [ ] 现有 Renderer 测试不再自动 accept 原生 dialog；测试覆盖真实确认流程和客户切换。
- [ ] `window.confirm()` 旧实现、自动 dialog listener 和相关死测试已删除，没有无用兼容代码残留。
- [ ] Renderer lint、严格类型检查、回归测试、全量测试、verify 和 alpha 打包通过。

