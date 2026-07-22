function batchError(code, message) { const error = new Error(message); error.code = code; return error; }

// Owns the preparation-time confirmation and retry decision.  It deliberately
// asks the queue writer to re-run preview/create so a retry cannot reuse a
// stale eligibility or reservation observation.
function createSubmissionPreparation(deps) {
  function previewRetryFailedPublication(value) {
    const publicationId = value && value.publicationId;
    if (typeof publicationId !== "string" || !publicationId.trim()) throw batchError("CONTENT_SUBMISSION_PUBLICATION_REQUIRED", "Publication id is required");
    const record = deps.publicationLedger.get(publicationId);
    if (!record) throw batchError("PUBLICATION_RECORD_MISSING", "Publication record was not found");
    if (record.status !== "failed") throw batchError("PUBLICATION_STATUS_NOT_FAILED", "Only failed publications can be retried");
    const latest = deps.latestAttempt(record);
    if (!latest || latest.status !== "failed") throw batchError("PUBLICATION_ATTEMPT_NOT_FAILED", "The latest publication attempt is not failed");
    let article;
    try { article = deps.articleStore.getArticle(record.clientId, record.articleId); }
    catch (_) { throw batchError("ARTICLE_NOT_FOUND", "The source article is no longer available"); }
    const eligibility = deps.evaluateEligibility(article, record.platformId);
    if (!eligibility.eligible) throw batchError("ARTICLE_NOT_RETRYABLE", eligibility.reasons.join("、"));
    if (!deps.platformFor(record.platformId)) throw batchError("CONTENT_SUBMISSION_TARGET_UNSUPPORTED", "The publication target does not support content queue import");
    const preview = deps.previewBatch({ clientId: record.clientId, articleIds: [record.articleId], targetPlatformIds: [record.platformId] });
    const retryableItem = preview.items.find(function(item) { return item.articleId === record.articleId && item.targetPlatformId === record.platformId; });
    if (!retryableItem || !["queueable", "idempotent"].includes(retryableItem.status)) {
      throw batchError(retryableItem && retryableItem.reasonCode || "SUBMISSION_QUEUE_CHANGED", "投稿队列已变化，请重新预检");
    }
    const failureCount = Array.isArray(record.attempts) ? record.attempts.filter(function(attempt) { return attempt.status === "failed"; }).length : 1;
    return {
      publicationId: record.publicationId, clientId: record.clientId, articleId: record.articleId,
      targetPlatformId: record.platformId, titleSnapshot: record.titleSnapshot || article.title,
      failureCount: failureCount, requiresConfirmation: true,
      message: `确认将“${(record.titleSnapshot || article.title || "文章").slice(0, 80)}”重新投稿到 ${record.platformId}？历史失败 ${failureCount} 次。`,
      details: { titleSnapshot: record.titleSnapshot || article.title, targetPlatformId: record.platformId, failureCount },
      preview: { queueableTaskCount: preview.queueableTaskCount, idempotentCount: preview.idempotentCount, conflictCount: preview.conflictCount }
    };
  }

  function retryFailedPublication(value) {
    if (!value || value.confirmed !== true || typeof value.publicationId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Publication retry confirmation is required");
    if (typeof deps.getDataRevision === "function" && value.expectedRevision !== undefined && Number(value.expectedRevision) !== Number(deps.getDataRevision())) {
      throw batchError("ARTICLE_ATTENTION_STALE", "Publication state changed; review the retry again");
    }
    const preview = previewRetryFailedPublication(value);
    const created = deps.createBatch({ clientId: preview.clientId, articleIds: [preview.articleId], targetPlatformIds: [preview.targetPlatformId], confirmed: true });
    const item = (created.items || []).find(function(candidate) { return candidate.publicationId === preview.publicationId; }) || (created.items || [])[0] || {};
    return { batchId: created.batchId, publicationId: item.publicationId || preview.publicationId, attemptId: item.attemptId || null, clientId: preview.clientId, articleId: preview.articleId, targetPlatformId: preview.targetPlatformId, changedScopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"] };
  }

  return Object.freeze({ previewRetryFailedPublication, retryFailedPublication });
}

module.exports = { createSubmissionPreparation };
