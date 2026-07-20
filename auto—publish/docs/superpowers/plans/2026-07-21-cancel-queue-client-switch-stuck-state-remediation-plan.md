# AutoPublish 撤销队列未收口与客户切换卡死修复计划

**日期：** 2026-07-21  
**范围：** `F:\官媒投稿\auto—publish` 源码、Renderer 测试和 `release-alpha\win-unpacked` 打包验收  
**目标：** 修复点击“撤销未开始投稿”后队列事实没有正确收口、按钮重复出现/再次点击无效，以及撤销过程中或撤销后客户选择器无法正常切换的问题。此次以已复现的服务层状态错误为主线，并删除上一版留下的无效兼容逻辑。

---

## 一、已复现的根因

### 1. 撤销后的动作计划仍将 item 当成可撤销

当前 `evaluateItemAction()` 对 `cancel` 有一段“取消操作幂等”分支：当 item 已经是 `cancelled` 时仍返回 `allowed: true`。`buildSubmissionActionPlan()`、`listBatches()` 和 Renderer 因此继续把该 item 计入 `allowedCount/cancelableCount`。

隔离夹具已复现：

```text
第一次取消：cancelledCount = 1
取消后重新列出：item.status = cancelled，但 action plan.allowedCount 仍为 1
再次取消：cancelledCount = 0，界面看起来“撤销没有反应”
```

这不是用户操作错误，而是“已完成的撤销”被错误地重新暴露为可撤销动作。

### 2. `cancelBatch()` 没有发出工作区失效事件

当前 `cancelBatch()` 调用 `cancelArticleSubmissionItem()` 后直接返回，没有调用 `notifyData("SUBMISSION_BATCH_CANCELLED")`。因此投稿队列、文章需处理派生视图、主导航数量和其他页面可能继续使用旧快照。

文章管理虽然会尝试本地 `refreshHistoryData()`，但其他页面不会收到变化；若刷新期间切换客户，旧请求和旧动作计划还可能继续回写当前页面。

### 3. 撤销操作与客户切换缺少统一的运行态

当前 Renderer 在一次点击中并行管理：

- `busy`
- `cancellationPlans`
- `submissionBatches`
- 当前 `clientId`
- 旧批次的 `planId`

`busy` 只在子组件内控制按钮，客户选择器没有显式禁用；但切换客户和撤销响应之间没有“操作属于哪个 client/revision”的统一运行态。实际窗口中需要验证的是：取消请求进行时，客户选择是否被固定层/旧确认对话框遮挡，或是否因旧响应使当前客户 state 被重置。

### 4. 现有回归测试是假绿

当前测试验证了“第一次取消返回 1”，但没有验证以下关键不变量：

- 取消后 action plan 的 `allowedCount` 必须为 0；
- 取消后列表 item 的 `canCancel` 必须为 false；
- 重复点击必须显示幂等/已完成，而不是继续显示可撤销按钮；
- 撤销期间真实鼠标点击客户选择器；
- `workspace:data-invalidated` 在撤销后确实发出并刷新其他页面。

---

## 二、必须删除的错误实现

1. **删除“已 cancelled 仍允许 cancel”的通用分支。**
   - 在 `evaluateItemAction()` 中，`entry.safe.status === 'cancelled' && action.action === 'cancel'` 不得返回 `allowed: true`。
   - 幂等结果只允许由执行接口在收到重复请求时返回 `idempotent: true`，不能让已完成 item 出现在新的可撤销预览中。

2. **删除旧的数量兼容别名。**
   - 在所有调用方已经使用 `allowedCount/blockedCount` 后，删除 `previewCancelBatch()` 返回的 `cancelableCount/uncancelableCount` 兼容字段。
   - 删除 `ContentSubmissionCancellationPreview` 中对应的可选字段及只为旧字段存在的测试断言。

3. **删除 Renderer 以 `submissionBatches` 再次猜测可撤销状态的逻辑。**
   - `cancelableBatches` 只能来源于服务端 action plan；不再根据 item 的遗留 `canCancel` 字段二次推断。
   - 取消成功或阻断后立即清除旧 plan，等待新快照；旧 plan 不能继续驱动按钮。

4. **删除撤销期间对客户会话的隐式锁定。**
   - 不在父级 `ContentWorkbench` 或全局工作区状态设置“投稿撤销中”的锁。
   - 子组件的 `busy` 只禁用当前动作按钮和当前客户文章操作，不能影响 header 客户选择器。
   - 任何为“防止切换客户”增加的 `disabled`、全屏遮罩或固定层都应删除；任务继续运行与客户选择是两个独立事实。

---

## 三、目标状态模型

### 1. 撤销动作状态

```text
queued + action plan.allowed       -> 显示“撤销”
cancel 请求执行中                  -> 显示“正在撤销”，清除旧 plan
cancelled / batch 已收口            -> 不显示撤销按钮
plan 过期                           -> 重新加载并显示“状态已变化，请重新检查”
blocked / active / uncertain        -> 不显示撤销按钮，显示明确原因
```

`cancelled` 是终态事实，不是新的可撤销状态。重复请求可以安全返回幂等结果，但不能重新进入可撤销列表。

### 2. 客户切换状态

为撤销和加载请求使用同一个 `{ clientId, requestId, batchRevision }` 上下文：

- 请求返回时上下文不匹配，只丢弃响应，不修改当前客户 state；
- 切换客户时清理旧 plan、选中项、反馈和详情状态；
- 当前客户选择器始终可操作，除非用户正在处理自己的未保存编辑确认；
- 撤销任务继续在主进程运行，不因为页面切换而取消。

---

## 四、实施任务

### Task 0：先建立会失败的回归测试

**Modify/Create:**

- `tests/content-submission-batch.test.js`
- `tests/renderer-content-submission-batch-actions.test.js`
- `tests/renderer-content-client-switch.test.js`
- `tests/workspace-data-invalidation.test.js`（如已有同类测试则合并）

**必须先红：**

1. 使用完整文章来源夹具创建一个 `media` staged batch。
2. 预览并执行第一次取消，断言 `cancelledCount === 1`。
3. 重新调用 `listBatches()` 和 `previewCancelBatch()`，断言当前实现失败：`item.status === 'cancelled'` 但 `allowedCount > 0` 或 `canCancel === true`。
4. 第二次取消断言当前实现返回 `cancelledCount === 0`，并把它固定为回归场景：修复后应不再显示按钮，若直接重复调用则返回明确 `idempotent` 结果。
5. 使用 fake `onDataInvalidated` 记录回调，执行取消后断言包含 `platformQueue`、`navigationSummary`、`articleAttention` 和 `SUBMISSION_BATCH_CANCELLED`。
6. Renderer 中让取消 IPC 延迟，使用真实鼠标坐标点击客户选择器；取消进行中和完成后都能从 A 切换到 B，且旧 A 的响应不会覆盖 B。
7. 取消返回 `SUBMISSION_ACTION_STALE` 时，页面清除旧 plan、刷新当前客户一次，并显示可执行的中文提示；不得无限重试或把客户选择器锁死。

**验证：**

```powershell
node --test tests/content-submission-batch.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-content-client-switch.test.js
```

### Task 1：修复服务层撤销终态和事件通知

**Modify:**

- `desktop/services/content-submission-service.js`
- `desktop/services/submission-workflow.js`
- `desktop/ipc/content-submission-ipc.js`
- `src/content/submission-batch-store.js`
- `tests/content-submission-batch.test.js`
- `tests/workspace-data-invalidation.test.js`

**要求：**

- [ ] `evaluateItemAction('cancel')` 只对真实 `queued` item 返回 allowed；`cancelled`、`failed`、`submitting`、`submitted`、`uncertain` 均不可撤销。
- [ ] `buildSubmissionActionPlan()` 对 cancelled item 返回 `blocked`/`already_cancelled`，但 `allowedCount` 必须为 0。
- [ ] `cancelBatch()` 在全部可执行项处理完成后，以批次 store 的单次原子更新收口 batch status：没有 queued item 时为 `cancelled`，仍有 queued item 时保持 `queued`；更新 `updatedAt`。
- [ ] `cancelArticleSubmissionItem()` 的重复调用可返回 `idempotent: true`，但不能改变 action plan 的 allowed 统计。
- [ ] `cancelBatch()` 只要实际取消或确认幂等收口，就调用一次 `notifyData('SUBMISSION_BATCH_CANCELLED')`；通知异常不得回滚已完成的本地取消。
- [ ] 返回结果包含 `cancelledCount`、`idempotentCount`、`blockedItems`、`batchStatus` 和 `changedScopes`，不再只返回“0 项”模糊结果。
- [ ] 保留 media staged queue 的本地身份规则，但不再通过 `targetPlatformId === 'media'` 创建第二套状态机。

**验收：** 第一次取消后列表立即变为 `cancelled` 且无可撤销 plan；第二次请求只得到幂等结果，不再删除/修改其他队列项。

### Task 2：收敛 Renderer 的 plan 生命周期

**Modify:**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/types.ts`
- `media-workbench/src/bridge/content.ts`
- `media-workbench/src/electron-api.ts`
- `tests/renderer-content-submission-batch-actions.test.js`

**要求：**

- [ ] 删除 `cancelableCount/uncancelableCount` 兼容字段和相关分支；按钮只使用 `allowedCount`。
- [ ] 取消点击开始后立即把当前客户的 `cancellationPlans` 标记为 pending/清空，按钮文字变为“正在撤销…”。
- [ ] 成功响应按 `cancelledCount + idempotentCount + blockedItems` 显示结果，然后强制重新加载文章、批次、发布记录和 action plan；旧 plan 不得复用。
- [ ] `SUBMISSION_ACTION_STALE` 只允许一次自动刷新/重新预览；刷新后仍变化则显示“队列已变化，请重新检查”，并恢复客户选择和页面操作。
- [ ] `finally` 只依据请求 token 清理当前请求的 `busy`；旧客户请求的 finally 不能覆盖新客户 busy。
- [ ] 切换客户时清除 cancellationPlans、batchFeedback 和 selected；当前客户重新从服务端获取自己的 plans，默认阶段保持 `pending_submission`。
- [ ] 客户选择器不接收 `busy`/`cancellationPending` 作为 disabled 条件；如果真实命中测试发现遮罩，迁移该遮罩到内容区，不提高 z-index 解决。

### Task 3：修复工作区失效事件与跨页面刷新

**Modify:**

- `desktop/main.js`
- `media-workbench/src/workspace-data-store.tsx`
- `media-workbench/src/article-attention-store.tsx`
- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `tests/workspace-data-invalidation.test.js`

**要求：**

- [ ] `SUBMISSION_BATCH_CANCELLED` 通知触发 `platformQueue`、`navigationSummary`、`articleAttention` 的刷新；事件携带递增 revision。
- [ ] 各 store 以 revision 丢弃旧响应，不能因为切换客户或页面而回写旧快照。
- [ ] 文章管理的本地 refresh 与全局 invalidation 去重：一次取消最多一次当前客户显式加载和一次其他页面 store 刷新。
- [ ] 主导航数量、投稿队列和文章管理在取消完成后最终一致；切换页面再返回不得恢复已取消项。

### Task 4：真实 UI 命中与客户切换验收

**Modify:**

- `tests/renderer-content-client-switch.test.js`
- `tests/renderer-content-submission-batch-actions.test.js`
- `tests/renderer-responsive-layout.test.js`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`

**要求：**

- [ ] 测试取消进行中、确认对话框关闭后、错误提示出现后和成功刷新后，客户选择器中心点 `elementFromPoint()` 命中 select 或其可交互区域。
- [ ] 打开文章编辑器时 header 仍可用；只有未保存编辑才弹出一次离开确认，不把撤销 busy 当成离开阻断。
- [ ] A 取消后立即切换 B，再切回 A，A 的批次显示 `cancelled` 且无撤销按钮；B 的数据不被 A 的迟到响应覆盖。
- [ ] 取消请求失败时客户选择仍可用，错误区显示安全 reasonCode；不保留全屏遮罩。

### Task 5：删除旧代码、补文档并重打包

**要求：**

- [ ] 删除 service 中 cancelled 仍 allowed 的分支、旧 count alias、未使用的 `canCancel` 推断字段和对应死测试。
- [ ] 删除只为旧撤销逻辑存在的临时注释、调试日志和重复 plan 映射。
- [ ] 更新 `CONTEXT.md`：cancelled 是终态；幂等重复请求不等于可撤销；撤销会发出 workspace invalidation。
- [ ] 重新构建 Renderer 和 alpha 包；确认 `build-info.json` 与实际 dist 一致，避免用户继续启动旧构建。
- [ ] 清理所有临时 fixture；不修改用户真实 `.autopublish` 数据，不自动替用户取消真实队列。

---

## 五、验证顺序

### 模块红绿回归

```powershell
node --test tests/content-submission-batch.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-content-client-switch.test.js tests/workspace-data-invalidation.test.js
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
| 首次撤销 | 入队后点击撤销并确认 | 队列文件/sidecar 清理，item=batch 状态变为 `cancelled`，按钮消失 |
| 重复撤销 | 不刷新页面再次观察/点击 | 不再显示可撤销按钮；若直接调用返回幂等，不产生删除副作用 |
| 撤销后切换 | 撤销进行中切换 A→B→A | 客户选择器可点击，任务继续，A 最终无可撤销项 |
| 计划过期 | 撤销前改变队列文件或发布状态 | 显示“动作计划已过期”，重新加载一次，不锁客户选择 |
| 跨页面刷新 | 在文章管理撤销后打开投稿队列/返回文章管理 | 主导航、队列和文章阶段一致 |
| Media staged | 没有远端 publication/attempt id 的 media 队列 | 只按本地身份安全取消，不报普通平台冲突；完成后终态正确 |

真实账号只用于登录状态验证；不得在验收中调用真实媒体投稿、付款或不可逆删除。使用临时 workspace 和 fake adapter。

---

## 六、建议提交顺序

1. `test: add post-cancel terminal-state regression`
2. `fix(submission): stop treating cancelled items as cancelable`
3. `fix(submission): persist batch terminal state and emit invalidation`
4. `fix(renderer): clear stale cancellation plans and recover from stale actions`
5. `test(renderer): verify client switch during cancellation with pointer hit`
6. `chore: remove obsolete cancellation aliases and rebuild alpha package`

每个提交保持可独立回滚；不得把删除旧代码推迟到最后一个“清理提交”，避免中间版本同时存在两套撤销语义。

---

## 七、完成标准

- [ ] 取消一次后 item 和 batch 都进入正确终态，action plan 的 `allowedCount` 为 0，撤销按钮不再重复出现。
- [ ] 重复取消只返回明确幂等结果，不再显示“没有反应”。
- [ ] 撤销完成触发全局 workspace invalidation，文章管理、投稿队列和主导航最终一致。
- [ ] 撤销期间、成功后、失败后和计划过期时客户选择器均可点击，旧客户响应不能覆盖新客户。
- [ ] 删除 cancelled 可撤销分支、旧 count alias、重复 UI 推断和死测试，没有无用兼容代码残留。
- [ ] Renderer lint、严格类型检查、回归测试、全量测试、verify 和 alpha 打包验收通过。
- [ ] `git status --short` 只包含计划和实施变更，用户真实工作区数据未被修改。

