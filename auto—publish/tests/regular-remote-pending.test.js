"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const domain = require("../src/domain");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createRegularPlatformOutcomeService } = require("../desktop/services/regular-platform-outcome-service");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-pending-"));
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    clock: () => new Date("2026-09-02T01:00:00.000Z"),
    transitionPorts,
  });
  const profile = store.createAccountProfile({ platformId: "hepan", displayName: "蓝色河畔账号" });
  const target = { kind: "platform", platformId: "hepan", accountProfileId: profile.accountProfileId };
  const admitted = transitionPorts.regularQueueTransitions.admitRegularQueueItem({
    clientId: "client-1",
    articleId: "article-pending",
    batchId: "batch-pending",
    itemId: "item-pending",
    publicationId: "publication-pending",
    attemptId: "attempt-pending",
    target,
    publicationSnapshot: { articleId: "article-pending", title: "标题", body: "正文", fingerprint: "a".repeat(64) },
    payload: { clientId: "client-1" },
  });
  transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({ queueGroupId: admitted.queueGroupId, running: true });
  const claim = transitionPorts.regularQueueGroupTransitions.claimRegularQueueGroupHead({
    queueGroupId: admitted.queueGroupId,
    claimToken: "claim-pending",
    leaseMs: 30000,
  });
  transitionPorts.regularQueueGroupTransitions.beginRegularRemoteSubmission({
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    claimToken: claim.claimToken,
    preparedSubmissionEvidenceV1: domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
  });
  const service = createRegularPlatformOutcomeService({
    regularOutcomeTransitions: transitionPorts.regularOutcomeTransitions,
    clock: () => new Date("2026-09-02T01:00:01.000Z"),
  });
  return { root, store, claim, service, transitions: transitionPorts.regularOutcomeTransitions };
}

test("remote pending closes the queue item as submitted without claiming publication success", () => {
  const f = fixture();
  try {
    const result = f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: { status: "remote_pending", errorCode: "HEPAN_REMOTE_PENDING", remoteId: "98765" },
    });
    assert.equal(result.status, "remote_pending");
    const snapshot = f.transitions.getRegularOutcomeSnapshot({ regularPublicationAttemptId: f.claim.regularPublicationAttemptId });
    assert.equal(snapshot.publicationStatus, "submitted");
    assert.equal(snapshot.attemptStatus, "submitted");
    assert.equal(snapshot.itemStatus, "completed");
    assert.equal(snapshot.activeTargetState, "submitted");
    assert.equal(snapshot.intentState, "outcome_pending");
    assert.equal(snapshot.publicationEvidence, null);
    assert.equal(snapshot.observation.remoteId, "98765");
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test("a later published observation promotes submitted to published", () => {
  const f = fixture();
  try {
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: { status: "remote_pending", errorCode: "HEPAN_REMOTE_PENDING", remoteId: "98765" },
    });
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: { status: "accepted", remoteId: "98765", remoteUrl: "https://www.hepan.com/portal.php?mod=view&aid=98765" },
    });
    const snapshot = f.transitions.getRegularOutcomeSnapshot({ regularPublicationAttemptId: f.claim.regularPublicationAttemptId });
    assert.equal(snapshot.publicationStatus, "published");
    assert.equal(snapshot.attemptStatus, "published");
    assert.equal(snapshot.activeTargetState, null);
    assert.equal(snapshot.publicationEvidence.remoteId, "98765");
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test("a later rejection can close a submitted review without manual uncertainty", () => {
  const f = fixture();
  try {
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: { status: "remote_pending", errorCode: "HEPAN_REMOTE_PENDING", remoteId: "98765" },
    });
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: f.claim.regularPublicationAttemptId,
      outcome: { status: "article_rejected", errorCode: "HEPAN_CONTENT_REJECTED" },
    });
    const snapshot = f.transitions.getRegularOutcomeSnapshot({ regularPublicationAttemptId: f.claim.regularPublicationAttemptId });
    assert.equal(snapshot.publicationStatus, "failed");
    assert.equal(snapshot.attemptStatus, "failed");
    assert.equal(snapshot.activeTargetState, null);
    assert.equal(snapshot.intentState, "resolved");
  } finally {
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
