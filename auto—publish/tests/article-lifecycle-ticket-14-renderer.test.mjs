import assert from "node:assert/strict";
import test from "node:test";

import { createPaidMediaExecutionFeature } from "../media-workbench/src/features/content/paid-media-execution-feature.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  return createPaidMediaExecutionFeature({
    listPaidMediaBatches: async () => [],
    startPaidMediaBatch: async () => ({}),
    startAllPaidMediaBatches: async () => ({}),
    pausePaidMediaBatch: async () => ({}),
    cancelRemainingPaidMediaBatchItems: async () => ({}),
    ...overrides,
  });
}

test("paid execution exposes named loading and success command states", async () => {
  const pending = deferred();
  const feature = fixture({ startPaidMediaBatch: () => pending.promise });
  feature.setScope({ workspaceRuntimeId: "workspace-14" });
  const running = feature.commands.startPaidMediaBatch({ batchId: "batch-1" });
  assert.equal(feature.getSnapshot().commands.startPaidMediaBatch.busy, true);
  pending.resolve({ executionStatus: "submitted" });
  await running;
  assert.equal(feature.getSnapshot().commands.startPaidMediaBatch.busy, false);
  assert.deepEqual(
    feature.getSnapshot().commands.startPaidMediaBatch.result,
    { executionStatus: "submitted" },
  );
  feature.dispose();
});

test("paid execution keeps safe command errors visible and releases disabled state", async () => {
  const feature = fixture({
    cancelRemainingPaidMediaBatchItems: async () => {
      throw Object.assign(new Error("safe"), {
        code: "PAID_MEDIA_EXECUTION_STATE_STALE",
        category: "validation",
        retryability: "manual-check",
        userMessage: "付费批次事实已变化，请刷新后重新核对。",
      });
    },
  });
  feature.setScope({ workspaceRuntimeId: "workspace-14" });
  await assert.rejects(
    feature.commands.cancelRemainingPaidMediaBatchItems({ batchId: "batch-1" }),
    { code: "PAID_MEDIA_EXECUTION_STATE_STALE" },
  );
  const state =
    feature.getSnapshot().commands.cancelRemainingPaidMediaBatchItems;
  assert.equal(state.busy, false);
  assert.equal(state.error.category, "validation");
  assert.equal(state.error.userMessage, "付费批次事实已变化，请刷新后重新核对。");
  feature.dispose();
});
