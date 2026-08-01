"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  test = require("node:test"),
  { DatabaseSync } = require("node:sqlite");
const {
  SCHEMA_VERSION,
  createOperationalStore,
  verifyOperationalDatabase,
} = require("../src/infrastructure/operational-store/operational-store");
function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "operational-store-"));
}
function input() {
  return {
    articleId: "article-1",
    publicationId: "publication-1",
    attemptId: "attempt-1",
    target: {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-1",
    },
  };
}
function downgradeToSchemaV1(database) {
  const db = new DatabaseSync(database);
  db.exec(
    "DROP TABLE submission_item_operations; DELETE FROM schema_migrations WHERE version > 1;",
  );
  db.close();
}
function replaceOperationTable(database, definition) {
  const db = new DatabaseSync(database);
  db.exec(`DROP TABLE submission_item_operations; ${definition}`);
  db.close();
}
function snapshotTables(database) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return Object.fromEntries(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map(({ name }) => [
          name,
          db
            .prepare(`SELECT * FROM ${JSON.stringify(name)} ORDER BY rowid`)
            .all(),
        ]),
    );
  } finally {
    db.close();
  }
}
test("operational store owns an atomic publication outcome and derived recovery", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  const reserved = store.reservePublicationTarget(input());
  assert.equal(reserved.status, "queued");
  assert.equal(store.listActionableRecovery().length, 1);
  store.commitRemoteOutcome({
    attemptId: "attempt-1",
    outcome: {
      status: "published",
      evidence: {
        remoteId: "remote-1",
        remoteUrl: "https://example.test/article",
      },
    },
  });
  assert.equal(store.listActionableRecovery().length, 0);
  assert.equal(
    store.claimPostProcessing({ claimToken: "owner-1" }).kind,
    "archive",
  );
  store.close();
});
test("single write owner, duplicate target and sensitive payload fail closed", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  assert.throws(() => createOperationalStore({ workspaceRoot: dir }), {
    code: "OPERATIONAL_WRITE_OWNER_EXISTS",
  });
  store.reservePublicationTarget(input());
  assert.equal(
    store.reservePublicationTarget({
      ...input(),
      articleId: "article-2",
      publicationId: "publication-3",
      attemptId: "attempt-3",
    }).status,
    "queued",
  );
  assert.throws(
    () =>
      store.reservePublicationTarget({
        ...input(),
        publicationId: "publication-2",
        attemptId: "attempt-2",
      }),
    { code: "PUBLICATION_DUPLICATE" },
  );
  assert.throws(
    () =>
      store.createSubmissionBatch({
        batchId: "batch-1",
        items: [
          {
            articleId: "article-1",
            target: input().target,
            payload: { cookie: "never" },
          },
        ],
      }),
    { code: "OPERATIONAL_SENSITIVE_FIELD" },
  );
  store.close();
});
test("backup verifier reads destination and missing or corrupt targets have no side effects", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  store.reservePublicationTarget(input());
  const backup = path.join(dir, "backup.db");
  const result = store.backup(backup);
  assert.equal(result.rows, 1);
  assert.equal(verifyOperationalDatabase(backup).schemaVersion, 3);
  const missing = path.join(dir, "missing.db");
  assert.throws(() => verifyOperationalDatabase(missing), {
    code: "OPERATIONAL_RESTORE_TARGET_INVALID",
  });
  assert.equal(fs.existsSync(missing), false);
  const broken = path.join(dir, "broken.db");
  fs.writeFileSync(broken, "not sqlite");
  assert.throws(() => verifyOperationalDatabase(broken));
  store.close();
});
test("database reopens after close and explicit batch writes stay isolated from legacy files", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  const batch = store.createSubmissionBatch({
    batchId: "batch-1",
    items: [
      {
        articleId: "article-1",
        target: input().target,
        payload: { revision: 1 },
      },
    ],
  });
  assert.equal(batch.batchId, "batch-1");
  assert.equal(batch.items.length, 1);
  assert.match(batch.items[0].itemId, /^[0-9a-f-]{36}$/i);
  const loadedBatch = store.getSubmissionBatch("batch-1");
  assert.equal(loadedBatch.items[0].status, "queued");
  assert.deepEqual(loadedBatch.items[0].payload, { revision: 1 });
  const db = store.databasePath;
  store.close();
  const reopened = createOperationalStore({ workspaceRoot: dir });
  assert.equal(reopened.verify().schemaVersion, 3);
  assert.equal(
    fs.existsSync(path.join(dir, ".autopublish", "publications")),
    false,
  );
  assert.equal(fs.existsSync(db), true);
  reopened.close();
});

test("upgrades a real schema v1 database to the operation schema without changing old data", () => {
  const dir = root();
  const initial = createOperationalStore({ workspaceRoot: dir });
  initial.reservePublicationTarget(input());
  const database = initial.databasePath;
  initial.close();

  const legacy = new DatabaseSync(database);
  legacy.exec("DROP TABLE submission_item_operations");
  legacy.prepare("DELETE FROM schema_migrations WHERE version > 1").run();
  const before = legacy
    .prepare("SELECT * FROM publication_records ORDER BY publication_id")
    .all();
  legacy.close();

  const upgraded = createOperationalStore({ workspaceRoot: dir });
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(upgraded.verify().schemaVersion, 3);
  upgraded.close();

  const verified = verifyOperationalDatabase(database);
  assert.equal(verified.schemaVersion, 3);
  const reopened = new DatabaseSync(database, { readOnly: true });
  assert.deepEqual(
    reopened
      .prepare("SELECT * FROM publication_records ORDER BY publication_id")
      .all(),
    before,
  );
  assert.deepEqual(
    reopened
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => ({ version: row.version })),
    [{ version: 1 }, { version: 2 }, { version: 3 }],
  );
  assert.ok(
    reopened
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='submission_item_operations'",
      )
      .get(),
  );
  reopened.close();
});

test("repairs the known v1 history plus legacy operation table left by an early Phase 05 build", () => {
  const dir = root();
  const initial = createOperationalStore({
    workspaceRoot: dir,
    clock: () => new Date("2026-07-26T00:00:00.000Z"),
  });
  const batch = initial.createSubmissionBatch({
    batchId: "batch-legacy-operation",
    items: [
      {
        articleId: "article-legacy-operation",
        target: input().target,
        payload: { source: "legacy-phase-05" },
      },
    ],
  });
  initial.prepareSubmissionItemAction({
    operationId: "operation-legacy-phase-05",
    batchId: batch.batchId,
    itemId: batch.items[0].itemId,
    action: "cancel",
    expectedFingerprint: "legacy-fingerprint",
    expectedStatus: "queued",
    payload: { evidence: "preserve-me" },
  });
  const database = initial.databasePath;
  initial.close();

  const legacy = new DatabaseSync(database);
  legacy.exec(`
    DELETE FROM schema_migrations WHERE version > 1;
    ALTER TABLE submission_item_operations RENAME TO submission_item_operations_final;
    CREATE TABLE submission_item_operations(
      operation_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES submission_batches(batch_id),
      item_id TEXT NOT NULL REFERENCES submission_items(item_id),
      action TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN('prepared','main_staged','sidecar_staged','staged','state_applied','complete')),
      expected_fingerprint TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(batch_id,item_id,action)
    );
    INSERT INTO submission_item_operations SELECT * FROM submission_item_operations_final;
    DROP TABLE submission_item_operations_final;
  `);
  legacy.close();

  const upgraded = createOperationalStore({ workspaceRoot: dir });
  assert.equal(upgraded.verify().schemaVersion, 3);
  assert.deepEqual(
    upgraded.getSubmissionItemAction("operation-legacy-phase-05"),
    {
      operationId: "operation-legacy-phase-05",
      batchId: batch.batchId,
      itemId: batch.items[0].itemId,
      action: "cancel",
      state: "prepared",
      expectedFingerprint: "legacy-fingerprint",
      payload: { evidence: "preserve-me", expectedStatus: "queued" },
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
    },
  );
  upgraded.close();

  const verified = new DatabaseSync(database, { readOnly: true });
  assert.equal(
    verified
      .prepare("PRAGMA table_info(submission_item_operations)")
      .all()
      .find((column) => column.name === "operation_id").notnull,
    1,
  );
  verified.close();
});

test("rolls back every schema v2 migration fault and retries idempotently", () => {
  for (const point of [
    "before-v2",
    "after-v2-create",
    "after-v2-verify",
    "after-v2-record",
  ]) {
    const dir = root();
    const initial = createOperationalStore({ workspaceRoot: dir });
    initial.reservePublicationTarget(input());
    const database = initial.databasePath;
    initial.close();
    downgradeToSchemaV1(database);

    assert.throws(
      () =>
        createOperationalStore({
          workspaceRoot: dir,
          internalMigrationFault(actual) {
            if (actual === point) throw new Error(`fault:${point}`);
          },
        }),
      { code: "OPERATIONAL_DATABASE_OPEN_FAILED" },
    );
    const failed = new DatabaseSync(database, { readOnly: true });
    assert.equal(
      failed
        .prepare(
          "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='submission_item_operations'",
        )
        .get().count,
      0,
    );
    assert.deepEqual(
      failed
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => row.version),
      [1],
    );
    assert.equal(
      failed.prepare("SELECT COUNT(*) count FROM publication_records").get()
        .count,
      1,
    );
    failed.close();

    const retried = createOperationalStore({ workspaceRoot: dir });
    assert.equal(retried.verify().schemaVersion, SCHEMA_VERSION);
    retried.close();
  }
});

test("rejects a future operational schema before changing its database", () => {
  const dir = root();
  const store = createOperationalStore({ workspaceRoot: dir });
  const database = store.databasePath;
  store.close();
  const future = new DatabaseSync(database);
  future
    .prepare("INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)")
    .run(SCHEMA_VERSION + 1, "2026-07-26T00:00:00.000Z");
  future.close();

  assert.throws(() => createOperationalStore({ workspaceRoot: dir }), {
    code: "OPERATIONAL_SCHEMA_FUTURE",
  });
  const unchanged = new DatabaseSync(database, { readOnly: true });
  assert.deepEqual(
    unchanged
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => row.version),
    [1, 2, 3, 4],
  );
  unchanged.close();
});

test("backup verification rejects an operation table without its state check and unique operation index", () => {
  const dir = root();
  const store = createOperationalStore({ workspaceRoot: dir });
  const database = store.databasePath;
  store.close();
  const db = new DatabaseSync(database);
  db.exec(`DROP TABLE submission_item_operations;
CREATE TABLE submission_item_operations(
  operation_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES submission_batches(batch_id),
  item_id TEXT NOT NULL REFERENCES submission_items(item_id),
  action TEXT NOT NULL,
  state TEXT NOT NULL,
  expected_fingerprint TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`);
  db.close();
  assert.throws(() => verifyOperationalDatabase(database), {
    code: "OPERATIONAL_RESTORE_INVALID",
  });
});

test("backup verification rejects an operation id without primary-key or unique identity", () => {
  const dir = root();
  const store = createOperationalStore({ workspaceRoot: dir });
  const database = store.databasePath;
  store.close();
  replaceOperationTable(
    database,
    `CREATE TABLE submission_item_operations(
      operation_id TEXT NOT NULL,
      batch_id TEXT NOT NULL REFERENCES submission_batches(batch_id),
      item_id TEXT NOT NULL REFERENCES submission_items(item_id),
      action TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN('prepared','main_staged','sidecar_staged','staged','state_applied','complete')),
      expected_fingerprint TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(batch_id,item_id,action)
    );`,
  );
  assert.throws(() => verifyOperationalDatabase(database), {
    code: "OPERATIONAL_RESTORE_INVALID",
  });
});

test("backup verification rejects wrong operation column types and nullability", () => {
  for (const changedColumn of [
    "action INTEGER NOT NULL",
    "payload_json TEXT",
  ]) {
    const dir = root();
    const store = createOperationalStore({ workspaceRoot: dir });
    const database = store.databasePath;
    store.close();
    replaceOperationTable(
      database,
      `CREATE TABLE submission_item_operations(
        operation_id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL REFERENCES submission_batches(batch_id),
        item_id TEXT NOT NULL REFERENCES submission_items(item_id),
        ${changedColumn === "action INTEGER NOT NULL" ? changedColumn : "action TEXT NOT NULL"},
        state TEXT NOT NULL CHECK(state IN('prepared','main_staged','sidecar_staged','staged','state_applied','complete')),
        expected_fingerprint TEXT NOT NULL,
        ${changedColumn === "payload_json TEXT" ? changedColumn : "payload_json TEXT NOT NULL"},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(batch_id,item_id,action)
      );`,
    );
    assert.throws(() => verifyOperationalDatabase(database), {
      code: "OPERATIONAL_RESTORE_INVALID",
    });
  }
});

test("backup verification rejects operation foreign keys with wrong targets", () => {
  for (const fixture of [
    {
      references: ["submission_items(item_id)", "submission_batches(batch_id)"],
      extra: "",
    },
    {
      references: [
        "submission_batches(status)",
        "submission_items(article_id)",
      ],
      extra:
        "CREATE UNIQUE INDEX fixture_batch_status ON submission_batches(status); CREATE UNIQUE INDEX fixture_item_article ON submission_items(article_id);",
    },
  ]) {
    const dir = root();
    const store = createOperationalStore({ workspaceRoot: dir });
    const database = store.databasePath;
    store.close();
    replaceOperationTable(
      database,
      `CREATE TABLE submission_item_operations(
        operation_id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL REFERENCES ${fixture.references[0]},
        item_id TEXT NOT NULL REFERENCES ${fixture.references[1]},
        action TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN('prepared','main_staged','sidecar_staged','staged','state_applied','complete')),
        expected_fingerprint TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(batch_id,item_id,action)
      ); ${fixture.extra}`,
    );
    assert.throws(() => verifyOperationalDatabase(database), {
      code: "OPERATIONAL_RESTORE_INVALID",
    });
  }
});

test("migration history must be exactly contiguous with parseable timestamps", () => {
  for (const historyMutation of [
    "DELETE FROM schema_migrations WHERE version=1",
    "UPDATE schema_migrations SET applied_at='' WHERE version=2",
    "UPDATE schema_migrations SET applied_at='not-a-date' WHERE version=1",
  ]) {
    const dir = root();
    const store = createOperationalStore({ workspaceRoot: dir });
    const database = store.databasePath;
    store.close();
    const db = new DatabaseSync(database);
    db.exec(historyMutation);
    db.close();
    assert.throws(() => verifyOperationalDatabase(database), {
      code: "OPERATIONAL_RESTORE_INVALID",
    });
    assert.throws(() => createOperationalStore({ workspaceRoot: dir }), {
      code: "OPERATIONAL_SCHEMA_INVALID",
    });
  }
});

test("v1 to v2 migration preserves every pre-v2 table and rolls back detected old-data changes", () => {
  for (const mutationPoint of [
    "before-v2",
    "after-v2-create",
    "after-v2-verify",
    "after-v2-record",
  ]) {
    const dir = root();
    const initial = createOperationalStore({ workspaceRoot: dir });
    initial.reservePublicationTarget(input());
    const database = initial.databasePath;
    initial.close();
    downgradeToSchemaV1(database);
    const before = snapshotTables(database);
    let mutationRan = false;
    assert.throws(
      () =>
        createOperationalStore({
          workspaceRoot: dir,
          internalMigrationFault(point, migrationDatabase) {
            if (point !== mutationPoint) return;
            migrationDatabase
              .prepare(
                "UPDATE publication_records SET article_id='tampered' WHERE publication_id='publication-1'",
              )
              .run();
            mutationRan = true;
          },
        }),
      { code: "OPERATIONAL_SCHEMA_MIGRATION_INVALID" },
    );
    assert.equal(mutationRan, true);
    assert.deepEqual(snapshotTables(database), before);
  }

  const dir = root();
  const initial = createOperationalStore({ workspaceRoot: dir });
  initial.reservePublicationTarget(input());
  const database = initial.databasePath;
  initial.close();
  downgradeToSchemaV1(database);
  const before = snapshotTables(database);
  const upgraded = createOperationalStore({ workspaceRoot: dir });
  upgraded.close();
  const after = snapshotTables(database);
  delete after.submission_item_operations;
  delete after.order_display_snapshots;
  const history = after.schema_migrations;
  delete after.schema_migrations;
  delete before.schema_migrations;
  delete before.order_display_snapshots;
  assert.deepEqual(after, before);
  assert.deepEqual(
    history.map((row) => row.version),
    [1, 2, 3],
  );
  assert.equal(Number.isFinite(Date.parse(history[1].applied_at)), true);
});

test("batch claim revision and remote order evidence are transactional", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  store.reservePublicationTarget(input());
  store.attachRemoteOrderEvidence({
    attemptId: "attempt-1",
    orderId: "order-1",
    remoteId: "remote-order-1",
    evidence: { source: "fixture" },
  });
  store.createSubmissionBatch({
    batchId: "batch-1",
    items: [
      {
        articleId: "article-1",
        target: input().target,
        payload: { source: "fixture" },
      },
    ],
  });
  const claimed = store.claimSubmissionItem({
    batchId: "batch-1",
    claimToken: "worker-1",
  });
  store.updateSubmissionItem({
    itemId: claimed.itemId,
    claimToken: "worker-1",
    revision: claimed.revision,
    status: "completed",
    payload: { result: "fixture" },
  });
  assert.throws(
    () =>
      store.updateSubmissionItem({
        itemId: claimed.itemId,
        claimToken: "worker-1",
        revision: claimed.revision,
        status: "completed",
      }),
    { code: "OPERATIONAL_BATCH_REVISION_CONFLICT" },
  );
  store.close();
});
