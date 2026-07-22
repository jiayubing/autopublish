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
