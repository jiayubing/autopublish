"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createPublicationPostProcessor } = require("../desktop/services/publication-post-processor");

function target(profile) {
  return { kind: "platform", platformId: "toutiao", accountProfileId: profile.accountProfileId };
}
function publishedOutcome(profile, attemptId, articleId) {
  return {
    status: "published",
    evidence: {
      articleId,
      attemptId,
      targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
      accountProfileId: profile.accountProfileId,
      remoteId: `remote-${attemptId}`,
    },
  };
}
function reserveAndPublish(store, profile, value) {
  store.reservePublicationTarget({ articleId: value.articleId, publicationId: value.publicationId, attemptId: value.attemptId, target: target(profile) });
  store.commitRemoteOutcome({ attemptId: value.attemptId, outcome: publishedOutcome(profile, value.attemptId, value.articleId), batchItemId: value.batchItemId, postProcessingPayload: value.payload });
}

test("archive post-processing waits for every target in its source group and is idempotent after a crash", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-archive-"));
  const input = path.join(root, "input");
  const published = path.join(root, "published");
  fs.mkdirSync(path.join(input, "toutiao"), { recursive: true });
  fs.writeFileSync(path.join(input, "toutiao", "fixture.md"), "fixture");
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const first = store.createAccountProfile({ platformId: "toutiao", displayName: "first" });
    const second = store.createAccountProfile({ platformId: "toutiao", displayName: "second" });
    const payload = { sourcePlatformId: "toutiao", filename: "fixture.md" };
    const batch = store.createSubmissionBatch({ batchId: "batch-1", items: [
      { articleId: "article-1", target: target(first), payload },
      { articleId: "article-1", target: target(second), payload },
    ] });
    const processor = createPublicationPostProcessor({ workspaceRoot: root, paths: { input, published }, platforms: [{ id: "toutiao", scanDir: "toutiao" }], operationalStore: store });
    const firstPayload = Object.assign({}, payload, { batchId: batch.batchId, batchItemId: batch.items[0].itemId });
    reserveAndPublish(store, first, { articleId: "article-1", publicationId: "publication-1", attemptId: "attempt-1", batchItemId: batch.items[0].itemId, payload: firstPayload });
    const firstJob = store.claimPostProcessing({ claimToken: "claim-1" });
    await assert.rejects(() => processor.process(firstJob), { code: "POST_PROCESSING_ARCHIVE_NOT_ELIGIBLE" });
    store.completePostProcessing({ jobId: firstJob.jobId, claimToken: "claim-1", success: false });
    assert.equal(fs.existsSync(path.join(input, "toutiao", "fixture.md")), true);
    const secondPayload = Object.assign({}, payload, { batchId: batch.batchId, batchItemId: batch.items[1].itemId });
    reserveAndPublish(store, second, { articleId: "article-1", publicationId: "publication-2", attemptId: "attempt-2", batchItemId: batch.items[1].itemId, payload: secondPayload });
    store.retryPostProcessing({ jobId: firstJob.jobId });
    const retry = store.claimPostProcessing({ claimToken: "claim-2" });
    assert.equal((await processor.process(retry)).archived, true);
    assert.equal(fs.existsSync(path.join(published, "fixture.md")), true);
    // Simulate a process death after the filesystem action but before job completion.
    assert.deepEqual(await processor.process(retry), { archived: true, idempotent: true });
  } finally { store.close(); }
});

test("failed post-processing is attention-visible and is not automatically re-claimed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-post-attention-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const batch = store.createSubmissionBatch({ batchId: "batch-1", items: [{ articleId: "article-1", target: target(profile), payload: { sourcePlatformId: "toutiao", filename: "fixture.md" } }] });
    reserveAndPublish(store, profile, { articleId: "article-1", publicationId: "publication-1", attemptId: "attempt-1", batchItemId: batch.items[0].itemId, payload: { sourcePlatformId: "toutiao", filename: "fixture.md", batchId: batch.batchId, batchItemId: batch.items[0].itemId } });
    const job = store.claimPostProcessing({ claimToken: "claim-1" });
    store.completePostProcessing({ jobId: job.jobId, claimToken: "claim-1", success: false });
    assert.equal(store.claimPostProcessing({ claimToken: "claim-2" }), null);
    assert.equal(store.listPostProcessingAttention()[0].jobId, job.jobId);
  } finally { store.close(); }
});
