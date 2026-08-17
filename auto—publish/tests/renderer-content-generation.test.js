const assert = require("node:assert/strict");
const test = require("node:test");

test("content generation reads the template catalog independently of client research", async () => {
  const { createContentWorkbenchFeature } = await import(
    "../media-workbench/src/features/content/content-workbench-feature.js"
  );
  const feature = createContentWorkbenchFeature({
    listClients: async () => [],
    listTemplateCatalog: async () => ({
      revision: "empty-client-catalog",
      platforms: [{ id: "fixture", displayName: "Fixture" }],
      templates: [{ id: "template-1", platform: "fixture", enabled: true }],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
    listPaidMediaBatches: async () => [],
    startPaidMediaBatch: async () => ({}),
    startAllPaidMediaBatches: async () => ({}),
    pausePaidMediaBatch: async () => ({}),
    cancelRemainingPaidMediaBatchItems: async () => ({}),
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  assert.equal(feature.getSnapshot().selectedClientId, "");
  assert.deepEqual(feature.getSnapshot().templateCatalog.templates, [
    { id: "template-1", platform: "fixture", enabled: true },
  ]);
  feature.dispose();
});
