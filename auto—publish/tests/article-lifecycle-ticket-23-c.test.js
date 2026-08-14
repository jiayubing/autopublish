"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const {
  createOperationalStore,
  createOperationalStoreMigrationFacade,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createLegacyMigrationPlanner,
} = require("../src/content/legacy-migration-planner");

const FP = "a".repeat(64);
const BACKUP = "backup-23-c";

function article(articleId) {
  return {
    version: 1,
    clientId: "client-23-c",
    articleId,
    status: "saved",
    title: "当前文章标题",
    content: "当前文章正文",
  };
}

function platform(suffix) {
  return {
    version: 1,
    kind: "platform",
    platformId: "toutiao",
    accountProfileId: `account-${suffix}`,
  };
}

function media(suffix) {
  return { version: 1, kind: "media", mediaResourceId: `media-${suffix}` };
}

function fact(articleId, targetIdentityV1, status, extra) {
  return Object.assign(
    {
      version: 1,
      clientId: "client-23-c",
      articleId,
      targetIdentityV1,
      status,
      sourceRef: `fixture/${articleId}/${status}`,
    },
    extra || {},
  );
}

function source() {
  return {
    workspaceFingerprint: FP,
    articles: [
      article("published"),
      article("paid"),
      article("queued"),
      article("failed"),
      article("uncertain"),
      article("deleted"),
    ],
    publications: [
      fact("published", platform("published"), "published", {
        accepted: true,
        submittedTitle: "历史投稿标题",
        submittedBody: "历史投稿正文",
      }),
      fact("uncertain", platform("uncertain"), "submitted"),
      fact("deleted", platform("deleted"), "published", {
        accepted: true,
        submittedTitle: "已发布标题",
        submittedBody: "已发布正文",
      }),
    ],
    queues: [
      fact("queued", platform("queued"), "queued", {
        queueState: "QUEUED",
        remoteBoundaryCrossed: false,
      }),
    ],
    orders: [
      fact("paid", media("paid"), "1", {
        orderId: "order-23-c",
        orderCreationAttemptId: "attempt-23-c",
        mediaName: "历史媒体",
        quotedPrice: 10,
        estimatedTotal: 10,
        systemSubmissionCode: "submission-code-23-c",
        submittedTitle: "付费投稿标题",
        submittedBody: "付费投稿正文",
        remoteCallStartedAt: "2026-08-08T00:00:00.000Z",
        observedAt: "2026-08-08T00:01:00.000Z",
      }),
      fact("failed", media("failed"), "4", {
        orderId: "order-23-c-failed",
        orderCreationAttemptId: "attempt-23-c-failed",
        mediaName: "历史退稿媒体",
        quotedPrice: 12,
        estimatedTotal: 12,
        systemSubmissionCode: "submission-code-23-c-failed",
        submittedTitle: "历史退稿标题",
        submittedBody: "历史退稿正文",
        remoteCallStartedAt: "2026-08-08T00:00:00.000Z",
        observedAt: "2026-08-08T00:03:00.000Z",
      }),
    ],
    deletions: [
      Object.assign(article("deleted"), {
        sourceRef: "trash/deleted.tombstone.json",
        deleted: true,
        state: "TRASHED",
        deletedAt: "2026-08-08T00:02:00.000Z",
        contentFingerprint: FP,
      }),
    ],
  };
}

function createPlan() {
  return createLegacyMigrationPlanner({ legacySource: source() }).planResult()
    .plan;
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ticket-23-c-"));
}

function confirm(facade, plan) {
  facade.bootstrapMigrationJournal({
    migrationRunId: plan.migrationRunId,
    workspaceFingerprint: plan.workspaceFingerprint,
    sourceFingerprint: plan.sourceFingerprint,
    planFingerprint: plan.planFingerprint,
    sourceVersion: 1,
  });
  facade.persistMigrationJournalMetadata({
    migrationRunId: plan.migrationRunId,
    expectedPhase: "detected",
    phase: "backed_up",
    backupIdentity: BACKUP,
    confirmationFingerprint: null,
    verificationFingerprint: null,
  });
  return facade.persistMigrationJournalMetadata({
    migrationRunId: plan.migrationRunId,
    expectedPhase: "backed_up",
    phase: "confirmed",
    backupIdentity: BACKUP,
    confirmationFingerprint: "b".repeat(64),
    verificationFingerprint: null,
  });
}

test("23-C atomically imports all six variants through the narrow migration facade", () => {
  const root = tempRoot();
  const plan = createPlan();
  const facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
  try {
    confirm(facade, plan);
    const result = facade.importLifecycleFacts({ plan });
    assert.equal(result.idempotent, false);
    assert.equal(result.importedEntries, 6);
    assert.match(result.importCommitFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(
      facade.readMigrationJournal({ migrationRunId: plan.migrationRunId })
        .phase,
      "import_committed",
    );
    assert.deepEqual(
      facade
        .listImportedLifecycleFacts({ migrationRunId: plan.migrationRunId })
        .map((entry) => entry.variant)
        .sort(),
      plan.entries.map((entry) => entry.variant).sort(),
    );
  } finally {
    facade.close();
  }

  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const facts = store.listArticleLifecycleFacts({
      articleIds: plan.entries.map(
        (entry) => entry.articleIdentityV1.articleId,
      ),
    });
    assert.equal(facts.publications.length, 4);
    assert.equal(facts.orders.length, 2);
    assert.ok(
      facts.orders.some(
        (order) =>
          order.orderId === "order-23-c-failed" &&
          order.supplierStatusCode === "4" &&
          order.titleSnapshot === null,
      ),
    );
    assert.equal(
      facts.attentionItems.filter((item) => item.kind.startsWith("migration_"))
        .length,
      2,
    );
    assert.equal(facts.submissionItems.length, 0);
    assert.equal(store.listSubmissionQueueItems({}).length, 0);
    assert.equal(store.listPaidSubmissionBatches().length, 0);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-C rejects malicious plans at the store boundary without partial facts", () => {
  const root = tempRoot();
  const plan = createPlan();
  const facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
  try {
    confirm(facade, plan);
    const malicious = JSON.parse(JSON.stringify(plan));
    malicious.entries[0].payload.runnableQueueItem = { state: "queued" };
    assert.throws(() => facade.importLifecycleFacts({ plan: malicious }), {
      code: "MIGRATION_IMPORT_PLAN_INVALID",
    });
    assert.equal(
      facade.listImportedLifecycleFacts({ migrationRunId: plan.migrationRunId })
        .length,
      0,
    );
    assert.equal(
      facade.readMigrationJournal({ migrationRunId: plan.migrationRunId })
        .phase,
      "confirmed",
    );
    const substituted = JSON.parse(JSON.stringify(plan));
    const published = substituted.entries.find(
      (entry) => entry.variant === "publishedEvidence",
    );
    published.payload.terminalTargetV1.targetIdentityV1.accountProfileId =
      "account-substituted-after-confirmation";
    assert.throws(() => facade.importLifecycleFacts({ plan: substituted }), {
      code: "MIGRATION_IMPORT_PLAN_INVALID",
    });
  } finally {
    facade.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-C rolls back every fact and journal mutation on an in-transaction fault", () => {
  const root = tempRoot();
  const plan = createPlan();
  let entries = 0;
  const facade = createOperationalStoreMigrationFacade({
    workspaceRoot: root,
    internalMigrationImportFault(point) {
      if (point === "after-entry" && ++entries === 2) {
        const error = new Error("injected");
        error.code = "INJECTED_IMPORT_FAULT";
        throw error;
      }
    },
  });
  try {
    confirm(facade, plan);
    assert.throws(() => facade.importLifecycleFacts({ plan }), {
      code: "INJECTED_IMPORT_FAULT",
    });
    assert.equal(
      facade.listImportedLifecycleFacts({ migrationRunId: plan.migrationRunId })
        .length,
      0,
    );
    assert.equal(
      facade.readMigrationJournal({ migrationRunId: plan.migrationRunId })
        .phase,
      "confirmed",
    );
  } finally {
    facade.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-C treats a crash after commit as durable and retry-idempotent", () => {
  const root = tempRoot();
  const plan = createPlan();
  let crash = true;
  let facade = createOperationalStoreMigrationFacade({
    workspaceRoot: root,
    internalMigrationImportFault(point) {
      if (point === "after-commit" && crash) {
        crash = false;
        const error = new Error("crash after commit");
        error.code = "INJECTED_AFTER_COMMIT_CRASH";
        throw error;
      }
    },
  });
  confirm(facade, plan);
  assert.throws(() => facade.importLifecycleFacts({ plan }), {
    code: "INJECTED_AFTER_COMMIT_CRASH",
  });
  assert.equal(
    facade.readMigrationJournal({ migrationRunId: plan.migrationRunId }).phase,
    "import_committed",
  );
  facade.close();

  facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
  try {
    const retry = facade.importLifecycleFacts({ plan });
    assert.equal(retry.idempotent, true);
    assert.equal(
      facade.listImportedLifecycleFacts({ migrationRunId: plan.migrationRunId })
        .length,
      6,
    );
    facade.persistMigrationJournalMetadata({
      migrationRunId: plan.migrationRunId,
      expectedPhase: "import_committed",
      phase: "verified",
      backupIdentity: BACKUP,
      confirmationFingerprint: "b".repeat(64),
      verificationFingerprint: "c".repeat(64),
    });
    assert.equal(facade.importLifecycleFacts({ plan }).idempotent, true);
  } finally {
    facade.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-C serializes ownership and exposes no internal database primitive", () => {
  const root = tempRoot();
  const facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
  try {
    assert.equal("db" in facade, false);
    assert.equal("transaction" in facade, false);
    assert.throws(
      () => createOperationalStoreMigrationFacade({ workspaceRoot: root }),
      { code: "OPERATIONAL_WRITE_OWNER_EXISTS" },
    );
  } finally {
    facade.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-C rejects a plan that conflicts with existing lifecycle facts", () => {
  const root = tempRoot();
  const plan = createPlan();
  let store = createOperationalStore({ workspaceRoot: root });
  store.reservePublicationTarget({
    articleId: "published",
    publicationId: "existing-publication",
    attemptId: "existing-attempt",
    target: {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "existing-account",
    },
  });
  store.close();

  const facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
  try {
    confirm(facade, plan);
    assert.throws(() => facade.importLifecycleFacts({ plan }), {
      code: "MIGRATION_IMPORT_ARTICLE_CONFLICT",
    });
    assert.equal(
      facade.listImportedLifecycleFacts({ migrationRunId: plan.migrationRunId })
        .length,
      0,
    );
  } finally {
    facade.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-C rejects an article with existing runnable submission facts", () => {
  const root = tempRoot();
  const plan = createPlan();
  const store = createOperationalStore({ workspaceRoot: root });
  store.createSubmissionBatch({
    batchId: "existing-runnable-batch",
    items: [
      {
        articleId: "published",
        target: {
          kind: "platform",
          platformId: "toutiao",
          accountProfileId: "existing-runnable-account",
        },
        payload: { source: "pre-migration-fixture" },
      },
    ],
  });
  store.close();

  const facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
  try {
    confirm(facade, plan);
    assert.throws(() => facade.importLifecycleFacts({ plan }), {
      code: "MIGRATION_IMPORT_ARTICLE_CONFLICT",
    });
    assert.equal(
      facade.listImportedLifecycleFacts({ migrationRunId: plan.migrationRunId })
        .length,
      0,
    );
  } finally {
    facade.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("23-C v4 to v5 schema migration is atomic and retryable at every fault", () => {
  for (const faultPoint of [
    "before-v5",
    "after-v5-create",
    "after-v5-record",
  ]) {
    const root = tempRoot();
    let facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
    const databasePath = facade.databasePath;
    facade.close();
    const database = new DatabaseSync(databasePath);
    database.exec(
      "DROP TABLE IF EXISTS paid_staging_items; DROP TABLE submission_migration_notices; DROP TABLE migration_import_order_identities; DROP TABLE migration_import_entries; DROP TABLE migration_journals; DELETE FROM schema_migrations WHERE version>=5;",
    );
    database.close();

    assert.throws(
      () =>
        createOperationalStoreMigrationFacade({
          workspaceRoot: root,
          internalMigrationFault(point) {
            if (point === faultPoint) throw new Error(faultPoint);
          },
        }),
      { code: "OPERATIONAL_DATABASE_OPEN_FAILED" },
    );
    const failed = new DatabaseSync(databasePath, { readOnly: true });
    assert.deepEqual(
      failed
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => row.version),
      [1, 2, 3, 4],
    );
    assert.equal(
      failed
        .prepare(
          "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name LIKE 'migration_import_%'",
        )
        .get().count,
      0,
    );
    failed.close();

    facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
    facade.close();
    const upgraded = new DatabaseSync(databasePath, { readOnly: true });
    assert.deepEqual(
      upgraded
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => row.version),
      [1, 2, 3, 4, 5, 6, 7],
    );
    upgraded.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
