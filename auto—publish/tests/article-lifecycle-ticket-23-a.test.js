"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const domain = require("../src/domain");

const fp = (character) => character.repeat(64);

function article(articleId) {
  return { version: 1, clientId: "client-23", articleId };
}

function platformTarget(suffix) {
  return {
    version: 1,
    kind: "platform",
    platformId: `platform-${suffix}`,
    accountProfileId: `account-${suffix}`,
  };
}

function mediaTarget(suffix) {
  return { version: 1, kind: "media", mediaResourceId: `media-${suffix}` };
}

function evidenceRef(sourceKind, character) {
  return {
    sourceKind,
    sourceRecordIdHash: fp(character),
    sourceVersion: 1,
    evidenceFingerprint: fp(character),
  };
}

function common(entryId, variant, articleIdentityV1, payload, character) {
  return {
    entryId,
    variant,
    articleIdentityV1,
    legacySourceFingerprint: fp(character),
    legacyEvidenceRefs: [evidenceRef("ARTICLE_RECORD", character)],
    payload,
  };
}

function closedTarget(articleIdentityV1, targetIdentityV1, closedKind) {
  return {
    version: 1,
    articleIdentityV1,
    targetIdentityV1,
    attemptId: `attempt-${articleIdentityV1.articleId}`,
    closedKind,
    reasonCode: "LEGACY_TERMINAL",
    closedAt: null,
    closedAtSource: "legacy_unavailable",
    evidenceFingerprint: fp("c"),
  };
}

function publishedEntry() {
  const identity = article("article-published");
  const target = platformTarget("published");
  const title = "历史投稿标题";
  const body = "历史投稿正文";
  return common(
    "entry-published",
    "publishedEvidence",
    identity,
    {
      publicationEvidenceV1: {
        version: 1,
        articleIdentityV1: identity,
        customerSnapshotV1: {
          version: 1,
          clientId: identity.clientId,
          displayName: "客户二十三",
        },
        contentAvailable: true,
        title,
        body,
        contentFingerprint: domain.preparedContentFingerprint({ title, body }),
        targetSnapshotV1: {
          ...target,
          platformName: "平台二十三",
          accountLabel: "历史账号",
        },
        resultCode: "REGULAR_ACCEPTED",
        submittedAt: null,
        submittedAtSource: "legacy_unavailable",
        firstPublishedAt: null,
        firstPublishedAtSource: "legacy_unavailable",
        imageSummaryV1: null,
        orderNumber: null,
        remoteUrl: null,
        missingReasons: [
          "LEGACY_SUBMITTED_AT_UNAVAILABLE",
          "LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE",
          "LEGACY_IMAGE_SUMMARY_UNAVAILABLE",
        ],
        safeEvidenceRefs: [{ kind: "LEGACY_EVIDENCE", fingerprint: fp("a") }],
      },
      terminalTargetV1: {
        version: 1,
        articleIdentityV1: identity,
        targetIdentityV1: target,
        attemptId: "attempt-article-published",
        terminalKind: "PUBLISHED",
        reasonCode: "PUBLICATION_SUCCESS",
        terminalAt: null,
        terminalAtSource: "legacy_unavailable",
        evidenceFingerprint: fp("b"),
      },
      orderHistoryV1: null,
    },
    "1",
  );
}

function trackableEntry() {
  const identity = article("article-trackable");
  const target = mediaTarget("trackable");
  const orderIdentityV1 = { version: 1, orderId: "order-trackable" };
  const title = "网站媒体标题";
  const body = "网站媒体正文";
  const orderSnapshotV1 = {
    version: 1,
    orderIdentityV1,
    articleIdentityV1: identity,
    targetIdentityV1: target,
    orderCreationAttemptId: "attempt-trackable",
    mediaName: "媒体二十三",
    quotedPrice: 10,
    estimatedTotal: 10,
    actualAmount: null,
    systemSubmissionCode: "submission-23",
    submittedTitle: title,
    submittedBody: body,
    contentFingerprint: domain.contentFingerprint(title, body),
    remoteCallStartedAt: "2026-08-08T00:00:00.000Z",
  };
  return common(
    "entry-trackable",
    "trackablePaidOrder",
    identity,
    {
      orderSnapshotV1,
      orderObservationV1: {
        version: 1,
        orderIdentityV1,
        statusCode: "1",
        observedAt: "2026-08-08T00:01:00.000Z",
        eventAt: null,
        eventAtSource: "not_available",
        remoteUrl: null,
        actualAmount: null,
        evidenceFingerprint: fp("d"),
        orderSnapshotFingerprint: domain.orderSnapshotFingerprint(
          domain.parseOrderSnapshotV1(orderSnapshotV1),
        ),
      },
      paidTargetV1: {
        version: 1,
        articleIdentityV1: identity,
        targetIdentityV1: target,
        orderCreationAttemptId: "attempt-trackable",
        orderIdentityV1,
        state: "ACTIVE_TRACKING",
        terminalAt: null,
      },
    },
    "2",
  );
}

function pendingEntry() {
  const identity = article("article-pending");
  const target = platformTarget("pending");
  return common(
    "entry-pending",
    "pendingReadmission",
    identity,
    {
      legacyQueueEvidenceV1: {
        targetIdentityV1: target,
        queueState: "QUEUED",
        remoteBoundaryCrossed: false,
      },
      closedTargetV1: closedTarget(identity, target, "PRE_REMOTE_QUEUE_CLOSED"),
      readmissionReason: "PROVEN_PRE_REMOTE_QUEUE",
    },
    "3",
  );
}

function terminalEntry() {
  const identity = article("article-terminal");
  return common(
    "entry-terminal",
    "nonPublishedTerminal",
    identity,
    {
      closedTargetV1: closedTarget(
        identity,
        platformTarget("terminal"),
        "FAILED",
      ),
      orderHistoryV1: null,
      restoreEligibilityV1: {
        hasPublicationSuccess: false,
        hasActiveTarget: false,
        hasTrackableOrder: false,
        hasOpenUncertainty: false,
      },
    },
    "4",
  );
}

function attentionEntry() {
  const identity = article("article-attention");
  return common(
    "entry-attention",
    "needsAttentionConflict",
    identity,
    {
      conflictKind: "MULTIPLE_ACTIVE_TARGETS",
      migrationConflictEvidenceV1: {
        legacyStateCodes: ["QUEUED", "SUBMITTING"],
        targetIdentityV1s: [
          platformTarget("conflict-a"),
          mediaTarget("conflict-b"),
        ],
        orderIdentityV1s: [],
        contentFingerprints: [],
      },
      freezeReasonCode: "MIGRATION_CONFLICT",
    },
    "5",
  );
}

function deletionEntry() {
  const identity = article("article-deletion");
  return common(
    "entry-deletion",
    "deletionRecoveryConflict",
    identity,
    {
      deletionConflictKind: "PUBLISHED_IN_TRASH",
      migrationDeletionEvidenceV1: {
        tombstoneIdentityV1: {
          version: 1,
          articleIdentityV1: identity,
          state: "TRASHED",
          deletedAt: "2026-08-08T00:02:00.000Z",
          purgedAt: null,
          reasonCode: "LEGACY_TRASH",
          contentFingerprint: null,
        },
        deletionTransactionIdentityV1: null,
        conflictingFactKinds: ["PUBLICATION", "TOMBSTONE"],
      },
      freezeReasonCode: "MIGRATION_DELETION_CONFLICT",
    },
    "6",
  );
}

function plan(entries) {
  const value = {
    version: 1,
    migrationRunId: "migration-run-23-a",
    workspaceFingerprint: fp("7"),
    sourceFingerprint: fp("8"),
    entries,
  };
  return {
    ...value,
    planFingerprint: domain.importPlanFingerprintV1(value),
  };
}

function allEntries() {
  return [
    publishedEntry(),
    trackableEntry(),
    pendingEntry(),
    terminalEntry(),
    attentionEntry(),
    deletionEntry(),
  ];
}

test("23-A accepts and recursively freezes all six closed migration variants", () => {
  const parsed = domain.parseImportPlanV1(plan(allEntries()));
  assert.deepEqual(
    parsed.entries.map((entry) => entry.variant),
    [
      "publishedEvidence",
      "trackablePaidOrder",
      "pendingReadmission",
      "nonPublishedTerminal",
      "needsAttentionConflict",
      "deletionRecoveryConflict",
    ],
  );
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.entries), true);
  assert.equal(Object.isFrozen(parsed.entries[0].payload), true);
  assert.equal(Object.isFrozen(parsed.entries[0].legacyEvidenceRefs[0]), true);
});

test("23-A binds the claimed plan fingerprint to every normalized fact", () => {
  const original = plan(allEntries());
  const changed = JSON.parse(JSON.stringify(original));
  changed.entries[0].legacySourceFingerprint = fp("0");
  assert.throws(() => domain.parseImportPlanV1(changed), {
    code: "IMPORT_PLAN_V1_INVALID",
  });
});

test("23-A rejects future versions, unknown variants, extras, sparse arrays, and runnable facts", () => {
  const future = plan([]);
  future.version = 2;
  assert.throws(() => domain.parseImportPlanV1(future), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const unknown = publishedEntry();
  unknown.variant = "futureVariant";
  assert.throws(() => domain.parseImportPlanV1(plan([unknown])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const extra = publishedEntry();
  extra.payload.remoteCommand = { kind: "publish" };
  assert.throws(() => domain.parseImportPlanV1(plan([extra])), {
    code: "DTO_UNKNOWN_FIELD",
  });

  const runnable = pendingEntry();
  runnable.payload.runnableQueueItem = { status: "queued" };
  assert.throws(() => domain.parseImportPlanV1(plan([runnable])), {
    code: "DTO_UNKNOWN_FIELD",
  });

  const sparse = plan([]);
  sparse.entries = new Array(1);
  assert.throws(() => domain.parseImportPlanV1(sparse), {
    code: "IMPORT_PLAN_V1_INVALID",
  });
});

test("23-A delegates nested closure to upstream V1 parsers", () => {
  const nestedExtra = publishedEntry();
  nestedExtra.payload.terminalTargetV1.targetIdentityV1.token = "secret";
  assert.throws(() => domain.parseImportPlanV1(plan([nestedExtra])), {
    code: "TERMINAL_TARGET_V1_INVALID",
  });

  const badObservation = trackableEntry();
  badObservation.payload.orderObservationV1.statusCode = "2";
  assert.throws(() => domain.parseImportPlanV1(plan([badObservation])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const badDeletion = deletionEntry();
  badDeletion.payload.migrationDeletionEvidenceV1.tombstoneIdentityV1.state =
    "FUTURE";
  assert.throws(() => domain.parseImportPlanV1(plan([badDeletion])), {
    code: "TOMBSTONE_IDENTITY_V1_INVALID",
  });
});

test("23-A enforces identity binding, article uniqueness, order uniqueness, and success priority", () => {
  const targetMismatch = pendingEntry();
  targetMismatch.payload.closedTargetV1.targetIdentityV1 =
    platformTarget("different");
  assert.throws(() => domain.parseImportPlanV1(plan([targetMismatch])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const observationMismatch = trackableEntry();
  observationMismatch.payload.orderObservationV1.orderIdentityV1 = {
    version: 1,
    orderId: "order-other",
  };
  assert.throws(() => domain.parseImportPlanV1(plan([observationMismatch])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const published = publishedEntry();
  const terminal = terminalEntry();
  terminal.articleIdentityV1 = published.articleIdentityV1;
  terminal.payload.closedTargetV1.articleIdentityV1 =
    published.articleIdentityV1;
  assert.throws(() => domain.parseImportPlanV1(plan([published, terminal])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const duplicateOrder = attentionEntry();
  duplicateOrder.payload.conflictKind = "UNKNOWN_FACT_COMBINATION";
  duplicateOrder.payload.migrationConflictEvidenceV1.targetIdentityV1s = [];
  duplicateOrder.payload.migrationConflictEvidenceV1.orderIdentityV1s = [
    { version: 1, orderId: "order-trackable" },
  ];
  assert.throws(
    () => domain.parseImportPlanV1(plan([trackableEntry(), duplicateOrder])),
    { code: "IMPORT_PLAN_V1_INVALID" },
  );
});

test("23-A enforces variant evidence completeness and non-published terminal ownership", () => {
  const remoteQueue = pendingEntry();
  remoteQueue.payload.legacyQueueEvidenceV1.remoteBoundaryCrossed = true;
  assert.throws(() => domain.parseImportPlanV1(plan([remoteQueue])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const falseConflict = attentionEntry();
  falseConflict.payload.migrationConflictEvidenceV1.targetIdentityV1s = [
    platformTarget("only-one"),
  ];
  assert.throws(() => domain.parseImportPlanV1(plan([falseConflict])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const terminalObservation = terminalEntry();
  terminalObservation.payload.terminalObservationV1 = {};
  assert.throws(() => domain.parseImportPlanV1(plan([terminalObservation])), {
    code: "DTO_UNKNOWN_FIELD",
  });

  const publishedAsTerminal = terminalEntry();
  publishedAsTerminal.payload.closedTargetV1.closedKind =
    "PRE_REMOTE_QUEUE_CLOSED";
  assert.throws(() => domain.parseImportPlanV1(plan([publishedAsTerminal])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const incompleteDeletion = deletionEntry();
  incompleteDeletion.payload.migrationDeletionEvidenceV1.conflictingFactKinds =
    ["TOMBSTONE"];
  assert.throws(() => domain.parseImportPlanV1(plan([incompleteDeletion])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });

  const paidIdentity = article("article-paid-terminal");
  const paidTerminal = common(
    "entry-paid-terminal",
    "nonPublishedTerminal",
    paidIdentity,
    {
      closedTargetV1: closedTarget(
        paidIdentity,
        mediaTarget("terminal"),
        "PAID_STATUS_4",
      ),
      orderHistoryV1: {
        version: 1,
        orderIdentityV1: { version: 1, orderId: "order-paid-terminal" },
        entries: [
          {
            sequence: 1,
            kind: "observation",
            orderObservationV1: {
              version: 1,
              orderIdentityV1: {
                version: 1,
                orderId: "order-paid-terminal",
              },
              statusCode: "4",
              observedAt: "2026-08-08T00:03:00.000Z",
              eventAt: null,
              eventAtSource: "not_available",
              remoteUrl: null,
              actualAmount: null,
              evidenceFingerprint: fp("e"),
              orderSnapshotFingerprint: fp("f"),
            },
          },
        ],
      },
      restoreEligibilityV1: {
        hasPublicationSuccess: false,
        hasActiveTarget: false,
        hasTrackableOrder: false,
        hasOpenUncertainty: false,
      },
    },
    "0",
  );
  assert.equal(
    domain.parseImportPlanV1(plan([paidTerminal])).entries[0].payload
      .orderHistoryV1.orderIdentityV1.orderId,
    "order-paid-terminal",
  );

  const forgedPlatformOrder = terminalEntry();
  forgedPlatformOrder.payload.orderHistoryV1 =
    paidTerminal.payload.orderHistoryV1;
  assert.throws(() => domain.parseImportPlanV1(plan([forgedPlatformOrder])), {
    code: "IMPORT_PLAN_V1_INVALID",
  });
});
