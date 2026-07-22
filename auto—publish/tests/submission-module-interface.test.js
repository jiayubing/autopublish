const assert = require("node:assert/strict");
const { it } = require("node:test");
const { createSubmissionPreparation } = require("../desktop/services/submission/submission-preparation");
const { createSubmissionAction } = require("../desktop/services/submission/submission-action");

it("preparation retries only a freshly preflighted failed publication", function() {
  const calls = [];
  const record = { publicationId: "p", clientId: "c", articleId: "a", platformId: "target", status: "failed", attempts: [{ status: "failed" }] };
  const preparation = createSubmissionPreparation({
    publicationLedger: { get() { return record; } }, articleStore: { getArticle() { return { title: "title" }; } },
    latestAttempt(value) { return value.attempts[0]; }, evaluateEligibility() { return { eligible: true, reasons: [] }; },
    platformFor() { return { id: "target" }; }, getDataRevision() { return 4; },
    previewBatch(value) { calls.push(value); return { items: [{ articleId: "a", targetPlatformId: "target", status: "queueable" }], queueableTaskCount: 1, idempotentCount: 0, conflictCount: 0 }; },
    createBatch(value) { calls.push(value); return { batchId: "b", items: [{ publicationId: "p", attemptId: "next" }] }; }
  });
  const result = preparation.retryFailedPublication({ publicationId: "p", confirmed: true, expectedRevision: 4 });
  assert.equal(result.attemptId, "next");
  assert.equal(calls.length, 2);
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
