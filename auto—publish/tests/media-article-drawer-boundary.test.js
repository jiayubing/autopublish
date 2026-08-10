const assert = require("node:assert/strict");
const test = require("node:test");

async function createFeature() {
  const { createMediaFeature } = await import(
    "../media-workbench/src/features/media/media-feature.js"
  );
  const resource = { resourceId: "resource-1", name: "资源一", price: 10, type: "image" };
  return createMediaFeature({
    getResourcePage: async () => ({ items: [resource], total: 1, page: 1, pageSize: 50 }),
    searchResourcePage: async () => ({ items: [resource], total: 1, page: 1, pageSize: 50 }),
    refreshResources: async () => ({ status: "complete" }),
    getPoolPage: async () => ({ items: [], memberResourceIds: [], total: 0, page: 1, pageSize: 50 }),
    addToPool: async () => ({}),
    removeFromPool: async () => ({}),
    getBalance: async () => 80,
    getDrafts: async () => [],
    getDraft: async () => null,
    setDraft: async () => ({}),
    scanArticles: async () => [{ filename: "article-1", title: "文章", selectedResources: [] }],
    previewArticle: async () => ({ filename: "article-1", title: "文章", selectedResources: [] }),
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

test("media article feature keeps preview, editing, and selected resource removal in one public snapshot", async () => {
  const feature = await createFeature();
  feature.setScope({ workspaceRuntimeId: "workspace-1" });
  await feature.refresh("initial");
  await feature.openArticle("article-1");
  feature.toggleSelectedResource({ resourceId: "resource-1", name: "资源一", price: 10, type: "image" });
  assert.deepEqual(
    feature.getSnapshot().articles.activeArticle.selectedResources.map((item) => item.resourceId),
    ["resource-1"],
  );
  await feature.saveDraft({ filename: "article-1", title: "更新后的文章", selectedResources: [] });
  assert.equal(feature.getSnapshot().articles.activeArticle.title, "更新后的文章");
  assert.deepEqual(
    feature.getSnapshot().articles.activeArticle.selectedResources.map((item) => item.resourceId),
    ["resource-1"],
  );
  feature.removeSelectedResource("resource-1");
  assert.deepEqual(feature.getSnapshot().articles.activeArticle.selectedResources, []);
  feature.dispose();
});
