function batchError(code, message) { const error = new Error(message); error.code = code; return error; }

// Owns the batch mutation order.  Every command obtains a fresh action plan
// and delegates individual filesystem changes to the fail-closed evaluator.
function createSubmissionAction(deps) {
  function previewCancelBatch(value) {
    if (!value || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    return deps.buildActionPlan(value.batchId, "cancel");
  }
  function cancelBatch(value) {
    if (!value || value.confirmed !== true || typeof value.batchId !== "string" || typeof value.planId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation and action plan are required");
    const plan = deps.buildActionPlan(value.batchId, "cancel");
    if (plan.planId !== value.planId) throw batchError("SUBMISSION_ACTION_STALE", "Submission action plan is stale");
    let cancelledCount = 0; let idempotentCount = 0;
    const blockedItems = plan.items.filter(function(item) { return !item.allowed && item.reasonCode !== "SUBMISSION_ALREADY_CANCELLED"; });
    const transitions = [];
    plan.items.filter(function(item) { return item.allowed; }).forEach(function(item) {
      const result = deps.cancelItem({ clientId: plan.clientId, articleId: item.articleId, batchId: plan.batchId, targetPlatformId: item.targetPlatformId, publicationId: item.publicationId || undefined, attemptId: item.attemptId || undefined, action: "cancel", evaluationFingerprint: item.fingerprint, deferBatchUpdate: true, suppressNotification: true });
      if (result.idempotent) idempotentCount += 1;
      else { cancelledCount += 1; transitions.push({ identity: { articleId: item.articleId, publicationId: item.publicationId || undefined, attemptId: item.attemptId || undefined, targetPlatformId: item.targetPlatformId }, transition: { status: "cancelled", publicationStatus: "cancelled", reasonCode: "ARTICLE_TRASHED_BEFORE_SUBMISSION" } }); }
    });
    idempotentCount += plan.items.filter(function(item) { return item.reasonCode === "SUBMISSION_ALREADY_CANCELLED"; }).length;
    const batch = transitions.length ? deps.batchStore.reconcile(plan.batchId, transitions) : deps.batchStore.get(plan.batchId);
    if (cancelledCount > 0 || idempotentCount > 0) deps.notifyData("SUBMISSION_BATCH_CANCELLED");
    return { batchId: batch.id, planId: plan.planId, cancelledCount, idempotentCount, skippedCount: blockedItems.length, blockedItems, batchStatus: batch.status, changedScopes: cancelledCount > 0 || idempotentCount > 0 ? ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"] : [], items: batch.items };
  }
  function previewCleanupFailedItems(value) {
    if (!value || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    const result = deps.reconcileBatch(value.batchId); let cleanableCount = 0; let uncleanableCount = 0;
    const items = result.batch.items.map(function(item) {
      const copy = Object.assign({}, item); delete copy.filePath; delete copy.sidecarPath;
      const state = result.items.find(function(candidate) { return candidate.publicationId === item.publicationId && candidate.attemptId === item.attemptId && candidate.targetPlatformId === item.targetPlatformId; });
      const cleanable = Boolean(state && state.reconciledStatus === "failed" && state.canCleanup);
      if (cleanable) cleanableCount += 1; else uncleanableCount += 1;
      return Object.assign(copy, { cleanable, reasonCode: cleanable ? null : (state && state.reasonCode) || (state && state.reconciledStatus === "failed" ? "SUBMISSION_QUEUE_CHANGED" : "SUBMISSION_NOT_FAILED") });
    });
    return { batchId: result.batch.id, cleanableCount, uncleanableCount, items };
  }
  return Object.freeze({ previewCancelBatch, cancelBatch, previewCleanupFailedItems });
}
module.exports = { createSubmissionAction };
