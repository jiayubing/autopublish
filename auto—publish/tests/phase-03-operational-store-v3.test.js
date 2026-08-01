"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  SCHEMA_VERSION,
  createOperationalStore,
  verifyOperationalDatabase,
} = require("../src/infrastructure/operational-store/operational-store");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-store-v3-"));
}

function downgradeToV2(workspaceRoot) {
  const store = createOperationalStore({ workspaceRoot });
  const databasePath = store.databasePath;
  store.close();
  const database = new DatabaseSync(databasePath);
  database.exec(
    "DROP TABLE order_display_snapshots; DELETE FROM schema_migrations WHERE version=3;",
  );
  database.close();
  return databasePath;
}

function snapshotSchema(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      history: database
        .prepare("SELECT version,applied_at FROM schema_migrations ORDER BY version")
        .all(),
      table: database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='order_display_snapshots'",
        )
        .get(),
    };
  } finally {
    database.close();
  }
}

test("schema v2 upgrades to v3 with the exact order display snapshot contract and restarts idempotently", () => {
  const workspaceRoot = workspace();
  const databasePath = downgradeToV2(workspaceRoot);
  const upgraded = createOperationalStore({ workspaceRoot });
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(upgraded.verify().schemaVersion, 3);
  upgraded.close();

  const database = new DatabaseSync(databasePath, { readOnly: true });
  assert.deepEqual(
    database
      .prepare("PRAGMA table_info(order_display_snapshots)")
      .all()
      .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk })),
    [
      { name: "attempt_id", type: "TEXT", notnull: 1, pk: 1 },
      { name: "title_snapshot", type: "TEXT", notnull: 1, pk: 0 },
      { name: "filename", type: "TEXT", notnull: 1, pk: 0 },
      { name: "resource_name_snapshot", type: "TEXT", notnull: 1, pk: 0 },
      { name: "quoted_price", type: "REAL", notnull: 0, pk: 0 },
      { name: "created_at", type: "TEXT", notnull: 1, pk: 0 },
    ],
  );
  assert.deepEqual(
    database
      .prepare("PRAGMA foreign_key_list(order_display_snapshots)")
      .all()
      .map(({ table, from, to }) => ({ table, from, to })),
    [{ table: "publication_attempts", from: "attempt_id", to: "attempt_id" }],
  );
  assert.deepEqual(
    database
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => row.version),
    [1, 2, 3],
  );
  database.close();

  const reopened = createOperationalStore({ workspaceRoot });
  assert.equal(reopened.verify().schemaVersion, 3);
  reopened.close();
});

test("every v3 migration fault rolls back to v2 and a clean retry succeeds", () => {
  for (const faultPoint of ["before-v3", "after-v3-create", "after-v3-record"]) {
    const workspaceRoot = workspace();
    const databasePath = downgradeToV2(workspaceRoot);
    const before = snapshotSchema(databasePath);
    assert.throws(
      () =>
        createOperationalStore({
          workspaceRoot,
          internalMigrationFault(point) {
            if (point === faultPoint) throw new Error(`fault:${faultPoint}`);
          },
        }),
      { code: "OPERATIONAL_DATABASE_OPEN_FAILED" },
    );
    assert.deepEqual(snapshotSchema(databasePath), before);
    const retried = createOperationalStore({ workspaceRoot });
    assert.equal(retried.verify().schemaVersion, 3);
    retried.close();
  }
});

test("open and backup verification reject a corrupt v3 FK or nullable contract", () => {
  const workspaceRoot = workspace();
  const store = createOperationalStore({ workspaceRoot });
  const databasePath = store.databasePath;
  store.close();
  const database = new DatabaseSync(databasePath);
  database.exec(`DROP TABLE order_display_snapshots;
    CREATE TABLE order_display_snapshots(
      attempt_id TEXT PRIMARY KEY NOT NULL,
      title_snapshot TEXT,
      filename TEXT NOT NULL,
      resource_name_snapshot TEXT NOT NULL,
      quoted_price REAL,
      created_at TEXT NOT NULL
    );`);
  database.close();
  assert.throws(() => createOperationalStore({ workspaceRoot }), {
    code: "OPERATIONAL_SCHEMA_INVALID",
  });
  assert.throws(() => verifyOperationalDatabase(databasePath), {
    code: "OPERATIONAL_RESTORE_INVALID",
  });
});

test("v3 backup and restored temporary workspace preserve the bounded order snapshot", () => {
  const workspaceRoot = workspace();
  const store = createOperationalStore({ workspaceRoot });
  const batch = store.createSubmissionBatch({
    batchId: "batch-v3",
    items: [
      {
        articleId: "article-v3",
        target: { kind: "media", mediaResourceId: "resource-v3" },
        payload: {
          attemptId: "attempt-v3",
          titleSnapshot: "不可变标题",
          filename: "article-v3.md",
          resourceNameSnapshot: "媒体V3",
          quotedPrice: 36.5,
        },
      },
    ],
  });
  store.reservePublicationTarget({
    articleId: "article-v3",
    publicationId: "publication-v3",
    attemptId: "attempt-v3",
    target: { kind: "media", mediaResourceId: "resource-v3" },
  });
  store.commitRemoteOutcome({
    attemptId: "attempt-v3",
    batchItemId: batch.items[0].itemId,
    outcome: {
      status: "submitted",
      evidence: {
        articleId: "article-v3",
        attemptId: "attempt-v3",
        targetKey: "media-resource:resource-v3",
        remoteId: "order-v3",
      },
    },
  });
  const backupPath = path.join(workspaceRoot, "operations-v3.backup.sqlite");
  assert.equal(store.backup(backupPath).schemaVersion, 3);
  store.close();

  const restoredWorkspace = workspace();
  const restoredDirectory = path.join(
    restoredWorkspace,
    ".autopublish",
    "operations",
  );
  fs.mkdirSync(restoredDirectory, { recursive: true });
  fs.copyFileSync(backupPath, path.join(restoredDirectory, "operations.db"));
  const restored = createOperationalStore({ workspaceRoot: restoredWorkspace });
  assert.deepEqual(
    restored
      .listOrderDisplayViews()
      .map(({ orderId, titleSnapshot, resourceNameSnapshot, quotedPrice }) => ({
        orderId,
        titleSnapshot,
        resourceNameSnapshot,
        quotedPrice,
      })),
    [
      {
        orderId: "order-v3",
        titleSnapshot: "不可变标题",
        resourceNameSnapshot: "媒体V3",
        quotedPrice: 36.5,
      },
    ],
  );
  restored.close();
});

test("commitRemoteOutcome rejects a batch item from another article and target without partial writes", () => {
  const workspaceRoot = workspace();
  const store = createOperationalStore({ workspaceRoot });
  try {
    const batch = store.createSubmissionBatch({
      batchId: "batch-v3-mismatch",
      items: [
        {
          articleId: "article-a",
          target: { kind: "media", mediaResourceId: "resource-a" },
          payload: {
            titleSnapshot: "A标题",
            filename: "a.md",
            resourceNameSnapshot: "A媒体",
            quotedPrice: 1,
          },
        },
        {
          articleId: "article-b",
          target: { kind: "media", mediaResourceId: "resource-b" },
          payload: {
            titleSnapshot: "B标题",
            filename: "b.md",
            resourceNameSnapshot: "B媒体",
            quotedPrice: 2,
          },
        },
      ],
    });
    store.reservePublicationTarget({
      articleId: "article-a",
      publicationId: "publication-a",
      attemptId: "attempt-a",
      target: { kind: "media", mediaResourceId: "resource-a" },
    });

    assert.throws(
      () =>
        store.commitRemoteOutcome({
          attemptId: "attempt-a",
          batchItemId: batch.items[1].itemId,
          outcome: {
            status: "submitted",
            evidence: {
              articleId: "article-a",
              attemptId: "attempt-a",
              targetKey: "media-resource:resource-a",
              remoteId: "order-a",
            },
          },
        }),
      { code: "OPERATIONAL_BATCH_ITEM_MISMATCH" },
    );

    assert.deepEqual(store.listRemoteOrders(), []);
    assert.deepEqual(store.listOrderDisplayViews(), []);
    assert.deepEqual(
      Object.fromEntries(
        store
          .getSubmissionBatch("batch-v3-mismatch")
          .items.map((item) => [item.articleId, item.status]),
      ),
      { "article-a": "queued", "article-b": "queued" },
    );
  } finally {
    store.close();
  }
});

test("commitRemoteOutcome rejects another batch item for the same article and target", () => {
  const workspaceRoot = workspace();
  const store = createOperationalStore({ workspaceRoot });
  try {
    const target = { kind: "media", mediaResourceId: "resource-shared" };
    const first = store.createSubmissionBatch({
      batchId: "batch-owner-a",
      items: [
        {
          articleId: "article-shared",
          target,
          payload: {
            attemptId: "attempt-owner-a",
            titleSnapshot: "A标题",
            filename: "a.md",
            resourceNameSnapshot: "A媒体",
          },
        },
      ],
    });
    const second = store.createSubmissionBatch({
      batchId: "batch-owner-b",
      items: [
        {
          articleId: "article-shared",
          target,
          payload: {
            attemptId: "attempt-owner-b",
            titleSnapshot: "B标题",
            filename: "b.md",
            resourceNameSnapshot: "B媒体",
          },
        },
      ],
    });
    store.reservePublicationTarget({
      articleId: "article-shared",
      publicationId: "publication-owner-a",
      attemptId: "attempt-owner-a",
      target,
    });

    assert.throws(
      () =>
        store.commitRemoteOutcome({
          attemptId: "attempt-owner-a",
          batchItemId: second.items[0].itemId,
          outcome: {
            status: "submitted",
            evidence: {
              articleId: "article-shared",
              attemptId: "attempt-owner-a",
              targetKey: "media-resource:resource-shared",
              remoteId: "order-owner-a",
            },
          },
        }),
      { code: "OPERATIONAL_BATCH_ITEM_MISMATCH" },
    );

    assert.deepEqual(store.listRemoteOrders(), []);
    assert.deepEqual(store.listOrderDisplayViews(), []);
    assert.equal(
      store.getSubmissionBatch(first.batchId).items[0].status,
      "queued",
    );
    assert.equal(
      store.getSubmissionBatch(second.batchId).items[0].status,
      "queued",
    );
  } finally {
    store.close();
  }
});
