# 豆包采集运行时 Bug 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复豆包登录状态无法恢复、采集依赖手动预先打开豆包页面、回答完成后一直超时且桌面端无明确状态反馈的问题。

**Architecture:** 将“确保豆包 Playwright 会话可用”收敛为浏览器适配器的单一入口，状态查询和采集都通过同一个可重入、可重试的会话启动流程。使用当前豆包真实 DOM 的脱敏结构 fixture 修正消息角色和完成状态解析，并让单条采集也进入现有队列，从而复用统一状态事件、错误展示和完成刷新。

**Tech Stack:** CommonJS Node.js、Playwright CLI、Electron IPC、React 19、TypeScript、Node test runner、Vite。

---

## 修复范围

本计划只允许修改源码和测试：

```text
src/**
desktop/**
media-workbench/src/**
tests/**
```

本计划明确禁止修改或执行以下内容：

```text
electron-builder.alpha.yml
scripts/verify-alpha-package.js
release-alpha/**
任何 portable、NSIS、win-unpacked 或安装包文件
```

允许执行 `npm test`、renderer lint 和 renderer build；不执行 `npm run pack:alpha` 或 `npm run dist:alpha`。

当前分支存在大量已完成但尚未提交的豆包功能改动。执行修复前必须先将“已完成功能基线”与“本修复”区分清楚：不得 reset、checkout、stash 或覆盖用户现有改动；每次提交只暂存本任务明确列出的源码和测试文件。若这些文件中的既有改动尚未形成可追溯基线，应先由主线程记录当前 diff，再使用 `git diff -- <file>` 核对修复增量。

## 已确认根因

### 1. 登录状态查询依赖已经运行的 daemon

`src/content/doubao-browser-adapter.js` 的 `getLoginState()` 直接调用 `runtime.evaluate()`，没有先启动或恢复 `doubao` 会话。应用退出时 `dispose()` 会关闭 Playwright daemon；重新打开应用后，持久 profile 仍存在，但 daemon 不存在。

已使用隔离诊断 session 稳定复现：

```text
PLAYWRIGHT_EXEC_FAILED
The browser 'diagnostic-no-daemon' is not open, please run open first
```

因此“刷新登录状态”只会再次 evaluate 一个不存在的会话，renderer 捕获错误后保留初始 `unknown`。

### 2. 状态查询、打开登录和采集没有共享会话恢复机制

当前 `openLogin()` 会先 open，而 `getLoginState()` 不会；`collect()` 又独立执行一套 open。三条入口没有串行化 `openPromise`，也没有对“daemon 不存在、daemon 尚未 ready、用户手动关闭受控页面”做一次性恢复。于是手动点击“打开豆包”实际上承担了隐式初始化 daemon 的职责。

### 3. 当前豆包 DOM 没有显式 role，消息被全部丢弃

最新真实失败诊断：

```json
{
  "code": "DOUBAO_TIMEOUT",
  "status": "authenticated",
  "messageCount": 0
}
```

对应截图中回答已经完整生成。只读 DOM 探测确认：

- 用户消息节点有 `data-message-id`，class 包含 `justify-end`，文本是问题。
- 回答节点有 `data-message-id`，不含 `justify-end`，文本约 927 字。
- 两个节点都没有 `data-role`、`data-message-role` 或可用 `aria-label`。

现有提取器只在显式 role 包含 user/assistant 时保留节点，因此两个真实消息都被过滤，完成判定永远找不到问题和回答。

### 4. 单条采集绕过队列，界面缺少运行和失败反馈

`content:collect-doubao-one` 直接调用 source collection service，不进入 queue。React 只 await 这个 Promise，没有 collecting 状态；底部任务条也只显示批量队列。批量完成后没有统一刷新 research，任务条不显示失败 code/message。用户因此只能看到浏览器停在完整回答页面，桌面端没有“正在解析、成功、失败或超时”的明确变化。

---

### Task 1: 修复 Playwright 会话缺失错误与自动恢复

**Files:**

- Modify: `src/core/playwright.js`
- Modify: `src/content/doubao-browser-adapter.js`
- Modify: `tests/runtime-diagnostics.test.js`
- Modify: `tests/doubao-browser-adapter.test.js`

- [ ] **Step 1: 为“daemon 不存在”写失败测试**

在 `tests/runtime-diagnostics.test.js` 增加：

```js
it("maps a missing Playwright session to a distinct recoverable error", async function() {
  const sourceError = Object.assign(new Error("command failed"), {
    code: 1,
    stdout: "The browser 'doubao' is not open, please run open first\n",
    stderr: ""
  });
  const runtime = createPlaywrightRuntime({
    session: pwSessionConfig("doubao"),
    execFile: function(file, args, options, callback) {
      callback(sourceError, sourceError.stdout, sourceError.stderr);
    }
  });

  await assert.rejects(runtime.evaluate({ script: "return true;" }), function(error) {
    assert.equal(error.code, "PLAYWRIGHT_SESSION_NOT_OPEN");
    assert.equal(error.message, "Playwright session is not open");
    return true;
  });
});
```

在 `tests/doubao-browser-adapter.test.js` 增加两个测试：

```js
function coded(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function recoveringRuntime(onOpen) {
  let opened = false;
  return {
    open: async function() { onOpen(); opened = true; },
    evaluate: async function() {
      if (!opened) throw coded("PLAYWRIGHT_SESSION_NOT_OPEN");
      return {
        inputAvailable: true,
        loginRequired: false,
        generating: false,
        challenge: false,
        errorText: "",
        messages: []
      };
    },
    screenshot: async function() {},
    close: async function() {}
  };
}

it("starts the persistent session before checking login after an app restart", async function() {
  const calls = [];
  let opened = false;
  const adapter = createDoubaoBrowserAdapter({
    runtime: {
      open: async function() { calls.push("open"); opened = true; },
      evaluate: async function() {
        calls.push("evaluate");
        if (!opened) throw coded("PLAYWRIGHT_SESSION_NOT_OPEN");
        return completeFixture;
      },
      screenshot: async function() {},
      close: async function() {}
    }
  });

  assert.deepEqual(await adapter.getLoginState(), { status: "authenticated" });
  assert.deepEqual(calls, ["open", "evaluate"]);
});

it("serializes concurrent status and collection session startup", async function() {
  let openCount = 0;
  const adapter = createDoubaoBrowserAdapter({ runtime: recoveringRuntime(function() { openCount += 1; }) });
  await Promise.all([adapter.getLoginState(), adapter.getLoginState()]);
  assert.equal(openCount, 1);
});
```

- [ ] **Step 2: 运行测试确认根因被自动化复现**

Run:

```powershell
node --test tests/runtime-diagnostics.test.js tests/doubao-browser-adapter.test.js
```

Expected: FAIL；runtime 仍返回 `PLAYWRIGHT_EXEC_FAILED`，`getLoginState()` 仍先 evaluate。

- [ ] **Step 3: 给 runtime 增加可恢复的 session 错误分类**

在 `mapRuntimeError` 中只根据 Playwright CLI 的 stdout/stderr 判定已知缺失 session：

```js
function isSessionNotOpenError(error) {
  const output = String(error && error.stdout || "") + "\n" + String(error && error.stderr || "");
  return /browser ['"][^'"]+['"] is not open|please run open first/i.test(output);
}
```

命中时返回：

```js
mapped.code = "PLAYWRIGHT_SESSION_NOT_OPEN";
mapped.message = "Playwright session is not open";
```

保留原有 `PLAYWRIGHT_TIMEOUT` 和其他 `PLAYWRIGHT_EXEC_FAILED` 行为。stdout/stderr 只用于主进程恢复判断，不通过 IPC 暴露。

- [ ] **Step 4: 在 adapter 中实现唯一的 ensureSession**

新增 adapter 私有状态：

```js
let sessionReady = false;
let openingPromise = null;
```

新增函数契约：

```js
async function ensureSession() {
  if (sessionReady) return;
  if (!openingPromise) {
    openingPromise = openPage()
      .then(function() { sessionReady = true; })
      .finally(function() { openingPromise = null; });
  }
  await openingPromise;
}
```

`inspect()` 先调用 ensureSession。若 evaluate 返回 `PLAYWRIGHT_SESSION_NOT_OPEN`，将 `sessionReady=false`，重新 ensureSession 并只重试一次 evaluate。第二次失败直接抛出，不无限重启。

`openLogin()`、`getLoginState()` 和 `collect()` 都调用相同 ensureSession；`collect()` 删除独立重复的 raw runtime.open 代码。`close()` 在 finally 中设置 `sessionReady=false`。

这样重新打开 AutoPublish 后，进入“问题与采集”或点击刷新会自动启动受控豆包页并使用持久 profile 检查登录；采集不再要求用户先点“打开豆包”。浏览器仍会可见，这是网页自动化的必要运行窗口，但由软件自动管理。

- [ ] **Step 5: 增加用户手动关闭页面后的单次恢复测试**

fake runtime 第一次 evaluate 返回 `PLAYWRIGHT_SESSION_NOT_OPEN`，第二次 open 后返回 authenticated。断言总共两次 open、两次 evaluate，最终成功；第三次连续失败时断言直接返回稳定错误，不继续循环。

- [ ] **Step 6: 运行定向测试与全套测试**

Run:

```powershell
node --test tests/runtime-diagnostics.test.js tests/doubao-browser-adapter.test.js
npm test
```

Expected: 全部 PASS；无测试启动真实浏览器。

- [ ] **Step 7: 提交会话恢复修复**

```powershell
git add src/core/playwright.js src/content/doubao-browser-adapter.js tests/runtime-diagnostics.test.js tests/doubao-browser-adapter.test.js
git commit -m "fix(content): recover the Doubao browser session"
```

---

### Task 2: 按当前豆包 DOM 提取问题、回答与完成状态

**Files:**

- Modify: `src/content/doubao-page-parser.js`
- Modify: `src/content/doubao-browser-adapter.js`
- Create: `tests/fixtures/doubao/current-message-structure.json`
- Modify: `tests/doubao-page-parser.test.js`
- Modify: `tests/doubao-browser-adapter.test.js`

- [ ] **Step 1: 将真实 DOM 特征写成脱敏 fixture**

`tests/fixtures/doubao/current-message-structure.json` 只保存必要结构：

```json
{
  "url": "https://www.doubao.com/chat/fixture",
  "inputAvailable": true,
  "loginRequired": false,
  "generating": false,
  "challenge": false,
  "errorText": "",
  "messageCandidates": [
    {
      "messageId": "user-message-id",
      "className": "flex-row flex w-full justify-end",
      "ancestorClassNames": ["v_list_row", "w-full"],
      "text": "测试问题",
      "references": []
    },
    {
      "messageId": "assistant-message-id",
      "className": "relative grid w-full grid-cols-[minmax(0,1fr)_auto]",
      "ancestorClassNames": ["v_list_row", "w-full"],
      "text": "这是当前豆包页面结构下的完整测试回答正文。",
      "references": []
    }
  ]
}
```

不得保存真实客户问题、真实回答、账号、截图或完整 HTML。

- [ ] **Step 2: 写当前 DOM 的失败解析测试**

在 `tests/doubao-page-parser.test.js` 增加：

```js
it("infers current Doubao message roles without explicit role attributes", function() {
  const snapshot = normalizePageSnapshot(fixture("current-message-structure.json"));
  assert.deepEqual(snapshot.messages.map(function(item) { return item.role; }), ["user", "assistant"]);
  assert.equal(selectAnswerForQuestion(snapshot, "测试问题").answerText, "这是当前豆包页面结构下的完整测试回答正文。");
  assert.equal(isAnswerComplete(snapshot, "测试问题"), true);
});
```

另加失败测试：带 `justify-end` 的候选是 user；同一虚拟列表中不带 `justify-end` 且位于 user 之后的 `data-message-id` 候选是 assistant；没有 messageId 的装饰节点被丢弃；旧 fixture 的显式 role 继续优先。

- [ ] **Step 3: 运行测试确认旧解析器无法处理 messageCandidates**

Run:

```powershell
node --test tests/doubao-page-parser.test.js tests/doubao-browser-adapter.test.js
```

Expected: FAIL；`normalizePageSnapshot` 尚不存在，真实结构无法产生 messages。

- [ ] **Step 4: 实现纯 snapshot 规范化**

`doubao-page-parser.js` 新增并导出：

```js
function normalizePageSnapshot(rawSnapshot) {
  const snapshot = Object.assign({}, rawSnapshot);
  snapshot.messages = normalizeMessageCandidates(rawSnapshot && rawSnapshot.messageCandidates, rawSnapshot && rawSnapshot.messages);
  return snapshot;
}
```

角色优先级固定为：

1. 明确 `role=user/assistant`。
2. candidate 自身或祖先 class token 包含独立的 `justify-end`，判定 user。
3. 有 messageId、非 user、文本非空，判定 assistant。

只使用 class token，不依赖 `content-KTJ1Rj`、`message-list-zLoNs1` 等 hash 后缀。问题和回答文本从各自 `data-message-id` 节点读取，不使用整个 `.message-list-*`，避免混入历史对话和工具栏。

- [ ] **Step 5: 修改页面脚本返回候选节点与可见生成控件**

`inspectPageScript()` 返回 `messageCandidates`，每项包含 messageId、className、最多八层 ancestorClassNames、text 和当前消息作用域 references。Node 侧 `inspect()` 对 runtime 返回值调用 `normalizePageSnapshot()`。

生成中判定改为检查可见的 `button,[role=button]` 控件文本或 aria-label 是否包含“停止生成”“停止回答”或英文 stop generating；正文中的普通词语不影响 generating。回答完成后没有停止控件，且文本连续三个轮询周期稳定，才允许成功。

- [ ] **Step 6: 保持引用提取不阻塞正文保存**

引用继续限定在当前 assistant 所在 `.v_list_row` 或其关联资料面板。无法展开或没有引用时返回空数组，不得因为引用为零让完整正文超时。不得退化为扫描全页所有链接。

- [ ] **Step 7: 运行定向和全套测试**

Run:

```powershell
node --test tests/doubao-page-parser.test.js tests/doubao-browser-adapter.test.js
npm test
```

Expected: 全部 PASS；current fixture 返回 2 条消息，旧 multi-turn fixture 仍只选择目标问题后的回答。

- [ ] **Step 8: 提交页面解析修复**

```powershell
git add src/content/doubao-page-parser.js src/content/doubao-browser-adapter.js tests/fixtures/doubao/current-message-structure.json tests/doubao-page-parser.test.js tests/doubao-browser-adapter.test.js
git commit -m "fix(content): parse current Doubao message structure"
```

---

### Task 3: 统一单条与批量状态，并在完成后刷新回答

**Files:**

- Modify: `src/content/doubao-collection-queue.js`
- Modify: `desktop/services/doubao-collection-service.js`
- Modify: `media-workbench/src/components/content/QuestionCollectionView.tsx`
- Modify: `media-workbench/src/components/content/CollectionTaskBar.tsx`
- Modify: `media-workbench/src/types.ts`
- Modify: `tests/doubao-collection-queue.test.js`
- Modify: `tests/doubao-collection-ipc.test.js`
- Modify: `tests/doubao-content-workbench.test.js`

- [ ] **Step 1: 写连续运行和单条队列失败测试**

在 queue 测试中增加：

```js
it("starts a fresh run after a previous run completed", async function() {
  const queue = createDoubaoCollectionQueue({
    collectOne: async function(input) {
      return { answerText: "问题 " + input.questionId + " 的有效回答正文", references: [] };
    },
    sleep: async function() {}
  });
  await queue.start([{ clientId: "client-1", questionId: "q1" }]);
  const second = await queue.start([{ clientId: "client-1", questionId: "q2" }]);
  assert.equal(second.total, 1);
  assert.equal(second.tasks[0].questionId, "q2");
  assert.equal(second.tasks[0].status, "succeeded");
});
```

desktop service 测试增加：单条 `collectOne(input)` 调用 queue.start([input])，队列事件依次包含 running/task_started/succeeded/completed，并返回 researchStore 中保存的当前记录；失败任务把稳定 error code/message 返回给 IPC。

- [ ] **Step 2: 写 renderer 状态与刷新失败测试**

静态/组件契约要求：

- 点击单条采集后立即进入 queue running 状态，不能绕过队列。
- 单条和批量 Promise 完成后都调用 `loadQuestions()` 与 `onRefresh()`。
- `CollectionTaskBar` 显示 `running/paused/stopping/completed` 中文状态、当前问题、等待秒数，以及最近 failed task 的安全 message。
- 自动采集期间单条、重采和批量开始按钮 disabled，防止双提交。
- login 查询失败时显示 `session_error`，不能继续保留 `unknown`。

- [ ] **Step 3: 运行测试确认现有状态链路缺失**

Run:

```powershell
node --test tests/doubao-collection-queue.test.js tests/doubao-collection-ipc.test.js tests/doubao-content-workbench.test.js
```

Expected: FAIL；completed queue 不能再次 start，单条采集绕过 queue，任务条不显示失败。

- [ ] **Step 4: 允许 completed queue 开始全新任务**

`queue.start()` 在 status 为 completed 时先清空旧 tasks、completed、total、currentTaskId、waitRemainingMs 和控制标志，再创建新 run。active、paused 或 stopping 时仍返回 `DOUBAO_QUEUE_ACTIVE`。`retryFailed()` 语义不变：用户明确点击重试时只追加上一次 failed 项。

- [ ] **Step 5: 让 desktop service 的单条采集走同一个 queue**

保留 source `collectionService.collectOne` 作为 queue 内部 worker。desktop public `collectOne(input)` 改为：

```js
async function collectOne(input) {
  const state = await queue.start([input]);
  const task = state.tasks[0];
  if (!task || task.status !== "succeeded") throw taskError(task);
  return researchStore.getResearch(input.clientId, input.questionId);
}

function taskError(task) {
  const error = new Error(task && task.error && task.error.message || "Doubao collection failed");
  error.code = task && task.error && task.error.code || "DOUBAO_COLLECTION_FAILED";
  return error;
}
```

`taskError` 只复制任务 error 的 code/message。这样现有 IPC 频道不变，但单条采集会产生与批量一致的事件。

- [ ] **Step 6: 拆开问题数据加载和登录状态加载**

React 不再把 questions、research 和 login 放在同一个 Promise.all。问题/research 加载成功时必须更新列表；登录检测单独执行：

```ts
setLogin({ status: 'checking' });
getDoubaoLoginStatus()
  .then(setLogin)
  .catch((value) => setLogin({ status: 'session_error', errorText: readableError(value) }));
```

在 `DoubaoLoginStatus` 增加 `checking`，界面显示“检测中”。点击刷新执行同一函数；成功后显示 authenticated/login_required，失败显示 session_error 及可读原因，不再停留 unknown。

- [ ] **Step 7: 完成后刷新并显示队列错误**

单条、重采和批量函数都在成功或任务完成后执行 `await loadQuestions(); onRefresh();`。订阅 queue event 时，当状态从 active 进入 completed 也触发一次去重刷新，避免 IPC Promise 回调和事件顺序竞态。

`CollectionTaskBar` 固定 56px 高度，展示：

```text
正在采集 1/3 · 当前：广州网布网纱公司推荐
等待 18 秒
采集失败：DOUBAO_TIMEOUT · 豆包回答提取超时
采集完成 3/3
```

错误区只使用 queue 已脱敏的 code/message。

- [ ] **Step 8: 运行 source、renderer 和全套测试**

Run:

```powershell
node --test tests/doubao-collection-queue.test.js tests/doubao-collection-ipc.test.js tests/doubao-content-workbench.test.js
npm --prefix media-workbench run lint
npm run build:renderer
npm test
```

Expected: 全部 exit 0；不执行任何打包命令。

- [ ] **Step 9: 提交状态链路修复**

```powershell
git add src/content/doubao-collection-queue.js desktop/services/doubao-collection-service.js media-workbench/src/components/content/QuestionCollectionView.tsx media-workbench/src/components/content/CollectionTaskBar.tsx media-workbench/src/types.ts tests/doubao-collection-queue.test.js tests/doubao-collection-ipc.test.js tests/doubao-content-workbench.test.js
git commit -m "fix(content): surface Doubao collection progress"
```

---

### Task 4: 源码级真实回归验收

**Files:**

- Modify only when a reproduced selector defect requires it: `src/content/doubao-page-parser.js`
- Modify only when a reproduced lifecycle defect requires it: `src/content/doubao-browser-adapter.js`
- Modify only with脱敏数据: `tests/fixtures/doubao/current-message-structure.json`
- Modify corresponding tests: `tests/doubao-page-parser.test.js`
- Modify corresponding tests: `tests/doubao-browser-adapter.test.js`

- [ ] **Step 1: 验证重启后的登录状态恢复**

Run: `npm run desktop`

操作：确认豆包已经登录，关闭 AutoPublish，等待受控豆包窗口关闭，再重新启动并进入“问题与采集”。

Expected:

- 状态先显示“检测中”。
- 软件自动启动自己的豆包受控页面。
- 使用持久 profile 检测后显示“已登录”，不需要点击“打开豆包”。
- 点击刷新可重复得到“已登录”，不显示 unknown。

- [ ] **Step 2: 验证无需手动预热即可单条采集**

关闭受控豆包页面后直接在桌面端点击一条问题的“采集”。

Expected: 软件自动重建 session，只打开一个受控豆包会话，任务条立即显示 running；不得出现泛化的 `Playwright command failed`。

- [ ] **Step 3: 验证完整回答被识别和保存**

使用一条无敏感信息的测试问题，等待豆包回答完成。

Expected:

- 完整回答稳定约 6 秒后采集成功，不等待到 120 秒。
- queue 状态进入 succeeded/completed。
- research 立即刷新，正文与当前豆包回答一致且非零字。
- 引用为零时仍成功；存在引用时只保存当前回答的引用。

- [ ] **Step 4: 验证失败反馈和连续采集**

制造一次页面关闭或临时网络失败，再执行第二次正常单条采集和一次批量采集。

Expected:

- 第一次失败在任务条显示稳定 code/message。
- 第二次 start 不被旧 completed 状态阻止。
- 批量继续严格串行，任务完成后列表自动刷新。

- [ ] **Step 5: 将任何新页面差异先转为失败 fixture**

若真实页面仍失败，只读取诊断摘要和 DOM 必要属性，创建不含真实文本、账号、Cookie 或完整 HTML 的 fixture。先运行测试确认 FAIL，再修改 parser/adapter，禁止直接在真实页面上猜选择器。

- [ ] **Step 6: 执行最终源码验证**

Run:

```powershell
npm test
npm --prefix media-workbench run lint
npm run build:renderer
```

Expected:

- `npm test` 在当前基线至少保持 290 pass、0 fail；新增测试全部通过。
- renderer lint 和 build exit 0。
- 不运行 pack/dist，不修改任何打包配置或安装包。

- [ ] **Step 7: 仅在有源码修复时提交真实回归增量**

```powershell
git add src/content/doubao-page-parser.js src/content/doubao-browser-adapter.js tests/fixtures/doubao/current-message-structure.json tests/doubao-page-parser.test.js tests/doubao-browser-adapter.test.js
git commit -m "test(content): verify live Doubao collection recovery"
```

若真实验收未产生代码或 fixture 变化，不创建空提交。

---

## 最终通过标准

- [ ] AutoPublish 重启后登录状态从 checking 自动变为 authenticated 或 login_required，不长期停留 unknown。
- [ ] 点击刷新无需预先点击“打开豆包”，失败时显示 session_error 和安全原因。
- [ ] 单条和批量采集都会自动确保豆包受控会话可用。
- [ ] 用户手动关闭豆包页面后，下一次操作只自动恢复一次，不无限重启。
- [ ] 当前真实 DOM 的用户问题和豆包回答都被识别，诊断 `messageCount` 不再为 0。
- [ ] 豆包完整回答后约三个轮询周期内完成提取，不无故等待 120 秒。
- [ ] 单条采集也显示 running、成功或失败状态。
- [ ] 完成后桌面端立即刷新回答；失败时显示稳定 code/message。
- [ ] 已完成队列不阻止下一次单条或批量采集。
- [ ] 失败重采仍不覆盖已有成功 research。
- [ ] `npm test`、renderer lint 和 renderer build 全部通过。
- [ ] 修复 diff 不包含打包配置、打包脚本、release-alpha 或安装包文件。
