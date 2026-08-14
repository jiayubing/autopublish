const assert = require("node:assert/strict");
const test = require("node:test");

test("article management keeps submission cancellation data read-only", async () => {
  const { createArticleManagementFeature } = await import(
    "../media-workbench/src/features/content/article-management-feature.js"
  );
  const feature = createArticleManagementFeature({
    loadManagement: async () => ({
      cancellationPlans: [{ batchId: "batch-1", planId: "plan-1", count: 2 }],
    }),
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1", clientId: "client-1" });
  await feature.refreshManagement("initial");
  assert.deepEqual(feature.getSnapshot().management.cancellationPlans, [
    { batchId: "batch-1", planId: "plan-1", count: 2 },
  ]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      feature.getSnapshot().commands,
      "cancelContentSubmissionBatch",
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      feature.getSnapshot().commands,
      "removePendingQueueItems",
    ),
    false,
  );
  feature.dispose();
});
