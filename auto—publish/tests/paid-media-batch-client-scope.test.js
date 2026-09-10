"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPaidMediaBatchOrchestrator,
} = require("../desktop/services/paid-media-batch-orchestrator");

function batch(batchId, clientIds) {
  return {
    batchId,
    actions: { canStart: true },
    pauseIntent: "paused",
    items: clientIds.map((clientId, index) => ({
      batchItemId: `${batchId}-${index + 1}`,
      articleIdentityV1: {
        version: 1,
        clientId,
        articleId: `${batchId}-article-${index + 1}`,
      },
    })),
  };
}

function fixture(batches) {
  const runIntentCalls = [];
  const transitions = {
    beginOrderCreationRemoteCall() {
      throw new Error("unexpected remote call");
    },
    cancelRemainingPaidSubmissionBatchItems() {},
    claimPaidSubmissionBatchItem() {
      return null;
    },
    listPaidSubmissionBatchSnapshots() {
      return batches;
    },
    pauseAllPaidSubmissionBatches() {},
    pausePaidSubmissionBatchesOnStartup() {},
    recordPaidOrderCreationArticleRejection() {},
    recordPaidOrderCreationSuccess() {},
    recordPaidOrderCreationSystemRejection() {},
    recordPaidOrderCreationUncertain() {},
    releasePaidOrderCreationClaim() {},
    renewPaidOrderCreationClaim() {},
    setPaidSubmissionBatchRunIntent(input) {
      runIntentCalls.push(input);
    },
    startAllPaidSubmissionBatches() {},
  };
  const orchestrator = createPaidMediaBatchOrchestrator({
    paidExecutionTransitions: transitions,
    orderCreationPort: {
      async createOrder() {
        throw new Error("unexpected remote call");
      },
    },
    randomUUID: () => "synthetic",
  });
  return { orchestrator, runIntentCalls };
}

test("client snapshot keeps valid mixed-client paid batches visible", () => {
  const mixed = batch("mixed", ["client-a", "client-b"]);
  const onlyA = batch("only-a", ["client-a"]);
  const onlyB = batch("only-b", ["client-b"]);
  const { orchestrator } = fixture([mixed, onlyA, onlyB]);

  assert.deepEqual(
    orchestrator.snapshot({ clientId: "client-a" }).map((item) => item.batchId),
    ["mixed", "only-a"],
  );
  assert.deepEqual(
    orchestrator.snapshot({ clientId: "client-b" }).map((item) => item.batchId),
    ["mixed", "only-b"],
  );
});

test("client-scoped start-all starts only batches fully owned by that client", async () => {
  const mixed = batch("mixed", ["client-a", "client-b"]);
  const onlyA = batch("only-a", ["client-a"]);
  const onlyB = batch("only-b", ["client-b"]);
  const { orchestrator, runIntentCalls } = fixture([mixed, onlyA, onlyB]);

  const result = await orchestrator.startAll({ clientId: "client-a" });

  assert.equal(result.status, "paid_batches_started");
  assert.deepEqual(
    result.results.map((item) => [item.batchId, item.status]),
    [["only-a", "idle"]],
  );
  assert.deepEqual(runIntentCalls, [{ batchId: "only-a", running: true }]);
});

test("client-scoped start-all does not start a mixed-client batch by itself", async () => {
  const { orchestrator, runIntentCalls } = fixture([
    batch("mixed", ["client-a", "client-b"]),
  ]);

  const result = await orchestrator.startAll({ clientId: "client-a" });

  assert.deepEqual(result, {
    status: "no_eligible_paid_batches",
    results: [],
  });
  assert.deepEqual(runIntentCalls, []);
});
