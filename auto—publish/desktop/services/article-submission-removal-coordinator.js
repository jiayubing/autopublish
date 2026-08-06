"use strict";

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createArticleSubmissionRemovalCoordinator(options) {
  const value = options || {};
  if (!value.projection || !value.policy || !value.actionRecovery)
    throw fail("ARTICLE_SUBMISSION_REMOVAL_PORT_REQUIRED");
  const projection = value.projection;
  const policy = value.policy;

  function previewArticleRemovalImpact(input) {
    const selections = policy.normalizeSelections(input);
    const selected = new Set(selections.map(policy.selectionKey));
    const views = projection
      .allItemViews()
      .filter((item) => selected.has(policy.selectionKey(item)));
    const queuedToCancel = [];
    const failedToClean = [];
    const publishedToClean = [];
    const cancelledToClean = [];
    const blockedItems = [];
    const items = views.map((item) => {
      const safe = projection.publicItem(item);
      if (
        ["submitting", "submitted", "uncertain", "claimed"].includes(
          item.status,
        )
      )
        blockedItems.push(
          Object.assign(safe, { reasonCode: "ARTICLE_SUBMISSION_ACTIVE" }),
        );
      else if (item.status === "queued") {
        const checked = policy.evaluateItemAction(
          Object.assign({}, safe, { action: "cancel" }),
        );
        if (checked.allowed)
          queuedToCancel.push(policy.submissionAction(item, "cancel"));
        else
          blockedItems.push(
            Object.assign(safe, {
              reasonCode: checked.reasonCode || "SUBMISSION_QUEUE_CHANGED",
            }),
          );
      } else if (item.status === "failed") {
        const checked = policy.evaluateItemAction(
          Object.assign({}, safe, { action: "cleanup" }),
        );
        if (checked.allowed)
          failedToClean.push(policy.submissionAction(item, "cleanup"));
        else
          blockedItems.push(
            Object.assign(safe, {
              reasonCode: checked.reasonCode || "SUBMISSION_QUEUE_CHANGED",
            }),
          );
      } else if (item.status === "published") {
        const checked = policy.evaluateItemAction(
          Object.assign({}, safe, { action: "cleanupPublishedLocal" }),
        );
        if (checked.allowed)
          publishedToClean.push(
            policy.submissionAction(item, "cleanupPublishedLocal"),
          );
        else
          blockedItems.push(
            Object.assign(safe, {
              reasonCode: checked.reasonCode || "SUBMISSION_IDENTITY_CONFLICT",
            }),
          );
      } else if (item.status === "cancelled") {
        const checked = policy.evaluateItemAction(
          Object.assign({}, safe, { action: "cleanupCancelledLocal" }),
        );
        if (checked.allowed)
          cancelledToClean.push(
            policy.submissionAction(item, "cleanupCancelledLocal"),
          );
        else
          blockedItems.push(
            Object.assign(safe, {
              reasonCode: checked.reasonCode || "SUBMISSION_IDENTITY_CONFLICT",
            }),
          );
      } else if (!policy.CLEANED_STATUSES.has(item.storedStatus))
        blockedItems.push(
          Object.assign(safe, { reasonCode: "SUBMISSION_QUEUE_CHANGED" }),
        );
      return Object.assign(safe, { sourceArticleState: "active" });
    });
    return {
      selections,
      articleCount: selections.length,
      items,
      queuedToCancel,
      failedToClean,
      publishedToClean,
      cancelledToClean,
      blockedItems,
      queuedToCancelCount: queuedToCancel.length,
      failedToCleanCount: failedToClean.length,
      publishedToCleanCount: publishedToClean.length,
      cancelledToCleanCount: cancelledToClean.length,
      terminalCleanupCount:
        failedToClean.length +
        publishedToClean.length +
        cancelledToClean.length,
      canCommit: blockedItems.length === 0,
    };
  }

  function withAction(name) {
    return (input) =>
      value.actionRecovery.applyItemAction(
        Object.assign({}, input, { action: name }),
      );
  }

  return Object.freeze({
    previewArticleRemovalImpact,
    cancelArticleSubmissionItem: withAction("cancel"),
    cleanupArticleSubmissionItem: withAction("cleanup"),
    cleanupPublishedArticleLocal: withAction("cleanupPublishedLocal"),
    cleanupCancelledArticleLocal: withAction("cleanupCancelledLocal"),
  });
}

module.exports = { createArticleSubmissionRemovalCoordinator };
