"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const domain = require("../src/domain");
const {
  createRegularQueueGroupOrchestrator,
} = require("../desktop/services/regular-queue-group-orchestrator");
const {
  createRegularPlatformOutcomeService,
} = require("../desktop/services/regular-platform-outcome-service");
const {
  createRegularQueueGroupComposition,
} = require("../desktop/composition/regular-queue-group-composition");
const {
  createArticleAttentionQuery,
} = require("../desktop/services/article-attention-query");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function fixture(options) {
  const root =
    (options && options.workspaceRoot) ||
    fs.mkdtempSync(path.join(os.tmpdir(), "regular-outcome-09-"));
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    clock:
      (options && options.clock) ||
      (() => new Date("2026-08-07T01:00:00.000Z")),
    transitionPorts,
    internalRegularOutcomeTransitionFault:
      options && options.internalRegularOutcomeTransitionFault,
  });
  const profile = store.createAccountProfile({
    platformId: "hepan",
    displayName: "运营账号",
  });
  function prepare(articleId = "article-1") {
    const target = {
      kind: "platform",
      platformId: "hepan",
      accountProfileId: profile.accountProfileId,
    };
    const title = `标题 ${articleId}`;
    const body = `正文 ${articleId}`;
    const admitted =
      transitionPorts.regularQueueTransitions.admitRegularQueueItem({
        clientId: "client-1",
        articleId,
        batchId: `batch-${articleId}`,
        itemId: `item-${articleId}`,
        publicationId: `publication-${articleId}`,
        attemptId: `attempt-${articleId}`,
        target,
        publicationSnapshot: {
          articleId,
          title,
          body,
          fingerprint: "a".repeat(64),
        },
        payload: { clientId: "client-1" },
      });
    transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({
      queueGroupId: admitted.queueGroupId,
      running: true,
    });
    const claim =
      transitionPorts.regularQueueGroupTransitions.claimRegularQueueGroupHead({
        queueGroupId: admitted.queueGroupId,
        claimToken: `claim-${articleId}`,
        leaseMs: 30000,
      });
    const evidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
    transitionPorts.regularQueueGroupTransitions.beginRegularRemoteSubmission({
      regularPublicationAttemptId: claim.regularPublicationAttemptId,
      claimToken: claim.claimToken,
      preparedSubmissionEvidenceV1: evidence,
    });
    return { admitted, claim, evidence };
  }
  return {
    root,
    store,
    transitions: transitionPorts.regularOutcomeTransitions,
    orderTransitions: transitionPorts.orderObservationTransitions,
    queueTransitions: transitionPorts.regularQueueTransitions,
    groupTransitions: transitionPorts.regularQueueGroupTransitions,
    publishedArchiveQueries: transitionPorts.publishedArchiveQueries,
    prepare,
    close() {
      store.close();
      if (!options || options.removeWorkspaceRoot !== false)
        fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("regular accepted and paid status 2 share one first-wins publication snapshot", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-shared-success");
    const snapshot = domain.parseOrderSnapshotV1({
      version: 1,
      orderIdentityV1: { version: 1, orderId: "order-shared-success" },
      articleIdentityV1: {
        version: 1,
        clientId: "client-1",
        articleId: "article-shared-success",
      },
      targetIdentityV1: {
        version: 1,
        kind: "media",
        mediaResourceId: "resource-shared",
      },
      orderCreationAttemptId: "paid-shared-success",
      mediaName: "共享成功媒体",
      quotedPrice: 10,
      estimatedTotal: 10,
      actualAmount: null,
      systemSubmissionCode: "shared-success",
      submittedTitle: "付费标题",
      submittedBody: "付费正文",
      contentFingerprint: domain.contentFingerprint("付费标题", "付费正文"),
      remoteCallStartedAt: "2026-08-07T00:59:00.000Z",
    });
    const db = new DatabaseSync(f.store.databasePath);
    db.prepare("INSERT INTO publication_records VALUES(?,?,?,?,?,?,?)").run(
      "publication-paid-shared",
      "article-shared-success",
      "media-resource:resource-shared",
      JSON.stringify({ kind: "media", mediaResourceId: "resource-shared" }),
      "remote_started",
      "2026-08-07T00:59:00.000Z",
      "2026-08-07T00:59:00.000Z",
    );
    db.prepare("INSERT INTO publication_attempts VALUES(?,?,?,?,?)").run(
      "attempt-paid-shared",
      "publication-paid-shared",
      "remote_started",
      "2026-08-07T00:59:00.000Z",
      null,
    );
    db.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
      "order-shared-success",
      "attempt-paid-shared",
      "order-shared-success",
      JSON.stringify(snapshot),
      "2026-08-07T00:59:01.000Z",
    );
    db.close();

    const regular = f.transitions.recordRegularAccepted(
      accepted(prepared.claim.regularPublicationAttemptId),
    );
    const context = f.orderTransitions.getOrderObservationContext(
      "order-shared-success",
    );
    const paid = f.orderTransitions.recordOrderObservation({
      orderObservationV1: domain.parseOrderObservationV1({
        version: 1,
        orderIdentityV1: { version: 1, orderId: "order-shared-success" },
        statusCode: "2",
        observedAt: "2026-08-07T01:00:03.000Z",
        eventAt: null,
        eventAtSource: "not_available",
        remoteUrl: null,
        actualAmount: null,
        evidenceFingerprint: "9".repeat(64),
        orderSnapshotFingerprint: context.orderSnapshotFingerprint,
      }),
    });
    assert.equal(regular.publicationEvidence.resultCode, "REGULAR_ACCEPTED");
    assert.equal(
      paid.publication.publicationEvidence.resultCode,
      "REGULAR_ACCEPTED",
    );
    const check = new DatabaseSync(f.store.databasePath);
    assert.equal(
      check
        .prepare(
          "SELECT COUNT(*) count FROM remote_evidence WHERE remote_id LIKE 'publication-success:%'",
        )
        .get().count,
      1,
    );
    check.close();
  } finally {
    f.close();
  }
});

test("a paid anomaly closes on its own status 2 after regular global publication", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-anomaly-after-regular");
    const snapshot = domain.parseOrderSnapshotV1({
      version: 1,
      orderIdentityV1: { version: 1, orderId: "order-anomaly-after-regular" },
      articleIdentityV1: {
        version: 1,
        clientId: "client-1",
        articleId: "article-anomaly-after-regular",
      },
      targetIdentityV1: {
        version: 1,
        kind: "media",
        mediaResourceId: "resource-anomaly-after-regular",
      },
      orderCreationAttemptId: "paid-anomaly-after-regular",
      mediaName: "异常媒体",
      quotedPrice: 10,
      estimatedTotal: 10,
      actualAmount: null,
      systemSubmissionCode: "anomaly-after-regular",
      submittedTitle: "付费标题",
      submittedBody: "付费正文",
      contentFingerprint: domain.contentFingerprint("付费标题", "付费正文"),
      remoteCallStartedAt: "2026-08-07T00:59:00.000Z",
    });
    const db = new DatabaseSync(f.store.databasePath);
    db.prepare("INSERT INTO publication_records VALUES(?,?,?,?,?,?,?)").run(
      "publication-paid-anomaly-after-regular",
      "article-anomaly-after-regular",
      "media-resource:resource-anomaly-after-regular",
      JSON.stringify({ kind: "media", mediaResourceId: "resource-anomaly-after-regular" }),
      "remote_started",
      "2026-08-07T00:59:00.000Z",
      "2026-08-07T00:59:00.000Z",
    );
    db.prepare("INSERT INTO publication_attempts VALUES(?,?,?,?,?)").run(
      "attempt-paid-anomaly-after-regular",
      "publication-paid-anomaly-after-regular",
      "remote_started",
      "2026-08-07T00:59:00.000Z",
      null,
    );
    db.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
      "order-anomaly-after-regular",
      "attempt-paid-anomaly-after-regular",
      "order-anomaly-after-regular",
      JSON.stringify(snapshot),
      "2026-08-07T00:59:01.000Z",
    );
    db.close();

    f.orderTransitions.recordOrderStatusAnomaly({
      orderId: "order-anomaly-after-regular",
      evidenceFingerprint: "e".repeat(64),
    });
    const regular = f.transitions.recordRegularAccepted(
      accepted(prepared.claim.regularPublicationAttemptId),
    );
    const context = f.orderTransitions.getOrderObservationContext(
      "order-anomaly-after-regular",
    );
    const paid = f.orderTransitions.recordOrderObservation({
      orderObservationV1: domain.parseOrderObservationV1({
        version: 1,
        orderIdentityV1: { version: 1, orderId: "order-anomaly-after-regular" },
        statusCode: "2",
        observedAt: "2026-08-07T01:00:03.000Z",
        eventAt: null,
        eventAtSource: "not_available",
        remoteUrl: null,
        actualAmount: null,
        evidenceFingerprint: "f".repeat(64),
        orderSnapshotFingerprint: context.orderSnapshotFingerprint,
      }),
    });

    assert.equal(regular.publicationEvidence.resultCode, "REGULAR_ACCEPTED");
    assert.equal(paid.publication.publicationEvidence.resultCode, "REGULAR_ACCEPTED");
    const view = f.orderTransitions.listOrderObservationViews()[0];
    assert.equal(view.statusCode, "2");
    assert.equal(view.anomaly, null);
    const lifecycle = f.store.listArticleLifecycleFacts({
      articleIds: ["article-anomaly-after-regular"],
    });
    assert.equal(lifecycle.publications.some((fact) => fact.status === "published"), true);
    const check = new DatabaseSync(f.store.databasePath);
    const anomaly = check.prepare(
      "SELECT evidence_json FROM remote_evidence WHERE remote_id=?",
    ).get("order-status-anomaly:order-anomaly-after-regular");
    const history = check.prepare(
      "SELECT evidence_json FROM remote_evidence WHERE remote_id=?",
    ).get("order-history:order-anomaly-after-regular");
    check.close();
    assert.equal(JSON.parse(anomaly.evidence_json).state, "resolved");
    assert.equal(JSON.parse(history.evidence_json).entries.at(-1).orderObservationV1.statusCode, "2");
  } finally {
    f.close();
  }
});

function accepted(attemptId) {
  return {
    regularPublicationAttemptId: attemptId,
    observation: {
      status: "accepted",
      code: "HEPAN_ACCEPTED",
      observedAt: "2026-08-07T01:00:02.000Z",
      providerEventAt: "2026-08-07T01:00:01.000Z",
      remoteId: "hepan-article-1",
      remoteUrl: "https://example.test/article/1",
    },
  };
}

function admitForOrchestrator(f, articleId) {
  const accountProfileId = f.store.listAccountProfiles()[0].accountProfileId;
  return f.queueTransitions.admitRegularQueueItem({
    clientId: "client-1",
    articleId,
    batchId: `batch-${articleId}`,
    itemId: `item-${articleId}`,
    publicationId: `publication-${articleId}`,
    attemptId: `attempt-${articleId}`,
    target: { kind: "platform", platformId: "hepan", accountProfileId },
    publicationSnapshot: {
      articleId,
      title: "标题",
      body: "正文",
      fingerprint: "a".repeat(64),
    },
    payload: { clientId: "client-1" },
  });
}

test("accepted atomically publishes from frozen evidence and is idempotent first-wins", () => {
  const f = fixture();
  try {
    const prepared = f.prepare();
    const first = f.transitions.recordRegularAccepted(
      accepted(prepared.claim.regularPublicationAttemptId),
    );
    assert.equal(first.status, "published");
    assert.equal(first.idempotent, false);
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    assert.equal(snapshot.publicationStatus, "published");
    assert.equal(snapshot.itemStatus, "completed");
    assert.equal(snapshot.queueGroupId, null);
    assert.equal(snapshot.publicationEvidence.title, prepared.evidence.title);
    assert.equal(
      snapshot.publicationEvidence.submittedAt,
      "2026-08-07T01:00:00.000Z",
    );
    assert.equal(
      snapshot.publicationEvidence.firstPublishedAtSource,
      "provider_event_time",
    );
    assert.equal(snapshot.observation.remoteId, "hepan-article-1");
    assert.equal(
      snapshot.publicationEvidence.safeEvidenceRefs.find(
        (evidence) => evidence.kind === "REGULAR_ACCEPTED_OBSERVATION",
      ).fingerprint,
      snapshot.observation.fingerprint,
    );
    const repeated = f.transitions.recordRegularAccepted(
      accepted(prepared.claim.regularPublicationAttemptId),
    );
    assert.equal(repeated.idempotent, true);
    assert.deepEqual(
      f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      }),
      snapshot,
    );
    const lateFailure = f.transitions.recordRegularArticleRejected({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      observation: {
        status: "article_rejected",
        code: "REMOTE_REJECTED",
      },
    });
    assert.deepEqual(lateFailure, {
      attemptId: prepared.claim.regularPublicationAttemptId,
      status: "published",
      firstWins: true,
    });
  } finally {
    f.close();
  }
});

test("regular accepted preserves ID-only, URL-only, and combined remote locators", () => {
  const f = fixture();
  try {
    const idOnly = f.prepare("article-id-only");
    const idResult = f.transitions.recordRegularAccepted({
      regularPublicationAttemptId: idOnly.claim.regularPublicationAttemptId,
      observation: {
        status: "accepted",
        code: "HEPAN_ACCEPTED",
        remoteId: "hepan:id-only",
      },
    });
    assert.equal(idResult.publicationEvidence.version, 2);
    assert.equal(idResult.publicationEvidence.remoteId, "hepan:id-only");
    assert.equal(idResult.publicationEvidence.remoteUrl, null);
    const idArchive = f.publishedArchiveQueries.listPublishedArchives({
      articleIds: ["article-id-only"],
    })[0];
    assert.deepEqual(idArchive.publicationLocator, {
      remoteId: "hepan:id-only",
      remoteUrl: null,
      displayStatus: "RECORDED",
    });
    assert.equal(
      f.store.listArticleLifecycleFacts({ articleIds: ["article-id-only"] })
        .publications[0].remoteId,
      "hepan:id-only",
    );

    const urlOnly = f.prepare("article-url-only");
    const urlResult = f.transitions.recordRegularAccepted({
      regularPublicationAttemptId: urlOnly.claim.regularPublicationAttemptId,
      observation: {
        status: "accepted",
        code: "HEPAN_ACCEPTED",
        remoteUrl: "https://example.test/article/url-only",
      },
    });
    assert.equal(urlResult.publicationEvidence.remoteId, null);
    assert.equal(
      urlResult.publicationEvidence.remoteUrl,
      "https://example.test/article/url-only",
    );
    const combined = f.prepare("article-combined-locator");
    const combinedResult = f.transitions.recordRegularAccepted({
      regularPublicationAttemptId: combined.claim.regularPublicationAttemptId,
      observation: {
        status: "accepted",
        code: "HEPAN_ACCEPTED",
        remoteId: "hepan:combined",
        remoteUrl: "https://example.test/article/combined",
      },
    });
    assert.equal(combinedResult.publicationEvidence.remoteId, "hepan:combined");
    assert.equal(
      combinedResult.publicationEvidence.remoteUrl,
      "https://example.test/article/combined",
    );
  } finally {
    f.close();
  }
});

test("accepted transition fails closed when the adapter supplies no remote identity", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-missing-remote-identity");
    assert.throws(
      () =>
        f.transitions.recordRegularAccepted({
          regularPublicationAttemptId:
            prepared.claim.regularPublicationAttemptId,
          observation: {
            status: "accepted",
            code: "REGULAR_ACCEPTED",
            observedAt: "2026-08-07T01:00:02.000Z",
          },
        }),
      { code: "REGULAR_ACCEPTED_REMOTE_IDENTITY_REQUIRED" },
    );
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    assert.equal(snapshot.publicationStatus, "remote_started");
    assert.equal(snapshot.observation, null);
    assert.equal(snapshot.publicationEvidence, null);
  } finally {
    f.close();
  }
});

test("other attempt evidence cannot affect repeated or concurrent publication success", async () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-success-with-order-evidence");
    const attemptId = prepared.claim.regularPublicationAttemptId;
    f.store.attachRemoteOrderEvidence({
      attemptId,
      orderId: "order-evidence-before-success",
      remoteId: "order-evidence-before-success",
      evidence: {
        supplierObservation: {
          statusCode: "1",
          observedAt: "2026-08-07T01:00:01.000Z",
        },
      },
    });
    const first = f.transitions.recordRegularAccepted(accepted(attemptId));
    const repeated = f.transitions.recordRegularAccepted(accepted(attemptId));
    const concurrent = await Promise.all([
      Promise.resolve().then(() =>
        f.transitions.recordRegularAccepted(accepted(attemptId)),
      ),
      Promise.resolve().then(() =>
        f.transitions.recordRegularAccepted(accepted(attemptId)),
      ),
    ]);
    for (const result of [repeated, ...concurrent]) {
      assert.equal(result.idempotent, true);
      assert.deepEqual(
        result.publicationEvidence,
        first.publicationEvidence,
      );
      assert.deepEqual(
        domain.parsePublicationEvidence(result.publicationEvidence),
        first.publicationEvidence,
      );
    }
    const check = new DatabaseSync(f.store.databasePath);
    check
      .prepare(
        "INSERT INTO remote_evidence VALUES(?,?,?,?,?,?)",
      )
      .run(
        "evidence-after-publication-success",
        attemptId,
        "unrelated-evidence-after-publication-success",
        "https://example.test/unrelated",
        "{}",
        "2026-08-07T01:00:03.000Z",
      );
    check.close();
    const record = f.store.listPublicationRecords({
      articleIds: ["article-success-with-order-evidence"],
    })[0];
    assert.equal(record.attempts[0].remoteId, "hepan-article-1");
    assert.equal(
      record.attempts[0].remoteUrl,
      "https://example.test/article/1",
    );
    assert.equal(f.store.listRemoteOrders().length, 1);
    assert.deepEqual(
      f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: attemptId,
      }).publicationEvidence,
      first.publicationEvidence,
    );
  } finally {
    f.close();
  }
});

test("uncertain pauses only its group and supports the two bound resolutions", () => {
  const f = fixture();
  try {
    const prepared = f.prepare();
    f.transitions.recordRegularUncertain({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      observation: {
        status: "uncertain",
        code: "REMOTE_RESULT_UNKNOWN",
        observedAt: "2026-08-07T01:00:02.000Z",
      },
    });
    const uncertain = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    assert.equal(uncertain.intentState, "manual_check");
    assert.equal(uncertain.itemStatus, "uncertain");
    assert.equal(uncertain.pauseIntent, "system");
    const confirmation = f.transitions.prepareRegularUncertainResolution({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    assert.deepEqual(confirmation.actions, [
      "confirm_accepted",
      "confirm_not_accepted",
    ]);
    const resolved = f.transitions.confirmRegularAccepted({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      confirmationToken: confirmation.confirmationToken,
      manualPositiveEvidence: {
        observedAt: "2026-08-07T01:00:00.000Z",
      },
    });
    assert.equal(resolved.status, "published");
    const final = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    assert.equal(
      final.publicationEvidence.firstPublishedAtSource,
      "manual_positive_evidence_time",
    );
    assert.deepEqual(
      f.publishedArchiveQueries.listPublishedArchives({ articleIds: ["article-1"] })[0]
        .publicationLocator,
      {
        remoteId: null,
        remoteUrl: null,
        displayStatus: "MANUAL_CONFIRMED_NO_LOCATOR",
      },
    );
    assert.throws(
      () =>
        f.transitions.confirmRegularNotAccepted({
          regularPublicationAttemptId:
            prepared.claim.regularPublicationAttemptId,
          confirmationToken: confirmation.confirmationToken,
          manualNegativeEvidence: {
            reasonCode: "OPERATOR_VERIFIED_NOT_ACCEPTED",
            observedAt: "2026-08-07T01:00:00.000Z",
          },
        }),
      { code: "REGULAR_UNCERTAIN_RESOLUTION_OPPOSITE" },
    );
  } finally {
    f.close();
  }
});

test("manual acceptance without a locator closes attention permanently across restart", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-outcome-restart-"));
  let first;
  let reopened;
  try {
    first = fixture({ workspaceRoot: root, removeWorkspaceRoot: false });
    const prepared = first.prepare("article-manual-no-locator-restart");
    first.transitions.recordRegularUncertain({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      observation: { status: "uncertain", code: "REMOTE_RESULT_UNKNOWN" },
    });
    const confirmation = first.transitions.prepareRegularUncertainResolution({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    first.transitions.confirmRegularAccepted({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      confirmationToken: confirmation.confirmationToken,
      manualPositiveEvidence: { observedAt: "2026-08-07T01:00:00.000Z" },
    });
    assert.equal(
      createArticleAttentionQuery({ operationalStore: first.store }).list().items
        .length,
      0,
    );
    first.close();
    first = null;

    reopened = fixture({ workspaceRoot: root, removeWorkspaceRoot: false });
    assert.equal(
      createArticleAttentionQuery({ operationalStore: reopened.store }).list()
        .items.length,
      0,
    );
  } finally {
    if (first) first.close();
    if (reopened) reopened.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("manual acceptance preserves optional remote ID and URL evidence", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-manual-optional-locator");
    f.transitions.recordRegularUncertain({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      observation: { status: "uncertain", code: "REMOTE_RESULT_UNKNOWN" },
    });
    const confirmation = f.transitions.prepareRegularUncertainResolution({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    f.transitions.confirmRegularAccepted({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      confirmationToken: confirmation.confirmationToken,
      manualPositiveEvidence: {
        observedAt: "2026-08-07T01:00:00.000Z",
        remoteId: "manual:article-1",
        remoteUrl: "https://example.test/manual-article-1",
      },
    });
    assert.deepEqual(
      f.publishedArchiveQueries.listPublishedArchives({
        articleIds: ["article-manual-optional-locator"],
      })[0].publicationLocator,
      {
        remoteId: "manual:article-1",
        remoteUrl: "https://example.test/manual-article-1",
        displayStatus: "RECORDED",
      },
    );
  } finally {
    f.close();
  }
});

test("explicit failure projects one safe reason into publication, lifecycle, and attention", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-explicit-failure");
    f.transitions.recordRegularArticleRejected({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      observation: {
        status: "article_rejected",
        code: "CONTENT_REJECTED",
      },
    });
    const record = f.store.listPublicationRecords({
      articleIds: ["article-explicit-failure"],
    })[0];
    assert.deepEqual(
      {
        reasonCode: record.reasonCode,
        reasonSummary: record.reasonSummary,
        attemptReasonCode: record.attempts[0].reasonCode,
        attemptReasonSummary: record.attempts[0].reasonSummary,
      },
      {
        reasonCode: "CONTENT_REJECTED",
        reasonSummary: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
        attemptReasonCode: "CONTENT_REJECTED",
        attemptReasonSummary: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
      },
    );
    const facts = f.store.listArticleLifecycleFacts({
      articleIds: ["article-explicit-failure"],
    });
    assert.equal(facts.publications[0].reasonCode, "CONTENT_REJECTED");
    assert.equal(
      facts.submissionItems[0].reasonSummary,
      "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
    );
    const attention = createArticleAttentionQuery({
      operationalStore: f.store,
      readers: {
        getArticle() {
          return {
            status: "generated",
            title: "明确失败文章",
            content: "正文",
          };
        },
      },
    }).list();
    assert.deepEqual(
      {
        reasonCode: attention.items[0].reasonCode,
        reasonSummary: attention.items[0].reasonSummary,
      },
      {
        reasonCode: "CONTENT_REJECTED",
        reasonSummary: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
      },
    );
  } finally {
    f.close();
  }
});

test("uncertain publication attention remains visible in its client scope", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-attention-visible");
    f.transitions.recordRegularUncertain({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      observation: {
        status: "uncertain",
        code: "REMOTE_RESULT_UNKNOWN",
        observedAt: "2026-08-07T01:00:02.000Z",
      },
    });
    const query = createArticleAttentionQuery({
      operationalStore: f.store,
    });
    const scoped = query.list({ clientId: "client-1" });
    assert.equal(scoped.items.length, 1);
    assert.equal(scoped.items[0].clientId, "client-1");
    assert.equal(scoped.items[0].articleId, "article-attention-visible");
    assert.equal(query.list({ clientId: "other-client" }).items.length, 0);
  } finally {
    f.close();
  }
});

test("a late accepted observation overrides an earlier not-accepted resolution", () => {
  const f = fixture();
  try {
    const prepared = f.prepare();
    const attemptId = prepared.claim.regularPublicationAttemptId;
    f.transitions.recordRegularUncertain({
      regularPublicationAttemptId: attemptId,
      observation: {
        status: "uncertain",
        code: "REMOTE_RESULT_UNKNOWN",
        observedAt: "2026-08-07T01:00:02.000Z",
      },
    });
    const token = f.transitions.prepareRegularUncertainResolution({
      regularPublicationAttemptId: attemptId,
    });
    f.transitions.confirmRegularNotAccepted({
      regularPublicationAttemptId: attemptId,
      confirmationToken: token.confirmationToken,
      manualNegativeEvidence: {
        reasonCode: "OPERATOR_VERIFIED_NOT_ACCEPTED",
        observedAt: "2026-08-07T01:00:00.000Z",
      },
    });
    const negative = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: attemptId,
    });
    assert.equal(negative.resolution.decision, "not_accepted");
    assert.equal(negative.resolution.observedAt, "2026-08-07T01:00:00.000Z");
    const late = f.transitions.recordRegularAccepted(accepted(attemptId));
    assert.equal(late.status, "published");
    const success = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: attemptId,
    });
    assert.equal(success.publicationStatus, "published");
    assert.equal(success.resolution.decision, "accepted");
    assert.equal(success.resolution.successWins, true);
    assert.throws(
      () =>
        f.transitions.confirmRegularNotAccepted({
          regularPublicationAttemptId: attemptId,
          confirmationToken: token.confirmationToken,
          manualNegativeEvidence: {
            reasonCode: "OPERATOR_VERIFIED_NOT_ACCEPTED",
            observedAt: "2026-08-07T01:00:00.000Z",
          },
        }),
      { code: "REGULAR_UNCERTAIN_RESOLUTION_OPPOSITE" },
    );
    assert.equal(
      f.transitions.confirmRegularAccepted({
        regularPublicationAttemptId: attemptId,
        confirmationToken: token.confirmationToken,
        manualPositiveEvidence: {
          observedAt: "2026-08-07T01:00:00.000Z",
        },
      }).idempotent,
      true,
    );
  } finally {
    f.close();
  }
});

test("late accepted success atomically supersedes a newly queued target", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-retarget-race");
    const originalAttemptId = prepared.claim.regularPublicationAttemptId;
    f.transitions.recordRegularUncertain({
      regularPublicationAttemptId: originalAttemptId,
      observation: {
        status: "uncertain",
        code: "REMOTE_RESULT_UNKNOWN",
        observedAt: "2026-08-07T01:00:00.000Z",
      },
    });
    const token = f.transitions.prepareRegularUncertainResolution({
      regularPublicationAttemptId: originalAttemptId,
    });
    f.transitions.confirmRegularNotAccepted({
      regularPublicationAttemptId: originalAttemptId,
      confirmationToken: token.confirmationToken,
      manualNegativeEvidence: {
        reasonCode: "OPERATOR_VERIFIED_NOT_ACCEPTED",
        observedAt: "2026-08-07T01:00:00.000Z",
      },
    });
    const nextProfile = f.store.createAccountProfile({
      platformId: "toutiao",
      displayName: "头条账号",
    });
    const next = f.queueTransitions.admitRegularQueueItem({
      clientId: "client-1",
      articleId: "article-retarget-race",
      batchId: "batch-retarget-race",
      itemId: "item-retarget-race",
      publicationId: "publication-retarget-race",
      attemptId: "attempt-retarget-race",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: nextProfile.accountProfileId,
      },
      publicationSnapshot: {
        articleId: "article-retarget-race",
        title: "新标题",
        body: "新正文",
        fingerprint: "b".repeat(64),
      },
      payload: { clientId: "client-1" },
    });
    f.transitions.recordRegularAccepted(accepted(originalAttemptId));
    const superseded = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: next.attemptId,
    });
    assert.equal(superseded.publicationStatus, "failed");
    assert.equal(superseded.itemStatus, "failed");
    assert.equal(
      superseded.resolution.decision,
      "global_publication_superseded",
    );
    assert.deepEqual(
      f.groupTransitions
        .listRegularQueueGroupSnapshots({})
        .find((group) => group.queueGroupId === next.queueGroupId).remaining,
      [],
    );
    assert.equal(
      f.store
        .listArticleLifecycleFacts({ articleIds: ["article-retarget-race"] })
        .publications.some((record) => record.status === "published"),
      true,
    );
  } finally {
    f.close();
  }
});

test("a superseded confirmation token is stably stale and cannot bypass freezing", () => {
  const f = fixture();
  try {
    const prepared = f.prepare();
    const attemptId = prepared.claim.regularPublicationAttemptId;
    f.transitions.recordRegularUncertain({
      regularPublicationAttemptId: attemptId,
      observation: {
        status: "uncertain",
        code: "REMOTE_RESULT_UNKNOWN",
        observedAt: "2026-08-07T01:00:02.000Z",
      },
    });
    const stale = f.transitions.prepareRegularUncertainResolution({
      regularPublicationAttemptId: attemptId,
    });
    f.transitions.prepareRegularUncertainResolution({
      regularPublicationAttemptId: attemptId,
    });
    assert.throws(
      () =>
        f.transitions.confirmRegularAccepted({
          regularPublicationAttemptId: attemptId,
          confirmationToken: stale.confirmationToken,
          manualPositiveEvidence: {
            observedAt: "2026-08-07T01:00:00.000Z",
          },
        }),
      { code: "REGULAR_UNCERTAIN_RESOLUTION_TOKEN_STALE" },
    );
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: attemptId,
    });
    assert.equal(snapshot.publicationStatus, "uncertain");
    assert.equal(snapshot.itemStatus, "uncertain");
  } finally {
    f.close();
  }
});

test("accepted observation wins a prepared opposite manual resolution", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-accepted-race");
    const attemptId = prepared.claim.regularPublicationAttemptId;
    f.transitions.recordRegularUncertain({
      regularPublicationAttemptId: attemptId,
      observation: {
        status: "uncertain",
        code: "REMOTE_RESULT_UNKNOWN",
        observedAt: "2026-08-07T01:00:00.000Z",
      },
    });
    const token = f.transitions.prepareRegularUncertainResolution({
      regularPublicationAttemptId: attemptId,
    });
    f.transitions.recordRegularAccepted(accepted(attemptId));
    assert.throws(
      () =>
        f.transitions.confirmRegularNotAccepted({
          regularPublicationAttemptId: attemptId,
          confirmationToken: token.confirmationToken,
          manualNegativeEvidence: {
            reasonCode: "OPERATOR_VERIFIED_NOT_ACCEPTED",
            observedAt: "2026-08-07T01:00:00.000Z",
          },
        }),
      { code: "REGULAR_UNCERTAIN_RESOLUTION_OPPOSITE" },
    );
    assert.equal(
      f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: attemptId,
      }).publicationStatus,
      "published",
    );
  } finally {
    f.close();
  }
});

test("fault after the unique success primitive rolls the whole outcome back", () => {
  const f = fixture({
    internalRegularOutcomeTransitionFault(point) {
      if (point === "after-publication-success")
        throw new Error("forced fault");
    },
  });
  try {
    const prepared = f.prepare();
    assert.throws(
      () =>
        f.transitions.recordRegularAccepted(
          accepted(prepared.claim.regularPublicationAttemptId),
        ),
      /forced fault/,
    );
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    assert.equal(snapshot.publicationStatus, "remote_started");
    assert.equal(snapshot.itemStatus, "remote_started");
    assert.equal(snapshot.publicationEvidence, null);
  } finally {
    f.close();
  }
});

for (const outcome of ["article_rejected", "group_blocked", "uncertain"]) {
  test(`${outcome} rolls back every fact when its transaction faults`, () => {
    const f = fixture({
      internalRegularOutcomeTransitionFault(point) {
        if (point === `after-${outcome}`)
          throw new Error("forced outcome fault");
      },
    });
    try {
      const prepared = f.prepare(`article-fault-${outcome}`);
      const command = {
        regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
        observation: {
          status: outcome,
          code: "SYNTHETIC_OUTCOME",
          observedAt: "2026-08-07T01:00:00.000Z",
          ...(outcome === "group_blocked" ? { articleRecoverable: true } : {}),
        },
      };
      const method =
        outcome === "article_rejected"
          ? "recordRegularArticleRejected"
          : outcome === "group_blocked"
            ? "recordRegularGroupBlocked"
            : "recordRegularUncertain";
      assert.throws(
        () => f.transitions[method](command),
        /forced outcome fault/,
      );
      const snapshot = f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      });
      assert.equal(snapshot.publicationStatus, "remote_started");
      assert.equal(snapshot.itemStatus, "remote_started");
      assert.equal(snapshot.observation, null);
    } finally {
      f.close();
    }
  });
}

for (const decision of ["accepted", "not_accepted"]) {
  test(`manual ${decision} resolution rolls back atomically on a transaction fault`, () => {
    let armed = false;
    const faultPoint =
      decision === "accepted"
        ? "after-manual-publication-success"
        : "after-manual-not-accepted-close";
    const f = fixture({
      internalRegularOutcomeTransitionFault(point) {
        if (armed && point === faultPoint)
          throw new Error("forced resolution fault");
      },
    });
    try {
      const prepared = f.prepare(`article-manual-fault-${decision}`);
      const attemptId = prepared.claim.regularPublicationAttemptId;
      f.transitions.recordRegularUncertain({
        regularPublicationAttemptId: attemptId,
        observation: {
          status: "uncertain",
          code: "REMOTE_RESULT_UNKNOWN",
          observedAt: "2026-08-07T01:00:00.000Z",
        },
      });
      const token = f.transitions.prepareRegularUncertainResolution({
        regularPublicationAttemptId: attemptId,
      });
      armed = true;
      assert.throws(
        () =>
          decision === "accepted"
            ? f.transitions.confirmRegularAccepted({
                regularPublicationAttemptId: attemptId,
                confirmationToken: token.confirmationToken,
                manualPositiveEvidence: {
                  observedAt: "2026-08-07T01:00:00.000Z",
                },
              })
            : f.transitions.confirmRegularNotAccepted({
                regularPublicationAttemptId: attemptId,
                confirmationToken: token.confirmationToken,
                manualNegativeEvidence: {
                  reasonCode: "OPERATOR_VERIFIED_NOT_ACCEPTED",
                  observedAt: "2026-08-07T01:00:00.000Z",
                },
              }),
        /forced resolution fault/,
      );
      const snapshot = f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: attemptId,
      });
      assert.equal(snapshot.publicationStatus, "uncertain");
      assert.equal(snapshot.itemStatus, "uncertain");
      assert.equal(snapshot.resolution, null);
    } finally {
      f.close();
    }
  });
}

test("prepared attempts cannot be mislabeled uncertain before the submission boundary", () => {
  const f = fixture();
  try {
    const accountProfileId = f.store.listAccountProfiles()[0].accountProfileId;
    const target = {
      kind: "platform",
      platformId: "hepan",
      accountProfileId,
    };
    const admitted = f.queueTransitions.admitRegularQueueItem({
      clientId: "client-1",
      articleId: "article-prepared",
      batchId: "batch-prepared",
      itemId: "item-prepared",
      publicationId: "publication-prepared",
      attemptId: "attempt-prepared",
      target,
      publicationSnapshot: {
        articleId: "article-prepared",
        title: "标题",
        body: "正文",
        fingerprint: "a".repeat(64),
      },
      payload: { clientId: "client-1" },
    });
    f.groupTransitions.setRegularQueueGroupRunIntent({
      queueGroupId: admitted.queueGroupId,
      running: true,
    });
    const claim = f.groupTransitions.claimRegularQueueGroupHead({
      queueGroupId: admitted.queueGroupId,
      claimToken: "claim-prepared",
    });
    assert.throws(
      () =>
        f.transitions.recordRegularUncertain({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          observation: { status: "uncertain", code: "TRANSPORT_FAILED" },
        }),
      { code: "REGULAR_OUTCOME_SUBMISSION_BOUNDARY_REQUIRED" },
    );
    assert.equal(
      f.groupTransitions.listRegularQueueGroupSnapshots({})[0].current.phase,
      "prepared",
    );
  } finally {
    f.close();
  }
});

test("explicit pre-submit article rejection closes, while recoverable group block requeues the claim", () => {
  for (const status of ["article_rejected", "group_blocked"]) {
    const f = fixture();
    try {
      const item = f.queueTransitions.admitRegularQueueItem({
        clientId: "client-1",
        articleId: `article-pre-${status}-fresh`,
        batchId: `batch-pre-${status}`,
        itemId: `item-pre-${status}`,
        publicationId: `publication-pre-${status}`,
        attemptId: `attempt-pre-${status}`,
        target: {
          kind: "platform",
          platformId: "hepan",
          accountProfileId: f.store.listAccountProfiles()[0].accountProfileId,
        },
        publicationSnapshot: {
          articleId: `article-pre-${status}-fresh`,
          title: "标题",
          body: "正文",
          fingerprint: "a".repeat(64),
        },
        payload: { clientId: "client-1" },
      });
      f.groupTransitions.setRegularQueueGroupRunIntent({
        queueGroupId: item.queueGroupId,
        running: true,
      });
      const claim = f.groupTransitions.claimRegularQueueGroupHead({
        queueGroupId: item.queueGroupId,
        claimToken: `claim-pre-${status}`,
      });
      const command = {
        regularPublicationAttemptId: claim.regularPublicationAttemptId,
        observation: {
          status,
          code:
            status === "group_blocked" ? "LOGIN_REQUIRED" : "REMOTE_REJECTED",
          ...(status === "group_blocked" ? { articleRecoverable: true } : {}),
        },
      };
      const result =
        status === "group_blocked"
          ? f.transitions.recordRegularGroupBlocked(command)
          : f.transitions.recordRegularArticleRejected(command);
      assert.equal(result.status, status);
      const snapshot = f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: claim.regularPublicationAttemptId,
      });
      assert.equal(snapshot.publicationEvidence, null);
      if (status === "group_blocked") {
        assert.equal(snapshot.publicationStatus, "queued");
        assert.equal(snapshot.attemptStatus, "queued");
        assert.equal(snapshot.itemStatus, "queued");
        assert.equal(snapshot.activeTargetState, "queued");
        assert.equal(snapshot.intentState, "resolved");
        assert.equal(snapshot.observation, null);
        assert.equal(
          snapshot.queueGroupId,
          item.queueGroupId,
        );
        assert.equal(
          f.groupTransitions.listRegularQueueGroupSnapshots({})[0].pauseIntent,
          "system",
        );
        assert.deepEqual(
          f.groupTransitions
            .listRegularQueueGroupSnapshots({})
            .find((group) => group.queueGroupId === item.queueGroupId)
            .remaining.map((entry) => entry.articleId),
          [`article-pre-${status}-fresh`],
        );
        const lifecycle = f.store.listArticleLifecycleFacts({
          articleIds: [`article-pre-${status}-fresh`],
        });
        assert.equal(lifecycle.publications[0].status, "queued");
        assert.equal(lifecycle.submissionItems[0].status, "queued");
        assert.equal(lifecycle.attentionItems.length, 0);
        f.groupTransitions.setRegularQueueGroupRunIntent({
          queueGroupId: item.queueGroupId,
          running: true,
        });
        const retryClaim = f.groupTransitions.claimRegularQueueGroupHead({
          queueGroupId: item.queueGroupId,
          claimToken: `claim-retry-${status}`,
        });
        assert.equal(
          retryClaim.regularPublicationAttemptId,
          claim.regularPublicationAttemptId,
        );
      } else {
        assert.equal(snapshot.publicationStatus, "failed");
        assert.equal(snapshot.itemStatus, "failed");
      }
    } finally {
      f.close();
    }
  }
});

test("orchestrator distinguishes transport failure before and after submission-start", async () => {
  const before = fixture();
  try {
    const admitted = admitForOrchestrator(before, "article-before-boundary");
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: before.groupTransitions,
      platformSubmissionExecutor: {
        async preparePlatformSubmission() {
          const error = new Error("transport before submit");
          error.code = "REGULAR_PREPARATION_TRANSPORT_FAILED";
          throw error;
        },
      },
      regularPlatformOutcomeService: createRegularPlatformOutcomeService({
        regularOutcomeTransitions: before.transitions,
        clock: () => new Date("2026-08-07T01:00:00.000Z"),
      }),
    });
    const result = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });
    assert.equal(result.observation.status, "group_blocked");
    assert.equal(result.observation.errorCode, "REGULAR_PREPARATION_FAILED");
    assert.equal(result.observation.articleRecoverable, true);
    const group = before.groupTransitions.listRegularQueueGroupSnapshots({})[0];
    assert.equal(group.pauseIntent, "system");
    assert.equal(group.current, null);
    assert.equal(group.remaining.length, 1);
    assert.equal(group.actions.reasonCode, "REGULAR_PREPARATION_FAILED");
    const snapshot = before.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: admitted.attemptId,
    });
    assert.equal(snapshot.publicationStatus, "queued");
    assert.equal(snapshot.itemStatus, "queued");
    assert.equal(snapshot.activeTargetState, "queued");
    assert.equal(
      snapshot.observation,
      null,
    );
  } finally {
    before.close();
  }

  const after = fixture();
  try {
    const admitted = admitForOrchestrator(after, "article-after-boundary");
    let submits = 0;
    const invalidationReasons = [];
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: after.groupTransitions,
      onDataInvalidated: (reason) => invalidationReasons.push(reason),
      platformSubmissionExecutor: {
        async preparePlatformSubmission(claim) {
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1:
              domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
            async submitPreparedPublication() {
              submits += 1;
              throw new Error("transport after submit");
            },
          });
        },
      },
      regularPlatformOutcomeService: createRegularPlatformOutcomeService({
        regularOutcomeTransitions: after.transitions,
        clock: () => new Date("2026-08-07T01:00:00.000Z"),
      }),
    });
    const result = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });
    assert.equal(result.observation.status, "uncertain");
    assert.equal(submits, 1);
    assert.deepEqual(invalidationReasons, [
      "REGULAR_QUEUE_GROUP_RUN_INTENT_CHANGED",
      "PUBLICATION_RECONCILED",
    ]);
    const snapshot = after.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: admitted.attemptId,
    });
    assert.equal(snapshot.publicationStatus, "uncertain");
    assert.equal(snapshot.pauseIntent, "system");
  } finally {
    after.close();
  }
});

test("outcome commit failure becomes uncertain in the current process without replay", async () => {
  let failAcceptedOnce = true;
  const clockState = { value: "2026-08-07T01:00:00.000Z" };
  const f = fixture({
    clock: () => new Date(clockState.value),
    internalRegularOutcomeTransitionFault(point) {
      if (point === "after-publication-success" && failAcceptedOnce) {
        failAcceptedOnce = false;
        const error = new Error("forced accepted outcome transaction failure");
        error.code = "REGULAR_OUTCOME_TRANSACTION_FAILED";
        throw error;
      }
    },
  });
  try {
    const admitted = admitForOrchestrator(f, "article-current-process-recovery");
    let submissions = 0;
    const outcomeService = createRegularPlatformOutcomeService({
      regularOutcomeTransitions: f.transitions,
      clock: () => new Date("2026-08-07T01:00:00.000Z"),
    });
    const composition = createRegularQueueGroupComposition({
      regularQueueGroupTransitions: f.groupTransitions,
      regularPlatformOutcomeService: outcomeService,
      platformSubmissionExecutor: {
        async preparePlatformSubmission(claim) {
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1:
              domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
            async submitPreparedPublication() {
              submissions += 1;
              return { status: "accepted", remoteId: "accepted-once" };
            },
          });
        },
      },
    });

    const result = await composition.orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });
    assert.equal(result.observation.status, "uncertain");
    assert.equal(
      result.observation.errorCode,
      "REGULAR_OUTCOME_COMMIT_FAILED",
    );
    assert.equal(submissions, 1);

    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: admitted.attemptId,
    });
    assert.equal(snapshot.publicationStatus, "uncertain");
    assert.equal(snapshot.attemptStatus, "uncertain");
    assert.equal(snapshot.itemStatus, "uncertain");
    assert.equal(snapshot.activeTargetState, "uncertain");
    assert.equal(snapshot.intentState, "manual_check");
    assert.equal(snapshot.pauseIntent, "system");
    assert.equal(snapshot.observation.code, "REGULAR_ORPHANED_REMOTE_ATTEMPT");
    assert.equal(
      createArticleAttentionQuery({ operationalStore: f.store }).list({
        clientId: "client-1",
      }).items.length,
      1,
    );

    clockState.value = "2026-08-07T01:00:01.000Z";
    const repeated = outcomeService.markOrphanedRegularAttemptUncertain({
      regularPublicationAttemptId: admitted.attemptId,
    });
    assert.equal(repeated.status, "uncertain");
    assert.equal(repeated.idempotent, true);
    assert.equal(submissions, 1);

    const lateAccepted = f.transitions.recordRegularAccepted(
      accepted(admitted.attemptId),
    );
    assert.equal(lateAccepted.status, "published");
    assert.equal(
      f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: admitted.attemptId,
      }).publicationStatus,
      "published",
    );
    assert.equal(
      createArticleAttentionQuery({ operationalStore: f.store }).list({
        clientId: "client-1",
      }).items.length,
      0,
    );
  } finally {
    f.close();
  }
});

test("a persistent immediate recovery failure preserves the original error for startup recovery", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-outcome-27-b-"));
  const f = fixture({
    workspaceRoot: root,
    removeWorkspaceRoot: false,
    internalRegularOutcomeTransitionFault(point) {
      if (["after-publication-success", "after-uncertain"].includes(point)) {
        const error = new Error(`forced ${point} failure`);
        error.code =
          point === "after-publication-success"
            ? "REGULAR_OUTCOME_TRANSACTION_FAILED"
            : "REGULAR_OUTCOME_RECOVERY_TRANSACTION_FAILED";
        throw error;
      }
    },
  });
  let admitted;
  let submissions = 0;
  try {
    admitted = admitForOrchestrator(f, "article-startup-fallback");
    const outcomeService = createRegularPlatformOutcomeService({
      regularOutcomeTransitions: f.transitions,
      clock: () => new Date("2026-08-07T01:00:00.000Z"),
    });
    const composition = createRegularQueueGroupComposition({
      regularQueueGroupTransitions: f.groupTransitions,
      regularPlatformOutcomeService: outcomeService,
      platformSubmissionExecutor: {
        async preparePlatformSubmission(claim) {
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1:
              domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
            async submitPreparedPublication() {
              submissions += 1;
              return { status: "accepted", remoteId: "accepted-once" };
            },
          });
        },
      },
    });

    await assert.rejects(
      () =>
        composition.orchestrator.startGroup({
          queueGroupId: admitted.queueGroupId,
        }),
      { code: "REGULAR_OUTCOME_TRANSACTION_FAILED" },
    );
    assert.equal(submissions, 1);
    assert.equal(
      f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: admitted.attemptId,
      }).publicationStatus,
      "remote_started",
    );
  } finally {
    f.close();
  }

  const reopened = fixture({ workspaceRoot: root, removeWorkspaceRoot: false });
  try {
    const composition = createRegularQueueGroupComposition({
      regularQueueGroupTransitions: reopened.groupTransitions,
      regularPlatformOutcomeService: createRegularPlatformOutcomeService({
        regularOutcomeTransitions: reopened.transitions,
        clock: () => new Date("2026-08-07T01:00:00.000Z"),
      }),
      platformSubmissionExecutor: {
        async preparePlatformSubmission() {
          throw new Error("must not replay during startup recovery");
        },
      },
    });
    assert.equal(composition.orphanedOutcomes.length, 1);
    assert.equal(
      reopened.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: admitted.attemptId,
      }).publicationStatus,
      "uncertain",
    );
  } finally {
    reopened.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("article rejection continues the same FIFO group while accepted closes the next item", async () => {
  const f = fixture();
  try {
    const first = admitForOrchestrator(f, "article-rejected-first");
    const second = admitForOrchestrator(f, "article-accepted-second");
    assert.equal(first.queueGroupId, second.queueGroupId);
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: f.groupTransitions,
      platformSubmissionExecutor: {
        async preparePlatformSubmission(claim) {
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1:
              domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
            async submitPreparedPublication() {
              return claim.articleIdentityV1.articleId ===
                "article-rejected-first"
                ? {
                    status: "article_rejected",
                    errorCode: "CONTENT_REJECTED",
                  }
                : {
                    status: "accepted",
                    observedAt: "2026-08-07T01:00:00.000Z",
                    remoteId: "hepan-article-second",
                  };
            },
          });
        },
      },
      regularPlatformOutcomeService: createRegularPlatformOutcomeService({
        regularOutcomeTransitions: f.transitions,
        clock: () => new Date("2026-08-07T01:00:00.000Z"),
      }),
    });
    const result = await orchestrator.startGroup({
      queueGroupId: first.queueGroupId,
    });
    assert.deepEqual(
      result.processed.map((entry) => entry.observation.status),
      ["article_rejected", "accepted"],
    );
    assert.equal(
      f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: first.attemptId,
      }).publicationStatus,
      "failed",
    );
    assert.equal(
      f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: second.attemptId,
      }).publicationStatus,
      "published",
    );
    assert.equal(
      f.transitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: second.attemptId,
      }).publicationEvidence.firstPublishedAtSource,
      "first_positive_observation_time",
    );
    const group = f.groupTransitions.listRegularQueueGroupSnapshots({})[0];
    assert.equal(group.pauseIntent, "none");
    assert.equal(group.current, null);
    assert.deepEqual(group.remaining, []);
  } finally {
    f.close();
  }
});

test("recoverable group-blocked after submission-start releases the claim without failing the article", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-group-blocked");
    f.transitions.recordRegularGroupBlocked({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      observation: {
        status: "group_blocked",
        code: "LOGIN_REQUIRED",
        observedAt: "2026-08-07T01:00:00.000Z",
        articleRecoverable: true,
      },
    });
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    assert.equal(snapshot.publicationStatus, "queued");
    assert.equal(snapshot.attemptStatus, "queued");
    assert.equal(snapshot.itemStatus, "queued");
    assert.equal(snapshot.activeTargetState, "queued");
    assert.equal(snapshot.intentState, "resolved");
    assert.equal(snapshot.observation, null);
    assert.equal(
      f.groupTransitions.listRegularQueueGroupSnapshots({})[0].pauseIntent,
      "system",
    );
    assert.equal(
      f.groupTransitions.listRegularQueueGroupSnapshots({})[0].actions
        .reasonCode,
      "LOGIN_REQUIRED",
    );
    assert.equal(
      f.groupTransitions.listRegularQueueGroupSnapshots({})[0].remaining[0]
        .regularPublicationAttemptId,
      prepared.claim.regularPublicationAttemptId,
    );
  } finally {
    f.close();
  }
});

test("recoverable group-blocked releases the queue item and allows the same attempt to retry", async () => {
  const f = fixture();
  try {
    const admitted = admitForOrchestrator(f, "article-group-blocked-retry");
    let blocked = true;
    let preparations = 0;
    let submissions = 0;
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: f.groupTransitions,
      platformSubmissionExecutor: {
        async preparePlatformSubmission(claim) {
          preparations += 1;
          if (blocked)
            return {
              status: "group_blocked",
              errorCode: "LOGIN_REQUIRED",
              articleRecoverable: true,
            };
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1:
              domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
            async submitPreparedPublication() {
              submissions += 1;
              return {
                status: "accepted",
                remoteId: "hepan-article-retried",
              };
            },
          });
        },
      },
      regularPlatformOutcomeService: createRegularPlatformOutcomeService({
        regularOutcomeTransitions: f.transitions,
        clock: () => new Date("2026-08-07T01:00:00.000Z"),
      }),
    });

    const blockedResult = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });
    assert.equal(blockedResult.observation.status, "group_blocked");
    assert.equal(preparations, 1);
    assert.equal(submissions, 0);
    let snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: admitted.attemptId,
    });
    assert.equal(snapshot.publicationStatus, "queued");
    assert.equal(snapshot.itemStatus, "queued");
    assert.equal(snapshot.activeTargetState, "queued");
    assert.equal(snapshot.pauseIntent, "system");
    assert.equal(snapshot.observation, null);
    assert.equal(
      f.groupTransitions.listRegularQueueGroupSnapshots({})[0].actions
        .reasonCode,
      "LOGIN_REQUIRED",
    );
    assert.equal(
      f.store.listArticleLifecycleFacts({
        articleIds: ["article-group-blocked-retry"],
      }).attentionItems.length,
      0,
    );

    blocked = false;
    const retriedResult = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });
    assert.equal(retriedResult.observation.status, "accepted");
    assert.equal(preparations, 2);
    assert.equal(submissions, 1);
    snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: admitted.attemptId,
    });
    assert.equal(snapshot.publicationStatus, "published");
    assert.equal(snapshot.itemStatus, "completed");
    assert.equal(snapshot.activeTargetState, null);
    assert.equal(snapshot.queueGroupId, null);
  } finally {
    f.close();
  }
});

test("missing client publication profile pauses the group and releases the item before remote submission", async () => {
  const f = fixture();
  try {
    const admitted = admitForOrchestrator(
      f,
      "article-client-publication-profile-incomplete",
    );
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: f.groupTransitions,
      platformSubmissionExecutor: {
        async preparePlatformSubmission() {
          const error = new Error("client publication profile incomplete");
          error.code = "REGULAR_CLIENT_PROFILE_INCOMPLETE";
          throw error;
        },
      },
      regularPlatformOutcomeService: createRegularPlatformOutcomeService({
        regularOutcomeTransitions: f.transitions,
        clock: () => new Date("2026-08-07T01:00:00.000Z"),
      }),
    });

    const result = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });

    assert.equal(result.observation.status, "group_blocked");
    assert.equal(
      result.observation.errorCode,
      "REGULAR_CLIENT_PROFILE_INCOMPLETE",
    );
    const outcome = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: admitted.attemptId,
    });
    assert.equal(outcome.publicationStatus, "queued");
    assert.equal(outcome.itemStatus, "queued");
    assert.equal(outcome.activeTargetState, "queued");
    assert.equal(outcome.pauseIntent, "system");
    assert.equal(outcome.observation, null);
    const group = f.groupTransitions.listRegularQueueGroupSnapshots({})[0];
    assert.equal(group.current, null);
    assert.equal(group.remaining.length, 1);
    assert.equal(
      group.remaining[0].regularPublicationAttemptId,
      admitted.attemptId,
    );
    assert.equal(
      group.actions.reasonCode,
      "REGULAR_CLIENT_PROFILE_INCOMPLETE",
    );
  } finally {
    f.close();
  }
});

test("non-recoverable group-blocked remains frozen for manual resolution", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-group-blocked-frozen");
    const attemptId = prepared.claim.regularPublicationAttemptId;
    f.transitions.recordRegularGroupBlocked({
      regularPublicationAttemptId: attemptId,
      observation: {
        status: "group_blocked",
        code: "ACCOUNT_STATE_UNKNOWN",
        observedAt: "2026-08-07T01:00:00.000Z",
        articleRecoverable: false,
      },
    });
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: attemptId,
    });
    assert.equal(snapshot.publicationStatus, "uncertain");
    assert.equal(snapshot.attemptStatus, "uncertain");
    assert.equal(snapshot.itemStatus, "uncertain");
    assert.equal(snapshot.activeTargetState, "uncertain");
    assert.equal(snapshot.intentState, "manual_check");
    assert.equal(snapshot.pauseIntent, "system");
    assert.equal(snapshot.observation.articleRecoverable, false);
    assert.equal(
      f.store.listArticleLifecycleFacts({
        articleIds: ["article-group-blocked-frozen"],
      }).attentionItems[0].status,
      "uncertain",
    );
    assert.deepEqual(
      f.transitions.prepareRegularUncertainResolution({
        regularPublicationAttemptId: attemptId,
      }).actions,
      ["confirm_accepted", "confirm_not_accepted"],
    );
  } finally {
    f.close();
  }
});

test("legacy publication success entry point is closed without changing canonical evidence", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-closed-success-writer");
    const attemptId = prepared.claim.regularPublicationAttemptId;
    const legacySuccess = () =>
      f.store.commitRemoteOutcome({
        attemptId,
        outcome: {
          status: "published",
          evidence: {
            articleId: "article-closed-success-writer",
            attemptId,
            targetKey: prepared.claim.targetKey,
            accountProfileId: prepared.claim.accountProfileId,
            remoteId: "legacy-remote-id",
            remoteUrl: "https://example.test/legacy",
          },
        },
      });
    assert.throws(legacySuccess, { code: "PUBLICATION_SUCCESS_WRITER_CLOSED" });
    const beforeAccepted = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: attemptId,
    });
    assert.equal(beforeAccepted.publicationStatus, "remote_started");
    assert.equal(beforeAccepted.publicationEvidence, null);
    const acceptedResult = f.transitions.recordRegularAccepted(
      accepted(attemptId),
    );
    assert.throws(legacySuccess, {
      code: "PUBLICATION_SUCCESS_WRITER_CLOSED",
    });
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: attemptId,
    });
    assert.equal(snapshot.publicationStatus, "published");
    assert.deepEqual(
      snapshot.publicationEvidence,
      acceptedResult.publicationEvidence,
    );
    assert.equal(
      snapshot.publicationEvidence.safeEvidenceRefs.filter(
        (evidence) => evidence.kind === "REGULAR_ACCEPTED_OBSERVATION",
      ).length,
      1,
    );
  } finally {
    f.close();
  }
});

test("startup marks only orphaned remote-started attempts uncertain without replay", () => {
  const f = fixture();
  try {
    const prepared = f.prepare("article-orphaned");
    let submissions = 0;
    const outcomeService = createRegularPlatformOutcomeService({
      regularOutcomeTransitions: f.transitions,
      clock: () => new Date("2026-08-07T01:00:00.000Z"),
    });
    const composition = createRegularQueueGroupComposition({
      regularQueueGroupTransitions: f.groupTransitions,
      regularPlatformOutcomeService: outcomeService,
      platformSubmissionExecutor: {
        async preparePlatformSubmission() {
          submissions += 1;
          throw new Error("must not replay");
        },
      },
    });
    assert.equal(composition.orphanedOutcomes.length, 1);
    assert.equal(submissions, 0);
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    });
    assert.equal(snapshot.publicationStatus, "uncertain");
    assert.equal(snapshot.observation.code, "REGULAR_ORPHANED_REMOTE_ATTEMPT");
  } finally {
    f.close();
  }
});
