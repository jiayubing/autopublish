"use strict";

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function cleanupStorageStatus(item) {
  if (!item) return null;
  if (
    ["failed-cleaned", "published-cleaned", "cancelled-cleaned"].includes(
      item.storedStatus,
    )
  )
    return item.storedStatus;
  return {
    failed: "failed-cleaned",
    published: "published-cleaned",
    cancelled: "cancelled-cleaned",
  }[item.status] || null;
}

function createSubmissionResultReconciliation(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  if (!value.projection || !value.files || !value.staging || !value.batchReader)
    throw fail("SUBMISSION_RECONCILIATION_PORT_REQUIRED");
  const projection = value.projection;
  const files = value.files;

  function reconcileBatch(batchId) {
    const batch = value.operationalStore.getSubmissionBatch(batchId);
    const items = projection.batchViews(batch).map(projection.publicItem);
    return {
      batch: Object.assign(value.batchReader.toPublicBatch(batch), { items }),
      items,
    };
  }

  function inspectPair(input) {
    const item = projection.findItemView(input);
    if (!item) throw fail("SUBMISSION_QUEUE_ITEM_NOT_FOUND");
    return item.pair;
  }

  function reconcileArticleRemovalAction(action, operationId) {
    if (
      !action ||
      typeof action.batchId !== "string" ||
      typeof action.articleId !== "string"
    )
      return {
        status: "unknown",
        reasonCode: "QUEUE_ACTION_IDENTITY_INVALID",
        operationId,
      };
    const item = projection.findItemView(action);
    if (!item)
      return {
        status: "unknown",
        reasonCode: "SUBMISSION_QUEUE_ITEM_NOT_FOUND",
        operationId,
      };
    const expectedFingerprint = action.evaluationFingerprint || null;
    const currentFingerprint = projection.actionFingerprint(item, {
      action: action.action,
    });
    let operation = null;
    try {
      operation = files.operationRecord(operationId);
    } catch (error) {
      return {
        status: "unknown",
        operationId,
        reasonCode:
          (error && error.code) || "SUBMISSION_ACTION_PROTOCOL_UNAVAILABLE",
      };
    }
    if (
      operation &&
      (operation.batchId !== item.batchId ||
        operation.itemId !== item.itemId ||
        operation.action !== action.action ||
        (expectedFingerprint &&
          operation.expectedFingerprint !== expectedFingerprint))
    )
      return {
        status: "unknown",
        operationId,
        reasonCode: "SUBMISSION_ACTION_OPERATION_CONFLICT",
      };
    const terminal =
      action.action === "cancel"
        ? item.storedStatus === "cancelled"
        : action.action === "cleanup" &&
          item.storedStatus === cleanupStorageStatus(item);
    if (terminal) {
      if (operation && operation.state === "state_applied") {
        try {
          const before = operation.payload && operation.payload.before;
          if (!before || operation.expectedFingerprint !== expectedFingerprint)
            return {
              status: "unknown",
              operationId,
              reasonCode: "QUEUE_OPERATION_FINGERPRINT_CONFLICT",
            };
          value.staging.assertOperationTopology(
            item,
            operation,
            files.operationStagePaths(operation.operationId),
            before,
          );
        } catch (error) {
          return {
            status: "unknown",
            operationId,
            reasonCode:
              (error && error.code) || "QUEUE_OPERATION_RESULT_UNPROVABLE",
          };
        }
        return {
          status: "cleanup_pending",
          operationId,
          result: {
            idempotent: true,
            status: item.storedStatus,
            itemId: item.itemId,
          },
        };
      }
      if (operation && operation.state === "complete")
        return {
          status: "completed",
          operationId,
          result: {
            idempotent: true,
            status: item.storedStatus,
            itemId: item.itemId,
          },
        };
      return {
        status: "unknown",
        operationId,
        reasonCode: "QUEUE_OPERATION_RESULT_UNPROVABLE",
      };
    }
    const expectedStatus =
      action.action === "cancel"
        ? "queued"
        : action.action === "cleanup" &&
            ["failed", "published", "cancelled"].includes(item.status)
          ? item.storedStatus
          : null;
    if (
      item.storedStatus === expectedStatus &&
      ((operation && operation.expectedFingerprint === expectedFingerprint) ||
        (!operation && expectedFingerprint === currentFingerprint))
    )
      return {
        status: "retryable",
        operationId,
        reasonCode: "QUEUE_OPERATION_NOT_COMPLETED",
      };
    return {
      status: "unknown",
      operationId,
      reasonCode: "QUEUE_OPERATION_RESULT_UNPROVABLE",
    };
  }

  return Object.freeze({
    reconcileBatch,
    inspectPair,
    reconcileArticleRemovalAction,
  });
}

module.exports = { createSubmissionResultReconciliation };
