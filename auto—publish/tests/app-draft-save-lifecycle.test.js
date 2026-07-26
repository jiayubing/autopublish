"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { it } = require("node:test");

const controllerModule = import(
  pathToFileURL(
    path.resolve(__dirname, "../media-workbench/src/app-draft-save-controller.js"),
  ).href
);
const sessionModule = import(
  pathToFileURL(
    path.resolve(
      __dirname,
      "../media-workbench/src/components/article-editor-session.js",
    ),
  ).href
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function article(id, resources = []) {
  return {
    id,
    articleId: id,
    filename: `${id}.md`,
    title: id,
    remark: "",
    ignoreImages: false,
    selectedResources: resources,
  };
}

async function harness(values) {
  const { createAppDraftSaveController } = await controllerModule;
  const { createArticleEditorSession } = await sessionModule;
  let articles = values.articles;
  let active = values.active;
  const persisted = [];
  const controller = createAppDraftSaveController({
    async persistDraft(filename, draft) {
      persisted.push({ filename, draft: structuredClone(draft) });
      await values.pending.promise;
    },
    setArticles(updater) { articles = updater(articles); },
    setActiveArticle(updater) { active = updater(active); },
  });
  const session = createArticleEditorSession({
    saveDraft: (draft, source) => controller.saveDraft(draft, source),
  });
  session.open(active);
  return {
    controller,
    session,
    persisted,
    get articles() { return articles; },
    get active() { return active; },
    setActive(next) { active = next; session.open(next); },
    mergeActive() { session.mergeExternal(active); },
  };
}

it("keeps a resource added during save dirty until a second save persists it", async () => {
  const pending = deferred();
  const state = await harness({ articles: [article("a")], active: article("a"), pending });
  state.session.update({ title: "edited" });
  const saving = state.session.save();
  const resource = { resourceId: "r-1", name: "one" };
  state.controller.addResource(resource, state.active);
  state.mergeActive();
  pending.resolve();
  const first = await saving;
  assert.deepEqual(state.active.selectedResources, [resource]);
  assert.deepEqual(state.articles[0].selectedResources, [resource]);
  assert.deepEqual(state.persisted[0].draft.selectedResources, []);
  assert.equal(first.snapshot.dirty, true);
  assert.equal(first.snapshot.saveSuccess, false);

  const secondPending = deferred();
  state.controller.setPersistDraft(async (filename, draft) => {
    state.persisted.push({ filename, draft: structuredClone(draft) });
    await secondPending.promise;
  });
  const secondSave = state.session.save();
  secondPending.resolve();
  const second = await secondSave;
  assert.deepEqual(state.persisted[1].draft.selectedResources, [resource]);
  assert.equal(second.snapshot.dirty, false);
  assert.equal(second.snapshot.saveSuccess, true);
});

it("does not resurrect a resource removed while save is pending", async () => {
  const pending = deferred();
  const resource = { resourceId: "r-1", name: "one" };
  const source = article("a", [resource]);
  const state = await harness({ articles: [source], active: source, pending });
  state.session.update({ title: "edited" });
  const saving = state.session.save();
  state.controller.removeResource("r-1", state.active);
  state.mergeActive();
  pending.resolve();
  const result = await saving;
  assert.deepEqual(state.active.selectedResources, []);
  assert.deepEqual(state.articles[0].selectedResources, []);
  assert.deepEqual(state.persisted[0].draft.selectedResources, [resource]);
  assert.equal(result.snapshot.dirty, true);
  assert.equal(result.snapshot.saveSuccess, false);
});

it("drops a late A save from active B while retaining A list updates", async () => {
  const pending = deferred();
  const a = article("a");
  const b = article("b");
  const state = await harness({ articles: [a, b], active: a, pending });
  state.session.update({ title: "saved A" });
  const saving = state.session.save();
  state.setActive(b);
  pending.resolve();
  const result = await saving;
  assert.equal(result.stale, true);
  assert.equal(state.active.articleId, "b");
  assert.equal(state.active.title, "b");
  assert.equal(state.articles.find((item) => item.articleId === "a").title, "saved A");
});

it("preserves a newly selected resource when persistence fails and remains retryable", async () => {
  const pending = deferred();
  const state = await harness({ articles: [article("a")], active: article("a"), pending });
  state.session.update({ title: "edited" });
  const saving = state.session.save();
  const resource = { resourceId: "r-2", name: "two" };
  state.controller.addResource(resource, state.active);
  state.mergeActive();
  pending.reject(new Error("EIO"));
  const result = await saving;
  assert.equal(result.saved, false);
  assert.equal(result.snapshot.dirty, true);
  assert.match(result.snapshot.saveError, /重试/);
  assert.deepEqual(state.active.selectedResources, [resource]);
  assert.deepEqual(state.articles[0].selectedResources, [resource]);
});
