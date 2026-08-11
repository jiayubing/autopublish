const assert = require("node:assert/strict");
const test = require("node:test");

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function sourceAdapters(overrides = {}) {
  return {
    listClients: async () => [{ id: "client-1", name: "客户一" }],
    listTemplateCatalog: async () => ({ revision: "r1", platforms: [], templates: [], diagnostics: [] }),
    listQuestions: async () => [],
    listResearch: async () => [],
    ...overrides,
  };
}

test("Doubao collection command owns pending state at the public feature boundary", async () => {
  const { createContentSourcesFeature } = await import(
    "../media-workbench/src/features/content/content-sources-feature.js"
  );
  const collection = deferred();
  const feature = createContentSourcesFeature(
    sourceAdapters({ collectDoubaoQuestion: () => collection.promise }),
  );
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  const pending = feature.commands.collectDoubaoQuestion({ clientId: "client-1" });
  assert.equal(feature.getSnapshot().commands.collectDoubaoQuestion.busy, true);
  collection.resolve({ ok: true });
  await pending;
  assert.equal(feature.getSnapshot().commands.collectDoubaoQuestion.busy, false);
  feature.dispose();
});

test("malformed cached Doubao login state remains explicitly unavailable", async () => {
  const { createContentSourcesFeature } = await import(
    "../media-workbench/src/features/content/content-sources-feature.js"
  );
  const feature = createContentSourcesFeature(sourceAdapters({
    getCachedDoubaoLoginState: () => ({ status: "unexpected", observation: "complete" }),
  }));
  assert.deepEqual(feature.getSnapshot().doubaoLogin, {
    status: "unknown",
    observation: "unavailable",
  });
  feature.dispose();
});

test("content source command errors do not expose raw transport messages", async () => {
  const { createContentSourcesFeature } = await import(
    "../media-workbench/src/features/content/content-sources-feature.js"
  );
  const feature = createContentSourcesFeature(sourceAdapters({
    getDoubaoLoginStatus: async () => { throw new Error("C:\\private\\cookie=secret"); },
  }));
  feature.setScope({ workspaceRuntimeId: "runtime-login-error" });
  await assert.rejects(feature.commands.getDoubaoLoginStatus());
  assert.equal(
    feature.getSnapshot().doubaoLoginQuery.error.userMessage,
    "无法加载客户与模板。",
  );
  assert.doesNotMatch(JSON.stringify(feature.getSnapshot()), /private|cookie|secret/i);
  feature.dispose();
});

test("completed empty queue refreshes client data once per queue identity", async () => {
  const { createContentSourcesFeature } = await import(
    "../media-workbench/src/features/content/content-sources-feature.js"
  );
  let subscribe;
  let questionReads = 0;
  let researchReads = 0;
  const feature = createContentSourcesFeature(
    sourceAdapters({
      listQuestions: async () => {
        questionReads += 1;
        return [];
      },
      listResearch: async () => {
        researchReads += 1;
        return [];
      },
      subscribeDoubaoQueue: (listener) => {
        subscribe = listener;
        return () => {};
      },
    }),
  );
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  const before = { questionReads, researchReads };
  const completed = { status: "completed", completed: 0, total: 0, tasks: [] };
  subscribe(completed);
  await new Promise((resolve) => setImmediate(resolve));
  const afterFirst = { questionReads, researchReads };
  subscribe(completed);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(afterFirst.questionReads > before.questionReads);
  assert.ok(afterFirst.researchReads > before.researchReads);
  assert.deepEqual({ questionReads, researchReads }, afterFirst);
  feature.dispose();
});

test("history template resolution preserves a deleted snapshot while using the current catalog when available", async () => {
  const { resolveAvailableTemplateId } = await import(
    "../media-workbench/src/article-history-logic.js"
  );
  assert.equal(
    resolveAvailableTemplateId(
      { platform: "ctrip", scenario: "guide", templateId: "missing" },
      [{ id: "current", platform: "ctrip", scenario: "guide" }],
    ),
    "current",
  );
  assert.equal(
    resolveAvailableTemplateId(
      {
        platform: "ctrip",
        templateId: "deleted",
        templateSnapshot: { platform: "ctrip", id: "deleted", scenario: "guide" },
      },
      [{ id: "current", platform: "ctrip", scenario: "guide" }],
    ),
    "deleted",
  );
});
