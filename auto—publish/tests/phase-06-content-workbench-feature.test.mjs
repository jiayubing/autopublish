import test from "node:test";
import assert from "node:assert/strict";

import { createContentWorkbenchFeature } from "../media-workbench/src/features/content/content-workbench-feature.js";

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const paidExecutionAdapters = Object.freeze({
  listPaidMediaBatches: async () => [],
  startPaidMediaBatch: async ({ batchId }) => ({ batch: { batchId } }),
  pausePaidMediaBatch: async ({ batchId }) => ({ batch: { batchId } }),
});

test("content workspace source query shares identity across initial manual and invalidation refresh", async () => {
  const firstClients = deferred();
  const firstCatalog = deferred();
  let call = 0;
  const feature = createContentWorkbenchFeature({
    ...paidExecutionAdapters,
    listClients: () =>
      ++call === 1
        ? firstClients.promise
        : Promise.resolve([{ id: "b", name: "B" }]),
    listTemplateCatalog: () =>
      call === 1
        ? firstCatalog.promise
        : Promise.resolve({
            revision: "r2",
            platforms: [],
            templates: [],
            diagnostics: [],
          }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  const initial = feature.refresh("initial");
  await feature.refresh("invalidation");
  firstClients.resolve([{ id: "a", name: "A" }]);
  firstCatalog.resolve({
    revision: "r1",
    platforms: [],
    templates: [],
    diagnostics: [],
  });
  await initial;
  assert.deepEqual(feature.getSnapshot().clients, [{ id: "b", name: "B" }]);
  assert.equal(feature.getSnapshot().selectedClientId, "b");
  assert.equal(feature.getSnapshot().query.loading, false);
});

test("content workspace feature owns client and current-article scope", async () => {
  const feature = createContentWorkbenchFeature({
    ...paidExecutionAdapters,
    listClients: async () => [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    listTemplateCatalog: async () => ({
      revision: "r1",
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  feature.selectClient("b");
  feature.setCurrentArticle({ id: "article-b", clientId: "b", title: "B" });
  assert.equal(feature.getSnapshot().selectedClientId, "b");
  assert.equal(feature.getSnapshot().currentArticle.id, "article-b");
  feature.selectClient("a");
  assert.equal(feature.getSnapshot().currentArticle, null);
});

test("content workspace switch clears articles and rejects the previous runtime management result", async () => {
  const runtimeAManagement = deferred();
  let activeRuntime = "runtime-a";
  const feature = createContentWorkbenchFeature({
    ...paidExecutionAdapters,
    listClients: async () => [
      {
        id: activeRuntime === "runtime-a" ? "client-a" : "client-b",
        name: activeRuntime === "runtime-a" ? "A client" : "B client",
      },
    ],
    listTemplateCatalog: async () => ({
      revision: activeRuntime,
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async (clientId) => {
      if (clientId === "client-a") return runtimeAManagement.promise;
      return { articles: [{ id: "article-b", clientId: "client-b" }] };
    },
  });

  feature.setScope({ workspaceRuntimeId: "runtime-a" });
  await feature.refreshSources("initial");
  const pendingRuntimeA = feature.refreshManagement("manual");

  activeRuntime = "runtime-b";
  feature.setScope({ workspaceRuntimeId: "runtime-b" });
  assert.deepEqual(feature.getSnapshot().management.articles, []);
  await feature.refresh("runtime-switch");
  assert.deepEqual(
    feature.getSnapshot().management.articles.map((article) => article.id),
    ["article-b"],
  );

  runtimeAManagement.resolve({
    articles: [{ id: "article-a", clientId: "client-a" }],
  });
  assert.equal(await pendingRuntimeA, false);
  assert.deepEqual(
    feature.getSnapshot().management.articles.map((article) => article.id),
    ["article-b"],
  );
});

test("content workspace owns each ordinary question mutation independently", async () => {
  let refreshes = 0;
  const feature = createContentWorkbenchFeature({
    ...paidExecutionAdapters,
    listClients: async () => [{ id: "a", name: "A" }],
    listTemplateCatalog: async () => ({
      revision: "r1",
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => {
      refreshes += 1;
      return [];
    },
    listResearch: async () => [],
    loadManagement: async () => ({}),
    deleteQuestion: async () => ({ id: "q1" }),
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");

  await feature.commands.deleteQuestion({ clientId: "a", questionId: "q1" });

  assert.equal(feature.getSnapshot().commands.deleteQuestion.busy, false);
  assert.equal(feature.getSnapshot().commands.deleteQuestion.error, null);
  assert.ok(
    refreshes >= 2,
    "the named command refreshes the client snapshot itself",
  );
});

test("content workspace keeps paid-media preflight and confirmation as named commands", async () => {
  const calls = [];
  let managementLoads = 0;
  const feature = createContentWorkbenchFeature({
    ...paidExecutionAdapters,
    listClients: async () => [{ id: "a", name: "A" }],
    listTemplateCatalog: async () => ({
      revision: "r1",
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => {
      managementLoads += 1;
      return {};
    },
    previewPaidMediaPreflight: async (input) => {
      calls.push(["preview", input]);
      return { confirmationToken: "token-1", canConfirm: true };
    },
    confirmPaidMediaBatch: async (input) => {
      calls.push(["confirm", input]);
      return { batchId: "batch-1", articleCount: 1 };
    },
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  await feature.commands.previewPaidMediaPreflight({
    articleRefs: [{ clientId: "a", articleId: "article-a" }],
    mediaResourceId: "media-1",
  });
  await feature.commands.confirmPaidMediaBatch({
    confirmationToken: "token-1",
  });
  assert.deepEqual(calls, [
    [
      "preview",
      {
        articleRefs: [{ clientId: "a", articleId: "article-a" }],
        mediaResourceId: "media-1",
      },
    ],
    ["confirm", { confirmationToken: "token-1" }],
  ]);
  assert.ok(managementLoads >= 2);
  assert.equal(
    feature.getSnapshot().commands.confirmPaidMediaBatch.busy,
    false,
  );
});

test("content workspace owns paid-media execution snapshots and independent start/pause commands", async () => {
  const calls = [];
  const batch = {
    batchId: "paid-batch-1",
    mediaResourceId: "media-1",
    status: "queued",
    pauseIntent: "manual",
    paused: true,
    runState: "paused",
    articleCount: 1,
    quotedPrice: 12.5,
    estimatedTotal: 12.5,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    items: [],
  };
  const feature = createContentWorkbenchFeature({
    listClients: async () => [{ id: "a", name: "A" }],
    listTemplateCatalog: async () => ({
      revision: "r1",
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
    listPaidMediaBatches: async () => {
      calls.push("list");
      return [batch];
    },
    startPaidMediaBatch: async (input) => {
      calls.push(["start", input]);
      return { executionStatus: "submitted", batch };
    },
    pausePaidMediaBatch: async (input) => {
      calls.push(["pause", input]);
      return { batch };
    },
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  assert.equal(
    feature.getSnapshot().paidMediaExecution.items[0].batchId,
    "paid-batch-1",
  );

  await feature.commands.startPaidMediaBatch({ batchId: "paid-batch-1" });
  await feature.commands.pausePaidMediaBatch({ batchId: "paid-batch-1" });
  assert.deepEqual(
    calls.filter((entry) => Array.isArray(entry)),
    [
      ["start", { batchId: "paid-batch-1" }],
      ["pause", { batchId: "paid-batch-1" }],
    ],
  );
  assert.equal(
    feature.getSnapshot().commands.startPaidMediaBatch.busy,
    false,
  );
  assert.equal(
    feature.getSnapshot().commands.pausePaidMediaBatch.busy,
    false,
  );
});

test("workspace-level content commands remain available when source loading has no selected client", async () => {
  const calls = [];
  const feature = createContentWorkbenchFeature({
    ...paidExecutionAdapters,
    listClients: async () => {
      throw new Error("内容结果未通过安全校验，请刷新后重试。");
    },
    listTemplateCatalog: async () => ({
      revision: "r1",
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
    getDoubaoQueueState: async () => {
      calls.push("queue");
      return { status: "idle" };
    },
    createQuestion: async () =>
      assert.fail("client command must remain fenced"),
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  assert.equal(await feature.refresh("initial"), false);

  assert.deepEqual(await feature.commands.getDoubaoQueueState(), {
    status: "idle",
  });
  assert.deepEqual(calls, ["queue"]);
  await assert.rejects(
    feature.commands.createQuestion({ text: "问题" }),
    /Content command is unavailable/,
  );
});

test("customer Lieju profile saves at workspace scope and refreshes isolated client data", async () => {
  const profiles = {
    a: { city: "上海", contact: "张三", phone: "13800138000" },
    b: { city: "北京", contact: "李四", phone: "010-12345678" },
  };
  const feature = createContentWorkbenchFeature({
    ...paidExecutionAdapters,
    listClients: async () => Object.keys(profiles).map((id) => ({
      id,
      name: id.toUpperCase(),
      publicationProfiles: { lieju: profiles[id] },
      knowledgeFiles: [],
    })),
    listTemplateCatalog: async () => ({ revision: "r1", platforms: [], templates: [], diagnostics: [] }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
    saveClientLiejuPublicationProfile: async ({ clientId, profile }) => {
      profiles[clientId] = profile;
      return profile;
    },
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");

  await feature.commands.saveClientLiejuPublicationProfile({
    clientId: "b",
    profile: { city: "广州", contact: "王五", phone: "020-12345678" },
  });

  const clients = new Map(feature.getSnapshot().clients.map((client) => [client.id, client]));
  assert.deepEqual(clients.get("a").publicationProfiles.lieju, {
    city: "上海", contact: "张三", phone: "13800138000",
  });
  assert.deepEqual(clients.get("b").publicationProfiles.lieju, {
    city: "广州", contact: "王五", phone: "020-12345678",
  });
});
