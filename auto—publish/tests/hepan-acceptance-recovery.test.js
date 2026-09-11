"use strict";
const { admitFixtureItem } = require("./fixtures/regular-queue-admission");


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
    admitFixtureItem(transitionPorts.regularQueueTransitions, {
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

test("historical API acceptance publishes on reopen without polling or resubmitting", () => {
  const { DatabaseSync } = require("node:sqlite");
  const f = fixture();
  const filename = f.store.databasePath;
  const attemptId = f.claim.regularPublicationAttemptId;
  const receipt = {
    status: "remote_pending",
    code: "HEPAN_REMOTE_PENDING",
    remoteId: "98765",
    observedAt: "2026-09-02T01:00:01.000Z",
    fingerprint: "historical-receipt",
  };
  let reopened;
  try {
    f.store.close();
    const db = new DatabaseSync(filename);
    try {
      const payload = JSON.parse(
        db
          .prepare(
            "SELECT payload_json FROM recovery_intents WHERE attempt_id=?",
          )
          .get(attemptId).payload_json,
      );
      payload.detail.observation = receipt;
      db.prepare(
        "UPDATE recovery_intents SET state='outcome_pending',payload_json=? WHERE attempt_id=?",
      ).run(JSON.stringify(payload), attemptId);
      db.prepare(
        "UPDATE publication_attempts SET status='uncertain' WHERE attempt_id=?",
      ).run(attemptId);
      db.prepare("UPDATE publication_records SET status='uncertain'").run();
      db.prepare(
        "UPDATE article_active_targets SET state='uncertain' WHERE attempt_id=?",
      ).run(attemptId);
      db.prepare(
        "UPDATE submission_items SET status='completed',claim_token=NULL,claim_until=NULL",
      ).run();
      db.prepare("DELETE FROM submission_queue_items").run();
    } finally {
      db.close();
    }
    assert.throws(
      () =>
        createOperationalStore({
          workspaceRoot: f.root,
          internalRegularOutcomeTransitionFault(point) {
            if (point === "after-publication-success")
              throw new Error("Synthetic recovery interruption");
          },
        }),
      /Synthetic recovery interruption/,
    );
    const interrupted = new DatabaseSync(filename, { readOnly: true });
    try {
      assert.equal(
        interrupted.prepare("SELECT status FROM publication_records").get()
          .status,
        "uncertain",
      );
      assert.equal(
        interrupted.prepare("SELECT state FROM recovery_intents").get().state,
        "outcome_pending",
      );
    } finally {
      interrupted.close();
    }
    for (let i = 0; i < 2; i++) {
      const transitionPorts = {};
      reopened = createOperationalStore({
        workspaceRoot: f.root,
        transitionPorts,
      });
      const snapshot =
        transitionPorts.regularOutcomeTransitions.getRegularOutcomeSnapshot({
          regularPublicationAttemptId: attemptId,
        });
      assert.equal(snapshot.publicationStatus, "published");
      assert.equal(snapshot.intentState, "resolved");
      assert.equal(snapshot.itemStatus, "completed");
      assert.equal(snapshot.publicationEvidence.remoteId, "98765");
      assert.equal(
        snapshot.publicationEvidence.firstPublishedAt,
        receipt.observedAt,
      );
      const facts = reopened.listArticleLifecycleFacts({
        articleIds: ["article-pending"],
      });
      const lifecycle = deriveArticleLifecycle({
        article: {
          id: "article-pending",
          clientId: "client-1",
          title: "标题",
          content: "正文",
        },
        ...facts,
      });
      assert.equal(lifecycle.stage, "published");
      assert.deepEqual(reopened.listPublicationAttention(), []);
      reopened.close();
      reopened = null;
    }
    const dbRead = new DatabaseSync(filename, { readOnly: true });
    try {
      const payload = JSON.parse(
        dbRead
          .prepare(
            "SELECT payload_json FROM recovery_intents WHERE attempt_id=?",
          )
          .get(attemptId).payload_json,
      );
      assert.deepEqual(payload.detail.historicalAcceptanceObservation, receipt);
    } finally {
      dbRead.close();
    }
  } finally {
    if (reopened) reopened.close();
    f.store.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
