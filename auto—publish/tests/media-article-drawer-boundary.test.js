const assert = require("node:assert/strict");
const test = require("node:test");

async function createFeature() {
  const { createMediaFeature } =
    await import("../media-workbench/src/features/media/media-feature.js");
  const resource = {
    resourceId: "resource-1",
    name: "资源一",
    price: 10,
    type: "image",
  };
  return createMediaFeature({
    getResourcePage: async () => ({
      items: [resource],
      total: 1,
      page: 1,
      pageSize: 50,
    }),
    searchResourcePage: async () => ({
      items: [resource],
      total: 1,
      page: 1,
      pageSize: 50,
    }),
    refreshResources: async () => ({ status: "complete" }),
    getPoolPage: async () => ({
      items: [],
      memberResourceIds: [],
      total: 0,
      page: 1,
      pageSize: 50,
    }),
    addToPool: async () => ({}),
    removeFromPool: async () => ({}),
    getBalance: async () => 80,
    getDrafts: async () => [],
    scanArticles: async () => [
      { filename: "article-1", title: "文章", selectedResources: [] },
    ],
    getOrders: async () => [],
    syncOrder: async () => ({}),
    syncAllOrders: async () => ({}),
    prepareOrderCancellation: async () => ({}),
    cancelOrder: async () => ({}),
    prepareCancellationResolution: async () => ({}),
    confirmCancellationSucceeded: async () => ({}),
    confirmCancellationNotApplied: async () => ({}),
    prepareOrderStatusAnomalyResolution: async () => ({}),
    resumeOrderTracking: async () => ({}),
    confirmOrderPublished: async () => ({}),
    confirmOrderNotPublished: async () => ({}),
    openPublishedUrl: async () => ({}),
  });
}

test("media feature omits the retired article editor workflow", async () => {
  const feature = await createFeature();
  feature.setScope({ workspaceRuntimeId: "workspace-1" });
  await feature.refresh("initial");
  assert.equal(typeof feature.openArticle, "undefined");
  assert.equal(typeof feature.saveDraft, "undefined");
  assert.equal("activeArticle" in feature.getSnapshot().articles, false);
  assert.equal("selectionRevision" in feature.getSnapshot(), false);
  feature.dispose();
});
