"use strict";

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createSubmissionCleanup(options) {
  const value = options || {};
  if (!value.operationalStore || !value.contentStore)
    throw fail("SUBMISSION_CLEANUP_PORT_REQUIRED");
  if (!value.projection || !value.policy || !value.actionRecovery)
    throw fail("SUBMISSION_CLEANUP_DEPENDENCY_REQUIRED");
  const projection = value.projection;
  const policy = value.policy;

  function previewCleanupFailedItems(input) {
    const batch = value.operationalStore.getSubmissionBatch(
      input && input.batchId,
    );
    const items = projection.batchViews(batch).map((item) => {
      const checked = policy.evaluateItemAction(
        Object.assign({}, projection.publicItem(item), { action: "cleanup" }),
      );
      return Object.assign(projection.publicItem(item), {
        cleanable: checked.allowed,
        reasonCode: checked.allowed ? null : checked.reasonCode,
      });
    });
    return {
      batchId: batch.batchId,
      cleanableCount: items.filter((item) => item.cleanable).length,
      uncleanableCount: items.filter((item) => !item.cleanable).length,
      items,
    };
  }

  function cleanupFailedItems(input) {
    if (!input || input.confirmed !== true || typeof input.batchId !== "string")
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const preview = previewCleanupFailedItems(input);
    let cleanedCount = 0;
    let skippedCount = 0;
    preview.items.forEach((item) => {
      if (!item.cleanable) {
        skippedCount += 1;
        return;
      }
      try {
        const current = projection.findItemView(item);
        value.actionRecovery.applyItemAction(
          Object.assign({}, item, {
            action: "cleanup",
            evaluationFingerprint:
              item.actionFingerprint ||
              projection.actionFingerprint(current, { action: "cleanup" }),
          }),
        );
        cleanedCount += 1;
      } catch (_) {
        skippedCount += 1;
      }
    });
    return {
      batchId: input.batchId,
      cleanedCount,
      skippedCount,
      items: value.operationalStore.getSubmissionBatch(input.batchId).items,
    };
  }

  function previewTrashedArticleQueueResidue() {
    const items = projection
      .allItemViews()
      .filter((item) => {
        try {
          return (
            value.contentStore.isArticleTrashed(
              item.clientId,
              item.articleId,
            ) && !policy.CLEANED_STATUSES.has(item.storedStatus)
          );
        } catch (_) {
          return false;
        }
      })
      .map((item) => {
        const action =
          item.status === "queued"
            ? "cancel"
            : item.status === "failed"
              ? "cleanup"
              : item.status === "published"
                ? "cleanupPublishedLocal"
                : item.status === "cancelled"
                  ? "cleanupCancelledLocal"
                  : null;
        const checked = action
          ? policy.evaluateItemAction(
              Object.assign({}, projection.publicItem(item), { action }),
            )
          : { allowed: false, reasonCode: "ARTICLE_SUBMISSION_ACTIVE" };
        return Object.assign(projection.publicItem(item), {
          sourceArticleState: "trashed",
          reasonCode: checked.reasonCode || "SOURCE_ARTICLE_TRASHED",
          repairAction: checked.allowed ? action : null,
          evaluationFingerprint: checked.allowed
            ? checked.bindingFingerprint
            : null,
        });
      });
    return {
      items,
      cleanableItems: items.filter((item) => item.repairAction),
      reportedItems: items.filter((item) => !item.repairAction),
      cleanableCount: items.filter((item) => item.repairAction).length,
      reportedCount: items.filter((item) => !item.repairAction).length,
    };
  }

  function cleanupTrashedArticleQueueResidue(input) {
    if (!input || input.confirmed !== true)
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const preview = previewTrashedArticleQueueResidue();
    let cleanedCount = 0;
    let failedCount = 0;
    const items = preview.items.map((item) => {
      if (!item.repairAction)
        return {
          itemId: item.itemId,
          articleId: item.articleId,
          status: item.status,
          reasonCode: item.reasonCode || "RESIDUE_NOT_CLEANABLE",
        };
      try {
        const result = value.actionRecovery.applyItemAction(
          Object.assign({}, item, {
            action: item.repairAction,
            evaluationFingerprint: item.evaluationFingerprint,
          }),
        );
        cleanedCount += 1;
        return {
          itemId: item.itemId,
          articleId: item.articleId,
          status: "cleaned",
          action: item.repairAction,
          resultStatus: result.status,
        };
      } catch (error) {
        failedCount += 1;
        return {
          itemId: item.itemId,
          articleId: item.articleId,
          status: item.status,
          action: item.repairAction,
          reasonCode:
            (error && error.code) || "SUBMISSION_RESIDUE_CLEANUP_FAILED",
        };
      }
    });
    const after = previewTrashedArticleQueueResidue();
    if (cleanedCount && typeof value.onDataInvalidated === "function")
      value.onDataInvalidated("TRASHED_QUEUE_RESIDUE_RESOLVED");
    return {
      status: failedCount ? "failed" : cleanedCount ? "completed" : "no-op",
      cleanedCount,
      failedCount,
      remainingCount: after.items.length,
      cleanableCount: after.cleanableCount,
      reportedCount: after.reportedCount,
      items,
      remainingItems: after.items.map((item) => ({
        itemId: item.itemId,
        articleId: item.articleId,
        status: item.status,
        reasonCode: item.reasonCode || null,
      })),
    };
  }

  function listArchiveFailures() {
    try {
      return value.operationalStore.listPostProcessingAttention().map((item) =>
        Object.assign({}, item, {
          reasonCode: "PUBLISHED_LOCAL_ARCHIVE_FAILED",
        }),
      );
    } catch (_) {
      return [];
    }
  }

  return Object.freeze({
    previewCleanupFailedItems,
    cleanupFailedItems,
    previewTrashedArticleQueueResidue,
    cleanupTrashedArticleQueueResidue,
    listArchiveFailures,
  });
}

module.exports = { createSubmissionCleanup };
