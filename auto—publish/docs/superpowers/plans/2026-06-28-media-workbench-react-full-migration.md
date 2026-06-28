# Media Workbench React Full Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 Electron 媒体工作台迁移成 `media-workbench/` 那套 React UI，同时保留现有 `media:*` IPC、草稿存储、资源池和发布服务，让界面更易扩展、后续更容易改版。

**Architecture:** Electron 继续作为桌面壳和本地数据/发布服务入口，React 工作台负责所有可见界面与状态编排。`desktop/main.js` 只负责加载 React 静态产物，`desktop/preload.js` 继续暴露现有 `desktopConsole` API，React 通过一个薄适配层调用现有 IPC，不直接碰服务层。迁移过程采用“先并行跑通新 UI，再切换入口，最后清理旧 renderer”的顺序，避免一次性替换导致工作台不可用。

**Tech Stack:** Electron 33, React 19, Vite 6, TypeScript, Tailwind CSS v4, `lucide-react`, `motion`, existing `desktopConsole` IPC, `node:test`.

---

## Current Boundary Map

- `desktop/main.js`
  - Electron 主窗口入口，当前加载 `desktop/renderer/index.html`。
- `desktop/preload.js`
  - 现有 IPC 门面，暴露 `desktopConsole.media`, `.batch`, `.platforms`, `.orders`。
- `desktop/ipc/media-ipc.js`
  - 现有媒体相关 IPC 注册，已经覆盖文章扫描、草稿、资源池、资源分页、提交和订单同步。
- `desktop/renderer/*`
  - 当前生产中的原生 renderer，实现媒体工作台和其他平台工作台。
- `media-workbench/`
  - Gemini 生成的 React 设计稿，是新工作台的视觉和组件基础。

## Migration Principle

- 不重写服务层。
- 不改现有 `media:*` IPC 协议，除非 React 界面确实缺一个字段或动作。
- React UI 先覆盖媒体工作台，平台工作台继续留在旧 renderer，等媒体工作台稳定后再决定是否统一迁移。
- 旧 renderer 先保留作为回退，React 构建物和 Electron 入口切换完成后再清理。

---

### Task 1: Freeze the current Electron contracts and map the React UI to them

**Files:**
- Modify: `docs/desktop-workbench.md`
- Modify: `docs/media-workbench-ui.md` if needed
- Test: `tests/media-workbench-flow.test.js`
- Test: `tests/media-article-drawer-boundary.test.js`

- [ ] **Step 1: Record the contract in tests**

Add or update tests so the current renderer contract is explicit before migration starts.

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media workbench contract", function() {
  it("keeps the media IPC surface stable", function() {
    const preload = read("desktop/preload.js");
    const ipc = read("desktop/ipc/media-ipc.js");
    assert.ok(preload.includes('scanArticles: function()'));
    assert.ok(preload.includes('getResourcePage: function(opts)'));
    assert.ok(ipc.includes('ipcMain.handle("media:scan-articles"'));
    assert.ok(ipc.includes('ipcMain.handle("media:search-resource-page"'));
  });
});
```

- [ ] **Step 2: Run the contract tests**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/media-workbench-flow.test.js tests/media-article-drawer-boundary.test.js
```

Expected: PASS.

- [ ] **Step 3: Document what will stay stable**

Update `docs/desktop-workbench.md` so it explicitly says the React migration keeps:

```md
- `desktopConsole.media.*`
- draft storage shape
- resource pool behavior
- scan / preview / submit flows
```

---

### Task 2: Make the React app consume the existing Electron API

**Files:**
- Create: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/App.tsx`
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/components/ArticleList.tsx`
- Modify: `media-workbench/src/components/ArticleEditor.tsx`
- Modify: `media-workbench/src/components/ResourceLibrary.tsx`
- Modify: `media-workbench/src/components/Sidebar.tsx`

- [ ] **Step 1: Add a tiny API adapter**

Create `media-workbench/src/electron-api.ts` that maps the current `desktopConsole` API into a typed React-friendly interface.

```ts
export type ElectronMediaApi = {
  scanArticles(): Promise<any>;
  previewArticle(filename: string): Promise<any>;
  getDraft(filename: string): Promise<any>;
  setDraft(filename: string, draft: any): Promise<any>;
  refreshResources(opts?: any): Promise<any>;
  getResourcePage(opts?: any): Promise<any>;
  searchResourcePage(opts?: any): Promise<any>;
  getPool(): Promise<any>;
  addToPool(resource: any): Promise<any>;
  removeFromPool(resourceId: string): Promise<any>;
  getBalance(): Promise<any>;
};

export function getElectronMediaApi(): ElectronMediaApi {
  return (window as any).desktopConsole.media;
}
```

- [ ] **Step 2: Rewire `App.tsx` around real data**

Replace mock-only state with the existing Electron data flow:

```ts
const [articles, setArticles] = useState<Article[]>([]);
const [resources, setResources] = useState<MediaResource[]>([]);
const [orders, setOrders] = useState<Order[]>([]);
const [activeArticle, setActiveArticle] = useState<Article | null>(null);
```

Load the workspace by calling the adapter methods, then hydrate article selection, pool data, and balance from the IPC layer.

- [ ] **Step 3: Keep the three main components in the same roles as the current desktop app**

Map the Gemini components to the Electron workflow:

```tsx
<Sidebar ... />
<ArticleList ... />
<ArticleEditor ... />
<ResourceLibrary ... />
```

Keep the selected media logic exactly aligned with the current draft model:

```ts
selectedResources: MediaResource[]
```

and use the existing `onPickResource`, `onRemoveSelectedResource`, and `onSaveDraft` style callbacks.

- [ ] **Step 4: Update the types to match the actual draft shape**

Make sure `media-workbench/src/types.ts` includes the same fields the Electron layer already persists:

```ts
export interface Draft {
  filename: string;
  title: string;
  remark: string;
  ignoreImages: boolean;
  selectedResources: MediaResource[];
}
```

- [ ] **Step 5: Verify the React components compile against the adapter**

Run:

```powershell
cd media-workbench
npm run lint
npm run build
```

Expected: both pass.

---

### Task 3: Preserve Electron functionality behind the React shell

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js` if the React build needs any extra bridge
- Modify: `desktop/ipc/register.js` if preload assets move
- Create: `desktop/renderer/react-shell.html` or a similar loader page
- Modify: `desktop/renderer/index.html` only if the shell remains local

- [ ] **Step 1: Decide the new load target**

Choose one loader path and keep it stable:

```js
mainWindow.loadFile(path.join(__dirname, "..", "media-workbench", "dist", "index.html"));
```

or a copied production asset path under `desktop/renderer/`.

- [ ] **Step 2: Update the BrowserWindow load path**

Change `desktop/main.js` so the window loads the React build output instead of the old renderer HTML.

```js
mainWindow.loadFile(path.join(__dirname, "..", "media-workbench", "dist", "index.html"));
```

- [ ] **Step 3: Keep preload and IPC untouched unless the React build needs something new**

Retain:

```js
preload: path.join(__dirname, "preload.js"),
contextIsolation: true,
nodeIntegration: false
```

Only add new preload exports if the React app needs them.

- [ ] **Step 4: Verify the Electron app still boots**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' tests/media-workbench-flow.test.js
npm run desktop
```

Expected: the window opens on the React UI and still exposes the existing media actions.

---

### Task 4: Rebuild the workbench styling around the new visual system

**Files:**
- Modify: `media-workbench/src/index.css`
- Modify: `media-workbench/src/components/*.tsx`
- Modify: `media-workbench/src/App.tsx`
- Create: `media-workbench/src/components/workbench/*` if the file grows

- [ ] **Step 1: Port the visual language, not the old structure**

Keep the Gemini shell ideas:

```css
/* intentional example */
.sidebar { ... }
.workspace-shell { ... }
.resource-library { ... }
.article-editor { ... }
```

Do not mirror the old `desktop/renderer/styles.css` layout 1:1.

- [ ] **Step 2: Keep the critical workflow ergonomic**

Ensure the visible workflow remains:

```text
sidebar -> article list -> article editor -> shared resource library
```

with the resource library always visible when editing an article.

- [ ] **Step 3: Make the article summary cancelable**

Keep the summary rows in the editor and attach the remove action directly to the draft state.

```tsx
onRemoveSelectedResource(resource.resourceId)
```

- [ ] **Step 4: Re-run the React build after styling**

Run:

```powershell
cd media-workbench
npm run build
```

Expected: PASS.

---

### Task 5: Cut over, clean up, and lock the migration with tests

**Files:**
- Modify: `tests/media-workbench-flow.test.js`
- Modify: `tests/media-article-drawer-boundary.test.js`
- Modify: `tests/renderer-encoding.test.js`
- Modify: `docs/desktop-workbench.md`
- Modify: old `desktop/renderer/*` only if they remain as fallback shims

- [ ] **Step 1: Add end-to-end regression coverage**

Update the tests so they verify the new topology:

```js
assert.ok(read("desktop/main.js").includes("media-workbench/dist/index.html"));
assert.ok(read("desktop/preload.js").includes("desktopConsole"));
assert.ok(read("media-workbench/src/App.tsx").includes("ResourceLibrary"));
```

- [ ] **Step 2: Run the full repo test suite**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/*.test.js
```

Expected: PASS.

- [ ] **Step 3: Remove or quarantine the old renderer path**

Once the React UI is the production entry, either:

```js
// keep only as fallback reference
desktop/renderer/*
```

or redirect it to a tiny loader that points at the React build.

- [ ] **Step 4: Commit the migration**

Use a focused commit:

```powershell
git add media-workbench desktop tests docs
git commit -m "feat: migrate media workbench to react ui"
```

---

## Self-Review

- Spec coverage: UI migration, Electron loading, IPC reuse, draft behavior, resource selection, styling, and regression tests are all covered.
- Placeholder scan: no TBD/TODO placeholders or vague steps.
- Type consistency: `Article`, `Draft`, `MediaResource`, `desktopConsole.media`, and the existing `media:*` IPC names are used consistently.
- Scope check: this plan keeps the migration focused on the media workbench only; platform workbench is intentionally deferred.
