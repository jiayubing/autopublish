# AI 内容生成缺陷修复与操作优化计划

**日期：** 2026-07-18  
**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`  
**源代码：** `F:\官媒投稿\auto—publish`  
**基线：** `5938597 feat: complete template and publication ledger remediation`  
**版本：** `1.0.1`  
**目标：** 修复刷新成功提示常驻、批量预览无法使用 v2/正文-only 模板、模板来源展示不符合操作习惯的问题，并降低批量生成误选和不必要 AI 调用的风险。

本计划只涉及 AI 内容生成、模板 catalog、批量生成预检和对应测试/文档。不修改现有客户资料、研究结果、历史文章、AI 密钥或发布记录；自动化测试只使用脱敏临时工作区，不发起真实 AI 请求。

---

## 1. 结论摘要

| 项目 | 结论 | 优先级 |
| --- | --- | --- |
| “客户与模板已刷新”一直显示 | 已在发布版复现。首次自动加载也会把状态设为 `success`，且没有定时复位、关闭或卸载清理。 | P0 |
| “检查并确认”提示 `Writing template was not found` | 已在发布版及最小服务脚本复现。Renderer 使用 template catalog v2，批量预检仍使用旧模板读取器；两者接受的文件格式不同。 | P0 |
| 有自定义模板时隐藏内置模板 | 当前单篇、批量都直接展示 catalog 合并后的全部来源，没有“自定义优先”的可见性规则。 | P0 |
| 批量生成默认选择 | 当前首次进入自动全选全部客户和全部模板，真实界面直接形成较大的潜在 AI 调用数，存在误操作和费用风险。 | P1 |
| 刷新职责 | 保存文章、批量生成和部分历史操作共用“刷新客户与模板”，导致无关数据重载和误导性成功提示。 | P1 |
| 模板平台与名称 | 自定义目录名和内置平台 ID 可形成两个视觉上相同的平台；批量模板卡还会重复显示名称/场景。 | P1 |
| 模板管理文案 | 界面标记“可编辑/可复制”，但 Renderer 没有对应操作入口，实际能力与文案不一致。 | P2 |

---

## 2. 已完成的复现与证据

### 2.1 发布包与源码一致

- 当前分支工作区在诊断前为 clean。
- 发布包 Renderer 主 bundle 与本地 `media-workbench/dist` 对应 bundle 的 SHA-256 一致。
- 因此本计划以当前源码定位发布版问题，不存在“只看到了另一套源码”的偏差。

### 2.2 刷新提示常驻

发布版重启后进入 AI 内容生成，等待 5 秒再次读取真实 Electron 界面树，仍包含：

```text
客户与模板已刷新。
```

源码证据位于 `media-workbench/src/components/ContentWorkbench.tsx`：

- `refreshClients(true)` 用于首次自动加载；
- 无论首次加载还是手动刷新，成功后都执行 `setRefreshState('success')`；
- 成功提示由 `refreshState === 'success'` 控制；
- 没有 timer、关闭动作或后续 `idle` 复位。

这说明问题不是 CSS 残留，而是完整的状态生命周期缺失。首次进入页面就显示“已刷新”也属于同一缺陷。

### 2.3 批量预检模板错误

发布版真实路径：

```text
AI 内容生成 -> 文章生成 -> 批量生成
-> 选择客户 -> 选择模板 -> 检查生成来源 -> 检查并确认
```

点击后页面返回：

```text
Writing template was not found
```

没有启动批量任务，也没有产生真实 AI 调用。

最小临时工作区只放置一个正文-only 模板时，以下现象连续两次稳定出现：

```text
catalog 可发现并返回模板
-> content-generation-batch-service.preview()
-> GENERATION_TEMPLATE_NOT_FOUND / Writing template was not found
```

把同一模板改成旧格式完整 front matter 后，同一路径立即预检成功。这排除了客户资料、研究数据、AI 配置和随机竞态。

### 2.4 根因：同一文件系统上存在两个不兼容的模板接口

当前调用关系：

```text
Renderer 单篇/批量选择器
  -> listTemplateCatalog()
  -> template-catalog.js（v2：正文-only、可选元数据）

单篇真正生成
  -> article-generator.js
  -> getCatalogTemplate()（v2）

批量“检查并确认”
  -> content-generation-batch-service.validateTemplates()
  -> getTemplate(platform, id)
  -> template-store.js 旧解析器（强制 platform/scenario/name）
```

这违反了项目现有文档定义的 catalog interface：调用方不应知道模板来自哪种格式，也不应分别学习旧版和 v2 解析规则。

当前真实工作区能被 v2 catalog 发现 8 个模板，但逐个走旧读取接口时 7 个失败，仅 1 个通过。旧读取器还会先扫描同平台全部模板，因此一个 v2 自定义模板可以让同平台的内置模板也无法读取。批量服务随后把所有底层格式错误统一包装成 `GENERATION_TEMPLATE_NOT_FOUND`，所以用户只能看到误导性的“模板不存在”。

### 2.5 现有测试为何没有拦截

以下 54 项模板、Renderer 和批量专项测试全部通过：

```powershell
node --test tests/template-catalog.test.js tests/template-store.test.js `
  tests/renderer-template-discovery-empty-client.test.js `
  tests/renderer-content-generation.test.js `
  tests/renderer-batch-generation.test.js `
  tests/content-generation-batch-service.test.js
```

覆盖缺口是：

- v2 catalog 测试只验证“能发现”；
- 旧 template store 测试只验证旧格式；
- 批量服务测试注入的是只支持旧格式的假 template store；
- Renderer 测试大量读取 TSX 源码并做正则断言，没有驱动真实 IPC/服务调用；
- 没有一项测试从“catalog 返回的选择”跨过批量预检 seam。

修复必须增加跨 seam 的契约测试，不能只在两组旧测试上继续加断言。

---

## 3. 目标设计

### 3.1 模板 catalog 成为唯一深模块

模板模块只向业务调用方保留以下 interface：

```text
listCatalog() -> { revision, platforms, templates, diagnostics }
getTemplate({ platformId, templateId }) -> normalizedTemplate
```

模块 implementation 内部负责：

- 正文-only、v2 可选 front matter 和旧 front matter 兼容；
- 自定义与内置来源合并；
- ID 冲突、坏文件隔离和安全 diagnostics；
- body hash、revision 和历史快照所需规范化字段；
- builtin root 的启用/禁用语义。

单篇、批量预检、批量执行、复制模板和测试都通过同一 seam。业务调用方不得再调用另一套 `getTemplate(platform, id)` 解析规则。

### 3.2 自定义模板优先的显示规则

默认规则：

```text
存在至少一个有效自定义模板
  -> 单篇与批量默认只显示全部有效自定义模板
不存在有效自定义模板
  -> 显示内置模板作为开箱即用的回退
```

为避免内置模板完全不可发现，在模板选择区提供次要开关：

```text
显示内置模板
```

开关默认关闭，仅在存在自定义模板时出现；打开后合并展示并保留“自定义/内置只读”标记。单篇和批量必须复用同一个纯函数计算可见模板集合，不能分别实现。

此规则只影响新生成时的选择器，不删除内置模板、不改历史文章快照，也不改变旧文章读取。

### 3.3 刷新状态采用短生命周期反馈

- 首次自动加载只显示 loading，不显示“已刷新”。
- 手动点击成功后显示 2–3 秒可访问状态提示，然后回到 `idle`。
- 新一次刷新开始时取消旧 timer。
- 页面卸载时清理 timer，避免卸载后 setState。
- 失败提示保持可见，直到用户重试、关闭或下一次操作成功。
- 状态区域使用 `role=status` / `aria-live=polite`；错误使用 `role=alert`。

### 3.4 批量生成使用保守默认值

首次进入向导：

- 客户默认只选择顶部当前客户；没有当前客户时不默认选择。
- 模板默认不选择；若产品必须保留快捷默认，只能默认一个最近使用的有效自定义模板，并明确显示来源。
- “全选客户”和“全选模板”保留为显式动作。
- 第 1 步直接显示客户是否具备“有效资料 + 有效研究回答”，不可生成客户不默认选择。
- 第 2 步持续显示 `客户数 × 模板数 = 潜在 AI 调用数`，不是到最后一步才显示。
- 任务数大于可配置阈值（建议 10）时显示费用风险提示；启动仍需最后确认。

### 3.5 分离刷新职责

把当前宽泛的 `onRefresh` 拆成意图明确的动作：

```text
refreshWorkspaceSources()  # 客户、模板、当前客户资料/研究
refreshArticles()          # 历史文章与当前文章状态
refreshBatchState()        # 批次状态
```

保存文章、审核文章或完成批次不应重新扫描客户与模板，也不应显示“客户与模板已刷新”。这样可以减少 IPC、DOCX 资料重读和无关 UI 抖动。

---

## 4. 分阶段实施任务

### Task 0：先建立三个红色回归测试

**Create / modify：**

- Create: `tests/template-generation-contract.test.js`
- Create: `tests/renderer-content-refresh-lifecycle.test.js`
- Modify: `tests/content-generation-batch-service.test.js`
- Modify: `tests/renderer-batch-generation.test.js`
- Modify: `scripts/verify.js`

实施：

- [ ] 临时工作区放正文-only 自定义模板，调用真实 `createTemplateStore` 和真实批量服务 `preview()`。
- [ ] 断言 catalog 返回的 `{platformId, templateId}` 必须能直接通过批量预检。
- [ ] 同一测试覆盖 v2 可选元数据模板、旧 front matter 内置模板和一个坏模板隔离。
- [ ] 真实 Renderer/Electron 测试断言首次加载不显示成功提示。
- [ ] 模拟手动刷新，断言成功提示出现并在规定时间后消失。
- [ ] catalog 同时包含 custom/builtin 时，断言单篇和批量默认可见 ID 集合完全一致且只含 custom。
- [ ] 当前代码必须在修复前因三个用户症状变红。

### Task 1：统一批量预检与生成的模板读取 seam

**Modify：**

- `desktop/services/content-generation-batch-service.js`
- `src/content/template-store.js`
- `src/content/template-catalog.js`
- `src/content/article-generator.js`（仅在统一依赖契约需要时）
- `tests/template-store.test.js`
- `tests/template-catalog.test.js`
- `tests/template-generation-contract.test.js`

实施：

- [ ] `validateTemplates()` 改用 catalog 的规范化 `getTemplate({platformId, templateId})`。
- [ ] 批量任务开始前的二次校验也通过同一 interface，防止预检和执行再次分裂。
- [ ] 删除或内部化旧格式专用的业务读取入口；保留兼容实现时也只能作为 catalog implementation 的内部细节。
- [ ] 修正 `builtinRoot: false -> null -> 又回退默认内置目录` 的哨兵丢失问题。
- [ ] 模板确实不存在返回 `GENERATION_TEMPLATE_NOT_FOUND`；格式无效返回稳定的模板诊断码，不再伪装成不存在。
- [ ] 错误 DTO 可安全携带 `platformId/templateId`，不得携带绝对路径或模板正文。

**Gate：** 正文-only 模板从 catalog 出现后，单篇生成、批量预检和批量 mock 生成全部通过；一个坏模板不阻断其他有效模板。

### Task 2：修复刷新提示生命周期并拆分刷新动作

**Modify / optionally create：**

- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/ArticleGenerationView.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/BatchGenerationView.tsx`
- Optionally create: `media-workbench/src/hooks/useTransientStatus.ts`
- `tests/renderer-content-refresh-lifecycle.test.js`

实施：

- [ ] `initial` 加载成功后状态回到 `idle`，不渲染成功横幅。
- [ ] 手动刷新成功提示 2–3 秒后自动消失。
- [ ] timer 在重刷和卸载时清理。
- [ ] 成功与失败状态可被屏幕阅读器感知。
- [ ] 保存/审核/批次状态更新不再调用客户与模板全量刷新。
- [ ] 并发刷新使用 request id 或 abort 机制，旧请求不得覆盖新请求。

### Task 3：实现“自定义模板优先，内置模板默认隐藏”

**Modify：**

- `media-workbench/src/content-generation-ui-logic.js`
- `media-workbench/src/components/content/ArticleGenerationView.tsx`
- `media-workbench/src/components/content/BatchGenerationView.tsx`
- `media-workbench/src/types.ts`
- `tests/renderer-content-generation.test.js`
- `tests/renderer-batch-generation.test.js`

实施：

- [ ] 新增纯函数 `visibleGenerationTemplates(catalog, showBuiltin)` 或等价 interface。
- [ ] 有 custom 时默认过滤 builtin；没有 custom 时自动回退 builtin。
- [ ] 单篇、批量复用同一结果和同一 catalog revision。
- [ ] 增加“显示内置模板”次要开关，并显示恢复后的来源标签。
- [ ] 过滤后若当前选择不可见，清空并提示，不静默替换为第一项。
- [ ] 历史文章的已删除/内置模板快照仍可只读展示。

### Task 4：降低批量误选与费用风险

**Modify：**

- `media-workbench/src/content-generation-ui-logic.js`
- `media-workbench/src/components/content/BatchGenerationView.tsx`
- `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- `tests/renderer-batch-generation.test.js`
- Add a real Renderer/Electron batch wizard test

实施：

- [ ] 删除 `preserveSelection(..., touched=false)` 自动返回全部可用项的隐式全选语义。
- [ ] 默认只选当前可执行客户，模板默认空。
- [ ] 第 1 步展示客户就绪/缺资料/缺研究状态，减少进入第 3 步才发现问题。
- [ ] 第 2 步增加全选模板、取消全选，并实时显示潜在任务数。
- [ ] 大任务数显示费用风险；未显式选择模板不能继续。
- [ ] 顶部“当前客户”在批量模式隐藏或明确标注“仅用于单篇/问题/历史”，避免与批量客户选择混淆。
- [ ] 预检失败时把错误滚动/聚焦到可见区域，并显示中文说明及具体模板标识。

### Task 5：整理模板平台、名称与管理能力

**Modify / optionally create：**

- `src/content/template-catalog.js`
- `media-workbench/src/components/content/ArticleGenerationView.tsx`
- `media-workbench/src/components/content/BatchGenerationView.tsx`
- Optionally create: `media-workbench/src/components/content/TemplateManager.tsx`
- `desktop/ipc/ai-content-ipc.js`
- `desktop/preload.js`
- `media-workbench/src/electron-api.ts`
- template UI tests

实施：

- [ ] 平台标题使用 catalog `displayName`，不要直接大写技术 ID。
- [ ] `template.name === template.scenario` 时只显示一次，避免卡片两行重复。
- [ ] 不把任意中文目录名静默映射为现有平台 ID；通过 `platform.json` 提供中文显示名，技术 ID 保持稳定。
- [ ] 对疑似重复平台（例如显示名相同但 ID 不同）提供安全诊断，不自动迁移用户目录。
- [ ] 如果本轮不实现模板编辑/复制入口，把“可编辑/可复制”改成准确的来源说明。
- [ ] 如果实现入口，则补齐安全 IPC、输入校验、原子保存和刷新；Renderer 不直接访问文件系统。

### Task 6：文档、构建与发布版验收

**Modify：**

- `docs/template-catalog-v2.md`
- `docs/content-generation-operations.md`
- `docs/alpha-packaging-checklist.md`
- `scripts/verify-alpha-package.js`（仅在新增运行时文件时）

实施：

- [ ] 文档明确自定义优先和“显示内置模板”规则。
- [ ] 文档说明模板平台 ID 与显示名的区别，推荐 `templates/xiaohongshu/platform.json` 显示为“小红书”。
- [ ] 文档说明刷新提示、批量默认选择和任务数确认规则。
- [ ] 新包从 clean commit 构建，记录 commit SHA。
- [ ] 在解包发布版重复三个原始复现路径。

---

## 5. 建议提交顺序

1. `test(generation): reproduce catalog-to-batch template mismatch`
2. `fix(generation): resolve batch templates through catalog interface`
3. `test(renderer): reproduce persistent refresh success state`
4. `fix(renderer): make refresh feedback transient and scoped`
5. `feat(templates): prefer custom templates in generation selectors`
6. `fix(batch): require explicit low-risk batch selections`
7. `refactor(templates): align platform labels and template affordances`
8. `docs: document custom-first templates and batch preflight`
9. `chore(release): build and verify alpha package`

每个提交都应保持专项测试可独立运行；不要把模板存储重构、批量默认值和发布包构建塞进一个提交。

---

## 6. 自动化验证

### 6.1 模板与批量专项

```powershell
node --test `
  tests/template-catalog.test.js `
  tests/template-store.test.js `
  tests/template-generation-contract.test.js `
  tests/article-generator.test.js `
  tests/content-generation-batch-service.test.js `
  tests/renderer-content-generation.test.js `
  tests/renderer-batch-generation.test.js `
  tests/renderer-template-discovery-empty-client.test.js `
  tests/renderer-content-refresh-lifecycle.test.js
```

### 6.2 全量验证

```powershell
npm run verify
```

### 6.3 发布包验证

```powershell
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-docx-runtime.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke
```

自动化环境不得使用真实客户内容、真实 AI 密钥或网络调用。

---

## 7. 发布版人工验收矩阵

### 7.1 刷新反馈

- [ ] 首次进入 AI 内容生成不显示“客户与模板已刷新”。
- [ ] 手动刷新时按钮显示刷新中并防重复点击。
- [ ] 成功提示出现后 2–3 秒自动消失。
- [ ] 刷新失败提示保持可见且可重试。
- [ ] 保存文章、审核文章和批次完成不出现无关的模板刷新提示。

### 7.2 模板使用

- [ ] 正文-only 自定义模板可用于单篇生成。
- [ ] 同一模板可通过批量“检查并确认”。
- [ ] mock/隔离凭据环境下可完成批量生成，不在预检和执行间再次变成“找不到”。
- [ ] 一个坏模板只显示诊断，其他模板继续可用。
- [ ] 模板删除或 revision 变化后选择被清空并明确提示。

### 7.3 自定义与内置显示

- [ ] 有有效自定义模板时，单篇和批量默认不显示内置模板。
- [ ] 打开“显示内置模板”后可看到内置模板和来源标记。
- [ ] 没有自定义模板时自动回退内置模板。
- [ ] 历史文章仍可显示生成时的内置模板快照。

### 7.4 批量安全与简化

- [ ] 首次进入不再全选全部客户和全部模板。
- [ ] 当前可执行客户可作为唯一默认客户；不可执行客户不默认选择。
- [ ] 未显式选择模板不能进入来源检查。
- [ ] 第 2 步持续显示潜在 AI 调用数。
- [ ] 大任务数出现费用风险提示。
- [ ] 被排除客户及原因在预检前后都易于发现。
- [ ] 错误使用中文说明并指出具体模板，不只显示英文通用错误。

---

## 8. 完成标准

- [ ] 三个原始用户问题均有修复前红、修复后绿的自动化反馈环。
- [ ] template catalog 是单篇、批量预检和批量执行唯一模板读取 seam。
- [ ] 当前工作区的有效自定义模板均可通过批量预检。
- [ ] 刷新成功提示不会在首次加载或操作完成后常驻。
- [ ] 自定义模板存在时默认隐藏内置模板，且保留显式查看入口。
- [ ] 批量向导不再隐式产生大规模任务选择。
- [ ] 现有历史文章、模板快照、客户资料和研究结果不被迁移或重写。
- [ ] 专项测试、`npm run verify`、Renderer 构建和发布包验证全部通过。

---

## 9. 明确不做

- 不通过修改当前用户模板文件来掩盖解析器分裂。
- 不要求用户把正文-only 模板退回旧版完整 front matter。
- 不删除内置模板文件，只改变生成选择器的默认可见性。
- 不静默合并任意中文平台目录和英文平台 ID。
- 不在诊断、测试或文档中复制客户正文、AI 密钥、Cookie 或真实生成内容。
- 不在预检测试中调用真实 AI，不自动启动批量生成。
