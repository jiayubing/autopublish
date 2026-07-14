# AI 内容采集、批量生成与审核优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 AutoPublish 的豆包批量采集、第一层客户资料、跨客户跨模板批量生成、文章审核历史和应用级 AI 配置，使大量客户的定期 GEO 内容生产稳定可追溯。

**Architecture:** 保留现有 workspace、research、template 和 article 边界，新增独立客户资料服务、应用级 AI 配置服务、持久生成批次 store/runner 和审核服务。React 只通过 preload/IPC 使用稳定 ID；采集与生成队列都由主进程持有，页面卸载不影响任务，批量生成第一版串行但执行器接口不依赖串行顺序。

**Tech Stack:** Electron 33、CommonJS Node.js、React 19、TypeScript、Vite、Node test runner、Playwright CLI、MarkItDown、Electron safeStorage、electron-builder。

---

## 基线与约束

- 规格：`docs/superpowers/specs/2026-07-15-content-operations-optimization-design.md`。
- 词汇表：仓库根目录 `CONTEXT.md`。
- ADR：`docs/adr/0001-model-batch-generation-as-client-template-tasks.md`、`docs/adr/0002-store-ai-provider-configuration-at-application-scope.md`。
- 当前基线：`master`，规格提交 `45c0b4d`。
- 现有 `docs/superpowers/specs/2026-07-14-workspace-selection-design.md` 有用户未提交修改，执行任务不得暂存、覆盖或还原它。
- 客户资料、research、生成文章、AI 密钥、浏览器 profile 和转换缓存不得进入 Git 或安装包。
- 每项业务代码都按红-绿-重构执行；每个任务最后运行 `npm test` 并单独提交。
- 本计划不实现隐藏/headless 豆包采集，只固定 `visible | background` adapter 契约并验收 visible。

## 文件结构

新增文件：

- `src/content/client-material-store.js`：第一层资料发现、文本读取、DOCX 转换状态与缓存。
- `src/content/generation-batch-store.js`：生成批次与任务原子持久化、恢复和幂等状态。
- `src/content/generation-batch-runner.js`：独立任务执行、重试、停止与并发 worker 契约。
- `src/content/article-review-service.js`：单篇/批量审核规则。
- `desktop/ai-provider-config-store.js`：userData 下 safeStorage 加密 AI 配置。
- `desktop/services/ai-provider-service.js`：配置来源、保存、测试、清除和 AI client factory。
- `desktop/ipc/ai-provider-ipc.js`：AI 配置薄 IPC。
- `desktop/services/content-generation-batch-service.js`：装配批次 store、runner、资料、回答、模板、AI 和文章 store。
- `desktop/ipc/content-generation-batch-ipc.js`：批次预览、启动、停止、继续、重试、状态事件和审核 IPC。
- `media-workbench/src/components/content/CollapsibleSourceItem.tsx`：回答/资料共用折叠行。
- `media-workbench/src/components/content/BatchGenerationView.tsx`：四步批量生成与进度。
- `media-workbench/src/components/content/GenerationBatchDetail.tsx`：跨客户批次结果和批量审核。
- `media-workbench/src/components/content/TemplateArticleGroup.tsx`：客户历史模板分组。
- `media-workbench/src/components/AiProviderSettings.tsx`：应用级 AI 配置。

修改重点：

- `src/content/doubao-collection-queue.js`、`desktop/services/doubao-collection-service.js`：批次预览、skip/force 和会话关闭。
- `src/content/doubao-browser-adapter.js`：运行模式契约。
- `src/content/client-knowledge.js`、`src/core/markitdown.js`、`desktop/workspace-paths.js`：第一层 DOCX 与缓存。
- `src/content/article-generator.js`、`src/content/article-store.js`、`src/content/prompt-builder.js`：显式资料选择、来源快照、模板快照、批次 provenance。
- `desktop/runtime-config.js`、`desktop/services/ai-content-service.js`：AI 配置脱离 workspace `.env`。
- `desktop/main.js`、`desktop/ipc/register.js`、`desktop/preload.js`：服务装配与事件。
- `media-workbench/src/components/content/QuestionCollectionView.tsx`、`ArticleGenerationView.tsx`、`GeneratedArticlesView.tsx`、`ContentWorkbench.tsx`、`SettingsView.tsx`：新交互。

---

### Task 1: 收口采集批次选择、skip/force 和浏览器生命周期

**Files:**

- Modify: `src/content/doubao-collection-queue.js`
- Modify: `src/content/doubao-collection-service.js`
- Modify: `src/content/doubao-browser-adapter.js`
- Modify: `desktop/services/doubao-collection-service.js`
- Modify: `desktop/ipc/doubao-collection-ipc.js`
- Modify: `tests/doubao-collection-queue.test.js`
- Modify: `tests/doubao-collection-service.test.js`
- Modify: `tests/doubao-browser-adapter.test.js`
- Modify: `tests/doubao-collection-ipc.test.js`

- [ ] **Step 1: 写普通采集与重新采集批次预览失败测试**

在 service 测试中固定预览契约：

```js
it("builds missing-only and force-enabled batches from selected clients", function() {
  const missing = service.previewBatch({ clientIds: ["client-1", "client-2"], mode: "missing" });
  assert.deepStrictEqual(missing.tasks.map(function(task) { return [task.clientId, task.questionId, task.force]; }), [
    ["client-1", "q-new", false],
    ["client-2", "q-new", false]
  ]);
  assert.equal(missing.skippedExisting, 2);

  const force = service.previewBatch({ clientIds: ["client-1", "client-2"], mode: "recollect" });
  assert.deepStrictEqual(force.tasks.map(function(task) { return task.force; }), [true, true, true, true]);
  assert.equal(force.disabledQuestions, 2);
});
```

另测空客户、重复客户、501 个任务、未知 mode 和停用问题永不入队。

- [ ] **Step 2: 写最后任务关闭浏览器失败测试**

```js
it("closes the collection session after single, completed batch, stopped batch, and failed last task", async function() {
  await desktop.collectOne({ clientId: "client-1", questionId: "q1", force: false });
  assert.equal(calls.close, 1);
  await desktop.startBatch({ tasks: [{ clientId: "client-1", questionId: "q2", force: false }] });
  assert.equal(calls.close, 2);
  await desktop.startBatch({ tasks: [{ clientId: "client-1", questionId: "q-fail", force: false }] });
  assert.equal(calls.close, 3);
});
```

另测 pause 保持浏览器、`openLogin()` 不自动 close、dispose 幂等 close。

- [ ] **Step 3: 写 adapter 运行模式契约失败测试**

```js
assert.equal(createDoubaoBrowserAdapter({ runtime, mode: "visible" }).mode, "visible");
assert.throws(function() {
  createDoubaoBrowserAdapter({ runtime, mode: "hidden" });
}, function(error) { return error.code === "DOUBAO_BROWSER_MODE_INVALID"; });
```

允许枚举 `visible | background`，但 background 调用返回 `DOUBAO_BACKGROUND_UNAVAILABLE`，防止界面误报可用。

- [ ] **Step 4: 运行测试确认红色基线**

Run:

```powershell
node --test tests/doubao-collection-service.test.js tests/doubao-collection-queue.test.js tests/doubao-browser-adapter.test.js tests/doubao-collection-ipc.test.js
```

Expected: FAIL，现有服务没有 previewBatch/mode，最后任务不会统一 close。

- [ ] **Step 5: 实现批次预览与统一 run/finally close**

应用服务暴露：

```js
{
  previewBatch: function(input),
  startPreparedBatch: function(input),
  collectOne: function(input),
  pauseBatch: function(),
  resumeBatch: function(),
  stopBatch: function()
}
```

`previewBatch` 从 questionStore 和 researchStore 解析任务，返回 `{ mode, clientCount, taskCount, skippedExisting, disabledQuestions, tasks }`。`startPreparedBatch` 重新验证 client/question/force，不能信任 renderer 返回的预览任务。

单条与批量都通过应用服务的 `try/finally` 管理 session；只有 paused 且还有 pending 时跳过 close。close 失败记录安全错误但不得覆盖采集结果。

- [ ] **Step 6: 增加 IPC 并运行测试**

新增：

```text
content:preview-doubao-batch
content:start-prepared-doubao-batch
```

Run:

```powershell
node --test tests/doubao-collection-service.test.js tests/doubao-collection-queue.test.js tests/doubao-browser-adapter.test.js tests/doubao-collection-ipc.test.js
npm test
```

Expected: 全部 PASS；任务结束后 profile 仍存在，页面状态不影响队列。

- [ ] **Step 7: 提交**

```powershell
git add src/content/doubao-collection-queue.js src/content/doubao-collection-service.js src/content/doubao-browser-adapter.js desktop/services/doubao-collection-service.js desktop/ipc/doubao-collection-ipc.js tests/doubao-collection-queue.test.js tests/doubao-collection-service.test.js tests/doubao-browser-adapter.test.js tests/doubao-collection-ipc.test.js
git commit -m "feat(content): refine Doubao batch collection lifecycle"
```

---

### Task 2: 重构采集页客户选择与折叠回答

**Files:**

- Create: `media-workbench/src/components/content/CollapsibleSourceItem.tsx`
- Modify: `media-workbench/src/components/content/QuestionCollectionView.tsx`
- Modify: `media-workbench/src/components/content/CollectionTaskBar.tsx`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/index.css`
- Modify: `tests/doubao-content-workbench.test.js`
- Modify: `tests/content-workbench-regression.test.js`

- [ ] **Step 1: 写唯一客户选择器与全选行为失败测试**

静态回归断言：

```js
const currentClientBindings = source.match(/onClientChange/g) || [];
assert.equal(currentClientBindings.length, 0, "collection child must not render current-client selector");
assert.match(source, /全选客户/);
assert.match(source, /取消全选/);
assert.match(source, /采集选中客户/);
assert.match(source, /重新采集选中客户/);
```

组件逻辑测试使用纯 helper 断言全选包含全部客户 ID，当前 clientId 改变不改 selectedClientIds，recollect 必须走二次确认。

- [ ] **Step 2: 写回答默认折叠失败测试**

```js
const item = read("media-workbench/src/components/content/CollapsibleSourceItem.tsx");
assert.match(item, /defaultExpanded = false/);
assert.match(item, /aria-expanded/);
assert.match(item, /checkbox/);
```

验证展开按钮和 checkbox 是不同控件，同时展开多个 item 不共享单一 active ID。

- [ ] **Step 3: 运行 renderer 测试确认失败**

Run:

```powershell
node --test tests/doubao-content-workbench.test.js tests/content-workbench-regression.test.js
npm --prefix media-workbench run lint
```

Expected: FAIL，当前重复显示客户、回答默认展开、无双命令。

- [ ] **Step 4: 实现采集 UI**

从 `QuestionCollectionViewProps` 删除 `onClientChange`。批次客户区域增加 checkbox 全选状态：全部选中、部分选中 indeterminate、全部取消。当前客户只用于加载和编辑问题，不进入批次选择副作用。

调用 Task 1 预览 API 后显示客户数、问题数、跳过数；recollect 模式确认后启动。CollectionTaskBar 不再用一个无语义 Play 图标代替两种操作，开始命令放在批次区域，任务条只负责状态、暂停、继续、停止和重试。

`CollapsibleSourceItem` 接受：

```ts
interface CollapsibleSourceItemProps {
  id: string;
  title: string;
  summary: string;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}
```

- [ ] **Step 5: 运行测试、lint、build 和提交**

Run:

```powershell
node --test tests/doubao-content-workbench.test.js tests/content-workbench-regression.test.js
npm --prefix media-workbench run lint
npm run build:renderer
npm test
```

Expected: 全部 PASS；回答默认收起，多条可同时展开，按钮文本不溢出。

Commit:

```powershell
git add media-workbench/src/components/content/CollapsibleSourceItem.tsx media-workbench/src/components/content/QuestionCollectionView.tsx media-workbench/src/components/content/CollectionTaskBar.tsx media-workbench/src/electron-api.ts media-workbench/src/types.ts media-workbench/src/index.css tests/doubao-content-workbench.test.js tests/content-workbench-regression.test.js
git commit -m "feat(renderer): streamline Doubao collection controls"
```

---

### Task 3: 第一层客户资料与 DOCX 转换缓存

**Files:**

- Create: `src/content/client-material-store.js`
- Modify: `src/content/client-knowledge.js`
- Modify: `src/core/markitdown.js`
- Modify: `desktop/workspace-paths.js`
- Create: `tests/client-material-store.test.js`
- Modify: `tests/client-knowledge.test.js`
- Modify: `tests/workspace-paths.test.js`
- Modify: `tests/runtime-diagnostics.test.js`

- [ ] **Step 1: 写第一层资料发现失败测试**

```js
it("lists only first-level supported material files", async function() {
  write("clients/client-1/brand.md", "品牌资料");
  write("clients/client-1/menu.docx", "fixture-docx");
  write("clients/client-1/nested/hidden.docx", "nested");
  write("clients/client-1/questions.json", "{}");
  const items = await store.listMaterials("client-1");
  assert.deepStrictEqual(items.map(function(item) { return item.name; }), ["brand.md", "menu.docx"]);
});
```

另测 `.txt/.md/.markdown/.json/.docx`，忽略所有子目录、隐藏文件、questions/client/search_query 和 articles/generated。

- [ ] **Step 2: 写 DOCX 缓存和失败状态测试**

注入 fake converter：

```js
const first = await store.listMaterials("client-1");
const second = await store.listMaterials("client-1");
assert.equal(converter.calls.length, 1);
assert.equal(first[0].content, "转换后的客户资料");
assert.equal(second[0].cacheHit, true);

write("clients/client-1/menu.docx", "changed-docx");
await store.listMaterials("client-1");
assert.equal(converter.calls.length, 2);
```

失败 DTO 固定为 `{ id, name, extension, status: "error", error: { code, message }, content: "", characterCount: 0 }`，不得抛出并阻断其他资料。

- [ ] **Step 3: 运行测试确认红色基线**

Run:

```powershell
node --test tests/client-material-store.test.js tests/client-knowledge.test.js tests/workspace-paths.test.js tests/runtime-diagnostics.test.js
```

Expected: FAIL，缺少 material store、DOCX 和 cache path。

- [ ] **Step 4: 实现安全转换与缓存**

`desktop/workspace-paths.js` 增加：

```js
clientMaterialCache: path.join(workspaceRoot, "work", "client-material-cache")
```

`createClientMaterialStore({ workspaceRoot, converter, hash, cacheVersion: 1 })` 暴露：

```js
{
  listMaterials: async function(clientId),
  getSelectedMaterials: async function(clientId, materialIds),
  retryMaterial: async function(clientId, materialId)
}
```

material ID 使用文件名的稳定 URL-safe 编码，不接受 renderer 路径。缓存文件包含 `{ version, clientId, name, sourceHash, content, characterCount, convertedAt }`，临时文件加 rename；symlink/junction 和越界路径拒绝。

`src/core/markitdown.js` 增加可注入、参数数组执行的 `convertDocxToText(inputPath, outputPath, options)`，避免拼接客户文件名到 shell。MarkItDown 错误映射为 `MATERIAL_MARKITDOWN_UNAVAILABLE`、`MATERIAL_DOCX_ENCRYPTED`、`MATERIAL_DOCX_CONVERSION_FAILED`。

- [ ] **Step 5: 保持 client knowledge 兼容并运行测试**

`client-knowledge.js` 继续同步读取四种文本格式，不递归、不把 DOCX 当乱码读取；AI 新流程改用 material store，旧迁移和客户列表保持兼容。

Run:

```powershell
node --test tests/client-material-store.test.js tests/client-knowledge.test.js tests/workspace-paths.test.js tests/runtime-diagnostics.test.js
npm test
```

Expected: 全部 PASS；缓存位于 workspace/work，客户目录无派生文件。

- [ ] **Step 6: 提交**

```powershell
git add src/content/client-material-store.js src/content/client-knowledge.js src/core/markitdown.js desktop/workspace-paths.js tests/client-material-store.test.js tests/client-knowledge.test.js tests/workspace-paths.test.js tests/runtime-diagnostics.test.js
git commit -m "feat(content): add first-level DOCX client materials"
```

---

### Task 4: 显式生成来源与文章/模板快照

**Files:**

- Modify: `src/content/prompt-builder.js`
- Modify: `src/content/article-generator.js`
- Modify: `src/content/article-store.js`
- Modify: `desktop/services/ai-content-service.js`
- Modify: `desktop/ipc/ai-content-ipc.js`
- Modify: `tests/prompt-builder.test.js`
- Modify: `tests/article-generator.test.js`
- Modify: `tests/article-store.test.js`
- Modify: `tests/ai-content-service.test.js`
- Modify: `tests/ai-content-ipc.test.js`

- [ ] **Step 1: 写双门槛和选择来源失败测试**

生成请求改为：

```js
{
  clientId: "client-1",
  materialIds: ["brand.md", "menu.docx"],
  researchQueryIds: ["q1", "q2"],
  platform: "ctrip",
  templateId: "guide"
}
```

测试空 materialIds 返回 `CLIENT_MATERIAL_REQUIRED`，空 research 返回 `GEO_RESEARCH_REQUIRED`，任一资料转换 error 返回 `CLIENT_MATERIAL_INVALID`，未选资料不得进入 Prompt。

- [ ] **Step 2: 写完整快照失败测试**

```js
assert.deepStrictEqual(article.materialSnapshots[0], {
  id: "brand.md",
  name: "brand.md",
  extension: ".md",
  content: "客户事实资料",
  contentHash: "material-hash",
  source: "text"
});
assert.equal(article.templateSnapshot.platform, "ctrip");
assert.equal(article.templateSnapshot.id, "guide");
assert.equal(article.templateSnapshot.body, "模板完整正文");
assert.equal(article.templateSnapshot.bodyHash, "template-hash");
```

researchSnapshots 保留问题、回答、引用、采集时间；新文章增加可选 `generationBatchId`、`generationTaskId`、`reviewedAt`。

- [ ] **Step 3: 运行内容测试确认失败**

Run:

```powershell
node --test tests/prompt-builder.test.js tests/article-generator.test.js tests/article-store.test.js tests/ai-content-service.test.js tests/ai-content-ipc.test.js
```

Expected: FAIL，当前 generator 默认使用全部 knowledgeFiles，文章无模板完整快照。

- [ ] **Step 4: 实现 material store 注入和 snapshot schema**

`createArticleGenerator` 接受 `materialStore`，在 AI 调用前 await `getSelectedMaterials`。Prompt 的客户资料区只格式化 selected materials；research 继续分问题显示。

article-store 新记录要求：

```js
status: "generated" | "saved",
materialSnapshots: MaterialSnapshot[],
researchSnapshots: ResearchSnapshot[],
templateSnapshot: TemplateSnapshot,
generationBatchId: string | null,
generationTaskId: string | null,
reviewedAt: string | null
```

旧文章缺少新字段时继续读取；旧文章可编辑保存，但在批量审核时按来源缺失规则拒绝，不能伪造快照。

- [ ] **Step 5: 运行定向、全套测试并提交**

Run:

```powershell
node --test tests/prompt-builder.test.js tests/article-generator.test.js tests/article-store.test.js tests/ai-content-service.test.js tests/ai-content-ipc.test.js
npm test
```

Expected: 全部 PASS；错误不包含资料全文或 Prompt。

Commit:

```powershell
git add src/content/prompt-builder.js src/content/article-generator.js src/content/article-store.js desktop/services/ai-content-service.js desktop/ipc/ai-content-ipc.js tests/prompt-builder.test.js tests/article-generator.test.js tests/article-store.test.js tests/ai-content-service.test.js tests/ai-content-ipc.test.js
git commit -m "feat(content): persist explicit article source snapshots"
```

---

### Task 5: 应用级 AI 配置加密存储与服务

**Files:**

- Create: `desktop/ai-provider-config-store.js`
- Create: `desktop/services/ai-provider-service.js`
- Create: `desktop/ipc/ai-provider-ipc.js`
- Modify: `desktop/runtime-config.js`
- Modify: `src/content/ai-client.js`
- Modify: `desktop/ipc/register.js`
- Modify: `desktop/preload.js`
- Modify: `desktop/main.js`
- Create: `tests/ai-provider-config-store.test.js`
- Create: `tests/ai-provider-service.test.js`
- Create: `tests/ai-provider-ipc.test.js`
- Modify: `tests/workspace-paths.test.js`
- Modify: `tests/electron-security.test.js`

- [ ] **Step 1: 写 safeStorage 存储失败测试**

使用 fake safeStorage：

```js
const store = createAiProviderConfigStore({ userDataPath, safeStorage: fakeSafeStorage });
store.write({ baseUrl: "https://provider.example/v1", apiKey: "secret", model: "model-a", timeoutMs: 60000 });
const disk = fs.readFileSync(path.join(userDataPath, "ai-provider.json"), "utf8");
assert.equal(disk.includes("secret"), false);
assert.deepStrictEqual(store.read(), {
  baseUrl: "https://provider.example/v1",
  apiKey: "secret",
  model: "model-a",
  timeoutMs: 60000
});
```

另测 safeStorage unavailable、损坏密文、原子写入失败、symlink 配置文件、clear 幂等。

- [ ] **Step 2: 写来源优先级与脱敏 DTO 测试**

```js
assert.deepStrictEqual(service.getStatus(), {
  source: "application",
  configured: true,
  baseUrl: "https://provider.example/v1",
  model: "model-a",
  timeoutMs: 60000,
  hasApiKey: true,
  apiKeyMask: "••••••••",
  lastTest: null
});
```

OS env 四项齐全时 source=environment 且 save/test/clear 返回 `AI_CONFIG_ENV_OVERRIDE`。workspace `.env` 中 AI_* 不得进入 process.env；其他 XQW/MARKITDOWN 设置继续加载。

- [ ] **Step 3: 写保存、测试和清除失败测试**

保存只做本地校验且不调用网络。testConnection 使用表单草稿创建临时 AI client，messages 固定为 system `Connection test`、user `Reply with OK only`；失败不写 store，成功只保存 `{testedAt, ok, code}`，不保存回答。

- [ ] **Step 4: 运行测试确认红色基线**

Run:

```powershell
node --test tests/ai-provider-config-store.test.js tests/ai-provider-service.test.js tests/ai-provider-ipc.test.js tests/workspace-paths.test.js tests/electron-security.test.js
```

Expected: FAIL，模块尚不存在，runtime 仍读取 workspace AI 环境变量。

- [ ] **Step 5: 实现配置 store/service 和 ai-client 显式参数**

配置 schema：

```js
{
  version: 1,
  baseUrl: "https://provider.example/v1",
  encryptedApiKey: "base64-ciphertext",
  model: "model-a",
  timeoutMs: 60000,
  updatedAt: "2026-07-15T00:00:00.000Z",
  lastTest: null
}
```

`runtime-config.loadWorkspaceEnvironment` 过滤所有 `AI_` key。`createAiClient` 改为要求显式 config；只在专门 legacy 测试入口允许 env，生产 service 不调用 env fallback。

AI provider service 暴露 `getStatus/save/testConnection/clear/createClient/getFingerprint`。fingerprint 使用 baseUrl+model+timeout+密钥密文哈希，不暴露 key。

- [ ] **Step 6: 注册 IPC 并装配 main**

频道：

```text
ai-provider:get-status
ai-provider:save
ai-provider:test
ai-provider:clear
```

Renderer 保存请求可以携带新 API Key，但 get-status 永不返回明文。test 草稿不记录日志。main 使用 `app.getPath("userData")` 和 Electron safeStorage 创建单例 service，并注入 AI 内容与后续批次服务。

- [ ] **Step 7: 运行测试与提交**

Run:

```powershell
node --test tests/ai-provider-config-store.test.js tests/ai-provider-service.test.js tests/ai-provider-ipc.test.js tests/workspace-paths.test.js tests/electron-security.test.js tests/ai-client.test.js
npm test
```

Expected: 全部 PASS；Git diff、错误和 IPC 响应不含测试 key。

Commit:

```powershell
git add desktop/ai-provider-config-store.js desktop/services/ai-provider-service.js desktop/ipc/ai-provider-ipc.js desktop/runtime-config.js src/content/ai-client.js desktop/ipc/register.js desktop/preload.js desktop/main.js tests/ai-provider-config-store.test.js tests/ai-provider-service.test.js tests/ai-provider-ipc.test.js tests/workspace-paths.test.js tests/electron-security.test.js tests/ai-client.test.js
git commit -m "feat(desktop): add encrypted application AI settings"
```

---

### Task 6: 配置中心 AI 提供方界面

**Files:**

- Create: `media-workbench/src/components/AiProviderSettings.tsx`
- Modify: `media-workbench/src/components/SettingsView.tsx`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/index.css`
- Create: `tests/renderer-ai-provider-settings.test.js`
- Modify: `tests/react-workbench-regression.test.js`

- [ ] **Step 1: 写 renderer API 与不回显密钥失败测试**

```js
assert.match(api, /getAiProviderStatus/);
assert.match(api, /saveAiProviderConfig/);
assert.match(api, /testAiProviderConnection/);
assert.match(api, /clearAiProviderConfig/);
assert.doesNotMatch(settings, /status\.apiKey/);
assert.match(settings, /hasApiKey/);
```

测试环境 override 时输入只读；running/stopping generation batch 时按钮禁用。

- [ ] **Step 2: 运行测试和 lint 确认失败**

Run:

```powershell
node --test tests/renderer-ai-provider-settings.test.js tests/react-workbench-regression.test.js
npm --prefix media-workbench run lint
```

Expected: FAIL，配置组件和 API 不存在。

- [ ] **Step 3: 实现 AiProviderSettings**

字段：Base URL、API Key（空表示保留已有）、模型、timeout。显示来源、configured、掩码和 lastTest。按钮：保存、测试连接、清除；测试前确认“可能产生少量费用”，清除二次确认。

AiProviderSettings 在挂载时读取 generation batch state 并订阅 `content:generation-batch-state`，由主进程状态决定保存、测试和清除按钮是否禁用。SettingsView 同时加载 workspace 与 AI 状态，两个 section 独立错误和 loading，不让 AI 请求失败阻断工作区设置。

- [ ] **Step 4: 运行测试、lint、build 和提交**

Run:

```powershell
node --test tests/renderer-ai-provider-settings.test.js tests/react-workbench-regression.test.js
npm --prefix media-workbench run lint
npm run build:renderer
npm test
```

Expected: 全部 PASS；API Key 输入不会从 status 自动填充，最长 URL 不溢出。

Commit:

```powershell
git add media-workbench/src/components/AiProviderSettings.tsx media-workbench/src/components/SettingsView.tsx media-workbench/src/electron-api.ts media-workbench/src/types.ts media-workbench/src/index.css tests/renderer-ai-provider-settings.test.js tests/react-workbench-regression.test.js
git commit -m "feat(renderer): manage shared AI provider settings"
```

---

### Task 7: 生成批次 store 与恢复语义

**Files:**

- Create: `src/content/generation-batch-store.js`
- Modify: `desktop/workspace-paths.js`
- Create: `tests/generation-batch-store.test.js`
- Modify: `tests/workspace-paths.test.js`

- [ ] **Step 1: 写客户 × 模板任务构建失败测试**

```js
const batch = store.createBatch({
  clientSources: [
    { clientId: "c1", materialIds: ["brand.md"], researchQueryIds: ["q1"] },
    { clientId: "c2", materialIds: ["brand.md"], researchQueryIds: ["q2"] }
  ],
  templates: [
    { platform: "ctrip", templateId: "guide" },
    { platform: "xiaohongshu", templateId: "recommend" }
  ],
  aiConfigFingerprint: "fingerprint"
});
assert.equal(batch.tasks.length, 4);
assert.deepStrictEqual(batch.tasks.map(function(task) { return [task.clientId, task.platform, task.templateId]; }), [
  ["c1", "ctrip", "guide"],
  ["c1", "xiaohongshu", "recommend"],
  ["c2", "ctrip", "guide"],
  ["c2", "xiaohongshu", "recommend"]
]);
```

双门槛、重复客户/模板、空任务、超过 1000 任务和非法 ID 必须拒绝。

- [ ] **Step 2: 写原子状态与重启恢复失败测试**

创建 batch，依次 `markRunning`、`markSucceeded(taskId, articleId)`；模拟进程退出后重新创建 store，running task 变 interrupted，succeeded 保持 articleId。重复 markSucceeded 同 article 幂等，不同 article 返回 `GENERATION_TASK_CONFLICT`。

- [ ] **Step 3: 运行测试确认模块缺失**

Run: `node --test tests/generation-batch-store.test.js tests/workspace-paths.test.js`

Expected: FAIL with `MODULE_NOT_FOUND`。

- [ ] **Step 4: 实现 batch schema 和 journal/rename**

workspace 增加 `generationBatches: path.join(data, "content-generation-batches")`。文件 `batch-<uuid>.json` 包含 version、id、status、createdAt、updatedAt、aiConfigFingerprint、clientSources、templates、tasks、counts。

store API：

```js
{
  createBatch,
  getBatch,
  listBatches,
  updateBatchStatus,
  markTaskRunning,
  markTaskSucceeded,
  markTaskFailed,
  markTaskInterrupted,
  recoverInterrupted
}
```

每次写入重新计算 counts，使用临时文件、backup、rename 和恢复逻辑；列表按 createdAt 倒序。

- [ ] **Step 5: 运行测试、全套测试和提交**

Run:

```powershell
node --test tests/generation-batch-store.test.js tests/workspace-paths.test.js
npm test
```

Expected: 全部 PASS；损坏 batch 返回稳定错误，不影响其他 batch 列表。

Commit:

```powershell
git add src/content/generation-batch-store.js desktop/workspace-paths.js tests/generation-batch-store.test.js tests/workspace-paths.test.js
git commit -m "feat(content): persist article generation batches"
```

---

### Task 8: 串行生成 runner、重试、停止和并发预留

**Files:**

- Create: `src/content/generation-batch-runner.js`
- Create: `tests/generation-batch-runner.test.js`
- Modify: `tests/ai-client.test.js`

- [ ] **Step 1: 写串行与幂等执行失败测试**

```js
const runner = createGenerationBatchRunner({ batchStore, executeTask, concurrency: 1, sleep, now });
const result = await runner.run(batch.id);
assert.equal(maxActiveCalls, 1);
assert.deepStrictEqual(executedTaskIds, ["task-1", "task-2"]);
assert.equal(result.status, "completed");
```

已有 succeeded task 不调用 executeTask；article 已存在但 batch 未更新时通过 `findByGenerationTaskId` 修复 succeeded。

- [ ] **Step 2: 写错误分类与退避失败测试**

429/timeout/5xx 的 sleep 依次为 5000、15000，第三次失败后 task failed。401/403/model/config 将 batch 设 `paused_configuration` 并停止取新任务。空输出/上下文过长当前 task failed 后继续。

- [ ] **Step 3: 写停止和并发契约失败测试**

```js
const running = runner.run(batch.id);
await taskStarted;
await runner.stop();
await running;
assert.equal(store.getBatch(batch.id).tasks[0].status, "interrupted");
assert.equal(store.getBatch(batch.id).tasks[1].status, "pending");
```

concurrency 允许 1–4，测试 concurrency=2 时每个任务仅执行一次；生产 service 固定传 1。AbortSignal 必须传给 aiClient.complete。

- [ ] **Step 4: 运行测试确认红色基线**

Run: `node --test tests/generation-batch-runner.test.js tests/ai-client.test.js`

Expected: FAIL，runner 不存在，ai-client 外部 abort 契约不足。

- [ ] **Step 5: 实现 worker loop 和安全事件**

runner API：

```js
{
  run: async function(batchId, selection),
  stop: async function(),
  getState: function(),
  subscribe: function(listener),
  dispose: async function()
}
```

`selection` 为 `pending | failed | unfinished`。事件只含 batch/task ID、客户 ID、平台、模板 ID、counts、status 和安全错误，不含 Prompt、资料或 provider body。

- [ ] **Step 6: 运行测试、全套测试和提交**

Run:

```powershell
node --test tests/generation-batch-runner.test.js tests/ai-client.test.js
npm test
```

Expected: 全部 PASS；无 timer/AbortController 泄漏，dispose 产生唯一终态。

Commit:

```powershell
git add src/content/generation-batch-runner.js tests/generation-batch-runner.test.js src/content/ai-client.js tests/ai-client.test.js
git commit -m "feat(content): run recoverable article generation batches"
```

---

### Task 9: 生成批次应用服务与 IPC

**Files:**

- Create: `desktop/services/content-generation-batch-service.js`
- Create: `desktop/ipc/content-generation-batch-ipc.js`
- Modify: `desktop/ipc/register.js`
- Modify: `desktop/preload.js`
- Modify: `desktop/main.js`
- Modify: `desktop/workspace-bootstrap-service.js`
- Create: `tests/content-generation-batch-service.test.js`
- Create: `tests/content-generation-batch-ipc.test.js`
- Modify: `tests/desktop-workbench-flow.test.js`
- Modify: `tests/workspace-bootstrap-service.test.js`

- [ ] **Step 1: 写预览与不可生成客户失败测试**

```js
const preview = await service.preview({ clientIds: ["c1", "c2"], templates: [{ platform: "ctrip", templateId: "guide" }] });
assert.equal(preview.executableClientCount, 1);
assert.equal(preview.executableTaskCount, 1);
assert.deepStrictEqual(preview.excludedClients, [{ clientId: "c2", codes: ["CLIENT_MATERIAL_REQUIRED"] }]);
```

预览默认勾选全部 status=ready 资料和全部有效回答；renderer 提交 material/research IDs 后主进程重新读取和验证。

- [ ] **Step 2: 写任务执行装配失败测试**

executeTask 按 task 开始时读取当前 material/research/template，调用 article generator，立即 saveArticle(status generated, batch/task IDs)，再 mark succeeded。AI 配置 fingerprint 与 batch 不同且是 continue 操作时返回 `GENERATION_AI_CONFIG_CHANGED`，用户明确 confirm 后才能继续。

- [ ] **Step 3: 写 busy 状态和退出失败测试**

generation running/stopping 时：workspace switch busy、AI config mutation busy。main before-quit 调用 generation service.dispose；事件 `content:generation-batch-state` 可订阅和退订。

- [ ] **Step 4: 运行测试确认红色基线**

Run:

```powershell
node --test tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/desktop-workbench-flow.test.js tests/workspace-bootstrap-service.test.js
```

Expected: FAIL，新 service/IPC 不存在。

- [ ] **Step 5: 实现 service 和频道**

频道：

```text
content:preview-generation-batch
content:create-generation-batch
content:list-generation-batches
content:get-generation-batch
content:start-generation-batch
content:stop-generation-batch
content:continue-generation-batch
content:retry-failed-generation-batch
content:get-generation-batch-state
```

所有数组限制、ID、平台/模板和 concurrency 在主进程验证。create 固定 concurrency=1。service 向 AI provider service 注册 busy predicate，workspace bootstrap 查询同一状态。

- [ ] **Step 6: 运行测试、全套测试和提交**

Run:

```powershell
node --test tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/desktop-workbench-flow.test.js tests/workspace-bootstrap-service.test.js
npm test
```

Expected: 全部 PASS；页面卸载不影响 runner，退出等待 dispose。

Commit:

```powershell
git add desktop/services/content-generation-batch-service.js desktop/ipc/content-generation-batch-ipc.js desktop/ipc/register.js desktop/preload.js desktop/main.js desktop/workspace-bootstrap-service.js tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/desktop-workbench-flow.test.js tests/workspace-bootstrap-service.test.js
git commit -m "feat(desktop): expose generation batch workflow"
```

---

### Task 10: 单篇资料展示与四步批量生成 UI

**Files:**

- Create: `media-workbench/src/components/content/BatchGenerationView.tsx`
- Create: `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- Create: `media-workbench/src/content-generation-ui-logic.js`
- Modify: `media-workbench/src/components/content/ArticleGenerationView.tsx`
- Modify: `media-workbench/src/components/ContentWorkbench.tsx`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/index.css`
- Create: `tests/renderer-batch-generation.test.js`
- Modify: `tests/content-workbench-regression.test.js`

- [ ] **Step 1: 写单篇回答/资料折叠和双门槛失败测试**

断言 ArticleGenerationView 使用 CollapsibleSourceItem 展示 materials/research，默认全选且 defaultExpanded=false；generate disabled 条件同时要求 materialIds.length 和 researchQueryIds.length。

- [ ] **Step 2: 写四步与笛卡尔计数失败测试**

在 `content-generation-ui-logic.js` 导出 `countGenerationTasks(clientCount, templateCount)` 和固定 `BATCH_GENERATION_STEPS`。测试：

```ts
const { countGenerationTasks, BATCH_GENERATION_STEPS } = require('../media-workbench/src/content-generation-ui-logic.js');
assert.equal(countGenerationTasks(10, 3), 30);
assert.deepEqual(BATCH_GENERATION_STEPS, ['clients', 'templates', 'sources', 'confirm']);
```

模板按 platform 分组；每个客户只出现一套 material/research checkbox；排除客户和可执行任务数必须可见。

- [ ] **Step 3: 写批次进度/恢复失败测试**

组件源码与行为测试覆盖 current client/template、counts、stop、continue unfinished、retry failed、配置变化确认和跨客户结果。离开 generate tab 后重新进入能从 IPC state 恢复，不依赖组件内队列。

- [ ] **Step 4: 运行测试和 lint 确认失败**

Run:

```powershell
node --test tests/renderer-batch-generation.test.js tests/content-workbench-regression.test.js
npm --prefix media-workbench run lint
```

Expected: FAIL，批量组件和来源资料不存在。

- [ ] **Step 5: 实现单篇/批量 segmented control**

ArticleGenerationView 拆出 single panel，共享 CollapsibleSourceItem。顶部 segmented control 使用固定尺寸按钮 `单篇生成`、`批量生成`；切换模式不丢失已编辑文章，但批次来源选择只存在 batch view。

BatchGenerationView 逐步调用 preview/create/start。启动确认显示 `客户数 × 模板数 = 调用数`、可执行/排除数量。进度区稳定高度，列表虚拟化不是本次要求，但长列表使用滚动容器和稳定 key。

- [ ] **Step 6: 运行 renderer、全套测试和提交**

Run:

```powershell
node --test tests/renderer-batch-generation.test.js tests/content-workbench-regression.test.js
npm --prefix media-workbench run lint
npm run build:renderer
npm test
```

Expected: 全部 PASS；1180×760 和 1440×900 下无文字/控件重叠。

Commit:

```powershell
git add media-workbench/src/components/content/BatchGenerationView.tsx media-workbench/src/components/content/GenerationBatchDetail.tsx media-workbench/src/content-generation-ui-logic.js media-workbench/src/components/content/ArticleGenerationView.tsx media-workbench/src/components/ContentWorkbench.tsx media-workbench/src/electron-api.ts media-workbench/src/types.ts media-workbench/src/index.css tests/renderer-batch-generation.test.js tests/content-workbench-regression.test.js
git commit -m "feat(renderer): add multi-client template generation"
```

---

### Task 11: 文章审核服务与模板分组历史页

**Files:**

- Create: `src/content/article-review-service.js`
- Create: `media-workbench/src/components/content/TemplateArticleGroup.tsx`
- Create: `media-workbench/src/article-history-logic.js`
- Modify: `desktop/services/ai-content-service.js`
- Modify: `desktop/ipc/ai-content-ipc.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Modify: `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/types.ts`
- Create: `tests/article-review-service.test.js`
- Create: `tests/renderer-article-history.test.js`
- Modify: `tests/article-store.test.js`
- Modify: `tests/content-submission-export.test.js`

- [ ] **Step 1: 写审核规则失败测试**

```js
const result = review.reviewMany([
  { clientId: "c1", articleId: "a1" },
  { clientId: "c2", articleId: "a2" }
]);
assert.deepStrictEqual(result.approved, ["a1"]);
assert.deepStrictEqual(result.rejected, [{ articleId: "a2", code: "ARTICLE_SOURCE_INCOMPLETE" }]);
assert.equal(store.getArticle("c1", "a1").status, "saved");
assert.equal(store.getArticle("c1", "a1").reviewedAt, "2026-07-15T00:00:00.000Z");
```

标题/正文空、material/research/template snapshot 缺失拒绝；saved 幂等，不改 createdAt/updatedAt/reviewedAt。最多 500 条，跨 client ID 由主进程解析。

- [ ] **Step 2: 写历史分组排序失败测试**

`article-history-logic.js` 导出 `groupArticlesByTemplate(articles)`；按 `platform + templateSnapshot.id` 分组，模板组按 max(createdAt) 倒序，文章按 createdAt 倒序。updatedAt/reviewedAt 改变不影响顺序；缺失 snapshot 的旧文章放“旧版未分类”组。

- [ ] **Step 3: 运行测试确认失败**

Run:

```powershell
node --test tests/article-review-service.test.js tests/renderer-article-history.test.js tests/article-store.test.js tests/content-submission-export.test.js
```

Expected: FAIL，无 review service 和模板分组。

- [ ] **Step 4: 实现审核 IPC 与导出门槛**

新增 `content:review-articles`。批次详情允许跨客户勾选 generated；历史页允许全选当前模板组/筛选结果。确认弹窗显示数量。只有 status saved 的文章通过 submission export，generated 返回 `ARTICLE_NOT_REVIEWED`。

- [ ] **Step 5: 实现模板组 UI**

当前客户历史页不增加第二客户选择器。TemplateArticleGroup 默认 collapsed，header 显示平台、模板名称/场景、文章数、待审核数、最新 createdAt；内部 checkbox 与打开文章按钮分离。

- [ ] **Step 6: 运行测试、lint、build、全套并提交**

Run:

```powershell
node --test tests/article-review-service.test.js tests/renderer-article-history.test.js tests/article-store.test.js tests/content-submission-export.test.js
npm --prefix media-workbench run lint
npm run build:renderer
npm test
```

Expected: 全部 PASS；批量审核不自动导出，历史磁盘路径不变。

Commit:

```powershell
git add src/content/article-review-service.js desktop/services/ai-content-service.js desktop/ipc/ai-content-ipc.js desktop/preload.js media-workbench/src/components/content/TemplateArticleGroup.tsx media-workbench/src/article-history-logic.js media-workbench/src/components/content/GeneratedArticlesView.tsx media-workbench/src/components/content/GenerationBatchDetail.tsx media-workbench/src/electron-api.ts media-workbench/src/types.ts tests/article-review-service.test.js tests/renderer-article-history.test.js tests/article-store.test.js tests/content-submission-export.test.js
git commit -m "feat(content): review and group generated articles"
```

---

### Task 12: 兼容、打包、文档与真实验收

**Files:**

- Modify: `electron-builder.alpha.yml`
- Modify: `scripts/verify-alpha-package.js`
- Modify: `tests/desktop-packaging.test.js`
- Modify: `docs/content-workspace-contract.md`
- Modify: `docs/doubao-collection-operations.md`
- Create: `docs/content-generation-operations.md`
- Modify: `.env.example`

- [ ] **Step 1: 写私密配置与缓存打包失败测试**

验证包内不得出现：

```text
ai-provider.json
workspace-location.json
content-generation-batches
client-material-cache
research
generated
browser profile
doubao diagnostics
tests/fixtures
```

同时必须包含新增 src/desktop JS 和 renderer dist。

- [ ] **Step 2: 写旧数据兼容回归**

运行旧 research、旧单篇 article、legacy migration、workspace selection、媒体投稿和内容导出测试。旧文章能显示在“旧版未分类”，但未补齐来源前不能批量审核。

- [ ] **Step 3: 更新文档和环境示例**

`content-workspace-contract.md` 增加 material cache、generation batches、snapshots 和 review status。`doubao-collection-operations.md` 增加全选、missing/recollect 和 auto-close；明确 background 尚不可用。

`content-generation-operations.md` 写单篇/批量、双门槛、DOCX、任务恢复、重试、审核、历史和 AI 配置。`.env.example` 从 workspace AI 部分移除 AI_*，说明仅 OS/启动 env 可覆盖应用配置；保留媒体等变量。

- [ ] **Step 4: 运行完整自动验证**

Run:

```powershell
npm test
npm --prefix media-workbench run lint
npm run build:renderer
npm run verify
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources/app
```

Expected: 全部 exit 0；无新增非预期 skip；verifier 输出 `Alpha package contents OK`。

- [ ] **Step 5: 执行桌面人工验收**

在隔离 workspace/userData 中验证：

1. 20 个测试客户全选，只入队 enabled。
2. missing 模式跳过已有回答，recollect 模式确认后覆盖。
3. 最后任务关闭浏览器，切换页面采集继续。
4. TXT/MD/JSON/DOCX 第一层可见，子目录忽略，DOCX 缓存与重试生效。
5. 单篇资料/回答默认折叠且双门槛有效。
6. 3 客户 × 2 平台模板生成 6 个任务，串行、重试、停止、重启恢复正确。
7. 成功文章自动进入待审核，跨客户批量审核后才可导出。
8. 当前客户历史按模板和 createdAt 分组，模板修改后旧组不漂移。
9. AI 配置跨 workspace 共用，workspace `.env` AI 值无效，OS env 覆盖只读。
10. 配置/文章/日志/安装包无明文 API Key。

- [ ] **Step 6: 提交最终文档与打包边界**

```powershell
git add electron-builder.alpha.yml scripts/verify-alpha-package.js tests/desktop-packaging.test.js docs/content-workspace-contract.md docs/doubao-collection-operations.md docs/content-generation-operations.md .env.example
git commit -m "docs: finalize content generation operations"
```

---

## 最终通过标准

- [ ] 采集页仅一个当前客户选择器；批次客户可全选/取消全选且与当前客户独立。
- [ ] missing/recollect 两个命令含义明确，只处理已启用问题。
- [ ] 采集队列脱离 React 页面，最后任务/停止后关闭浏览器，登录 profile 保留。
- [ ] 回答和客户资料默认折叠，可同时展开，展开与勾选独立。
- [ ] 资料只读客户目录第一层；DOCX 安全转换、缓存、失败隔离和重试通过。
- [ ] 单篇和批量均要求至少一份客户资料和一条 GEO 调研回答。
- [ ] 客户 × 跨平台模板任务计数准确，每客户只配置一次来源。
- [ ] 批次串行、可停止、可恢复、可重试，不重复成功任务；并发接口已隔离但 UI 固定 1。
- [ ] 批量成功文章立即持久化为 generated；明确审核后变 saved，且不自动投稿。
- [ ] 生成批次详情可跨客户审核，历史页可按模板组审核。
- [ ] 历史按当前客户、平台+模板、createdAt 倒序；编辑/审核不改变顺序。
- [ ] 每篇新文章保存实际客户资料、GEO 回答和完整模板快照。
- [ ] AI 配置应用级共享、safeStorage 加密；workspace AI `.env` 被忽略；OS env 可覆盖。
- [ ] 生成运行中不能修改/测试/清除 AI 配置；继续旧批次提示配置变化。
- [ ] 本次不宣称隐藏/headless 可用，但 adapter mode 边界不会阻碍后续实现。
- [ ] 旧客户、旧 research、旧文章、工作区、投稿和导出流程兼容。
- [ ] `npm test`、renderer lint/build、verify、alpha 打包和 verifier 全部通过。
