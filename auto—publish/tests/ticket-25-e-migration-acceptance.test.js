"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createLegacyMigrationPlanner,
} = require("../src/content/legacy-migration-planner");
const {
  createOperationalStore,
  createOperationalStoreMigrationFacade,
  inspectOperationalStoreMigrationJournals,
  verifyOperationalDatabase,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createWorkspaceMigrationBackup,
} = require("../desktop/services/workspace-migration-backup");
const {
  createWorkspaceMigrationComposition,
} = require("../desktop/composition/workspace-migration-composition");
const {
  createWorkspaceStartupComposition,
} = require("../desktop/composition/workspace-startup-composition");

const FINGERPRINT = "a".repeat(64);
const BACKUP_ID = "backup-ticket-25-e";

function article(articleId, extra) {
  return Object.assign(
    {
      version: 1,
      clientId: "client-ticket-25-e",
      articleId,
      status: "saved",
      title: "当前文章标题",
      content: "当前文章正文",
    },
    extra || {},
  );
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
      clientId: "client-ticket-25-e",
      articleId,
      targetIdentityV1,
      status,
      sourceRef: `fixture/${articleId}/${status}`,
    },
    extra || {},
  );
}

function completeSource() {
  return {
    workspaceFingerprint: FINGERPRINT,
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
        orderId: "order-ticket-25-e",
        orderCreationAttemptId: "attempt-ticket-25-e",
        mediaName: "历史媒体",
        quotedPrice: 10,
        estimatedTotal: 10,
        systemSubmissionCode: "submission-code-ticket-25-e",
        submittedTitle: "付费投稿标题",
        submittedBody: "付费投稿正文",
        remoteCallStartedAt: "2026-08-08T00:00:00.000Z",
        observedAt: "2026-08-08T00:01:00.000Z",
      }),
      fact("failed", media("failed"), "4", {
        orderId: "order-ticket-25-e-failed",
        orderCreationAttemptId: "attempt-ticket-25-e-failed",
        mediaName: "历史退稿媒体",
        quotedPrice: 12,
        estimatedTotal: 12,
        systemSubmissionCode: "submission-code-ticket-25-e-failed",
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
        contentFingerprint: FINGERPRINT,
      }),
    ],
  };
}

function planned(legacySource) {
  return createLegacyMigrationPlanner({ legacySource }).planResult();
}

function tempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function closeAndRemove(root, resource) {
  if (resource) resource.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function confirmFacade(facade, plan) {
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
    backupIdentity: BACKUP_ID,
    confirmationFingerprint: null,
    verificationFingerprint: null,
  });
  facade.persistMigrationJournalMetadata({
    migrationRunId: plan.migrationRunId,
    expectedPhase: "backed_up",
    phase: "confirmed",
    backupIdentity: BACKUP_ID,
    confirmationFingerprint: "b".repeat(64),
    verificationFingerprint: null,
  });
}

function runComposition(root, planner, input, options) {
  const composition = createWorkspaceMigrationComposition({
    workspaceRoot: root,
    planner,
    ...(options || {}),
  });
  try {
    return composition.run(input || {});
  } finally {
    composition.close();
  }
}

test("E dry-run and import evidence cover all variants, unavailable history, conflicts, and no runnable facts", () => {
  const source = completeSource();
  const before = JSON.stringify(source);
  const planner = createLegacyMigrationPlanner({ legacySource: source });
  const firstDryRun = planner.dryRun();
  const secondDryRun = planner.dryRun();
  const result = planner.planResult();

  assert.deepEqual(secondDryRun, firstDryRun);
  assert.equal(JSON.stringify(source), before);
  assert.equal(result.report.counts.planned, 6);
  assert.deepEqual(
    result.plan.entries.map((entry) => entry.variant).sort(),
    [
      "deletionRecoveryConflict",
      "needsAttentionConflict",
      "nonPublishedTerminal",
      "pendingReadmission",
      "publishedEvidence",
      "trackablePaidOrder",
    ].sort(),
  );

  const published = result.plan.entries.find(
    (entry) => entry.variant === "publishedEvidence",
  );
  assert.equal(published.payload.publicationEvidenceV1.contentAvailable, false);
  assert.equal(published.payload.publicationEvidenceV1.title, null);
  assert.equal(published.payload.publicationEvidenceV1.body, null);
  assert.equal(published.payload.publicationEvidenceV1.submittedAt, null);
  assert.equal(published.payload.publicationEvidenceV1.firstPublishedAt, null);
  assert.equal(published.payload.publicationEvidenceV1.imageSummaryV1, null);
  assert.deepEqual(
    [...published.payload.publicationEvidenceV1.missingReasons].sort(),
    [
      "LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE",
      "LEGACY_IMAGE_SUMMARY_UNAVAILABLE",
      "LEGACY_SUBMISSION_CONTENT_UNAVAILABLE",
      "LEGACY_SUBMITTED_AT_UNAVAILABLE",
    ].sort(),
  );
  assert.equal(
    result.plan.entries.find(
      (entry) => entry.variant === "needsAttentionConflict",
    ).payload.conflictKind,
    "SUBMITTING_OR_UNPROVEN_SUBMITTED",
  );
  assert.equal(
    result.plan.entries.find(
      (entry) => entry.variant === "deletionRecoveryConflict",
    ).payload.deletionConflictKind,
    "PUBLISHED_IN_TRASH",
  );

  const priorityPlan = createLegacyMigrationPlanner({
    legacySource: {
      workspaceFingerprint: FINGERPRINT,
      articles: [article("first-success")],
      publications: [
        fact("first-success", platform("first-success"), "failed"),
        fact("first-success", platform("first-success"), "published", {
          accepted: true,
          submittedTitle: "历史成功标题",
          submittedBody: "历史成功正文",
        }),
      ],
    },
  }).plan();
  assert.equal(priorityPlan.entries.length, 1);
  assert.equal(priorityPlan.entries[0].variant, "publishedEvidence");
});

test("E imports six variants atomically into the normal projection without queue, remote intent, or paid batch", () => {
  const root = tempRoot("ticket-25-e-six-variants");
  const planner = createLegacyMigrationPlanner({
    legacySource: completeSource(),
  });
  const plan = planner.plan();
  let store;
  try {
    const first = runComposition(root, planner);
    assert.equal(first.code, "MIGRATION_CONFIRMATION_REQUIRED");
    assert.equal(first.phase, "backed_up");
    assert.equal(first.executionGroupsPaused, true);

    const migrated = runComposition(root, planner, {
      confirmationFingerprint: first.repair.confirmationFingerprint,
    });
    assert.equal(migrated.allowed, true);
    assert.equal(migrated.phase, "verified");
    assert.equal(migrated.executionGroupsPaused, true);

    store = createOperationalStore({ workspaceRoot: root });
    const facts = store.listArticleLifecycleFacts({
      articleIds: plan.entries.map(
        (entry) => entry.articleIdentityV1.articleId,
      ),
    });
    assert.equal(facts.publications.length, 4);
    assert.equal(facts.orders.length, 2);
    assert.equal(
      facts.attentionItems.filter((item) => item.kind.startsWith("migration_"))
        .length,
      2,
    );
    assert.equal(facts.submissionItems.length, 0);
    assert.equal(store.listActionableRecovery().length, 0);
    assert.equal(store.listSubmissionQueueItems({}).length, 0);
    assert.equal(store.listPaidSubmissionBatches().length, 0);
  } finally {
    closeAndRemove(root, store);
  }
});

test("E rejects recursive plan mutations and leaves the confirmed import empty", () => {
  const basePlan = planned(completeSource()).plan;
  const mutations = [
    ["missing field", (value) => delete value.entries[0].payload],
    ["extra field", (value) => (value.entries[0].unexpected = true)],
    [
      "unknown variant",
      (value) => (value.entries[0].variant = "futureVariant"),
    ],
    ["future version", (value) => (value.version = 2)],
  ];

  for (const [label, mutate] of mutations) {
    const root = tempRoot(`ticket-25-e-invalid-${label.replace(/\s+/gu, "-")}`);
    let facade;
    try {
      facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
      confirmFacade(facade, basePlan);
      const invalidPlan = JSON.parse(JSON.stringify(basePlan));
      mutate(invalidPlan);
      assert.throws(() => facade.importLifecycleFacts({ plan: invalidPlan }), {
        code: "MIGRATION_IMPORT_PLAN_INVALID",
      });
      assert.equal(
        facade.listImportedLifecycleFacts({
          migrationRunId: basePlan.migrationRunId,
        }).length,
        0,
        label,
      );
      assert.equal(
        facade.readMigrationJournal({ migrationRunId: basePlan.migrationRunId })
          .phase,
        "confirmed",
        label,
      );
    } finally {
      closeAndRemove(root, facade);
    }
  }

  const duplicateArticle = JSON.parse(JSON.stringify(basePlan));
  duplicateArticle.entries.push({
    ...duplicateArticle.entries[0],
    entryId: "duplicate-article-entry",
  });
  const { planFingerprint: _ignoredPlanFingerprint, ...duplicatePlanCore } =
    duplicateArticle;
  const domain = require("../src/domain");
  assert.throws(
    () =>
      domain.parseImportPlanV1({
        ...duplicatePlanCore,
        planFingerprint: domain.importPlanFingerprintV1(duplicatePlanCore),
      }),
    { code: "IMPORT_PLAN_V1_INVALID" },
  );
});

test("E rolls back importer faults at each transaction boundary and makes post-commit retry idempotent", () => {
  const plan = planned(completeSource()).plan;
  for (const point of [
    "before-facts",
    "after-entry",
    "before-journal-commit",
    "after-journal-commit",
  ]) {
    const root = tempRoot(`ticket-25-e-atomic-${point}`);
    let facade;
    let entries = 0;
    try {
      facade = createOperationalStoreMigrationFacade({
        workspaceRoot: root,
        internalMigrationImportFault(faultPoint) {
          if (
            faultPoint === point &&
            (point !== "after-entry" || ++entries === 1)
          ) {
            const error = new Error("synthetic importer crash");
            error.code = `E_${point.toUpperCase().replace(/-/gu, "_")}`;
            throw error;
          }
        },
      });
      confirmFacade(facade, plan);
      assert.throws(() => facade.importLifecycleFacts({ plan }), {
        code: `E_${point.toUpperCase().replace(/-/gu, "_")}`,
      });
      assert.equal(
        facade.listImportedLifecycleFacts({
          migrationRunId: plan.migrationRunId,
        }).length,
        0,
      );
      assert.equal(
        facade.readMigrationJournal({ migrationRunId: plan.migrationRunId })
          .phase,
        "confirmed",
      );
    } finally {
      closeAndRemove(root, facade);
    }
  }

  const root = tempRoot("ticket-25-e-atomic-after-commit");
  let facade;
  let crashed = true;
  try {
    facade = createOperationalStoreMigrationFacade({
      workspaceRoot: root,
      internalMigrationImportFault(point) {
        if (point === "after-commit" && crashed) {
          crashed = false;
          const error = new Error("synthetic post-commit crash");
          error.code = "E_AFTER_COMMIT";
          throw error;
        }
      },
    });
    confirmFacade(facade, plan);
    assert.throws(() => facade.importLifecycleFacts({ plan }), {
      code: "E_AFTER_COMMIT",
    });
    assert.equal(
      facade.readMigrationJournal({ migrationRunId: plan.migrationRunId })
        .phase,
      "import_committed",
    );
    assert.equal(
      facade.listImportedLifecycleFacts({ migrationRunId: plan.migrationRunId })
        .length,
      plan.entries.length,
    );
    facade.close();
    facade = createOperationalStoreMigrationFacade({ workspaceRoot: root });
    assert.deepEqual(facade.importLifecycleFacts({ plan }).idempotent, true);
  } finally {
    closeAndRemove(root, facade);
  }
});

test("E recovers every durable journal write boundary and never re-imports after import_committed", () => {
  const crashPoints = [
    "before-detected",
    "after-detected",
    "before-backup",
    "after-backup",
    "before-backed-up",
    "after-backed-up",
    "before-confirmed",
    "after-confirmed",
    "before-import",
    "after-import",
    "before-verification",
    "after-verification",
    "before-verified",
    "after-verified",
  ];

  for (const crashPoint of crashPoints) {
    const root = tempRoot(`ticket-25-e-journal-${crashPoint}`);
    const planner = createLegacyMigrationPlanner({
      legacySource: completeSource(),
    });
    let injected = false;
    try {
      const first = runComposition(root, planner);
      assert.equal(first.code, "MIGRATION_CONFIRMATION_REQUIRED", crashPoint);
      fs.rmSync(path.join(root, ".autopublish"), {
        recursive: true,
        force: true,
      });
      const crashing = runComposition(
        root,
        planner,
        { confirmationFingerprint: first.repair.confirmationFingerprint },
        {
          fault(point) {
            if (!injected && point === crashPoint) {
              injected = true;
              const error = new Error("synthetic journal crash");
              error.code = "E_JOURNAL_CRASH";
              throw error;
            }
          },
        },
      );
      assert.equal(injected, true, crashPoint);
      assert.equal(crashing.allowed, false, crashPoint);

      const recovered = runComposition(root, planner, {
        confirmationFingerprint: first.repair.confirmationFingerprint,
      });
      assert.equal(recovered.allowed, true, crashPoint);
      assert.equal(recovered.phase, "verified", crashPoint);
      assert.equal(recovered.executionGroupsPaused, true, crashPoint);
      const journals = inspectOperationalStoreMigrationJournals({
        workspaceRoot: root,
      });
      assert.equal(journals.length, 1, crashPoint);
      assert.equal(journals[0].phase, "verified", crashPoint);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("E restores a verified synthetic backup and exercises a bounded import capacity", () => {
  const source = {
    workspaceFingerprint: FINGERPRINT,
    articles: Array.from({ length: 128 }, (_, index) =>
      article(`capacity-${index}`),
    ),
    queues: Array.from({ length: 128 }, (_, index) =>
      fact(`capacity-${index}`, platform(`capacity-${index}`), "queued", {
        queueState: "QUEUED",
        remoteBoundaryCrossed: false,
      }),
    ),
  };
  const planner = createLegacyMigrationPlanner({ legacySource: source });
  const plan = planner.plan();
  const root = tempRoot("ticket-25-e-capacity");
  let store;
  try {
    store = createOperationalStore({ workspaceRoot: root });
    const backupTarget = {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-backup",
    };
    store.reservePublicationTarget({
      articleId: "backup-article",
      publicationId: "backup-publication",
      attemptId: "backup-attempt",
      target: backupTarget,
    });
    store.close();
    store = null;

    const backup = createWorkspaceMigrationBackup({ workspaceRoot: root });
    const created = backup.ensure({
      migrationRunId: plan.migrationRunId,
      workspaceFingerprint: plan.workspaceFingerprint,
      sourceFingerprint: plan.sourceFingerprint,
      planFingerprint: plan.planFingerprint,
    });
    assert.equal(
      backup.verify({
        migrationRunId: plan.migrationRunId,
        workspaceFingerprint: plan.workspaceFingerprint,
        sourceFingerprint: plan.sourceFingerprint,
        planFingerprint: plan.planFingerprint,
        backupIdentity: created.backupIdentity,
      }).valid,
      true,
    );

    const restoredRoot = tempRoot("ticket-25-e-restored");
    try {
      const restoredOperations = path.join(
        restoredRoot,
        ".autopublish",
        "operations",
      );
      fs.mkdirSync(restoredOperations, { recursive: true });
      const artifactRoot = path.join(
        root,
        ".autopublish",
        "migration-backups",
        created.backupIdentity,
      );
      fs.copyFileSync(
        path.join(artifactRoot, "operations.db"),
        path.join(restoredOperations, "operations.db"),
      );
      if (fs.existsSync(path.join(artifactRoot, "operations.db-wal")))
        fs.copyFileSync(
          path.join(artifactRoot, "operations.db-wal"),
          path.join(restoredOperations, "operations.db-wal"),
        );
      const restored = verifyOperationalDatabase(
        path.join(restoredOperations, "operations.db"),
      );
      assert.equal(restored.schemaVersion, 5);
      const restoredStore = createOperationalStore({
        workspaceRoot: restoredRoot,
      });
      try {
        assert.equal(
          restoredStore.listArticleLifecycleFacts({
            articleIds: ["backup-article"],
          }).publications.length,
          1,
        );
      } finally {
        restoredStore.close();
      }
    } finally {
      fs.rmSync(restoredRoot, { recursive: true, force: true });
    }

    const first = runComposition(root, planner);
    assert.equal(first.code, "MIGRATION_CONFIRMATION_REQUIRED");
    const migrated = runComposition(root, planner, {
      confirmationFingerprint: first.repair.confirmationFingerprint,
    });
    assert.equal(migrated.allowed, true);
    assert.equal(migrated.phase, "verified");
    store = createOperationalStore({ workspaceRoot: root });
    assert.equal(
      store.listArticleLifecycleFacts({
        articleIds: plan.entries.map(
          (entry) => entry.articleIdentityV1.articleId,
        ),
      }).publications.length,
      128,
    );
    assert.equal(store.listSubmissionQueueItems({}).length, 0);
    assert.equal(store.listPaidSubmissionBatches().length, 0);
  } finally {
    closeAndRemove(root, store);
  }
});

test("E blocks normal startup while an unverified current-schema journal result is unresolved", async () => {
  let normalCompositionCalls = 0;
  const root = tempRoot("ticket-25-e-startup");
  try {
    await assert.rejects(
      createWorkspaceStartupComposition({
        bootstrapState: { workspacePath: root },
        options: {
          async runWorkspaceMigrationGate() {
            return {
              allowed: false,
              status: "blocked",
              code: "MIGRATION_POST_IMPORT_VERIFY_FAILED",
              phase: "import_committed",
              executionGroupsPaused: true,
              repair: { kind: "retry_verification" },
            };
          },
          createNormalWorkspaceRuntimeComposition() {
            normalCompositionCalls += 1;
            return { dispose() {} };
          },
        },
      }),
      { code: "MIGRATION_POST_IMPORT_VERIFY_FAILED" },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(normalCompositionCalls, 0);
});
