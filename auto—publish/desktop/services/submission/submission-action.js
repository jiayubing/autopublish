function batchError(code, message) { const error = new Error(message); error.code = code; return error; }

// Owns all submission mutations.  Query supplies immutable snapshots and
// evaluation; every mutation deliberately recreates its smallest snapshot.
function createSubmissionAction(deps) {
  // Keep the small module test seam compatible while production always
  // supplies the complete Query object.
  if (!deps.query) deps.query = { buildActionPlan: deps.buildActionPlan, reconcileBatch: deps.reconcileBatch };
  function previewCancelBatch(value) {
    if (!value || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    return deps.query.buildActionPlan(value.batchId, "cancel");
  }

  function applyItemAction(action, nextStatus, reasonCode) {
    const snapshot = deps.query.createReadSnapshot({ batchId: action.batchId });
    const entry = deps.query.locateArticleSubmissionItem(action, snapshot);
    if (!entry || !entry.item || !entry.batch) throw batchError("SUBMISSION_QUEUE_CHANGED", "Submission queue item is unavailable");
    if (entry.safe.status === nextStatus || ["failed-cleaned", "published-cleaned", "cancelled-cleaned"].includes(entry.safe.status) || entry.safe.status === "cancelled" && action.action === "cancel") return { action: action.action || nextStatus, status: entry.safe.status, idempotent: true, batchId: entry.batch.id, publicationId: action.publicationId, attemptId: action.attemptId, changedScopes: [], domainHandled: true };
    const checked = deps.query.evaluateItemAction(action, snapshot);
    if (!checked.allowed) throw batchError(checked.reasonCode || "SUBMISSION_QUEUE_CHANGED", "Submission item action is no longer valid");
    if (action.evaluationFingerprint && checked.bindingFingerprint !== action.evaluationFingerprint) throw batchError("SUBMISSION_ACTION_STALE", "Submission item action is stale");
    const original = deps.readPair(entry.item);
    try {
      if (action.action === "cancel" && entry.record) deps.cancelReservation({ publicationId: action.publicationId, attemptId: action.attemptId }, reasonCode);
      if (["cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"].includes(action.action) && entry.record && entry.item.status !== entry.record.status) deps.batchStore.updateItem(entry.batch.id, { publicationId: action.publicationId, attemptId: action.attemptId, targetPlatformId: action.targetPlatformId }, { status: entry.record.status, publicationStatus: entry.record.status, reasonCode: "SUBMISSION_STATUS_RECONCILED" });
      const absent = entry.safe.pairState === "both_absent";
      if (!absent) deps.removePair(entry.item);
      if (!action.deferBatchUpdate) deps.batchStore.updateItem(entry.batch.id, { articleId: action.articleId, publicationId: action.publicationId, attemptId: action.attemptId, targetPlatformId: action.targetPlatformId }, { status: nextStatus, publicationStatus: entry.record ? entry.record.status : undefined, reasonCode });
      if (!action.suppressNotification) deps.notifyData(action.action === "cancel" ? "SUBMISSION_QUEUE_CANCELLED" : "SUBMISSION_QUEUE_CLEANED");
      return { action: action.action || nextStatus, status: nextStatus, idempotent: absent && action.action !== "cancel", physicalFilesAlreadyAbsent: absent || undefined, batchId: entry.batch.id, publicationId: action.publicationId, attemptId: action.attemptId, changedScopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"], domainHandled: true };
    } catch (error) { deps.restorePair(entry.item, original); throw error; }
  }
  function cancelArticleSubmissionItem(action) { return applyItemAction(action, "cancelled", "ARTICLE_TRASHED_BEFORE_SUBMISSION"); }
  function cleanupArticleSubmissionItem(action) { return applyItemAction(action, "failed-cleaned", "ARTICLE_TRASHED_FAILED_QUEUE_CLEANUP"); }
  function cleanupPublishedArticleLocal(action) { return applyItemAction(action, "published-cleaned", "ARTICLE_TRASHED_PUBLISHED_LOCAL_CLEANUP"); }
  function cleanupCancelledArticleLocal(action) { return applyItemAction(action, "cancelled-cleaned", "ARTICLE_TRASHED_CANCELLED_LOCAL_CLEANUP"); }
  function execute(action) { return action.action === "cancel" ? cancelArticleSubmissionItem(action) : action.action === "cleanupPublishedLocal" ? cleanupPublishedArticleLocal(action) : action.action === "cleanupCancelledLocal" ? cleanupCancelledArticleLocal(action) : cleanupArticleSubmissionItem(action); }
  function isSubmissionItemExecutable(action) {
    const entry = deps.query.locateArticleSubmissionItem(action);
    if (!entry) return false;
    if (deps.isArticleTrashed(action.clientId, action.articleId)) return false;
    return entry.safe.status === "queued" && entry.safe.pairState === "intact";
  }

  function cancelBatch(value) {
    if (!value || value.confirmed !== true || typeof value.batchId !== "string" || typeof value.planId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation and action plan are required");
    const plan = deps.query.buildActionPlan(value.batchId, "cancel");
    if (plan.planId !== value.planId) throw batchError("SUBMISSION_ACTION_STALE", "Submission action plan is stale");
    let cancelledCount = 0; let idempotentCount = 0;
    const blockedItems = plan.items.filter(function(item) { return !item.allowed && item.reasonCode !== "SUBMISSION_ALREADY_CANCELLED"; }); const transitions = [];
    plan.items.filter(function(item) { return item.allowed; }).forEach(function(item) {
      const result = cancelArticleSubmissionItem({ clientId: plan.clientId, articleId: item.articleId, batchId: plan.batchId, targetPlatformId: item.targetPlatformId, publicationId: item.publicationId || undefined, attemptId: item.attemptId || undefined, action: "cancel", evaluationFingerprint: item.fingerprint, deferBatchUpdate: true, suppressNotification: true });
      if (result.idempotent) idempotentCount += 1; else { cancelledCount += 1; transitions.push({ identity: { articleId: item.articleId, publicationId: item.publicationId || undefined, attemptId: item.attemptId || undefined, targetPlatformId: item.targetPlatformId }, transition: { status: "cancelled", publicationStatus: "cancelled", reasonCode: "ARTICLE_TRASHED_BEFORE_SUBMISSION" } }); }
    });
    idempotentCount += plan.items.filter(function(item) { return item.reasonCode === "SUBMISSION_ALREADY_CANCELLED"; }).length;
    const batch = transitions.length ? deps.batchStore.reconcile(plan.batchId, transitions) : deps.batchStore.get(plan.batchId);
    if (cancelledCount > 0 || idempotentCount > 0) deps.notifyData("SUBMISSION_BATCH_CANCELLED");
    return { batchId: batch.id, planId: plan.planId, cancelledCount, idempotentCount, skippedCount: blockedItems.length, blockedItems, batchStatus: batch.status, changedScopes: cancelledCount > 0 || idempotentCount > 0 ? ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"] : [], items: batch.items };
  }
  function previewCleanupFailedItems(value) {
    if (!value || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    const result = deps.query.reconcileBatch(value.batchId); let cleanableCount = 0; let uncleanableCount = 0;
    const items = result.batch.items.map(function(item) { const copy = Object.assign({}, item); delete copy.filePath; delete copy.sidecarPath; const state = result.items.find(function(candidate) { return candidate.publicationId === item.publicationId && candidate.attemptId === item.attemptId && candidate.targetPlatformId === item.targetPlatformId; }); const cleanable = Boolean(state && state.reconciledStatus === "failed" && state.canCleanup); if (cleanable) cleanableCount += 1; else uncleanableCount += 1; return Object.assign(copy, { cleanable, reasonCode: cleanable ? null : (state && state.reasonCode) || (state && state.reconciledStatus === "failed" ? "SUBMISSION_QUEUE_CHANGED" : "SUBMISSION_NOT_FAILED") }); });
    return { batchId: result.batch.id, cleanableCount, uncleanableCount, items };
  }
  function cleanupFailedItems(value) {
    if (!value || value.confirmed !== true || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    const result = deps.query.reconcileBatch(value.batchId); let cleanedCount = 0; let skippedCount = 0;
    result.batch.items.forEach(function(item) { const state = result.items.find(function(candidate) { return candidate.publicationId === item.publicationId && candidate.attemptId === item.attemptId && candidate.targetPlatformId === item.targetPlatformId; }); if (!state || state.reconciledStatus !== "failed" || !state.canCleanup) { skippedCount += 1; return; } try { cleanupArticleSubmissionItem({ clientId: result.batch.clientId, articleId: item.articleId, batchId: result.batch.id, targetPlatformId: item.targetPlatformId, publicationId: item.publicationId, attemptId: item.attemptId, action: "cleanup", evaluationFingerprint: state.actionFingerprint }); cleanedCount += 1; } catch (_) { skippedCount += 1; } });
    const batch = deps.batchStore.get(result.batch.id); if (cleanedCount > 0) deps.notifyData("FAILED_QUEUE_ITEMS_CLEANED"); return { batchId: batch.id, cleanedCount, skippedCount, items: batch.items };
  }
  function previewTrashedArticleQueueResidue() {
    const items = []; const snapshot = deps.query.createReadSnapshot();
    snapshot.batches.forEach(function(batch) { (batch.items || []).forEach(function(item) { if (["failed-cleaned", "published-cleaned", "cancelled-cleaned", "skipped"].includes(item.status) || !deps.isArticleTrashed(batch.clientId, item.articleId)) return; const entry = deps.query.articleSubmissionItems([{ clientId: batch.clientId, articleId: item.articleId }], snapshot).find(function(candidate) { return candidate.safe.batchId === batch.id && candidate.safe.publicationId === item.publicationId && candidate.safe.attemptId === item.attemptId; }); if (!entry) return; const safe = Object.assign({}, entry.safe, { sourceArticleState: "trashed", reasonCode: "SOURCE_ARTICLE_TRASHED" }); const repairAction = entry.safe.status === "queued" ? "cancel" : entry.safe.status === "failed" ? "cleanup" : entry.safe.status === "published" ? "cleanupPublishedLocal" : entry.safe.status === "cancelled" ? "cleanupCancelledLocal" : null; const checked = repairAction ? deps.query.evaluateItemAction(Object.assign({}, entry.safe, { action: repairAction }), snapshot) : { allowed: false, reasonCode: "ARTICLE_SUBMISSION_ACTIVE" }; if (checked.allowed) { safe.repairAction = repairAction; safe.evaluationFingerprint = checked.bindingFingerprint; } else { safe.repairAction = null; safe.reasonCode = checked.reasonCode || safe.reasonCode; } items.push(safe); }); });
    return { items, cleanableItems: items.filter(function(item) { return !!item.repairAction; }), reportedItems: items.filter(function(item) { return !item.repairAction; }), cleanableCount: items.filter(function(item) { return !!item.repairAction; }).length, reportedCount: items.filter(function(item) { return !item.repairAction; }).length };
  }
  function cleanupTrashedArticleQueueResidue(value) {
    if (!value || value.confirmed !== true) throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Queue residue confirmation is required");
    const preview = previewTrashedArticleQueueResidue(); let cleanedCount = 0; let failedCount = 0; const items = preview.items.map(function(item) { if (!item.repairAction) return { publicationId: item.publicationId, targetPlatformId: item.targetPlatformId, status: item.status, reasonCode: item.reasonCode || "RESIDUE_NOT_CLEANABLE" }; try { const result = execute(Object.assign({}, item, { action: item.repairAction, evaluationFingerprint: item.evaluationFingerprint })); cleanedCount += 1; return { publicationId: item.publicationId, targetPlatformId: item.targetPlatformId, status: "cleaned", reasonCode: null, action: item.repairAction, resultStatus: result.status }; } catch (error) { failedCount += 1; return { publicationId: item.publicationId, targetPlatformId: item.targetPlatformId, status: item.status, reasonCode: error && error.code || "SUBMISSION_RESIDUE_CLEANUP_FAILED", action: item.repairAction }; } });
    const after = previewTrashedArticleQueueResidue(); if (cleanedCount > 0) deps.notifyData("TRASHED_QUEUE_RESIDUE_RESOLVED"); return { status: failedCount > 0 ? "failed" : cleanedCount > 0 ? "completed" : "no-op", cleanedCount, failedCount, remainingCount: after.items.length, cleanableCount: after.cleanableCount, reportedCount: after.reportedCount, items, remainingItems: after.items.map(function(item) { return { publicationId: item.publicationId, targetPlatformId: item.targetPlatformId, status: item.status, reasonCode: item.reasonCode || null }; }) };
  }
  return Object.freeze({ previewCancelBatch, cancelBatch, previewCleanupFailedItems, cleanupFailedItems, previewTrashedArticleQueueResidue, cleanupTrashedArticleQueueResidue, cancelArticleSubmissionItem, cleanupArticleSubmissionItem, cleanupPublishedArticleLocal, cleanupCancelledArticleLocal, isSubmissionItemExecutable });
}
module.exports = { createSubmissionAction };
