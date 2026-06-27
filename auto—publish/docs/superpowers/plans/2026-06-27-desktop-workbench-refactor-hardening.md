# Desktop Workbench Refactor Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Desktop Workbench refactor by moving remaining media-domain logic out of IPC/renderer into focused services with stable DTOs.

**Architecture:** Keep the completed two-workspace Electron UI and no-build CommonJS stack. Make `desktop/ipc/*.js` thin transport adapters, make services own resource normalization, order view models, scan/preview, and pagination, and make renderer modules consume stable DTOs only.

**Tech Stack:** Electron 33, CommonJS, plain HTML/CSS/JS, Node built-ins, `node:test`, existing media stores/client/adapters, `mammoth`, `dotenv`, `form-data`.

---

## Requirements Summary

- Preserve existing Desktop workspaces: Media Submission and Other Platforms.
- Do not introduce React, Vite, TypeScript, or new runtime dependencies.
- Keep `electron`, `dotenv`, `form-data`, and `mammoth`.
- Reduce `desktop/ipc/media-ipc.js` from business-heavy handlers to thin `wrap(service.method)` handlers.
- Normalize media resources once in service layer:
  - API fields: `resource_id`, `title`, `price`
  - Pool/draft fields: `resourceId`, `name`, `price`
  - Renderer DTO: `{ resourceId, name, price, remarks, publishRate, publishTime, caseLink, raw }`
- Resource library must read from local cache by default, show 20 items per page, search against cache, and not load/render all 11k+ rows at once.
- Orders drawer must consume normalized order DTOs:
  - `{ title, filename, orderNid, statusCode, statusLabel, submittedAt, publishedAt, resourceName, price, raw }`
- Media scan and preview must be owned by `media-workbench-service`, not duplicated in IPC.
- Add a renderer encoding guard so mojibake such as `濯掍綋`, `璧勬簮`, `涓婁`, `楼`, `脳` fails tests.
- Keep behavior serial: final confirmation before real submit, serial media submission, stop prevents new tasks.

## File Structure

### New Files

- `desktop/services/media-resource-service.js`
  - Owns media resource normalization, API fetch-to-cache, cached pagination, cached search, pool add/remove, and balance query.
- `tests/media-resource-service.test.js`
  - Verifies field normalization, cached pagination, cached search, fetch-all loop, and pool display DTOs.
- `tests/media-order-service.test.js`
  - Verifies normalized order view DTOs, status labels, submitted/published time extraction, and sync update behavior.
- `tests/media-ipc-thin.test.js`
  - Static guard, added after scan/preview migration, that `desktop/ipc/media-ipc.js` no longer imports `fs`, `mammoth`, `MediaClient`, or `detectDocxImages`.
- `tests/renderer-encoding.test.js`
  - Static guard for renderer UTF-8 text and known mojibake patterns.

### Existing Files To Modify

- `desktop/ipc/media-ipc.js`
  - Replace resource/order/scan/preview business logic with service calls.
- `desktop/services/media-workbench-service.js`
  - Add `previewArticle(filename)`.
  - Ensure `scanArticles()` is the only media article scanner.
- `desktop/services/media-order-service.js`
  - Add `listOrderViews()` returning renderer-ready DTOs.
- `desktop/renderer/media-resource-library.js`
  - Consume paginated DTO result from `api.media.getResourcePage()`.
- `desktop/renderer/media-workbench.js`
  - Call `api.media.refreshResources()` instead of `api.media.listResources()`.
- `desktop/renderer/media-orders-drawer.js`
  - Render service-provided order DTOs.
- `desktop/preload.js`
  - Replace resource API names with `refreshResources`, `getResourcePage`, and `searchResourcePage`.
- `docs/desktop-workbench.md`
  - Document resource cache and service boundaries.

## Task 1: Add Renderer Encoding Guard

**Files:**
- Create: `tests/renderer-encoding.test.js`
- Modify: `desktop/renderer/media-resource-library.js`

- [ ] **Step 1: Write the encoding guard test**

Create `tests/renderer-encoding.test.js`:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const rendererDir = path.resolve(__dirname, "..", "desktop", "renderer");
const files = [
  "index.html",
  "app.js",
  "media-workbench.js",
  "media-resource-library.js",
  "media-orders-drawer.js",
  "platform-workbench.js",
  "shared/confirm.js",
  "shared/dom.js",
  "shared/drawer.js"
];

const mojibakePatterns = [
  "濯掍綋",
  "璧勬簮",
  "涓婁",
  "涓嬩",
  "鍔犲",
  "绗?",
  "椤?",
  "楼",
  "脳",
  "鐘舶"
];

describe("renderer encoding", function() {
  it("has no UTF-8 replacement characters or known mojibake fragments", function() {
    files.forEach(function(file) {
      const filePath = path.join(rendererDir, file);
      const text = fs.readFileSync(filePath, "utf-8");
      assert.equal(text.includes("\uFFFD"), false, file + " contains replacement characters");
      mojibakePatterns.forEach(function(pattern) {
        assert.equal(text.includes(pattern), false, file + " contains mojibake: " + pattern);
      });
    });
  });

  it("keeps expected Chinese labels readable", function() {
    const index = fs.readFileSync(path.join(rendererDir, "index.html"), "utf-8");
    const mediaWorkbench = fs.readFileSync(path.join(rendererDir, "media-workbench.js"), "utf-8");
    const resourceLibrary = fs.readFileSync(path.join(rendererDir, "media-resource-library.js"), "utf-8");
    const orders = fs.readFileSync(path.join(rendererDir, "media-orders-drawer.js"), "utf-8");

    assert.match(index, /媒体投稿/);
    assert.match(index, /其他平台/);
    assert.match(mediaWorkbench, /拉取资源库/);
    assert.match(mediaWorkbench, /查询余额/);
    assert.match(resourceLibrary, /资源库/);
    assert.match(resourceLibrary, /上一页/);
    assert.match(resourceLibrary, /下一页/);
    assert.match(orders, /投稿订单/);
  });
});
```

- [ ] **Step 2: Run the test to verify current renderer text**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/renderer-encoding.test.js
```

Expected before fixing current renderer text: fails if `desktop/renderer/media-resource-library.js` still contains mojibake.

- [ ] **Step 3: Fix current resource-library text**

In `desktop/renderer/media-resource-library.js`, ensure these exact readable strings are present:

```js
'<div class="panel-head"><h2>媒体池</h2><button id="refreshMediaPool" class="secondary">刷新</button></div>'
'<p class="empty-state">资源库暂无数据，请点击顶部的「拉取资源库」按钮获取最新资源。</p>'
'<span class="count-pill">¥' + window.dom.escapeHtml(String(resource.price || "?")) + '</span>'
'<span>已在池中</span>'
'<button data-add-pool="' + window.dom.escapeHtml(String(id)) + '" class="secondary">加入池</button>'
'<button id="prevPageBtn" class="secondary" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button>'
'<span class="page-info">第 ' + page + ' / ' + totalPages + ' 页（共 ' + library.length + ' 条）</span>'
'<button id="nextPageBtn" class="secondary" ' + (page * perPage >= library.length ? 'disabled' : '') + '>下一页</button>'
'<div class="panel-head"><h2>资源库</h2><input id="resourceSearchInput" type="text" placeholder="搜索媒体名称..." class="media-search"></div>'
```

- [ ] **Step 4: Verify the guard passes**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/renderer-encoding.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add tests/renderer-encoding.test.js desktop/renderer/media-resource-library.js
git commit -m "test: guard desktop renderer text encoding"
```

## Task 2: Create Media Resource Service

**Files:**
- Create: `desktop/services/media-resource-service.js`
- Test: `tests/media-resource-service.test.js`

- [ ] **Step 1: Write failing service tests**

Create `tests/media-resource-service.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { MediaResourceStore } = require("../src/platforms/media/media-resource-store");
const { MediaPoolStore } = require("../src/platforms/media/media-pool-store");
const { createMediaResourceService } = require("../desktop/services/media-resource-service");

describe("media-resource-service", function() {
  let root;
  let resourceStore;
  let poolStore;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "media-resource-service-"));
    resourceStore = new MediaResourceStore({ filePath: path.join(root, "resources.json") });
    poolStore = new MediaPoolStore({ filePath: path.join(root, "pool.json") });
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("normalizes API resource fields into renderer DTOs", function() {
    const service = createMediaResourceService({ resourceStore: resourceStore, poolStore: poolStore });
    const dto = service.normalizeResource({
      resource_id: 73880,
      title: "中华网生活",
      price: "29.00",
      remarks: "图片默认删除",
      publish_rate: "75",
      publish_time: 7777,
      case_link: "http://example.test"
    });
    assert.equal(dto.resourceId, "73880");
    assert.equal(dto.name, "中华网生活");
    assert.equal(dto.price, "29.00");
    assert.equal(dto.remarks, "图片默认删除");
    assert.equal(dto.publishRate, "75");
    assert.equal(dto.publishTime, 7777);
    assert.equal(dto.caseLink, "http://example.test");
  });

  it("returns cached resources one page at a time", function() {
    resourceStore.setAll([
      { resource_id: 1, title: "A", price: "1.00" },
      { resource_id: 2, title: "B", price: "2.00" },
      { resource_id: 3, title: "C", price: "3.00" }
    ], { total: 3 });
    const service = createMediaResourceService({ resourceStore: resourceStore, poolStore: poolStore });
    const page = service.getCachedResourcePage({ page: 2, pageSize: 2 });
    assert.equal(page.total, 3);
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 2);
    assert.equal(page.totalPages, 2);
    assert.deepStrictEqual(page.items.map(function(item) { return item.name; }), ["C"]);
  });

  it("searches cached resources and paginates results", function() {
    resourceStore.setAll([
      { resource_id: 1, title: "中华网生活", price: "29.00" },
      { resource_id: 2, title: "山东商报", price: "17.00" },
      { resource_id: 3, title: "中华商业网", price: "9.00" }
    ], { total: 3 });
    const service = createMediaResourceService({ resourceStore: resourceStore, poolStore: poolStore });
    const page = service.searchResourcePage({ keyword: "中华", page: 1, pageSize: 20 });
    assert.deepStrictEqual(page.items.map(function(item) { return item.name; }), ["中华网生活", "中华商业网"]);
  });

  it("fetches all API pages and caches raw resources", async function() {
    const calls = [];
    const client = {
      mediaList: async function(opts) {
        calls.push(opts.page);
        if (opts.page === 1) return { data: [{ resource_id: 1, title: "A", price: "1" }, { resource_id: 2, title: "B", price: "2" }] };
        if (opts.page === 2) return { data: [{ resource_id: 3, title: "C", price: "3" }] };
        return { data: [] };
      }
    };
    const service = createMediaResourceService({ resourceStore: resourceStore, poolStore: poolStore, clientFactory: function() { return client; } });
    const result = await service.refreshResources({ fetchAll: true, pageSizeHint: 2, maxPages: 10 });
    assert.deepStrictEqual(calls, [1, 2]);
    assert.equal(result.count, 3);
    assert.equal(resourceStore.getAll().resources.length, 3);
  });

  it("adds normalized resources to pool and returns pool DTOs by name", function() {
    const service = createMediaResourceService({ resourceStore: resourceStore, poolStore: poolStore });
    service.addToPool({ resourceId: "73880", name: "中华网生活", price: "29.00" });
    const pool = service.getPool();
    assert.deepStrictEqual(pool.map(function(item) { return item.name; }), ["中华网生活"]);
    assert.deepStrictEqual(pool.map(function(item) { return item.resourceId; }), ["73880"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/media-resource-service.test.js
```

Expected: fails because `desktop/services/media-resource-service.js` does not exist.

- [ ] **Step 3: Implement media resource service**

Create `desktop/services/media-resource-service.js`:

```js
const { MediaClient } = require("../../src/platforms/media/media-client");
const { resolveApiKey } = require("../../src/platforms/media/config");

function asPositiveInt(value, fallback) {
  var n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function createMediaResourceService(opts) {
  var options = opts || {};
  var resourceStore = options.resourceStore;
  var poolStore = options.poolStore;
  var clientFactory = options.clientFactory || function() {
    return new MediaClient({ apiKey: resolveApiKey(null) });
  };

  function normalizeResource(resource) {
    var raw = resource || {};
    var resourceId = raw.resourceId || raw.resource_id || raw.id;
    return {
      resourceId: String(resourceId == null ? "" : resourceId),
      name: raw.name || raw.title || raw.resourceName || "",
      price: raw.price == null ? "" : String(raw.price),
      remarks: raw.remarks || raw.remark || "",
      publishRate: raw.publishRate || raw.publish_rate || "",
      publishTime: raw.publishTime || raw.publish_time || "",
      caseLink: raw.caseLink || raw.case_link || "",
      raw: raw.raw || raw
    };
  }

  function normalizePage(items, page, pageSize, total, updatedAt) {
    var safePageSize = asPositiveInt(pageSize, 20);
    var safePage = asPositiveInt(page, 1);
    return {
      page: safePage,
      pageSize: safePageSize,
      total: total || 0,
      totalPages: Math.max(1, Math.ceil((total || 0) / safePageSize)),
      updatedAt: updatedAt || null,
      items: (items || []).map(normalizeResource)
    };
  }

  function paginate(resources, opts) {
    var options = opts || {};
    var pageSize = asPositiveInt(options.pageSize, 20);
    var page = asPositiveInt(options.page, 1);
    var start = (page - 1) * pageSize;
    return { page: page, pageSize: pageSize, items: resources.slice(start, start + pageSize), total: resources.length };
  }

  function getCachedResourcePage(opts) {
    var data = resourceStore.getAll() || { resources: [], updatedAt: null };
    var sliced = paginate(data.resources || [], opts || {});
    return normalizePage(sliced.items, sliced.page, sliced.pageSize, sliced.total, data.updatedAt);
  }

  function searchResourcePage(opts) {
    var options = opts || {};
    var keyword = String(options.keyword || "").trim().toLowerCase();
    var data = resourceStore.getAll() || { resources: [], updatedAt: null };
    var matched = (data.resources || []).filter(function(resource) {
      if (!keyword) return true;
      var dto = normalizeResource(resource);
      return String(dto.name).toLowerCase().indexOf(keyword) !== -1 ||
        String(dto.remarks).toLowerCase().indexOf(keyword) !== -1;
    });
    var sliced = paginate(matched, options);
    return normalizePage(sliced.items, sliced.page, sliced.pageSize, sliced.total, data.updatedAt);
  }

  function extractPageItems(response) {
    if (!response || !response.data) return [];
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.data.list)) return response.data.list;
    if (Array.isArray(response.data.data)) return response.data.data;
    return [];
  }

  async function refreshResources(opts) {
    var options = opts || {};
    var fetchAll = options.fetchAll !== false;
    var maxPages = asPositiveInt(options.maxPages, 1000);
    var pageSizeHint = asPositiveInt(options.pageSizeHint, 20);
    var client = clientFactory();
    var allResources = [];
    var page = 1;
    while (page <= maxPages) {
      var items = extractPageItems(await client.mediaList({ page: page }));
      if (items.length === 0) break;
      allResources = allResources.concat(items);
      if (!fetchAll || items.length < pageSizeHint) break;
      page++;
    }
    if (allResources.length === 0) {
      throw new Error("API 返回空媒体列表，请检查 API Key 是否有效");
    }
    resourceStore.setAll(allResources, { total: allResources.length, fetchedPages: page });
    return { count: allResources.length, updatedAt: resourceStore.getAll().updatedAt, fetchedPages: page };
  }

  function getPool() {
    return (poolStore.getAll() || []).map(normalizeResource);
  }

  function addToPool(resource) {
    var dto = normalizeResource(resource);
    poolStore.add({ id: dto.resourceId, name: dto.name, price: dto.price, raw: dto.raw });
    return { added: true, resource: dto };
  }

  function removeFromPool(resourceId) {
    poolStore.remove(resourceId);
    return { removed: true };
  }

  async function getBalance() {
    var response = await clientFactory().getBalance();
    var balanceData = response && response.data ? response.data : {};
    return { balance: balanceData.money || "0", powerCount: balanceData.power_count || 0, raw: response };
  }

  return {
    normalizeResource: normalizeResource,
    getCachedResourcePage: getCachedResourcePage,
    searchResourcePage: searchResourcePage,
    refreshResources: refreshResources,
    getPool: getPool,
    addToPool: addToPool,
    removeFromPool: removeFromPool,
    getBalance: getBalance
  };
}

module.exports = { createMediaResourceService };
```

- [ ] **Step 4: Verify service test passes**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/media-resource-service.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add desktop/services/media-resource-service.js tests/media-resource-service.test.js
git commit -m "feat: add media resource service"
```

## Task 3: Move Resource IPC To Thin Service Calls

**Files:**
- Modify: `desktop/ipc/media-ipc.js`
- Modify: `desktop/preload.js`

- [ ] **Step 1: Update preload API names**

Modify `desktop/preload.js` media group:

```js
media: {
  scanArticles: function() { return ipcRenderer.invoke("media:scan-articles"); },
  previewArticle: function(filename) { return ipcRenderer.invoke("media:preview-article", filename); },
  getDrafts: function() { return ipcRenderer.invoke("media:get-drafts"); },
  getDraft: function(filename) { return ipcRenderer.invoke("media:get-draft", filename); },
  setDraft: function(filename, draft) { return ipcRenderer.invoke("media:set-draft", filename, draft); },
  removeDraft: function(filename) { return ipcRenderer.invoke("media:remove-draft", filename); },
  buildConfirmation: function(articles) { return ipcRenderer.invoke("media:build-confirmation", articles); },
  submitSelected: function(articles) { return ipcRenderer.invoke("media:submit-selected", articles); },
  stopSubmit: function() { return ipcRenderer.invoke("media:stop-submit"); },
  refreshResources: function(opts) { return ipcRenderer.invoke("media:refresh-resources", opts || {}); },
  getResourcePage: function(opts) { return ipcRenderer.invoke("media:get-resource-page", opts || {}); },
  searchResourcePage: function(opts) { return ipcRenderer.invoke("media:search-resource-page", opts || {}); },
  getPool: function() { return ipcRenderer.invoke("media:get-pool"); },
  addToPool: function(resource) { return ipcRenderer.invoke("media:add-to-pool", resource); },
  removeFromPool: function(resourceId) { return ipcRenderer.invoke("media:remove-from-pool", resourceId); },
  getBalance: function() { return ipcRenderer.invoke("media:get-balance"); }
}
```

- [ ] **Step 2: Replace resource handlers in `media-ipc.js`**

At the top of `desktop/ipc/media-ipc.js`, remove:

```js
const { MediaClient } = require("../../src/platforms/media/media-client");
const { resolveApiKey } = require("../../src/platforms/media/config");
```

Add:

```js
const { wrap } = require("../services/ipc-response");
const { createMediaResourceService } = require("../services/media-resource-service");
```

Inside `registerMediaIpc`, create the service:

```js
var mediaResourceService = createMediaResourceService({
  resourceStore: mediaResourceStore,
  poolStore: mediaPoolStore
});
```

Replace old resource handlers with the new channels:

```js
ipcMain.handle("media:refresh-resources", function(event, opts) {
  return wrap(function() { return mediaResourceService.refreshResources(opts || {}); });
});

ipcMain.handle("media:get-resource-page", function(event, opts) {
  return wrap(function() { return mediaResourceService.getCachedResourcePage(opts || {}); });
});

ipcMain.handle("media:search-resource-page", function(event, opts) {
  return wrap(function() { return mediaResourceService.searchResourcePage(opts || {}); });
});

ipcMain.handle("media:get-pool", function() {
  return wrap(function() { return mediaResourceService.getPool(); });
});

ipcMain.handle("media:add-to-pool", function(event, resource) {
  return wrap(function() { return mediaResourceService.addToPool(resource); });
});

ipcMain.handle("media:remove-from-pool", function(event, resourceId) {
  return wrap(function() { return mediaResourceService.removeFromPool(resourceId); });
});

ipcMain.handle("media:get-balance", function() {
  return wrap(function() { return mediaResourceService.getBalance(); });
});
```

Keep temporary compatibility channels until Task 4 migrates the renderer:

```js
ipcMain.handle("media:list-resources", function(event, opts) {
  return wrap(function() { return mediaResourceService.refreshResources(opts || {}); });
});

ipcMain.handle("media:get-cached-resources", function() {
  return wrap(function() { return mediaResourceService.getCachedResourcePage({ page: 1, pageSize: 20 }); });
});

ipcMain.handle("media:search-resources", function(event, keyword) {
  return wrap(function() {
    return mediaResourceService.searchResourcePage({ keyword: keyword, page: 1, pageSize: 20 }).items;
  });
});
```

- [ ] **Step 3: Verify focused service tests still pass**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/media-resource-service.test.js
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add desktop/ipc/media-ipc.js desktop/preload.js
git commit -m "refactor: route media resource IPC through service"
```

## Task 4: Update Resource Library Renderer To Consume Service Pages

**Files:**
- Modify: `desktop/renderer/media-resource-library.js`
- Modify: `desktop/renderer/media-workbench.js`
- Modify: `desktop/renderer/styles.css`

- [ ] **Step 1: Replace renderer-owned raw cache state**

In `desktop/renderer/media-resource-library.js`, keep state as view state only:

```js
var pool = [];
var pageData = { page: 1, pageSize: 20, total: 0, totalPages: 1, items: [] };
var keyword = "";
var page = 1;
var pageSize = 20;
```

Replace `load()` with:

```js
async function load() {
  var poolResult = await api.media.getPool();
  pool = poolResult.ok ? poolResult.data || [] : [];
  var result = keyword
    ? await api.media.searchResourcePage({ keyword: keyword, page: page, pageSize: pageSize })
    : await api.media.getResourcePage({ page: page, pageSize: pageSize });
  pageData = result.ok ? result.data : { page: page, pageSize: pageSize, total: 0, totalPages: 1, items: [] };
  return pool;
}
```

- [ ] **Step 2: Render only service DTOs**

In `render()`, use:

```js
var items = pageData.items || [];
var totalPages = pageData.totalPages || 1;
var total = pageData.total || 0;
```

Each row must use:

```js
var id = resource.resourceId;
var inPool = pool.some(function(p) { return String(p.resourceId) === String(id); });
return '<div class="resource-row">' +
  '<span>' + window.dom.escapeHtml(resource.name || String(id)) + '</span>' +
  '<span class="count-pill">¥' + window.dom.escapeHtml(resource.price || "?") + '</span>' +
  (inPool ? '<span>已在池中</span>' : '<button data-add-pool="' + window.dom.escapeHtml(String(id)) + '" class="secondary">加入池</button>') +
  '</div>';
```

Pagination text:

```js
'<span class="page-info">第 ' + pageData.page + ' / ' + totalPages + ' 页（共 ' + total + ' 条）</span>'
```

- [ ] **Step 3: Wire pagination with service reload**

Use async reloads in bind:

```js
if (prevBtn) prevBtn.addEventListener("click", async function() {
  if (page > 1) {
    page--;
    await load();
    rerender();
  }
});
if (nextBtn) nextBtn.addEventListener("click", async function() {
  if (page < (pageData.totalPages || 1)) {
    page++;
    await load();
    rerender();
  }
});
```

For search input:

```js
if (searchInput) searchInput.addEventListener("change", async function() {
  keyword = searchInput.value.trim();
  page = 1;
  await load();
  rerender();
});
```

- [ ] **Step 4: Update fetch button in media workbench**

In `desktop/renderer/media-workbench.js`, replace:

```js
var result = await api.media.listResources({ fetchAll: true });
```

with:

```js
var result = await api.media.refreshResources({ fetchAll: true });
```

- [ ] **Step 5: Verify JS syntax**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --check desktop/renderer/media-resource-library.js
& 'C:\Program Files\nodejs\node.exe' --check desktop/renderer/media-workbench.js
```

Expected: no output and exit code 0.

- [ ] **Step 6: Commit**

```bash
git add desktop/renderer/media-resource-library.js desktop/renderer/media-workbench.js desktop/renderer/styles.css
git commit -m "refactor: render media resources from paged service DTOs"
```

## Task 5: Move Media Scan And Preview Into Media Workbench Service

**Files:**
- Modify: `desktop/services/media-workbench-service.js`
- Modify: `desktop/ipc/media-ipc.js`
- Test: `tests/media-workbench-service.test.js`
- Test: `tests/media-ipc-thin.test.js`

- [ ] **Step 1: Add preview service test**

Append to `tests/media-workbench-service.test.js`:

```js
it("previews text articles from the media input directory", async function() {
  fs.writeFileSync(path.join(inputDir, "preview.md"), "# Preview Title\n\nPreview Body", "utf-8");
  const preview = await service.previewArticle("preview.md");
  assert.equal(preview.filename, "preview.md");
  assert.equal(preview.title, "Preview Title");
  assert.match(preview.content, /Preview Body/);
});

it("rejects preview paths outside the media input directory", async function() {
  await assert.rejects(
    function() { return service.previewArticle("../secret.txt"); },
    /Invalid filename/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/media-workbench-service.test.js
```

Expected: fails because `previewArticle` does not exist.

- [ ] **Step 3: Implement `previewArticle(filename)`**

In `desktop/services/media-workbench-service.js`, add:

```js
function assertSafeFilename(filename) {
  var normalized = String(filename || "");
  if (!normalized || normalized.indexOf("..") !== -1 || path.basename(normalized) !== normalized) {
    throw new Error("Invalid filename");
  }
  return normalized;
}

async function previewArticle(filename) {
  var safeName = assertSafeFilename(filename);
  var filePath = path.join(inputDir, safeName);
  if (!fs.existsSync(filePath)) throw new Error("File not found: " + safeName);
  var ext = path.extname(safeName).toLowerCase();
  var content = "";
  if (ext === ".docx") {
    try {
      var result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
      content = (result && result.value || "").trim();
    } catch (error) {
      content = "[Cannot read .docx: " + error.message + "]";
    }
  } else if (ext === ".txt" || ext === ".md") {
    content = fs.readFileSync(filePath, "utf-8").trim();
  } else {
    throw new Error("Unsupported article type: " + ext);
  }
  var draft = draftStore.get(safeName) || {};
  return {
    filename: safeName,
    title: draft.title || firstTextLine(content) || path.basename(safeName, ext),
    content: content,
    selectedResources: draft.selectedResources || []
  };
}
```

Add it to the returned object.

- [ ] **Step 4: Replace scan and preview handlers in IPC**

In `desktop/ipc/media-ipc.js`, replace `media:scan-articles` and `media:preview-article` handlers with:

```js
ipcMain.handle("media:scan-articles", function() {
  return wrap(function() { return mediaWorkbenchService.scanArticles(); });
});

ipcMain.handle("media:preview-article", function(event, filename) {
  return wrap(function() { return mediaWorkbenchService.previewArticle(filename); });
});
```

Remove all direct `fs`, media input scanning, `mammoth`, and `detectDocxImages` logic from IPC.

- [ ] **Step 5: Add static IPC boundary test**

Create `tests/media-ipc-thin.test.js`:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("media IPC boundaries", function() {
  it("does not own media resource/client/file parsing business logic", function() {
    const source = fs.readFileSync(path.resolve(__dirname, "..", "desktop", "ipc", "media-ipc.js"), "utf-8");
    [
      'require("fs")',
      'require("../../src/platforms/media/media-client")',
      'detectDocxImages',
      'require("mammoth")',
      'fs.readdirSync',
      'fs.readFileSync'
    ].forEach(function(pattern) {
      assert.equal(source.includes(pattern), false, "media-ipc.js still contains " + pattern);
    });
  });
});
```

- [ ] **Step 6: Verify service and IPC boundary tests pass**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/media-workbench-service.test.js tests/media-ipc-thin.test.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add desktop/services/media-workbench-service.js desktop/ipc/media-ipc.js tests/media-workbench-service.test.js tests/media-ipc-thin.test.js
git commit -m "refactor: move media scan and preview into service"
```

## Task 6: Normalize Order Views In Media Order Service

**Files:**
- Modify: `desktop/services/media-order-service.js`
- Modify: `desktop/ipc/media-ipc.js`
- Modify: `desktop/renderer/media-orders-drawer.js`
- Test: `tests/media-order-service.test.js`

- [ ] **Step 1: Write failing order view tests**

Create `tests/media-order-service.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createMediaOrderService } = require("../desktop/services/media-order-service");

describe("media-order-service", function() {
  let root;
  let storePath;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "media-order-service-"));
    storePath = path.join(root, "submission-orders.jsonl");
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns renderer-ready order view DTOs", function() {
    fs.writeFileSync(storePath, JSON.stringify({
      ts: "2026-06-25T15:00:03.783Z",
      command: "submit",
      params: {
        resource_id: "874630",
        title: "非遗、老字号",
        content_file: "F:\\官媒投稿\\auto—publish\\input\\media\\非遗、老字号.docx"
      },
      result: {
        success: true,
        data: { code: 1, data: { order_nid: "2026062523000300181659" } },
        syncStatus: "2",
        syncRaw: {
          data: [{
            order_nid: "2026062523000300181659",
            status: 2,
            price: "17.00",
            title: "非遗、老字号",
            order_url: "http://example.test/article.html"
          }]
        }
      }
    }) + "\n", "utf-8");

    const service = createMediaOrderService({ storePath: storePath });
    const views = service.listOrderViews();
    assert.equal(views[0].title, "非遗、老字号");
    assert.equal(views[0].filename, "非遗、老字号.docx");
    assert.equal(views[0].orderNid, "2026062523000300181659");
    assert.equal(views[0].statusCode, "2");
    assert.equal(views[0].statusLabel, "已发布");
    assert.equal(views[0].submittedAt, "2026-06-25 15:00:03");
    assert.equal(views[0].publishedAt, "2026-06-25 15:00:03");
    assert.equal(views[0].resourceId, "874630");
    assert.equal(views[0].price, "17.00");
    assert.equal(views[0].orderUrl, "http://example.test/article.html");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/media-order-service.test.js
```

Expected: fails because `listOrderViews()` does not exist.

- [ ] **Step 3: Implement order view normalization**

In `desktop/services/media-order-service.js`, add helper functions:

```js
function basename(filePath) {
  return path.basename(String(filePath || "").replace(/\\/g, "/"));
}

function formatIso(value) {
  if (!value) return "";
  return String(value).replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function statusLabel(statusCode) {
  var labels = { "0": "待审核", "1": "审核中", "2": "已发布", "3": "驳回", "4": "退款" };
  return labels[String(statusCode)] || (statusCode ? "状态码:" + statusCode : "未知");
}

function firstSyncItem(record) {
  var raw = record.result && record.result.syncRaw;
  if (raw && Array.isArray(raw.data) && raw.data[0]) return raw.data[0];
  return null;
}

function orderNidFrom(record, syncItem) {
  var data = record.result && record.result.data;
  var nested = data && data.data;
  return record.orderNid || data && data.orderNid || nested && nested.order_nid || syncItem && syncItem.order_nid || "";
}

function toOrderView(record) {
  var syncItem = firstSyncItem(record) || {};
  var statusCode = String(record.result && record.result.syncStatus || syncItem.status || "");
  var file = record.params && record.params.content_file || "";
  return {
    title: record.params && record.params.title || syncItem.title || basename(file),
    filename: basename(file),
    orderNid: String(orderNidFrom(record, syncItem)),
    statusCode: statusCode,
    statusLabel: statusLabel(statusCode),
    submittedAt: formatIso(record.ts || record.submittedAt),
    publishedAt: formatIso(record.publishedAt || record.ts),
    resourceId: String(record.params && record.params.resource_id || syncItem.resource_id || ""),
    resourceName: record.params && record.params.resource_name || "",
    price: String(syncItem.price || ""),
    orderUrl: syncItem.order_url || "",
    raw: record
  };
}
```

Add:

```js
function listOrderViews() {
  return listOrders().map(toOrderView);
}
```

Return it:

```js
return { listOrders: listOrders, listOrderViews: listOrderViews, syncOrder: syncOrder };
```

- [ ] **Step 4: Route orders IPC to order views**

In `desktop/ipc/media-ipc.js`, change `media:get-orders` to:

```js
ipcMain.handle("media:get-orders", function() {
  return wrap(function() { return mediaOrderService.listOrderViews(); });
});
```

- [ ] **Step 5: Simplify orders drawer renderer**

In `desktop/renderer/media-orders-drawer.js`, render DTO fields directly:

```js
orders.length === 0 ? '<p class="empty-state">暂无订单</p>' : orders.map(function(order) {
  return '<div class="order-row">' +
    '<span>' + window.dom.escapeHtml(order.title || order.filename || "") + '</span>' +
    '<span>' + window.dom.escapeHtml(order.statusLabel || "未知") + '</span>' +
    '<span style="font-size:12px;color:var(--muted);">' + window.dom.escapeHtml(order.publishedAt || order.submittedAt || "") + '</span>' +
    (order.orderNid ? '<button class="secondary sync-order-btn" data-nid="' + window.dom.escapeHtml(order.orderNid) + '">同步</button>' : '') +
    '</div>';
}).join("")
```

- [ ] **Step 6: Verify tests and syntax**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/media-order-service.test.js
& 'C:\Program Files\nodejs\node.exe' --check desktop/renderer/media-orders-drawer.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add desktop/services/media-order-service.js desktop/ipc/media-ipc.js desktop/renderer/media-orders-drawer.js tests/media-order-service.test.js
git commit -m "refactor: return normalized media order views"
```

## Task 7: Final IPC Thinness And Regression Verification

**Files:**
- Modify: `desktop/ipc/media-ipc.js`
- Modify: `docs/desktop-workbench.md`

- [ ] **Step 1: Ensure `media-ipc.js` is transport only**

Final shape of `desktop/ipc/media-ipc.js` should have these imports only:

```js
const path = require("path");
const { MediaResourceStore } = require("../../src/platforms/media/media-resource-store");
const { MediaPoolStore } = require("../../src/platforms/media/media-pool-store");
const { MediaDraftStore } = require("../../src/platforms/media/media-draft-store");
const { createMediaOrderService } = require("../services/media-order-service");
const { createMediaWorkbenchService } = require("../services/media-workbench-service");
const { createMediaResourceService } = require("../services/media-resource-service");
const { wrap } = require("../services/ipc-response");
```

Handlers should be one of these forms:

```js
ipcMain.handle("media:scan-articles", function() {
  return wrap(function() { return mediaWorkbenchService.scanArticles(); });
});
```

or:

```js
ipcMain.handle("media:set-draft", function(event, filename, draft) {
  return wrap(function() {
    mediaDraftStore.set(filename, draft);
    return { saved: true };
  });
});
```

- [ ] **Step 2: Remove temporary resource compatibility channels**

Remove these handlers from `desktop/ipc/media-ipc.js`:

```js
ipcMain.handle("media:list-resources", ...);
ipcMain.handle("media:get-cached-resources", ...);
ipcMain.handle("media:search-resources", ...);
```

The renderer should use only:

```js
api.media.refreshResources
api.media.getResourcePage
api.media.searchResourcePage
```

- [ ] **Step 3: Run full test suite**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/*.test.js
```

Expected: all tests pass, including new static boundary and encoding tests.

- [ ] **Step 4: Run queue snapshot**

Run:

```powershell
npm run snapshot
```

Expected: output includes `lieju`, `toutiao`, `hepan`, and `media`.

- [ ] **Step 5: Verify Electron still resolves**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' node_modules/electron/cli.js --version
```

Expected: prints `v33.4.11` or the installed Electron version.

- [ ] **Step 6: Update workflow docs**

In `docs/desktop-workbench.md`, add:

```md
## Resource Cache

The Media Submission workspace reads media resources from the local cache by default.
Use "拉取资源库" to refresh all remote media resources into `data/media-resources.json`.
The renderer requests one 20-row page at a time from the service layer.

## Service Boundaries

- `media-resource-service`: normalizes media resources, refreshes cache, paginates/searches resources, manages media pool, and checks balance.
- `media-workbench-service`: scans media articles, previews articles, builds confirmation summaries, submits media tasks serially, and handles stop requests.
- `media-order-service`: reads raw order records and returns normalized order view DTOs for the renderer.
- `media-ipc`: transport only; no file parsing, API paging, or resource/order field normalization.
```

- [ ] **Step 7: Commit**

```bash
git add desktop/ipc/media-ipc.js docs/desktop-workbench.md
git commit -m "docs: document hardened desktop workbench boundaries"
```

## Self-Review

### Spec Coverage

- IPC thinness: Tasks 3, 5, and 7.
- Resource field normalization: Task 2.
- Resource cache, search, 20-row pagination: Tasks 2 and 4.
- Media pool names instead of IDs: Tasks 2 and 4.
- Order title/status/time normalization: Task 6.
- Scan/preview service ownership: Task 5.
- Renderer encoding guard: Task 1.
- Final verification and docs: Task 7.

### Placeholder Scan

No placeholder markers or unspecified validation steps remain. Each task contains file paths, exact commands, expected results, and concrete code snippets.

### Type Consistency

- Resource DTO is consistently `{ resourceId, name, price, remarks, publishRate, publishTime, caseLink, raw }`.
- Resource page DTO is consistently `{ page, pageSize, total, totalPages, updatedAt, items }`.
- Order DTO is consistently `{ title, filename, orderNid, statusCode, statusLabel, submittedAt, publishedAt, resourceId, resourceName, price, orderUrl, raw }`.
- Preload API names match renderer usage:
  - `api.media.refreshResources`
  - `api.media.getResourcePage`
  - `api.media.searchResourcePage`
  - `api.media.getPool`
  - `api.media.addToPool`
  - `api.media.removeFromPool`
  - `api.media.getBalance`
