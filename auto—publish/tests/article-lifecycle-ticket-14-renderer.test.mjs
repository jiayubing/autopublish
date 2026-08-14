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
    pausePaidMediaBatch: async () => ({}),
    cancelRemainingPaidMediaBatchItems: async () => ({}),
    prepareBindPaidOrderNumber: async () => ({}),
    bindPaidOrderNumber: async () => ({}),
    prepareConfirmPaidOrderAbsent: async () => ({}),
    confirmPaidOrderAbsent: async () => ({}),
    ...overrides,
  });
}

test("paid resolution feature exposes named loading and success command states", async () => {
  const pending = deferred();
  const feature = fixture({
    prepareBindPaidOrderNumber: () => pending.promise,
  });
  feature.setScope({ workspaceRuntimeId: "workspace-14" });
  const running = feature.commands.prepareBindPaidOrderNumber({
    orderCreationAttemptId: "paid-attempt-1",
    orderId: "order-1",
  });
  assert.equal(
    feature.getSnapshot().commands.prepareBindPaidOrderNumber.busy,
    true,
  );
  pending.resolve({ confirmationToken: "token-1" });
  await running;
  assert.equal(
    feature.getSnapshot().commands.prepareBindPaidOrderNumber.busy,
    false,
  );
  assert.equal(
    feature.getSnapshot().commands.prepareBindPaidOrderNumber.result
      .confirmationToken,
    "token-1",
  );
  feature.dispose();
});
test("paid resolution feature keeps safe command errors visible and releases disabled state", async () => {
  const feature = fixture({
    confirmPaidOrderAbsent: async () => {
      throw Object.assign(new Error("safe"), {
        code: "PAID_ORDER_RESOLUTION_STATE_STALE",
        category: "validation",
        retryability: "manual-check",
        userMessage: "文章或订单事实已变化，请刷新后重新核对。",
      });
    },
  });
  feature.setScope({ workspaceRuntimeId: "workspace-14" });
  await assert.rejects(
    feature.commands.confirmPaidOrderAbsent({
      orderCreationAttemptId: "paid-attempt-1",
      confirmationToken: "token-1",
    }),
    { code: "PAID_ORDER_RESOLUTION_STATE_STALE" },
  );
  const state = feature.getSnapshot().commands.confirmPaidOrderAbsent;
  assert.equal(state.busy, false);
  assert.equal(state.error.category, "validation");
  assert.equal(
    state.error.userMessage,
    "文章或订单事实已变化，请刷新后重新核对。",
  );
  feature.dispose();
});
