const assert = require("node:assert/strict");
const test = require("node:test");

test("media resource feature exposes normalized balance and bounded resource paging", async () => {
  const { createMediaFeature } = await import(
    "../media-workbench/src/features/media/media-feature.js"
  );
  let lastPage;
  const feature = createMediaFeature({
    getResourcePage: async (input) => {
      lastPage = input;
      return {
        items: [
          { resourceId: "resource-1", name: "资源一" },
          { resourceId: "resource-1", name: "重复资源" },
        ],
        total: 2,
        page: input.page,
        pageSize: input.pageSize,
      };
    },
    searchResourcePage: async (input) => ({ items: [], total: 0, page: input.page, pageSize: input.pageSize }),
    refreshResources: async () => ({}),
    getPoolPage: async (input) => ({ items: [], memberResourceIds: [], total: 0, page: input.page, pageSize: input.pageSize }),
    addToPool: async () => ({}),
    removeFromPool: async () => ({}),
    getBalance: async () => 12.5,
    getDrafts: async () => [],
    getDraft: async () => null,
    setDraft: async () => ({}),
    scanArticles: async () => [],
    previewArticle: async () => ({}),
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
  feature.setScope({ workspaceRuntimeId: "workspace-1" });
  await feature.loadResourcePage(2, "manual");
  assert.deepEqual(lastPage, { page: 2, pageSize: 50 });
  assert.deepEqual(feature.getSnapshot().resources.items.map((item) => item.resourceId), ["resource-1"]);
  assert.equal(feature.getSnapshot().resources.pageSize, 50);
  await feature.checkBalance();
  assert.equal(feature.getSnapshot().balance.value, 12.5);
  feature.dispose();
});
