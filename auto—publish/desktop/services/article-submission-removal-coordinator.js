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
    const blockedItems = [];
    const items = views.map((item) => {
      const safe = projection.publicItem(item);
      if (
        ["remote_started", "uncertain", "claimed"].includes(
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
      } else if (item.status === "published") {
        blockedItems.push(
          Object.assign(safe, { reasonCode: "ARTICLE_PUBLISHED_IMMUTABLE" }),
        );
      } else if (item.status === "failed" || item.status === "cancelled") {
        // Terminal submission evidence remains available to history/repair, but
        // article removal must not turn it into a user cleanup action.
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
      blockedItems,
      queuedToCancelCount: queuedToCancel.length,
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
  });
}

module.exports = { createArticleSubmissionRemovalCoordinator };
