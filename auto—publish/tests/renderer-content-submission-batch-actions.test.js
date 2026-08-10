const assert = require("node:assert/strict");
const test = require("node:test");

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test("article management exposes service-issued cancellation plans and forwards their plan id", async () => {
  const { createArticleManagementFeature } = await import(
    "../media-workbench/src/features/content/article-management-feature.js"
  );
  const calls = [];
  const feature = createArticleManagementFeature({
    loadManagement: async () => ({
      cancellationPlans: [{ batchId: "batch-1", planId: "plan-1", count: 2 }],
    }),
    cancelContentSubmissionBatch: async (input) => {
      calls.push(input);
      return { cancelled: true };
    },
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1", clientId: "client-1" });
  await feature.refreshManagement("initial");
  assert.deepEqual(feature.getSnapshot().management.cancellationPlans, [
    { batchId: "batch-1", planId: "plan-1", count: 2 },
  ]);
  await feature.commands.cancelContentSubmissionBatch({
    batchId: "batch-1",
    planId: "plan-1",
  });
  assert.deepEqual(calls, [{ batchId: "batch-1", planId: "plan-1" }]);
  feature.dispose();
});

test("cancellation command reports a stale result after the client scope changes", async () => {
  const { createArticleManagementFeature } = await import(
    "../media-workbench/src/features/content/article-management-feature.js"
  );
  const cancellation = deferred();
  const feature = createArticleManagementFeature({
    loadManagement: async () => ({ cancellationPlans: [] }),
    cancelContentSubmissionBatch: async () => cancellation.promise,
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1", clientId: "client-1" });
  const pending = feature.commands.cancelContentSubmissionBatch({
    batchId: "batch-1",
    planId: "plan-1",
  });
  assert.equal(
    feature.getSnapshot().commands.cancelContentSubmissionBatch.busy,
    true,
  );
  feature.setScope({ workspaceRuntimeId: "runtime-1", clientId: "client-2" });
  cancellation.resolve({ cancelled: true });
  assert.deepEqual(await pending, {
    stale: true,
    code: "CONTENT_COMMAND_STALE",
    reason: "scope-changed",
  });
  feature.dispose();
});
