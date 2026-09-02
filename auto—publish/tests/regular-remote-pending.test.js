"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const domain = require("../src/domain");
const {
  deriveArticleLifecycle,
} = require("../src/content/article-lifecycle-projection");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createRegularPlatformOutcomeService,
} = require("../desktop/services/regular-platform-outcome-service");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-pending-"));
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    clock: () => new Date("2026-09-02T01:00:00.000Z"),
    transitionPorts,
  });
  const profile = store.createAccountProfile({
    platformId: "hepan",
    displayName: "蓝色河畔账号",
  });
  const target = {
    kind: "platform",
    platformId: "hepan",
    accountProfileId: profile.accountProfileId,
  };
  const admitted =
    transitionPorts.regularQueueTransitions.admitRegularQueueItem({
      clientId: "client-1",
      articleId: "article-pending",
      batchId: "batch-pending",
      itemId: "item-pending",
      publicationId: "publication-pending",
      attemptId: "attempt-pending",
      target,
      publicationSnapshot: {
        articleId: "article-pending",
        title: "标题",
        body: "正文",
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
      claimToken: "claim-pending",
      leaseMs: 30000,
    });
  transitionPorts.regularQueueGroupTransitions.beginRegularRemoteSubmission({
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    claimToken: claim.claimToken,
    preparedSubmissionEvidenceV1:
      domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
  });
  const service = createRegularPlatformOutcomeService({
    regularOutcomeTransitions: transitionPorts.regularOutcomeTransitions,
    clock: () => new Date("2026-09-02T01:00:01.000Z"),
  });
  return {
    root,
    store,
    claim,
    service,
    transitions: transitionPorts.regularOutcomeTransitions,
  };
}

test("remote pending stays reviewable without becoming user attention", () => {
  const f = fixture();
  try {
    const result = f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: {
        status: "remote_pending",
        errorCode: "HEPAN_REMOTE_PENDING",
        remoteId: "98765",
      },
    });
    assert.equal(result.status, "remote_pending");

    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
    });
    // Internal storage stays on the existing safe state; semantic projection is
    // remote_pending and does not resurrect the retired submitted state.
    assert.equal(snapshot.publicationStatus, "uncertain");
    assert.equal(snapshot.attemptStatus, "uncertain");
    assert.equal(snapshot.itemStatus, "completed");
    assert.equal(snapshot.activeTargetState, "uncertain");
    assert.equal(snapshot.intentState, "outcome_pending");
    assert.equal(snapshot.pauseIntent, null);
    assert.equal(snapshot.publicationEvidence, null);
    assert.equal(snapshot.observation.remoteId, "98765");

    assert.deepEqual(f.service.listRegularRemotePending(), [
      {
        regularPublicationAttemptId:
          f.claim.regularPublicationAttemptId,
        platformId: "hepan",
        remoteId: "98765",
      },
    ]);

    const facts = f.store.listArticleLifecycleFacts({
      articleIds: ["article-pending"],
    });
    assert.equal(facts.publications[0].status, "remote_pending");
    assert.equal(facts.publications[0].remoteId, "98765");
    assert.equal(facts.submissionItems[0].outcomeStatus, "remote_pending");
    assert.deepEqual(f.store.listPublicationAttention(), []);

    const lifecycle = deriveArticleLifecycle({
      article: {
        id: "article-pending",
        clientId: "client-1",
        title: "标题",
        content: "正文",
      },
      ...facts,
    });
    assert.equal(lifecycle.stage, "in_submission");
    assert.equal(lifecycle.publicationSummary.status, "remote_pending");
    assert.equal(lifecycle.publicationSummary.label, "审核中");
    assert.equal(lifecycle.publicationSummary.uncertain, false);
    assert.equal(lifecycle.attentionCount, 0);
    assert.equal(
      lifecycle.reasonCodes.includes("PUBLICATION_UNCERTAIN"),
      false,
    );
    assert.equal(
      lifecycle.reasonCodes.includes("SUBMISSION_STATUS_UNKNOWN"),
      false,
    );
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test("a later published observation promotes remote pending to published", () => {
  const f = fixture();
  try {
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: {
        status: "remote_pending",
        errorCode: "HEPAN_REMOTE_PENDING",
        remoteId: "98765",
      },
    });
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: {
        status: "accepted",
        remoteId: "98765",
        remoteUrl:
          "https://www.hepan.com/portal.php?mod=view&aid=98765",
      },
    });
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
    });
    assert.equal(snapshot.publicationStatus, "published");
    assert.equal(snapshot.attemptStatus, "published");
    assert.equal(snapshot.activeTargetState, null);
    assert.equal(snapshot.publicationEvidence.remoteId, "98765");
    assert.deepEqual(f.service.listRegularRemotePending(), []);
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test("a later rejection closes remote pending without pausing the queue", () => {
  const f = fixture();
  try {
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: {
        status: "remote_pending",
        errorCode: "HEPAN_REMOTE_PENDING",
        remoteId: "98765",
      },
    });
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: {
        status: "article_rejected",
        errorCode: "HEPAN_CONTENT_REJECTED",
      },
    });
    const snapshot = f.transitions.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
    });
    assert.equal(snapshot.publicationStatus, "failed");
    assert.equal(snapshot.attemptStatus, "failed");
    assert.equal(snapshot.activeTargetState, null);
    assert.equal(snapshot.intentState, "resolved");
    assert.notEqual(snapshot.pauseIntent, "system");
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
