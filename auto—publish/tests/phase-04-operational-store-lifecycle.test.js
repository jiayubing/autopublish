"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");
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
    DROP TABLE IF EXISTS manual_reconciliation_facts;
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
    DELETE FROM schema_migrations WHERE version=4;
  `);
  db.close();
}

function schemaSnapshot(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      history: db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version),
      tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name),
      orderColumns: db.prepare("PRAGMA table_info(order_display_snapshots)").all().map((row) => row.name),
    };
  } finally {
    db.close();
  }
}

function fileHash(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function platformTarget(accountProfileId) {
  return { kind: "platform", platformId: "toutiao", accountProfileId };
}

test("v3 to v4 migration is atomic, retryable, future-safe, and backup-verifiable", () => {
  for (const point of ["before-v4", "after-v4-create", "after-v4-verify", "after-v4-record"]) {
    const root = workspace();
    let store = createOperationalStore({ workspaceRoot: root });
    const databasePath = store.databasePath;
    store.close();
    removeV4Schema(databasePath);
    const before = schemaSnapshot(databasePath);
    assert.deepEqual(before.history, [1, 2, 3]);
    assert.throws(
      () => createOperationalStore({ workspaceRoot: root, internalMigrationFault(actual) {
        if (actual === point) throw new Error(point);
      } }),
      { code: "OPERATIONAL_DATABASE_OPEN_FAILED" },
    );
    assert.deepEqual(schemaSnapshot(databasePath), before);
    store = createOperationalStore({ workspaceRoot: root });
    assert.equal(store.verify().schemaVersion, 4);
    const backup = path.join(root, `backup-${point}.sqlite`);
    assert.equal(store.backup(backup).schemaVersion, 4);
    store.close();
    assert.equal(verifyOperationalDatabase(backup).schemaVersion, 4);
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(SCHEMA_VERSION, 4);
});

test("v4 order snapshot extension preserves rows from a real v3 database", () => {
  const root = workspace();
  let store = createOperationalStore({ workspaceRoot: root });
  const batch = store.createSubmissionBatch({
    batchId: "v3-order-batch",
    items: [{
      articleId: "v3-order-article",
      target: { kind: "media", mediaResourceId: "v3-resource" },
      payload: { attemptId: "v3-order-attempt", titleSnapshot: "旧标题", filename: "old.md", resourceNameSnapshot: "旧媒体", quotedPrice: 12,
      },
    }],
  });
  store.reservePublicationTarget({
    articleId: "v3-order-article",
    publicationId: "v3-order-publication",
    attemptId: "v3-order-attempt",
    target: { kind: "media", mediaResourceId: "v3-resource" },
  });
  store.commitRemoteOutcome({
    attemptId: "v3-order-attempt",
    batchItemId: batch.items[0].itemId,
    outcome: { status: "submitted", evidence: { articleId: "v3-order-article", attemptId: "v3-order-attempt", targetKey: "media-resource:v3-resource", remoteId: "v3-order" } },
  });
  const databasePath = store.databasePath;
  store.close();
  removeV4Schema(databasePath);
  store = createOperationalStore({ workspaceRoot: root });
  assert.deepEqual(store.listOrderDisplayViews().map(({ orderId, titleSnapshot, filename, resourceNameSnapshot, quotedPrice }) => ({ orderId, titleSnapshot, filename, resourceNameSnapshot, quotedPrice })), [{ orderId: "v3-order", titleSnapshot: "旧标题", filename: "old.md", resourceNameSnapshot: "旧媒体", quotedPrice: 12 }]);
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
  assert.deepEqual(report.migrations, [4]);
  assert.deepEqual(schemaSnapshot(databasePath), before);
  assert.equal(fileHash(databasePath), beforeHash);
  store = createOperationalStore({ workspaceRoot: root });
  store.close();
  const current = dryRunOperationalStoreMigration({ workspaceRoot: root });
  assert.equal(current.fromVersion, 4);
  assert.deepEqual(current.migrations, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test("one article has one database-enforced active target and failure releases it", async () => {
  const root = workspace();
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const first = () => store.reservePublicationTarget({
      articleId: "article-active",
      publicationId: "publication-active-1",
      attemptId: "attempt-active-1",
      target: platformTarget(profile.accountProfileId),
    });
    const second = () => store.reservePublicationTarget({
      articleId: "article-active",
      publicationId: "publication-active-2",
      attemptId: "attempt-active-2",
      target: { kind: "media", mediaResourceId: "resource-active" },
    });
    const results = await Promise.allSettled([
      Promise.resolve().then(first),
      Promise.resolve().then(second),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected")[0].reason.code, "PUBLICATION_DUPLICATE");

    store.commitRemoteOutcome({
      attemptId: "attempt-active-1",
      outcome: { status: "failed", error: { code: "REJECTED", category: "remote", retryability: "safe", userMessage: "Rejected" } },
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
      error: { code: "UNKNOWN", category: "transport", retryability: "manual-check", userMessage: "Check" },
    });
    assert.throws(() => store.reservePublicationTarget({
      articleId: "article-active",
      publicationId: "publication-active-4",
      attemptId: "attempt-active-4",
      target: platformTarget(profile.accountProfileId),
    }), { code: "PUBLICATION_UNCERTAIN" });
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("queue groups, paid confirmation snapshots, and manual reconciliation facts are stable ports", () => {
  const root = workspace();
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const group = store.createSubmissionQueueGroup({ queueGroupId: "queue-group-1", platformId: "toutiao", accountProfileId: profile.accountProfileId });
    const batch = store.createSubmissionBatch({
      batchId: "queue-batch-1",
      items: [
        { articleId: "queue-article-1", target: platformTarget(profile.accountProfileId), payload: { clientId: "client-1" } },
        { articleId: "queue-article-2", target: platformTarget(profile.accountProfileId), payload: { clientId: "client-1" } },
      ],
    });
    assert.equal(store.enqueueSubmissionQueueItem({ queueGroupId: group.queueGroupId, itemId: batch.items[0].itemId }).position, 1);
    assert.equal(store.enqueueSubmissionQueueItem({ queueGroupId: group.queueGroupId, itemId: batch.items[1].itemId }).position, 2);
    assert.deepEqual(store.listSubmissionQueueItems({ queueGroupId: group.queueGroupId }).map((item) => item.position), [1, 2]);
    assert.equal(store.setSubmissionQueueGroupPause({ queueGroupId: group.queueGroupId, paused: false }).paused, false);
    const cancelled = store.createSubmissionBatch({
      batchId: "queue-cancelled-batch",
      items: [{ articleId: "queue-cancelled-article", target: platformTarget(profile.accountProfileId), payload: {} }],
    });
    store.cancelQueuedSubmissionItem({ batchId: cancelled.batchId, itemId: cancelled.items[0].itemId });
    assert.throws(() => store.enqueueSubmissionQueueItem({ queueGroupId: group.queueGroupId, itemId: cancelled.items[0].itemId }), { code: "OPERATIONAL_QUEUE_ITEM_STATUS_INVALID" });
    for (const status of ["completed", "failed"]) {
      const terminal = store.createSubmissionBatch({
        batchId: `queue-${status}-batch`,
        items: [{ articleId: `queue-${status}-article`, target: platformTarget(profile.accountProfileId), payload: {} }],
      });
      const claim = store.claimSubmissionItemById({ batchId: terminal.batchId, itemId: terminal.items[0].itemId, claimToken: `claim-${status}` });
      store.updateSubmissionItem({ batchId: terminal.batchId, itemId: claim.itemId, revision: claim.revision, claimToken: claim.claimToken, status, payload: {} });
      assert.throws(() => store.enqueueSubmissionQueueItem({ queueGroupId: group.queueGroupId, itemId: claim.itemId }), { code: "OPERATIONAL_QUEUE_ITEM_STATUS_INVALID" });
    }

    const paidBatch = store.createSubmissionBatch({
      batchId: "paid-batch-1",
      items: [{ articleId: "paid-article-1", target: { kind: "media", mediaResourceId: "media-1" }, payload: { titleSnapshot: "标题" } }],
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
    assert.equal(store.createPaidSubmissionBatch({
      batchId: paidBatch.batchId,
      mediaResourceId: "media-1",
      confirmationFingerprint: "confirmation-fingerprint-1",
      systemSubmissionCode: "system-code-1",
      quotedPrice: 20,
      estimatedTotal: 20,
      confirmation: { articleCount: 1, resourceName: "媒体" },
    }).idempotent, true);

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
    assert.equal(store.recordManualReconciliation({
      reconciliationId: "reconciliation-1",
      attemptId: "reconcile-attempt",
      decision: "not_accepted",
      evidence: { operator: "fixture" },
    }).idempotent, true);
    assert.throws(() => store.recordManualReconciliation({
      reconciliationId: "reconciliation-2",
      attemptId: "reconcile-attempt",
      decision: "accepted",
      evidence: {},
    }), { code: "OPERATIONAL_RECONCILIATION_CONFLICT" });
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("batch lifecycle facts use a fixed-query public port and article snapshot consumes it", async () => {
  const root = workspace();
  const metrics = [];
  const store = createOperationalStore({ workspaceRoot: root, internalLifecycleProjectionObserver: (value) => metrics.push(value) });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const batch = store.createSubmissionBatch({
      batchId: "facts-batch",
      items: [{ articleId: "facts-article", target: platformTarget(profile.accountProfileId), payload: { clientId: "client-facts" } }],
    });
    store.createSubmissionQueueGroup({ queueGroupId: "facts-group", platformId: "toutiao", accountProfileId: profile.accountProfileId });
    store.enqueueSubmissionQueueItem({ queueGroupId: "facts-group", itemId: batch.items[0].itemId });
    store.reservePublicationTarget({ articleId: "facts-article", publicationId: "facts-publication", attemptId: "facts-attempt", target: platformTarget(profile.accountProfileId) });
    const facts = store.listArticleLifecycleFacts({ articleIds: ["facts-article"] });
    assert.equal(facts.publications.length, 1);
    assert.equal(facts.submissionItems.length, 1);
    assert.equal(facts.orders.length, 0);
    assert.equal(metrics.at(-1).sqlCount, 5);

    const snapshot = createArticleManagementSnapshot({
      workspaceRoot: root,
      aiContentService: {
        listGeneratedArticles: () => [{ id: "facts-article", clientId: "client-facts", title: "标题", content: "正文" }],
        listTrashedArticles: () => [],
      },
      contentSubmissionService: { listBatches: () => [], listPlatforms: () => [] },
      operationalStore: store,
      listAttention: () => ({ revision: 1, items: [], counts: { total: 0, actionable: 0 } }),
      getRevision: () => 1,
    });
    const result = await snapshot.get({ clientId: "client-facts" });
    assert.equal(result.workflowByArticle["facts-article"].stage, "queued");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
