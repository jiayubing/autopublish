import test from "node:test";
import assert from "node:assert/strict";

import { createContentWorkbenchFeature } from "../media-workbench/src/features/content/content-workbench-feature.js";

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function adapters(overrides = {}) {
  return {
    listClients: async () => [{ id: "client-a", name: "A" }, { id: "client-b", name: "B" }],
    listTemplateCatalog: async () => ({ revision: "catalog-1", platforms: [], templates: [], diagnostics: [] }),
    listQuestions: async (clientId) => [{ id: `question-${clientId}`, clientId, text: clientId, enabled: true }],
    listResearch: async (clientId) => [{ id: `research-${clientId}`, clientId, queryId: `question-${clientId}`, answerText: clientId }],
    loadManagement: async (clientId) => ({
      revision: 4,
      articles: [{ id: `article-${clientId}`, clientId }],
      trash: [{ articleId: `trash-${clientId}`, clientId }],
      submissionBatches: [{ id: `batch-${clientId}`, clientId }],
      cancellationPlans: [],
      publicationRecords: [],
      workflowByArticle: {},
      submissionPlatforms: [{ id: "platform-a", displayName: "Platform A", contentQueueImport: true }],
    }),
    listPaidMediaBatches: async () => [],
    startPaidMediaBatch: async () => ({}),
    pausePaidMediaBatch: async () => ({}),
    cancelRemainingPaidMediaBatchItems: async () => ({}),
    ...overrides,
  };
}

test("content read model owns client questions, research, and article-management projections", async () => {
  const feature = createContentWorkbenchFeature(adapters());
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");

  const snapshot = feature.getSnapshot();
  assert.equal(snapshot.selectedClientId, "client-a");
  assert.deepEqual(snapshot.questions.map((item) => item.id), ["question-client-a"]);
  assert.deepEqual(snapshot.research.map((item) => item.id), ["research-client-a"]);
  assert.deepEqual(snapshot.researchByClient["client-b"].map((item) => item.id), ["research-client-b"]);
  assert.deepEqual(snapshot.management.articles.map((item) => item.id), ["article-client-a"]);
  assert.deepEqual(snapshot.management.trash.map((item) => item.articleId), ["trash-client-a"]);
  assert.deepEqual(snapshot.management.submissionBatches.map((item) => item.id), ["batch-client-a"]);
  assert.equal(snapshot.clientQuery.loading, false);
  assert.equal(snapshot.managementQuery.loading, false);
});

test("content read model rejects stale selected-client queries through feature query identity", async () => {
  const clientAQuestions = deferred();
  const clientAResearch = deferred();
  const feature = createContentWorkbenchFeature(adapters({
    listQuestions: (clientId) => clientId === "client-a" ? clientAQuestions.promise : Promise.resolve([{ id: "question-b", clientId }]),
    listResearch: (clientId) => clientId === "client-a" ? clientAResearch.promise : Promise.resolve([{ id: "research-b", clientId }]),
  }));
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refreshSources("initial");
  const pendingA = feature.refreshClientData("initial");
  await feature.selectClient("client-b");
  clientAQuestions.resolve([{ id: "question-a", clientId: "client-a" }]);
  clientAResearch.resolve([{ id: "research-a", clientId: "client-a" }]);
  await pendingA;

  const snapshot = feature.getSnapshot();
  assert.equal(snapshot.selectedClientId, "client-b");
  assert.deepEqual(snapshot.questions.map((item) => item.id), ["question-b"]);
  assert.deepEqual(snapshot.research.map((item) => item.id), ["research-b"]);
});

test("content destructive command rejects an input client outside its current feature scope", async () => {
  let executeCalls = 0;
  const feature = createContentWorkbenchFeature(adapters({
    permanentlyDeleteContentArticle: async () => { executeCalls += 1; return { deleted: true }; },
  }));
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");

  await assert.rejects(
    feature.commands.permanentlyDeleteContentArticle({ clientId: "client-b", articleId: "article-client-b", token: "token-1" }),
    (error) => error.code === "CONTENT_CLIENT_SCOPE_MISMATCH",
  );
  assert.equal(executeCalls, 0);
  feature.dispose();
});

test("content feature fails closed when its production content capability is unavailable", async () => {
  const feature = createContentWorkbenchFeature(adapters({
    listClients: async () => { throw new Error("CONTENT_CAPABILITY_UNAVAILABLE"); },
  }));
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");

  const snapshot = feature.getSnapshot();
  assert.equal(snapshot.clients.length, 0);
  assert.equal(snapshot.query.loading, false);
  assert.equal(snapshot.query.error.code, "CONTENT_SOURCES_QUERY_FAILED");
  assert.notEqual(snapshot.query.reason, "renderer-fallback");
  feature.dispose();
});

test("content ordinary mutations have independent command owners and refresh their authoritative query", async () => {
  let resolveSave;
  let questionReads = 0;
  let managementReads = 0;
  const feature = createContentWorkbenchFeature(adapters({
    listQuestions: async () => { questionReads += 1; return []; },
    loadManagement: async () => { managementReads += 1; return { articles: [], trash: [], submissionBatches: [] }; },
    createQuestion: async (input) => ({ id: "question-new", ...input }),
    saveArticle: () => new Promise((resolve) => { resolveSave = resolve; }),
  }));
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  const baselineQuestionReads = questionReads;
  const baselineManagementReads = managementReads;

  const saving = feature.commands.saveArticle({ clientId: "client-a", articleId: "article-a", title: "A" });
  const creating = feature.commands.createQuestion({ clientId: "client-a", text: "Q", enabled: true });
  assert.equal(feature.getSnapshot().commands.saveArticle.busy, true);
  assert.equal(feature.getSnapshot().commands.createQuestion.busy, true);
  await creating;
  assert.equal(feature.getSnapshot().commands.createQuestion.busy, false);
  assert.equal(feature.getSnapshot().commands.saveArticle.busy, true);
  assert.ok(questionReads > baselineQuestionReads);
  assert.equal(managementReads, baselineManagementReads);

  resolveSave({ id: "article-a", clientId: "client-a", title: "A", status: "saved" });
  await saving;
  assert.equal(feature.getSnapshot().commands.saveArticle.busy, false);
  assert.ok(managementReads > baselineManagementReads);
  assert.equal(feature.getSnapshot().currentArticle.id, "article-a");
});
