function batchError(code, message) { const error = new Error(message); error.code = code; return error; }

// Owns all state observed before a submission becomes a queued pair.  Its
// collaborators are infrastructure primitives, never the facade's former
// preview/create methods, so retry and ordinary submission share one
// fail-closed reservation and rollback state machine.
function createSubmissionPreparation(deps) {
  function previewBatch(value) {
    const input = deps.assertBatchInput(value);
    const platforms = deps.availablePlatforms();
    const platformMap = new Map(platforms.map(function(platform) { return [platform.id, platform]; }));
    const unsupportedPlatformIds = input.targetPlatformIds.filter(function(id) { return !platformMap.has(id) || platformMap.get(id).contentQueueImport !== true; });
    const items = []; const ineligibleArticleIds = []; const missingArticleIds = []; const conflicts = [];
    input.articleIds.forEach(function(articleId) {
      let article;
      try { article = (deps.getArticle || function(clientId, id) { return deps.articleStore.getArticle(clientId, id); })(input.clientId, articleId); } catch (_) { missingArticleIds.push(articleId); return; }
      input.targetPlatformIds.forEach(function(platformId) {
        const platform = platformMap.get(platformId);
        const item = { articleId: articleId, targetPlatformId: platformId, accountProfileId: input.accountProfiles[platformId], contentHash: deps.hash(deps.articleMarkdown(article)), status: "excluded" };
        if (platform && platform.contentQueueImport === true) {
          const eligibility = deps.evaluateEligibility(article, platformId, platform);
          if (!eligibility.eligible) {
            if (!ineligibleArticleIds.includes(articleId)) ineligibleArticleIds.push(articleId);
            Object.assign(item, { status: "blocked", reasonCode: eligibility.reasonCodes[0], reasonCodes: eligibility.reasonCodes, reasons: eligibility.reasons });
            items.push(item); return;
          }
          Object.assign(item, deps.itemForArticle(article, platform, platformId), { accountProfileId: input.accountProfiles[platformId] });
          if (item.status === "conflict") conflicts.push(item);
        }
        items.push(item);
      });
    });
    function count(status) { return items.filter(function(item) { return item.status === status; }).length; }
    return { clientId: input.clientId, articleIds: input.articleIds.slice(), targetPlatformIds: input.targetPlatformIds.slice(), accountProfiles: Object.assign({}, input.accountProfiles),
      totalTaskCount: input.articleIds.length * input.targetPlatformIds.length, queueableTaskCount: count("queueable"), idempotentCount: count("idempotent"), alreadyQueuedCount: count("idempotent"),
      blockedPublishedCount: count("blockedPublished"), blockedUncertainCount: count("blockedUncertain"), blockedContentCount: count("blocked"), conflictCount: conflicts.length,
      ineligibleArticleIds: [...new Set(ineligibleArticleIds)], unreviewedArticleIds: [...new Set(ineligibleArticleIds)], missingArticleIds: missingArticleIds, unsupportedPlatformIds: unsupportedPlatformIds, items: items };
  }

  function createBatch(value) {
    const input = deps.assertBatchInput(value);
    if (value.confirmed !== true) throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    const preview = previewBatch(input);
    if (preview.missingArticleIds.length) throw batchError("CONTENT_SUBMISSION_ARTICLE_NOT_FOUND", "Selected article was not found");
    const batchId = deps.batchStore.createId(); const createdAt = new Date().toISOString();
    const batch = { version: 1, id: batchId, clientId: input.clientId, accountProfiles: Object.assign({}, input.accountProfiles), createdAt: createdAt, status: "queued", items: [] };
    const createdReservations = []; const writtenItems = []; let createdCount = 0; let idempotentCount = 0;
    function save() { return deps.batchStore.save(batch); }
    save();
    try {
      preview.items.forEach(function(previewItem) {
        if (previewItem.status !== "queueable" && previewItem.status !== "idempotent") { batch.items.push(Object.assign({}, previewItem)); save(); return; }
        const article = (deps.getArticle || function(clientId, id) { return deps.articleStore.getArticle(clientId, id); })(input.clientId, previewItem.articleId);
        const platform = deps.availablePlatforms().find(function(candidate) { return candidate.id === previewItem.targetPlatformId; });
        if (!platform) throw batchError("CONTENT_SUBMISSION_TARGET_INVALID", "Submission target is invalid");
        const markdown = deps.articleMarkdown(article); const contentHash = deps.hash(markdown); const context = deps.publicationContext(article, previewItem.targetPlatformId);
        let record = deps.publicationRecordFor(context); let reservation = null;
        try {
          if (context.tracked && (!record || ["failed", "cancelled"].includes(record.status))) {
            reservation = deps.publicationLedger.reserve(context.identity, context.target, { displayName: previewItem.targetPlatformId, titleSnapshot: context.titleSnapshot });
            createdReservations.push(reservation); record = reservation;
          }
        } catch (caught) {
          if (!deps.isBlockingReservationError(caught)) throw caught;
          const freshItem = deps.itemForArticle(article, platform, previewItem.targetPlatformId);
          freshItem.status = deps.itemStatusForRecord(deps.publicationRecordFor(context), deps.inspectSubmission(freshItem, markdown, article, contentHash, previewItem.targetPlatformId, context));
          batch.items.push(freshItem); save(); return;
        }
        const item = Object.assign({}, previewItem, { status: previewItem.status, submissionBatchId: batchId });
        Object.assign(item, deps.publicationFields(context, record, reservation)); batch.items.push(item); item.status = "reserving"; save();
        const sidecar = deps.makeSidecar({ submissionBatchId: batchId, article: article, targetPlatform: previewItem.targetPlatformId, targetPlatformId: previewItem.targetPlatformId, accountProfileId: previewItem.accountProfileId, filename: deps.basename(item.filePath), contentHash: contentHash, queuedAt: createdAt, context: context, reservation: reservation || record });
        deps.mkdirFor(item.filePath);
        if (previewItem.status === "idempotent") { if (reservation) deps.writeAtomic(item.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n"); item.status = "skipped"; idempotentCount += 1; }
        else { deps.writePairAtomic(item.filePath, markdown, item.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n"); item.status = "queued"; createdCount += 1; writtenItems.push(item); }
        item.publicationStatus = (reservation || record || {}).status || null; save();
      });
    } catch (caught) {
      writtenItems.forEach(function(item) { deps.removeSubmissionPair(item.filePath, item.sidecarPath); });
      createdReservations.slice().reverse().forEach(function(reservation) { try { deps.cancelReservation(reservation, "QUEUE_WRITE_FAILED"); } catch (_) {} });
      throw caught;
    }
    batch.status = createdCount > 0 ? "queued" : "completed"; batch.updatedAt = new Date().toISOString(); save(); deps.notifyData("SUBMISSION_BATCH_CREATED");
    return Object.assign({}, preview, { batchId: batchId, createdCount: createdCount, idempotentCount: idempotentCount, items: batch.items, queueableTaskCount: createdCount, alreadyQueuedCount: idempotentCount });
  }

  function previewRetryFailedPublication(value) {
    const publicationId = value && value.publicationId;
    if (typeof publicationId !== "string" || !publicationId.trim()) throw batchError("CONTENT_SUBMISSION_PUBLICATION_REQUIRED", "Publication id is required");
    const record = deps.publicationLedger.get(publicationId);
    if (!record) throw batchError("PUBLICATION_RECORD_MISSING", "Publication record was not found");
    if (record.status !== "failed") throw batchError("PUBLICATION_STATUS_NOT_FAILED", "Only failed publications can be retried");
    const latest = deps.latestAttempt(record);
    if (!latest || latest.status !== "failed") throw batchError("PUBLICATION_ATTEMPT_NOT_FAILED", "The latest publication attempt is not failed");
    let article; try { article = (deps.getArticle || function(clientId, id) { return deps.articleStore.getArticle(clientId, id); })(record.clientId, record.articleId); } catch (_) { throw batchError("ARTICLE_NOT_FOUND", "The source article is no longer available"); }
    const eligibility = deps.evaluateEligibility(article, record.platformId);
    if (!eligibility.eligible) throw batchError("ARTICLE_NOT_RETRYABLE", eligibility.reasons.join("、"));
    if (!deps.platformFor(record.platformId)) throw batchError("CONTENT_SUBMISSION_TARGET_UNSUPPORTED", "The publication target does not support content queue import");
    const preview = previewBatch({ clientId: record.clientId, articleIds: [record.articleId], targetPlatformIds: [record.platformId] });
    const retryableItem = preview.items.find(function(item) { return item.articleId === record.articleId && item.targetPlatformId === record.platformId; });
    if (!retryableItem || !["queueable", "idempotent"].includes(retryableItem.status)) throw batchError(retryableItem && retryableItem.reasonCode || "SUBMISSION_QUEUE_CHANGED", "投稿队列已变化，请重新预检");
    const failureCount = Array.isArray(record.attempts) ? record.attempts.filter(function(attempt) { return attempt.status === "failed"; }).length : 1;
    return { publicationId: record.publicationId, clientId: record.clientId, articleId: record.articleId, targetPlatformId: record.platformId, titleSnapshot: record.titleSnapshot || article.title, failureCount: failureCount, requiresConfirmation: true,
      message: `确认将“${(record.titleSnapshot || article.title || "文章").slice(0, 80)}”重新投稿到 ${record.platformId}？历史失败 ${failureCount} 次。`, details: { titleSnapshot: record.titleSnapshot || article.title, targetPlatformId: record.platformId, failureCount: failureCount }, preview: { queueableTaskCount: preview.queueableTaskCount, idempotentCount: preview.idempotentCount, conflictCount: preview.conflictCount } };
  }
  function retryFailedPublication(value) {
    if (!value || value.confirmed !== true || typeof value.publicationId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Publication retry confirmation is required");
    if (typeof deps.getDataRevision === "function" && value.expectedRevision !== undefined && Number(value.expectedRevision) !== Number(deps.getDataRevision())) throw batchError("ARTICLE_ATTENTION_STALE", "Publication state changed; review the retry again");
    const preview = previewRetryFailedPublication(value); const created = createBatch({ clientId: preview.clientId, articleIds: [preview.articleId], targetPlatformIds: [preview.targetPlatformId], confirmed: true });
    const item = (created.items || []).find(function(candidate) { return candidate.publicationId === preview.publicationId; }) || (created.items || [])[0] || {};
    return { batchId: created.batchId, publicationId: item.publicationId || preview.publicationId, attemptId: item.attemptId || null, clientId: preview.clientId, articleId: preview.articleId, targetPlatformId: preview.targetPlatformId, changedScopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"] };
  }
  return Object.freeze({ previewBatch: previewBatch, createBatch: createBatch, previewRetryFailedPublication: previewRetryFailedPublication, retryFailedPublication: retryFailedPublication });
}
module.exports = { createSubmissionPreparation };
