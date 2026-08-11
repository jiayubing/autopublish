const assert = require("node:assert/strict");
const { it } = require("node:test");
const sessionModule = import("../media-workbench/src/components/article-editor-session.js");

const article = (id, extra) => Object.assign({ filename: id + ".md", id, title: "标题", remark: "保留备注", ignoreImages: true, selectedResources: [] }, extra);

it("initializes all editable fields and closes an unchanged session without writing", async () => {
  const { createArticleEditorSession } = await sessionModule;
  const calls = []; const session = createArticleEditorSession({ saveDraft: async (draft) => calls.push(draft) });
  session.open(article("a"));
  assert.equal(session.snapshot().draft.remark, "保留备注"); assert.equal(session.snapshot().draft.ignoreImages, true); assert.equal(session.snapshot().dirty, false);
  assert.deepEqual(session.close(false), { closed: true, requiresConfirmation: false }); assert.equal(calls.length, 0);
});

it("keeps dirty state and the session open after save failure", async () => {
  const { createArticleEditorSession } = await sessionModule;
  const session = createArticleEditorSession({ saveDraft: async () => { throw new Error("EIO"); } });
  session.open(article("a")); session.update({ title: "修改" });
  const result = await session.save(); assert.equal(result.saved, false); assert.match(result.error.message, /EIO/); assert.equal(session.snapshot().dirty, true); assert.equal(session.snapshot().draft.title, "修改");
  assert.equal(session.close(false).requiresConfirmation, true);
});

it("drops late A results after switching to B and never writes B", async () => {
  const { createArticleEditorSession } = await sessionModule;
  let release; const pending = new Promise((resolve) => { release = resolve; }); const calls = [];
  const session = createArticleEditorSession({ saveDraft: async (draft) => { calls.push(draft.filename); await pending; } });
  session.open(article("a")); session.update({ title: "A 修改" }); const saveA = session.save();
  session.open(article("b")); release(); const result = await saveA;
  assert.equal(result.stale, true); assert.equal(session.snapshot().articleId, "b"); assert.equal(session.snapshot().draft.title, "标题"); assert.deepEqual(calls, ["a.md"]);
  session.dispose();
});

it("drops late rejection after unmount without changing the new lifecycle", async () => {
  const { createArticleEditorSession } = await sessionModule;
  let reject; const pending = new Promise((_, fail) => { reject = fail; });
  const session = createArticleEditorSession({ saveDraft: async () => pending });
  session.open(article("a")); session.update({ title: "A 修改" }); const save = session.save(); session.dispose(); reject(new Error("late"));
  const result = await save; assert.equal(result.stale, true); assert.equal(session.snapshot().articleId, null);
});

it("resets saving and outcome state when switching from A to B and fences late resolve", async () => {
  const { createArticleEditorSession } = await sessionModule;
  let release; const pending = new Promise((resolve) => { release = resolve; });
  const session = createArticleEditorSession({ saveDraft: async () => pending });
  session.open(article("a")); session.update({ title: "A 修改" }); const saveA = session.save();
  assert.equal(session.snapshot().isSaving, true);
  session.open(article("b"));
  assert.equal(session.snapshot().isSaving, false); assert.equal(session.snapshot().saveError, null); assert.equal(session.snapshot().saveSuccess, false);
  release(); const result = await saveA;
  assert.equal(result.stale, true); assert.equal(session.snapshot().articleId, "b"); assert.equal(session.snapshot().isSaving, false); assert.equal(session.snapshot().saveSuccess, false);
});

it("consumes a rejected save as state and keeps B retryable", async () => {
  const { createArticleEditorSession } = await sessionModule;
  let shouldFail = true;
  const session = createArticleEditorSession({ saveDraft: async () => { if (shouldFail) throw new Error("EIO"); } });
  session.open(article("b")); session.update({ title: "B 修改" });
  const failed = await session.save();
  assert.equal(failed.saved, false); assert.equal(failed.stale, false); assert.match(failed.error.message, /EIO/);
  assert.equal(session.snapshot().isSaving, false); assert.equal(session.snapshot().dirty, true); assert.equal(session.snapshot().saveError, "保存失败，请重试");
  shouldFail = false; const saved = await session.save(); assert.equal(saved.saved, true); assert.equal(session.snapshot().dirty, false); assert.equal(session.snapshot().saveSuccess, true);
});

it("publishes edits and timed save outcomes to the component subscriber", async () => {
  const { createArticleEditorSession } = await sessionModule;
  const session = createArticleEditorSession({ saveSuccessTtlMs: 5, saveDraft: async () => {} });
  const snapshots = [];
  const unsubscribe = session.subscribe(() => snapshots.push(session.snapshot()));
  session.open(article("a"));
  session.update({ title: "组件修改", remark: "组件备注", ignoreImages: false });
  assert.equal(session.snapshot().dirty, true);
  await session.save();
  assert.equal(session.snapshot().saveSuccess, true);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(session.snapshot().saveSuccess, false);
  assert.ok(snapshots.some((value) => value.draft && value.draft.title === "组件修改"));
  unsubscribe();
});

it("merges same-identity resource props without reopening or losing local edits", async () => {
  const { createArticleEditorSession } = await sessionModule;
  const session = createArticleEditorSession({ saveDraft: async () => {} });
  const resource = { resourceId: "resource-2", name: "新资源", price: 1, type: "image", createdAt: "2026-07-25T00:00:00.000Z" };
  session.open(article("a", { id: "article-a", selectedResources: [] }));
  const sessionId = session.snapshot().sessionId;
  session.update({ title: "用户未保存标题", remark: "用户未保存备注" });
  const merged = session.mergeExternal(article("a", { id: "article-a", title: "服务器标题", selectedResources: [resource] }));
  assert.equal(merged.sessionId, sessionId);
  assert.equal(merged.articleId, "article-a");
  assert.equal(merged.draft.title, "用户未保存标题");
  assert.equal(merged.draft.remark, "用户未保存备注");
  assert.deepEqual(merged.draft.selectedResources, [resource]);
  assert.equal(merged.dirty, true);
});

it("isolates a failing subscriber and reports the listener failure", async () => {
  const { createArticleEditorSession } = await sessionModule;
  const reports = [];
  let healthyNotifications = 0;
  const session = createArticleEditorSession({
    saveDraft: async () => {},
    onDiagnostic: (value) => reports.push(value),
  });
  session.subscribe(() => { throw new Error("subscriber failure"); });
  session.subscribe(() => { healthyNotifications += 1; });
  session.open(article("listener-isolation"));
  assert.equal(healthyNotifications, 1);
  assert.deepEqual(reports, [{ code: "ARTICLE_EDITOR_LISTENER_FAILED" }]);
});
