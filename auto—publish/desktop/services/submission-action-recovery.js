"use strict";

const fs = require("node:fs");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createSubmissionActionRecovery(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  if (!value.projection || !value.policy)
    throw fail("SUBMISSION_ACTION_POLICY_REQUIRED");
  if (!value.files || !value.staging)
    throw fail("SUBMISSION_ACTION_RECOVERY_PORT_REQUIRED");
  const projection = value.projection;
  const policy = value.policy;
  const files = value.files;
  const staging = value.staging;

  function operationIdFor(action) {
    return typeof action.operationId === "string" && action.operationId
      ? action.operationId
      : `submission-action:${action.batchId}:${action.itemId}:${action.action}`;
  }

  function notify(reasonCode) {
    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated(reasonCode);
  }

  function resumeItemAction(action, item, operation) {
    const desired =
      action.action === "cancel"
        ? "cancelled"
        : action.action === "cleanupPublishedLocal"
          ? "published-cleaned"
          : action.action === "cleanupCancelledLocal"
            ? "cancelled-cleaned"
            : "failed-cleaned";
    const before = operation.payload && operation.payload.before;
    const staged = files.operationStagePaths(operation.operationId);
    if (
      files.assertOperationStageRoot(staged, true) &&
      fs
        .readdirSync(staged.directory)
        .some((entry) => !["main.queue-copy", "sidecar.json"].includes(entry))
    )
      files.operationConflict(
        "Submission operation staging contains an unexpected entry",
      );
    if (operation.state === "complete") {
      if (
        files.fileState(item.filePath).exists ||
        files.fileState(item.sidecarPath).exists ||
        files.fileState(staged.main).exists ||
        files.fileState(staged.sidecar).exists
      )
        files.operationConflict(
          "Completed submission operation has unexpected queue residue",
        );
      return {
        action: action.action,
        status: desired,
        idempotent: true,
        batchId: item.batchId,
        itemId: item.itemId,
        publicationId: item.publicationId,
        attemptId: item.attemptId,
        changedScopes: [],
        domainHandled: true,
      };
    }
    if (operation.state === "state_applied") {
      if (!before || !before.main || !before.sidecar)
        files.operationConflict(
          "Submission operation checkpoint is incomplete",
        );
      staging.assertOperationTopology(item, operation, staged, before);
      if (item.storedStatus !== desired)
        files.operationConflict(
          "Submission item terminal state does not match its operation",
        );
      staging.cleanupOperationStage(operation, staged, before);
      files.checkpointOperation(
        operation.operationId,
        "complete",
        Object.assign({}, operation.payload, { stage: "complete" }),
      );
      return {
        action: action.action,
        status: desired,
        idempotent: true,
        batchId: item.batchId,
        itemId: item.itemId,
        publicationId: item.publicationId,
        attemptId: item.attemptId,
        changedScopes: [],
        domainHandled: true,
      };
    }
    const stagedResult = staging.stageOperation(item, operation);
    operation = stagedResult.operation;
    let result;
    if (action.action === "cancel")
      result = value.operationalStore.cancelQueuedSubmissionItem({
        batchId: item.batchId,
        itemId: item.itemId,
        operationId: operation.operationId,
      });
    else
      result = value.operationalStore.markSubmissionItemCleaned({
        batchId: item.batchId,
        itemId: item.itemId,
        fromStatus:
          item.storedStatus === "completed" ? "completed" : item.storedStatus,
        action: action.action,
        operationId: operation.operationId,
      });
    staging.cleanupOperationStage(operation, stagedResult.staged, before);
    files.checkpointOperation(
      operation.operationId,
      "complete",
      Object.assign({}, operation.payload, { stage: "complete" }),
    );
    notify(
      action.action === "cancel"
        ? "SUBMISSION_QUEUE_CANCELLED"
        : "SUBMISSION_QUEUE_CLEANED",
    );
    return {
      action: action.action,
      status: result.status,
      idempotent: result.idempotent === true,
      batchId: item.batchId,
      itemId: item.itemId,
      publicationId: item.publicationId,
      attemptId: item.attemptId,
      physicalFilesAlreadyAbsent: true,
      changedScopes: ["articleManagement", "articleAttention", "platformQueue"],
      domainHandled: true,
    };
  }

  function applyItemAction(action) {
    const item = projection.findItemView(action);
    if (!item)
      throw fail(
        "SUBMISSION_QUEUE_ITEM_NOT_FOUND",
        "Submission queue item was not found",
      );
    const stableOperationId = operationIdFor(action);
    let operation = files.operationRecord(stableOperationId);
    if (!operation) {
      const checked = policy.evaluateItemAction(action);
      if (!checked.allowed)
        throw fail(
          checked.reasonCode || "SUBMISSION_QUEUE_CHANGED",
          "Submission item action is no longer valid",
        );
      const before = files.pairManifest(item);
      operation = value.operationalStore.prepareSubmissionItemAction({
        operationId: stableOperationId,
        batchId: item.batchId,
        itemId: item.itemId,
        action: action.action,
        expectedStatus: item.storedStatus,
        expectedFingerprint: checked.bindingFingerprint,
        payload: { before, stage: "prepared" },
      });
    } else if (
      operation.batchId !== item.batchId ||
      operation.itemId !== item.itemId ||
      operation.action !== action.action ||
      (action.evaluationFingerprint &&
        operation.expectedFingerprint !== action.evaluationFingerprint)
    )
      files.operationConflict();
    return resumeItemAction(
      Object.assign({}, action, { operationId: stableOperationId }),
      item,
      operation,
    );
  }

  return Object.freeze({ applyItemAction, operationIdFor });
}

module.exports = { createSubmissionActionRecovery };
