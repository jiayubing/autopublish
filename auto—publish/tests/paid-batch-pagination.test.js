const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createPaidMediaBatchOrchestrator,
} = require("../desktop/services/paid-media-batch-orchestrator");
const {
  createMediaWorkbenchApplication,
} = require("../desktop/services/media-workbench-application");
const {
  createSubmissionCenterSnapshot,
} = require("../desktop/services/submission-center-snapshot");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

const BODY = "SYNTHETIC_BODY_MUST_NOT_REACH_LIST".repeat(40);
function fixture(count, prepare) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paid-pagination-"));
  let ports = {};
  let store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  const ref = { clientId: "CLIENTSEED", articleId: "ARTICLESEED" };
  ports.paidAdmissionTransitions.admitPaidBatch({
    batchId: "BATCHSEED",
    articleCount: 1,
    target: { kind: "media", mediaResourceId: "media-a" },
    confirmationFingerprint: "b".repeat(64),
    confirmation: {
      version: 1,
      articleRefs: [ref],
      mediaResourceId: "media-a",
      quotedPrice: 12.5,
      confirmedAt: "2026-09-13T00:00:00.000Z",
    },
    systemSubmissionCode: "system-a",
    quotedPrice: 12.5,
    estimatedTotal: 12.5,
    items: [
      {
        ...ref,
        articleRef: ref,
        batchId: "BATCHSEED",
        itemId: "ITEMSEED",
        publicationId: "PUBLICATIONSEED",
        attemptId: "ATTEMPTSEED",
        customerSnapshotV1: {
          version: 1,
          clientId: ref.clientId,
          displayName: "Synthetic client",
        },
        publicationSnapshot: {
          articleId: ref.articleId,
          title: "Synthetic title",
          body: BODY,
          fingerprint: "a".repeat(64),
        },
      },
    ],
  });
  const filename = store.databasePath;
  store.close();
  const db = new DatabaseSync(filename);
  try {
    const tables = [
      "submission_batches",
      "publication_records",
      "publication_attempts",
      "recovery_intents",
      "submission_items",
      "paid_submission_batches",
      "article_active_targets",
    ];
    const rows = tables.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table}`).get(),
    ]);
    const generatedIntent = rows.find(
      ([table]) => table === "recovery_intents",
    )[1].intent_id;
    db.exec("PRAGMA foreign_keys=OFF; BEGIN");
    for (const [table, row] of rows) {
      db.exec(`DELETE FROM ${table}`);
      const keys = Object.keys(row);
      const insert = db.prepare(
        `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
      );
      for (let index = 0; index < count; index++) {
        const suffix = String(index).padStart(6, "0");
        const replacements = {
          [generatedIntent]: `intent-${suffix}`,
          CLIENTSEED: `client-${index % 2}`,
          ARTICLESEED: `article-${suffix}`,
          BATCHSEED: `batch-${suffix}`,
          ITEMSEED: `item-${suffix}`,
          PUBLICATIONSEED: `publication-${suffix}`,
          ATTEMPTSEED: `attempt-${suffix}`,
        };
        insert.run(
          ...keys.map((key) =>
            typeof row[key] === "string"
              ? Object.entries(replacements).reduce(
                  (value, [from, to]) => value.split(from).join(to),
                  row[key],
                )
              : row[key],
          ),
        );
      }
    }
    if (prepare) prepare(db);
    db.exec("COMMIT; PRAGMA foreign_keys=ON");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
  ports = {};
  store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  const orchestrator = createPaidMediaBatchOrchestrator({
    paidExecutionTransitions: ports.paidExecutionTransitions,
    orderCreationPort: {
      createOrder() {
        throw new Error("No external operations in query tests");
      },
    },
  });
  const media = createMediaWorkbenchApplication({
    paidMediaBatchOrchestrator: orchestrator,
    resourceStore: {},
    poolStore: {},
    mediaResourceService: {},
    mediaOrderService: {},
  });
  const center = createSubmissionCenterSnapshot({
    getRevision: () => 1,
    getWorkspaceRuntimeId: () => "test",
    validateClient: () => {},
    listRegularQueueGroups: () => [],
    listPaidMediaBatches: media.getPaidMediaBatches,
    listAttention: () => ({ items: [] }),
  });
  return {
    store,
    center,
    media,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("paid pages reach beyond 20000 with correct counts, client filtering, bounded SQL and no body reads", async () => {
  const value = fixture(20003);
  const originalPrepare = DatabaseSync.prototype.prepare;
  let calls = 0,
    bytes = 0;
  DatabaseSync.prototype.prepare = function (sql) {
    const statement = originalPrepare.call(this, sql);
    for (const method of ["get", "all"]) {
      const original = statement[method];
      statement[method] = function (...args) {
        const result = original.apply(this, args);
        calls++;
        const json = JSON.stringify(result);
        assert.equal(
          json.includes("SYNTHETIC_BODY_MUST_NOT_REACH_LIST"),
          false,
        );
        bytes += Buffer.byteLength(json);
        return result;
      };
    }
    return statement;
  };
  try {
    const first = await value.center.get({ page: 1, pageSize: 10 });
    assert.equal(first.counts.paidBatches, 20003);
    assert.equal(first.paid.batches.length, 10);
    assert.equal(first.hasMore, true);
    assert.equal(calls, 3);
    assert.ok(bytes < 100000, `Unexpected list read bytes: ${bytes}`);
    const last = await value.center.get({ page: 2001, pageSize: 10 });
    assert.deepEqual(
      last.paid.batches.map((row) => row.batchId),
      ["batch-020000", "batch-020001", "batch-020002"],
    );
    assert.equal(last.counts.total, 20003);
    assert.equal(last.hasMore, false);
    const empty = await value.center.get({ page: 2002, pageSize: 10 });
    assert.equal(empty.paid.batches.length, 0);
    assert.equal(empty.counts.total, 20003);
    assert.equal(empty.hasMore, false);
    const client = await value.center.get({
      clientId: "client-0",
      page: 1001,
      pageSize: 10,
    });
    assert.equal(client.counts.paidBatches, 10002);
    assert.deepEqual(
      client.paid.batches.map((row) => row.batchId),
      ["batch-020000", "batch-020002"],
    );
    assert.equal(client.hasMore, false);
    const wire = productionIpcRegistry.success(
      productionIpcRegistry.byChannel("content:get-submission-center-snapshot"),
      last,
    );
    assert.equal(wire.ok, true);
  } finally {
    DatabaseSync.prototype.prepare = originalPrepare;
    value.close();
  }
});

test("paid workbench pages preserve terminal, paused, in-flight and attention filtering", () => {
  const states = [
    "queued",
    "claimed",
    "remote_started",
    "uncertain",
    "blocked",
    "completed",
    "failed",
    "cancelled",
  ];
  const intents = ["none", "manual", "system"];
  const value = fixture(states.length * intents.length, (db) => {
    for (let index = 0; index < states.length * intents.length; index++) {
      const suffix = String(index).padStart(6, "0");
      db.prepare("UPDATE submission_items SET status=? WHERE item_id=?").run(
        states[index % states.length],
        `item-${suffix}`,
      );
      db.prepare(
        "UPDATE paid_submission_batches SET pause_intent=? WHERE batch_id=?",
      ).run(intents[Math.floor(index / states.length)], `batch-${suffix}`);
    }
  });
  try {
    const all = value.store.listPaidSubmissionBatchSnapshots({});
    const expected = all.filter(
      (batch) =>
        batch.status === "needs_attention" ||
        batch.actions.canStart ||
        batch.actions.canPause ||
        batch.actions.canCancelRemaining,
    );
    const collected = [];
    for (let page = 1; page <= Math.ceil(expected.length / 3) + 1; page++) {
      const result = value.media.getPaidMediaBatches({ page, pageSize: 3 });
      assert.equal(result.total, expected.length);
      for (const batch of result.items) {
        const full = expected.find((item) => item.batchId === batch.batchId);
        assert.deepEqual(batch.actions, full.actions);
        assert.equal(batch.runState, full.runState);
        assert.equal(batch.pauseReason, full.pauseReason);
        assert.equal(batch.remainingCount, full.remainingCount);
        assert.deepEqual(
          batch.currentItem?.articleIdentityV1,
          full.currentItem?.articleIdentityV1,
        );
        assert.equal(batch.items[0].title, full.items[0].title);
        collected.push(batch.batchId);
      }
    }
    assert.deepEqual(
      collected,
      expected.map((batch) => batch.batchId),
    );
    assert.equal(all[0].items[0].publicationSnapshot.body, BODY);
    for (const input of [
      { page: 0 },
      { page: 1, pageSize: 501 },
      { page: Number.MAX_SAFE_INTEGER, pageSize: 500 },
    ])
      assert.throws(() => value.store.listPaidSubmissionBatchSnapshots(input), {
        code: "PAID_EXECUTION_PAGE_INVALID",
      });
  } finally {
    value.close();
  }
});
