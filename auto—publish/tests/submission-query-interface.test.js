const assert = require("node:assert/strict");
const { it } = require("node:test");
const { createSubmissionQuery } = require("../desktop/services/submission/submission-query");

it("submission query reads batches once and shares its snapshot with reconciliation and planning", function() {
  const batches = [{ id: "b-1", clientId: "c-1", status: "queued", items: [{ articleId: "a-1", targetPlatformId: "p-1", status: "queued" }] }];
  let listCount = 0;
  const snapshots = [];
  const query = createSubmissionQuery({
    batchStore: { list() { listCount += 1; return batches; }, get() { throw new Error("unexpected get"); } },
    onSnapshotCreated(counts) { snapshots.push(counts); },
    latestAttempt() { return null; },
    readSidecar() { return null; },
    inspectSubmissionPair() { return { pairState: "intact", identityMatched: true, contentMatched: true, mainExists: true, sidecarExists: true }; },
    hash(value) { return value; },
    publicationLedger: {}
  });
  const result = query.listBatches("c-1");
  assert.equal(listCount, 1);
  assert.ok(snapshots.length >= 1);
  assert.equal(result[0].items[0].canCancel, true);
  assert.equal(typeof result[0].items[0].actionFingerprint, "string");
});

it("submission query formally owns pair inspection, archive failures, and action evaluation", function() {
  const batch = { id: "b-1", clientId: "c-1", items: [{ articleId: "a-1", targetPlatformId: "p-1", publicationId: "pub-1", attemptId: "attempt-1", status: "published", publicationStatus: "published", localArchive: { status: "failed", errorCode: "ARCHIVE_FAILED", updatedAt: "2026-07-23T00:00:00.000Z" } }] };
  const query = createSubmissionQuery({
    batchStore: { list() { return [batch]; }, get() { return batch; } }, latestAttempt() { return { attemptId: "attempt-1", status: "published" }; },
    readSidecar() { return {}; }, inspectSubmissionPair() { return { pairState: "intact", identityMatched: true, contentMatched: true, mainExists: true, sidecarExists: true }; }, hash() { return "hash"; },
    publicationLedger: { get() { return { status: "published", attempts: [{ attemptId: "attempt-1", status: "published" }] }; } }
  });
  assert.equal(typeof query.evaluateItemAction({ clientId: "c-1", articleId: "a-1", batchId: "b-1", targetPlatformId: "p-1", publicationId: "pub-1", attemptId: "attempt-1", action: "cleanupPublishedLocal" }).allowed, "boolean");
  assert.equal(query.inspectSubmissionPair({ item: batch.items[0], batch: batch }).pairState, "intact");
  assert.deepEqual(query.listArchiveFailures().map(function(item) { return item.reasonCode; }), ["ARCHIVE_FAILED"]);
});
