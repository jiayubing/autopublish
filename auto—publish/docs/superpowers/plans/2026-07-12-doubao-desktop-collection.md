# 豆包桌面端采集功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AutoPublish 桌面端实现多客户多问题维护、豆包单条与批量采集、人工修正，以及基于多条豆包回答生成文章的完整闭环。

**Architecture:** 复用现有 Node/Playwright CLI 持久会话，新增问题存储、纯页面解析器、豆包浏览器适配器、采集服务和串行队列。Renderer 仅通过安全 IPC 操作稳定 ID；采集结果继续由 research store 原子保存，文章生成扩展为多个 research 来源并保留不可变来源快照。

**Tech Stack:** Electron 33、CommonJS Node.js、React 19、TypeScript、Vite、Playwright CLI、Node test runner、electron-builder。

---

## 实施前提与不变量

- 基线分支：`codex/doubao-desktop-collection`，设计提交 `28ccf94`。
- 正式规格：`docs/superpowers/specs/2026-07-12-doubao-desktop-collection-design.md`。
- `F:\携程` 仅只读参考，不复制其 SQLite、Python 运行时或客户数据。
- 不提交或打包 `.env`、客户资料、research、生成文章、豆包登录 profile、真实截图或真实页面 HTML。
- 所有功能提交前运行对应定向测试；每个任务结束运行 `npm test`。
- 遇到真实豆包页面选择器不确定时，只更新脱敏 fixture 和适配器选择器，不降低“空回答不得保存”的成功标准。
- 当前工作树已有用户未提交的生成文章、模板和旧计划内容；所有提交只暂存本任务列出的文件。

## 文件结构

新增文件及单一职责：

- `src/content/question-store.js`：客户问题配置、`search_query.txt` 兼容导入、原子写入和删除。
- `src/content/doubao-page-parser.js`：纯 DOM 快照数据解析和完成状态判定，不控制浏览器。
- `src/content/doubao-browser-adapter.js`：独立 `doubao` Playwright 会话、登录、提问、轮询、参考资料和诊断产物。
- `src/content/doubao-collection-service.js`：问题读取、自动采集、覆盖保护和人工保存。
- `src/content/doubao-collection-queue.js`：串行任务状态机和 15–30 秒等待。
- `desktop/services/doubao-collection-service.js`：装配 workspace、adapter、store、queue 并提供 Electron 应用服务。
- `desktop/ipc/doubao-collection-ipc.js`：问题、登录、采集、队列和人工保存 IPC。
- `media-workbench/src/components/content/QuestionCollectionView.tsx`：问题与采集标签页。
- `media-workbench/src/components/content/ArticleGenerationView.tsx`：多回答文章生成与编辑。
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`：已生成文章列表和导出。
- `media-workbench/src/components/content/CollectionTaskBar.tsx`：固定高度的队列状态和控制条。
- `tests/fixtures/doubao/*.json`：脱敏页面解析 fixture，只包含解析所需字段。

修改文件及职责变化：

- `desktop/workspace-paths.js`：增加 browser 与豆包诊断目录。
- `src/content/client-knowledge.js`：知识库扫描忽略 `questions.json`。
- `src/content/research-store.js`：保存采集方式、采集时间、更新时间及删除能力。
- `src/content/prompt-builder.js`、`src/content/article-generator.js`、`src/content/article-store.js`：支持多个 research 和来源快照，兼容旧单条文章。
- `desktop/services/ai-content-service.js`、`desktop/ipc/ai-content-ipc.js`：接受 `researchQueryIds`。
- `desktop/main.js`、`desktop/ipc/register.js`、`desktop/preload.js`：装配采集服务、事件和关闭清理。
- `media-workbench/src/electron-api.ts`、`media-workbench/src/types.ts`、`media-workbench/src/components/ContentWorkbench.tsx`：新增采集契约和三标签页容器。
- `electron-builder.alpha.yml`、`scripts/verify-alpha-package.js`：验证不打包 workspace 私密数据。

---

### Task 1: 工作区目录与多问题存储

**Files:**

- Create: `src/content/question-store.js`
- Modify: `desktop/workspace-paths.js`
- Modify: `src/content/client-knowledge.js`
- Create: `tests/question-store.test.js`
- Modify: `tests/workspace-paths.test.js`
- Modify: `tests/client-knowledge.test.js`

- [ ] **Step 1: 写工作区与问题存储失败测试**

在 `tests/question-store.test.js` 建立临时 workspace，并覆盖以下契约：

```js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createQuestionStore } = require("../src/content/question-store");

describe("question store", function() {
  let root;
  let store;
  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-"));
    fs.mkdirSync(path.join(root, "clients", "client-1"), { recursive: true });
    store = createQuestionStore(root, {
      createId: function() { return "question-1"; },
      now: function() { return "2026-07-12T00:00:00.000Z"; }
    });
  });
  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("creates, updates, lists, toggles, and deletes a stable question", function() {
    const created = store.createQuestion("client-1", { text: " 上海  周边推荐 " });
    assert.equal(created.id, "question-1");
    assert.equal(created.text, "上海  周边推荐");
    assert.equal(created.enabled, true);
    assert.equal(store.updateQuestion("client-1", "question-1", { text: "上海酒店推荐", enabled: false }).id, "question-1");
    assert.equal(store.listQuestions("client-1")[0].enabled, false);
    store.deleteQuestion("client-1", "question-1");
    assert.deepStrictEqual(store.listQuestions("client-1"), []);
  });

  it("imports search_query.txt once and rejects normalized duplicates", function() {
    fs.writeFileSync(path.join(root, "clients", "client-1", "search_query.txt"), "上海  酒店推荐\r\n", "utf8");
    assert.equal(store.listQuestions("client-1")[0].text, "上海  酒店推荐");
    assert.equal(store.listQuestions("client-1").length, 1);
    assert.throws(function() { store.createQuestion("client-1", { text: "上海 酒店推荐" }); }, function(error) {
      return error.code === "QUESTION_DUPLICATE";
    });
  });
});
```

在现有测试中断言 `createWorkspacePaths(root).browser`、`.doubaoBrowser`、`.doubaoDiagnostics` 都位于 root 下，并断言 `questions.json` 不会被 `loadClientKnowledge` 当成客户知识。

- [ ] **Step 2: 运行测试并确认红色基线**

Run:

```powershell
node --test tests/question-store.test.js tests/workspace-paths.test.js tests/client-knowledge.test.js
```

Expected: FAIL，原因是 `question-store.js` 不存在、workspace 尚无豆包路径或 `questions.json` 被知识库读取。

- [ ] **Step 3: 实现问题 schema、边界和兼容导入**

`src/content/question-store.js` 导出以下 API：

```js
function createQuestionStore(workspaceRoot, options) {
  return {
    listQuestions,
    getQuestion,
    createQuestion,
    updateQuestion,
    deleteQuestion
  };
}

module.exports = { createQuestionStore };
```

实现时固定以下规则：

- 客户 ID、问题 ID 必须是单一路径段。
- 问题文本 trim 后为 1–2000 字符。
- 重复判断使用 `text.trim().replace(/\s+/g, " ")`。
- `questions.json` 顶层只允许 `version` 和 `questions`，其中 `version` 固定为 `1`，`questions` 为问题对象数组。
- `search_query.txt` 仅在 `questions.json` 不存在时导入；导入后立即原子写入 `questions.json`。
- 更新保留 ID 和 createdAt，只更新 text、enabled、updatedAt。
- 写入使用同目录 temporary + rename；失败清理 temporary。

在 `desktop/workspace-paths.js` 增加：

```js
browser: path.join(workspaceRoot, "browser"),
doubaoBrowser: path.join(workspaceRoot, "browser", "doubao"),
doubaoDiagnostics: path.join(workspaceRoot, "logs", "doubao-diagnostics")
```

在 `loadClientKnowledge` 的过滤器中排除 `questions.json`。

- [ ] **Step 4: 运行定向测试并确认通过**

Run:

```powershell
node --test tests/question-store.test.js tests/workspace-paths.test.js tests/client-knowledge.test.js
```

Expected: 全部 PASS；重复读取不重复导入，非法 `../client`、绝对路径、超长问题和重复问题都返回稳定错误码。

- [ ] **Step 5: 运行全套测试并提交**

Run: `npm test`

Expected: exit 0。

Commit:

```powershell
git add src/content/question-store.js desktop/workspace-paths.js src/content/client-knowledge.js tests/question-store.test.js tests/workspace-paths.test.js tests/client-knowledge.test.js
git commit -m "feat(content): add client question store"
```

---

### Task 2: 扩展 research 采集元数据与安全删除

**Files:**

- Modify: `src/content/research-store.js`
- Modify: `tests/research-store.test.js`
- Modify: `tests/legacy-migration.test.js`

- [ ] **Step 1: 写采集元数据和删除失败测试**

在 `tests/research-store.test.js` 增加：

```js
it("stores collection provenance and removes only the requested research", function() {
  const record = store.saveResearch("client-1", {
    id: "question-1",
    question: "上海酒店推荐",
    answerText: "这是一个有效且完整的豆包回答。",
    references: [],
    collectionMethod: "automatic",
    collectedAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z"
  });
  assert.equal(record.collectionMethod, "automatic");
  assert.equal(record.collectedAt, "2026-07-12T00:00:00.000Z");
  assert.equal(store.deleteResearch("client-1", "question-1"), true);
  assert.throws(function() { store.getResearch("client-1", "question-1"); }, function(error) {
    return error.code === "RESEARCH_NOT_FOUND";
  });
});

it("rejects short or oversized answers and invalid collection methods", function() {
  ["short", " ".repeat(20)].forEach(function(answerText) {
    assert.throws(function() {
      store.saveResearch("client-1", Object.assign(valid("bad", answerText), { collectionMethod: "automatic" }));
    });
  });
  assert.throws(function() {
    store.saveResearch("client-1", Object.assign(valid("bad-method", "这是足够长的有效回答正文。"), { collectionMethod: "robot" }));
  }, function(error) { return error.code === "RESEARCH_INVALID_METHOD"; });
});
```

增加一条测试证明不存在的 research 删除返回 false，非法 ID 和 symlink/junction 逃逸仍被拒绝。

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test tests/research-store.test.js tests/legacy-migration.test.js`

Expected: FAIL，缺少 provenance 字段、`deleteResearch` 和新校验。

- [ ] **Step 3: 扩展 research schema 并保持旧数据兼容**

规范化输出固定为：

```js
{
  id,
  clientId,
  question,
  answerText,
  references,
  collectionMethod: "automatic" | "manual" | "legacy",
  collectedAt,
  updatedAt,
  isAnswerComplete: true
}
```

旧记录缺少字段时，读取层返回 `collectionMethod: "legacy"`，`collectedAt` 回退到 `createdAt`，`updatedAt` 回退到 collectedAt；不立即重写旧文件。保存新的 `automatic` 或 `manual` 记录时要求 answerText trim 后 10–200000 字符；`legacy` 记录允许 1–200000 字符，以兼容已有迁移数据。references 允许空数组，collectionMethod 只能为三种枚举。

新增：

```js
function deleteResearch(clientId, queryId) {
  const filename = recordPath(clientId, queryId);
  if (!fs.existsSync(filename)) return false;
  fs.unlinkSync(filename);
  return true;
}
```

返回对象中加入 `deleteResearch`。保持 legacy migration 测试继续通过。

- [ ] **Step 4: 运行定向与全套测试**

Run:

```powershell
node --test tests/research-store.test.js tests/legacy-migration.test.js
npm test
```

Expected: 全部 PASS；旧迁移 research 可读，新保存记录包含 provenance，失败保存不破坏旧文件。

- [ ] **Step 5: 提交 research 契约**

```powershell
git add src/content/research-store.js tests/research-store.test.js tests/legacy-migration.test.js
git commit -m "feat(content): track Doubao collection provenance"
```

---

### Task 3: 豆包页面纯解析器与脱敏 fixture

**Files:**

- Create: `src/content/doubao-page-parser.js`
- Create: `tests/doubao-page-parser.test.js`
- Create: `tests/fixtures/doubao/complete-answer.json`
- Create: `tests/fixtures/doubao/streaming-answer.json`
- Create: `tests/fixtures/doubao/multi-turn.json`
- Create: `tests/fixtures/doubao/login-required.json`
- Create: `tests/fixtures/doubao/challenge.json`

- [ ] **Step 1: 建立不依赖真实浏览器的失败测试**

fixture 统一使用以下脱敏结构，不保存完整 HTML：

```json
{
  "url": "https://www.doubao.com/chat/fixture",
  "inputAvailable": true,
  "generating": false,
  "challenge": false,
  "errorText": "",
  "messages": [
    { "role": "user", "text": "测试问题" },
    {
      "role": "assistant",
      "text": "这是用于自动化测试的完整回答正文。",
      "references": [{ "title": "公开资料", "url": "https://example.com/source", "snippet": "摘要" }]
    }
  ]
}
```

测试代码覆盖：

```js
const { classifyPage, selectAnswerForQuestion, isAnswerComplete } = require("../src/content/doubao-page-parser");

it("selects only the assistant answer following the requested question", function() {
  const result = selectAnswerForQuestion(fixture("multi-turn.json"), "目标问题");
  assert.equal(result.answerText, "目标回答正文至少十个字符。");
  assert.deepStrictEqual(result.references.map(function(item) { return item.url; }), ["https://example.com/target"]);
});

it("distinguishes login, challenge, streaming, and complete states", function() {
  assert.equal(classifyPage(fixture("login-required.json")).status, "login_required");
  assert.equal(classifyPage(fixture("challenge.json")).status, "challenge");
  assert.equal(isAnswerComplete(fixture("streaming-answer.json"), "测试问题"), false);
  assert.equal(isAnswerComplete(fixture("complete-answer.json"), "测试问题"), true);
});
```

- [ ] **Step 2: 运行测试确认模块缺失**

Run: `node --test tests/doubao-page-parser.test.js`

Expected: FAIL with `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现纯解析 API**

导出：

```js
module.exports = {
  classifyPage,
  selectAnswerForQuestion,
  isAnswerComplete,
  normalizeReferences
};
```

明确行为：

- `classifyPage(snapshot)` 返回 `authenticated | login_required | challenge | page_error`。
- `selectAnswerForQuestion` 从最后一个文本完全匹配目标问题的 user message 开始，只取其后第一个 assistant message。
- 没有匹配问题时抛 `DOUBAO_QUESTION_NOT_FOUND`；没有 assistant 节点抛 `DOUBAO_ANSWER_NOT_FOUND`。
- references 去重、过滤非 HTTP(S)，title 为空时使用 hostname，不扫描其他消息引用。
- `isAnswerComplete` 要求非 generating、无 challenge/error、回答 trim 后至少 10 字符。

- [ ] **Step 4: 运行解析测试和全套测试**

Run:

```powershell
node --test tests/doubao-page-parser.test.js
npm test
```

Expected: 全部 PASS；multi-turn fixture 不返回旧回答或旧引用。

- [ ] **Step 5: 提交解析器**

```powershell
git add src/content/doubao-page-parser.js tests/doubao-page-parser.test.js tests/fixtures/doubao
git commit -m "feat(content): parse scoped Doubao answers"
```

---

### Task 4: 独立豆包 Playwright 浏览器适配器

**Files:**

- Create: `src/content/doubao-browser-adapter.js`
- Modify: `src/core/playwright.js`
- Create: `tests/doubao-browser-adapter.test.js`
- Modify: `tests/runtime-diagnostics.test.js`

- [ ] **Step 1: 写注入式浏览器适配器失败测试**

用 fake runtime 避免测试启动真实浏览器：

```js
it("uses the dedicated doubao session and returns a scoped complete answer", async function() {
  const calls = [];
  const adapter = createDoubaoBrowserAdapter({
    session: { session: "doubao", profileDir: "profile", daemonDir: "daemon", stateFile: "state" },
    runtime: {
      open: async function(input) { calls.push(["open", input]); },
      evaluate: async function(input) {
        calls.push(["evaluate", input.action]);
        if (input.action === "send-question") return { ok: true };
        return completeFixture;
      },
      screenshot: async function() {}
    },
    sleep: async function() {},
    now: function() { return "2026-07-12T00:00:00.000Z"; }
  });
  const result = await adapter.collect("测试问题");
  assert.equal(calls[0][1].url, "https://www.doubao.com/chat/");
  assert.equal(result.answerText, "这是用于自动化测试的完整回答正文。");
  assert.equal(result.collectionMethod, "automatic");
});
```

另测：登录检测、120 秒超时、页面有回答但定位失败、challenge、诊断截图最多 20 个、传入问题使用 JSON 编码而不是字符串插入脚本。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/doubao-browser-adapter.test.js tests/runtime-diagnostics.test.js`

Expected: FAIL，缺少 adapter 和异步 Playwright runtime API。

- [ ] **Step 3: 为现有 Playwright 层增加可注入的异步命令**

在 `src/core/playwright.js` 保留现有同步 API，新增：

```js
function createPlaywrightRuntime(options) {
  return {
    open: open,
    evaluate: evaluate,
    screenshot: screenshot,
    close: close
  };
}
```

生产实现必须使用 `execFile`/参数数组或安全临时文件传参，不拼接用户问题到 shell 命令。`pwSessionConfig("doubao")` 继续提供独立 session、profile、daemon 和 state。

- [ ] **Step 4: 实现豆包 adapter 的稳定 action 契约**

`createDoubaoBrowserAdapter(options)` 暴露：

```js
{
  openLogin,
  getLoginState,
  collect,
  close
}
```

固定 action 为 `inspect-page`、`send-question`、`capture-diagnostic`；页面脚本先生成脱敏 snapshot，再交给 Task 3 的纯解析器。`collect` 每 2 秒检查一次，最多 120 秒；文本连续三次稳定且 parser 判定完成后返回。找不到所谓联网/深入研究按钮不构成任何 action。

诊断只写 `logs/doubao-diagnostics/<timestamp>-<code>.png` 和 `.json` 摘要；写入后按 mtime 删除第 21 个及更旧文件组。

- [ ] **Step 5: 运行定向测试、全套测试并提交**

Run:

```powershell
node --test tests/doubao-browser-adapter.test.js tests/runtime-diagnostics.test.js
npm test
```

Expected: 全部 PASS；测试进程不打开真实浏览器，不写 workspace 外路径。

Commit:

```powershell
git add src/content/doubao-browser-adapter.js src/core/playwright.js tests/doubao-browser-adapter.test.js tests/runtime-diagnostics.test.js
git commit -m "feat(content): add persistent Doubao browser adapter"
```

---

### Task 5: 单条采集、覆盖保护与人工保存服务

**Files:**

- Create: `src/content/doubao-collection-service.js`
- Create: `tests/doubao-collection-service.test.js`

- [ ] **Step 1: 写服务编排失败测试**

```js
it("collects an existing question and saves normalized research", async function() {
  const service = createDoubaoCollectionService({ questionStore, researchStore, browserAdapter, now });
  const saved = await service.collectOne({ clientId: "client-1", questionId: "question-1", force: false });
  assert.equal(saved.id, "question-1");
  assert.equal(saved.collectionMethod, "automatic");
  assert.equal(saved.answerText, "这是一个长度足够的自动采集回答。" );
});

it("does not replace a successful record when recollection fails", async function() {
  researchStore.saveResearch("client-1", oldRecord);
  browserAdapter.collect = async function() { throw coded("DOUBAO_TIMEOUT"); };
  await assert.rejects(service.collectOne({ clientId: "client-1", questionId: "question-1", force: true }));
  assert.equal(researchStore.getResearch("client-1", "question-1").answerText, oldRecord.answerText);
});

it("saves manual input through the same research store", function() {
  const saved = service.saveManual({ clientId: "client-1", questionId: "question-1", answerText: "这是人工修正后的完整回答。", references: [] });
  assert.equal(saved.collectionMethod, "manual");
});
```

另测 disabled 问题、已有结果且 force=false、客户/问题不匹配、非法 URL、短回答。

- [ ] **Step 2: 运行测试确认模块缺失**

Run: `node --test tests/doubao-collection-service.test.js`

Expected: FAIL with `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现 collection service**

导出：

```js
function createDoubaoCollectionService(deps) {
  return {
    getLoginState,
    openLogin,
    collectOne,
    saveManual,
    deleteQuestionAndResearch,
    close
  };
}
```

`collectOne` 顺序固定为：校验 ID → getQuestion → 校验 enabled/force → adapter.collect → 构造完整 record → researchStore.saveResearch。不得先清空或删除旧 research。`deleteQuestionAndResearch` 在删除前读取问题和可选 research 快照，先删除 research，再删除 question；若问题删除失败，立即用快照恢复 research 并抛原错误。任何删除或补偿失败都返回明确错误，不静默成功。

- [ ] **Step 4: 运行测试和全套回归**

Run:

```powershell
node --test tests/doubao-collection-service.test.js
npm test
```

Expected: 全部 PASS；失败重采后旧 answerText、references 和 collectedAt 完全不变。

- [ ] **Step 5: 提交采集服务**

```powershell
git add src/content/doubao-collection-service.js tests/doubao-collection-service.test.js
git commit -m "feat(content): orchestrate Doubao collection"
```

---

### Task 6: 串行批量队列与状态事件

**Files:**

- Create: `src/content/doubao-collection-queue.js`
- Create: `tests/doubao-collection-queue.test.js`

- [ ] **Step 1: 用可控时钟写状态机失败测试**

```js
it("runs tasks serially with a 15-30 second interval", async function() {
  const calls = [];
  const sleeps = [];
  const queue = createDoubaoCollectionQueue({
    collectOne: async function(task) { calls.push(task.questionId); return { answerText: "有效回答正文至少十个字符" }; },
    sleep: async function(ms) { sleeps.push(ms); },
    randomDelayMs: function() { return 15000; }
  });
  const result = await queue.start([
    { clientId: "client-1", questionId: "q1" },
    { clientId: "client-2", questionId: "q2" }
  ]);
  assert.deepStrictEqual(calls, ["q1", "q2"]);
  assert.deepStrictEqual(sleeps, [15000]);
  assert.deepStrictEqual(result.tasks.map(function(task) { return task.status; }), ["succeeded", "succeeded"]);
});
```

另测：500 条上限、双队列拒绝、waiting_login、当前任务结束后 pause、resume、stop 将未开始项置 cancelled、retryFailed 只加入 failed、每个任务唯一终态、unsubscribe 后不再接收事件。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/doubao-collection-queue.test.js`

Expected: FAIL with `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现显式队列状态机**

导出：

```js
function createDoubaoCollectionQueue(options) {
  return {
    start,
    pause,
    resume,
    stop,
    retryFailed,
    getState,
    subscribe,
    dispose
  };
}
```

`getState()` 返回可序列化快照：

```js
{
  status: "idle" | "running" | "paused" | "stopping" | "completed",
  currentTaskId: null,
  completed: 0,
  total: 0,
  waitRemainingMs: 0,
  tasks: [{ id, clientId, questionId, status, answerLength, referenceCount, error }]
}
```

默认 `randomDelayMs` 使用 `15000 + Math.floor(Math.random() * 15001)`。倒计时每秒发事件；测试注入 sleep/random。所有 error 只保留 code 和安全 message。

- [ ] **Step 4: 运行队列测试和全套测试**

Run:

```powershell
node --test tests/doubao-collection-queue.test.js
npm test
```

Expected: 全部 PASS；无并发 collectOne 调用，暂停/停止后无悬挂 timer。

- [ ] **Step 5: 提交队列**

```powershell
git add src/content/doubao-collection-queue.js tests/doubao-collection-queue.test.js
git commit -m "feat(content): add serial Doubao collection queue"
```

---

### Task 7: Electron 应用服务、IPC、事件与退出清理

**Files:**

- Create: `desktop/services/doubao-collection-service.js`
- Create: `desktop/ipc/doubao-collection-ipc.js`
- Modify: `desktop/ipc/register.js`
- Modify: `desktop/preload.js`
- Modify: `desktop/main.js`
- Create: `tests/doubao-collection-ipc.test.js`
- Create: `tests/doubao-desktop-lifecycle.test.js`
- Modify: `tests/electron-security.test.js`

- [ ] **Step 1: 写 IPC 表面和生命周期失败测试**

必须注册：

```js
[
  "content:list-questions",
  "content:create-question",
  "content:update-question",
  "content:delete-question",
  "content:get-doubao-login-state",
  "content:open-doubao-login",
  "content:collect-doubao-one",
  "content:start-doubao-batch",
  "content:pause-doubao-batch",
  "content:resume-doubao-batch",
  "content:stop-doubao-batch",
  "content:retry-failed-doubao",
  "content:get-doubao-queue-state",
  "content:save-manual-research"
]
```

测试事件频道 `content:doubao-queue-state`，并断言 `before-quit` 调用 service.dispose()。测试 `{ clientId: "../x" }`、绝对路径、501 个 tasks 和 renderer 提交 profilePath 均被拒绝。

- [ ] **Step 2: 运行 IPC 测试确认红色基线**

Run:

```powershell
node --test tests/doubao-collection-ipc.test.js tests/doubao-desktop-lifecycle.test.js tests/electron-security.test.js
```

Expected: FAIL，频道和服务尚未存在。

- [ ] **Step 3: 装配单例服务与事件转发**

`desktop/services/doubao-collection-service.js` 创建 questionStore、researchStore、`pwSessionConfig("doubao")`、browserAdapter、collectionService 和 queue，并返回：

```js
{
  listQuestions, createQuestion, updateQuestion, deleteQuestion,
  getLoginState, openLogin, collectOne, saveManual,
  startBatch, pauseBatch, resumeBatch, stopBatch, retryFailed,
  getQueueState, subscribe, dispose
}
```

`desktop/main.js` 在 runtime 配置完成后创建一次该服务，通过 `registerIpc` 注入；订阅队列后调用 `sendToRenderer("content:doubao-queue-state", state)`。`before-quit` 先 unsubscribe，再 `dispose()`。

- [ ] **Step 4: 实现薄 IPC 和 preload 退订 API**

所有 handler 走现有 `wrap`。preload 暴露命令，并提供：

```js
onDoubaoQueueState: function(listener) {
  const handler = function(event, payload) { listener(payload); };
  ipcRenderer.on("content:doubao-queue-state", handler);
  return function() { ipcRenderer.removeListener("content:doubao-queue-state", handler); };
}
```

IPC 不接受 path、profilePath、URL 或页面脚本字段；批量只接受 `{ tasks: [{ clientId, questionId, force }] }`。

- [ ] **Step 5: 运行 IPC、生命周期、全套测试并提交**

Run:

```powershell
node --test tests/doubao-collection-ipc.test.js tests/doubao-desktop-lifecycle.test.js tests/electron-security.test.js
npm test
```

Expected: 全部 PASS；错误封装不含 stack、Cookie、绝对 profile 路径。

Commit:

```powershell
git add desktop/services/doubao-collection-service.js desktop/ipc/doubao-collection-ipc.js desktop/ipc/register.js desktop/preload.js desktop/main.js tests/doubao-collection-ipc.test.js tests/doubao-desktop-lifecycle.test.js tests/electron-security.test.js
git commit -m "feat(desktop): expose Doubao collection workflow"
```

---

### Task 8: 多回答 Prompt、生成器与文章来源快照

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

- [ ] **Step 1: 写多来源失败测试**

生成输入统一为：

```js
{
  clientId: "client-1",
  researchQueryIds: ["question-1", "question-2"],
  platform: "ctrip",
  templateId: "template-1"
}
```

测试 Prompt 中每个问题、回答和引用独立分组；generator 按数组顺序读取 research；任一回答为空时 AI 不被调用；结果包含：

```js
researchQueryIds: ["question-1", "question-2"],
researchSnapshots: [
  { questionId: "question-1", question: "问题一", answerText: "回答一至少十个字符", references: [], collectedAt: "2026-07-12T00:00:00.000Z", collectionMethod: "automatic" },
  { questionId: "question-2", question: "问题二", answerText: "回答二至少十个字符", references: [], collectedAt: "2026-07-12T00:01:00.000Z", collectionMethod: "manual" }
]
```

另测旧输入 `researchQueryId` 和旧文章 JSON 仍可读取，并规范化为单元素数组；空数组、重复 ID、超过 50 条来源被拒绝。

- [ ] **Step 2: 运行内容生成测试确认失败**

Run:

```powershell
node --test tests/prompt-builder.test.js tests/article-generator.test.js tests/article-store.test.js tests/ai-content-service.test.js
```

Expected: FAIL，现有代码只接受单个 research。

- [ ] **Step 3: 改造 Prompt 和 generator**

`buildPrompt` 接受 `researchItems` 数组，并为每项输出：

```text
【豆包问题 1】
问题：{researchItems[0].question}
回答：{researchItems[0].answerText}
参考资料：{formatReferences(researchItems[0].references)}
```

`generateArticle` 先将 `researchQueryIds || [researchQueryId]` 规范化、去重并限制 1–50 条，再读取全部 research。构造 `researchSnapshots` 时深拷贝允许字段，不保存客户知识库全文或 API 配置。

- [ ] **Step 4: 扩展 article store 兼容层**

新文章要求 `researchQueryIds` 与 `researchSnapshots` 一一对应。读取旧文章时若只有 `researchQueryId`，返回 `researchQueryIds: [researchQueryId]`，并允许 snapshots 缺失；下一次保存旧文章时保持可读，不伪造历史回答。

- [ ] **Step 5: 运行定向、全套测试并提交**

Run:

```powershell
node --test tests/prompt-builder.test.js tests/article-generator.test.js tests/article-store.test.js tests/ai-content-service.test.js
npm test
```

Expected: 全部 PASS；多回答来源顺序稳定，旧文章加载回归继续通过。

Commit:

```powershell
git add src/content/prompt-builder.js src/content/article-generator.js src/content/article-store.js desktop/services/ai-content-service.js desktop/ipc/ai-content-ipc.js tests/prompt-builder.test.js tests/article-generator.test.js tests/article-store.test.js tests/ai-content-service.test.js
git commit -m "feat(content): generate articles from multiple research answers"
```

---

### Task 9: React API 类型与三标签页采集工作台

**Files:**

- Create: `media-workbench/src/components/content/QuestionCollectionView.tsx`
- Create: `media-workbench/src/components/content/ArticleGenerationView.tsx`
- Create: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Create: `media-workbench/src/components/content/CollectionTaskBar.tsx`
- Modify: `media-workbench/src/components/ContentWorkbench.tsx`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/index.css`
- Modify: `tests/content-workbench-regression.test.js`
- Create: `tests/doubao-content-workbench.test.js`

- [ ] **Step 1: 写 renderer 契约和结构失败测试**

回归测试要求源码包含三个标签 ID：`questions`、`generate`、`history`；要求 renderer API 暴露问题 CRUD、登录、单条采集、批量控制、人工保存、队列订阅；要求生成函数输入使用 `researchQueryIds: string[]`。

增加静态安全断言：React 文件不得包含 `fs`、`child_process`、`PLAYWRIGHT_CLI_JS`、`browser_data`、绝对路径拼接或 `ipcRenderer`。

- [ ] **Step 2: 运行测试和 TypeScript 检查确认失败**

Run:

```powershell
node --test tests/content-workbench-regression.test.js tests/doubao-content-workbench.test.js
npm --prefix media-workbench run lint
```

Expected: FAIL，缺少类型、API 和组件。

- [ ] **Step 3: 定义前端契约**

`media-workbench/src/types.ts` 增加：

```ts
export interface ContentQuestion { id: string; text: string; enabled: boolean; createdAt: string; updatedAt: string }
export type DoubaoLoginStatus = 'unknown' | 'login_required' | 'authenticated' | 'session_error';
export type DoubaoTaskStatus = 'pending' | 'waiting_login' | 'running' | 'waiting_interval' | 'paused' | 'succeeded' | 'failed' | 'cancelled';
export interface DoubaoQueueState { status: 'idle' | 'running' | 'paused' | 'stopping' | 'completed'; currentTaskId: string | null; completed: number; total: number; waitRemainingMs: number; tasks: DoubaoTask[] }
```

`ContentResearch` 增加 `collectionMethod`、`collectedAt`、`updatedAt`。`GeneratedContentArticle` 增加 `researchQueryIds` 和可选 `researchSnapshots`，保留旧 `researchQueryId?`。

- [ ] **Step 4: 实现 electron-api 安全封装**

每个函数调用 `window.desktopConsole.content` 后使用现有 `unwrap`/`getIpcError` 风格。队列订阅返回清理函数，组件 `useEffect` 必须 return unsubscribe。

- [ ] **Step 5: 拆分三标签页并实现问题与采集交互**

`ContentWorkbench.tsx` 只负责客户加载、当前标签和共享刷新，不继续承载所有业务 UI。

`QuestionCollectionView` 实现：

- 客户选择和批量客户勾选。
- 问题新增、编辑、启用/停用、删除确认。
- 单条采集、明确的重新采集、选中问题批量采集。
- 登录状态和“打开豆包登录”。
- 回答正文、引用、采集时间/方式预览。
- 手工编辑回答和 references 数组。
- 固定尺寸 `CollectionTaskBar`，按钮使用 lucide `Play/Pause/Square/RotateCcw/LogIn` 并带 title。

删除含 research 的问题时确认文案明确说明“删除当前回答，但不会修改已保存文章”。

- [ ] **Step 6: 实现多回答生成和历史文章标签**

`ArticleGenerationView` 使用 checkbox 选择一到多条有效 research，展示数量和回答总字符数，调用：

```ts
generateContentArticle({ clientId, researchQueryIds: selectedIds, platform, templateId })
```

保持标题/正文编辑、保存、导出预览和导出待投稿队列能力。`GeneratedArticlesView` 显示历史文章并将选中文章交给生成页编辑区，不复制保存逻辑。

- [ ] **Step 7: 运行 renderer 测试、lint、build 和全套测试**

Run:

```powershell
node --test tests/content-workbench-regression.test.js tests/doubao-content-workbench.test.js
npm --prefix media-workbench run lint
npm run build:renderer
npm test
```

Expected: 全部 exit 0；最长状态文案和按钮在 1180×760 与 1440×900 下不溢出，任务条状态变化不改变页面主布局尺寸。

- [ ] **Step 8: 提交 React 工作台**

```powershell
git add media-workbench/src/components/ContentWorkbench.tsx media-workbench/src/components/content media-workbench/src/electron-api.ts media-workbench/src/types.ts media-workbench/src/index.css tests/content-workbench-regression.test.js tests/doubao-content-workbench.test.js
git commit -m "feat(renderer): add Doubao collection workbench"
```

---

### Task 10: 打包私密数据边界、操作文档与真实冒烟脚本

**Files:**

- Modify: `electron-builder.alpha.yml`
- Modify: `scripts/verify-alpha-package.js`
- Modify: `tests/desktop-packaging.test.js`
- Create: `docs/doubao-collection-operations.md`
- Modify: `docs/content-workspace-contract.md`

- [ ] **Step 1: 写打包边界失败测试**

测试要求 builder 显式排除：

```text
!browser/**
!research/**
!clients/**
!generated/**
!logs/**
!tests/fixtures/**
```

扩展 `verify-alpha-package.js`，若 unpacked app 中出现 `.env`、`questions.json`、`research/*.json`、`browser/doubao`、`doubao-diagnostics` 或 `tests/fixtures` 则 exit 1。

- [ ] **Step 2: 运行打包测试确认新边界尚未完整声明**

Run: `node --test tests/desktop-packaging.test.js`

Expected: FAIL，配置尚未显式覆盖所有豆包私密目录。

- [ ] **Step 3: 更新打包配置和 workspace 文档**

在 `electron-builder.alpha.yml` 私密数据区加入上述排除项；不得排除 `src/content/doubao-*.js` 或 renderer 生产构建。

`docs/content-workspace-contract.md` 增加 questions、research provenance、browser profile、诊断保留和多回答 article metadata。

`docs/doubao-collection-operations.md` 写明：首次登录、单条采集、批量采集、暂停/继续/停止、失败重试、人工修正、重新采集覆盖规则、诊断位置、备份目录和退出行为。文档不得出现真实账号、Key 或客户名称。

- [ ] **Step 4: 添加真实冒烟检查清单**

文档中的发布前清单必须逐项记录 PASS/FAIL：

```text
[ ] 三个测试问题可创建并在重启后保留
[ ] 扫码登录成功且重启后复用
[ ] 单条回答与页面一致且非零字
[ ] 批量任务串行并等待 15–30 秒
[ ] 暂停、继续、停止、重试失败符合状态机
[ ] 成功重采覆盖，失败重采保留旧结果
[ ] 人工回答和参考 URL 可保存
[ ] 两条回答可生成、保存和导出文章
[ ] 应用退出后无残留采集任务
[ ] 包内无 workspace 私密数据
```

- [ ] **Step 5: 运行全套自动验证和 alpha 打包**

Run:

```powershell
npm run verify
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources/app
```

如果 portable 构建不产出 `win-unpacked`，改为对 electron-builder 实际生成的 unpacked app 目录运行 verifier；不得跳过 verifier。

Expected: 全部 exit 0；alpha 包包含豆包采集代码和 React UI，不包含 workspace 数据、登录 profile、诊断数据或 fixture。

- [ ] **Step 6: 提交打包与文档**

```powershell
git add electron-builder.alpha.yml scripts/verify-alpha-package.js tests/desktop-packaging.test.js docs/doubao-collection-operations.md docs/content-workspace-contract.md
git commit -m "docs(content): document and package Doubao collection"
```

---

### Task 11: 真实豆包验收与发布候选检查

**Files:**

- Modify only if a verified defect is found: `src/content/doubao-page-parser.js`
- Modify only if a verified defect is found: `src/content/doubao-browser-adapter.js`
- Modify only if a verified defect is found: `tests/fixtures/doubao/*.json`
- Modify: `docs/doubao-collection-operations.md`

- [ ] **Step 1: 使用独立测试客户执行首次登录**

Run: `npm run desktop`

操作：进入“AI内容生成 → 问题与采集”，点击“打开豆包登录”，完成扫码；关闭并重新打开应用。

Expected: 状态从 `login_required` 变为 `authenticated`，重启后仍为 authenticated；其他投稿平台浏览器 session 不受影响。

- [ ] **Step 2: 验证单条和批量采集**

创建三个不含真实客户隐私的测试问题。先单条采集第一个，再批量采集其余两个。

Expected: 每条回答与页面当前回答一致且至少 10 字符；批量严格串行，任务之间倒计时位于 15–30 秒；存在引用时只包含当前回答引用。

- [ ] **Step 3: 验证控制与失败路径**

在批量过程中依次验证暂停/继续；另一次批量执行停止；制造一个无效页面或临时离线失败并执行“重试失败”。

Expected: 当前任务安全完成后暂停；停止后未开始项为 cancelled；重试不重新执行 succeeded；不存在空 research。

- [ ] **Step 4: 验证覆盖和人工兜底**

记录旧回答时间和正文，执行重新采集；随后制造一次失败重采。打开人工编辑，保存一条回答和一个 HTTPS 引用。

Expected: 成功重采更新时间并覆盖；失败重采不改旧记录；人工结果标记 manual，非法 URL 被拒绝。

- [ ] **Step 5: 验证多回答生成闭环**

勾选两条有效回答，选择平台和模板，生成、编辑、保存并导出到一个待投稿队列。

Expected: Prompt 调用成功；文章 metadata 有两个 question ID 和两个快照；删除或重采问题不改已保存文章；导出仍需投稿工作台人工确认。

- [ ] **Step 6: 将真实页面差异转为脱敏 fixture 并回归**

若真实页面失败，先根据诊断摘要确定根因。只保留 role、text、generating、reference 等必要字段生成脱敏 fixture，先写失败测试，再修改 parser/adapter。不得把真实截图、HTML、账号或问题提交 Git。

Run:

```powershell
node --test tests/doubao-page-parser.test.js tests/doubao-browser-adapter.test.js
npm run verify
```

Expected: 修复前新增测试 FAIL，修复后 PASS，完整 verify exit 0。

- [ ] **Step 7: 记录验收结果并提交必要修复**

在 `docs/doubao-collection-operations.md` 的发布清单标记实际结果和测试日期，不写账号或客户信息。

```powershell
git add src/content/doubao-page-parser.js src/content/doubao-browser-adapter.js tests/fixtures/doubao docs/doubao-collection-operations.md
git commit -m "test(content): verify live Doubao collection"
```

若没有代码或 fixture 变化，只提交文档验收记录；不得创建空提交。

---

## 最终通过标准

- [ ] `npm test` 全部通过，无新增非预期 skip。
- [ ] `npm --prefix media-workbench run lint` 通过。
- [ ] `npm run build:renderer` 通过。
- [ ] `npm run verify` 通过。
- [ ] `npm run pack:alpha` 通过，包内容 verifier 通过。
- [ ] 单条采集、批量采集、重新采集和人工录入均写入同一 research store。
- [ ] 页面存在完整回答时不会保存零字；失败时不覆盖旧成功结果。
- [ ] 批量严格串行，15–30 秒等待、暂停、继续、停止和失败重试符合状态机。
- [ ] 一个客户可维护多个问题，不同客户允许相同问题。
- [ ] 一篇文章可选择多条回答，并保留每条来源快照。
- [ ] 旧单问题 research、旧生成文章、原投稿流程和导出流程保持兼容。
- [ ] Renderer 不接触文件系统、Playwright、Cookie 或任意路径。
- [ ] alpha 包不包含 `.env`、客户资料、research、登录 profile、真实诊断数据或测试 fixture。
