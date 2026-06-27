# Media Posting Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把媒体投稿流程改成“先选文章，再从统一媒体池选择发布对象”，让文章详情只负责预览和草稿编辑，同时为未来更大的媒体池保留稳定的分页、搜索和筛选布局。

**Architecture:** 媒体池只保留一套共享选择界面，文章详情不再嵌入第二份资源库。`desktop/renderer/media-workbench.js` 负责当前文章上下文、草稿状态和媒体池联动，`desktop/renderer/media-article-drawer.js` 只展示文章预览、标题、备注和已选媒体摘要。`desktop/renderer/media-resource-library.js` 继续作为共享组件使用，但它只渲染一次，并通过分页、搜索和池内状态提示支撑后续资源量增长。

**Tech Stack:** Electron 33, CommonJS, plain HTML/CSS/JS, existing preload IPC, `node:test`.

---

## Requirements Summary

- 文章列表里的“打开”只进入文章详情，不再在抽屉里重复渲染媒体资源库。
- 每篇文章要发布到哪些平台/媒体，只能从媒体池选择，文章本身只保存选择结果。
- 媒体池后续会变大，所以必须保留分页、搜索、选择状态和清晰的当前上下文提示。
- 媒体池仍然是管理入口，但文章编辑和媒体选择必须分离，避免重复界面和重复操作。
- 新计划文件是唯一主计划，旧计划已经删除，不再回填旧路线。

## File Structure

### Existing Files To Modify

- `desktop/renderer/media-workbench.js`
  - Own the active article context, open article detail drawer, and keep the shared media pool synced to the current article draft.
- `desktop/renderer/media-article-drawer.js`
  - Remove the embedded media resource library and keep only preview, draft editing, selected media summary, and save actions.
- `desktop/renderer/media-resource-library.js`
  - Keep one reusable library instance, make picker/management behavior explicit, and improve large-pool browsing ergonomics.
- `desktop/renderer/styles.css`
  - Add layout rules for the separate article-detail and media-pool surfaces, plus the large-list browsing states.
- `desktop/renderer/index.html`
  - Keep the shared drawer roots and script order stable if any new renderer module is introduced.
- `docs/desktop-workbench.md`
  - Document the new workflow so future changes do not reintroduce the duplicate resource selection path.

### Test Files To Create or Update

- `tests/media-workbench-flow.test.js`
  - Guards the article-detail and media-pool separation.
- `tests/media-article-drawer-boundary.test.js`
  - Guards that the article drawer no longer embeds its own resource library.
- `tests/media-resource-library-scale.test.js`
  - Guards paging, search reset, and selection-state behavior for large pools.
- `tests/renderer-encoding.test.js`
  - Update readable labels if any button text or headings change.

---

## Task 1: Remove the duplicate media library from article details

**Files:**
- Modify: `desktop/renderer/media-article-drawer.js`
- Modify: `desktop/renderer/media-workbench.js`
- Test: `tests/media-article-drawer-boundary.test.js`

- [ ] **Step 1: Write the regression guard**

Create `tests/media-article-drawer-boundary.test.js` so the article drawer can no longer silently grow its own copy of the media picker.

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", "auto—publish", file), "utf-8");
}

describe("media article drawer boundary", function() {
  it("keeps media selection outside the article drawer", function() {
    const source = read("desktop/renderer/media-article-drawer.js");
    assert.equal(source.includes("articleResourceLibraryRoot"), false);
    assert.equal(source.includes("createMediaResourceLibrary("), false);
  });
});
```

- [ ] **Step 2: Run the guard and confirm it fails before the refactor**

Run:

```powershell
node --test "tests/media-article-drawer-boundary.test.js"
```

Expected: fail until the embedded resource library is removed from `desktop/renderer/media-article-drawer.js`.

- [ ] **Step 3: Rewrite the drawer to be article-only**

Update `desktop/renderer/media-article-drawer.js` so the drawer renders only:

```js
[
  '<div class="drawer-head">...</div>',
  '<section class="drawer-section">文章预览</section>',
  '<section class="drawer-section">草稿编辑</section>',
  '<section class="drawer-section">已选媒体摘要</section>',
  '<div class="drawer-actions">保存 / 保存并关闭 / 取消</div>'
].join("");
```

The drawer should keep the selected media list as read-only summary chips or rows, but the actual add/remove workflow must move to the shared media pool surface.

- [ ] **Step 4: Move the article-media binding into the workbench**

Update `desktop/renderer/media-workbench.js` so the workbench tracks the currently opened article, opens the drawer for preview/edit, and keeps the shared media pool pointed at that same article draft. The workbench should own the single instance of `media-resource-library.js` and pass the active article context into it instead of letting the drawer create a second copy.

- [ ] **Step 5: Re-run the boundary guard**

Run:

```powershell
node --test "tests/media-article-drawer-boundary.test.js"
```

Expected: PASS.

## Task 2: Make the media pool the only place where selections happen

**Files:**
- Modify: `desktop/renderer/media-workbench.js`
- Modify: `desktop/renderer/media-resource-library.js`
- Modify: `desktop/renderer/styles.css`
- Test: `tests/media-workbench-flow.test.js`

- [ ] **Step 1: Write the workflow guard**

Add `tests/media-workbench-flow.test.js` to pin the new interaction model: the workbench owns the active article, and the media pool selection surface stays in one place.

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", "auto—publish", file), "utf-8");
}

describe("media workbench flow", function() {
  it("keeps a single shared media pool surface", function() {
    const workbench = read("desktop/renderer/media-workbench.js");
    const drawer = read("desktop/renderer/media-article-drawer.js");
    assert.ok(workbench.includes("activeArticle"));
    assert.equal(drawer.includes("createMediaResourceLibrary("), false);
  });
});
```

- [ ] **Step 2: Run the guard and confirm the current flow still violates it**

Run:

```powershell
node --test "tests/media-workbench-flow.test.js"
```

Expected: fail before the workbench owns the single shared media-pool surface.

- [ ] **Step 3: Add active-article state to the workbench**

Update `desktop/renderer/media-workbench.js` to keep:

```js
var activeArticleFilename = "";
var activeArticle = null;
```

When a row opens, the workbench should:

```js
activeArticleFilename = filename;
activeArticle = articles.find(function(item) { return item.filename === filename; }) || null;
```

Then render the drawer for that article, and point the shared media pool at the same draft so the selected media count, selection chips, and pool picker all describe the same article.

- [ ] **Step 4: Make the resource library respect the active article**

Extend `desktop/renderer/media-resource-library.js` so the library can switch between:

```js
setMode("management");
setMode("picker");
setSelectedResourceIds(ids);
```

The main workbench should use management mode by default, and switch to picker mode when an article is open. The right-side pool area should always show which article is being edited, so large pools do not feel disconnected from the task at hand.

- [ ] **Step 5: Add the layout rules for the article/pool split**

Update `desktop/renderer/styles.css` so the article detail surface and the pool surface feel like two coordinated work areas instead of one repeated panel. Keep the article detail compact, keep the pool taller, and make the pool search bar and page controls visually sticky enough that large lists remain usable.

- [ ] **Step 6: Re-run the workflow guard**

Run:

```powershell
node --test "tests/media-workbench-flow.test.js"
```

Expected: PASS.

## Task 3: Make the media pool scale cleanly as the library grows

**Files:**
- Modify: `desktop/renderer/media-resource-library.js`
- Modify: `desktop/renderer/styles.css`
- Test: `tests/media-resource-library-scale.test.js`

- [ ] **Step 1: Write the scale guard**

Create `tests/media-resource-library-scale.test.js` to protect the browsing contract for large pools.

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", "auto—publish", file), "utf-8");
}

describe("media resource library scale", function() {
  it("keeps paging and search instead of rendering everything at once", function() {
    const source = read("desktop/renderer/media-resource-library.js");
    assert.ok(source.includes("perPage = 20"));
    assert.ok(source.includes("getResourcePage("));
    assert.ok(source.includes("searchResourcePage("));
  });
});
```

- [ ] **Step 2: Run the scale guard**

Run:

```powershell
node --test "tests/media-resource-library-scale.test.js"
```

Expected: PASS after the scale hooks remain explicit and stable.

- [ ] **Step 3: Improve browsing affordances without changing the data model**

Keep `perPage = 20`, keep local-cache-first behavior, and make the pool easier to scan by tightening these behaviors:

```js
// already current behavior, keep it explicit
searchInput.addEventListener("input", ...);
prevBtn / nextBtn navigation;
page = 1 when keyword changes;
selectedResourceIds highlighting;
```

Add a small header or status row that tells the user which article is currently being edited and how many media items are already selected for it.

- [ ] **Step 4: Make the panel feel stable at larger sizes**

Add CSS rules so the pool surface keeps its search bar, pagination, and list rhythm predictable when the library gets much larger. Do not switch to a full-table dump or a render-all strategy; keep the current page boundary intact.

- [ ] **Step 5: Re-run the scale guard**

Run:

```powershell
node --test "tests/media-resource-library-scale.test.js"
```

Expected: PASS.

## Task 4: Update docs and verify the new workflow end to end

**Files:**
- Modify: `docs/desktop-workbench.md`
- Modify: `tests/renderer-encoding.test.js`
- Run: `node --test tests/*.test.js`

- [ ] **Step 1: Update the desktop workflow doc**

Document the new operating model in `docs/desktop-workbench.md`:

```md
- Article details live in the drawer.
- Media selection happens only in the shared media pool.
- The pool stays paged and searchable so large libraries stay usable.
- Old duplicate selection paths do not come back.
```

- [ ] **Step 2: Refresh the renderer encoding guard if labels changed**

If any button labels or headings changed while removing the duplicate resource library, update `tests/renderer-encoding.test.js` so it still checks readable Chinese labels instead of brittle old text.

- [ ] **Step 3: Run the full test suite**

Run:

```powershell
node --test "tests/*.test.js"
```

Expected: all tests pass.

- [ ] **Step 4: Commit the workflow cleanup**

Use a focused commit after the refactor, for example:

```powershell
git add desktop/renderer/media-workbench.js desktop/renderer/media-article-drawer.js desktop/renderer/media-resource-library.js desktop/renderer/styles.css docs/desktop-workbench.md tests/media-article-drawer-boundary.test.js tests/media-workbench-flow.test.js tests/media-resource-library-scale.test.js tests/renderer-encoding.test.js
git commit -m "feat: simplify media posting workflow"
```

---

## Self-Review

- Spec coverage: article drawer boundary, shared media pool ownership, large-pool scalability, docs, and regression tests are all covered by tasks.
- Placeholder scan: no TBD/TODO placeholders, no vague "handle edge cases" steps.
- Type consistency: `activeArticle`, `activeArticleFilename`, `setMode("picker")`, `setMode("management")`, `setSelectedResourceIds(ids)`, `getResourcePage(...)`, and `searchResourcePage(...)` are used consistently across tasks.
- Scope check: this plan stays inside the media-posting workflow and does not reopen the old workbench refactor.
