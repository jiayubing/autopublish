const assert = require("node:assert/strict");
const { it } = require("node:test");
const { createSubmissionPreparation } = require("../desktop/services/submission/submission-preparation");
const { createSubmissionAction } = require("../desktop/services/submission/submission-action");

it("preparation retries only a freshly preflighted failed publication", function() {
  const calls = [];
  const record = { publicationId: "p", clientId: "c", articleId: "a", platformId: "target", status: "failed", attempts: [{ status: "failed" }] };
  const preparation = createSubmissionPreparation({
    publicationLedger: { get() { return record; }, reserve() { return { publicationId: "p", attemptId: "next", status: "queued" }; } }, articleStore: { getArticle() { return { id: "a", title: "title" }; } },
    latestAttempt(value) { return value.attempts[0]; }, evaluateEligibility() { return { eligible: true, reasons: [] }; },
    platformFor() { return { id: "target" }; }, getDataRevision() { return 4; },
    assertBatchInput(value) { return value; }, availablePlatforms() { return [{ id: "target", contentQueueImport: true }]; }, hash() { return "hash"; }, articleMarkdown() { return "body"; },
    itemForArticle() { return { status: "queueable", filePath: "main", sidecarPath: "sidecar" }; }, batchStore: { createId() { return "b"; }, save() {} },
    publicationContext() { return { tracked: true, identity: {}, target: {}, titleSnapshot: "title" }; }, publicationRecordFor() { return record; }, publicationFields() { return { publicationId: "p", attemptId: "next" }; },
    makeSidecar() { return {}; }, basename() { return "main"; }, mkdirFor() {}, writePairAtomic() {}, writeAtomic() {}, notifyData() {}, removeSubmissionPair() {}, cancelReservation() {}
  });
  const result = preparation.retryFailedPublication({ publicationId: "p", confirmed: true, expectedRevision: 4 });
  assert.equal(result.attemptId, "next");
  assert.equal(calls.length, 0);
});

it("preparation owns batch preflight, reservation, queue-pair write, and rollback", function() {
  const calls = [];
  const preparation = createSubmissionPreparation({
    assertBatchInput(value) { return value; },
    availablePlatforms() { return [{ id: "target", contentQueueImport: true }]; },
    getArticle() { return { id: "a", title: "title" }; },
    hash() { return "hash"; }, articleMarkdown() { return "# title"; },
    evaluateEligibility() { return { eligible: true, reasonCodes: [], reasons: [] }; },
    itemForArticle() { return { status: "queueable", filePath: "main", sidecarPath: "sidecar" }; },
    batchStore: { createId() { return "batch"; }, save(batch) { calls.push(["save", batch.status]); } },
    publicationContext() { return { tracked: true, identity: {}, target: {}, titleSnapshot: "title" }; },
    publicationRecordFor() { return null; }, publicationLedger: { reserve() { calls.push(["reserve"]); return { status: "queued", publicationId: "p", attemptId: "a" }; } },
    publicationFields() { return {}; }, makeSidecar() { return {}; },
    basename() { return "main"; }, mkdirFor() {},
    writePairAtomic() { calls.push(["pair"]); throw new Error("disk failed"); },
    removeSubmissionPair() { calls.push(["rollback-pair"]); },
    cancelReservation() { calls.push(["rollback-reservation"]); }, notifyData() {}
  });
  assert.throws(function() { preparation.createBatch({ clientId: "c", articleIds: ["a"], targetPlatformIds: ["target"], confirmed: true }); }, /disk failed/);
  assert.deepEqual(calls.filter(function(value) { return value[0] !== "save"; }), [["reserve"], ["pair"], ["rollback-reservation"]]);
});

it("action rejects a stale plan before invoking any item mutation", function() {
  let mutated = false;
  const action = createSubmissionAction({
    buildActionPlan() { return { planId: "fresh", items: [] }; },
    cancelItem() { mutated = true; }, batchStore: {}, reconcileBatch() {}, notifyData() {}
  });
  assert.throws(function() { action.cancelBatch({ batchId: "b", planId: "old", confirmed: true }); }, { code: "SUBMISSION_ACTION_STALE" });
  assert.equal(mutated, false);
});
