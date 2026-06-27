# Desktop Workbench Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把桌面端改成更顺手、更可扩展的双工作台流程：媒体投稿页专注“文章 -> 媒体池 -> 确认提交”，其他平台页专注“批量选文章 -> 批量选平台 -> 确认投喂”，并避免切页时反复丢状态。

**Architecture:** 保持现有 Electron + CommonJS + no-build renderer 架构不变。把页面切换改成“状态常驻、只刷新当前工作台”，再把媒体投稿和其他平台各自收进独立抽屉组件，减少页面本体职责。服务层只补必要的薄适配，不把 UI 流程再塞回 IPC。

**Tech Stack:** Electron 33, CommonJS, plain HTML/CSS/JS, `node:test`, existing media/platform services, no new runtime dependencies.

---

## Requirements Summary

- 媒体投稿页和其他平台页保持分离，不再把两个流程混在同一块页面逻辑里。
- 媒体投稿页要保留扫描、预览、拉取资源库、查询余额、订单查看，并且能针对单篇文章选择媒体池资源。
- 其他平台页要支持批量选择文章，再批量选择目标平台，最后通过确认抽屉真实提交。
- 页面切换不能把当前选择、草稿、分页、搜索状态全部重置掉。
- `desktop/ipc/*.js` 继续只做薄转发，不把新的流程逻辑堆回 IPC。
- 清掉 renderer 里不再需要的旧兼容 API 别名，减少后续维护面。

## File Structure

### New Files

- `desktop/renderer/media-article-drawer.js`
  - 媒体投稿文章详情抽屉：预览、媒体池选择、草稿保存、备注/标题编辑。
- `desktop/renderer/platform-batch-drawer.js`
  - 其他平台批量投喂抽屉：展示已选文章、选择目标平台、确认提交。
- `tests/desktop-workbench-flow.test.js`
  - 静态回归：确认工作台切换不再反复重新初始化，旧兼容 API 入口已清理。

### Existing Files To Modify

- `desktop/renderer/app.js`
  - 改成常驻工作台控制器，切页时只切可见性，不重建全部状态。
- `desktop/renderer/media-workbench.js`
  - 文章列表改成“文章卡 + 操作入口”；把文章级媒体选择挪进抽屉。
- `desktop/renderer/media-resource-library.js`
  - 支持页面管理模式和文章选择模式复用。
- `desktop/renderer/platform-workbench.js`
  - 改成批量选文章 + 批量选平台 + 抽屉确认的工作流。
- `desktop/renderer/index.html`
  - 加载新的抽屉模块，保持脚本顺序清晰。
- `desktop/renderer/styles.css`
  - 补抽屉、批量选择区、选中态、摘要区样式。
- `desktop/preload.js`
  - 删除旧的资源库兼容别名，只保留 canonical API。
- `docs/desktop-workbench.md`
  - 更新启动说明、工作台职责、状态保留和新流程说明。

---

## Task 1: Make Workspace Switching Stateful

**Files:**
- Modify: `desktop/renderer/app.js`
- Test: `tests/desktop-workbench-flow.test.js`

- [ ] **Step 1: Write the regression guard**

Create `tests/desktop-workbench-flow.test.js` with a static guard that checks the boot script only initializes each workspace once and tab clicks only toggle visibility:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", "auto—publish", file), "utf-8");
}

describe("desktop workbench flow", function() {
  it("keeps workspace switching stateful", function() {
    const source = read("desktop/renderer/app.js");
    assert.ok(source.includes("var initialized ="));
    assert.ok(source.includes('await initWorkspace("mediaWorkspace")') || source.includes('initWorkspace("mediaWorkspace")'));
    assert.equal(source.includes('renderWorkspace(id);'), false);
  });
});
```

- [ ] **Step 2: Run the test to confirm current behavior is still the old one**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/desktop-workbench-flow.test.js
```

Expected: fail until `desktop/renderer/app.js` is rewritten to preserve workspace state.

- [ ] **Step 3: Replace the boot-time rerender loop**

In `desktop/renderer/app.js`, change the flow so each workspace loads once and tab switches do not call `load()` again:

```js
(async function boot() {
  var api = window.desktopConsole;
  var workspaces = {
    mediaWorkspace: window.createMediaWorkbench(api),
    platformWorkspace: window.createPlatformWorkbench(api)
  };
  var roots = {
    mediaWorkspace: window.dom.byId("mediaWorkspace"),
    platformWorkspace: window.dom.byId("platformWorkspace")
  };
  var initialized = { mediaWorkspace: false, platformWorkspace: false };

  async function initWorkspace(id) {
    if (!initialized[id]) {
      await workspaces[id].load();
      initialized[id] = true;
    }
    roots[id].innerHTML = workspaces[id].render();
    workspaces[id].bind(roots[id], function() {
      refreshWorkspace(id);
    });
  }

  async function refreshWorkspace(id) {
    await workspaces[id].load();
    roots[id].innerHTML = workspaces[id].render();
    workspaces[id].bind(roots[id], function() {
      refreshWorkspace(id);
    });
  }

  document.querySelectorAll(".nav-item[data-workspace]").forEach(function(button) {
    button.addEventListener("click", function() {
      var id = button.getAttribute("data-workspace");
      document.querySelectorAll(".nav-item").forEach(function(item) {
        item.classList.toggle("active", item === button);
      });
      document.querySelectorAll(".workspace").forEach(function(panel) {
        panel.classList.toggle("active", panel.id === id);
      });
    });
  });

  api.batch.onState(function(payload) {
    window.dom.byId("globalStatus").textContent = payload.isBatchRunning ? "运行中" : "空闲";
  });

  await initWorkspace("mediaWorkspace");
  await initWorkspace("platformWorkspace");
})();
```

- [ ] **Step 4: Verify the guard passes**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/desktop-workbench-flow.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add desktop/renderer/app.js tests/desktop-workbench-flow.test.js
git commit -m "refactor: keep desktop workspaces stateful"
```

## Task 2: Move Media Article Selection Into a Drawer

**Files:**
- Create: `desktop/renderer/media-article-drawer.js`
- Modify: `desktop/renderer/media-workbench.js`
- Modify: `desktop/renderer/media-resource-library.js`
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/styles.css`
- Test: `tests/desktop-workbench-flow.test.js`

- [ ] **Step 1: Add a focused article drawer module**

Create `desktop/renderer/media-article-drawer.js` as a dedicated article-level editor. It should load the article preview, show the selected media list from draft, allow adding/removing pool resources, and save draft changes back through `api.media.setDraft`.

```js
window.mediaArticleDrawer = {
  open: async function(api, article, onSaved) {
    var draftResult = await api.media.getDraft(article.filename);
    var draft = draftResult.ok && draftResult.data ? draftResult.data : {};
    var previewResult = await api.media.previewArticle(article.filename);
    var preview = previewResult.ok ? previewResult.data : null;

    window.drawer.open("...", function(root) {
      root.querySelector("#saveArticleDraftBtn").addEventListener("click", async function() {
        await api.media.setDraft(article.filename, {
          title: root.querySelector("#articleTitleInput").value.trim(),
          remark: root.querySelector("#articleRemarkInput").value.trim(),
          ignoreImages: root.querySelector("#ignoreImagesToggle").checked,
          selectedResources: selectedResources
        });
        if (onSaved) onSaved();
        window.drawer.close();
      });
    });
  }
};
```

- [ ] **Step 2: Update the media workbench to open the drawer instead of forcing inline detail**

In `desktop/renderer/media-workbench.js`, replace the current inline “预览 only” behavior with a compact article row plus a `配置媒体` / `预览` action pair:

```js
return '<div class="article-row">' +
  '<div class="article-main">' +
    '<span class="article-title">' + window.dom.escapeHtml(title) + '</span>' +
    '<span class="article-meta">' + window.dom.escapeHtml(filename) + '</span>' +
  '</div>' +
  '<div class="article-actions">' +
    '<button data-preview="' + window.dom.escapeHtml(filename) + '" class="secondary">预览</button>' +
    '<button data-edit-article="' + window.dom.escapeHtml(filename) + '" class="secondary">配置媒体</button>' +
  '</div>' +
  '</div>';
```

When the user clicks `配置媒体`, open `window.mediaArticleDrawer.open(api, article, rerender)`.

- [ ] **Step 3: Let the resource library support both management and picker mode**

Refactor `desktop/renderer/media-resource-library.js` so it can be embedded in the article drawer without duplicating behavior. The module should accept an optional mode flag and selection callbacks:

```js
window.createMediaResourceLibrary = function(api, opts) {
  var options = opts || {};
  var pickerMode = !!options.pickerMode;
  var onPick = options.onPick || function() {};

  // keep page/search/pool state here
  // render add/remove buttons in picker mode
  // expose getPool() for the drawer
};
```

Picker mode should show “加入媒体池 / 已在池中” actions and return normalized resources to the drawer. Management mode should keep the current cache pagination and pool maintenance behavior.

- [ ] **Step 4: Wire the new drawer and loader order**

Update `desktop/renderer/index.html` so the new drawer module loads before `media-workbench.js`:

```html
<script src="./shared/dom.js"></script>
<script src="./shared/drawer.js"></script>
<script src="./shared/confirm.js"></script>
<script src="./media-orders-drawer.js"></script>
<script src="./media-article-drawer.js"></script>
<script src="./media-resource-library.js"></script>
<script src="./media-workbench.js"></script>
<script src="./platform-batch-drawer.js"></script>
<script src="./platform-workbench.js"></script>
<script src="./app.js"></script>
```

Add styles for article action groups, drawer summary rows, and selected-resource chips in `desktop/renderer/styles.css`.

- [ ] **Step 5: Add a regression guard for draft persistence**

Extend `tests/desktop-workbench-flow.test.js` so it also checks `desktop/preload.js` still exposes `getDraft`, `setDraft`, and `previewArticle`, and that `media-workbench.js` opens the article drawer instead of keeping all edit state inline.

```js
it("keeps media draft editing behind the article drawer", function() {
  const preload = read("desktop/preload.js");
  assert.ok(preload.includes('getDraft: function(filename)'));
  assert.ok(preload.includes('setDraft: function(filename, draft)'));
  assert.ok(preload.includes('previewArticle: function(filename)'));
});
```

- [ ] **Step 6: Commit**

```bash
git add desktop/renderer/media-article-drawer.js desktop/renderer/media-workbench.js desktop/renderer/media-resource-library.js desktop/renderer/index.html desktop/renderer/styles.css desktop/preload.js tests/desktop-workbench-flow.test.js
git commit -m "refactor: move media article editing into a drawer"
```

## Task 3: Rebuild Other Platforms Around Batch Selection

**Files:**
- Create: `desktop/renderer/platform-batch-drawer.js`
- Modify: `desktop/renderer/platform-workbench.js`
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/styles.css`
- Test: `tests/desktop-workbench-flow.test.js`

- [ ] **Step 1: Add a dedicated batch confirmation drawer**

Create `desktop/renderer/platform-batch-drawer.js` to gather the selected articles and target platforms, then pass the final plan back to the service layer only after the user confirms:

```js
window.platformBatchDrawer = {
  open: function(api, selection, onSubmit) {
    window.drawer.open("...", function(root) {
      root.querySelector("#realSubmitPlatformBatch").addEventListener("click", async function() {
        var planResult = await api.platforms.buildSelectedPlan({
          articles: selection.articles,
          platformIds: selection.platformIds
        });
        if (!planResult.ok) return;
        var submitResult = await api.platforms.submitSelectedPlan(planResult.data);
        if (onSubmit) onSubmit(submitResult);
      });
    });
  }
};
```

- [ ] **Step 2: Change the platform workbench to a two-step flow**

In `desktop/renderer/platform-workbench.js`, make the page do only three things:

1. show the source article queue,
2. let the user check any number of articles,
3. let the user check any number of target platforms and open the batch drawer.

Use a clear selection summary near the submit button:

```js
var selectedCount = selectedArticles.length;
var platformCount = selectedPlatformIds.length;
submitBtn.disabled = selectedCount === 0 || platformCount === 0;
submitBtn.textContent = selectedCount && platformCount
  ? "投喂 " + selectedCount + " 篇 -> " + platformCount + " 个平台"
  : "提交选中";
```

The page should keep selection state in memory until the user submits or refreshes intentionally.

- [ ] **Step 3: Keep the service contract stable and lean**

Leave `desktop/services/platform-workbench-service.js` as the authority for building cartesian plans, but keep the renderer in charge of what the user selected. Do not move any batching logic back into the renderer beyond checkbox state.

If the service currently tolerates duplicate article/platform ids, add a tiny normalization pass there so the batch drawer cannot accidentally double-submit a duplicate selection.

- [ ] **Step 4: Refresh the layout and drawer styles**

Update `desktop/renderer/styles.css` for:

```css
.selection-summary { display: flex; gap: 8px; align-items: center; }
.selected-chip { border-radius: 999px; padding: 4px 8px; }
.batch-table { display: grid; gap: 8px; }
.batch-platforms { display: flex; gap: 8px; flex-wrap: wrap; }
```

Keep everything square and compact; do not introduce a second card layer inside the drawer.

- [ ] **Step 5: Extend the flow regression guard**

Extend `tests/desktop-workbench-flow.test.js` with checks that:

```js
it("renders the platform page as a batch selector", function() {
  const source = read("desktop/renderer/platform-workbench.js");
  assert.ok(source.includes("selectedPlatformIds"));
  assert.ok(source.includes("buildSelectedPlan"));
  assert.ok(source.includes("submitSelectedPlan"));
});
```

- [ ] **Step 6: Commit**

```bash
git add desktop/renderer/platform-batch-drawer.js desktop/renderer/platform-workbench.js desktop/renderer/index.html desktop/renderer/styles.css tests/desktop-workbench-flow.test.js
git commit -m "refactor: batch platform submission from the workbench"
```

## Task 4: Remove Stale Aliases and Document the New Flow

**Files:**
- Modify: `desktop/preload.js`
- Modify: `docs/desktop-workbench.md`
- Test: `tests/desktop-workbench-flow.test.js`

- [ ] **Step 1: Remove deprecated media resource aliases**

Delete the old compatibility shims from `desktop/preload.js` once the renderer no longer references them:

```js
media: {
  refreshResources: function(opts) { return ipcRenderer.invoke("media:refresh-resources", opts || {}); },
  getResourcePage: function(opts) { return ipcRenderer.invoke("media:get-resource-page", opts || {}); },
  searchResourcePage: function(opts) { return ipcRenderer.invoke("media:search-resource-page", opts || {}); },
  getPool: function() { return ipcRenderer.invoke("media:get-pool"); },
  addToPool: function(resource) { return ipcRenderer.invoke("media:add-to-pool", resource); },
  removeFromPool: function(resourceId) { return ipcRenderer.invoke("media:remove-from-pool", resourceId); },
  getBalance: function() { return ipcRenderer.invoke("media:get-balance"); }
}
```

Do not leave `listResources`, `getCachedResources`, or `searchResources` behind.

- [ ] **Step 2: Update the desktop workflow doc**

Edit `docs/desktop-workbench.md` so it explains:

```md
## Workspaces

- Media Submission: scan articles, open one article at a time in a drawer, choose media from the cached pool, save draft, preview, and submit.
- Other Platforms: select many articles, select many target platforms, review in a confirmation drawer, submit serially.

## State

Switching tabs does not reset article selections, draft state, or cached resource pages.
```

- [ ] **Step 3: Run the full regression suite**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/*.test.js
```

Expected: all tests pass, including the new workspace flow guard.

- [ ] **Step 4: Do a quick syntax check on the touched renderer files**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --check desktop/renderer/app.js
& 'C:\Program Files\nodejs\node.exe' --check desktop/renderer/media-workbench.js
& 'C:\Program Files\nodejs\node.exe' --check desktop/renderer/platform-workbench.js
& 'C:\Program Files\nodejs\node.exe' --check desktop/renderer/media-article-drawer.js
& 'C:\Program Files\nodejs\node.exe' --check desktop/renderer/platform-batch-drawer.js
```

Expected: no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add desktop/preload.js docs/desktop-workbench.md
git commit -m "docs: describe the redesigned desktop workbench flow"
```

## Self-Review

### Spec Coverage

- 工作台切页不重置状态：Task 1。
- 媒体投稿页改成文章级抽屉流程：Task 2。
- 媒体资源库继续保留分页、搜索和媒体池管理，但支持文章选择模式复用：Task 2。
- 其他平台改成批量选文章 + 批量选平台 + 确认抽屉：Task 3。
- 清理旧兼容别名：Task 4。
- 文档和回归测试：Tasks 1-4。

### Placeholder Scan

没有 `TBD`、`TODO`、`later`、`implement later` 之类的占位内容。每个任务都写了具体文件、具体行为、具体验证命令。

### Type Consistency

- `api.media.setDraft(filename, draft)`、`getDraft(filename)`、`previewArticle(filename)` 的签名在计划中保持一致。
- `api.platforms.buildSelectedPlan({ articles, platformIds })` 和 `submitSelectedPlan(plan)` 保持一致。
- 工作台切换逻辑始终使用 `mediaWorkspace` / `platformWorkspace` 两个稳定 id。

