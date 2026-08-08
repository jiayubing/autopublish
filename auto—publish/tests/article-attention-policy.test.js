const assert = require("node:assert/strict");
const test = require("node:test");

const { deriveAttentionPolicy } = require("../desktop/services/article-attention-policy");

const retryCapabilities = {
  canRetryFailedPublication: true,
  targetSupportsContentQueueImport: true
};

test("failed active saved publication exposes retry and publication navigation only", () => {
  const policy = deriveAttentionPolicy({
    kind: "failed_submission",
    status: "failed",
    articleStatus: "saved",
    articleExists: true,
    hasQueueBinding: false,
    articleSubmissionEligible: true,
    targetSupportsContentQueueImport: true
  }, retryCapabilities);

  assert.equal(policy.included, true);
  assert.deepEqual(policy.allowedActions, ["retry-publication", "open-publication"]);
  assert.equal(policy.allowedActions.includes("cleanup"), false);
  assert.equal(policy.allowedActions.includes("retry"), false);
});

test("failed publication with a queue binding has no independent cleanup action", () => {
  const policy = deriveAttentionPolicy({
    kind: "failed_submission",
    status: "failed",
    articleStatus: "saved",
    articleExists: true,
    hasQueueBinding: true,
    pairState: "intact",
    articleSubmissionEligible: true,
    targetSupportsContentQueueImport: true
  }, retryCapabilities);

  assert.deepEqual(policy.allowedActions, ["retry-publication", "open-publication"]);
});

test("removed failed publication without residue is historical, not current attention", () => {
  const policy = deriveAttentionPolicy({
    kind: "failed_submission",
    status: "failed",
    articleStatus: "removed",
    articleExists: false,
    hasQueueBinding: false,
    hasResidue: false,
    hasRemovalTransaction: false
  }, retryCapabilities);

  assert.equal(policy.included, false);
  assert.equal(policy.exclusionReason, "removed_failed_history");
  assert.deepEqual(policy.allowedActions, []);
});

test("generated failed publication can open article and publication but cannot retry directly", () => {
  const policy = deriveAttentionPolicy({
    kind: "failed_submission",
    status: "failed",
    articleStatus: "generated",
    articleExists: true,
    hasQueueBinding: false,
    targetSupportsContentQueueImport: true
  }, retryCapabilities);

  assert.deepEqual(policy.allowedActions, ["open-article", "open-publication"]);
});

test("missing capabilities hide actions", () => {
  const policy = deriveAttentionPolicy({
    kind: "failed_submission",
    status: "failed",
    articleStatus: "saved",
    articleExists: true,
    hasQueueBinding: false,
    targetSupportsContentQueueImport: true
  }, { targetSupportsContentQueueImport: false, canInspect: false });

  assert.deepEqual(policy.allowedActions, ["open-publication"]);
});
