"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function target(profile) {
  return {
    kind: "platform",
    platformId: "toutiao",
    accountProfileId: profile.accountProfileId,
  };
}
function submittedOutcome(profile, attemptId, articleId) {
  return {
    status: "submitted",
    evidence: {
      articleId,
      attemptId,
      targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
      accountProfileId: profile.accountProfileId,
      remoteId: `remote-${attemptId}`,
      remoteUrl: `https://example.test/${attemptId}`,
    },
  };
}
function reserveAndSubmit(store, profile, value) {
  store.reservePublicationTarget({
    articleId: value.articleId,
    publicationId: value.publicationId,
    attemptId: value.attemptId,
    target: target(profile),
  });
  store.commitRemoteOutcome({
    attemptId: value.attemptId,
    outcome: submittedOutcome(profile, value.attemptId, value.articleId),
    batchItemId: value.batchItemId,
    postProcessingPayload: value.payload,
  });
}

test("generic submitted outcomes do not create retired publication-success archive jobs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-archive-"));
  const input = path.join(root, "input");
  const published = path.join(root, "published");
  fs.mkdirSync(path.join(input, "toutiao"), { recursive: true });
  fs.writeFileSync(path.join(input, "toutiao", "fixture.md"), "fixture");
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const first = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "first",
    });
    const second = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "second",
    });
    const payload = { sourcePlatformId: "toutiao", filename: "fixture.md" };
    const batch = store.createSubmissionBatch({
      batchId: "batch-1",
      items: [
        { articleId: "article-1", target: target(first), payload },
        { articleId: "article-2", target: target(second), payload },
      ],
    });
    const firstPayload = Object.assign({}, payload, {
      batchId: batch.batchId,
      batchItemId: batch.items[0].itemId,
    });
    reserveAndSubmit(store, first, {
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      batchItemId: batch.items[0].itemId,
      payload: firstPayload,
    });
    assert.equal(store.claimPostProcessing({ claimToken: "claim-1" }), null);
    assert.equal(
      fs.existsSync(path.join(input, "toutiao", "fixture.md")),
      true,
    );
    const secondPayload = Object.assign({}, payload, {
      batchId: batch.batchId,
      batchItemId: batch.items[1].itemId,
    });
    reserveAndSubmit(store, second, {
      articleId: "article-2",
      publicationId: "publication-2",
      attemptId: "attempt-2",
      batchItemId: batch.items[1].itemId,
      payload: secondPayload,
    });
    assert.equal(store.claimPostProcessing({ claimToken: "claim-2" }), null);
    assert.equal(fs.existsSync(path.join(published, "fixture.md")), false);
  } finally {
    store.close();
  }
});

test("generic submitted outcomes do not manufacture post-processing attention", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-post-attention-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    const batch = store.createSubmissionBatch({
      batchId: "batch-1",
      items: [
        {
          articleId: "article-1",
          target: target(profile),
          payload: { sourcePlatformId: "toutiao", filename: "fixture.md" },
        },
      ],
    });
    reserveAndSubmit(store, profile, {
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      batchItemId: batch.items[0].itemId,
      payload: {
        sourcePlatformId: "toutiao",
        filename: "fixture.md",
        batchId: batch.batchId,
        batchItemId: batch.items[0].itemId,
      },
    });
    assert.equal(store.claimPostProcessing({ claimToken: "claim-1" }), null);
    assert.deepEqual(store.listPostProcessingAttention(), []);
  } finally {
    store.close();
  }
});
