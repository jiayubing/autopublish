"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  SCHEMA_VERSION,
  createOperationalStore,
  dryRunOperationalStoreMigration,
  verifyOperationalDatabase,
} = require("../src/infrastructure/operational-store/operational-store");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "phase-04-operational-store-"));
}

function removeV4Schema(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec(`
    DROP TABLE IF EXISTS migration_import_order_identities;
    DROP TABLE IF EXISTS migration_import_entries;
    DROP TABLE IF EXISTS migration_journals;
    DROP TABLE IF EXISTS manual_reconciliation_facts;
    DROP TABLE IF EXISTS paid_staging_items;
    DROP TABLE IF EXISTS paid_submission_batches;
    DROP TABLE IF EXISTS submission_queue_items;
    DROP TABLE IF EXISTS submission_queue_groups;
    DROP TABLE IF EXISTS article_active_targets;
    ALTER TABLE order_display_snapshots RENAME TO order_display_snapshots_v4;
    CREATE TABLE order_display_snapshots(
      attempt_id TEXT PRIMARY KEY NOT NULL REFERENCES publication_attempts(attempt_id),
      title_snapshot TEXT NOT NULL,
      filename TEXT NOT NULL,
      resource_name_snapshot TEXT NOT NULL,
      quoted_price REAL,
      created_at TEXT NOT NULL
    );
    INSERT INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at)
      SELECT attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at
      FROM order_display_snapshots_v4;
    DROP TABLE order_display_snapshots_v4;
    DELETE FROM schema_migrations WHERE version>=4;
  `);
  db.close();
}

function schemaSnapshot(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      history: db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => row.version),
      tables: db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((row) => row.name),
      orderColumns: db
        .prepare("PRAGMA table_info(order_display_snapshots)")
        .all()
        .map((row) => row.name),
    };
  } finally {
    db.close();
  }
}

function fileHash(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function platformTarget(accountProfileId) {
  return { kind: "platform", platformId: "toutiao", accountProfileId };
}

function seedRemoteStartedMediaOrder(databasePath, input) {
  const value = input || {};
  const stamp = "2026-08-08T00:00:01.000Z";
  const database = new DatabaseSync(databasePath);
  try {
    database
      .prepare(
        "UPDATE publication_records SET status='remote_started',updated_at=? WHERE publication_id=?",
      )
      .run(stamp, value.publicationId);
    database
      .prepare(
        "UPDATE publication_attempts SET status='remote_started' WHERE attempt_id=?",
      )
      .run(value.attemptId);
    database
      .prepare(
        "UPDATE article_active_targets SET state='remote_started',updated_at=? WHERE attempt_id=?",
      )
      .run(stamp, value.attemptId);
    database.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
      value.orderId,
      value.attemptId,
      value.orderId,
      JSON.stringify({ remoteId: value.orderId }),
      stamp,
    );
    database.prepare("INSERT INTO remote_evidence VALUES(?,?,?,?,?,?)").run(
      `order-evidence-${value.orderId}`,
      value.attemptId,
      value.orderId,
      null,
      JSON.stringify({ remoteId: value.orderId }),
      stamp,
    );
    database
      .prepare(
        "INSERT INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at,media_resource_id,estimated_total,system_submission_code) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        value.attemptId,
        value.titleSnapshot,
        value.filename,
        value.resourceNameSnapshot,
        value.quotedPrice,
        stamp,
        value.mediaResourceId,
        null,
        null,
      );
  } finally {
    database.close();
  }
}

test("v3 to v4 migration is atomic, retryable, future-safe, and backup-verifiable", () => {
  for (const point of [
    "before-v4",
    "after-v4-create",
    "after-v4-verify",
    "after-v4-record",
  ]) {
    const root = workspace();
    let store = createOperationalStore({ workspaceRoot: root });
    const databasePath = store.databasePath;
    store.close();
    removeV4Schema(databasePath);
    const before = schemaSnapshot(databasePath);
    assert.deepEqual(before.history, [1, 2, 3]);
    assert.throws(
      () =>
        createOperationalStore({
          workspaceRoot: root,
          internalMigrationFault(actual) {
            if (actual === point) throw new Error(point);
          },
        }),
      { code: "OPERATIONAL_DATABASE_OPEN_FAILED" },
    );
    assert.deepEqual(schemaSnapshot(databasePath), before);
    store = createOperationalStore({ workspaceRoot: root });
    assert.equal(store.verify().schemaVersion, 6);
    const backup = path.join(root, `backup-${point}.sqlite`);
    assert.equal(store.backup(backup).schemaVersion, 6);
    store.close();
    assert.equal(verifyOperationalDatabase(backup).schemaVersion, 6);
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(SCHEMA_VERSION, 6);
});

test("v4 order snapshot extension preserves rows from a real v3 database", () => {
  const root = workspace();
  let store = createOperationalStore({ workspaceRoot: root });
  const batch = store.createSubmissionBatch({
    batchId: "v3-order-batch",
    items: [
      {
        articleId: "v3-order-article",
        target: { kind: "media", mediaResourceId: "v3-resource" },
        payload: {
          attemptId: "v3-order-attempt",
          titleSnapshot: "旧标题",
          filename: "old.md",
          resourceNameSnapshot: "旧媒体",
          quotedPrice: 12,
        },
      },
    ],
  });
  store.reservePublicationTarget({
    articleId: "v3-order-article",
    publicationId: "v3-order-publication",
    attemptId: "v3-order-attempt",
    target: { kind: "media", mediaResourceId: "v3-resource" },
  });
  seedRemoteStartedMediaOrder(store.verify().databasePath, {
    publicationId: "v3-order-publication",
    attemptId: "v3-order-attempt",
    orderId: "v3-order",
    mediaResourceId: "v3-resource",
    titleSnapshot: "旧标题",
    filename: "old.md",
    resourceNameSnapshot: "旧媒体",
    quotedPrice: 12,
  });
  const databasePath = store.databasePath;
  store.close();
  removeV4Schema(databasePath);
  store = createOperationalStore({ workspaceRoot: root });
  assert.deepEqual(
    store
      .listOrderDisplayViews()
      .map(
        ({
          orderId,
          titleSnapshot,
          filename,
          resourceNameSnapshot,
          quotedPrice,
        }) => ({
          orderId,
          titleSnapshot,
          filename,
          resourceNameSnapshot,
          quotedPrice,
        }),
      ),
    [
      {
        orderId: "v3-order",
        titleSnapshot: "旧标题",
        filename: "old.md",
        resourceNameSnapshot: "旧媒体",
        quotedPrice: 12,
      },
    ],
  );
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test("v3 migration dry-run is read-only and reports the planned v4 step", () => {
  const root = workspace();
  let store = createOperationalStore({ workspaceRoot: root });
  const databasePath = store.databasePath;
  store.close();
  removeV4Schema(databasePath);
  const before = schemaSnapshot(databasePath);
  const beforeHash = fileHash(databasePath);
  const report = dryRunOperationalStoreMigration({ workspaceRoot: root });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.fromVersion, 3);
  assert.equal(report.toVersion, SCHEMA_VERSION);
  assert.deepEqual(report.migrations, [4, 5, 6]);
  assert.deepEqual(schemaSnapshot(databasePath), before);
  assert.equal(fileHash(databasePath), beforeHash);
  store = createOperationalStore({ workspaceRoot: root });
  store.close();
  const current = dryRunOperationalStoreMigration({ workspaceRoot: root });
  assert.equal(current.fromVersion, 6);
  assert.deepEqual(current.migrations, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test("one article has one database-enforced active target and failure releases it", async () => {
  const root = workspace();
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    const first = () =>
      store.reservePublicationTarget({
        articleId: "article-active",
        publicationId: "publication-active-1",
        attemptId: "attempt-active-1",
        target: platformTarget(profile.accountProfileId),
      });
    const second = () =>
      store.reservePublicationTarget({
        articleId: "article-active",
        publicationId: "publication-active-2",
        attemptId: "attempt-active-2",
        target: { kind: "media", mediaResourceId: "resource-active" },
      });
    const results = await Promise.allSettled([
      Promise.resolve().then(first),
      Promise.resolve().then(second),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter((result) => result.status === "rejected")[0].reason.code,
      "PUBLICATION_DUPLICATE",
    );

    store.commitRemoteOutcome({
      attemptId: "attempt-active-1",
      outcome: {
        status: "failed",
        error: {
          code: "REJECTED",
          category: "remote",
          retryability: "safe",
          userMessage: "Rejected",
        },
      },
    });
    const replacement = store.reservePublicationTarget({
      articleId: "article-active",
      publicationId: "publication-active-3",
      attemptId: "attempt-active-3",
      target: { kind: "media", mediaResourceId: "resource-active" },
    });
    assert.equal(replacement.status, "queued");
    store.markRecoveryUncertain({
      attemptId: "attempt-active-3",
      error: {
        code: "UNKNOWN",
        category: "transport",
        retryability: "manual-check",
        userMessage: "Check",
      },
    });
    assert.throws(
      () =>
        store.reservePublicationTarget({
          articleId: "article-active",
          publicationId: "publication-active-4",
          attemptId: "attempt-active-4",
          target: platformTarget(profile.accountProfileId),
        }),
      { code: "PUBLICATION_UNCERTAIN" },
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("media remote order ID conflicts roll back another attempt while same-attempt outcomes stay idempotent", () => {
  const root = workspace();
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const firstEvidence = {
      articleId: "order-conflict-first-article",
      attemptId: "order-conflict-first-attempt",
      targetKey: "media-resource:order-conflict-first-resource",
      remoteId: "shared-order-id",
    };
    store.reservePublicationTarget({
      articleId: "order-conflict-first-article",
      publicationId: "order-conflict-first-publication",
      attemptId: "order-conflict-first-attempt",
      target: {
        kind: "media",
        mediaResourceId: "order-conflict-first-resource",
      },
    });
    assert.doesNotThrow(() =>
      store.attachRemoteOrderEvidence({
        attemptId: "order-conflict-first-attempt",
        orderId: "shared-order-id",
        remoteId: "shared-order-id",
        evidence: firstEvidence,
      }),
    );
    assert.doesNotThrow(() =>
      store.attachRemoteOrderEvidence({
        attemptId: "order-conflict-first-attempt",
        orderId: "shared-order-id",
        remoteId: "shared-order-id",
        evidence: firstEvidence,
      }),
    );

    store.reservePublicationTarget({
      articleId: "order-conflict-second-article",
      publicationId: "order-conflict-second-publication",
      attemptId: "order-conflict-second-attempt",
      target: {
        kind: "media",
        mediaResourceId: "order-conflict-second-resource",
      },
    });
    assert.throws(
      () =>
        store.attachRemoteOrderEvidence({
          attemptId: "order-conflict-second-attempt",
          orderId: "shared-order-id",
          remoteId: "shared-order-id",
          evidence: {
            articleId: "order-conflict-second-article",
            attemptId: "order-conflict-second-attempt",
            targetKey: "media-resource:order-conflict-second-resource",
            remoteId: "shared-order-id",
          },
        }),
      { code: "OPERATIONAL_ORDER_CONFLICT" },
    );
    assert.throws(
      () =>
        store.attachRemoteOrderEvidence({
          attemptId: "order-conflict-second-attempt",
          orderId: "shared-order-id",
          remoteId: "shared-order-id",
          evidence: {},
        }),
      { code: "OPERATIONAL_ORDER_CONFLICT" },
    );
    assert.deepEqual(
      store
        .listPublicationRecords({
          publicationIds: ["order-conflict-second-publication"],
        })
        .map((record) => [
          record.status,
          record.attempts[0].status,
          record.attempts[0].remoteId,
        ]),
      [["queued", "queued", null]],
    );
    assert.deepEqual(
      store.listRemoteOrders().map((order) => [order.orderId, order.attemptId]),
      [["shared-order-id", "order-conflict-first-attempt"]],
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("legacy published outcome replay stays closed and creates no archive job", () => {
  const root = workspace();
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    store.reservePublicationTarget({
      articleId: "published-replay-article",
      publicationId: "published-replay-publication",
      attemptId: "published-replay-attempt",
      target: platformTarget(profile.accountProfileId),
    });
    const outcome = {
      status: "published",
      evidence: {
        articleId: "published-replay-article",
        attemptId: "published-replay-attempt",
        targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
        accountProfileId: profile.accountProfileId,
        remoteId: "published-replay-remote",
        remoteUrl: "https://example.test/published-replay-remote",
      },
    };
    for (let replay = 0; replay < 2; replay += 1)
      assert.throws(
        () =>
          store.commitRemoteOutcome({
            attemptId: "published-replay-attempt",
            outcome,
          }),
        { code: "PUBLICATION_SUCCESS_WRITER_CLOSED" },
      );
    const database = new DatabaseSync(store.verify().databasePath, {
      readOnly: true,
    });
    try {
      assert.equal(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM post_processing_jobs WHERE attempt_id=? AND kind='archive'",
          )
          .get("published-replay-attempt").count,
        0,
      );
    } finally {
      database.close();
    }
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("queue groups, paid confirmation snapshots, and manual reconciliation facts are stable ports", () => {
  const root = workspace();
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    const group = store.createSubmissionQueueGroup({
      queueGroupId: "queue-group-1",
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    });
    const batch = store.createSubmissionBatch({
      batchId: "queue-batch-1",
      items: [
        {
          articleId: "queue-article-1",
          target: platformTarget(profile.accountProfileId),
          payload: { clientId: "client-1" },
        },
        {
          articleId: "queue-article-2",
          target: platformTarget(profile.accountProfileId),
          payload: { clientId: "client-1" },
        },
      ],
    });
    assert.equal(
      store.enqueueSubmissionQueueItem({
        queueGroupId: group.queueGroupId,
        itemId: batch.items[0].itemId,
      }).position,
      1,
    );
    assert.equal(
      store.enqueueSubmissionQueueItem({
        queueGroupId: group.queueGroupId,
        itemId: batch.items[1].itemId,
      }).position,
      2,
    );
    assert.deepEqual(
      store
        .listSubmissionQueueItems({ queueGroupId: group.queueGroupId })
        .map((item) => item.position),
      [1, 2],
    );
    assert.equal(
      store.setSubmissionQueueGroupPause({
        queueGroupId: group.queueGroupId,
        paused: false,
      }).paused,
      false,
    );
    const cancelled = store.createSubmissionBatch({
      batchId: "queue-cancelled-batch",
      items: [
        {
          articleId: "queue-cancelled-article",
          target: platformTarget(profile.accountProfileId),
          payload: {},
        },
      ],
    });
    store.cancelQueuedSubmissionItem({
      batchId: cancelled.batchId,
      itemId: cancelled.items[0].itemId,
    });
    assert.throws(
      () =>
        store.enqueueSubmissionQueueItem({
          queueGroupId: group.queueGroupId,
          itemId: cancelled.items[0].itemId,
        }),
      { code: "OPERATIONAL_QUEUE_ITEM_STATUS_INVALID" },
    );
    for (const status of ["completed", "failed"]) {
      const terminal = store.createSubmissionBatch({
        batchId: `queue-${status}-batch`,
        items: [
          {
            articleId: `queue-${status}-article`,
            target: platformTarget(profile.accountProfileId),
            payload: {},
          },
        ],
      });
      const claim = store.claimSubmissionItemById({
        batchId: terminal.batchId,
        itemId: terminal.items[0].itemId,
        claimToken: `claim-${status}`,
      });
      store.updateSubmissionItem({
        batchId: terminal.batchId,
        itemId: claim.itemId,
        revision: claim.revision,
        claimToken: claim.claimToken,
        status,
        payload: {},
      });
      assert.throws(
        () =>
          store.enqueueSubmissionQueueItem({
            queueGroupId: group.queueGroupId,
            itemId: claim.itemId,
          }),
        { code: "OPERATIONAL_QUEUE_ITEM_STATUS_INVALID" },
      );
    }

    const paidBatch = store.createSubmissionBatch({
      batchId: "paid-batch-1",
      items: [
        {
          articleId: "paid-article-1",
          target: { kind: "media", mediaResourceId: "media-1" },
          payload: { titleSnapshot: "标题" },
        },
      ],
    });
    const paid = store.createPaidSubmissionBatch({
      batchId: paidBatch.batchId,
      mediaResourceId: "media-1",
      confirmationFingerprint: "confirmation-fingerprint-1",
      systemSubmissionCode: "system-code-1",
      quotedPrice: 20,
      estimatedTotal: 20,
      confirmation: { articleCount: 1, resourceName: "媒体" },
    });
    assert.equal(paid.paused, true);
    assert.equal(
      store.createPaidSubmissionBatch({
        batchId: paidBatch.batchId,
        mediaResourceId: "media-1",
        confirmationFingerprint: "confirmation-fingerprint-1",
        systemSubmissionCode: "system-code-1",
        quotedPrice: 20,
        estimatedTotal: 20,
        confirmation: { articleCount: 1, resourceName: "媒体" },
      }).idempotent,
      true,
    );

    store.reservePublicationTarget({
      articleId: "reconcile-article",
      publicationId: "reconcile-publication",
      attemptId: "reconcile-attempt",
      target: platformTarget(profile.accountProfileId),
    });
    const reconciliation = store.recordManualReconciliation({
      reconciliationId: "reconciliation-1",
      attemptId: "reconcile-attempt",
      decision: "not_accepted",
      evidence: { operator: "fixture" },
    });
    assert.equal(reconciliation.idempotent, false);
    const replayedWithoutId = store.recordManualReconciliation({
      attemptId: "reconcile-attempt",
      decision: "not_accepted",
      evidence: { operator: "fixture" },
    });
    assert.equal(replayedWithoutId.idempotent, true);
    assert.equal(replayedWithoutId.reconciliationId, "reconciliation-1");
    assert.equal(
      store.recordManualReconciliation({
        reconciliationId: "reconciliation-1",
        attemptId: "reconcile-attempt",
        decision: "not_accepted",
        evidence: { operator: "fixture" },
      }).idempotent,
      true,
    );
    assert.throws(
      () =>
        store.recordManualReconciliation({
          reconciliationId: "reconciliation-2",
          attemptId: "reconcile-attempt",
          decision: "accepted",
          evidence: {},
        }),
      { code: "OPERATIONAL_RECONCILIATION_CONFLICT" },
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("batch lifecycle facts use a fixed-query public port and article snapshot consumes it", async () => {
  const root = workspace();
  const metrics = [];
  const store = createOperationalStore({
    workspaceRoot: root,
    internalLifecycleProjectionObserver: (value) => metrics.push(value),
  });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    const batch = store.createSubmissionBatch({
      batchId: "facts-batch",
      items: [
        {
          articleId: "facts-article",
          target: platformTarget(profile.accountProfileId),
          payload: { clientId: "client-facts" },
        },
      ],
    });
    store.createSubmissionQueueGroup({
      queueGroupId: "facts-group",
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    });
    store.enqueueSubmissionQueueItem({
      queueGroupId: "facts-group",
      itemId: batch.items[0].itemId,
    });
    store.reservePublicationTarget({
      articleId: "facts-article",
      publicationId: "facts-publication",
      attemptId: "facts-attempt",
      target: platformTarget(profile.accountProfileId),
    });
    const facts = store.listArticleLifecycleFacts({
      articleIds: ["facts-article"],
    });
    assert.equal(facts.publications.length, 1);
    assert.equal(facts.submissionItems.length, 1);
    assert.equal(facts.orders.length, 0);
    assert.equal(metrics.at(-1).sqlCount, 6);

    const snapshot = createArticleManagementSnapshot({
      workspaceRoot: root,
      aiContentService: {
        listGeneratedArticles: () => [
          {
            id: "facts-article",
            clientId: "client-facts",
            title: "标题",
            content: "正文",
          },
        ],
        listTrashedArticles: () => [],
      },
      contentSubmissionService: {
        listBatches: () => [],
        listPlatforms: () => [],
      },
      operationalStore: store,
      listAttention: () => ({
        revision: 1,
        items: [],
        counts: { total: 0, actionable: 0 },
      }),
      getRevision: () => 1,
    });
    const result = await snapshot.get({ clientId: "client-facts" });
    assert.equal(result.workflowByArticle["facts-article"].stage, "queued");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
