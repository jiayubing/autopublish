const assert = require("node:assert/strict");
const test = require("node:test");

test("content workbench public feature owns client, template, and refresh state", async () => {
  const { createContentWorkbenchFeature } = await import(
    "../media-workbench/src/features/content/content-workbench-feature.js"
  );
  const feature = createContentWorkbenchFeature({
    listClients: async () => [{ id: "client-1", name: "客户一" }],
    listTemplateCatalog: async () => ({
      revision: "catalog-1",
      platforms: [{ id: "fixture", displayName: "Fixture" }],
      templates: [{ id: "template-1", platform: "fixture", enabled: true }],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({ articles: [] }),
    listPaidMediaBatches: async () => [],
    startPaidMediaBatch: async () => ({}),
    pausePaidMediaBatch: async () => ({}),
    cancelRemainingPaidMediaBatchItems: async () => ({}),
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  assert.equal(await feature.refresh("initial"), true);
  assert.equal(feature.getSnapshot().selectedClientId, "client-1");
  assert.equal(feature.getSnapshot().templateCatalog.revision, "catalog-1");
  assert.deepEqual(feature.getSnapshot().management.articles, []);
  feature.dispose();
});
