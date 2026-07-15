# Desktop Content Lifecycle and Storage Optimization Implementation Plan

**Goal:** 完成生成任务取消、北京时间统一、历史文章批量入队与安全删除、动态投稿平台发现、三级数据存储、一次性迁移和运行数据空间治理，使桌面端在客户数量和平台数量增长后仍可维护、可迁移、可恢复。

**Architecture:** 安装目录只保存代码和内置只读资源；`%APPDATA%` 保存小型设置、加密 AI 凭据和平台运行配置；`%LOCALAPPDATA%` 保存日志、缓存、临时文件和豆包浏览器 profile；用户选择的内容库保存全部可迁移业务数据。内容库只公开 `clients`、`generated`、`templates`，其余业务记录进入 `.autopublish`。所有批量操作通过主进程 service/store 完成，Renderer 只提交稳定 ID 和明确确认。

**Tech Stack:** Electron 33、CommonJS Node.js、React 19、TypeScript、Vite、Node test runner、Electron safeStorage、Playwright CLI、electron-builder。

---

## 已确认决策

- pending 生成任务可以被永久取消，任务状态为 `cancelled`；当前 running 任务继续执行。
- 取消任务不参与继续或失败重试；没有其他未完成任务时批次仍进入 `completed`，详情单列取消数量。
- 时间在磁盘和 IPC 中继续保存 UTC ISO，桌面端固定按 `Asia/Shanghai` 显示 `YYYY-MM-DD HH:mm:ss`。
- 历史文章批量操作第一版只处理当前客户，支持当前筛选结果、当前模板组和手动勾选。
- 只有已审核文章可入队；任务数等于文章数乘以目标平台数，不自动发布。
- 相同内容幂等跳过，同名不同内容报告冲突且不覆盖；批量操作继续处理其他项目。
- 历史文章删除进入回收站；已审核和已入队文章允许删除但使用更强确认，投稿队列副本与记录不联动删除。
- 每次批量入队可撤销仍为待投稿且未被编辑的本次新增项。
- 平台通过 adapter 能力声明是否支持历史文章入队，不再维护硬编码目标数组。
- 内容库可整体迁移；内置模板只读，自定义模板位于内容库并使用独立 ID。
- 豆包第一版仍为应用级单 profile，但 session 接口预留 `profileId`；验证码继续暂停并等待人工处理。
- 旧数据使用一次性外部迁移脚本处理，桌面端不保留迁移 UI 和双布局长期兼容。

## 基线与约束

- 实施基线：`master`，当前文档编写时 HEAD 为 `3325ae7`。
- `docs/superpowers/specs/2026-07-14-workspace-selection-design.md` 有用户未提交修改，实施期间不得覆盖、还原或顺带格式化。
- 不修改 `F:\携程` 项目。
- 不读取、记录或输出真实 API Key、Cookie、客户正文或完整 Prompt。
- 自动化测试不得调用真实付费 AI、真实投稿接口或真实豆包采集。
- 一次性迁移执行前必须 dry-run，并由用户明确确认。
- 每个任务先建立可失败测试，再做最小实现；完成后运行该任务相关测试。

---

### Task 1: 建立三级路径模型和内容库 v2 布局

**Files:**

- Create: `desktop/storage-paths.js`
- Modify: `desktop/workspace-paths.js`
- Modify: `desktop/runtime-paths.js`
- Modify: `desktop/runtime-config.js`
- Create: `desktop/runtime-config-store.js`
- Modify: `desktop/main.js`
- Modify: `src/core/files.js`
- Modify: path-consuming services under `desktop/services/` and `src/content/`
- Modify: `tests/workspace-paths.test.js`
- Create: `tests/storage-paths.test.js`
- Modify: `tests/desktop-packaging.test.js`

- [ ] **Step 1: 写路径分类失败测试**

固定三类根路径：installation、roamingConfig、localState、contentLibrary。断言安装目录下没有可写运行目录；`clients/generated/templates` 位于内容库；research、批次、队列和投稿记录位于 `<contentLibrary>/.autopublish`；日志、缓存、临时文件和浏览器 profile 位于 localState。

- [ ] **Step 2: 实现显式路径对象和应用配置边界**

`storage-paths` 只负责组合和校验路径，不创建业务服务。`main.js` 从 Electron 获取 `app.getPath("userData")`、`app.getPath("sessionData")` 或显式 LocalAppData 路径，并把完整路径对象注入 runtime 与服务，禁止模块重新从 `cwd` 推导位置。现有 `.env` 中的受支持平台运行配置迁入应用配置层；AI 配置继续使用 safeStorage，环境变量仍是显式高优先级覆盖。

- [ ] **Step 3: 收口内容库初始化**

新内容库只创建 marker、三个可见目录和 `.autopublish` 所需子目录。安装目录保持只读；环境变量只能作为受验证的显式覆盖，不能重新混合三类根路径。

- [ ] **Step 4: 运行测试**

```powershell
node --test tests/storage-paths.test.js tests/workspace-paths.test.js tests/workspace-bootstrap-service.test.js tests/desktop-packaging.test.js
```

**Pass:** 路径分类全部通过；打包扫描确认客户数据、日志、浏览器 profile、密钥和迁移产物均不进入安装包。

---

### Task 2: 提供一次性内容库迁移脚本

**Files:**

- Create: `scripts/migrate-content-library-v2.js`
- Create: `tests/content-library-migration.test.js`
- Create: `docs/content-library-v2-migration.md`

- [ ] **Step 1: 写 dry-run 与安全边界测试**

覆盖旧目录识别、目标非空、同名冲突、缺失文件、符号链接、重复执行、部分迁移恢复和跨盘路径。dry-run 只能输出分类与数量，不写文件。

- [ ] **Step 2: 实现一次性迁移**

保留 `clients/generated/templates`，将 portable business data 迁入 `.autopublish`，将本机日志/缓存/profile 迁入 localState，并将旧 `.env` 中允许迁移的平台运行配置写入应用配置层；API Key 等敏感值不得写入迁移日志。写入迁移清单、内容哈希和完成标记；先复制校验再切换，不删除原目录。

- [ ] **Step 3: 编写人工运行说明**

文档给出备份、dry-run、确认执行、校验和回退步骤。脚本保留在仓库但通过 packaging 测试确认不进入正式软件。

- [ ] **Step 4: 运行测试**

```powershell
node --test tests/content-library-migration.test.js tests/desktop-packaging.test.js
```

**Pass:** 重复运行幂等；失败不破坏旧布局；只有明确执行模式才写入；原数据不自动删除。

---

### Task 3: 实现内置模板与自定义模板双层目录

**Files:**

- Create: `resources/content-templates/`
- Modify: `src/content/template-store.js`
- Modify: `desktop/services/ai-content-service.js`
- Modify: `desktop/services/content-generation-batch-service.js`
- Modify: `media-workbench/src/types.ts`
- Modify: template selectors in content components
- Modify: `tests/template-store.test.js`
- Modify: `tests/renderer-batch-generation.test.js`
- Modify: `tests/desktop-packaging.test.js`

- [ ] **Step 1: 写双来源和冲突测试**

内置模板来源为 `builtin`、自定义模板来源为 `custom`。同一平台下 ID 必须全局唯一；自定义模板不能静默覆盖内置模板。复制内置模板时产生新的自定义 ID。

- [ ] **Step 2: 实现模板 catalog**

内置模板从打包资源只读加载，自定义模板从内容库 `templates` 加载。UI 合并展示并标注来源；内置模板只提供“复制为自定义模板”，不提供原地保存和删除。

- [ ] **Step 3: 保持历史快照稳定**

文章继续保存生成时模板版本快照；软件升级修改内置模板后，历史分组与文章来源解释不得改变。

- [ ] **Step 4: 运行测试**

```powershell
node --test tests/template-store.test.js tests/renderer-batch-generation.test.js tests/renderer-article-history.test.js tests/desktop-packaging.test.js
```

**Pass:** 开发和打包环境均发现内置模板；自定义模板可迁移；ID 冲突明确失败；历史文章仍按快照展示。

---

### Task 4: 统一北京时间显示

**Files:**

- Create: `media-workbench/src/time-format.ts`
- Create: `tests/renderer-time-format.test.js`
- Modify: `media-workbench/src/components/AiProviderSettings.tsx`
- Modify: `media-workbench/src/components/PreflightModal.tsx`
- Modify: `media-workbench/src/components/content/QuestionCollectionView.tsx`
- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Modify: other components that display persisted timestamps

- [ ] **Step 1: 写固定时区测试**

在不同 `TZ` 环境中输入同一 UTC ISO，均得到相同北京时间。覆盖夏令时无关性、无效日期、缺失值和旧版无时区字符串；旧版由 `toISOString().replace(...)` 生成的字符串按 UTC 解释。

- [ ] **Step 2: 实现唯一格式化入口**

使用 `Intl.DateTimeFormat` 和 `timeZone: "Asia/Shanghai"`；禁止组件直接截断 `toISOString()` 或原样显示持久化时间。新写入继续使用完整 UTC ISO。

- [ ] **Step 3: 运行测试与扫描**

```powershell
node --test tests/renderer-time-format.test.js tests/renderer-ai-provider-settings.test.js tests/renderer-article-history.test.js tests/doubao-content-workbench.test.js
rg -n "toISOString\(\)\.replace|substring\(0, 19\)" media-workbench/src
```

**Pass:** 所有可见时间固定为北京时间；排序仍按原始 UTC 时间；扫描不再发现组件自行伪造本地时间。

---

### Task 5: 增加取消 pending 生成任务

**Files:**

- Modify: `src/content/generation-batch-store.js`
- Modify: `src/content/generation-batch-runner.js`
- Modify: `desktop/services/content-generation-batch-service.js`
- Modify: `desktop/ipc/content-generation-batch-ipc.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- Modify: batch tests under `tests/`

- [ ] **Step 1: 写状态迁移与旧批次兼容测试**

任务状态增加 `cancelled`，计数增加 `cancelled`。旧版本批次没有该字段时按 0 读取。取消只修改 pending；running、succeeded、failed、interrupted 不变。

- [ ] **Step 2: 写运行中取消竞态测试**

串行 runner 执行第一项时调用 `cancelPending`，断言当前项继续完成、后续 pending 原子变为 cancelled、AI 不再收到后续任务。为未来 concurrency 2-4 验证已认领任务不被取消。

- [ ] **Step 3: 实现 service/IPC/UI**

新增预览和确认后的取消命令，确认框显示数量。`continue` 与 `retryFailed` 排除 cancelled；没有其他未完成或失败任务时批次为 completed，详情显示成功/失败/待处理/中断/取消。

- [ ] **Step 4: 运行测试**

```powershell
node --test tests/generation-batch-store.test.js tests/generation-batch-runner.test.js tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/renderer-batch-generation.test.js
```

**Pass:** 取消不重复计费、不影响当前请求、不再被恢复；重启后取消状态保持；按钮只在 pending 数量大于 0 时可用。

---

### Task 6: 实现历史文章回收站和引用保留

**Files:**

- Modify: `src/content/article-store.js`
- Create: `src/content/article-trash-service.js`
- Modify: `desktop/services/ai-content-service.js`
- Modify: `desktop/ipc/ai-content-ipc.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Modify: `tests/article-store.test.js`
- Create: `tests/article-trash-service.test.js`
- Modify: `tests/renderer-article-history.test.js`

- [ ] **Step 1: 写成对文件事务测试**

文章 JSON 与 Markdown 必须同时进入回收站、同时恢复或同时永久删除。覆盖中途失败、重名恢复、损坏文件、符号链接和重复命令。

- [ ] **Step 2: 实现回收站与 tombstone**

回收站归属于内容库，保存删除时间、原客户、文章 ID、审核状态和最小引用信息。永久删除正文后仍保留不会泄露内容的 tombstone，使生成批次和投稿记录能显示“原文章已删除”。

- [ ] **Step 3: 实现当前客户批量删除 UI**

支持手选、模板组和当前筛选结果。已审核、已入队或已投稿文章显示更强确认；删除永不修改投稿队列副本与投稿记录。增加回收站视图、恢复和永久删除。

- [ ] **Step 4: 运行测试**

```powershell
node --test tests/article-store.test.js tests/article-trash-service.test.js tests/ai-content-service.test.js tests/ai-content-ipc.test.js tests/renderer-article-history.test.js
```

**Pass:** 删除可恢复；永久删除需要二次确认；队列和记录保持不变；任何事务失败都不会留下半篇文章。

---

### Task 7: 动态发现投稿平台并批量入队

**Files:**

- Modify: platform adapters under `src/platforms/*/adapter.js`
- Modify: `src/core/platforms.js`
- Modify: `src/content/submission-export-service.js`
- Modify: `desktop/services/content-submission-service.js`
- Modify: `desktop/ipc/content-submission-ipc.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Modify: `tests/content-submission-export.test.js`
- Modify: `tests/content-submission-ipc.test.js`
- Create: `tests/content-submission-batch.test.js`
- Modify: `tests/renderer-article-history.test.js`

- [ ] **Step 1: 写平台能力测试**

adapter 明确声明是否支持 `contentQueueImport`，平台注册表返回稳定 ID、显示名和能力。未启用或不支持的平台不能作为目标；移除硬编码 `TARGETS`。

- [ ] **Step 2: 写批量预览测试**

输入当前客户文章 ID 和多个平台 ID，service 重新读取文章并只接受 saved。预览返回总任务、可入队、未审核排除、幂等跳过、内容冲突和无效平台，不信任 Renderer 提交的状态或路径。

- [ ] **Step 3: 实现原子队列副本和批次记录**

任务数为文章数乘以平台数。逐项原子写入 Markdown 与 sidecar；相同哈希幂等跳过，同名不同哈希不覆盖。每次操作保存入队批次 ID 和逐项结果，不自动投稿。

- [ ] **Step 4: 实现历史页批量操作与队列状态**

当前客户范围支持手选、模板组、当前筛选结果和多平台选择。每篇文章展示各平台的待投稿、已发布、冲突等状态，并支持按未入队/已入队/冲突筛选。官媒资源位继续在官媒投稿页面配置。

- [ ] **Step 5: 运行测试**

```powershell
node --test tests/content-submission-export.test.js tests/content-submission-ipc.test.js tests/content-submission-batch.test.js tests/renderer-article-history.test.js tests/platform-workbench-service.test.js
```

**Pass:** 新增平台只需声明能力即可出现在历史页；批量结果可追踪；冲突不覆盖；未审核文章不入队；操作不会触发真实投稿。

---

### Task 8: 实现批量入队撤销

**Files:**

- Modify: batch submission service/store from Task 7
- Modify: `desktop/ipc/content-submission-ipc.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Modify: `tests/content-submission-batch.test.js`
- Modify: `tests/renderer-article-history.test.js`

- [ ] **Step 1: 写撤销资格测试**

只有本批次新建、仍为 queued、内容哈希未变化且未被编辑的项目可撤销。幂等跳过项、既有队列项、已投稿、投稿中、失败记录和内容变化项不可撤销。

- [ ] **Step 2: 实现撤销预览和执行**

先返回可撤销、不可撤销和跳过数量，再要求批次 ID 与明确确认。删除队列 Markdown 和 sidecar 必须成对、受路径边界保护且可重复调用。

- [ ] **Step 3: 运行测试**

```powershell
node --test tests/content-submission-batch.test.js tests/content-submission-ipc.test.js tests/renderer-article-history.test.js
```

**Pass:** 撤销只影响本批次安全项目；已投稿或修改项目零破坏；重复撤销返回幂等结果。

---

### Task 9: 本机运行数据空间治理与豆包 profile 扩展边界

**Files:**

- Create: `desktop/services/storage-maintenance-service.js`
- Create: `desktop/ipc/storage-maintenance-ipc.js`
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/components/SettingsView.tsx`
- Modify: `src/core/playwright.js`
- Modify: `src/content/doubao-browser-adapter.js`
- Modify: `desktop/services/doubao-collection-service.js`
- Create: `tests/storage-maintenance-service.test.js`
- Modify: `tests/runtime-diagnostics.test.js`
- Create: `tests/renderer-settings.test.js`

- [ ] **Step 1: 写占用统计和清理安全测试**

统计日志、临时文件、DOCX 缓存和浏览器 profile，但只允许清理白名单目录。覆盖路径逃逸、符号链接、活动任务阻止、部分失败和重复清理。

- [ ] **Step 2: 实现保留策略**

日志保留 30 天且总量不超过 200MB；临时文件保留 7 天；DOCX 缓存超过 500MB 时按最久未使用清理。浏览器 profile、API 配置、内容库和迁移备份永不自动删除。

- [ ] **Step 3: 增加设置页占用与清理入口**

显示分类占用，提供“清理缓存”命令；运行采集、生成或投稿时禁用。不得提供一个会同时清空登录态和客户内容的模糊“全部清理”。

- [ ] **Step 4: 预留单 profile ID**

豆包 session 使用显式 `profileId: "default"`，路径解析和服务接口不再把 profile 名写死在内部。当前 UI 不增加账号管理；验证码仍暂停等待人工处理。

- [ ] **Step 5: 运行测试**

```powershell
node --test tests/storage-maintenance-service.test.js tests/runtime-diagnostics.test.js tests/renderer-settings.test.js tests/doubao-browser-adapter.test.js tests/doubao-collection-service.test.js
```

**Pass:** 自动清理不会删除登录态或业务数据；空间统计不跟随符号链接；默认豆包 profile 行为与当前版本一致。

---

## 全套验证

```powershell
npm test
npm run build:renderer
npm run verify
npm run pack:alpha
```

同时执行：

```powershell
git diff --check
git status --short
```

## 最终验收标准

- 生成批次可取消全部 pending 项，running 项不受影响，取消项重启后不会恢复。
- 桌面端所有业务时间固定显示北京时间，排序和持久化仍使用 UTC。
- 当前客户的已审核历史文章可批量加入多个动态发现的平台队列，支持状态展示和安全撤销。
- 历史文章可批量进入回收站、恢复和永久删除，队列副本与投稿记录不被连带破坏。
- 安装目录无运行数据；Roaming、Local 和内容库边界符合 ADR 0003。
- 内容库复制到另一台机器后，可恢复客户、文章、模板、回答、批次和投稿记录。
- 内置模板可随软件升级，自定义模板可编辑迁移，二者不会通过同 ID 静默覆盖。
- 一次性迁移脚本 dry-run、执行、校验和回退均有测试与文档，且不进入安装包。
- 日志、临时文件和 DOCX 缓存受容量策略约束，豆包登录态不会被自动清理。
- 全套测试、lint、renderer build、verify 和 alpha 打包全部通过。
