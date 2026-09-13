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

test("exclusive start-all does not start a batch that includes a null clientId item", async () => {
  const { orchestrator, runIntentCalls } = fixture([
    batch("null-mixed", ["client-a", null]),
    batch("only-a", ["client-a"]),
  ]);

  const result = await orchestrator.startAll({ clientId: "client-a" });

  assert.equal(result.status, "paid_batches_started");
  assert.deepEqual(
    result.results.map((item) => [item.batchId, item.status]),
    [["only-a", "idle"]],
  );
  assert.deepEqual(runIntentCalls, [{ batchId: "only-a", running: true }]);
});

function paidStoreFixture(t, batches, prepare) {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { DatabaseSync } = require("node:sqlite");
  const {
    createOperationalStore,
  } = require("../src/infrastructure/operational-store/operational-store");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paid-client-sql-"));
  let ports = {};
  let store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  for (const row of batches) {
    const refs = row.items.map((item) => ({
      clientId: item.articleIdentityV1.clientId || "client-missing",
      articleId: item.articleIdentityV1.articleId,
    }));
    ports.paidAdmissionTransitions.admitPaidBatch({
      batchId: row.batchId,
      articleCount: refs.length,
      target: { kind: "media", mediaResourceId: "media-a" },
      confirmationFingerprint: String(row.batchId).padEnd(64, "b"),
      confirmation: {
        version: 1,
        articleRefs: refs,
        mediaResourceId: "media-a",
        quotedPrice: 1,
        confirmedAt: "2026-09-13T00:00:00.000Z",
      },
      systemSubmissionCode: "system-a",
      quotedPrice: 1,
      estimatedTotal: refs.length,
      items: refs.map((ref, index) => ({
        ...ref,
        articleRef: ref,
        batchId: row.batchId,
        itemId: `${row.batchId}-item-${index}`,
        publicationId: `${row.batchId}-publication-${index}`,
        attemptId: `${row.batchId}-attempt-${index}`,
        customerSnapshotV1: {
          version: 1,
          clientId: ref.clientId,
          displayName: ref.clientId,
        },
        publicationSnapshot: {
          articleId: ref.articleId,
          title: "Synthetic",
          body: "Synthetic body",
          fingerprint: "a".repeat(64),
        },
      })),
    });
  }
  const filename = store.databasePath;
  store.close();
  if (prepare) {
    const db = new DatabaseSync(filename);
    try {
      prepare(db);
    } finally {
      db.close();
    }
  }
  ports = {};
  store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const runIntentCalls = [];
  const transitions = {
    ...ports.paidExecutionTransitions,
    claimPaidSubmissionBatchItem() {
      return null;
    },
    setPaidSubmissionBatchRunIntent(input) {
      runIntentCalls.push(input);
      return ports.paidExecutionTransitions.setPaidSubmissionBatchRunIntent(
        input,
      );
    },
  };
  const orchestrator = createPaidMediaBatchOrchestrator({
    paidExecutionTransitions: transitions,
    orderCreationPort: {
      createOrder() {
        throw new Error("No real orders");
      },
    },
  });
  t.after(() => orchestrator.dispose());
  return {
    store,
    orchestrator,
    runIntentCalls,
    listRunnableIds(clientId) {
      return ports.paidExecutionTransitions.listPaidSubmissionBatchSnapshots({
        idsOnly: true,
        clientId,
        exclusiveClient: true,
        canStartOnly: true,
      }).ids;
    },
  };
}

test("SQL exclusive client filter starts only batches fully owned by that client", async (t) => {
  const mixed = batch("mixed", ["client-a", "client-b"]);
  const onlyA = batch("only-a", ["client-a"]);
  const onlyB = batch("only-b", ["client-b"]);
  const { orchestrator, runIntentCalls, listRunnableIds } = paidStoreFixture(
    t,
    [mixed, onlyA, onlyB],
  );

  assert.deepEqual(listRunnableIds("client-a"), ["only-a"]);
  assert.deepEqual(listRunnableIds("client-b"), ["only-b"]);

  const result = await orchestrator.startAll({ clientId: "client-a" });
  assert.equal(result.status, "paid_batches_started");
  assert.deepEqual(
    result.results.map((item) => [item.batchId, item.status]),
    [["only-a", "idle"]],
  );
  assert.deepEqual(runIntentCalls, [{ batchId: "only-a", running: true }]);
});

test("SQL exclusive client filter ignores batches with a null clientId item", async (t) => {
  const nullMixed = batch("null-mixed", ["client-a", "client-a"]);
  const onlyA = batch("only-a", ["client-a"]);
  const { orchestrator, runIntentCalls, listRunnableIds } = paidStoreFixture(
    t,
    [nullMixed, onlyA],
    (db) => {
      db.prepare(
        "UPDATE submission_items SET payload_json=json_set(payload_json,'$.clientId',null) WHERE item_id=?",
      ).run("null-mixed-item-1");
    },
  );

  assert.deepEqual(listRunnableIds("client-a"), ["only-a"]);
  const result = await orchestrator.startAll({ clientId: "client-a" });
  assert.equal(result.status, "paid_batches_started");
  assert.deepEqual(
    result.results.map((item) => item.batchId),
    ["only-a"],
  );
  assert.equal(
    runIntentCalls.some((call) => call.batchId === "null-mixed"),
    false,
  );
});
