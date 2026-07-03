# Alpha Package and React Workbench Full Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复新 React UI 的完整业务能力，并修正 alpha 安装包的运行时路径设计，确保其他平台投稿、余额刷新、媒体库拉取、文章读取和安装包启动同时可用。

**Architecture:** 先把 `ui` 分支中已验证的业务功能恢复到当前打包分支，再把打包 runtime 从“单一 root”改成“应用代码目录 appRoot + 用户工作区 workspaceRoot”双根模型。React 只通过 `electron-api.ts` 调用真实 IPC；Electron IPC/services 全部通过显式 workspace paths 读写 `input/`, `data/`, `logs/`, `work/`，不再混用源码目录、安装目录和 userData 目录。

**Tech Stack:** Electron 33, React 19, TypeScript, Vite 6, electron-builder, Node.js CommonJS, `node:test`, Windows alpha installer/portable package.

---

## Current Failure Summary

User-visible regressions after the startup packaging fix:

- 其他媒体投稿入口消失。
- 金额不能正常刷新。
- 媒体库不能拉取。
- 文章不能正确读取。
- 安装包修复后不应再出现主进程缺模块错误，但业务功能被路径和分支状态破坏。

Observed code state:

- `master` contains packaging commits:
  - `2afaf4b chore: add alpha desktop packaging`
  - `ac562f3 fix: repair alpha package startup`
- Complete React/platform work exists on `ui` branch, especially:
  - `0befd68 feat: 其他平台投稿接入 React 工作台`
  - `878c9c8 fix: 平台投稿Worker化防卡死 + 暂停/取消 + 资源库全量拉取 + 发布按钮 + 订单刷新与状态码修正`
- Current `master` React files have regressed:
  - `media-workbench/src/App.tsx` contains mock article creation and local persistence helpers.
  - `media-workbench/src/components/Sidebar.tsx` has no `platforms` nav item.
  - `media-workbench/src/components/PlatformWorkbench.tsx` is absent.
  - `media-workbench/src/electron-api.ts` imports `mockData`, has wrong balance data shape, and lacks platform API.
  - `media-workbench/src/types.ts` lacks platform types and real order shape.
- Current runtime path design is incomplete:
  - `desktop/runtime-paths.js` changes packaged runtime to userData, but `media-ipc.js` still hardcodes `path.resolve(__dirname, "..", "..", "input", "media")`.
  - `MediaResourceStore`, `MediaPoolStore`, and `MediaDraftStore` still default to repo-relative `data/`.
  - `src/platforms/media/config.js` loads `.env` from code root instead of workspace root.

---

## Required Reading

Read these before changing code:

- `docs/superpowers/plans/2026-07-01-alpha-packaging-plan.md`
- `docs/superpowers/plans/2026-07-01-alpha-package-startup-fix-plan.md`
- `docs/superpowers/plans/2026-06-29-platforms-react-ui-migration.md` from `ui` branch if missing on current branch
- `docs/media-workbench-repair-record.md` from `ui` branch if missing on current branch
- `docs/platform-workbench-react-ui.md` from `ui` branch if missing on current branch
- `desktop/main.js`
- `desktop/runtime-paths.js`
- `desktop/preload.js`
- `desktop/ipc/media-ipc.js`
- `desktop/ipc/platform-ipc.js`
- `desktop/services/media-resource-service.js`
- `desktop/services/media-workbench-service.js`
- `desktop/services/platform-workbench-service.js`
- `desktop/services/desktop-task-service.js`
- `src/platforms/media/config.js`
- `src/platforms/media/media-resource-store.js`
- `src/platforms/media/media-pool-store.js`
- `src/platforms/media/media-draft-store.js`
- `media-workbench/src/App.tsx`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `media-workbench/src/components/Sidebar.tsx`
- `media-workbench/src/components/PlatformWorkbench.tsx` from `ui` branch
- `tests/desktop-packaging.test.js`
- `tests/media-workbench-flow.test.js`
- `tests/media-article-drawer-boundary.test.js`
- `tests/platform-workbench-service.test.js`
- `tests/media-resource-service.test.js`
- `tests/media-workbench-service.test.js`

---

## Recovery Strategy

Use `ui` branch as the business-function baseline and current `master` as the packaging baseline.

Do not randomly reimplement missing UI from memory. Restore the known-good React/platform code from `ui`, then adapt it to the corrected packaging runtime.

Target branch:

```powershell
git switch master
git switch -c codex/recover-alpha-workbench
```

Expected branch after completion:

```text
codex/recover-alpha-workbench contains:
- React paid media workbench from ui branch
- React other platform workbench from ui branch
- Workerized/pause-capable platform submit from ui branch
- alpha packaging config/startup fixes from master
- new workspace path contract tests
```

---

## Task 1: Add regression tests that expose the current breakage

**Priority:** P0

**Files:**
- Modify: `tests/media-workbench-flow.test.js`
- Modify: `tests/desktop-workbench-flow.test.js`
- Modify: `tests/desktop-packaging.test.js`
- Create: `tests/react-workbench-regression.test.js`

- [ ] **Step 1: Add React UI regression tests**

Create `tests/react-workbench-regression.test.js`:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("react workbench regression guards", function() {
  it("keeps other platform posting visible in the React UI", function() {
    const sidebar = read("media-workbench/src/components/Sidebar.tsx");
    const app = read("media-workbench/src/App.tsx");
    assert.ok(fs.existsSync(path.resolve(__dirname, "..", "media-workbench/src/components/PlatformWorkbench.tsx")));
    assert.ok(sidebar.includes("其他平台投稿"));
    assert.ok(sidebar.includes("'platforms'"));
    assert.ok(app.includes("PlatformWorkbench"));
  });

  it("does not restore mock article creation or local persistence as production behavior", function() {
    const app = read("media-workbench/src/App.tsx");
    const api = read("media-workbench/src/electron-api.ts");
    assert.equal(app.includes("handleAddNewMockArticle"), false);
    assert.equal(app.includes("persistArticles"), false);
    assert.equal(api.includes("INITIAL_ARTICLES"), false);
    assert.equal(api.includes("mockData"), false);
  });

  it("keeps paid media data loaded from the real IPC path", function() {
    const app = read("media-workbench/src/App.tsx");
    assert.ok(app.includes("previewArticle"));
    assert.ok(app.includes("getPool"));
    assert.ok(app.includes("refreshResources"));
    assert.ok(app.includes("pageSize: 99999"));
  });

  it("keeps the real balance response shape", function() {
    const api = read("media-workbench/src/electron-api.ts");
    assert.ok(api.includes("balance: string"));
    assert.ok(api.includes("Number("));
  });
});
```

- [ ] **Step 2: Add packaging path regression tests**

Add to `tests/desktop-packaging.test.js`:

```js
it("does not hardcode media input to the packaged app source directory", function() {
  const mediaIpc = read("desktop/ipc/media-ipc.js");
  assert.equal(
    mediaIpc.includes('path.resolve(__dirname, "..", "..", "input", "media")'),
    false,
    "media IPC must use workspace paths from registerIpc deps"
  );
});

it("separates app code root from writable workspace root", function() {
  const runtime = read("desktop/runtime-paths.js");
  assert.ok(runtime.includes("appRoot"));
  assert.ok(runtime.includes("workspaceRoot"));
  assert.ok(runtime.includes("configureRuntimeEnvironment"));
});
```

- [ ] **Step 3: Run the new tests and confirm they fail on current master**

Run:

```powershell
node --test tests/react-workbench-regression.test.js tests/desktop-packaging.test.js
```

Expected before recovery: FAIL because current master is missing PlatformWorkbench, has mock/local persistence, and hardcodes media input path.

**Acceptance Criteria:**
- Tests fail for the exact regressions reported by the user.
- Tests distinguish React business regression from packaging path regression.

---

## Task 2: Restore the known-good React business UI from `ui`

**Priority:** P0

**Files:**
- Restore/modify: `media-workbench/src/App.tsx`
- Restore/modify: `media-workbench/src/electron-api.ts`
- Restore/modify: `media-workbench/src/types.ts`
- Restore/modify: `media-workbench/src/components/Sidebar.tsx`
- Restore/create: `media-workbench/src/components/PlatformWorkbench.tsx`
- Restore/modify: `media-workbench/src/components/OrdersView.tsx`
- Restore/modify: `media-workbench/src/components/ResourceLibrary.tsx`
- Restore/modify: `media-workbench/src/components/ArticleEditor.tsx`
- Restore/modify: `media-workbench/src/components/ArticleList.tsx`
- Restore docs from `ui` if useful: `docs/media-workbench-repair-record.md`, `docs/platform-workbench-react-ui.md`

- [ ] **Step 1: Restore React files from `ui` branch**

Use `git checkout` from repository root `F:\官媒投稿`:

```powershell
git checkout ui -- `
  auto—publish/media-workbench/src/App.tsx `
  auto—publish/media-workbench/src/electron-api.ts `
  auto—publish/media-workbench/src/types.ts `
  auto—publish/media-workbench/src/components/Sidebar.tsx `
  auto—publish/media-workbench/src/components/PlatformWorkbench.tsx `
  auto—publish/media-workbench/src/components/OrdersView.tsx `
  auto—publish/media-workbench/src/components/ResourceLibrary.tsx `
  auto—publish/media-workbench/src/components/ArticleEditor.tsx `
  auto—publish/media-workbench/src/components/ArticleList.tsx
```

Expected: PlatformWorkbench exists, Sidebar has “其他平台投稿”, App imports PlatformWorkbench, and paid media workbench uses real IPC helpers.

- [ ] **Step 2: Restore supporting docs if currently missing**

Run:

```powershell
git checkout ui -- `
  auto—publish/docs/media-workbench-repair-record.md `
  auto—publish/docs/platform-workbench-react-ui.md `
  auto—publish/docs/superpowers/plans/2026-06-29-platforms-react-ui-migration.md
```

Expected: docs are restored if they were removed from master.

- [ ] **Step 3: Check for unwanted mock/local persistence**

Run:

```powershell
Select-String -Path media-workbench/src/App.tsx,media-workbench/src/electron-api.ts -Pattern "handleAddNewMockArticle|persistArticles|INITIAL_ARTICLES|mockData"
```

Expected: no matches.

- [ ] **Step 4: Run React regression tests**

Run:

```powershell
node --test tests/react-workbench-regression.test.js tests/media-workbench-flow.test.js tests/media-article-drawer-boundary.test.js
```

Expected: PASS after restoring React files.

**Acceptance Criteria:**
- 其他平台投稿入口回到新 UI。
- 付费媒体投稿不再使用 mock/local persistence 作为生产路径。
- 文章打开时通过 `previewArticle` 读取正文。
- 媒体库初始加载和刷新恢复到全量策略。

---

## Task 3: Restore platform Worker / pause / cancel IPC from `ui`

**Priority:** P0

**Files:**
- Restore/modify: `desktop/ipc/platform-ipc.js`
- Restore/modify: `desktop/preload.js`
- Restore/modify: `desktop/services/desktop-task-service.js`
- Restore/modify: `desktop/services/platform-workbench-service.js`
- Restore/modify: `desktop/worker/run-task.js`
- Restore/modify: `src/core/operator-flow.js`
- Restore/modify: `src/core/stop-signal.js`
- Test: `tests/platform-workbench-service.test.js`
- Test: `tests/desktop-workbench-flow.test.js`

- [ ] **Step 1: Restore platform backend files from `ui`**

From repository root:

```powershell
git checkout ui -- `
  auto—publish/desktop/ipc/platform-ipc.js `
  auto—publish/desktop/preload.js `
  auto—publish/desktop/services/desktop-task-service.js `
  auto—publish/desktop/services/platform-workbench-service.js `
  auto—publish/desktop/worker/run-task.js `
  auto—publish/src/core/operator-flow.js `
  auto—publish/src/core/stop-signal.js
```

Expected: platform submit uses workerized/non-blocking flow and exposes pause/cancel methods required by `PlatformWorkbench`.

- [ ] **Step 2: Preserve current packaging startup changes**

After restoring from `ui`, check `desktop/main.js` remains from current master and still lazy-loads config-dependent modules after runtime setup.

Run:

```powershell
Select-String -Path desktop/main.js -Pattern "configureRuntimeEnvironment|require\\(\"../src/core/logger\"\\)|require\\(\"./ipc/register\"\\)"
```

Expected: `configureRuntimeEnvironment` appears before logger/register requires.

- [ ] **Step 3: Run platform tests**

Run:

```powershell
node --test tests/platform-workbench-service.test.js tests/desktop-workbench-flow.test.js
```

Expected: PASS.

**Acceptance Criteria:**
- React PlatformWorkbench has matching preload/electron-api methods.
- 平台投稿不会再因为同步发布卡死 UI。
- 暂停/取消按钮调用真实 IPC。

---

## Task 4: Redesign runtime paths as appRoot + workspaceRoot

**Priority:** P0

**Files:**
- Modify: `desktop/runtime-paths.js`
- Modify: `desktop/main.js`
- Modify: `desktop/ipc/media-ipc.js`
- Modify: `desktop/ipc/platform-ipc.js` if needed
- Modify: `scripts/config.js`
- Modify: `src/platforms/media/config.js`
- Modify: `src/platforms/media/media-resource-store.js`
- Modify: `src/platforms/media/media-pool-store.js`
- Modify: `src/platforms/media/media-draft-store.js`
- Test: `tests/desktop-packaging.test.js`
- Test: `tests/media-resource-service.test.js`
- Test: `tests/media-workbench-service.test.js`

- [ ] **Step 1: Make `runtime-paths.js` return both roots**

Replace `desktop/runtime-paths.js` with a dual-root contract:

```js
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

function appRoot() {
  return path.resolve(__dirname, "..");
}

function defaultWorkspaceRoot() {
  if (process.env.AUTO_PUBLISH_WORKSPACE) {
    return path.resolve(process.env.AUTO_PUBLISH_WORKSPACE);
  }
  if (app && app.isPackaged) {
    return path.join(app.getPath("documents"), "AutoPublish");
  }
  return appRoot();
}

function workspaceRoot() {
  return defaultWorkspaceRoot();
}

function ensureRuntimeDirs(root) {
  [
    "input",
    "input/media",
    "input/lieju",
    "input/toutiao",
    "input/hepan",
    "data",
    "logs",
    "published",
    "failed",
    "tmp",
    "work"
  ].forEach(function(relativePath) {
    fs.mkdirSync(path.join(root, relativePath), { recursive: true });
  });
}

function configureRuntimeEnvironment() {
  var workspace = workspaceRoot();
  ensureRuntimeDirs(workspace);
  process.env.AUTO_PUBLISH_APP_ROOT = appRoot();
  process.env.AUTO_PUBLISH_ROOT_DIR = workspace;
  process.env.AUTO_PUBLISH_WORKSPACE = workspace;
  return {
    appRoot: appRoot(),
    workspaceRoot: workspace,
    inputDir: path.join(workspace, "input"),
    mediaInputDir: path.join(workspace, "input", "media"),
    dataDir: path.join(workspace, "data"),
    logsDir: path.join(workspace, "logs"),
    workDir: path.join(workspace, "work")
  };
}

module.exports = {
  appRoot: appRoot,
  workspaceRoot: workspaceRoot,
  configureRuntimeEnvironment: configureRuntimeEnvironment
};
```

Rationale: packaged app code remains in `resources/app`; mutable user data goes under `Documents\AutoPublish` unless overridden.

- [ ] **Step 2: Pass `runtimePaths` through `desktop/main.js`**

Update `desktop/main.js`:

```js
const runtimePaths = configureRuntimeEnvironment();

const taskService = createDesktopTaskService({
  cwd: runtimePaths.workspaceRoot,
  sendToRenderer: sendToRenderer
});

registerIpc({
  ipcMain: ipcMain,
  taskService: taskService,
  sendToRenderer: sendToRenderer,
  rootDir: runtimePaths.workspaceRoot,
  runtimePaths: runtimePaths
});
```

- [ ] **Step 3: Make `media-ipc.js` use injected workspace paths**

Replace hardcoded stores/input paths:

```js
var runtimePaths = deps.runtimePaths || {};
var rootDir = deps.rootDir;
var dataDir = runtimePaths.dataDir || path.join(rootDir, "data");
var mediaInputDir = runtimePaths.mediaInputDir || path.join(rootDir, "input", "media");

var mediaResourceStore = new MediaResourceStore({
  filePath: path.join(dataDir, "media-resources.json")
});
var mediaPoolStore = new MediaPoolStore({
  filePath: path.join(dataDir, "media-pool.json")
});
var mediaDraftStore = new MediaDraftStore({
  storePath: path.join(dataDir, "media-drafts.json")
});
...
var mediaWorkbenchService = createMediaWorkbenchService({
  inputDir: mediaInputDir,
  draftStore: mediaDraftStore
});
```

- [ ] **Step 4: Make media config load `.env` from workspace first**

In `src/platforms/media/config.js`, load:

```js
const workspaceRoot = process.env.AUTO_PUBLISH_ROOT_DIR || path.resolve(__dirname, '..', '..', '..');
const appRoot = process.env.AUTO_PUBLISH_APP_ROOT || path.resolve(__dirname, '..', '..', '..');

dotenv.config({ path: path.join(workspaceRoot, '.env'), quiet: true });
dotenv.config({ path: path.join(appRoot, '.env'), quiet: true });
```

Expected priority:

```text
explicit CLI/env > workspace .env > app root .env
```

- [ ] **Step 5: Keep store defaults backward compatible**

Optionally update store constructors to respect `AUTO_PUBLISH_ROOT_DIR` when no explicit path is passed:

```js
const ROOT = process.env.AUTO_PUBLISH_ROOT_DIR || path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
```

Do this in:

```text
src/platforms/media/media-resource-store.js
src/platforms/media/media-pool-store.js
src/platforms/media/media-draft-store.js
```

- [ ] **Step 6: Update packaging tests**

Update `tests/desktop-packaging.test.js` to assert:

```js
assert.ok(read("desktop/main.js").includes("runtimePaths"));
assert.ok(read("desktop/ipc/media-ipc.js").includes("runtimePaths.dataDir"));
assert.ok(read("desktop/ipc/media-ipc.js").includes("runtimePaths.mediaInputDir"));
assert.equal(read("desktop/ipc/media-ipc.js").includes('path.resolve(__dirname, "..", "..", "input", "media")'), false);
assert.ok(read("src/platforms/media/config.js").includes("AUTO_PUBLISH_ROOT_DIR"));
assert.ok(read("src/platforms/media/config.js").includes("AUTO_PUBLISH_APP_ROOT"));
```

- [ ] **Step 7: Run path contract tests**

Run:

```powershell
node --test tests/desktop-packaging.test.js tests/media-resource-service.test.js tests/media-workbench-service.test.js
```

Expected: PASS.

**Acceptance Criteria:**
- Packaged app knows where code lives and where user workspace lives.
- 媒体文章扫描 reads `workspaceRoot/input/media`.
- 媒体资源 cache/pool/drafts read/write `workspaceRoot/data`.
- API key can be loaded from workspace `.env`.
- No service writes mutable data into `resources/app`.

---

## Task 5: Restore media resource, balance, and article behavior end to end

**Priority:** P0

**Files:**
- Modify: `media-workbench/src/App.tsx`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `desktop/services/media-resource-service.js`
- Modify: `desktop/services/media-workbench-service.js`
- Test: `tests/media-workbench-flow.test.js`
- Test: `tests/media-resource-service.test.js`
- Test: `tests/media-workbench-service.test.js`

- [ ] **Step 1: Ensure balance response shape matches service**

`desktopConsole.media.getBalance()` returns an IPC envelope whose `data` is an object like:

```ts
{ balance: string; raw?: unknown }
```

`electron-api.ts` must convert it:

```ts
return Number((result.data as { balance: string }).balance || 0);
```

Do not use:

```ts
return result.data!;
```

- [ ] **Step 2: Ensure resource loading uses full page for current UI**

In `App.tsx`, initial load and refresh should use:

```ts
getResourcePage({ page: 1, pageSize: 99999 })
refreshResources({ fetchAll: true })
```

Do not restore the earlier `pageSize: 200` limit.

- [ ] **Step 3: Ensure article open previews real content**

Article open handler should call:

```ts
const preview = await previewArticle(art.filename);
```

Then update `activeArticle.content` and recompute word count from `preview.content`.

- [ ] **Step 4: Ensure pool is loaded and picker uses pool**

Initial load should call:

```ts
const pool = await getPool();
setPoolResources(pool);
```

When an article is active, `ResourceLibrary` should receive `poolResources`, not all resources.

- [ ] **Step 5: Run tests**

Run:

```powershell
node --test tests/react-workbench-regression.test.js tests/media-workbench-flow.test.js tests/media-resource-service.test.js tests/media-workbench-service.test.js
cd media-workbench
npm run lint
```

Expected: PASS.

**Acceptance Criteria:**
- 余额刷新显示数字，不显示 `[object Object]` 或一直不变。
- 媒体库可拉取并刷新。
- 文章打开后能读到正文并显示正确字数。
- 已选媒体和媒体池行为恢复到新 UI 设计。

---

## Task 6: Restore other platform posting in packaged runtime

**Priority:** P0

**Files:**
- Modify: `media-workbench/src/components/PlatformWorkbench.tsx`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `desktop/ipc/platform-ipc.js`
- Modify: `desktop/preload.js`
- Modify: `desktop/services/platform-workbench-service.js`
- Test: `tests/platform-workbench-service.test.js`
- Test: `tests/desktop-workbench-flow.test.js`
- Test: `tests/react-workbench-regression.test.js`

- [ ] **Step 1: Verify platform queue reads workspace input**

`registerPlatformIpc` should receive `rootDir: runtimePaths.workspaceRoot`, and `platform-workbench-service.js` should scan:

```text
workspaceRoot/input/lieju
workspaceRoot/input/toutiao
workspaceRoot/input/hepan
```

- [ ] **Step 2: Verify `desktopConsole.platforms` exposes all methods used by React**

`desktop/preload.js` must expose methods required by `PlatformWorkbench` from `ui` branch, including queue, plan, submit, and pause/cancel/stop if the component uses them.

- [ ] **Step 3: Verify `electron-api.ts` has platform wrappers**

Ensure exports include:

```ts
getPlatformQueue
buildPlatformPlan
submitPlatformPlan
stopPlatformSubmit
pausePlatformSubmit
```

Only include methods that exist in preload/IPC; if names differ, align React and preload together.

- [ ] **Step 4: Run platform tests**

Run:

```powershell
node --test tests/platform-workbench-service.test.js tests/desktop-workbench-flow.test.js tests/react-workbench-regression.test.js
```

Expected: PASS.

**Acceptance Criteria:**
- 其他平台投稿入口可见。
- 队列刷新能看到 workspace 下的 `lieju/toutiao/hepan` 文章。
- 提交、暂停、取消不会阻塞主窗口。

---

## Task 7: Packaging verification with real workspace

**Priority:** P1

**Files:**
- Modify: `scripts/verify-alpha-package.js`
- Modify: `docs/alpha-packaging-checklist.md`
- Modify: `docs/desktop-workbench.md`

- [ ] **Step 1: Extend package verifier**

Update `scripts/verify-alpha-package.js` required files:

```js
const required = [
  "package.json",
  "desktop/main.js",
  "desktop/preload.js",
  "desktop/runtime-paths.js",
  "desktop/ipc/media-ipc.js",
  "desktop/ipc/platform-ipc.js",
  "src/core/logger.js",
  "scripts/config.js",
  "config/platforms.json",
  "media-workbench/dist/index.html"
];
```

- [ ] **Step 2: Add workspace smoke script**

Create `scripts/create-alpha-smoke-workspace.ps1`:

```powershell
param(
  [string]$Workspace = "$env:USERPROFILE\Documents\AutoPublish"
)

New-Item -ItemType Directory -Force -Path `
  "$Workspace\input\media", `
  "$Workspace\input\lieju", `
  "$Workspace\input\toutiao", `
  "$Workspace\input\hepan", `
  "$Workspace\data", `
  "$Workspace\logs", `
  "$Workspace\published", `
  "$Workspace\failed", `
  "$Workspace\tmp", `
  "$Workspace\work" | Out-Null

"测试标题`n这是一篇用于 alpha 安装包验证的媒体文章。" |
  Set-Content -Path "$Workspace\input\media\alpha-media-test.txt" -Encoding UTF8

"测试其他平台标题`n这是一篇用于其他平台投稿队列验证的文章。" |
  Set-Content -Path "$Workspace\input\lieju\alpha-platform-test.txt" -Encoding UTF8

Write-Host "Alpha smoke workspace ready: $Workspace"
```

- [ ] **Step 3: Document installed app workspace**

Update docs to state:

```md
Alpha packaged app uses `%USERPROFILE%\Documents\AutoPublish` by default.
Put media articles in `Documents\AutoPublish\input\media`.
Put platform articles in `Documents\AutoPublish\input\lieju`, `input\toutiao`, or `input\hepan`.
Put `.env` containing `XQW_API_KEY=...` in `Documents\AutoPublish\.env`.
```

**Acceptance Criteria:**
- User can create a test workspace without guessing hidden userData paths.
- Installed package can be verified before launch.
- Documentation explains where to put articles and `.env`.

---

## Task 8: Build, install, and manual acceptance

**Priority:** P1

**Files:**
- Generated: `release-alpha/`

- [ ] **Step 1: Run full automated verification**

Run from `F:\官媒投稿\auto—publish`:

```powershell
node --test tests/*.test.js
cd media-workbench
npm run lint
npm run build
cd ..
```

Expected: PASS.

- [ ] **Step 2: Create smoke workspace**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-alpha-smoke-workspace.ps1
```

Expected:

```text
Alpha smoke workspace ready: C:\Users\<user>\Documents\AutoPublish
```

- [ ] **Step 3: Build installer**

Run:

```powershell
npm run dist:alpha
```

Expected: setup artifact is created in `release-alpha/`.

- [ ] **Step 4: Install and verify package contents**

After installing to `D:\AP\AutoPublish`, run:

```powershell
node scripts/verify-alpha-package.js D:\AP\AutoPublish\resources\app
```

Expected:

```text
Alpha package contents OK: D:\AP\AutoPublish\resources\app
```

- [ ] **Step 5: Launch installed app**

Run:

```powershell
D:\AP\AutoPublish\AutoPublish.exe
```

Manual expected results:

```text
No JavaScript main process dialog.
React UI opens.
付费媒体投稿 shows alpha-media-test.txt after scan.
其他平台投稿 nav item exists.
其他平台投稿 queue shows alpha-platform-test.txt after refresh.
余额刷新 either returns a numeric balance or a clear API-key/config error.
媒体库刷新 either loads resources or shows a clear API-key/config error.
```

**Acceptance Criteria:**
- Installed alpha opens and reaches React UI.
- Paid media article reading works from documented workspace.
- Other platform posting page exists and scans queue.
- Balance/resource failures, if API key is missing, are explicit config errors rather than silent UI breakage.

---

## Task 9: Commit complete recovery

**Priority:** P2

**Files:**
- All restored React files
- All restored platform backend files
- Runtime path fixes
- Packaging tests/scripts/docs
- This plan document

- [ ] **Step 1: Check status**

Run:

```powershell
git status --short
```

Expected: source/docs/test changes only. `release-alpha/`, runtime workspace data, logs, input, and `.env` are not tracked.

- [ ] **Step 2: Commit**

Run:

```powershell
git add auto—publish
git commit -m "fix: recover packaged react workbench functionality"
```

**Acceptance Criteria:**
- Commit restores business functionality and packaging runtime together.
- Commit includes regression tests for the exact failures reported.
- Generated installers and private runtime data are not committed.

---

## Self-Review

- Root cause coverage: handles missing `ui` branch functionality on master, mock/local React regression, wrong balance shape, hardcoded media input path, repo-relative media data stores, and unclear packaged workspace.
- Test coverage: adds React UI regression tests and packaging path tests before implementation.
- Risk control: restores known-good code from `ui` branch instead of reimplementing from memory.
- Packaging safety: keeps private data excluded while documenting a visible user workspace.
- Scope: focuses on restoring installed alpha usability, not production signing, auto-update, or marketplace distribution.
