# 蓝色河畔配置、投稿撤销与历史文章编辑修复优化计划

**日期：** 2026-07-18

**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`

**源代码：** `F:\官媒投稿\auto—publish`

**内容工作区：** `F:\1`

**基线提交：** `5938597 feat: complete template and publication ledger remediation`

**版本：** `1.0.1`

**目标：** 修复蓝色河畔既有配置无法保留保存、投稿批次与执行结果不同步导致“撤销最近入队”无效的问题，并把历史文章编辑改造成保留上下文的主从操作流。

本计划基于当前打包版的真实界面复现、当前工作区只读数据核对和临时目录中的最小集成复现编写。实施时不得覆盖现有配置、删除历史文章、伪造发布结果或清理真实投稿记录；自动化测试必须使用临时工作区、假 Cookie 和假发布适配器，不发起真实投稿。

> 实施前提：当前工作树包含上一份计划已经完成但尚未提交的修改。开始本计划前先将上一批修改提交或建立可追溯快照；不要用 reset/checkout 清理，也不要把两批改动混在同一个提交中。

---

## 1. 结论摘要

| 问题 | 已确认根因 | 用户影响 | 优先级 |
| --- | --- | --- | --- |
| 蓝色河畔配置似乎不能保存 | Renderer 读取的状态出于安全考虑不返回 Python/vendor 原值，但保存时仍发送空字符串；服务只为 Cookie 保留旧值，空 `pythonPath` 覆盖已存路径后校验失败。 | 已配置用户无法只改栏目 ID，也无法在不重填全部字段的情况下保存或测试。 | P0 |
| “撤销最近入队”无反应 | 创建批次时没有保存 `filename`，执行器却用 `filename + targetPlatformId` 回写结果，永远匹配不到；发布账本已变为 `failed`，批次仍停留在 `queued`。 | 页面持续显示可撤销入口，但预检得到 0 个可撤销项；错误位置还可能在当前滚动区域之外，看起来像按钮失效。 | P0 |
| 历史文章编辑来回切换麻烦 | 点击文章后把顶层 tab 从 `history` 切到 `generate`，历史列表被卸载；编辑器位于完整生成表单下方，返回时筛选、展开组和滚动位置全部丢失。 | 查看、修改多篇文章时需要反复切页和重新定位，误改/漏保存风险较高。 | P1 |
| 展开后的历史列表横向溢出 | 当前行和工具区在真实窗口尺寸下存在内容宽度超出视口的情况，现有响应式测试只检查部分工具栏状态。 | 部分可见控件的实际点击坐标落到窗口外，进一步加重“没有反应”的感受。 | P1 |

---

## 2. 已完成的复现与证据

### 2.1 发布包与当前源码可对应

- 发布包 desktop service 文件与当前工作文件一致。
- 发布包 Renderer bundle 与当前 `media-workbench/dist` 对应 bundle 的哈希一致。
- 因此以下定位适用于本次实际打开的 `AutoPublish.exe`，不是仅基于另一份源码的静态推测。

### 2.2 蓝色河畔既有配置保存失败

真实界面状态：

```text
配置中心 -> 蓝色河畔
Python：已配置 · Cookie：已配置
Cookie 输入框：已配置（留空保留）
点击“保存配置”
-> 配置无效，请检查 Python 路径、Cookie 和栏目 ID。
```

在临时目录中用真实存在的 Python fixture 和已存 Cookie 建立配置后，连续两次复现：状态显示已配置，但以界面当前的空白敏感草稿保存，服务返回 `PLATFORM_CONFIG_INVALID`。

调用链：

```text
HepanProviderSettings.load()
  -> getStatus()
  -> 只返回 safe status，不返回 pythonPath/vendorDir 原值

HepanProviderSettings.save()
  -> draft() 固定生成
     { pythonPath: "", cookie: "", categoryId: 121, vendorDir: "" }
  -> platform-settings-service.validateDraft()
  -> 仅 secretFields（cookie）支持空值保留
  -> Object.assign() 用空字符串覆盖 current.pythonPath
  -> Hepan adapter 校验失败
```

关键文件：

- `media-workbench/src/components/settings/HepanProviderSettings.tsx`
- `desktop/services/platform-settings-service.js`
- `desktop/services/platform-settings/hepan-settings-adapter.js`

已排除：栏目 ID 缺失、旧 Python 路径本身无效、Cookie 无法保留。最小复现使用了真实存在的 fixture 文件；Cookie 的空值保留逻辑本身已经存在。

界面还存在一个误导点：已配置状态下 Python 输入框仍显示硬编码示例 `C:\Python312\python.exe`，该字符串不是读取到的保存值，用户无法判断这是示例还是当前路径。

### 2.3 投稿批次和发布账本发生状态分裂

真实工作区中最近批次的六个蓝色河畔项目仍为 `queued`，对应 Markdown、sidecar 和内容哈希均存在且匹配；但相同项目的发布账本已经是 `failed`，并带有更新的执行 attempt。取消预检返回：

```text
cancelableCount: 0
uncancelableCount: 6
```

临时工作区中的确定性复现链路：

```text
真实 content-submission-service 创建批次
-> 真实 platform-workbench-service 执行
-> 假 adapter 返回明确失败
-> publication ledger = failed
-> submission batch item = queued
-> previewCancelBatch() = 0 个可撤销项
```

连续两次结果一致，说明不是点击事件、并发时序或真实网站状态导致。

根因位于：

- `desktop/services/content-submission-service.js`
- `desktop/services/platform-workbench-service.js`
- `src/content/submission-batch-store.js`

批次创建项保存了 `articleId`、`targetPlatformId`、`publicationId`、`attemptId`、`filePath` 等字段，但没有 `filename`。执行器的 `updateSubmissionBatch()` 却使用：

```js
item.filename === path.basename(filePath)
  && item.targetPlatformId === targetPlatformId
```

因此没有项目能被回写。执行器随后还绕开 `submission-batch-store`，自行扫描和原子写入批次 JSON，使同一份领域数据存在两套读写规则。

“撤销最近入队”的界面逻辑只按批次的旧 `queued` 状态显示按钮。点击后预检发现发布账本已经不是可取消的 `queued` attempt，于是抛出“最近投稿批次没有可撤销项”。错误区域位于长列表上方，用户在列表中部时不一定能看到，表现为没有反应。

### 2.4 历史文章编辑破坏列表上下文

真实路径：

```text
AI 内容生成 -> 历史文章 -> 展开模板组 -> 点击文章
```

当前 `ContentWorkbench.tsx` 直接执行：

```tsx
setArticle(nextArticle);
setTab('generate');
```

三个 tab 使用条件渲染，切走后 `GeneratedArticlesView` 被卸载，其本地 `filter`、`statusFilter`、`publicationFilter`、`collapsed`、`selected` 和滚动位置随之丢失。进入“文章生成”后，用户还要越过客户资料、问题、模板和生成控制区才能操作既有文章；界面没有明确的“返回历史”语义。

在 `1426×893` 窗口中，展开文章组后还观察到横向溢出：部分行控件的可访问点击位置约为 x=1780–1805，超出窗口右边界。现有 `renderer-responsive-layout.test.js` 没有覆盖“展开组 + 长标题 + 行尾动作”的组合。

### 2.5 现有测试为什么全部通过

以下 40 项专项测试全部通过，但没有覆盖真实失败 seam：

```powershell
node --test `
  tests/platform-settings-service.test.js `
  tests/hepan-provider-settings.test.js `
  tests/platform-provider-config-store.test.js `
  tests/content-submission-batch.test.js `
  tests/platform-workbench-service.test.js `
  tests/renderer-article-history.test.js `
  tests/renderer-publication-history.test.js `
  tests/renderer-responsive-layout.test.js
```

缺口：

- 河畔测试只分别测保存/测试能力，没有覆盖“safe status -> 只改一个字段 -> 保存”。
- 投稿批次测试和平台执行器测试彼此隔离，没有把真实批次送入真实执行器再读取同一批次。
- 历史文章测试主要做源码字符串或纯逻辑断言，没有验证组件保持挂载、焦点恢复、未保存保护和展开列表宽度。

---

## 3. 目标设计与领域规则

### 3.1 配置保存改为补丁接口

配置页不应尝试回显或重发受保护的原值。保存/测试输入定义为 patch：

```text
字段未出现       -> 保留当前值
字段出现且非空   -> 替换当前值
可选字段显式清除 -> 通过独立 clear 标志/动作清除
```

具体规则：

- Renderer 只在用户实际输入新值时发送 `pythonPath`、`cookie`、`vendorDir`。
- `categoryId` 是可安全回显字段，修改后正常发送。
- 已配置 Python 显示“已配置（留空保留）”，不把示例路径伪装为已存值。
- `vendorDir` 的空白既不能悄悄清除旧值，也不能永远无法清除；增加明确的“使用系统环境/清除自定义目录”动作或 `clearVendorDir: true`。
- `save` 与 `test` 共用同一套 patch 合并与校验逻辑。
- 环境变量覆盖时继续保持只读，不能把环境值复制进应用配置。
- safe status 只返回是否配置及必要掩码，不返回 Cookie、完整本机路径或其他秘密。

推荐服务接口：

```js
save(platformId, patch)
test(platformId, patch)
mergePatch(adapter, current, patch)
```

不要扩大 `secretFields` 的语义来容纳所有字段；“秘密字段”和“补丁中省略即保留”是两个不同概念，应由通用 patch 合并规则表达。

### 3.2 投稿批次使用稳定身份同步

批次项目和发布账本已经共同持有最可靠的身份：

```text
publicationId + attemptId
```

执行器不得再用可变文件名或文件路径作为主匹配条件。目标状态流：

```text
queued -> submitting -> submitted/published
                    \-> failed
                    \-> uncertain
queued -> cancelled         （仅远端开始前）
```

约束：

- sidecar 中的 `submissionBatchId` 用于定位批次。
- `publicationId + attemptId` 用于定位唯一项目并防止旧 attempt 覆盖新 attempt。
- `targetPlatformId` 仅作为一致性校验，不作为唯一身份。
- worker 每次变更发布账本状态后，通过同一个 `submission-batch-store` 接口同步批次项目。
- store 提供受控的 `updateItem(batchId, identity, transition)`，负责原子写、合法迁移和批次汇总状态；业务服务不再扫描/手写批次 JSON。
- 写入批次失败不能反向伪造远端结果；应记录可诊断错误，并在下一次列表/预检时通过账本对账恢复。

### 3.3 区分“撤销未执行”与“清理失败队列项”

“撤销”不能泛化为删除一切队列文件，否则会破坏发布审计语义：

| 发布账本状态 | 普通撤销 | 队列文件处理 | 发布记录处理 |
| --- | --- | --- | --- |
| `queued` 且 attempt 匹配，远端未开始 | 允许 | 删除未改动的 Markdown + sidecar | 标记 `cancelled` |
| `failed`（远端明确失败） | 不叫“撤销”；允许“移除失败队列项” | 用户确认后删除未改动队列副本 | 保留 `failed` 记录和错误码 |
| `submitting` / `submitted` / `published` | 禁止 | 不删除 | 保持原状态 |
| `uncertain` | 禁止 | 不删除 | 先走既有人工核对流程 |
| sidecar/hash 不一致 | 禁止自动处理 | 保留并显示冲突原因 | 不改账本 |

因此历史页应按对账后的项目状态展示：

- 有真正可撤销项时显示“撤销未开始投稿（N）”。
- 只有明确失败的可清理项时显示“清理失败队列项（N）”。
- 没有任何可操作项时不显示误导按钮，改为简短状态说明。
- 预检结果在按钮附近展示可操作数和不可操作原因，不只在页面顶部抛一行错误。

### 3.4 旧批次采用可重复、非破坏性对账

真实工作区已经存在“批次 queued、账本 failed”的陈旧数据，修复不能只保证新批次。

列表、取消预检和清理预检进入前执行只读计算：

```text
批次项目
  -> 按 publicationId + attemptId 查询账本
  -> 比较批次状态、账本状态、sidecar、文件哈希
  -> 生成 reconciled status + reasonCode
```

确认需要修正时，通过 store 原子保存。对账必须：

- 幂等，多次运行结果一致。
- 不把 `uncertain` 自动降级成 `failed` 或 `cancelled`。
- 不根据“文件不存在”推断远端未发布。
- 不删除文章、队列副本或发布账本。
- 保留原 `createdAt`、attempt 历史、remote ID/URL 和错误码。
- 对无法证明的冲突只标记 `conflict` 并提示人工处理。

可提供一次性的后台自动修复，也可以在首次读取时惰性修复；无论采用哪一种，都必须复用同一个 `reconcileBatch()` 纯领域函数并有临时副本测试。无需要求用户手工编辑 JSON。

### 3.5 历史页采用主从编辑，不再跳到生成页

桌面宽屏：

```text
历史筛选、分组和文章列表 | 文章编辑面板
```

窄屏：在历史页上方打开全屏/近全屏 overlay，提供明确的“返回历史/关闭”。两种形态均保持 `GeneratedArticlesView` 挂载。

新建 `GeneratedArticleEditorPanel`（名称避免与媒体投稿的 `ArticleEditor.tsx` 混淆），从 `ArticleGenerationView` 提取既有文章编辑所需能力：

- 标题、正文、必要元数据。
- 审核状态、版本和保存状态。
- 发布状态摘要与“发布详情”。
- 保存、关闭；仅在适用时显示复制新版本。
- 不显示客户资料、问题、模板选择、批量生成等新文章生成控件。

交互规则：

- 点击文章在同页打开面板，保持筛选、分组展开、勾选和滚动位置。
- 打开后焦点移到编辑器标题；关闭后恢复到原文章行按钮。
- 标题/正文有修改时，关闭、切换文章、切换客户或离开“历史文章”前必须确认未保存更改。
- 保存成功后仅更新当前文章及必要的历史列表数据，不刷新客户/模板。
- 已发布文章不直接原地修改；提供“复制为新版本后编辑”，原文章和账本不变，新版本回到待审核状态。
- 若用户确实要重新生成，提供次要动作“基于此文章创建新版本/前往生成”，且在离开前执行未保存检查。
- `Escape` 仅在无未保存更改时直接关闭；有修改时走确认。

### 3.6 响应式和反馈规则

- 历史页所有 flex/grid 子项补齐 `min-w-0`，长标题使用可控截断或换行。
- 行尾动作在窄宽度下换行到第二行，不允许把点击目标推到视口外。
- 编辑面板应有独立滚动容器，不能让页面顶部错误提示离开操作上下文。
- 撤销/清理结果用按钮附近的 `role=status`，失败用就近 `role=alert` 并将焦点移到错误摘要。
- 所有图标按钮保留可访问名称；overlay 使用 dialog 语义、焦点圈定和焦点恢复。

---

## 4. 分阶段实施任务

### Task 0：先固定红色回归测试

**Create：**

- `tests/hepan-settings-patch-contract.test.js`
- `tests/submission-batch-worker-integration.test.js`
- `tests/renderer-history-editor-flow.test.js`

**Modify：**

- `tests/renderer-responsive-layout.test.js`
- `scripts/verify.js`

实施：

- [ ] 建立已存 Python/Cookie/vendor 的临时配置，只提交 `categoryId`，断言保存成功且其他值原样保留。
- [ ] 覆盖只换 Python、只换 Cookie、保留 vendor、显式清除 vendor、环境变量只读。
- [ ] 通过真实 `content-submission-service` 创建批次，再通过真实 `platform-workbench-service` 和失败 adapter 执行，断言批次与账本都变为 `failed`。
- [ ] 增加成功、uncertain、停止前 cancelled 和旧 attempt 不得覆盖新 attempt 的集成用例。
- [ ] 用陈旧 fixture 固定 `batch=queued / ledger=failed` 对账行为，断言普通撤销不可用、失败清理可用且账本仍为 `failed`。
- [ ] 驱动历史组件：设置筛选、展开组、滚动并打开文章，断言历史视图没有卸载；关闭后状态和焦点恢复。
- [ ] 在 `1128×527`、`1424×861` 至少两个窗口尺寸下展开长标题组，断言所有可见控件边界位于 viewport 内。
- [ ] 先确认新增测试在当前实现上按预期失败，记录失败断言，再进入实现。

### Task 1：实现通用配置 patch 语义

**Modify：**

- `desktop/services/platform-settings-service.js`
- `tests/platform-settings-service.test.js`
- `tests/hepan-provider-settings.test.js`
- `tests/hepan-settings-patch-contract.test.js`

实施：

- [ ] 将 `validateDraft()` 前的合并改为“只合并自有且允许的字段”；省略字段保留 current。
- [ ] 明确拒绝未知字段和非法 clear 操作，防止配置拼写错误被静默保存。
- [ ] 保持 Cookie 空白兼容策略，同时把 Renderer 主路径切换为不发送未修改字段。
- [ ] 为可选字段增加显式清除协议，并在 adapter schema 中声明可清除字段。
- [ ] `save` 和 `test` 使用完全相同的 merge/validate seam。
- [ ] 测试日志和 IPC 错误中不得出现 Cookie 或完整敏感配置。

### Task 2：修复蓝色河畔配置页草稿模型

**Modify：**

- `media-workbench/src/components/settings/HepanProviderSettings.tsx`
- `media-workbench/src/types.ts`
- `media-workbench/src/electron-api.ts`
- `tests/hepan-provider-settings.test.js`
- `tests/renderer-responsive-layout.test.js`

实施：

- [ ] 区分“安全状态”“用户输入的替换值”“用户要求清除”的三种状态。
- [ ] 只将用户改动字段加入 patch；不要用空字符串占位。
- [ ] 已配置 Python/vendor 使用“已配置（留空保留）”和状态标签，未配置时才显示输入示例。
- [ ] vendor 增加明确清除/恢复系统环境入口及二次确认。
- [ ] 保存成功后清空替换输入、重新读取 safe status，并保持栏目 ID。
- [ ] 测试按钮也使用 patch；不要求用户为只测试现有配置重新输入路径或 Cookie。
- [ ] 状态和错误文案分别说明是 Python、Cookie、栏目 ID 还是 vendor 无效，避免统一错误掩盖定位。

### Task 3：让批次 store 成为唯一写入口

**Modify：**

- `src/content/submission-batch-store.js`
- `desktop/services/content-submission-service.js`
- `desktop/services/platform-workbench-service.js`
- `tests/content-submission-batch.test.js`
- `tests/platform-workbench-service.test.js`
- `tests/submission-batch-worker-integration.test.js`

实施：

- [ ] 扩展 store：`updateItem()`、`reconcile()` 或等价的受控接口，继续使用同目录和兼容 JSON 格式。
- [ ] 原子临时文件名包含 pid/随机后缀，避免并发写碰撞；失败后清理临时文件但保留原文件。
- [ ] 批次项目匹配改为 `publicationId + attemptId`，同时验证 batch ID 和平台 ID。
- [ ] 在远端调用前同步 `submitting`，在明确结果后同步 `failed/submitted/published/uncertain`。
- [ ] 移除 `platform-workbench-service.updateSubmissionBatch()` 中自行扫描和手写 JSON 的实现。
- [ ] 从项目状态重新汇总批次状态；不能因为一个失败项就隐藏仍在运行的项。
- [ ] 若同步写失败，保留发布账本的权威结果并输出不含正文/密钥/远端完整响应的诊断码。

### Task 4：旧批次对账与安全清理

**Modify：**

- `desktop/services/content-submission-service.js`
- `src/content/submission-batch-store.js`
- `media-workbench/src/types.ts`
- `media-workbench/src/electron-api.ts`
- 对应 content IPC/preload 类型桥接文件（保持现有通道命名风格）
- `tests/content-submission-batch.test.js`
- `tests/submission-batch-worker-integration.test.js`

实施：

- [ ] 实现 `reconcileBatch(batchId)`，以发布账本为远端结果权威源，以 sidecar/hash 判断本地副本是否可安全处理。
- [ ] `listBatches()`、撤销预检、失败清理预检复用对账结果。
- [ ] 为每个不可处理项返回稳定 `reasonCode` 和安全中文说明。
- [ ] 保留现有 `cancelBatch()` 的远端未开始约束。
- [ ] 新增 `previewCleanupFailedItems()` / `cleanupFailedItems()` 或等价接口，只删除明确失败且未被修改的队列副本。
- [ ] 清理失败项后批次项目标为 `failed-cleaned`（或明确的等价状态），发布账本仍为 `failed`。
- [ ] 对真实旧格式缺字段批次执行兼容读取；无法建立稳定身份时标为 conflict，不猜测、不删除。
- [ ] 增加中断恢复、重复执行、部分成功/部分失败和原子写失败测试。

### Task 5：重做历史页撤销/清理反馈

**Modify：**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/types.ts`
- `media-workbench/src/electron-api.ts`
- `tests/renderer-article-history.test.js`
- `tests/renderer-publication-history.test.js`
- `tests/renderer-history-editor-flow.test.js`

实施：

- [ ] 加载批次时使用对账后的可操作摘要，不再只看 `batch.status === queued`。
- [ ] 将“撤销最近入队”改为带数量、语义准确的撤销与失败清理动作。
- [ ] 用户点击后在动作附近展示预检清单：可处理、不可处理、原因。
- [ ] 取消确认对话后不显示错误；函数仍通过 `finally` 恢复 busy 状态。
- [ ] 成功后同时刷新批次摘要、发布摘要和受影响文章行，不刷新客户/模板。
- [ ] 错误区域可见并接收焦点，避免用户在长列表中看不到反馈。

### Task 6：提取历史文章专用编辑面板

**Create：**

- `media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`
- 可选：`media-workbench/src/content-article-editor-state.ts`（仅在状态逻辑值得独立纯测时创建）

**Modify：**

- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/ArticleGenerationView.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/types.ts`
- `tests/renderer-article-history.test.js`
- `tests/renderer-history-editor-flow.test.js`

实施：

- [ ] 将现有文章标题/正文编辑和保存逻辑提取为可复用的受控面板，不复制两套保存规则。
- [ ] 历史文章点击只更新历史页内部 `editingArticle`，不再 `setTab('generate')`。
- [ ] 桌面使用右侧 drawer/split pane；窄屏使用带 Back/Close 的 dialog overlay。
- [ ] 打开前保存来源行 ref，打开后聚焦 editor heading，关闭后恢复焦点。
- [ ] 实现 dirty state；关闭、换文章、换客户、切 tab 和窗口关闭相关路径均调用同一个 guard。
- [ ] 已发布文章禁用原地保存并引导复制新版本；复制后编辑新 article ID。
- [ ] 保存成功就地替换列表项并清除 dirty，不重置筛选、展开、选择和滚动。
- [ ] 对生成页保留生成职责；如仍需要编辑刚生成文章，也复用同一编辑内核。

### Task 7：修复历史列表响应式布局与可访问性

**Modify：**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`
- `tests/renderer-responsive-layout.test.js`
- `tests/renderer-history-editor-flow.test.js`

实施：

- [ ] 工具区、分组标题、文章行和行尾动作在长中文标题下不产生页面级横向滚动。
- [ ] 窄宽度将发布详情等次要动作换行或放入溢出菜单，点击目标保持至少合理尺寸。
- [ ] 断言可见按钮 bounding box 完全位于 viewport。
- [ ] 覆盖键盘打开、Tab 圈定、Escape/关闭、未保存确认和焦点恢复。
- [ ] 覆盖编辑面板打开时列表仍在 DOM 且筛选/展开状态不变。

### Task 8：文档、验证和发布包验收

**Modify：**

- `docs/content-generation-operations.md`
- `docs/alpha-packaging-checklist.md`
- `scripts/verify.js`

实施：

- [ ] 记录配置字段“留空保留/显式清除”的规则。
- [ ] 记录撤销、失败清理、uncertain 人工核对之间的区别。
- [ ] 记录历史页编辑、未保存保护和已发布文章复制新版本流程。
- [ ] 将三个新测试加入快速验证清单。
- [ ] 构建 Renderer 和打包版后，以测试工作区执行第 7 节矩阵。
- [ ] 验收前备份真实 `F:\1\.autopublish\submission-records`；手工验收不得使用真实站点自动投稿。

---

## 5. 建议提交顺序

上一份计划的改动先独立提交或快照，然后本计划按以下顺序小步提交：

1. `test: reproduce Hepan patch save and submission batch drift`
2. `fix: preserve omitted platform setting fields`
3. `fix: synchronize submission batches by publication attempt`
4. `fix: reconcile stale batches and clean failed queue items safely`
5. `feat: edit generated articles inside history view`
6. `fix: keep expanded history actions inside responsive viewport`
7. `docs: document configuration patch and queue recovery workflows`

每个提交只包含对应任务的实现和测试。不要顺手格式化无关文件，不要把上一计划尚未提交的文件混入本计划提交。

---

## 6. 自动化验证命令

### 6.1 快速红绿回归

```powershell
node --test `
  tests/platform-settings-service.test.js `
  tests/hepan-provider-settings.test.js `
  tests/hepan-settings-patch-contract.test.js `
  tests/content-submission-batch.test.js `
  tests/platform-workbench-service.test.js `
  tests/submission-batch-worker-integration.test.js `
  tests/renderer-article-history.test.js `
  tests/renderer-publication-history.test.js `
  tests/renderer-history-editor-flow.test.js `
  tests/renderer-responsive-layout.test.js
```

### 6.2 Renderer 与全量验证

```powershell
npm run build:renderer
npm test
npm run verify
```

### 6.3 打包验证

当前工作树干净时：

```powershell
npm run pack:alpha
```

仅在明确保留可追溯 dirty build 的开发验收阶段：

```powershell
npm run pack:alpha:dirty
```

最终发布候选必须来自干净、已提交的构建；不得把真实工作区内容、Cookie、配置文件或发布记录打入安装包。

---

## 7. 打包版手工验收矩阵

所有会写入配置/队列的用例使用专门的测试工作区和测试配置。真实 `F:\1` 仅用于升级前备份和升级后只读确认。

| 场景 | 操作 | 期望结果 |
| --- | --- | --- |
| 河畔保留保存 | 已配置 Python/Cookie/vendor，只改栏目 ID 后保存 | 保存成功；测试配置可用；Python/Cookie/vendor 未丢失 |
| 河畔只换 Cookie | 仅输入新 Cookie 并保存/测试 | 不要求重填 Python；旧 Python/vendor 保留；界面不回显 Cookie |
| 河畔只换 Python | 仅输入新 Python 路径 | 不要求重填 Cookie；测试使用新路径 |
| 河畔显式清除 vendor | 点击清除并确认 | 只清除 vendor，Python/Cookie/category 保留 |
| 环境变量覆盖 | 以环境配置启动 | 页面只读且说明来源，不写应用配置 |
| 远端未开始撤销 | 创建批次后在 worker 开始前撤销 | 预检数量正确；删除未改动队列副本；账本变 `cancelled` |
| 明确失败清理 | fake adapter 明确失败后点击清理 | 不再显示普通撤销；只删除失败副本；账本继续为 `failed` |
| 正在/已发布保护 | 状态为 submitting/submitted/published | 不提供普通撤销或清理，不删除任何文件 |
| uncertain 保护 | 模拟未知结果 | 要求人工核对，不允许撤销/清理 |
| 被修改队列副本 | 手工改动测试 Markdown 或 sidecar | 标记 conflict 并显示原因，不删除文件、不改账本 |
| 旧批次升级 | 载入 `batch=queued / ledger=failed` fixture | 自动对账为失败；操作语义正确；重复启动结果一致 |
| 历史同页编辑 | 设置筛选、展开组、滚动后打开文章 | 历史列表保持；打开专用编辑面板；不显示生成源控件 |
| 保存并继续 | 修改并保存，关闭后打开下一篇 | 列表就地更新；筛选、展开、选择和滚动保留 |
| 未保存保护 | 修改后关闭、换篇、换客户或切 tab | 明确确认；选择继续编辑时内容不丢失 |
| 已发布文章 | 打开已发布文章 | 禁止原地覆盖；可复制新版本后编辑，原发布记录不变 |
| 键盘与焦点 | 键盘打开/关闭编辑器 | 焦点进入标题并在关闭后回到来源行；窄屏 dialog 不漏焦点 |
| 响应式 | 在 1128×527、1424×861 展开长标题组 | 无页面级横向滚动；所有可见动作在窗口内可点击 |

---

## 8. 完成标准

- [ ] 三个红色回归测试在旧实现失败、在新实现通过。
- [ ] 已配置蓝色河畔可只改一个字段保存和测试，未修改字段不被清空。
- [ ] 新批次的每个 worker 结果与发布账本、批次记录保持一致。
- [ ] 真实格式的陈旧批次可以幂等对账，不要求手改 JSON，不删除审计记录。
- [ ] “撤销”和“失败清理”具有不同文案、权限和数据后果。
- [ ] 历史文章编辑不再切到“文章生成”，且保留列表上下文。
- [ ] 未保存修改、已发布文章和 uncertain 发布结果均有明确保护。
- [ ] 展开历史组在目标窗口尺寸无水平溢出，鼠标和键盘均可操作。
- [ ] 专项测试、`npm test`、Renderer build、`npm run verify` 全部通过。
- [ ] 新打包版通过手工验收矩阵，包内不含真实配置、Cookie、正文或发布记录。

---

## 9. 非目标与数据保护

- 不在本计划中改造蓝色河畔 Python 发布脚本或真实网站交互协议。
- 不自动重试任何历史失败投稿，不把 `failed` 擅自变成 `queued`。
- 不自动判定 uncertain 是成功或失败，不绕过人工核对。
- 不删除真实历史文章、发布账本、远端文章或已修改的队列文件。
- 不回显/记录完整 Cookie、AI 密钥、完整本机敏感路径、正文或远端完整响应。
- 不把历史编辑重构扩大为整个 AI 内容生成页面的视觉重做。
- 不改变已发布文章的身份、防重规则或版本链；编辑通过复制新版本进行。
- 不把本次改动与上一计划未提交的实现混为一个不可审计的大提交。
