const crypto = require("node:crypto");

function removalError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function selection(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.clientId !== "string" ||
    !value.clientId.trim() ||
    typeof value.articleId !== "string" ||
    !value.articleId.trim()
  )
    throw removalError("CONTENT_INPUT_INVALID", "Article selection is invalid");
  return { clientId: value.clientId, articleId: value.articleId };
}

function selections(input) {
  const values = Array.isArray(input)
    ? input
    : input && (input.selections || input.articles);
  if (!Array.isArray(values) || !values.length)
    throw removalError(
      "CONTENT_INPUT_INVALID",
      "At least one article is required",
    );
  const result = values.map(selection);
  const seen = new Set();
  result.forEach(function (value) {
    const key = value.clientId + "\0" + value.articleId;
    if (seen.has(key))
      throw removalError(
        "CONTENT_INPUT_INVALID",
        "Article selection contains duplicates",
      );
    seen.add(key);
  });
  return result;
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function actionIdentity(action) {
  return {
    clientId: action.clientId,
    articleId: action.articleId,
    batchId: action.batchId || null,
    publicationId: action.publicationId || null,
    targetPlatformId: action.targetPlatformId || null,
    attemptId: action.attemptId || null,
    action: action.action || null,
  };
}

function transactionFingerprint(selectionsValue, queueActions) {
  const selectionKeys = selectionsValue
    .map(function (item) {
      return item.clientId + "\0" + item.articleId;
    })
    .sort();
  const actionKeys = (queueActions || [])
    .map(actionIdentity)
    .sort(function (left, right) {
      return JSON.stringify(left).localeCompare(JSON.stringify(right));
    });
  return fingerprint({ selections: selectionKeys, actions: actionKeys });
}

function isOpenStatus(status) {
  return ["pending_auto_recovery", "pending_recovery", "needs_repair"].includes(
    status,
  );
}

function isRepairableError(error) {
  return (
    !!error &&
    [
      "SUBMISSION_QUEUE_CHANGED",
      "SUBMISSION_IDENTITY_CONFLICT",
      "SUBMISSION_CONTENT_CHANGED",
      "PUBLICATION_REMOTE_STARTED",
      "SUBMISSION_QUEUE_ITEM_NOT_FOUND",
      "SUBMISSION_ACTION_STALE",
      "PUBLICATION_ATTEMPT_MISMATCH",
      "PUBLICATION_ATTEMPT_NOT_FAILED",
      "PUBLICATION_STATUS_NOT_FAILED",
      "PUBLICATION_STATUS_NOT_QUEUED",
      "SUBMISSION_STATUS_CONFLICT",
      "SUBMISSION_BATCH_ITEM_NOT_FOUND",
      "SUBMISSION_BATCH_REBIND_CONFLICT",
      "SUBMISSION_ACTION_OPERATION_CONFLICT",
      "SUBMISSION_ACTION_PROTOCOL_UNAVAILABLE",
      "ARTICLE_REMOVAL_OPERATION_IN_FLIGHT",
    ].includes(error.code)
  );
}

function titleSnapshot(article) {
  return typeof article.title === "string" && article.title.trim()
    ? article.title.trim().slice(0, 200)
    : null;
}

function sameQueueAction(left, right) {
  return (
    left &&
    right &&
    left.clientId === right.clientId &&
    left.articleId === right.articleId &&
    left.batchId === right.batchId &&
    left.publicationId === right.publicationId &&
    left.targetPlatformId === right.targetPlatformId &&
    left.attemptId === right.attemptId &&
    left.action === right.action
  );
}

function submissionServiceActions(impact) {
  return clone(
    (impact.queuedToCancel || [])
      .map(function (item) {
        return Object.assign({}, item, { action: "cancel" });
      })
      .concat(
        (impact.failedToClean || []).map(function (item) {
          return Object.assign({}, item, { action: "cleanup" });
        }),
      )
      .concat(
        (impact.publishedToClean || []).map(function (item) {
          return Object.assign({}, item, { action: "cleanupPublishedLocal" });
        }),
      )
      .concat(
        (impact.cancelledToClean || []).map(function (item) {
          return Object.assign({}, item, { action: "cleanupCancelledLocal" });
        }),
      ),
  );
}

function tombstoneReferences(article) {
  return ["generationBatchId", "generationTaskId"]
    .filter(function (field) {
      return typeof article[field] === "string" && article[field].trim();
    })
    .map(function (field) {
      return {
        type:
          field === "generationBatchId"
            ? "generation-batch"
            : "generation-task",
        id: article[field],
      };
    });
}

module.exports = {
  removalError,
  clone,
  selection,
  selections,
  fingerprint,
  actionIdentity,
  transactionFingerprint,
  isOpenStatus,
  isRepairableError,
  titleSnapshot,
  sameQueueAction,
  submissionServiceActions,
  tombstoneReferences,
};
