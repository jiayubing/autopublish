"use strict";

const APPLICATION_OPERATIONS = Object.freeze([
  "listPlatforms",
  "previewBatch",
  "createBatch",
  "listBatches",
  "getBatch",
  "buildSubmissionActionPlan",
  "previewCancelBatch",
  "cancelBatch",
  "reconcileBatch",
  "previewArticleRemovalImpact",
  "cancelArticleSubmissionItem",
  "reconcileArticleRemovalAction",
  "inspectSubmissionPair",
  "evaluateItemAction",
  "isSubmissionItemExecutable",
  "previewTrashedArticleQueueResidue",
  "cleanupTrashedArticleQueueResidue",
  "previewRetryFailedPublication",
  "retryFailedPublication",
  "listArchiveFailures",
]);

const PAID_STAGING_APPLICATION_OPERATIONS = Object.freeze([
  "addPaidSubmissionStaging",
  "removePaidSubmissionStaging",
  "setPaidSubmissionStagingMedia",
  "getPaidSubmissionStaging",
]);

function createContentSubmissionApplication(implementation) {
  if (!implementation || typeof implementation !== "object") {
    const error = new Error("Content submission implementation is required");
    error.code = "CONTENT_SUBMISSION_IMPLEMENTATION_REQUIRED";
    throw error;
  }

  const application = {};
  APPLICATION_OPERATIONS.forEach((name) => {
    if (typeof implementation[name] !== "function") {
      const error = new Error(
        "Content submission operation is unavailable: " + name,
      );
      error.code = "CONTENT_SUBMISSION_OPERATION_UNAVAILABLE";
      throw error;
    }
    application[name] = function (...args) {
      const result = implementation[name].apply(implementation, args);
      if (name !== "createBatch" || !result || typeof result !== "object")
        return result;
      const output = Object.assign({}, result);
      delete output.filePath;
      delete output.sidecarPath;
      output.items = Array.isArray(result.items)
        ? result.items.map((item) => {
            if (!item || typeof item !== "object") return item;
            const copy = Object.assign({}, item);
            delete copy.filePath;
            delete copy.sidecarPath;
            return copy;
          })
        : result.items;
      return output;
    };
  });
  PAID_STAGING_APPLICATION_OPERATIONS.forEach((name) => {
    if (typeof implementation[name] !== "function") {
      const error = new Error(
        "Content submission operation is unavailable: " + name,
      );
      error.code = "CONTENT_SUBMISSION_OPERATION_UNAVAILABLE";
      throw error;
    }
    application[name] = function (...args) {
      return implementation[name].apply(implementation, args);
    };
  });
  return Object.freeze(application);
}

module.exports = { createContentSubmissionApplication };
