"use strict";

const CLEANED_STATUSES = new Set([
  "failed-cleaned",
  "published-cleaned",
  "cancelled-cleaned",
]);

function cleanupStorageStatus(item) {
  if (!item) return null;
  if (CLEANED_STATUSES.has(item.storedStatus)) return item.storedStatus;
  return {
    failed: "failed-cleaned",
    published: "published-cleaned",
    cancelled: "cancelled-cleaned",
  }[item.status] || null;
}

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createSubmissionActionPolicy(options) {
  const value = options || {};
  if (!value.projection) throw fail("SUBMISSION_ITEM_PROJECTION_REQUIRED");
  const projection = value.projection;

  function evaluation(item, action, allowed, reasonCode) {
    const fingerprint = item
      ? projection.actionFingerprint(item, action)
      : null;
    return {
      allowed: allowed === true,
      action: (action && action.action) || null,
      reasonCode: reasonCode || null,
      bindingFingerprint: fingerprint,
      entry: item || null,
    };
  }

  function pairReason(item) {
    if (!item || item.pair.unsafePath) return "SUBMISSION_QUEUE_CHANGED";
    if (item.pair.pairState === "identity_conflict")
      return "SUBMISSION_IDENTITY_CONFLICT";
    if (item.pair.pairState === "content_changed")
      return "SUBMISSION_CONTENT_CHANGED";
    if (["main_absent", "sidecar_absent"].includes(item.pair.pairState))
      return "SUBMISSION_QUEUE_CHANGED";
    if (
      item.pair.pairState === "both_absent" &&
      item.pair.identityMatched !== true
    )
      return "SUBMISSION_IDENTITY_CONFLICT";
    return null;
  }

  function evaluateItemAction(action) {
    if (
      !action ||
      ![
        "cancel",
        "cleanup",
      ].includes(action.action)
    )
      return evaluation(null, action, false, "SUBMISSION_ACTION_INVALID");
    const item = projection.findItemView(action);
    if (!item)
      return evaluation(null, action, false, "SUBMISSION_QUEUE_ITEM_NOT_FOUND");
    const currentFingerprint = projection.actionFingerprint(item, action);
    if (
      action.evaluationFingerprint &&
      action.evaluationFingerprint !== currentFingerprint
    )
      return evaluation(item, action, false, "SUBMISSION_ACTION_STALE");
    const pairFailure = pairReason(item);
    if (pairFailure) return evaluation(item, action, false, pairFailure);
    if (action.action === "cancel") {
      if (item.storedStatus === "cancelled")
        return evaluation(item, action, true, null);
      if (item.storedStatus !== "queued" || item.status !== "queued")
        return evaluation(
          item,
          action,
          false,
          item.storedStatus === "claimed"
            ? "ARTICLE_SUBMISSION_ACTIVE"
            : "PUBLICATION_STATUS_NOT_QUEUED",
        );
      if (
        item.record &&
        (item.record.status !== "queued" ||
          (item.latest && item.latest.status !== "queued"))
      )
        return evaluation(item, action, false, "PUBLICATION_REMOTE_STARTED");
      return evaluation(item, action, true, null);
    }
    if (["queued", "claimed", "remote_started", "uncertain"].includes(item.status))
      return evaluation(item, action, false, "ARTICLE_SUBMISSION_ACTIVE");
    const desired = cleanupStorageStatus(item);
    if (!desired || !["failed", "published", "cancelled"].includes(item.status))
      return evaluation(item, action, false, "PUBLICATION_STATUS_NOT_FAILED");
    if (item.storedStatus === desired)
      return evaluation(item, action, true, null);
    if (item.status === "published" && (!item.record || item.record.status !== "published"))
      return evaluation(item, action, false, "PUBLICATION_ATTEMPT_MISMATCH");
    if (item.status === "failed" && item.record && item.record.status !== "failed")
      return evaluation(item, action, false, "PUBLICATION_STATUS_NOT_FAILED");
    if (item.status === "cancelled" && item.storedStatus !== "cancelled")
      return evaluation(item, action, false, "PUBLICATION_ATTEMPT_MISMATCH");
    if (
      action.attemptId &&
      item.attemptId &&
      action.attemptId !== item.attemptId
    )
      return evaluation(item, action, false, "PUBLICATION_ATTEMPT_MISMATCH");
    return evaluation(item, action, true, null);
  }

  function selectionKey(item) {
    return item.clientId + "\0" + item.articleId;
  }

  function normalizeSelections(input) {
    const selections = input && input.selections;
    if (!Array.isArray(selections) || !selections.length)
      throw fail("CONTENT_INPUT_INVALID", "At least one article is required");
    const seen = new Set();
    return selections.map((item) => {
      if (
        !item ||
        typeof item.clientId !== "string" ||
        !item.clientId.trim() ||
        typeof item.articleId !== "string" ||
        !item.articleId.trim()
      )
        throw fail("CONTENT_INPUT_INVALID", "Article selection is invalid");
      const result = { clientId: item.clientId, articleId: item.articleId };
      if (seen.has(selectionKey(result)))
        throw fail(
          "CONTENT_INPUT_INVALID",
          "Article selection contains duplicates",
        );
      seen.add(selectionKey(result));
      return result;
    });
  }

  function submissionAction(item, action) {
    return Object.assign(projection.publicItem(item), {
      action,
      evaluationFingerprint: projection.actionFingerprint(item, { action }),
    });
  }

  function isSubmissionItemExecutable(action) {
    return evaluateItemAction(Object.assign({}, action, { action: "cancel" }))
      .allowed;
  }

  return Object.freeze({
    CLEANED_STATUSES,
    evaluateItemAction,
    normalizeSelections,
    selectionKey,
    submissionAction,
    isSubmissionItemExecutable,
  });
}

module.exports = { CLEANED_STATUSES, createSubmissionActionPolicy };
