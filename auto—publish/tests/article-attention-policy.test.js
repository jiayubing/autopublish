const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ACTIONS,
  ATTENTION_KINDS,
  deriveAttentionPolicy,
} = require("../desktop/services/article-attention-policy");

const capabilities = {
  canOpenSubmission: true,
  canOpenPublication: true,
  canOpenArticle: true,
  canInspect: true,
  canRetryRemoval: true,
  canRetryArchive: true,
  canResolveRegularUncertain: true,
  canResolvePaidOrderCreation: true,
  canResolveOrderStatusAnomaly: true,
};

test("explicit failure returns to the unified submission entry, never generic retry", () => {
  const policy = deriveAttentionPolicy(
    {
      kind: ATTENTION_KINDS.REGULAR_PLATFORM_FAILED,
      status: "failed",
      articleStatus: "saved",
      articleExists: true,
      articleSubmissionEligible: true,
    },
    capabilities,
  );

  assert.equal(policy.included, true);
  assert.deepEqual(policy.allowedActions, [
    ACTIONS.OPEN_SUBMISSION,
    ACTIONS.OPEN_PUBLICATION,
    ACTIONS.INSPECT,
  ]);
  assert.equal(
    policy.allowedActions.includes(["retry", "publication"].join("-")),
    false,
  );
  assert.equal(policy.freeze.article, false);
  assert.equal(policy.owner, "regular-platform-outcome");
});

test("generated explicit failure can edit and open the unified entry", () => {
  const policy = deriveAttentionPolicy(
    {
      kind: ATTENTION_KINDS.REGULAR_PLATFORM_FAILED,
      status: "failed",
      articleStatus: "generated",
      articleExists: true,
      articleSubmissionEligible: true,
    },
    capabilities,
  );

  assert.deepEqual(policy.allowedActions, [
    ACTIONS.OPEN_SUBMISSION,
    ACTIONS.OPEN_ARTICLE,
    ACTIONS.OPEN_PUBLICATION,
    ACTIONS.INSPECT,
  ]);
});

test("removed failed history is excluded", () => {
  const policy = deriveAttentionPolicy(
    {
      kind: ATTENTION_KINDS.REGULAR_PLATFORM_FAILED,
      status: "failed",
      articleStatus: "removed",
      articleExists: false,
      hasResidue: false,
      hasRemovalTransaction: false,
    },
    capabilities,
  );

  assert.equal(policy.included, false);
  assert.equal(policy.exclusionReason, "removed_failed_history");
  assert.deepEqual(policy.allowedActions, []);
});

test("regular uncertainty exposes only accepted/not-accepted resolutions plus safe navigation", () => {
  const policy = deriveAttentionPolicy(
    {
      kind: ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN,
      articleExists: true,
      articleStatus: "saved",
    },
    capabilities,
  );

  assert.deepEqual(policy.allowedActions, [
    ACTIONS.CONFIRM_REGULAR_ACCEPTED,
    ACTIONS.CONFIRM_REGULAR_NOT_ACCEPTED,
    ACTIONS.OPEN_PUBLICATION,
    ACTIONS.INSPECT,
  ]);
  assert.equal(policy.freeze.article, true);
});

test("paid and order anomaly types do not receive ordinary submission actions", () => {
  const paid = deriveAttentionPolicy(
    { kind: ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN },
    capabilities,
  );
  const order = deriveAttentionPolicy(
    { kind: ATTENTION_KINDS.ORDER_STATUS_ANOMALY },
    capabilities,
  );
  const removal = deriveAttentionPolicy(
    { kind: ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR },
    capabilities,
  );
  const archive = deriveAttentionPolicy(
    { kind: ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED },
    capabilities,
  );

  assert.deepEqual(paid.allowedActions, [
    ACTIONS.BIND_PAID_ORDER_NUMBER,
    ACTIONS.CONFIRM_PAID_ORDER_ABSENT,
    ACTIONS.INSPECT,
  ]);
  assert.deepEqual(order.allowedActions, [
    ACTIONS.RESUME_ORDER_TRACKING,
    ACTIONS.CONFIRM_ORDER_PUBLISHED,
    ACTIONS.CONFIRM_ORDER_NOT_PUBLISHED,
    ACTIONS.INSPECT,
  ]);
  assert.deepEqual(removal.allowedActions, [ACTIONS.RETRY_REMOVAL, ACTIONS.INSPECT]);
  assert.deepEqual(archive.allowedActions, [ACTIONS.RETRY_ARCHIVE, ACTIONS.INSPECT]);
  for (const item of [paid, order, removal, archive]) {
    assert.equal(item.allowedActions.includes(ACTIONS.OPEN_SUBMISSION), false);
    assert.equal(item.freeze.article, true);
  }
});

test("missing capabilities fail closed without inventing a generic action", () => {
  const policy = deriveAttentionPolicy(
    {
      kind: ATTENTION_KINDS.REGULAR_PLATFORM_FAILED,
      status: "failed",
      articleStatus: "saved",
      articleExists: true,
      articleSubmissionEligible: true,
    },
    { canOpenSubmission: false, canOpenPublication: true, canInspect: false },
  );

  assert.deepEqual(policy.allowedActions, [ACTIONS.OPEN_PUBLICATION]);
  assert.equal(policy.included, true);
});
