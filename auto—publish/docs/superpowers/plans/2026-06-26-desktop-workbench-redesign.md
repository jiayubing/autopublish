# Desktop Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Electron Desktop Console into two maintainable workspaces: Media Submission and Other Platforms, with true one-article-to-many-media serial submission.

**Architecture:** Keep the current no-build Electron stack. Split the main process into lifecycle, IPC registration, and focused service modules; split renderer code into small workspace modules. Media submission becomes article-driven, while non-media platforms get their own batch routing workspace.

**Tech Stack:** Electron 33, CommonJS, plain HTML/CSS/JS, Node built-ins, existing platform adapters, `mammoth`, `dotenv`, and `form-data`.

---

## Requirements Summary

- Preserve all enabled platforms: `lieju`, `toutiao`, `hepan`, and `media`.
- Split Desktop into separate workspaces:
  - Media Submission: media articles, media pool selection, resource library, preview, preflight, submit, orders.
  - Other Platforms: Lieju/Toutiao/Hepan article queues, bulk article selection, target platform selection.
- Media Submission is article-driven: select articles first, then select one or more media resources per article.
- Media Pool is the primary media selection source. Full resource library remains available for search, management, and adding resources to the pool.
- Real submission requires a final confirmation panel before any API submission.
- One article submitted to multiple media resources creates multiple serial tasks and multiple orders.
- Submission is serial, not concurrent.
- A failed task does not stop the remaining tasks. The final result summarizes success, failure, and skipped tasks.
- Stop behavior: finish the currently running API request, then do not start the next task.
- Article preview uses a right-side panel or drawer, not `alert`.
- Orders use a drawer with filter and sync actions.
- Do not introduce React or Vite in this version. Renderer modules should be easy to replace later.
- Keep dependency list minimal. Do not remove `electron`, `dotenv`, `form-data`, or `mammoth`.

## File Structure

### Existing Files To Modify

- `package.json`
  - Add `test`: `node --test tests/*.test.js`.
- `desktop/main.js`
  - Reduce to Electron lifecycle, window creation, app events, and IPC registration.
- `desktop/preload.js`
  - Expose grouped APIs under `desktopConsole.batch`, `desktopConsole.media`, `desktopConsole.platforms`, and `desktopConsole.orders`.
- `desktop/renderer/index.html`
  - Replace the mixed long page with a shell containing two workspace views and a shared drawer root.
- `desktop/renderer/styles.css`
  - Replace mixed dashboard styles with workbench layout, tables, drawers, selection controls, and confirmation states.
- `desktop/renderer/app.js`
  - Reduce to workspace bootstrapping and navigation.
- `src/platforms/media/media-draft-store.js`
  - Support `selectedResources` while migrating old single-resource drafts.
- `src/platforms/media/preflight.js`
  - Validate expanded article-resource tasks.
- `src/platforms/media/adapter.js`
  - Keep existing batch adapter behavior. Do not overload it with Desktop-only multi-submit logic.

### New Main-Process Files

- `desktop/ipc/register.js`
  - Registers all IPC modules.
- `desktop/ipc/batch-ipc.js`
  - Owns existing snapshot, start batch, stop batch, and batch state IPC.
- `desktop/ipc/media-ipc.js`
  - Owns media article scan, draft update, pool/resource actions, preflight, submit, and orders IPC.
- `desktop/ipc/platform-ipc.js`
  - Owns other-platform queue scanning and selected target plan/submission IPC.
- `desktop/services/ipc-response.js`
  - Provides consistent `{ ok, data }` and `{ ok, error }` wrappers.
- `desktop/services/desktop-task-service.js`
  - Owns forked worker process lifecycle for snapshot and existing platform batch tasks.
- `desktop/services/media-workbench-service.js`
  - Owns media article scan, preview, draft merge, confirmation summary, task expansion, serial submission, and stop flag.
- `desktop/services/media-order-service.js`
  - Owns reading and syncing media submission orders.
- `desktop/services/platform-workbench-service.js`
  - Owns non-media queue scan and selected article-to-target-platform planning.

### New Renderer Files

- `desktop/renderer/shared/dom.js`
  - DOM helpers and HTML escaping.
- `desktop/renderer/shared/drawer.js`
  - Generic right drawer open/close behavior.
- `desktop/renderer/shared/confirm.js`
  - Final confirmation drawer for real submit.
- `desktop/renderer/media-workbench.js`
  - Article-driven media workflow.
- `desktop/renderer/media-resource-library.js`
  - Resource library and Media Pool management.
- `desktop/renderer/media-orders-drawer.js`
  - Order list, filters, and sync actions.
- `desktop/renderer/platform-workbench.js`
  - Other-platform article selection and target platform routing.
- `desktop/renderer/batch-log-panel.js`
  - Shared log/status rendering.

### Test Files To Create

- `tests/desktop-ipc-response.test.js`
- `tests/media-draft-store.test.js`
- `tests/media-workbench-service.test.js`
- `tests/media-preflight.test.js`
- `tests/platform-workbench-service.test.js`

---

## Task 1: Add Test Harness And IPC Response Wrapper

**Files:**
- Modify: `package.json`
- Create: `desktop/services/ipc-response.js`
- Test: `tests/desktop-ipc-response.test.js`

- [ ] **Step 1: Add the test script**

Modify the `scripts` block in `package.json`:

```json
"scripts": {
  "desktop": "scripts\\desktop.cmd",
  "snapshot": "scripts\\snapshot.cmd",
  "test": "node --test tests/*.test.js"
}
```

- [ ] **Step 2: Write failing tests**

Create `tests/desktop-ipc-response.test.js`:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ok, fail, wrap } = require("../desktop/services/ipc-response");

describe("ipc-response", function() {
  it("wraps successful data", function() {
    assert.deepStrictEqual(ok({ count: 2 }), { ok: true, data: { count: 2 } });
  });

  it("wraps errors without stack traces", function() {
    assert.deepStrictEqual(fail(new Error("bad input")), { ok: false, error: "bad input" });
  });

  it("wraps async handlers", async function() {
    const result = await wrap(async function() {
      return { total: 1 };
    });
    assert.deepStrictEqual(result, { ok: true, data: { total: 1 } });
  });

  it("wraps async handler failures", async function() {
    const result = await wrap(async function() {
      throw new Error("boom");
    });
    assert.deepStrictEqual(result, { ok: false, error: "boom" });
  });
});
```

- [ ] **Step 3: Verify the test fails**

Run:

```powershell
npm test
```

Expected: fails because `desktop/services/ipc-response.js` does not exist.

- [ ] **Step 4: Implement the wrapper**

Create `desktop/services/ipc-response.js`:

```js
function ok(data) {
  return { ok: true, data: data };
}

function fail(error) {
  return {
    ok: false,
    error: error && error.message ? error.message : String(error || "Unknown error")
  };
}

async function wrap(handler) {
  try {
    return ok(await handler());
  } catch (error) {
    return fail(error);
  }
}

module.exports = { ok, fail, wrap };
```

- [ ] **Step 5: Verify the test passes**

Run:

```powershell
npm test
```

Expected: `desktop-ipc-response.test.js` passes.

- [ ] **Step 6: Commit**

```bash
git add package.json desktop/services/ipc-response.js tests/desktop-ipc-response.test.js
git commit -m "test: add desktop service test harness"
```

## Task 2: Support Multiple Media Resources Per Draft

**Files:**
- Modify: `src/platforms/media/media-draft-store.js`
- Test: `tests/media-draft-store.test.js`

- [ ] **Step 1: Write failing draft store tests**

Create `tests/media-draft-store.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");

describe("MediaDraftStore multi-resource support", function() {
  let dir;
  let storePath;

  beforeEach(function() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-drafts-"));
    storePath = path.join(dir, "media-drafts.json");
  });

  afterEach(function() {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stores multiple selected resources for one article", function() {
    const store = new MediaDraftStore({ storePath: storePath });
    store.set("a.docx", {
      title: "Article A",
      selectedResources: [
        { resourceId: "101", name: "Media One", price: 120 },
        { resourceId: "102", name: "Media Two", price: 80 }
      ],
      ignoreImages: true
    });

    assert.deepStrictEqual(store.get("a.docx").selectedResources.map(function(resource) {
      return resource.resourceId;
    }), ["101", "102"]);
  });

  it("migrates old single resource drafts", function() {
    fs.writeFileSync(storePath, JSON.stringify({
      "old.docx": {
        title: "Old Article",
        resourceId: "201",
        resourceName: "Old Media"
      }
    }, null, 2), "utf-8");

    const store = new MediaDraftStore({ storePath: storePath });
    assert.deepStrictEqual(store.get("old.docx").selectedResources, [
      { resourceId: "201", name: "Old Media", price: undefined }
    ]);
  });

  it("sets one resource on many files without deleting other draft fields", function() {
    const store = new MediaDraftStore({ storePath: storePath });
    store.set("a.docx", { title: "A", ignoreImages: true });
    store.setBulkResource(["a.docx", "b.docx"], "301", "Batch Media");

    assert.strictEqual(store.get("a.docx").title, "A");
    assert.strictEqual(store.get("a.docx").ignoreImages, true);
    assert.deepStrictEqual(store.get("a.docx").selectedResources, [
      { resourceId: "301", name: "Batch Media", price: undefined }
    ]);
    assert.deepStrictEqual(store.get("b.docx").selectedResources, [
      { resourceId: "301", name: "Batch Media", price: undefined }
    ]);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
npm test
```

Expected: fails because the store does not normalize `selectedResources`.

- [ ] **Step 3: Implement normalization**

Modify `src/platforms/media/media-draft-store.js`:

```js
function normalizeResource(resource) {
  if (!resource) return null;
  var resourceId = resource.resourceId || resource.id || resource.resource_id;
  if (!resourceId) return null;
  return {
    resourceId: String(resourceId),
    name: resource.name || resource.title || resource.resourceName || "",
    price: resource.price
  };
}

function normalizeDraft(draft) {
  var source = draft || {};
  var selectedResources = [];

  if (Array.isArray(source.selectedResources)) {
    selectedResources = source.selectedResources.map(normalizeResource).filter(Boolean);
  } else if (source.resourceId) {
    selectedResources = [{
      resourceId: String(source.resourceId),
      name: source.resourceName || "",
      price: source.price
    }];
  }

  return Object.assign({}, source, {
    selectedResources: selectedResources,
    resourceId: selectedResources[0] ? selectedResources[0].resourceId : null,
    resourceName: selectedResources[0] ? selectedResources[0].name : ""
  });
}
```

Also update the constructor to accept both old and new option names:

```js
this.filePath = opts.storePath || opts.filePath || DEFAULT_PATH;
```

Ensure `get`, `getAll`, `set`, and `setBulkResource` return or persist normalized drafts.

- [ ] **Step 4: Verify tests pass**

Run:

```powershell
npm test
```

Expected: all current tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/platforms/media/media-draft-store.js tests/media-draft-store.test.js
git commit -m "feat: support multiple media resources per draft"
```

## Task 3: Add Media Workbench Service

**Files:**
- Create: `desktop/services/media-workbench-service.js`
- Test: `tests/media-workbench-service.test.js`

- [ ] **Step 1: Write failing service tests**

Create `tests/media-workbench-service.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createMediaWorkbenchService } = require("../desktop/services/media-workbench-service");
const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");

describe("media-workbench-service", function() {
  let root;
  let inputDir;
  let draftStore;
  let service;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "media-workbench-"));
    inputDir = path.join(root, "input", "media");
    fs.mkdirSync(inputDir, { recursive: true });
    draftStore = new MediaDraftStore({ storePath: path.join(root, "data", "drafts.json") });
    service = createMediaWorkbenchService({ inputDir: inputDir, draftStore: draftStore });
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scans text articles and applies selected resources from drafts", async function() {
    fs.writeFileSync(path.join(inputDir, "a.txt"), "Title A\n\nBody", "utf-8");
    draftStore.set("a.txt", {
      selectedResources: [{ resourceId: "101", name: "Media One" }],
      title: "Custom Title"
    });

    const articles = await service.scanArticles();
    assert.strictEqual(articles.length, 1);
    assert.strictEqual(articles[0].filename, "a.txt");
    assert.strictEqual(articles[0].title, "Custom Title");
    assert.deepStrictEqual(articles[0].selectedResources.map(function(resource) {
      return resource.resourceId;
    }), ["101"]);
  });

  it("expands selected articles into serial submission tasks", function() {
    const tasks = service.expandSubmissionTasks([
      {
        filename: "a.txt",
        filePath: path.join(inputDir, "a.txt"),
        title: "A",
        selectedResources: [
          { resourceId: "101", name: "Media One", price: 100 },
          { resourceId: "102", name: "Media Two", price: 80 }
        ]
      }
    ]);

    assert.deepStrictEqual(tasks.map(function(task) {
      return task.taskId;
    }), ["a.txt::101", "a.txt::102"]);
    assert.strictEqual(tasks[0].status, "pending");
  });

  it("builds confirmation totals", function() {
    const summary = service.buildConfirmationSummary([
      { title: "A", selectedResources: [{ resourceId: "1", price: 100 }, { resourceId: "2", price: 80 }] },
      { title: "B", selectedResources: [{ resourceId: "3", price: 20 }] }
    ]);

    assert.deepStrictEqual(summary, {
      articleCount: 2,
      resourceCount: 3,
      taskCount: 3,
      estimatedTotalPrice: 200,
      blockers: []
    });
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
npm test
```

Expected: fails because `media-workbench-service.js` does not exist.

- [ ] **Step 3: Implement the service**

Create `desktop/services/media-workbench-service.js` with:

```js
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const { detectDocxImages, convertArticle } = require("../../src/platforms/media/article-converter");
const { MediaClient } = require("../../src/platforms/media/media-client");
const { resolveApiKey } = require("../../src/platforms/media/config");
const { SubmissionOrderStore } = require("../../src/platforms/media/submission-order-store");

function firstTextLine(raw) {
  var lines = String(raw || "").split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^#+\s*/, "").trim();
    if (line && line !== "---") return line;
  }
  return "";
}

function normalizePrice(value) {
  if (value == null || value === "") return 0;
  var n = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function createMediaWorkbenchService(opts) {
  var options = opts || {};
  var inputDir = options.inputDir;
  var draftStore = options.draftStore;
  var stopRequested = false;

  async function readAutoTitle(filePath) {
    var ext = path.extname(filePath).toLowerCase();
    if (ext === ".docx") {
      try {
        var result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
        return firstTextLine(result && result.value);
      } catch (_) {
        return "";
      }
    }
    if (ext === ".txt" || ext === ".md") {
      return firstTextLine(fs.readFileSync(filePath, "utf-8"));
    }
    return "";
  }

  async function scanArticles() {
    if (!fs.existsSync(inputDir)) return [];
    var filenames = fs.readdirSync(inputDir).filter(function(name) {
      if (name.indexOf("~$") === 0) return false;
      if (name === ".gitkeep") return false;
      return name.endsWith(".docx") || name.endsWith(".txt") || name.endsWith(".md");
    });

    var articles = [];
    for (var i = 0; i < filenames.length; i++) {
      var filename = filenames[i];
      var filePath = path.join(inputDir, filename);
      var draft = draftStore.get(filename) || {};
      var imageInfo = path.extname(filename).toLowerCase() === ".docx"
        ? detectDocxImages(filePath)
        : { hasImages: false, imageCount: 0 };
      var autoTitle = await readAutoTitle(filePath) || path.basename(filename, path.extname(filename));
      articles.push({
        filename: filename,
        filePath: filePath,
        title: draft.title || autoTitle,
        autoTitle: autoTitle,
        remark: draft.remark || "",
        hasImages: imageInfo.hasImages,
        imageCount: imageInfo.imageCount,
        ignoreImages: !!draft.ignoreImages,
        selectedResources: draft.selectedResources || []
      });
    }
    return articles;
  }

  function expandSubmissionTasks(articles) {
    var tasks = [];
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      var resources = article.selectedResources || [];
      for (var j = 0; j < resources.length; j++) {
        var resource = resources[j];
        tasks.push({
          taskId: article.filename + "::" + resource.resourceId,
          status: "pending",
          article: article,
          resource: resource
        });
      }
    }
    return tasks;
  }

  function buildConfirmationSummary(articles) {
    var blockers = [];
    var resourceCount = 0;
    var estimatedTotalPrice = 0;

    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      if (!article.title) blockers.push(article.filename + " is missing a title");
      if (article.hasImages && !article.ignoreImages) blockers.push(article.filename + " contains images and ignoreImages is not enabled");
      var resources = article.selectedResources || [];
      if (resources.length === 0) blockers.push(article.filename + " has no selected media resources");
      resourceCount += resources.length;
      for (var j = 0; j < resources.length; j++) {
        estimatedTotalPrice += normalizePrice(resources[j].price);
      }
    }

    return {
      articleCount: articles.length,
      resourceCount: resourceCount,
      taskCount: resourceCount,
      estimatedTotalPrice: estimatedTotalPrice,
      blockers: blockers
    };
  }

  function requestStop() {
    stopRequested = true;
  }

  async function submitTasksSerially(articles, injected) {
    stopRequested = false;
    var deps = injected || {};
    var client = deps.client || new MediaClient({ apiKey: resolveApiKey(null) });
    var orderStore = deps.orderStore || new SubmissionOrderStore();
    var tasks = expandSubmissionTasks(articles);
    var results = [];

    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      if (stopRequested) {
        task.status = "skipped";
        results.push({ taskId: task.taskId, status: "skipped", reason: "stop requested" });
        continue;
      }

      try {
        var converted = convertArticle(task.article.filePath, {
          title: task.article.title,
          ignoreImages: task.article.ignoreImages
        });
        var payload = {
          title: task.article.title,
          content: converted.content,
          resource_id: task.resource.resourceId,
          remark: task.article.remark || ""
        };
        var response = await client.submitArticle(payload);
        var record = {
          taskId: task.taskId,
          article: task.article,
          resource: task.resource,
          result: response,
          submittedAt: new Date().toISOString()
        };
        orderStore.append(record);
        results.push({ taskId: task.taskId, status: "success", response: response });
      } catch (error) {
        results.push({ taskId: task.taskId, status: "failed", error: error.message });
      }
    }

    return {
      ok: results.filter(function(item) { return item.status === "success"; }).length,
      fail: results.filter(function(item) { return item.status === "failed"; }).length,
      skipped: results.filter(function(item) { return item.status === "skipped"; }).length,
      results: results
    };
  }

  return {
    scanArticles: scanArticles,
    expandSubmissionTasks: expandSubmissionTasks,
    buildConfirmationSummary: buildConfirmationSummary,
    submitTasksSerially: submitTasksSerially,
    requestStop: requestStop
  };
}

module.exports = { createMediaWorkbenchService };
```

- [ ] **Step 4: Verify tests pass**

Run:

```powershell
npm test
```

Expected: all current tests pass.

- [ ] **Step 5: Commit**

```bash
git add desktop/services/media-workbench-service.js tests/media-workbench-service.test.js
git commit -m "feat: add media workbench service"
```

## Task 4: Validate Expanded Media Preflight

**Files:**
- Modify: `src/platforms/media/preflight.js`
- Test: `tests/media-preflight.test.js`

- [ ] **Step 1: Write failing preflight tests**

Create `tests/media-preflight.test.js`:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { runPreflight } = require("../src/platforms/media/preflight");

describe("media preflight", function() {
  it("accepts selectedResources and expands task count", async function() {
    const result = await runPreflight({
      dryRun: true,
      articles: [{
        filename: "a.txt",
        title: "A",
        selectedResources: [
          { resourceId: "101", name: "Media One" },
          { resourceId: "102", name: "Media Two" }
        ]
      }]
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.taskCount, 2);
    assert.strictEqual(result.articles[0].resourceCount, 2);
  });

  it("blocks articles with no selected resources", async function() {
    const result = await runPreflight({
      dryRun: true,
      articles: [{ filename: "a.txt", title: "A", selectedResources: [] }]
    });

    assert.strictEqual(result.ok, false);
    assert.match(result.errors.join("\n"), /media resource|媒体资源/);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
npm test
```

Expected: fails because preflight only checks `resourceId`.

- [ ] **Step 3: Update preflight**

Modify `src/platforms/media/preflight.js` so each article normalizes:

```js
function getSelectedResources(article) {
  if (Array.isArray(article.selectedResources) && article.selectedResources.length > 0) {
    return article.selectedResources;
  }
  if (article.resourceId) {
    return [{ resourceId: article.resourceId, name: article.resourceName || "" }];
  }
  return [];
}
```

For each article, set:

```js
var selectedResources = getSelectedResources(a);
entry.selectedResources = selectedResources;
entry.resourceCount = selectedResources.length;
result.taskCount += selectedResources.length;
```

Replace the old single `resourceId` blocker with:

```js
if (selectedResources.length === 0) {
  entry.ok = false;
  entry.errors.push("未选择媒体资源");
  result.checks.allHaveResources = false;
}
```

Initialize `result.taskCount = 0`.

- [ ] **Step 4: Verify tests pass**

Run:

```powershell
npm test
```

Expected: all current tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/platforms/media/preflight.js tests/media-preflight.test.js
git commit -m "feat: preflight multi-resource media submissions"
```

## Task 5: Split Main Process Into Services And IPC Modules

**Files:**
- Modify: `desktop/main.js`
- Create: `desktop/ipc/register.js`
- Create: `desktop/ipc/batch-ipc.js`
- Create: `desktop/ipc/media-ipc.js`
- Create: `desktop/ipc/platform-ipc.js`
- Create: `desktop/services/desktop-task-service.js`
- Create: `desktop/services/media-order-service.js`
- Create: `desktop/services/platform-workbench-service.js`
- Test: `tests/platform-workbench-service.test.js`

- [ ] **Step 1: Write platform workbench tests**

Create `tests/platform-workbench-service.test.js`:

```js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");

describe("platform-workbench-service", function() {
  let root;
  let service;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-workbench-"));
    fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
    fs.mkdirSync(path.join(root, "input", "toutiao"), { recursive: true });
    fs.writeFileSync(path.join(root, "input", "lieju", "a.txt"), "A\nBody", "utf-8");
    service = createPlatformWorkbenchService({
      rootDir: root,
      platformIds: ["lieju", "toutiao", "hepan"]
    });
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scans non-media platform queues", function() {
    const queue = service.scanQueue();
    assert.deepStrictEqual(queue.map(function(group) { return group.platformId; }), ["lieju", "toutiao", "hepan"]);
    assert.strictEqual(queue[0].articles[0].filename, "a.txt");
  });

  it("builds selected article target plan", function() {
    const plan = service.buildSelectedPlan({
      selectedArticles: [{ sourcePlatformId: "lieju", filename: "a.txt" }],
      targetPlatformIds: ["toutiao", "hepan"]
    });

    assert.deepStrictEqual(plan.tasks.map(function(task) {
      return task.targetPlatformId;
    }), ["toutiao", "hepan"]);
  });
});
```

- [ ] **Step 2: Implement `platform-workbench-service.js`**

Create `desktop/services/platform-workbench-service.js`:

```js
const fs = require("fs");
const path = require("path");

function firstTitle(raw, fallback) {
  var lines = String(raw || "").split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^#+\s*/, "").trim();
    if (line) return line;
  }
  return fallback;
}

function createPlatformWorkbenchService(opts) {
  var options = opts || {};
  var rootDir = options.rootDir || path.resolve(__dirname, "..", "..");
  var platformIds = options.platformIds || [];

  function scanQueue() {
    return platformIds.map(function(platformId) {
      var inputDir = path.join(rootDir, "input", platformId);
      var articles = [];
      if (fs.existsSync(inputDir)) {
        articles = fs.readdirSync(inputDir).filter(function(name) {
          return name !== ".gitkeep" && name.indexOf("~$") !== 0;
        }).map(function(filename) {
          var filePath = path.join(inputDir, filename);
          var title = path.basename(filename, path.extname(filename));
          if (filename.endsWith(".txt") || filename.endsWith(".md")) {
            title = firstTitle(fs.readFileSync(filePath, "utf-8"), title);
          }
          return { filename: filename, filePath: filePath, title: title };
        });
      }
      return { platformId: platformId, articles: articles };
    });
  }

  function buildSelectedPlan(input) {
    var selectedArticles = input.selectedArticles || [];
    var targetPlatformIds = input.targetPlatformIds || [];
    var tasks = [];
    for (var i = 0; i < selectedArticles.length; i++) {
      for (var j = 0; j < targetPlatformIds.length; j++) {
        tasks.push({
          sourcePlatformId: selectedArticles[i].sourcePlatformId,
          filename: selectedArticles[i].filename,
          targetPlatformId: targetPlatformIds[j]
        });
      }
    }
    return { taskCount: tasks.length, tasks: tasks };
  }

  return { scanQueue: scanQueue, buildSelectedPlan: buildSelectedPlan };
}

module.exports = { createPlatformWorkbenchService };
```

- [ ] **Step 3: Move forked worker lifecycle**

Create `desktop/services/desktop-task-service.js` by moving `spawnDesktopTask` and `refreshQueueSnapshot` from `desktop/main.js`. Export:

```js
module.exports = {
  createDesktopTaskService: createDesktopTaskService
};
```

The service must expose:

```js
refreshQueueSnapshot(options)
startBatch(options, hooks)
stopBatch()
getState()
onState(listener)
```

Keep existing stop behavior using `requestStopSignal`, `clearStopSignal`, and child IPC.

- [ ] **Step 4: Create media order service**

Create `desktop/services/media-order-service.js` with:

```js
const fs = require("fs");
const path = require("path");
const { MediaClient } = require("../../src/platforms/media/media-client");
const { resolveApiKey } = require("../../src/platforms/media/config");

function createMediaOrderService(opts) {
  var options = opts || {};
  var storePath = options.storePath || path.resolve(__dirname, "..", "..", "data", "submission-orders.jsonl");

  function listOrders() {
    var orders = [];
    if (!fs.existsSync(storePath)) return orders;
    var raw = fs.readFileSync(storePath, "utf-8").trim();
    if (!raw) return orders;
    raw.split("\n").forEach(function(line) {
      try { orders.push(JSON.parse(line)); } catch (_) {}
    });
    return orders;
  }

  async function syncOrder(orderNid) {
    var client = new MediaClient({ apiKey: resolveApiKey(null) });
    return client.orderInfo(orderNid);
  }

  return { listOrders: listOrders, syncOrder: syncOrder };
}

module.exports = { createMediaOrderService };
```

- [ ] **Step 5: Create IPC modules**

Create `desktop/ipc/register.js`:

```js
function registerIpc(deps) {
  require("./batch-ipc").registerBatchIpc(deps);
  require("./media-ipc").registerMediaIpc(deps);
  require("./platform-ipc").registerPlatformIpc(deps);
}

module.exports = { registerIpc };
```

Each IPC file must import `wrap` from `desktop/services/ipc-response.js` and return the same response shape used by the current renderer. Start by moving existing handlers from `desktop/main.js` without changing channel names.

- [ ] **Step 6: Reduce `main.js`**

After moving handlers, `desktop/main.js` should only:

```js
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { subscribe } = require("../src/core/logger");
const { registerIpc } = require("./ipc/register");
const { createDesktopTaskService } = require("./services/desktop-task-service");

let mainWindow = null;
let unsubscribeLogs = null;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f6f7f4",
    title: "Auto Publish Desktop Console",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", function() { mainWindow = null; });
}

app.whenReady().then(function() {
  createMainWindow();
  const taskService = createDesktopTaskService({
    cwd: path.resolve(__dirname, ".."),
    sendToRenderer: sendToRenderer
  });
  registerIpc({ ipcMain: ipcMain, taskService: taskService });
  unsubscribeLogs = subscribe(function(entry) { sendToRenderer("publish-log", entry); });
});
```

Keep the existing `activate`, `window-all-closed`, and `before-quit` events.

- [ ] **Step 7: Verify tests and snapshot**

Run:

```powershell
npm test
npm run snapshot
```

Expected: tests pass; snapshot still includes `lieju`, `toutiao`, `hepan`, and `media`.

- [ ] **Step 8: Commit**

```bash
git add desktop/main.js desktop/ipc desktop/services tests/platform-workbench-service.test.js
git commit -m "refactor: split desktop main process services"
```

## Task 6: Group Preload APIs

**Files:**
- Modify: `desktop/preload.js`

- [ ] **Step 1: Replace the flat preload API with grouped APIs**

Expose this shape:

```js
contextBridge.exposeInMainWorld("desktopConsole", {
  batch: {
    getState: function() { return ipcRenderer.invoke("desktop:get-state"); },
    refreshQueue: function(options) { return ipcRenderer.invoke("desktop:refresh-queue", options || {}); },
    startBatch: function(options) { return ipcRenderer.invoke("desktop:start-batch", options || {}); },
    stopBatch: function() { return ipcRenderer.invoke("desktop:stop-batch"); },
    onLog: function(listener) {
      var handler = function(event, payload) { listener(payload); };
      ipcRenderer.on("publish-log", handler);
      return function() { ipcRenderer.removeListener("publish-log", handler); };
    },
    onState: function(listener) {
      var handler = function(event, payload) { listener(payload); };
      ipcRenderer.on("batch-state", handler);
      return function() { ipcRenderer.removeListener("batch-state", handler); };
    },
    onQueueUpdated: function(listener) {
      var handler = function(event, payload) { listener(payload); };
      ipcRenderer.on("queue-updated", handler);
      return function() { ipcRenderer.removeListener("queue-updated", handler); };
    }
  },
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
    listResources: function(opts) { return ipcRenderer.invoke("media:list-resources", opts || {}); },
    getCachedResources: function() { return ipcRenderer.invoke("media:get-cached-resources"); },
    searchResources: function(keyword) { return ipcRenderer.invoke("media:search-resources", keyword); },
    getPool: function() { return ipcRenderer.invoke("media:get-pool"); },
    addToPool: function(resource) { return ipcRenderer.invoke("media:add-to-pool", resource); },
    removeFromPool: function(resourceId) { return ipcRenderer.invoke("media:remove-from-pool", resourceId); },
    getBalance: function() { return ipcRenderer.invoke("media:get-balance"); }
  },
  platforms: {
    getQueue: function() { return ipcRenderer.invoke("platforms:get-queue"); },
    buildSelectedPlan: function(input) { return ipcRenderer.invoke("platforms:build-selected-plan", input); }
  },
  orders: {
    getOrders: function() { return ipcRenderer.invoke("media:get-orders"); },
    syncOrder: function(orderNid) { return ipcRenderer.invoke("media:sync-order", orderNid); }
  }
});
```

- [ ] **Step 2: Keep temporary compatibility aliases**

Until the renderer is fully migrated, add aliases at the bottom:

```js
api.getState = api.batch.getState;
api.refreshQueue = api.batch.refreshQueue;
api.startBatch = api.batch.startBatch;
api.stopBatch = api.batch.stopBatch;
api.scanMediaArticles = api.media.scanArticles;
api.previewArticle = api.media.previewArticle;
```

Remove these aliases in Task 9.

- [ ] **Step 3: Run app smoke test**

Run:

```powershell
npm run desktop
```

Expected: current UI still loads before renderer migration.

- [ ] **Step 4: Commit**

```bash
git add desktop/preload.js
git commit -m "refactor: group desktop preload APIs"
```

## Task 7: Build Split Renderer Workspaces

**Files:**
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/styles.css`
- Modify: `desktop/renderer/app.js`
- Create: `desktop/renderer/shared/dom.js`
- Create: `desktop/renderer/shared/drawer.js`
- Create: `desktop/renderer/shared/confirm.js`
- Create: `desktop/renderer/media-workbench.js`
- Create: `desktop/renderer/media-resource-library.js`
- Create: `desktop/renderer/media-orders-drawer.js`
- Create: `desktop/renderer/platform-workbench.js`
- Create: `desktop/renderer/batch-log-panel.js`

- [ ] **Step 1: Replace `index.html` with an app shell**

The body must contain:

```html
<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">Auto Publish</div>
    <button class="nav-item active" data-workspace="mediaWorkspace">媒体投稿</button>
    <button class="nav-item" data-workspace="platformWorkspace">其他平台</button>
    <div class="status-line">状态：<span id="globalStatus">空闲</span></div>
  </aside>
  <main class="main-area">
    <section id="mediaWorkspace" class="workspace active"></section>
    <section id="platformWorkspace" class="workspace"></section>
  </main>
</div>
<div id="drawerRoot"></div>
```

Load scripts in this order:

```html
<script src="./shared/dom.js"></script>
<script src="./shared/drawer.js"></script>
<script src="./shared/confirm.js"></script>
<script src="./batch-log-panel.js"></script>
<script src="./media-orders-drawer.js"></script>
<script src="./media-resource-library.js"></script>
<script src="./media-workbench.js"></script>
<script src="./platform-workbench.js"></script>
<script src="./app.js"></script>
```

- [ ] **Step 2: Add shared DOM helpers**

Create `desktop/renderer/shared/dom.js`:

```js
window.dom = {
  byId: function(id) {
    return document.getElementById(id);
  },
  escapeHtml: function(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
};
```

- [ ] **Step 3: Add drawer and confirmation helpers**

Create `desktop/renderer/shared/drawer.js`:

```js
window.drawer = {
  open: function(html, bind) {
    var root = window.dom.byId("drawerRoot");
    root.innerHTML = '<aside class="drawer">' + html + '</aside>';
    var close = root.querySelector("[data-close-drawer]");
    if (close) close.addEventListener("click", function() { root.innerHTML = ""; });
    if (bind) bind(root);
  },
  close: function() {
    window.dom.byId("drawerRoot").innerHTML = "";
  }
};
```

Create `desktop/renderer/shared/confirm.js`:

```js
window.confirmPanel = {
  open: function(summary, onConfirm) {
    var blockers = summary.blockers || [];
    window.drawer.open([
      '<div class="drawer-head"><h2>提交确认</h2><button data-close-drawer class="icon-button">×</button></div>',
      '<div class="drawer-body">',
      '<p>文章数：' + summary.articleCount + '</p>',
      '<p>媒体选择数：' + summary.resourceCount + '</p>',
      '<p>将生成订单：' + summary.taskCount + '</p>',
      '<p>预计总价：' + summary.estimatedTotalPrice + '</p>',
      blockers.length ? '<pre class="warning-list">' + window.dom.escapeHtml(blockers.join("\\n")) + '</pre>' : '',
      '<button id="realSubmitConfirm" class="primary"' + (blockers.length ? ' disabled' : '') + '>确认真实提交</button>',
      '</div>'
    ].join(""), function(root) {
      var button = root.querySelector("#realSubmitConfirm");
      if (button) button.addEventListener("click", onConfirm);
    });
  }
};
```

- [ ] **Step 4: Build media resource library**

Create `desktop/renderer/media-resource-library.js` with a module factory:

```js
window.createMediaResourceLibrary = function(api) {
  var pool = [];

  async function load() {
    var result = await api.media.getPool();
    pool = result.ok ? result.data.resources || result.data || [] : [];
    return pool;
  }

  function getPool() {
    return pool;
  }

  function render() {
    return [
      '<section class="panel">',
      '<div class="panel-head"><h2>媒体池</h2><button id="refreshMediaPool" class="secondary">刷新</button></div>',
      '<div class="resource-list">',
      pool.map(function(resource) {
        var id = resource.resourceId || resource.id || resource.resource_id;
        return '<div class="resource-row"><strong>' + window.dom.escapeHtml(resource.name || id) + '</strong><span>' + window.dom.escapeHtml(resource.price || "") + '</span></div>';
      }).join("") || '<p class="empty-state">媒体池为空，请先从资源库添加媒体。</p>',
      '</div>',
      '</section>'
    ].join("");
  }

  function bind(root, rerender) {
    var button = root.querySelector("#refreshMediaPool");
    if (button) {
      button.addEventListener("click", async function() {
        await load();
        rerender();
      });
    }
  }

  return { load: load, getPool: getPool, render: render, bind: bind };
};
```

- [ ] **Step 5: Build orders drawer**

Create `desktop/renderer/media-orders-drawer.js`:

```js
window.createMediaOrdersDrawer = function(api) {
  async function open() {
    var result = await api.orders.getOrders();
    var orders = result.ok ? result.data : [];
    window.drawer.open([
      '<div class="drawer-head"><h2>投稿订单</h2><button data-close-drawer class="icon-button">×</button></div>',
      '<div class="drawer-body">',
      orders.map(function(order) {
        var orderNid = order.orderNid || (order.result && order.result.order_nid) || "";
        return '<div class="order-row"><span>' + window.dom.escapeHtml(order.taskId || orderNid) + '</span><button class="secondary sync-order" data-order-nid="' + window.dom.escapeHtml(orderNid) + '">同步</button></div>';
      }).join("") || '<p class="empty-state">暂无订单。</p>',
      '</div>'
    ].join(""), function(root) {
      root.querySelectorAll(".sync-order").forEach(function(button) {
        button.addEventListener("click", function() {
          api.orders.syncOrder(button.getAttribute("data-order-nid"));
        });
      });
    });
  }

  return { open: open };
};
```

- [ ] **Step 6: Build media workbench**

Create `desktop/renderer/media-workbench.js`:

```js
window.createMediaWorkbench = function(api) {
  var articles = [];
  var selectedFilename = null;
  var resourceLibrary = window.createMediaResourceLibrary(api);
  var ordersDrawer = window.createMediaOrdersDrawer(api);

  async function load() {
    await resourceLibrary.load();
    var result = await api.media.scanArticles();
    articles = result.ok ? result.data : [];
  }

  function renderArticle(article) {
    var pool = resourceLibrary.getPool();
    var selected = article.selectedResources || [];
    return [
      '<article class="article-row" data-filename="' + window.dom.escapeHtml(article.filename) + '">',
      '<div><strong>' + window.dom.escapeHtml(article.title) + '</strong><p>' + window.dom.escapeHtml(article.filename) + '</p></div>',
      '<select multiple class="media-resource-multi" data-filename="' + window.dom.escapeHtml(article.filename) + '">',
      pool.map(function(resource) {
        var id = String(resource.resourceId || resource.id || resource.resource_id);
        var isSelected = selected.some(function(item) { return String(item.resourceId) === id; });
        return '<option value="' + window.dom.escapeHtml(id) + '"' + (isSelected ? ' selected' : '') + '>' + window.dom.escapeHtml(resource.name || id) + '</option>';
      }).join(""),
      '</select>',
      '<button class="secondary preview-article" data-filename="' + window.dom.escapeHtml(article.filename) + '">预览</button>',
      '<span class="count-pill">' + selected.length + ' 个媒体</span>',
      '</article>'
    ].join("");
  }

  function renderPreview() {
    if (!selectedFilename) return '<p class="empty-state">选择一篇文章查看预览。</p>';
    var article = articles.find(function(item) { return item.filename === selectedFilename; });
    if (!article) return '<p class="empty-state">文章不存在。</p>';
    return '<div class="panel-head"><h2>' + window.dom.escapeHtml(article.title) + '</h2></div><pre id="articlePreviewText" class="preview-text">加载中...</pre>';
  }

  function render() {
    return [
      '<header class="workspace-head">',
      '<div><p class="eyebrow">Media Submission</p><h1>媒体投稿</h1></div>',
      '<div class="toolbar"><button id="refreshMediaWorkbench" class="secondary">刷新</button><button id="openOrdersDrawer" class="secondary">订单</button><button id="stopMediaSubmit" class="danger">停止提交</button><button id="confirmMediaSubmit" class="primary">预检并提交</button></div>',
      '</header>',
      '<div class="media-workbench-grid">',
      '<section class="panel article-panel"><div class="panel-head"><h2>待投稿文章</h2></div>' + (articles.map(renderArticle).join("") || '<p class="empty-state">input/media 下没有文章。</p>') + '</section>',
      '<section class="panel preview-panel" id="mediaPreviewPanel">' + renderPreview() + '</section>',
      '</div>',
      resourceLibrary.render()
    ].join("");
  }

  async function loadPreview(filename) {
    selectedFilename = filename;
    var result = await api.media.previewArticle(filename);
    var preview = window.dom.byId("articlePreviewText");
    if (preview) preview.textContent = result.ok ? result.data.content : result.error;
  }

  async function confirmAndSubmit() {
    var result = await api.media.buildConfirmation(articles);
    if (!result.ok) return alert("预检失败：" + result.error);
    window.confirmPanel.open(result.data, async function() {
      var submitResult = await api.media.submitSelected(articles);
      if (!submitResult.ok) return alert("提交失败：" + submitResult.error);
      alert("提交完成：成功 " + submitResult.data.ok + "，失败 " + submitResult.data.fail + "，跳过 " + submitResult.data.skipped);
      window.drawer.close();
      ordersDrawer.open();
    });
  }

  function bind(root, rerender) {
    window.dom.byId("refreshMediaWorkbench").addEventListener("click", async function() { await load(); rerender(); });
    window.dom.byId("openOrdersDrawer").addEventListener("click", ordersDrawer.open);
    window.dom.byId("confirmMediaSubmit").addEventListener("click", confirmAndSubmit);
    window.dom.byId("stopMediaSubmit").addEventListener("click", function() { api.media.stopSubmit(); });

    root.querySelectorAll(".preview-article").forEach(function(button) {
      button.addEventListener("click", async function() {
        selectedFilename = button.getAttribute("data-filename");
        rerender();
        await loadPreview(selectedFilename);
      });
    });

    root.querySelectorAll(".media-resource-multi").forEach(function(select) {
      select.addEventListener("change", async function() {
        var filename = select.getAttribute("data-filename");
        var article = articles.find(function(item) { return item.filename === filename; });
        var pool = resourceLibrary.getPool();
        var selectedResources = Array.prototype.slice.call(select.selectedOptions).map(function(option) {
          return pool.find(function(resource) {
            return String(resource.resourceId || resource.id || resource.resource_id) === option.value;
          });
        }).filter(Boolean).map(function(resource) {
          return {
            resourceId: String(resource.resourceId || resource.id || resource.resource_id),
            name: resource.name || "",
            price: resource.price
          };
        });
        article.selectedResources = selectedResources;
        await api.media.setDraft(filename, article);
        rerender();
      });
    });

    resourceLibrary.bind(root, rerender);
  }

  return { load: load, render: render, bind: bind };
};
```

- [ ] **Step 7: Build other-platform workbench**

Create `desktop/renderer/platform-workbench.js`:

```js
window.createPlatformWorkbench = function(api) {
  var queue = [];
  var platforms = [];
  var selectedTargets = {};

  async function load() {
    var result = await api.platforms.getQueue();
    if (result.ok) {
      queue = result.data.queue;
      platforms = result.data.platforms;
    }
  }

  function renderGroup(group) {
    return [
      '<div class="queue-group">',
      '<h3>' + window.dom.escapeHtml(group.platformId) + '</h3>',
      group.articles.map(function(article) {
        return '<label class="check-row"><input type="checkbox" class="platform-article-check" data-platform="' + window.dom.escapeHtml(group.platformId) + '" data-filename="' + window.dom.escapeHtml(article.filename) + '"> ' + window.dom.escapeHtml(article.title || article.filename) + '</label>';
      }).join("") || '<p class="empty-state">无文章。</p>',
      '</div>'
    ].join("");
  }

  function render() {
    return [
      '<header class="workspace-head"><div><p class="eyebrow">Other Platforms</p><h1>其他平台</h1></div><button id="refreshPlatformWorkbench" class="secondary">刷新</button></header>',
      '<section class="panel"><div class="panel-head"><h2>选择文章</h2></div>' + (queue.map(renderGroup).join("") || '<p class="empty-state">没有其他平台文章。</p>') + '</section>',
      '<section class="panel"><div class="panel-head"><h2>选择目标平台</h2></div>',
      platforms.map(function(platform) {
        return '<label class="check-row"><input type="checkbox" class="platform-target-check" data-platform="' + window.dom.escapeHtml(platform.id) + '"> ' + window.dom.escapeHtml(platform.id) + '</label>';
      }).join(""),
      '<button id="buildPlatformPlan" class="primary">生成投喂计划</button><pre id="platformPlanPreview" class="log-stream"></pre></section>'
    ].join("");
  }

  function bind(root, rerender) {
    window.dom.byId("refreshPlatformWorkbench").addEventListener("click", async function() { await load(); rerender(); });
    root.querySelectorAll(".platform-target-check").forEach(function(input) {
      input.addEventListener("change", function() {
        selectedTargets[input.getAttribute("data-platform")] = input.checked;
      });
    });
    window.dom.byId("buildPlatformPlan").addEventListener("click", async function() {
      var articles = [];
      root.querySelectorAll(".platform-article-check:checked").forEach(function(input) {
        articles.push({
          filename: input.getAttribute("data-filename"),
          sourcePlatformId: input.getAttribute("data-platform")
        });
      });
      var targetPlatformIds = Object.keys(selectedTargets).filter(function(id) { return selectedTargets[id]; });
      var result = await api.platforms.buildSelectedPlan({ selectedArticles: articles, targetPlatformIds: targetPlatformIds });
      window.dom.byId("platformPlanPreview").textContent = JSON.stringify(result, null, 2);
    });
  }

  return { load: load, render: render, bind: bind };
};
```

- [ ] **Step 8: Replace `app.js` bootstrapping**

Replace `desktop/renderer/app.js`:

```js
(async function boot() {
  var api = window.desktopConsole;
  var workspaces = {
    mediaWorkspace: window.createMediaWorkbench(api),
    platformWorkspace: window.createPlatformWorkbench(api)
  };

  async function renderWorkspace(id) {
    var root = window.dom.byId(id);
    var workspace = workspaces[id];
    if (!root || !workspace) return;
    await workspace.load();
    root.innerHTML = workspace.render();
    workspace.bind(root, function() {
      renderWorkspace(id);
    });
  }

  document.querySelectorAll(".nav-item[data-workspace]").forEach(function(button) {
    button.addEventListener("click", async function() {
      var id = button.getAttribute("data-workspace");
      document.querySelectorAll(".nav-item").forEach(function(item) {
        item.classList.toggle("active", item === button);
      });
      document.querySelectorAll(".workspace").forEach(function(panel) {
        panel.classList.toggle("active", panel.id === id);
      });
      await renderWorkspace(id);
    });
  });

  api.batch.onState(function(payload) {
    window.dom.byId("globalStatus").textContent = payload.isBatchRunning ? "运行中" : "空闲";
  });

  await renderWorkspace("mediaWorkspace");
})();
```

- [ ] **Step 9: Add workbench CSS**

Ensure `desktop/renderer/styles.css` includes:

```css
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 220px minmax(0, 1fr); background: #f6f7f4; color: #1d2520; }
.sidebar { border-right: 1px solid #d9ded6; padding: 16px; background: #ffffff; }
.brand { font-weight: 800; margin-bottom: 18px; }
.nav-item { width: 100%; min-height: 38px; margin-bottom: 8px; border: 1px solid #d9ded6; background: #ffffff; text-align: left; padding: 0 10px; border-radius: 8px; }
.nav-item.active { background: #214b3b; color: #ffffff; }
.main-area { min-width: 0; }
.workspace { display: none; padding: 16px; }
.workspace.active { display: block; }
.workspace-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
.panel { background: #ffffff; border: 1px solid #d9ded6; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.media-workbench-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.8fr); gap: 16px; align-items: start; }
.article-row, .resource-row, .order-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #e7ebe4; }
.media-resource-multi { min-width: 240px; min-height: 88px; border: 1px solid #cbd2c8; border-radius: 8px; padding: 6px; }
.count-pill { padding: 5px 8px; border-radius: 999px; background: #e8f3ee; color: #214b3b; font-size: 12px; font-weight: 700; }
.drawer { position: fixed; top: 0; right: 0; width: min(560px, 92vw); height: 100vh; background: #ffffff; border-left: 1px solid #d9ded6; box-shadow: 0 18px 50px rgba(31, 44, 36, 0.16); z-index: 50; display: flex; flex-direction: column; }
.drawer-head { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #d9ded6; }
.drawer-body { overflow: auto; padding: 16px; }
.preview-text, .log-stream, .warning-list { max-height: 520px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
.check-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
.empty-state { color: #6d766f; }
button.primary { background: #214b3b; color: #ffffff; border: 0; border-radius: 8px; min-height: 36px; padding: 0 12px; }
button.secondary, button.danger, .icon-button { border: 1px solid #cbd2c8; background: #ffffff; border-radius: 8px; min-height: 36px; padding: 0 12px; }
button.danger { color: #9f2d20; border-color: #e2b7b0; }
```

- [ ] **Step 10: Manual smoke test**

Run:

```powershell
npm run desktop
```

Expected:
- Sidebar shows `媒体投稿` and `其他平台`.
- Media page loads articles from `input/media`.
- Media Pool selections are visible.
- Other Platforms page shows non-media queues.
- Orders drawer opens.

- [ ] **Step 11: Commit**

```bash
git add desktop/renderer
git commit -m "feat: split desktop renderer into workspaces"
```

## Task 8: Add Media Submit IPC And Final Confirmation Flow

**Files:**
- Modify: `desktop/ipc/media-ipc.js`
- Modify: `desktop/renderer/media-workbench.js`
- Modify: `desktop/renderer/shared/confirm.js`

- [ ] **Step 1: Register media submit IPC**

In `desktop/ipc/media-ipc.js`, create and reuse one `mediaWorkbenchService`. Register:

```js
ipcMain.handle("media:build-confirmation", function(event, articles) {
  return wrap(function() {
    return mediaWorkbenchService.buildConfirmationSummary(articles || []);
  });
});

ipcMain.handle("media:submit-selected", function(event, articles) {
  return wrap(function() {
    return mediaWorkbenchService.submitTasksSerially(articles || []);
  });
});

ipcMain.handle("media:stop-submit", function() {
  return wrap(function() {
    mediaWorkbenchService.requestStop();
    return { stopped: true };
  });
});
```

- [ ] **Step 2: Ensure confirmation is a drawer**

Verify `desktop/renderer/media-workbench.js` calls:

```js
window.confirmPanel.open(result.data, async function() {
  var submitResult = await api.media.submitSelected(articles);
  if (!submitResult.ok) return alert("提交失败：" + submitResult.error);
  alert("提交完成：成功 " + submitResult.data.ok + "，失败 " + submitResult.data.fail + "，跳过 " + submitResult.data.skipped);
  window.drawer.close();
  ordersDrawer.open();
});
```

- [ ] **Step 3: Verify `confirm()` is not used**

Run:

```powershell
rg "confirm\\(" desktop\renderer
```

Expected: no matches.

- [ ] **Step 4: Manual safety test**

Run:

```powershell
npm run desktop
```

Expected:
- Clicking `预检并提交` opens the confirmation drawer.
- If there are blockers, the real submit button is disabled.
- Real submit is not called until the drawer button is clicked.

- [ ] **Step 5: Commit**

```bash
git add desktop/ipc/media-ipc.js desktop/renderer/media-workbench.js desktop/renderer/shared/confirm.js
git commit -m "feat: add confirmed serial media submission"
```

## Task 9: Remove Legacy Renderer And Preload Paths

**Files:**
- Modify: `desktop/preload.js`
- Modify: `desktop/renderer/app.js`
- Modify: `desktop/renderer/styles.css`
- Modify: `desktop/main.js`
- Modify: `desktop/ipc/*.js`

- [ ] **Step 1: Search for obsolete DOM IDs**

Run:

```powershell
rg "overviewPanel|mediaQueuePanel|ordersPanel|settingsPanel|platformList|queueList|mediaResourceList|ordersList" desktop\renderer desktop\main.js desktop\preload.js
```

Expected: no matches, or only intentional comments. Remove stale references.

- [ ] **Step 2: Remove temporary preload aliases**

In `desktop/preload.js`, remove compatibility aliases added in Task 6 after the renderer uses grouped APIs only.

- [ ] **Step 3: Search for blocking browser dialogs**

Run:

```powershell
rg "prompt\\(|confirm\\(" desktop\renderer
```

Expected: no matches. `alert` may remain only for temporary failure summaries.

- [ ] **Step 4: Run app smoke test**

Run:

```powershell
npm run desktop
```

Expected: no missing API errors in renderer console.

- [ ] **Step 5: Commit**

```bash
git add desktop/preload.js desktop/renderer desktop/main.js desktop/ipc
git commit -m "refactor: remove legacy desktop renderer paths"
```

## Task 10: Final Verification And Documentation

**Files:**
- Create: `docs/desktop-workbench.md`

- [ ] **Step 1: Create workflow documentation**

Create `docs/desktop-workbench.md`:

```md
# Desktop Workbench

## Start

```powershell
cd F:\官媒投稿\auto—publish
npm run desktop
```

## Queue Snapshot

```powershell
npm run snapshot
```

## Workspaces

- Media Submission: scan `input/media`, select one or more Media Pool resources per article, preview, confirm, submit, and sync orders.
- Other Platforms: scan non-media platform queues, select articles, choose target platforms, and build publishing plans.

## Safety

- Media submission requires a final confirmation.
- Media submission runs serially.
- A failed media task does not stop later tasks.
- Stop prevents new tasks from starting and lets the current request finish.
```

- [ ] **Step 2: Run tests**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run snapshot**

Run:

```powershell
npm run snapshot
```

Expected: result includes `lieju`, `toutiao`, `hepan`, and `media`.

- [ ] **Step 4: Verify Electron install**

Run:

```powershell
node node_modules\electron\cli.js --version
```

Expected: prints an Electron version, currently `v33.4.11`.

- [ ] **Step 5: Manual app smoke test**

Run:

```powershell
npm run desktop
```

Expected:
- App opens.
- Media Submission workspace loads.
- Other Platforms workspace opens.
- Orders drawer opens.
- Closing the app leaves `npm run snapshot` working.

- [ ] **Step 6: Commit**

```bash
git add docs/desktop-workbench.md
git commit -m "docs: document desktop workbench workflow"
```

## Self-Review

### Spec Coverage

- Separate Media Submission and Other Platforms workspaces: Tasks 7 and 9.
- Media page only media content: Task 7.
- Other Platforms page with bulk article selection and target platform choice: Tasks 5 and 7.
- Article-driven media workflow: Tasks 3 and 7.
- One article to multiple media resources: Tasks 2, 3, 4, 7, and 8.
- Media Pool primary selection with full resource library support: Task 7.
- Required final confirmation before real submit: Task 8.
- Right-side article preview/drawer instead of alert preview: Task 7.
- Orders drawer: Task 7.
- High cohesion and low coupling: Tasks 5, 6, 7, and 9.
- No frontend framework yet, framework-friendly renderer split: Tasks 6 and 7.
- Serial submission, continue after failure, stop before next task: Tasks 3 and 8.
- Existing dependencies preserved: File Structure and final verification.

### Placeholder Scan

No `TBD`, `TODO`, `implement later`, or unspecified validation tasks remain. Each task has file paths, code shape, commands, and expected results.

### API Consistency

- IPC response shape is `{ ok, data }` / `{ ok, error }`.
- Preload grouped API names match renderer usage:
  - `api.batch.*`
  - `api.media.*`
  - `api.platforms.*`
  - `api.orders.*`
- Service method names are consistent:
  - `scanArticles`
  - `expandSubmissionTasks`
  - `buildConfirmationSummary`
  - `submitTasksSerially`
  - `requestStop`
