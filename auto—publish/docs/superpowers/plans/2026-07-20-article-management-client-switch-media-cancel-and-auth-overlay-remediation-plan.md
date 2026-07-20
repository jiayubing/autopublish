# AutoPublish 文章管理客户切换、付费投稿撤销与授权浮层修复计划

**日期：** 2026-07-20  
**范围：** `F:\官媒投稿\auto—publish` 及 `release-alpha\win-unpacked` 的本地打包验收  
**目标：** 修复文章入队后客户选择偶发失效、切换客户后的默认筛选不正确、`media` 付费投稿漏显示撤销入队，以及付费投稿确认按钮被授权状态浮层遮挡的问题。所有文章、客户资料、队列和发布记录继续保存在本地；不把业务工作区同步到 J4125，也不调用真实投稿或付款接口。

---

## 一、诊断结论

| 问题 | 当前证据 | 结论/处理策略 | 优先级 |
| --- | --- | --- | --- |
| 任意客户文章入队后仍不能切换客户 | `ContentWorkbench` 已有客户切换清理；`GeneratedArticlesView` 已有 `clientRequestIdRef`、`isCurrentClient()` 和迟到响应隔离。临时真实窗口中，入队后用鼠标打开选择器并用键盘切换，确实可从一个客户切到另一个客户；现有测试也通过，但没有覆盖“入队请求尚未完成/刷新与模态层同时存在”的真实时序。 | **尚未完全复现。** 先建立覆盖 busy、队列刷新、抽屉/浮层和 `elementFromPoint()` 的真实 Renderer 红色测试，记录当前 `clientId`、交互禁用原因和命中元素；只有测试明确失败后再调整状态隔离或覆盖层。 | P0（诊断优先） |
| 切换客户后默认页面不是待投稿 | `ContentWorkbench.tsx` 的 `handleClientChange()` 当前调用 `setArticleStageFilter('all')`；`ArticleStageTabs` 中“待投稿”的真实 stage id 是 `pending_submission`。 | 直接改为切换客户后设置 `pending_submission`，并增加行为测试，避免以不存在的 `pending` id 修复。 | P1 |
| `media` 付费投稿不出现撤销入队 | `GeneratedArticlesView.tsx` 只取 `submissionBatches[0]` 计算 `latestBatchCancelableCount`。真实本地记录中，最新 `media` 批次为 `completed/skipped`，前一个 `media` 批次仍为 `queued/queued`；页面因此显示“最近批次当前没有可撤销项”。内容投稿服务的 `previewCancelBatch()` 对 staged media queue 可以返回可撤销，说明服务端取消能力正常。 | 将“最近批次”动作改成当前客户全部批次的可撤销/可清理项聚合，并按批次执行取消；不能因 `media` 没有 `publicationId/attemptId` 就判为冲突。 | P0 |
| 付费投稿最终确认按钮被授权时间/设备数量遮挡 | `AuthGate.tsx` 的授权状态/恢复提示和 `PreflightModal.tsx` 都使用 `fixed ... z-50`。两者层级相同，后挂载的授权浮层可覆盖预检弹窗底部按钮。 | 统一模态层级契约：授权状态浮层降级或在模态开启时隐藏，预检/确认模态使用更高且统一的层级；通过多窗口尺寸的真实命中测试确认按钮可点击。 | P0 |

### 应建立的红色诊断信号

此前的临时检查已删除，下面的命令是实施阶段必须建立并先跑红的反馈回路；其中不存在的测试文件应在 Task 0 创建：

```powershell
# 客户切换诊断：真实 Renderer 行为、请求时序和命中元素
node --test tests/renderer-content-client-switch.test.js

# 默认筛选红色诊断（修复前应失败）
node -e "const fs=require('fs'); const s=fs.readFileSync('media-workbench/src/components/ContentWorkbench.tsx','utf8'); if(!s.includes(\"setArticleStageFilter('pending_submission')\")) process.exit(1)"

# media 旧 queued 批次被最新 completed 批次遮蔽的夹具测试
node --test tests/renderer-content-submission-batch-actions.test.js

# 授权浮层必须低于预检模态
node -e "const fs=require('fs'); const a=fs.readFileSync('media-workbench/src/components/AuthGate.tsx','utf8'); const p=fs.readFileSync('media-workbench/src/components/PreflightModal.tsx','utf8'); const az=(a.match(/fixed[^\\n]*z-(\\d+)/)||[])[1]; const pz=(p.match(/fixed[^\\n]*z-(\\d+)/)||[])[1]; if(!(Number(pz)>Number(az))) process.exit(1)"
```

第一项目前不能宣称“已定位为 `setClientId` 失效”：打包窗口已经成功完成客户切换。若新测试仍不能复现，保留诊断 seam，并在实施记录中要求用户提供录屏/时间戳日志后再扩大改动范围。

---

## 二、设计约束与低耦合原则

1. **客户选择是工作台会话事实。** 普通入队、批次交接、撤销、清理和刷新只能更新本客户的派生列表与队列事实，不得锁定、重置或回写全局 `clientId`。
2. **客户请求必须可丢弃。** 文章、批次、发布记录和注意事项查询都带 `clientId + requestId`；旧客户响应不得覆盖新客户状态。
3. **队列动作与 UI 解锁分离。** 撤销只改变投稿队列/批次状态，不承担“解锁客户切换”的副作用。
4. **付费媒体按“文章 × 媒体资源”判断重复。** `media` staged queue 没有普通平台的远端 publication id 是正常事实；取消前只要求本地批次项处于未开始投稿的可取消状态。
5. **聚合动作只读后端快照。** UI 不自行推断批次状态；由一个深模块返回当前客户的可撤销/可清理批次摘要及每个批次的安全原因。
6. **授权只显示状态，不抢占业务模态。** 授权提示不能成为确认按钮的交互层；模态的焦点、Escape 和点击区域由模态本身拥有。
7. **不改变发布账本语义。** 撤销未开始投稿只标记本地队列/批次取消，不删除文章、发布记录或标题快照；已开始或不确定的远端工作继续走现有安全阻断。

---

## 三、目标接口（先建立 seam，再改实现）

### 1. 客户工作台会话接口

```ts
type ClientViewSession = {
  clientId: string;
  requestId: number;
  stageFilter: ArticleWorkflowStage | 'all';
  busyReason: 'idle' | 'loading' | 'submitting' | 'cancelling' | 'cleaning';
};
```

`GeneratedArticlesView` 只接受当前 `clientId` 和只读数据结果；父级 `ContentWorkbench` 负责选择客户与默认筛选。子模块不能通过成功/失败回调改变父级客户。

### 2. 批次动作聚合接口

建议在 `desktop/services/content-submission-service.js` 或独立的 `submission-batch-actions` 模块提供：

```ts
type SubmissionBatchActionSummary = {
  clientId: string;
  cancelable: Array<{ batchId: string; target: string; count: number }>;
  cleanable: Array<{ batchId: string; target: string; count: number }>;
  blocked: Array<{ batchId: string; target: string; count: number; reasonCode: string }>;
};
```

该接口一次读取当前客户的全部批次，按批次保留身份；Renderer 只渲染摘要并传回选中的 `batchId`，不直接扫描 store 或猜测 `media` 规则。

### 3. 层级令牌接口

在 Renderer 样式约定中集中定义：

```ts
const zIndex = {
  page: 0,
  statusToast: 30,
  dropdown: 40,
  modal: 100,
  modalPopover: 110,
} as const;
```

实际可以采用 Tailwind 类或 CSS 变量，但不得继续让 `AuthGate` 和各个模态各自散落相同的 `z-50`。所有全屏确认、预检、交接和回收预览都必须使用同一契约。

---

## 四、实施任务

### Task 0：建立四个正式红色回归场景

**Modify/Create:**

- `tests/renderer-content-client-switch.test.js`
- `tests/renderer-content-submission-batch-actions.test.js`（如不存在则创建）
- `tests/renderer-responsive-layout.test.js`
- `tests/content-submission-batch.test.js`
- `tests/architecture-seams.test.js`（仅保留必要的依赖方向规则）

**要求：**

- [ ] 客户 A 有一篇文章，执行普通入队；在入队 promise 尚未完成、列表刷新进行中以及刷新完成后三个时点点击客户选择器，均能切换到 B。
- [ ] 交接抽屉打开、批次交接成功/部分失败、队列撤销和失败清理时，客户选择器仍有可见且可点击的命中元素；测试使用真实鼠标坐标和 `document.elementFromPoint()`，不能只用 `selectOption()`。
- [ ] 切换后断言列表只包含 B、筛选值为 `pending_submission`，并证明 A 的队列事实没有被删除。
- [ ] 构造“最新批次 `completed/skipped`、旧批次 `queued/queued`”的 media fixture；断言页面显示可撤销数量并调用旧批次的取消预检。
- [ ] 1280×720、1024×768、窄窗口和高 DPI（若测试环境支持）下，预检确认按钮的中心点命中按钮而不是授权浮层；遮挡时测试先红。
- [ ] 测试只使用本地 fake adapter/fixture，不访问 `auth.jiayubing.xyz`、真实 AI、真实媒体投稿或付款。

**验证：**

```powershell
node --test tests/renderer-content-client-switch.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-responsive-layout.test.js tests/content-submission-batch.test.js
```

### Task 1：修复客户切换时序和默认筛选

**Modify:**

- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- `media-workbench/src/components/content/GenerationSubmissionHandoffDrawer.tsx`
- `media-workbench/src/components/content/ArticleAttentionPanel.tsx`（若其 loading/overlay 参与遮挡）
- `tests/renderer-content-client-switch.test.js`
- `tests/renderer-generation-submission-handoff.test.js`

**要求：**

- [ ] `handleClientChange()` 将 stage filter 从 `all` 改为 `pending_submission`；只有客户真正改变时重置，重复选择同一客户不触发无谓刷新。
- [ ] 客户切换开始时生成新的 request id，清理旧客户的 selected、feedback、详情抽屉、删除预检和错误提示；旧请求的 `finally` 不能把新客户的 `busy` 改回错误状态。
- [ ] 普通入队和批次交接的 `busy` 只覆盖自身命令；不得把父级客户选择器设为 disabled。若确实有不可避免的短暂切换窗口，显示“正在切换到 XXX”而不是静默吞掉点击。
- [ ] 成功交接后自动关闭全屏抽屉；部分失败仍保留重试摘要，但关闭按钮、Escape 和客户选择器始终可用。
- [ ] 必要时给 `GeneratedArticlesView` 增加 `key={clientId}` 或等效的局部会话 seam，确保旧客户局部 state 不会在新客户复用；只有红色测试证明需要时才采用，避免无效重挂载。
- [ ] 文章管理标题/客户选择器显示当前客户，便于判断“点击无反应”究竟是被遮挡还是客户未改变。

**验收：** 入队、撤销、失败清理、交接成功和交接部分失败后，不重启软件即可连续切换 A→B→C；每次进入客户都落在“待投稿”。

### Task 2：聚合全部批次的撤销与清理动作

**Modify:**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `desktop/services/content-submission-service.js`
- `src/content/submission-batch-store.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `tests/content-submission-batch.test.js`
- `tests/renderer-content-submission-batch-actions.test.js`

**要求：**

- [ ] 移除 UI 对 `submissionBatches[0]` 的唯一依赖；按当前客户全部批次生成 `cancelable`、`cleanable`、`blocked` 三组摘要。
- [ ] 撤销按钮显示“撤销未开始投稿（N）”，N 为所有可撤销批次项之和；摘要中同时列出目标（例如 `media`）和批次时间，避免用户误以为只作用于最近一批。
- [ ] 确认后按批次调用既有 `previewCancelBatch(batchId)` / `cancelBatch(batchId)`，每批次单独记录成功、不可取消和异常；禁止为了聚合 UI 绕过服务层直接改 JSON。
- [ ] 若多个批次同一客户均可撤销，采用顺序执行或服务层原子批量命令，保证中途失败可重试且不会重复取消；结果返回已取消/跳过/阻断明细。
- [ ] `media` 的 staged queue 只依据队列状态和重复投稿保护判断；没有 `publicationId`/`attemptId` 不得自动变成 `submission queue status conflict`。
- [ ] 取消完成后刷新批次、队列、文章阶段和导航数量；“最近批次没有可撤销项”只在全部批次确实为 0 时显示。
- [ ] 失败清理同样不能只看最新批次；只清理明确 `failed + canCleanup` 项，保留 `uncertain`、`submitting` 和已提交事实。

**验收：** 最新批次已完成但前一批仍 queued 时，页面能显示并撤销前一批；撤销后队列消失、文章回到正确派生阶段，发布记录不被删除。

### Task 3：修复授权浮层与付费投稿模态层级

**Modify/Create:**

- `media-workbench/src/components/AuthGate.tsx`
- `media-workbench/src/components/PreflightModal.tsx`
- `media-workbench/src/App.tsx`
- 其他全屏模态（交接、平台确认、回收预检）涉及的组件
- `media-workbench/src/styles.css` 或 Tailwind/CSS 层级令牌文件（若项目已有统一入口）
- `tests/renderer-responsive-layout.test.js`
- `tests/renderer-preflight-modal.test.js`（如不存在则创建）

**要求：**

- [ ] 授权状态与“恢复中”提示降到 `statusToast` 层级（例如 `z-30`），不得与模态共用 `z-50`。
- [ ] 预检/确认模态统一使用 `modal` 层级（例如 `z-[100]`），内部确认按钮或弹出选择器使用 `modalPopover`。
- [ ] 模态打开时，授权状态浮层可以隐藏或移到不覆盖 footer 的区域；不得依赖 `pointer-events-none` 作为唯一修复，因为视觉遮挡仍会造成用户误判。
- [ ] 为模态设置可见的滚动容器和底部安全区；窄窗口下按钮不能被授权信息、浏览器 viewport 底部或父级 `overflow-hidden` 裁剪。
- [ ] 统一检查 `PreflightModal`、平台发布确认、生成交接、回收站预检和设备/授权管理弹窗，避免只修一个入口后其他入口仍遮挡。
- [ ] 维持焦点管理、Escape 关闭和未确认时不提交的现有语义。

**验收：** 付费投稿选择文章和媒体后，确认按钮始终可见、可聚焦、可点击；点击不会被授权时间/设备信息拦截，授权状态仍可在模态关闭后查看。

### Task 4：错误文案、刷新闭环与可观测性

**Modify:**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `desktop/services/content-submission-service.js`
- `desktop/ipc/content-submission-ipc.js`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `CONTEXT.md`
- `docs/test-suite-inventory.md`（若已存在）

**要求：**

- [ ] 将“没有可撤销项”改成按范围说明：当前客户全部批次均无可撤销项，或列出不可取消原因和对应批次。
- [ ] `submission queue status conflict` 必须映射为安全中文 reason code，并展示批次、目标和下一步；不能只显示通用英文冲突。
- [ ] 所有取消/清理命令完成后发出最小化 `workspace:data-invalidated`（revision、scopes、reasonCode）事件，文章阶段、导航数量和投稿页共享同一快照刷新。
- [ ] 为客户切换诊断增加可选开发日志：request id、client id、busy reason、active overlay、命中元素 tag；不得记录文章正文、Cookie、绝对路径或认证令牌。发布前移除或默认关闭日志。
- [ ] 文档说明“取消入队不等于删除文章/发布记录”，“media 无远端 publication id 属于正常 staged queue 事实”。

---

## 五、验证顺序

### 1. 红色测试与模块测试

```powershell
node --test tests/renderer-content-client-switch.test.js tests/renderer-content-submission-batch-actions.test.js tests/content-submission-batch.test.js
```

先确认新用例在当前实现上能够分别捕捉：客户切换时序、默认筛选、旧 media 批次遗漏和浮层命中错误；再逐项修改并保持每次只改变一个 seam。

### 2. Renderer 类型、构建与行为

```powershell
npm --prefix media-workbench run lint
npm --prefix media-workbench run typecheck:strict
npm --prefix media-workbench run build
node --test tests/renderer-content-client-switch.test.js tests/renderer-generation-submission-handoff.test.js tests/renderer-responsive-layout.test.js tests/renderer-preflight-modal.test.js
```

### 3. 投稿批次与全量回归

```powershell
node --test tests/content-submission-batch.test.js tests/content-submission-service.test.js tests/platform-ipc-boundary.test.js
npm test
npm run verify
```

不得在验证期间修改真实工作区的文章、队列、发布记录或平台 Cookie；批次测试使用临时 workspace fixture。

### 4. Alpha 打包验收

```powershell
npm run pack:alpha:dirty
```

从 `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe` 验证：

1. 客户 A 任意文章入队后，在命令进行中、完成后、撤销后切换 B/C，客户选择不丢失；切换后默认显示“待投稿”。
2. 构造一个最新已完成的 `media` 批次和一个较旧仍 queued 的 `media` 批次，文章管理仍显示“撤销未开始投稿”，且可撤销旧批次。
3. 付费投稿预检在 1280×720、1024×768 和窄窗口下确认按钮可见可点；授权时间/设备数量不覆盖按钮。
4. 切换页面期间不改变正在执行的投稿任务；返回文章管理后批次和导航数量已刷新。

真实账号只用于登录和授权状态显示；不点击真实媒体投稿、付款或不可逆删除按钮。

---

## 六、建议提交顺序

1. `test(renderer): add red client-switch timing and modal hit tests`
2. `fix(content): reset client stage filter to pending submission`
3. `fix(submission): aggregate cancelable media batches across client`
4. `fix(ui): establish auth toast and modal z-index contract`
5. `fix(content): refresh queue and navigation after batch actions`
6. `docs(test): record unresolved client-switch reproduction boundary`

每个提交只跨一个模块 seam，保留可独立回滚性；不得把真实数据迁移、认证服务改造或无关代码整理混入本计划。

---

## 七、完成标准

- [ ] 入队、交接、撤销和清理不再阻断客户选择；若问题仍无法复现，已有明确的时序测试、诊断字段和用户可提供的录屏/时间戳要求。
- [ ] 每次切换客户后文章管理默认筛选为 `pending_submission`，并且 A/B 客户列表与队列事实不会串台。
- [ ] 付费 `media` 的所有可撤销批次都能被发现和按批次安全取消，最新批次完成不会隐藏旧 queued 批次。
- [ ] `submission queue status conflict` 只用于真实不可安全取消的状态，显示中文原因和下一步，不用于缺少普通平台远端 id 的 media staged item。
- [ ] 授权提示与业务模态层级统一，付费投稿确认按钮在支持的窗口尺寸下可见、可聚焦、可点击。
- [ ] 取消/清理后队列、文章阶段和主导航数量刷新闭环，发布记录和标题快照保留。
- [ ] Renderer lint、严格类型检查、相关行为测试、全量测试和 alpha 打包验收通过。
- [ ] `git status --short` 只包含本计划文件及实施所需变更；真实工作区内容未被修改。
