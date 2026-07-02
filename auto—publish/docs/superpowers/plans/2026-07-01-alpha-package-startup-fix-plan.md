# Alpha Package Startup Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Windows 安装包启动时报 `Cannot find module '../../scripts/config'` 的主进程崩溃，让安装后的 alpha 版本能正常打开 React UI。

**Architecture:** 这不是 UI 问题，而是 packaged Electron 主进程的模块依赖和启动初始化顺序问题。修复方向是：确保 `scripts/config.js` 及必要运行时代码被打入 `resources/app`，并且在任何依赖 `scripts/config.js` 的模块加载前先初始化 packaged runtime workspace。

**Tech Stack:** Electron 33, electron-builder, Node.js CommonJS, React/Vite build artifact, `node:test`, Windows packaged app.

---

## Error Evidence

Screenshot error:

```text
A JavaScript error occurred in the main process
Uncaught Exception:
Error: Cannot find module '../../scripts/config'
Require stack:
- D:\AP\AutoPublish\resources\app\src\core\logger.js
- D:\AP\AutoPublish\resources\app\desktop\main.js
```

Local package inspection confirms:

```powershell
Test-Path 'D:\AP\AutoPublish\resources\app\scripts\config.js'
```

Observed result:

```text
False
```

Current installed package contains:

```text
resources/app/config
resources/app/desktop
resources/app/media-workbench
resources/app/node_modules
resources/app/src
resources/app/package.json
```

Missing:

```text
resources/app/scripts/config.js
```

---

## Root Cause

There are two related startup/package issues:

- `src/core/logger.js` depends on `../../scripts/config`, so packaged app must include `scripts/config.js` at `resources/app/scripts/config.js`.
- `desktop/main.js` currently imports `subscribe` from `../src/core/logger` at top level, before `configureRuntimeEnvironment()` runs. That means `scripts/config.js` is loaded before `AUTO_PUBLISH_ROOT_DIR` is set, so even after bundling `scripts/config.js`, packaged runtime paths may still resolve incorrectly.

Fix both. Do not only add a try/catch around `require()`. That would hide the crash but leave runtime paths wrong.

---

## Required Reading

Read these before changing code:

- `docs/superpowers/plans/2026-07-01-alpha-packaging-plan.md`
- `electron-builder.alpha.yml`
- `package.json`
- `desktop/main.js`
- `desktop/runtime-paths.js`
- `src/core/logger.js`
- `scripts/config.js`
- `tests/desktop-packaging.test.js`
- `docs/alpha-packaging-checklist.md`

---

## Task 1: Lock the missing packaged file with a failing test

**Priority:** P0

**Files:**
- Modify: `tests/desktop-packaging.test.js`

- [ ] **Step 1: Add a packaging config test for `scripts/config.js`**

Add this test to `tests/desktop-packaging.test.js`:

```js
it("packages scripts/config.js because runtime modules require it", function() {
  const config = read("electron-builder.alpha.yml");
  assert.ok(
    config.includes("scripts/**/*") || config.includes("scripts/config.js"),
    "electron-builder config must include scripts/config.js"
  );
  assert.equal(
    config.includes("!scripts/**"),
    false,
    "electron-builder config must not exclude the scripts directory"
  );
});
```

- [ ] **Step 2: Add a test for startup import order**

Add:

```js
it("initializes runtime environment before loading config-dependent services", function() {
  const main = read("desktop/main.js");
  assert.ok(main.includes("configureRuntimeEnvironment"));
  assert.ok(
    main.indexOf("configureRuntimeEnvironment") < main.indexOf("require(\"../src/core/logger\")"),
    "logger must be required after runtime environment configuration"
  );
  assert.ok(
    main.indexOf("configureRuntimeEnvironment") < main.indexOf("require(\"./ipc/register\")"),
    "IPC registration must be required after runtime environment configuration"
  );
});
```

This test intentionally requires lazy `require()` calls inside `app.whenReady()` after runtime setup.

- [ ] **Step 3: Run the test and confirm it fails**

Run:

```powershell
node --test tests/desktop-packaging.test.js
```

Expected before implementation: FAIL if `scripts/config.js` is not guaranteed in builder config or if `desktop/main.js` still top-level imports config-dependent modules.

**Acceptance Criteria:**
- The test captures the exact class of startup failure from the screenshot.
- Failure message points to package inclusion or startup order, not generic Electron behavior.

---

## Task 2: Fix electron-builder file inclusion

**Priority:** P0

**Files:**
- Modify: `electron-builder.alpha.yml`

- [ ] **Step 1: Include the scripts directory explicitly**

In `electron-builder.alpha.yml`, replace any narrow script inclusion with:

```yaml
  # Runtime config used by src/core/logger.js and platform adapters
  - scripts/**/*
```

Keep these exclusions:

```yaml
  - "!scripts/.playwright-cli/**"
  - "!.playwright-cli/**"
```

Do not exclude `scripts/config.js`.

- [ ] **Step 2: Keep private runtime data excluded**

Ensure these exclusions remain:

```yaml
  - "!**/.env"
  - "!input/**"
  - "!data/**"
  - "!logs/**"
  - "!published/**"
  - "!failed/**"
  - "!tmp/**"
  - "!work/**"
```

- [ ] **Step 3: Run the packaging config test**

Run:

```powershell
node --test tests/desktop-packaging.test.js
```

Expected: package inclusion test passes; startup order test may still fail until Task 3.

**Acceptance Criteria:**
- Fresh package contains `resources/app/scripts/config.js`.
- No private runtime data is bundled.
- Builder config is explicit enough that this cannot regress silently.

---

## Task 3: Move runtime initialization before config-dependent imports

**Priority:** P0

**Files:**
- Modify: `desktop/main.js`
- Test: `tests/desktop-packaging.test.js`

- [ ] **Step 1: Remove top-level imports that transitively load `scripts/config.js`**

In `desktop/main.js`, keep only safe top-level imports:

```js
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { configureRuntimeEnvironment } = require("./runtime-paths");
```

Remove top-level imports like:

```js
const { subscribe } = require("../src/core/logger");
const { registerIpc } = require("./ipc/register");
const { createDesktopTaskService } = require("./services/desktop-task-service");
```

- [ ] **Step 2: Lazy require services after runtime env setup**

Inside `app.whenReady().then(function() { ... })`, do:

```js
app.whenReady().then(function() {
  const runtimeRoot = configureRuntimeEnvironment();
  const { subscribe } = require("../src/core/logger");
  const { registerIpc } = require("./ipc/register");
  const { createDesktopTaskService } = require("./services/desktop-task-service");

  createMainWindow();
  const taskService = createDesktopTaskService({
    cwd: runtimeRoot,
    sendToRenderer: sendToRenderer
  });
  registerIpc({
    ipcMain: ipcMain,
    taskService: taskService,
    sendToRenderer: sendToRenderer,
    rootDir: runtimeRoot
  });
  unsubscribeLogs = subscribe(function(entry) { sendToRenderer("publish-log", entry); });
});
```

Important: `configureRuntimeEnvironment()` must run before requiring `../src/core/logger`, `./ipc/register`, or services that may import `scripts/config.js`.

- [ ] **Step 3: Run the startup order test**

Run:

```powershell
node --test tests/desktop-packaging.test.js
```

Expected: PASS.

**Acceptance Criteria:**
- `AUTO_PUBLISH_ROOT_DIR` is set before `scripts/config.js` is loaded.
- Main process no longer crashes because config-dependent modules load too early.
- Development startup still uses the project root or explicit workspace as before.

---

## Task 4: Add packaged contents verification

**Priority:** P1

**Files:**
- Modify: `tests/desktop-packaging.test.js`
- Create: `scripts/verify-alpha-package.cmd`
- Create: `scripts/verify-alpha-package.js`

- [ ] **Step 1: Add a small package verification script**

Create `scripts/verify-alpha-package.js`:

```js
const fs = require("fs");
const path = require("path");

const appDir = process.argv[2];

if (!appDir) {
  console.error("Usage: node scripts/verify-alpha-package.js <resources/app path>");
  process.exit(2);
}

const required = [
  "package.json",
  "desktop/main.js",
  "desktop/preload.js",
  "desktop/runtime-paths.js",
  "src/core/logger.js",
  "scripts/config.js",
  "config/platforms.json",
  "media-workbench/dist/index.html"
];

const missing = required.filter(function(relativePath) {
  return !fs.existsSync(path.join(appDir, relativePath));
});

if (missing.length) {
  console.error("Missing packaged files:");
  missing.forEach(function(file) {
    console.error("- " + file);
  });
  process.exit(1);
}

console.log("Alpha package contents OK: " + appDir);
```

- [ ] **Step 2: Add Windows wrapper**

Create `scripts/verify-alpha-package.cmd`:

```bat
@echo off
setlocal
if "%~1"=="" (
  echo Usage: scripts\verify-alpha-package.cmd ^<resources\app path^>
  exit /b 2
)
node "%~dp0verify-alpha-package.js" "%~1"
```

- [ ] **Step 3: Add test coverage for verification script**

Add to `tests/desktop-packaging.test.js`:

```js
it("package verification script checks config-dependent runtime files", function() {
  const verifier = read("scripts/verify-alpha-package.js");
  assert.ok(verifier.includes("scripts/config.js"));
  assert.ok(verifier.includes("src/core/logger.js"));
  assert.ok(verifier.includes("media-workbench/dist/index.html"));
});
```

- [ ] **Step 4: Run tests**

Run:

```powershell
node --test tests/desktop-packaging.test.js
```

Expected: PASS.

**Acceptance Criteria:**
- There is a repeatable way to inspect installed/unpacked package contents.
- Missing `scripts/config.js` is caught before launching the app.

---

## Task 5: Rebuild, inspect, and reinstall alpha

**Priority:** P1

**Files:**
- Generated: `release-alpha/`
- Installed output: user-selected install directory, for example `D:\AP\AutoPublish`

- [ ] **Step 1: Clean old build output**

Run:

```powershell
if (Test-Path release-alpha) { Remove-Item release-alpha -Recurse -Force }
```

Expected: old `release-alpha/` is removed.

- [ ] **Step 2: Build renderer and package**

Run:

```powershell
npm run dist:alpha
```

Expected:

```text
media-workbench build succeeds
electron-builder creates installer artifact under release-alpha
```

- [ ] **Step 3: Inspect unpacked/package output if available**

If electron-builder creates `release-alpha/win-unpacked/resources/app`, run:

```powershell
node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources/app
```

Expected:

```text
Alpha package contents OK: release-alpha/win-unpacked/resources/app
```

- [ ] **Step 4: Reinstall alpha**

Uninstall or overwrite the previous install at:

```text
D:\AP\AutoPublish
```

Then reinstall from the new setup artifact.

- [ ] **Step 5: Verify installed package contents**

Run:

```powershell
node scripts/verify-alpha-package.js D:\AP\AutoPublish\resources\app
```

Expected:

```text
Alpha package contents OK: D:\AP\AutoPublish\resources\app
```

**Acceptance Criteria:**
- Installed package includes `D:\AP\AutoPublish\resources\app\scripts\config.js`.
- Installed package includes `media-workbench/dist/index.html`.
- Verification script passes against the actual install directory.

---

## Task 6: Launch smoke test and regression sweep

**Priority:** P1

**Files:**
- Modify: `docs/alpha-packaging-checklist.md`
- Modify: `docs/desktop-workbench.md` if needed

- [ ] **Step 1: Launch installed app**

Open the app from Start Menu or run:

```powershell
D:\AP\AutoPublish\AutoPublish.exe
```

Expected:

```text
No JavaScript main process error dialog.
Main window opens.
React UI is visible.
```

- [ ] **Step 2: Check runtime workspace**

Confirm the app creates or uses the expected workspace:

```powershell
[Environment]::GetFolderPath("ApplicationData")
```

Then inspect the Electron userData area for AutoPublish folders, or use `AUTO_PUBLISH_WORKSPACE` for a controlled test workspace.

Expected:

```text
input/
data/
logs/
published/
failed/
tmp/
work/
```

- [ ] **Step 3: Run automated tests**

Run:

```powershell
node --test tests/*.test.js
cd media-workbench
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 4: Update alpha checklist**

In `docs/alpha-packaging-checklist.md`, add a startup-specific check:

```md
- [ ] Installed package contains `resources/app/scripts/config.js`.
- [ ] Installed app opens without `Cannot find module '../../scripts/config'`.
```

**Acceptance Criteria:**
- The exact screenshot error no longer appears.
- Installed app reaches the React UI.
- Automated regression tests still pass.

---

## Task 7: Commit the startup fix

**Priority:** P2

**Files:**
- Modify: `electron-builder.alpha.yml`
- Modify: `desktop/main.js`
- Modify: `tests/desktop-packaging.test.js`
- Create: `scripts/verify-alpha-package.js`
- Create: `scripts/verify-alpha-package.cmd`
- Modify: `docs/alpha-packaging-checklist.md`
- Create: `docs/superpowers/plans/2026-07-01-alpha-package-startup-fix-plan.md`

- [ ] **Step 1: Check git status**

Run:

```powershell
git status --short
```

Expected: only packaging startup fix files and docs are changed. `release-alpha/` must not be tracked.

- [ ] **Step 2: Commit**

Run:

```powershell
git add electron-builder.alpha.yml desktop/main.js tests/desktop-packaging.test.js scripts/verify-alpha-package.js scripts/verify-alpha-package.cmd docs
git commit -m "fix: repair alpha package startup"
```

**Acceptance Criteria:**
- Fix is committed separately from unrelated UI or feature work.
- Commit includes tests that prevent the missing `scripts/config.js` regression.
- Commit includes the package verification script for future alpha builds.

---

## Self-Review

- Root cause coverage: handles both missing packaged file and too-early config-dependent imports.
- Test coverage: adds tests for builder config, startup import order, and package verification script.
- Verification: includes installed-directory verification against `D:\AP\AutoPublish\resources\app`.
- Scope: focused on the startup crash shown in the screenshot; does not expand into signing, auto-update, or production installer hardening.
