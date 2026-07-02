# Alpha Desktop Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 Electron + React 新 UI 打包成 Windows 可试用初版软件，方便本机安装或免安装运行并验证核心投稿流程。

**Architecture:** 使用现有 Electron 主进程 `desktop/main.js` 作为桌面入口，先构建 `media-workbench/dist`，再用 `electron-builder` 生成 Windows alpha 包。运行时数据目录（`input/`, `data/`, `logs/`, `published/`, `failed/`, `tmp/`, `work/`, `.env`）不要硬塞进安装包；alpha 版本优先支持在应用目录或用户数据目录创建必要目录，并在文档里说明如何放文章和配置。

**Tech Stack:** Electron 33, React 19, Vite 6, TypeScript, Node.js, electron-builder, Windows NSIS/portable target, `node:test`.

---

## Required Reading

Read these before changing code:

- `docs/media-workbench-repair-record.md`
- `docs/desktop-workbench.md`
- `package.json`
- `package-lock.json`
- `media-workbench/package.json`
- `media-workbench/scripts/build.cmd`
- `desktop/main.js`
- `desktop/preload.js`
- `desktop/ipc/register.js`
- `scripts/desktop.cmd`
- `.gitignore`
- `scripts/config.js`
- `src/core/playwright.js`
- `src/platforms/lieju/adapter.js`
- `src/platforms/toutiao/adapter.js`
- `src/platforms/hepan/adapter.js`
- `tests/media-workbench-flow.test.js`
- `tests/platform-workbench-service.test.js`
- `tests/desktop-workbench-flow.test.js`

---

## Packaging Scope

This is an alpha package for local testing, not a polished public release.

Include in the package:

- Electron main process: `desktop/`
- Business code: `src/`
- Config defaults: `config/`
- React production build: `media-workbench/dist/`
- Runtime scripts needed by adapters, including Python helper files under `src/platforms/hepan/`
- Production Node dependencies needed by Electron runtime

Do not include user/runtime data by default:

- `.env`
- `input/`
- `data/media-resources.json`
- `data/media-drafts.json`
- `data/media-pool.json`
- `data/submission-orders.jsonl`
- `logs/`
- `published/`
- `failed/`
- `tmp/`
- `work/`
- `.playwright-cli/`

Alpha target:

- Primary: Windows portable executable or unpacked folder.
- Secondary: NSIS installer if it works without extra signing setup.
- No auto-update.
- No code signing requirement for alpha.

---

## Key Risks

- The app currently relies on filesystem paths under repo root, such as `input/`, `data/`, and `logs/`. Packaged apps may run from a read-only `app.asar` if not configured carefully.
- Platform adapters use Playwright CLI/session files and may depend on external browser state.
- `hepan` uses a local Python executable and cookie file path. Alpha packaging should document this instead of pretending it is self-contained.
- `media-workbench/dist` must exist before Electron starts, because `desktop/main.js` loads it directly.
- The package must not accidentally bundle private `.env`, article drafts, media resource cache, or order history.

---

## Task 1: Add alpha packaging dependency and scripts

**Priority:** P0

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install electron-builder as a dev dependency**

Run:

```powershell
npm install --save-dev electron-builder
```

Expected: `package.json` gains `devDependencies.electron-builder`, and `package-lock.json` updates.

- [ ] **Step 2: Add build scripts**

Update root `package.json` scripts to include:

```json
{
  "scripts": {
    "desktop": "scripts\\desktop.cmd",
    "snapshot": "scripts\\snapshot.cmd",
    "test": "node --test tests/*.test.js",
    "build:renderer": "cd media-workbench && npm run build",
    "pack:alpha": "npm run build:renderer && electron-builder --win portable --config electron-builder.alpha.yml",
    "dist:alpha": "npm run build:renderer && electron-builder --win nsis --config electron-builder.alpha.yml"
  }
}
```

- [ ] **Step 3: Verify scripts are discoverable**

Run:

```powershell
npm run
```

Expected: output lists `build:renderer`, `pack:alpha`, and `dist:alpha`.

**Acceptance Criteria:**
- Packaging dependency is tracked in npm lockfile.
- There is a one-command alpha portable build.
- There is a separate installer build command, but portable remains the first target.

---

## Task 2: Add electron-builder alpha config

**Priority:** P0

**Files:**
- Create: `electron-builder.alpha.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Create builder config**

Create `electron-builder.alpha.yml`:

```yaml
appId: com.autopublish.desktop.alpha
productName: Auto Publish Alpha
copyright: Copyright © 2026

directories:
  output: release-alpha

files:
  - package.json
  - desktop/**/*
  - src/**/*
  - config/**/*
  - scripts/config.js
  - media-workbench/dist/**/*
  - node_modules/**/*
  - "!**/.git/**"
  - "!**/.env"
  - "!input/**"
  - "!data/**"
  - "!logs/**"
  - "!published/**"
  - "!failed/**"
  - "!tmp/**"
  - "!work/**"
  - "!tests/**"
  - "!docs/**"
  - "!media-workbench/src/**"
  - "!media-workbench/node_modules/**"
  - "!media-workbench/package-lock.json"

asar: false

win:
  target:
    - target: portable
      arch:
        - x64
    - target: nsis
      arch:
        - x64

portable:
  artifactName: AutoPublish-Alpha-${version}-portable.${ext}

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  artifactName: AutoPublish-Alpha-${version}-setup.${ext}
```

Note: `asar: false` is intentional for alpha because the current app reads and writes filesystem paths relative to the app root. A later production hardening pass can move mutable data into `app.getPath("userData")` and enable asar.

- [ ] **Step 2: Ignore build output**

Add to `.gitignore`:

```gitignore
release-alpha/
dist/
```

Only add `dist/` at repo root; do not ignore `media-workbench/dist/` unless the team decides build artifacts should never be committed.

- [ ] **Step 3: Verify config syntax by running builder help**

Run:

```powershell
npx electron-builder --config electron-builder.alpha.yml --help
```

Expected: command exits successfully and prints electron-builder help/config usage.

**Acceptance Criteria:**
- Builder config exists and excludes user data.
- Alpha output goes to `release-alpha/`.
- Config keeps app unpacked for alpha to avoid filesystem surprises.

---

## Task 3: Make packaged runtime directories explicit

**Priority:** P0

**Files:**
- Create: `desktop/runtime-paths.js`
- Modify: `desktop/main.js`
- Modify: `scripts/config.js`
- Test: `tests/desktop-packaging.test.js`

- [ ] **Step 1: Add runtime path helper**

Create `desktop/runtime-paths.js`:

```js
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function appRoot() {
  return path.resolve(__dirname, "..");
}

function userDataRoot() {
  return path.join(app.getPath("userData"), "workspace");
}

function runtimeRoot() {
  if (process.env.AUTO_PUBLISH_WORKSPACE) {
    return path.resolve(process.env.AUTO_PUBLISH_WORKSPACE);
  }
  if (app.isPackaged) {
    return userDataRoot();
  }
  return appRoot();
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
  var root = runtimeRoot();
  ensureRuntimeDirs(root);
  process.env.AUTO_PUBLISH_ROOT_DIR = root;
  return root;
}

module.exports = {
  appRoot: appRoot,
  runtimeRoot: runtimeRoot,
  configureRuntimeEnvironment: configureRuntimeEnvironment
};
```

- [ ] **Step 2: Call the helper before services register**

In `desktop/main.js`, import:

```js
const { configureRuntimeEnvironment } = require("./runtime-paths");
```

Inside `app.whenReady().then(...)`, before `createDesktopTaskService`, add:

```js
const runtimeRoot = configureRuntimeEnvironment();
```

Then pass `runtimeRoot` into services:

```js
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
```

- [ ] **Step 3: Let shared config respect runtime root**

In `scripts/config.js`, make `DIRS.rootDir` prefer `AUTO_PUBLISH_ROOT_DIR`:

```js
const rootDir = process.env.AUTO_PUBLISH_ROOT_DIR || path.resolve(__dirname, '..');
```

Keep existing relative paths based on `rootDir`.

- [ ] **Step 4: Add a packaging test**

Create `tests/desktop-packaging.test.js`:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("desktop alpha packaging", function() {
  it("loads the React build from the packaged app files", function() {
    const main = read("desktop/main.js");
    assert.ok(main.includes("media-workbench"));
    assert.ok(main.includes("dist"));
    assert.ok(main.includes("index.html"));
  });

  it("configures a writable runtime workspace before IPC registration", function() {
    const main = read("desktop/main.js");
    assert.ok(main.includes("configureRuntimeEnvironment"));
    assert.ok(main.includes("rootDir: runtimeRoot"));
    assert.ok(main.indexOf("configureRuntimeEnvironment") < main.indexOf("registerIpc"));
  });

  it("excludes private runtime data from alpha package config", function() {
    const config = read("electron-builder.alpha.yml");
    assert.ok(config.includes("!**/.env"));
    assert.ok(config.includes("!input/**"));
    assert.ok(config.includes("!data/**"));
    assert.ok(config.includes("!logs/**"));
  });
});
```

- [ ] **Step 5: Run the packaging test**

Run:

```powershell
node --test tests/desktop-packaging.test.js
```

Expected: PASS.

**Acceptance Criteria:**
- Packaged app does not depend on writing inside `app.asar`.
- Packaged app creates expected workspace directories.
- `AUTO_PUBLISH_WORKSPACE` can override the runtime workspace for testing.

---

## Task 4: Build renderer and verify Electron boot path

**Priority:** P0

**Files:**
- Modify: `docs/desktop-workbench.md`
- Test: `tests/media-workbench-flow.test.js`
- Test: `tests/desktop-packaging.test.js`

- [ ] **Step 1: Build React renderer**

Run:

```powershell
cd media-workbench
npm run lint
npm run build
cd ..
```

Expected: TypeScript passes and `media-workbench/dist/index.html` exists.

- [ ] **Step 2: Run core desktop tests**

Run:

```powershell
node --test tests/media-workbench-flow.test.js tests/platform-workbench-service.test.js tests/desktop-packaging.test.js
```

Expected: PASS.

- [ ] **Step 3: Smoke launch in development mode**

Run:

```powershell
npm run desktop
```

Expected:

```text
Electron opens Auto Publish Desktop Console.
React UI loads without white screen.
付费媒体投稿 page is visible.
No missing dist/index.html error appears.
```

- [ ] **Step 4: Update desktop docs**

Add an Alpha Packaging section to `docs/desktop-workbench.md`:

```md
## Alpha Packaging

Portable alpha:

```powershell
npm run pack:alpha
```

Installer alpha:

```powershell
npm run dist:alpha
```

The packaged app creates runtime folders under Electron `userData` unless `AUTO_PUBLISH_WORKSPACE` is set.
Do not place private `.env`, article drafts, logs, or order history in the installer package.
```
```

**Acceptance Criteria:**
- Renderer build exists before packaging.
- Dev Electron boot still works.
- Docs explain alpha packaging commands and workspace behavior.

---

## Task 5: Produce the alpha package

**Priority:** P1

**Files:**
- Generated: `release-alpha/`
- Modify: `docs/desktop-workbench.md` if command output reveals a required note

- [ ] **Step 1: Clean old alpha output**

Run:

```powershell
if (Test-Path release-alpha) { Remove-Item release-alpha -Recurse -Force }
```

Expected: `release-alpha/` is absent before packaging.

- [ ] **Step 2: Build portable alpha**

Run:

```powershell
npm run pack:alpha
```

Expected:

```text
media-workbench build succeeds.
electron-builder creates release-alpha/AutoPublish-Alpha-1.0.0-portable.exe or equivalent artifact.
```

- [ ] **Step 3: Optionally build installer alpha**

Run:

```powershell
npm run dist:alpha
```

Expected:

```text
electron-builder creates release-alpha/AutoPublish-Alpha-1.0.0-setup.exe or equivalent artifact.
```

If NSIS fails because of local tooling, keep the portable build as the alpha artifact and document the NSIS failure.

- [ ] **Step 4: Record artifact names**

Run:

```powershell
Get-ChildItem release-alpha | Select-Object Name,Length,LastWriteTime
```

Expected: output lists the portable exe and, if built, the setup exe.

**Acceptance Criteria:**
- At least one Windows alpha artifact is produced.
- Artifact folder is ignored by git.
- Build does not include private runtime data.

---

## Task 6: Manual alpha acceptance checklist

**Priority:** P1

**Files:**
- Create: `docs/alpha-packaging-checklist.md`

- [ ] **Step 1: Create checklist doc**

Create `docs/alpha-packaging-checklist.md`:

```md
# Alpha Packaging Checklist

## Artifact

- [ ] `release-alpha/` contains a portable exe or installer.
- [ ] App launches without white screen.
- [ ] Window title is `Auto Publish Desktop Console` or approved alpha title.

## Workspace

- [ ] Runtime workspace folders exist: `input`, `data`, `logs`, `published`, `failed`, `tmp`, `work`.
- [ ] Private `.env` was not bundled into the package.
- [ ] Test articles can be placed into the runtime `input/media` folder.

## Paid Media Flow

- [ ] 付费媒体投稿 page opens.
- [ ] Article scan works.
- [ ] Media resource pool loads or shows a clear empty/error state.
- [ ] Draft save works.
- [ ] Preflight opens.

## Other Platforms Flow

- [ ] 其他平台投稿 page opens if that feature branch has been merged.
- [ ] Queue refresh works for `lieju`, `toutiao`, and `hepan`.
- [ ] Submit confirmation appears before real submission.

## Known Alpha Limitations

- [ ] Playwright/browser login state may need manual setup.
- [ ] `hepan` requires local Python and cookie configuration.
- [ ] Code signing is not configured.
- [ ] Auto-update is not configured.
```

- [ ] **Step 2: Run packaged app manually**

Launch the generated portable exe from `release-alpha/`.

Expected:

```text
The app opens.
No white screen.
No immediate missing module error.
Core navigation works.
```

- [ ] **Step 3: Verify runtime data location**

In the running app, scan articles after placing one test article in the runtime workspace.

Expected:

```text
The article appears in the UI.
The app writes generated state under the runtime workspace, not inside source-controlled repo data unless AUTO_PUBLISH_WORKSPACE points there.
```

**Acceptance Criteria:**
- A human can use the checklist to judge whether the alpha package is good enough to trial.
- Known alpha limitations are written down instead of hidden.

---

## Task 7: Final regression and commit

**Priority:** P2

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `electron-builder.alpha.yml`
- Create: `desktop/runtime-paths.js`
- Modify: `desktop/main.js`
- Modify: `scripts/config.js`
- Create: `tests/desktop-packaging.test.js`
- Modify: `docs/desktop-workbench.md`
- Create: `docs/alpha-packaging-checklist.md`

- [ ] **Step 1: Run full automated verification**

Run:

```powershell
node --test tests/*.test.js
cd media-workbench
npm run lint
npm run build
cd ..
npm run pack:alpha
```

Expected: all automated tests pass, TypeScript passes, renderer builds, portable alpha artifact is created.

- [ ] **Step 2: Check git status**

Run:

```powershell
git status --short
```

Expected: only packaging-related source/docs/test/config files are modified or created. `release-alpha/` should not appear.

- [ ] **Step 3: Commit**

Run:

```powershell
git add package.json package-lock.json electron-builder.alpha.yml desktop scripts tests docs .gitignore
git commit -m "chore: add alpha desktop packaging"
```

**Acceptance Criteria:**
- Packaging work is committed separately from feature/UI changes.
- Alpha artifact can be rebuilt from source with one command.
- Repo does not track generated package output or private runtime data.

---

## Self-Review

- Spec coverage: includes dependency/script setup, builder config, runtime writable paths, renderer build verification, package generation, manual alpha checklist, and final commit.
- Placeholder scan: no TBD/TODO placeholders; every task has explicit files, steps, commands, expected output, priority, and acceptance criteria.
- Risk control: excludes private runtime data, avoids code signing/autoupdate scope, and keeps `asar: false` for alpha to reduce filesystem risk.
- Scope: focused on local Windows alpha packaging only; production installer hardening can be planned later.
