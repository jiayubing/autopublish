import test from "node:test";
import assert from "node:assert/strict";

import { createContentWorkbenchFeature } from "../media-workbench/src/features/content/content-workbench-feature.js";

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createAdapters(overrides = {}) {
  return {
    listClients: async () => [{ id: "client-a", name: "A" }],
    listTemplateCatalog: async () => ({
      revision: "r1",
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
    getPaidSubmissionStaging: async () => [],
    listPaidMediaBatches: async () => [],
    startPaidMediaBatch: async ({ batchId }) => ({ batch: { batchId } }),
    pausePaidMediaBatch: async ({ batchId }) => ({ batch: { batchId } }),
    ...overrides,
  };
}

function stagingItem(clientId, articleId, selectedMediaResourceId = null) {
  return {
    articleRef: { clientId, articleId },
    selectedMediaResourceId,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  };
}

test("content workbench loads paid staging for initial, client, and workspace scopes", async () => {
  let runtimeId = "runtime-a";
  const stagingReads = [];
  const feature = createContentWorkbenchFeature(
    createAdapters({
      listClients: async () =>
        runtimeId === "runtime-a"
          ? [
              { id: "client-a", name: "A" },
              { id: "client-b", name: "B" },
            ]
          : [{ id: "client-b", name: "B" }],
      getPaidSubmissionStaging: async (clientId) => {
        stagingReads.push(clientId);
        return [stagingItem(clientId, `article-${clientId}`)];
      },
    }),
  );

  feature.setScope({ workspaceRuntimeId: "runtime-a" });
  await feature.refresh("initial");
  assert.equal(feature.getSnapshot().selectedClientId, "client-a");
  assert.deepEqual(feature.getSnapshot().paidStaging.items, [
    stagingItem("client-a", "article-client-a"),
  ]);
  assert.equal(feature.getSnapshot().paidStaging.query.error, null);

  await feature.selectClient("client-b");
  assert.deepEqual(feature.getSnapshot().paidStaging.items, [
    stagingItem("client-b", "article-client-b"),
  ]);

  runtimeId = "runtime-b";
  feature.setScope({ workspaceRuntimeId: "runtime-b" });
  await feature.refresh("runtime-switch");
  assert.equal(feature.getSnapshot().selectedClientId, "client-b");
  assert.deepEqual(feature.getSnapshot().paidStaging.items, [
    stagingItem("client-b", "article-client-b"),
  ]);
  assert.deepEqual(stagingReads, ["client-a", "client-b", "client-b"]);
  feature.dispose();
});

test("paid staging commands refresh the public snapshot after add, media assignment, and remove", async () => {
  let items = [];
  const feature = createContentWorkbenchFeature(
    createAdapters({
      getPaidSubmissionStaging: async () => items.map((item) => ({ ...item })),
      addPaidSubmissionStaging: async ({ articleRefs }) => {
        items = articleRefs.map((articleRef) =>
          stagingItem(articleRef.clientId, articleRef.articleId),
        );
        return {
          addedCount: items.length,
          idempotentCount: 0,
          items: items.map((item) => ({
            ...item,
            status: "added",
            idempotent: false,
          })),
        };
      },
      setPaidSubmissionStagingMedia: async ({ mediaResourceId }) => {
        items = items.map((item) => ({
          ...item,
          selectedMediaResourceId: mediaResourceId,
        }));
        return {
          updatedCount: items.length,
          idempotentCount: 0,
          items: items.map((item) => ({
            ...item,
            status: "updated",
            idempotent: false,
          })),
        };
      },
      removePaidSubmissionStaging: async () => {
        const removedCount = items.length;
        items = [];
        return {
          removedCount,
          idempotentCount: 0,
          items: [],
        };
      },
    }),
  );

  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  const articleRef = { clientId: "client-a", articleId: "article-1" };

  await feature.commands.addPaidSubmissionStaging({
    articleRefs: [articleRef],
  });
  assert.deepEqual(feature.getSnapshot().paidStaging.items, [
    stagingItem("client-a", "article-1"),
  ]);

  await feature.commands.setPaidSubmissionStagingMedia({
    articleRefs: [articleRef],
    mediaResourceId: "media-1",
  });
  assert.deepEqual(feature.getSnapshot().paidStaging.items, [
    stagingItem("client-a", "article-1", "media-1"),
  ]);

  await feature.commands.removePaidSubmissionStaging({
    articleRefs: [articleRef],
  });
  assert.deepEqual(feature.getSnapshot().paidStaging.items, []);
  assert.equal(feature.getSnapshot().paidStaging.query.error, null);
  assert.equal(
    feature.getSnapshot().commands.addPaidSubmissionStaging.busy,
    false,
  );
  assert.equal(
    feature.getSnapshot().commands.setPaidSubmissionStagingMedia.busy,
    false,
  );
  assert.equal(
    feature.getSnapshot().commands.removePaidSubmissionStaging.busy,
    false,
  );
  feature.dispose();
});

test("paid staging ignores a stale result after the client scope changes", async () => {
  const clientAStaging = deferred();
  const feature = createContentWorkbenchFeature(
    createAdapters({
      listClients: async () => [
        { id: "client-a", name: "A" },
        { id: "client-b", name: "B" },
      ],
      getPaidSubmissionStaging: async (clientId) =>
        clientId === "client-a"
          ? clientAStaging.promise
          : [stagingItem("client-b", "article-b")],
    }),
  );

  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refreshSources("initial");
  const staleRefresh = feature.refreshManagement("manual");

  await feature.selectClient("client-b");
  assert.deepEqual(feature.getSnapshot().paidStaging.items, [
    stagingItem("client-b", "article-b"),
  ]);

  clientAStaging.resolve([stagingItem("client-a", "stale-article")]);
  assert.equal(await staleRefresh, false);
  assert.deepEqual(feature.getSnapshot().paidStaging.items, [
    stagingItem("client-b", "article-b"),
  ]);
  feature.dispose();
});

test("known staging IPC errors reach the feature command error without order side effects", async () => {
  let orderCalls = 0;
  const feature = createContentWorkbenchFeature(
    createAdapters({
      addPaidSubmissionStaging: async () => {
        const error = new Error("文章已经在付费投稿队列中。");
        error.code = "ALREADY_STAGED";
        throw error;
      },
      confirmPaidMediaBatch: async () => {
        orderCalls += 1;
        return { batchId: "unexpected" };
      },
      startPaidMediaBatch: async () => {
        orderCalls += 1;
        return { executionStatus: "unexpected" };
      },
    }),
  );

  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  await assert.rejects(
    feature.commands.addPaidSubmissionStaging({
      articleRefs: [{ clientId: "client-a", articleId: "article-1" }],
    }),
    (error) => error.code === "ALREADY_STAGED",
  );
  const command = feature.getSnapshot().commands.addPaidSubmissionStaging;
  assert.equal(command.busy, false);
  assert.equal(command.error.code, "ALREADY_STAGED");
  assert.equal(orderCalls, 0);
  feature.dispose();
});
