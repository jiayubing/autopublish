"use strict";

const crypto = require("node:crypto");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createSubmissionQueueRemoval(options) {
  const value = options || {};
  if (!value.operationalStore || !value.projection || !value.policy)
    throw fail("SUBMISSION_QUEUE_REMOVAL_PORT_REQUIRED");
  if (!value.actionRecovery) throw fail("SUBMISSION_ACTION_RECOVERY_REQUIRED");
  const projection = value.projection;
  const policy = value.policy;
  const cancellationPlans = new Map();

  function buildSubmissionActionPlan(input) {
    if (!input || typeof input.batchId !== "string" || !input.batchId)
      throw fail(
        "CONTENT_SUBMISSION_BATCH_INPUT_INVALID",
        "Batch id is required",
      );
    if (input.action && input.action !== "cancel")
      throw fail("SUBMISSION_ACTION_INVALID", "Submission action is invalid");
    const batch = value.operationalStore.getSubmissionBatch(input.batchId);
    const action = input.action || "cancel";
    const items = projection.batchViews(batch).map((item) => {
      const safe = projection.publicItem(item);
      const checked = policy.evaluateItemAction(
        Object.assign({}, safe, { action }),
      );
      return Object.assign(safe, {
        action,
        allowed: checked.allowed,
        reasonCode: checked.reasonCode,
        fingerprint: checked.bindingFingerprint,
      });
    });
    const revision = hash(
      JSON.stringify({
        batchId: batch.batchId,
        revision: batch.revision,
        items,
      }),
    );
    const planId = hash(
      JSON.stringify({
        batchId: batch.batchId,
        action,
        revision,
        items: items.map((item) => [
          item.itemId,
          item.allowed,
          item.fingerprint,
        ]),
      }),
    );
    cancellationPlans.set(planId, {
      batchId: batch.batchId,
      revision: batch.revision,
      itemIds: items.filter((item) => item.allowed).map((item) => item.itemId),
    });
    return {
      batchId: batch.batchId,
      clientId: projection.batchClientId(batch),
      action,
      revision,
      planId,
      fingerprint: planId,
      items,
      allowedCount: items.filter((item) => item.allowed).length,
      blockedCount: items.filter((item) => !item.allowed).length,
    };
  }

  function previewCancelBatch(input) {
    const plan = buildSubmissionActionPlan({
      batchId: input && input.batchId,
      action: "cancel",
    });
    return {
      batchId: plan.batchId,
      planId: plan.planId,
      allowedCount: plan.allowedCount,
      blockedCount: plan.blockedCount,
      items: plan.items,
    };
  }

  function cancelBatch(input) {
    if (
      !input ||
      input.confirmed !== true ||
      typeof input.batchId !== "string" ||
      typeof input.planId !== "string"
    )
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const plan = cancellationPlans.get(input.planId);
    if (!plan || plan.batchId !== input.batchId)
      throw fail("SUBMISSION_ACTION_PLAN_INVALID");
    const current = value.operationalStore.getSubmissionBatch(input.batchId);
    if (current.revision !== plan.revision)
      throw fail("SUBMISSION_ACTION_STALE");
    let cancelledCount = 0;
    let idempotentCount = 0;
    let skippedCount = 0;
    for (const itemId of plan.itemIds) {
      const item = projection
        .batchViews(current)
        .find((candidate) => candidate.itemId === itemId);
      if (!item) {
        skippedCount += 1;
        continue;
      }
      try {
        const result = value.actionRecovery.applyItemAction({
          action: "cancel",
          batchId: item.batchId,
          itemId: item.itemId,
          articleId: item.articleId,
          targetPlatformId: item.targetPlatformId,
          operationId: value.actionRecovery.operationIdFor({
            action: "cancel",
            batchId: item.batchId,
            itemId: item.itemId,
          }),
          evaluationFingerprint: projection.actionFingerprint(item, {
            action: "cancel",
          }),
        });
        if (result.idempotent) idempotentCount += 1;
        else cancelledCount += 1;
      } catch (_) {
        skippedCount += 1;
      }
    }
    cancellationPlans.delete(input.planId);
    if (cancelledCount || idempotentCount)
      if (typeof value.onDataInvalidated === "function")
        value.onDataInvalidated("SUBMISSION_BATCH_CANCELLED");
    const after = value.operationalStore.getSubmissionBatch(input.batchId);
    return {
      batchId: after.batchId,
      planId: input.planId,
      cancelledCount,
      idempotentCount,
      skippedCount,
      batchStatus: after.status,
      changedScopes:
        cancelledCount || idempotentCount
          ? ["articleManagement", "articleAttention", "platformQueue"]
          : [],
      items: after.items,
    };
  }

  return Object.freeze({
    buildSubmissionActionPlan,
    previewCancelBatch,
    cancelBatch,
  });
}

module.exports = { createSubmissionQueueRemoval };
