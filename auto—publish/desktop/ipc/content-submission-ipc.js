const { wrap } = require("../services/ipc-response");
const { projectSubmissionResult } = require("./contracts/submission-contracts");

function bind(service, name) {
  if (!service || typeof service[name] !== "function") {
    const error = new Error("Submission operation is unavailable: " + name);
    error.code = "CONTENT_SUBMISSION_OPERATION_UNAVAILABLE";
    return function() { throw error; };
  }
  return service[name].bind(service);
}

function createSubmissionInterface(service, regularQueueService) {
  const regular = regularQueueService || service;
  return Object.freeze({
    preparation: {
      previewExport: bind(service, "previewExport"), exportArticle: bind(service, "exportArticle"), previewBatch: bind(service, "previewBatch"), createBatch: bind(service, "createBatch"), listPlatforms: bind(service, "listPlatforms")
    },
    batch: {
      buildActionPlan: bind(service, "buildSubmissionActionPlan"), previewCancel: bind(service, "previewCancelBatch"), cancel: bind(service, "cancelBatch"), get: bind(service, "getBatch"), list: bind(service, "listBatches"), reconcile: bind(service, "reconcileBatch")
    },
    cleanup: {
      previewFailed: bind(service, "previewCleanupFailedItems"), cleanupFailed: bind(service, "cleanupFailedItems"), previewResidue: bind(service, "previewTrashedArticleQueueResidue"), cleanupResidue: bind(service, "cleanupTrashedArticleQueueResidue")
    },
    retry: { previewFailedPublication: bind(service, "previewRetryFailedPublication"), failedPublication: bind(service, "retryFailedPublication") },
    regularQueue: {
      previewAdmission: bind(regular, "previewRegularQueueAdmission"),
      admit: bind(regular, "admitRegularQueueItems"),
      removePending: bind(regular, "removePendingQueueItems"),
    },
  });
}

function regularAdmissionInput(input, confirmed) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(function (key) {
        return ["articleRefs", "platformId", "accountProfileId", "queueConfig", "confirmed"].indexOf(key) === -1;
      })) {
    const error = new Error("Invalid regular queue admission input");
    error.code = "REGULAR_QUEUE_INPUT_INVALID";
    throw error;
  }
  if (confirmed && input.confirmed !== true) {
    const error = new Error("Regular queue confirmation is required");
    error.code = "REGULAR_QUEUE_CONFIRMATION_REQUIRED";
    throw error;
  }
  return input;
}

function regularRemovalInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(function (key) {
        return ["items", "confirmed", "operationId"].indexOf(key) === -1;
      }) || input.confirmed !== true) {
    const error = new Error("Regular queue removal confirmation is required");
    error.code = input && input.confirmed !== true
      ? "REGULAR_QUEUE_CONFIRMATION_REQUIRED"
      : "REGULAR_QUEUE_INPUT_INVALID";
    throw error;
  }
  return input;
}

function registerContentSubmissionIpc(deps) {
  const service = deps.contentSubmissionService;
  if (!service) {
    const error = new Error("Content submission service is required");
    error.code = "CONTENT_SUBMISSION_SERVICE_REQUIRED";
    throw error;
  }
  const workflow = deps.submissionWorkflow || createSubmissionInterface(service, deps.regularQueueApplication);
  function checked(input) { if (!input || input.confirmed !== true || Object.keys(input).some(function(key) { return ["clientId", "generatedArticleId", "targetPlatform", "mediaResourceId", "confirmed"].indexOf(key) === -1; })) { const e = new Error("Manual confirmation is required"); e.code = "CONTENT_EXPORT_CONFIRMATION_REQUIRED"; throw e; } return input; }
  deps.ipcMain.handle("content:preview-export", function(event, input) { return wrap(function() { return projectSubmissionResult("content:preview-export", workflow.preparation.previewExport(checked(input))); }); });
  deps.ipcMain.handle("content:export-article", function(event, input) { return wrap(function() { return projectSubmissionResult("content:export-article", workflow.preparation.exportArticle(checked(input))); }); });
  function batchInput(input, confirmed) {
    if (!input || typeof input !== "object" || Object.keys(input).some(function(key) { return ["clientId", "articleIds", "targetPlatformIds", "accountProfiles", "confirmed", "batchId", "planId"].indexOf(key) === -1; })) {
      const e = new Error("Invalid content submission batch input"); e.code = "CONTENT_SUBMISSION_BATCH_INPUT_INVALID"; throw e;
    }
    if (confirmed && input.confirmed !== true) { const e = new Error("Batch confirmation is required"); e.code = "CONTENT_SUBMISSION_CONFIRMATION_REQUIRED"; throw e; }
    if (Array.isArray(input.targetPlatformIds) && input.targetPlatformIds.length) {
      if (!input.accountProfiles || typeof input.accountProfiles !== "object" || Array.isArray(input.accountProfiles) ||
          Object.keys(input.accountProfiles).length !== input.targetPlatformIds.length ||
          input.targetPlatformIds.some(function(platformId) { return typeof input.accountProfiles[platformId] !== "string" || !input.accountProfiles[platformId].trim(); })) {
        const e = new Error("A platform account profile is required"); e.code = "ACCOUNT_PROFILE_REQUIRED"; throw e;
      }
    }
    return input;
  }
  deps.ipcMain.handle("content:preview-submission-batch", function(event, input) { return wrap(function() { return projectSubmissionResult("content:preview-submission-batch", workflow.preparation.previewBatch(batchInput(input, false))); }); });
  deps.ipcMain.handle("content:list-submission-platforms", function() { return wrap(function() { return projectSubmissionResult("content:list-submission-platforms", workflow.preparation.listPlatforms()); }); });
  deps.ipcMain.handle("content:create-submission-batch", function(event, input) { return wrap(function() { return projectSubmissionResult("content:create-submission-batch", workflow.preparation.createBatch(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:cancel-submission-batch", function(event, input) { return wrap(function() { return projectSubmissionResult("content:cancel-submission-batch", workflow.batch.cancel(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:preview-cleanup-failed-submission-items", function(event, input) { return wrap(function() { return projectSubmissionResult("content:preview-cleanup-failed-submission-items", workflow.cleanup.previewFailed(batchInput(input, false))); }); });
  deps.ipcMain.handle("content:cleanup-failed-submission-items", function(event, input) { return wrap(function() { return projectSubmissionResult("content:cleanup-failed-submission-items", workflow.cleanup.cleanupFailed(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:preview-trashed-article-queue-residue", function() { return wrap(function() { return projectSubmissionResult("content:preview-trashed-article-queue-residue", workflow.cleanup.previewResidue()); }); });
  deps.ipcMain.handle("content:cleanup-trashed-article-queue-residue", function(event, input) {
    return wrap(function() { return projectSubmissionResult("content:cleanup-trashed-article-queue-residue", workflow.cleanup.cleanupResidue(input)); });
  });
  deps.ipcMain.handle("content:preview-regular-queue-admission", function(event, input) {
    return wrap(function() { return projectSubmissionResult("content:preview-regular-queue-admission", workflow.regularQueue.previewAdmission(regularAdmissionInput(input, false))); });
  });
  deps.ipcMain.handle("content:admit-regular-queue-items", function(event, input) {
    return wrap(function() { return projectSubmissionResult("content:admit-regular-queue-items", workflow.regularQueue.admit(regularAdmissionInput(input, true))); });
  });
  deps.ipcMain.handle("content:remove-pending-queue-items", function(event, input) {
    return wrap(function() { return projectSubmissionResult("content:remove-pending-queue-items", workflow.regularQueue.removePending(regularRemovalInput(input))); });
  });
}
module.exports = { registerContentSubmissionIpc };
